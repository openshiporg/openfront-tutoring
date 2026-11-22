'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DrawerForm, Field } from '@/features/platform/lib/forms'
import { Pill, Track, selectClass } from '@/features/platform/lib/ui'
import {
  addAvailabilityAction, addCredentialAction, addSubjectAction, decideTimeOffAction, removeAvailabilityAction, removeSubjectAction,
  setTutorStatusAction, updateTutorAction, verifyCredentialAction,
} from '../actions/tutors'

type Opt = { id: string; name: string }
const MODES = [{ v: 'in_centre', l: 'In centre' }, { v: 'online', l: 'Online' }, { v: 'in_home', l: 'In home' }]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const Key = () => <input type="hidden" name="idempotencyKey" value={useState(() => crypto.randomUUID())[0]} />

/** One-click row action (remove, approve, decline) with its error shown next to it. */
function RowAction({ label, run, variant = 'flat', confirm }: { label: string; run: () => Promise<{ success: boolean; error: string | null }>; variant?: 'flat' | 'raised' | 'danger' | 'primary'; confirm?: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  return (
    <span className="inline-grid gap-1">
      <Pill size="sm" variant={variant} disabled={pending} onClick={() => {
        if (confirm && !window.confirm(confirm)) return
        start(async () => { setError(null); const r = await run(); if (!r.success) setError(r.error); else router.refresh() })
      }}>{pending ? '…' : label}</Pill>
      {error ? <span role="alert" className="max-w-56 text-xs text-destructive">{error}</span> : null}
    </span>
  )
}

export function EditTutor({ t, locations, canPay }: { t: any; locations: Opt[]; canPay: boolean }) {
  const mine = new Set((t.locations ?? []).map((l: any) => l.id))
  return (
    <DrawerForm trigger="Edit profile" title={`Edit ${t.displayName}`} description="The public profile shows on the storefront tutor pages when it is switched on." action={updateTutorAction}>
      <input type="hidden" name="tutorId" value={t.id} />
      <Field id="et-n" label="Name families see"><Input id="et-n" name="displayName" defaultValue={t.displayName} required /></Field>
      <Field id="et-emp" label="Employment">
        <select id="et-emp" name="employmentType" defaultValue={t.employmentType} className={selectClass}><option value="contractor">Contractor</option><option value="employee">Employee</option></select>
      </Field>
      <Field id="et-h" label="Headline" wide><Input id="et-h" name="headline" defaultValue={t.headline ?? ''} maxLength={160} /></Field>
      <Field id="et-b" label="Bio" wide><Textarea id="et-b" name="bio" rows={5} defaultValue={t.bio ?? ''} /></Field>
      <Field id="et-ed" label="Education"><Input id="et-ed" name="education" defaultValue={t.education ?? ''} /></Field>
      <Field id="et-y" label="Years teaching"><Input id="et-y" name="yearsExperience" type="number" min={0} max={60} defaultValue={t.yearsExperience ?? 0} /></Field>
      <Field id="et-m" label="Teaches" wide>
        <div className="flex flex-wrap gap-4 text-sm">{MODES.map((m) => <label key={m.v} className="flex items-center gap-2"><input type="checkbox" name="deliveryModes" value={m.v} defaultChecked={(t.deliveryModes ?? []).includes(m.v)} />{m.l}</label>)}</div>
      </Field>
      <Field id="et-l" label="Centres" wide>
        <div className="flex flex-wrap gap-4 text-sm">{locations.map((l) => <label key={l.id} className="flex items-center gap-2"><input type="checkbox" name="locationIds" value={l.id} defaultChecked={mine.has(l.id)} />{l.name}</label>)}</div>
      </Field>
      <Field id="et-a" label="Home-visit areas"><Input id="et-a" name="travelAreas" defaultValue={t.travelAreas ?? ''} placeholder="Evanston, Skokie" /></Field>
      <Field id="et-r" label="Travel radius (km)"><Input id="et-r" name="travelRadiusKm" type="number" min={0} max={200} defaultValue={t.travelRadiusKm ?? ''} /></Field>
      <Field id="et-u" label="Online meeting link" wide><Input id="et-u" name="meetingUrl" type="url" defaultValue={t.meetingUrl ?? ''} /></Field>
      <Field id="et-p" label="Photo URL" wide><Input id="et-p" name="photoUrl" type="url" defaultValue={t.photoUrl ?? ''} /></Field>
      {canPay ? <Field id="et-pay" label="Default pay per hour ($)"><Input id="et-pay" name="defaultPayRate" type="number" min={0} step="0.01" defaultValue={t.defaultPayRate != null ? (t.defaultPayRate / 100).toFixed(2) : ''} /></Field> : null}
      <Field id="et-pub" label="Storefront"><label className="flex items-center gap-2 text-sm"><input id="et-pub" type="checkbox" name="publicProfile" defaultChecked={t.publicProfile} /> Show the public profile</label></Field>
    </DrawerForm>
  )
}

const MOVES: Record<string, Array<{ v: string; l: string }>> = {
  onboarding: [{ v: 'active', l: 'Make active' }, { v: 'inactive', l: 'Mark inactive' }],
  active: [{ v: 'paused', l: 'Pause' }, { v: 'inactive', l: 'Mark inactive' }],
  paused: [{ v: 'active', l: 'Make active' }, { v: 'inactive', l: 'Mark inactive' }],
  inactive: [{ v: 'active', l: 'Make active again' }],
}

export function TutorStatus({ tutorId, status }: { tutorId: string; status: string }) {
  return (
    <Track wrap>
      {(MOVES[status] ?? []).map((m) => (
        <DrawerForm key={m.v} trigger={m.l} triggerVariant={m.v === 'active' ? 'primary' : 'raised'} title={m.l}
          description={m.v === 'active' ? 'Needs a verified, current background check.' : 'Offers this tutor has not answered are withdrawn.'}
          action={setTutorStatusAction} submitLabel={m.l}>
          <Key />
          <input type="hidden" name="tutorId" value={tutorId} />
          <input type="hidden" name="status" value={m.v} />
          <Field id={`ts-r-${m.v}`} label="Reason" wide><Input id={`ts-r-${m.v}`} name="reason" maxLength={300} /></Field>
          {m.v !== 'active' ? <Field id={`ts-c-${m.v}`} label="Sessions" wide><label className="flex items-center gap-2 text-sm"><input id={`ts-c-${m.v}`} type="checkbox" name="coverSessions" defaultChecked /> Mark their upcoming sessions as needing cover</label></Field> : null}
        </DrawerForm>
      ))}
    </Track>
  )
}

export function AddSubject({ tutorId, subjects, levels, canPay }: { tutorId: string; subjects: Opt[]; levels: Opt[]; canPay: boolean }) {
  return (
    <DrawerForm trigger="Add a subject" title="Add a subject" action={addSubjectAction} submitLabel="Add subject">
      <input type="hidden" name="tutorId" value={tutorId} />
      <Field id="as-s" label="Subject" wide><select id="as-s" name="subjectId" className={selectClass} required defaultValue=""><option value="">Choose…</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field id="as-f" label="From level"><select id="as-f" name="levelFrom" className={selectClass} defaultValue=""><option value="">Any</option>{levels.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field id="as-t" label="To level"><select id="as-t" name="levelTo" className={selectClass} defaultValue=""><option value="">Any</option>{levels.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      {canPay ? <Field id="as-p" label="Pay per hour for this subject ($)" wide><Input id="as-p" name="payRate" type="number" min={0} step="0.01" placeholder="Uses the default rate when empty" /></Field> : null}
    </DrawerForm>
  )
}

export function RemoveSubject({ tutorId, rowId, name }: { tutorId: string; rowId: string; name: string }) {
  return <RowAction label="Remove" confirm={`Remove ${name} from this tutor?`} run={() => removeSubjectAction(tutorId, rowId)} />
}

export function AddAvailability({ tutorId, locations }: { tutorId: string; locations: Opt[] }) {
  return (
    <DrawerForm trigger="Add hours" title="Add weekly hours" description="Matching and the schedule only offer times inside these hours." action={addAvailabilityAction} submitLabel="Add hours">
      <input type="hidden" name="tutorId" value={tutorId} />
      <Field id="aa-d" label="Days" wide><div className="flex flex-wrap gap-3 text-sm">{DAYS.map((d, i) => <label key={d} className="flex items-center gap-1.5"><input type="checkbox" name="weekday" value={i} defaultChecked={i >= 1 && i <= 4} />{d}</label>)}</div></Field>
      <Field id="aa-s" label="From"><Input id="aa-s" name="start" type="time" defaultValue="15:30" required /></Field>
      <Field id="aa-e" label="Until"><Input id="aa-e" name="end" type="time" defaultValue="19:30" required /></Field>
      <Field id="aa-m" label="Mode"><select id="aa-m" name="mode" className={selectClass} defaultValue="in_centre">{MODES.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select></Field>
      <Field id="aa-l" label="Centre"><select id="aa-l" name="locationId" className={selectClass} defaultValue={locations[0]?.id ?? ''}><option value="">None (online or in home)</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
    </DrawerForm>
  )
}

export function RemoveAvailability({ tutorId, rowId }: { tutorId: string; rowId: string }) {
  return <RowAction label="Remove" run={() => removeAvailabilityAction(tutorId, rowId)} />
}

const KINDS = [{ v: 'background_check', l: 'Background check' }, { v: 'safeguarding', l: 'Safeguarding training' }, { v: 'id', l: 'ID' }, { v: 'teaching_certificate', l: 'Teaching certificate' }, { v: 'degree', l: 'Degree' }]

export function AddCredential({ tutorId }: { tutorId: string }) {
  return (
    <DrawerForm trigger="Record a credential" title="Record a credential" description="Record what you have seen, then verify it." action={addCredentialAction}>
      <input type="hidden" name="tutorId" value={tutorId} />
      <Field id="ac-k" label="Kind" wide><select id="ac-k" name="kind" className={selectClass} defaultValue="background_check">{KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</select></Field>
      <Field id="ac-r" label="Reference number" wide><Input id="ac-r" name="reference" maxLength={120} /></Field>
      <Field id="ac-i" label="Issued"><Input id="ac-i" name="issuedAt" type="date" /></Field>
      <Field id="ac-e" label="Expires"><Input id="ac-e" name="expiresAt" type="date" /></Field>
    </DrawerForm>
  )
}

export function VerifyCredential({ tutorId, credential }: { tutorId: string; credential: any }) {
  return (
    <Track wrap>
      <DrawerForm trigger="Verify" triggerVariant="primary" title="Verify credential" action={verifyCredentialAction} submitLabel="Verify">
        <Key />
        <input type="hidden" name="tutorId" value={tutorId} />
        <input type="hidden" name="credentialId" value={credential.id} />
        <input type="hidden" name="decision" value="verified" />
        <Field id={`vc-e-${credential.id}`} label="Expires" wide><Input id={`vc-e-${credential.id}`} name="expiresAt" type="date" defaultValue={credential.expiresAt ? String(credential.expiresAt).slice(0, 10) : ''} /></Field>
      </DrawerForm>
      {credential.status !== 'rejected' ? (
        <DrawerForm trigger="Reject" title="Reject credential" action={verifyCredentialAction} submitLabel="Reject">
          <Key />
          <input type="hidden" name="tutorId" value={tutorId} />
          <input type="hidden" name="credentialId" value={credential.id} />
          <input type="hidden" name="decision" value="rejected" />
          <p className="text-sm sm:col-span-2">The tutor cannot be made active on a rejected background check.</p>
        </DrawerForm>
      ) : null}
    </Track>
  )
}

export function TimeOffDecision({ tutorId, timeOffId }: { tutorId: string; timeOffId: string }) {
  return (
    <Track>
      <RowAction label="Approve" variant="primary" run={() => decideTimeOffAction(tutorId, timeOffId, true)} />
      <RowAction label="Decline" run={() => decideTimeOffAction(tutorId, timeOffId, false)} />
    </Track>
  )
}
