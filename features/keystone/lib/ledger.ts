/**
 * Credit ledger in minutes (§4.8). Adapted from Gym membership-credits (grant + entries)
 * with the guarded decrement of §4.7 step 4.
 *
 * Ledger maths (tested): the `grant` entry carries minutesGranted, so for every grant
 *   sum(entries) = minutesGranted + sum(non-grant entries) = minutesAvailable >= 0.
 * A hold moves minutes out of the balance. It is closed by exactly one `release`
 * (minutes back) or `debit` (0 minutes: the held minutes are now spent). A `reversal`
 * re-opens a closed hold when a manager reopens a booking.
 * Unlimited grants record holds as 0 minutes; the weekly cap bounds them instead.
 */
import { CommandError } from './errors'

export type Tx = any

export const SEAT_STATUSES = ['booked', 'attended', 'late', 'no_show'] as const
export const FINAL_STATUSES = ['attended', 'late', 'cancelled_early', 'cancelled_late', 'cancelled_late_excused', 'no_show', 'cancelled_by_centre'] as const
/** Statuses where the held credit is spent. */
export const SPENT_STATUSES = ['attended', 'late', 'cancelled_late', 'cancelled_late_excused', 'no_show'] as const

type Entry = { grantId: string; type: string; minutes: number; bookingId?: string | null; note?: string; actorId?: string | null }

async function entry(tx: Tx, e: Entry) {
  await tx.creditEntry.create({
    data: {
      grant: { connect: { id: e.grantId } },
      type: e.type,
      minutes: e.minutes,
      note: e.note ?? '',
      ...(e.bookingId ? { booking: { connect: { id: e.bookingId } } } : {}),
      ...(e.actorId ? { actor: { connect: { id: e.actorId } } } : {}),
    },
  })
}

export async function createGrant(tx: Tx, input: {
  familyId: string; studentId?: string | null; programId?: string | null; kind: string; minutes: number
  unlimited?: boolean; weeklyCap?: number | null; expiresAt?: Date | null; periodStart?: Date | null; periodEnd?: Date | null
  membershipId?: string | null; studentPackageId?: string | null; sourceBookingId?: string | null; rolledFromId?: string | null
  note?: string; actorId?: string | null
}) {
  if (!Number.isInteger(input.minutes) || input.minutes < 0) throw new CommandError('Credit minutes must be a whole number of 0 or more.')
  const grant = await tx.creditGrant.create({
    data: {
      family: { connect: { id: input.familyId } },
      ...(input.studentId ? { student: { connect: { id: input.studentId } } } : {}),
      ...(input.programId ? { program: { connect: { id: input.programId } } } : {}),
      ...(input.membershipId ? { membership: { connect: { id: input.membershipId } } } : {}),
      ...(input.studentPackageId ? { studentPackage: { connect: { id: input.studentPackageId } } } : {}),
      ...(input.sourceBookingId ? { sourceBooking: { connect: { id: input.sourceBookingId } } } : {}),
      ...(input.rolledFromId ? { rolledFrom: { connect: { id: input.rolledFromId } } } : {}),
      ...(input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}),
      kind: input.kind,
      minutesGranted: input.minutes,
      minutesAvailable: input.minutes,
      unlimited: Boolean(input.unlimited),
      weeklyCap: input.weeklyCap ?? null,
      expiresAt: input.expiresAt ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      status: input.minutes > 0 || input.unlimited ? 'active' : 'exhausted',
    },
  })
  await entry(tx, { grantId: grant.id, type: input.kind === 'membership_period' && input.rolledFromId ? 'rollover_in' : 'grant', minutes: input.minutes, note: input.note, actorId: input.actorId })
  return grant
}

/** Guarded decrement (§4.7 step 4): zero rows updated means not enough credit. Runs BEFORE the booking insert. */
export async function reserveMinutes(tx: Tx, grant: { id: string; unlimited: boolean }, minutes: number, validAt: Date) {
  if (grant.unlimited) return
  const rows: number = await tx.$executeRaw`
    UPDATE "CreditGrant" SET "minutesAvailable" = "minutesAvailable" - ${minutes},
      "status" = CASE WHEN "minutesAvailable" - ${minutes} = 0 THEN 'exhausted' ELSE "status" END,
      "updatedAt" = now()
    WHERE id = ${grant.id} AND status = 'active' AND "minutesAvailable" >= ${minutes}
      AND ("expiresAt" IS NULL OR "expiresAt" >= ${validAt})`
  if (rows !== 1) throw new CommandError('Not enough credit for this session.')
}

/** The hold entry for minutes already reserved. */
export async function writeHold(tx: Tx, grant: { id: string; unlimited: boolean }, bookingId: string, minutes: number, actorId?: string | null) {
  await entry(tx, { grantId: grant.id, type: 'hold', minutes: grant.unlimited ? 0 : -minutes, bookingId, note: grant.unlimited ? `${minutes} minutes (unlimited)` : '', actorId })
}

async function openHold(tx: Tx, bookingId: string) {
  const entries = await tx.creditEntry.findMany({ where: { bookingId, type: { in: ['hold', 'release', 'debit', 'reversal'] } }, orderBy: { createdAt: 'asc' }, select: { grantId: true, type: true, minutes: true } })
  const hold = entries.find((e: any) => e.type === 'hold')
  if (!hold) return null
  // open when holds+reversals exceed closures
  const opens = entries.filter((e: any) => e.type === 'hold' || e.type === 'reversal').length
  const closes = entries.filter((e: any) => e.type === 'release' || e.type === 'debit').length
  const last = [...entries].reverse().find((e: any) => e.type === 'release' || e.type === 'debit') ?? null
  return { grantId: hold.grantId as string, minutes: -hold.minutes as number, open: opens > closes, lastClose: last as null | { type: string } }
}

/** Return held minutes to the same grant. Minutes past expiry are expired straight away. */
export async function releaseHold(tx: Tx, bookingId: string, actorId?: string | null, note = '') {
  const hold = await openHold(tx, bookingId)
  if (!hold || !hold.open) return
  await entry(tx, { grantId: hold.grantId, type: 'release', minutes: hold.minutes, bookingId, note, actorId })
  if (hold.minutes > 0) {
    await tx.$executeRaw`UPDATE "CreditGrant" SET "minutesAvailable" = "minutesAvailable" + ${hold.minutes},
      "status" = CASE WHEN status = 'exhausted' THEN 'active' ELSE status END, "updatedAt" = now() WHERE id = ${hold.grantId}`
    const grant = await tx.creditGrant.findUnique({ where: { id: hold.grantId }, select: { expiresAt: true, status: true } })
    if (grant?.expiresAt && grant.expiresAt < new Date() && grant.status === 'active') await expireGrant(tx, hold.grantId, 'Expired when the held minutes were returned')
  }
}

export async function debitHold(tx: Tx, bookingId: string, actorId?: string | null, note = '') {
  const hold = await openHold(tx, bookingId)
  if (!hold || !hold.open) return
  await entry(tx, { grantId: hold.grantId, type: 'debit', minutes: 0, bookingId, note: note || `${hold.minutes} minutes spent`, actorId })
}

/** Re-open a closed hold (manager reopen). A released hold must be held again (guarded). */
export async function reverseClose(tx: Tx, bookingId: string, actorId?: string | null) {
  const hold = await openHold(tx, bookingId)
  if (!hold || hold.open || !hold.lastClose) return
  if (hold.lastClose.type === 'release' && hold.minutes > 0) {
    const rows: number = await tx.$executeRaw`UPDATE "CreditGrant" SET "minutesAvailable" = "minutesAvailable" - ${hold.minutes},
      "status" = CASE WHEN "minutesAvailable" - ${hold.minutes} = 0 THEN 'exhausted' ELSE status END, "updatedAt" = now()
      WHERE id = ${hold.grantId} AND status IN ('active') AND "minutesAvailable" >= ${hold.minutes}`
    if (rows !== 1) throw new CommandError('The credit returned for this booking has since been used, so it cannot be reopened.')
    await entry(tx, { grantId: hold.grantId, type: 'reversal', minutes: -hold.minutes, bookingId, note: 'Reopened: release reversed', actorId })
  } else {
    await entry(tx, { grantId: hold.grantId, type: 'reversal', minutes: 0, bookingId, note: 'Reopened: debit reversed', actorId })
  }
}

export async function expireGrant(tx: Tx, grantId: string, note = 'Expired') {
  const grant = await tx.creditGrant.findUnique({ where: { id: grantId }, select: { minutesAvailable: true, status: true } })
  if (!grant || !['active', 'exhausted'].includes(grant.status)) return 0
  const minutes = grant.minutesAvailable
  const rows = await tx.creditGrant.updateMany({ where: { id: grantId, status: grant.status, minutesAvailable: minutes }, data: { minutesAvailable: 0, status: 'expired' } })
  if (rows.count !== 1) throw new CommandError('Credit changed while expiring; retry.')
  if (minutes > 0) await entry(tx, { grantId, type: 'expire', minutes: -minutes, note })
  return minutes
}

/** Remove unused minutes (refund of a package, voiding a grant). Held minutes stay with their bookings. */
export async function removeUnused(tx: Tx, grantId: string, type: 'refund' | 'adjustment', status: 'refunded' | 'voided', actorId?: string | null, note = '') {
  const grant = await tx.creditGrant.findUnique({ where: { id: grantId }, select: { minutesAvailable: true, status: true } })
  if (!grant) throw new CommandError('Credit not found.')
  const minutes = grant.minutesAvailable
  const rows = await tx.creditGrant.updateMany({ where: { id: grantId, minutesAvailable: minutes }, data: { minutesAvailable: 0, status } })
  if (rows.count !== 1) throw new CommandError('Credit changed; retry.')
  if (minutes > 0) await entry(tx, { grantId, type, minutes: -minutes, note, actorId })
  return minutes
}

/** Staff adjustment (+ or −) with a guarded update. */
export async function adjustGrant(tx: Tx, grantId: string, minutes: number, actorId: string, note: string) {
  const rows: number = await tx.$executeRaw`UPDATE "CreditGrant" SET "minutesAvailable" = "minutesAvailable" + ${minutes},
    "status" = CASE WHEN "minutesAvailable" + ${minutes} = 0 THEN 'exhausted' WHEN status = 'exhausted' THEN 'active' ELSE status END, "updatedAt" = now()
    WHERE id = ${grantId} AND status IN ('active','exhausted') AND "minutesAvailable" + ${minutes} >= 0`
  if (rows !== 1) throw new CommandError('That adjustment would make the balance negative.')
  await entry(tx, { grantId, type: 'adjustment', minutes, note, actorId })
}

/**
 * Funding order (§4.7 step 3): make-up credit first, then membership credit of this
 * programme, then package credit; oldest expiry first. Unlimited: weekly cap.
 */
export async function pickGrant(tx: Tx, input: { familyId: string; studentId: string; programId: string | null; minutes: number; startsAt: Date }) {
  const grants = await tx.creditGrant.findMany({
    where: {
      familyId: input.familyId,
      status: 'active',
      OR: [{ studentId: input.studentId }, { studentId: null }],
      AND: [
        { OR: [{ programId: input.programId }, { programId: null }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: input.startsAt } }] },
        { OR: [{ periodStart: null }, { periodStart: { lte: input.startsAt } }] },
      ],
    },
    select: { id: true, kind: true, unlimited: true, weeklyCap: true, minutesAvailable: true, expiresAt: true, createdAt: true },
  })
  const rank: Record<string, number> = { make_up: 0, goodwill: 1, membership_period: 2, package: 3, pay_as_you_go: 4 }
  grants.sort((a: any, b: any) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9)
    || (a.expiresAt ? a.expiresAt.getTime() : Infinity) - (b.expiresAt ? b.expiresAt.getTime() : Infinity)
    || a.createdAt.getTime() - b.createdAt.getTime())
  for (const grant of grants) {
    if (grant.unlimited) {
      if (grant.weeklyCap) {
        const { start, end } = weekOf(input.startsAt)
        const used = await tx.booking.count({ where: { creditGrantId: grant.id, startsAt: { gte: start, lt: end }, status: { in: [...SEAT_STATUSES, 'cancelled_late', 'cancelled_late_excused'] } } })
        if (used >= grant.weeklyCap) continue
      }
      return grant
    }
    if (grant.minutesAvailable >= input.minutes) return grant
  }
  return null
}

export function weekOf(at: Date) {
  const start = new Date(at)
  const day = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - day)
  start.setUTCHours(0, 0, 0, 0)
  return { start, end: new Date(start.getTime() + 7 * 86400_000) }
}

/** The §4.8 invariant for one grant. Returns a problem string or null. */
export async function checkGrant(tx: Tx, grantId: string) {
  const grant = await tx.creditGrant.findUnique({ where: { id: grantId }, select: { minutesAvailable: true, minutesGranted: true } })
  const entries = await tx.creditEntry.findMany({ where: { grantId }, select: { type: true, minutes: true } })
  const sum = entries.reduce((s: number, e: any) => s + e.minutes, 0)
  if (grant.minutesAvailable < 0) return `grant ${grantId} negative`
  if (sum !== grant.minutesAvailable) return `grant ${grantId}: entries ${sum} != available ${grant.minutesAvailable}`
  return null
}
