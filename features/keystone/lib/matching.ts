/**
 * Tutor matching (W2, §4.5). Candidates: active tutors who teach the subject at the student's
 * level, in the mode, with a valid background check, with availability overlapping a preferred
 * time and no clash; ranked by overlap, then weekly load, then this family's ratings. A tutor
 * the family asked to re-match away from is excluded.
 */
import { TZDate } from '@date-fns/tz'
import { CommandError } from './errors'
import { lockKey, recordChange } from './command'
import { assertTutorFree, generateSessions } from './schedule'
import { DAY } from './settings'

type Tx = any
export type Slot = { weekday: number; startMinute: number; minutes: number }

/** preferredTimes.slots on the enrolment, or a slot list given by staff. */
export function slotsOf(value: unknown): Slot[] {
  const raw = Array.isArray(value) ? value : Array.isArray((value as any)?.slots) ? (value as any).slots : []
  return raw.slice(0, 14).map((s: any) => ({ weekday: Number(s.weekday), startMinute: Number(s.startMinute), minutes: Number(s.minutes) }))
    .filter((s: Slot) => Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6 && Number.isInteger(s.startMinute) && s.startMinute >= 0 && s.startMinute < 1440 && s.minutes >= 15 && s.minutes <= 600)
}

export async function enrolmentForMatch(tx: Tx, enrollmentId: string) {
  const e = await tx.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      program: { select: { id: true, name: true, sessionMinutes: true, format: true, billingModel: true, placementFee: true, subjects: { select: { id: true, name: true } } } },
      student: { select: { id: true, firstName: true, level: { select: { id: true, name: true, sortOrder: true } } } },
      location: { select: { id: true, name: true, timezone: true } },
      plan: { select: { subjectId: true } },
      family: { select: { id: true, city: true, postalCode: true, primaryLocationId: true } },
    },
  })
  if (!e) throw new CommandError('That enrolment was not found.')
  return e
}

const mins = (a: Slot) => [a.weekday * 1440 + a.startMinute, a.weekday * 1440 + a.startMinute + a.minutes] as const

export async function rankCandidates(tx: Tx, enrollmentId: string, now = new Date()) {
  const e = await enrolmentForMatch(tx, enrollmentId)
  const subjectIds: string[] = e.plan?.subjectId ? [e.plan.subjectId] : e.program.subjects.map((s: any) => s.id)
  const levelOrder = e.student.level?.sortOrder ?? null
  const slots = slotsOf(e.preferredTimes).map((s) => ({ ...s, minutes: s.minutes || e.program.sessionMinutes }))
  const rejected = await tx.changeEvent.findMany({ where: { aggregateType: 'Enrollment', aggregateId: e.id, reason: 'rematch requested' }, select: { data: true } })
  const excluded = new Set(rejected.map((r: any) => r.data?.tutorId).filter(Boolean))
  const declined = await tx.offer.findMany({ where: { enrollmentId: e.id, status: { in: ['declined', 'expired', 'withdrawn'] } }, select: { tutorId: true, status: true } })
  const tutors = await tx.tutor.findMany({
    where: {
      status: 'active', id: { notIn: [...excluded] as string[] },
      subjects: { some: { subjectId: { in: subjectIds } } },
      ...(e.mode === 'in_centre' && e.locationId ? { locations: { some: { id: e.locationId } } } : {}),
    },
    include: {
      subjects: { where: { subjectId: { in: subjectIds } }, include: { levelFrom: { select: { sortOrder: true } }, levelTo: { select: { sortOrder: true } } } },
      availability: true,
      credentials: { where: { kind: 'background_check', status: 'verified' }, select: { expiresAt: true } },
    },
  })
  const weekAhead = new Date(now.getTime() + 7 * DAY)
  const out: any[] = []
  for (const t of tutors) {
    const reasons: string[] = []
    const modes: string[] = Array.isArray(t.deliveryModes) ? t.deliveryModes : []
    if (!modes.includes(e.mode)) continue
    const check = t.credentials.find((c: any) => !c.expiresAt || c.expiresAt > now)
    if (!check) continue // §W9.4: an expired or missing background check blocks offers.
    const levelOk = t.subjects.some((s: any) => levelOrder == null || ((s.levelFrom?.sortOrder ?? -Infinity) <= levelOrder && levelOrder <= (s.levelTo?.sortOrder ?? Infinity)))
    if (!levelOk) continue
    const avail = t.availability.filter((a: any) => a.mode === e.mode && (!a.effectiveTo || a.effectiveTo > now) && (!a.effectiveFrom || a.effectiveFrom <= weekAhead) && (e.mode !== 'in_centre' || !a.locationId || a.locationId === e.locationId))
    let overlap = 0
    const fits: Slot[] = []
    for (const s of slots) {
      const [a0, a1] = mins(s)
      if (avail.some((a: any) => a.weekday === s.weekday && a.weekday * 1440 + a.startMinute <= a0 && a.weekday * 1440 + a.endMinute >= a1)) { overlap += 1; fits.push(s) }
    }
    if (slots.length && !overlap) continue
    const load = await tx.session.aggregate({ where: { tutorId: t.id, status: { in: ['scheduled', 'needs_cover'] }, startsAt: { gte: now, lt: weekAhead } }, _count: { _all: true } })
    const rating = await tx.review.aggregate({ where: { tutorId: t.id, familyId: e.familyId, status: { in: ['published', 'pending'] } }, _avg: { rating: true } })
    const rate = t.subjects.find((s: any) => s.payRate)?.payRate ?? t.defaultPayRate
    reasons.push(slots.length ? `Free for ${overlap} of ${slots.length} preferred times` : 'No preferred times given')
    reasons.push(`${load._count._all} sessions in the next 7 days`)
    if (rating._avg.rating) reasons.push(`Rated ${rating._avg.rating.toFixed(1)} by this family`)
    const prior = declined.find((d: any) => d.tutorId === t.id)
    if (prior) reasons.push(`Earlier offer ${prior.status}`)
    out.push({ tutorId: t.id, name: t.displayName, overlap, load: load._count._all, rating: rating._avg.rating ?? null, payRate: rate, fits, reasons, previouslyOffered: Boolean(prior) })
  }
  out.sort((a, b) => b.overlap - a.overlap || a.load - b.load || (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name))
  return { enrollment: { id: e.id, status: e.status, mode: e.mode, programName: e.program.name, studentFirstName: e.student.firstName, level: e.student.level?.name ?? null, slots, location: e.location?.name ?? null, area: [e.family?.city, e.family?.postalCode].filter(Boolean).join(' ') }, candidates: out }
}

/** First start of each slot on or after `from`, in the enrolment's timezone. */
function nextStarts(slot: Slot, from: Date, tz: string) {
  const local = new TZDate(from.getTime(), tz)
  let day = new TZDate(local.getFullYear(), local.getMonth(), local.getDate(), Math.floor(slot.startMinute / 60), slot.startMinute % 60, tz)
  while (day.getDay() !== slot.weekday || day.getTime() < from.getTime()) day = new TZDate(day.getFullYear(), day.getMonth(), day.getDate() + 1, Math.floor(slot.startMinute / 60), slot.startMinute % 60, tz)
  return new Date(day.getTime())
}

/**
 * Accept: in ONE transaction re-check the tutor is free for 4 weeks of every slot, create the
 * series, generate sessions, flag the first as trial and book the student in (§4.5, W2.4).
 */
export async function acceptOffer(tx: Tx, offerId: string, tutorId: string, now = new Date()) {
  await lockKey(tx, `offer:${offerId}`)
  const offer = await tx.offer.findUnique({ where: { id: offerId } })
  if (!offer || offer.tutorId !== tutorId) throw new CommandError('That offer was not found.')
  if (offer.status !== 'sent') throw new CommandError(`This offer is ${offer.status}.`)
  if (offer.expiresAt && offer.expiresAt <= now) {
    await tx.offer.update({ where: { id: offer.id }, data: { status: 'expired', openKey: null, respondedAt: now, declineReason: 'expired' } })
    await recordChange(tx, { type: 'Offer', id: offer.id, from: 'sent', to: 'expired', reason: 'expired' })
    return { refusal: 'This offer has expired.', offerId: offer.id }
  }
  const e = await enrolmentForMatch(tx, offer.enrollmentId)
  if (e.status !== 'pending_match') throw new CommandError('This enrolment no longer needs a tutor.')
  const slots = slotsOf(offer.proposedSlots).map((s) => ({ ...s, minutes: s.minutes || e.program.sessionMinutes }))
  if (!slots.length) throw new CommandError('This offer has no times.')
  const tz = e.location?.timezone || 'UTC'
  // Re-check every slot for 4 weeks.
  try {
    for (const s of slots) {
      const first = nextStarts(s, new Date(now.getTime() + 24 * 3600_000), tz)
      for (let w = 0; w < 4; w += 1) {
        const startsAt = new Date(first.getTime() + w * 7 * DAY)
        await assertTutorFree(tx, tutorId, startsAt, new Date(startsAt.getTime() + s.minutes * 60000))
      }
    }
  } catch (error) {
    if (!(error instanceof CommandError)) throw error
    await tx.offer.update({ where: { id: offer.id }, data: { status: 'expired', openKey: null, respondedAt: now, declineReason: 'conflict' } })
    await recordChange(tx, { type: 'Offer', id: offer.id, from: 'sent', to: 'expired', reason: 'conflict', data: { message: error.message } })
    return { refusal: `You are no longer free for these times (${error.message}) The centre will send another offer.`, offerId: offer.id }
  }
  await tx.offer.update({ where: { id: offer.id }, data: { status: 'accepted', openKey: null, respondedAt: now } })
  await recordChange(tx, { type: 'Offer', id: offer.id, from: 'sent', to: 'accepted' })
  await tx.enrollment.update({ where: { id: e.id }, data: { status: 'matched', tutor: { connect: { id: tutorId } } } })
  await recordChange(tx, { type: 'Enrollment', id: e.id, from: 'pending_match', to: 'matched', data: { tutorId } })
  const subjectId = e.plan?.subjectId ?? e.program.subjects[0]?.id ?? null
  const seriesIds: string[] = []
  let firstSession: { id: string; startsAt: Date } | null = null
  for (const s of slots) {
    const startDate = nextStarts(s, new Date(now.getTime() + 24 * 3600_000), tz)
    const series = await tx.sessionSeries.create({
      data: {
        program: { connect: { id: e.programId } }, ...(subjectId ? { subject: { connect: { id: subjectId } } } : {}),
        ...(e.locationId ? { location: { connect: { id: e.locationId } } } : {}), tutor: { connect: { id: tutorId } }, enrollment: { connect: { id: e.id } },
        mode: e.mode, weekday: s.weekday, startMinute: s.startMinute, minutes: s.minutes, capacity: 1, startDate, status: 'active',
      },
    })
    await recordChange(tx, { type: 'SessionSeries', id: series.id, to: 'active', reason: 'offer accepted' })
    await generateSessions(tx, series.id, new Date(now.getTime() + 28 * DAY))
    seriesIds.push(series.id)
    const s1 = await tx.session.findFirst({ where: { seriesId: series.id, status: 'scheduled' }, orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true } })
    if (s1 && (!firstSession || s1.startsAt < firstSession.startsAt)) firstSession = s1
  }
  if (firstSession) await tx.session.update({ where: { id: firstSession.id }, data: { isTrial: true } })
  const prefs = (e.preferredTimes ?? {}) as any
  await tx.enrollment.update({ where: { id: e.id }, data: { preferredTimes: { ...prefs, seriesIds } } })
  return { offerId: offer.id, enrollmentId: e.id, seriesIds, trialSessionId: firstSession?.id ?? null }
}
