'use client'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DrawerForm, Field } from '@/features/platform/lib/forms'
import { selectClass } from '@/features/platform/lib/ui'
import { bookAssessmentAction, completeAssessmentAction, assessmentStateAction } from '../actions/assessments'
export function BookAssessment({ students, programs, tutors, locations }: { students: any[]; programs: any[]; tutors: any[]; locations: any[] }) {
  return <DrawerForm trigger="Book assessment / meeting" title="Book assessment or parent meeting" action={bookAssessmentAction}>
    <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
    <Field id="student" label="Student"><select id="student" name="student" required className={selectClass}>{students.filter(st => st.family).map(st => <option key={st.id} value={`${st.id}:${st.family.id}`}>{st.firstName} {st.lastName} · {st.family.name}</option>)}</select></Field>
    {([['programId','Programme',programs,'name'],['tutorId','Assessor',tutors,'displayName'],['locationId','Location',locations,'name']] as const).map(([key,label,rows,field]) => <Field key={key} id={key} label={label}><select id={key} name={key} className={selectClass}>{rows.map(row => <option key={row.id} value={row.id}>{row[field]}</option>)}</select></Field>)}
    <Field id="startsAt" label="Start (UTC)"><Input id="startsAt" name="startsAt" required placeholder="2026-12-01T16:00:00Z" /></Field>
    <Field id="mode" label="Mode"><select id="mode" name="mode" className={selectClass}>{['in_centre','online','in_home'].map(m => <option key={m}>{m}</option>)}</select></Field>
    <Field id="kind" label="Kind"><select id="kind" name="kind" className={selectClass}>{['initial','re_assessment','parent_meeting'].map(m => <option key={m}>{m}</option>)}</select></Field>
    <label className="text-sm"><input type="checkbox" name="waiveFee" /> Waive fee (staff authority required)</label>
  </DrawerForm>
}
export function CompleteAssessment({ id }: { id: string }) {
  return <DrawerForm trigger="Complete with results" title="Complete assessment" action={completeAssessmentAction}>
    <input type="hidden" name="assessmentId" value={id} /><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
    <Field id={`summary-${id}`} label="Summary"><Textarea id={`summary-${id}`} name="summary" /></Field>
    <Field id={`recommendation-${id}`} label="Recommendation"><Textarea id={`recommendation-${id}`} name="recommendation" /></Field>
    <Field id={`results-${id}`} label="Results" hint={'JSON array: [{"skill":"Fractions","score":7,"maxScore":10}]'}><Textarea id={`results-${id}`} name="results" defaultValue="[]" /></Field>
  </DrawerForm>
}
export function AssessmentState({ id, operation, label }: { id: string; operation: string; label: string }) {
  return <DrawerForm trigger={label} title={label} action={assessmentStateAction}><input type="hidden" name="assessmentId" value={id} /><input type="hidden" name="operation" value={operation} /><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} /></DrawerForm>
}
