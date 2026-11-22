'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useState, useTransition } from 'react'
import {
  bookSessionAction, cancelAssessmentAction, cancelBookingAction, createSetupIntentAction, joinWaitlistAction, leaveWaitlistAction,
  previewCancellationAction, purchasePackageAction, rescheduleBookingAction, setDefaultPaymentMethodAction, type ActionState, type PaymentStart,
} from '../lib/actions'
import { completePaymentAction } from '../lib/actions'
import { StripeConfirm } from './StripeConfirm'
import { money, time, dateLong } from '../lib/format'

const initial: ActionState = { ok: false, error: null }
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random())

/** Cancel one booking: shows the server's preview (credit back, make-up, or late) before confirming. */
export function CancelBooking({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false)
  const [excused, setExcused] = useState(false)
  const [preview, setPreview] = useState<any>(null)
  const [loading, startLoading] = useTransition()
  const [state, action, pending] = useActionState(cancelBookingAction, initial)
  const [key] = useState(uuid)

  useEffect(() => {
    if (!open) return
    startLoading(async () => setPreview(await previewCancellationAction(bookingId, excused)))
  }, [open, excused, bookingId])

  if (state.ok) return <span className="bp-status" role="status">Cancelled. {state.data?.message ?? ''}</span>
  if (!open) return <button type="button" className="bp-btn is-small" onClick={() => setOpen(true)}>Cancel</button>
  return (
    <form action={action} className="bp-inline-panel">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      {loading ? <p className="bp-small bp-muted">Checking the cancellation policy…</p> : preview?.value ? <p className="bp-small">{preview.value.message}</p> : preview?.error ? <p className="bp-small bp-muted">{preview.error}</p> : null}
      {preview?.value?.excusedLeftThisMonth > 0 || excused ? (
        <label className="bp-check bp-small"><input type="checkbox" name="excused" checked={excused} onChange={(e) => setExcused(e.target.checked)} />Illness or emergency ({preview?.value?.excusedLeftThisMonth ?? 0} excused absence{preview?.value?.excusedLeftThisMonth === 1 ? '' : 's'} left this month)</label>
      ) : null}
      <input className="bp-input" name="reason" placeholder="Reason (optional)" />
      {state.error ? <div className="bp-notice is-error" role="alert">{state.error}</div> : null}
      <div className="bp-row">
        <button className="bp-btn is-small is-dark" type="submit" disabled={pending || loading}>{pending ? 'Cancelling…' : 'Confirm cancel'}</button>
        <button className="bp-btn is-small is-link" type="button" onClick={() => setOpen(false)}>Keep it</button>
      </div>
    </form>
  )
}

/** Move a booking to another session of the same programme. */
export function MoveBooking({ bookingId, options, timezone }: { bookingId: string; options: Array<{ id: string; startsAt: string; label: string; seatsLeft: number }>; timezone: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(rescheduleBookingAction, initial)
  const [key] = useState(uuid)
  if (state.ok) return <span className="bp-status" role="status">Moved.</span>
  if (!open) return options.length ? <button type="button" className="bp-btn is-small" onClick={() => setOpen(true)}>Move</button> : null
  return (
    <form action={action} className="bp-inline-panel">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      <select className="bp-select" name="newSessionId" required defaultValue="">
        <option value="" disabled>Choose a new time</option>
        {options.map((o) => <option key={o.id} value={o.id}>{dateLong(o.startsAt, timezone)}, {time(o.startsAt, timezone)} · {o.label} · {o.seatsLeft} left</option>)}
      </select>
      {state.error ? <div className="bp-notice is-error" role="alert">{state.error}</div> : null}
      <div className="bp-row">
        <button className="bp-btn is-small is-dark" type="submit" disabled={pending}>{pending ? 'Moving…' : 'Move booking'}</button>
        <button className="bp-btn is-small is-link" type="button" onClick={() => setOpen(false)}>Back</button>
      </div>
    </form>
  )
}

/** Book a seat (or join the waitlist when full) for one of the family's students. */
export function BookSeat({ sessionId, students, full, defaultStudent }: { sessionId: string; students: Array<{ id: string; firstName: string }>; full: boolean; defaultStudent?: string }) {
  const [state, action, pending] = useActionState(full ? joinWaitlistAction : bookSessionAction, initial)
  const [key] = useState(uuid)
  if (state.ok) return <span className="bp-status" role="status">{full ? `On the waitlist${state.data?.position ? ` (#${state.data.position})` : ''}.` : 'Booked.'} <Link className="bp-accent" href="/account/schedule">See schedule</Link></span>
  if (!students.length) return <Link className="bp-btn is-small" href="/enrol">Add a student</Link>
  return (
    <form action={action} className="bp-row">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      {students.length > 1 ? (
        <select className="bp-select is-small" name="studentId" defaultValue={defaultStudent ?? students[0].id} aria-label="Student">{students.map((s) => <option key={s.id} value={s.id}>{s.firstName}</option>)}</select>
      ) : <input type="hidden" name="studentId" value={students[0].id} />}
      <button className={`bp-btn is-small ${full ? '' : 'is-primary'}`} type="submit" disabled={pending}>{pending ? '…' : full ? 'Join waitlist' : students.length > 1 ? 'Book' : `Book for ${students[0].firstName}`}</button>
      {state.error ? <span className="bp-small bp-status is-warn" role="alert">{state.error}</span> : null}
    </form>
  )
}

export function LeaveWaitlist({ entryId }: { entryId: string }) {
  const [state, action, pending] = useActionState(leaveWaitlistAction, initial)
  if (state.ok) return <span className="bp-status">Removed.</span>
  return (
    <form action={action}>
      <input type="hidden" name="waitlistEntryId" value={entryId} />
      <button className="bp-btn is-small" type="submit" disabled={pending}>Leave waitlist</button>
      {state.error ? <span className="bp-small bp-status is-warn" role="alert"> {state.error}</span> : null}
    </form>
  )
}

export function CancelAssessment({ assessmentId, note }: { assessmentId: string; note: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(cancelAssessmentAction, initial)
  if (state.ok) return <span className="bp-status" role="status">Cancelled.{state.data?.refunded ? ' Your fee is being refunded.' : ''}</span>
  if (!open) return <button type="button" className="bp-btn is-small" onClick={() => setOpen(true)}>Cancel</button>
  return (
    <form action={action} className="bp-inline-panel">
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <p className="bp-small">{note}</p>
      {state.error ? <div className="bp-notice is-error" role="alert">{state.error}</div> : null}
      <div className="bp-row">
        <button className="bp-btn is-small is-dark" type="submit" disabled={pending}>{pending ? 'Cancelling…' : 'Confirm cancel'}</button>
        <button className="bp-btn is-small is-link" type="button" onClick={() => setOpen(false)}>Keep it</button>
      </div>
    </form>
  )
}

/** Buy a package of hours for a student: saved card off-session, or Stripe Elements. */
export function BuyPackage({ pkg, students, currency, savedCard }: { pkg: { id: string; name: string; price: number; hours: number }; students: Array<{ id: string; firstName: string }>; currency: string; savedCard: string | null }) {
  const router = useRouter()
  const [studentId, setStudentId] = useState(students[0]?.id ?? '')
  const [start, setStart] = useState<PaymentStart | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [key] = useState(uuid)

  async function go(useSaved: boolean) {
    setBusy(true)
    const r = await purchasePackageAction(pkg.id, studentId, useSaved, `${key}:${useSaved ? 'saved' : 'card'}`)
    setBusy(false)
    if (r.ok && (r.status === 'captured' || (r as any).invoiceStatus === 'paid')) { setDone(true); router.refresh(); return }
    if (r.ok && useSaved) { setStart({ ok: false, error: 'The saved card was not charged. Use the card form instead.' }); return }
    setStart(r)
  }

  if (done) return <div className="bp-notice is-ok" role="status"><b>Done.</b> {pkg.hours} hours were added.</div>
  if (start?.ok && start.clientSecret && start.publishableKey) {
    return <StripeConfirm clientSecret={start.clientSecret} publishableKey={start.publishableKey} label={`Pay ${money(pkg.price, currency)}`} settle={() => completePaymentAction(start.paymentSessionId!)} onSettled={(r) => { if (r.ok && (r.data?.status === 'captured' || r.data?.invoiceStatus === 'paid')) { setDone(true); router.refresh() } }} />
  }
  return (
    <div className="bp-stack">
      {students.length > 1 ? <select className="bp-select" value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="Student">{students.map((s) => <option key={s.id} value={s.id}>For {s.firstName}</option>)}</select> : null}
      {start && !start.ok ? <div className="bp-notice is-error" role="alert">{start.error}</div> : null}
      {savedCard ? <button className="bp-btn is-dark is-small" type="button" onClick={() => go(true)} disabled={busy || !studentId}>Buy with {savedCard}</button> : null}
      <button className={`bp-btn is-small ${savedCard ? '' : 'is-primary'}`} type="button" onClick={() => go(false)} disabled={busy || !studentId}>{busy ? 'Opening…' : savedCard ? 'Use another card' : `Buy for ${money(pkg.price, currency)}`}</button>
    </div>
  )
}

/** Save or replace the family's default card (SetupIntent → setDefaultPaymentMethod). */
export function SaveCard({ current }: { current: string | null }) {
  const router = useRouter()
  const [si, setSi] = useState<{ clientSecret: string; setupIntentId: string; publishableKey: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  async function open() {
    setBusy(true)
    const r = await createSetupIntentAction()
    setBusy(false)
    if (!r.ok || !r.clientSecret || !r.publishableKey) { setError(r.error || 'Card payments are not set up yet.'); return }
    setSi({ clientSecret: r.clientSecret, setupIntentId: r.setupIntentId!, publishableKey: r.publishableKey })
  }

  if (saved) return <div className="bp-notice is-ok" role="status">Saved: {saved}. We use it for monthly payments.</div>
  if (si) return <StripeConfirm kind="setup" clientSecret={si.clientSecret} publishableKey={si.publishableKey} label="Save card" settle={() => setDefaultPaymentMethodAction(si.setupIntentId)} onSettled={(r) => { if (r.ok) { setSaved(r.data?.label || 'your card'); router.refresh() } }} />
  return (
    <div className="bp-stack">
      <p>{current ? <>Card on file: <b>{current}</b></> : 'No card saved yet.'}</p>
      {error ? <div className="bp-notice is-error" role="alert">{error}</div> : null}
      <div><button className="bp-btn is-small" type="button" onClick={open} disabled={busy}>{busy ? 'Opening…' : current ? 'Replace card' : 'Add a card'}</button></div>
    </div>
  )
}
