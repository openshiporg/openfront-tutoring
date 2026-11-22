'use server'
import { revalidatePath } from 'next/cache'
import { gql, command, s } from '@/features/platform/families/lib/gql'
export async function getTasks(status: string, kind: string) {
  return gql<{ tasks: any[] }>(`query($w: TaskWhereInput!) { tasks(where: $w, orderBy: [{ dueAt: asc }], take: 200) { id title kind status dueAt outcomeNote family { id name } student { firstName lastName } owner { name } } }`, { w: { ...(status ? { status: { equals: status } } : {}), ...(kind ? { kind: { equals: kind } } : {}) } })
}
export async function completeTaskAction(form: FormData) {
  const r = await command(`mutation($id: ID!, $outcome: String!, $dismiss: Boolean, $key: String) { completeTask(taskId: $id, outcome: $outcome, dismiss: $dismiss, idempotencyKey: $key) { success error id data } }`, { id: s(form, 'taskId'), outcome: s(form, 'outcome'), dismiss: form.get('dismiss') === 'on', key: s(form, 'idempotencyKey') }, 'completeTask')
  if (r.success) { revalidatePath('/dashboard/platform/tasks'); revalidatePath('/dashboard/platform/today') }
  return r
}
