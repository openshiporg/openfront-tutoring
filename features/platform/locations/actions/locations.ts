'use server'

import { revalidatePath } from 'next/cache'
import { gql, s } from '@/features/platform/families/lib/gql'
import { WEEKDAYS } from '../lib/hours'

/**
 * Centres, rooms, closures and staff at each centre. Plain list writes; the list rules decide
 * who may write: locations and rooms need canManageLocations, closures canManageSchedule,
 * staff membership canManageStaff (scoped to the centre).
 */
const M = 'mutation'
const ROOT = '/dashboard/platform/locations'

const slugify = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80)
type Out = { success: boolean; error: string | null; id?: string | null }
async function write(query: string, variables: Record<string, unknown>, field: string, paths: string[]): Promise<Out> {
  const r = await gql<Record<string, { id: string } | null>>(query, variables)
  if (!r.ok) return { success: false, error: /unique/i.test(r.error) ? 'That is already used.' : r.error }
  if (!r.data[field]) return { success: false, error: 'This could not be saved.' }
  for (const p of paths) revalidatePath(p)
  return { success: true, error: null, id: r.data[field]!.id }
}

export async function listLocations() {
  return gql<{ locations: any[] }>(`
    query {
      locations(orderBy: [{ name: asc }]) {
        id name slug city region phone email timezone status openingHours
        roomsCount(where: { status: { equals: "active" } }) tutorsCount(where: { status: { equals: "active" } }) programsCount(where: { status: { equals: "published" } })
        membershipsCount(where: { status: { equals: "active" } })
      }
    }`)
}

export async function getLocation(id: string) {
  return gql<{ location: any; users: any[] | null }>(`
    query($id: ID!, $today: DateTime!) {
      location(where: { id: $id }) {
        id name slug addressLine1 addressLine2 city region postalCode country lat lng phone email timezone openingHours taxRatePercent description status
        rooms(orderBy: [{ name: asc }]) { id name capacity kind status }
        closures(where: { endsOn: { gte: $today } }, orderBy: [{ startsOn: asc }]) { id startsOn endsOn reason }
        memberships(orderBy: [{ role: asc }]) { id role status user { id name email role { name } } }
        programs(where: { status: { equals: "published" } }) { id name }
        tutors(where: { status: { in: ["active", "onboarding", "paused"] } }) { id displayName status }
      }
    }`, { id, today: new Date(new Date().toISOString().slice(0, 10)).toISOString() })
}

/** Staff (dashboard users) who could be added to a centre; readable only by roles that see users. */
export async function staffChoices() {
  const r = await gql<{ users: any[] }>(`query { users(where: { role: { canAccessDashboard: { equals: true } } }, orderBy: [{ name: asc }], take: 200) { id name email } }`)
  return r.ok ? r.data.users : []
}

function hoursFrom(form: FormData) {
  const out: Record<string, string[][]> = {}
  for (const d of WEEKDAYS) {
    const open = s(form, `${d}_open`), close = s(form, `${d}_close`)
    if (open && close) {
      if (close <= open) return { error: `Closing time must be after opening on ${d}.` }
      out[d] = [[open, close]]
    }
  }
  return { hours: out }
}

export async function saveLocationAction(form: FormData) {
  const id = s(form, 'locationId'), name = s(form, 'name')
  const tax = s(form, 'taxRatePercent')
  const d: Record<string, unknown> = {
    name, slug: s(form, 'slug') || slugify(name), addressLine1: s(form, 'addressLine1'), addressLine2: s(form, 'addressLine2'), city: s(form, 'city'),
    region: s(form, 'region'), postalCode: s(form, 'postalCode'), country: s(form, 'country') || 'US', phone: s(form, 'phone'), email: s(form, 'email'),
    timezone: s(form, 'timezone'), description: s(form, 'description'), taxRatePercent: tax === '' ? '0' : tax,
  }
  if (s(form, 'status')) d.status = s(form, 'status')
  if (!id) return write(`${M}($d: LocationCreateInput!) { createLocation(data: $d) { id } }`, { d }, 'createLocation', [ROOT])
  return write(`${M}($id: ID!, $d: LocationUpdateInput!) { updateLocation(where: { id: $id }, data: $d) { id } }`, { id, d }, 'updateLocation', [ROOT, `${ROOT}/${id}`])
}

export async function saveHoursAction(form: FormData) {
  const id = s(form, 'locationId')
  const h = hoursFrom(form)
  if ('error' in h) return { success: false, error: h.error ?? null }
  return write(`${M}($id: ID!, $h: JSON) { updateLocation(where: { id: $id }, data: { openingHours: $h }) { id } }`, { id, h: h.hours }, 'updateLocation', [ROOT, `${ROOT}/${id}`])
}

export async function saveRoomAction(form: FormData) {
  const id = s(form, 'roomId'), locationId = s(form, 'locationId')
  const d: Record<string, unknown> = { name: s(form, 'name'), capacity: Number(s(form, 'capacity') || 1), kind: s(form, 'kind') || 'room', status: s(form, 'status') || 'active' }
  if (!id) return write(`${M}($d: RoomCreateInput!) { createRoom(data: $d) { id } }`, { d: { ...d, location: { connect: { id: locationId } } } }, 'createRoom', [`${ROOT}/${locationId}`])
  return write(`${M}($id: ID!, $d: RoomUpdateInput!) { updateRoom(where: { id: $id }, data: $d) { id } }`, { id, d }, 'updateRoom', [`${ROOT}/${locationId}`])
}

export async function saveClosureAction(form: FormData) {
  const locationId = s(form, 'locationId')
  const start = s(form, 'startsOn'), end = s(form, 'endsOn') || start
  if (!start) return { success: false, error: 'Pick the first closed day.' }
  if (end < start) return { success: false, error: 'The last day must be on or after the first.' }
  const d = { location: { connect: { id: locationId } }, startsOn: new Date(`${start}T00:00:00Z`).toISOString(), endsOn: new Date(`${end}T23:59:59Z`).toISOString(), reason: s(form, 'reason') }
  return write(`${M}($d: ClosureCreateInput!) { createClosure(data: $d) { id } }`, { d }, 'createClosure', [`${ROOT}/${locationId}`])
}

export async function removeClosure(locationId: string, id: string) {
  return write(`${M}($id: ID!) { deleteClosure(where: { id: $id }) { id } }`, { id }, 'deleteClosure', [`${ROOT}/${locationId}`])
}

export async function addMemberAction(form: FormData) {
  const locationId = s(form, 'locationId')
  if (!s(form, 'userId')) return { success: false, error: 'Pick the staff member.' }
  const d = { location: { connect: { id: locationId } }, user: { connect: { id: s(form, 'userId') } }, role: s(form, 'role') || 'front_desk', status: 'active' }
  return write(`${M}($d: LocationMembershipCreateInput!) { createLocationMembership(data: $d) { id } }`, { d }, 'createLocationMembership', [`${ROOT}/${locationId}`])
}

export async function setMember(locationId: string, id: string, data: { role?: string; status?: string }) {
  return write(`${M}($id: ID!, $d: LocationMembershipUpdateInput!) { updateLocationMembership(where: { id: $id }, data: $d) { id } }`, { id, d: data }, 'updateLocationMembership', [`${ROOT}/${locationId}`])
}
