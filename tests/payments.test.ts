/**
 * §10 tests 11, 12, 15 and the card paths, against real Stripe with TEST keys (same code path as live).
 * Needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the environment; skipped without them.
 * The browser step (Stripe Elements confirm) is done server-side with Stripe's test card `pm_card_visa`.
 */
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { TZDate } from '@date-fns/tz'
import { getTestContext, resetDatabase, skipReason as dbSkip } from './helpers/db'
import { world, family, gql, DAY, ledgerProblems } from './helpers/fixtures'
import * as stripe from '../features/integrations/payment/stripe'
import { stripeKeys } from '../features/keystone/lib/payments'
import { processStripeWebhook } from '../features/keystone/lib/webhook'

const skipReason = dbSkip || (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || !process.env.STRIPE_WEBHOOK_SECRET ? 'Stripe test keys not set' : undefined)

let ctx: any
let prisma: any
before(async () => {
  if (skipReason) return
  ctx = await getTestContext()
  prisma = ctx.prisma
  await resetDatabase(ctx)
})

const CHECKOUT = `mutation($p: ID!, $pl: ID, $pk: ID, $l: ID, $s: [ID!], $sid: ID, $lp: ID, $c: String, $k: String) {
  startEnrolmentCheckout(programId: $p, planId: $pl, packageId: $pk, mode: "in_centre", locationId: $l, seriesIds: $s, studentId: $sid, learningPlanId: $lp, promoCode: $c, acceptPolicies: true, saveCard: true, idempotencyKey: $k) { success error id data } }`
const COMPLETE = `mutation($ps: ID!) { completeEnrolmentCheckout(paymentSessionId: $ps) { success error id data } }`

/** A centre programme with a weekly 4-seat series starting tomorrow (location time), plan and package. */
async function catalogue() {
  const w = await world(prisma)
  await prisma.session.update({ where: { id: w.session.id }, data: { status: 'cancelled' } })
  await prisma.program.update({ where: { id: w.program.id }, data: { locations: { connect: [{ id: w.location.id }] } } })
  const tomorrow = new TZDate(Date.now() + DAY, 'America/New_York')
  const series = await prisma.sessionSeries.create({ data: { programId: w.program.id, subjectId: w.subject.id, locationId: w.location.id, roomId: w.room.id, tutorId: w.tutor.id, weekday: tomorrow.getDay(), startMinute: 16 * 60, minutes: 60, capacity: 4, startDate: new Date(Date.now() - DAY) } })
  const plan = await prisma.membershipPlan.create({ data: { name: 'Weekly (4 sessions a month)', programId: w.program.id, sessionsPerPeriod: 4, price: 18000, enrolmentFee: 5000, status: 'published' } })
  const pkg = await prisma.package.create({ data: { name: '10 hours', programId: w.program.id, hours: 10, price: 50000, expiryMonths: 6, status: 'published' } })
  return { ...w, series, plan, pkg }
}

/** What Stripe Elements does in the browser, done with the test card. */
async function confirmWithTestCard(paymentSessionId: string) {
  const keys = await stripeKeys(prisma)
  const ps = await prisma.paymentSession.findUnique({ where: { id: paymentSessionId } })
  return stripe.confirmPaymentIntent(keys, ps.providerPaymentId, 'pm_card_visa', `test-confirm:${ps.id}`)
}

test('§10.15 enrolment checkout end to end: assessment → plan → pay → membership active, credit granted, 4 weeks booked', { skip: skipReason }, async () => {
  const c = await catalogue()
  const f = await family(prisma, c.roles, 1, 'Enrol')
  await prisma.student.update({ where: { id: f.students[0].id }, data: { status: 'prospect' } })
  const lead = await prisma.lead.create({ data: { guardianName: 'Ana Enrol', email: 'ana.enrol@example.com', familyId: f.family.id, studentId: f.students[0].id, status: 'proposal_sent' } })
  const lp = await prisma.learningPlan.create({ data: { studentId: f.students[0].id, programId: c.program.id, status: 'proposed', recommendedPlanId: c.plan.id, summary: 'Fractions first' } })

  const r = (await gql(ctx, f.guardian.id, CHECKOUT, { p: c.program.id, pl: c.plan.id, l: c.location.id, s: [c.series.id], sid: f.students[0].id, lp: lp.id, k: `enrol-${Date.now()}` })).startEnrolmentCheckout
  assert.equal(r.success, true, r.error)
  assert.equal(r.data.total, 23000, 'first month 180.00 + enrolment fee 50.00')
  assert.ok(r.data.clientSecret, 'client secret for Elements')
  assert.ok(r.data.publishableKey.startsWith('pk_test_'))
  // nothing starts before payment
  assert.equal((await prisma.enrollment.findUnique({ where: { id: r.id } })).status, 'pending_payment')

  // double click: the same open PaymentSession comes back
  const again = (await gql(ctx, f.guardian.id, `mutation($i: ID!) { payInvoice(invoiceId: $i) { success error data } }`, { i: r.data.invoiceId })).payInvoice
  assert.equal(again.data.paymentSessionId, r.data.paymentSessionId)

  await confirmWithTestCard(r.data.paymentSessionId)
  const done = (await gql(ctx, f.guardian.id, COMPLETE, { ps: r.data.paymentSessionId })).completeEnrolmentCheckout
  assert.equal(done.success, true, done.error)
  assert.equal(done.data.invoiceStatus, 'paid')
  assert.equal(done.data.enrollmentStatus, 'active')
  assert.equal(done.data.bookedSeats, 4)

  const e = await prisma.enrollment.findUnique({ where: { id: r.id }, include: { membership: { include: { grants: true } }, bookings: true, student: true } })
  assert.equal(e.membership.status, 'active')
  assert.equal(e.membership.grants.length, 1)
  assert.equal(e.membership.grants[0].minutesGranted, 240)
  assert.equal(e.membership.grants[0].minutesAvailable, 0, 'all four weekly seats hold the month’s credit')
  assert.equal(e.bookings.filter((b: any) => b.status === 'booked' && b.source === 'fixed_seat').length, 4)
  assert.equal(e.student.status, 'active')
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'enrolled')
  assert.equal((await prisma.learningPlan.findUnique({ where: { id: lp.id } })).status, 'active')
  const fam = await prisma.family.findUnique({ where: { id: f.family.id } })
  assert.match(fam.defaultPaymentMethodLabel, /VISA •••• 4242/)
  assert.deepEqual(await ledgerProblems(prisma, [f.family.id]), [])

  // completing again (refresh) changes nothing: one payment, one grant, fulfilment once
  const twice = (await gql(ctx, f.guardian.id, COMPLETE, { ps: r.data.paymentSessionId })).completeEnrolmentCheckout
  assert.equal(twice.success, true)
  assert.equal(await prisma.payment.count({ where: { invoiceId: r.data.invoiceId } }), 1)
  assert.equal(await prisma.creditGrant.count({ where: { membershipId: e.membership.id } }), 1)

  // sibling enrolling: 10% off the membership line, no second enrolment fee for the first child
  const sib = await prisma.student.create({ data: { familyId: f.family.id, firstName: 'Leo', lastName: 'Enrol', status: 'prospect' } })
  const s2 = (await gql(ctx, f.guardian.id, CHECKOUT, { p: c.program.id, pl: c.plan.id, l: c.location.id, s: [], sid: sib.id, k: `enrol-sib-${Date.now()}` })).startEnrolmentCheckout
  assert.equal(s2.success, true, s2.error)
  assert.equal(s2.data.total, 18000 - 1800 + 5000)
  // already enrolled is refused
  const dup = (await gql(ctx, f.guardian.id, CHECKOUT, { p: c.program.id, pl: c.plan.id, l: c.location.id, sid: f.students[0].id })).startEnrolmentCheckout
  assert.match(dup.error, /already enrolled/)
  // cancel the sibling's unpaid checkout: invoice void, nothing left pending
  const cancel = (await gql(ctx, f.guardian.id, `mutation($e: ID!) { cancelEnrolmentCheckout(enrollmentId: $e) { success error } }`, { e: s2.id })).cancelEnrolmentCheckout
  assert.equal(cancel.success, true, cancel.error)
  assert.equal((await prisma.invoice.findUnique({ where: { id: s2.data.invoiceId } })).status, 'void')
})

test('visitor enrols directly: account, family and student created; package purchase with saved card off-session', { skip: skipReason }, async () => {
  const c = await catalogue()
  const email = `vis.${Date.now()}@example.com`
  const r = (await gql(ctx, null, `mutation($p: ID!, $pk: ID!, $l: ID!, $e: String!) { startEnrolmentCheckout(programId: $p, packageId: $pk, mode: "in_centre", locationId: $l, student: { firstName: "Kai" }, guardian: { name: "Rosa Lee", email: $e }, acceptPolicies: true) { success error id data } }`, { p: c.program.id, pk: c.pkg.id, l: c.location.id, e: email })).startEnrolmentCheckout
  assert.equal(r.success, true, r.error)
  assert.equal(r.data.newAccount, true)
  assert.equal(r.data.total, 50000)
  const guardian = await prisma.user.findFirst({ where: { email } })
  await confirmWithTestCard(r.data.paymentSessionId)
  const done = (await gql(ctx, guardian.id, COMPLETE, { ps: r.data.paymentSessionId })).completeEnrolmentCheckout
  assert.equal(done.success, true, done.error)
  const sp = await prisma.studentPackage.findFirst({ where: { familyId: r.data.familyId }, include: { grants: true } })
  assert.equal(sp.status, 'active')
  assert.equal(sp.grants[0].minutesAvailable, 600)

  // top-up with the saved card, charged off-session; no browser step
  const top = (await gql(ctx, guardian.id, `mutation($p: ID!, $s: ID!, $k: String) { purchasePackage(packageId: $p, studentId: $s, useSavedCard: true, idempotencyKey: $k) { success error id data } }`, { p: c.pkg.id, s: r.data.studentId, k: `topup-${Date.now()}` })).purchasePackage
  assert.equal(top.success, true, top.error)
  assert.equal(top.data.invoiceStatus, 'paid')
  const grants = await prisma.creditGrant.findMany({ where: { familyId: r.data.familyId, kind: 'package' } })
  assert.equal(grants.reduce((s: number, g: any) => s + g.minutesAvailable, 0), 1200)

  // §10.12 refund: more than captured is refused; package refund through Stripe removes the unused credit
  const payment = await prisma.payment.findFirst({ where: { invoiceId: top.data.invoiceId } })
  const REFUND = `mutation($p: ID!, $a: Int!, $k: String) { refundPayment(paymentId: $p, amount: $a, reason: "Changed plans", idempotencyKey: $k) { success error data } }`
  const tooMuch = (await gql(ctx, c.owner.id, REFUND, { p: payment.id, a: 50001 })).refundPayment
  assert.equal(tooMuch.success, false)
  const frontDesk = (await gql(ctx, c.frontDesk.id, REFUND, { p: payment.id, a: 1000 })).refundPayment
  assert.equal(frontDesk.success, false, 'front desk cannot refund')
  const ok = (await gql(ctx, c.owner.id, REFUND, { p: payment.id, a: 50000, k: `refund-${Date.now()}` })).refundPayment
  assert.equal(ok.success, true, ok.error)
  assert.equal(ok.data.status, 'succeeded')
  assert.equal(ok.data.removedMinutes, 600)
  const refund = await prisma.refund.findFirst({ where: { paymentId: payment.id } })
  assert.ok(refund.providerRefundId.startsWith('re_'))
  assert.equal((await prisma.payment.findUnique({ where: { id: payment.id } })).status, 'refunded')
  const second = (await gql(ctx, c.owner.id, REFUND, { p: payment.id, a: 1 })).refundPayment
  assert.equal(second.success, false, 'nothing left to refund')
  assert.deepEqual(await ledgerProblems(prisma, [r.data.familyId]), [])
})

test('§10.11 webhook: bad signature refused, success applies once, duplicate ignored, wrong amount parked', { skip: skipReason }, async () => {
  const c = await catalogue()
  const f = await family(prisma, c.roles, 1, 'Hook')
  const secret = process.env.STRIPE_WEBHOOK_SECRET!
  const keys = await stripeKeys(prisma)
  const inv = (await gql(ctx, f.guardian.id, `mutation($p: ID!, $s: ID!) { purchasePackage(packageId: $p, studentId: $s) { success error id data } }`, { p: c.pkg.id, s: f.students[0].id })).purchasePackage
  assert.equal(inv.success, true, inv.error)
  const ps = await prisma.paymentSession.findUnique({ where: { id: inv.data.paymentSessionId } })
  const pi = await stripe.confirmPaymentIntent(keys, ps.providerPaymentId, 'pm_card_visa', `hook-confirm:${ps.id}`)
  assert.equal(pi.status, 'succeeded')

  const body = JSON.stringify({ id: `evt_test_${ps.id}`, type: 'payment_intent.succeeded', data: { object: pi } })
  const bytes = new TextEncoder().encode(body)
  const bad = await processStripeWebhook(prisma, bytes, stripe.signStripePayload(body, 'whsec_wrong'))
  assert.equal(bad.status, 400)
  assert.equal(bad.body.outcome, 'bad_signature')
  const tampered = await processStripeWebhook(prisma, new TextEncoder().encode(body.replace('"succeeded"', '"canceled"')), stripe.signStripePayload(body, secret))
  assert.equal(tampered.status, 400)

  const good = await processStripeWebhook(prisma, bytes, stripe.signStripePayload(body, secret))
  assert.equal(good.status, 200)
  assert.equal(good.body.outcome, 'captured')
  const dup = await processStripeWebhook(prisma, bytes, stripe.signStripePayload(body, secret))
  assert.equal(dup.body.outcome, 'duplicate')
  // the browser "complete" arriving after the webhook is also a no-op
  await gql(ctx, f.guardian.id, `mutation($ps: ID!) { refreshPayment(paymentSessionId: $ps) { success } }`, { ps: ps.id })
  assert.equal(await prisma.payment.count({ where: { invoiceId: inv.data.invoiceId } }), 1)
  const invoice = await prisma.invoice.findUnique({ where: { id: inv.data.invoiceId } })
  assert.equal(invoice.status, 'paid')
  assert.equal(invoice.amountPaid, 50000)
  assert.equal(await prisma.creditGrant.count({ where: { familyId: f.family.id, kind: 'package' } }), 1)

  // wrong amount for a different payment session → parked, nothing applied
  const inv2 = (await gql(ctx, f.guardian.id, `mutation($p: ID!, $s: ID!) { purchasePackage(packageId: $p, studentId: $s) { success error id data } }`, { p: c.pkg.id, s: f.students[0].id })).purchasePackage
  const ps2 = await prisma.paymentSession.findUnique({ where: { id: inv2.data.paymentSessionId } })
  const forged = { ...pi, id: ps2.providerPaymentId, amount: 100, metadata: { ...pi.metadata, paymentSessionId: ps2.id, invoiceId: inv2.data.invoiceId } }
  const body2 = JSON.stringify({ id: `evt_test_${ps2.id}`, type: 'payment_intent.succeeded', data: { object: forged } })
  const parked = await processStripeWebhook(prisma, new TextEncoder().encode(body2), stripe.signStripePayload(body2, secret))
  assert.equal(parked.status, 200)
  assert.equal(parked.body.outcome, 'parked')
  assert.match((await prisma.paymentSession.findUnique({ where: { id: ps2.id } })).reviewReason, /amount/)
  assert.equal((await prisma.invoice.findUnique({ where: { id: inv2.data.invoiceId } })).status, 'open')
  assert.equal(await prisma.payment.count({ where: { invoiceId: inv2.data.invoiceId } }), 0)
})

test('front desk records cash and cheque; credit note; void only without payments; guardian cannot pay another family’s invoice', { skip: skipReason }, async () => {
  const c = await catalogue()
  const f = await family(prisma, c.roles, 1, 'Desk')
  const other = await family(prisma, c.roles, 1, 'Other')
  await prisma.family.update({ where: { id: f.family.id }, data: { primaryLocationId: c.location.id } })
  const inv = (await gql(ctx, c.frontDesk.id, `mutation($p: ID!, $s: ID!) { purchasePackage(packageId: $p, studentId: $s) { success error id data } }`, { p: c.pkg.id, s: f.students[0].id })).purchasePackage
  assert.equal(inv.success, true, inv.error)
  const invoiceId = inv.data.invoiceId
  const PAY = `mutation($i: ID!) { payInvoice(invoiceId: $i) { success error } }`
  assert.equal((await gql(ctx, other.guardian.id, PAY, { i: invoiceId })).payInvoice.success, false)
  const OFFLINE = `mutation($i: ID!, $a: Int!, $m: String!, $r: String) { recordOfflinePayment(invoiceId: $i, amount: $a, method: $m, reference: $r) { success error data } }`
  assert.match((await gql(ctx, c.frontDesk.id, OFFLINE, { i: invoiceId, a: 1000, m: 'card' })).recordOfflinePayment.error, /card form/)
  assert.match((await gql(ctx, c.frontDesk.id, OFFLINE, { i: invoiceId, a: 1000, m: 'cheque' })).recordOfflinePayment.error, /cheque number/)
  const part = (await gql(ctx, c.frontDesk.id, OFFLINE, { i: invoiceId, a: 20000, m: 'cash' })).recordOfflinePayment
  assert.equal(part.data.invoiceStatus, 'partially_paid')
  assert.equal((await gql(ctx, c.frontDesk.id, `mutation($i: ID!) { voidInvoice(invoiceId: $i, reason: "x") { success error } }`, { i: invoiceId })).voidInvoice.success, false)
  const note = (await gql(ctx, c.frontDesk.id, `mutation($i: ID!) { issueCreditNote(invoiceId: $i, amount: 5000, reason: "Goodwill") { success error data } }`, { i: invoiceId })).issueCreditNote
  assert.equal(note.success, true, note.error)
  assert.equal((await gql(ctx, c.frontDesk.id, OFFLINE, { i: invoiceId, a: 30000, m: 'cheque', r: '1042' })).recordOfflinePayment.success, false, 'over the amount due')
  const rest = (await gql(ctx, c.frontDesk.id, OFFLINE, { i: invoiceId, a: 25000, m: 'cheque', r: '1042' })).recordOfflinePayment
  assert.equal(rest.data.invoiceStatus, 'paid')
  const sp = await prisma.studentPackage.findFirst({ where: { invoiceId }, include: { grants: true } })
  assert.equal(sp.status, 'active')
  assert.equal(sp.grants[0].minutesAvailable, 600)
})
