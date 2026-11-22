import { cache } from 'react'
import { gql } from './client'

/** Read operations (§5.9 storefront queries). Every number on a page comes from these. */

export const getBusiness = cache(async () => (await gql<{ storefrontBusiness: any }>('{ storefrontBusiness }')).data?.storefrontBusiness ?? null)

export async function getPrograms(filter: { subject?: string; level?: string; mode?: string } = {}) {
  const r = await gql<{ storefrontPrograms: any }>('query($s:String,$l:String,$m:String){ storefrontPrograms(subject:$s, level:$l, mode:$m) }', { s: filter.subject || null, l: filter.level || null, m: filter.mode || null })
  return { value: r.data?.storefrontPrograms ?? null, error: r.error }
}
export const getProgram = cache(async (slug: string) => (await gql<{ storefrontProgram: any }>('query($s:String!){ storefrontProgram(slug:$s) }', { s: slug })).data?.storefrontProgram ?? null)
export async function getLocations() {
  const r = await gql<{ storefrontLocations: any[] }>('{ storefrontLocations }')
  return { value: r.data?.storefrontLocations ?? null, error: r.error }
}
export const getLocation = cache(async (slug: string) => (await gql<{ storefrontLocation: any }>('query($s:String!){ storefrontLocation(slug:$s) }', { s: slug })).data?.storefrontLocation ?? null)
export async function getTutors(filter: Record<string, string | undefined> = {}) {
  const clean = Object.fromEntries(Object.entries(filter).filter(([, v]) => v))
  const r = await gql<{ storefrontTutors: any }>('query($f:JSON){ storefrontTutors(filter:$f) }', { f: clean })
  return { value: r.data?.storefrontTutors ?? null, error: r.error }
}
export const getTutor = cache(async (slug: string) => (await gql<{ storefrontTutor: any }>('query($s:String!){ storefrontTutor(slug:$s) }', { s: slug })).data?.storefrontTutor ?? null)
export async function getPricing() {
  const r = await gql<{ storefrontPricing: any }>('{ storefrontPricing }')
  return { value: r.data?.storefrontPricing ?? null, error: r.error }
}
export async function getOpenSessions(args: { programId?: string; locationId?: string; from?: string; to?: string }) {
  const r = await gql<{ openSessions: any }>('query($p:ID,$l:ID,$f:String,$t:String){ openSessions(programId:$p, locationId:$l, from:$f, to:$t) }', { p: args.programId || null, l: args.locationId || null, f: args.from || null, t: args.to || null })
  return { value: r.data?.openSessions ?? null, error: r.error }
}

/** Settings shown publicly on /policies and at checkout. */
export async function getPolicies() {
  const r = await gql<{ storefrontPolicies: any }>('{ storefrontPolicies }')
  return { value: r.data?.storefrontPolicies ?? null, error: r.error }
}

// ---------------------------------------------------------------- guardian
export const getViewer = cache(async () => {
  const r = await gql<{ authenticatedItem: any }>('{ authenticatedItem { ... on User { id name email role { canAccessDashboard } } } }')
  return r.data?.authenticatedItem ?? null
})
export const getMyFamily = cache(async () => {
  const r = await gql<{ myFamily: any }>('{ myFamily }')
  return { value: r.data?.myFamily ?? null, error: r.error }
})
export async function getMyStudent(id: string) {
  const r = await gql<{ myStudent: any }>('query($id:ID!){ myStudent(id:$id) }', { id })
  return { value: r.data?.myStudent ?? null, error: r.error }
}
export async function getMyBookings(includePast = false, studentId?: string) {
  const r = await gql<{ myUpcomingBookings: any }>('query($p:Boolean,$s:ID){ myUpcomingBookings(includePast:$p, studentId:$s) }', { p: includePast, s: studentId || null })
  return { value: r.data?.myUpcomingBookings ?? null, error: r.error }
}
export async function getMyBooking(id: string) {
  const r = await gql<{ myBooking: any }>('query($id:ID!){ myBooking(id:$id) }', { id })
  return { value: r.data?.myBooking ?? null, error: r.error }
}
export async function getCancellationPreview(bookingId: string, excused = false) {
  const r = await gql<{ cancellationPreview: any }>('query($id:ID!,$e:Boolean){ cancellationPreview(bookingId:$id, excused:$e) { outcome hoursBefore windowHours creditReturned makeUpGranted makeUpExpiresAt excusedLeftThisMonth message } }', { id: bookingId, e: excused })
  return { value: r.data?.cancellationPreview ?? null, error: r.error }
}
export async function getMyCredits() {
  const r = await gql<{ myCredits: any }>('{ myCredits }')
  return { value: r.data?.myCredits ?? null, error: r.error }
}
export async function getMyInvoices() {
  const r = await gql<{ myInvoices: any[] }>('{ myInvoices }')
  return { value: r.data?.myInvoices ?? null, error: r.error }
}
export async function getMyInvoice(id: string) {
  const r = await gql<{ myInvoice: any }>('query($id:ID!){ myInvoice(id:$id) }', { id })
  return { value: r.data?.myInvoice ?? null, error: r.error }
}
export async function getMyAssessment(id: string) {
  const r = await gql<{ myAssessment: any }>('query($id:ID!){ myAssessment(id:$id) }', { id })
  return { value: r.data?.myAssessment ?? null, error: r.error }
}
export async function getEnrolmentOptions(programId: string) {
  const r = await gql<{ enrolmentOptions: any }>('query($p:ID!){ enrolmentOptions(programId:$p) }', { p: programId })
  return { value: r.data?.enrolmentOptions ?? null, error: r.error }
}
export async function getMyEnrolment(id: string) {
  const r = await gql<{ myEnrolment: any }>('query($id:ID!){ myEnrolment(id:$id) }', { id })
  return { value: r.data?.myEnrolment ?? null, error: r.error }
}
