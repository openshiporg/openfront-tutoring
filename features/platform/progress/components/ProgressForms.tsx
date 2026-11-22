'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Textarea } from '@/components/ui/textarea'
import { DrawerForm, Field, useFormAction } from '@/features/platform/lib/forms'
import { Notice, Pill, Track, selectClass } from '@/features/platform/lib/ui'
import { draftProgressAction, publishProgressAction, withdrawProgressAction } from '../actions/progress'

const Key = () => <input type="hidden" name="idempotencyKey" value={useState(() => crypto.randomUUID())[0]} />

export function DraftProgress({ enrollments, studentId }: { enrollments: any[]; studentId?: string }) {
  const router = useRouter()
  const list = studentId ? enrollments.filter((e) => e.student?.id === studentId) : enrollments
  return (
    <DrawerForm trigger="Draft a report" triggerVariant="primary" title="Draft a progress report" description="Covers the time since the last report. Attendance and goals are filled in from the sessions; you write the narrative." submitLabel="Open draft"
      action={async (form) => { const r = await draftProgressAction(form); if (r.success && r.id) router.push(`/dashboard/platform/progress/${r.id}`); return r }}>
      <Key />
      <Field id="dp-e" label="Enrolment" wide>
        <select id="dp-e" name="enrollmentId" className={selectClass} required defaultValue="">
          <option value="">Choose…</option>
          {list.map((e) => <option key={e.id} value={e.id}>{e.student?.firstName} {e.student?.lastName} · {e.program?.name}{e.tutor ? ` · ${e.tutor.displayName}` : ''}</option>)}
        </select>
      </Field>
      {!list.length ? <p className="text-sm text-muted-foreground sm:col-span-2">No active enrolments{studentId ? ' for this student' : ''}.</p> : null}
    </DrawerForm>
  )
}

/** The draft editor: the text is saved when it is published. */
export function PublishProgress({ report }: { report: any }) {
  const { submit, pending, error } = useFormAction(publishProgressAction)
  return (
    <form onSubmit={submit} className="grid gap-4">
      <Key />
      <input type="hidden" name="reportId" value={report.id} />
      <Field id="pp-n" label="Narrative for the family" wide><Textarea id="pp-n" name="narrative" rows={10} required maxLength={8000} defaultValue={report.narrative ?? ''} /></Field>
      <Field id="pp-x" label="Next steps" wide><Textarea id="pp-x" name="nextSteps" rows={4} maxLength={4000} defaultValue={report.nextSteps ?? ''} /></Field>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      <Track><Pill type="submit" variant="primary" disabled={pending}>{pending ? 'Publishing…' : 'Publish and email the family'}</Pill></Track>
    </form>
  )
}

export function WithdrawProgress({ reportId }: { reportId: string }) {
  return (
    <DrawerForm trigger="Withdraw" triggerVariant="flat" title="Withdraw this report" description="It disappears from the family’s account. Draft a corrected one afterwards." action={withdrawProgressAction} submitLabel="Withdraw report">
      <Key />
      <input type="hidden" name="reportId" value={reportId} />
      <Field id="wp-r" label="Reason" wide><Textarea id="wp-r" name="reason" rows={3} required maxLength={500} /></Field>
    </DrawerForm>
  )
}
