'use server'
import { revalidatePath } from 'next/cache'
import { gql, command, s } from '@/features/platform/families/lib/gql'
export async function getMemberships(status: string) {
  return gql<{ memberships: any[]; membershipPlans: any[] }>(`query($w: MembershipWhereInput!) {
    memberships(where: $w, orderBy: [{ createdAt: desc }], take: 200) { id status price currentPeriodEnd pastDueSince family { id name } student { firstName lastName } plan { id name program { id } } billingAttempts(orderBy: [{ createdAt: desc }], take: 10) { id status failureMessage nextRetryAt } }
    membershipPlans(where: { status: { equals: "active" } }, take: 200) { id name program { id } }
  }`, { w: status ? { status: { equals: status } } : {} })
}
export async function membershipBillingAction(form: FormData) {
  const r = await command(`mutation($id: ID) { runMembershipBilling(membershipId: $id) { success error id data } }`, { id: s(form, 'membershipId') || null }, 'runMembershipBilling')
  if (r.success) revalidatePath('/dashboard/platform/memberships')
  return r
}
export async function reconcileAttemptAction(form: FormData) {
  const r = await command(`mutation($id: ID!) { reconcileBillingAttempt(billingAttemptId: $id) { success error id data } }`, { id: s(form, 'attemptId') }, 'reconcileBillingAttempt')
  if (r.success) revalidatePath('/dashboard/platform/memberships')
  return r
}
