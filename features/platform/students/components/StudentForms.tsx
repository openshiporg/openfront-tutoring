'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DrawerForm, Field } from '@/features/platform/lib/forms'
import { Pill, Track, selectClass } from '@/features/platform/lib/ui'
import { homeworkStatusAction, proposePlanAction, sessionReportAction, setGoalStatusAction } from '../actions/students'

type Goal = { title: string; skill?: string; baseline?: string; target?: string }

function GoalRows({ initial }: { initial: Goal[] }) {
  const [rows, setRows] = useState<Goal[]>(initial.length ? initial : [{ title: '' }])
  return (
    <div className="grid gap-2 sm:col-span-2">
      <span className="text-sm font-medium">Goals</span>
      {rows.map((g, i) => (
        <div key={i} className="grid gap-2 rounded-[6px] border p-2 sm:grid-cols-2">
          <Input name="goalTitle" aria-label={`Goal ${i + 1}`} placeholder="Goal, e.g. Solve two-step linear equations" defaultValue={g.title} className="sm:col-span-2" />
          <Input name="goalSkill" aria-label="Skill" placeholder="Skill or strand" defaultValue={g.skill ?? ''} />
          <Input name="goalBaseline" aria-label="Baseline" placeholder="Where they are now" defaultValue={g.baseline ?? ''} />
          <Input name="goalTarget" aria-label="Target" placeholder="Target" defaultValue={g.target ?? ''} />
          <Pill size="sm" variant="flat" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>Remove goal</Pill>
        </div>
      ))}
      {rows.length < 20 ? <Track><Pill size="sm" onClick={() => setRows([...rows, { title: '' }])}>Add a goal</Pill></Track> : null}
    </div>
  )
}

/** New plan, or a revision of the current one (a new version is proposed to the family). */
export function PlanDrawer({ studentId, plan, programs, programId }: { studentId: string; plan?: any; programs: Array<{ id: string; name: string }>; programId?: string }) {
  const revising = plan && ['accepted', 'active'].includes(plan.status)
  return (
    <DrawerForm
      trigger={plan ? (revising ? 'Revise plan' : 'Edit and propose') : 'Draft a learning plan'}
      triggerVariant={plan ? 'raised' : 'primary'}
      title={plan ? (revising ? `Revise plan (becomes version ${plan.version + 1})` : 'Edit and propose plan') : 'Draft a learning plan'}
      description="The family is emailed and accepts or declines it in their account."
      action={proposePlanAction}
      submitLabel="Propose to family"
    >
      <input type="hidden" name="studentId" value={studentId} />
      {plan ? <input type="hidden" name="planId" value={plan.id} /> : null}
      <Field id="pl-prog" label="Programme" wide>
        <select id="pl-prog" name="programId" defaultValue={plan?.program?.id ?? programId ?? ''} className={selectClass} required>
          <option value="">Choose…</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field id="pl-sum" label="Summary for the family" wide><Textarea id="pl-sum" name="summary" rows={4} defaultValue={plan?.summary ?? ''} maxLength={4000} /></Field>
      <Field id="pl-spw" label="Sessions a week"><Input id="pl-spw" name="sessionsPerWeek" type="number" min={1} max={7} defaultValue={plan?.sessionsPerWeek ?? 2} required /></Field>
      <Field id="pl-th" label="Total hours"><Input id="pl-th" name="totalHours" type="number" min={1} max={1000} defaultValue={plan?.totalHours ?? ''} /></Field>
      <Field id="pl-sd" label="Start"><Input id="pl-sd" name="startDate" type="date" defaultValue={plan?.startDate ? String(plan.startDate).slice(0, 10) : ''} /></Field>
      <Field id="pl-td" label="Target date"><Input id="pl-td" name="targetDate" type="date" defaultValue={plan?.targetDate ? String(plan.targetDate).slice(0, 10) : ''} /></Field>
      <GoalRows initial={(plan?.goals ?? []).map((g: any) => ({ title: g.title, skill: g.skill, baseline: g.baseline, target: g.target }))} />
    </DrawerForm>
  )
}

const GOAL_STATES = [{ value: 'not_started', label: 'Not started' }, { value: 'in_progress', label: 'In progress' }, { value: 'mastered', label: 'Mastered' }]

export function GoalStatus({ studentId, goalId, status }: { studentId: string; goalId: string; status: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  return (
    <span className="inline-grid gap-1">
      <select aria-label="Goal status" className={`${selectClass} h-8 w-36`} defaultValue={status} disabled={pending} onChange={(e) => {
        const v = e.target.value; setError(null)
        start(async () => { const r = await setGoalStatusAction(studentId, goalId, v); if (!r.success) { setError(r.error); e.target.value = status } else router.refresh() })
      }}>
        {GOAL_STATES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
      </select>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </span>
  )
}

export function SessionReportDrawer({ studentId, bookingId, report, when }: { studentId: string; bookingId: string; report?: any; when: string }) {
  return (
    <DrawerForm trigger={report ? 'Edit report' : 'Write report'} triggerVariant="flat" title={`Session report, ${when}`} description="Published reports appear in the family’s account and are emailed to them." action={sessionReportAction} submitLabel="Save report">
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <Field id={`sr-t-${bookingId}`} label="What we covered" wide><Textarea id={`sr-t-${bookingId}`} name="topicsCovered" rows={3} required defaultValue={report?.topicsCovered ?? ''} /></Field>
      <Field id={`sr-w-${bookingId}`} label="Went well" wide><Textarea id={`sr-w-${bookingId}`} name="wentWell" rows={2} defaultValue={report?.wentWell ?? ''} /></Field>
      <Field id={`sr-i-${bookingId}`} label="To work on" wide><Textarea id={`sr-i-${bookingId}`} name="toImprove" rows={2} defaultValue={report?.toImprove ?? ''} /></Field>
      <Field id={`sr-h-${bookingId}`} label="Homework" wide><Textarea id={`sr-h-${bookingId}`} name="homework" rows={2} defaultValue={report?.homework ?? ''} /></Field>
      <Field id={`sr-hd-${bookingId}`} label="Homework due"><Input id={`sr-hd-${bookingId}`} name="homeworkDueAt" type="date" defaultValue={report?.homeworkDueAt ? String(report.homeworkDueAt).slice(0, 10) : ''} /></Field>
      <Field id={`sr-e-${bookingId}`} label="Effort (1–5)"><Input id={`sr-e-${bookingId}`} name="effort" type="number" min={1} max={5} defaultValue={report?.effort ?? ''} /></Field>
      <Field id={`sr-n-${bookingId}`} label="Note for staff only" wide><Textarea id={`sr-n-${bookingId}`} name="staffNote" rows={2} defaultValue={report?.staffNote ?? ''} /></Field>
      <Field id={`sr-p-${bookingId}`} label="Publish" wide><label className="flex items-center gap-2 text-sm"><input id={`sr-p-${bookingId}`} type="checkbox" name="publish" defaultChecked /> Send to the family now</label></Field>
    </DrawerForm>
  )
}

export function HomeworkStatus({ studentId, reportId, status }: { studentId: string; reportId: string; status: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const run = (v: string) => start(async () => { setError(null); const r = await homeworkStatusAction(studentId, reportId, v); if (!r.success) setError(r.error); else router.refresh() })
  return (
    <span className="inline-grid gap-1">
      <Track>
        {status !== 'done' ? <Pill size="sm" disabled={pending} onClick={() => run('done')}>Homework done</Pill> : null}
        {status !== 'not_done' ? <Pill size="sm" variant="flat" disabled={pending} onClick={() => run('not_done')}>Not done</Pill> : null}
      </Track>
      {error ? <span role="alert" className="text-xs text-destructive">{error}</span> : null}
    </span>
  )
}
