/**
 * Access for Openfront Tutoring. Adapted from Barbershop's access.ts: a global
 * Role carries permission flags; LocationMembership scopes staff to locations
 * and its role (manager, front_desk, tutor) bounds which flags apply there.
 * The owner (canManageSettings) sees every location.
 *
 * Plain module: no @/ imports, safe from keystone.ts.
 */

export const ROLE_FLAGS = [
  'canAccessDashboard', 'canManageSettings', 'canManageStaff', 'canManageLocations',
  'canManagePrograms', 'canManageLeads', 'canManageFamilies', 'canManageSchedule',
  'canMarkAttendance', 'canManageBilling', 'canIssueRefunds', 'canManagePayroll',
  'canViewReports', 'canManageTutors', 'isTutor',
  'canManagePeople', 'canManageRoles', 'canSeeOtherPeople', 'canEditOtherPeople',
] as const

export type RoleFlag = typeof ROLE_FLAGS[number]
export type Role = { id: string; name: string } & Partial<Record<RoleFlag, boolean>>

export type LocationRole = 'manager' | 'front_desk' | 'tutor'

export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
    email?: string
    role: Role | null
    locationMemberships?: Array<{ id?: string; role?: string | null; status?: string | null; location?: { id: string; status?: string | null } | null }>
    tutor?: { id: string } | null
    family?: { id: string } | null
  }
}

type AccessArgs = { session?: Session; context?: unknown }

/** Flags a location role can use at its location. Flags not listed here are global. */
export const LOCATION_ROLE_CAPABILITIES: Record<LocationRole, readonly RoleFlag[]> = {
  manager: ['canAccessDashboard', 'canManageLeads', 'canManageFamilies', 'canManageSchedule', 'canMarkAttendance', 'canManageBilling', 'canIssueRefunds', 'canManagePayroll', 'canViewReports', 'canManageTutors', 'canManagePrograms'],
  front_desk: ['canAccessDashboard', 'canManageLeads', 'canManageFamilies', 'canManageSchedule', 'canMarkAttendance', 'canManageBilling'],
  tutor: ['canAccessDashboard', 'canMarkAttendance', 'isTutor'],
}

export const LOCATION_SCOPED_FLAGS = new Set<RoleFlag>(LOCATION_ROLE_CAPABILITIES.manager)

export function locationRoleAllows(locationRole: string | null | undefined, flag: RoleFlag) {
  if (!LOCATION_SCOPED_FLAGS.has(flag)) return true
  const caps = LOCATION_ROLE_CAPABILITIES[(locationRole || '') as LocationRole] as readonly RoleFlag[] | undefined
  return Boolean(caps?.includes(flag))
}

export function isSignedIn({ session }: AccessArgs) {
  return Boolean(session)
}

export function isOwner(session?: Session) {
  return Boolean(session?.data.role?.canManageSettings)
}

export function hasFlag(session: Session | undefined, flag: RoleFlag) {
  return Boolean(session?.data.role?.[flag])
}

/** Active locations where this user's location role allows the flag. */
export function locationIdsFor(session: Session | undefined, flag: RoleFlag) {
  if (!hasFlag(session, flag)) return []
  return Array.from(new Set((session?.data.locationMemberships ?? [])
    .filter((m) => m.status === 'active' && m.location?.id && m.location.status !== 'closed' && locationRoleAllows(m.role, flag))
    .map((m) => m.location!.id))).sort()
}

/** The staff part of a filter: owner sees all; others their locations plus business-wide (no location) rows. */
export function staffFilter(session: Session | undefined, flag: RoleFlag, path = 'location'): boolean | Record<string, unknown> {
  if (!hasFlag(session, flag)) return false
  if (isOwner(session)) return true
  const ids = locationIdsFor(session, flag)
  if (!ids.length) return false
  if (path === '') return { id: { in: ids } }
  if (path.endsWith('[]')) {
    // to-many location relationship: rows at one of my locations, or at none (online/in-home)
    const many = path.slice(0, -2)
    return { OR: [nest(many, { some: { id: { in: ids } } }), nest(many, { none: {} })] }
  }
  // Online and in-home records have no location; every location's staff work them.
  return { OR: [nest(path, { id: { in: ids } }), nest(path, null)] }
}

/** `nest('a.b', leaf)` is `{ a: { b: leaf } }`. */
export function nest(path: string, leaf: unknown): Record<string, unknown> {
  if (!path) return leaf as Record<string, unknown>
  const keys = path.split('.')
  return keys.reduceRight<unknown>((acc, key) => ({ [key]: acc }), leaf) as Record<string, unknown>
}

export function guardianFilter(session: Session | undefined, path = 'family') {
  if (!session?.itemId) return false
  return nest(path, { guardians: { some: { id: { equals: session.itemId } } } })
}

export function tutorFilter(session: Session | undefined, path = 'tutor') {
  if (!session?.itemId || !hasFlag(session, 'isTutor')) return false
  return nest(path, { user: { id: { equals: session.itemId } } })
}

/** OR of filters; `true` wins; all false means no access. */
export function anyOf(...filters: Array<boolean | Record<string, unknown>>) {
  if (filters.some((f) => f === true)) return true
  const objects = filters.filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === 'object')
  if (!objects.length) return false
  return objects.length === 1 ? objects[0] : { OR: objects }
}

type Scope = {
  /** Flag needed for staff to read. */
  read: RoleFlag
  /** Flag needed for staff to create, update, delete through generic CRUD; false = server only. */
  write: RoleFlag | false
  /** Relationship path to the location, or null when the list is business-wide. */
  location?: string | null
  /** Relationship path to Family for guardian reads. */
  guardian?: string
  /** Relationship path to Tutor for tutor reads. */
  tutor?: string
  /** Extra filter applied to guardian reads (e.g. only published rows). */
  guardianWhere?: Record<string, unknown>
  tutorWhere?: Record<string, unknown>
  /** A tutor read filter that is not a simple path (e.g. assigned students). */
  tutorCustom?: (session: Session) => Record<string, unknown>
  /** Tutors may create and update their own rows (the tutor relationship is checked by ownTutorHook). */
  tutorWrite?: boolean
  /** Deletion is never allowed through generic CRUD. */
  noDelete?: boolean
}

function staffScope(session: Session | undefined, flag: RoleFlag, location: string | null | undefined) {
  if (location === null || location === undefined) return hasFlag(session, flag) && (isOwner(session) || locationIdsFor(session, flag).length > 0 || !LOCATION_SCOPED_FLAGS.has(flag))
  return staffFilter(session, flag, location)
}

/** Builds Keystone list access from a scope. Guardians and tutors only ever read through generic CRUD. */
export function scopedAccess(scope: Scope) {
  const tutorRead = (session?: Session) => {
    if (!session || !hasFlag(session, 'isTutor')) return false
    if (scope.tutorCustom) return scope.tutorCustom(session)
    return scope.tutor ? withWhere(tutorFilter(session, scope.tutor), scope.tutorWhere) : false
  }
  const readFilter = ({ session }: AccessArgs) => anyOf(
    staffScope(session, scope.read, scope.location),
    scope.guardian ? withWhere(guardianFilter(session, scope.guardian), scope.guardianWhere) : false,
    tutorRead(session),
  )
  const writeFilter = ({ session }: AccessArgs) => anyOf(
    scope.write ? staffScope(session, scope.write, scope.location) : false,
    scope.tutorWrite ? tutorRead(session) : false,
  )
  const canWrite = ({ session }: AccessArgs) => Boolean(scope.write && hasFlag(session, scope.write))
  const canWriteOrTutor = (args: AccessArgs) => canWrite(args) || Boolean(scope.tutorWrite && hasFlag(args.session, 'isTutor'))
  return {
    operation: {
      query: isSignedIn,
      create: canWriteOrTutor,
      update: canWriteOrTutor,
      delete: (args: AccessArgs) => !scope.noDelete && canWrite(args),
    },
    filter: { query: readFilter, update: writeFilter, delete: ({ session }: AccessArgs) => scope.write ? staffScope(session, scope.write, scope.location) : false },
  }
}

function withWhere(filter: boolean | Record<string, unknown>, where?: Record<string, unknown>) {
  if (!filter || !where) return filter
  return filter === true ? where : { AND: [filter, where] }
}

/** Fields only the server writes (status fields, balances, snapshots). */
export const serverOnly = { create: () => false, update: () => false }

/** Append-only lists: nobody creates, updates or deletes through GraphQL. */
export function appendOnlyAccess(read: RoleFlag, location?: string | null) {
  return {
    operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false },
    filter: { query: ({ session }: AccessArgs) => staffScope(session, read, location) },
  }
}

export const permissions = Object.fromEntries(
  ROLE_FLAGS.map((flag) => [flag, ({ session }: AccessArgs) => hasFlag(session, flag)]),
) as Record<RoleFlag, (args: AccessArgs) => boolean>

export const rules = {
  canReadPeople: ({ session }: AccessArgs) => {
    if (!session) return false
    if (session.data.role?.canSeeOtherPeople || session.data.role?.canManageStaff || session.data.role?.canManageFamilies) return true
    return { id: { equals: session.itemId } }
  },
  canUpdatePeople: ({ session }: AccessArgs) => {
    if (!session) return false
    if (session.data.role?.canEditOtherPeople) return true
    return { id: { equals: session.itemId } }
  },
}
