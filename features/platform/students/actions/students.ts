'use server'

import { revalidatePath } from 'next/cache'
import { command, gql, key, s } from '@/features/platform/families/lib/gql'

const M = 'mutation'

export async function listStudents(input: { q: string; status: string; page: number }) {
  const take = 40
  const AND: any[] = []
  if (input.q) AND.push({ OR: [{ firstName: { contains: input.q, mode: 'insensitive' } }, { lastName: { contains: input.q, mode: 'insensitive' } }, { school: { contains: input.q, mode: 'insensitive' } }, { family: { name: { contains: input.q, mode: 'insensitive' } } }] })
  if (input.status) AND.push({ status: { equals: input.status } })
  const where = { AND }
  return gql<{ students: any[]; studentsCount: number; counts: any }>(`
    query($where: StudentWhereInput!, $take: Int, $skip: Int!) {
      students(where: $where, take: $take, skip: $skip, orderBy: [{ firstName: asc }, { lastName: asc }]) {
        id firstName lastName status school
        level { name }
        family { id name primaryLocation { name } }
        enrolments(where: { status: { in: ["pending_match", "matched", "active", "paused"] } }) { id status program { name } tutor { displayName } }
        plans(where: { status: { in: ["proposed", "accepted", "active"] } }, take: 1, orderBy: [{ version: desc }]) { id status }
      }
      studentsCount(where: $where)
    }`, { where, take, skip: (input.page - 1) * take })
}

export async function getStudent(id: string) {
  return gql<{ student: any; progressReports: any[]; programs: Array<{ id: string; name: string }>; levels: Array<{ id: string; name: string }> }>(`
    query($id: ID!) {
      student(where: { id: $id }) {
        id firstName lastName status school dateOfBirth learningNotes medicalNotes pickupPeople
        level { id name }
        family { id name primaryLocation { id name timezone } }
        enrolments(orderBy: [{ createdAt: desc }]) {
          id status mode startDate rematchCount trialAttendedAt
          program { id name } location { name } tutor { id displayName }
          plan { id }
        }
        plans(orderBy: [{ version: desc }]) {
          id version status summary sessionsPerWeek totalHours startDate targetDate proposedAt acceptedAt declineReason
          program { id name } subject { name }
          goals(orderBy: [{ sortOrder: asc }]) { id title skill baseline target status masteredAt }
        }
        assessments(orderBy: [{ scheduledAt: desc }]) {
          id kind status scheduledAt completedAt summary recommendation
          program { name }
          results { id skill strand score maxScore percent levelEquivalent }
        }
        bookings(orderBy: [{ startsAt: desc }], take: 60) {
          id status startsAt minutes
          session { id program { name } tutor { displayName } isTrial }
          reports { id topicsCovered wentWell toImprove homework homeworkDueAt homeworkStatus effort staffNote publishedAt guardianSeenAt tutor { displayName } }
        }
      }
      progressReports(where: { student: { id: { equals: $id } } }, orderBy: [{ periodEnd: desc }]) {
        id status periodStart periodEnd sessionsAttended sessionsMissed publishedAt acknowledgedAt
      }
      programs(orderBy: [{ name: asc }]) { id name }
      levels(orderBy: [{ sortOrder: asc }, { name: asc }]) { id name }
    }`, { id })
}

const done = (r: { success: boolean; error: string | null; id?: string | null }, studentId: string) => {
  if (r.success) revalidatePath(`/dashboard/platform/students/${studentId}`)
  return { success: r.success, error: r.error, id: r.id ?? null }
}

/** Draft-and-propose or revise a learning plan with its goals (§4.3). */
export async function proposePlanAction(form: FormData) {
  const studentId = s(form, 'studentId')
  const planId = s(form, 'planId') || null
  const titles = form.getAll('goalTitle').map(String)
  const skills = form.getAll('goalSkill').map(String)
  const base = form.getAll('goalBaseline').map(String)
  const target = form.getAll('goalTarget').map(String)
  const goals = titles.map((t, i) => ({ title: t.trim(), skill: (skills[i] ?? '').trim(), baseline: (base[i] ?? '').trim(), target: (target[i] ?? '').trim() })).filter((g) => g.title)
  const data: Record<string, unknown> = {
    studentId, goals, summary: s(form, 'summary'), programId: s(form, 'programId') || null,
    sessionsPerWeek: Number(s(form, 'sessionsPerWeek') || 1),
  }
  if (s(form, 'totalHours')) data.totalHours = Number(s(form, 'totalHours'))
  if (s(form, 'startDate')) data.startDate = s(form, 'startDate')
  if (s(form, 'targetDate')) data.targetDate = s(form, 'targetDate')
  const r = await command(`${M}($p: ID, $d: JSON, $k: String) { proposeLearningPlan(planId: $p, data: $d, idempotencyKey: $k) { success error id } }`, { p: planId, d: data, k: key(form) }, 'proposeLearningPlan')
  return done(r, studentId)
}

export async function setGoalStatusAction(studentId: string, goalId: string, status: string) {
  const r = await command(`${M}($g: ID!, $s: String!, $k: String) { setGoalStatus(goalId: $g, status: $s, idempotencyKey: $k) { success error id } }`, { g: goalId, s: status, k: crypto.randomUUID() }, 'setGoalStatus')
  return done(r, studentId)
}

/** Write (and by default publish) the report for an attended booking. */
export async function sessionReportAction(form: FormData) {
  const studentId = s(form, 'studentId')
  const data: Record<string, unknown> = {
    topicsCovered: s(form, 'topicsCovered'), wentWell: s(form, 'wentWell'), toImprove: s(form, 'toImprove'),
    homework: s(form, 'homework'), homeworkDueAt: s(form, 'homeworkDueAt') || null, effort: s(form, 'effort') || null,
    staffNote: s(form, 'staffNote'), publish: form.get('publish') === 'on',
  }
  const r = await command(`${M}($b: ID!, $d: JSON!, $k: String) { publishSessionReport(bookingId: $b, data: $d, idempotencyKey: $k) { success error id } }`, { b: s(form, 'bookingId'), d: data, k: key(form) }, 'publishSessionReport')
  return done(r, studentId)
}

export async function homeworkStatusAction(studentId: string, reportId: string, status: string) {
  const r = await command(`${M}($r: ID!, $s: String!) { setHomeworkStatus(reportId: $r, status: $s) { success error id } }`, { r: reportId, s: status }, 'setHomeworkStatus')
  return done(r, studentId)
}
