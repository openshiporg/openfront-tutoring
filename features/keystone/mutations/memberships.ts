/**
 * Membership commands (§4.9, W6, §5.9) and the daily jobs command.
 * Guardian: requestMembershipPause, requestMembershipCancel. Staff: pauseMembership,
 * endMembership, changeMembershipPlan (+ preview), runMembershipBilling, reconcileBillingAttempt,
 * expireCredits, grantGoodwillCredit, runDailyJobs, rotateJobsSecret.
 */
import { randomBytes } from 'node:crypto'
import { runCommand, requireString, requireInt, requireDate, optionalString, recordChange } from '../lib/command'
import { CommandError } from '../lib/errors'
import { requireFlag, requireGuardianOf, loadActor, type Actor } from '../lib/actor'
import { giveNotice, applyPause, planChangePreview, changePlan, endNow, runMembershipBilling, reconcileAttempt, billMembership } from '../lib/membership'
import { processRefund } from '../lib/payments'
import { createGrant } from '../lib/ledger'
import { runDailyJobs, expireCredits, hashSecret } from '../lib/jobs'
import { DAY } from '../lib/settings'

const gql = String.raw
type Ctx = any
const keyOf = (a: any) => (typeof a?.idempotencyKey === 'string' ? a.idempotencyKey : null)

export const typeDefs = gql`
  type Query {
    membershipPlanChangePreview(membershipId: ID!, planId: ID!): JSON
  }
  type Mutation {
    requestMembershipPause(membershipId: ID!, from: String!, until: String!, idempotencyKey: String): CommandResult!
    requestMembershipCancel(membershipId: ID!, idempotencyKey: String): CommandResult!
    pauseMembership(membershipId: ID!, from: String!, until: String!, reason: String, idempotencyKey: String): CommandResult!
    endMembership(membershipId: ID!, mode: String!, refund: Boolean, reason: String!, idempotencyKey: String): CommandResult!
    changeMembershipPlan(membershipId: ID!, planId: ID!, effective: String!, idempotencyKey: String): CommandResult!
    runMembershipBilling(membershipId: ID): CommandResult!
    reconcileBillingAttempt(billingAttemptId: ID!): CommandResult!
    expireCredits: CommandResult!
    grantGoodwillCredit(familyId: ID!, studentId: ID, programId: ID, minutes: Int!, expiresInDays: Int, reason: String!, idempotencyKey: String): CommandResult!
    runDailyJobs: CommandResult!
    rotateJobsSecret: CommandResult!
  }
`

const fail = (error: unknown) => ({ success: false, error: error instanceof CommandError ? error.message : 'Something went wrong. Please try again.', id: null, data: null })
async function actorOf(context: Ctx): Promise<Actor | null> {
  return context.session?.itemId ? loadActor(context.sudo().prisma, context.session.itemId) : null
}

async function membershipFor(tx: any, id: string) {
  const m = await tx.membership.findUnique({ where: { id }, include: { enrollment: { select: { locationId: true } } } })
  if (!m) throw new CommandError('That membership was not found.')
  return { m, locationId: m.enrollment?.locationId ?? null }
}

export const resolvers = {
  Query: {
    membershipPlanChangePreview: async (_: unknown, args: any, context: Ctx) => {
      const prisma = context.sudo().prisma
      const actor = await actorOf(context)
      const { locationId } = await membershipFor(prisma, String(args.membershipId))
      requireFlag(actor, 'canManageBilling', locationId)
      return planChangePreview(prisma, String(args.membershipId), String(args.planId))
    },
  },
  Mutation: {
    requestMembershipPause: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'requestMembershipPause', idempotencyKey: keyOf(args), input: { m: args.membershipId, f: args.from, u: args.until } }, async (tx, actor) => {
      const { m } = await membershipFor(tx, String(args.membershipId))
      await requireGuardianOf(tx, actor, m.familyId)
      const r = await applyPause(tx, m, requireDate(args.from, 'Pause start'), requireDate(args.until, 'Pause end'), actor!.userId, { staff: false })
      return { id: m.id, data: { ...r, from: r.from.toISOString(), until: r.until.toISOString(), nextBillDate: r.nextBillDate?.toISOString() ?? null } }
    }),

    requestMembershipCancel: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'requestMembershipCancel', idempotencyKey: keyOf(args), input: { m: args.membershipId } }, async (tx, actor) => {
      const { m } = await membershipFor(tx, String(args.membershipId))
      await requireGuardianOf(tx, actor, m.familyId)
      const r = await giveNotice(tx, m, actor!.userId)
      return { id: m.id, data: { endsAt: r.endsAt.toISOString(), released: r.released } }
    }),

    pauseMembership: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'pauseMembership', idempotencyKey: keyOf(args), input: { m: args.membershipId, f: args.from, u: args.until } }, async (tx, actor) => {
      const { m, locationId } = await membershipFor(tx, String(args.membershipId))
      requireFlag(actor, 'canManageBilling', locationId)
      const r = await applyPause(tx, m, requireDate(args.from, 'Pause start'), requireDate(args.until, 'Pause end'), actor!.userId, { staff: true })
      return { id: m.id, data: { ...r, from: r.from.toISOString(), until: r.until.toISOString(), nextBillDate: r.nextBillDate?.toISOString() ?? null, reason: optionalString(args.reason, 300) } }
    }),

    endMembership: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'endMembership', idempotencyKey: keyOf(args), input: { m: args.membershipId, mode: args.mode, r: Boolean(args.refund) } }, async (tx, actor) => {
      const { m, locationId } = await membershipFor(tx, String(args.membershipId))
      requireFlag(actor, 'canManageBilling', locationId)
      const reason = requireString(args.reason, 'Reason', 300)
      if (args.mode === 'notice') {
        const r = await giveNotice(tx, m, actor!.userId)
        return { id: m.id, data: { mode: 'notice', endsAt: r.endsAt.toISOString(), released: r.released } }
      }
      if (args.mode !== 'now') throw new CommandError('Choose “at the end of the notice period” or “now”.')
      if (args.refund) requireFlag(actor, 'canIssueRefunds', locationId)
      const r = await endNow(tx, m.id, { refund: Boolean(args.refund), reason, actorId: actor!.userId })
      return { id: m.id, data: { mode: 'now', refundAmount: r.refundAmount }, after: async () => { for (const id of r.refundIds) await processRefund(context.sudo().prisma, id) } }
    }),

    changeMembershipPlan: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'changeMembershipPlan', idempotencyKey: keyOf(args), input: { m: args.membershipId, p: args.planId, e: args.effective } }, async (tx, actor) => {
      const { m, locationId } = await membershipFor(tx, String(args.membershipId))
      requireFlag(actor, 'canManageBilling', locationId)
      if (!['next_period', 'now'].includes(args.effective)) throw new CommandError('Choose when the plan changes: now or at the next bill date.')
      const r = await changePlan(tx, m.id, String(args.planId), args.effective, actor!.userId)
      return { id: m.id, data: r }
    }),

    runMembershipBilling: async (_: unknown, args: any, context: Ctx) => {
      try {
        const actor = await actorOf(context)
        requireFlag(actor, 'canManageBilling')
        const prisma = context.sudo().prisma
        if (args.membershipId) {
          const { locationId } = await membershipFor(prisma, String(args.membershipId))
          requireFlag(actor, 'canManageBilling', locationId)
          const r = await billMembership(prisma, String(args.membershipId))
          return { success: true, error: null, id: args.membershipId, data: r }
        }
        requireFlag(actor, 'canManageSettings')
        const results = await runMembershipBilling(prisma)
        return { success: true, error: null, id: null, data: { results } }
      } catch (error) { return fail(error) }
    },

    reconcileBillingAttempt: async (_: unknown, args: any, context: Ctx) => {
      try {
        const actor = await actorOf(context)
        const prisma = context.sudo().prisma
        const a = await prisma.billingAttempt.findUnique({ where: { id: String(args.billingAttemptId) }, select: { membershipId: true } })
        if (!a) throw new CommandError('That billing attempt was not found.')
        const { locationId } = await membershipFor(prisma, a.membershipId)
        requireFlag(actor, 'canManageBilling', locationId)
        const r = await reconcileAttempt(prisma, String(args.billingAttemptId))
        return { success: true, error: null, id: String(args.billingAttemptId), data: r }
      } catch (error) { return fail(error) }
    },

    expireCredits: async (_: unknown, _args: any, context: Ctx) => {
      try {
        requireFlag(await actorOf(context), 'canManageBilling')
        return { success: true, error: null, id: null, data: await expireCredits(context.sudo().prisma) }
      } catch (error) { return fail(error) }
    },

    grantGoodwillCredit: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'grantGoodwillCredit', idempotencyKey: keyOf(args), input: { f: args.familyId, s: args.studentId ?? null, m: args.minutes } }, async (tx, actor) => {
      const family = await tx.family.findUnique({ where: { id: String(args.familyId) }, select: { id: true, primaryLocationId: true } })
      if (!family) throw new CommandError('That family was not found.')
      requireFlag(actor, 'canManageBilling', family.primaryLocationId ?? undefined)
      const minutes = requireInt(args.minutes, 'Minutes', 1, 6000)
      if (args.studentId) {
        const s = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { familyId: true } })
        if (s?.familyId !== family.id) throw new CommandError('That student is not in this family.')
      }
      const days = args.expiresInDays ? requireInt(args.expiresInDays, 'Expiry days', 1, 730) : 60
      const g = await createGrant(tx, { familyId: family.id, studentId: args.studentId ? String(args.studentId) : null, programId: args.programId ? String(args.programId) : null, kind: 'goodwill', minutes, expiresAt: new Date(Date.now() + days * DAY), note: requireString(args.reason, 'Reason', 300), actorId: actor!.userId })
      return { id: g.id, data: { grantId: g.id, minutes } }
    }),

    runDailyJobs: async (_: unknown, _args: any, context: Ctx) => {
      try {
        requireFlag(await actorOf(context), 'canManageSettings')
        const r = await runDailyJobs(context.sudo().prisma)
        return { success: !('skipped' in r), error: 'skipped' in r ? 'The daily jobs are already running.' : null, id: null, data: r }
      } catch (error) { return fail(error) }
    },

    /** Onboarding and settings → jobs: a new secret for POST /api/jobs/daily, shown once. */
    rotateJobsSecret: (_: unknown, _args: any, context: Ctx) => runCommand(context, { name: 'rotateJobsSecret', input: {} }, async (tx, actor) => {
      requireFlag(actor, 'canManageSettings')
      const secret = randomBytes(32).toString('base64url')
      await tx.businessSettings.upsert({ where: { id: 1 }, create: { id: 1, jobsSecretHash: hashSecret(secret) }, update: { jobsSecretHash: hashSecret(secret) } })
      await recordChange(tx, { type: 'BusinessSettings', id: '1', actorId: actor!.userId, reason: 'jobs secret rotated' })
      return { id: '1', data: { secret } }
    }),
  },
}

