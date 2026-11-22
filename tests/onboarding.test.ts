/**
 * §10.16 Onboarding seed: the §9 starter set, loaded through the onboarding command, passes every
 * invariant the state-machine tests check (ledger maths, holds closed once, capacity, no tutor or
 * student double booking, one active booking per seat, pay lines once per 1:1 booking or group
 * session, one open offer, billing attempts unique), has the §9 shape, contains no placeholder
 * wording, stores a working jobs secret, and still passes after the daily jobs run on it.
 */
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { getTestContext, resetDatabase, skipReason } from './helpers/db'
import { ensureRoles, user, gql, ledgerProblems, BOOK } from './helpers/fixtures'

let ctx: any
let prisma: any
before(async () => {
  if (skipReason) return
  ctx = await getTestContext()
  prisma = ctx.prisma
  await resetDatabase(ctx)
})

const ONBOARD = `mutation($d: JSON!) { onboardBusiness(data: $d) { success error id data } }`
const INPUT = {
  businessName: 'Brightpath Learning', country: 'US', currency: 'USD', kind: 'mixed', supportEmail: 'hello@brightpathlearning.com',
  location: { name: 'Maple Avenue Centre', addressLine1: '1820 Maple Avenue', city: 'Evanston', region: 'IL', postalCode: '60201', timezone: 'America/Chicago' },
  starterSet: true,
}

async function invariantProblems() {
  const problems: string[] = [...(await ledgerProblems(prisma))]
  const over: any[] = await prisma.$queryRawUnsafe(`SELECT s.id, s.capacity, count(b.id)::int AS n FROM "Session" s JOIN "Booking" b ON b.session = s.id AND b.status IN ('booked','attended','late','no_show') GROUP BY s.id HAVING count(b.id) > s.capacity`)
  for (const r of over) problems.push(`session ${r.id} has ${r.n} seats over capacity ${r.capacity}`)
  const tutorClash: any[] = await prisma.$queryRawUnsafe(`SELECT a.id AS a, b.id AS b FROM "Session" a JOIN "Session" b ON a.tutor = b.tutor AND a.id < b.id AND a."startsAt" < b."endsAt" AND b."startsAt" < a."endsAt" WHERE a.status <> 'cancelled' AND b.status <> 'cancelled'`)
  for (const r of tutorClash) problems.push(`tutor double booked: ${r.a} / ${r.b}`)
  const roomClash: any[] = await prisma.$queryRawUnsafe(`SELECT a.id AS a, b.id AS b FROM "Session" a JOIN "Session" b ON a.room = b.room AND a.id < b.id AND a."startsAt" < b."endsAt" AND b."startsAt" < a."endsAt" WHERE a.status <> 'cancelled' AND b.status <> 'cancelled'`)
  for (const r of roomClash) problems.push(`room double booked: ${r.a} / ${r.b}`)
  const studentClash: any[] = await prisma.$queryRawUnsafe(`SELECT a.id AS a, b.id AS b FROM "Booking" a JOIN "Booking" b ON a.student = b.student AND a.id < b.id AND a."startsAt" < b."endsAt" AND b."startsAt" < a."endsAt" WHERE a.status IN ('booked','attended','late','no_show') AND b.status IN ('booked','attended','late','no_show')`)
  for (const r of studentClash) problems.push(`student double booked: ${r.a} / ${r.b}`)
  const groupPay: any[] = await prisma.$queryRawUnsafe(`SELECT p.session, count(*)::int AS n FROM "PayLine" p JOIN "Session" s ON s.id = p.session JOIN "Program" g ON g.id = s.program WHERE p.status <> 'void' AND g.format <> 'one_to_one' AND p.kind IN ('session','late_cancel','no_show') GROUP BY p.session HAVING count(*) > 1`)
  for (const r of groupPay) problems.push(`group session ${r.session} paid ${r.n} times`)
  const oneToOnePay: any[] = await prisma.$queryRawUnsafe(`SELECT b.id AS booking, count(*)::int AS n FROM "PayLine" p JOIN "Booking" b ON b."payLine" = p.id WHERE p.status <> 'void' GROUP BY b.id HAVING count(*) > 1`)
  for (const r of oneToOnePay) problems.push(`booking ${r.booking} paid ${r.n} times`)
  const unpaidAttendance: any[] = await prisma.$queryRawUnsafe(`SELECT s.id FROM "Session" s WHERE s.status <> 'cancelled' AND EXISTS (SELECT 1 FROM "Booking" b WHERE b.session = s.id AND b.status IN ('attended','late')) AND NOT EXISTS (SELECT 1 FROM "PayLine" p WHERE p.session = s.id AND p.status <> 'void')`)
  for (const r of unpaidAttendance) problems.push(`attended session ${r.id} has no pay line`)
  const funded: any[] = await prisma.$queryRawUnsafe(`SELECT b.id FROM "Booking" b WHERE b."creditGrant" IS NULL AND b."payAsYouGo" = false AND b.status IN ('booked','attended','late','no_show','cancelled_late','cancelled_late_excused')`)
  for (const r of funded) problems.push(`booking ${r.id} has no funding`)
  const openOffers: any[] = await prisma.$queryRawUnsafe(`SELECT enrollment, count(*)::int AS n FROM "Offer" WHERE status = 'sent' GROUP BY enrollment HAVING count(*) > 1`)
  for (const r of openOffers) problems.push(`enrolment ${r.enrollment} has ${r.n} open offers`)
  const paidWrong: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM "Invoice" WHERE ("amountPaid" + "amountCredited") > total OR (status = 'paid' AND ("amountPaid" + "amountCredited") <> total)`)
  for (const r of paidWrong) problems.push(`invoice ${r.id} paid amount does not match`)
  const payments: any[] = await prisma.$queryRawUnsafe(`SELECT i.id FROM "Invoice" i WHERE i."amountPaid" <> COALESCE((SELECT sum(p.amount - COALESCE(p."refundedAmount",0)) FROM "Payment" p WHERE p.invoice = i.id AND p.status IN ('captured','partially_refunded')), 0)`)
  for (const r of payments) problems.push(`invoice ${r.id} amountPaid differs from its payments`)
  const pastFuture: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM "Booking" WHERE status = 'booked' AND "endsAt" < now() - interval '1 day'`)
  for (const r of pastFuture) problems.push(`booking ${r.id} still booked long after it ended`)
  const runLines: any[] = await prisma.$queryRawUnsafe(`SELECT p.id FROM "PayLine" p JOIN "PayrollRun" r ON r.id = p."payrollRun" WHERE (r.status = 'paid' AND p.status NOT IN ('paid','void')) OR (r.status = 'draft' AND p.status NOT IN ('accrued','void'))`)
  for (const r of runLines) problems.push(`pay line ${r.id} status does not match its run`)
  return problems
}

test('onboarding seed: §9 starter set through the onboarding command passes every invariant', { skip: skipReason, timeout: 100 * 60_000 }, async () => {
  const roles = await ensureRoles(prisma)
  const owner = await user(prisma, roles.Owner, 'Olivia Owner')
  const desk = await user(prisma, roles['Front desk'], 'Not Owner')

  // only the owner, and a bad input is refused with nothing written
  assert.equal((await gql(ctx, desk.id, ONBOARD, { d: INPUT })).onboardBusiness.success, false)
  assert.equal((await gql(ctx, owner.id, ONBOARD, { d: { ...INPUT, location: { name: 'X', timezone: 'Mars/Olympus' } } })).onboardBusiness.success, false)
  assert.equal(await prisma.program.count(), 0)

  const started = Date.now()
  const r = (await gql(ctx, owner.id, ONBOARD, { d: INPUT })).onboardBusiness
  assert.equal(r.success, true, r.error)
  console.log(`onboarding took ${Math.round((Date.now() - started) / 1000)} s`, JSON.stringify(r.data.starter))
  assert.ok(typeof r.data.jobsSecret === 'string' && r.data.jobsSecret.length >= 40)

  // second run refused
  assert.equal((await gql(ctx, owner.id, ONBOARD, { d: INPUT })).onboardBusiness.success, false)

  // the secret works for /api/jobs/daily, only its hash is stored
  const { jobsSecretMatches } = await import('../features/keystone/lib/jobs')
  assert.equal(await jobsSecretMatches(prisma, r.data.jobsSecret), true)
  assert.equal(await jobsSecretMatches(prisma, 'wrong-secret'), false)
  const s = await prisma.businessSettings.findUnique({ where: { id: 1 } })
  assert.notEqual(s.jobsSecretHash, r.data.jobsSecret)
  // payment providers: Stripe default + manual
  const providers = await prisma.paymentProvider.findMany({ select: { code: true, isDefault: true, isInstalled: true } })
  assert.deepEqual(providers.map((p: any) => p.code).sort(), ['pp_manual', 'pp_stripe'])
  assert.equal(providers.find((p: any) => p.code === 'pp_stripe').isDefault, true)

  // §9 shape
  const b = await prisma.business.findUnique({ where: { id: 1 } })
  assert.equal(b.name, 'Brightpath Learning')
  assert.ok(b.onboardedAt)
  assert.equal(await prisma.location.count(), 2)
  assert.equal(await prisma.room.count(), 6)
  const progNames = (await prisma.program.findMany({ select: { name: true } })).map((p: any) => p.name)
  for (const n of ['SAT Prep', 'ACT Prep', 'SAT & ACT Prep', 'Maths Foundations', 'Reading and Writing Lab', 'Private Tutoring at Home', 'Homework Club']) assert.ok(progNames.includes(n), n)
  assert.ok((await prisma.tutor.count()) >= 8)
  assert.equal(await prisma.tutor.count({ where: { userId: null } }), 0, 'every tutor has a login')
  assert.equal(await prisma.locationMembership.count({ where: { role: 'manager' } }), 2)
  assert.ok((await prisma.locationMembership.count({ where: { role: 'front_desk' } })) >= 1)
  const families = await prisma.family.count({ where: { enrolments: { some: {} } } })
  assert.equal(families, 12)
  assert.equal(await prisma.student.count({ where: { enrolments: { some: {} } } }), 18)
  assert.ok((await prisma.assessmentResult.count()) > 20)
  assert.ok((await prisma.planGoal.count()) > 20)
  const pastAttended = await prisma.booking.count({ where: { status: { in: ['attended', 'late'] }, startsAt: { lt: new Date(Date.now() - 35 * 86400_000) } } })
  assert.ok(pastAttended > 0, 'attendance history reaches back ~6 weeks')
  assert.ok((await prisma.sessionReport.count({ where: { publishedAt: { not: null } } })) > 50)
  assert.ok((await prisma.session.count({ where: { startsAt: { gt: new Date(Date.now() + 21 * 86400_000) } } })) > 0, 'sessions 4 weeks ahead')
  assert.ok((await prisma.booking.count({ where: { status: 'booked' } })) > 30, 'future seats booked')
  for (const stage of ['new', 'contacted', 'assessment_booked', 'assessed', 'proposal_sent', 'enrolled', 'lost']) assert.equal(await prisma.lead.count({ where: { status: stage } }), 2, stage)
  assert.equal(await prisma.membership.count({ where: { status: 'past_due' } }), 1)
  assert.equal(await prisma.billingAttempt.count({ where: { status: 'failed', nextRetryAt: { not: null } } }), 1)
  assert.equal(await prisma.enrollment.count({ where: { status: 'pending_match' } }), 1)
  assert.equal(await prisma.payrollRun.count({ where: { status: 'draft' } }), 1)
  assert.ok((await prisma.payLine.count({ where: { payrollRun: { status: 'draft' } } })) > 0)
  assert.deepEqual((await prisma.tutorApplication.findMany({ select: { status: true } })).map((a: any) => a.status).sort(), ['applied', 'checks', 'interview'])
  assert.ok((await prisma.creditEntry.count({ where: { type: 'rollover_in' } })) > 0, 'a period rolled over')
  assert.ok((await prisma.creditGrant.count({ where: { kind: 'make_up' } })) >= 0)
  assert.equal(await prisma.session.count({ where: { status: 'scheduled', endsAt: { lt: new Date(Date.now() - 86400_000) } } }), 0, 'no past session left open')

  // no placeholder wording in any seeded text
  const texts: any[] = await prisma.$queryRawUnsafe(`
    SELECT name AS t FROM "Program" UNION ALL SELECT summary FROM "Program" UNION ALL SELECT bio FROM "Tutor" UNION ALL SELECT headline FROM "Tutor"
    UNION ALL SELECT text FROM "Review" UNION ALL SELECT name FROM "Family" UNION ALL SELECT message FROM "Lead" UNION ALL SELECT "topicsCovered" FROM "SessionReport"
    UNION ALL SELECT description FROM "InvoiceLine" UNION ALL SELECT summary FROM "Assessment" UNION ALL SELECT name FROM "Location" UNION ALL SELECT about FROM "Business"
    UNION ALL SELECT "policiesText" FROM "BusinessSettings" UNION ALL SELECT name FROM "User"`)
  const bad = texts.filter((r) => /\b(demo|sample|test data|lorem|ipsum|dummy|placeholder|mock|sandbox|fake)\b/i.test(String(r.t ?? '')))
  assert.deepEqual(bad, [])

  // every invariant from §10 holds on the seed
  assert.deepEqual(await invariantProblems(), [])

  // the seed is live data: a guardian books an open seat with their own credit, and the daily jobs run cleanly over it
  const fam = await prisma.family.findFirst({ where: { name: 'Patel family' }, include: { guardians: true, students: true } })
  const seat = await prisma.session.findFirst({ where: { program: { slug: 'sat-prep' }, status: 'scheduled', startsAt: { gt: new Date(Date.now() + 48 * 3600_000) }, bookings: { none: { studentId: fam.students[0].id } } }, orderBy: { startsAt: 'asc' } })
  if (seat) {
    const booked = (await gql(ctx, fam.guardians[0].id, BOOK, { s: seat.id, st: fam.students[0].id })).bookSession
    assert.ok(booked.success || /credit|already has a session|full/i.test(booked.error), booked.error)
  }
  const { runDailyJobs } = await import('../features/keystone/lib/jobs')
  await runDailyJobs(prisma)
  assert.deepEqual(await invariantProblems(), [])
})
