'use client'
import { Input } from '@/components/ui/input'
import { DrawerForm, Field } from '@/features/platform/lib/forms'
import { selectClass } from '@/features/platform/lib/ui'
import { createLeadAction, moveLeadAction, followUpAction } from '../actions/leads'
export function CreateLead({ locations }: { locations: any[] }) {
  return <DrawerForm trigger="Add lead" title="Add lead" action={createLeadAction}>
    {['guardianName','email','phone','studentName','message'].map(k => <Field key={k} id={k} label={k.replace(/([A-Z])/g,' $1')}><Input id={k} name={k} required={k === 'guardianName'} type={k === 'email' ? 'email' : 'text'} /></Field>)}
    <Field id="locationId" label="Location"><select id="locationId" name="locationId" className={selectClass}><option value="">Unassigned</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
  </DrawerForm>
}
export function MoveLead({ id }: { id: string }) {
  return <DrawerForm trigger="Move stage" title="Move lead" description="The command enforces valid stage transitions. Lost leads require a reason." action={moveLeadAction}>
    <input type="hidden" name="leadId" value={id} /><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
    <Field id={`to-${id}`} label="Stage"><select id={`to-${id}`} name="to" className={selectClass}>{['new','contacted','assessment_booked','assessed','proposal_sent','enrolled','lost'].map(s => <option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></Field>
    <Field id={`reason-${id}`} label="Reason"><Input id={`reason-${id}`} name="reason" /></Field>
  </DrawerForm>
}
export function FollowUp({ id, users }: { id: string; users: any[] }) {
  return <DrawerForm trigger="Follow up" title="Set follow-up" action={followUpAction}>
    <input type="hidden" name="leadId" value={id} />
    <Field id={`date-${id}`} label="Follow-up date"><Input id={`date-${id}`} name="nextFollowUpAt" type="date" /></Field>
    <Field id={`owner-${id}`} label="Owner"><select id={`owner-${id}`} name="ownerId" className={selectClass}><option value="">Keep current owner</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
  </DrawerForm>
}
