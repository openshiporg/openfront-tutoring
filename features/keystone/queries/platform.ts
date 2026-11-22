/**
 * Platform read queries (§6.4, §7): aggregates and one-round-trip pages that list queries
 * cannot answer without pulling every row. Read-only. The actor is loaded fresh (actorOf),
 * and every scope decision goes through can / canAt / locationRoleAllows; no new access code.
 *
 * Scope rule (same as staffFilter): the owner sees every location. A manager sees the
 * locations where their membership role grants the flag, plus records with no location
 * (online and in-home work belongs to every location's staff). A requested locationId
 * outside that set is refused, never silently widened.
 */
import { Prisma } from '@prisma/client'
import { LOCATION_SCOPED_FLAGS, locationRoleAllows, type RoleFlag } from '../access'
import { can, canAt, isOwnerActor, loadActor, type Actor } from '../lib/actor'
import { GraphQLError } from 'graphql'

/** These read-query failures are written for staff, not driver errors. */
class CommandError extends GraphQLError {
  constructor(message: string) {
    super(message, { extensions: { code: /permission|Sign in|not found/.test(message) ? 'KS_ACCESS_DENIED' : 'KS_VALIDATION_FAILURE' } })
  }
}

const gql = String.raw

export const typeDefs = gql`
  type Query {
    """Owner/manager reports for [from, to). Requires canViewReports; locationId must be one of the actor's."""
    platformReports(from: String!, to: String!, locationId: ID): JSON
    """Everything the family page shows, in one call. Requires canManageFamilies at the family's location."""
    platformFamily(id: ID!): JSON
  }
`

type Ctx = any

async function actorOf(context: Ctx): Promise<Actor | null> {
  return context.session?.itemId ? loadActor(context.sudo().prisma, context.session.itemId) : null
}

/** Which locations' rows the actor may see for `flag`: 'all', or ids (plus location-less rows). */
type Scope = { all: true } | { all: false; ids: string[]; includeUnlocated: boolean }

function scopeFor(actor: Actor | null, flag: RoleFlag, locationId?: string | null): Scope {
  if (!actor) throw new CommandError('Sign in to continue.')
  if (!can(actor, flag)) throw new CommandError('You do not have permission to see this.')
  if (locationId) {
    if (!canAt(actor, flag, locationId)) throw new CommandError('You do not have permission to see that location.')
    return { all: false, ids: [locationId], includeUnlocated: false }
  }
  if (isOwnerActor(actor) || !LOCATION_SCOPED_FLAGS.has(flag)) return { all: true }
  const ids = actor.memberships.filter((m) => locationRoleAllows(m.role, flag)).map((m) => m.locationId)
  if (!ids.length) throw new CommandError('You do not have permission to see this.')
  return { all: false, ids, includeUnlocated: true }
}

/** SQL predicate for a location column under a scope. `col` is a trusted identifier. */
function inScope(scope: Scope, col: string) {
  if (scope.all) return Prisma.sql`TRUE`
  const c = Prisma.raw(col)
  const list = Prisma.sql`${c} IN (${Prisma.join(scope.ids)})`
  return scope.includeUnlocated ? Prisma.sql`(${list} OR ${c} IS NULL)` : list
}

function parseDay(v: unknown, label: string) {
  const s = String(v ?? '')
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) throw new CommandError(`${label} must be a date (YYYY-MM-DD).`)
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s)
  if (Number.isNaN(d.getTime())) throw new CommandError(`${label} is not a valid date.`)
  return d
}

const n = (v: unknown) => Number(v ?? 0)
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null)

/**
 * Metric definitions. Each `definition` is shown on the page verbatim, so the number on the
 * screen and the SQL below always mean the same thing.
 */
export const REPORT_DEFINITIONS = {
  revenue: 'Revenue: card and offline payments captured in the period, less refunds that succeeded in the period, by the invoice\u2019s location and the month the money moved (UTC).',
  activeStudents: 'Active students: students who now have at least one enrolment that is matched, active or paused, by the enrolment\u2019s location.',
  attendance: 'Attendance rate: attended or late \u00f7 every finished booking (attended, late, no-show, late cancellation) for sessions that started in the period. Early and centre cancellations are left out.',
  churn: 'Churn: memberships that ended (cancelled) in the period \u00f7 memberships that were running at the start of the period, by the enrolment\u2019s location.',
  liability: 'Credit liability: minutes still available on unexpired credit, valued at what the family paid per minute (membership price after discount \u00f7 minutes in that period; package price \u00f7 package minutes). Make-up and goodwill minutes were not bought, so they are shown in minutes only. By the family\u2019s home centre.',
  utilisation: 'Tutor utilisation: minutes of scheduled or completed sessions that tutors taught in the period \u00f7 minutes of weekly availability those tutors offered over the same days. By the session\u2019s and the availability\u2019s location.',
  leads: 'Lead conversion: enquiries created in the period that are now enrolled \u00f7 all enquiries created in the period, by the lead\u2019s location.',
} as const

const FINISHED = ['attended', 'late', 'no_show', 'cancelled_late', 'cancelled_late_excused']

export const resolvers = {
  Query: {
    async platformReports(_: unknown, args: { from: string; to: string; locationId?: string | null }, context: Ctx) {
      const actor = await actorOf(context)
      const scope = scopeFor(actor, 'canViewReports', args.locationId ?? null)
      const from = parseDay(args.from, 'From')
      const to = parseDay(args.to, 'To')
      if (to <= from) throw new CommandError('The end date must be after the start date.')
      if (to.getTime() - from.getTime() > 400 * 86_400_000) throw new CommandError('Choose a period of 13 months or less.')
      const prisma = context.sudo().prisma
      const now = new Date()

      const allowed = scopeFor(actor, 'canViewReports', null)
      const [locations, choices, business] = await Promise.all([
        prisma.location.findMany({
          where: scope.all ? {} : { id: { in: scope.ids } },
          select: { id: true, name: true }, orderBy: { name: 'asc' },
        }),
        // Every location the actor may pick, so choosing one does not hide the others.
        prisma.location.findMany({
          where: allowed.all ? {} : { id: { in: allowed.ids } },
          select: { id: true, name: true }, orderBy: { name: 'asc' },
        }),
        prisma.business.findFirst({ select: { currency: true } }),
      ])

      // Revenue: SUM(payment.amount) by invoice location and month, minus succeeded refunds.
      const revenueRows: Array<{ month: Date; location: string | null; gross: bigint; refunds: bigint }> = await prisma.$queryRaw`
        WITH paid AS (
          SELECT date_trunc('month', p."createdAt") AS month, i."location" AS location, SUM(p."amount")::bigint AS gross
          FROM "Payment" p JOIN "Invoice" i ON i."id" = p."invoice"
          WHERE p."status" IN ('captured', 'refunded', 'partially_refunded')
            AND p."createdAt" >= ${from} AND p."createdAt" < ${to} AND ${inScope(scope, 'i."location"')}
          GROUP BY 1, 2
        ), back AS (
          SELECT date_trunc('month', r."createdAt") AS month, i."location" AS location, SUM(r."amount")::bigint AS refunds
          FROM "Refund" r JOIN "Payment" p ON p."id" = r."payment" JOIN "Invoice" i ON i."id" = p."invoice"
          WHERE r."status" = 'succeeded' AND r."createdAt" >= ${from} AND r."createdAt" < ${to} AND ${inScope(scope, 'i."location"')}
          GROUP BY 1, 2
        )
        SELECT COALESCE(paid.month, back.month) AS month, COALESCE(paid.location, back.location) AS location,
               COALESCE(paid.gross, 0)::bigint AS gross, COALESCE(back.refunds, 0)::bigint AS refunds
        FROM paid FULL OUTER JOIN back ON paid.month = back.month AND paid.location IS NOT DISTINCT FROM back.location
        ORDER BY 1, 2`

      // Active students now: distinct students with a live enrolment.
      const activeRows: Array<{ location: string | null; students: bigint }> = await prisma.$queryRaw`
        SELECT e."location" AS location, COUNT(DISTINCT e."student")::bigint AS students
        FROM "Enrollment" e
        WHERE e."status" IN ('matched', 'active', 'paused') AND ${inScope(scope, 'e."location"')}
        GROUP BY 1`
      const activeTotal: Array<{ students: bigint }> = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT e."student")::bigint AS students FROM "Enrollment" e
        WHERE e."status" IN ('matched', 'active', 'paused') AND ${inScope(scope, 'e."location"')}`

      // Attendance: finished bookings of sessions that started in the period.
      const attendanceRows: Array<{ location: string | null; present: bigint; finished: bigint }> = await prisma.$queryRaw`
        SELECT s."location" AS location,
               COUNT(*) FILTER (WHERE b."status" IN ('attended', 'late'))::bigint AS present,
               COUNT(*)::bigint AS finished
        FROM "Booking" b JOIN "Session" s ON s."id" = b."session"
        WHERE b."status" IN (${Prisma.join(FINISHED)}) AND s."startsAt" >= ${from} AND s."startsAt" < ${to}
          AND ${inScope(scope, 's."location"')}
        GROUP BY 1`

      // Churn: running at `from` vs cancelled with endsAt in [from, to). Location via the enrolment.
      const churnRows: Array<{ location: string | null; at_start: bigint; ended: bigint }> = await prisma.$queryRaw`
        SELECT e."location" AS location,
               COUNT(*) FILTER (WHERE m."startedAt" < ${from} AND (m."endsAt" IS NULL OR m."endsAt" >= ${from}))::bigint AS at_start,
               COUNT(*) FILTER (WHERE m."status" = 'cancelled' AND m."endsAt" >= ${from} AND m."endsAt" < ${to}
                                  AND m."startedAt" < ${from})::bigint AS ended
        FROM "Membership" m LEFT JOIN "Enrollment" e ON e."membership" = m."id"
        WHERE m."startedAt" IS NOT NULL AND ${inScope(scope, 'e."location"')}
        GROUP BY 1`

      // Credit liability now: paid minutes valued at the price per minute of their source.
      const liabilityRows: Array<{ location: string | null; kind: string; minutes: bigint; value_cents: Prisma.Decimal | null }> = await prisma.$queryRaw`
        SELECT f."primaryLocation" AS location, g."kind" AS kind,
               SUM(g."minutesAvailable")::bigint AS minutes,
               SUM(CASE
                 WHEN g."kind" = 'membership_period' AND g."minutesGranted" > 0
                   THEN g."minutesAvailable"::numeric * (m."price" * (100 - COALESCE(m."discountPercent", 0)) / 100.0) / g."minutesGranted"
                 WHEN g."kind" = 'package' AND sp."hours" > 0
                   THEN g."minutesAvailable"::numeric * sp."price" / (sp."hours" * 60.0)
                 ELSE NULL END) AS value_cents
        FROM "CreditGrant" g
        JOIN "Family" f ON f."id" = g."family"
        LEFT JOIN "Membership" m ON m."id" = g."membership"
        LEFT JOIN "StudentPackage" sp ON sp."id" = g."studentPackage"
        WHERE g."status" = 'active' AND g."unlimited" = false AND g."minutesAvailable" > 0
          AND (g."expiresAt" IS NULL OR g."expiresAt" > ${now}) AND ${inScope(scope, 'f."primaryLocation"')}
        GROUP BY 1, 2`

      // Utilisation: taught minutes vs offered minutes (availability blocks × matching days in the period).
      const taughtRows: Array<{ location: string | null; minutes: bigint }> = await prisma.$queryRaw`
        SELECT s."location" AS location, SUM(EXTRACT(EPOCH FROM (s."endsAt" - s."startsAt")) / 60)::bigint AS minutes
        FROM "Session" s
        WHERE s."tutor" IS NOT NULL AND s."status" IN ('scheduled', 'in_progress', 'completed')
          AND s."startsAt" >= ${from} AND s."startsAt" < ${to} AND ${inScope(scope, 's."location"')}
        GROUP BY 1`
      const offeredRows: Array<{ location: string | null; minutes: bigint }> = await prisma.$queryRaw`
        SELECT a."location" AS location, SUM(a."endMinute" - a."startMinute")::bigint AS minutes
        FROM "TutorAvailability" a
        JOIN "Tutor" t ON t."id" = a."tutor" AND t."status" = 'active'
        JOIN generate_series(${from}::timestamp, ${to}::timestamp - interval '1 day', interval '1 day') AS d(day)
          ON EXTRACT(DOW FROM d.day) = a."weekday"
         AND (a."effectiveFrom" IS NULL OR a."effectiveFrom" <= d.day)
         AND (a."effectiveTo" IS NULL OR a."effectiveTo" >= d.day)
        WHERE a."endMinute" > a."startMinute" AND ${inScope(scope, 'a."location"')}
        GROUP BY 1`

      // Lead conversion: leads created in the period, and where they are now.
      const leadRows: Array<{ location: string | null; created: bigint; assessed: bigint; enrolled: bigint; lost: bigint }> = await prisma.$queryRaw`
        SELECT l."location" AS location, COUNT(*)::bigint AS created,
               COUNT(*) FILTER (WHERE l."status" IN ('assessment_booked', 'assessed', 'proposal_sent', 'enrolled'))::bigint AS assessed,
               COUNT(*) FILTER (WHERE l."status" = 'enrolled')::bigint AS enrolled,
               COUNT(*) FILTER (WHERE l."status" = 'lost')::bigint AS lost
        FROM "Lead" l
        WHERE l."createdAt" >= ${from} AND l."createdAt" < ${to} AND ${inScope(scope, 'l."location"')}
        GROUP BY 1`

      const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((a, r) => a + f(r), 0)
      const gross = sum(revenueRows, (r) => n(r.gross))
      const refunds = sum(revenueRows, (r) => n(r.refunds))
      const present = sum(attendanceRows, (r) => n(r.present))
      const finished = sum(attendanceRows, (r) => n(r.finished))
      const atStart = sum(churnRows, (r) => n(r.at_start))
      const ended = sum(churnRows, (r) => n(r.ended))
      const paidKinds = new Set(['membership_period', 'package'])
      const paidMinutes = sum(liabilityRows.filter((r) => paidKinds.has(r.kind)), (r) => n(r.minutes))
      const unpaidMinutes = sum(liabilityRows.filter((r) => !paidKinds.has(r.kind)), (r) => n(r.minutes))
      const liabilityCents = Math.round(sum(liabilityRows, (r) => (r.value_cents == null ? 0 : Number(r.value_cents))))
      const taught = sum(taughtRows, (r) => n(r.minutes))
      const offered = sum(offeredRows, (r) => n(r.minutes))
      const leadsCreated = sum(leadRows, (r) => n(r.created))
      const leadsEnrolled = sum(leadRows, (r) => n(r.enrolled))

      // Per location table: every location in scope, plus "no location" when it has rows.
      const keys = [...locations.map((l: any) => l.id as string | null)]
      const seenNull = [revenueRows, activeRows, attendanceRows, churnRows, liabilityRows, taughtRows, offeredRows, leadRows].some((rows: any[]) => rows.some((r) => r.location == null))
      if (seenNull && (scope.all || scope.includeUnlocated)) keys.push(null)
      const at = <T extends { location: string | null }>(rows: T[], k: string | null) => rows.filter((r) => (r.location ?? null) === k)
      const byLocation = keys.map((k) => {
        const rev = at(revenueRows, k); const att = at(attendanceRows, k); const ch = at(churnRows, k); const li = at(liabilityRows, k)
        const tg = at(taughtRows, k); const of = at(offeredRows, k); const ld = at(leadRows, k)
        return {
          locationId: k,
          name: k ? locations.find((l: any) => l.id === k)?.name ?? 'Other' : 'Online and in-home',
          revenue: sum(rev, (r) => n(r.gross) - n(r.refunds)),
          activeStudents: n(at(activeRows, k)[0]?.students),
          attendanceRate: pct(sum(att, (r) => n(r.present)), sum(att, (r) => n(r.finished))),
          churnRate: pct(sum(ch, (r) => n(r.ended)), sum(ch, (r) => n(r.at_start))),
          liabilityCents: Math.round(sum(li, (r) => (r.value_cents == null ? 0 : Number(r.value_cents)))),
          liabilityMinutes: sum(li, (r) => n(r.minutes)),
          utilisation: pct(sum(tg, (r) => n(r.minutes)), sum(of, (r) => n(r.minutes))),
          leadConversion: pct(sum(ld, (r) => n(r.enrolled)), sum(ld, (r) => n(r.created))),
        }
      })

      return {
        from: from.toISOString(), to: to.toISOString(),
        currency: business?.currency ?? 'USD',
        scope: scope.all ? 'all' : args.locationId ? 'location' : 'mine',
        locations,
        locationChoices: choices,
        definitions: REPORT_DEFINITIONS,
        revenue: {
          gross, refunds, net: gross - refunds,
          byMonth: revenueRows.map((r) => ({ month: r.month.toISOString().slice(0, 7), locationId: r.location, gross: n(r.gross), refunds: n(r.refunds), net: n(r.gross) - n(r.refunds) })),
        },
        activeStudents: n(activeTotal[0]?.students),
        attendance: { present, finished, rate: pct(present, finished) },
        churn: { atStart, ended, rate: pct(ended, atStart) },
        liability: {
          cents: liabilityCents, paidMinutes, unpaidMinutes,
          byKind: liabilityRows.reduce((acc: Record<string, { minutes: number; cents: number | null }>, r) => {
            const cur = acc[r.kind] ?? { minutes: 0, cents: paidKinds.has(r.kind) ? 0 : null }
            cur.minutes += n(r.minutes)
            if (cur.cents !== null) cur.cents += Math.round(r.value_cents == null ? 0 : Number(r.value_cents))
            acc[r.kind] = cur
            return acc
          }, {}),
        },
        utilisation: { taughtMinutes: taught, offeredMinutes: offered, rate: pct(taught, offered) },
        leads: {
          created: leadsCreated, enrolled: leadsEnrolled,
          assessedOrLater: sum(leadRows, (r) => n(r.assessed)), lost: sum(leadRows, (r) => n(r.lost)),
          rate: pct(leadsEnrolled, leadsCreated),
        },
        byLocation,
      }
    },

    async platformFamily(_: unknown, args: { id: string }, context: Ctx) {
      const actor = await actorOf(context)
      if (!actor) throw new CommandError('Sign in to continue.')
      const prisma = context.sudo().prisma
      const head = await prisma.family.findUnique({ where: { id: String(args.id) }, select: { id: true, primaryLocationId: true } })
      // Same answer for "missing" and "not yours", so ids cannot be probed.
      if (!head || !canAt(actor, 'canManageFamilies', head.primaryLocationId)) throw new CommandError('That family was not found.')
      const billing = canAt(actor, 'canManageBilling', head.primaryLocationId)
      const now = new Date()

      const family = await prisma.family.findUnique({
        where: { id: head.id },
        select: {
          id: true, name: true, status: true, billingEmail: true, phone: true,
          addressLine1: true, addressLine2: true, city: true, region: true, postalCode: true, country: true,
          secondGuardianName: true, secondGuardianEmail: true, secondGuardianPhone: true,
          payAsYouGoAllowed: true, notes: true, defaultPaymentMethodLabel: true, createdAt: true,
          primaryLocation: { select: { id: true, name: true } },
          guardians: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true } },
          students: {
            orderBy: { firstName: 'asc' },
            select: {
              id: true, firstName: true, lastName: true, status: true, school: true, dateOfBirth: true,
              learningNotes: true, medicalNotes: true, pickupPeople: true,
              level: { select: { id: true, name: true } },
              enrolments: {
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true, status: true, mode: true, fundingType: true, startDate: true, endDate: true, rematchCount: true,
                  program: { select: { id: true, name: true } }, location: { select: { id: true, name: true } },
                  tutor: { select: { id: true, displayName: true } }, plan: { select: { id: true, status: true } },
                },
              },
            },
          },
        },
      })

      const [memberships, grants, invoices, messages, tasks, reviews, upcoming] = await Promise.all([
        billing ? prisma.membership.findMany({
          where: { familyId: head.id }, orderBy: { createdAt: 'desc' },
          select: {
            id: true, status: true, price: true, discountPercent: true, sessionsPerPeriod: true, currentPeriodStart: true, currentPeriodEnd: true,
            pausedFrom: true, pausedUntil: true, cancelRequestedAt: true, endsAt: true, pastDueSince: true,
            plan: { select: { id: true, name: true, programId: true } }, pendingPlan: { select: { id: true, name: true } }, student: { select: { id: true, firstName: true } },
          },
        }) : null,
        billing ? prisma.creditGrant.findMany({
          where: { familyId: head.id }, orderBy: { createdAt: 'desc' }, take: 40,
          select: {
            id: true, kind: true, status: true, minutesGranted: true, minutesAvailable: true, unlimited: true, weeklyCap: true,
            expiresAt: true, periodStart: true, periodEnd: true, createdAt: true,
            student: { select: { id: true, firstName: true } }, program: { select: { id: true, name: true } },
            entries: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, type: true, minutes: true, note: true, createdAt: true, bookingId: true } },
          },
        }) : null,
        billing ? prisma.invoice.findMany({
          where: { familyId: head.id }, orderBy: { createdAt: 'desc' }, take: 40,
          select: {
            id: true, number: true, status: true, kind: true, issuedAt: true, dueAt: true, total: true, amountPaid: true, amountCredited: true, currency: true,
            payments: { select: { id: true, amount: true, refundedAmount: true, method: true, status: true, createdAt: true } },
          },
        }) : null,
        prisma.message.findMany({
          where: { familyId: head.id }, orderBy: { createdAt: 'desc' }, take: 40,
          select: { id: true, direction: true, channel: true, subject: true, body: true, visibleToFamily: true, createdAt: true, sender: { select: { name: true } } },
        }),
        prisma.task.findMany({
          where: { familyId: head.id }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 40,
          select: { id: true, kind: true, title: true, status: true, dueAt: true, outcomeNote: true, completedAt: true, owner: { select: { name: true } }, student: { select: { firstName: true } } },
        }),
        prisma.review.findMany({
          where: { familyId: head.id }, orderBy: { createdAt: 'desc' },
          select: { id: true, rating: true, text: true, source: true, status: true, authorName: true, createdAt: true, tutor: { select: { displayName: true } } },
        }),
        prisma.booking.findMany({
          where: { familyId: head.id, startsAt: { gte: now }, status: 'booked' }, orderBy: { startsAt: 'asc' }, take: 20,
          select: {
            id: true, startsAt: true, endsAt: true, status: true, student: { select: { firstName: true } },
            session: { select: { id: true, mode: true, program: { select: { name: true } }, tutor: { select: { displayName: true } }, location: { select: { name: true } } } },
          },
        }),
      ])

      // Times on the family page are shown in the home centre's zone (or the first centre's).
      const zone = head.primaryLocationId
        ? (await prisma.location.findUnique({ where: { id: head.primaryLocationId }, select: { timezone: true } }))?.timezone
        : (await prisma.location.findFirst({ orderBy: { createdAt: 'asc' }, select: { timezone: true } }))?.timezone
      const business = await prisma.business.findFirst({ select: { currency: true } })

      return {
        timezone: zone || 'UTC', currency: business?.currency ?? 'USD',
        family, billing, memberships, grants, invoices, messages, tasks, reviews, upcoming,
        can: {
          manageBilling: billing,
          issueRefunds: canAt(actor, 'canIssueRefunds', head.primaryLocationId),
          manageSchedule: canAt(actor, 'canManageSchedule', head.primaryLocationId),
          owner: isOwnerActor(actor),
        },
      }
    },
  },
}
