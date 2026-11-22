'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { command, gql } from './client'

/** §5.9 storefront commands. Each returns { ok, error, data } for the form that called it. */
export type ActionState = { ok: boolean; error: string | null; data?: any; id?: string | null }

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const key = (f: FormData) => str(f, 'idempotencyKey') || randomUUID()
const CR = 'success error id data'

// ---------------------------------------------------------------- enquiry (P10, P11)
export async function submitEnquiryAction(_: ActionState, f: FormData): Promise<ActionState> {
  const data = {
    intent: str(f, 'intent') === 'request_tutor' ? 'request_tutor' : 'enquiry',
    guardianName: str(f, 'name'), email: str(f, 'email'), phone: str(f, 'phone'),
    studentName: str(f, 'studentName'), message: str(f, 'message'), preferredTimes: str(f, 'preferredTimes'),
    area: str(f, 'area'), mode: str(f, 'mode') || null, programId: str(f, 'programId') || null,
    locationId: str(f, 'locationId') || null, levelId: str(f, 'levelId') || null,
    subjectIds: f.getAll('subjectIds').map(String).filter(Boolean),
  }
  if (!data.guardianName || !data.email) return { ok: false, error: 'Enter your name and email so we can reply.' }
  const r = await command('submitEnquiry', `mutation($d: JSON!, $k: String) { submitEnquiry(data: $d, idempotencyKey: $k) { ${CR} } }`, { d: data, k: key(f) })
  return r.success ? { ok: true, error: null, id: r.id } : { ok: false, error: r.error }
}

// ---------------------------------------------------------------- assessment (P9)
export async function bookAssessmentAction(_: ActionState, f: FormData): Promise<ActionState> {
  const studentId = str(f, 'studentId')
  const vars: Record<string, unknown> = {
    programId: str(f, 'programId'), mode: str(f, 'mode'), locationId: str(f, 'locationId') || null,
    startsAt: str(f, 'startsAt'), tutorId: str(f, 'tutorId'), notes: str(f, 'notes') || null, k: key(f),
    studentId: studentId || null,
    student: studentId ? null : { firstName: str(f, 'firstName'), lastName: str(f, 'lastName') || null, levelId: str(f, 'levelId') || null, school: str(f, 'school') || null },
    guardian: str(f, 'guardianEmail') ? { name: str(f, 'guardianName'), email: str(f, 'guardianEmail'), phone: str(f, 'guardianPhone') || null } : null,
  }
  if (!vars.startsAt || !vars.tutorId) return { ok: false, error: 'Choose a time for the assessment.' }
  if (!studentId && !str(f, 'firstName')) return { ok: false, error: 'Enter your child’s first name.' }
  const r = await command('bookAssessment', `mutation($programId: ID!, $mode: String!, $locationId: ID, $startsAt: String!, $tutorId: ID!, $studentId: ID, $student: AssessmentStudentInput, $guardian: AssessmentGuardianInput, $notes: String, $k: String) {
    bookAssessment(programId: $programId, mode: $mode, locationId: $locationId, startsAt: $startsAt, tutorId: $tutorId, studentId: $studentId, student: $student, guardian: $guardian, notes: $notes, idempotencyKey: $k) { ${CR} } }`, vars)
  if (!r.success) return { ok: false, error: r.error }
  revalidatePath('/account', 'layout')
  redirect(`/assessment/confirmed/${encodeURIComponent(r.id || r.data?.assessmentId)}`)
}

export async function cancelAssessmentAction(_: ActionState, f: FormData): Promise<ActionState> {
  const r = await command('cancelAssessment', `mutation($a: ID!, $r: String, $k: String) { cancelAssessment(assessmentId: $a, reason: $r, idempotencyKey: $k) { ${CR} } }`, { a: str(f, 'assessmentId'), r: str(f, 'reason') || null, k: key(f) })
  if (!r.success) return { ok: false, error: r.error }
  revalidatePath('/account', 'layout')
  return { ok: true, error: null, data: r.data }
}

export async function rescheduleAssessmentAction(_: ActionState, f: FormData): Promise<ActionState> {
  if (!str(f, 'startsAt')) return { ok: false, error: 'Choose a new time.' }
  const r = await command('rescheduleAssessment', `mutation($a: ID!, $s: String!, $t: ID!, $k: String) { rescheduleAssessment(assessmentId: $a, startsAt: $s, tutorId: $t, idempotencyKey: $k) { ${CR} } }`, { a: str(f, 'assessmentId'), s: str(f, 'startsAt'), t: str(f, 'tutorId'), k: key(f) })
  if (!r.success) return { ok: false, error: r.error }
  revalidatePath('/account', 'layout')
  return { ok: true, error: null, data: r.data }
}

// ---------------------------------------------------------------- sessions (A5 to A9)
export async function bookSessionAction(_: ActionState, f: FormData): Promise<ActionState> {
  const r = await command('bookSession', `mutation($s: ID!, $st: ID!, $k: String) { bookSession(sessionId: $s, studentId: $st, idempotencyKey: $k) { ${CR} } }`, { s: str(f, 'sessionId'), st: str(f, 'studentId'), k: key(f) })
  if (!r.success) return { ok: false, error: r.error }
  revalidatePath('/account', 'layout')
  return { ok: true, error: null, id: r.id, data: r.data }
}
export async function joinWaitlistAction(_: ActionState, f: FormData): Promise<ActionState> {
  const r = await command('joinWaitlist', `mutation($s: ID!, $st: ID!, $k: String) { joinWaitlist(sessionId: $s, studentId: $st, idempotencyKey: $k) { ${CR} } }`, { s: str(f, 'sessionId'), st: str(f, 'studentId'), k: key(f) })
  if (!r.success) return { ok: false, error: r.error }
  revalidatePath('/account', 'layout')
  return { ok: true, error: null, id: r.id, data: r.data }
}
export async function leaveWaitlistAction(_: ActionState, f: FormData): Promise<ActionState> {
  const r = await command('leaveWaitlist', `mutation($w: ID!, $k: String) { leaveWaitlist(waitlistEntryId: $w, idempotencyKey: $k) { ${CR} } }`, { w: str(f, 'waitlistEntryId'), k: key(f) })
  if (!r.success) return { ok: false, error: r.error }
  revalidatePath('/account', 'layout')
  return { ok: true, error: null }
}
export async function cancelBookingAction(_: ActionState, f: FormData): Promise<ActionState> {
  const r = await command('cancelBooking', `mutation($b: ID!, $e: Boolean, $r: String, $k: String) { cancelBooking(bookingId: $b, excused: $e, reason: $r, idempotencyKey: $k) { ${CR} } }`, { b: str(f, 'bookingId'), e: str(f, 'excused') === 'on', r: str(f, 'reason') || null, k: key(f) })
  if (!r.success) return { ok: false, error: r.error }
  revalidatePath('/account', 'layout')
  return { ok: true, error: null, data: r.data }
}
export async function rescheduleBookingAction(_: ActionState, f: FormData): Promise<ActionState> {
  if (!str(f, 'newSessionId')) return { ok: false, error: 'Choose the new session.' }
  const r = await command('rescheduleBooking', `mutation($b: ID!, $n: ID!, $k: String) { rescheduleBooking(bookingId: $b, newSessionId: $n, idempotencyKey: $k) { ${CR} } }`, { b: str(f, 'bookingId'), n: str(f, 'newSessionId'), k: key(f) })
  if (!r.success) return { ok: false, error: r.error }
  revalidatePath('/account', 'layout')
  return { ok: true, error: null, id: r.id, data: r.data }
}

// ---------------------------------------------------------------- auth (P17)
const SIGN_IN_ERROR = 'That email and password do not match. Try again, or reset your password.'

export async function signInAction(_: ActionState, f: FormData): Promise<ActionState> {
  const email = str(f, 'email')
  const password = String(f.get('password') ?? '')
  const r = await gql<any>(`mutation($e: String!, $p: String!) { authenticateUserWithPassword(email: $e, password: $p) {
    ... on UserAuthenticationWithPasswordSuccess { item { id role { canAccessDashboard } } }
    ... on UserAuthenticationWithPasswordFailure { message } } }`, { e: email, p: password })
  const item = r.data?.authenticateUserWithPassword?.item
  if (!item) return { ok: false, error: SIGN_IN_ERROR }
  revalidatePath('/', 'layout')
  const next = safeNext(str(f, 'next'))
  redirect(item.role?.canAccessDashboard && !next ? '/dashboard' : next || '/account')
}

export async function signOutAction() {
  await gql('mutation { endSession }')
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function requestResetAction(_: ActionState, f: FormData): Promise<ActionState> {
  const email = str(f, 'email')
  if (!email) return { ok: false, error: 'Enter your email.' }
  const r = await gql<any>('mutation($e: String!) { sendUserPasswordResetLink(email: $e) }', { e: email })
  if (r.error) return { ok: false, error: 'We could not send the email just now. Please try again, or call us and we will help.' }
  return { ok: true, error: null }
}

export async function redeemResetAction(_: ActionState, f: FormData): Promise<ActionState> {
  const password = String(f.get('password') ?? '')
  if (password.length < 8) return { ok: false, error: 'Use at least 8 characters.' }
  if (password !== String(f.get('confirm') ?? '')) return { ok: false, error: 'The two passwords do not match.' }
  const r = await gql<any>('mutation($e: String!, $t: String!, $p: String!) { redeemUserPasswordResetToken(email: $e, token: $t, password: $p) { code message } }', { e: str(f, 'email'), t: str(f, 'token'), p: password })
  if (r.error) return { ok: false, error: r.error }
  if (r.data?.redeemUserPasswordResetToken?.code) return { ok: false, error: 'This link has expired or was already used. Ask for a new one below.' }
  // Sign straight in with the new password.
  const signed = await gql<any>(`mutation($e: String!, $p: String!) { authenticateUserWithPassword(email: $e, password: $p) { ... on UserAuthenticationWithPasswordSuccess { item { id } } } }`, { e: str(f, 'email'), p: password })
  revalidatePath('/', 'layout')
  if (signed.data?.authenticateUserWithPassword?.item) redirect('/account')
  return { ok: true, error: null }
}

export async function registerAction(_: ActionState, f: FormData): Promise<ActionState> {
  const name = str(f, 'name')
  const email = str(f, 'email')
  const password = String(f.get('password') ?? '')
  if (!name || !email) return { ok: false, error: 'Enter your name and email.' }
  if (password.length < 8) return { ok: false, error: 'Use a password of at least 8 characters.' }
  const r = await command('registerGuardian', `mutation($d: JSON!, $k: String) { registerGuardian(data: $d, idempotencyKey: $k) { ${CR} } }`, { d: { name, email, phone: str(f, 'phone'), password }, k: key(f) })
  if (!r.success) return { ok: false, error: r.error }
  const signed = await gql<any>(`mutation($e: String!, $p: String!) { authenticateUserWithPassword(email: $e, password: $p) { ... on UserAuthenticationWithPasswordSuccess { item { id } } } }`, { e: email, p: password })
  revalidatePath('/', 'layout')
  if (!signed.data?.authenticateUserWithPassword?.item) return { ok: false, error: 'Your account was created. Sign in with your email and password.' }
  redirect(safeNext(str(f, 'next')) || '/account')
}

function safeNext(v: string) {
  return v.startsWith('/') && !v.startsWith('//') && !/[\\\r\n]/.test(v) && !v.startsWith('/dashboard') ? v : ''
}

// ---------------------------------------------------------------- reads the booking forms call as the visitor picks
export async function loadAssessmentSlots(programId: string, mode: string, locationId: string | null, from?: string) {
  const r = await gql<{ assessmentSlots: any }>('query($p: ID!, $l: ID, $m: String, $f: String) { assessmentSlots(programId: $p, locationId: $l, mode: $m, from: $f) }', { p: programId, l: locationId, m: mode, f: from || null })
  return { value: r.data?.assessmentSlots ?? null, error: r.error }
}

// ---------------------------------------------------------------- card payments (Stripe Elements)
export type PaymentStart = { ok: boolean; error: string | null; clientSecret?: string | null; publishableKey?: string; amount?: number; currency?: string; status?: string; paymentSessionId?: string; invoiceId?: string }

/** §5.9 payInvoice: opens (or reuses) the PaymentIntent for an open invoice's amount due. */
export async function startInvoicePaymentAction(invoiceId: string, saveCard: boolean, _idempotencyKey?: string): Promise<PaymentStart> {
  const r = await command('payInvoice', `mutation($i: ID!, $s: Boolean) { payInvoice(invoiceId: $i, saveCard: $s) { ${CR} } }`, { i: invoiceId, s: saveCard })
  if (!r.success || !r.data) return { ok: false, error: r.error }
  return { ok: true, error: null, ...(r.data as any) }
}

/** Charge the family's saved card (off-session). */
export async function paySavedCardAction(invoiceId: string): Promise<PaymentStart> {
  const r = await command('payInvoice', `mutation($i: ID!) { payInvoice(invoiceId: $i, useSavedCard: true) { ${CR} } }`, { i: invoiceId })
  revalidatePath('/account', 'layout')
  if (!r.success || !r.data) return { ok: false, error: r.error }
  return { ok: true, error: null, ...(r.data as any) }
}

/** After Stripe.js confirms: the server reads the PaymentIntent itself and settles (never trusts the browser). */
export async function completePaymentAction(paymentSessionId: string, _invoiceId?: string): Promise<ActionState> {
  const r = await command('refreshPayment', `mutation($p: ID!) { refreshPayment(paymentSessionId: $p) { ${CR} } }`, { p: paymentSessionId })
  revalidatePath('/account', 'layout')
  return r.success ? { ok: true, error: null, data: r.data } : { ok: false, error: r.error }
}
