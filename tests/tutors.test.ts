/**
 * W2 matching and offers, W9 applications and credentials, §4.11 tutor status.
 * - candidates exclude a tutor without a current background check
 * - one open offer per enrolment; respond re-checks the tutor is free and creates the series,
 *   books the trial; a clash at accept time expires the offer
 * - guardian confirm → active + placement invoice; re-match → pending_match, old tutor excluded
 * - application stages → approve creates Tutor (onboarding) + tutor User
 */
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { getTestContext, resetDatabase, skipReason } from './helpers/db'
import { world, family, grant, gql, user, DAY } from './helpers/fixtures'
import { expireCredentials } from '../features/keystone/lib/jobs'

let ctx: any
let prisma: any
before(async () => {
  if (skipReason) return
  ctx = await getTestContext()
  prisma = ctx.prisma
  await resetDatabase(ctx)
})

const R = '{ success error id data }'
const SEND = `mutation($e: ID!, $t: ID!, $s: JSON) { sendOffer(enrollmentId: $e, tutorId: $t, slots: $s) ${R} }`
const RESPOND = `mutation($o: ID!, $a: Boolean!, $r: String) { respondToOffer(offerId: $o, accept: $a, reason: $r) ${R} }`

/** One-to-one programme, two tutors (one without a background check), a family waiting for a match. */
async function matchWorld() {
  const w = await world(prisma, { format: 'one_to_one', capacity: 1 })
  await prisma.session.update({ where: { id: w.session.id }, data: { status: 'cancelled' } })
  await prisma.program.update({ where: { id: w.program.id }, data: { billingModel: 'placement_fee', placementFee: 15000, deliveryModes: ['in_centre'], subjects: { connect: [{ id: w.subject.id }] }, locations: { connect: [{ id: w.location.id }] } } })
  const tutors = [w.tutor]
  const u2 = await user(prisma, w.roles.Tutor, 'Ben Tutor')
  const t2 = await prisma.tutor.create({ data: { userId: u2.id, displayName: 'Ben Tutor', slug: `ben-${Date.now()}`, status: 'active', defaultPayRate: 2800 } })
  await prisma.tutorSubject.create({ data: { tutorId: t2.id, subjectId: w.subject.id } })
  tutors.push(t2)
  for (const t of tutors) {
    await prisma.tutor.update({ where: { id: t.id }, data: { deliveryModes: ['in_centre'], locations: { connect: [{ id: w.location.id }] } } })
    for (const d of [2, 4]) await prisma.tutorAvailability.create({ data: { tutorId: t.id, weekday: d, startMinute: 15 * 60, endMinute: 19 * 60, mode: 'in_centre', locationId: w.location.id } })
  }
  // only Tara has a verified background check
  await prisma.tutorCredential.create({ data: { tutorId: w.tutor.id, kind: 'background_check', status: 'verified', expiresAt: new Date(Date.now() + 365 * DAY) } })
  const cred2 = await prisma.tutorCredential.create({ data: { tutorId: t2.id, kind: 'background_check', status: 'pending', expiresAt: new Date(Date.now() + 365 * DAY) } })
  const f = await family(prisma, w.roles, 1, `Match${Date.now() % 10000}`)
  await prisma.family.update({ where: { id: f.family.id }, data: { primaryLocationId: w.location.id, billingEmail: f.guardian.email } })
  const g = await grant(prisma, { familyId: f.family.id, studentId: f.students[0].id, programId: w.program.id, minutes: 600 })
  const enrol = await prisma.enrollment.create({ data: { studentId: f.students[0].id, familyId: f.family.id, programId: w.program.id, locationId: w.location.id, mode: 'in_centre', status: 'pending_match', fundingType: 'package', preferredTimes: { slots: [{ weekday: 2, startMinute: 16 * 60, minutes: 60 }] } } })
  return { w, t2, cred2, f, enrol, grant: g }
}

test('matching: background check gates candidates; one open offer; accept creates series and trial; confirm → active + placement invoice', { skip: skipReason }, async () => {
  const { w, t2, cred2, f, enrol } = await matchWorld()
  const cands = (await gql(ctx, w.manager.id, `query($e: ID!) { matchingCandidates(enrollmentId: $e) }`, { e: enrol.id })).matchingCandidates
  assert.deepEqual(cands.candidates.map((c: any) => c.tutorId), [w.tutor.id], 'Ben has no verified check yet')
  assert.equal(cands.candidates[0].overlap, 1)
  assert.equal((await gql(ctx, f.guardian.id, `query($e: ID!) { matchingCandidates(enrollmentId: $e) }`, { e: enrol.id })).matchingCandidates, null, 'guardians cannot see candidates')
  // verify Ben's check → he becomes a candidate
  const v = (await gql(ctx, w.manager.id, `mutation($c: ID!) { verifyCredential(credentialId: $c, decision: "verified") ${R} }`, { c: cred2.id })).verifyCredential
  assert.equal(v.success, true, v.error)
  assert.equal((await gql(ctx, w.manager.id, `query($e: ID!) { matchingCandidates(enrollmentId: $e) }`, { e: enrol.id })).matchingCandidates.candidates.length, 2)
  // front desk lacks canManageTutors
  assert.equal((await gql(ctx, w.frontDesk.id, SEND, { e: enrol.id, t: w.tutor.id })).sendOffer.success, false)
  const o1 = (await gql(ctx, w.manager.id, SEND, { e: enrol.id, t: t2.id })).sendOffer
  assert.equal(o1.success, true, o1.error)
  const dupe = (await gql(ctx, w.manager.id, SEND, { e: enrol.id, t: w.tutor.id })).sendOffer
  assert.equal(dupe.success, false)
  assert.match(dupe.error, /open offer/)
  // tutor sees the offer without family contact details
  const mine = (await gql(ctx, t2.userId, `query { myOffers }`)).myOffers
  assert.equal(mine.length, 1)
  assert.equal(mine[0].family, null)
  // Ben declines → task; manager offers Tara
  assert.equal((await gql(ctx, w.tutorUser.id, RESPOND, { o: o1.id, a: true })).respondToOffer.success, false, 'only the offered tutor answers')
  assert.equal((await gql(ctx, t2.userId, RESPOND, { o: o1.id, a: false, r: 'Too far' })).respondToOffer.success, true)
  assert.ok(await prisma.task.findUnique({ where: { openKey: `offer-declined:${enrol.id}` } }))
  const o2 = (await gql(ctx, w.manager.id, SEND, { e: enrol.id, t: w.tutor.id })).sendOffer
  assert.equal(o2.success, true, o2.error)
  const acc = (await gql(ctx, w.tutorUser.id, RESPOND, { o: o2.id, a: true })).respondToOffer
  assert.equal(acc.success, true, acc.error)
  assert.equal(acc.data.seriesIds.length, 1)
  const e1 = await prisma.enrollment.findUnique({ where: { id: enrol.id } })
  assert.equal(e1.status, 'matched')
  assert.equal(e1.tutorId, w.tutor.id)
  const trial = await prisma.session.findUnique({ where: { id: acc.data.trialSessionId } })
  assert.equal(trial.isTrial, true)
  assert.equal(trial.tutorId, w.tutor.id)
  assert.ok(acc.data.bookedSeats >= 3, `fixed seats booked: ${acc.data.bookedSeats}`)
  assert.equal(await prisma.booking.count({ where: { enrollmentId: enrol.id, status: 'booked' } }), acc.data.bookedSeats)
  // accepted: the tutor now sees contact details
  assert.ok((await gql(ctx, w.tutorUser.id, `query { myOffers }`)).myOffers.find((x: any) => x.id === o2.id).family)
  // guardian keeps the tutor → active + placement invoice
  const conf = (await gql(ctx, f.guardian.id, `mutation($e: ID!) { confirmTutor(enrollmentId: $e) ${R} }`, { e: enrol.id })).confirmTutor
  assert.equal(conf.success, true, conf.error)
  assert.equal((await prisma.enrollment.findUnique({ where: { id: enrol.id } })).status, 'active')
  const inv = await prisma.invoice.findUnique({ where: { id: conf.data.invoiceId } })
  assert.equal(inv.kind, 'placement')
  assert.equal(inv.total, 15000)
})

test('accept re-checks the tutor: a clash since the offer expires it; re-match frees seats and excludes the old tutor', { skip: skipReason }, async () => {
  const { w, t2, cred2, f, enrol } = await matchWorld()
  await prisma.tutorCredential.update({ where: { id: cred2.id }, data: { status: 'verified' } })
  const o = (await gql(ctx, w.manager.id, SEND, { e: enrol.id, t: w.tutor.id })).sendOffer
  assert.equal(o.success, true, o.error)
  // Tara gets a class on Tuesday 16:00 in two weeks before she answers
  const offer = await prisma.offer.findUnique({ where: { id: o.id } })
  const { localStart } = await import('../features/keystone/lib/schedule')
  let day = new Date(Date.now() + 8 * DAY)
  while (new Date(day.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay() !== 2) day = new Date(day.getTime() + DAY)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(day)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const startsAt = localStart({ y: get('year'), m: get('month') - 1, d: get('day') }, (offer.proposedSlots as any)[0].startMinute, 'America/New_York')
  await prisma.session.create({ data: { programId: w.program.id, locationId: w.location.id, tutorId: w.tutor.id, startsAt, endsAt: new Date(startsAt.getTime() + 3600_000), capacity: 4, status: 'scheduled' } })
  const r = (await gql(ctx, w.tutorUser.id, RESPOND, { o: o.id, a: true })).respondToOffer
  assert.equal(r.success, false)
  assert.match(r.error, /no longer free/)
  assert.equal((await prisma.offer.findUnique({ where: { id: o.id } })).status, 'expired')
  assert.equal((await prisma.enrollment.findUnique({ where: { id: enrol.id } })).status, 'pending_match')
  assert.equal(await prisma.sessionSeries.count({ where: { enrollmentId: enrol.id } }), 0, 'no series left behind')
  // Ben accepts instead, then the family asks for a re-match
  const o2 = (await gql(ctx, w.manager.id, SEND, { e: enrol.id, t: t2.id })).sendOffer
  assert.equal(o2.success, true, o2.error)
  const a2 = (await gql(ctx, t2.userId, RESPOND, { o: o2.id, a: true })).respondToOffer
  assert.equal(a2.success, true, a2.error)
  const before = await prisma.creditGrant.findFirst({ where: { familyId: f.family.id } })
  const rm = (await gql(ctx, f.guardian.id, `mutation($e: ID!, $r: String!) { requestRematch(enrollmentId: $e, reason: $r) ${R} }`, { e: enrol.id, r: 'Not a good fit' })).requestRematch
  assert.equal(rm.success, true, rm.error)
  assert.equal(rm.data.free, true)
  assert.equal(rm.data.released, a2.data.bookedSeats)
  const after = await prisma.creditGrant.findUnique({ where: { id: before.id } })
  assert.equal(after.minutesAvailable, 600, 'every held minute returned')
  const e = await prisma.enrollment.findUnique({ where: { id: enrol.id } })
  assert.equal(e.status, 'pending_match')
  assert.equal(e.rematchCount, 1)
  assert.equal(await prisma.booking.count({ where: { enrollmentId: enrol.id, status: 'booked' } }), 0)
  const cands = (await gql(ctx, w.manager.id, `query($e: ID!) { matchingCandidates(enrollmentId: $e) }`, { e: enrol.id })).matchingCandidates
  assert.ok(!cands.candidates.some((c: any) => c.tutorId === t2.id), 'the tutor the family left is excluded')
  // an expired check stops Tara being offered
  await prisma.tutorCredential.updateMany({ where: { tutorId: w.tutor.id }, data: { expiresAt: new Date(Date.now() - 1000) } })
  const ex = await expireCredentials(prisma)
  assert.ok(ex.expired >= 1)
  assert.equal((await gql(ctx, w.manager.id, SEND, { e: enrol.id, t: w.tutor.id })).sendOffer.success, false)
})

test('applications: staff add, move through stages, approve → Tutor (onboarding) + tutor User; active needs a check', { skip: skipReason }, async () => {
  const w = await world(prisma)
  const email = `cand.${Date.now()}@example.com`
  const CREATE = `mutation($d: JSON!) { createTutorApplication(data: $d) ${R} }`
  assert.equal((await gql(ctx, w.frontDesk.id, CREATE, { d: { name: 'Cara Lee', email } })).createTutorApplication.success, false, 'front desk cannot recruit')
  const app = (await gql(ctx, w.manager.id, CREATE, { d: { name: 'Cara Lee', email, phone: '555-0199', subjectIds: [w.subject.id], modes: ['online', 'in_centre'], references: [{ name: 'Dr Ruiz', contact: 'ruiz@example.edu' }], source: 'referral', coverNote: 'Former maths teacher.' } })).createTutorApplication
  assert.equal(app.success, true, app.error)
  assert.equal((await gql(ctx, w.manager.id, CREATE, { d: { name: 'Cara Lee', email } })).createTutorApplication.success, false, 'one open application per email')
  const MOVE = `mutation($a: ID!, $s: String!, $n: String) { transitionApplication(applicationId: $a, status: $s, note: $n) ${R} }`
  const APPROVE = `mutation($a: ID!, $d: JSON) { approveApplication(applicationId: $a, data: $d) ${R} }`
  assert.equal((await gql(ctx, w.manager.id, APPROVE, { a: app.id })).approveApplication.success, false, 'checks first')
  assert.equal((await gql(ctx, w.manager.id, MOVE, { a: app.id, s: 'checks' })).transitionApplication.success, false, 'no skipping stages')
  for (const s of ['screening', 'interview', 'checks']) {
    const r = (await gql(ctx, w.manager.id, MOVE, { a: app.id, s, n: `moved to ${s}` })).transitionApplication
    assert.equal(r.success, true, r.error)
  }
  // Upgrade case: provisioning a login must not require a manually created Tutor role.
  await prisma.user.updateMany({ where: { role: { name: 'Tutor' } }, data: { roleId: null } })
  await prisma.role.deleteMany({ where: { name: 'Tutor' } })
  const ok = (await gql(ctx, w.manager.id, APPROVE, { a: app.id, d: { defaultPayRate: 3200, locationIds: [w.location.id] } })).approveApplication
  assert.equal(ok.success, true, ok.error)
  const tutor = await prisma.tutor.findUnique({ where: { id: ok.data.tutorId }, include: { user: { include: { role: true } }, subjects: true, locations: true } })
  assert.equal(tutor.status, 'onboarding')
  assert.equal(tutor.user.email, email)
  assert.equal(tutor.user.role.isTutor, true)
  assert.equal(tutor.subjects.length, 1)
  assert.equal(tutor.defaultPayRate, 3200)
  assert.equal((await prisma.tutorApplication.findUnique({ where: { id: app.id } })).status, 'approved')
  // active needs a verified, current background check
  const SET = `mutation($t: ID!, $s: String!) { setTutorStatus(tutorId: $t, status: $s) ${R} }`
  const noCheck = (await gql(ctx, w.manager.id, SET, { t: tutor.id, s: 'active' })).setTutorStatus
  assert.equal(noCheck.success, false)
  assert.match(noCheck.error, /background check/)
  const c = await prisma.tutorCredential.create({ data: { tutorId: tutor.id, kind: 'background_check', status: 'pending' } })
  assert.equal((await gql(ctx, w.manager.id, `mutation($c: ID!) { verifyCredential(credentialId: $c, decision: "verified", expiresAt: "2030-01-01") ${R} }`, { c: c.id })).verifyCredential.success, true)
  assert.equal((await gql(ctx, w.manager.id, SET, { t: tutor.id, s: 'active' })).setTutorStatus.success, true)
  // pausing withdraws open offers
  const paused = (await gql(ctx, w.manager.id, SET, { t: tutor.id, s: 'paused' })).setTutorStatus
  assert.equal(paused.success, true, paused.error)
})
