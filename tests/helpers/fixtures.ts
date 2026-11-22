/** Real records for state-machine tests, written with Prisma (few round trips). */
import { randomUUID } from 'node:crypto'
import { ROLE_TEMPLATES } from '../../features/keystone/lib/roles'

const id = () => randomUUID().slice(0, 8)
export const HOUR = 3600_000
export const DAY = 24 * HOUR

export async function ensureRoles(prisma: any) {
  const out: Record<string, string> = {}
  for (const [key, t] of Object.entries(ROLE_TEMPLATES)) {
    const r = await prisma.role.upsert({ where: { name: t.name }, create: { ...t }, update: {} })
    out[key] = r.id
  }
  return out as Record<keyof typeof ROLE_TEMPLATES, string>
}

export async function user(prisma: any, roleId: string, name = 'Staff Member', extra: Record<string, unknown> = {}) {
  return prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W+/g, '.')}.${id()}@brightpath.example`, password: 'not-used-here-hash', roleId, ...extra } })
}

export async function world(prisma: any, opts: { capacity?: number; format?: 'one_to_one' | 'small_group'; startsInHours?: number; minutes?: number; payRate?: number } = {}) {
  const roles = await ensureRoles(prisma)
  const location = await prisma.location.create({ data: { name: `Maple Avenue Centre ${id()}`, slug: `maple-${id()}`, timezone: 'America/New_York' } })
  const room = await prisma.room.create({ data: { name: 'Room 1', capacity: 8, locationId: location.id } })
  const subject = await prisma.subject.create({ data: { name: `Maths ${id()}`, slug: `maths-${id()}` } })
  const program = await prisma.program.create({ data: { name: 'Maths Foundations', slug: `maths-foundations-${id()}`, format: opts.format ?? 'small_group', maxStudentsPerSession: opts.capacity ?? 4, sessionMinutes: opts.minutes ?? 60, status: 'published', payAsYouGoPrice: 4500 } })
  const owner = await user(prisma, roles.Owner, 'Dana Owner')
  const manager = await user(prisma, roles.Manager, 'Maya Manager')
  await prisma.locationMembership.create({ data: { userId: manager.id, locationId: location.id, role: 'manager' } })
  const frontDesk = await user(prisma, roles['Front desk'], 'Felix Desk')
  await prisma.locationMembership.create({ data: { userId: frontDesk.id, locationId: location.id, role: 'front_desk' } })
  const tutorUser = await user(prisma, roles.Tutor, 'Tara Tutor')
  await prisma.locationMembership.create({ data: { userId: tutorUser.id, locationId: location.id, role: 'tutor' } })
  const tutor = await prisma.tutor.create({ data: { userId: tutorUser.id, displayName: 'Tara Tutor', slug: `tara-${id()}`, status: 'active', defaultPayRate: opts.payRate ?? 3000 } })
  await prisma.tutorSubject.create({ data: { tutorId: tutor.id, subjectId: subject.id, payRate: opts.payRate ?? 3000 } })
  const startsAt = new Date(Date.now() + (opts.startsInHours ?? 72) * HOUR)
  const session = await prisma.session.create({ data: { programId: program.id, subjectId: subject.id, locationId: location.id, roomId: room.id, tutorId: tutor.id, startsAt, endsAt: new Date(startsAt.getTime() + (opts.minutes ?? 60) * 60000), capacity: opts.capacity ?? 4, status: 'scheduled' } })
  return { roles, location, room, subject, program, owner, manager, frontDesk, tutorUser, tutor, session }
}

export async function family(prisma: any, roles: Record<string, string>, students = 1, name = 'Ruiz') {
  const guardian = await user(prisma, roles.Customer, `Ana ${name}`)
  const fam = await prisma.family.create({ data: { name: `${name} family`, guardians: { connect: { id: guardian.id } } } })
  await prisma.user.update({ where: { id: guardian.id }, data: { familyId: fam.id } })
  const kids = []
  for (let i = 0; i < students; i += 1) kids.push(await prisma.student.create({ data: { familyId: fam.id, firstName: ['Mia', 'Leo', 'Ava', 'Kai', 'Zoe', 'Eli', 'Ivy', 'Sam', 'Noa', 'Ari'][i % 10], lastName: name, status: 'active' } }))
  return { guardian, family: fam, students: kids }
}

/** A grant written through the real ledger (grant entry included). */
export async function grant(prisma: any, input: { familyId: string; studentId?: string; programId?: string | null; minutes: number; kind?: string; expiresAt?: Date | null; unlimited?: boolean; weeklyCap?: number }) {
  const { createGrant } = await import('../../features/keystone/lib/ledger')
  return prisma.$transaction((tx: any) => createGrant(tx, { kind: 'package', ...input } as any))
}

export function as(context: any, userId: string) {
  return context.withSession({ itemId: userId, listKey: 'User', data: {} })
}

export async function gql(context: any, userId: string | null, query: string, variables: Record<string, unknown> = {}) {
  const ctx = userId ? as(context, userId) : context.withSession(undefined)
  return ctx.graphql.run({ query, variables })
}

export const BOOK = `mutation($s: ID!, $st: ID!, $k: String) { bookSession(sessionId: $s, studentId: $st, idempotencyKey: $k) { success error id data } }`
export const STAFF_BOOK = `mutation($s: ID!, $st: ID!, $w: String) { staffBookSession(sessionId: $s, studentId: $st, whenFull: $w) { success error id data } }`
export const CANCEL = `mutation($b: ID!, $e: Boolean) { cancelBooking(bookingId: $b, excused: $e) { success error id data } }`
export const MARK = `mutation($b: ID!, $o: String!) { markAttendance(bookingId: $b, outcome: $o) { success error id data } }`
export const REOPEN = `mutation($b: ID!, $c: String, $r: String!) { reopenBooking(bookingId: $b, correctedStatus: $c, reason: $r) { success error id data } }`

/** Moves a session into the past (for marking) without touching its bookings' rules. */
export async function moveSessionTo(prisma: any, sessionId: string, startsAt: Date) {
  const s = await prisma.session.findUnique({ where: { id: sessionId } })
  const len = s.endsAt.getTime() - s.startsAt.getTime()
  await prisma.session.update({ where: { id: sessionId }, data: { startsAt, endsAt: new Date(startsAt.getTime() + len) } })
  await prisma.booking.updateMany({ where: { sessionId }, data: { startsAt, endsAt: new Date(startsAt.getTime() + len) } })
}

export async function ledgerProblems(prisma: any, familyIds?: string[]) {
  const { checkGrant } = await import('../../features/keystone/lib/ledger')
  const grants = await prisma.creditGrant.findMany({ where: familyIds ? { familyId: { in: familyIds } } : {}, select: { id: true } })
  const problems: string[] = []
  for (const g of grants) { const p = await checkGrant(prisma, g.id); if (p) problems.push(p) }
  // every hold closed by exactly one release or debit (net of reversals) for final bookings; open for booked
  const holds = await prisma.creditEntry.findMany({ where: { type: { in: ['hold', 'release', 'debit', 'reversal'] }, bookingId: { not: null }, ...(familyIds ? { grant: { familyId: { in: familyIds } } } : {}) }, select: { bookingId: true, type: true } })
  const byBooking = new Map<string, { open: number; close: number }>()
  for (const h of holds) {
    const c = byBooking.get(h.bookingId) ?? { open: 0, close: 0 }
    if (h.type === 'hold' || h.type === 'reversal') c.open += 1; else c.close += 1
    byBooking.set(h.bookingId, c)
  }
  const bookings = await prisma.booking.findMany({ where: { id: { in: [...byBooking.keys()] } }, select: { id: true, status: true } })
  for (const b of bookings) {
    const c = byBooking.get(b.id)!
    const expected = b.status === 'booked' ? 1 : 0
    if (c.open - c.close !== expected || c.close > c.open) problems.push(`booking ${b.id} (${b.status}) holds ${c.open} closes ${c.close}`)
  }
  return problems
}
