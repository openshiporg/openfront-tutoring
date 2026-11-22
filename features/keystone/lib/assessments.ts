/**
 * Assessment slots (§4.2). The slot holds the assessor and, in a centre, a room.
 * Validation mirrors `assessmentSlots` (features/keystone/queries/storefront.ts): an active assessor who
 * teaches one of the programme's subjects, delivers in that mode (and at that centre), has an
 * availability window on that local weekday containing the start on the 30-minute grid, is not
 * busy, and the centre is not closed. Concurrency: `assertTutorFree` locks `tutor:<id>`, and the
 * unique `slotKey` "<tutorId>:<startISO>" is the last line of defence.
 */
import { TZDate } from '@date-fns/tz'
import { CommandError } from './errors'
import { lockKey } from './command'
import { assertTutorFree } from './schedule'
import { DAY, HOUR } from './settings'

type Tx = any
export const SLOT_TAKEN = 'That time was just taken. Please pick another.'
export const OPEN_ASSESSMENT = ['scheduled', 'in_progress'] as const

export async function timezoneFor(tx: Tx, locationId: string | null) {
  if (locationId) {
    const loc = await tx.location.findUnique({ where: { id: locationId }, select: { timezone: true } })
    if (loc?.timezone) return loc.timezone as string
  }
  const first = await tx.location.findFirst({ where: { status: 'active' }, orderBy: { createdAt: 'asc' }, select: { timezone: true } })
  return (first?.timezone as string) || 'America/New_York'
}

export type SlotInput = { programId: string; locationId: string | null; mode: string; startsAt: Date; tutorId: string; minutes?: number; staff?: boolean }

/** Validates the slot and holds the assessor (and a room for in-centre). Returns what to store. */
export async function holdAssessmentSlot(tx: Tx, input: SlotInput, exceptAssessmentId?: string | null) {
  const program = await tx.program.findUnique({ where: { id: input.programId }, select: { id: true, name: true, status: true, deliveryModes: true, assessmentMinutes: true, assessmentFee: true, subjects: { select: { id: true } }, locations: { select: { id: true } } } })
  if (!program || program.status !== 'published') throw new CommandError('That programme is not available.')
  const modes: string[] = Array.isArray(program.deliveryModes) ? program.deliveryModes : []
  if (!modes.includes(input.mode)) throw new CommandError('This programme is not offered that way.')
  let location: any = null
  if (input.mode === 'in_centre') {
    if (!input.locationId) throw new CommandError('Choose a centre.')
    location = await tx.location.findUnique({ where: { id: input.locationId }, select: { id: true, name: true, status: true, timezone: true } })
    if (!location || location.status !== 'active') throw new CommandError('That centre is not taking bookings.')
  }
  const minutes = input.minutes ?? (program.assessmentMinutes || 45)
  const startsAt = input.startsAt
  const endsAt = new Date(startsAt.getTime() + minutes * 60000)
  if (!input.staff && startsAt.getTime() < Date.now() + 12 * HOUR) throw new CommandError('Assessments can be booked from 12 hours ahead. Please pick a later time.')
  if (startsAt.getTime() < Date.now()) throw new CommandError('That time has passed.')

  const tutor = await tx.tutor.findUnique({
    where: { id: input.tutorId },
    select: {
      id: true, displayName: true, status: true, deliveryModes: true,
      subjects: { select: { subjectId: true } }, locations: { select: { id: true } },
      availability: { where: { mode: input.mode, ...(location ? { OR: [{ locationId: location.id }, { locationId: null }] } : {}) } },
    },
  })
  if (!tutor || tutor.status !== 'active') throw new CommandError(SLOT_TAKEN)
  const subjectIds = program.subjects.map((s: any) => s.id)
  if (subjectIds.length && !tutor.subjects.some((s: any) => subjectIds.includes(s.subjectId))) throw new CommandError(SLOT_TAKEN)
  if (!(Array.isArray(tutor.deliveryModes) && tutor.deliveryModes.includes(input.mode))) throw new CommandError(SLOT_TAKEN)
  if (location && !tutor.locations.some((l: any) => l.id === location.id)) throw new CommandError(SLOT_TAKEN)

  const tz = location?.timezone || (await timezoneFor(tx, null))
  if (!input.staff) {
    const local = new TZDate(startsAt.getTime(), tz)
    const weekday = local.getDay()
    const minute = local.getHours() * 60 + local.getMinutes()
    const fits = tutor.availability.some((w: any) => w.weekday === weekday && minute >= w.startMinute && minute + minutes <= w.endMinute && (minute - w.startMinute) % 30 === 0
      && (!w.effectiveFrom || w.effectiveFrom.getTime() <= startsAt.getTime() + DAY) && (!w.effectiveTo || w.effectiveTo.getTime() >= startsAt.getTime()))
    if (!fits) throw new CommandError(SLOT_TAKEN)
  }
  if (location) {
    const closed = await tx.closure.findFirst({ where: { locationId: location.id, startsOn: { lt: endsAt }, endsOn: { gte: new Date(startsAt.getTime() - DAY) } }, select: { startsOn: true, endsOn: true } })
    if (closed && startsAt.getTime() < closed.endsOn.getTime() + DAY && endsAt.getTime() > closed.startsOn.getTime()) throw new CommandError('The centre is closed then.')
  }

  // Hold the assessor: sessions, approved time off, other assessments.
  try {
    await assertTutorFree(tx, tutor.id, startsAt, endsAt)
  } catch (error) {
    if (error instanceof CommandError) throw new CommandError(SLOT_TAKEN)
    throw error
  }
  const pending = await tx.tutorTimeOff.findFirst({ where: { tutorId: tutor.id, status: 'requested', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } })
  if (pending && !input.staff) throw new CommandError(SLOT_TAKEN)
  const overlapping = await tx.assessment.findMany({
    where: { assessorId: tutor.id, status: { in: [...OPEN_ASSESSMENT] }, scheduledAt: { lt: endsAt, gt: new Date(startsAt.getTime() - 4 * HOUR) }, ...(exceptAssessmentId ? { id: { not: exceptAssessmentId } } : {}) },
    select: { scheduledAt: true, minutes: true },
  })
  if (overlapping.some((a: any) => a.scheduledAt.getTime() + a.minutes * 60000 > startsAt.getTime())) throw new CommandError(SLOT_TAKEN)

  // Hold a room in a centre: the smallest active room free of sessions and assessments.
  let roomId: string | null = null
  if (location) {
    await lockKey(tx, `rooms:${location.id}`)
    const rooms = await tx.room.findMany({ where: { locationId: location.id, status: 'active' }, orderBy: [{ capacity: 'asc' }, { name: 'asc' }], select: { id: true } })
    for (const r of rooms) {
      const session = await tx.session.findFirst({ where: { roomId: r.id, status: { in: ['scheduled', 'in_progress', 'needs_cover'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } })
      if (session) continue
      const other = await tx.assessment.findMany({ where: { roomId: r.id, status: { in: [...OPEN_ASSESSMENT] }, scheduledAt: { lt: endsAt, gt: new Date(startsAt.getTime() - 4 * HOUR) }, ...(exceptAssessmentId ? { id: { not: exceptAssessmentId } } : {}) }, select: { scheduledAt: true, minutes: true } })
      if (other.some((a: any) => a.scheduledAt.getTime() + a.minutes * 60000 > startsAt.getTime())) continue
      roomId = r.id
      break
    }
    if (!roomId && rooms.length) throw new CommandError(SLOT_TAKEN)
  }
  return {
    program, location, tutor: { id: tutor.id, displayName: tutor.displayName }, roomId, minutes, startsAt, endsAt, timezone: tz,
    slotKey: `${tutor.id}:${startsAt.toISOString()}`,
  }
}

/** Ensures the seeded Customer role exists and returns its id. */
export async function customerRoleId(tx: Tx) {
  const role = await tx.role.findFirst({ where: { name: 'Customer' }, select: { id: true } })
  if (role) return role.id as string
  const created = await tx.role.create({ data: { name: 'Customer' }, select: { id: true } })
  return created.id as string
}
