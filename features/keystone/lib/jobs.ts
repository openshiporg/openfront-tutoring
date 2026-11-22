/**
 * Daily jobs (§5.9 runDailyJobs, §8): billing, status moves, credit expiry and rollover, session
 * generation, follow-up tasks, email delivery. Every step is idempotent, so the route, the
 * dashboard-load trigger and the "Run now" button can overlap safely (one run at a time by lock).
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { transaction, lockKey } from './command'
import { rollOverGrant, expireGrant } from './ledger'
import { runMembershipBilling, advanceMemberships } from './membership'
import { generateSessions } from './schedule'
import { deliverQueued, queueEmail } from './notify'
import { getSettings, DAY, HOUR } from './settings'

export async function expireCredits(prisma: any, now = new Date()) {
  const settings = await getSettings(prisma)
  let rolled = 0
  let expired = 0
  // Membership periods that ended: roll over once into the next period's grant, else expire.
  const ended = await prisma.creditGrant.findMany({ where: { kind: 'membership_period', status: { in: ['active', 'exhausted'] }, periodEnd: { lte: now } }, select: { id: true, membershipId: true, periodEnd: true } })
  for (const g of ended) {
    await transaction(prisma, async (tx) => {
      await lockKey(tx, `grant:${g.id}`)
      const next = await tx.creditGrant.findFirst({ where: { membershipId: g.membershipId, kind: 'membership_period', rolledFromId: null, periodStart: g.periodEnd }, select: { periodStart: true, periodEnd: true } })
      if (next) { const m = await rollOverGrant(tx, g.id, { periodStart: next.periodStart, periodEnd: next.periodEnd }, settings.membershipRolloverPeriods > 0); if (m) rolled += 1; else expired += 1 }
      else { await expireGrant(tx, g.id, 'Period ended'); expired += 1 }
    })
  }
  const others = await prisma.creditGrant.findMany({ where: { kind: { not: 'membership_period' }, status: 'active', expiresAt: { lte: now } }, select: { id: true } })
  for (const g of others) { await transaction(prisma, (tx) => expireGrant(tx, g.id, 'Expired')); expired += 1 }
  return { rolled, expired }
}

async function openTask(tx: any, key: string, data: Record<string, any>) {
  const existing = await tx.task.findUnique({ where: { openKey: key }, select: { id: true } })
  if (existing) return false
  await tx.task.create({ data: { ...data, openKey: key, status: 'open' } })
  return true
}

/** The daily follow-up list (§4.15, W11): each is a Task with a unique open key, raised once. */
export async function raiseTasks(prisma: any, now = new Date()) {
  const settings = await getSettings(prisma)
  let raised = 0
  await transaction(prisma, async (tx) => {
    // Low balance on packages (W7): task for staff, top-up email for the guardian, once per grant.
    const low = await tx.creditGrant.findMany({ where: { kind: 'package', status: 'active', minutesAvailable: { lte: settings.lowBalanceMinutes, gt: 0 } }, select: { id: true, familyId: true, studentId: true, minutesAvailable: true, family: { select: { billingEmail: true } } } })
    for (const g of low) {
      if (await openTask(tx, `low-balance:${g.id}`, { kind: 'low_balance', title: `Low balance: ${Math.round(g.minutesAvailable / 60 * 10) / 10} hours left`, family: { connect: { id: g.familyId } }, ...(g.studentId ? { student: { connect: { id: g.studentId } } } : {}), relatedType: 'CreditGrant', relatedId: g.id, dueAt: now })) {
        await queueEmail(tx, { to: g.family?.billingEmail ?? '', template: 'low_balance', subject: 'Time to top up your tutoring hours', relatedType: 'CreditGrant', relatedId: g.id })
        raised += 1
      }
    }
    // Leads with no reply in 3 days (W1.9).
    const stale = await tx.lead.findMany({ where: { status: { in: ['new', 'contacted', 'proposal_sent'] }, updatedAt: { lte: new Date(now.getTime() - 3 * DAY) } }, select: { id: true, guardianName: true, status: true, locationId: true, ownerId: true } })
    for (const l of stale) if (await openTask(tx, `lead-follow-up:${l.id}:${l.status}`, { kind: 'lead_follow_up', title: `Follow up ${l.guardianName || 'enquiry'} (${l.status.replace(/_/g, ' ')})`, lead: { connect: { id: l.id } }, ...(l.locationId ? { location: { connect: { id: l.locationId } } } : {}), ...(l.ownerId ? { owner: { connect: { id: l.ownerId } } } : {}), relatedType: 'Lead', relatedId: l.id, dueAt: now })) raised += 1
    // Assessment completed with no proposal in 3 days.
    const noProposal = await tx.assessment.findMany({ where: { status: 'completed', completedAt: { lte: new Date(now.getTime() - 3 * DAY) }, student: { plans: { none: { status: { in: ['proposed', 'accepted', 'active'] } } } } }, select: { id: true, familyId: true, studentId: true, locationId: true } })
    for (const a of noProposal) if (await openTask(tx, `no-proposal:${a.id}`, { kind: 'assessment_follow_up', title: 'Assessment done, no learning plan sent yet', ...(a.familyId ? { family: { connect: { id: a.familyId } } } : {}), ...(a.studentId ? { student: { connect: { id: a.studentId } } } : {}), ...(a.locationId ? { location: { connect: { id: a.locationId } } } : {}), relatedType: 'Assessment', relatedId: a.id, dueAt: now })) raised += 1
    // Two absences in a row (no-show or late cancel) in the last 30 days.
    const recent = await tx.booking.findMany({ where: { startsAt: { gte: new Date(now.getTime() - 30 * DAY), lte: now }, status: { in: ['attended', 'late', 'no_show', 'cancelled_late', 'cancelled_late_excused'] } }, select: { studentId: true, familyId: true, status: true, startsAt: true }, orderBy: { startsAt: 'desc' } })
    const byStudent = new Map<string, any[]>()
    for (const b of recent) byStudent.set(b.studentId, [...(byStudent.get(b.studentId) ?? []), b])
    for (const [studentId, list] of byStudent) {
      if (list.length >= 2 && list.slice(0, 2).every((b: any) => b.status !== 'attended' && b.status !== 'late')) {
        if (await openTask(tx, `absences:${studentId}:${list[0].startsAt.toISOString().slice(0, 10)}`, { kind: 'absence_streak', title: 'Two absences in a row', student: { connect: { id: studentId } }, family: { connect: { id: list[0].familyId } }, relatedType: 'Student', relatedId: studentId, dueAt: now })) raised += 1
      }
    }
    // Membership ending in the next 7 days.
    const ending = await tx.membership.findMany({ where: { status: { in: ['cancelling', 'paused'] }, endsAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY) } }, select: { id: true, familyId: true, studentId: true } })
    for (const m of ending) if (await openTask(tx, `membership-ending:${m.id}`, { kind: 'membership_ending', title: 'Membership ends this week', family: { connect: { id: m.familyId } }, student: { connect: { id: m.studentId } }, relatedType: 'Membership', relatedId: m.id, dueAt: now })) raised += 1
    // New student first-week check-in.
    const fresh = await tx.enrollment.findMany({ where: { status: 'active', startDate: { gte: new Date(now.getTime() - 8 * DAY), lte: new Date(now.getTime() - 6 * DAY) } }, select: { id: true, familyId: true, studentId: true, locationId: true } })
    for (const e of fresh) if (await openTask(tx, `first-week:${e.id}`, { kind: 'first_week_check_in', title: 'First-week check-in with the family', family: { connect: { id: e.familyId } }, student: { connect: { id: e.studentId } }, ...(e.locationId ? { location: { connect: { id: e.locationId } } } : {}), relatedType: 'Enrollment', relatedId: e.id, dueAt: now })) raised += 1
  })
  // Session reminders 24 hours before (§8 Email).
  const soon = await prisma.booking.findMany({ where: { status: 'booked', startsAt: { gt: new Date(now.getTime() + 20 * HOUR), lte: new Date(now.getTime() + 28 * HOUR) } }, select: { id: true, startsAt: true, family: { select: { billingEmail: true } } } })
  for (const b of soon) {
    const already = await prisma.notificationLog.findFirst({ where: { template: 'session_reminder', relatedId: b.id }, select: { id: true } })
    if (!already) await queueEmail(prisma, { to: b.family?.billingEmail ?? '', template: 'session_reminder', subject: `Reminder: session on ${b.startsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`, relatedType: 'Booking', relatedId: b.id })
  }
  return { raised }
}

export async function generateAll(prisma: any, now = new Date()) {
  const settings = await getSettings(prisma)
  const through = new Date(now.getTime() + settings.bookingHorizonDays * DAY)
  const series = await prisma.sessionSeries.findMany({ where: { status: 'active', OR: [{ generatedThrough: null }, { generatedThrough: { lt: through } }] }, select: { id: true } })
  let generated = 0
  for (const s of series) generated += await transaction(prisma, (tx) => generateSessions(tx, s.id, through))
  return { generated }
}

/** One run at a time (advisory lock); records lastDailyJobsAt. */
export async function runDailyJobs(prisma: any, now = new Date()) {
  const started = Date.now()
  const steps: Record<string, unknown> = {}
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { steps[name] = await fn() } catch (error) { steps[name] = { error: (error as Error).message } ; console.error(`daily job ${name} failed`, (error as Error)?.message) }
  }
  const got = await prisma.$queryRaw`SELECT pg_try_advisory_lock(hashtextextended('daily-jobs', 0)) AS ok` as Array<{ ok: boolean }>
  if (!got[0]?.ok) return { skipped: 'another run is in progress' }
  try {
    await step('sessions', () => generateAll(prisma, now))
    await step('billing', async () => {
      const r = await runMembershipBilling(prisma, now)
      return r.reduce((acc: Record<string, number>, x) => ({ ...acc, [x.outcome]: (acc[x.outcome] ?? 0) + 1 }), {})
    })
    await step('memberships', () => advanceMemberships(prisma, now))
    await step('credits', () => expireCredits(prisma, now))
    await step('tasks', () => raiseTasks(prisma, now))
    await step('offers', async () => {
      const r = await prisma.offer.updateMany({ where: { status: 'sent', expiresAt: { lte: now } }, data: { status: 'expired', openKey: null } })
      return { expired: r.count }
    })
    await step('email', () => deliverQueued(prisma))
    await prisma.businessSettings.upsert({ where: { id: 1 }, create: { id: 1, lastDailyJobsAt: now }, update: { lastDailyJobsAt: now } })
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtextextended('daily-jobs', 0))`
  }
  return { ranAt: now.toISOString(), ms: Date.now() - started, steps }
}

export const hashSecret = (s: string) => createHash('sha256').update(s).digest('hex')

export async function jobsSecretMatches(prisma: any, presented: string) {
  const row = await prisma.businessSettings.findUnique({ where: { id: 1 }, select: { jobsSecretHash: true } })
  const stored = row?.jobsSecretHash || ''
  if (!stored || !presented) return false
  const a = Buffer.from(hashSecret(presented), 'hex')
  const b = Buffer.from(stored, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
