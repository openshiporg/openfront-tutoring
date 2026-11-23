/**
 * Compatibility entry point for the canonical onboarding starter set.
 * Create the owner at /dashboard/init first. Existing businesses are left untouched.
 * Not imported by any route; run with: npx tsx features/storefront/dev/load-catalogue.ts
 */
import { keystoneContext } from '../../keystone/context'
import { loadStarterSet, type OnboardingInput } from '../../keystone/lib/seed'

export async function loadCatalogue(input: Partial<OnboardingInput> = {}) {
  const context = keystoneContext.sudo()
  const prisma = context.prisma
  const [business, programmes, locations] = await Promise.all([
    prisma.business.findUnique({ where: { id: 1 }, select: { onboardedAt: true } }),
    prisma.program.count(),
    prisma.location.count(),
  ])
  if (business?.onboardedAt || programmes || locations) {
    console.log('Business records already exist; nothing loaded. Manage them in the dashboard.')
    return
  }
  await loadStarterSet(context, input)
  console.log('Starter set loaded through onboarding.')
}

if (process.argv[1]?.includes('load-catalogue')) {
  loadCatalogue().then(() => process.exit(0), () => {
    console.error('Starter set could not be loaded. Confirm an owner exists and the business is empty.')
    process.exit(1)
  })
}
