/**
 * W1 steps 7–8, W6.1, W7, W8: enrol and pay. The checkout writes the Enrollment, the Membership or
 * StudentPackage (all `pending_payment`) and one invoice whose `fulfilment` names what to do when it
 * is paid. Fulfilment runs once (Invoice.fulfilledAt compare-and-set, see payments.fulfilInvoice),
 * from whichever route sees the capture first: webhook, the browser's "complete" call, or staff.
 */
import { addMonths } from 'date-fns'
import { CommandError } from './errors'
import { recordChange, lockKey } from './command'
import { createInvoice, type LineInput } from './invoices'
import { createGrant, removeUnused } from './ledger'
import { bookSeat } from './booking'
import { generateSessions } from './schedule'
import { registerFulfilment } from './payments'
import { getSettings, DAY } from './settings'

type Tx = any
export const OPEN_ENROLMENT = ['pending_payment', 'pending_match', 'matched', 'active', 'paused'] as const
const FIXED_SEAT_WEEKS = 4

export type CheckoutInput = {
  familyId: string; studentId: string; programId: string; planId?: string | null; packageId?: string | null
  locationId?: string | null; mode: string; seriesIds?: string[]; promoCode?: string | null; learningPlanId?: string | null
  homeAddress?: string; preferredTimes?: string; actorId: string | null
}

/** Membership/package price lines with enrolment fee, sibling discount and promo code. */
export async function buildCheckout(tx: Tx, input: CheckoutInput) {
  if (!input.planId === !input.packageId) throw new CommandError('Pick a membership plan or a package.')
  await lockKey(tx, `enrol:${input.studentId}:${input.programId}`)
  const program = await tx.program.findUnique({ where: { id: input.programId }, select: { id: true, name: true, status: true, format: true, sessionMinutes: true, deliveryModes: true, billingModel: true, locations: { select: { id: true } } } })
  if (!program || program.status !== 'published') throw new CommandError('That programme is not open for enrolment.')
  const modes = Array.isArray(program.deliveryModes) ? program.deliveryModes : []
  if (!modes.includes(input.mode)) throw new CommandError('That programme is not offered in this format.')
  const locationId = input.mode === 'in_centre' ? input.locationId ?? null : input.locationId ?? null
  if (input.mode === 'in_centre') {
    if (!locationId) throw new CommandError('Pick a location.')
    if (!program.locations.some((l: any) => l.id === locationId)) throw new CommandError('That programme is not run at this location.')
  }
  const student = await tx.student.findUnique({ where: { id: input.studentId }, select: { id: true, familyId: true, firstName: true, lastName: true } })
  if (!student || student.familyId !== input.familyId) throw new CommandError('That student was not found.')

  // Already enrolled (or an unpaid checkout) on this programme?
  const open = await tx.enrollment.findMany({ where: { studentId: student.id, programId: program.id, status: { in: [...OPEN_ENROLMENT] } }, select: { id: true, status: true } })
  if (open.some((e: any) => e.status !== 'pending_payment')) throw new CommandError(`${student.firstName} is already enrolled on ${program.name}.`)
  const superseded: string[] = []
  for (const e of open) superseded.push(await cancelPendingEnrolment(tx, e.id, 'Replaced by a new checkout', input.actorId))

  const settings = await getSettings(tx)
  const lines: LineInput[] = []
  let plan: any = null
  let pkg: any = null
  let membershipId: string | null = null
  let studentPackageId: string | null = null
  let discountPercent = 0

  if (input.planId) {
    plan = await tx.membershipPlan.findUnique({ where: { id: input.planId }, select: { id: true, name: true, programId: true, price: true, enrolmentFee: true, sessionsPerPeriod: true, weeklyCapForUnlimited: true, status: true } })
    if (!plan || plan.status !== 'published' || (plan.programId && plan.programId !== program.id)) throw new CommandError('That plan is not available for this programme.')
    // Sibling discount: second and later child with a live membership in the family.
    const siblings = await tx.membership.count({ where: { familyId: input.familyId, studentId: { not: student.id }, status: { in: ['active', 'past_due', 'paused', 'cancelling'] } } })
    discountPercent = siblings > 0 ? settings.siblingDiscountPercent : 0
    const membership = await tx.membership.create({
      data: {
        family: { connect: { id: input.familyId } }, student: { connect: { id: student.id } }, plan: { connect: { id: plan.id } },
        status: 'pending_payment', price: plan.price, discountPercent, sessionsPerPeriod: plan.sessionsPerPeriod ?? null,
        weeklyCap: plan.sessionsPerPeriod ? null : plan.weeklyCapForUnlimited ?? 5,
        ...(input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}),
      },
    })
    membershipId = membership.id
    lines.push({ description: `${plan.name}: first month (${student.firstName})`, kind: 'membership', unitAmount: plan.price, studentId: student.id, programId: program.id, membershipId })
    if (discountPercent) lines.push({ description: `Sibling discount ${discountPercent}%`, kind: 'discount', unitAmount: -Math.round((plan.price * discountPercent) / 100), studentId: student.id, membershipId })
    if (plan.enrolmentFee > 0 && !(await enrolmentFeeWaived(tx, student.id, settings.enrolmentFeeWaivedWithinDays))) {
      lines.push({ description: `Enrolment fee (${student.firstName})`, kind: 'enrolment_fee', unitAmount: plan.enrolmentFee, studentId: student.id, programId: program.id })
    }
  } else {
    pkg = await tx.package.findUnique({ where: { id: input.packageId! }, select: { id: true, name: true, programId: true, hours: true, price: true, expiryMonths: true, status: true } })
    if (!pkg || pkg.status !== 'published' || (pkg.programId && pkg.programId !== program.id)) throw new CommandError('That package is not available for this programme.')
    const sp = await tx.studentPackage.create({
      data: {
        family: { connect: { id: input.familyId } }, student: { connect: { id: student.id } }, package: { connect: { id: pkg.id } },
        hours: pkg.hours, price: pkg.price, status: 'pending_payment',
        ...(input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}),
      },
    })
    studentPackageId = sp.id
    lines.push({ description: `${pkg.name} (${pkg.hours} hours, ${student.firstName})`, kind: 'package', unitAmount: pkg.price, studentId: student.id, programId: program.id, studentPackageId })
  }

  const promo = input.promoCode ? await validPromo(tx, input.promoCode, plan ? 'plan' : 'package') : null
  const gross = lines.filter((l) => l.unitAmount > 0).reduce((s, l) => s + l.unitAmount, 0) + lines.filter((l) => l.unitAmount < 0).reduce((s, l) => s + l.unitAmount, 0)
  const promoDiscount = promo ? Math.min(gross, promo.percentOff ? Math.round((gross * promo.percentOff) / 100) : promo.amountOff ?? 0) : 0

  // Fixed weekly seats: validate the series now (programme, mode, location) so payment never succeeds for a seat that cannot exist.
  const seriesIds = [...new Set((input.seriesIds ?? []).map(String))].slice(0, 7)
  if (seriesIds.length) {
    const series = await tx.sessionSeries.findMany({ where: { id: { in: seriesIds }, status: 'active', programId: program.id }, select: { id: true, mode: true, locationId: true, enrollmentId: true } })
    if (series.length !== seriesIds.length || series.some((s: any) => s.enrollmentId || (locationId && s.locationId && s.locationId !== locationId))) throw new CommandError('One of the chosen weekly times is not available. Pick again.')
  }

  const enrollment = await tx.enrollment.create({
    data: {
      student: { connect: { id: student.id } }, family: { connect: { id: input.familyId } }, program: { connect: { id: program.id } },
      ...(locationId ? { location: { connect: { id: locationId } } } : {}),
      mode: input.mode, status: 'pending_payment', fundingType: plan ? 'membership' : 'package',
      ...(membershipId ? { membership: { connect: { id: membershipId } } } : {}),
      ...(studentPackageId ? { studentPackage: { connect: { id: studentPackageId } } } : {}),
      ...(input.learningPlanId ? { plan: { connect: { id: input.learningPlanId } } } : {}),
      preferredTimes: { seriesIds, note: (input.preferredTimes ?? '').slice(0, 500) } as any,
      homeAddress: (input.homeAddress ?? '').slice(0, 300),
      ...(input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}),
    },
  })
  await recordChange(tx, { type: 'Enrollment', id: enrollment.id, to: 'pending_payment', actorId: input.actorId, data: { planId: plan?.id ?? null, packageId: pkg?.id ?? null } })

  const invoice = await createInvoice(tx, {
    familyId: input.familyId, locationId, kind: plan ? 'enrolment' : 'package', lines, discount: promoDiscount, promoCodeId: promo?.id ?? null, actorId: input.actorId,
    fulfilment: { kind: 'enrolment', enrollmentId: enrollment.id, membershipId, studentPackageId, promoCodeId: promo?.id ?? null },
  })
  if (studentPackageId) await tx.studentPackage.update({ where: { id: studentPackageId }, data: { invoice: { connect: { id: invoice.id } } } })
  return { enrollmentId: enrollment.id, membershipId, studentPackageId, invoice, superseded: superseded.filter(Boolean), program, student }
}

async function validPromo(tx: Tx, code: string, kind: 'plan' | 'package') {
  const promo = await tx.promoCode.findFirst({ where: { code: { equals: code.trim(), mode: 'insensitive' } } })
  const now = new Date()
  if (!promo || (promo.validFrom && promo.validFrom > now) || (promo.validTo && promo.validTo < now) || (promo.maxUses != null && promo.uses >= promo.maxUses) || !['any', kind].includes(promo.appliesTo)) {
    throw new CommandError('That promo code is not valid.')
  }
  return promo
}

/** Enrolment fee once per student; a rejoin within N days waives it (§4.9). */
async function enrolmentFeeWaived(tx: Tx, studentId: string, withinDays: number) {
  const paid = await tx.invoiceLine.count({ where: { studentId, kind: 'enrolment_fee', invoice: { status: { in: ['paid', 'partially_paid'] } } } })
  if (paid > 0) return true
  const recent = await tx.membership.count({ where: { studentId, status: 'cancelled', endsAt: { gte: new Date(Date.now() - withinDays * DAY) } } })
  return recent > 0
}

/** Abandoned or replaced checkout: void the unpaid invoice, cancel the pending rows. */
export async function cancelPendingEnrolment(tx: Tx, enrollmentId: string, reason: string, actorId: string | null) {
  const e = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { id: true, status: true, membershipId: true, studentPackageId: true } })
  if (!e || e.status !== 'pending_payment') return ''
  const invoices = await tx.invoice.findMany({ where: { kind: { in: ['enrolment', 'package'] }, fulfilment: { path: ['enrollmentId'], equals: e.id } }, select: { id: true, status: true, amountPaid: true } })
  if (invoices.some((i: any) => i.amountPaid > 0)) throw new CommandError('A payment for this enrolment is already in; ask the centre to finish it.')
  const r = await tx.enrollment.updateMany({ where: { id: e.id, status: 'pending_payment' }, data: { status: 'cancelled', endReason: reason.slice(0, 300), endDate: new Date() } })
  if (!r.count) return ''
  await recordChange(tx, { type: 'Enrollment', id: e.id, from: 'pending_payment', to: 'cancelled', actorId, reason })
  if (e.membershipId) await tx.membership.updateMany({ where: { id: e.membershipId, status: 'pending_payment' }, data: { status: 'cancelled', endsAt: new Date() } })
  if (e.studentPackageId) await tx.studentPackage.updateMany({ where: { id: e.studentPackageId, status: 'pending_payment' }, data: { status: 'refunded' } })
  for (const i of invoices) {
    await tx.invoice.updateMany({ where: { id: i.id, status: { in: ['open', 'draft'] }, amountPaid: 0 }, data: { status: 'void', notes: reason.slice(0, 300) } })
    await recordChange(tx, { type: 'Invoice', id: i.id, from: i.status, to: 'void', actorId, reason })
    await tx.paymentSession.updateMany({ where: { invoiceId: i.id, status: { in: ['pending', 'requires_action'] } }, data: { status: 'cancelled', cancelledAt: new Date() } })
  }
  return e.id
}

// ------------------------------------------------------------------ fulfilment
/** First membership period: grant credit for one month from the join day (W6.1). */
export async function startMembershipPeriod(tx: Tx, membershipId: string, start: Date, actorId: string | null, rolledFromId?: string | null) {
  const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { plan: { select: { programId: true } }, enrollment: { select: { programId: true, program: { select: { sessionMinutes: true } } } } } })
  const end = addMonths(start, 1)
  const minutes = m.sessionsPerPeriod ? m.sessionsPerPeriod * (m.enrollment?.program?.sessionMinutes ?? 60) : 0
  const grant = await createGrant(tx, {
    familyId: m.familyId, studentId: m.studentId, programId: m.enrollment?.programId ?? m.plan?.programId ?? null, kind: 'membership_period', minutes,
    unlimited: !m.sessionsPerPeriod, weeklyCap: m.sessionsPerPeriod ? null : m.weeklyCap ?? 5,
    periodStart: start, periodEnd: end, expiresAt: end, membershipId: m.id, note: `Period ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`, actorId, rolledFromId: rolledFromId ?? null,
  })
  return { grant, end }
}

registerFulfilment('enrolment', async (tx, invoice, f) => {
  const e = await tx.enrollment.findUnique({ where: { id: f.enrollmentId }, include: { program: { select: { format: true, billingModel: true, name: true } } } })
  if (!e) return
  const now = new Date()
  if (e.status !== 'pending_payment') {
    // Paid after the checkout was cancelled: keep the money for staff to refund; nothing to start.
    await tx.task.create({ data: { kind: 'billing', title: `Payment received for a cancelled checkout (invoice ${invoice.number})`, family: { connect: { id: invoice.familyId } }, relatedType: 'Invoice', relatedId: invoice.id, dueAt: now, openKey: `late-pay:${invoice.id}` } }).catch(() => {})
    return
  }
  // Centre programmes go straight to active; 1:1 managed programmes wait for a tutor match (W1.8, W2).
  const next = e.program?.format === 'one_to_one' ? 'pending_match' : 'active'
  await tx.enrollment.update({ where: { id: e.id }, data: { status: next, startDate: now } })
  await recordChange(tx, { type: 'Enrollment', id: e.id, from: 'pending_payment', to: next, reason: 'payment captured', data: { invoiceId: invoice.id } })
  await tx.student.updateMany({ where: { id: e.studentId, status: 'prospect' }, data: { status: 'active' } })
  if (f.promoCodeId) await tx.$executeRaw`UPDATE "PromoCode" SET uses = COALESCE(uses, 0) + 1 WHERE id = ${f.promoCodeId}`

  if (f.membershipId) {
    const r = await tx.membership.updateMany({ where: { id: f.membershipId, status: 'pending_payment' }, data: { status: 'active', startedAt: now, currentPeriodStart: now, currentPeriodEnd: addMonths(now, 1) } })
    if (r.count) {
      await recordChange(tx, { type: 'Membership', id: f.membershipId, from: 'pending_payment', to: 'active', reason: 'first period paid' })
      await startMembershipPeriod(tx, f.membershipId, now, null)
    }
  }
  if (f.studentPackageId) await activatePackage(tx, f.studentPackageId, e.programId)

  // Fixed weekly seats for the next 4 weeks (W1.8). A seat that filled meanwhile is reported, not fatal.
  const seriesIds: string[] = Array.isArray((e.preferredTimes as any)?.seriesIds) ? (e.preferredTimes as any).seriesIds : []
  const booked: string[] = []
  const missed: string[] = []
  if (seriesIds.length && next === 'active') {
    const through = new Date(now.getTime() + FIXED_SEAT_WEEKS * 7 * DAY)
    for (const seriesId of seriesIds) {
      await generateSessions(tx, seriesId, through)
      const sessions = await tx.session.findMany({ where: { seriesId, status: 'scheduled', startsAt: { gt: now, lte: through } }, select: { id: true }, orderBy: { startsAt: 'asc' } })
      for (const s of sessions) {
        try {
          const r = await bookSeat(tx, null, { sessionId: s.id, studentId: e.studentId, source: 'fixed_seat', whenFull: 'reject' })
          if (r.kind === 'booked') { booked.push(r.bookingId); await tx.booking.update({ where: { id: r.bookingId }, data: { enrollment: { connect: { id: e.id } } } }) }
        } catch (error) {
          if (!(error instanceof CommandError)) throw error
          missed.push(`${s.id}: ${error.message}`)
        }
      }
    }
    if (missed.length) await tx.task.create({ data: { kind: 'schedule', title: `${missed.length} fixed seat(s) could not be booked for a new enrolment`, family: { connect: { id: e.familyId } }, student: { connect: { id: e.studentId } }, relatedType: 'Enrollment', relatedId: e.id, dueAt: now, openKey: `seats:${e.id}` } })
  }
  // Lead → enrolled (W1.8)
  const lead = await tx.lead.findFirst({ where: { familyId: e.familyId, status: { in: ['new', 'contacted', 'assessment_booked', 'assessed', 'proposal_sent'] } }, select: { id: true, status: true }, orderBy: { createdAt: 'desc' } })
  if (lead) {
    await tx.lead.updateMany({ where: { id: lead.id, status: lead.status }, data: { status: 'enrolled' } })
    await recordChange(tx, { type: 'Lead', id: lead.id, from: lead.status, to: 'enrolled', reason: 'enrolment paid' })
  }
  if (e.planId) await tx.learningPlan.updateMany({ where: { id: e.planId, status: { in: ['proposed', 'accepted'] } }, data: { status: 'active' } })
  await tx.notificationLog.create({ data: { recipient: '', template: 'enrolment_confirmed', subject: `Enrolment confirmed: ${e.program?.name ?? ''}`, relatedType: 'Enrollment', relatedId: e.id, status: 'queued' } })
  await tx.invoice.update({ where: { id: invoice.id }, data: { fulfilment: { ...f, bookedSeats: booked.length, missedSeats: missed.length } } })
})

async function activatePackage(tx: Tx, studentPackageId: string, programId: string | null) {
  const sp = await tx.studentPackage.findUnique({ where: { id: studentPackageId }, include: { package: { select: { expiryMonths: true, programId: true, name: true } } } })
  const now = new Date()
  const expiresAt = addMonths(now, sp.package?.expiryMonths ?? 6)
  const r = await tx.studentPackage.updateMany({ where: { id: sp.id, status: 'pending_payment' }, data: { status: 'active', purchasedAt: now, expiresAt } })
  if (!r.count) return
  await recordChange(tx, { type: 'StudentPackage', id: sp.id, from: 'pending_payment', to: 'active', reason: 'paid' })
  await createGrant(tx, { familyId: sp.familyId, studentId: sp.studentId, programId: programId ?? sp.package?.programId ?? null, kind: 'package', minutes: (sp.hours ?? 0) * 60, expiresAt, studentPackageId: sp.id, note: sp.package?.name ?? 'Package' })
}

/** Top-up package (purchasePackage), not tied to a new enrolment. */
registerFulfilment('package', async (tx, _invoice, f) => {
  await activatePackage(tx, f.studentPackageId, f.programId ?? null)
  if (f.enrollmentId) {
    const e = await tx.enrollment.findUnique({ where: { id: f.enrollmentId }, select: { id: true, status: true } })
    if (e && e.status === 'ended') {
      await tx.enrollment.updateMany({ where: { id: e.id, status: 'ended' }, data: { status: 'active', endDate: null, endReason: '' } })
      await recordChange(tx, { type: 'Enrollment', id: e.id, from: 'ended', to: 'active', reason: 'package renewed' })
    }
  }
})

/** Package refund also removes the unused credit it paid for (W8). */
export async function removePackageCredit(tx: Tx, invoiceId: string, actorId: string | null) {
  const sps = await tx.studentPackage.findMany({ where: { invoiceId, status: { in: ['active', 'exhausted'] } }, select: { id: true, grants: { where: { status: 'active' }, select: { id: true } } } })
  let minutes = 0
  for (const sp of sps) {
    for (const g of sp.grants) minutes += await removeUnused(tx, g.id, 'refund', 'refunded', actorId, 'Package refunded')
    await tx.studentPackage.update({ where: { id: sp.id }, data: { status: 'refunded' } })
    await recordChange(tx, { type: 'StudentPackage', id: sp.id, to: 'refunded', actorId, reason: 'refund' })
  }
  return minutes
}
