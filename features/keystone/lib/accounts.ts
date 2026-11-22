/**
 * Guardian accounts created by a storefront action (W1 step 3): a Customer User with a random
 * password, a Family, signed in at once and emailed a set-password link after commit.
 */
import { randomBytes } from 'node:crypto'
import { CommandError } from './errors'
import { lockKey, recordChange, requireString, optionalString } from './command'
import { customerRoleId } from './assessments'
import type { Actor } from './actor'
import { guardianFamily } from './actor'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type GuardianRef = { userId: string; name: string; email: string; phone: string; isNew: boolean; familyId: string }

export async function guardianForCommand(tx: any, actor: Actor | null, input: { name?: unknown; email?: unknown; phone?: unknown } | null | undefined, locationId: string | null, reason: string): Promise<GuardianRef> {
  if (actor) {
    const familyId = await guardianFamily(tx, actor, true)
    return { userId: actor.userId, name: actor.name, email: actor.email, phone: '', isNew: false, familyId }
  }
  if (!input) throw new CommandError('Enter your name and email.')
  const email = requireString(input.email, 'Email', 200).toLowerCase()
  if (!EMAIL.test(email)) throw new CommandError('Enter a valid email address.')
  const name = requireString(input.name, 'Your name', 120)
  const phone = optionalString(input.phone, 40)
  await lockKey(tx, `signup:${email}`)
  const taken = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
  if (taken) throw new CommandError('That email already has an account. Sign in to continue, or use “Forgot password”.')
  const user = await tx.user.create({ data: { name, email, phone, password: randomBytes(24).toString('base64url'), role: { connect: { id: await customerRoleId(tx) } } }, select: { id: true } })
  const family = await tx.family.create({
    data: { name: `${name.split(' ').slice(-1)[0] || name} family`, billingEmail: email, phone, guardians: { connect: { id: user.id } }, ...(locationId ? { primaryLocation: { connect: { id: locationId } } } : {}) },
    select: { id: true },
  })
  await recordChange(tx, { type: 'Family', id: family.id, to: 'active', actorId: user.id, reason })
  return { userId: user.id, name, email, phone, isNew: true, familyId: family.id }
}

export async function studentForCommand(tx: any, guardian: GuardianRef, studentId: unknown, student: any) {
  if (studentId) {
    const s = await tx.student.findUnique({ where: { id: String(studentId) }, select: { id: true, familyId: true } })
    if (!s || s.familyId !== guardian.familyId) throw new CommandError('That student was not found.')
    return s.id as string
  }
  if (!student) throw new CommandError('Enter the student’s name.')
  const created = await tx.student.create({
    data: {
      family: { connect: { id: guardian.familyId } }, firstName: requireString(student.firstName, 'Student first name', 80),
      lastName: optionalString(student.lastName, 80) || guardian.name.split(' ').slice(-1)[0] || '',
      school: optionalString(student.school, 160), ...(student.levelId ? { level: { connect: { id: String(student.levelId) } } } : {}), status: 'prospect',
      createdBy: { connect: { id: guardian.userId } },
    },
    select: { id: true },
  })
  return created.id as string
}

/** After commit: email the set-password link and start a session cookie for a brand-new guardian. */
export async function welcomeNewGuardian(context: any, guardian: GuardianRef, label: string) {
  if (!guardian.isNew) return
  try { await context.sudo().graphql.run({ query: 'mutation($e: String!) { sendUserPasswordResetLink(email: $e) }', variables: { e: guardian.email } }) } catch (error) { console.error(`${label}: password link not sent`, (error as Error)?.message) }
  if (context.sessionStrategy && context.res) {
    try { await context.sessionStrategy.start({ data: { listKey: 'User', itemId: guardian.userId }, context }) } catch (error) { console.error(`${label}: sign-in failed`, (error as Error)?.message) }
  }
}
