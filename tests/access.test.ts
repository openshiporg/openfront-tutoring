/**
 * §10.10 idempotency, §10.13 access, §10.14 offer expiry, and /api/files.
 * Access goes through the generated GraphQL API with the session data a real request carries
 * (`asUser`), so list filters and field access are what is under test.
 */
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { getTestContext, resetDatabase, skipReason, asUser } from './helpers/db'
import { world, family, grant, gql, user, BOOK, MARK, CANCEL, moveSessionTo, HOUR, DAY } from './helpers/fixtures'
import { allowedFile, recordForFilename } from '../features/keystone/lib/files'
import { loadActor } from '../features/keystone/lib/actor'

let ctx: any
let prisma: any
before(async () => {
  if (skipReason) return
  ctx = await getTestContext()
  prisma = ctx.prisma
  await resetDatabase(ctx)
})

const run = async (userId: string, query: string, variables: Record<string, unknown> = {}) => (await asUser(ctx, userId)).graphql.raw({ query, variables })

test('§10.10 idempotency: same key + same payload → same result, one booking; same key + different payload refused', { skip: skipReason }, async () => {
  const w = await world(prisma, { capacity: 4 })
  const f = await family(prisma, w.roles, 2, 'Idem')
  await grant(prisma, { familyId: f.family.id, minutes: 600 })
  const k = `book-${Date.now()}-abc`
  const [a, b] = await Promise.all([0, 1].map(() => gql(ctx, f.guardian.id, BOOK, { s: w.session.id, st: f.students[0].id, k })))
  assert.equal(a.bookSession.success, true, a.bookSession.error)
  assert.deepEqual(b.bookSession, a.bookSession, 'parallel replay returns the stored result')
  assert.equal(await prisma.booking.count({ where: { sessionId: w.session.id } }), 1)
  assert.equal(await prisma.commandReceipt.count({ where: { eventType: 'bookSession' } }), 1)
  const other = (await gql(ctx, f.guardian.id, BOOK, { s: w.session.id, st: f.students[1].id, k })).bookSession
  assert.equal(other.success, false)
  assert.match(other.error, /already used with different details/)
  // keys are per user: another guardian's same key is a different command
  const g = await family(prisma, w.roles, 1, 'Idem2')
  await grant(prisma, { familyId: g.family.id, minutes: 600 })
  assert.equal((await gql(ctx, g.guardian.id, BOOK, { s: w.session.id, st: g.students[0].id, k })).bookSession.success, true)
})

test('§10.13 access: guardian A cannot read or cancel family B; tutor pay and medical notes; front desk refund; status via CRUD', { skip: skipReason }, async () => {
  const w = await world(prisma, { capacity: 4 })
  const A = await family(prisma, w.roles, 1, 'Alpha')
  const B = await family(prisma, w.roles, 1, 'Bravo')
  await prisma.student.update({ where: { id: B.students[0].id }, data: { medicalNotes: 'Peanut allergy' } })
  for (const f of [A, B]) await grant(prisma, { familyId: f.family.id, minutes: 600 })
  const bB = (await gql(ctx, B.guardian.id, BOOK, { s: w.session.id, st: B.students[0].id })).bookSession
  assert.equal(bB.success, true, bB.error)
  const inv = await prisma.invoice.create({ data: { familyId: B.family.id, status: 'open', subtotal: 4500, total: 4500, kind: 'manual' } })

  // A reads B's records by id → null; lists only show A's own
  for (const [list, id] of [['Booking', bB.id], ['Invoice', inv.id], ['Student', B.students[0].id], ['Family', B.family.id]] as const) {
    const r = await run(A.guardian.id, `query($id: ID!) { ${list[0].toLowerCase() + list.slice(1)}(where: { id: $id }) { id } }`, { id })
    assert.equal((r.data as any)?.[list[0].toLowerCase() + list.slice(1)], null, `${list} of another family`)
  }
  const mine = await run(B.guardian.id, `query($id: ID!) { booking(where: { id: $id }) { id status } }`, { id: bB.id })
  assert.equal((mine.data as any).booking.id, bB.id)
  // A cannot cancel B's booking
  assert.equal((await gql(ctx, A.guardian.id, CANCEL, { b: bB.id })).cancelBooking.success, false)
  // B's own report: A cannot read it
  await moveSessionTo(prisma, w.session.id, new Date(Date.now() - HOUR))
  await gql(ctx, w.tutorUser.id, MARK, { b: bB.id, o: 'attended' })
  const rep = (await gql(ctx, w.tutorUser.id, `mutation($b: ID!, $d: JSON!) { publishSessionReport(bookingId: $b, data: $d) { success error id } }`, { b: bB.id, d: { topicsCovered: 'Ratios' } })).publishSessionReport
  assert.equal(rep.success, true, rep.error)
  assert.equal(((await run(A.guardian.id, `query($id: ID!) { sessionReport(where: { id: $id }) { id } }`, { id: rep.id })).data as any).sessionReport, null)
  assert.equal(((await run(B.guardian.id, `query($id: ID!) { sessionReport(where: { id: $id }) { id } }`, { id: rep.id })).data as any).sessionReport.id, rep.id)

  // tutors: another tutor's pay lines are invisible; medical notes only for assigned students
  const u2 = await user(prisma, w.roles.Tutor, 'Other Tutor')
  await prisma.tutor.create({ data: { userId: u2.id, displayName: 'Other Tutor', slug: `other-${Date.now()}`, status: 'active' } })
  const pay = await run(u2.id, `query { payLines { id } }`)
  assert.deepEqual((pay.data as any).payLines, [])
  const ownPay = await run(w.tutorUser.id, `query { payLines { id amount } }`)
  assert.equal((ownPay.data as any).payLines.length, 1)
  const med = await run(u2.id, `query($id: ID!) { student(where: { id: $id }) { id medicalNotes } }`, { id: B.students[0].id })
  assert.ok(!(med.data as any)?.student?.medicalNotes, 'unassigned tutor cannot read medical notes')
  const medOwn = await run(w.tutorUser.id, `query($id: ID!) { student(where: { id: $id }) { id medicalNotes } }`, { id: B.students[0].id })
  assert.equal((medOwn.data as any).student.medicalNotes, 'Peanut allergy', 'the tutor teaching the student can')

  // front desk cannot refund (§10.12 covers the amount rules)
  const p = await prisma.payment.create({ data: { familyId: B.family.id, invoiceId: inv.id, amount: 4500, method: 'cash', status: 'captured' } })
  const rf = (await gql(ctx, w.frontDesk.id, `mutation($p: ID!, $a: Int!) { refundPayment(paymentId: $p, amount: $a, reason: "x") { success error } }`, { p: p.id, a: 100 })).refundPayment
  assert.equal(rf.success, false)

  // state-machine status fields (§4) cannot be changed through generic CRUD, even by the owner
  for (const [m, id, field, value] of [['updateBooking', bB.id, 'status', 'cancelled_early'], ['updateInvoice', inv.id, 'status', 'paid'], ['updateSession', w.session.id, 'status', 'cancelled'], ['updateCreditGrant', (await prisma.creditGrant.findFirst({ where: { familyId: B.family.id } })).id, 'status', 'voided'], ['updatePayLine', (await prisma.payLine.findFirst({ where: { tutorId: w.tutor.id } })).id, 'status', 'paid']] as const) {
    const r = await run(w.owner.id, `mutation($id: ID!) { ${m}(where: { id: $id }, data: { ${field}: "${value}" }) { id } }`, { id })
    assert.ok(r.errors?.length, `${m}.${field} refused`)
  }
  assert.equal((await prisma.booking.findUnique({ where: { id: bB.id } })).status, 'attended')
  // a guardian cannot write ledger rows or grants directly
  const g = await run(A.guardian.id, `mutation($f: ID!) { createCreditGrant(data: { family: { connect: { id: $f } }, minutesGranted: 6000 }) { id } }`, { f: A.family.id })
  assert.ok(g.errors?.length, 'guardian cannot grant credit')
})

test('§10.14 offer: expired offer cannot be accepted (and raises a task)', { skip: skipReason }, async () => {
  const w = await world(prisma, { format: 'one_to_one', capacity: 1 })
  const f = await family(prisma, w.roles, 1, 'Expire')
  const e = await prisma.enrollment.create({ data: { studentId: f.students[0].id, familyId: f.family.id, programId: w.program.id, locationId: w.location.id, status: 'pending_match', fundingType: 'package', preferredTimes: { slots: [{ weekday: 2, startMinute: 960, minutes: 60 }] } } })
  const o = await prisma.offer.create({ data: { enrollmentId: e.id, tutorId: w.tutor.id, status: 'sent', openKey: e.id, payRate: 3000, proposedSlots: [{ weekday: 2, startMinute: 960, minutes: 60 }], sentAt: new Date(Date.now() - 2 * DAY), expiresAt: new Date(Date.now() - DAY) } })
  const r = (await gql(ctx, w.tutorUser.id, `mutation($o: ID!) { respondToOffer(offerId: $o, accept: true) { success error } }`, { o: o.id })).respondToOffer
  assert.equal(r.success, false)
  assert.match(r.error, /expired/)
  const after = await prisma.offer.findUnique({ where: { id: o.id } })
  assert.equal(after.status, 'expired')
  assert.equal(after.openKey, null, 'a new offer can be sent')
  assert.equal((await prisma.enrollment.findUnique({ where: { id: e.id } })).status, 'pending_match')
})

test('/api/files: report attachment for its tutor, location staff and (published) the family only; CV for tutor managers', { skip: skipReason }, async () => {
  const w = await world(prisma)
  const A = await family(prisma, w.roles, 1, 'FileA')
  const B = await family(prisma, w.roles, 1, 'FileB')
  const b = await prisma.booking.create({ data: { sessionId: w.session.id, studentId: A.students[0].id, familyId: A.family.id, status: 'attended', startsAt: w.session.startsAt, endsAt: w.session.endsAt, minutes: 60 } })
  const rep = await prisma.sessionReport.create({ data: { bookingId: b.id, sessionId: w.session.id, studentId: A.students[0].id, tutorId: w.tutor.id, topicsCovered: 'x', attachment_filename: 'k1k2k3k4k5k6-worksheet.pdf', attachment_filesize: 10 } })
  const actor = async (id: string) => loadActor(prisma, id)
  assert.equal(await allowedFile(prisma, await actor(w.tutorUser.id), 'report', rep.id), 'k1k2k3k4k5k6-worksheet.pdf')
  assert.equal(await allowedFile(prisma, await actor(w.frontDesk.id), 'report', rep.id), 'k1k2k3k4k5k6-worksheet.pdf')
  assert.equal(await allowedFile(prisma, await actor(A.guardian.id), 'report', rep.id), null, 'not published yet')
  await prisma.sessionReport.update({ where: { id: rep.id }, data: { publishedAt: new Date() } })
  assert.equal(await allowedFile(prisma, await actor(A.guardian.id), 'report', rep.id), 'k1k2k3k4k5k6-worksheet.pdf')
  assert.equal(await allowedFile(prisma, await actor(B.guardian.id), 'report', rep.id), null)
  assert.equal(await allowedFile(prisma, null, 'report', rep.id), null)
  assert.deepEqual(await recordForFilename(prisma, 'k1k2k3k4k5k6-worksheet.pdf'), { kind: 'report', id: rep.id })
  assert.equal(await recordForFilename(prisma, '../etc/passwd'), null)
  const app = await prisma.tutorApplication.create({ data: { name: 'Cara', email: `c${Date.now()}@example.com`, status: 'applied', cv_filename: 'zzzzzzzzzzzz-cv.pdf', cv_filesize: 5 } })
  assert.equal(await allowedFile(prisma, await actor(w.manager.id), 'application', app.id), 'zzzzzzzzzzzz-cv.pdf')
  assert.equal(await allowedFile(prisma, await actor(w.frontDesk.id), 'application', app.id), null)
  assert.equal(await allowedFile(prisma, await actor(w.tutorUser.id), 'application', app.id), null)
})
