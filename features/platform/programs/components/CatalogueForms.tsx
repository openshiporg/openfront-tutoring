'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DrawerForm, Field } from '@/features/platform/lib/forms'
import { Pill, Track, selectClass } from '@/features/platform/lib/ui'
import { endPromo, saveLevelAction, savePackageAction, savePlanAction, saveProgramAction, savePromoAction, saveSubjectAction, setCatalogueStatus } from '../actions/programs'

type Opt = { id: string; name: string }
const MODES = [{ v: 'in_centre', l: 'In centre' }, { v: 'online', l: 'Online' }, { v: 'in_home', l: 'In home' }]
const dollars = (c: number | null | undefined) => (c ? (c / 100).toFixed(2) : '')
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '')

function Checks({ name, options, selected }: { name: string; options: Array<{ v: string; l: string }>; selected: string[] }) {
  return <div className="flex flex-wrap gap-3 text-sm">{options.map((o) => <label key={o.v} className="flex items-center gap-1.5"><input type="checkbox" name={name} value={o.v} defaultChecked={selected.includes(o.v)} />{o.l}</label>)}</div>
}
function Box({ id, name, label, on }: { id: string; name: string; label: string; on?: boolean }) {
  return <label htmlFor={id} className="flex items-center gap-2 text-sm"><input id={id} type="checkbox" name={name} defaultChecked={on} />{label}</label>
}

export function ProgramDrawer({ program, subjects, levels, locations }: { program?: any; subjects: Opt[]; levels: Opt[]; locations: Opt[] }) {
  const router = useRouter()
  const p = program ?? {}
  return (
    <DrawerForm trigger={program ? 'Edit programme' : 'New programme'} triggerVariant={program ? 'raised' : 'primary'} title={program ? `Edit ${p.name}` : 'New programme'}
      description={program ? undefined : 'New programmes start as drafts. Add plans or packages, then publish.'}
      action={async (form) => { const r = await saveProgramAction(form); if (r.success && !program && r.id) router.push(`/dashboard/platform/programs/${r.id}`); return r }}>
      {program ? <input type="hidden" name="programId" value={p.id} /> : null}
      <Field id="pg-n" label="Name"><Input id="pg-n" name="name" required defaultValue={p.name ?? ''} /></Field>
      <Field id="pg-s" label="Web address"><Input id="pg-s" name="slug" defaultValue={p.slug ?? ''} placeholder="made from the name" pattern="[a-z0-9-]*" /></Field>
      <Field id="pg-sum" label="Summary" wide><Textarea id="pg-sum" name="summary" rows={2} defaultValue={p.summary ?? ''} /></Field>
      <Field id="pg-f" label="Format"><select id="pg-f" name="format" className={selectClass} defaultValue={p.format ?? 'small_group'}><option value="one_to_one">One to one</option><option value="small_group">Small group</option><option value="class">Class</option></select></Field>
      <Field id="pg-b" label="Billing"><select id="pg-b" name="billingModel" className={selectClass} defaultValue={p.billingModel ?? 'managed'}><option value="managed">Centre bills the family</option><option value="placement_fee">One placement fee</option></select></Field>
      <Field id="pg-m" label="Taught" wide><Checks name="deliveryModes" options={MODES} selected={p.deliveryModes ?? ['in_centre']} /></Field>
      <Field id="pg-min" label="Session minutes"><Input id="pg-min" name="sessionMinutes" type="number" min={15} step={5} defaultValue={p.sessionMinutes ?? 60} required /></Field>
      <Field id="pg-max" label="Students per session"><Input id="pg-max" name="maxStudentsPerSession" type="number" min={1} max={60} defaultValue={p.maxStudentsPerSession ?? 4} required /></Field>
      <Field id="pg-lf" label="From level"><select id="pg-lf" name="levelsFrom" className={selectClass} defaultValue={p.levelsFrom?.id ?? ''}><option value="">Any</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      <Field id="pg-lt" label="To level"><select id="pg-lt" name="levelsTo" className={selectClass} defaultValue={p.levelsTo?.id ?? ''}><option value="">Any</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      <Field id="pg-ra" label="Assessment"><Box id="pg-ra" name="requiresAssessment" label="Starts with an assessment" on={p.requiresAssessment ?? true} /></Field>
      <Field id="pg-af" label="Assessment fee ($)"><Input id="pg-af" name="assessmentFee" type="number" min={0} step="0.01" defaultValue={dollars(p.assessmentFee)} /></Field>
      <Field id="pg-am" label="Assessment minutes"><Input id="pg-am" name="assessmentMinutes" type="number" min={15} step={5} defaultValue={p.assessmentMinutes ?? 45} /></Field>
      <Field id="pg-tr" label="Trial"><Box id="pg-tr" name="allowsTrial" label="Offers a trial session" on={p.allowsTrial} /></Field>
      <Field id="pg-pg" label="Pay as you go, per session ($)"><Input id="pg-pg" name="payAsYouGoPrice" type="number" min={0} step="0.01" defaultValue={dollars(p.payAsYouGoPrice)} placeholder="Empty = not offered" /></Field>
      <Field id="pg-pf" label="Placement fee ($)"><Input id="pg-pf" name="placementFee" type="number" min={0} step="0.01" defaultValue={dollars(p.placementFee)} /></Field>
      <Field id="pg-sub" label="Subjects" wide><Checks name="subjectIds" options={subjects.map((s) => ({ v: s.id, l: s.name }))} selected={(p.subjects ?? []).map((s: any) => s.id)} /></Field>
      <Field id="pg-loc" label="Centres" wide><Checks name="locationIds" options={locations.map((s) => ({ v: s.id, l: s.name }))} selected={(p.locations ?? []).map((s: any) => s.id)} /></Field>
      <Field id="pg-o" label="Outcomes (one per line)" wide><Textarea id="pg-o" name="outcomes" rows={3} defaultValue={p.outcomes ?? ''} /></Field>
      <Field id="pg-ft" label="Storefront"><Box id="pg-ft" name="featured" label="Feature on the home page" on={p.featured} /></Field>
    </DrawerForm>
  )
}

export function StatusSwitch({ list, id, status, programId }: { list: 'Program' | 'MembershipPlan' | 'Package'; id: string; status: string; programId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const go = (to: string) => start(async () => { setError(null); const r = await setCatalogueStatus(list, id, to, programId); if (!r.success) setError(r.error); else router.refresh() })
  const moves = status === 'draft' ? [{ v: 'published', l: 'Publish', primary: true }, { v: 'archived', l: 'Archive' }] : status === 'published' ? [{ v: 'draft', l: 'Unpublish' }, { v: 'archived', l: 'Archive' }] : [{ v: 'draft', l: 'Restore as draft' }]
  return (
    <span className="inline-grid gap-1">
      <Track>{moves.map((m) => <Pill key={m.v} size="sm" variant={'primary' in m && m.primary ? 'primary' : 'flat'} disabled={pending} onClick={() => go(m.v)}>{m.l}</Pill>)}</Track>
      {error ? <span role="alert" className="max-w-56 text-xs text-destructive">{error}</span> : null}
    </span>
  )
}

export function PlanDrawer({ programId, plan }: { programId: string; plan?: any }) {
  const p = plan ?? {}
  return (
    <DrawerForm trigger={plan ? 'Edit' : 'Add a plan'} triggerVariant={plan ? 'flat' : 'raised'} title={plan ? `Edit ${p.name}` : 'Add a membership plan'} description="Monthly, billed automatically. New plans start as drafts." action={savePlanAction}>
      <input type="hidden" name="programId" value={programId} />
      {plan ? <input type="hidden" name="planId" value={p.id} /> : null}
      <Field id="mp-n" label="Name" wide><Input id="mp-n" name="name" required defaultValue={p.name ?? ''} placeholder="8 sessions a month" /></Field>
      <Field id="mp-p" label="Price a month ($)"><Input id="mp-p" name="price" type="number" min={0} step="0.01" required defaultValue={dollars(p.price)} /></Field>
      <Field id="mp-ef" label="Enrolment fee ($)"><Input id="mp-ef" name="enrolmentFee" type="number" min={0} step="0.01" defaultValue={dollars(p.enrolmentFee)} /></Field>
      <Field id="mp-s" label="Sessions a month"><Input id="mp-s" name="sessionsPerPeriod" type="number" min={1} defaultValue={p.sessionsPerPeriod ?? ''} placeholder="Empty = unlimited" /></Field>
      <Field id="mp-w" label="Weekly cap if unlimited"><Input id="mp-w" name="weeklyCapForUnlimited" type="number" min={1} defaultValue={p.weeklyCapForUnlimited ?? 5} /></Field>
      <Field id="mp-t" label="Minimum term (months)"><Input id="mp-t" name="minimumTermMonths" type="number" min={0} defaultValue={p.minimumTermMonths ?? 0} /></Field>
      <Field id="mp-o" label="Order"><Input id="mp-o" name="sortOrder" type="number" defaultValue={p.sortOrder ?? 0} /></Field>
      <Field id="mp-d" label="Description" wide><Textarea id="mp-d" name="description" rows={2} defaultValue={p.description ?? ''} /></Field>
      <Field id="mp-f" label="What's included (one per line)" wide><Textarea id="mp-f" name="features" rows={3} defaultValue={Array.isArray(p.features) ? p.features.join('\n') : ''} /></Field>
      <Field id="mp-h" label="Storefront"><Box id="mp-h" name="highlight" label="Mark as recommended" on={p.highlight} /></Field>
    </DrawerForm>
  )
}

export function PackageDrawer({ programId, pkg }: { programId: string; pkg?: any }) {
  const p = pkg ?? {}
  return (
    <DrawerForm trigger={pkg ? 'Edit' : 'Add a package'} triggerVariant={pkg ? 'flat' : 'raised'} title={pkg ? `Edit ${p.name}` : 'Add an hours package'} description="Paid once; the hours expire after the months set here." action={savePackageAction}>
      <input type="hidden" name="programId" value={programId} />
      {pkg ? <input type="hidden" name="packageId" value={p.id} /> : null}
      <Field id="pk-n" label="Name" wide><Input id="pk-n" name="name" required defaultValue={p.name ?? ''} placeholder="20 hours" /></Field>
      <Field id="pk-h" label="Hours"><Input id="pk-h" name="hours" type="number" min={1} required defaultValue={p.hours ?? 10} /></Field>
      <Field id="pk-p" label="Price ($)"><Input id="pk-p" name="price" type="number" min={0} step="0.01" required defaultValue={dollars(p.price)} /></Field>
      <Field id="pk-e" label="Expires after (months)"><Input id="pk-e" name="expiryMonths" type="number" min={1} defaultValue={p.expiryMonths ?? 6} /></Field>
      <Field id="pk-o" label="Order"><Input id="pk-o" name="sortOrder" type="number" defaultValue={p.sortOrder ?? 0} /></Field>
      <Field id="pk-d" label="Description" wide><Textarea id="pk-d" name="description" rows={2} defaultValue={p.description ?? ''} /></Field>
    </DrawerForm>
  )
}

const CATS = ['maths', 'english', 'science', 'languages', 'test_prep', 'study_skills', 'other']
export function SubjectDrawer({ subject }: { subject?: any }) {
  const p = subject ?? {}
  return (
    <DrawerForm trigger={subject ? 'Edit' : 'Add a subject'} triggerVariant={subject ? 'flat' : 'raised'} title={subject ? `Edit ${p.name}` : 'Add a subject'} action={saveSubjectAction}>
      {subject ? <input type="hidden" name="subjectId" value={p.id} /> : null}
      <Field id="sj-n" label="Name"><Input id="sj-n" name="name" required defaultValue={p.name ?? ''} /></Field>
      <Field id="sj-c" label="Category"><select id="sj-c" name="category" className={selectClass} defaultValue={p.category ?? 'other'}>{CATS.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase())}</option>)}</select></Field>
      <Field id="sj-s" label="Web address"><Input id="sj-s" name="slug" defaultValue={p.slug ?? ''} placeholder="made from the name" pattern="[a-z0-9-]*" /></Field>
      <Field id="sj-o" label="Order"><Input id="sj-o" name="sortOrder" type="number" defaultValue={p.sortOrder ?? 0} /></Field>
      <Field id="sj-d" label="Description" wide><Textarea id="sj-d" name="description" rows={2} defaultValue={p.description ?? ''} /></Field>
    </DrawerForm>
  )
}

export function LevelDrawer({ level }: { level?: any }) {
  const p = level ?? {}
  return (
    <DrawerForm trigger={level ? 'Edit' : 'Add a level'} triggerVariant={level ? 'flat' : 'raised'} title={level ? `Edit ${p.name}` : 'Add a level'} description="Levels are listed in this order on forms." action={saveLevelAction}>
      {level ? <input type="hidden" name="levelId" value={p.id} /> : null}
      <Field id="lv-n" label="Name"><Input id="lv-n" name="name" required defaultValue={p.name ?? ''} placeholder="Grade 7" /></Field>
      <Field id="lv-k" label="Kind"><select id="lv-k" name="kind" className={selectClass} defaultValue={p.kind ?? 'grade'}><option value="grade">School grade</option><option value="exam">Exam</option><option value="adult">Adult</option></select></Field>
      <Field id="lv-o" label="Order"><Input id="lv-o" name="sortOrder" type="number" required defaultValue={p.sortOrder ?? 0} /></Field>
    </DrawerForm>
  )
}

export function PromoDrawer({ promo }: { promo?: any }) {
  const p = promo ?? {}
  const kind = p.amountOff ? 'amount' : 'percent'
  return (
    <DrawerForm trigger={promo ? 'Edit' : 'New promo code'} triggerVariant={promo ? 'flat' : 'raised'} title={promo ? `Edit ${p.code}` : 'New promo code'} description="Families enter it at checkout." action={savePromoAction}>
      {promo ? <input type="hidden" name="promoId" value={p.id} /> : null}
      <Field id="pr-c" label="Code"><Input id="pr-c" name="code" required defaultValue={p.code ?? ''} placeholder="SPRING25" pattern="[A-Za-z0-9_-]+" /></Field>
      <Field id="pr-a" label="Applies to"><select id="pr-a" name="appliesTo" className={selectClass} defaultValue={p.appliesTo ?? 'any'}><option value="any">Anything</option><option value="plan">Membership plans</option><option value="package">Packages</option><option value="assessment">Assessments</option></select></Field>
      <Field id="pr-k" label="Discount"><select id="pr-k" name="kind" className={selectClass} defaultValue={kind}><option value="percent">Percent off</option><option value="amount">Dollars off</option></select></Field>
      <Field id="pr-v" label="Amount"><Input id="pr-v" name="value" type="number" min={0} step="0.01" required defaultValue={p.amountOff ? dollars(p.amountOff) : p.percentOff ?? ''} /></Field>
      <Field id="pr-f" label="Valid from"><Input id="pr-f" name="validFrom" type="date" defaultValue={day(p.validFrom)} /></Field>
      <Field id="pr-t" label="Valid to"><Input id="pr-t" name="validTo" type="date" defaultValue={day(p.validTo)} /></Field>
      <Field id="pr-m" label="Most uses"><Input id="pr-m" name="maxUses" type="number" min={0} defaultValue={p.maxUses ?? ''} placeholder="No limit" /></Field>
    </DrawerForm>
  )
}

export function EndPromo({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  return (
    <span className="inline-grid gap-1">
      <Pill size="sm" variant="flat" disabled={pending} onClick={() => start(async () => { const r = await endPromo(id); if (!r.success) setError(r.error); else router.refresh() })}>End now</Pill>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </span>
  )
}
