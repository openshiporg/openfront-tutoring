'use server'

import { revalidatePath } from 'next/cache'
import { command, gql, key, opt, s, type CommandOutcome } from '../lib/gql'

const R = 'mutation'
const done = (r: CommandOutcome, familyId?: string) => {
  if (r.success) {
    revalidatePath('/dashboard/platform/families')
    if (familyId) revalidatePath(`/dashboard/platform/families/${familyId}`)
  }
  return { success: r.success, error: r.error, id: r.id ?? null }
}

export type FamilyListItem = {
  id: string; name: string; status: string; billingEmail: string | null; phone: string | null; createdAt: string
  primaryLocation: { id: string; name: string } | null
  guardians: Array<{ id: string; name: string; email: string }>
  students: Array<{ id: string; firstName: string; lastName: string; status: string }>
}

/** Families the staff member can see (list access scopes by location). */
export async function listFamilies(input: { q: string; status: string; locationId: string; page: number }) {
  const take = 30
  const where: any = { AND: [] as any[] }
  if (input.q) where.AND.push({ OR: [
    { name: { contains: input.q, mode: 'insensitive' } },
    { billingEmail: { contains: input.q, mode: 'insensitive' } },
    { phone: { contains: input.q } },
    { guardians: { some: { OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { email: { contains: input.q, mode: 'insensitive' } }] } } },
    { students: { some: { OR: [{ firstName: { contains: input.q, mode: 'insensitive' } }, { lastName: { contains: input.q, mode: 'insensitive' } }] } } },
  ] })
  if (input.status) where.AND.push({ status: { equals: input.status } })
  if (input.locationId) where.AND.push({ primaryLocation: { id: { equals: input.locationId } } })
  return gql<{ families: FamilyListItem[]; familiesCount: number; active: number; inactive: number; locations: Array<{ id: string; name: string }> }>(`
    query($where: FamilyWhereInput!, $take: Int, $skip: Int!) {
      families(where: $where, take: $take, skip: $skip, orderBy: [{ name: asc }]) {
        id name status billingEmail phone createdAt
        primaryLocation { id name }
        guardians { id name email }
        students { id firstName lastName status }
      }
      familiesCount(where: $where)
      active: familiesCount(where: { status: { equals: "active" } })
      inactive: familiesCount(where: { status: { equals: "inactive" } })
      locations(orderBy: [{ name: asc }]) { id name }
    }`, { where, take, skip: (input.page - 1) * take })
}

export async function getFamily(id: string) {
  return gql<{ platformFamily: any; locations: Array<{ id: string; name: string }>; levels: Array<{ id: string; name: string }>; programs: Array<{ id: string; name: string }>; tutors: Array<{ id: string; displayName: string }>; membershipPlans: Array<{ id: string; name: string; program: { id: string } | null }> }>(`
    query($id: ID!) {
      platformFamily(id: $id)
      locations(orderBy: [{ name: asc }]) { id name }
      levels(orderBy: [{ sortOrder: asc }, { name: asc }]) { id name }
      programs(orderBy: [{ name: asc }]) { id name }
      tutors(where: { status: { in: ["active", "paused"] } }, orderBy: [{ displayName: asc }]) { id displayName }
      membershipPlans(where: { status: { equals: "published" } }, orderBy: [{ sortOrder: asc }]) { id name program { id } }
    }`, { id })
}

/** Plans the family's memberships can move to (same programme), for "change plan". */
export async function planChangePreview(membershipId: string, planId: string) {
  const r = await gql<{ membershipPlanChangePreview: any }>('query($m: ID!, $p: ID!) { membershipPlanChangePreview(membershipId: $m, planId: $p) }', { m: membershipId, p: planId })
  return r.ok ? { ok: true as const, data: r.data.membershipPlanChangePreview } : r
}

/** New family from the desk: creates the family, then the first child (§6.4 "create"). */
export async function createFamilyAction(form: FormData) {
  const name = s(form, 'name')
  const billingEmail = s(form, 'billingEmail').toLowerCase()
  if (!name) return { success: false, error: 'Give the family a name.', id: null }
  if (!billingEmail) return { success: false, error: 'A billing email is needed.', id: null }
  const locationId = s(form, 'primaryLocationId')
  const created = await gql<{ createFamily: { id: string } | null }>(`
    mutation($data: FamilyCreateInput!) { createFamily(data: $data) { id } }`, {
    data: {
      name, billingEmail, phone: s(form, 'phone'),
      secondGuardianName: s(form, 'guardianName'), secondGuardianEmail: s(form, 'guardianEmail').toLowerCase(), secondGuardianPhone: s(form, 'guardianPhone'),
      status: 'active',
      ...(locationId ? { primaryLocation: { connect: { id: locationId } } } : {}),
    },
  })
  if (!created.ok || !created.data.createFamily) return { success: false, error: created.ok ? 'The family could not be created.' : created.error, id: null }
  const familyId = created.data.createFamily.id
  const first = s(form, 'studentFirstName')
  if (first) {
    const r = await command(`${R}($d: JSON!, $k: String) { addStudent(data: $d, idempotencyKey: $k) { success error id data } }`,
      { d: { familyId, firstName: first, lastName: s(form, 'studentLastName') || name.replace(/ family$/i, ''), ...(s(form, 'studentLevelId') ? { levelId: s(form, 'studentLevelId') } : {}) }, k: key(form) }, 'addStudent')
    if (!r.success) return { success: false, error: `The family was created, but the child was not added: ${r.error}`, id: familyId }
  }
  revalidatePath('/dashboard/platform/families')
  return { success: true, error: null, id: familyId }
}

export async function updateFamilyAction(form: FormData) {
  const familyId = s(form, 'familyId')
  const data: Record<string, unknown> = {}
  for (const k of ['name', 'billingEmail', 'phone', 'addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'secondGuardianName', 'secondGuardianEmail', 'secondGuardianPhone', 'notes', 'status'] as const) {
    const v = opt(form, k); if (v !== undefined) data[k] = v
  }
  if (form.has('primaryLocationId')) data.primaryLocationId = s(form, 'primaryLocationId') || null
  if (form.has('payAsYouGoField')) data.payAsYouGoAllowed = form.get('payAsYouGoAllowed') === 'on'
  const r = await command(`${R}($f: ID, $d: JSON!, $k: String) { updateFamilyProfile(familyId: $f, data: $d, idempotencyKey: $k) { success error id } }`, { f: familyId, d: data, k: key(form) }, 'updateFamilyProfile')
  return done(r, familyId)
}

function pickup(form: FormData) {
  const names = form.getAll('pickupName').map(String)
  const rel = form.getAll('pickupRelation').map(String)
  const ph = form.getAll('pickupPhone').map(String)
  return names.map((n, i) => ({ name: n.trim(), relation: (rel[i] ?? '').trim(), phone: (ph[i] ?? '').trim() })).filter((p) => p.name)
}

function studentData(form: FormData) {
  const d: Record<string, unknown> = {
    firstName: s(form, 'firstName'), lastName: s(form, 'lastName'), school: s(form, 'school'),
    dateOfBirth: s(form, 'dateOfBirth') || null, levelId: s(form, 'levelId') || null,
    learningNotes: s(form, 'learningNotes'), medicalNotes: s(form, 'medicalNotes'), pickupPeople: pickup(form),
  }
  if (form.has('status')) d.status = s(form, 'status')
  return d
}

export async function addStudentAction(form: FormData) {
  const familyId = s(form, 'familyId')
  const r = await command(`${R}($d: JSON!, $k: String) { addStudent(data: $d, idempotencyKey: $k) { success error id } }`, { d: { familyId, ...studentData(form) }, k: key(form) }, 'addStudent')
  return done(r, familyId)
}

export async function updateStudentAction(form: FormData) {
  const r = await command(`${R}($s: ID!, $d: JSON!, $k: String) { updateStudent(studentId: $s, data: $d, idempotencyKey: $k) { success error id } }`, { s: s(form, 'studentId'), d: studentData(form), k: key(form) }, 'updateStudent')
  revalidatePath('/dashboard/platform/students')
  return done(r, s(form, 'familyId'))
}

export async function logContactAction(form: FormData) {
  const familyId = s(form, 'familyId')
  const d: Record<string, unknown> = { channel: s(form, 'channel'), direction: s(form, 'direction'), subject: s(form, 'subject'), body: s(form, 'body') }
  if (s(form, 'nextFollowUpAt')) d.nextFollowUpAt = s(form, 'nextFollowUpAt')
  if (s(form, 'taskId')) d.taskId = s(form, 'taskId')
  const r = await command(`${R}($f: ID!, $d: JSON!, $k: String) { logFamilyContact(familyId: $f, data: $d, idempotencyKey: $k) { success error id } }`, { f: familyId, d, k: key(form) }, 'logFamilyContact')
  return done(r, familyId)
}

export async function recordReviewAction(form: FormData) {
  const familyId = s(form, 'familyId')
  const d: Record<string, unknown> = { rating: Number(s(form, 'rating')), source: s(form, 'source'), authorName: s(form, 'authorName'), text: s(form, 'text') }
  for (const k of ['tutorId', 'locationId', 'programId']) if (s(form, k)) d[k] = s(form, k)
  const r = await command(`${R}($f: ID!, $d: JSON!, $k: String) { recordReview(familyId: $f, data: $d, idempotencyKey: $k) { success error id } }`, { f: familyId, d, k: key(form) }, 'recordReview')
  return done(r, familyId)
}

export async function moderateReviewAction(familyId: string, reviewId: string, status: string) {
  const r = await command(`${R}($r: ID!, $s: String!, $k: String) { moderateReview(reviewId: $r, status: $s, idempotencyKey: $k) { success error id } }`, { r: reviewId, s: status, k: crypto.randomUUID() }, 'moderateReview')
  return done(r, familyId)
}

export async function completeTaskAction(form: FormData) {
  const r = await command(`${R}($t: ID!, $o: String!, $d: Boolean, $k: String) { completeTask(taskId: $t, outcome: $o, dismiss: $d, idempotencyKey: $k) { success error id } }`,
    { t: s(form, 'taskId'), o: s(form, 'outcome'), d: s(form, 'dismiss') === '1', k: key(form) }, 'completeTask')
  return done(r, s(form, 'familyId'))
}

export async function goodwillCreditAction(form: FormData) {
  const familyId = s(form, 'familyId')
  const hours = Number(s(form, 'hours'))
  const minutes = Math.round(hours * 60)
  if (!Number.isFinite(minutes) || minutes < 1) return { success: false, error: 'Enter the hours to give.', id: null }
  const r = await command(`${R}($f: ID!, $s: ID, $p: ID, $m: Int!, $e: Int, $r: String!, $k: String) { grantGoodwillCredit(familyId: $f, studentId: $s, programId: $p, minutes: $m, expiresInDays: $e, reason: $r, idempotencyKey: $k) { success error id } }`,
    { f: familyId, s: s(form, 'studentId') || null, p: s(form, 'programId') || null, m: minutes, e: s(form, 'expiresInDays') ? Number(s(form, 'expiresInDays')) : null, r: s(form, 'reason'), k: key(form) }, 'grantGoodwillCredit')
  return done(r, familyId)
}

export async function pauseMembershipAction(form: FormData) {
  const r = await command(`${R}($m: ID!, $f: String!, $u: String!, $r: String, $k: String) { pauseMembership(membershipId: $m, from: $f, until: $u, reason: $r, idempotencyKey: $k) { success error id } }`,
    { m: s(form, 'membershipId'), f: s(form, 'from'), u: s(form, 'until'), r: s(form, 'reason'), k: key(form) }, 'pauseMembership')
  return done(r, s(form, 'familyId'))
}

export async function endMembershipAction(form: FormData) {
  const r = await command(`${R}($m: ID!, $mode: String!, $refund: Boolean, $r: String!, $k: String) { endMembership(membershipId: $m, mode: $mode, refund: $refund, reason: $r, idempotencyKey: $k) { success error id } }`,
    { m: s(form, 'membershipId'), mode: s(form, 'mode'), refund: form.get('refund') === 'on', r: s(form, 'reason'), k: key(form) }, 'endMembership')
  return done(r, s(form, 'familyId'))
}

export async function changePlanAction(form: FormData) {
  const r = await command(`${R}($m: ID!, $p: ID!, $e: String!, $k: String) { changeMembershipPlan(membershipId: $m, planId: $p, effective: $e, idempotencyKey: $k) { success error id } }`,
    { m: s(form, 'membershipId'), p: s(form, 'planId'), e: s(form, 'effective'), k: key(form) }, 'changeMembershipPlan')
  return done(r, s(form, 'familyId'))
}

export async function recordOfflinePaymentAction(form: FormData) {
  const cents = Math.round(Number(s(form, 'amount')) * 100)
  if (!Number.isFinite(cents) || cents <= 0) return { success: false, error: 'Enter the amount received.', id: null }
  const r = await command(`${R}($i: ID!, $a: Int!, $m: String!, $ref: String, $k: String) { recordOfflinePayment(invoiceId: $i, amount: $a, method: $m, reference: $ref, idempotencyKey: $k) { success error id } }`,
    { i: s(form, 'invoiceId'), a: cents, m: s(form, 'method'), ref: s(form, 'reference'), k: key(form) }, 'recordOfflinePayment')
  return done(r, s(form, 'familyId'))
}

export async function refundPaymentAction(form: FormData) {
  const cents = Math.round(Number(s(form, 'amount')) * 100)
  if (!Number.isFinite(cents) || cents <= 0) return { success: false, error: 'Enter the amount to refund.', id: null }
  const r = await command(`${R}($p: ID!, $a: Int!, $r: String!, $k: String) { refundPayment(paymentId: $p, amount: $a, reason: $r, idempotencyKey: $k) { success error id } }`,
    { p: s(form, 'paymentId'), a: cents, r: s(form, 'reason'), k: key(form) }, 'refundPayment')
  return done(r, s(form, 'familyId'))
}
