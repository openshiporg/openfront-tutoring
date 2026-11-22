'use server'

import { revalidatePath } from 'next/cache'
import { command, gql, key, s } from '@/features/platform/families/lib/gql'

const M = 'mutation'
const refresh = (id?: string | null) => { revalidatePath('/dashboard/platform/applications'); if (id) revalidatePath(`/dashboard/platform/applications/${id}`) }

export async function listApplications(input: { q: string; status: string }) {
  const AND: any[] = []
  if (input.q) AND.push({ OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { email: { contains: input.q, mode: 'insensitive' } }, { subjectsText: { contains: input.q, mode: 'insensitive' } }] })
  if (input.status) AND.push({ status: { equals: input.status } })
  return gql<{ tutorApplications: any[]; counts: any[]; subjects: any[] }>(`
    query($where: TutorApplicationWhereInput!) {
      tutorApplications(where: $where, orderBy: [{ createdAt: desc }], take: 200) {
        id name email phone status source subjectsText modes createdAt
        subjects { id name } reviewer { name } tutor { id }
      }
      counts: tutorApplications(take: 500) { status }
      subjects(orderBy: [{ name: asc }]) { id name }
    }`, { where: { AND } })
}

export async function getApplication(id: string) {
  return gql<{ tutorApplication: any; locations: any[] }>(`
    query($id: ID!) {
      tutorApplication(where: { id: $id }) {
        id name email phone status source subjectsText levels modes areas availability references coverNote notes createdAt updatedAt
        cv { filename url }
        subjects { id name } reviewer { name } tutor { id displayName }
      }
      locations(orderBy: [{ name: asc }]) { id name }
    }`, { id })
}

export async function createApplicationAction(form: FormData) {
  const refs = form.getAll('refName').map((n, i) => ({ name: String(n).trim(), contact: String(form.getAll('refContact')[i] ?? '').trim(), relation: String(form.getAll('refRelation')[i] ?? '').trim() })).filter((r) => r.name)
  const data = {
    name: s(form, 'name'), email: s(form, 'email'), phone: s(form, 'phone'), subjectsText: s(form, 'subjectsText'), levels: s(form, 'levels'),
    modes: form.getAll('modes').map(String), areas: s(form, 'areas'), availability: s(form, 'availability') ? { note: s(form, 'availability') } : null,
    coverNote: s(form, 'coverNote'), source: s(form, 'source') || 'email', notes: s(form, 'notes'), subjectIds: form.getAll('subjectIds').map(String), references: refs,
  }
  const r = await command(`${M}($d: JSON!, $k: String) { createTutorApplication(data: $d, idempotencyKey: $k) { success error id } }`, { d: data, k: key(form) }, 'createTutorApplication')
  if (r.success) refresh(r.id)
  return { success: r.success, error: r.error, id: r.id ?? null }
}

export async function moveApplicationAction(form: FormData) {
  const id = s(form, 'applicationId')
  const r = await command(`${M}($a: ID!, $s: String!, $n: String, $k: String) { transitionApplication(applicationId: $a, status: $s, note: $n, idempotencyKey: $k) { success error id } }`,
    { a: id, s: s(form, 'status'), n: s(form, 'note'), k: key(form) }, 'transitionApplication')
  if (r.success) refresh(id)
  return { success: r.success, error: r.error }
}

export async function approveApplicationAction(form: FormData) {
  const id = s(form, 'applicationId')
  const data = {
    defaultPayRate: s(form, 'defaultPayRate') ? Math.round(Number(s(form, 'defaultPayRate')) * 100) : 0,
    employmentType: s(form, 'employmentType') || 'contractor',
    locationIds: form.getAll('locationIds').map(String),
  }
  const r = await command(`${M}($a: ID!, $d: JSON, $k: String) { approveApplication(applicationId: $a, data: $d, idempotencyKey: $k) { success error id data } }`, { a: id, d: data, k: key(form) }, 'approveApplication')
  if (r.success) { refresh(id); revalidatePath('/dashboard/platform/tutors') }
  return { success: r.success, error: r.error, id: r.id ?? null }
}
