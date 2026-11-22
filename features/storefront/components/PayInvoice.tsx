'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { completePaymentAction, paySavedCardAction, startInvoicePaymentAction, type PaymentStart } from '../lib/actions'
import { money } from '../lib/format'
import { StripeConfirm } from './StripeConfirm'

/**
 * Pay one open invoice: the server opens the PaymentIntent (payInvoice), Stripe Elements collects
 * the card, then refreshPayment reads the PaymentIntent server-side and settles it.
 */
export function PayInvoice({ invoiceId, amount, currency, savedCard, label }: { invoiceId: string; amount: number; currency: string; idempotencyKey?: string; savedCard?: string | null; label?: string }) {
  const router = useRouter()
  const [start, setStart] = useState<PaymentStart | null>(null)
  const [saveCard, setSaveCard] = useState(true)
  const [opening, setOpening] = useState(false)
  const [paid, setPaid] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function open() {
    setOpening(true)
    const r = await startInvoicePaymentAction(invoiceId, saveCard)
    setOpening(false)
    if (r.ok && (r.status === 'captured' || (r as any).invoiceStatus === 'paid')) { setPaid(true); router.refresh(); return }
    setStart(r)
  }
  async function useSaved() {
    setOpening(true)
    const r = await paySavedCardAction(invoiceId)
    setOpening(false)
    if (r.ok && (r.status === 'captured' || (r as any).invoiceStatus === 'paid')) { setPaid(true); router.refresh(); return }
    setStart(r.ok ? { ...r, ok: false, error: r.status === 'requires_action' ? 'Your bank needs you to confirm this payment. Pay with the card form below instead.' : 'The saved card was not charged. Try another card.' } : r)
  }

  if (paid) return <div className="bp-notice is-ok" role="status"><b>Paid.</b> {money(amount, currency)} was charged. A receipt is on its way by email.</div>
  if (start?.ok && start.clientSecret && start.publishableKey) {
    return (
      <>
        {note ? <div className="bp-notice" role="status">{note}</div> : null}
        <StripeConfirm clientSecret={start.clientSecret} publishableKey={start.publishableKey} label={label || `Pay ${money(start.amount ?? amount, start.currency ?? currency)}`}
          settle={() => completePaymentAction(start.paymentSessionId!)}
          onSettled={(r) => {
            if (r.ok && (r.data?.status === 'captured' || r.data?.invoiceStatus === 'paid')) { setPaid(true); router.refresh() }
            else if (r.ok) setNote('Your bank is still processing this payment. We will email you when it clears.')
          }} />
      </>
    )
  }
  return (
    <div className="bp-stack">
      {start && !start.ok ? <div className="bp-notice is-error" role="alert">{start.error}</div> : null}
      {start?.ok && !start.publishableKey ? <div className="bp-notice is-error" role="alert">Card payments are not fully set up yet. Please call us to pay.</div> : null}
      {savedCard ? <button type="button" className="bp-btn is-dark" style={{ width: '100%' }} onClick={useSaved} disabled={opening}>Pay {money(amount, currency)} with {savedCard}</button> : null}
      <label className="bp-check"><input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />Save this card for monthly payments</label>
      <button type="button" className={`bp-btn ${savedCard ? '' : 'is-primary'}`} style={{ width: '100%' }} onClick={open} disabled={opening}>{opening ? 'Opening secure payment…' : savedCard ? 'Use a different card' : label || `Pay ${money(amount, currency)} by card`}</button>
    </div>
  )
}
