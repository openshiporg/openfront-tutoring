'use server'

import { revalidatePath } from 'next/cache'
import { command, gql, s } from '@/features/platform/families/lib/gql'

export async function getDaySheet(day: string, locationId: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : new Date().toISOString().slice(0, 10)
  const from = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(from.getTime())) return { ok: false as const, error: 'Choose a valid date.' }
  const to = new Date(from.getTime() + 86400_000)
  return gql<{ sessions: any[]; tasks: any[]; memberships: any[]; locations: any[]; authenticatedItem: any }>(`
    query($where: SessionWhereInput!, $tasks: TaskWhereInput!, $memberships: MembershipWhereInput!) {
      authenticatedItem { ... on User { id role { canManagePayroll canManageSettings isTutor } } }
      locations(where: { status: { equals: "active" } }, orderBy: [{ name: asc }], take: 100) { id name timezone }
      sessions(where: $where, orderBy: [{ startsAt: asc }], take: 300) {
        id startsAt endsAt status mode capacity
        program { name } location { id name timezone } room { name } tutor { displayName }
        bookings(orderBy: [{ createdAt: asc }], take: 100) {
          id status student { id firstName lastName medicalNotes learningNotes } family { id name }
        }
      }
      tasks(where: $tasks, orderBy: [{ dueAt: asc }], take: 100) { id title kind dueAt status family { id name } student { firstName lastName } }
      memberships(where: $memberships, take: 100) { id pastDueSince student { firstName lastName } family { id name } plan { name } }
    }`, {
    where: { startsAt: { gte: from.toISOString(), lt: to.toISOString() }, ...(locationId ? { location: { id: { equals: locationId } } } : {}) },
    tasks: { status: { equals: 'open' }, dueAt: { lte: to.toISOString() }, ...(locationId ? { family: { primaryLocation: { id: { equals: locationId } } } } : {}) },
    memberships: { status: { equals: 'past_due' }, ...(locationId ? { family: { primaryLocation: { id: { equals: locationId } } } } : {}) },
  })
}

export async function markDayAttendance(form: FormData) {
  const r = await command(`mutation($b: ID!, $o: String!, $k: String) { markAttendance(bookingId: $b, outcome: $o, idempotencyKey: $k) { success error id data } }`, { b: s(form, 'bookingId'), o: s(form, 'outcome'), k: s(form, 'idempotencyKey') }, 'markAttendance')
  if (r.success) revalidatePath('/dashboard/platform/today')
  return r
}
export async function reopenDayBooking(form: FormData) {
  const r = await command(`mutation($b: ID!, $r: String!, $k: String) { reopenBooking(bookingId: $b, reason: $r, idempotencyKey: $k) { success error id data } }`, { b: s(form, 'bookingId'), r: s(form, 'reason'), k: s(form, 'idempotencyKey') }, 'reopenBooking')
  if (r.success) revalidatePath('/dashboard/platform/today')
  return r
}
export async function finishDayTask(form: FormData) {
  const r = await command(`mutation($id: ID!, $n: String!, $k: String) { completeTask(taskId: $id, outcome: $n, idempotencyKey: $k) { success error id data } }`, { id: s(form, 'taskId'), n: s(form, 'note'), k: s(form, 'idempotencyKey') }, 'completeTask')
  if (r.success) revalidatePath('/dashboard/platform/today')
  return r
}
