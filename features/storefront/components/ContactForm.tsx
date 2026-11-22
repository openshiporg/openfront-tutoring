'use client'

import { useActionState, useState } from 'react'
import { submitEnquiryAction, type ActionState } from '../lib/actions'

const initial: ActionState = { ok: false, error: null }
const MODES: Record<string, string> = { in_centre: 'In a centre', online: 'Online', in_home: 'At home' }

export function ContactForm({ programs, subjects, levels, locations, defaults, idempotencyKey }: { programs: any[]; subjects: any[]; levels: any[]; locations: any[]; defaults: { intent: string; programId: string; tutor: string }; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(submitEnquiryAction, initial)
  const [intent, setIntent] = useState(defaults.intent === 'request_tutor' ? 'request_tutor' : 'enquiry')

  if (state.ok) {
    return (
      <div className="bp-panel" role="status">
        <h2>Thank you, we have your message</h2>
        <p style={{ marginTop: 8 }}>{intent === 'request_tutor' ? 'We will look for a tutor who fits and get back to you within one working day.' : 'Someone from our team will reply within one working day.'}</p>
        <p className="bp-small bp-muted" style={{ marginTop: 8 }}>Reference {state.id}</p>
      </div>
    )
  }

  return (
    <form action={action} className="bp-form bp-panel">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <fieldset className="bp-fieldset">
        <legend className="bp-legend">What can we help with?</legend>
        <div className="bp-choices">
          <label className="bp-choice"><input type="radio" name="intent" value="enquiry" checked={intent === 'enquiry'} onChange={() => setIntent('enquiry')} /><span><b>Ask a question</b><small>About programs, prices or times</small></span></label>
          <label className="bp-choice"><input type="radio" name="intent" value="request_tutor" checked={intent === 'request_tutor'} onChange={() => setIntent('request_tutor')} /><span><b>Request a tutor</b><small>One-to-one, at home or online</small></span></label>
        </div>
      </fieldset>
      <div className="bp-form-2">
        <label className="bp-field"><span>Your name</span><input className="bp-input" name="name" required autoComplete="name" /></label>
        <label className="bp-field"><span>Email</span><input className="bp-input" type="email" name="email" required autoComplete="email" /></label>
        <label className="bp-field"><span>Phone <small>(optional)</small></span><input className="bp-input" type="tel" name="phone" autoComplete="tel" /></label>
        <label className="bp-field"><span>Student’s name <small>(optional)</small></span><input className="bp-input" name="studentName" /></label>
      </div>
      {intent === 'request_tutor' ? (
        <>
          <fieldset className="bp-fieldset">
            <legend className="bp-legend">Subjects</legend>
            <div className="bp-choices">
              {subjects.map((s) => <label className="bp-check" key={s.id}><input type="checkbox" name="subjectIds" value={s.id} />{s.name}</label>)}
            </div>
          </fieldset>
          <div className="bp-form-2">
            <label className="bp-field"><span>Grade or exam</span>
              <select className="bp-select" name="levelId" defaultValue=""><option value="">Choose</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
            </label>
            <label className="bp-field"><span>Where</span>
              <select className="bp-select" name="mode" defaultValue="in_home">{Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <label className="bp-field"><span>Your area or town</span><input className="bp-input" name="area" placeholder="For home tutoring" /></label>
            <label className="bp-field"><span>Preferred days and times</span><input className="bp-input" name="preferredTimes" placeholder="Weekday afternoons after 4" /></label>
          </div>
        </>
      ) : (
        <div className="bp-form-2">
          <label className="bp-field"><span>Program <small>(optional)</small></span>
            <select className="bp-select" name="programId" defaultValue={defaults.programId}><option value="">Not sure yet</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
          <label className="bp-field"><span>Centre <small>(optional)</small></span>
            <select className="bp-select" name="locationId" defaultValue=""><option value="">Any</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </label>
        </div>
      )}
      <label className="bp-field"><span>Message</span><textarea className="bp-textarea" name="message" defaultValue={defaults.tutor ? `We would like to work with ${defaults.tutor}.` : ''} /></label>
      {state.error ? <div className="bp-notice is-error" role="alert">{state.error}</div> : null}
      <div><button className="bp-btn is-primary" type="submit" disabled={pending}>{pending ? 'Sending…' : intent === 'request_tutor' ? 'Request a tutor' : 'Send message'}</button></div>
    </form>
  )
}
