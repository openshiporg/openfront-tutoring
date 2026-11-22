'use client'
import { DrawerForm, Field } from '@/features/platform/lib/forms'
import { Input } from '@/components/ui/input'
import { completeTaskAction } from '../actions/tasks'
export function TaskForm({ id }: { id: string }) {
  return <DrawerForm trigger="Resolve" title="Resolve task" action={completeTaskAction}>
    <input type="hidden" name="taskId" value={id} /><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
    <Field id={`outcome-${id}`} label="Outcome note"><Input id={`outcome-${id}`} name="outcome" required /></Field>
    <label className="flex gap-2 text-sm"><input type="checkbox" name="dismiss" />Dismiss rather than complete</label>
  </DrawerForm>
}
