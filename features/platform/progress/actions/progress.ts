'use server'

import { revalidatePath } from 'next/cache'
import { command, gql, key, s } from '@/features/platform/families/lib/gql'

const M = 'mutation'
const refresh = (id?: string | null) => { revalidatePath('/dashboard/platform/progress'); if (id) revalidatePath(`/dashboard/platform/progress/${id}`) }
const REPORT = `id status periodStart periodEnd sessionsAttended sessionsMissed narrative nextSteps goalsSnapshot withdrawReason publishedAt acknowledgedAt createdAt
  student { id firstName lastName family { id name primaryLocation { timezone } } }
  enrollment { id program { name } tutor { displayName } }
  author { name } authorTutor { displayName }`

export async function listProgress(input: { status: string; studentId: string }) {
  const AND: any[] = []
  if (input.status) AND.push({ status: { equals: input.status } })
  if (input.studentId) AND.push({ student: { id: { equals: input.studentId } } })
  return gql<{ progressReports: any[]; counts: any[]; enrollments: any[] }>(`
    query($where: ProgressReportWhereInput!) {
      progressReports(where: $where, orderBy: [{ periodEnd: desc }], take: 200) { ${REPORT} }
      counts: progressReports(take: 1000) { status }
      enrollments(where: { status: { equals: "active" } }, orderBy: [{ startDate: asc }], take: 300) {
        id student { id firstName lastName } program { name } tutor { displayName }
      }
    }`, { where: { AND } })
}

export async function getProgress(id: string) {
  return gql<{ progressReport: any }>(`query($id: ID!) { progressReport(where: { id: $id }) { ${REPORT} } }`, { id })
}

/** Open (or reuse) the draft for an enrolment's next period; figures and goals are filled from its sessions. */
export async function draftProgressAction(form: FormData) {
  const r = await command(`${M}($e: ID!, $k: String) { draftProgressReport(enrollmentId: $e, idempotencyKey: $k) { success error id } }`, { e: s(form, 'enrollmentId'), k: key(form) }, 'draftProgressReport')
  if (r.success) refresh(r.id)
  return { success: r.success, error: r.error, id: r.id ?? null }
}

/** Publishing saves the edited narrative and next steps, then emails the family. */
export async function publishProgressAction(form: FormData) {
  const id = s(form, 'reportId')
  const r = await command(`${M}($r: ID!, $d: JSON, $k: String) { publishProgressReport(reportId: $r, data: $d, idempotencyKey: $k) { success error id } }`,
    { r: id, d: { narrative: s(form, 'narrative'), nextSteps: s(form, 'nextSteps') }, k: key(form) }, 'publishProgressReport')
  if (r.success) refresh(id)
  return { success: r.success, error: r.error }
}

export async function withdrawProgressAction(form: FormData) {
  const id = s(form, 'reportId')
  const r = await command(`${M}($r: ID!, $why: String!, $k: String) { withdrawProgressReport(reportId: $r, reason: $why, idempotencyKey: $k) { success error id } }`, { r: id, why: s(form, 'reason'), k: key(form) }, 'withdrawProgressReport')
  if (r.success) refresh(id)
  return { success: r.success, error: r.error }
}
