/**
 * Booking, attendance, schedule and waitlist commands (§4.6, §4.7, §4.14, §5.9).
 */
import { runCommand, transition, recordChange, requireString, optionalString, requireInt, requireDate } from '../lib/command'
import { CommandError } from '../lib/errors'
import { canAt, requireFlag, requireGuardianOf, type Actor } from '../lib/actor'
import { bookSeat, cancelSeat, markSeat, reopenSeat, previewCancel, promoteWaitlist, joinWaitlistInTx, lockSession, ATTENDANCE_OUTCOMES } from '../lib/booking'
import { releaseHold } from '../lib/ledger'
import { voidSessionPay } from '../lib/pay'
import { generateSessions, assertTutorFree } from '../lib/schedule'
import { getSettings, DAY, HOUR } from '../lib/settings'

const gql = String.raw

export const typeDefs = gql`
  type CommandResult {
    success: Boolean!
    error: String
    id: ID
    data: JSON
  }

  type CancellationPreview {
    outcome: String!
    hoursBefore: Float!
    windowHours: Int!
    creditReturned: Boolean!
    makeUpGranted: Boolean!
    makeUpExpiresAt: String
    excusedLeftThisMonth: Int!
    message: String!
  }

  type Query {
    cancellationPreview(bookingId: ID!, excused: Boolean): CancellationPreview
  }

  type Mutation {
    bookSession(sessionId: ID!, studentId: ID!, idempotencyKey: String): CommandResult!
    staffBookSession(sessionId: ID!, studentId: ID!, whenFull: String, idempotencyKey: String): CommandResult!
    cancelBooking(bookingId: ID!, excused: Boolean, reason: String, idempotencyKey: String): CommandResult!
    rescheduleBooking(bookingId: ID!, newSessionId: ID!, idempotencyKey: String): CommandResult!
    joinWaitlist(sessionId: ID!, studentId: ID!, idempotencyKey: String): CommandResult!
    leaveWaitlist(waitlistEntryId: ID!, idempotencyKey: String): CommandResult!
    markAttendance(bookingId: ID!, outcome: String!, idempotencyKey: String): CommandResult!
    reopenBooking(bookingId: ID!, correctedStatus: String, reason: String!, idempotencyKey: String): CommandResult!
    createSessionSeries(data: JSON!, idempotencyKey: String): CommandResult!
    ensureSessionsGenerated(seriesId: ID, weeks: Int, idempotencyKey: String): CommandResult!
    cancelSession(sessionId: ID!, reason: String!, note: String, idempotencyKey: String): CommandResult!
    markSessionNeedsCover(sessionId: ID!, idempotencyKey: String): CommandResult!
    assignSubstitute(sessionId: ID!, tutorId: ID!, idempotencyKey: String): CommandResult!
  }
`

type Ctx = any
const keyOf = (a: any) => (typeof a?.idempotencyKey === 'string' ? a.idempotencyKey : null)

async function sessionLocation(tx: any, sessionId: string) {
  const s = await tx.session.findUnique({ where: { id: sessionId }, select: { id: true, locationId: true, tutorId: true, startsAt: true, endsAt: true, status: true, programId: true } })
  if (!s) throw new CommandError('That session was not found.')
  return s
}

/** §4.7 Who: tutor on own session from 15 min before start to the edit window after; staff at the location. */
async function assertMayMark(tx: any, actor: Actor, booking: { sessionId: string }) {
  const s = await sessionLocation(tx, booking.sessionId)
  if (canAt(actor, 'canManageSchedule', s.locationId) || (canAt(actor, 'canMarkAttendance', s.locationId) && !actor.flags.isTutor)) return s
  if (actor.tutorId && s.tutorId === actor.tutorId) {
    const settings = await getSettings(tx)
    const now = Date.now()
    if (now < s.startsAt.getTime() - 15 * 60000) throw new CommandError('Attendance opens 15 minutes before the session starts.')
    if (now > s.endsAt.getTime() + settings.attendanceEditWindowHours * HOUR) throw new CommandError(`Attendance closed ${settings.attendanceEditWindowHours} hours after the session. Ask the front desk.`)
    return s
  }
  throw new CommandError('You do not have permission to do that here.')
}

export const resolvers = {
  Query: {
    async cancellationPreview(_: unknown, args: { bookingId: string; excused?: boolean }, context: Ctx) {
      const actorId = context.session?.itemId
      if (!actorId) return null
      const prisma = context.sudo().prisma
      const booking = await prisma.booking.findFirst({ where: { id: args.bookingId, status: 'booked', family: { guardians: { some: { id: actorId } } } } })
      if (!booking) {
        // staff may preview too
        const staff = await prisma.booking.findUnique({ where: { id: args.bookingId } })
        if (!staff || !context.session?.data?.role?.canManageSchedule || staff.status !== 'booked') return null
        return previewCancel(prisma, staff, Boolean(args.excused))
      }
      return previewCancel(prisma, booking, Boolean(args.excused))
    },
  },
  Mutation: {
    bookSession: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'bookSession', input: { s: args.sessionId, st: args.studentId }, idempotencyKey: keyOf(args), conflictMessage: 'That student is already booked on this session.' }, async (tx, actor) => {
      const student = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { familyId: true } })
      await requireGuardianOf(tx, actor, student?.familyId)
      const settings = await getSettings(tx)
      const s = await sessionLocation(tx, String(args.sessionId))
      if (s.startsAt.getTime() > Date.now() + settings.bookingHorizonDays * DAY) throw new CommandError(`Sessions can be booked up to ${settings.bookingHorizonDays} days ahead.`)
      const r = await bookSeat(tx, actor, { sessionId: s.id, studentId: String(args.studentId), source: 'self_booked', whenFull: 'reject' })
      return { id: r.kind === 'booked' ? r.bookingId : r.waitlistEntryId, data: r }
    }),

    staffBookSession: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'staffBookSession', input: { s: args.sessionId, st: args.studentId, w: args.whenFull }, idempotencyKey: keyOf(args), conflictMessage: 'That student is already booked on this session.' }, async (tx, actor) => {
      const s = await sessionLocation(tx, String(args.sessionId))
      requireFlag(actor, 'canManageSchedule', s.locationId)
      const r = await bookSeat(tx, actor, { sessionId: s.id, studentId: String(args.studentId), source: 'staff', whenFull: args.whenFull === 'waitlist' ? 'waitlist' : 'reject' })
      return { id: r.kind === 'booked' ? r.bookingId : r.waitlistEntryId, data: r }
    }),

    cancelBooking: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'cancelBooking', input: { b: args.bookingId, e: Boolean(args.excused) }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const booking = await tx.booking.findUnique({ where: { id: String(args.bookingId) }, select: { id: true, familyId: true, sessionId: true } })
      if (!booking) throw new CommandError('That booking was not found.')
      const s = await sessionLocation(tx, booking.sessionId)
      if (!canAt(actor, 'canManageSchedule', s.locationId)) await requireGuardianOf(tx, actor, booking.familyId)
      const r = await cancelSeat(tx, actor, booking.id, { excused: Boolean(args.excused), reason: optionalString(args.reason, 500) })
      return { id: booking.id, data: r }
    }),

    rescheduleBooking: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'rescheduleBooking', input: { b: args.bookingId, n: args.newSessionId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const booking = await tx.booking.findUnique({ where: { id: String(args.bookingId) }, select: { id: true, familyId: true, sessionId: true, studentId: true, startsAt: true, status: true } })
      if (!booking || booking.status !== 'booked') throw new CommandError('Only an upcoming booking can be moved.')
      const s = await sessionLocation(tx, booking.sessionId)
      const staff = canAt(actor, 'canManageSchedule', s.locationId)
      if (!staff) await requireGuardianOf(tx, actor, booking.familyId)
      const settings = await getSettings(tx)
      if (!staff && booking.startsAt.getTime() - Date.now() < settings.cancellationWindowHours * HOUR) throw new CommandError(`Sessions can be moved up to ${settings.cancellationWindowHours} hours before they start. Inside that, cancel instead.`)
      const target = await sessionLocation(tx, String(args.newSessionId))
      if (target.id === s.id) throw new CommandError('Pick a different session.')
      if (target.programId !== s.programId) throw new CommandError('A booking can only move to a session of the same programme.')
      // Lock both sessions in a stable order to avoid deadlocks.
      for (const id of [s.id, target.id].sort()) await lockSession(tx, id)
      // Early cancel returns the credit, then book the new seat (same transaction: all or nothing).
      await tx.booking.updateMany({ where: { id: booking.id, status: 'booked' }, data: { status: 'cancelled_early', activeKey: null, cancelledAt: new Date(), cancelledById: actor!.userId, lateReason: 'rescheduled' } })
      await recordChange(tx, { type: 'Booking', id: booking.id, from: 'booked', to: 'cancelled_early', actorId: actor!.userId, reason: 'rescheduled', data: { to: target.id } })
      await releaseHold(tx, booking.id, actor!.userId, 'rescheduled')
      const r = await bookSeat(tx, actor, { sessionId: target.id, studentId: booking.studentId, source: staff ? 'staff' : 'self_booked', whenFull: 'reject' })
      await promoteWaitlist(tx, s.id)
      return { id: r.kind === 'booked' ? r.bookingId : null, data: { from: booking.id, ...r } }
    }),

    joinWaitlist: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'joinWaitlist', input: { s: args.sessionId, st: args.studentId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const student = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { familyId: true } })
      const s = await sessionLocation(tx, String(args.sessionId))
      if (!canAt(actor, 'canManageSchedule', s.locationId)) await requireGuardianOf(tx, actor, student?.familyId)
      await lockSession(tx, s.id)
      if (!['scheduled', 'needs_cover'].includes(s.status) || s.startsAt.getTime() <= Date.now()) throw new CommandError('That session is not open.')
      const r = await joinWaitlistInTx(tx, actor, s.id, String(args.studentId), student!.familyId)
      return { id: r.kind === 'waitlisted' ? r.waitlistEntryId : null, data: r }
    }),

    leaveWaitlist: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'leaveWaitlist', input: { w: args.waitlistEntryId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const w = await tx.waitlistEntry.findUnique({ where: { id: String(args.waitlistEntryId) }, select: { id: true, familyId: true, sessionId: true } })
      if (!w) throw new CommandError('That waitlist place was not found.')
      const s = await sessionLocation(tx, w.sessionId)
      if (!canAt(actor, 'canManageSchedule', s.locationId)) await requireGuardianOf(tx, actor, w.familyId)
      await transition(tx, actor, 'waitlistEntry', 'WaitlistEntry', w.id, 'waiting', 'cancelled', { activeKey: null })
      return { id: w.id }
    }),

    markAttendance: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'markAttendance', input: { b: args.bookingId, o: args.outcome }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      if (!(ATTENDANCE_OUTCOMES as readonly string[]).includes(args.outcome)) throw new CommandError('Choose attended, late, no show or late cancel.')
      const booking = await tx.booking.findUnique({ where: { id: String(args.bookingId) }, select: { id: true, sessionId: true } })
      if (!booking) throw new CommandError('That booking was not found.')
      await assertMayMark(tx, actor!, booking)
      await markSeat(tx, actor!, booking.id, args.outcome)
      return { id: booking.id, data: { status: args.outcome } }
    }),

    reopenBooking: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'reopenBooking', input: { b: args.bookingId, c: args.correctedStatus ?? null, r: args.reason }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const booking = await tx.booking.findUnique({ where: { id: String(args.bookingId) }, select: { id: true, sessionId: true } })
      if (!booking) throw new CommandError('That booking was not found.')
      const s = await sessionLocation(tx, booking.sessionId)
      // Managers only (§4.7 Corrections): manager location role or owner.
      if (!canAt(actor, 'canManagePayroll', s.locationId)) throw new CommandError('Only a manager can reopen a marked booking.')
      const r = await reopenSeat(tx, actor!, booking.id, args.correctedStatus ?? null, requireString(args.reason, 'A reason', 500))
      if (!r.reopened) return { id: booking.id, data: r, refusal: 'Pay for this session is already in an approved payroll run, so it cannot be reopened. An adjustment line was added to the next run instead.' }
      return { id: booking.id, data: r }
    }),

    createSessionSeries: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'createSessionSeries', input: args.data, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const d = args.data || {}
      const locationId = d.locationId ? String(d.locationId) : null
      requireFlag(actor, 'canManageSchedule', locationId)
      const program = await tx.program.findUnique({ where: { id: requireString(d.programId, 'Programme') }, select: { id: true, sessionMinutes: true, maxStudentsPerSession: true, format: true } })
      if (!program) throw new CommandError('That programme was not found.')
      const weekday = requireInt(d.weekday, 'Weekday', 0, 6)
      const startMinute = requireInt(d.startMinute, 'Start time', 0, 1439)
      const minutes = d.minutes ? requireInt(d.minutes, 'Length', 15, 600) : program.sessionMinutes
      const capacity = program.format === 'one_to_one' ? 1 : d.capacity ? requireInt(d.capacity, 'Capacity', 1, 200) : program.maxStudentsPerSession
      if (d.roomId) {
        const room = await tx.room.findUnique({ where: { id: String(d.roomId) }, select: { capacity: true, locationId: true } })
        if (!room || room.locationId !== locationId) throw new CommandError('That room is not at this location.')
        if (capacity > room.capacity) throw new CommandError(`That room seats ${room.capacity}.`)
      }
      const startDate = requireDate(d.startDate, 'Start date')
      const series = await tx.sessionSeries.create({
        data: {
          program: { connect: { id: program.id } },
          ...(d.subjectId ? { subject: { connect: { id: String(d.subjectId) } } } : {}),
          ...(locationId ? { location: { connect: { id: locationId } } } : {}),
          ...(d.roomId ? { room: { connect: { id: String(d.roomId) } } } : {}),
          ...(d.tutorId ? { tutor: { connect: { id: String(d.tutorId) } } } : {}),
          ...(d.enrollmentId ? { enrollment: { connect: { id: String(d.enrollmentId) } } } : {}),
          mode: d.mode || 'in_centre', weekday, startMinute, minutes, capacity, startDate,
          endDate: d.endDate ? requireDate(d.endDate, 'End date') : null,
          meetingUrl: optionalString(d.meetingUrl, 500), status: 'active', createdBy: { connect: { id: actor!.userId } },
        },
      })
      await recordChange(tx, { type: 'SessionSeries', id: series.id, to: 'active', actorId: actor!.userId })
      const weeks = d.weeks ? requireInt(d.weeks, 'Weeks', 1, 26) : 4
      const generated = await generateSessions(tx, series.id, new Date(Date.now() + weeks * 7 * DAY))
      return { id: series.id, data: { generated } }
    }),

    ensureSessionsGenerated: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'ensureSessionsGenerated', input: { s: args.seriesId ?? null, w: args.weeks ?? null }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      requireFlag(actor, 'canManageSchedule')
      const settings = await getSettings(tx)
      const through = new Date(Date.now() + (args.weeks ? requireInt(args.weeks, 'Weeks', 1, 26) * 7 : settings.bookingHorizonDays) * DAY)
      const series = await tx.sessionSeries.findMany({ where: { status: 'active', ...(args.seriesId ? { id: String(args.seriesId) } : {}) }, select: { id: true, locationId: true } })
      let generated = 0
      for (const s of series) if (canAt(actor, 'canManageSchedule', s.locationId)) generated += await generateSessions(tx, s.id, through)
      return { id: null, data: { generated, series: series.length } }
    }),

    cancelSession: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'cancelSession', input: { s: args.sessionId, r: args.reason }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const reasons = ['tutor_absent', 'closure', 'low_enrolment', 'other']
      if (!reasons.includes(args.reason)) throw new CommandError('Choose a reason: tutor absent, closure, low enrolment or other.')
      const s = await sessionLocation(tx, String(args.sessionId))
      requireFlag(actor, 'canManageSchedule', s.locationId)
      await lockSession(tx, s.id)
      await transition(tx, actor, 'session', 'Session', s.id, ['scheduled', 'needs_cover', 'in_progress'], 'cancelled', { cancelReason: `${args.reason}${args.note ? `: ${optionalString(args.note, 300)}` : ''}` }, args.reason)
      // Cancelling returns all credits and voids accrued pay lines (§4.6).
      const bookings = await tx.booking.findMany({ where: { sessionId: s.id, status: 'booked' }, select: { id: true } })
      for (const b of bookings) await cancelSeat(tx, actor, b.id, { byCentre: true, reason: args.reason })
      const voided = await voidSessionPay(tx, s.id, `Session cancelled: ${args.reason}`)
      await tx.waitlistEntry.updateMany({ where: { sessionId: s.id, status: 'waiting' }, data: { status: 'cancelled', activeKey: null } })
      return { id: s.id, data: { bookingsCancelled: bookings.length, payLinesVoided: voided } }
    }),

    markSessionNeedsCover: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'markSessionNeedsCover', input: { s: args.sessionId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const s = await sessionLocation(tx, String(args.sessionId))
      requireFlag(actor, 'canManageSchedule', s.locationId)
      await transition(tx, actor, 'session', 'Session', s.id, 'scheduled', 'needs_cover')
      return { id: s.id }
    }),

    assignSubstitute: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'assignSubstitute', input: { s: args.sessionId, t: args.tutorId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const s = await sessionLocation(tx, String(args.sessionId))
      requireFlag(actor, 'canManageSchedule', s.locationId)
      const tutor = await tx.tutor.findUnique({ where: { id: String(args.tutorId) }, select: { id: true, status: true } })
      if (!tutor || tutor.status !== 'active') throw new CommandError('That tutor is not active.')
      if (tutor.id === s.tutorId) throw new CommandError('That tutor is already on this session.')
      await assertTutorFree(tx, tutor.id, s.startsAt, s.endsAt, s.id)
      await lockSession(tx, s.id)
      if (!['scheduled', 'needs_cover'].includes(s.status)) throw new CommandError('Only an upcoming session can get a substitute.')
      const r = await tx.session.updateMany({ where: { id: s.id, status: s.status }, data: { tutorId: tutor.id, substituteForId: s.tutorId, status: 'scheduled' } })
      if (r.count !== 1) throw new CommandError('This session was changed by someone else. Reload and try again.')
      await recordChange(tx, { type: 'Session', id: s.id, from: s.status, to: 'scheduled', actorId: actor!.userId, reason: 'substitute', data: { from: s.tutorId, to: tutor.id } })
      await voidSessionPay(tx, s.id, 'Substitute assigned')
      return { id: s.id }
    }),
  },
}

