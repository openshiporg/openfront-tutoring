/**
 * §4.2 assessments + §4.1 lead moves: visitor booking creates guardian, family, student, lead;
 * the slot holds the assessor (two parallel bookings: one gets "That time was just taken");
 * cancel/reschedule rules; complete needs a result or summary and only the assessor or a manager.
 */
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { TZDate } from '@date-fns/tz'
import { getTestContext, resetDatabase, skipReason } from './helpers/db'
import { world, family, gql, HOUR, DAY } from './helpers/fixtures'

let ctx: any
let prisma: any
before(async () => {
  if (skipReason) return
  ctx = await getTestContext()
  prisma = ctx.prisma
  await resetDatabase(ctx)
})

const BOOK_A = `mutation($p: ID!, $m: String!, $l: ID, $s: String!, $t: ID!, $st: AssessmentStudentInput, $sid: ID, $g: AssessmentGuardianInput, $k: String) {
  bookAssessment(programId: $p, mode: $m, locationId: $l, startsAt: $s, tutorId: $t, student: $st, studentId: $sid, guardian: $g, idempotencyKey: $k) { success error id data } }`

/** A tutor available every day 15:00–19:00 at the centre, teaching the programme's subject. */
async function assessable(fee = 0) {
  const w = await world(prisma)
  await prisma.program.update({ where: { id: w.program.id }, data: { deliveryModes: ['in_centre', 'online'], assessmentFee: fee, assessmentMinutes: 45, subjects: { connect: [{ id: w.subject.id }] }, locations: { connect: [{ id: w.location.id }] } } })
  await prisma.tutor.update({ where: { id: w.tutor.id }, data: { deliveryModes: ['in_centre', 'online'], locations: { connect: [{ id: w.location.id }] } } })
  for (let d = 0; d < 7; d += 1) await prisma.tutorAvailability.create({ data: { tutorId: w.tutor.id, weekday: d, startMinute: 15 * 60, endMinute: 19 * 60, mode: 'in_centre', locationId: w.location.id } })
  // the session the world made sits 72h out at an arbitrary minute; move it out of the way
  await prisma.session.update({ where: { id: w.session.id }, data: { status: 'cancelled' } })
  return w
}

/** 16:00 local, N days from now. */
function slotAt(days: number, minute = 16 * 60, tz = 'America/New_York') {
  const base = new TZDate(Date.now() + days * DAY, tz)
  return new Date(new TZDate(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(minute / 60), minute % 60, tz).getTime()).toISOString()
}

test('visitor books an assessment: guardian, family, student, lead and a held slot', { skip: skipReason }, async () => {
  const w = await assessable()
  const r = (await gql(ctx, null, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s: slotAt(3), t: w.tutor.id, st: { firstName: 'Mia', lastName: 'Ruiz' }, g: { name: 'Ana Ruiz', email: `ana.${Date.now()}@example.com`, phone: '555-0100' }, k: `visitor-${Date.now()}` })).bookAssessment
  assert.equal(r.success, true, r.error)
  assert.equal(r.data.newAccount, true)
  const a = await prisma.assessment.findUnique({ where: { id: r.id }, include: { lead: true, family: { include: { guardians: { include: { role: true } } } }, student: true } })
  assert.equal(a.status, 'scheduled')
  assert.equal(a.lead.status, 'assessment_booked')
  assert.equal(a.family.guardians[0].role.name, 'Customer')
  assert.equal(a.student.firstName, 'Mia')
  assert.ok(a.roomId, 'a room is held in the centre')
  assert.equal(a.slotKey, `${w.tutor.id}:${a.scheduledAt.toISOString()}`)
  // a second visitor with the same email must sign in
  const again = (await gql(ctx, null, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s: slotAt(4), t: w.tutor.id, st: { firstName: 'Leo' }, g: { name: 'Ana Ruiz', email: a.family.guardians[0].email } })).bookAssessment
  assert.equal(again.success, false)
  assert.match(again.error, /already has an account/)
})

test('slot race: two guardians, one assessor slot → one booked, one "That time was just taken"', { skip: skipReason }, async () => {
  const w = await assessable()
  const [f1, f2] = [await family(prisma, w.roles, 1, 'SlotA'), await family(prisma, w.roles, 1, 'SlotB')]
  const s = slotAt(5)
  const [a, b] = await Promise.all([
    gql(ctx, f1.guardian.id, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s, t: w.tutor.id, sid: f1.students[0].id }),
    gql(ctx, f2.guardian.id, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s, t: w.tutor.id, sid: f2.students[0].id }),
  ])
  const outcomes = [a.bookAssessment, b.bookAssessment]
  assert.equal(outcomes.filter((o: any) => o.success).length, 1, JSON.stringify(outcomes))
  assert.equal(outcomes.find((o: any) => !o.success).error, 'That time was just taken. Please pick another.')
  // overlapping start (15 minutes later) on the same assessor is also taken
  const later = new Date(new Date(s).getTime() + 30 * 60000).toISOString()
  const c = (await gql(ctx, f2.guardian.id, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s: later, t: w.tutor.id, sid: f2.students[0].id })).bookAssessment
  assert.equal(c.success, false)
  // outside availability is refused
  const d = (await gql(ctx, f2.guardian.id, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s: slotAt(5, 10 * 60), t: w.tutor.id, sid: f2.students[0].id })).bookAssessment
  assert.equal(d.success, false)
  // guardian cannot book for another family's student
  const e = (await gql(ctx, f2.guardian.id, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s: slotAt(6), t: w.tutor.id, sid: f1.students[0].id })).bookAssessment
  assert.equal(e.success, false)
})

test('cancel frees the slot; reschedule moves it; paid fee invoice is voided when unpaid', { skip: skipReason }, async () => {
  const w = await assessable(12500)
  const f = await family(prisma, w.roles, 1, 'Move')
  const s = slotAt(4)
  const r = (await gql(ctx, f.guardian.id, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s, t: w.tutor.id, sid: f.students[0].id })).bookAssessment
  assert.equal(r.success, true, r.error)
  assert.ok(r.data.invoiceId)
  const inv = await prisma.invoice.findUnique({ where: { id: r.data.invoiceId } })
  assert.equal(inv.total, 12500)
  assert.equal(inv.kind, 'assessment')

  const moved = (await gql(ctx, f.guardian.id, `mutation($a: ID!, $s: String!, $t: ID!) { rescheduleAssessment(assessmentId: $a, startsAt: $s, tutorId: $t) { success error data } }`, { a: r.id, s: slotAt(6), t: w.tutor.id })).rescheduleAssessment
  assert.equal(moved.success, true, moved.error)
  // old slot free again for someone else
  const f2 = await family(prisma, w.roles, 1, 'Taker')
  const take = (await gql(ctx, f2.guardian.id, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s, t: w.tutor.id, sid: f2.students[0].id })).bookAssessment
  assert.equal(take.success, true, take.error)

  const cancel = (await gql(ctx, f.guardian.id, `mutation($a: ID!) { cancelAssessment(assessmentId: $a) { success error data } }`, { a: r.id })).cancelAssessment
  assert.equal(cancel.success, true, cancel.error)
  assert.equal(cancel.data.fee.action, 'voided')
  assert.equal((await prisma.invoice.findUnique({ where: { id: r.data.invoiceId } })).status, 'void')
  assert.equal((await prisma.assessment.findUnique({ where: { id: r.id } })).slotKey, null)
  // another guardian cannot cancel it
  const other = (await gql(ctx, f.guardian.id, `mutation($a: ID!) { cancelAssessment(assessmentId: $a) { success error } }`, { a: take.id })).cancelAssessment
  assert.equal(other.success, false)
})

test('late cancel keeps a paid fee; centre cancel refunds (cash payment recorded)', { skip: skipReason }, async () => {
  const w = await assessable(10000)
  const f = await family(prisma, w.roles, 1, 'Fee')
  const r = (await gql(ctx, f.guardian.id, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s: slotAt(3), t: w.tutor.id, sid: f.students[0].id })).bookAssessment
  assert.equal(r.success, true, r.error)
  // record a cash payment directly (front desk path is its own test)
  const { applyPayment } = await import('../features/keystone/lib/payments')
  await prisma.$transaction(async (tx: any) => {
    await tx.payment.create({ data: { invoiceId: r.data.invoiceId, familyId: f.family.id, amount: 10000, method: 'cash', status: 'captured' } })
    await applyPayment(tx, r.data.invoiceId, 10000)
  })
  // move it inside 24h → guardian cancel keeps the fee
  await prisma.assessment.update({ where: { id: r.id }, data: { scheduledAt: new Date(Date.now() + 5 * HOUR) } })
  const late = (await gql(ctx, f.guardian.id, `mutation($a: ID!) { cancelAssessment(assessmentId: $a) { success error data } }`, { a: r.id })).cancelAssessment
  assert.equal(late.success, true, late.error)
  assert.equal(late.data.fee.action, 'kept')

  const r2 = (await gql(ctx, f.guardian.id, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s: slotAt(5), t: w.tutor.id, sid: f.students[0].id })).bookAssessment
  await prisma.$transaction(async (tx: any) => {
    await tx.payment.create({ data: { invoiceId: r2.data.invoiceId, familyId: f.family.id, amount: 10000, method: 'cash', status: 'captured' } })
    await applyPayment(tx, r2.data.invoiceId, 10000)
  })
  const centre = (await gql(ctx, w.frontDesk.id, `mutation($a: ID!) { cancelAssessment(assessmentId: $a, reason: "Assessor ill") { success error data } }`, { a: r2.id })).cancelAssessment
  assert.equal(centre.success, true, centre.error)
  assert.equal(centre.data.fee.action, 'refunded')
  const refund = await prisma.refund.findFirst({ where: { payment: { invoiceId: r2.data.invoiceId } } })
  assert.equal(refund.amount, 10000)
  assert.equal(refund.status, 'succeeded')
  assert.equal((await prisma.assessment.findUnique({ where: { id: r2.id } })).feeRefunded, true)
})

test('complete: needs a result or summary; only assessor or manager; lead → assessed', { skip: skipReason }, async () => {
  const w = await assessable()
  const f = await family(prisma, w.roles, 1, 'Done')
  const r = (await gql(ctx, f.guardian.id, BOOK_A, { p: w.program.id, m: 'in_centre', l: w.location.id, s: slotAt(3), t: w.tutor.id, sid: f.students[0].id })).bookAssessment
  assert.equal(r.success, true, r.error)
  const COMPLETE = `mutation($a: ID!, $s: String, $r: JSON) { completeAssessment(assessmentId: $a, summary: $s, results: $r) { success error } }`
  assert.match((await gql(ctx, w.tutorUser.id, COMPLETE, { a: r.id })).completeAssessment.error, /at least one score/)
  assert.equal((await gql(ctx, w.frontDesk.id, COMPLETE, { a: r.id, s: 'x' })).completeAssessment.success, false)
  const ok = (await gql(ctx, w.tutorUser.id, COMPLETE, { a: r.id, s: 'Strong number sense; fractions weak.', r: [{ skill: 'Fractions', score: 4, maxScore: 10 }, { skill: 'Place value', score: 9, maxScore: 10 }] })).completeAssessment
  assert.equal(ok.success, true, ok.error)
  const a = await prisma.assessment.findUnique({ where: { id: r.id }, include: { results: true, lead: true } })
  assert.equal(a.status, 'completed')
  assert.equal(a.results.length, 2)
  assert.equal(a.lead.status, 'assessed')
  // generic CRUD cannot change status
  const crud = await ctx.withSession({ itemId: w.owner.id, listKey: 'User', data: { role: { canManageLeads: true, canManageSettings: true } } }).graphql.raw({ query: `mutation($id: ID!) { updateAssessment(where: { id: $id }, data: { status: "scheduled" }) { id } }`, variables: { id: r.id } })
  assert.ok(crud.errors?.length, 'status is not writable through generic CRUD')
  // lead move rules
  const lost = (await gql(ctx, w.frontDesk.id, `mutation($l: ID!) { transitionLead(leadId: $l, to: "lost") { success error } }`, { l: a.leadId })).transitionLead
  assert.match(lost.error, /reason/i)
})
