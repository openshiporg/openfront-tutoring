'use server'
import { revalidatePath } from 'next/cache'
import { command, gql, s } from '@/features/platform/families/lib/gql'
export async function getMatching(id?: string) {
  return gql<{ enrollments: any[]; matchingCandidates?: any }>(`query($id: ID!, $hasId: Boolean!) {
    enrollments(where: { status: { in: ["pending_match", "matched"] } }, orderBy: [{ createdAt: asc }], take: 100) {
      id status mode student { firstName lastName } program { name } location { name }
      offers(orderBy: [{ createdAt: desc }], take: 20) { id status expiresAt tutor { displayName } declineReason }
    }
    matchingCandidates(enrollmentId: $id) @include(if: $hasId)
  }`, { id: id || '', hasId: Boolean(id) })
}
export async function sendMatchOffer(form: FormData) {
  const r = await command(`mutation($e: ID!, $t: ID!, $k: String) { sendOffer(enrollmentId: $e, tutorId: $t, idempotencyKey: $k) { success error id data } }`, { e: s(form, 'enrollmentId'), t: s(form, 'tutorId'), k: s(form, 'idempotencyKey') }, 'sendOffer')
  if (r.success) revalidatePath('/dashboard/platform/matching')
  return r
}
export async function withdrawMatchOffer(form: FormData) {
  const r = await command(`mutation($o: ID!, $r: String, $k: String) { withdrawOffer(offerId: $o, reason: $r, idempotencyKey: $k) { success error id data } }`, { o: s(form, 'offerId'), r: s(form, 'reason'), k: s(form, 'idempotencyKey') }, 'withdrawOffer')
  if (r.success) revalidatePath('/dashboard/platform/matching')
  return r
}
