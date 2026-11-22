'use server'

import { revalidatePath } from 'next/cache'
import { gql, s } from '@/features/platform/families/lib/gql'

/**
 * Catalogue editing (programmes, plans, packages, subjects, levels, promo codes). These are
 * plain Keystone list writes: reading needs a dashboard role, writing needs canManagePrograms;
 * the list rules enforce both. Money is entered in dollars and stored in cents.
 */
const M = 'mutation'
const ROOT = '/dashboard/platform/programs'
const cents = (v: string) => (v === '' ? 0 : Math.round(Number(v) * 100))
const int = (v: string, fallback: number | null = null) => (v === '' ? fallback : Math.trunc(Number(v)))
const slugify = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80)
type Out = { success: boolean; error: string | null; id?: string | null }
async function write(query: string, variables: Record<string, unknown>, field: string, paths: string[]): Promise<Out> {
  const r = await gql<Record<string, { id: string } | null>>(query, variables)
  if (!r.ok) return { success: false, error: /unique/i.test(r.error) ? 'That name or code is already used.' : r.error }
  const row = r.data[field]
  if (!row) return { success: false, error: 'This could not be saved.' }
  for (const p of paths) revalidatePath(p)
  return { success: true, error: null, id: row.id }
}

export async function getCatalogue() {
  return gql<{ programs: any[]; subjects: any[]; levels: any[]; promoCodes: any[]; locations: any[] }>(`
    query {
      programs(orderBy: [{ name: asc }]) {
        id name slug status featured format billingModel deliveryModes sessionMinutes maxStudentsPerSession requiresAssessment assessmentFee allowsTrial payAsYouGoPrice placementFee
        locations { id name } subjects { id name }
        plansCount(where: { status: { equals: "published" } }) packagesCount(where: { status: { equals: "published" } })
      }
      subjects(orderBy: [{ sortOrder: asc }, { name: asc }]) { id name slug category description sortOrder programsCount }
      levels(orderBy: [{ sortOrder: asc }]) { id name kind sortOrder }
      promoCodes(orderBy: [{ createdAt: desc }]) { id code percentOff amountOff appliesTo validFrom validTo maxUses uses }
      locations(orderBy: [{ name: asc }]) { id name }
    }`)
}

export async function getProgram(id: string) {
  return gql<{ program: any; subjects: any[]; levels: any[]; locations: any[] }>(`
    query($id: ID!) {
      program(where: { id: $id }) {
        id name slug summary status featured format billingModel deliveryModes sessionMinutes maxStudentsPerSession requiresAssessment assessmentFee assessmentMinutes
        allowsTrial payAsYouGoPrice placementFee outcomes faq
        levelsFrom { id name } levelsTo { id name }
        locations { id name } subjects { id name }
        plans(orderBy: [{ sortOrder: asc }, { price: asc }]) { id name sessionsPerPeriod weeklyCapForUnlimited price enrolmentFee minimumTermMonths description features status sortOrder highlight }
        packages(orderBy: [{ sortOrder: asc }, { hours: asc }]) { id name hours price expiryMonths description status sortOrder pricePerHour }
      }
      subjects(orderBy: [{ name: asc }]) { id name }
      levels(orderBy: [{ sortOrder: asc }]) { id name }
      locations(orderBy: [{ name: asc }]) { id name }
    }`, { id })
}

function programData(form: FormData, creating: boolean) {
  const name = s(form, 'name')
  const d: Record<string, unknown> = {
    name, slug: s(form, 'slug') || slugify(name), summary: s(form, 'summary'), outcomes: s(form, 'outcomes'),
    format: s(form, 'format'), billingModel: s(form, 'billingModel'), deliveryModes: form.getAll('deliveryModes').map(String),
    sessionMinutes: int(s(form, 'sessionMinutes'), 60), maxStudentsPerSession: int(s(form, 'maxStudentsPerSession'), 1),
    requiresAssessment: form.get('requiresAssessment') === 'on', assessmentFee: cents(s(form, 'assessmentFee')), assessmentMinutes: int(s(form, 'assessmentMinutes'), 45),
    allowsTrial: form.get('allowsTrial') === 'on', payAsYouGoPrice: cents(s(form, 'payAsYouGoPrice')), placementFee: cents(s(form, 'placementFee')),
    featured: form.get('featured') === 'on',
    subjects: { [creating ? 'connect' : 'set']: form.getAll('subjectIds').map((id) => ({ id: String(id) })) },
    locations: { [creating ? 'connect' : 'set']: form.getAll('locationIds').map((id) => ({ id: String(id) })) },
  }
  for (const k of ['levelsFrom', 'levelsTo']) {
    const v = s(form, k)
    if (v) d[k] = { connect: { id: v } }
    else if (!creating) d[k] = { disconnect: true }
  }
  if (!(d.deliveryModes as string[]).length) return { error: 'Pick at least one way it is taught.' }
  return { d }
}

export async function saveProgramAction(form: FormData) {
  const id = s(form, 'programId')
  const { d, error } = programData(form, !id)
  if (error) return { success: false, error, id: null }
  if (!id) return write(`${M}($d: ProgramCreateInput!) { createProgram(data: $d) { id } }`, { d: { ...d, status: 'draft' } }, 'createProgram', [ROOT])
  return write(`${M}($id: ID!, $d: ProgramUpdateInput!) { updateProgram(where: { id: $id }, data: $d) { id } }`, { id, d }, 'updateProgram', [ROOT, `${ROOT}/${id}`])
}

/** Publishing, archiving and back to draft (publishField: writable with canManagePrograms). */
export async function setCatalogueStatus(list: 'Program' | 'MembershipPlan' | 'Package', id: string, status: string, programId: string) {
  if (!['draft', 'published', 'archived'].includes(status)) return { success: false, error: 'Unknown status.' }
  return write(`${M}($id: ID!, $s: String!) { update${list}(where: { id: $id }, data: { status: $s }) { id } }`, { id, s: status }, `update${list}`, [ROOT, `${ROOT}/${programId}`])
}

export async function savePlanAction(form: FormData) {
  const id = s(form, 'planId'), programId = s(form, 'programId')
  const features = s(form, 'features').split('\n').map((l) => l.trim()).filter(Boolean)
  const d: Record<string, unknown> = {
    name: s(form, 'name'), sessionsPerPeriod: int(s(form, 'sessionsPerPeriod')), weeklyCapForUnlimited: int(s(form, 'weeklyCapForUnlimited'), 5),
    price: cents(s(form, 'price')), enrolmentFee: cents(s(form, 'enrolmentFee')), minimumTermMonths: int(s(form, 'minimumTermMonths'), 0),
    description: s(form, 'description'), features, sortOrder: int(s(form, 'sortOrder'), 0), highlight: form.get('highlight') === 'on',
  }
  if (!d.price) return { success: false, error: 'Enter the monthly price.', id: null }
  if (!id) return write(`${M}($d: MembershipPlanCreateInput!) { createMembershipPlan(data: $d) { id } }`, { d: { ...d, status: 'draft', program: { connect: { id: programId } } } }, 'createMembershipPlan', [`${ROOT}/${programId}`])
  return write(`${M}($id: ID!, $d: MembershipPlanUpdateInput!) { updateMembershipPlan(where: { id: $id }, data: $d) { id } }`, { id, d }, 'updateMembershipPlan', [`${ROOT}/${programId}`])
}

export async function savePackageAction(form: FormData) {
  const id = s(form, 'packageId'), programId = s(form, 'programId')
  const d: Record<string, unknown> = {
    name: s(form, 'name'), hours: int(s(form, 'hours'), 1), price: cents(s(form, 'price')), expiryMonths: int(s(form, 'expiryMonths'), 6),
    description: s(form, 'description'), sortOrder: int(s(form, 'sortOrder'), 0),
  }
  if (!d.price) return { success: false, error: 'Enter the package price.', id: null }
  if (!id) return write(`${M}($d: PackageCreateInput!) { createPackage(data: $d) { id } }`, { d: { ...d, status: 'draft', program: { connect: { id: programId } } } }, 'createPackage', [`${ROOT}/${programId}`])
  return write(`${M}($id: ID!, $d: PackageUpdateInput!) { updatePackage(where: { id: $id }, data: $d) { id } }`, { id, d }, 'updatePackage', [`${ROOT}/${programId}`])
}

export async function saveSubjectAction(form: FormData) {
  const id = s(form, 'subjectId'), name = s(form, 'name')
  const d = { name, slug: s(form, 'slug') || slugify(name), category: s(form, 'category') || 'other', description: s(form, 'description'), sortOrder: int(s(form, 'sortOrder'), 0) }
  if (!id) return write(`${M}($d: SubjectCreateInput!) { createSubject(data: $d) { id } }`, { d }, 'createSubject', [ROOT])
  return write(`${M}($id: ID!, $d: SubjectUpdateInput!) { updateSubject(where: { id: $id }, data: $d) { id } }`, { id, d }, 'updateSubject', [ROOT])
}

export async function saveLevelAction(form: FormData) {
  const id = s(form, 'levelId')
  const d = { name: s(form, 'name'), kind: s(form, 'kind') || 'grade', sortOrder: int(s(form, 'sortOrder'), 0) }
  if (!id) return write(`${M}($d: LevelCreateInput!) { createLevel(data: $d) { id } }`, { d }, 'createLevel', [ROOT])
  return write(`${M}($id: ID!, $d: LevelUpdateInput!) { updateLevel(where: { id: $id }, data: $d) { id } }`, { id, d }, 'updateLevel', [ROOT])
}

export async function savePromoAction(form: FormData) {
  const id = s(form, 'promoId')
  const kind = s(form, 'kind')
  const d: Record<string, unknown> = {
    code: s(form, 'code').toUpperCase().replace(/\s+/g, ''), appliesTo: s(form, 'appliesTo') || 'any',
    percentOff: kind === 'percent' ? int(s(form, 'value')) : null, amountOff: kind === 'amount' ? cents(s(form, 'value')) : null,
    validFrom: s(form, 'validFrom') ? new Date(s(form, 'validFrom')).toISOString() : null, validTo: s(form, 'validTo') ? new Date(`${s(form, 'validTo')}T23:59:59`).toISOString() : null,
    maxUses: int(s(form, 'maxUses')),
  }
  if (!d.percentOff && !d.amountOff) return { success: false, error: 'Set a percent off or an amount off.', id: null }
  if (!id) return write(`${M}($d: PromoCodeCreateInput!) { createPromoCode(data: $d) { id } }`, { d }, 'createPromoCode', [ROOT])
  return write(`${M}($id: ID!, $d: PromoCodeUpdateInput!) { updatePromoCode(where: { id: $id }, data: $d) { id } }`, { id, d }, 'updatePromoCode', [ROOT])
}

/** Promo codes can end early; deleting one with uses would lose history, so ending sets validTo to now. */
export async function endPromo(id: string) {
  return write(`${M}($id: ID!, $t: DateTime!) { updatePromoCode(where: { id: $id }, data: { validTo: $t }) { id } }`, { id, t: new Date().toISOString() }, 'updatePromoCode', [ROOT])
}
