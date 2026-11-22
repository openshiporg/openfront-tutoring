/**
 * Storefront read queries (§5.9): the public catalogue and the guardian's own records.
 *
 * Public queries read published rows only, through sudo, and return only public fields
 * (no pay rates, no family data, no staff notes). Guardian queries resolve the family from
 * the signed-in user (`family.guardians` contains the session user) BEFORE reading anything.
 *
 * Shapes are returned as JSON; `features/storefront/lib/types.ts` documents them.
 */
const gql = String.raw

export const typeDefs = gql`
  type Query {
    storefrontBusiness: JSON
    storefrontPrograms(subject: String, level: String, mode: String): JSON
    storefrontProgram(slug: String!): JSON
    storefrontLocations: JSON
    storefrontLocation(slug: String!): JSON
    storefrontTutors(filter: JSON): JSON
    storefrontTutor(slug: String!): JSON
    storefrontPricing: JSON
    enrolmentOptions(programId: ID!): JSON
    storefrontPolicies: JSON
    assessmentSlots(programId: ID!, locationId: ID, mode: String, from: String, to: String): JSON
    openSessions(programId: ID, locationId: ID, from: String, to: String): JSON
    myFamily: JSON
    myStudent(id: ID!): JSON
    myUpcomingBookings(includePast: Boolean, studentId: ID): JSON
    myBooking(id: ID!): JSON
    myAssessment(id: ID!): JSON
    myEnrolment(id: ID!): JSON
    myCredits: JSON
    myInvoices: JSON
    myInvoice(id: ID!): JSON
  }
`

type Ctx = any
const DAY = 86_400_000
const ACTIVE_BOOKING = ['booked', 'attended', 'late', 'cancelled_late', 'cancelled_late_excused', 'no_show']

// ---------------------------------------------------------------- time zones
/** Offset (ms) of `tz` at instant `t`: local wall time minus UTC. */
export function tzOffset(t: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(t))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(t / 1000) * 1000
}
/** The UTC instant of local (y, m, d, minuteOfDay) in `tz`. */
export function zonedTime(y: number, m: number, d: number, minute: number, tz: string) {
  const guess = Date.UTC(y, m, d, 0, minute)
  const first = guess - tzOffset(guess, tz)
  return first - (tzOffset(first, tz) - tzOffset(guess, tz))
}
function localDay(t: number, tz: string) {
  const local = new Date(t + tzOffset(t, tz))
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), weekday: local.getUTCDay() }
}

// ---------------------------------------------------------------- helpers
async function imageUrl(context: Ctx, id?: string | null, ext?: string | null) {
  if (!id || !ext) return null
  try { return await context.images('my_images').getUrl(id, ext) } catch { return null }
}
const sinceAndUntil = (from?: string | null, to?: string | null, days = 28) => {
  const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : new Date()
  const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : new Date(start.getTime() + days * DAY)
  return { start, end: new Date(Math.min(end.getTime(), start.getTime() + 62 * DAY)) }
}
async function defaultTimezone(prisma: any) {
  const loc = await prisma.location.findFirst({ where: { status: 'active' }, orderBy: { createdAt: 'asc' }, select: { timezone: true } })
  return loc?.timezone || 'America/New_York'
}
const publicLocation = { id: true, name: true, slug: true, city: true, region: true, timezone: true, status: true }

async function programCard(context: Ctx, p: any) {
  return {
    id: p.id, name: p.name, slug: p.slug, summary: p.summary,
    image: await imageUrl(context, p.image_id, p.image_extension),
    format: p.format, deliveryModes: Array.isArray(p.deliveryModes) ? p.deliveryModes : [],
    sessionMinutes: p.sessionMinutes, maxStudentsPerSession: p.maxStudentsPerSession,
    requiresAssessment: p.requiresAssessment, assessmentFee: p.assessmentFee, assessmentMinutes: p.assessmentMinutes,
    payAsYouGoPrice: p.payAsYouGoPrice, featured: p.featured, billingModel: p.billingModel, placementFee: p.placementFee,
    subjects: (p.subjects ?? []).map((s: any) => ({ id: s.id, name: s.name, slug: s.slug, category: s.category })),
    levelsFrom: p.levelsFrom ? { id: p.levelsFrom.id, name: p.levelsFrom.name } : null,
    levelsTo: p.levelsTo ? { id: p.levelsTo.id, name: p.levelsTo.name } : null,
    locations: (p.locations ?? []).filter((l: any) => l.status !== 'closed').map((l: any) => ({ id: l.id, name: l.name, slug: l.slug, city: l.city })),
    fromPrice: Math.min(...[...(p.plans ?? []).map((x: any) => x.price), ...(p.packages ?? []).map((x: any) => x.price)].filter((n) => n > 0), Number.MAX_SAFE_INTEGER),
  }
}
const programInclude = {
  subjects: { orderBy: { sortOrder: 'asc' } }, levelsFrom: true, levelsTo: true,
  locations: { select: { id: true, name: true, slug: true, city: true, status: true } },
  plans: { where: { status: 'published' }, select: { price: true } },
  packages: { where: { status: 'published' }, select: { price: true } },
}
const planOut = (p: any) => ({ id: p.id, name: p.name, sessionsPerPeriod: p.sessionsPerPeriod, weeklyCapForUnlimited: p.weeklyCapForUnlimited, price: p.price, enrolmentFee: p.enrolmentFee, minimumTermMonths: p.minimumTermMonths, description: p.description, features: Array.isArray(p.features) ? p.features : [], highlight: p.highlight, programId: p.programId })
const packageOut = (p: any) => ({ id: p.id, name: p.name, hours: p.hours, price: p.price, pricePerHour: p.hours ? Math.round(p.price / p.hours) : 0, expiryMonths: p.expiryMonths, description: p.description, programId: p.programId })

async function tutorCard(context: Ctx, t: any, ratings: Map<string, { avg: number; count: number }>) {
  const r = ratings.get(t.id)
  return {
    id: t.id, slug: t.slug, displayName: t.displayName, headline: t.headline,
    photo: (await imageUrl(context, t.photo_id, t.photo_extension)) || t.photoUrl || null,
    yearsExperience: t.yearsExperience, education: t.education,
    deliveryModes: Array.isArray(t.deliveryModes) ? t.deliveryModes : [], travelAreas: t.travelAreas,
    subjects: (t.subjects ?? []).map((s: any) => ({ id: s.subject?.id, name: s.subject?.name, slug: s.subject?.slug, levelFrom: s.levelFrom?.name ?? null, levelTo: s.levelTo?.name ?? null })).filter((s: any) => s.id),
    locations: (t.locations ?? []).map((l: any) => ({ id: l.id, name: l.name, slug: l.slug })),
    averageRating: r ? Math.round(r.avg * 10) / 10 : null, reviewCount: r?.count ?? 0,
  }
}
const tutorInclude = { subjects: { include: { subject: true, levelFrom: true, levelTo: true } }, locations: { select: { id: true, name: true, slug: true } } }
async function ratingsFor(prisma: any, ids: string[]) {
  const rows = await prisma.review.groupBy({ by: ['tutorId'], where: { tutorId: { in: ids }, status: 'published' }, _avg: { rating: true }, _count: { _all: true } })
  return new Map<string, { avg: number; count: number }>(rows.map((r: any) => [r.tutorId, { avg: r._avg.rating ?? 0, count: r._count._all }]))
}
const reviewOut = (r: any) => ({ id: r.id, authorName: r.authorName, rating: r.rating, text: r.text, tutor: r.tutor ? { name: r.tutor.displayName, slug: r.tutor.slug } : null, program: r.program ? { name: r.program.name, slug: r.program.slug } : null, location: r.location ? { name: r.location.name } : null, createdAt: r.createdAt })

/** The signed-in guardian's family id, or null. */
async function myFamilyId(context: Ctx): Promise<string | null> {
  const userId = context.session?.itemId
  if (!userId) return null
  const family = await context.sudo().prisma.family.findFirst({ where: { guardians: { some: { id: userId } } }, select: { id: true } })
  return family?.id ?? null
}

function sessionOut(s: any) {
  return {
    id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, mode: s.mode, status: s.status, capacity: s.capacity, isTrial: s.isTrial,
    program: s.program ? { id: s.program.id, name: s.program.name, slug: s.program.slug, format: s.program.format } : null,
    subject: s.subject ? { name: s.subject.name } : null,
    location: s.location ? { id: s.location.id, name: s.location.name, slug: s.location.slug, timezone: s.location.timezone } : null,
    room: s.room ? { name: s.room.name } : null,
    tutor: s.tutor ? { id: s.tutor.id, displayName: s.tutor.displayName, slug: s.tutor.publicProfile ? s.tutor.slug : null } : null,
  }
}
const sessionInclude = { program: true, subject: true, location: true, room: true, tutor: { select: { id: true, displayName: true, slug: true, publicProfile: true } } }

// ---------------------------------------------------------------- resolvers
export const resolvers = {
  Query: {
    async storefrontBusiness(_: unknown, __: unknown, context: Ctx) {
      const prisma = context.sudo().prisma
      const [business, settings, featured, locations, reviews] = await Promise.all([
        prisma.business.findUnique({ where: { id: 1 } }),
        prisma.businessSettings.findUnique({ where: { id: 1 } }),
        prisma.program.findMany({ where: { status: 'published', featured: true }, include: programInclude, orderBy: { createdAt: 'asc' }, take: 6 }),
        prisma.location.findMany({ where: { status: { in: ['active', 'coming_soon'] } }, select: { ...publicLocation, addressLine1: true, phone: true }, orderBy: { name: 'asc' } }),
        prisma.review.findMany({ where: { status: 'published' }, include: { tutor: true, program: true, location: true }, orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }], take: 6 }),
      ])
      if (!business || !business.name) return null
      const [tutorStats, reviewStats, programCount] = await Promise.all([
        prisma.tutor.aggregate({ where: { status: 'active', publicProfile: true }, _count: { _all: true }, _avg: { yearsExperience: true } }),
        prisma.review.aggregate({ where: { status: 'published' }, _count: { _all: true }, _avg: { rating: true } }),
        prisma.program.count({ where: { status: 'published' } }),
      ])
      return {
        stats: {
          tutors: tutorStats._count._all, averageYearsExperience: Math.round(tutorStats._avg.yearsExperience ?? 0),
          reviews: reviewStats._count._all, averageRating: reviewStats._avg.rating ? Math.round(reviewStats._avg.rating * 10) / 10 : null,
          programs: programCount, locations: locations.filter((l: any) => l.status === 'active').length,
        },
        name: business.name, legalName: business.legalName, about: business.about, kind: business.kind,
        logo: await imageUrl(context, business.logo_id, business.logo_extension),
        currency: business.currency, country: business.country, supportEmail: business.supportEmail, careersEmail: business.careersEmail, phone: business.phone,
        socialLinks: business.socialLinks ?? {},
        // Marketing copy lives in socialLinks/about until a dedicated field exists; claims are only shown when set.
        homepage: (business as any).homepage ?? null,
        policiesSet: Boolean(settings?.policiesText),
        featuredPrograms: await Promise.all(featured.map((p: any) => programCard(context, p))),
        locations,
        reviews: reviews.map(reviewOut),
      }
    },

    async storefrontPrograms(_: unknown, args: { subject?: string; level?: string; mode?: string }, context: Ctx) {
      const prisma = context.sudo().prisma
      const where: any = { status: 'published' }
      if (args.subject) where.subjects = { some: { slug: args.subject } }
      const rows = await prisma.program.findMany({ where, include: programInclude, orderBy: [{ featured: 'desc' }, { name: 'asc' }] })
      let filtered = rows
      if (args.mode) filtered = filtered.filter((p: any) => Array.isArray(p.deliveryModes) && p.deliveryModes.includes(args.mode))
      if (args.level) {
        const level = await prisma.level.findFirst({ where: { OR: [{ id: args.level }, { name: args.level }] } })
        if (level) filtered = filtered.filter((p: any) => (!p.levelsFrom || p.levelsFrom.sortOrder <= level.sortOrder) && (!p.levelsTo || p.levelsTo.sortOrder >= level.sortOrder))
      }
      const [subjects, levels] = await Promise.all([
        prisma.subject.findMany({ where: { programs: { some: { status: 'published' } } }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true, category: true } }),
        prisma.level.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, kind: true } }),
      ])
      return { programs: await Promise.all(filtered.map((p: any) => programCard(context, p))), subjects, levels }
    },

    async storefrontProgram(_: unknown, { slug }: { slug: string }, context: Ctx) {
      const prisma = context.sudo().prisma
      const p = await prisma.program.findFirst({
        where: { slug, status: 'published' },
        include: { ...programInclude, plans: { where: { status: 'published' }, orderBy: { sortOrder: 'asc' } }, packages: { where: { status: 'published' }, orderBy: { sortOrder: 'asc' } } },
      })
      if (!p) return null
      const [tutors, reviews, settings] = await Promise.all([
        prisma.tutor.findMany({ where: { status: 'active', publicProfile: true, subjects: { some: { subjectId: { in: p.subjects.map((s: any) => s.id) } } } }, include: tutorInclude, take: 6, orderBy: { yearsExperience: 'desc' } }),
        prisma.review.findMany({ where: { status: 'published', programId: p.id }, include: { tutor: true, program: true, location: true }, orderBy: { createdAt: 'desc' }, take: 6 }),
        prisma.businessSettings.findUnique({ where: { id: 1 } }),
      ])
      const ratings = await ratingsFor(prisma, tutors.map((t: any) => t.id))
      return {
        ...(await programCard(context, p)),
        description: p.description, outcomes: p.outcomes, faq: Array.isArray(p.faq) ? p.faq : [], allowsTrial: p.allowsTrial,
        plans: p.plans.map(planOut), packages: p.packages.map(packageOut),
        tutors: await Promise.all(tutors.map((t: any) => tutorCard(context, t, ratings))),
        reviews: reviews.map(reviewOut),
        siblingDiscountPercent: settings?.siblingDiscountPercent ?? 10,
      }
    },

    /** Weekly class times (open group series) a family can pick at enrolment, with seats left. */
    async enrolmentOptions(_: unknown, { programId }: { programId: string }, context: Ctx) {
      const prisma = context.sudo().prisma
      const now = new Date()
      const series = await prisma.sessionSeries.findMany({
        where: { programId, status: 'active', enrollmentId: null, OR: [{ endDate: null }, { endDate: { gt: now } }], program: { status: 'published' } },
        include: { location: { select: { id: true, name: true, slug: true, timezone: true, status: true } }, subject: { select: { name: true } }, tutor: { select: { displayName: true, publicProfile: true } } },
        orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
      })
      const live = series.filter((s: any) => !s.location || s.location.status !== 'closed')
      // Seats left = capacity minus booked seats on the next upcoming session of the series.
      const out = await Promise.all(live.map(async (s: any) => {
        const next = await prisma.session.findFirst({ where: { seriesId: s.id, status: 'scheduled', startsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true, capacity: true, _count: { select: { bookings: { where: { status: 'booked' } } } } } })
        const capacity = next?.capacity ?? s.capacity
        return {
          id: s.id, weekday: s.weekday, startMinute: s.startMinute, minutes: s.minutes, mode: s.mode,
          location: s.location ? { id: s.location.id, name: s.location.name, slug: s.location.slug } : null,
          timezone: s.location?.timezone || (await defaultTimezone(prisma)), subject: s.subject?.name ?? null,
          tutor: s.tutor?.publicProfile ? s.tutor.displayName : null,
          capacity, seatsLeft: Math.max(0, capacity - (next?._count.bookings ?? 0)), nextStartsAt: next?.startsAt ?? null,
        }
      }))
      return { series: out }
    },

    async storefrontLocations(_: unknown, __: unknown, context: Ctx) {
      const prisma = context.sudo().prisma
      const rows = await prisma.location.findMany({
        where: { status: { in: ['active', 'coming_soon'] } }, orderBy: { name: 'asc' },
        include: { programs: { where: { status: 'published' }, select: { id: true, name: true, slug: true } } },
      })
      return Promise.all(rows.map(async (l: any) => locationOut(context, l)))
    },

    async storefrontLocation(_: unknown, { slug }: { slug: string }, context: Ctx) {
      const prisma = context.sudo().prisma
      const l = await prisma.location.findFirst({
        where: { slug, status: { in: ['active', 'coming_soon'] } },
        include: { programs: { where: { status: 'published' }, include: programInclude } },
      })
      if (!l) return null
      const [tutors, reviews, closures] = await Promise.all([
        prisma.tutor.findMany({ where: { status: 'active', publicProfile: true, locations: { some: { id: l.id } } }, include: tutorInclude, orderBy: { displayName: 'asc' } }),
        prisma.review.findMany({ where: { status: 'published', locationId: l.id }, include: { tutor: true, program: true, location: true }, orderBy: { createdAt: 'desc' }, take: 6 }),
        prisma.closure.findMany({ where: { locationId: l.id, endsOn: { gte: new Date() } }, orderBy: { startsOn: 'asc' }, take: 5, select: { startsOn: true, endsOn: true, reason: true } }),
      ])
      const ratings = await ratingsFor(prisma, tutors.map((t: any) => t.id))
      return {
        ...(await locationOut(context, l)),
        programs: await Promise.all(l.programs.map((p: any) => programCard(context, p))),
        tutors: await Promise.all(tutors.map((t: any) => tutorCard(context, t, ratings))),
        reviews: reviews.map(reviewOut),
        closures,
      }
    },

    async storefrontTutors(_: unknown, { filter }: { filter?: any }, context: Ctx) {
      const prisma = context.sudo().prisma
      const where: any = { status: 'active', publicProfile: true }
      if (filter?.subject) where.subjects = { some: { subject: { slug: String(filter.subject) } } }
      if (filter?.location) where.locations = { some: { slug: String(filter.location) } }
      let rows = await prisma.tutor.findMany({ where, include: tutorInclude, orderBy: { displayName: 'asc' } })
      if (filter?.mode) rows = rows.filter((t: any) => Array.isArray(t.deliveryModes) && t.deliveryModes.includes(String(filter.mode)))
      const ratings = await ratingsFor(prisma, rows.map((t: any) => t.id))
      const [subjects, locations] = await Promise.all([
        prisma.subject.findMany({ orderBy: { sortOrder: 'asc' }, select: { name: true, slug: true } }),
        prisma.location.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' }, select: { name: true, slug: true } }),
      ])
      return { tutors: await Promise.all(rows.map((t: any) => tutorCard(context, t, ratings))), subjects, locations }
    },

    async storefrontTutor(_: unknown, { slug }: { slug: string }, context: Ctx) {
      const prisma = context.sudo().prisma
      const t = await prisma.tutor.findFirst({ where: { slug, status: 'active', publicProfile: true }, include: tutorInclude })
      if (!t) return null
      const ratings = await ratingsFor(prisma, [t.id])
      const reviews = await prisma.review.findMany({ where: { status: 'published', tutorId: t.id }, include: { tutor: true, program: true, location: true }, orderBy: { createdAt: 'desc' }, take: 10 })
      const subjectIds = t.subjects.map((s: any) => s.subjectId)
      const programs = await prisma.program.findMany({ where: { status: 'published', subjects: { some: { id: { in: subjectIds } } } }, include: programInclude, orderBy: { name: 'asc' } })
      return {
        ...(await tutorCard(context, t, ratings)),
        bio: t.bio,
        reviews: reviews.map(reviewOut),
        programs: await Promise.all(programs.map((p: any) => programCard(context, p))),
      }
    },

    async storefrontPricing(_: unknown, __: unknown, context: Ctx) {
      const prisma = context.sudo().prisma
      const [programs, settings, business] = await Promise.all([
        prisma.program.findMany({
          where: { status: 'published' }, orderBy: [{ featured: 'desc' }, { name: 'asc' }],
          include: { ...programInclude, plans: { where: { status: 'published' }, orderBy: { sortOrder: 'asc' } }, packages: { where: { status: 'published' }, orderBy: { sortOrder: 'asc' } } },
        }),
        prisma.businessSettings.findUnique({ where: { id: 1 } }),
        prisma.business.findUnique({ where: { id: 1 }, select: { currency: true } }),
      ])
      return {
        currency: business?.currency || 'USD',
        siblingDiscountPercent: settings?.siblingDiscountPercent ?? 10,
        cancellationWindowHours: settings?.cancellationWindowHours ?? 24,
        membershipCancelNoticeDays: settings?.membershipCancelNoticeDays ?? 30,
        programs: await Promise.all(programs.map(async (p: any) => ({ ...(await programCard(context, p)), plans: p.plans.map(planOut), packages: p.packages.map(packageOut) }))),
      }
    },

    /** Live policy numbers from settings (§6.1 P15): shown on /policies and at checkout. */
    async storefrontPolicies(_: unknown, __: unknown, context: Ctx) {
      const prisma = context.sudo().prisma
      const [s, business] = await Promise.all([
        prisma.businessSettings.findUnique({ where: { id: 1 } }),
        prisma.business.findUnique({ where: { id: 1 }, select: { name: true, supportEmail: true, phone: true } }),
      ])
      const pick = (key: string, fallback: unknown) => (s && s[key] !== null && s[key] !== undefined ? s[key] : fallback)
      return {
        businessName: business?.name ?? '', supportEmail: business?.supportEmail ?? '', phone: business?.phone ?? '',
        cancellationWindowHours: pick('cancellationWindowHours', 24), lateCancelCharged: pick('lateCancelCharged', true), noShowCharged: pick('noShowCharged', true),
        excusedAbsencesPerMonth: pick('excusedAbsencesPerMonth', 1), makeUpExpiryDays: pick('makeUpExpiryDays', 60), membershipRolloverPeriods: pick('membershipRolloverPeriods', 1),
        membershipCancelNoticeDays: pick('membershipCancelNoticeDays', 30), pauseMinDays: pick('pauseMinDays', 14), pauseMaxDays: pick('pauseMaxDays', 28), pausesPerYear: pick('pausesPerYear', 1),
        siblingDiscountPercent: pick('siblingDiscountPercent', 10), freeRematches: pick('freeRematches', 1), assessmentCancelRefundHours: pick('assessmentCancelRefundHours', 24),
        assessmentFeeKeptOnLateCancel: pick('assessmentFeeKeptOnLateCancel', true), suspendAfterDays: pick('suspendAfterDays', 10), enrolmentFeeWaivedWithinDays: pick('enrolmentFeeWaivedWithinDays', 90),
        policiesText: pick('policiesText', ''),
      }
    },

    /**
     * Real assessment availability: for each assessor who teaches one of the programme's subjects
     * and is available in that mode (and at that location for in-centre), every start on the
     * assessment-length grid inside their availability, minus their sessions, assessments, time off
     * and the location's closures. Mirrors the `slotKey` "<tutorId>:<startISO>" used by bookAssessment.
     */
    async assessmentSlots(_: unknown, args: { programId: string; locationId?: string | null; mode?: string | null; from?: string | null; to?: string | null }, context: Ctx) {
      const prisma = context.sudo().prisma
      const program = await prisma.program.findFirst({ where: { id: args.programId, status: 'published' }, include: { subjects: { select: { id: true } }, locations: { select: { id: true } } } })
      if (!program) return { slots: [], reason: 'That programme is not available.' }
      const mode = args.mode || (args.locationId ? 'in_centre' : 'online')
      const modes: string[] = Array.isArray(program.deliveryModes) ? program.deliveryModes : []
      if (!modes.includes(mode)) return { slots: [], reason: 'This programme is not offered that way.' }
      let location: any = null
      if (mode === 'in_centre') {
        if (!args.locationId) return { slots: [], reason: 'Choose a centre.' }
        location = await prisma.location.findFirst({ where: { id: args.locationId, status: 'active' } })
        if (!location) return { slots: [], reason: 'That centre is not taking bookings.' }
      }
      const tz = location?.timezone || (await defaultTimezone(prisma))
      const minutes = program.assessmentMinutes || 45
      const { start, end } = sinceAndUntil(args.from, args.to, 14)
      const earliest = Math.max(start.getTime(), Date.now() + 12 * 3600_000)

      const subjectIds = program.subjects.map((s: any) => s.id)
      const tutors = await prisma.tutor.findMany({
        where: {
          status: 'active',
          ...(subjectIds.length ? { subjects: { some: { subjectId: { in: subjectIds } } } } : {}),
          ...(location ? { locations: { some: { id: location.id } } } : {}),
        },
        select: {
          id: true, displayName: true, deliveryModes: true,
          availability: { where: { mode, ...(location ? { OR: [{ locationId: location.id }, { locationId: null }] } : {}) } },
        },
      })
      const usable = tutors.filter((t: any) => Array.isArray(t.deliveryModes) && t.deliveryModes.includes(mode) && t.availability.length)
      if (!usable.length) return { slots: [], timezone: tz, reason: 'No assessor is available for this choice yet.' }
      const tutorIds = usable.map((t: any) => t.id)
      const [sessions, assessments, timeOff, closures] = await Promise.all([
        prisma.session.findMany({ where: { tutorId: { in: tutorIds }, status: { in: ['scheduled', 'in_progress', 'needs_cover'] }, startsAt: { lt: end }, endsAt: { gt: start } }, select: { tutorId: true, startsAt: true, endsAt: true } }),
        prisma.assessment.findMany({ where: { assessorId: { in: tutorIds }, status: { in: ['scheduled', 'in_progress'] }, scheduledAt: { lt: end, gt: new Date(start.getTime() - 4 * 3600_000) } }, select: { assessorId: true, scheduledAt: true, minutes: true } }),
        prisma.tutorTimeOff.findMany({ where: { tutorId: { in: tutorIds }, status: { in: ['approved', 'requested'] }, startsAt: { lt: end }, endsAt: { gt: start } }, select: { tutorId: true, startsAt: true, endsAt: true } }),
        location ? prisma.closure.findMany({ where: { locationId: location.id, startsOn: { lt: end }, endsOn: { gte: start } }, select: { startsOn: true, endsOn: true } }) : Promise.resolve([]),
      ])
      const busy = new Map<string, Array<[number, number]>>()
      const add = (id: string, a: number, b: number) => { if (!busy.has(id)) busy.set(id, []); busy.get(id)!.push([a, b]) }
      sessions.forEach((s: any) => add(s.tutorId, s.startsAt.getTime(), s.endsAt.getTime()))
      assessments.forEach((a: any) => add(a.assessorId, a.scheduledAt.getTime(), a.scheduledAt.getTime() + a.minutes * 60_000))
      timeOff.forEach((o: any) => add(o.tutorId, o.startsAt.getTime(), o.endsAt.getTime()))
      const closed = (a: number, b: number) => closures.some((c: any) => a < c.endsOn.getTime() + DAY && b > c.startsOn.getTime())

      const byStart = new Map<number, { startsAt: string; endsAt: string; tutorId: string; tutorName: string }>()
      for (let t = start.getTime(); t < end.getTime(); t += DAY) {
        const { y, m, d, weekday } = localDay(t, tz)
        for (const tutor of usable) {
          for (const window of tutor.availability) {
            if (window.weekday !== weekday) continue
            if (window.effectiveFrom && window.effectiveFrom.getTime() > t + DAY) continue
            if (window.effectiveTo && window.effectiveTo.getTime() < t) continue
            for (let minute = window.startMinute; minute + minutes <= window.endMinute; minute += 30) {
              const a = zonedTime(y, m, d, minute, tz)
              const b = a + minutes * 60_000
              if (a < earliest || a >= end.getTime() || byStart.has(a)) continue
              if (closed(a, b)) continue
              if ((busy.get(tutor.id) ?? []).some(([x, y2]) => a < y2 && b > x)) continue
              byStart.set(a, { startsAt: new Date(a).toISOString(), endsAt: new Date(b).toISOString(), tutorId: tutor.id, tutorName: tutor.displayName })
            }
          }
        }
      }
      const slots = Array.from(byStart.entries()).sort((x, y) => x[0] - y[0]).map(([, v]) => v)
      return { slots, timezone: tz, minutes, fee: program.assessmentFee, location: location ? { id: location.id, name: location.name } : null }
    },

    async openSessions(_: unknown, args: { programId?: string | null; locationId?: string | null; from?: string | null; to?: string | null }, context: Ctx) {
      const prisma = context.sudo().prisma
      const { start, end } = sinceAndUntil(args.from, args.to, 14)
      const rows = await prisma.session.findMany({
        where: {
          status: 'scheduled', startsAt: { gte: new Date(Math.max(start.getTime(), Date.now())), lt: end },
          program: { status: 'published', format: { in: ['small_group', 'class'] } },
          series: { enrollmentId: null },
          ...(args.programId ? { programId: args.programId } : {}),
          ...(args.locationId ? (args.locationId === 'online' ? { mode: 'online' } : { locationId: args.locationId }) : {}),
        },
        include: sessionInclude, orderBy: { startsAt: 'asc' }, take: 300,
      })
      const counts = await prisma.booking.groupBy({ by: ['sessionId'], where: { sessionId: { in: rows.map((s: any) => s.id) }, status: { in: ACTIVE_BOOKING } }, _count: { _all: true } })
      const booked = new Map(counts.map((c: any) => [c.sessionId, c._count._all]))
      const [programs, locations] = await Promise.all([
        prisma.program.findMany({ where: { status: 'published', format: { in: ['small_group', 'class'] } }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } }),
        prisma.location.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, timezone: true } }),
      ])
      return {
        timezone: await defaultTimezone(prisma),
        programs, locations,
        sessions: rows.map((s: any) => ({ ...sessionOut(s), seatsLeft: Math.max(0, s.capacity - Number(booked.get(s.id) ?? 0)) })),
      }
    },

    // ------------------------------------------------------------ guardian
    async myFamily(_: unknown, __: unknown, context: Ctx) {
      const userId = context.session?.itemId
      if (!userId) return null
      const prisma = context.sudo().prisma
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true, notifyByEmail: true, role: { select: { canAccessDashboard: true } } } })
      if (!user) return null
      const familyId = await myFamilyId(context)
      const base = { user: { id: user.id, name: user.name, email: user.email, phone: user.phone, notifyByEmail: user.notifyByEmail, isStaff: Boolean(user.role?.canAccessDashboard) } }
      if (!familyId) return { ...base, family: null }
      const now = new Date()
      const [family, grants, openInvoices, unreadReports, nextBookings, assessments, proposedPlans, settings] = await Promise.all([
        prisma.family.findUnique({
          where: { id: familyId },
          include: {
            primaryLocation: { select: { id: true, name: true } },
            students: { orderBy: { createdAt: 'asc' }, include: { level: true, enrolments: { where: { status: { notIn: ['cancelled', 'ended'] } }, include: { program: { select: { id: true, name: true, slug: true, format: true } }, tutor: { select: { id: true, displayName: true, slug: true, publicProfile: true } }, offers: { where: { status: 'accepted' }, select: { id: true } } } } } },
            memberships: { where: { status: { not: 'cancelled' } }, include: { plan: { include: { program: { select: { name: true, slug: true } } } }, student: { select: { firstName: true } } }, orderBy: { createdAt: 'desc' } },
          },
        }),
        prisma.creditGrant.findMany({ where: { familyId, status: 'active' }, include: { program: { select: { name: true } }, student: { select: { id: true, firstName: true } } } }),
        prisma.invoice.findMany({ where: { familyId, status: { in: ['open', 'partially_paid'] } }, select: { id: true, number: true, total: true, amountPaid: true, dueAt: true, currency: true } }),
        prisma.sessionReport.count({ where: { booking: { familyId }, publishedAt: { not: null }, guardianSeenAt: null } }),
        prisma.booking.findMany({ where: { familyId, status: 'booked', session: { startsAt: { gte: new Date(now.getTime() - 2 * 3600_000) } } }, include: { student: { select: { id: true, firstName: true } }, session: { include: sessionInclude } }, orderBy: { session: { startsAt: 'asc' } }, take: 8 }),
        prisma.assessment.findMany({ where: { familyId, status: 'scheduled', scheduledAt: { gte: now } }, include: { program: { select: { name: true } }, location: { select: { name: true, timezone: true } }, student: { select: { firstName: true } } }, orderBy: { scheduledAt: 'asc' } }),
        prisma.learningPlan.findMany({ where: { student: { familyId }, status: 'proposed' }, select: { id: true, student: { select: { firstName: true } }, program: { select: { name: true, slug: true } } } }),
        prisma.businessSettings.findUnique({ where: { id: 1 } }),
      ])
      if (!family) return { ...base, family: null }
      const lowBalance = settings?.lowBalanceMinutes ?? 120
      const perStudent = new Map<string, number>()
      grants.forEach((g: any) => { if (!g.unlimited && g.studentId) perStudent.set(g.studentId, (perStudent.get(g.studentId) ?? 0) + (g.minutesAvailable ?? 0)) })
      const alerts: Array<{ kind: string; message: string; href: string }> = []
      family.memberships.filter((m: any) => ['past_due', 'suspended'].includes(m.status)).forEach((m: any) => alerts.push({ kind: 'payment_failed', message: `The payment for ${m.student?.firstName ?? 'your'} ${m.plan?.name ?? 'membership'} did not go through. Pay the open invoice to keep booking.`, href: '/account/billing' }))
      openInvoices.forEach((i: any) => alerts.push({ kind: 'invoice_open', message: `Invoice ${i.number ?? ''} is open.`, href: `/account/billing/invoices/${i.id}` }))
      family.students.forEach((s: any) => {
        const left = perStudent.get(s.id)
        const hasPackage = grants.some((g: any) => g.studentId === s.id && g.kind === 'package')
        if (hasPackage && left !== undefined && left <= lowBalance) alerts.push({ kind: 'low_balance', message: `${s.firstName} has ${Math.round(left / 60 * 10) / 10} hours of credit left.`, href: '/account/credits' })
      })
      if (unreadReports) alerts.push({ kind: 'report', message: `${unreadReports} new session report${unreadReports === 1 ? '' : 's'} to read.`, href: '/account/progress' })
      proposedPlans.forEach((p: any) => alerts.push({ kind: 'plan', message: `A learning plan for ${p.student?.firstName} is ready for you to review.`, href: `/account/progress/plan/${p.id}` }))
      return {
        ...base,
        family: {
          id: family.id, name: family.name, billingEmail: family.billingEmail, phone: family.phone,
          addressLine1: family.addressLine1, addressLine2: family.addressLine2, city: family.city, region: family.region, postalCode: family.postalCode, country: family.country,
          primaryLocation: family.primaryLocation, cardLabel: family.defaultPaymentMethodLabel || null,
          students: family.students.map((s: any) => ({
            id: s.id, firstName: s.firstName, lastName: s.lastName, school: s.school, status: s.status,
            dateOfBirth: s.dateOfBirth, learningNotes: s.learningNotes, medicalNotes: s.medicalNotes,
            level: s.level ? { id: s.level.id, name: s.level.name } : null,
            minutesAvailable: perStudent.get(s.id) ?? 0,
            enrolments: s.enrolments.map((e: any) => ({ id: e.id, status: e.status, mode: e.mode, fundingType: e.fundingType, program: e.program, tutor: e.tutor ? { id: e.tutor.id, displayName: e.tutor.displayName, slug: e.tutor.publicProfile ? e.tutor.slug : null } : null, trialAttendedAt: e.trialAttendedAt, tutorConfirmedAt: e.tutorConfirmedAt, rematchCount: e.rematchCount })),
          })),
          memberships: family.memberships.map((m: any) => ({ id: m.id, status: m.status, price: m.price, planName: m.plan?.name, programName: m.plan?.program?.name, studentName: m.student?.firstName, currentPeriodEnd: m.currentPeriodEnd, cancelRequestedAt: m.cancelRequestedAt, endsAt: m.endsAt, pausedFrom: m.pausedFrom, pausedUntil: m.pausedUntil, pauseRequestedFrom: m.pauseRequestedFrom, lastPauseAt: m.lastPauseAt ?? null })),
          upcoming: nextBookings.map((b: any) => ({ id: b.id, status: b.status, student: b.student, session: sessionOut(b.session) })),
          assessments: assessments.map((a: any) => ({ id: a.id, scheduledAt: a.scheduledAt, minutes: a.minutes, mode: a.mode, program: a.program, location: a.location, student: a.student })),
          alerts,
        },
        settings: { pauseMinDays: settings?.pauseMinDays ?? 14, pauseMaxDays: settings?.pauseMaxDays ?? 28, membershipCancelNoticeDays: settings?.membershipCancelNoticeDays ?? 30, pausesPerYear: settings?.pausesPerYear ?? 1 },
      }
    },

    async myStudent(_: unknown, { id }: { id: string }, context: Ctx) {
      const familyId = await myFamilyId(context)
      if (!familyId) return null
      const prisma = context.sudo().prisma
      const s = await prisma.student.findFirst({ where: { id, familyId }, include: { level: true } })
      if (!s) return null
      const [assessments, plans, reports, progress, attendance] = await Promise.all([
        prisma.assessment.findMany({ where: { studentId: s.id, status: { in: ['completed', 'scheduled'] } }, include: { program: { select: { name: true } }, results: { orderBy: { createdAt: 'asc' } }, location: { select: { name: true, timezone: true } } }, orderBy: { scheduledAt: 'desc' } }),
        prisma.learningPlan.findMany({ where: { studentId: s.id, status: { in: ['proposed', 'accepted', 'active', 'completed', 'declined'] } }, include: { goals: { orderBy: { sortOrder: 'asc' } }, program: { select: { id: true, name: true, slug: true } }, subject: { select: { name: true } }, recommendedPlan: true, recommendedPackage: true }, orderBy: { createdAt: 'desc' } }),
        prisma.sessionReport.findMany({ where: { studentId: s.id, publishedAt: { not: null }, booking: { familyId } }, select: { id: true, topicsCovered: true, wentWell: true, toImprove: true, homework: true, homeworkDueAt: true, homeworkStatus: true, effort: true, publishedAt: true, guardianSeenAt: true, tutor: { select: { displayName: true } }, session: { select: { startsAt: true, program: { select: { name: true } }, location: { select: { timezone: true } } } } }, orderBy: { publishedAt: 'desc' }, take: 50 }),
        prisma.progressReport.findMany({ where: { studentId: s.id, status: { in: ['published', 'acknowledged'] } }, orderBy: { periodEnd: 'desc' }, select: { id: true, periodStart: true, periodEnd: true, sessionsAttended: true, sessionsMissed: true, narrative: true, goalsSnapshot: true, nextSteps: true, status: true, publishedAt: true, acknowledgedAt: true } }),
        prisma.booking.groupBy({ by: ['status'], where: { studentId: s.id, familyId }, _count: { _all: true } }),
      ])
      return {
        id: s.id, firstName: s.firstName, lastName: s.lastName, level: s.level?.name ?? null, school: s.school,
        attendance: Object.fromEntries(attendance.map((a: any) => [a.status, a._count._all])),
        assessments: assessments.map((a: any) => ({ id: a.id, status: a.status, scheduledAt: a.scheduledAt, minutes: a.minutes, mode: a.mode, program: a.program, location: a.location, summary: a.status === 'completed' ? a.summary : '', recommendation: a.status === 'completed' ? a.recommendation : '', results: a.status === 'completed' ? a.results.map((r: any) => ({ id: r.id, skill: r.skill, strand: r.strand, score: r.score, maxScore: r.maxScore, levelEquivalent: r.levelEquivalent, note: r.note, percent: r.maxScore ? Math.round((r.score / r.maxScore) * 1000) / 10 : null })) : [] })),
        plans: plans.map((p: any) => ({ id: p.id, status: p.status, summary: p.summary, version: p.version, startDate: p.startDate, targetDate: p.targetDate, sessionsPerWeek: p.sessionsPerWeek, totalHours: p.totalHours, program: p.program, subject: p.subject, proposedAt: p.proposedAt, acceptedAt: p.acceptedAt, recommendedPlan: p.recommendedPlan ? planOut(p.recommendedPlan) : null, recommendedPackage: p.recommendedPackage ? packageOut(p.recommendedPackage) : null, goals: p.goals.map((g: any) => ({ id: g.id, title: g.title, skill: g.skill, baseline: g.baseline, target: g.target, status: g.status, masteredAt: g.masteredAt })) })),
        reports: reports.map((r: any) => ({ ...r, startsAt: r.session?.startsAt, programName: r.session?.program?.name, timezone: r.session?.location?.timezone, tutorName: r.tutor?.displayName, session: undefined, tutor: undefined })),
        progressReports: progress,
      }
    },

    async myUpcomingBookings(_: unknown, { includePast, studentId }: { includePast?: boolean; studentId?: string | null }, context: Ctx) {
      const familyId = await myFamilyId(context)
      if (!familyId) return null
      const prisma = context.sudo().prisma
      const now = Date.now()
      const where: any = { familyId, ...(studentId ? { studentId } : {}) }
      const [upcoming, past, waitlist, assessments, tz] = await Promise.all([
        prisma.booking.findMany({ where: { ...where, status: { in: ['booked', 'waitlisted'] }, session: { endsAt: { gte: new Date(now) } } }, include: { student: { select: { id: true, firstName: true } }, session: { include: { ...sessionInclude, series: { select: { meetingUrl: true } } } } }, orderBy: { session: { startsAt: 'asc' } }, take: 100 }),
        includePast ? prisma.booking.findMany({ where: { ...where, session: { startsAt: { lt: new Date(now) } } }, include: { student: { select: { id: true, firstName: true } }, session: { include: sessionInclude } }, orderBy: { session: { startsAt: 'desc' } }, take: 60 }) : Promise.resolve([]),
        prisma.waitlistEntry.findMany({ where: { familyId, status: 'waiting', ...(studentId ? { studentId } : {}), session: { startsAt: { gte: new Date(now) } } }, include: { student: { select: { id: true, firstName: true } }, session: { include: sessionInclude } }, orderBy: { createdAt: 'asc' } }),
        prisma.assessment.findMany({ where: { familyId, ...(studentId ? { studentId } : {}), status: { in: ['scheduled', 'requested'] } }, include: { program: { select: { name: true } }, location: { select: { name: true, timezone: true } }, student: { select: { id: true, firstName: true } } }, orderBy: { scheduledAt: 'asc' } }),
        defaultTimezone(prisma),
      ])
      const joinable = (s: any) => s.mode === 'online' && now >= s.startsAt.getTime() - 10 * 60_000 && now <= s.endsAt.getTime()
      return {
        timezone: tz,
        upcoming: upcoming.map((b: any) => ({ id: b.id, status: b.status, source: b.source, student: b.student, session: sessionOut(b.session), joinUrl: joinable(b.session) ? (b.session.meetingUrl || b.session.series?.meetingUrl || null) : null })),
        past: past.map((b: any) => ({ id: b.id, status: b.status, student: b.student, session: sessionOut(b.session) })),
        waitlist: waitlist.map((w: any) => ({ id: w.id, position: w.position, student: w.student, session: sessionOut(w.session) })),
        assessments: assessments.map((a: any) => ({ id: a.id, status: a.status, scheduledAt: a.scheduledAt, minutes: a.minutes, mode: a.mode, program: a.program, location: a.location, student: a.student, fee: a.fee })),
      }
    },

    async myBooking(_: unknown, { id }: { id: string }, context: Ctx) {
      const familyId = await myFamilyId(context)
      if (!familyId) return null
      const prisma = context.sudo().prisma
      const b = await prisma.booking.findFirst({ where: { id, familyId }, include: { student: { select: { id: true, firstName: true, lastName: true } }, session: { include: { ...sessionInclude, series: { select: { meetingUrl: true } } } }, creditGrant: { select: { kind: true, expiresAt: true, program: { select: { name: true } } } }, reports: { where: { publishedAt: { not: null } }, select: { id: true } } } })
      if (!b) return null
      return { id: b.id, status: b.status, source: b.source, minutes: b.minutes, cancelledAt: b.cancelledAt, student: b.student, session: sessionOut(b.session), funding: b.creditGrant ? { kind: b.creditGrant.kind, program: b.creditGrant.program?.name, expiresAt: b.creditGrant.expiresAt } : (b.payAsYouGo ? { kind: 'pay_as_you_go' } : null), reportId: b.reports[0]?.id ?? null }
    },

    /** One of the family's enrolments with its checkout invoice (enrol confirmation, retry payment). */
    async myEnrolment(_: unknown, { id }: { id: string }, context: Ctx) {
      const familyId = await myFamilyId(context)
      if (!familyId) return null
      const prisma = context.sudo().prisma
      const e = await prisma.enrollment.findFirst({
        where: { id, familyId },
        include: {
          program: { select: { id: true, name: true, slug: true, format: true } }, student: { select: { id: true, firstName: true, lastName: true } },
          location: { select: { id: true, name: true, timezone: true } }, tutor: { select: { displayName: true } },
          membership: { select: { status: true, price: true, currentPeriodEnd: true, plan: { select: { name: true } } } },
          studentPackage: { select: { status: true, hours: true, price: true, package: { select: { name: true } } } },
          bookings: { where: { status: 'booked' }, select: { id: true, session: { select: { startsAt: true, endsAt: true } } }, orderBy: { session: { startsAt: 'asc' } }, take: 6 },
        },
      })
      if (!e) return null
      const lines = await prisma.invoiceLine.findMany({ where: { OR: [e.membershipId ? { membershipId: e.membershipId } : { id: '_' }, e.studentPackageId ? { studentPackageId: e.studentPackageId } : { id: '_' }] }, select: { invoiceId: true }, take: 1, orderBy: { createdAt: 'asc' } })
      const invoice = lines[0]?.invoiceId ? await prisma.invoice.findUnique({ where: { id: lines[0].invoiceId }, select: { id: true, number: true, status: true, total: true, amountPaid: true, currency: true, fulfilment: true } }) : null
      const tz = e.location?.timezone || (await defaultTimezone(prisma))
      return {
        id: e.id, status: e.status, mode: e.mode, fundingType: e.fundingType, startDate: e.startDate, timezone: tz,
        program: e.program, student: e.student, location: e.location, tutor: e.tutor?.displayName ?? null,
        membership: e.membership ? { status: e.membership.status, price: e.membership.price, planName: e.membership.plan?.name, currentPeriodEnd: e.membership.currentPeriodEnd } : null,
        studentPackage: e.studentPackage ? { status: e.studentPackage.status, hours: e.studentPackage.hours, price: e.studentPackage.price, name: e.studentPackage.package?.name } : null,
        upcoming: e.bookings.map((b: any) => ({ id: b.id, startsAt: b.session?.startsAt, endsAt: b.session?.endsAt })),
        invoice: invoice ? { id: invoice.id, number: invoice.number, status: invoice.status, total: invoice.total, amountPaid: invoice.amountPaid, currency: invoice.currency, missedSeats: (invoice.fulfilment as any)?.missedSeats ?? 0 } : null,
      }
    },

    /** One of the family's assessments, with its fee invoice (confirmation page, schedule row). */
    async myAssessment(_: unknown, { id }: { id: string }, context: Ctx) {
      const familyId = await myFamilyId(context)
      if (!familyId) return null
      const prisma = context.sudo().prisma
      const a = await prisma.assessment.findFirst({
        where: { id, familyId },
        include: {
          program: { select: { id: true, name: true, slug: true } }, student: { select: { id: true, firstName: true, lastName: true } },
          location: { select: { id: true, name: true, slug: true, timezone: true, addressLine1: true, city: true, region: true, postalCode: true, phone: true } },
          room: { select: { name: true } }, assessor: { select: { displayName: true } },
          invoice: { select: { id: true, number: true, status: true, total: true, amountPaid: true, currency: true } },
        },
      })
      if (!a) return null
      const [settings, tz] = await Promise.all([prisma.businessSettings.findUnique({ where: { id: 1 } }), defaultTimezone(prisma)])
      return {
        id: a.id, status: a.status, kind: a.kind, mode: a.mode, scheduledAt: a.scheduledAt, minutes: a.minutes, fee: a.fee,
        endsAt: new Date(a.scheduledAt.getTime() + (a.minutes || 0) * 60_000),
        timezone: a.location?.timezone || tz, program: a.program, student: a.student, location: a.location, room: a.room,
        assessor: a.assessor?.displayName ?? null, invoice: a.invoice,
        refundHours: settings?.assessmentCancelRefundHours ?? 24,
      }
    },

    async myCredits(_: unknown, __: unknown, context: Ctx) {
      const familyId = await myFamilyId(context)
      if (!familyId) return null
      const prisma = context.sudo().prisma
      const [grants, packages] = await Promise.all([
        prisma.creditGrant.findMany({
          where: { familyId, status: { in: ['active', 'exhausted', 'expired'] } },
          include: { program: { select: { id: true, name: true, slug: true } }, student: { select: { id: true, firstName: true } }, entries: { orderBy: { createdAt: 'desc' }, take: 40, select: { id: true, type: true, minutes: true, note: true, createdAt: true, booking: { select: { session: { select: { startsAt: true, program: { select: { name: true } } } } } } } } },
          orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }],
        }),
        prisma.package.findMany({ where: { status: 'published', program: { status: 'published' } }, include: { program: { select: { id: true, name: true, slug: true } } }, orderBy: { sortOrder: 'asc' } }),
      ])
      return {
        grants: grants.map((g: any) => ({ id: g.id, kind: g.kind, status: g.status, minutesGranted: g.minutesGranted, minutesAvailable: g.minutesAvailable, unlimited: g.unlimited, weeklyCap: g.weeklyCap, expiresAt: g.expiresAt, periodStart: g.periodStart, periodEnd: g.periodEnd, program: g.program, student: g.student, entries: g.entries.map((e: any) => ({ id: e.id, type: e.type, minutes: e.minutes, note: e.note, createdAt: e.createdAt, sessionStartsAt: e.booking?.session?.startsAt ?? null, sessionProgram: e.booking?.session?.program?.name ?? null })) })),
        packages: packages.map((p: any) => ({ ...packageOut(p), program: p.program })),
      }
    },

    async myInvoices(_: unknown, __: unknown, context: Ctx) {
      const familyId = await myFamilyId(context)
      if (!familyId) return null
      const rows = await context.sudo().prisma.invoice.findMany({ where: { familyId, status: { not: 'draft' } }, orderBy: { issuedAt: 'desc' }, select: { id: true, number: true, status: true, kind: true, issuedAt: true, dueAt: true, total: true, amountPaid: true, amountCredited: true, currency: true } })
      return rows
    },

    async myInvoice(_: unknown, { id }: { id: string }, context: Ctx) {
      const familyId = await myFamilyId(context)
      if (!familyId) return null
      const prisma = context.sudo().prisma
      const i = await prisma.invoice.findFirst({
        where: { id, familyId, status: { not: 'draft' } },
        include: {
          lines: { orderBy: { createdAt: 'asc' }, select: { id: true, description: true, kind: true, quantity: true, unitAmount: true, amount: true, student: { select: { firstName: true } } } },
          payments: { orderBy: { createdAt: 'asc' }, select: { id: true, amount: true, method: true, status: true, refundedAmount: true, createdAt: true } },
          creditNotes: { select: { id: true, amount: true, reason: true, createdAt: true } },
          location: { select: { name: true, addressLine1: true, city: true, region: true, postalCode: true } },
          family: { select: { name: true, billingEmail: true, addressLine1: true, city: true, region: true, postalCode: true } },
        },
      })
      if (!i) return null
      const business = await prisma.business.findUnique({ where: { id: 1 }, select: { name: true, legalName: true, supportEmail: true, phone: true } })
      return { id: i.id, number: i.number, status: i.status, kind: i.kind, issuedAt: i.issuedAt, dueAt: i.dueAt, subtotal: i.subtotal, discount: i.discount, tax: i.tax, total: i.total, amountPaid: i.amountPaid, amountCredited: i.amountCredited, currency: i.currency, notes: i.notes, lines: i.lines, payments: i.payments, creditNotes: i.creditNotes, location: i.location, family: i.family, business }
    },
  },
}

async function locationOut(context: Ctx, l: any) {
  return {
    id: l.id, name: l.name, slug: l.slug, status: l.status,
    addressLine1: l.addressLine1, addressLine2: l.addressLine2, city: l.city, region: l.region, postalCode: l.postalCode, country: l.country,
    lat: l.lat, lng: l.lng, phone: l.phone, email: l.email, timezone: l.timezone, description: l.description,
    openingHours: l.openingHours ?? {},
    photo: await imageUrl(context, l.photo_id, l.photo_extension),
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([l.addressLine1, l.city, l.region, l.postalCode].filter(Boolean).join(', ') || l.name)}`,
    programs: (l.programs ?? []).map((p: any) => ({ id: p.id, name: p.name, slug: p.slug })),
  }
}
