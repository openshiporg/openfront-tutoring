/** Series → sessions generation and tutor/room clash checks (§4.6, W3). */
import { TZDate } from '@date-fns/tz'
import { CommandError } from './errors'
import { lockKey } from './command'
import { DAY } from './settings'

export type Tx = any

export const ACTIVE_SESSION = ['scheduled', 'in_progress', 'needs_cover', 'completed'] as const

/** Wall-clock start in a timezone → UTC Date. */
export function localStart(day: { y: number; m: number; d: number }, startMinute: number, timezone: string) {
  return new Date(new TZDate(day.y, day.m, day.d, Math.floor(startMinute / 60), startMinute % 60, timezone).getTime())
}

/** Dates (in tz) on `weekday` (0=Sun) from `from` through `through`. */
export function weeklyDays(from: Date, through: Date, weekday: number, timezone: string) {
  const out: Array<{ y: number; m: number; d: number }> = []
  const start = new TZDate(from.getTime(), timezone)
  let cursor = new TZDate(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, timezone)
  while (cursor.getDay() !== weekday) cursor = new TZDate(cursor.getTime() + DAY, timezone)
  while (cursor.getTime() <= through.getTime() + DAY) {
    out.push({ y: cursor.getFullYear(), m: cursor.getMonth(), d: cursor.getDate() })
    cursor = new TZDate(cursor.getTime() + 7 * DAY, timezone)
  }
  return out
}

/** Tutor busy in [startsAt, endsAt) on another active session? Locks the tutor key first. */
export async function assertTutorFree(tx: Tx, tutorId: string, startsAt: Date, endsAt: Date, exceptSessionId?: string | null, exceptSeriesId?: string | null) {
  await lockKey(tx, `tutor:${tutorId}`)
  const clash = await tx.session.findFirst({
    where: {
      tutorId, status: { in: ['scheduled', 'in_progress', 'needs_cover'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt },
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      ...(exceptSeriesId ? { NOT: { seriesId: exceptSeriesId } } : {}),
    },
    select: { id: true },
  })
  if (clash) throw new CommandError('That tutor is already teaching at that time.')
  const off = await tx.tutorTimeOff.findFirst({ where: { tutorId, status: 'approved', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } })
  if (off) throw new CommandError('That tutor has approved time off then.')
  const assessment = await tx.assessment.findFirst({ where: { assessorId: tutorId, status: { in: ['scheduled', 'in_progress'] }, scheduledAt: { lt: endsAt, gte: new Date(startsAt.getTime() - 4 * 3600_000) } }, select: { scheduledAt: true, minutes: true } })
  if (assessment && assessment.scheduledAt.getTime() + assessment.minutes * 60000 > startsAt.getTime()) throw new CommandError('That tutor has an assessment at that time.')
}

export async function assertRoomFree(tx: Tx, roomId: string, startsAt: Date, endsAt: Date, exceptSessionId?: string | null, exceptSeriesId?: string | null) {
  await lockKey(tx, `room:${roomId}`)
  const clash = await tx.session.findFirst({
    where: {
      roomId, status: { in: ['scheduled', 'in_progress', 'needs_cover'] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt },
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      ...(exceptSeriesId ? { NOT: { seriesId: exceptSeriesId } } : {}),
    },
    select: { id: true },
  })
  if (clash) throw new CommandError('That room is already in use at that time.')
}

async function closedOn(tx: Tx, locationId: string | null, at: Date) {
  if (!locationId) return false
  const c = await tx.closure.findFirst({ where: { locationId, startsOn: { lte: at }, endsOn: { gte: new Date(at.getTime() - DAY) } }, select: { id: true } })
  return Boolean(c)
}

/**
 * Generate sessions for a series through `through`. Unique (series, startsAt) makes it
 * safe to run twice (createMany skipDuplicates). Clashes for the tutor are refused.
 */
export async function generateSessions(tx: Tx, seriesId: string, through: Date) {
  await lockKey(tx, `series:${seriesId}`)
  const series = await tx.sessionSeries.findUnique({ where: { id: seriesId }, include: { location: { select: { timezone: true } }, program: { select: { format: true } } } })
  if (!series || series.status !== 'active') return 0
  const tz = series.location?.timezone || 'UTC'
  const from = new Date(Math.max(series.startDate.getTime(), (series.generatedThrough?.getTime() ?? 0) + 1, Date.now() - DAY))
  const end = series.endDate && series.endDate < through ? series.endDate : through
  if (end < from) return 0
  const rows: any[] = []
  for (const day of weeklyDays(from, end, series.weekday, tz)) {
    const startsAt = localStart(day, series.startMinute, tz)
    if (startsAt < from || startsAt > end) continue
    if (await closedOn(tx, series.locationId, startsAt)) continue
    const endsAt = new Date(startsAt.getTime() + series.minutes * 60000)
    if (series.tutorId) await assertTutorFree(tx, series.tutorId, startsAt, endsAt, null, series.id)
    if (series.roomId) await assertRoomFree(tx, series.roomId, startsAt, endsAt, null, series.id)
    rows.push({
      seriesId: series.id, programId: series.programId, subjectId: series.subjectId, locationId: series.locationId, roomId: series.roomId,
      tutorId: series.tutorId, mode: series.mode, startsAt, endsAt, capacity: series.capacity, status: 'scheduled', meetingUrl: series.meetingUrl,
    })
  }
  const created = rows.length ? await tx.session.createMany({ data: rows, skipDuplicates: true }) : { count: 0 }
  await tx.sessionSeries.update({ where: { id: series.id }, data: { generatedThrough: end } })
  return created.count as number
}
