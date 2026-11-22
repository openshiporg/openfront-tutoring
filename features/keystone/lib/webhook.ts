/**
 * Stripe webhook processing (§4.10, §12: raw-body signature check and event dedupe). Adapted from
 * Barbershop's processPaymentProviderWebhook: the durable replay claim (PaymentWebhookEvent unique
 * replayKey) is written before any settlement, so a concurrent duplicate never applies twice; a claim
 * whose handler throws is released so Stripe's retry is processed again.
 */
import { createHash } from 'node:crypto'
import { verifyStripeSignature, type PaymentIntent, type SetupIntent } from '../../integrations/payment/stripe'
import { stripeKeys, settlePaymentIntent, saveCardReference } from './payments'
import { transaction, recordChange } from './command'

export type WebhookOutcome = { status: number; body: { success: boolean; outcome: string } }

const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex')

export async function processStripeWebhook(prisma: any, rawBody: Uint8Array, signature: string): Promise<WebhookOutcome> {
  const keys = await stripeKeys(prisma)
  if (!keys.webhookSecret) return { status: 400, body: { success: false, outcome: 'not_configured' } }
  if (!verifyStripeSignature(rawBody, signature, keys.webhookSecret)) return { status: 400, body: { success: false, outcome: 'bad_signature' } }

  let event: { id?: string; type?: string; data?: { object?: any } }
  try { event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rawBody)) } catch { return { status: 400, body: { success: false, outcome: 'bad_body' } } }
  if (typeof event.id !== 'string' || typeof event.type !== 'string') return { status: 400, body: { success: false, outcome: 'no_event_id' } }

  const replayKey = sha(`pp_stripe:${event.id}`)
  const payloadHash = sha(rawBody)
  const existing = await prisma.paymentWebhookEvent.findUnique({ where: { replayKey } })
  if (existing) return { status: existing.payloadHash === payloadHash ? 200 : 400, body: { success: existing.payloadHash === payloadHash, outcome: existing.payloadHash === payloadHash ? 'duplicate' : 'conflict' } }
  let claimId: string
  try {
    const claim = await prisma.paymentWebhookEvent.create({ data: { replayKey, providerCode: 'pp_stripe', providerEventId: event.id, eventType: event.type, payloadHash, outcome: 'processing', processedAt: new Date() } })
    claimId = claim.id
  } catch (error: any) {
    if (error?.code === 'P2002') return { status: 200, body: { success: true, outcome: 'duplicate' } }
    throw error
  }

  try {
    const obj = event.data?.object ?? {}
    let outcome = 'ignored'
    if (event.type.startsWith('payment_intent.')) {
      // Re-read is unnecessary: the body is signed. Settlement still checks amount/currency/invoice.
      const settled = await settlePaymentIntent(prisma, obj as PaymentIntent, `webhook:${event.type}`)
      outcome = settled.parked ? `parked: ${settled.parked}` : settled.status
    } else if (event.type === 'setup_intent.succeeded') {
      outcome = await settleSetupIntent(prisma, obj as SetupIntent)
    }
    await prisma.paymentWebhookEvent.update({ where: { id: claimId }, data: { outcome: outcome.slice(0, 300) } })
    return { status: 200, body: { success: true, outcome: outcome.startsWith('parked') ? 'parked' : outcome } }
  } catch (error) {
    // Release the claim so Stripe's retry is handled; PaymentWebhookEvent is append-only for
    // everyone else, the server deletes only its own unfinished claim.
    await prisma.paymentWebhookEvent.delete({ where: { id: claimId } }).catch(() => {})
    console.error('stripe webhook failed', (error as Error)?.message)
    return { status: 500, body: { success: false, outcome: 'error' } }
  }
}

/** A saved card (SetupIntent) becomes the family's default for off-session billing. */
export async function settleSetupIntent(prisma: any, si: SetupIntent) {
  if (si.status !== 'succeeded' || !si.payment_method) return si.status
  const session = await prisma.paymentSession.findFirst({ where: { providerPaymentId: si.id, purpose: 'setup' } })
  if (!session?.familyId) return 'ignored: unknown setup intent'
  await transaction(prisma, async (tx) => {
    const current = await tx.paymentSession.findUnique({ where: { id: session.id } })
    if (current.status === 'captured') return
    await tx.paymentSession.updateMany({ where: { id: session.id, status: current.status }, data: { status: 'captured', capturedAt: new Date() } })
    await recordChange(tx, { type: 'PaymentSession', id: session.id, from: current.status, to: 'captured', reason: 'setup_intent.succeeded' })
    await saveCardReference(tx, prisma, session.familyId, si.payment_method as string)
  })
  return 'card_saved'
}
