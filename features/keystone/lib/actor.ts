/**
 * The acting user, loaded fresh from the database for every command (Barbershop
 * currentAuthorization pattern): role flags, active location memberships, own tutor and family.
 */
import { LOCATION_SCOPED_FLAGS, locationRoleAllows, ROLE_FLAGS, type RoleFlag } from '../access'
import { CommandError } from './errors'

export type Actor = {
  userId: string
  name: string
  email: string
  flags: Partial<Record<RoleFlag, boolean>>
  memberships: Array<{ locationId: string; role: string }>
  tutorId: string | null
  familyId: string | null
}

const roleSelect = Object.fromEntries(ROLE_FLAGS.map((f) => [f, true]))

export async function loadActor(prisma: any, userId: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, familyId: true,
      role: { select: roleSelect },
      tutor: { select: { id: true, status: true } },
      locationMemberships: { where: { status: 'active', location: { status: { not: 'closed' } } }, select: { locationId: true, role: true } },
    },
  })
  if (!user) return null
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    flags: user.role ?? {},
    memberships: user.locationMemberships.filter((m: any) => m.locationId).map((m: any) => ({ locationId: m.locationId, role: m.role })),
    tutorId: user.role?.isTutor && user.tutor && user.tutor.status !== 'inactive' ? user.tutor.id : null,
    familyId: user.familyId ?? null,
  }
}

export function can(actor: Actor | null, flag: RoleFlag) {
  return Boolean(actor?.flags[flag])
}

export function isOwnerActor(actor: Actor | null) {
  return can(actor, 'canManageSettings')
}

/** Can this actor use `flag` at `locationId`? null location = online / in-home / business-wide. */
export function canAt(actor: Actor | null, flag: RoleFlag, locationId: string | null | undefined) {
  if (!can(actor, flag)) return false
  if (isOwnerActor(actor) || !LOCATION_SCOPED_FLAGS.has(flag)) return true
  const scoped = actor!.memberships.filter((m) => locationRoleAllows(m.role, flag))
  if (!scoped.length) return false
  if (!locationId) return true
  return scoped.some((m) => m.locationId === locationId)
}

export function requireFlag(actor: Actor | null, flag: RoleFlag, locationId?: string | null): Actor {
  if (!actor) throw new CommandError('Sign in to continue.')
  if (locationId === undefined ? !can(actor, flag) || (!isOwnerActor(actor) && LOCATION_SCOPED_FLAGS.has(flag) && !actor.memberships.some((m) => locationRoleAllows(m.role, flag))) : !canAt(actor, flag, locationId)) {
    throw new CommandError('You do not have permission to do that here.')
  }
  return actor
}

export function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new CommandError('Sign in to continue.')
  return actor
}

/**
 * Storefront ownership: the family's guardians must include the signed-in user.
 * Checked in the transaction BEFORE anything else is read or written.
 */
export async function requireGuardianOf(tx: any, actor: Actor | null, familyId: string | null | undefined) {
  if (!actor) throw new CommandError('Sign in to continue.')
  if (!familyId) throw new CommandError('That was not found.')
  const family = await tx.family.findFirst({ where: { id: familyId, guardians: { some: { id: actor.userId } } }, select: { id: true } })
  if (!family) throw new CommandError('That was not found.')
  return family.id as string
}

/** The signed-in guardian's family, created when a customer has none yet. */
export async function guardianFamily(tx: any, actor: Actor | null, create = false) {
  if (!actor) throw new CommandError('Sign in to continue.')
  const family = await tx.family.findFirst({ where: { guardians: { some: { id: actor.userId } } }, select: { id: true } })
  if (family) return family.id as string
  if (!create) throw new CommandError('Add your family details first.')
  const created = await tx.family.create({
    data: { name: `${actor.name.split(' ').slice(-1)[0] || actor.name} family`, billingEmail: actor.email, guardians: { connect: { id: actor.userId } }, createdBy: { connect: { id: actor.userId } } },
    select: { id: true },
  })
  return created.id as string
}
