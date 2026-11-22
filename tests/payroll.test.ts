/**
 * W10 / §4.12 payroll: attendance accrues lines; manual lines; void instead of edit; a run
 * claims the period's accrued lines once; owner approves (lines lock, later lines wait for the
 * next run); owner marks paid with method and reference per tutor; CSV export; tutor statement.
 */
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { getTestContext, resetDatabase, skipReason } from './helpers/db'
import { world, family, grant, gql, BOOK, MARK, REOPEN, moveSessionTo, HOUR, DAY } from './helpers/fixtures'

let ctx: any
let prisma: any
before(async () => {
  if (skipReason) return
  ctx = await getTestContext()
  prisma = ctx.prisma
  await resetDatabase(ctx)
})

const R = '{ success error id data }'
const ADD = `mutation($t: ID!, $k: String!, $a: Int!, $m: Int, $n: String!, $key: String) { addPayLine(tutorId: $t, kind: $k, amount: $a, minutes: $m, note: $n, idempotencyKey: $key) ${R} }`
const VOID = `mutation($l: ID!, $r: String!) { voidPayLine(payLineId: $l, reason: $r) ${R} }`
const CREATE = `mutation($s: String, $e: String, $l: ID) { createPayrollRun(periodStart: $s, periodEnd: $e, locationId: $l) ${R} }`
const APPROVE = `mutation($r: ID!) { approvePayrollRun(payrollRunId: $r) ${R} }`
const PAID = `mutation($r: ID!, $p: JSON!) { markPayrollRunPaid(payrollRunId: $r, payments: $p) ${R} }`

test('payroll run: lines from attendance + manual lines, void not edit, approve locks, later lines wait, paid with references, CSV', { skip: skipReason }, async () => {
  const w = await world(prisma, { capacity: 1, format: 'one_to_one', payRate: 3000 })
  await prisma.tutor.update({ where: { id: w.tutor.id }, data: { locations: { connect: [{ id: w.location.id }] } } })
  const f = await family(prisma, w.roles, 1, 'Payroll')
  await grant(prisma, { familyId: f.family.id, minutes: 600 })
  const b = (await gql(ctx, f.guardian.id, BOOK, { s: w.session.id, st: f.students[0].id })).bookSession
  assert.equal(b.success, true, b.error)
  await moveSessionTo(prisma, w.session.id, new Date(Date.now() - 3 * HOUR))
  assert.equal((await gql(ctx, w.tutorUser.id, MARK, { b: b.id, o: 'attended' })).markAttendance.success, true)

  // front desk has no payroll; a tutor cannot add their own lines
  assert.equal((await gql(ctx, w.frontDesk.id, ADD, { t: w.tutor.id, k: 'bonus', a: 1000, n: 'x' })).addPayLine.success, false)
  assert.equal((await gql(ctx, w.tutorUser.id, ADD, { t: w.tutor.id, k: 'bonus', a: 1000, n: 'x' })).addPayLine.success, false)
  assert.equal((await gql(ctx, w.manager.id, ADD, { t: w.tutor.id, k: 'session', a: 1000, n: 'x' })).addPayLine.success, false, 'session lines come from attendance only')
  const key = `prep-${Date.now()}`
  const prep = (await gql(ctx, w.manager.id, ADD, { t: w.tutor.id, k: 'prep', a: 1500, m: 30, n: 'SAT mock marking', key })).addPayLine
  assert.equal(prep.success, true, prep.error)
  assert.equal((await gql(ctx, w.manager.id, ADD, { t: w.tutor.id, k: 'prep', a: 1500, m: 30, n: 'SAT mock marking', key })).addPayLine.id, prep.id, 'idempotent')
  const ded = (await gql(ctx, w.manager.id, ADD, { t: w.tutor.id, k: 'deduction', a: 500, n: 'Parking advance' })).addPayLine
  assert.equal(ded.success, true, ded.error)
  assert.equal((await prisma.payLine.findUnique({ where: { id: ded.id } })).amount, -500)
  const wrong = (await gql(ctx, w.manager.id, ADD, { t: w.tutor.id, k: 'bonus', a: 9999, n: 'typo' })).addPayLine
  assert.equal((await gql(ctx, w.manager.id, VOID, { l: wrong.id, r: 'Wrong amount' })).voidPayLine.success, true)
  // generated CRUD cannot edit an amount
  const edit = await ctx.withSession({ itemId: w.manager.id, listKey: 'User', data: {} }).graphql.raw({ query: `mutation($id: ID!) { updatePayLine(where: { id: $id }, data: { amount: 1 }) { id } }`, variables: { id: prep.id } })
  assert.ok(edit.errors?.length, 'direct pay line edit refused')

  // manager drafts a location run; the all-locations run is the owner's
  const start = new Date(Date.now() - 14 * DAY).toISOString()
  const end = new Date(Date.now() + HOUR).toISOString()
  assert.equal((await gql(ctx, w.manager.id, CREATE, { s: start, e: end })).createPayrollRun.success, false)
  const run = (await gql(ctx, w.manager.id, CREATE, { s: start, e: end, l: w.location.id })).createPayrollRun
  assert.equal(run.success, true, run.error)
  assert.equal(run.data.lines, 3, 'session + prep + deduction (void excluded)')
  assert.equal(run.data.tutors[0].amount, 3000 + 1500 - 500)
  assert.equal((await gql(ctx, w.manager.id, CREATE, { s: start, e: end, l: w.location.id })).createPayrollRun.success, false, 'one draft run at a time')

  // manager cannot approve; owner can
  assert.equal((await gql(ctx, w.manager.id, APPROVE, { r: run.id })).approvePayrollRun.success, false)
  const ap = (await gql(ctx, w.owner.id, APPROVE, { r: run.id })).approvePayrollRun
  assert.equal(ap.success, true, ap.error)
  assert.equal(ap.data.total, 4000)
  assert.equal(await prisma.payLine.count({ where: { payrollRunId: run.id, status: 'approved' } }), 3)
  assert.equal((await gql(ctx, w.owner.id, APPROVE, { r: run.id })).approvePayrollRun.success, false, 'approve twice refused')
  assert.equal((await gql(ctx, w.manager.id, VOID, { l: prep.id, r: 'late' })).voidPayLine.success, false, 'approved lines locked')

  // reopen after approve → adjustment line, which waits for the next run
  const re = (await gql(ctx, w.manager.id, REOPEN, { b: b.id, c: 'cancelled_early', r: 'Family had cancelled by phone' })).reopenBooking
  assert.equal(re.success, false)
  assert.equal((await prisma.payLine.findUnique({ where: { id: re.data.adjustmentLineId } })).amount, -3000)
  const bonus = (await gql(ctx, w.manager.id, ADD, { t: w.tutor.id, k: 'bonus', a: 2000, n: 'Covered Friday' })).addPayLine
  assert.equal((await prisma.payLine.findUnique({ where: { id: bonus.id } })).payrollRunId, null)

  // paid: every tutor needs a method and (non-cash) a reference
  assert.equal((await gql(ctx, w.owner.id, PAID, { r: run.id, p: [] })).markPayrollRunPaid.success, false)
  assert.equal((await gql(ctx, w.owner.id, PAID, { r: run.id, p: [{ tutorId: w.tutor.id, method: 'bank_transfer' }] })).markPayrollRunPaid.success, false)
  const paid = (await gql(ctx, w.owner.id, PAID, { r: run.id, p: [{ tutorId: w.tutor.id, method: 'bank_transfer', reference: 'ACH 88213' }] })).markPayrollRunPaid
  assert.equal(paid.success, true, paid.error)
  assert.equal(await prisma.payLine.count({ where: { payrollRunId: run.id, status: 'paid' } }), 3)
  const r = await prisma.payrollRun.findUnique({ where: { id: run.id } })
  assert.equal(r.status, 'paid')
  assert.equal(r.payments[0].reference, 'ACH 88213')
  assert.equal(r.payments[0].amount, 4000)

  // CSV for the accountant
  const csv = (await gql(ctx, w.owner.id, `query($r: ID!) { payrollRunCsv(payrollRunId: $r) }`, { r: run.id })).payrollRunCsv
  const rows = csv.trim().split('\r\n')
  assert.equal(rows.length, 4)
  assert.match(rows[0], /^run_id,period_start,period_end,location,tutor/)
  assert.ok(rows.some((l: string) => l.includes(',deduction,') && l.includes('-5.00') && l.includes('ACH 88213')))
  assert.equal((await gql(ctx, w.frontDesk.id, `query($r: ID!) { payrollRunCsv(payrollRunId: $r) }`, { r: run.id })).payrollRunCsv, null)

  // the next run takes the bonus + the adjustment only
  const next = (await gql(ctx, w.manager.id, CREATE, { s: start, e: new Date(Date.now() + 2 * HOUR).toISOString(), l: w.location.id })).createPayrollRun
  assert.equal(next.success, true, next.error)
  const nextLines = await prisma.payLine.findMany({ where: { payrollRunId: next.id } })
  assert.deepEqual(nextLines.map((l: any) => l.kind).sort(), ['adjustment', 'bonus'])
  // cancel releases them
  const cancel = (await gql(ctx, w.manager.id, `mutation($r: ID!) { cancelPayrollRun(payrollRunId: $r, reason: "Redo with Friday") ${R} }`, { r: next.id })).cancelPayrollRun
  assert.equal(cancel.success, true, cancel.error)
  assert.equal(await prisma.payLine.count({ where: { payrollRunId: next.id } }), 0)

  // tutor statement: own lines with paid dates
  const st = (await gql(ctx, w.tutorUser.id, `query { myPayStatement }`)).myPayStatement
  assert.equal(st.totals.paid, 4000)
  assert.equal(st.totals.accrued, 2000 - 3000, 'bonus and the correction are waiting for the next run')
  assert.ok(st.lines.find((l: any) => l.kind === 'session').paidAt)
  assert.equal((await gql(ctx, f.guardian.id, `query { myPayStatement }`)).myPayStatement, null)
})
