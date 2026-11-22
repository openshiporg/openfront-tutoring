/**
 * Onboarding (§9). Asks: business name, country, currency, first location (address, timezone,
 * hours), kind of business, and whether to load the starter set. Always: business + settings rows,
 * roles, the payment providers (Stripe default, manual), and a generated jobs secret (shown once).
 * With the starter set: the catalogue (catalogue.ts) and its history (history.ts).
 *
 * Runs in ONE transaction, so a failure leaves the database as it was and onboarding can be retried.
 */
import { randomBytes } from 'node:crypto'
import { loadCatalogue, type CatalogueLocationInput } from './catalogue'
import { loadHistory, ensureRoles, type HistoryResult } from './history'
import { ensureProviders } from '../payments'
import { hashSecret } from '../jobs'
import { recordChange } from '../command'
import { CommandError } from '../errors'
import { loadActor, type Actor } from '../actor'
import { DEFAULT_SETTINGS } from '../settings'

export { loadCatalogue } from './catalogue'
export type { Catalogue } from './catalogue'

export const BUSINESS_KINDS = ['centre', 'test_prep', 'agency', 'mixed'] as const

export type OnboardingInput = {
  businessName: string
  country?: string
  currency?: string
  kind?: typeof BUSINESS_KINDS[number]
  supportEmail?: string
  phone?: string
  location: CatalogueLocationInput & { name: string; timezone: string }
  starterSet: boolean
}

export type OnboardingResult = { jobsSecret: string; businessId: number; locationIds: string[]; starter: HistoryResult | null; programmes: number; tutors: number }

// One transaction so a failure leaves nothing behind. Next to the database it takes seconds; over a
// slow link (a remote database from a laptop) it can take many minutes, hence the long limit.
const TX = { maxWait: 60_000, timeout: 90 * 60_000 }

export function validTimezone(tz: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}

export function readOnboardingInput(data: any): OnboardingInput {
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
  const businessName = str(data?.businessName, 120)
  if (!businessName) throw new CommandError('Enter the business name.')
  const loc = data?.location ?? {}
  const name = str(loc.name, 120)
  if (!name) throw new CommandError('Enter a name for your first location.')
  const timezone = str(loc.timezone, 64) || 'America/Chicago'
  if (!validTimezone(timezone)) throw new CommandError('That timezone is not recognised.')
  const kind = (BUSINESS_KINDS as readonly string[]).includes(data?.kind) ? data.kind : 'mixed'
  const currency = (str(data?.currency, 3) || 'USD').toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new CommandError('Currency must be a three-letter code such as USD.')
  const hours = loc.openingHours && typeof loc.openingHours === 'object' ? loc.openingHours : undefined
  return {
    businessName, kind, currency, country: (str(data?.country, 2) || 'US').toUpperCase(), supportEmail: str(data?.supportEmail, 200), phone: str(data?.phone, 40),
    starterSet: data?.starterSet !== false,
    location: { name, timezone, addressLine1: str(loc.addressLine1), addressLine2: str(loc.addressLine2), city: str(loc.city, 80), region: str(loc.region, 80), postalCode: str(loc.postalCode, 20), country: (str(loc.country, 2) || str(data?.country, 2) || 'US').toUpperCase(), phone: str(loc.phone, 40), email: str(loc.email, 200), openingHours: hours },
  }
}

/**
 * Onboard the business. `context` is a sudo Keystone context (for photo uploads); `owner` is the
 * signed-in owner. Refused once onboarding has run or programmes exist.
 */
export async function onboardBusiness(context: any, owner: Actor, input: OnboardingInput): Promise<OnboardingResult> {
  const prisma = context.prisma
  const secret = randomBytes(32).toString('base64url')
  return prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('onboarding', 0))`
    const existing = await tx.business.findUnique({ where: { id: 1 }, select: { onboardedAt: true } })
    if (existing?.onboardedAt) throw new CommandError('This business is already set up. Change details in Settings.')
    if ((await tx.program.count()) > 0 || (await tx.location.count()) > 0) throw new CommandError('Programmes or locations already exist, so the starter set cannot be loaded. Change details in Settings.')

    const now = new Date()
    await tx.business.upsert({
      where: { id: 1 },
      update: { name: input.businessName, currency: input.currency, country: input.country, kind: input.kind, supportEmail: input.supportEmail ?? '', phone: input.phone ?? '', onboardedAt: now },
      create: { id: 1, name: input.businessName, legalName: '', currency: input.currency, country: input.country, kind: input.kind, supportEmail: input.supportEmail ?? '', phone: input.phone ?? '', onboardedAt: now, nextInvoiceNumber: 1001 },
    })
    if (input.starterSet) {
      await tx.business.update({ where: { id: 1 }, data: {
        about: 'Tutoring for kindergarten to grade 12 and SAT and ACT prep, in our centres, at home and online, with a plan built from an assessment and a report after every session.',
        socialLinks: {},
      } })
    }
    await tx.businessSettings.upsert({
      where: { id: 1 },
      update: { jobsSecretHash: hashSecret(secret) },
      create: {
        id: 1, jobsSecretHash: hashSecret(secret),
        policiesText: 'We keep a seat and a tutor for every booked session, so we ask for notice when plans change.\n\nCancel at least 24 hours ahead and the session credit comes back to you. Later cancellations and missed sessions use the credit; once a month a late cancellation for illness gives a make-up.\n\nMemberships renew monthly on the day you joined. Give 30 days notice to cancel; you can pause once a year for two to four weeks.\n\nIf we cancel a session (a closure or a tutor absence), the credit always comes back to you.',
        pastDueRetryDays: DEFAULT_SETTINGS.pastDueRetryDays,
      },
    })
    await ensureRoles(tx)
    await ensureProviders(tx)
    await recordChange(tx, { type: 'Business', id: '1', to: 'onboarded', actorId: owner.userId, data: { starterSet: input.starterSet, kind: input.kind } })
    await recordChange(tx, { type: 'BusinessSettings', id: '1', actorId: owner.userId, reason: 'jobs secret generated at onboarding' })

    let starter: HistoryResult | null = null
    let locationIds: string[] = []
    let programmes = 0
    let tutors = 0
    if (input.starterSet) {
      const cat = await loadCatalogue(tx, { context, location: input.location, timezone: input.location.timezone, businessName: input.businessName, email: input.supportEmail })
      locationIds = [cat.locations.maple.id, cat.locations.riverside.id]
      programmes = Object.keys(cat.programs).length
      tutors = Object.keys(cat.tutors).length
      // The owner manages every location.
      starter = await loadHistory(tx, cat, owner)
    } else {
      const loc = input.location
      const slug = loc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'centre'
      const row = await tx.location.create({ data: { name: loc.name, slug, addressLine1: loc.addressLine1 ?? '', addressLine2: loc.addressLine2 ?? '', city: loc.city ?? '', region: loc.region ?? '', postalCode: loc.postalCode ?? '', country: loc.country ?? 'US', phone: loc.phone ?? '', email: loc.email ?? '', timezone: loc.timezone, openingHours: loc.openingHours ?? {}, status: 'active' } })
      locationIds = [row.id]
    }
    await tx.user.update({ where: { id: owner.userId }, data: { onboardingStatus: 'completed' } })
    return { jobsSecret: secret, businessId: 1, locationIds, starter, programmes, tutors }
  }, TX)
}

/**
 * The starter set for a database with an owner account and nothing else, used by the
 * storefront's dev loader and by tests. Same code path as the onboarding command.
 */
export async function loadStarterSet(context: any, input: Partial<OnboardingInput> = {}) {
  const prisma = context.prisma
  const owner = await prisma.user.findFirst({ where: { role: { canManageSettings: true } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!owner) throw new CommandError('Create the owner account first (/dashboard/init).')
  const actor = await loadActor(prisma, owner.id)
  return onboardBusiness(context, actor!, {
    businessName: input.businessName ?? 'Brightpath Learning', country: 'US', currency: 'USD', kind: 'mixed', supportEmail: input.supportEmail ?? 'hello@brightpathlearning.com', phone: '(847) 555-0142',
    location: input.location ?? { name: 'Maple Avenue Centre', timezone: 'America/Chicago' }, starterSet: true,
  })
}
