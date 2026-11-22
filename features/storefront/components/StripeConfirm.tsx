'use client'

import { useMemo, useState } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'

const cache = new Map<string, Promise<Stripe | null>>()
export const stripeFor = (key: string) => {
  if (!cache.has(key)) cache.set(key, loadStripe(key))
  return cache.get(key)!
}

export const appearance = {
  theme: 'stripe' as const,
  variables: { colorPrimary: '#111111', colorText: '#1d1d1d', colorDanger: '#b3261e', borderRadius: '6px', fontFamily: 'system-ui, sans-serif', fontSizeBase: '16px' },
}

export type Settled = { ok: boolean; error: string | null; data?: any }

/**
 * Stripe Elements for a PaymentIntent or SetupIntent the server already opened. After the browser
 * confirms, `settle` asks the server to read the intent itself (never trusts the browser).
 */
export function StripeConfirm(props: { clientSecret: string; publishableKey: string; kind?: 'payment' | 'setup'; label: string; settle: () => Promise<Settled>; onSettled: (r: Settled) => void }) {
  return (
    <Elements stripe={stripeFor(props.publishableKey)} options={{ clientSecret: props.clientSecret, appearance }}>
      <Inner {...props} />
    </Elements>
  )
}

function Inner({ kind = 'payment', label, settle, onSettled }: { kind?: 'payment' | 'setup'; label: string; settle: () => Promise<Settled>; onSettled: (r: Settled) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const returnUrl = useMemo(() => (typeof window === 'undefined' ? '' : window.location.href), [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setBusy(true)
    setError(null)
    setNote(null)
    setSlow(false)
    // Stripe may hold the confirm open (bank 3-D Secure, or its own verification check). Never sit silent.
    const timer = window.setTimeout(() => setSlow(true), 20000)
    let result: { error?: { message?: string } }
    try {
      result = kind === 'setup'
        ? await stripe.confirmSetup({ elements, redirect: 'if_required', confirmParams: { return_url: returnUrl } })
        : await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: returnUrl } })
    } catch {
      result = { error: { message: 'The payment could not be started. Check your connection and try again.' } }
    } finally {
      window.clearTimeout(timer)
      setSlow(false)
    }
    if (result.error) {
      // Only here has nothing been taken: Stripe refused or never ran the confirm.
      setError(`${result.error.message || 'The card could not be used.'} You have not been charged; you can try again.`)
      setBusy(false)
      return
    }

    // Stripe accepted the card. From here on, never tell the customer they were not charged.
    // The server re-reads the intent itself; retry every 3 s for up to 60 s if it throws or is still settling.
    const deadline = Date.now() + 60000
    let last: Settled | null = null
    for (;;) {
      try {
        last = await settle()
        const pending = last.ok && last.data?.status && !['captured', 'succeeded', 'failed', 'cancelled'].includes(last.data.status) && last.data?.invoiceStatus !== 'paid'
        if (!pending && last.ok) break
        if (!last.ok && !/network|timeout|try again/i.test(last.error || '')) break
      } catch {
        last = null
      }
      if (Date.now() > deadline) break
      setNote(kind === 'setup' ? 'Your card was accepted; we are saving it.' : 'Your card was accepted; we are confirming it now.')
      await new Promise((r) => setTimeout(r, 3000))
    }
    setBusy(false)
    setNote(null)
    if (last?.ok) { onSettled(last); return }
    setError(kind === 'setup'
      ? 'Your card was accepted, but we could not finish saving it yet. Refresh this page in a minute.'
      : 'Your card was accepted, but we could not finish confirming it yet. Refresh this page in a minute; you will not be charged twice.')
    if (last) onSettled(last)
  }

  return (
    <form onSubmit={submit} className="bp-stack">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error ? <div className="bp-notice is-error" role="alert">{error}</div> : null}
      {note ? <div className="bp-notice is-ok" role="status">{note}</div> : null}
      {slow ? <div className="bp-notice" role="status">Still confirming with your bank. If a window asked you to verify, finish it there. If nothing happens, refresh this page and try again; you will not be charged twice.</div> : null}
      <button type="submit" className="bp-btn is-primary" style={{ width: '100%' }} disabled={!stripe || busy}>{busy ? 'Working…' : label}</button>
      <p className="bp-small bp-muted">Card details go straight to Stripe. We never see your full card number.</p>
    </form>
  )
}
