/**
 * The booking transaction (§4.7), adapted from Gym classCapacity (row lock + count)
 * and Barbershop createOnlineBooking (overlap check). All functions run inside a
 * command transaction (`tx`).
 */
import { CommandError } from './errors'
import { recordChange } from './command'
import { debitHold, reserveMinutes, writeHold, pickGrant, releaseHold, createGrant, reverseClose, removeUnused, SEAT_STATUSES } from './ledger'
import { accruePay, payLocked, adjustmentLine, rateFor } from './pay'
import { createInvoice } from './invoices'
import { getSettings, DAY, HOUR } from './settings'
import type { Actor } from './actor'

export type Tx = any

const activeKeyFor = (sessionId: string, studentId: string) => `${sessionId}:${studentId}`

export async function lockSession(tx: Tx, sessionId: string) {
  const rows: Array<{ id: string }> = await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${sessionId} FOR UPDATE`
  if (!rows.length) throw new CommandError('That session was not found.')
}

export async function seatsTaken(tx: Tx, sessionId: string) {
  return tx.booking.count({ where: { sessionId, status: { in: [...SEAT_STATUSES] } } })
}

export type BookInput = {
  sessionId: string
  studentId: string
  source: 'fixed_seat' | 'self_booked' | 'staff' | 'make_up' | 'waitlist'
  /** When full: 'waitlist' adds a waitlist entry; 'reject' refuses. */
  whenFull?: 'waitlist' | 'reject'
}

export type BookResult = { kind: 'booked'; bookingId: string; grantId: string | null; payAsYouGo: boolean; invoiceId: string | null } | { kind: 'waitlisted'; waitlistEntryId: string; position: number }

export async function bookSeat(tx: Tx, actor: Actor | null, input: BookInput): Promise<BookResult> {
  // 1. lock the session row; count active bookings
  await lockSession(tx, input.sessionId)
  const session = await tx.session.findUnique({
    where: { id: input.sessionId },
    include: { program: { select: { id: true, name: true, payAsYouGoPrice: true, format: true } }, location: { select: { id: true } } },
  })
  if (!session || !['scheduled', 'needs_cover'].includes(session.status)) throw new CommandError('That session is not open for booking.')
  if (session.startsAt.getTime() <= Date.now()) throw new CommandError('That session has already started.')
  const student = await tx.student.findUnique({ where: { id: input.studentId }, select: { id: true, familyId: true, firstName: true, status: true } })
  if (!student?.familyId) throw new CommandError('That student was not found.')
  const existing = await tx.booking.findUnique({ where: { activeKey: activeKeyFor(session.id, student.id) }, select: { id: true } })
  if (existing) throw new CommandError(`${student.firstName} is already booked on this session.`)

  const taken = await seatsTaken(tx, session.id)
  if (taken >= session.capacity) {
    if (input.whenFull !== 'waitlist') throw new CommandError('That session is full.')
    return joinWaitlistInTx(tx, actor, session.id, student.id, student.familyId)
  }
  // 2. no overlapping active booking for the student
  const overlap = await tx.booking.findFirst({
    where: { studentId: student.id, status: { in: ['booked'] }, startsAt: { lt: session.endsAt }, endsAt: { gt: session.startsAt } },
    select: { id: true },
  })
  if (overlap) throw new CommandError(`${student.firstName} already has a session at that time.`)

  const minutes = Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60000)
  const enrollment = await tx.enrollment.findFirst({
    where: { studentId: student.id, programId: session.programId, status: { in: ['active', 'matched'] } },
    select: { id: true }, orderBy: { createdAt: 'desc' },
  })
  // 3. funding
  const grant = await pickGrant(tx, { familyId: student.familyId, studentId: student.id, programId: session.programId, minutes, startsAt: session.startsAt })
  let payAsYouGo = false
  if (!grant) {
    const family = await tx.family.findUnique({ where: { id: student.familyId }, select: { payAsYouGoAllowed: true } })
    if (!family?.payAsYouGoAllowed || !session.program?.payAsYouGoPrice) throw new CommandError('Not enough credit for this session.')
    payAsYouGo = true
  }
  // 4. guarded decrement before any insert, so a refusal leaves nothing behind
  if (grant) await reserveMinutes(tx, grant, minutes, session.startsAt)
  // 5. insert the booking (unique active key stops duplicates)
  const booking = await tx.booking.create({
    data: {
      session: { connect: { id: session.id } },
      student: { connect: { id: student.id } },
      family: { connect: { id: student.familyId } },
      ...(enrollment ? { enrollment: { connect: { id: enrollment.id } } } : {}),
      ...(grant ? { creditGrant: { connect: { id: grant.id } } } : {}),
      ...(actor ? { createdBy: { connect: { id: actor.userId } } } : {}),
      status: 'booked', activeKey: activeKeyFor(session.id, student.id), source: grant?.kind === 'make_up' ? 'make_up' : input.source,
      payAsYouGo, minutes, startsAt: session.startsAt, endsAt: session.endsAt,
    },
  })
  let invoiceId: string | null = null
  if (grant) await writeHold(tx, grant, booking.id, minutes, actor?.userId)
  else {
    const invoice = await createInvoice(tx, {
      familyId: student.familyId, locationId: session.locationId, kind: 'pay_as_you_go', actorId: actor?.userId,
      lines: [{ description: `${session.program?.name ?? 'Session'} (${session.startsAt.toISOString().slice(0, 10)})`, kind: 'pay_as_you_go', unitAmount: session.program!.payAsYouGoPrice, studentId: student.id, programId: session.programId, bookingId: booking.id }],
      dueAt: session.startsAt,
    })
    invoiceId = invoice.id
    await tx.booking.update({ where: { id: booking.id }, data: { invoice: { connect: { id: invoice.id } } } })
  }
  await recordChange(tx, { type: 'Booking', id: booking.id, from: null, to: 'booked', actorId: actor?.userId, data: { sessionId: session.id, grantId: grant?.id ?? null, payAsYouGo } })
  return { kind: 'booked', bookingId: booking.id, grantId: grant?.id ?? null, payAsYouGo, invoiceId }
}

export async function joinWaitlistInTx(tx: Tx, actor: Actor | null, sessionId: string, studentId: string, familyId: string): Promise<BookResult> {
  const key = activeKeyFor(sessionId, studentId)
  const existing = await tx.waitlistEntry.findUnique({ where: { activeKey: key }, select: { id: true, position: true } })
  if (existing) return { kind: 'waitlisted', waitlistEntryId: existing.id, position: existing.position }
  const last = await tx.waitlistEntry.aggregate({ where: { sessionId }, _max: { position: true } })
  const position = (last._max.position ?? 0) + 1
  const entry = await tx.waitlistEntry.create({
    data: { session: { connect: { id: sessionId } }, student: { connect: { id: studentId } }, family: { connect: { id: familyId } }, status: 'waiting', activeKey: key, position, ...(actor ? { createdBy: { connect: { id: actor.userId } } } : {}) },
  })
  await recordChange(tx, { type: 'WaitlistEntry', id: entry.id, to: 'waiting', actorId: actor?.userId })
  return { kind: 'waitlisted', waitlistEntryId: entry.id, position }
}

/** §4.14: promote waiting entries in created order, in the same transaction that freed the seat. */
export async function promoteWaitlist(tx: Tx, sessionId: string) {
  const session = await tx.session.findUnique({ where: { id: sessionId }, select: { capacity: true, startsAt: true, status: true } })
  if (!session || !['scheduled', 'needs_cover'].includes(session.status) || session.startsAt.getTime() <= Date.now()) return []
  const promoted: string[] = []
  const waiting = await tx.waitlistEntry.findMany({ where: { sessionId, status: 'waiting' }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] })
  for (const w of waiting) {
    if ((await seatsTaken(tx, sessionId)) >= session.capacity) break
    // Funding and overlap are checked first; bookSeat refuses before writing anything.
    try {
      const result = await bookSeatIfFundable(tx, sessionId, w.studentId)
      if (!result) continue
      await tx.waitlistEntry.updateMany({ where: { id: w.id, status: 'waiting' }, data: { status: 'promoted', activeKey: null, promotedAt: new Date(), bookingId: result } })
      await recordChange(tx, { type: 'WaitlistEntry', id: w.id, from: 'waiting', to: 'promoted', data: { bookingId: result } })
      promoted.push(result)
    } catch (error) {
      if (error instanceof CommandError) continue
      throw error
    }
  }
  return promoted
}

async function bookSeatIfFundable(tx: Tx, sessionId: string, studentId: string) {
  const session = await tx.session.findUnique({ where: { id: sessionId }, select: { programId: true, startsAt: true, endsAt: true, program: { select: { payAsYouGoPrice: true } } } })
  const student = await tx.student.findUnique({ where: { id: studentId }, select: { familyId: true, family: { select: { payAsYouGoAllowed: true } } } })
  const minutes = Math.round((session.endsAt - session.startsAt) / 60000)
  const overlap = await tx.booking.findFirst({ where: { studentId, status: 'booked', startsAt: { lt: session.endsAt }, endsAt: { gt: session.startsAt } }, select: { id: true } })
  if (overlap) return null
  const grant = await pickGrant(tx, { familyId: student.familyId, studentId, programId: session.programId, minutes, startsAt: session.startsAt })
  if (!grant && !(student.family?.payAsYouGoAllowed && session.program?.payAsYouGoPrice)) return null
  const r = await bookSeat(tx, null, { sessionId, studentId, source: 'waitlist', whenFull: 'reject' })
  return r.kind === 'booked' ? r.bookingId : null
}

export type CancelPreview = {
  outcome: 'cancelled_early' | 'cancelled_late' | 'cancelled_late_excused'
  hoursBefore: number
  windowHours: number
  creditReturned: boolean
  makeUpGranted: boolean
  makeUpExpiresAt: string | null
  excusedLeftThisMonth: number
  message: string
}

/** The live policy preview (§6.2 A6). `excused` asks for the monthly excused absence. */
export async function previewCancel(tx: Tx, booking: any, excused: boolean): Promise<CancelPreview> {
  const settings = await getSettings(tx)
  const hoursBefore = (booking.startsAt.getTime() - Date.now()) / HOUR
  const monthStart = new Date(booking.startsAt.getFullYear(), booking.startsAt.getMonth(), 1)
  const monthEnd = new Date(booking.startsAt.getFullYear(), booking.startsAt.getMonth() + 1, 1)
  const used = await tx.booking.count({ where: { studentId: booking.studentId, status: 'cancelled_late_excused', startsAt: { gte: monthStart, lt: monthEnd } } })
  const left = Math.max(0, settings.excusedAbsencesPerMonth - used)
  const base = { hoursBefore: Math.round(hoursBefore * 10) / 10, windowHours: settings.cancellationWindowHours, excusedLeftThisMonth: left }
  if (hoursBefore >= settings.cancellationWindowHours || !settings.lateCancelCharged) {
    return { ...base, outcome: hoursBefore >= settings.cancellationWindowHours ? 'cancelled_early' : 'cancelled_late', creditReturned: true, makeUpGranted: false, makeUpExpiresAt: null, message: 'Cancelling now returns the credit.' }
  }
  if (excused && left > 0 && !booking.payAsYouGo) {
    const exp = new Date(Date.now() + settings.makeUpExpiryDays * DAY)
    return { ...base, outcome: 'cancelled_late_excused', creditReturned: false, makeUpGranted: true, makeUpExpiresAt: exp.toISOString(), message: `This is inside ${settings.cancellationWindowHours} hours. The session is charged, and a make-up credit valid for ${settings.makeUpExpiryDays} days is added.` }
  }
  return { ...base, outcome: 'cancelled_late', creditReturned: false, makeUpGranted: false, makeUpExpiresAt: null, message: `This is inside ${settings.cancellationWindowHours} hours, so the session is charged.` }
}

export async function cancelSeat(tx: Tx, actor: Actor | null, bookingId: string, opts: { excused?: boolean; byCentre?: boolean; reason?: string } = {}) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { session: { select: { id: true, programId: true, status: true } } } })
  if (!booking) throw new CommandError('That booking was not found.')
  await lockSession(tx, booking.sessionId)
  if (booking.status !== 'booked') throw new CommandError(`This booking is already ${booking.status.replace(/_/g, ' ')}.`)
  let outcome: string
  let preview: CancelPreview | null = null
  if (opts.byCentre) outcome = 'cancelled_by_centre'
  else {
    if (booking.startsAt.getTime() <= Date.now()) throw new CommandError('This session has started; ask the centre to mark attendance.')
    preview = await previewCancel(tx, booking, Boolean(opts.excused))
    outcome = preview.outcome
  }
  const res = await tx.booking.updateMany({ where: { id: booking.id, status: 'booked' }, data: { status: outcome, activeKey: null, cancelledAt: new Date(), lateReason: opts.reason ?? '', ...(actor ? { cancelledById: actor.userId } : {}) } })
  if (res.count !== 1) throw new CommandError('This booking was changed by someone else. Reload and try again.')
  await recordChange(tx, { type: 'Booking', id: booking.id, from: 'booked', to: outcome, actorId: actor?.userId, reason: opts.reason })

  if (preview?.creditReturned || outcome === 'cancelled_by_centre' || outcome === 'cancelled_early') {
    await releaseHold(tx, booking.id, actor?.userId, outcome)
    if (booking.payAsYouGo && booking.invoiceId) await voidUnpaidInvoice(tx, booking.invoiceId, actor, 'Booking cancelled in time')
  } else {
    await debitHold(tx, booking.id, actor?.userId, outcome)
  }
  if (outcome === 'cancelled_late_excused') {
    const settings = await getSettings(tx)
    await createGrant(tx, {
      familyId: booking.familyId, studentId: booking.studentId, programId: booking.session.programId, kind: 'make_up', minutes: booking.minutes,
      expiresAt: new Date(Date.now() + settings.makeUpExpiryDays * DAY), sourceBookingId: booking.id, note: 'Make-up for an excused late cancel', actorId: actor?.userId,
    })
  }
  if (outcome !== 'cancelled_by_centre') await accruePay(tx, booking.sessionId)
  const promoted = await promoteWaitlist(tx, booking.sessionId)
  return { outcome, preview, promoted }
}

export async function voidUnpaidInvoice(tx: Tx, invoiceId: string, actor: Actor | null, reason: string) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, amountPaid: true } })
  if (!inv || inv.amountPaid > 0 || !['open', 'draft'].includes(inv.status)) return false
  const r = await tx.invoice.updateMany({ where: { id: invoiceId, status: inv.status, amountPaid: 0 }, data: { status: 'void' } })
  if (r.count === 1) await recordChange(tx, { type: 'Invoice', id: invoiceId, from: inv.status, to: 'void', actorId: actor?.userId, reason })
  return r.count === 1
}

export const ATTENDANCE_OUTCOMES = ['attended', 'late', 'no_show', 'cancelled_late', 'cancelled_late_excused'] as const

/** Mark one booking (§4.7 attend / no-show / late cancel). Caller checks who may mark. */
export async function markSeat(tx: Tx, actor: Actor, bookingId: string, outcome: typeof ATTENDANCE_OUTCOMES[number]) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { session: { select: { id: true, programId: true } } } })
  if (!booking) throw new CommandError('That booking was not found.')
  await lockSession(tx, booking.sessionId)
  if (booking.status !== 'booked') throw new CommandError(`Attendance is already marked (${booking.status.replace(/_/g, ' ')}). A manager can reopen it.`)
  const keepKey = outcome === 'attended' || outcome === 'late' || outcome === 'no_show'
  const res = await tx.booking.updateMany({ where: { id: booking.id, status: 'booked' }, data: { status: outcome, markedById: actor.userId, markedAt: new Date(), ...(keepKey ? {} : { activeKey: null }) } })
  if (res.count !== 1) throw new CommandError('This booking was changed by someone else. Reload and try again.')
  await recordChange(tx, { type: 'Booking', id: booking.id, from: 'booked', to: outcome, actorId: actor.userId })
  await debitHold(tx, booking.id, actor.userId, outcome)
  if (outcome === 'cancelled_late_excused') {
    const settings = await getSettings(tx)
    await createGrant(tx, { familyId: booking.familyId, studentId: booking.studentId, programId: booking.session.programId, kind: 'make_up', minutes: booking.minutes, expiresAt: new Date(Date.now() + settings.makeUpExpiryDays * DAY), sourceBookingId: booking.id, note: 'Make-up for an excused absence', actorId: actor.userId })
  }
  if (outcome === 'attended' || outcome === 'late') {
    if (booking.enrollmentId) await tx.enrollment.updateMany({ where: { id: booking.enrollmentId, trialAttendedAt: null, status: 'matched' }, data: { trialAttendedAt: new Date() } })
    await tx.student.updateMany({ where: { id: booking.studentId, status: 'prospect' }, data: { status: 'active' } })
  }
  await accruePay(tx, booking.sessionId)
  await completeSessionIfDone(tx, booking.sessionId, actor)
}

export async function completeSessionIfDone(tx: Tx, sessionId: string, actor: Actor | null) {
  const open = await tx.booking.count({ where: { sessionId, status: 'booked' } })
  if (open > 0) return false
  const s = await tx.session.findUnique({ where: { id: sessionId }, select: { status: true, startsAt: true } })
  if (!s || !['scheduled', 'in_progress', 'needs_cover'].includes(s.status) || s.startsAt.getTime() > Date.now() + 15 * 60000) return false
  const r = await tx.session.updateMany({ where: { id: sessionId, status: s.status }, data: { status: 'completed' } })
  if (r.count === 1) await recordChange(tx, { type: 'Session', id: sessionId, from: s.status, to: 'completed', actorId: actor?.userId })
  return true
}

/**
 * Manager correction (§4.7): reopen a final booking within the window. Writes reversing
 * ledger entries and voids/recreates the pay line. When the pay is in an approved run,
 * the reopen is refused and an adjustment line goes to the next run instead.
 */
export async function reopenSeat(tx: Tx, actor: Actor, bookingId: string, correctedStatus: string | null, reason: string) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { session: { select: { id: true, tutorId: true, subjectId: true, status: true, program: { select: { format: true } } } }, makeUpGrant: { select: { id: true, minutesGranted: true, minutesAvailable: true } } } })
  if (!booking) throw new CommandError('That booking was not found.')
  await lockSession(tx, booking.sessionId)
  const settings = await getSettings(tx)
  const final = ['attended', 'late', 'cancelled_early', 'cancelled_late', 'cancelled_late_excused', 'no_show', 'cancelled_by_centre']
  if (!final.includes(booking.status)) throw new CommandError('Only a marked or cancelled booking can be reopened.')
  if (booking.startsAt.getTime() < Date.now() - settings.reopenWindowDays * DAY) throw new CommandError(`Bookings can be reopened for ${settings.reopenWindowDays} days.`)

  if (await payLocked(tx, booking)) {
    // Refused; the pay difference goes to the next run as an adjustment.
    let delta = 0
    if (booking.session.tutorId && correctedStatus) {
      const rate = await rateFor(tx, booking.session.tutorId, booking.session.subjectId)
      const pct = (s: string) => (s === 'attended' || s === 'late' ? 100 : s.startsWith('cancelled_late') ? (settings.lateCancelCharged ? settings.tutorPaidOnLateCancelPercent : 0) : s === 'no_show' ? (settings.noShowCharged ? settings.tutorPaidOnNoShowPercent : 0) : 0)
      delta = Math.round((rate * booking.minutes * (pct(correctedStatus) - pct(booking.status))) / 6000)
    }
    let lineId: string | null = null
    if (delta !== 0 && booking.session.tutorId) {
      const line = await adjustmentLine(tx, { tutorId: booking.session.tutorId, sessionId: booking.sessionId, amount: delta, note: `Correction for booking ${booking.id}: ${booking.status} → ${correctedStatus}. ${reason}`.trim(), actorId: actor.userId })
      lineId = line.id
    }
    await recordChange(tx, { type: 'Booking', id: booking.id, from: booking.status, to: booking.status, actorId: actor.userId, reason: 'reopen refused: pay approved', data: { adjustmentLineId: lineId, correctedStatus } })
    return { reopened: false, adjustmentLineId: lineId }
  }

  if (booking.status === 'cancelled_late_excused' && booking.makeUpGrant) {
    if (booking.makeUpGrant.minutesAvailable < booking.makeUpGrant.minutesGranted) throw new CommandError('The make-up credit from this booking has been used, so it cannot be reopened.')
    await removeUnused(tx, booking.makeUpGrant.id, 'adjustment', 'voided', actor.userId, 'Booking reopened')
    await tx.booking.update({ where: { id: booking.id }, data: { makeUpGrant: { disconnect: true } } })
  }
  await reverseClose(tx, booking.id, actor.userId)
  const r = await tx.booking.updateMany({ where: { id: booking.id, status: booking.status }, data: { status: 'booked', activeKey: activeKeyFor(booking.sessionId, booking.studentId), reopenedAt: new Date(), markedAt: null, markedById: null, cancelledAt: null, cancelledById: null } })
  if (r.count !== 1) throw new CommandError('This booking was changed by someone else. Reload and try again.')
  await recordChange(tx, { type: 'Booking', id: booking.id, from: booking.status, to: 'booked', actorId: actor.userId, reason: reason || 'reopened', data: { event: 'reopened' } })
  if (booking.session.status === 'completed') {
    await tx.session.updateMany({ where: { id: booking.sessionId, status: 'completed' }, data: { status: 'in_progress' } })
    await recordChange(tx, { type: 'Session', id: booking.sessionId, from: 'completed', to: 'in_progress', actorId: actor.userId, reason: 'booking reopened' })
  }
  await accruePay(tx, booking.sessionId)
  if (correctedStatus && (ATTENDANCE_OUTCOMES as readonly string[]).includes(correctedStatus)) await markSeat(tx, actor, booking.id, correctedStatus as any)
  return { reopened: true, adjustmentLineId: null }
}
