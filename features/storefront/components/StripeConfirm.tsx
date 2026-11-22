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
  const returnUrl = useMemo(() => (typeof window === 'undefined' ? '' : window.location.href), [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setBusy(true)
    setError(null)
    setSlow(false)
    // Stripe may hold the confirm open (bank 3-D Secure, or its own verification check). Never sit silent.
    const timer = window.setTimeout(() => setSlow(true), 20000)
    let result: { error?: { message?: string } }
    try {
      result = kind === 'setup'
      ? await stripe.confirmSetup({ elements, redirect: 'if_required', confirmParams: { return_url: returnUrl } })
      : await stripe.confirmPayment({ elements, redirect: 'if_required', confirmParams: { return_url: returnUrl } })
    } catch (err) {
      result = { error: { message: 'The payment could not be started. Check your connection and try again.' } } as any
    } finally {
      window.clearTimeout(timer)
      setSlow(false)
    }
    if (result.error) {
      setError(result.error.message || 'The card could not be used.')
      setBusy(false)
      return
    }
    const settled = await settle()
    setBusy(false)
    if (!settled.ok) setError(settled.error || 'We could not confirm this yet. Refresh in a moment; you will not be charged twice.')
    onSettled(settled)
  }

  return (
    <form onSubmit={submit} className="bp-stack">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error ? <div className="bp-notice is-error" role="alert">{error} You have not been charged; you can try again.</div> : null}
      {slow ? <div className="bp-notice" role="status">Still confirming with your bank. If a window asked you to verify, finish it there. If nothing happens, refresh this page and try again; you will not be charged twice.</div> : null}
      <button type="submit" className="bp-btn is-primary" style={{ width: '100%' }} disabled={!stripe || busy}>{busy ? 'Working…' : label}</button>
      <p className="bp-small bp-muted">Card details go straight to Stripe. We never see your full card number.</p>
    </form>
  )
}
