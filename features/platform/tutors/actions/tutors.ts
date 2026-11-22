'use server'

import { revalidatePath } from 'next/cache'
import { command, gql, key, s } from '@/features/platform/families/lib/gql'

const path = (id: string) => `/dashboard/platform/tutors/${id}`
const done = (r: { success: boolean; error: string | null; id?: string | null }, tutorId: string) => {
  if (r.success) { revalidatePath(path(tutorId)); revalidatePath('/dashboard/platform/tutors') }
  return { success: r.success, error: r.error, id: r.id ?? null }
}

export async function listTutors(input: { q: string; status: string; locationId: string }) {
  const AND: any[] = []
  if (input.q) AND.push({ OR: [{ displayName: { contains: input.q, mode: 'insensitive' } }, { travelAreas: { contains: input.q, mode: 'insensitive' } }, { subjects: { some: { subject: { name: { contains: input.q, mode: 'insensitive' } } } } }] })
  if (input.status) AND.push({ status: { equals: input.status } })
  if (input.locationId) AND.push({ locations: { some: { id: { equals: input.locationId } } } })
  return gql<{ tutors: any[]; locations: Array<{ id: string; name: string }> }>(`
    query($where: TutorWhereInput!) {
      tutors(where: $where, orderBy: [{ displayName: asc }], take: 200) {
        id displayName status employmentType deliveryModes publicProfile averageRating headline
        locations { id name }
        subjects { id subject { name } }
        user { id email }
      }
      locations(orderBy: [{ name: asc }]) { id name }
    }`, { where: { AND } })
}

export async function getTutor(id: string) {
  return gql<{ tutor: any; subjects: any[]; levels: any[]; locations: any[]; sessions: any[]; enrollments: any[] }>(`
    query($id: ID!, $now: DateTime!) {
      tutor(where: { id: $id }) {
        id displayName slug headline bio education yearsExperience employmentType deliveryModes travelAreas travelRadiusKm meetingUrl
        photoUrl photo { url } status publicProfile averageRating defaultPayRate
        user { id name email phone lastLoginAt }
        homeLocation { id name }
        locations { id name timezone }
        subjects { id payRate subject { id name } levelFrom { id name } levelTo { id name } }
        availability(orderBy: [{ weekday: asc }, { startMinute: asc }]) { id weekday startMinute endMinute mode location { id name } effectiveFrom effectiveTo }
        timeOff(orderBy: [{ startsAt: desc }], take: 30) { id startsAt endsAt reason status }
        credentials(orderBy: [{ createdAt: desc }]) { id kind reference issuedAt expiresAt status verifiedAt document { filename url } }
        application { id }
      }
      subjects(orderBy: [{ name: asc }]) { id name }
      levels(orderBy: [{ sortOrder: asc }, { name: asc }]) { id name }
      locations(orderBy: [{ name: asc }]) { id name }
      sessions(where: { tutor: { id: { equals: $id } }, startsAt: { gte: $now }, status: { in: ["scheduled", "needs_cover"] } }, orderBy: [{ startsAt: asc }], take: 15) {
        id startsAt endsAt status mode program { name } location { name } bookedCount capacity
      }
      enrollments(where: { tutor: { id: { equals: $id } }, status: { in: ["matched", "active", "paused"] } }, take: 100) {
        id status student { id firstName lastName } program { name }
      }
    }`, { id, now: new Date().toISOString() })
}

const M = 'mutation'

/** Profile fields are plain list fields (write needs canManageTutors). Status is moved only by setTutorStatus. */
export async function updateTutorAction(form: FormData) {
  const id = s(form, 'tutorId')
  const modes = form.getAll('deliveryModes').map(String)
  const data: Record<string, unknown> = {
    displayName: s(form, 'displayName'), headline: s(form, 'headline'), bio: s(form, 'bio'), education: s(form, 'education'),
    yearsExperience: Number(s(form, 'yearsExperience') || 0), employmentType: s(form, 'employmentType') || 'contractor',
    deliveryModes: modes, travelAreas: s(form, 'travelAreas'), meetingUrl: s(form, 'meetingUrl'), photoUrl: s(form, 'photoUrl'),
    publicProfile: form.get('publicProfile') === 'on',
    locations: { set: form.getAll('locationIds').map((l) => ({ id: String(l) })) },
  }
  if (s(form, 'travelRadiusKm')) data.travelRadiusKm = Number(s(form, 'travelRadiusKm')); else data.travelRadiusKm = null
  if (form.has('defaultPayRate')) data.defaultPayRate = Math.round(Number(s(form, 'defaultPayRate') || 0) * 100)
  if (!data.displayName) return { success: false, error: 'Enter the name families see.', id: null }
  if (!modes.length) return { success: false, error: 'Pick at least one way this tutor teaches.', id: null }
  const r = await gql<{ updateTutor: { id: string } | null }>(`${M}($id: ID!, $d: TutorUpdateInput!) { updateTutor(where: { id: $id }, data: $d) { id } }`, { id, d: data })
  return done(r.ok ? { success: !!r.data.updateTutor, error: r.data.updateTutor ? null : 'This could not be saved.' } : { success: false, error: r.error }, id)
}

export async function setTutorStatusAction(form: FormData) {
  const id = s(form, 'tutorId')
  const r = await command(`${M}($t: ID!, $s: String!, $r: String, $c: Boolean, $k: String) { setTutorStatus(tutorId: $t, status: $s, reason: $r, coverSessions: $c, idempotencyKey: $k) { success error id } }`,
    { t: id, s: s(form, 'status'), r: s(form, 'reason'), c: form.get('coverSessions') === 'on', k: key(form) }, 'setTutorStatus')
  return done(r, id)
}

export async function addSubjectAction(form: FormData) {
  const id = s(form, 'tutorId')
  const d: Record<string, unknown> = { tutor: { connect: { id } }, subject: { connect: { id: s(form, 'subjectId') } } }
  if (s(form, 'levelFrom')) d.levelFrom = { connect: { id: s(form, 'levelFrom') } }
  if (s(form, 'levelTo')) d.levelTo = { connect: { id: s(form, 'levelTo') } }
  if (s(form, 'payRate')) d.payRate = Math.round(Number(s(form, 'payRate')) * 100)
  if (!s(form, 'subjectId')) return { success: false, error: 'Pick a subject.', id: null }
  const r = await gql<{ createTutorSubject: { id: string } | null }>(`${M}($d: TutorSubjectCreateInput!) { createTutorSubject(data: $d) { id } }`, { d })
  return done(r.ok ? { success: true, error: null } : { success: false, error: /unique/i.test(r.error) ? 'This tutor already teaches that subject.' : r.error }, id)
}

export async function removeSubjectAction(tutorId: string, rowId: string) {
  const r = await gql(`${M}($id: ID!) { deleteTutorSubject(where: { id: $id }) { id } }`, { id: rowId })
  return done(r.ok ? { success: true, error: null } : { success: false, error: r.error }, tutorId)
}

const toMinute = (v: string) => { const [h, m] = v.split(':').map(Number); return h * 60 + (m || 0) }

export async function addAvailabilityAction(form: FormData) {
  const id = s(form, 'tutorId')
  const start = toMinute(s(form, 'start')), end = toMinute(s(form, 'end'))
  if (!(end > start)) return { success: false, error: 'The end time must be after the start.', id: null }
  const days = form.getAll('weekday').map(Number)
  if (!days.length) return { success: false, error: 'Pick at least one day.', id: null }
  const loc = s(form, 'locationId')
  const mode = s(form, 'mode') || 'in_centre'
  if (mode === 'in_centre' && !loc) return { success: false, error: 'Pick the centre for in-centre hours.', id: null }
  const data = days.map((weekday) => ({ tutor: { connect: { id } }, weekday, startMinute: start, endMinute: end, mode, ...(loc ? { location: { connect: { id: loc } } } : {}) }))
  const r = await gql(`${M}($d: [TutorAvailabilityCreateInput!]!) { createTutorAvailabilities(data: $d) { id } }`, { d: data })
  return done(r.ok ? { success: true, error: null } : { success: false, error: r.error }, id)
}

export async function removeAvailabilityAction(tutorId: string, rowId: string) {
  const r = await gql(`${M}($id: ID!) { deleteTutorAvailability(where: { id: $id }) { id } }`, { id: rowId })
  return done(r.ok ? { success: true, error: null } : { success: false, error: r.error }, tutorId)
}

/** Staff record a credential they have seen (reference number, dates), then verify it. */
export async function addCredentialAction(form: FormData) {
  const id = s(form, 'tutorId')
  const d: Record<string, unknown> = { tutor: { connect: { id } }, kind: s(form, 'kind'), reference: s(form, 'reference') }
  if (s(form, 'issuedAt')) d.issuedAt = new Date(s(form, 'issuedAt')).toISOString()
  if (s(form, 'expiresAt')) d.expiresAt = new Date(s(form, 'expiresAt')).toISOString()
  const r = await gql(`${M}($d: TutorCredentialCreateInput!) { createTutorCredential(data: $d) { id } }`, { d })
  return done(r.ok ? { success: true, error: null } : { success: false, error: r.error }, id)
}

export async function verifyCredentialAction(form: FormData) {
  const id = s(form, 'tutorId')
  const r = await command(`${M}($c: ID!, $d: String!, $e: String, $k: String) { verifyCredential(credentialId: $c, decision: $d, expiresAt: $e, idempotencyKey: $k) { success error id } }`,
    { c: s(form, 'credentialId'), d: s(form, 'decision'), e: s(form, 'expiresAt') || null, k: key(form) }, 'verifyCredential')
  return done(r, id)
}

export async function decideTimeOffAction(tutorId: string, timeOffId: string, approve: boolean) {
  const r = await command(`${M}($t: ID!, $a: Boolean!, $k: String) { decideTimeOff(timeOffId: $t, approve: $a, idempotencyKey: $k) { success error id } }`, { t: timeOffId, a: approve, k: crypto.randomUUID() }, 'decideTimeOff')
  return done(r, tutorId)
}
