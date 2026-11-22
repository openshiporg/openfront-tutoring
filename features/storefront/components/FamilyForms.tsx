'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addStudentAction, confirmTutorAction, requestRematchAction, updateFamilyProfileAction, updateStudentAction, type ActionState,
} from '../lib/actions'

const initial: ActionState = { ok: false, error: null }
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + Math.random())

type Family = {
  name: string; billingEmail: string | null; phone: string | null
  addressLine1: string | null; addressLine2: string | null; city: string | null; region: string | null; postalCode: string | null
  secondGuardianName: string | null; secondGuardianEmail: string | null; secondGuardianPhone: string | null
}
type Pickup = { name: string; relation?: string; phone?: string }
type Student = {
  id: string; firstName: string; lastName: string; school: string | null; dateOfBirth: string | null
  level: { id: string; name: string } | null; learningNotes: string | null; medicalNotes: string | null; pickupPeople: Pickup[]
}
type Level = { id: string; name: string }

function Text({ name, label, value, type = 'text', required, auto }: { name: string; label: string; value?: string | null; type?: string; required?: boolean; auto?: string }) {
  return (
    <label className="bp-field">
      <span>{label}</span>
      <input className="bp-input" name={name} type={type} defaultValue={value ?? ''} required={required} autoComplete={auto} />
    </label>
  )
}

/** A2: the account holder edits their own and the family's contact details. */
export function FamilyProfileForm({ family, guardian }: { family: Family; guardian: { name: string; phone: string | null; email: string } }) {
  const [state, action, pending] = useActionState(updateFamilyProfileAction, initial)
  const [key, setKey] = useState(uuid)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  useEffect(() => { if (state.ok) { setOpen(false); setKey(uuid()); router.refresh() } }, [state, router])
  if (!open) {
    return (
      <div className="bp-row">
        <button type="button" className="bp-btn is-small" onClick={() => setOpen(true)}>Edit details</button>
        {state.ok ? <span className="bp-status" role="status">Saved.</span> : null}
      </div>
    )
  }
  return (
    <form action={action} className="bp-inline-panel bp-form">
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="bp-row">
        <Text name="guardianName" label="Your name" value={guardian.name} required auto="name" />
        <Text name="guardianPhone" label="Your phone" value={guardian.phone} type="tel" auto="tel" />
      </div>
      <div className="bp-row">
        <Text name="billingEmail" label="Billing email" value={family.billingEmail || guardian.email} type="email" required auto="email" />
        <Text name="phone" label="Family phone" value={family.phone} type="tel" />
      </div>
      <Text name="addressLine1" label="Address" value={family.addressLine1} auto="address-line1" />
      <Text name="addressLine2" label="Address line 2" value={family.addressLine2} auto="address-line2" />
      <div className="bp-row">
        <Text name="city" label="City" value={family.city} auto="address-level2" />
        <Text name="region" label="State" value={family.region} auto="address-level1" />
        <Text name="postalCode" label="ZIP" value={family.postalCode} auto="postal-code" />
      </div>
      <p className="bp-small bp-muted">Second guardian (optional): gets the same updates by email.</p>
      <div className="bp-row">
        <Text name="secondGuardianName" label="Name" value={family.secondGuardianName} />
        <Text name="secondGuardianEmail" label="Email" value={family.secondGuardianEmail} type="email" />
        <Text name="secondGuardianPhone" label="Phone" value={family.secondGuardianPhone} type="tel" />
      </div>
      {state.error ? <div className="bp-notice is-error" role="alert">{state.error}</div> : null}
      <div className="bp-row">
        <button className="bp-btn is-small is-dark" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save details'}</button>
        <button className="bp-btn is-small is-link" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

function PickupRows({ initial: start }: { initial: Pickup[] }) {
  const [rows, setRows] = useState<Pickup[]>(start.length ? start : [])
  return (
    <fieldset className="bp-fieldset">
      <legend className="bp-small">Who may collect them</legend>
      {rows.map((p, i) => (
        <div className="bp-row" key={i}>
          <label className="bp-field"><span>Name</span><input className="bp-input" name="pickupName" defaultValue={p.name} /></label>
          <label className="bp-field"><span>Relation</span><input className="bp-input" name="pickupRelation" defaultValue={p.relation ?? ''} /></label>
          <label className="bp-field"><span>Phone</span><input className="bp-input" name="pickupPhone" type="tel" defaultValue={p.phone ?? ''} /></label>
          <button type="button" className="bp-btn is-small is-link" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {/* An empty marker so clearing every row still sends "no pickup people". */}
      {!rows.length ? <input type="hidden" name="pickupName" value="" /> : null}
      {rows.length < 10 ? <button type="button" className="bp-btn is-small" onClick={() => setRows([...rows, { name: '' }])}>Add a person</button> : null}
    </fieldset>
  )
}

function StudentFields({ s, levels }: { s?: Student; levels: Level[] }) {
  return (
    <>
      <div className="bp-row">
        <Text name="firstName" label="First name" value={s?.firstName} required />
        <Text name="lastName" label="Last name" value={s?.lastName} />
      </div>
      <div className="bp-row">
        <Text name="dateOfBirth" label="Date of birth" type="date" value={s?.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : ''} />
        <label className="bp-field">
          <span>Grade or level</span>
          <select className="bp-input" name="levelId" defaultValue={s?.level?.id ?? ''}>
            <option value="">Not set</option>
            {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <Text name="school" label="School" value={s?.school} />
      </div>
      <label className="bp-field"><span>How they learn best (shared with their tutor)</span><textarea className="bp-input" name="learningNotes" rows={3} defaultValue={s?.learningNotes ?? ''} /></label>
      <label className="bp-field"><span>Medical notes and allergies (staff and their tutor only)</span><textarea className="bp-input" name="medicalNotes" rows={2} defaultValue={s?.medicalNotes ?? ''} /></label>
      <PickupRows initial={s?.pickupPeople ?? []} />
    </>
  )
}

/** A2: edit one child's details. */
export function EditStudent({ student, levels }: { student: Student; levels: Level[] }) {
  const [state, action, pending] = useActionState(updateStudentAction, initial)
  const [key, setKey] = useState(uuid)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  useEffect(() => { if (state.ok) { setOpen(false); setKey(uuid()); router.refresh() } }, [state, router])
  if (!open) {
    return (
      <div className="bp-row">
        <button type="button" className="bp-btn is-small" onClick={() => setOpen(true)}>Edit {student.firstName}</button>
        {state.ok ? <span className="bp-status" role="status">Saved.</span> : null}
      </div>
    )
  }
  return (
    <form action={action} className="bp-inline-panel bp-form">
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="studentId" value={student.id} />
      <StudentFields s={student} levels={levels} />
      {state.error ? <div className="bp-notice is-error" role="alert">{state.error}</div> : null}
      <div className="bp-row">
        <button className="bp-btn is-small is-dark" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
        <button className="bp-btn is-small is-link" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

/** A2: add another child to the family. */
export function AddStudent({ levels }: { levels: Level[] }) {
  const [state, action, pending] = useActionState(addStudentAction, initial)
  const [key, setKey] = useState(uuid)
  const [open, setOpen] = useState(false)
  const router = useRouter()
  useEffect(() => { if (state.ok) { setOpen(false); setKey(uuid()); router.refresh() } }, [state, router])
  if (!open) {
    return (
      <div className="bp-row">
        <button type="button" className="bp-btn is-small is-dark" onClick={() => setOpen(true)}>Add a child</button>
        {state.ok ? <span className="bp-status" role="status">Added. Enrol them from <a className="bp-accent" href="/programs">programmes</a>.</span> : null}
      </div>
    )
  }
  return (
    <form action={action} className="bp-inline-panel bp-form">
      <input type="hidden" name="idempotencyKey" value={key} />
      <StudentFields levels={levels} />
      {state.error ? <div className="bp-notice is-error" role="alert">{state.error}</div> : null}
      <div className="bp-row">
        <button className="bp-btn is-small is-dark" type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add child'}</button>
        <button className="bp-btn is-small is-link" type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

/** A15: after the trial the family keeps the matched tutor or asks for another. */
export function TutorDecision({ enrollmentId, tutorName, rematchCount, freeRematches, trialDone }: { enrollmentId: string; tutorName: string; rematchCount: number; freeRematches: number; trialDone: boolean }) {
  const [keep, keepAction, keeping] = useActionState(confirmTutorAction, initial)
  const [change, changeAction, changing] = useActionState(requestRematchAction, initial)
  const [key] = useState(uuid)
  const [key2] = useState(uuid)
  const [asking, setAsking] = useState(false)
  if (keep.ok) return <p className="bp-status" role="status">{tutorName} is confirmed as the tutor.{keep.data?.invoiceId ? ' The placement invoice is in Billing.' : ''}</p>
  if (change.ok) return <p className="bp-status" role="status">We will find another tutor and be in touch. {change.data?.released ? `${change.data.released} booked session${change.data.released === 1 ? ' was' : 's were'} released with the credit returned.` : ''}</p>
  const free = rematchCount < freeRematches
  return (
    <div className="bp-inline-panel">
      <p className="bp-small">{trialDone ? `How was the trial with ${tutorName}?` : `${tutorName} has been matched. After the first session, tell us whether to keep them.`} If we hear nothing within 48 hours of the trial, the match is kept.</p>
      {!asking ? (
        <div className="bp-row">
          <form action={keepAction}>
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <input type="hidden" name="idempotencyKey" value={key} />
            <button className="bp-btn is-small is-dark" type="submit" disabled={keeping}>{keeping ? 'Confirming…' : `Keep ${tutorName}`}</button>
          </form>
          <button type="button" className="bp-btn is-small" onClick={() => setAsking(true)}>Ask for another tutor</button>
        </div>
      ) : (
        <form action={changeAction} className="bp-form">
          <input type="hidden" name="enrollmentId" value={enrollmentId} />
          <input type="hidden" name="idempotencyKey" value={key2} />
          <label className="bp-field"><span>What was not right?</span><textarea className="bp-input" name="reason" rows={3} required maxLength={500} /></label>
          <p className="bp-small bp-muted">{free ? 'This change is free, and the trial session is not charged.' : 'You have used your free change of tutor; the trial session stays charged.'} Sessions already booked with {tutorName} are released and their credit comes back.</p>
          {change.error ? <div className="bp-notice is-error" role="alert">{change.error}</div> : null}
          <div className="bp-row">
            <button className="bp-btn is-small is-dark" type="submit" disabled={changing}>{changing ? 'Sending…' : 'Find another tutor'}</button>
            <button className="bp-btn is-small is-link" type="button" onClick={() => setAsking(false)}>Back</button>
          </div>
        </form>
      )}
      {keep.error ? <div className="bp-notice is-error" role="alert">{keep.error}</div> : null}
    </div>
  )
}
