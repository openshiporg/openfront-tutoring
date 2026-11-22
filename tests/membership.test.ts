/**
 * §10.8 membership billing and §10.9 cancel notice, with real Stripe test cards charged
 * off-session (pm_card_visa succeeds; pm_card_chargeCustomerFail attaches and then declines).
 * Time moves by passing `now` to the job functions; Stripe calls are real.
 */
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { addMonths } from 'date-fns'
import { getTestContext, resetDatabase, skipReason as dbSkip } from './helpers/db'
import { world, family, gql, DAY, HOUR, ledgerProblems } from './helpers/fixtures'
import * as stripe from '../features/integrations/payment/stripe'
import { stripeKeys, ensureCustomer, ensureProviders } from '../features/keystone/lib/payments'
import { billMembership, runMembershipBilling, advanceMemberships, reconcileAttempt, noticeEndDate } from '../features/keystone/lib/membership'
import { startMembershipPeriod } from '../features/keystone/lib/enrolment'
import { expireCredits } from '../features/keystone/lib/jobs'

const skipReason = dbSkip || (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'Stripe test keys not set' : undefined)

let ctx: any
let prisma: any
before(async () => {
  if (skipReason) return
  ctx = await getTestContext()
  prisma = ctx.prisma
  await resetDatabase(ctx)
  await ensureProviders(prisma)
})

async function saveCard(familyId: string, token: string) {
  const keys = await stripeKeys(prisma)
  const customer = await ensureCustomer(prisma, keys, familyId)
  const pm = await stripe.attachPaymentMethod(keys, token, customer)
  await prisma.family.update({ where: { id: familyId }, data: { defaultPaymentMethodId: pm.id, defaultPaymentMethodLabel: token } })
  return pm.id
}

/** An active membership whose period started a month ago and ends `endsInHours` from now. */
async function liveMembership(opts: { endsInHours: number; card?: string; price?: number }) {
  const w = await world(prisma)
  const f = await family(prisma, w.roles, 1, `Member${Date.now() % 10000}`)
  await prisma.family.update({ where: { id: f.family.id }, data: { billingEmail: `${f.guardian.email}` } })
  const plan = await prisma.membershipPlan.create({ data: { name: 'Twice weekly', programId: w.program.id, sessionsPerPeriod: 8, price: opts.price ?? 32000, status: 'published' } })
  const bigger = await prisma.membershipPlan.create({ data: { name: 'Three a week', programId: w.program.id, sessionsPerPeriod: 12, price: 45000, status: 'published' } })
  const end = new Date(Date.now() + opts.endsInHours * HOUR)
  const start = addMonths(end, -1)
  const m = await prisma.membership.create({ data: { familyId: f.family.id, studentId: f.students[0].id, planId: plan.id, status: 'active', price: plan.price, sessionsPerPeriod: 8, startedAt: start, currentPeriodStart: start, currentPeriodEnd: end } })
  await prisma.enrollment.create({ data: { studentId: f.students[0].id, familyId: f.family.id, programId: w.program.id, locationId: w.location.id, status: 'active', fundingType: 'membership', membershipId: m.id, startDate: start } })
  await prisma.$transaction((tx: any) => startMembershipPeriod(tx, m.id, start, null), { timeout: 60_000 })
  if (opts.card) await saveCard(f.family.id, opts.card)
  return { w, f, m, plan, bigger, start, end }
}

test('§10.8 billing run twice for one period → one invoice, one charge; rollover once; plan change applies at renewal', { skip: skipReason }, async () => {
  const { f, m, end, bigger, w } = await liveMembership({ endsInHours: 12, card: 'pm_card_visa' })
  // staff schedule a plan change for the next period; the preview shows the proration if done now
  const preview = (await gql(ctx, w.owner.id, `query($m: ID!, $p: ID!) { membershipPlanChangePreview(membershipId: $m, planId: $p) }`, { m: m.id, p: bigger.id })).membershipPlanChangePreview
  assert.ok(preview.prorationAmount > 0 && preview.prorationAmount < 45000 - 32000, `proration ${preview.prorationAmount}`)
  assert.equal(preview.nextBillAmount, 45000)
  const change = (await gql(ctx, w.owner.id, `mutation($m: ID!, $p: ID!) { changeMembershipPlan(membershipId: $m, planId: $p, effective: "next_period") { success error data } }`, { m: m.id, p: bigger.id })).changeMembershipPlan
  assert.equal(change.success, true, change.error)

  // use 3 of 8 sessions' worth: leave 300 minutes to roll over
  const grant1 = await prisma.creditGrant.findFirst({ where: { membershipId: m.id } })
  await prisma.$transaction(async (tx: any) => {
    await tx.creditGrant.update({ where: { id: grant1.id }, data: { minutesAvailable: 300 } })
    await tx.creditEntry.create({ data: { grantId: grant1.id, type: 'adjustment', minutes: -180, note: 'three sessions used (test setup)' } })
  })

  const [a, b] = await Promise.all([billMembership(prisma, m.id), billMembership(prisma, m.id)])
  const c = await billMembership(prisma, m.id)
  const outcomes = [a.outcome, b.outcome, c.outcome].sort()
  assert.deepEqual(outcomes.filter((o) => o === 'captured').length, 1, JSON.stringify([a, b, c]))
  assert.equal(await prisma.invoice.count({ where: { kind: 'membership', lines: { some: { membershipId: m.id } } } }), 1)
  assert.equal(await prisma.payment.count({ where: { familyId: f.family.id, status: 'captured' } }), 1)
  const after = await prisma.membership.findUnique({ where: { id: m.id } })
  assert.equal(after.status, 'active')
  assert.equal(after.currentPeriodStart.getTime(), end.getTime())
  assert.equal(after.currentPeriodEnd.getTime(), addMonths(end, 1).getTime())
  assert.equal(after.planId, bigger.id, 'pending plan applied at renewal')
  assert.equal(after.price, 45000)
  const inv = await prisma.invoice.findFirst({ where: { kind: 'membership', lines: { some: { membershipId: m.id } } } })
  assert.equal(inv.total, 45000)
  const grant2 = await prisma.creditGrant.findFirst({ where: { membershipId: m.id, periodStart: end, rolledFromId: null } })
  assert.equal(grant2.minutesGranted, 12 * 60)

  // period 1 ends: 300 unused minutes roll into period 2, once
  await expireCredits(prisma, new Date(end.getTime() + 60_000))
  const rolled = await prisma.creditGrant.findFirst({ where: { rolledFromId: grant1.id } })
  assert.equal(rolled.minutesAvailable, 300)
  assert.equal((await prisma.creditGrant.findUnique({ where: { id: grant1.id } })).status, 'expired')
  // period 2 renews and ends: the rolled credit expires, it never rolls a second time
  const end2 = addMonths(end, 1)
  const r2 = await billMembership(prisma, m.id, new Date(end2.getTime() - 2 * HOUR))
  assert.equal(r2.outcome, 'captured', JSON.stringify(r2))
  await expireCredits(prisma, new Date(end2.getTime() + 60_000))
  assert.equal((await prisma.creditGrant.findUnique({ where: { id: rolled.id } })).status, 'expired')
  assert.equal(await prisma.creditGrant.count({ where: { rolledFromId: rolled.id } }), 0)
  assert.equal(await prisma.creditGrant.count({ where: { rolledFromId: grant2.id } }), 1, 'the regular period-2 grant rolls over')
  assert.deepEqual(await ledgerProblems(prisma, [f.family.id]), [])
})

test('§10.8 decline → past_due, retries on day 3 and 7, suspended on day 10 with bookings cancelled; paying restores', { skip: skipReason }, async () => {
  const { w, f, m, end } = await liveMembership({ endsInHours: 6, card: 'pm_card_chargeCustomerFail' })
  // a booking 3 weeks out on a goodwill grant tied to nothing, and one on this membership
  const s = await prisma.session.update({ where: { id: w.session.id }, data: { startsAt: new Date(end.getTime() + 2 * DAY), endsAt: new Date(end.getTime() + 2 * DAY + HOUR) } })
  const grantRow = await prisma.creditGrant.findFirst({ where: { membershipId: m.id } })
  await prisma.creditGrant.update({ where: { id: grantRow.id }, data: { expiresAt: new Date(end.getTime() + 5 * DAY) } })
  const book = (await gql(ctx, f.guardian.id, `mutation($s: ID!, $st: ID!) { bookSession(sessionId: $s, studentId: $st) { success error id } }`, { s: s.id, st: f.students[0].id })).bookSession
  assert.equal(book.success, true, book.error)

  const t0 = new Date()
  const first = await billMembership(prisma, m.id, t0)
  assert.equal(first.outcome, 'failed', JSON.stringify(first))
  let row = await prisma.membership.findUnique({ where: { id: m.id } })
  assert.equal(row.status, 'past_due')
  const since = row.pastDueSince
  let attempt = await prisma.billingAttempt.findFirst({ where: { membershipId: m.id }, orderBy: { attemptNumber: 'desc' } })
  assert.equal(attempt.nextRetryAt.getTime(), since.getTime() + 3 * DAY)
  assert.ok(await prisma.notificationLog.count({ where: { template: 'payment_failed', relatedId: attempt.invoiceId } }))
  // day 1: nothing; day 3: retry 2; day 7: retry 3; then no more
  assert.equal((await billMembership(prisma, m.id, new Date(since.getTime() + DAY))).outcome, 'skipped')
  assert.equal((await billMembership(prisma, m.id, new Date(since.getTime() + 3 * DAY + 60_000))).outcome, 'failed')
  attempt = await prisma.billingAttempt.findFirst({ where: { membershipId: m.id }, orderBy: { attemptNumber: 'desc' } })
  assert.equal(attempt.attemptNumber, 2)
  assert.equal(attempt.nextRetryAt.getTime(), since.getTime() + 7 * DAY)
  assert.equal((await billMembership(prisma, m.id, new Date(since.getTime() + 7 * DAY + 60_000))).outcome, 'failed')
  assert.equal((await billMembership(prisma, m.id, new Date(since.getTime() + 8 * DAY))).reason, 'retries used')
  assert.equal(await prisma.invoice.count({ where: { kind: 'membership', lines: { some: { membershipId: m.id } } } }), 1, 'retries reuse one invoice')
  // day 9: still past due; day 10: suspended, future booking cancelled with credit back, task raised
  await advanceMemberships(prisma, new Date(since.getTime() + 9 * DAY))
  assert.equal((await prisma.membership.findUnique({ where: { id: m.id } })).status, 'past_due')
  await advanceMemberships(prisma, new Date(since.getTime() + 10 * DAY + 60_000))
  row = await prisma.membership.findUnique({ where: { id: m.id } })
  assert.equal(row.status, 'suspended')
  assert.equal((await prisma.booking.findUnique({ where: { id: book.id } })).status, 'cancelled_by_centre')
  assert.ok(await prisma.task.findUnique({ where: { openKey: `suspended:${m.id}` } }))

  // guardian replaces the card and pays the open invoice: membership restored, next period granted
  await saveCard(f.family.id, 'pm_card_visa')
  const pay = (await gql(ctx, f.guardian.id, `mutation($i: ID!) { payInvoice(invoiceId: $i, useSavedCard: true) { success error data } }`, { i: attempt.invoiceId })).payInvoice
  assert.equal(pay.success, true, pay.error)
  assert.equal(pay.data.invoiceStatus, 'paid')
  row = await prisma.membership.findUnique({ where: { id: m.id } })
  assert.equal(row.status, 'active')
  assert.equal(row.pastDueSince, null)
  assert.equal(row.currentPeriodStart.getTime(), end.getTime())
  assert.equal(await prisma.creditGrant.count({ where: { membershipId: m.id, periodStart: end } }), 1)
  assert.deepEqual(await ledgerProblems(prisma, [f.family.id]), [])
})

test('lease expired mid-charge → unknown, never retried blind; reconcile asks Stripe, then billing continues', { skip: skipReason }, async () => {
  const { m, end } = await liveMembership({ endsInHours: 10, card: 'pm_card_visa' })
  const invoice = await prisma.invoice.create({ data: { number: 900000 + Math.floor(Math.random() * 99999), familyId: m.familyId, kind: 'membership', status: 'open', total: 32000, subtotal: 32000, fulfilment: { kind: 'membership_period', membershipId: m.id, periodStart: end.toISOString(), periodEnd: addMonths(end, 1).toISOString() }, lines: { create: [{ description: 'x', kind: 'membership', unitAmount: 32000, amount: 32000, membershipId: m.id }] } } })
  const stale = await prisma.billingAttempt.create({ data: { membershipId: m.id, periodStart: end, periodEnd: addMonths(end, 1), invoiceId: invoice.id, attemptNumber: 1, status: 'pending', amount: 32000, leaseExpiresAt: new Date(Date.now() - 60_000) } })
  const r = await billMembership(prisma, m.id)
  assert.equal(r.reason, 'waiting for reconcile')
  assert.equal((await prisma.billingAttempt.findUnique({ where: { id: stale.id } })).status, 'unknown')
  assert.equal((await billMembership(prisma, m.id)).reason, 'waiting for reconcile', 'no blind retry')
  const rec = await reconcileAttempt(prisma, stale.id)
  assert.equal(rec.status, 'failed', 'Stripe had no charge for it')
  const r2 = await billMembership(prisma, m.id)
  assert.equal(r2.outcome, 'captured', JSON.stringify(r2))
  assert.equal(await prisma.payment.count({ where: { invoiceId: invoice.id } }), 1)
})

test('pause shifts billing and grants; once in 12 months; bounds from settings', { skip: skipReason }, async () => {
  const { f, m, end } = await liveMembership({ endsInHours: 20 * 24 })
  const PAUSE = `mutation($m: ID!, $f: String!, $u: String!) { requestMembershipPause(membershipId: $m, from: $f, until: $u) { success error data } }`
  const from = new Date(Date.now() + 2 * DAY)
  assert.match((await gql(ctx, f.guardian.id, PAUSE, { m: m.id, f: from.toISOString(), u: new Date(from.getTime() + 7 * DAY).toISOString() })).requestMembershipPause.error, /14 to 28 days/)
  const ok = (await gql(ctx, f.guardian.id, PAUSE, { m: m.id, f: from.toISOString(), u: new Date(from.getTime() + 14 * DAY).toISOString() })).requestMembershipPause
  assert.equal(ok.success, true, ok.error)
  const row = await prisma.membership.findUnique({ where: { id: m.id } })
  assert.equal(row.currentPeriodEnd.getTime(), end.getTime() + 14 * DAY)
  const g = await prisma.creditGrant.findFirst({ where: { membershipId: m.id } })
  assert.equal(g.expiresAt.getTime(), end.getTime() + 14 * DAY)
  // the pause starts on its day and ends on its day
  await advanceMemberships(prisma, new Date(from.getTime() + 60_000))
  assert.equal((await prisma.membership.findUnique({ where: { id: m.id } })).status, 'paused')
  await advanceMemberships(prisma, new Date(from.getTime() + 14 * DAY + 60_000))
  assert.equal((await prisma.membership.findUnique({ where: { id: m.id } })).status, 'active')
  const again = (await gql(ctx, f.guardian.id, PAUSE, { m: m.id, f: new Date(Date.now() + 3 * DAY).toISOString(), u: new Date(Date.now() + 17 * DAY).toISOString() })).requestMembershipPause
  assert.match(again.error, /once in 12 months/)
})

test('§10.9 cancel notice: end date from notice days; bookings after it released; ends on the day; end-now refunds pro rata', { skip: skipReason }, async () => {
  const { w, f, m, end } = await liveMembership({ endsInHours: 10 * 24 })
  // a prepaid booking after the expected end date (credit with a long expiry on this membership)
  const expected = noticeEndDate({ currentPeriodStart: null, currentPeriodEnd: end }, 30)
  assert.equal(expected.getTime(), addMonths(end, 1).getTime(), 'today + 30 days falls in the next period, so it ends at that period’s end')
  const late = await prisma.session.update({ where: { id: w.session.id }, data: { startsAt: new Date(expected.getTime() + DAY), endsAt: new Date(expected.getTime() + DAY + HOUR) } })
  const g = await prisma.creditGrant.findFirst({ where: { membershipId: m.id } })
  await prisma.creditGrant.update({ where: { id: g.id }, data: { expiresAt: new Date(expected.getTime() + 10 * DAY) } })
  const book = (await gql(ctx, f.guardian.id, `mutation($s: ID!, $st: ID!) { bookSession(sessionId: $s, studentId: $st) { success error id } }`, { s: late.id, st: f.students[0].id })).bookSession
  assert.equal(book.success, true, book.error)

  const notice = (await gql(ctx, f.guardian.id, `mutation($m: ID!) { requestMembershipCancel(membershipId: $m) { success error data } }`, { m: m.id })).requestMembershipCancel
  assert.equal(notice.success, true, notice.error)
  assert.equal(new Date(notice.data.endsAt).getTime(), expected.getTime())
  assert.equal(notice.data.released, 1)
  assert.equal((await prisma.booking.findUnique({ where: { id: book.id } })).status, 'cancelled_by_centre')
  assert.equal((await prisma.membership.findUnique({ where: { id: m.id } })).status, 'cancelling')
  // the last period (ending at endsAt) is still billed; nothing after it
  const lastPeriod = await prisma.membership.findUnique({ where: { id: m.id } })
  await prisma.membership.update({ where: { id: m.id }, data: { currentPeriodStart: end, currentPeriodEnd: expected } })
  assert.equal((await billMembership(prisma, m.id, new Date(expected.getTime() - HOUR))).reason, 'membership ends')
  await prisma.membership.update({ where: { id: m.id }, data: { currentPeriodStart: lastPeriod.currentPeriodStart, currentPeriodEnd: lastPeriod.currentPeriodEnd } })
  // on the day: cancelled, enrolment ended, unused credit voided
  await advanceMemberships(prisma, new Date(expected.getTime() + 60_000))
  assert.equal((await prisma.membership.findUnique({ where: { id: m.id } })).status, 'cancelled')
  assert.equal((await prisma.enrollment.findFirst({ where: { membershipId: m.id } })).status, 'ended')
  assert.deepEqual(await ledgerProblems(prisma, [f.family.id]), [])

  // staff end-now with a prorated refund of a cash-paid period
  const two = await liveMembership({ endsInHours: 15 * 24 })
  const inv = await prisma.invoice.create({ data: { number: 800000 + Math.floor(Math.random() * 99999), familyId: two.f.family.id, kind: 'membership', status: 'paid', total: 32000, subtotal: 32000, amountPaid: 32000, createdAt: two.start, lines: { create: [{ description: 'Month', kind: 'membership', unitAmount: 32000, amount: 32000, membershipId: two.m.id }] } } })
  await prisma.payment.create({ data: { invoiceId: inv.id, familyId: two.f.family.id, amount: 32000, method: 'cash', status: 'captured' } })
  const END = `mutation($m: ID!) { endMembership(membershipId: $m, mode: "now", refund: true, reason: "Moving away") { success error data } }`
  assert.equal((await gql(ctx, two.w.frontDesk.id, END, { m: two.m.id })).endMembership.success, false, 'front desk cannot refund')
  const ended = (await gql(ctx, two.w.owner.id, END, { m: two.m.id })).endMembership
  assert.equal(ended.success, true, ended.error)
  const days = (two.end.getTime() - Date.now()) / DAY
  const periodDays = (two.end.getTime() - two.start.getTime()) / DAY
  assert.ok(Math.abs(ended.data.refundAmount - Math.round(32000 * days / periodDays)) <= 20, `refund ${ended.data.refundAmount}`)
  assert.equal((await prisma.refund.findFirst({ where: { payment: { invoiceId: inv.id } } })).status, 'succeeded')
  assert.equal((await prisma.membership.findUnique({ where: { id: two.m.id } })).status, 'cancelled')
})

test('runMembershipBilling picks only due memberships; runDailyJobs is one run at a time and records the time', { skip: skipReason }, async () => {
  const due = await liveMembership({ endsInHours: 3, card: 'pm_card_visa' })
  const notDue = await liveMembership({ endsInHours: 72, card: 'pm_card_visa' })
  const results = await runMembershipBilling(prisma, new Date(), [due.m.id, notDue.m.id])
  assert.deepEqual(results.map((r) => r.membershipId), [due.m.id])
  assert.equal(results[0].outcome, 'captured')
  const RUN = `mutation { runDailyJobs { success error data } }`
  assert.equal((await gql(ctx, due.w.frontDesk.id, RUN)).runDailyJobs.success, false)
  const [r1, r2] = await Promise.all([gql(ctx, due.w.owner.id, RUN), gql(ctx, due.w.owner.id, RUN)])
  const runs = [r1.runDailyJobs, r2.runDailyJobs]
  assert.ok(runs.some((r: any) => r.success), JSON.stringify(runs))
  const settings = await prisma.businessSettings.findUnique({ where: { id: 1 } })
  assert.ok(settings.lastDailyJobsAt)
})
