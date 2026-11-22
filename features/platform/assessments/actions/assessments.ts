'use server'
import { revalidatePath } from 'next/cache'
import { command, gql, s } from '@/features/platform/families/lib/gql'
export async function getAssessments() {
  return gql<{ assessments: any[]; students: any[]; programs: any[]; tutors: any[]; locations: any[] }>(`query {
    assessments(orderBy: [{ scheduledAt: desc }], take: 200) { id status scheduledAt kind mode summary student { id firstName lastName } family { id name } program { name } assessor { displayName } results { skill score maxScore } }
    students(take: 200) { id firstName lastName family { id name } }
    programs(where: { status: { equals: "active" } }, take: 100) { id name }
    tutors(where: { status: { equals: "active" } }, take: 100) { id displayName }
    locations(where: { status: { equals: "active" } }, take: 100) { id name }
  }`)
}
export async function bookAssessmentAction(form: FormData) {
  const at = new Date(s(form, 'startsAt'))
  if (Number.isNaN(at.getTime())) return { success: false, error: 'Choose a valid date and time.' }
  const [studentId, familyId] = s(form, 'student').split(':')
  const r = await command(`mutation($f: ID!, $s: ID!, $p: ID!, $m: String!, $l: ID, $at: String!, $t: ID!, $kind: String, $waive: Boolean, $k: String) { staffBookAssessment(familyId: $f, studentId: $s, programId: $p, mode: $m, locationId: $l, startsAt: $at, tutorId: $t, kind: $kind, waiveFee: $waive, idempotencyKey: $k) { success error id data } }`, { f: familyId, s: studentId, p: s(form, 'programId'), m: s(form, 'mode'), l: s(form, 'locationId') || null, at: at.toISOString(), t: s(form, 'tutorId'), kind: s(form, 'kind'), waive: form.get('waiveFee') === 'on', k: s(form, 'idempotencyKey') }, 'staffBookAssessment')
  if (r.success) revalidatePath('/dashboard/platform/assessments')
  return r
}
export async function completeAssessmentAction(form: FormData) {
  let results: unknown
  try { results = JSON.parse(s(form, 'results') || '[]') } catch { return { success: false, error: 'Results must be a JSON array.' } }
  const r = await command(`mutation($id: ID!, $s: String, $r: String, $results: JSON, $k: String) { completeAssessment(assessmentId: $id, summary: $s, recommendation: $r, results: $results, idempotencyKey: $k) { success error id data } }`, { id: s(form, 'assessmentId'), s: s(form, 'summary'), r: s(form, 'recommendation'), results, k: s(form, 'idempotencyKey') }, 'completeAssessment')
  if (r.success) revalidatePath('/dashboard/platform/assessments')
  return r
}
export async function assessmentStateAction(form: FormData) {
  const op = s(form, 'operation')
  if (!['startAssessment','markAssessmentNoShow','cancelAssessment'].includes(op)) return { success: false, error: 'Unknown action.' }
  const r = await command(`mutation($id: ID!, $k: String) { ${op}(assessmentId: $id, idempotencyKey: $k) { success error id data } }`, { id: s(form, 'assessmentId'), k: s(form, 'idempotencyKey') }, op)
  if (r.success) revalidatePath('/dashboard/platform/assessments')
  return r
}
