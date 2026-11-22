/**
 * Money in and out (§4.10, W8). Adapted from Barbershop's PaymentSession + webhook pattern with the
 * Invoice as the aggregate. Rules:
 * - A PaymentSession row is written BEFORE Stripe is called; the Stripe idempotency key is derived
 *   from the session id, so a retry never creates a second charge.
 * - Success is trusted only from a server-side read of the PaymentIntent (webhook or confirm call).
 * - Amount, currency and invoice must match the session, or it is parked for review (status unknown).
 * - Settlement is idempotent: Payment is unique on paymentSession and providerPaymentId, and
 *   fulfilment runs once (Invoice.fulfilledAt compare-and-set).
 */
import { createHash } from 'node:crypto'
import * as stripe from '../../integrations/payment/stripe'
import type { StripeKeys, PaymentIntent } from '../../integrations/payment/stripe'
import { transaction, recordChange, lockKey } from './command'
import { CommandError } from './errors'
import { applyToInvoice, amountDue } from './invoices'

type Tx = any
const STRIPE_CODE = 'pp_stripe'

// ------------------------------------------------------------------ provider + keys
export async function ensureProviders(db: any) {
  for (const p of [{ code: STRIPE_CODE, name: 'Card (Stripe)', isDefault: true }, { code: 'pp_manual', name: 'Cash, cheque or bank transfer', isDefault: false }]) {
    await db.paymentProvider.upsert({ where: { code: p.code }, create: { ...p, isInstalled: true }, update: {} })
  }
  return db.paymentProvider.findUnique({ where: { code: STRIPE_CODE } })
}

/** Keys from the installed provider (owner enters them in settings), else the deployment env. */
export async function stripeKeys(db: any): Promise<StripeKeys & { providerId: string | null }> {
  const provider = await db.paymentProvider.findUnique({ where: { code: STRIPE_CODE }, select: { id: true, isInstalled: true, credentials: true } })
  const c = (provider?.credentials ?? {}) as Record<string, string>
  return {
    providerId: provider?.id ?? null,
    secretKey: c.secretKey || process.env.STRIPE_SECRET_KEY || '',
    publishableKey: c.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_KEY || '',
    webhookSecret: c.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || '',
  }
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

// ------------------------------------------------------------------ fulfilment registry
type Fulfil = (tx: Tx, invoice: any, fulfilment: Record<string, any>) => Promise<void>
const fulfilments = new Map<string, Fulfil>()
/** Modules register what happens when an invoice of their kind becomes paid (package, enrolment, membership). */
export function registerFulfilment(kind: string, fn: Fulfil) { fulfilments.set(kind, fn) }

/** Runs once per invoice: compare-and-set on fulfilledAt. */
export async function fulfilInvoice(tx: Tx, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice || invoice.status !== 'paid' || invoice.fulfilledAt) return false
  const won = await tx.invoice.updateMany({ where: { id: invoiceId, fulfilledAt: null, status: 'paid' }, data: { fulfilledAt: new Date() } })
  if (won.count !== 1) return false
  const f = (invoice.fulfilment ?? {}) as Record<string, any>
  const fn = f.kind ? fulfilments.get(String(f.kind)) : undefined
  if (fn) await fn(tx, invoice, f)
  return true
}

/** Money applied by any route (card, cash, credit note) ends here. */
export async function applyPayment(tx: Tx, invoiceId: string, amount: number) {
  const r = await applyToInvoice(tx, invoiceId, amount, 'amountPaid')
  if (r.to === 'paid') await fulfilInvoice(tx, invoiceId)
  return r
}

// ------------------------------------------------------------------ Stripe customer
export async function ensureCustomer(prisma: any, keys: StripeKeys, familyId: string) {
  const family = await prisma.family.findUnique({ where: { id: familyId }, select: { id: true, name: true, billingEmail: true, stripeCustomerId: true, guardians: { select: { email: true }, take: 1 } } })
  if (!family) throw new CommandError('That family was not found.')
  if (family.stripeCustomerId) return family.stripeCustomerId as string
  const customer = await stripe.createCustomer(keys, { email: family.billingEmail || family.guardians[0]?.email || '', name: family.name, familyId }, `customer:${familyId}`)
  await prisma.family.updateMany({ where: { id: familyId, stripeCustomerId: '' }, data: { stripeCustomerId: customer.id } })
  const after = await prisma.family.findUnique({ where: { id: familyId }, select: { stripeCustomerId: true } })
  return after.stripeCustomerId as string
}

// ------------------------------------------------------------------ start an invoice payment
export type StartedPayment = { paymentSessionId: string; clientSecret: string | null; publishableKey: string; amount: number; currency: string; status: string; invoiceId: string }

/**
 * Create (or reuse) a PaymentSession and its PaymentIntent for the invoice's amount due.
 * Must be called OUTSIDE a transaction: it talks to Stripe.
 */
export async function startInvoicePayment(prisma: any, input: { invoiceId: string; actorId: string | null; saveCard?: boolean; offSession?: boolean; attemptKey?: string }) : Promise<StartedPayment> {
  const keys = await stripeKeys(prisma)
  if (!keys.secretKey) throw new CommandError('Card payments are not set up yet. Please pay at the centre or ask the owner to add the Stripe keys in Settings → Payments.')
  await ensureProviders(prisma)
  const invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId }, select: { id: true, number: true, familyId: true, status: true, total: true, amountPaid: true, amountCredited: true, currency: true, kind: true, family: { select: { defaultPaymentMethodId: true, billingEmail: true } } } })
  if (!invoice || !['open', 'partially_paid'].includes(invoice.status)) throw new CommandError('This invoice has nothing to pay.')
  const amount = amountDue(invoice)
  if (amount <= 0) throw new CommandError('This invoice has nothing to pay.')
  const currency = (invoice.currency || 'USD').toUpperCase()

  const customer = await ensureCustomer(prisma, keys, invoice.familyId)
  const session = await transaction(prisma, async (tx) => {
    await lockKey(tx, `invoice-pay:${invoice.id}`)
    // Reuse an open on-session attempt for the same amount (refresh, double click, two tabs).
    if (!input.offSession) {
      const open = await tx.paymentSession.findFirst({ where: { invoiceId: invoice.id, amount, currencyCode: currency, offSession: false, status: { in: ['pending', 'requires_action'] }, createdAt: { gte: new Date(Date.now() - 23 * 3600_000) } }, orderBy: { createdAt: 'desc' } })
      if (open) return open
    }
    const keyHash = hash(`invoice:${invoice.id}:${amount}:${input.offSession ? 'off' : 'on'}:${input.attemptKey || Date.now()}`)
    const existing = await tx.paymentSession.findUnique({ where: { idempotencyKeyHash: keyHash } })
    if (existing) return existing
    return tx.paymentSession.create({
      data: {
        invoice: { connect: { id: invoice.id } }, family: { connect: { id: invoice.familyId } },
        ...(keys.providerId ? { paymentProvider: { connect: { id: keys.providerId } } } : {}),
        purpose: 'invoice', idempotencyKeyHash: keyHash, status: 'pending', amount, currencyCode: currency,
        offSession: Boolean(input.offSession), metadata: { saveCard: Boolean(input.saveCard), invoiceNumber: invoice.number },
        ...(input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}),
      },
    })
  })
  if (session.providerPaymentId && session.clientSecret && !input.offSession) {
    if (input.saveCard && !(session.metadata as any)?.saveCard) await prisma.paymentSession.update({ where: { id: session.id }, data: { metadata: { ...(session.metadata as object), saveCard: true } } })
    return { paymentSessionId: session.id, clientSecret: session.clientSecret, publishableKey: keys.publishableKey, amount, currency, status: session.status, invoiceId: invoice.id }
  }
  if (session.providerPaymentId) {
    const settled = await refreshPaymentSession(prisma, session.id)
    return { paymentSessionId: session.id, clientSecret: session.clientSecret || null, publishableKey: keys.publishableKey, amount, currency, status: settled.status, invoiceId: invoice.id }
  }

  let pi: PaymentIntent
  try {
    pi = await stripe.createPaymentIntent(keys, {
      amount, currency, customer, description: `Invoice ${invoice.number ?? ''}`.trim(), receiptEmail: invoice.family?.billingEmail,
      metadata: { paymentSessionId: session.id, invoiceId: invoice.id, familyId: invoice.familyId },
      offSession: input.offSession, paymentMethod: input.offSession ? invoice.family?.defaultPaymentMethodId : null, saveCard: input.saveCard,
    }, `ps:${session.id}`)
  } catch (error) {
    const e = error as stripe.StripeError
    // A decline on an off-session charge still created a PaymentIntent; Stripe reports it in the error.
    const status = e.unclear ? 'unknown' : 'failed'
    await prisma.paymentSession.updateMany({ where: { id: session.id, status: 'pending' }, data: { status, failureMessage: String(e.message).slice(0, 500) } })
    await prisma.changeEvent.create({ data: { aggregateType: 'PaymentSession', aggregateId: session.id, from: 'pending', to: status, reason: e.code || 'stripe_error' } })
    if (e.unclear) throw new CommandError('The card processor did not answer. We will check the payment before trying again.')
    throw new CommandError(e.declined ? `The card was declined: ${e.message}` : e.message)
  }
  await prisma.paymentSession.update({ where: { id: session.id }, data: { providerPaymentId: pi.id, clientSecret: pi.client_secret || '' } })
  const settled = await settlePaymentIntent(prisma, pi, 'create')
  return { paymentSessionId: session.id, clientSecret: pi.client_secret, publishableKey: keys.publishableKey, amount, currency, status: settled.status, invoiceId: invoice.id }
}

// ------------------------------------------------------------------ settle
function mapStatus(pi: PaymentIntent) {
  switch (pi.status) {
    case 'succeeded': return 'captured'
    case 'requires_capture': return 'authorized'
    case 'requires_action': return 'requires_action'
    case 'canceled': return 'cancelled'
    case 'requires_payment_method': return pi.last_payment_error ? 'failed' : 'pending'
    default: return 'pending'
  }
}

export type Settlement = { status: string; paymentId: string | null; parked: string | null; invoiceStatus: string | null; paymentSessionId: string | null }

/** Apply a PaymentIntent read from Stripe. Safe to call any number of times, from any route. */
export async function settlePaymentIntent(prisma: any, pi: PaymentIntent, source: string): Promise<Settlement> {
  return transaction(prisma, async (tx) => {
    const byId = await tx.paymentSession.findFirst({ where: { providerPaymentId: pi.id } })
    const session = byId ?? (pi.metadata?.paymentSessionId ? await tx.paymentSession.findUnique({ where: { id: pi.metadata.paymentSessionId } }) : null)
    if (!session) return { status: 'ignored', paymentId: null, parked: 'no payment session for this PaymentIntent', invoiceStatus: null, paymentSessionId: null }
    await lockKey(tx, `payment-session:${session.id}`)
    const current = await tx.paymentSession.findUnique({ where: { id: session.id } })
    const next = mapStatus(pi)

    // Mismatch → park for review, never apply.
    const problems: string[] = []
    if (pi.amount !== current.amount) problems.push(`amount ${pi.amount} != ${current.amount}`)
    if ((pi.currency || '').toUpperCase() !== (current.currencyCode || '').toUpperCase()) problems.push(`currency ${pi.currency} != ${current.currencyCode}`)
    if (pi.metadata?.invoiceId && pi.metadata.invoiceId !== current.invoiceId) problems.push('invoice does not match')
    if (current.providerPaymentId && current.providerPaymentId !== pi.id) problems.push('payment intent does not match')
    if (problems.length) {
      const reason = problems.join('; ')
      if (current.reviewReason !== reason || current.status !== 'unknown') {
        await tx.paymentSession.update({ where: { id: current.id }, data: { status: current.status === 'captured' ? current.status : 'unknown', reviewReason: reason } })
        await recordChange(tx, { type: 'PaymentSession', id: current.id, from: current.status, to: 'unknown', reason: `parked: ${reason}`, data: { source, paymentIntent: pi.id } })
      }
      return { status: 'parked', paymentId: null, parked: reason, invoiceStatus: null, paymentSessionId: current.id }
    }

    if (next !== 'captured') {
      if (current.status !== next && !['captured', 'refunded', 'partially_refunded'].includes(current.status)) {
        await tx.paymentSession.updateMany({ where: { id: current.id, status: current.status }, data: { status: next, ...(next === 'failed' ? { failureMessage: pi.last_payment_error?.message?.slice(0, 500) || 'Payment failed' } : {}), ...(next === 'cancelled' ? { cancelledAt: new Date() } : {}) } })
        await recordChange(tx, { type: 'PaymentSession', id: current.id, from: current.status, to: next, reason: source })
      }
      return { status: next, paymentId: null, parked: null, invoiceStatus: null, paymentSessionId: current.id }
    }

    // Captured: exactly one Payment, money applied once.
    const existing = await tx.payment.findFirst({ where: { OR: [{ paymentSessionId: current.id }, { providerPaymentId: pi.id }] }, select: { id: true } })
    if (existing) {
      const inv = current.invoiceId ? await tx.invoice.findUnique({ where: { id: current.invoiceId }, select: { status: true } }) : null
      return { status: 'captured', paymentId: existing.id, parked: null, invoiceStatus: inv?.status ?? null, paymentSessionId: current.id }
    }
    await tx.paymentSession.updateMany({ where: { id: current.id }, data: { status: 'captured', capturedAt: new Date(), reviewReason: '' } })
    await recordChange(tx, { type: 'PaymentSession', id: current.id, from: current.status, to: 'captured', reason: source })
    const payment = await tx.payment.create({
      data: {
        ...(current.invoiceId ? { invoice: { connect: { id: current.invoiceId } } } : {}),
        ...(current.familyId ? { family: { connect: { id: current.familyId } } } : {}),
        amount: pi.amount, currency: current.currencyCode, method: 'card', reference: pi.id, status: 'captured',
        paymentSession: { connect: { id: current.id } }, providerPaymentId: pi.id,
      },
    })
    await recordChange(tx, { type: 'Payment', id: payment.id, to: 'captured', reason: source })
    let invoiceStatus: string | null = null
    if (current.invoiceId) {
      try {
        invoiceStatus = (await applyPayment(tx, current.invoiceId, pi.amount)).to
      } catch (error) {
        if (!(error instanceof CommandError)) throw error
        // Paid twice (e.g. cash then card): keep the money, flag for a refund decision.
        await tx.paymentSession.update({ where: { id: current.id }, data: { reviewReason: 'Captured after the invoice was already settled; refund or credit the family.' } })
        invoiceStatus = 'overpaid'
      }
    }
    // Save the card for off-session billing when the guardian asked to.
    const metadata = (current.metadata ?? {}) as Record<string, unknown>
    if (metadata.saveCard && pi.payment_method && current.familyId) await saveCardReference(tx, prisma, current.familyId, pi.payment_method)
    return { status: 'captured', paymentId: payment.id, parked: null, invoiceStatus, paymentSessionId: current.id }
  })
}

/** Stores only the provider reference and a label (never card data). */
export async function saveCardReference(tx: Tx, prisma: any, familyId: string, paymentMethodId: string, label?: string) {
  let display = label ?? ''
  if (!display) {
    try {
      const keys = await stripeKeys(prisma)
      const pm = await stripe.retrievePaymentMethod(keys, paymentMethodId)
      display = pm.card ? `${pm.card.brand.toUpperCase()} •••• ${pm.card.last4} (${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)})` : 'Saved card'
    } catch { display = 'Saved card' }
  }
  await tx.family.update({ where: { id: familyId }, data: { defaultPaymentMethodId: paymentMethodId, defaultPaymentMethodLabel: display } })
}

/** Server-side read and settle (the "complete" step after the browser confirms). */
export async function refreshPaymentSession(prisma: any, paymentSessionId: string) {
  const session = await prisma.paymentSession.findUnique({ where: { id: paymentSessionId } })
  if (!session?.providerPaymentId) throw new CommandError('That payment was not found.')
  const keys = await stripeKeys(prisma)
  const pi = await stripe.retrievePaymentIntent(keys, session.providerPaymentId)
  return settlePaymentIntent(prisma, pi, 'confirm')
}

// ------------------------------------------------------------------ refunds
/** Inside a transaction: reserve the refund with a guarded update (sum ≤ captured), write Refund requested. */
export async function requestRefund(tx: Tx, input: { paymentId: string; amount: number; reason: string; actorId?: string | null; key: string }) {
  const amount = Math.round(input.amount)
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new CommandError('Enter a refund amount.')
  const existing = await tx.refund.findUnique({ where: { idempotencyKey: input.key } })
  if (existing) return existing
  const rows: number = await tx.$executeRaw`
    UPDATE "Payment" SET "refundedAmount" = COALESCE("refundedAmount", 0) + ${amount},
      status = CASE WHEN COALESCE("refundedAmount", 0) + ${amount} = amount THEN 'refunded' ELSE 'partially_refunded' END,
      "updatedAt" = now()
    WHERE id = ${input.paymentId} AND status IN ('captured', 'partially_refunded') AND COALESCE("refundedAmount", 0) + ${amount} <= amount`
  if (rows !== 1) throw new CommandError('That is more than is left to refund on this payment.')
  const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, select: { method: true, status: true, invoiceId: true, amount: true, refundedAmount: true } })
  const refund = await tx.refund.create({
    data: {
      payment: { connect: { id: input.paymentId } }, amount, reason: input.reason.slice(0, 500), idempotencyKey: input.key,
      // Cash, cheque and transfer refunds are recorded as handed back; card goes to Stripe after commit.
      status: payment.method === 'card' ? 'requested' : 'succeeded',
      ...(input.actorId ? { requestedBy: { connect: { id: input.actorId } } } : {}),
    },
  })
  await recordChange(tx, { type: 'Payment', id: input.paymentId, to: payment.status, actorId: input.actorId, reason: 'refund', data: { refundId: refund.id, amount } })
  return refund
}

/** After commit: send a requested card refund to Stripe. Unclear answers stay `unknown` for reconcile. */
export async function processRefund(prisma: any, refundId: string) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId }, include: { payment: { select: { providerPaymentId: true, method: true } } } })
  if (!refund || refund.status !== 'requested' || refund.payment?.method !== 'card') return refund?.status ?? null
  const keys = await stripeKeys(prisma)
  try {
    const r = await stripe.createRefund(keys, { paymentIntent: refund.payment.providerPaymentId, amount: refund.amount, reason: refund.reason, metadata: { refundId: refund.id } }, `refund:${refund.id}`)
    const status = r.status === 'succeeded' || r.status === 'pending' ? 'succeeded' : 'failed'
    await prisma.refund.updateMany({ where: { id: refund.id, status: 'requested' }, data: { status, providerRefundId: r.id, failureReason: status === 'failed' ? r.status : '' } })
    if (status === 'failed') await releaseRefundReservation(prisma, refund.id)
    return status
  } catch (error) {
    const e = error as stripe.StripeError
    if (e.unclear) {
      await prisma.refund.updateMany({ where: { id: refund.id, status: 'requested' }, data: { status: 'unknown', failureReason: e.message.slice(0, 500) } })
      return 'unknown'
    }
    await prisma.refund.updateMany({ where: { id: refund.id, status: 'requested' }, data: { status: 'failed', failureReason: e.message.slice(0, 500) } })
    await releaseRefundReservation(prisma, refund.id)
    return 'failed'
  }
}

async function releaseRefundReservation(prisma: any, refundId: string) {
  await transaction(prisma, async (tx) => {
    const refund = await tx.refund.findUnique({ where: { id: refundId }, select: { paymentId: true, amount: true } })
    await tx.$executeRaw`
      UPDATE "Payment" SET "refundedAmount" = GREATEST(0, COALESCE("refundedAmount", 0) - ${refund.amount}),
        status = CASE WHEN COALESCE("refundedAmount", 0) - ${refund.amount} <= 0 THEN 'captured' ELSE 'partially_refunded' END, "updatedAt" = now()
      WHERE id = ${refund.paymentId}`
    await recordChange(tx, { type: 'Refund', id: refundId, from: 'requested', to: 'failed', reason: 'provider refused' })
  })
}

/** Void an unpaid invoice (no payments). Returns true when it was voided. */
export async function voidInvoiceIfUnpaid(tx: Tx, invoiceId: string, reason: string, actorId?: string | null) {
  const r = await tx.invoice.updateMany({ where: { id: invoiceId, status: { in: ['open', 'draft'] }, amountPaid: 0 }, data: { status: 'void', notes: reason.slice(0, 500) } })
  if (r.count) {
    await recordChange(tx, { type: 'Invoice', id: invoiceId, from: 'open', to: 'void', actorId, reason })
    // Cancel any pending PaymentIntent sessions so a late browser confirm cannot charge a void invoice.
    await tx.paymentSession.updateMany({ where: { invoiceId, status: { in: ['pending', 'requires_action'] } }, data: { status: 'cancelled', cancelledAt: new Date() } })
  }
  return r.count === 1
}

export { stripe }
