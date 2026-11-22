'use client'

import Link from 'next/link'
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { bookAssessmentAction, loadAssessmentSlots, type ActionState } from '../lib/actions'
import { SlotPicker, type Slot } from './SlotPicker'
import { ArrowRight } from './icons'
import { MODE_LABEL, money, when } from '../lib/format'

type Program = { id: string; slug: string; name: string; summary: string; deliveryModes: string[]; locations: Array<{ id: string; name: string; slug: string; city: string }>; assessmentFee: number; assessmentMinutes: number; requiresAssessment: boolean }
type Props = {
  programs: Program[]
  levels: Array<{ id: string; name: string }>
  currency: string
  initial: { program: string; location: string }
  viewer: { name: string; email: string } | null
  students: Array<{ id: string; firstName: string; lastName: string }>
  idempotencyKey: string
}

const initialState: ActionState = { ok: false, error: null }

export function AssessmentForm({ programs, levels, currency, initial, viewer, students, idempotencyKey }: Props) {
  const firstProgram = programs.find((p) => p.slug === initial.program) ?? (programs.length === 1 ? programs[0] : undefined)
  const [programId, setProgramId] = useState(firstProgram?.id ?? '')
  const program = programs.find((p) => p.id === programId)
  const modes = program?.deliveryModes ?? []
  const initialLocation = program?.locations.find((l) => l.slug === initial.location)
  const [where, setWhere] = useState<string>(initialLocation ? `in_centre:${initialLocation.id}` : '')
  const [slots, setSlots] = useState<{ list: Slot[]; timezone: string; reason?: string } | null>(null)
  const [slotError, setSlotError] = useState<string | null>(null)
  const [slot, setSlot] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [loading, startLoading] = useTransition()
  const [studentChoice, setStudentChoice] = useState(students[0]?.id ?? 'new')
  const [state, action, pending] = useActionState(bookAssessmentAction, initialState)

  const whereOptions = useMemo(() => {
    if (!program) return [] as Array<{ value: string; label: string; note: string }>
    const out: Array<{ value: string; label: string; note: string }> = []
    if (modes.includes('in_centre')) program.locations.forEach((l) => out.push({ value: `in_centre:${l.id}`, label: l.name, note: `In centre${l.city ? `, ${l.city}` : ''}` }))
    if (modes.includes('online')) out.push({ value: 'online:', label: 'Online', note: 'By video call from home' })
    if (modes.includes('in_home')) out.push({ value: 'in_home:', label: 'At your home', note: 'A tutor visits you' })
    return out
  }, [program, modes])

  // One choice: pick it for the visitor.
  useEffect(() => {
    if (whereOptions.length === 1 && where !== whereOptions[0].value) setWhere(whereOptions[0].value)
    if (where && !whereOptions.some((o) => o.value === where)) setWhere('')
  }, [whereOptions, where])

  const [mode, locationId] = where ? (where.split(':') as [string, string]) : ['', '']

  useEffect(() => {
    setSlot('')
    setSlots(null)
    setSlotError(null)
    if (!programId || !mode) return
    const from = new Date(Date.now() + weekOffset * 7 * 86_400_000).toISOString()
    startLoading(async () => {
      const r = await loadAssessmentSlots(programId, mode, locationId || null, from)
      if (!r.value) { setSlotError(r.error || 'Times could not load.'); return }
      setSlots({ list: r.value.slots ?? [], timezone: r.value.timezone, reason: r.value.reason })
    })
  }, [programId, mode, locationId, weekOffset])

  const [startsAt, tutorId] = slot ? slot.split('|') : ['', '']
  const chosen = slots?.list.find((s) => s.startsAt === startsAt && s.tutorId === tutorId)
  const fee = program?.assessmentFee ?? 0
  const signInHref = `/account/sign-in?next=${encodeURIComponent(`/assessment${program ? `?program=${program.slug}` : ''}`)}`
  const step = !program ? 1 : !mode ? 2 : !slot ? 3 : 4

  return (
    <form action={action} className="bp-grid-2">
      <div className="bp-panel">
        <ol className="bp-steps" aria-label="Steps">
          {['Program', 'Where', 'Time', 'Details'].map((label, i) => <li key={label} className={i + 1 < step ? 'is-done' : i + 1 === step ? 'is-current' : ''}>{i + 1}. {label}</li>)}
        </ol>
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
        <input type="hidden" name="programId" value={programId} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="locationId" value={locationId} />
        <input type="hidden" name="startsAt" value={startsAt} />
        <input type="hidden" name="tutorId" value={tutorId} />

        <section className="bp-stepblock">
          <h2><i>1</i>Choose a program</h2>
          {programs.length ? (
            <div className="bp-choices">
              {programs.map((p) => (
                <label className="bp-choice" key={p.id}>
                  <input type="radio" name="program" value={p.id} checked={programId === p.id} onChange={() => { setProgramId(p.id); setWhere(''); setWeekOffset(0) }} />
                  <span><b>{p.name}</b><small>{p.assessmentMinutes} minutes · {p.assessmentFee ? money(p.assessmentFee, currency) : 'Free'}</small></span>
                </label>
              ))}
            </div>
          ) : <div className="bp-empty"><b>No program takes assessment bookings online yet</b><Link className="bp-accent" href="/contact">Send us a message</Link> and we will arrange one.</div>}
        </section>

        {program ? (
          <section className="bp-stepblock">
            <h2><i>2</i>Where should it happen?</h2>
            {whereOptions.length ? (
              <div className="bp-choices">
                {whereOptions.map((o) => (
                  <label className="bp-choice" key={o.value}>
                    <input type="radio" name="where" value={o.value} checked={where === o.value} onChange={() => { setWhere(o.value); setWeekOffset(0) }} />
                    <span><b>{o.label}</b><small>{o.note}</small></span>
                  </label>
                ))}
              </div>
            ) : <p className="bp-muted">This program has no centre or online option set up yet. <Link className="bp-accent" href="/contact">Contact us</Link>.</p>}
          </section>
        ) : null}

        {program && mode ? (
          <section className="bp-stepblock">
            <h2><i>3</i>Pick a time</h2>
            {loading ? <p className="bp-muted" role="status">Finding open times…</p> : slotError ? <div className="bp-notice is-error" role="alert">{slotError}</div> : slots ? (
              slots.list.length ? <SlotPicker slots={slots.list} timezone={slots.timezone} value={slot} onChange={setSlot} /> : (
                <div className="bp-empty"><b>No open times {weekOffset ? 'that week' : 'in the next two weeks'}</b>{slots.reason || 'Try another week or place, or '}{' '}<Link className="bp-accent" href={`/contact?program=${program.id}`}>ask us for a time</Link>.</div>
              )
            ) : null}
            {slots ? (
              <div className="bp-row" style={{ marginTop: 14 }}>
                {weekOffset > 0 ? <button type="button" className="bp-btn is-small" onClick={() => setWeekOffset((w) => w - 1)}>Earlier</button> : null}
                <button type="button" className="bp-btn is-small" onClick={() => setWeekOffset((w) => w + 1)}>Later times</button>
              </div>
            ) : null}
          </section>
        ) : null}

        {chosen ? (
          <section className="bp-stepblock">
            <h2><i>4</i>About your child{viewer ? '' : ' and you'}</h2>
            {students.length ? (
              <fieldset className="bp-fieldset" style={{ marginBottom: 14 }}>
                <legend className="bp-legend">Who is this for?</legend>
                <div className="bp-choices">
                  {students.map((s) => (
                    <label className="bp-choice" key={s.id}><input type="radio" name="studentPick" checked={studentChoice === s.id} onChange={() => setStudentChoice(s.id)} /><span><b>{s.firstName} {s.lastName}</b></span></label>
                  ))}
                  <label className="bp-choice"><input type="radio" name="studentPick" checked={studentChoice === 'new'} onChange={() => setStudentChoice('new')} /><span><b>Another child</b></span></label>
                </div>
              </fieldset>
            ) : null}
            {studentChoice !== 'new' ? <input type="hidden" name="studentId" value={studentChoice} /> : (
              <div className="bp-form-2">
                <label className="bp-field"><span>Child’s first name</span><input className="bp-input" name="firstName" required autoComplete="off" /></label>
                <label className="bp-field"><span>Last name</span><input className="bp-input" name="lastName" autoComplete="off" /></label>
                <label className="bp-field"><span>Grade</span>
                  <select className="bp-select" name="levelId" defaultValue=""><option value="">Choose</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                </label>
                <label className="bp-field"><span>School <small>(optional)</small></span><input className="bp-input" name="school" /></label>
              </div>
            )}
            {viewer ? (
              <p className="bp-small bp-muted" style={{ marginTop: 14 }}>Booking as {viewer.name} ({viewer.email}).</p>
            ) : (
              <>
                <h3 style={{ fontSize: 17, margin: '20px 0 10px' }}>Your details</h3>
                <div className="bp-form-2">
                  <label className="bp-field"><span>Your name</span><input className="bp-input" name="guardianName" required autoComplete="name" /></label>
                  <label className="bp-field"><span>Email</span><input className="bp-input" type="email" name="guardianEmail" required autoComplete="email" /></label>
                  <label className="bp-field"><span>Phone</span><input className="bp-input" type="tel" name="guardianPhone" autoComplete="tel" /></label>
                </div>
                <p className="bp-small bp-muted" style={{ marginTop: 10 }}>We create your family account with this booking and email you a link to set your password. Already have an account? <Link className="bp-accent" href={signInHref}>Sign in first</Link>.</p>
              </>
            )}
            <label className="bp-field" style={{ marginTop: 14 }}><span>Anything we should know? <small>(optional)</small></span><textarea className="bp-textarea" name="notes" placeholder="Goals, test dates, learning needs" /></label>
          </section>
        ) : null}
      </div>

      <aside className="bp-sticky">
        <div className="bp-panel">
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>Your assessment</h2>
          {program ? (
            <dl className="bp-dl">
              <dt>Program</dt><dd>{program.name}</dd>
              <dt>Length</dt><dd>{program.assessmentMinutes} minutes</dd>
              {mode ? (<><dt>Where</dt><dd>{whereOptions.find((o) => o.value === where)?.label ?? MODE_LABEL[mode]}</dd></>) : null}
              {chosen && slots ? (<><dt>When</dt><dd>{when(chosen.startsAt, chosen.endsAt, slots.timezone)}</dd><dt>With</dt><dd>{chosen.tutorName}</dd></>) : null}
              <dt>Fee</dt><dd>{fee ? money(fee, currency) : 'Free'}</dd>
            </dl>
          ) : <p className="bp-muted">Choose a program to see times.</p>}
          {state.error ? (
            <div className="bp-notice is-error" role="alert" style={{ marginTop: 14 }}>
              {state.error}
              {/already has an account/i.test(state.error) ? <div style={{ marginTop: 8 }}><Link className="bp-btn is-small is-dark" href={signInHref}>Sign in</Link> <Link className="bp-btn is-link" href="/account/reset">Forgot password</Link></div> : null}
            </div>
          ) : null}
          <button className="bp-btn is-primary" type="submit" style={{ width: '100%', marginTop: 18 }} disabled={!chosen || pending}>
            {pending ? 'Booking…' : fee ? 'Book and continue to payment' : 'Book the assessment'}{pending ? null : <ArrowRight />}
          </button>
          {fee ? <p className="bp-small bp-muted" style={{ marginTop: 10 }}>You pay the {money(fee, currency)} fee by card on the next screen.</p> : null}
          <p className="bp-small bp-muted" style={{ marginTop: 8 }}><Link href="/policies">Cancellation and refund policy</Link></p>
        </div>
      </aside>
    </form>
  )
}
