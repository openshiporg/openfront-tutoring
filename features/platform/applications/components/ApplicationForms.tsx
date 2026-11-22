'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DrawerForm, Field } from '@/features/platform/lib/forms'
import { Pill, Track, selectClass } from '@/features/platform/lib/ui'
import { approveApplicationAction, createApplicationAction, moveApplicationAction } from '../actions/applications'

type Opt = { id: string; name: string }
const MODES = [{ v: 'in_centre', l: 'In centre' }, { v: 'online', l: 'Online' }, { v: 'in_home', l: 'In home' }]
const SOURCES = [{ v: 'email', l: 'Email' }, { v: 'referral', l: 'Referral' }, { v: 'job_board', l: 'Job board' }, { v: 'walk_in', l: 'Walk-in' }, { v: 'other', l: 'Other' }]
const Key = () => <input type="hidden" name="idempotencyKey" value={useState(() => crypto.randomUUID())[0]} />

function References() {
  const [n, setN] = useState(2)
  return (
    <div className="grid gap-2 sm:col-span-2">
      <span className="text-sm font-medium">References</span>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-3">
          <Input name="refName" aria-label={`Reference ${i + 1} name`} placeholder="Name" />
          <Input name="refContact" aria-label={`Reference ${i + 1} contact`} placeholder="Email or phone" />
          <Input name="refRelation" aria-label={`Reference ${i + 1} relation`} placeholder="e.g. Head of maths" />
        </div>
      ))}
      {n < 4 ? <Track><Pill size="sm" onClick={() => setN(n + 1)}>Add a reference</Pill></Track> : null}
    </div>
  )
}

export function NewApplication({ subjects }: { subjects: Opt[] }) {
  const router = useRouter()
  return (
    <DrawerForm trigger="Add an applicant" triggerVariant="primary" title="Add an applicant" description="Record someone who applied by email, a referral or in person." submitLabel="Add applicant"
      action={async (form) => { const r = await createApplicationAction(form); if (r.success && r.id) router.push(`/dashboard/platform/applications/${r.id}`); return r }}>
      <Key />
      <Field id="na-n" label="Name"><Input id="na-n" name="name" required maxLength={120} /></Field>
      <Field id="na-e" label="Email"><Input id="na-e" name="email" type="email" required /></Field>
      <Field id="na-p" label="Phone"><Input id="na-p" name="phone" type="tel" /></Field>
      <Field id="na-src" label="Came through"><select id="na-src" name="source" className={selectClass} defaultValue="email">{SOURCES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select></Field>
      <Field id="na-sub" label="Subjects" wide><div className="flex flex-wrap gap-3 text-sm">{subjects.map((s) => <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" name="subjectIds" value={s.id} />{s.name}</label>)}</div></Field>
      <Field id="na-st" label="Subjects in their words" wide><Input id="na-st" name="subjectsText" maxLength={500} /></Field>
      <Field id="na-lv" label="Levels"><Input id="na-lv" name="levels" maxLength={300} placeholder="Grades 6–12" /></Field>
      <Field id="na-ar" label="Areas"><Input id="na-ar" name="areas" maxLength={300} /></Field>
      <Field id="na-m" label="Can teach" wide><div className="flex flex-wrap gap-4 text-sm">{MODES.map((m) => <label key={m.v} className="flex items-center gap-2"><input type="checkbox" name="modes" value={m.v} />{m.l}</label>)}</div></Field>
      <Field id="na-av" label="Availability" wide><Input id="na-av" name="availability" maxLength={300} placeholder="Weekdays after 3:30, Saturday mornings" /></Field>
      <Field id="na-cn" label="Cover note" wide><Textarea id="na-cn" name="coverNote" rows={4} maxLength={4000} /></Field>
      <References />
      <Field id="na-no" label="Notes for the hiring team" wide><Textarea id="na-no" name="notes" rows={2} maxLength={4000} /></Field>
    </DrawerForm>
  )
}

const NEXT: Record<string, Array<{ v: string; l: string }>> = {
  applied: [{ v: 'screening', l: 'Start screening' }],
  screening: [{ v: 'interview', l: 'Move to interview' }],
  interview: [{ v: 'checks', l: 'Move to checks' }],
  checks: [],
}

export function ApplicationMoves({ id, status }: { id: string; status: string }) {
  if (!(status in NEXT)) return null
  const moves = [...NEXT[status], { v: 'rejected', l: 'Reject' }, { v: 'withdrawn', l: 'Mark withdrawn' }]
  return (
    <Track wrap>
      {moves.map((m) => (
        <DrawerForm key={m.v} trigger={m.l} triggerVariant={m.v === 'rejected' || m.v === 'withdrawn' ? 'flat' : 'raised'} title={m.l} action={moveApplicationAction} submitLabel={m.l}>
          <Key />
          <input type="hidden" name="applicationId" value={id} />
          <input type="hidden" name="status" value={m.v} />
          <Field id={`am-n-${m.v}`} label="Note (added to the application)" wide><Textarea id={`am-n-${m.v}`} name="note" rows={3} maxLength={2000} /></Field>
        </DrawerForm>
      ))}
    </Track>
  )
}

export function ApproveApplication({ id, name, locations }: { id: string; name: string; locations: Opt[] }) {
  const router = useRouter()
  return (
    <DrawerForm trigger="Approve and create tutor" triggerVariant="primary" title={`Approve ${name}`} description="Creates the tutor (onboarding) and their sign-in, and emails them a link to set a password." submitLabel="Approve"
      action={async (form) => { const r = await approveApplicationAction(form); if (r.success && r.id) router.push(`/dashboard/platform/tutors/${r.id}`); return r }}>
      <Key />
      <input type="hidden" name="applicationId" value={id} />
      <Field id="ap-e" label="Employment"><select id="ap-e" name="employmentType" className={selectClass} defaultValue="contractor"><option value="contractor">Contractor</option><option value="employee">Employee</option></select></Field>
      <Field id="ap-p" label="Default pay per hour ($)"><Input id="ap-p" name="defaultPayRate" type="number" min={0} step="0.01" required /></Field>
      <Field id="ap-l" label="Centres" wide><div className="flex flex-wrap gap-4 text-sm">{locations.map((l) => <label key={l.id} className="flex items-center gap-2"><input type="checkbox" name="locationIds" value={l.id} />{l.name}</label>)}</div></Field>
    </DrawerForm>
  )
}
