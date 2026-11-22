'use client'

import { Input } from '@/components/ui/input'
import { DrawerForm, Field, useFormAction } from '@/features/platform/lib/forms'
import { Notice, Pill, selectClass } from '@/features/platform/lib/ui'
import { markDayAttendance, reopenDayBooking, finishDayTask } from '../actions/today'

export function Attendance({ bookingId }: { bookingId: string }) {
  const { submit, pending, error } = useFormAction(markDayAttendance)
  return <form onSubmit={submit} className="grid gap-2">
    <input type="hidden" name="bookingId" value={bookingId} />
    <input type="hidden" name="idempotencyKey" value={`attendance:${bookingId}:${crypto.randomUUID()}`} />
    <div className="flex gap-2"><select name="outcome" aria-label="Attendance outcome" className={selectClass} defaultValue="attended">
      <option value="attended">Attended</option><option value="late">Late</option><option value="no_show">No show</option>
      <option value="cancelled_late">Late cancellation</option><option value="cancelled_late_excused">Excused late cancellation</option>
    </select><Pill type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Mark'}</Pill></div>
    {error ? <Notice tone="alert">{error}</Notice> : null}
  </form>
}
export function Reopen({ bookingId }: { bookingId: string }) {
  return <DrawerForm trigger="Reopen" title="Reopen attendance" action={reopenDayBooking} description="A reason is required. If pay is already approved, the command creates an adjustment rather than changing locked pay.">
    <input type="hidden" name="bookingId" value={bookingId} /><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
    <Field id={`reason-${bookingId}`} label="Reason"><Input id={`reason-${bookingId}`} name="reason" required /></Field>
  </DrawerForm>
}
export function FinishTask({ taskId }: { taskId: string }) {
  return <DrawerForm trigger="Complete" title="Complete task" action={finishDayTask}>
    <input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
    <Field id={`note-${taskId}`} label="Outcome note"><Input id={`note-${taskId}`} name="note" required /></Field>
  </DrawerForm>
}
