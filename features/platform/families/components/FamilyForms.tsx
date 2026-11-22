'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { DrawerForm, Field } from '@/features/platform/lib/forms'
import { Notice, Pill, Track, selectClass } from '@/features/platform/lib/ui'
import {
  addStudentAction, changePlanAction, completeTaskAction, createFamilyAction, endMembershipAction, goodwillCreditAction,
  logContactAction, moderateReviewAction, pauseMembershipAction, recordOfflinePaymentAction, recordReviewAction,
  refundPaymentAction, updateFamilyAction, updateStudentAction,
} from '../actions/families'

type Opt = { id: string; name: string }
const today = () => new Date().toISOString().slice(0, 10)

function Select({ id, name, options, value, empty, required }: { id: string; name: string; options: Array<{ value: string; label: string }>; value?: string; empty?: string; required?: boolean }) {
  return (
    <select id={id} name={name} defaultValue={value ?? ''} className={selectClass} required={required}>
      {empty !== undefined ? <option value="">{empty}</option> : null}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/** New family from the desk; opens the family page when saved. */
export function NewFamily({ locations }: { locations: Opt[] }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <>
      <Pill variant="primary" size="sm" onClick={() => setOpen(true)}>New family</Pill>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader><SheetTitle>New family</SheetTitle><SheetDescription>For a family who phoned or walked in. They can sign in later by registering with the billing email.</SheetDescription></SheetHeader>
          <form className="grid gap-4 px-4 pb-6 sm:grid-cols-2" onSubmit={(e) => {
            e.preventDefault(); const form = new FormData(e.currentTarget); setError(null)
            start(async () => {
              const r = await createFamilyAction(form)
              if (!r.success) { setError(r.error); return }
              if (r.id) { setOpen(false); router.push(`/dashboard/platform/families/${r.id}`) }
            })
          }}>
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <Field id="nf-name" label="Family name" wide><Input id="nf-name" name="name" required placeholder="Okafor family" /></Field>
            <Field id="nf-email" label="Billing email"><Input id="nf-email" name="billingEmail" type="email" required /></Field>
            <Field id="nf-phone" label="Phone"><Input id="nf-phone" name="phone" type="tel" /></Field>
            <Field id="nf-g" label="Guardian name"><Input id="nf-g" name="guardianName" /></Field>
            <Field id="nf-gp" label="Guardian phone"><Input id="nf-gp" name="guardianPhone" type="tel" /></Field>
            <Field id="nf-loc" label="Home centre" wide><Select id="nf-loc" name="primaryLocationId" empty="Online / in-home only" options={locations.map((l) => ({ value: l.id, label: l.name }))} value={locations.length === 1 ? locations[0].id : ''} /></Field>
            <Field id="nf-sf" label="First child: first name"><Input id="nf-sf" name="studentFirstName" /></Field>
            <Field id="nf-sl" label="Last name"><Input id="nf-sl" name="studentLastName" /></Field>
            {error ? <Notice tone="alert" className="sm:col-span-2">{error}</Notice> : null}
            <Track className="sm:col-span-2"><Pill onClick={() => setOpen(false)}>Cancel</Pill><Pill type="submit" variant="primary" disabled={pending}>{pending ? 'Creating…' : 'Create family'}</Pill></Track>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}

export function EditFamily({ f, locations, canBilling }: { f: any; locations: Opt[]; canBilling: boolean }) {
  return (
    <DrawerForm trigger="Edit family" title={`Edit ${f.name}`} action={updateFamilyAction}>
      <input type="hidden" name="familyId" value={f.id} />
      <Field id="ef-name" label="Family name" wide><Input id="ef-name" name="name" defaultValue={f.name} required /></Field>
      <Field id="ef-email" label="Billing email"><Input id="ef-email" name="billingEmail" type="email" defaultValue={f.billingEmail ?? ''} required /></Field>
      <Field id="ef-phone" label="Phone"><Input id="ef-phone" name="phone" type="tel" defaultValue={f.phone ?? ''} /></Field>
      <Field id="ef-a1" label="Address" wide><Input id="ef-a1" name="addressLine1" defaultValue={f.addressLine1 ?? ''} /></Field>
      <Field id="ef-a2" label="Address line 2" wide><Input id="ef-a2" name="addressLine2" defaultValue={f.addressLine2 ?? ''} /></Field>
      <Field id="ef-city" label="City"><Input id="ef-city" name="city" defaultValue={f.city ?? ''} /></Field>
      <Field id="ef-region" label="State"><Input id="ef-region" name="region" defaultValue={f.region ?? ''} /></Field>
      <Field id="ef-zip" label="ZIP"><Input id="ef-zip" name="postalCode" defaultValue={f.postalCode ?? ''} /></Field>
      <Field id="ef-loc" label="Home centre"><Select id="ef-loc" name="primaryLocationId" empty="Online / in-home only" value={f.primaryLocation?.id ?? ''} options={locations.map((l) => ({ value: l.id, label: l.name }))} /></Field>
      <Field id="ef-g2" label="Second guardian"><Input id="ef-g2" name="secondGuardianName" defaultValue={f.secondGuardianName ?? ''} /></Field>
      <Field id="ef-g2e" label="Their email"><Input id="ef-g2e" name="secondGuardianEmail" type="email" defaultValue={f.secondGuardianEmail ?? ''} /></Field>
      <Field id="ef-g2p" label="Their phone"><Input id="ef-g2p" name="secondGuardianPhone" type="tel" defaultValue={f.secondGuardianPhone ?? ''} /></Field>
      <Field id="ef-status" label="Status"><Select id="ef-status" name="status" value={f.status} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} /></Field>
      {canBilling ? (
        <Field id="ef-payg" label="Pay as you go" wide hint="Lets this family book single sessions without credit; each one is invoiced.">
          <input type="hidden" name="payAsYouGoField" value="1" />
          <label className="flex items-center gap-2 text-sm"><input id="ef-payg" type="checkbox" name="payAsYouGoAllowed" defaultChecked={f.payAsYouGoAllowed} /> Allowed</label>
        </Field>
      ) : null}
      <Field id="ef-notes" label="Staff notes (never shown to the family)" wide><Textarea id="ef-notes" name="notes" rows={4} defaultValue={f.notes ?? ''} /></Field>
    </DrawerForm>
  )
}

function PickupRows({ initial }: { initial: Array<{ name: string; relation?: string; phone?: string }> }) {
  const [rows, setRows] = useState(initial)
  return (
    <div className="grid gap-2 sm:col-span-2">
      <span className="text-sm font-medium">Who may collect them</span>
      {rows.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
          <Input name="pickupName" aria-label="Name" placeholder="Name" defaultValue={p.name} />
          <Input name="pickupRelation" aria-label="Relation" placeholder="Relation" defaultValue={p.relation ?? ''} />
          <Input name="pickupPhone" aria-label="Phone" placeholder="Phone" defaultValue={p.phone ?? ''} />
          <Pill size="sm" variant="flat" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</Pill>
        </div>
      ))}
      {!rows.length ? <input type="hidden" name="pickupName" value="" /> : null}
      <Track><Pill size="sm" onClick={() => setRows([...rows, { name: '' }])}>Add a person</Pill></Track>
    </div>
  )
}

export function StudentDrawer({ familyId, student, levels }: { familyId: string; student?: any; levels: Opt[] }) {
  const s = student
  return (
    <DrawerForm trigger={s ? 'Edit' : 'Add a child'} triggerVariant={s ? 'flat' : 'raised'} title={s ? `Edit ${s.firstName}` : 'Add a child'} action={s ? updateStudentAction : addStudentAction} submitLabel={s ? 'Save' : 'Add child'}>
      <input type="hidden" name="familyId" value={familyId} />
      {s ? <input type="hidden" name="studentId" value={s.id} /> : null}
      <Field id="sd-fn" label="First name"><Input id="sd-fn" name="firstName" defaultValue={s?.firstName ?? ''} required /></Field>
      <Field id="sd-ln" label="Last name"><Input id="sd-ln" name="lastName" defaultValue={s?.lastName ?? ''} /></Field>
      <Field id="sd-dob" label="Date of birth"><Input id="sd-dob" name="dateOfBirth" type="date" max={today()} defaultValue={s?.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : ''} /></Field>
      <Field id="sd-lv" label="Grade or level"><Select id="sd-lv" name="levelId" empty="Not set" value={s?.level?.id ?? ''} options={levels.map((l) => ({ value: l.id, label: l.name }))} /></Field>
      <Field id="sd-sc" label="School"><Input id="sd-sc" name="school" defaultValue={s?.school ?? ''} /></Field>
      <Field id="sd-st" label="Status"><Select id="sd-st" name="status" value={s?.status ?? 'prospect'} options={['prospect', 'active', 'paused', 'alumni'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} /></Field>
      <Field id="sd-ln2" label="Learning notes (shared with their tutor)" wide><Textarea id="sd-ln2" name="learningNotes" rows={3} defaultValue={s?.learningNotes ?? ''} /></Field>
      <Field id="sd-md" label="Medical notes and allergies" wide><Textarea id="sd-md" name="medicalNotes" rows={2} defaultValue={s?.medicalNotes ?? ''} /></Field>
      <PickupRows initial={Array.isArray(s?.pickupPeople) ? s.pickupPeople : []} />
    </DrawerForm>
  )
}

export function LogContact({ familyId, tasks }: { familyId: string; tasks: Array<{ id: string; title: string }> }) {
  return (
    <DrawerForm trigger="Log contact" title="Log a call, email or visit" description="Kept on the family record for staff. The family does not see it." action={logContactAction}>
      <input type="hidden" name="familyId" value={familyId} />
      <Field id="lc-ch" label="How"><Select id="lc-ch" name="channel" value="phone" options={[{ value: 'phone', label: 'Phone' }, { value: 'email', label: 'Email' }, { value: 'in_person', label: 'In person' }, { value: 'sms', label: 'Text message' }]} /></Field>
      <Field id="lc-dir" label="Direction"><Select id="lc-dir" name="direction" value="outbound" options={[{ value: 'outbound', label: 'We contacted them' }, { value: 'inbound', label: 'They contacted us' }, { value: 'internal', label: 'Internal note' }]} /></Field>
      <Field id="lc-sub" label="Subject" wide><Input id="lc-sub" name="subject" maxLength={200} /></Field>
      <Field id="lc-body" label="What was said" wide><Textarea id="lc-body" name="body" rows={5} required maxLength={4000} /></Field>
      <Field id="lc-next" label="Follow up on"><Input id="lc-next" name="nextFollowUpAt" type="date" min={today()} /></Field>
      {tasks.length ? <Field id="lc-task" label="Closes task"><Select id="lc-task" name="taskId" empty="None" options={tasks.map((t) => ({ value: t.id, label: t.title }))} /></Field> : null}
    </DrawerForm>
  )
}

export function RecordReview({ familyId, tutors, locations, programs, defaultName, defaultLocationId }: { familyId: string; tutors: Array<{ id: string; displayName: string }>; locations: Opt[]; programs: Opt[]; defaultName: string; defaultLocationId?: string }) {
  return (
    <DrawerForm trigger="Record a review" title="Record a review" description="What the family said, in their words. It is published only after the owner approves it." action={recordReviewAction}>
      <input type="hidden" name="familyId" value={familyId} />
      <Field id="rv-r" label="Rating"><Select id="rv-r" name="rating" value="5" options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} of 5` }))} /></Field>
      <Field id="rv-s" label="Source"><Select id="rv-s" name="source" value="email" options={[{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'in_person', label: 'In person' }, { value: 'survey', label: 'Survey' }, { value: 'other', label: 'Other' }]} /></Field>
      <Field id="rv-a" label="Shown as" wide hint="For example “Marisol O., parent”."><Input id="rv-a" name="authorName" defaultValue={defaultName} /></Field>
      <Field id="rv-t" label="Tutor"><Select id="rv-t" name="tutorId" empty="None" options={tutors.map((t) => ({ value: t.id, label: t.displayName }))} /></Field>
      <Field id="rv-p" label="Programme"><Select id="rv-p" name="programId" empty="None" options={programs.map((p) => ({ value: p.id, label: p.name }))} /></Field>
      <Field id="rv-l" label="Centre" hint="Pick at least one of tutor, programme or centre."><Select id="rv-l" name="locationId" empty="None" value={defaultLocationId ?? ''} options={locations.map((l) => ({ value: l.id, label: l.name }))} /></Field>
      <Field id="rv-x" label="Their words" wide><Textarea id="rv-x" name="text" rows={5} required maxLength={2000} /></Field>
    </DrawerForm>
  )
}

export function ModerateReview({ familyId, reviewId, status }: { familyId: string; reviewId: string; status: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const run = (to: string) => start(async () => { setError(null); const r = await moderateReviewAction(familyId, reviewId, to); if (!r.success) setError(r.error); else router.refresh() })
  return (
    <span className="inline-grid gap-1">
      <Track>
        {status !== 'published' ? <Pill size="sm" disabled={pending} onClick={() => run('published')}>Publish</Pill> : null}
        {status !== 'hidden' ? <Pill size="sm" variant="flat" disabled={pending} onClick={() => run('hidden')}>Hide</Pill> : null}
      </Track>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </span>
  )
}

export function CompleteTask({ familyId, taskId, title }: { familyId: string; taskId: string; title: string }) {
  return (
    <DrawerForm trigger="Done" triggerVariant="flat" title={title} action={completeTaskAction} submitLabel="Close task">
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="taskId" value={taskId} />
      <Field id={`ct-o-${taskId}`} label="Outcome" wide><Textarea id={`ct-o-${taskId}`} name="outcome" rows={3} required maxLength={1000} /></Field>
      <Field id={`ct-d-${taskId}`} label="Close as" wide><Select id={`ct-d-${taskId}`} name="dismiss" value="" options={[{ value: '', label: 'Done' }, { value: '1', label: 'Dismissed (no longer needed)' }]} /></Field>
    </DrawerForm>
  )
}

export function GoodwillCredit({ familyId, students, programs }: { familyId: string; students: Array<{ id: string; firstName: string }>; programs: Opt[] }) {
  return (
    <DrawerForm trigger="Give credit" title="Give goodwill credit" description="Free hours the family can book with, for example after a session we cancelled. Recorded in the ledger with your name." action={goodwillCreditAction} submitLabel="Give credit">
      <input type="hidden" name="familyId" value={familyId} />
      <Field id="gc-h" label="Hours"><Input id="gc-h" name="hours" type="number" min={0.25} max={100} step={0.25} required /></Field>
      <Field id="gc-e" label="Use within (days)"><Input id="gc-e" name="expiresInDays" type="number" min={1} max={730} defaultValue={60} /></Field>
      <Field id="gc-s" label="For"><Select id="gc-s" name="studentId" empty="Any child" options={students.map((s) => ({ value: s.id, label: s.firstName }))} /></Field>
      <Field id="gc-p" label="Programme"><Select id="gc-p" name="programId" empty="Any programme" options={programs.map((p) => ({ value: p.id, label: p.name }))} /></Field>
      <Field id="gc-r" label="Reason" wide><Input id="gc-r" name="reason" required maxLength={300} /></Field>
    </DrawerForm>
  )
}

export function PauseMembership({ familyId, membershipId }: { familyId: string; membershipId: string }) {
  return (
    <DrawerForm trigger="Pause" triggerVariant="flat" title="Pause membership" description="No billing and no new credit while paused. Sessions booked in the pause are released and their credit returned." action={pauseMembershipAction} submitLabel="Pause">
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <Field id={`pm-f-${membershipId}`} label="From"><Input id={`pm-f-${membershipId}`} name="from" type="date" min={today()} required /></Field>
      <Field id={`pm-u-${membershipId}`} label="Until"><Input id={`pm-u-${membershipId}`} name="until" type="date" min={today()} required /></Field>
      <Field id={`pm-r-${membershipId}`} label="Reason" wide><Input id={`pm-r-${membershipId}`} name="reason" maxLength={300} /></Field>
    </DrawerForm>
  )
}

export function EndMembership({ familyId, membershipId }: { familyId: string; membershipId: string }) {
  return (
    <DrawerForm trigger="End" triggerVariant="flat" title="End membership" action={endMembershipAction} submitLabel="End membership">
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <Field id={`em-m-${membershipId}`} label="When" wide><Select id={`em-m-${membershipId}`} name="mode" value="notice" options={[{ value: 'notice', label: 'At the end of the notice period (policy)' }, { value: 'now', label: 'Now' }]} /></Field>
      <Field id={`em-rf-${membershipId}`} label="Refund" wide hint="With “now”: refund the unused part of the period to the card."><label className="flex items-center gap-2 text-sm"><input id={`em-rf-${membershipId}`} type="checkbox" name="refund" /> Refund unused time</label></Field>
      <Field id={`em-r-${membershipId}`} label="Reason" wide><Input id={`em-r-${membershipId}`} name="reason" required maxLength={300} /></Field>
    </DrawerForm>
  )
}

export function ChangePlan({ familyId, membershipId, plans }: { familyId: string; membershipId: string; plans: Opt[] }) {
  if (!plans.length) return null
  return (
    <DrawerForm trigger="Change plan" triggerVariant="flat" title="Change plan" description="“Now” charges or credits the difference for the rest of this period; “next bill date” switches at renewal." action={changePlanAction} submitLabel="Change plan">
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <Field id={`cp-p-${membershipId}`} label="New plan" wide><Select id={`cp-p-${membershipId}`} name="planId" required options={plans.map((p) => ({ value: p.id, label: p.name }))} /></Field>
      <Field id={`cp-e-${membershipId}`} label="When" wide><Select id={`cp-e-${membershipId}`} name="effective" value="next_period" options={[{ value: 'next_period', label: 'At the next bill date' }, { value: 'now', label: 'Now (prorated)' }]} /></Field>
    </DrawerForm>
  )
}

export function OfflinePayment({ familyId, invoiceId, due }: { familyId: string; invoiceId: string; due: number }) {
  return (
    <DrawerForm trigger="Record payment" triggerVariant="flat" title="Record a payment received" description="Cash, cheque or bank transfer. Card payments are taken by the family online." action={recordOfflinePaymentAction} submitLabel="Record payment">
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field id={`op-a-${invoiceId}`} label="Amount"><Input id={`op-a-${invoiceId}`} name="amount" type="number" inputMode="decimal" min={0.01} step="0.01" defaultValue={(due / 100).toFixed(2)} required /></Field>
      <Field id={`op-m-${invoiceId}`} label="Method"><Select id={`op-m-${invoiceId}`} name="method" value="cash" options={[{ value: 'cash', label: 'Cash' }, { value: 'cheque', label: 'Cheque' }, { value: 'bank_transfer', label: 'Bank transfer' }]} /></Field>
      <Field id={`op-r-${invoiceId}`} label="Reference" wide><Input id={`op-r-${invoiceId}`} name="reference" maxLength={120} /></Field>
    </DrawerForm>
  )
}

export function RefundPayment({ familyId, paymentId, max }: { familyId: string; paymentId: string; max: number }) {
  return (
    <DrawerForm trigger="Refund" triggerVariant="flat" title="Refund a payment" description="Card payments go back to the card. Offline payments are recorded as refunded; pay the money back yourself." action={refundPaymentAction} submitLabel="Refund">
      <input type="hidden" name="familyId" value={familyId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <Field id={`rf-a-${paymentId}`} label="Amount"><Input id={`rf-a-${paymentId}`} name="amount" type="number" inputMode="decimal" min={0.01} max={(max / 100).toFixed(2)} step="0.01" defaultValue={(max / 100).toFixed(2)} required /></Field>
      <Field id={`rf-r-${paymentId}`} label="Reason" wide><Input id={`rf-r-${paymentId}`} name="reason" required maxLength={300} /></Field>
    </DrawerForm>
  )
}
