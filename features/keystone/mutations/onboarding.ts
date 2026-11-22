/**
 * §9 onboarding command. Owner only, once. Returns the jobs secret for POST /api/jobs/daily
 * (only its hash is stored; it can be rotated in Settings → Jobs).
 */
import { CommandError } from '../lib/errors'
import { loadActor, requireFlag } from '../lib/actor'
import { onboardBusiness, readOnboardingInput } from '../lib/seed'

const gql = String.raw
type Ctx = any

export const typeDefs = gql`
  type Query {
    onboardingState: JSON
  }
  type Mutation {
    onboardBusiness(data: JSON!): CommandResult!
  }
`

export const resolvers = {
  Query: {
    onboardingState: async (_: unknown, _a: unknown, context: Ctx) => {
      if (!context.session?.itemId) return null
      const prisma = context.sudo().prisma
      const [business, programmes, locations] = await Promise.all([
        prisma.business.findUnique({ where: { id: 1 }, select: { name: true, onboardedAt: true } }),
        prisma.program.count(), prisma.location.count(),
      ])
      return { onboarded: Boolean(business?.onboardedAt), businessName: business?.name ?? '', canLoadStarterSet: programmes === 0 && locations === 0 }
    },
  },
  Mutation: {
    onboardBusiness: async (_: unknown, args: any, context: Ctx) => {
      try {
        const sudo = context.sudo()
        const actor = context.session?.itemId ? await loadActor(sudo.prisma, context.session.itemId) : null
        const owner = requireFlag(actor, 'canManageSettings')
        const input = readOnboardingInput(args.data)
        const r = await onboardBusiness(sudo, owner, input)
        return { success: true, error: null, id: '1', data: { jobsSecret: r.jobsSecret, locationIds: r.locationIds, programmes: r.programmes, tutors: r.tutors, starter: r.starter } }
      } catch (error) {
        if (error instanceof CommandError) return { success: false, error: error.message, id: null, data: null }
        console.error('onboardBusiness failed:', (error as Error)?.message)
        return { success: false, error: 'Onboarding did not finish. Nothing was saved; please try again.', id: null, data: null }
      }
    },
  },
}
