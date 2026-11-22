'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { completePaymentAction, startInvoicePaymentAction, type PaymentStart } from '../lib/actions'
import { money } from '../lib/format'

const stripeCache = new Map<string, Promise<Stripe | null>>()
const stripeFor = (key: string) => {
  if (!stripeCache.has(key)) stripeCache.set(key, loadStripe(key))
  return stripeCache.get(key)!
}

const appearance = {
  theme: 'stripe' as const,
  variables: { colorPrimary: '#111111', colorText: '#1d1d1d', colorDanger: '#b3261e', borderRadius: '6px', fontFamily: 'system-ui, sans-serif', fontSizeBase: '16px' },
}

/**
 * Pay one open invoice by card. The server opens the PaymentIntent (payInvoice), Stripe Elements
 * collects the card and confirms, then the server reads the PaymentIntent and settles it.
 */
export function PayInvoice({ invoiceId, amount, currency, idempotencyKey, saveCardDefault = true, onPaid, label }: { invoiceId: string; amount: number; currency: string; idempotencyKey: string; saveCardDefault?: boolean; onPaid?: () => void; label?: string }) {
  const [start, setStart] = useState<PaymentStart | null>(null)
  const [saveCard, setSaveCard] = useState(saveCardDefault)
  const [opening, setOpening] = useState(false)

  async function open() {
    setOpening(true)
    const r = await startInvoicePaymentAction(invoiceId, saveCard, idempotencyKey)
    setStart(r)
    setOpening(false)
  }

  if (start?.ok && start.status === 'captured') return <Paid amount={amount} currency={currency} />
  if (start?.ok && start.clientSecret && start.publishableKey) {
    return (
      <Elements stripe={stripeFor(start.publishableKey)} options={{ clientSecret: start.clientSecret, appearance }}>
        <CardStep start={start} invoiceId={invoiceId} onPaid={onPaid} label={label} />
      </Elements>
    )
  }
  return (
    <div className="bp-stack">
      {start && !start.ok ? <div className="bp-notice is-error" role="alert">{start.error}</div> : null}
      {start?.ok && !start.publishableKey ? <div className="bp-notice is-error" role="alert">Card payments are not fully set up (the publishable key is missing). Please call us to pay.</div> : null}
      <label className="bp-check"><input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />Save this card for future monthly payments</label>
      <button type="button" className="bp-btn is-primary" style={{ width: '100%' }} onClick={open} disabled={opening}>{opening ? 'Opening secure payment…' : label || `Pay ${money(amount, currency)} by card`}</button>
    </div>
  )
}

function Paid({ amount, currency }: { amount: number; currency: string }) {
  return <div className="bp-notice is-ok" role="status"><b>Paid.</b> {money(amount, currency)} was charged to your card. A receipt is on its way by email.</div>
}

function CardStep({ start, invoiceId, onPaid, label }: { start: PaymentStart; invoiceId: string; onPaid?: () => void; label?: string }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const amount = start.amount ?? 0
  const currency = start.currency ?? 'USD'
  const returnUrl = useMemo(() => (typeof window === 'undefined' ? '' : window.location.href), [])

  useEffect(() => { if (done) onPaid?.() }, [done, onPaid])

  async function pay(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setBusy(true)
    setError(null)
    const result = await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: returnUrl } })
    if (result.error) {
      setError(result.error.message || 'The card could not be charged.')
      setBusy(false)
      return
    }
    const settled = await completePaymentAction(start.paymentSessionId!, invoiceId)
    setBusy(false)
    if (!settled.ok) { setError(settled.error || 'We could not confirm the payment yet. Refresh in a moment; you will not be charged twice.'); return }
    const status = settled.data?.status
    if (status === 'captured' || settled.data?.invoiceStatus === 'paid') setDone(true)
    else setError('Your bank is still processing this payment. We will email you as soon as it clears.')
  }

  if (done) return <Paid amount={amount} currency={currency} />
  return (
    <form onSubmit={pay} className="bp-stack">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error ? <div className="bp-notice is-error" role="alert">{error}</div> : null}
      <button type="submit" className="bp-btn is-primary" style={{ width: '100%' }} disabled={!stripe || busy}>{busy ? 'Paying…' : label || `Pay ${money(amount, currency)}`}</button>
      <p className="bp-small bp-muted">Payments are processed securely by Stripe. We never see your full card number.</p>
    </form>
  )
}
