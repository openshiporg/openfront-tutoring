/**
 * Tutors, matching, offers, applications (W2, W9, §4.5, §4.11, §5.9).
 * Staff: sendOffer, withdrawOffer, setTutorStatus, verifyCredential, decideTimeOff,
 * createTutorApplication, transitionApplication, approveApplication, createEnrolmentForFamily.
 * Tutor: respondToOffer, requestTimeOff. Guardian: confirmTutor, requestRematch.
 */
import { randomBytes } from 'node:crypto'
import { runCommand, transition, recordChange, requireString, optionalString, requireInt, requireDate, lockKey } from '../lib/command'
import { CommandError } from '../lib/errors'
import { canAt, requireFlag, requireGuardianOf, requireActor, loadActor } from '../lib/actor'
import { rankCandidates, enrolmentForMatch, slotsOf, acceptOffer } from '../lib/matching'
import { bookFixedSeats, buildCheckout } from '../lib/enrolment'
import { createInvoice } from '../lib/invoices'
import { cancelSeat } from '../lib/booking'
import { queueEmail } from '../lib/notify'
import { getSettings, DAY, HOUR } from '../lib/settings'

const gql = String.raw
type Ctx = any
const keyOf = (a: any) => (typeof a?.idempotencyKey === 'string' ? a.idempotencyKey : null)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const typeDefs = gql`
  type Query {
    matchingCandidates(enrollmentId: ID!): JSON
    myOffers: JSON
  }
  type Mutation {
    sendOffer(enrollmentId: ID!, tutorId: ID!, slots: JSON, idempotencyKey: String): CommandResult!
    withdrawOffer(offerId: ID!, reason: String, idempotencyKey: String): CommandResult!
    respondToOffer(offerId: ID!, accept: Boolean!, reason: String, idempotencyKey: String): CommandResult!
    confirmTutor(enrollmentId: ID!, idempotencyKey: String): CommandResult!
    requestRematch(enrollmentId: ID!, reason: String!, idempotencyKey: String): CommandResult!
    createEnrolmentForFamily(data: JSON!, idempotencyKey: String): CommandResult!
    setTutorStatus(tutorId: ID!, status: String!, reason: String, coverSessions: Boolean, idempotencyKey: String): CommandResult!
    verifyCredential(credentialId: ID!, decision: String!, expiresAt: String, idempotencyKey: String): CommandResult!
    requestTimeOff(startsAt: String!, endsAt: String!, reason: String, idempotencyKey: String): CommandResult!
    decideTimeOff(timeOffId: ID!, approve: Boolean!, idempotencyKey: String): CommandResult!
    createTutorApplication(data: JSON!, idempotencyKey: String): CommandResult!
    transitionApplication(applicationId: ID!, status: String!, note: String, idempotencyKey: String): CommandResult!
    approveApplication(applicationId: ID!, data: JSON, idempotencyKey: String): CommandResult!
  }
`

async function actorOf(context: Ctx) {
  return context.session?.itemId ? loadActor(context.sudo().prisma, context.session.itemId) : null
}

/** Trial confirmed (or 48 h with no objection): active; placement invoice for placement_fee programmes (W2.5-6). */
export async function confirmMatch(tx: any, enrollmentId: string, actorId: string | null, reason: string) {
  const e = await enrolmentForMatch(tx, enrollmentId)
  if (e.status !== 'matched') throw new CommandError('This enrolment is not waiting for a tutor confirmation.')
  await tx.enrollment.update({ where: { id: e.id }, data: { status: 'active', tutorConfirmedAt: new Date(), startDate: e.startDate ?? new Date() } })
  await recordChange(tx, { type: 'Enrollment', id: e.id, from: 'matched', to: 'active', actorId, reason })
  let invoiceId: string | null = null
  if (e.program.billingModel === 'placement_fee' && e.program.placementFee > 0) {
    const inv = await createInvoice(tx, { familyId: e.familyId, locationId: e.locationId, kind: 'placement', actorId, lines: [{ description: `Placement: ${e.program.name} (${e.student.firstName})`, kind: 'placement', unitAmount: e.program.placementFee, studentId: e.studentId, programId: e.programId }] })
    invoiceId = inv.id
  }
  return { invoiceId }
}

/** Daily job: a matched enrolment whose trial was attended 48 h ago with no objection becomes active. */
export async function autoConfirmMatches(prisma: any, now = new Date()) {
  const due = await prisma.enrollment.findMany({ where: { status: 'matched', trialAttendedAt: { lte: new Date(now.getTime() - 48 * HOUR) } }, select: { id: true } })
  let confirmed = 0
  for (const e of due) {
    await prisma.$transaction(async (tx: any) => { await lockKey(tx, `enrol-match:${e.id}`); const row = await tx.enrollment.findUnique({ where: { id: e.id }, select: { status: true } }); if (row.status === 'matched') { await confirmMatch(tx, e.id, null, 'no objection 48 hours after the trial'); confirmed += 1 } }, { maxWait: 60_000, timeout: 120_000 })
  }
  return { confirmed }
}

export const resolvers = {
  Query: {
    matchingCandidates: async (_: unknown, args: any, context: Ctx) => {
      const prisma = context.sudo().prisma
      const e = await prisma.enrollment.findUnique({ where: { id: String(args.enrollmentId) }, select: { locationId: true, family: { select: { primaryLocationId: true } } } })
      if (!e) return null
      if (!canAt(await actorOf(context), 'canManageTutors', e.locationId ?? e.family?.primaryLocationId)) return null
      return rankCandidates(prisma, String(args.enrollmentId))
    },
    /** Tutor portal: offers without family contact details until accepted (W2.3). */
    myOffers: async (_: unknown, _args: any, context: Ctx) => {
      const actor = await actorOf(context)
      if (!actor?.tutorId) return []
      const offers = await context.sudo().prisma.offer.findMany({
        where: { tutorId: actor.tutorId }, orderBy: { createdAt: 'desc' }, take: 50,
        include: { enrollment: { select: { id: true, mode: true, status: true, program: { select: { name: true } }, student: { select: { firstName: true, level: { select: { name: true } }, lastName: true } }, location: { select: { name: true } }, family: { select: { city: true, postalCode: true, name: true, phone: true, billingEmail: true, addressLine1: true } }, homeAddress: true } } },
      })
      return offers.map((o: any) => {
        const accepted = o.status === 'accepted'
        const f = o.enrollment?.family ?? {}
        return {
          id: o.id, status: o.status, payRate: o.payRate, slots: o.proposedSlots, sentAt: o.sentAt, expiresAt: o.expiresAt, respondedAt: o.respondedAt, declineReason: o.declineReason,
          programme: o.enrollment?.program?.name, mode: o.enrollment?.mode, level: o.enrollment?.student?.level?.name ?? null, location: o.enrollment?.location?.name ?? null,
          area: [f.city, f.postalCode].filter(Boolean).join(' '), student: accepted ? `${o.enrollment.student.firstName} ${o.enrollment.student.lastName}`.trim() : o.enrollment?.student?.firstName,
          family: accepted ? { name: f.name, phone: f.phone, email: f.billingEmail, address: o.enrollment.homeAddress || f.addressLine1 } : null,
        }
      })
    },
  },
  Mutation: {
    sendOffer: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'sendOffer', idempotencyKey: keyOf(args), input: { e: args.enrollmentId, t: args.tutorId, s: args.slots ?? null }, conflictMessage: 'This enrolment already has an open offer. Withdraw it first.' }, async (tx, actor) => {
      const e = await enrolmentForMatch(tx, String(args.enrollmentId))
      const a = requireFlag(actor, 'canManageTutors', e.locationId ?? e.family?.primaryLocationId)
      if (e.status !== 'pending_match') throw new CommandError('This enrolment is not waiting for a tutor.')
      await lockKey(tx, `enrol-match:${e.id}`)
      if (await tx.offer.findUnique({ where: { openKey: e.id }, select: { id: true } })) throw new CommandError('This enrolment already has an open offer. Withdraw it first.')
      const ranked = await rankCandidates(tx, e.id)
      const c = ranked.candidates.find((x: any) => x.tutorId === String(args.tutorId))
      if (!c) throw new CommandError('That tutor is not a candidate (subject, level, mode, background check, availability or a past re-match).')
      const slots = args.slots ? slotsOf(args.slots) : c.fits.length ? c.fits : ranked.enrollment.slots
      if (!slots.length) throw new CommandError('Pick at least one weekly time for the offer.')
      const settings = await getSettings(tx)
      const now = new Date()
      const offer = await tx.offer.create({ data: { enrollment: { connect: { id: e.id } }, tutor: { connect: { id: c.tutorId } }, status: 'sent', openKey: e.id, payRate: c.payRate, proposedSlots: slots, sentAt: now, expiresAt: new Date(now.getTime() + settings.offerExpiryHours * HOUR), sentBy: { connect: { id: a.userId } }, createdBy: { connect: { id: a.userId } } } })
      await recordChange(tx, { type: 'Offer', id: offer.id, to: 'sent', actorId: a.userId, data: { tutorId: c.tutorId } })
      const tutorUser = await tx.tutor.findUnique({ where: { id: c.tutorId }, select: { user: { select: { email: true } } } })
      await queueEmail(tx, { to: tutorUser?.user?.email ?? '', template: 'offer_sent', subject: `New student offer: ${e.program.name}`, relatedType: 'Offer', relatedId: offer.id })
      return { id: offer.id, data: { offerId: offer.id, expiresAt: offer.expiresAt.toISOString() } }
    }),

    withdrawOffer: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'withdrawOffer', idempotencyKey: keyOf(args), input: { o: args.offerId } }, async (tx, actor) => {
      const o = await tx.offer.findUnique({ where: { id: String(args.offerId) }, select: { id: true, enrollment: { select: { locationId: true, family: { select: { primaryLocationId: true } } } } } })
      if (!o) throw new CommandError('That offer was not found.')
      requireFlag(actor, 'canManageTutors', o.enrollment?.locationId ?? o.enrollment?.family?.primaryLocationId)
      await transition(tx, actor, 'offer', 'Offer', o.id, 'sent', 'withdrawn', { openKey: null, respondedAt: new Date(), declineReason: optionalString(args.reason, 300) }, optionalString(args.reason, 300) || 'withdrawn')
      return { id: o.id, data: { status: 'withdrawn' } }
    }),

    respondToOffer: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'respondToOffer', idempotencyKey: keyOf(args), input: { o: args.offerId, a: Boolean(args.accept) } }, async (tx, actor) => {
      const a = requireActor(actor)
      if (!a.tutorId) throw new CommandError('Only the offered tutor can answer this offer.')
      const offer = await tx.offer.findUnique({ where: { id: String(args.offerId) }, select: { id: true, tutorId: true, status: true, enrollmentId: true } })
      if (!offer || offer.tutorId !== a.tutorId) throw new CommandError('That offer was not found.')
      await lockKey(tx, `enrol-match:${offer.enrollmentId}`)
      if (!args.accept) {
        await transition(tx, a, 'offer', 'Offer', offer.id, 'sent', 'declined', { openKey: null, respondedAt: new Date(), declineReason: optionalString(args.reason, 300) }, 'declined')
        await tx.task.upsert({ where: { openKey: `offer-declined:${offer.enrollmentId}` }, create: { kind: 'manual', title: 'Offer declined: send the next candidate', relatedType: 'Enrollment', relatedId: offer.enrollmentId, dueAt: new Date(), openKey: `offer-declined:${offer.enrollmentId}` }, update: {} })
        return { id: offer.id, data: { status: 'declined' } }
      }
      const r: any = await acceptOffer(tx, offer.id, a.tutorId)
      if (r.refusal) return { id: offer.id, refusal: r.refusal, data: { status: 'expired' } }
      const seats = await bookFixedSeats(tx, r.enrollmentId, new Date(), new Date(Date.now() + 28 * DAY))
      const e = await tx.enrollment.findUnique({ where: { id: r.enrollmentId }, select: { family: { select: { billingEmail: true } } } })
      await queueEmail(tx, { to: e?.family?.billingEmail ?? '', template: 'tutor_matched', subject: 'We have matched a tutor: your first session is a trial', relatedType: 'Enrollment', relatedId: r.enrollmentId })
      await queueEmail(tx, { to: a.email, template: 'offer_accepted', subject: 'You accepted a new student', relatedType: 'Offer', relatedId: offer.id })
      return { id: offer.id, data: { status: 'accepted', ...r, bookedSeats: seats.booked, missedSeats: seats.missed } }
    }),

    confirmTutor: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'confirmTutor', idempotencyKey: keyOf(args), input: { e: args.enrollmentId } }, async (tx, actor) => {
      const e = await tx.enrollment.findUnique({ where: { id: String(args.enrollmentId) }, select: { id: true, familyId: true, status: true } })
      if (!e) throw new CommandError('That enrolment was not found.')
      await requireGuardianOf(tx, actor, e.familyId)
      await lockKey(tx, `enrol-match:${e.id}`)
      if (e.status === 'active') return { id: e.id, data: { status: 'active' } }
      const r = await confirmMatch(tx, e.id, actor!.userId, 'guardian kept the tutor')
      return { id: e.id, data: { status: 'active', invoiceId: r.invoiceId } }
    }),

    /** Re-match: back to pending_match; first free (trial not charged, setting); the tutor's future seats released. */
    requestRematch: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'requestRematch', idempotencyKey: keyOf(args), input: { e: args.enrollmentId } }, async (tx, actor) => {
      const e = await tx.enrollment.findUnique({ where: { id: String(args.enrollmentId) }, select: { id: true, familyId: true, status: true, tutorId: true, rematchCount: true, locationId: true, preferredTimes: true } })
      if (!e) throw new CommandError('That enrolment was not found.')
      if (!canAt(actor, 'canManageTutors', e.locationId)) await requireGuardianOf(tx, actor, e.familyId)
      await lockKey(tx, `enrol-match:${e.id}`)
      if (!['matched', 'active'].includes(e.status) || !e.tutorId) throw new CommandError('This enrolment has no tutor to change.')
      const reason = requireString(args.reason, 'Reason', 500)
      const settings = await getSettings(tx)
      const free = (e.rematchCount ?? 0) < settings.freeRematches
      await tx.enrollment.update({ where: { id: e.id }, data: { status: 'pending_match', tutorId: null, rematchCount: (e.rematchCount ?? 0) + 1, tutorConfirmedAt: null, trialAttendedAt: null, preferredTimes: { ...((e.preferredTimes ?? {}) as any), seriesIds: [] } } })
      await recordChange(tx, { type: 'Enrollment', id: e.id, from: e.status, to: 'pending_match', actorId: actor!.userId, reason: 'rematch requested', data: { tutorId: e.tutorId, note: reason, free } })
      // End this tutor's series for the enrolment; future sessions cancelled with credit back.
      const series = await tx.sessionSeries.findMany({ where: { enrollmentId: e.id, status: 'active' }, select: { id: true } })
      let released = 0
      for (const s of series) {
        await tx.sessionSeries.update({ where: { id: s.id }, data: { status: 'ended', endDate: new Date() } })
        const sessions = await tx.session.findMany({ where: { seriesId: s.id, status: { in: ['scheduled', 'needs_cover'] }, startsAt: { gt: new Date() } }, select: { id: true, bookings: { where: { status: 'booked' }, select: { id: true } } } })
        for (const sess of sessions) {
          for (const b of sess.bookings) { await cancelSeat(tx, null, b.id, { byCentre: true, reason: 'Re-match' }); released += 1 }
          await tx.session.update({ where: { id: sess.id }, data: { status: 'cancelled', cancelReason: 'other: re-match' } })
        }
      }
      // A free re-match does not charge the trial (D-setting trialChargedOnRematch).
      if (free && !settings.trialChargedOnRematch) {
        const trial = await tx.booking.findFirst({ where: { enrollmentId: e.id, session: { isTrial: true }, status: { in: ['attended', 'late', 'no_show', 'cancelled_late', 'cancelled_late_excused'] } }, select: { id: true, creditGrantId: true, minutes: true } })
        if (trial?.creditGrantId) {
          const { adjustGrant } = await import('../lib/ledger')
          await adjustGrant(tx, trial.creditGrantId, trial.minutes, actor!.userId, 'Trial not charged (free re-match)')
        }
      }
      await tx.task.upsert({ where: { openKey: `rematch:${e.id}` }, create: { kind: 'rematch_requested', title: 'Re-match requested', family: { connect: { id: e.familyId } }, relatedType: 'Enrollment', relatedId: e.id, dueAt: new Date(), openKey: `rematch:${e.id}`, outcomeNote: reason }, update: {} })
      return { id: e.id, data: { status: 'pending_match', free, released } }
    }),

    /** Front desk enrol a family by phone (§6.4 enrolments): same checkout, invoice left open for the front desk to take payment. */
    createEnrolmentForFamily: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'createEnrolmentForFamily', idempotencyKey: keyOf(args), input: args.data }, async (tx, actor) => {
      const d = args.data ?? {}
      const family = await tx.family.findUnique({ where: { id: requireString(d.familyId, 'Family') }, select: { id: true, primaryLocationId: true } })
      if (!family) throw new CommandError('That family was not found.')
      const a = requireFlag(actor, 'canManageFamilies', d.locationId ?? family.primaryLocationId)
      requireFlag(a, 'canManageBilling', d.locationId ?? family.primaryLocationId)
      const c = await buildCheckout(tx, {
        familyId: family.id, studentId: requireString(d.studentId, 'Student'), programId: requireString(d.programId, 'Programme'), planId: d.planId ? String(d.planId) : null, packageId: d.packageId ? String(d.packageId) : null,
        locationId: d.locationId ? String(d.locationId) : null, mode: String(d.mode ?? 'in_centre'), seriesIds: Array.isArray(d.seriesIds) ? d.seriesIds.map(String) : [], promoCode: d.promoCode ?? null,
        learningPlanId: d.learningPlanId ? String(d.learningPlanId) : null, homeAddress: optionalString(d.homeAddress, 300), preferredTimes: optionalString(d.preferredTimes, 500), actorId: a.userId,
      })
      if (Array.isArray(d.slots)) {
        const e = await tx.enrollment.findUnique({ where: { id: c.enrollmentId }, select: { preferredTimes: true } })
        await tx.enrollment.update({ where: { id: c.enrollmentId }, data: { preferredTimes: { ...((e.preferredTimes ?? {}) as any), slots: slotsOf(d.slots) } } })
      }
      return { id: c.enrollmentId, data: { enrollmentId: c.enrollmentId, invoiceId: c.invoice.id, invoiceNumber: c.invoice.number, total: c.invoice.total } }
    }),

    setTutorStatus: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'setTutorStatus', idempotencyKey: keyOf(args), input: { t: args.tutorId, s: args.status } }, async (tx, actor) => {
      const a = requireFlag(actor, 'canManageTutors')
      const t = await tx.tutor.findUnique({ where: { id: String(args.tutorId) }, select: { id: true, status: true, userId: true } })
      if (!t) throw new CommandError('That tutor was not found.')
      const allowed: Record<string, string[]> = { onboarding: ['active', 'inactive'], active: ['paused', 'inactive'], paused: ['active', 'inactive'], inactive: ['active'] }
      if (!(allowed[t.status] ?? []).includes(args.status)) throw new CommandError(`A tutor who is ${t.status} cannot move to ${args.status}.`)
      if (args.status === 'active') {
        const check = await tx.tutorCredential.count({ where: { tutorId: t.id, kind: 'background_check', status: 'verified', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })
        if (!check) throw new CommandError('Verify a current background check before making the tutor active.')
      }
      await transition(tx, a, 'tutor', 'Tutor', t.id, t.status, args.status, {}, optionalString(args.reason, 300) || undefined)
      // Pausing or leaving withdraws open offers; future sessions go to needs_cover only if staff choose (§4.11).
      await tx.offer.updateMany({ where: { tutorId: t.id, status: 'sent' }, data: args.status === 'active' ? {} : { status: 'withdrawn', openKey: null, declineReason: `Tutor ${args.status}` } })
      let covered = 0
      if (args.status !== 'active' && args.coverSessions) {
        const r = await tx.session.updateMany({ where: { tutorId: t.id, status: 'scheduled', startsAt: { gt: new Date() } }, data: { status: 'needs_cover' } })
        covered = r.count
      }
      return { id: t.id, data: { status: args.status, sessionsNeedingCover: covered } }
    }),

    verifyCredential: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'verifyCredential', idempotencyKey: keyOf(args), input: { c: args.credentialId, d: args.decision } }, async (tx, actor) => {
      const a = requireFlag(actor, 'canManageTutors')
      const c = await tx.tutorCredential.findUnique({ where: { id: String(args.credentialId) }, select: { id: true, status: true, expiresAt: true } })
      if (!c) throw new CommandError('That credential was not found.')
      if (!['verified', 'rejected'].includes(args.decision)) throw new CommandError('Verify or reject.')
      const expiresAt = args.expiresAt ? requireDate(args.expiresAt, 'Expiry') : c.expiresAt
      if (args.decision === 'verified' && expiresAt && expiresAt <= new Date()) throw new CommandError('That credential has already expired.')
      await transition(tx, a, 'tutorCredential', 'TutorCredential', c.id, ['pending', 'expired', 'rejected', 'verified'], args.decision, { verifiedById: a.userId, verifiedAt: new Date(), expiresAt })
      return { id: c.id, data: { status: args.decision } }
    }),

    requestTimeOff: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'requestTimeOff', idempotencyKey: keyOf(args), input: { s: args.startsAt, e: args.endsAt } }, async (tx, actor) => {
      const a = requireActor(actor)
      if (!a.tutorId) throw new CommandError('Only tutors can request time off.')
      const startsAt = requireDate(args.startsAt, 'Start')
      const endsAt = requireDate(args.endsAt, 'End')
      if (endsAt <= startsAt) throw new CommandError('The end must be after the start.')
      const t = await tx.tutorTimeOff.create({ data: { tutor: { connect: { id: a.tutorId } }, startsAt, endsAt, reason: optionalString(args.reason, 300), status: 'requested', createdBy: { connect: { id: a.userId } } } })
      await recordChange(tx, { type: 'TutorTimeOff', id: t.id, to: 'requested', actorId: a.userId })
      const clashes = await tx.session.count({ where: { tutorId: a.tutorId, status: 'scheduled', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })
      return { id: t.id, data: { timeOffId: t.id, sessionsAffected: clashes } }
    }),

    decideTimeOff: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'decideTimeOff', idempotencyKey: keyOf(args), input: { t: args.timeOffId, a: Boolean(args.approve) } }, async (tx, actor) => {
      const a = requireFlag(actor, 'canManageTutors')
      const t = await tx.tutorTimeOff.findUnique({ where: { id: String(args.timeOffId) }, select: { id: true, tutorId: true, startsAt: true, endsAt: true } })
      if (!t) throw new CommandError('That request was not found.')
      const to = args.approve ? 'approved' : 'declined'
      await transition(tx, a, 'tutorTimeOff', 'TutorTimeOff', t.id, 'requested', to)
      let needsCover = 0
      if (args.approve) {
        const r = await tx.session.updateMany({ where: { tutorId: t.tutorId, status: 'scheduled', startsAt: { lt: t.endsAt }, endsAt: { gt: t.startsAt } }, data: { status: 'needs_cover' } })
        needsCover = r.count
      }
      return { id: t.id, data: { status: to, sessionsNeedingCover: needsCover } }
    }),

    /** Staff add an applicant (§6.3: recruiting is staff work). */
    createTutorApplication: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'createTutorApplication', idempotencyKey: keyOf(args), input: args.data }, async (tx, actor) => {
      const a = requireFlag(actor, 'canManageTutors')
      const d = args.data ?? {}
      const email = requireString(d.email, 'Email', 200).toLowerCase()
      if (!EMAIL.test(email)) throw new CommandError('Enter a valid email address.')
      const open = await tx.tutorApplication.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, status: { in: ['applied', 'screening', 'interview', 'checks'] } }, select: { id: true } })
      if (open) throw new CommandError('This person already has an open application.')
      const modes = Array.isArray(d.modes) ? d.modes.filter((m: string) => ['in_centre', 'online', 'in_home'].includes(m)) : []
      const refs = Array.isArray(d.references) ? d.references.slice(0, 4).map((r: any) => ({ name: requireString(r?.name, 'Reference name', 120), contact: optionalString(r?.contact, 200), relation: optionalString(r?.relation, 120) })) : []
      const app = await tx.tutorApplication.create({
        data: {
          name: requireString(d.name, 'Name', 120), email, phone: optionalString(d.phone, 40), subjectsText: optionalString(d.subjectsText, 500), levels: optionalString(d.levels, 300), modes, areas: optionalString(d.areas, 300),
          availability: d.availability ?? null, references: refs, coverNote: optionalString(d.coverNote, 4000), source: optionalString(d.source, 60) || 'email', status: 'applied', notes: optionalString(d.notes, 4000),
          ...(Array.isArray(d.subjectIds) && d.subjectIds.length ? { subjects: { connect: d.subjectIds.slice(0, 20).map((id: string) => ({ id: String(id) })) } } : {}),
          reviewer: { connect: { id: a.userId } }, createdBy: { connect: { id: a.userId } },
        },
      })
      await recordChange(tx, { type: 'TutorApplication', id: app.id, to: 'applied', actorId: a.userId })
      return { id: app.id, data: { applicationId: app.id } }
    }),

    transitionApplication: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'transitionApplication', idempotencyKey: keyOf(args), input: { a: args.applicationId, s: args.status } }, async (tx, actor) => {
      const a = requireFlag(actor, 'canManageTutors')
      const app = await tx.tutorApplication.findUnique({ where: { id: String(args.applicationId) }, select: { id: true, status: true, notes: true } })
      if (!app) throw new CommandError('That application was not found.')
      const next: Record<string, string[]> = { applied: ['screening', 'rejected', 'withdrawn'], screening: ['interview', 'rejected', 'withdrawn'], interview: ['checks', 'rejected', 'withdrawn'], checks: ['rejected', 'withdrawn'] }
      if (args.status === 'approved') throw new CommandError('Use “Approve” to create the tutor.')
      if (!(next[app.status] ?? []).includes(args.status)) throw new CommandError(`An application in ${app.status} cannot move to ${args.status}.`)
      const note = optionalString(args.note, 2000)
      await transition(tx, a, 'tutorApplication', 'TutorApplication', app.id, app.status, args.status, { reviewerId: a.userId, ...(note ? { notes: [app.notes, `${new Date().toISOString().slice(0, 10)} ${args.status}: ${note}`].filter(Boolean).join('\n') } : {}) }, note || undefined)
      return { id: app.id, data: { status: args.status } }
    }),

    /** Approve: a Tutor and a tutor User (W9.3); the tutor gets a set-password email. */
    approveApplication: async (_: unknown, args: any, context: Ctx) => {
      let email = ''
      const r = await runCommand(context, { name: 'approveApplication', idempotencyKey: keyOf(args), input: { a: args.applicationId } }, async (tx, actor) => {
        const a = requireFlag(actor, 'canManageTutors')
        const app = await tx.tutorApplication.findUnique({ where: { id: String(args.applicationId) }, include: { subjects: { select: { id: true } } } })
        if (!app) throw new CommandError('That application was not found.')
        if (app.status !== 'checks') throw new CommandError('Finish the checks stage before approving.')
        const d = args.data ?? {}
        email = app.email.toLowerCase()
        await lockKey(tx, `signup:${email}`)
        const tutorRole = await tx.role.findFirst({ where: { isTutor: true, canManageSettings: false }, orderBy: { createdAt: 'asc' }, select: { id: true } })
        if (!tutorRole) throw new CommandError('Create a Tutor role first (Settings → Roles).')
        let user = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, tutor: { select: { id: true } }, role: { select: { canAccessDashboard: true } } } })
        if (user?.tutor) throw new CommandError('This person is already a tutor.')
        if (user && user.role?.canAccessDashboard) throw new CommandError('This email belongs to a staff account. Use another email.')
        if (!user) user = await tx.user.create({ data: { name: app.name, email, phone: app.phone, password: randomBytes(24).toString('base64url'), role: { connect: { id: tutorRole.id } } }, select: { id: true, tutor: { select: { id: true } }, role: { select: { canAccessDashboard: true } } } })
        else await tx.user.update({ where: { id: user.id }, data: { role: { connect: { id: tutorRole.id } } } })
        const base = app.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'tutor'
        const slug = (await tx.tutor.count({ where: { slug: base } })) ? `${base}-${randomBytes(2).toString('hex')}` : base
        const tutor = await tx.tutor.create({
          data: {
            user: { connect: { id: user.id } }, displayName: app.name, slug, status: 'onboarding', deliveryModes: Array.isArray(app.modes) ? app.modes : [], travelAreas: app.areas,
            defaultPayRate: d.defaultPayRate ? requireInt(d.defaultPayRate, 'Pay rate', 0, 100000) : 0, employmentType: d.employmentType === 'employee' ? 'employee' : 'contractor',
            application: { connect: { id: app.id } }, createdBy: { connect: { id: a.userId } },
            ...(Array.isArray(d.locationIds) && d.locationIds.length ? { locations: { connect: d.locationIds.map((id: string) => ({ id: String(id) })) } } : {}),
          },
        })
        for (const s of app.subjects) await tx.tutorSubject.create({ data: { tutor: { connect: { id: tutor.id } }, subject: { connect: { id: s.id } } } })
        for (const lid of Array.isArray(d.locationIds) ? d.locationIds : []) await tx.locationMembership.create({ data: { user: { connect: { id: user.id } }, location: { connect: { id: String(lid) } }, role: 'tutor' } }).catch(() => {})
        await transition(tx, a, 'tutorApplication', 'TutorApplication', app.id, 'checks', 'approved', { reviewerId: a.userId })
        await recordChange(tx, { type: 'Tutor', id: tutor.id, to: 'onboarding', actorId: a.userId, reason: 'application approved' })
        return { id: tutor.id, data: { tutorId: tutor.id, userId: user.id } }
      })
      if (r.success) {
        try { await context.sudo().graphql.run({ query: 'mutation($e: String!) { sendUserPasswordResetLink(email: $e) }', variables: { e: email } }) } catch (error) { console.error('approveApplication: set-password link not sent', (error as Error)?.message) }
      }
      return r
    },
  },
}
