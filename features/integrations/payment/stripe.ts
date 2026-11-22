/**
 * Stripe through its REST API (fetch core adapted from openfront-barbershop
 * features/integrations/payment/stripe.ts). Tutoring uses PaymentIntents for one-off payments and
 * SetupIntents plus a saved card charged off-session by our own billing run (§4.12, §12).
 * Money is confirmed from the webhook or a server-side read of the PaymentIntent, never the browser.
 * The secret key is STRIPE_SECRET_KEY (or the installed provider's stored credentials).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.stripe.com/v1'

export type StripeKeys = { secretKey: string; publishableKey: string; webhookSecret: string }

export class StripeError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null, readonly declined: boolean, readonly unclear: boolean) { super(message) }
}

function form(values: Record<string, string | number | boolean | undefined | null>) {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== '') body.append(key, String(value))
  return body
}

async function call<T>(keys: StripeKeys, path: string, init: { method?: 'GET' | 'POST'; body?: URLSearchParams; idempotencyKey?: string } = {}): Promise<T> {
  if (!keys.secretKey) throw new StripeError('Card payments are not set up yet. Add the Stripe keys in Settings → Payments.', 0, 'not_configured', false, false)
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method: init.method || 'GET',
      headers: {
        Authorization: `Bearer ${keys.secretKey}`,
        'Stripe-Version': '2024-06-20',
        ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
      },
      body: init.body,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    // Network failure or timeout: the outcome is unknown, never assume failure.
    throw new StripeError(`Stripe did not answer: ${(error as Error)?.message || 'network error'}`, 0, 'network', false, true)
  }
  const json = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: string; type?: string; decline_code?: string } } & T
  if (!response.ok) {
    const e = json.error ?? {}
    throw new StripeError(e.message || `Stripe request failed (${response.status}).`, response.status, e.code || e.decline_code || null, e.type === 'card_error', response.status >= 500 || response.status === 429)
  }
  return json
}

export type PaymentIntent = {
  id: string; status: string; amount: number; amount_received: number; currency: string; client_secret: string | null
  customer: string | null; payment_method: string | null; metadata: Record<string, string>; latest_charge: string | null
  last_payment_error?: { message?: string; code?: string } | null
}
export type SetupIntent = { id: string; status: string; client_secret: string | null; customer: string | null; payment_method: string | null; metadata: Record<string, string> }
export type PaymentMethod = { id: string; type: string; customer: string | null; card?: { brand: string; last4: string; exp_month: number; exp_year: number } }
export type Refund = { id: string; status: string; amount: number; payment_intent: string | null }

const meta = (m: Record<string, string | undefined | null> = {}) => Object.fromEntries(Object.entries(m).filter(([, v]) => v != null && v !== '').map(([k, v]) => [`metadata[${k}]`, String(v)]))

export function createCustomer(keys: StripeKeys, input: { email: string; name: string; familyId: string }, idempotencyKey: string) {
  return call<{ id: string }>(keys, '/customers', { method: 'POST', idempotencyKey, body: form({ email: input.email, name: input.name, ...meta({ familyId: input.familyId }) }) })
}

export function createPaymentIntent(keys: StripeKeys, input: {
  amount: number; currency: string; customer?: string | null; description: string; metadata: Record<string, string>
  paymentMethod?: string | null; offSession?: boolean; saveCard?: boolean; receiptEmail?: string | null
}, idempotencyKey: string) {
  const cents = Math.round(input.amount)
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new StripeError('Payment amount must be greater than zero.', 400, 'amount', false, false)
  return call<PaymentIntent>(keys, '/payment_intents', {
    method: 'POST', idempotencyKey,
    body: form({
      amount: cents, currency: input.currency.toLowerCase(), description: input.description,
      customer: input.customer || undefined,
      receipt_email: input.receiptEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.receiptEmail) ? input.receiptEmail : undefined,
      ...(input.offSession
        ? { payment_method: input.paymentMethod || undefined, off_session: 'true', confirm: 'true', 'payment_method_types[0]': 'card' }
        : { 'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never', ...(input.saveCard && input.customer ? { setup_future_usage: 'off_session' } : {}) }),
      ...meta(input.metadata),
    }),
  })
}

export function retrievePaymentIntent(keys: StripeKeys, id: string) {
  return call<PaymentIntent>(keys, `/payment_intents/${encodeURIComponent(id)}`)
}

/** Server-side confirm with a payment method id (used by staff "charge saved card" and our own tests with pm_card_visa). */
export function confirmPaymentIntent(keys: StripeKeys, id: string, paymentMethod: string, idempotencyKey: string) {
  return call<PaymentIntent>(keys, `/payment_intents/${encodeURIComponent(id)}/confirm`, { method: 'POST', idempotencyKey, body: form({ payment_method: paymentMethod }) })
}

export function cancelPaymentIntent(keys: StripeKeys, id: string) {
  return call<PaymentIntent>(keys, `/payment_intents/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
}

export function listPaymentIntentsByMetadata(keys: StripeKeys, key: string, value: string) {
  const q = encodeURIComponent(`metadata['${key}']:'${value.replace(/'/g, '')}'`)
  return call<{ data: PaymentIntent[] }>(keys, `/payment_intents/search?query=${q}&limit=10`)
}

export function createSetupIntent(keys: StripeKeys, input: { customer: string; metadata: Record<string, string> }, idempotencyKey: string) {
  return call<SetupIntent>(keys, '/setup_intents', { method: 'POST', idempotencyKey, body: form({ customer: input.customer, usage: 'off_session', 'automatic_payment_methods[enabled]': 'true', 'automatic_payment_methods[allow_redirects]': 'never', ...meta(input.metadata) }) })
}

export function retrieveSetupIntent(keys: StripeKeys, id: string) {
  return call<SetupIntent>(keys, `/setup_intents/${encodeURIComponent(id)}`)
}

export function retrievePaymentMethod(keys: StripeKeys, id: string) {
  return call<PaymentMethod>(keys, `/payment_methods/${encodeURIComponent(id)}`)
}

export function attachPaymentMethod(keys: StripeKeys, id: string, customer: string) {
  return call<PaymentMethod>(keys, `/payment_methods/${encodeURIComponent(id)}/attach`, { method: 'POST', body: form({ customer }) })
}

export function createRefund(keys: StripeKeys, input: { paymentIntent: string; amount: number; reason?: string; metadata?: Record<string, string> }, idempotencyKey: string) {
  return call<Refund>(keys, '/refunds', { method: 'POST', idempotencyKey, body: form({ payment_intent: input.paymentIntent, amount: Math.round(input.amount), ...meta({ ...(input.metadata ?? {}), note: input.reason }) }) })
}

/**
 * Stripe-Signature: "t=<unix>,v1=<hex>[,v1=...]" over "<t>.<raw body>" with HMAC-SHA256.
 * Checked over the exact received bytes; tolerance 5 minutes against replay.
 */
export function verifyStripeSignature(rawBody: Uint8Array, header: string, secret: string, toleranceSeconds = 300, now = Date.now()) {
  if (!rawBody.byteLength || !header || !secret) return false
  const parts = header.split(',').map((p) => p.trim().split('='))
  const t = parts.find(([k]) => k === 't')?.[1]
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v).filter((v): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/i.test(v))
  if (!t || !/^\d+$/.test(t) || !signatures.length) return false
  if (Math.abs(now / 1000 - Number(t)) > toleranceSeconds) return false
  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest()
  return signatures.some((s) => {
    const received = Buffer.from(s, 'hex')
    return received.length === expected.length && timingSafeEqual(received, expected)
  })
}

/** For our own tests and the onboarding self-check: sign a payload exactly as Stripe does. */
export function signStripePayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`
}
