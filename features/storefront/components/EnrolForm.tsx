'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { completeEnrolmentCheckoutAction, startEnrolmentCheckoutAction, type CheckoutStart } from '../lib/actions'
import { StripeConfirm } from './StripeConfirm'
import { ArrowRight } from './icons'
import { money } from '../lib/format'

type Plan = { id: string; name: string; price: number; enrolmentFee: number; sessionsPerPeriod: number | null; weeklyCapForUnlimited: number | null; minimumTermMonths: number; description: string; features: string[]; highlight: boolean }
type Pack = { id: string; name: string; hours: number; price: number; pricePerHour: number; expiryMonths: number | null; description: string }
type Series = { id: string; weekday: number; startMinute: number; minutes: number; mode: string; location: { id: string; name: string } | null; subject: string | null; tutor: string | null; seatsLeft: number; capacity: number }
type Props = {
  program: { id: string; name: string; slug: string; format: string; deliveryModes: string[]; locations: Array<{ id: string; name: string; slug: string; city: string }>; plans: Plan[]; packages: Pack[]; sessionMinutes: number }
  series: Series[]
  levels: Array<{ id: string; name: string }>
  currency: string
  siblingDiscountPercent: number
  viewer: { name: string; email: string } | null
  students: Array<{ id: string; firstName: string; lastName: string }>
  initial: { option: string; location: string; student: string; learningPlanId: string }
  idempotencyKey: string
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const clock = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }

export function EnrolForm({ program, series, levels, currency, siblingDiscountPercent, viewer, students, initial, idempotencyKey }: Props) {
  const router = useRouter()
  const options = useMemo(() => [
    ...program.plans.map((p) => ({ key: `plan:${p.id}`, title: p.name, price: p.price, unit: '/month', note: p.sessionsPerPeriod ? `${p.sessionsPerPeriod} sessions a month` : `Unlimited, up to ${p.weeklyCapForUnlimited ?? 5} a week`, extra: p.enrolmentFee ? `+ ${money(p.enrolmentFee, currency)} one-time enrolment fee` : '', fee: p.enrolmentFee, highlight: p.highlight })),
    ...program.packages.map((p) => ({ key: `package:${p.id}`, title: p.name, price: p.price, unit: '', note: `${p.hours} hours${p.pricePerHour ? ` · ${money(p.pricePerHour, currency)}/hour` : ''}`, extra: p.expiryMonths ? `Use within ${p.expiryMonths} months` : '', fee: 0, highlight: false })),
  ], [program, currency])
  const [option, setOption] = useState(options.find((o) => o.key === initial.option)?.key ?? options.find((o) => o.highlight)?.key ?? options[0]?.key ?? '')
  const chosen = options.find((o) => o.key === option)
  const [kind, chosenId] = option ? option.split(':') : ['', '']

  const whereOptions = useMemo(() => {
    const out: Array<{ value: string; label: string; note: string }> = []
    if (program.deliveryModes.includes('in_centre')) program.locations.forEach((l) => out.push({ value: `in_centre:${l.id}`, label: l.name, note: `In centre${l.city ? `, ${l.city}` : ''}` }))
    if (program.deliveryModes.includes('online')) out.push({ value: 'online:', label: 'Online', note: 'Live video sessions' })
    if (program.deliveryModes.includes('in_home')) out.push({ value: 'in_home:', label: 'At your home', note: 'A tutor visits you' })
    return out
  }, [program])
  const initialWhere = whereOptions.find((o) => o.value.endsWith(`:${program.locations.find((l) => l.slug === initial.location)?.id ?? '§'}`))?.value ?? (whereOptions.length === 1 ? whereOptions[0].value : '')
  const [where, setWhere] = useState(initialWhere)
  const [mode, locationId] = where ? where.split(':') : ['', '']

  const groupFormat = program.format !== 'one_to_one'
  const seriesHere = series.filter((s) => s.mode === mode && (mode !== 'in_centre' || s.location?.id === locationId))
  const maxPicks = chosen && kind === 'plan' ? Math.max(1, Math.min(3, Math.round((program.plans.find((p) => p.id === chosenId)?.sessionsPerPeriod ?? 12) / 4))) : 2
  const [picked, setPicked] = useState<string[]>([])
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= maxPicks ? [...p.slice(1), id] : [...p, id]))

  const [studentChoice, setStudentChoice] = useState(students.find((s) => s.id === initial.student)?.id ?? students[0]?.id ?? 'new')
  const [form, setForm] = useState({ firstName: '', lastName: '', levelId: '', school: '', name: '', email: '', phone: '', homeAddress: '', preferredTimes: '', promoCode: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const [accept, setAccept] = useState(false)
  const [saveCard, setSaveCard] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkout, setCheckout] = useState<CheckoutStart | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const signInHref = `/account/sign-in?next=${encodeURIComponent(`/enrol/${program.slug}`)}`
  const ready = Boolean(chosen && mode && accept && (studentChoice !== 'new' || form.firstName) && (viewer || (form.name && form.email)) && (mode !== 'in_home' || form.homeAddress))

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || !chosen) return
    setBusy(true)
    setError(null)
    const r = await startEnrolmentCheckoutAction({
      programId: program.id, planId: kind === 'plan' ? chosenId : null, packageId: kind === 'package' ? chosenId : null,
      mode, locationId: locationId || null, seriesIds: picked,
      studentId: studentChoice !== 'new' ? studentChoice : null,
      student: studentChoice === 'new' ? { firstName: form.firstName, lastName: form.lastName || undefined, levelId: form.levelId || null, school: form.school || undefined } : null,
      guardian: viewer ? null : { name: form.name, email: form.email, phone: form.phone || undefined },
      promoCode: form.promoCode || null, learningPlanId: initial.learningPlanId || null,
      homeAddress: form.homeAddress, preferredTimes: form.preferredTimes, acceptPolicies: accept, saveCard, idempotencyKey,
    })
    setBusy(false)
    if (!r.ok) { setError(r.error); if (r.enrollmentId) router.refresh(); return }
    if (r.status === 'captured' || r.invoiceStatus === 'paid') { router.push(`/enrol/confirmed/${r.enrollmentId}`); return }
    if (!r.clientSecret || !r.publishableKey) { setError('Card payments are not fully set up yet. Your place is held; please call us to pay.'); return }
    setCheckout(r)
    if (r.newAccount) router.refresh()
  }

  const total = checkout?.total
  return (
    <div className="bp-grid-2">
      <div className="bp-panel">
        {checkout ? (
          <section>
            <h2 style={{ fontSize: 24, marginBottom: 6 }}>Pay {money(total ?? 0, checkout.currency || currency)}</h2>
            <p className="bp-muted" style={{ marginBottom: 18 }}>Your place is held while you pay.{checkout.newAccount ? ' We have created your family account and emailed you a link to set a password.' : ''}</p>
            {note ? <div className="bp-notice" role="status" style={{ marginBottom: 12 }}>{note}</div> : null}
            <StripeConfirm clientSecret={checkout.clientSecret!} publishableKey={checkout.publishableKey!} label={`Pay ${money(total ?? 0, checkout.currency || currency)} and enrol`}
              settle={() => completeEnrolmentCheckoutAction(checkout.paymentSessionId!)}
              onSettled={(r) => {
                if (r.ok) router.push(`/enrol/confirmed/${checkout.enrollmentId}`)
                else if (r.data?.status && !['failed', 'cancelled'].includes(r.data.status)) setNote('Your bank is still processing this payment. We will email you when it clears; you can close this page.')
              }} />
          </section>
        ) : (
          <form onSubmit={start}>
            <section className="bp-stepblock">
              <h2><i>1</i>Choose a plan</h2>
              {options.length ? (
                <div className="bp-choices is-stack">
                  {options.map((o) => (
                    <label className="bp-choice" key={o.key}>
                      <input type="radio" name="option" checked={option === o.key} onChange={() => setOption(o.key)} />
                      <span><b>{o.title} · {money(o.price, currency)}{o.unit}</b><small>{o.note}{o.extra ? ` · ${o.extra}` : ''}</small></span>
                    </label>
                  ))}
                </div>
              ) : <div className="bp-empty"><b>Plans for this program are not published yet</b><Link className="bp-accent" href={`/contact?program=${program.id}`}>Ask us</Link> and we will set you up.</div>}
              {siblingDiscountPercent && kind === 'plan' ? <p className="bp-small bp-muted" style={{ marginTop: 10 }}>Second and later children get {siblingDiscountPercent}% off monthly plans; it is applied automatically.</p> : null}
            </section>

            <section className="bp-stepblock">
              <h2><i>2</i>Where</h2>
              <div className="bp-choices">
                {whereOptions.map((o) => (
                  <label className="bp-choice" key={o.value}><input type="radio" name="where" checked={where === o.value} onChange={() => { setWhere(o.value); setPicked([]) }} /><span><b>{o.label}</b><small>{o.note}</small></span></label>
                ))}
              </div>
              {mode === 'in_home' ? <label className="bp-field" style={{ marginTop: 14 }}><span>Home address</span><input className="bp-input" value={form.homeAddress} onChange={set('homeAddress')} required autoComplete="street-address" /></label> : null}
            </section>

            {mode ? (
              <section className="bp-stepblock">
                <h2><i>3</i>{groupFormat && seriesHere.length ? 'Weekly times' : 'Preferred times'}</h2>
                {groupFormat && seriesHere.length ? (
                  <>
                    <p className="bp-small bp-muted" style={{ marginBottom: 10 }}>Pick up to {maxPicks}. We book these seats every week; you can also book extra sessions from your account.</p>
                    <div className="bp-choices is-stack">
                      {seriesHere.map((s) => (
                        <label className={`bp-choice${s.seatsLeft ? '' : ' is-disabled'}`} key={s.id}>
                          <input type="checkbox" checked={picked.includes(s.id)} disabled={!s.seatsLeft} onChange={() => togglePick(s.id)} />
                          <span><b>{DAYS[s.weekday]}s, {clock(s.startMinute)} to {clock(s.startMinute + s.minutes)}</b><small>{[s.subject, s.tutor ? `with ${s.tutor}` : null, s.seatsLeft ? `${s.seatsLeft} of ${s.capacity} seats left` : 'Full'].filter(Boolean).join(' · ')}</small></span>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <label className="bp-field"><span>When suits you?</span><input className="bp-input" value={form.preferredTimes} onChange={set('preferredTimes')} placeholder="For example: Tuesdays and Thursdays after 4 PM" /><small className="bp-muted">We match a tutor to these times and confirm by email.</small></label>
                )}
              </section>
            ) : null}

            <section className="bp-stepblock">
              <h2><i>4</i>Student{viewer ? '' : ' and you'}</h2>
              {students.length ? (
                <div className="bp-choices" style={{ marginBottom: 14 }}>
                  {students.map((s) => <label className="bp-choice" key={s.id}><input type="radio" name="student" checked={studentChoice === s.id} onChange={() => setStudentChoice(s.id)} /><span><b>{s.firstName} {s.lastName}</b></span></label>)}
                  <label className="bp-choice"><input type="radio" name="student" checked={studentChoice === 'new'} onChange={() => setStudentChoice('new')} /><span><b>Another child</b></span></label>
                </div>
              ) : null}
              {studentChoice === 'new' ? (
                <div className="bp-form-2">
                  <label className="bp-field"><span>Child’s first name</span><input className="bp-input" value={form.firstName} onChange={set('firstName')} required /></label>
                  <label className="bp-field"><span>Last name</span><input className="bp-input" value={form.lastName} onChange={set('lastName')} /></label>
                  <label className="bp-field"><span>Grade</span><select className="bp-select" value={form.levelId} onChange={set('levelId')}><option value="">Choose</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                  <label className="bp-field"><span>School <small>(optional)</small></span><input className="bp-input" value={form.school} onChange={set('school')} /></label>
                </div>
              ) : null}
              {viewer ? <p className="bp-small bp-muted" style={{ marginTop: 12 }}>Enrolling as {viewer.name} ({viewer.email}).</p> : (
                <>
                  <h3 style={{ fontSize: 17, margin: '20px 0 10px' }}>Your details</h3>
                  <div className="bp-form-2">
                    <label className="bp-field"><span>Your name</span><input className="bp-input" value={form.name} onChange={set('name')} required autoComplete="name" /></label>
                    <label className="bp-field"><span>Email</span><input className="bp-input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></label>
                    <label className="bp-field"><span>Phone</span><input className="bp-input" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" /></label>
                  </div>
                  <p className="bp-small bp-muted" style={{ marginTop: 10 }}>We create your family account with this enrolment. Already have one? <Link className="bp-accent" href={signInHref}>Sign in first</Link>.</p>
                </>
              )}
            </section>

            <section className="bp-stepblock">
              <label className="bp-field" style={{ maxWidth: 280 }}><span>Promo code <small>(optional)</small></span><input className="bp-input" value={form.promoCode} onChange={set('promoCode')} autoCapitalize="characters" /></label>
              <label className="bp-check" style={{ marginTop: 16 }}><input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} />{kind === 'plan' ? 'Save my card for the monthly payment' : 'Save my card for next time'}</label>
              <label className="bp-check" style={{ marginTop: 10 }}><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} required />I accept the <Link className="bp-accent" href="/policies" target="_blank">cancellation, make-up and billing policies</Link>.</label>
            </section>

            {error ? (
              <div className="bp-notice is-error" role="alert" style={{ marginBottom: 14 }}>
                {error}
                {/already has an account|sign in/i.test(error) ? <div style={{ marginTop: 8 }}><Link className="bp-btn is-small is-dark" href={signInHref}>Sign in</Link> <Link className="bp-btn is-link" href="/account/reset">Forgot password</Link></div> : null}
              </div>
            ) : null}
            <button className="bp-btn is-primary" type="submit" disabled={!ready || busy}>{busy ? 'Holding your place…' : 'Continue to payment'}{busy ? null : <ArrowRight />}</button>
          </form>
        )}
      </div>

      <aside className="bp-sticky">
        <div className="bp-panel">
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>{program.name}</h2>
          {chosen ? (
            <dl className="bp-dl">
              <dt>Plan</dt><dd>{chosen.title}</dd>
              <dt>Price</dt><dd>{money(chosen.price, currency)}{chosen.unit}</dd>
              {chosen.fee ? (<><dt>Enrolment fee</dt><dd>{money(chosen.fee, currency)}</dd></>) : null}
              {where ? (<><dt>Where</dt><dd>{whereOptions.find((o) => o.value === where)?.label}</dd></>) : null}
              {picked.length ? (<><dt>Weekly</dt><dd>{picked.map((id) => { const s = series.find((x) => x.id === id)!; return <div key={id}>{DAYS[s.weekday].slice(0, 3)} {clock(s.startMinute)}</div> })}</dd></>) : null}
              {checkout ? (
                <>
                  <dt>Subtotal</dt><dd>{money(checkout.subtotal ?? 0, checkout.currency || currency)}</dd>
                  {checkout.discount ? (<><dt>Discount</dt><dd>−{money(checkout.discount, checkout.currency || currency)}</dd></>) : null}
                  {checkout.tax ? (<><dt>Tax</dt><dd>{money(checkout.tax, checkout.currency || currency)}</dd></>) : null}
                  <dt>Due today</dt><dd className="bp-strong">{money(checkout.total ?? 0, checkout.currency || currency)}</dd>
                </>
              ) : <><dt>Due today</dt><dd>{money(chosen.price + chosen.fee, currency)}<small className="bp-muted" style={{ display: 'block', fontWeight: 400 }}>before any discount or tax</small></dd></>}
            </dl>
          ) : <p className="bp-muted">Choose a plan.</p>}
          {kind === 'plan' ? <p className="bp-small bp-muted" style={{ marginTop: 12 }}>Billed monthly from today. Cancel with notice from your account.</p> : null}
        </div>
      </aside>
    </div>
  )
}
