'use server'
import { revalidatePath } from 'next/cache'
import { command, gql, s } from '@/features/platform/families/lib/gql'
export async function getLeads(status: string) {
  return gql<{ leads: any[]; locations: any[]; users: any[] }>(`query($w: LeadWhereInput!) {
    leads(where: $w, orderBy: [{ createdAt: desc }], take: 200) { id guardianName email phone studentName status message nextFollowUpAt lostReason family { id name } student { id } program { name } location { name } }
    locations(take: 100) { id name }
    users(where: { role: { canManageLeads: { equals: true } } }, take: 100) { id name }
  }`, { w: status ? { status: { equals: status } } : {} })
}
export async function createLeadAction(form: FormData) {
  const data = { guardianName: s(form, 'guardianName'), email: s(form, 'email'), phone: s(form, 'phone'), studentName: s(form, 'studentName'), message: s(form, 'message'), source: 'staff', ...(s(form, 'locationId') ? { location: { connect: { id: s(form, 'locationId') } } } : {}) }
  const r = await gql<{ createLead: { id: string } }>(`mutation($d: LeadCreateInput!) { createLead(data: $d) { id } }`, { d: data })
  if (r.ok) revalidatePath('/dashboard/platform/leads')
  return { success: r.ok, error: r.ok ? null : r.error }
}
export async function moveLeadAction(form: FormData) {
  const r = await command(`mutation($id: ID!, $to: String!, $reason: String, $key: String) { transitionLead(leadId: $id, to: $to, reason: $reason, idempotencyKey: $key) { success error id data } }`, { id: s(form, 'leadId'), to: s(form, 'to'), reason: s(form, 'reason'), key: s(form, 'idempotencyKey') }, 'transitionLead')
  if (r.success) revalidatePath('/dashboard/platform/leads')
  return r
}
export async function followUpAction(form: FormData) {
  const date = s(form, 'nextFollowUpAt')
  if (date && Number.isNaN(new Date(date).getTime())) return { success: false, error: 'Choose a valid follow-up date.' }
  const r = await gql(`mutation($id: ID!, $d: LeadUpdateInput!) { updateLead(where: { id: $id }, data: $d) { id } }`, { id: s(form, 'leadId'), d: { nextFollowUpAt: date ? new Date(date).toISOString() : null, ...(s(form, 'ownerId') ? { owner: { connect: { id: s(form, 'ownerId') } } } : {}) } })
  if (r.ok) revalidatePath('/dashboard/platform/leads')
  return { success: r.ok, error: r.ok ? null : r.error }
}
