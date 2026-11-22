/**
 * Membership life (§4.9, W6). Renewal billing adapted from Gym's membershipBillingAttempts:
 * claim under an advisory lock with a lease, the BillingAttempt unique on (membership, period
 * start, attempt number) so a double run cannot double charge, the Stripe idempotency key made
 * from the attempt id, and an unclear provider answer parked as `unknown` until reconcile asks
 * Stripe. Period advance happens in the invoice fulfilment, so a card charge, the guardian's pay
 * link and a front-desk cash payment all restore the membership the same way.
 */
import { addMonths } from 'date-fns'
import { createHash } from 'node:crypto'
import { CommandError } from './errors'
import { transaction, lockKey, recordChange } from './command'
import { createInvoice } from './invoices'
import { registerFulfilment, startInvoicePayment, settlePaymentIntent, stripeKeys, stripe, requestRefund } from './payments'
import { startMembershipPeriod, bookFixedSeats } from './enrolment'
import { cancelSeat } from './booking'
import { removeUnused, adjustGrant } from './ledger'
import { getSettings, DAY } from './settings'
import { queueEmail } from './notify'

type Tx = any
const LEASE_MS = 10 * 60_000
export const LIVE_MEMBERSHIP = ['active', 'past_due', 'paused', 'cancelling'] as const

// ------------------------------------------------------------------ renewal
export type BillOutcome = { membershipId: string; outcome: 'skipped' | 'captured' | 'failed' | 'unknown' | 'no_card'; reason?: string; attemptId?: string; invoiceId?: string }

/** One membership's renewal for its next period. Safe to call any number of times. */
export async function billMembership(prisma: any, membershipId: string, now = new Date()): Promise<BillOutcome> {
  let claim: any
  try {
    claim = await transaction(prisma, async (tx) => {
      await lockKey(tx, `membership-billing:${membershipId}`)
      const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { plan: true, pendingPlan: true, student: { select: { firstName: true } }, family: { select: { defaultPaymentMethodId: true, billingEmail: true } }, enrollment: { select: { locationId: true, programId: true } } } })
      if (!m || !['active', 'past_due', 'cancelling'].includes(m.status) || !m.currentPeriodEnd) return { skip: 'not billable' }
      const periodStart: Date = m.currentPeriodEnd
      const periodEnd = addMonths(periodStart, 1)
      if (periodStart.getTime() - DAY > now.getTime()) return { skip: 'not due' }
      if (m.endsAt && m.endsAt <= periodStart) return { skip: 'membership ends' }
      const last = await tx.billingAttempt.findFirst({ where: { membershipId, periodStart }, orderBy: { attemptNumber: 'desc' } })
      if (last?.status === 'succeeded') return { skip: 'paid' }
      if (last?.status === 'unknown') return { skip: 'waiting for reconcile' }
      if (last?.status === 'pending') {
        if (last.leaseExpiresAt && last.leaseExpiresAt > now) return { skip: 'in progress' }
        // A worker died mid-call: Stripe may have charged. Never retry blind.
        await tx.billingAttempt.update({ where: { id: last.id }, data: { status: 'unknown', failureMessage: 'Lease expired before the provider answered' } })
        await recordChange(tx, { type: 'BillingAttempt', id: last.id, from: 'pending', to: 'unknown', reason: 'lease expired' })
        return { skip: 'waiting for reconcile' }
      }
      if (last?.status === 'failed' && (!last.nextRetryAt || last.nextRetryAt > now)) return { skip: last.nextRetryAt ? 'waiting for retry day' : 'retries used' }

      let invoiceId: string | null = last?.invoiceId ?? null
      if (invoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } })
        if (inv.status === 'paid') return { skip: 'paid' }
        if (inv.status === 'void') invoiceId = null
      }
      if (!invoiceId) {
        const plan = m.pendingPlan ?? m.plan
        const price = m.pendingPlan ? m.pendingPlan.price : m.price
        const lines: any[] = [{ description: `${plan?.name ?? 'Membership'}: ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)} (${m.student?.firstName ?? ''})`, kind: 'membership', unitAmount: price, studentId: m.studentId, programId: m.enrollment?.programId ?? null, membershipId: m.id }]
        if (m.discountPercent) lines.push({ description: `Sibling discount ${m.discountPercent}%`, kind: 'discount', unitAmount: -Math.round((price * m.discountPercent) / 100), studentId: m.studentId, membershipId: m.id })
        const inv = await createInvoice(tx, { familyId: m.familyId, locationId: m.enrollment?.locationId ?? null, kind: 'membership', lines, dueAt: periodStart, fulfilment: { kind: 'membership_period', membershipId: m.id, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() } })
        invoiceId = inv.id
        if (inv.total === 0) {
          await tx.invoice.update({ where: { id: inv.id }, data: { status: 'paid' } })
          const { fulfilInvoice } = await import('./payments')
          await fulfilInvoice(tx, inv.id)
          return { skip: 'nothing to charge' }
        }
      }
      const n = (last?.attemptNumber ?? 0) + 1
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { total: true, amountPaid: true, amountCredited: true } })
      const attempt = await tx.billingAttempt.create({
        data: {
          membership: { connect: { id: m.id } }, periodStart, periodEnd, invoice: { connect: { id: invoiceId } }, attemptNumber: n,
          status: 'pending', amount: inv.total - inv.amountPaid - inv.amountCredited,
          requestHash: createHash('sha256').update(`${m.id}:${periodStart.toISOString()}:${n}`).digest('hex'), leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        },
      })
      await recordChange(tx, { type: 'BillingAttempt', id: attempt.id, to: 'pending', data: { membershipId: m.id, attemptNumber: n } })
      return { attempt, invoiceId, hasCard: Boolean(m.family?.defaultPaymentMethodId), email: m.family?.billingEmail ?? '' }
    })
  } catch (error: any) {
    if (error?.code === 'P2002') return { membershipId, outcome: 'skipped', reason: 'another run claimed this period' }
    throw error
  }
  if (claim.skip) return { membershipId, outcome: 'skipped', reason: claim.skip }
  const { attempt, invoiceId } = claim

  if (!claim.hasCard) {
    await finishAttempt(prisma, attempt.id, 'failed', { code: 'no_card', message: 'No saved card on file' }, now)
    return { membershipId, outcome: 'no_card', attemptId: attempt.id, invoiceId }
  }
  let status = 'unknown'
  let message = ''
  try {
    const started = await startInvoicePayment(prisma, { invoiceId, actorId: null, offSession: true, attemptKey: attempt.id })
    status = started.status
  } catch (error) {
    message = (error as Error).message
    const ps = await prisma.paymentSession.findFirst({ where: { invoiceId, offSession: true }, orderBy: { createdAt: 'desc' }, select: { status: true, failureMessage: true } })
    status = ps?.status === 'failed' ? 'failed' : 'unknown'
    if (ps?.failureMessage) message = ps.failureMessage
  }
  const ps = await prisma.paymentSession.findFirst({ where: { invoiceId, offSession: true }, orderBy: { createdAt: 'desc' }, select: { providerPaymentId: true } })
  if (status === 'captured') {
    await finishAttempt(prisma, attempt.id, 'succeeded', { providerPaymentId: ps?.providerPaymentId }, now)
    return { membershipId, outcome: 'captured', attemptId: attempt.id, invoiceId }
  }
  if (status === 'unknown') {
    await finishAttempt(prisma, attempt.id, 'unknown', { message, providerPaymentId: ps?.providerPaymentId }, now)
    return { membershipId, outcome: 'unknown', attemptId: attempt.id, invoiceId }
  }
  // failed, requires_action (off-session 3-D Secure), pending: the guardian pays by link.
  await finishAttempt(prisma, attempt.id, 'failed', { code: status === 'requires_action' ? 'authentication_required' : 'declined', message: message || status, providerPaymentId: ps?.providerPaymentId }, now)
  return { membershipId, outcome: 'failed', attemptId: attempt.id, invoiceId }
}

async function finishAttempt(prisma: any, attemptId: string, status: 'succeeded' | 'failed' | 'unknown', detail: { code?: string; message?: string; providerPaymentId?: string | null }, now: Date) {
  await transaction(prisma, async (tx) => {
    const a = await tx.billingAttempt.findUnique({ where: { id: attemptId }, include: { membership: { select: { id: true, status: true, pastDueSince: true, familyId: true, family: { select: { billingEmail: true } } } } } })
    if (!a || !['pending', 'unknown'].includes(a.status)) return
    let nextRetryAt: Date | null = null
    if (status === 'failed') {
      const settings = await getSettings(tx)
      const since: Date = a.membership.pastDueSince ?? now
      const days = settings.pastDueRetryDays[a.attemptNumber - 1]
      nextRetryAt = days != null ? new Date(since.getTime() + days * DAY) : null
      if (['active', 'cancelling'].includes(a.membership.status)) {
        await tx.membership.updateMany({ where: { id: a.membership.id, status: a.membership.status }, data: { status: 'past_due', pastDueSince: since } })
        await recordChange(tx, { type: 'Membership', id: a.membership.id, from: a.membership.status, to: 'past_due', reason: detail.code ?? 'payment failed', data: { attemptId } })
      }
      if (a.invoiceId) await queueEmail(tx, { to: a.membership.family?.billingEmail ?? '', template: 'payment_failed', subject: 'Your tutoring payment did not go through', relatedType: 'Invoice', relatedId: a.invoiceId })
    }
    if (status === 'unknown') {
      await tx.task.upsert({ where: { openKey: `reconcile:${attemptId}` }, create: { kind: 'billing_review', title: 'A membership charge needs checking with Stripe', family: { connect: { id: a.membership.familyId } }, relatedType: 'BillingAttempt', relatedId: attemptId, dueAt: now, openKey: `reconcile:${attemptId}` }, update: {} })
    }
    await tx.billingAttempt.update({ where: { id: attemptId }, data: { status, leaseExpiresAt: null, nextRetryAt, failureCode: detail.code ?? '', failureMessage: (detail.message ?? '').slice(0, 500), providerPaymentId: detail.providerPaymentId ?? a.providerPaymentId ?? '' } })
    await recordChange(tx, { type: 'BillingAttempt', id: attemptId, from: a.status, to: status, reason: detail.code ?? null })
  })
}

/** Ask Stripe what happened to an `unknown` attempt, then settle it like a webhook would. */
export async function reconcileAttempt(prisma: any, attemptId: string, now = new Date()) {
  const a = await prisma.billingAttempt.findUnique({ where: { id: attemptId } })
  if (!a) throw new CommandError('That billing attempt was not found.')
  if (!['unknown', 'pending'].includes(a.status)) return { status: a.status }
  if (a.status === 'pending' && a.leaseExpiresAt && a.leaseExpiresAt > now) throw new CommandError('This charge is still in progress.')
  const keys = await stripeKeys(prisma)
  const ps = await prisma.paymentSession.findFirst({ where: { invoiceId: a.invoiceId, offSession: true, createdAt: { gte: new Date(a.createdAt.getTime() - 60_000) } }, orderBy: { createdAt: 'asc' } })
  let pi: any = null
  if (ps?.providerPaymentId) pi = await stripe.retrievePaymentIntent(keys, ps.providerPaymentId)
  else if (ps) {
    const found = await stripe.listPaymentIntentsByMetadata(keys, 'paymentSessionId', ps.id)
    pi = found.data[0] ?? null
    if (pi) await prisma.paymentSession.update({ where: { id: ps.id }, data: { providerPaymentId: pi.id } })
  }
  if (!pi) {
    // Stripe never saw it: safe to retry now.
    await transaction(prisma, async (tx) => {
      await tx.billingAttempt.update({ where: { id: a.id }, data: { status: 'failed', failureCode: 'not_sent', failureMessage: 'Stripe has no record of this charge', nextRetryAt: now, leaseExpiresAt: null } })
      if (ps) await tx.paymentSession.updateMany({ where: { id: ps.id, status: { in: ['pending', 'unknown'] } }, data: { status: 'failed', failureMessage: 'Not sent' } })
      await recordChange(tx, { type: 'BillingAttempt', id: a.id, from: a.status, to: 'failed', reason: 'reconcile: not sent' })
      await tx.task.updateMany({ where: { openKey: `reconcile:${a.id}` }, data: { status: 'done', openKey: null, completedAt: now, outcomeNote: 'Stripe had no charge; retry allowed' } })
    })
    return { status: 'failed' }
  }
  const settled = await settlePaymentIntent(prisma, pi, 'reconcile')
  const final = settled.status === 'captured' ? 'succeeded' : ['failed', 'cancelled', 'requires_action'].includes(settled.status) ? 'failed' : 'unknown'
  if (final === 'unknown') return { status: 'unknown' }
  await prisma.billingAttempt.update({ where: { id: a.id }, data: { status: 'unknown' } }).catch(() => {})
  await finishAttempt(prisma, a.id, final, { code: final === 'failed' ? 'declined' : undefined, providerPaymentId: pi.id, message: pi.last_payment_error?.message }, now)
  await prisma.task.updateMany({ where: { openKey: `reconcile:${a.id}` }, data: { status: 'done', openKey: null, completedAt: now, outcomeNote: `Stripe: ${pi.status}` } })
  return { status: final }
}

/** Paid renewal (card, link or front desk): advance the period, apply a pending plan, restore. */
registerFulfilment('membership_period', async (tx, invoice, f) => {
  await lockKey(tx, `membership:${f.membershipId}`)
  const m = await tx.membership.findUnique({ where: { id: f.membershipId }, include: { pendingPlan: true } })
  if (!m) return
  const periodStart = new Date(f.periodStart)
  const periodEnd = new Date(f.periodEnd)
  if (!m.currentPeriodEnd || m.currentPeriodEnd.getTime() !== periodStart.getTime() || m.status === 'cancelled') {
    await tx.task.create({ data: { kind: 'billing_review', title: `Membership payment received for a period that no longer applies (invoice ${invoice.number})`, family: { connect: { id: invoice.familyId } }, relatedType: 'Invoice', relatedId: invoice.id, dueAt: new Date(), openKey: `stale-period:${invoice.id}` } }).catch(() => {})
    return
  }
  const next = ['past_due', 'suspended'].includes(m.status) ? 'active' : m.status
  const planData = m.pendingPlan ? { plan: { connect: { id: m.pendingPlan.id } }, pendingPlan: { disconnect: true }, price: m.pendingPlan.price, sessionsPerPeriod: m.pendingPlan.sessionsPerPeriod ?? null, weeklyCap: m.pendingPlan.sessionsPerPeriod ? null : m.pendingPlan.weeklyCapForUnlimited ?? 5 } : {}
  await tx.membership.update({ where: { id: m.id }, data: { status: next, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, pastDueSince: null, ...planData } })
  await recordChange(tx, { type: 'Membership', id: m.id, from: m.status, to: next, reason: 'period paid', data: { periodStart: f.periodStart, invoiceId: invoice.id, planChanged: Boolean(m.pendingPlan) } })
  await startMembershipPeriod(tx, m.id, periodStart, null)
  // Keep the fixed weekly seats booked through the paid period.
  const e = await tx.enrollment.findFirst({ where: { membershipId: m.id, status: 'active' }, select: { id: true } })
  if (e) await bookFixedSeats(tx, e.id, periodStart, periodEnd)
  await tx.billingAttempt.updateMany({ where: { invoiceId: invoice.id, status: { in: ['pending', 'unknown'] } }, data: { status: 'succeeded', leaseExpiresAt: null } })
  await tx.billingAttempt.updateMany({ where: { invoiceId: invoice.id, status: 'failed' }, data: { nextRetryAt: null } })
})

// ------------------------------------------------------------------ daily status moves
async function cancelFutureBookings(tx: Tx, where: Record<string, unknown>, reason: string, actorId: string | null) {
  const bookings = await tx.booking.findMany({ where: { status: 'booked', startsAt: { gt: new Date() }, ...where }, select: { id: true }, orderBy: { startsAt: 'asc' } })
  for (const b of bookings) await cancelSeat(tx, null, b.id, { byCentre: true, reason })
  return bookings.length
}

function membershipBookings(m: { id: string; studentId: string }) {
  return { studentId: m.studentId, creditGrant: { membershipId: m.id } }
}

async function endEnrolment(tx: Tx, membershipId: string, reason: string, actorId: string | null) {
  const e = await tx.enrollment.findFirst({ where: { membershipId, status: { in: ['pending_match', 'matched', 'active', 'paused'] } }, select: { id: true, status: true } })
  if (!e) return
  await tx.enrollment.update({ where: { id: e.id }, data: { status: 'ended', endDate: new Date(), endReason: reason.slice(0, 300) } })
  await recordChange(tx, { type: 'Enrollment', id: e.id, from: e.status, to: 'ended', actorId, reason })
}

async function closeMembership(tx: Tx, m: any, reason: string, actorId: string | null, now: Date) {
  const r = await tx.membership.updateMany({ where: { id: m.id, status: m.status }, data: { status: 'cancelled', endsAt: m.endsAt && m.endsAt < now ? m.endsAt : now } })
  if (!r.count) return false
  await recordChange(tx, { type: 'Membership', id: m.id, from: m.status, to: 'cancelled', actorId, reason })
  await cancelFutureBookings(tx, membershipBookings(m), reason, actorId)
  const grants = await tx.creditGrant.findMany({ where: { membershipId: m.id, status: { in: ['active', 'exhausted'] } }, select: { id: true } })
  for (const g of grants) await removeUnused(tx, g.id, 'adjustment', 'voided', actorId, 'Membership ended')
  await endEnrolment(tx, m.id, reason, actorId)
  return true
}

/** Suspend at day N unpaid, cancel 30 days after that, finish notice periods, start and end pauses. */
export async function advanceMemberships(prisma: any, now = new Date()) {
  const settings = await getSettings(prisma)
  const out = { suspended: 0, cancelled: 0, ended: 0, paused: 0, resumed: 0 }
  const suspendBefore = new Date(now.getTime() - settings.suspendAfterDays * DAY)
  for (const m of await prisma.membership.findMany({ where: { status: 'past_due', pastDueSince: { lte: suspendBefore } }, select: { id: true } })) {
    await transaction(prisma, async (tx) => {
      const row = await tx.membership.findUnique({ where: { id: m.id }, include: { family: { select: { billingEmail: true } } } })
      if (row.status !== 'past_due') return
      await tx.membership.update({ where: { id: m.id }, data: { status: 'suspended' } })
      await recordChange(tx, { type: 'Membership', id: m.id, from: 'past_due', to: 'suspended', reason: `unpaid ${settings.suspendAfterDays} days` })
      await cancelFutureBookings(tx, membershipBookings(row), 'Membership suspended for non-payment', null)
      await tx.task.upsert({ where: { openKey: `suspended:${m.id}` }, create: { kind: 'failed_payment', title: 'Membership suspended for non-payment', family: { connect: { id: row.familyId } }, student: { connect: { id: row.studentId } }, relatedType: 'Membership', relatedId: m.id, dueAt: now, openKey: `suspended:${m.id}` }, update: {} })
      await queueEmail(tx, { to: row.family?.billingEmail ?? '', template: 'membership_suspended', subject: 'Your tutoring membership is suspended', relatedType: 'Membership', relatedId: m.id })
      out.suspended += 1
    })
  }
  const cancelBefore = new Date(now.getTime() - (settings.suspendAfterDays + 30) * DAY)
  for (const m of await prisma.membership.findMany({ where: { status: 'suspended', pastDueSince: { lte: cancelBefore } } })) {
    if (await transaction(prisma, (tx) => closeMembership(tx, m, 'Unpaid 30 days after suspension', null, now))) out.cancelled += 1
  }
  for (const m of await prisma.membership.findMany({ where: { status: { in: ['cancelling', 'active', 'past_due'] }, endsAt: { lte: now } } })) {
    if (await transaction(prisma, (tx) => closeMembership(tx, m, 'Notice period ended', null, now))) out.ended += 1
  }
  for (const m of await prisma.membership.findMany({ where: { status: { in: ['active', 'cancelling'] }, pausedFrom: { lte: now }, pausedUntil: { gt: now } }, select: { id: true, status: true } })) {
    await transaction(prisma, async (tx) => {
      const r = await tx.membership.updateMany({ where: { id: m.id, status: m.status }, data: { status: 'paused' } })
      if (!r.count) return
      await recordChange(tx, { type: 'Membership', id: m.id, from: m.status, to: 'paused', reason: 'pause started' })
      await tx.enrollment.updateMany({ where: { membershipId: m.id, status: 'active' }, data: { status: 'paused' } })
      out.paused += 1
    })
  }
  for (const m of await prisma.membership.findMany({ where: { status: 'paused', pausedUntil: { lte: now } }, select: { id: true, endsAt: true } })) {
    await transaction(prisma, async (tx) => {
      const to = m.endsAt ? 'cancelling' : 'active'
      const r = await tx.membership.updateMany({ where: { id: m.id, status: 'paused' }, data: { status: to, pausedFrom: null, pausedUntil: null } })
      if (!r.count) return
      await recordChange(tx, { type: 'Membership', id: m.id, from: 'paused', to, reason: 'pause ended' })
      await tx.enrollment.updateMany({ where: { membershipId: m.id, status: 'paused' }, data: { status: 'active' } })
      out.resumed += 1
    })
  }
  return out
}

/** Every membership due within a day, plus retries whose day has come. */
export async function runMembershipBilling(prisma: any, now = new Date(), onlyIds?: string[]) {
  const due = await prisma.membership.findMany({ where: { status: { in: ['active', 'past_due', 'cancelling'] }, currentPeriodEnd: { lte: new Date(now.getTime() + DAY) }, ...(onlyIds ? { id: { in: onlyIds } } : {}) }, select: { id: true } })
  const results: BillOutcome[] = []
  for (const m of due) results.push(await billMembership(prisma, m.id, now))
  return results
}

// ------------------------------------------------------------------ guardian / staff changes
/** End of the period that contains today + notice days (W6.6). */
export function noticeEndDate(m: { currentPeriodStart: Date | null; currentPeriodEnd: Date | null }, noticeDays: number, now = new Date()) {
  const target = new Date(now.getTime() + noticeDays * DAY)
  let end = m.currentPeriodEnd ?? addMonths(now, 1)
  let guard = 0
  while (end < target && guard < 36) { end = addMonths(end, 1); guard += 1 }
  return end
}

export async function giveNotice(tx: Tx, m: any, actorId: string | null, now = new Date()) {
  if (!['active', 'past_due', 'paused'].includes(m.status)) throw new CommandError(m.status === 'cancelling' ? 'Notice has already been given.' : 'This membership cannot be cancelled now.')
  const settings = await getSettings(tx)
  const endsAt = noticeEndDate(m, settings.membershipCancelNoticeDays, now)
  const to = m.status === 'paused' ? 'paused' : m.status === 'past_due' ? 'past_due' : 'cancelling'
  const r = await tx.membership.updateMany({ where: { id: m.id, status: m.status }, data: { status: to, endsAt, cancelRequestedAt: now, pendingPlanId: null } })
  if (!r.count) throw new CommandError('This membership changed; reload and try again.')
  await recordChange(tx, { type: 'Membership', id: m.id, from: m.status, to, actorId, reason: 'notice given', data: { endsAt: endsAt.toISOString() } })
  const released = await cancelFutureBookings(tx, { ...membershipBookings(m), startsAt: { gte: endsAt } }, 'After the membership end date', actorId)
  return { endsAt, released }
}

export async function applyPause(tx: Tx, m: any, from: Date, until: Date, actorId: string | null, opts: { staff: boolean; now?: Date }) {
  const now = opts.now ?? new Date()
  const settings = await getSettings(tx)
  if (!['active', 'cancelling'].includes(m.status)) throw new CommandError('Only an active membership can be paused.')
  if (m.pausedUntil && m.pausedUntil > now) throw new CommandError('A pause is already booked.')
  const days = Math.round((until.getTime() - from.getTime()) / DAY)
  if (until <= from) throw new CommandError('The pause must end after it starts.')
  if (!opts.staff) {
    if (days < settings.pauseMinDays || days > settings.pauseMaxDays) throw new CommandError(`A pause is ${settings.pauseMinDays} to ${settings.pauseMaxDays} days.`)
    if (from < new Date(now.getTime() - DAY)) throw new CommandError('A pause cannot start in the past.')
    const yearAgo = new Date(now.getTime() - 365 * DAY)
    if (m.lastPauseAt && m.lastPauseAt > yearAgo && settings.pausesPerYear <= 1) throw new CommandError('A membership can be paused once in 12 months.')
  }
  if (m.currentPeriodEnd && from >= m.currentPeriodEnd) throw new CommandError(`A pause must start before the next bill date (${m.currentPeriodEnd.toISOString().slice(0, 10)}).`)
  const shift = until.getTime() - from.getTime()
  const data: any = { pausedFrom: from, pausedUntil: until, lastPauseAt: now, pauseRequestedFrom: from, pauseRequestedUntil: until }
  if (m.currentPeriodEnd) data.currentPeriodEnd = new Date(m.currentPeriodEnd.getTime() + shift)
  if (m.endsAt) data.endsAt = new Date(m.endsAt.getTime() + shift)
  const startsNow = from <= now
  if (startsNow) data.status = 'paused'
  const r = await tx.membership.updateMany({ where: { id: m.id, status: m.status }, data })
  if (!r.count) throw new CommandError('This membership changed; reload and try again.')
  await recordChange(tx, { type: 'Membership', id: m.id, from: m.status, to: startsNow ? 'paused' : m.status, actorId, reason: 'pause booked', data: { from: from.toISOString(), until: until.toISOString() } })
  // Billing and grants shift by the pause length.
  const grants = await tx.creditGrant.findMany({ where: { membershipId: m.id, status: { in: ['active', 'exhausted'] }, expiresAt: { gt: now } }, select: { id: true, expiresAt: true, periodEnd: true } })
  for (const g of grants) await tx.creditGrant.update({ where: { id: g.id }, data: { expiresAt: new Date(g.expiresAt.getTime() + shift), ...(g.periodEnd ? { periodEnd: new Date(g.periodEnd.getTime() + shift) } : {}) } })
  if (startsNow) await tx.enrollment.updateMany({ where: { membershipId: m.id, status: 'active' }, data: { status: 'paused' } })
  // Seats in the pause are released with their credit.
  const released = await cancelFutureBookings(tx, { ...membershipBookings(m), startsAt: { gte: from, lt: until } }, 'Membership paused', actorId)
  return { from, until, released, nextBillDate: data.currentPeriodEnd ?? null }
}

/** What a plan change costs if applied now: price difference for the days left in the period. */
export async function planChangePreview(tx: Tx, membershipId: string, planId: string, now = new Date()) {
  const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { plan: true, enrollment: { select: { programId: true, program: { select: { sessionMinutes: true } } } } } })
  if (!m) throw new CommandError('That membership was not found.')
  const plan = await tx.membershipPlan.findUnique({ where: { id: planId } })
  if (!plan || plan.status === 'archived') throw new CommandError('That plan is not available.')
  if (plan.programId && m.enrollment?.programId && plan.programId !== m.enrollment.programId) throw new CommandError('That plan is for a different programme.')
  if (plan.id === m.planId) throw new CommandError('The membership is already on that plan.')
  const start = m.currentPeriodStart ?? now
  const end = m.currentPeriodEnd ?? addMonths(now, 1)
  const periodMs = Math.max(1, end.getTime() - start.getTime())
  const leftMs = Math.max(0, end.getTime() - now.getTime())
  const fraction = leftMs / periodMs
  const discount = (price: number) => price - Math.round((price * (m.discountPercent ?? 0)) / 100)
  const prorationAmount = Math.round((discount(plan.price) - discount(m.price ?? 0)) * fraction)
  const minutesPerSession = m.enrollment?.program?.sessionMinutes ?? 60
  const extraMinutes = plan.sessionsPerPeriod && m.sessionsPerPeriod ? Math.round((plan.sessionsPerPeriod - m.sessionsPerPeriod) * minutesPerSession * fraction) : 0
  return {
    membershipId: m.id, fromPlan: { id: m.planId, name: m.plan?.name ?? '', price: m.price }, toPlan: { id: plan.id, name: plan.name, price: plan.price },
    discountPercent: m.discountPercent ?? 0, daysLeft: Math.round(leftMs / DAY), periodDays: Math.round(periodMs / DAY), prorationAmount, extraMinutes,
    nextBillDate: end.toISOString(), nextBillAmount: discount(plan.price), canApplyNow: prorationAmount >= 0 && m.status === 'active',
  }
}

export async function changePlan(tx: Tx, membershipId: string, planId: string, effective: 'next_period' | 'now', actorId: string) {
  await lockKey(tx, `membership:${membershipId}`)
  const preview = await planChangePreview(tx, membershipId, planId)
  const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { enrollment: { select: { locationId: true, programId: true } }, student: { select: { firstName: true } } } })
  if (!['active', 'past_due', 'paused'].includes(m.status)) throw new CommandError('Only a live membership can change plan.')
  if (effective === 'next_period') {
    await tx.membership.update({ where: { id: m.id }, data: { pendingPlan: { connect: { id: planId } } } })
    await recordChange(tx, { type: 'Membership', id: m.id, from: m.status, to: m.status, actorId, reason: 'plan change at next period', data: { planId } })
    return { ...preview, effective, invoiceId: null }
  }
  if (!preview.canApplyNow) throw new CommandError('A cheaper plan starts at the next bill date. Choose “next period”.')
  const plan = await tx.membershipPlan.findUnique({ where: { id: planId } })
  await tx.membership.update({ where: { id: m.id }, data: { plan: { connect: { id: plan.id } }, pendingPlan: { disconnect: true }, price: plan.price, sessionsPerPeriod: plan.sessionsPerPeriod ?? null, weeklyCap: plan.sessionsPerPeriod ? null : plan.weeklyCapForUnlimited ?? 5 } })
  await recordChange(tx, { type: 'Membership', id: m.id, from: m.status, to: m.status, actorId, reason: 'plan changed now', data: { planId, prorationAmount: preview.prorationAmount } })
  let invoiceId: string | null = null
  if (preview.prorationAmount > 0) {
    const inv = await createInvoice(tx, { familyId: m.familyId, locationId: m.enrollment?.locationId ?? null, kind: 'membership', actorId, lines: [{ description: `Plan change to ${plan.name}: ${preview.daysLeft} days (${m.student?.firstName ?? ''})`, kind: 'membership', unitAmount: preview.prorationAmount, studentId: m.studentId, programId: m.enrollment?.programId ?? null, membershipId: m.id }] })
    invoiceId = inv.id
  }
  if (preview.extraMinutes > 0) {
    const g = await tx.creditGrant.findFirst({ where: { membershipId: m.id, status: { in: ['active', 'exhausted'] }, rolledFromId: null, periodStart: m.currentPeriodStart }, select: { id: true } })
    if (g) await adjustGrant(tx, g.id, preview.extraMinutes, actorId, `Plan change to ${plan.name}`)
  }
  return { ...preview, effective, invoiceId }
}

/** Staff end now with a prorated refund of the period's membership charge (W6.6). */
export async function endNow(tx: Tx, membershipId: string, opts: { refund: boolean; reason: string; actorId: string; now?: Date }) {
  const now = opts.now ?? new Date()
  await lockKey(tx, `membership:${membershipId}`)
  const m = await tx.membership.findUnique({ where: { id: membershipId } })
  if (!m || m.status === 'cancelled') throw new CommandError('This membership has already ended.')
  let refundIds: string[] = []
  let refundAmount = 0
  if (opts.refund && m.currentPeriodStart && m.currentPeriodEnd && m.currentPeriodEnd > now) {
    const lines = await tx.invoiceLine.findMany({ where: { membershipId: m.id, kind: { in: ['membership', 'discount'] }, invoice: { status: { in: ['paid', 'partially_paid'] }, createdAt: { lte: now } } }, select: { amount: true, invoiceId: true, invoice: { select: { createdAt: true } } }, orderBy: { createdAt: 'desc' } })
    const invoiceId = lines[0]?.invoiceId
    if (invoiceId) {
      const paidForPeriod = lines.filter((l: any) => l.invoiceId === invoiceId).reduce((s: number, l: any) => s + l.amount, 0)
      const fraction = (m.currentPeriodEnd.getTime() - now.getTime()) / (m.currentPeriodEnd.getTime() - m.currentPeriodStart.getTime())
      refundAmount = Math.max(0, Math.round(paidForPeriod * fraction))
      let left = refundAmount
      const payments = await tx.payment.findMany({ where: { invoiceId, status: { in: ['captured', 'partially_refunded'] } }, orderBy: { createdAt: 'asc' } })
      for (const p of payments) {
        if (left <= 0) break
        const amount = Math.min(left, p.amount - (p.refundedAmount ?? 0))
        if (amount <= 0) continue
        const refund = await requestRefund(tx, { paymentId: p.id, amount, reason: `Membership ended: ${opts.reason}`.slice(0, 500), actorId: opts.actorId, key: `end-refund:${m.id}:${p.id}` })
        refundIds.push(refund.id)
        left -= amount
      }
      refundAmount -= left
    }
  }
  await closeMembership(tx, m, opts.reason, opts.actorId, now)
  return { refundAmount, refundIds }
}
