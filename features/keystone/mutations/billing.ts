/**
 * Money commands (§4.10, W1.7, W7, W8, §5.9): enrol and pay, packages, invoice payment, saved
 * cards, front-desk payments, refunds and credit notes.
 *
 * Shape: the database part runs in `runCommand` (one transaction, CommandReceipt idempotency);
 * the Stripe call runs after it commits (startInvoicePayment), so no transaction ever waits on the
 * network and a retry reuses the same PaymentSession and PaymentIntent.
 */
import { runCommand, requireInt, requireString, optionalString, recordChange, transaction } from '../lib/command'
import { CommandError } from '../lib/errors'
import { canAt, requireFlag, requireGuardianOf, loadActor, type Actor } from '../lib/actor'
import { buildCheckout, cancelPendingEnrolment, removePackageCredit } from '../lib/enrolment'
import { guardianForCommand, studentForCommand, welcomeNewGuardian } from '../lib/accounts'
import { createInvoice, applyToInvoice } from '../lib/invoices'
import {
  startInvoicePayment, refreshPaymentSession, applyPayment, fulfilInvoice, requestRefund, processRefund,
  stripeKeys, ensureCustomer, ensureProviders, stripe, voidInvoiceIfUnpaid,
} from '../lib/payments'
import { settleSetupIntent } from '../lib/webhook'

const gql = String.raw
type Ctx = any
const keyOf = (a: any) => (typeof a?.idempotencyKey === 'string' ? a.idempotencyKey : null)
const OFFLINE_METHODS = ['cash', 'cheque', 'bank_transfer'] as const

export const typeDefs = gql`
  input CheckoutGuardianInput { name: String!, email: String!, phone: String }
  input CheckoutStudentInput { firstName: String!, lastName: String, levelId: ID, school: String }

  type Mutation {
    startEnrolmentCheckout(
      programId: ID!, planId: ID, packageId: ID, mode: String!, locationId: ID, seriesIds: [ID!],
      studentId: ID, student: CheckoutStudentInput, guardian: CheckoutGuardianInput,
      promoCode: String, learningPlanId: ID, homeAddress: String, preferredTimes: String,
      acceptPolicies: Boolean!, saveCard: Boolean, idempotencyKey: String
    ): CommandResult!
    completeEnrolmentCheckout(paymentSessionId: ID!): CommandResult!
    cancelEnrolmentCheckout(enrollmentId: ID!): CommandResult!
    purchasePackage(packageId: ID!, studentId: ID!, saveCard: Boolean, useSavedCard: Boolean, idempotencyKey: String): CommandResult!
    payInvoice(invoiceId: ID!, saveCard: Boolean, useSavedCard: Boolean): CommandResult!
    refreshPayment(paymentSessionId: ID!): CommandResult!
    createSetupIntent: CommandResult!
    setDefaultPaymentMethod(setupIntentId: ID!): CommandResult!
    recordOfflinePayment(invoiceId: ID!, amount: Int!, method: String!, reference: String, idempotencyKey: String): CommandResult!
    refundPayment(paymentId: ID!, amount: Int!, reason: String!, idempotencyKey: String): CommandResult!
    issueCreditNote(invoiceId: ID!, amount: Int!, reason: String!, idempotencyKey: String): CommandResult!
    voidInvoice(invoiceId: ID!, reason: String!): CommandResult!
  }
`

const fail = (error: unknown) => ({ success: false, error: error instanceof CommandError ? error.message : 'Something went wrong. Please try again.', id: null, data: null })

async function actorOf(context: Ctx): Promise<Actor | null> {
  return context.session?.itemId ? loadActor(context.sudo().prisma, context.session.itemId) : null
}

/** Guardian of the invoice's family, or billing staff at its location. */
async function requireInvoiceAccess(prisma: any, actor: Actor | null, invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, familyId: true, locationId: true, status: true } })
  if (!invoice) throw new CommandError('That invoice was not found.')
  if (canAt(actor, 'canManageBilling', invoice.locationId)) return { invoice, staff: true }
  await requireGuardianOf(prisma, actor, invoice.familyId)
  return { invoice, staff: false }
}

/**
 * Card step after the database step committed. A saved card is charged off-session (staff or the
 * guardian's "use saved card"); otherwise a client secret is returned for Stripe Elements.
 */
async function payStep(context: Ctx, invoiceId: string, actorId: string | null, opts: { saveCard?: boolean; useSavedCard?: boolean; attemptKey?: string }) {
  const prisma = context.sudo().prisma
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, family: { select: { defaultPaymentMethodId: true } } } })
  if (inv.status === 'paid') return { status: 'captured', invoiceStatus: 'paid', clientSecret: null }
  if (opts.useSavedCard) {
    if (!inv.family?.defaultPaymentMethodId) throw new CommandError('There is no saved card on this family.')
    const started = await startInvoicePayment(prisma, { invoiceId, actorId, offSession: true, attemptKey: opts.attemptKey ?? `saved:${Date.now()}` })
    const after = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } })
    return { ...started, clientSecret: null, invoiceStatus: after.status }
  }
  const started = await startInvoicePayment(prisma, { invoiceId, actorId, saveCard: opts.saveCard })
  return { ...started, invoiceStatus: inv.status }
}

export const resolvers = {
  Mutation: {
    startEnrolmentCheckout: async (_: unknown, args: any, context: Ctx) => {
      let guardianRef: any = null
      const r = await runCommand(context, {
        name: 'startEnrolmentCheckout', allowAnonymous: true, idempotencyKey: keyOf(args),
        input: { p: args.programId, pl: args.planId ?? null, pk: args.packageId ?? null, m: args.mode, l: args.locationId ?? null, s: args.seriesIds ?? [], st: args.studentId ?? args.student ?? null, g: args.guardian?.email ?? null, c: args.promoCode ?? null },
      }, async (tx, actor) => {
        if (!args.acceptPolicies) throw new CommandError('Please accept the policies to continue.')
        const locationId = args.locationId ? String(args.locationId) : null
        const guardian = await guardianForCommand(tx, actor, args.guardian, locationId, 'enrolment checkout')
        guardianRef = guardian
        const studentId = await studentForCommand(tx, guardian, args.studentId, args.student)
        if (args.learningPlanId) {
          const plan = await tx.learningPlan.findUnique({ where: { id: String(args.learningPlanId) }, select: { studentId: true, status: true } })
          if (!plan || plan.studentId !== studentId || !['proposed', 'accepted'].includes(plan.status)) throw new CommandError('That learning plan is not open for enrolment.')
        }
        const c = await buildCheckout(tx, {
          familyId: guardian.familyId, studentId, programId: String(args.programId), planId: args.planId ? String(args.planId) : null, packageId: args.packageId ? String(args.packageId) : null,
          locationId, mode: String(args.mode), seriesIds: args.seriesIds ?? [], promoCode: args.promoCode ?? null, learningPlanId: args.learningPlanId ? String(args.learningPlanId) : null,
          homeAddress: optionalString(args.homeAddress, 300), preferredTimes: optionalString(args.preferredTimes, 500), actorId: guardian.userId,
        })
        if (c.invoice.total === 0) {
          // Fully discounted: nothing to charge, start it now.
          await tx.invoice.update({ where: { id: c.invoice.id }, data: { status: 'paid' } })
          await recordChange(tx, { type: 'Invoice', id: c.invoice.id, from: 'open', to: 'paid', actorId: guardian.userId, reason: 'nothing to pay' })
          await fulfilInvoice(tx, c.invoice.id)
        }
        return {
          id: c.enrollmentId,
          data: { enrollmentId: c.enrollmentId, invoiceId: c.invoice.id, invoiceNumber: c.invoice.number, total: c.invoice.total, subtotal: c.invoice.subtotal, discount: c.invoice.discount, tax: c.invoice.tax, currency: c.invoice.currency, familyId: guardian.familyId, studentId, newAccount: guardian.isNew },
          after: () => welcomeNewGuardian(context, guardian, 'startEnrolmentCheckout'),
        }
      })
      if (!r.success || !r.data) return r
      const d = r.data as any
      if (d.total === 0) return { ...r, data: { ...d, status: 'captured', invoiceStatus: 'paid' } }
      try {
        const pay = await payStep(context, d.invoiceId, guardianRef?.userId ?? context.session?.itemId ?? null, { saveCard: args.saveCard !== false })
        return { ...r, data: { ...d, ...pay } }
      } catch (error) {
        return { ...fail(error), id: r.id, data: d }
      }
    },

    /** Browser finished Stripe confirm: read the PaymentIntent server-side and settle (never trust the browser). */
    completeEnrolmentCheckout: async (_: unknown, args: any, context: Ctx) => {
      try {
        const prisma = context.sudo().prisma
        const actor = await actorOf(context)
        const ps = await prisma.paymentSession.findUnique({ where: { id: String(args.paymentSessionId) }, select: { id: true, invoiceId: true, familyId: true } })
        if (!ps?.invoiceId) throw new CommandError('That payment was not found.')
        await requireInvoiceAccess(prisma, actor, ps.invoiceId)
        const settled = await refreshPaymentSession(prisma, ps.id)
        const invoice = await prisma.invoice.findUnique({ where: { id: ps.invoiceId }, select: { status: true, fulfilment: true } })
        const f = (invoice.fulfilment ?? {}) as any
        const enrollment = f.enrollmentId ? await prisma.enrollment.findUnique({ where: { id: f.enrollmentId }, select: { id: true, status: true } }) : null
        return { success: settled.status === 'captured', error: settled.status === 'captured' ? null : settled.parked ? 'The payment needs a check by the centre.' : settled.status === 'failed' ? 'The card was not charged. Please try again.' : null, id: enrollment?.id ?? null, data: { status: settled.status, invoiceStatus: invoice.status, enrollmentStatus: enrollment?.status ?? null, bookedSeats: f.bookedSeats ?? 0, missedSeats: f.missedSeats ?? 0 } }
      } catch (error) { return fail(error) }
    },

    cancelEnrolmentCheckout: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'cancelEnrolmentCheckout', input: { e: args.enrollmentId } }, async (tx, actor) => {
      const e = await tx.enrollment.findUnique({ where: { id: String(args.enrollmentId) }, select: { id: true, familyId: true, locationId: true, status: true } })
      if (!e) throw new CommandError('That enrolment was not found.')
      if (!canAt(actor, 'canManageFamilies', e.locationId)) await requireGuardianOf(tx, actor, e.familyId)
      if (e.status !== 'pending_payment') throw new CommandError('Only an unpaid checkout can be cancelled here.')
      await cancelPendingEnrolment(tx, e.id, 'Checkout cancelled', actor!.userId)
      return { id: e.id }
    }),

    purchasePackage: async (_: unknown, args: any, context: Ctx) => {
      const r = await runCommand(context, { name: 'purchasePackage', idempotencyKey: keyOf(args), input: { p: args.packageId, s: args.studentId } }, async (tx, actor) => {
        const student = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { id: true, familyId: true, firstName: true } })
        if (!student) throw new CommandError('That student was not found.')
        const family = await tx.family.findUnique({ where: { id: student.familyId }, select: { primaryLocationId: true } })
        if (!canAt(actor, 'canManageBilling', family?.primaryLocationId ?? null)) await requireGuardianOf(tx, actor, student.familyId)
        const pkg = await tx.package.findUnique({ where: { id: String(args.packageId) }, select: { id: true, name: true, programId: true, hours: true, price: true, status: true } })
        if (!pkg || pkg.status !== 'published') throw new CommandError('That package is not on sale.')
        const enrollment = pkg.programId ? await tx.enrollment.findFirst({ where: { studentId: student.id, programId: pkg.programId, status: { in: ['active', 'matched', 'paused', 'ended'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, locationId: true } }) : null
        const sp = await tx.studentPackage.create({ data: { family: { connect: { id: student.familyId } }, student: { connect: { id: student.id } }, package: { connect: { id: pkg.id } }, hours: pkg.hours, price: pkg.price, status: 'pending_payment', createdBy: { connect: { id: actor!.userId } } } })
        const invoice = await createInvoice(tx, {
          familyId: student.familyId, locationId: enrollment?.locationId ?? family?.primaryLocationId ?? null, kind: 'package', actorId: actor!.userId,
          lines: [{ description: `${pkg.name} (${pkg.hours} hours, ${student.firstName})`, kind: 'package', unitAmount: pkg.price, studentId: student.id, programId: pkg.programId, studentPackageId: sp.id }],
          fulfilment: { kind: 'package', studentPackageId: sp.id, programId: pkg.programId, enrollmentId: enrollment?.id ?? null },
        })
        await tx.studentPackage.update({ where: { id: sp.id }, data: { invoice: { connect: { id: invoice.id } } } })
        await recordChange(tx, { type: 'StudentPackage', id: sp.id, to: 'pending_payment', actorId: actor!.userId })
        if (invoice.total === 0) {
          await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'paid' } })
          await fulfilInvoice(tx, invoice.id)
        }
        return { id: sp.id, data: { studentPackageId: sp.id, invoiceId: invoice.id, total: invoice.total, currency: invoice.currency } }
      })
      if (!r.success || !r.data || (r.data as any).total === 0) return r
      try {
        const pay = await payStep(context, (r.data as any).invoiceId, context.session?.itemId ?? null, { saveCard: Boolean(args.saveCard), useSavedCard: Boolean(args.useSavedCard), attemptKey: `pkg:${r.id}` })
        return { ...r, data: { ...(r.data as object), ...pay } }
      } catch (error) { return { ...fail(error), id: r.id, data: r.data } }
    },

    payInvoice: async (_: unknown, args: any, context: Ctx) => {
      try {
        const prisma = context.sudo().prisma
        const actor = await actorOf(context)
        if (!actor) throw new CommandError('Sign in to continue.')
        const { invoice } = await requireInvoiceAccess(prisma, actor, String(args.invoiceId))
        if (!['open', 'partially_paid'].includes(invoice.status)) throw new CommandError('This invoice has nothing to pay.')
        const pay = await payStep(context, invoice.id, actor.userId, { saveCard: Boolean(args.saveCard), useSavedCard: Boolean(args.useSavedCard) })
        return { success: true, error: null, id: invoice.id, data: pay }
      } catch (error) { return fail(error) }
    },

    refreshPayment: async (_: unknown, args: any, context: Ctx) => {
      try {
        const prisma = context.sudo().prisma
        const actor = await actorOf(context)
        const ps = await prisma.paymentSession.findUnique({ where: { id: String(args.paymentSessionId) }, select: { id: true, invoiceId: true } })
        if (!ps?.invoiceId) throw new CommandError('That payment was not found.')
        await requireInvoiceAccess(prisma, actor, ps.invoiceId)
        const settled = await refreshPaymentSession(prisma, ps.id)
        return { success: true, error: null, id: ps.id, data: settled }
      } catch (error) { return fail(error) }
    },

    createSetupIntent: async (_: unknown, _args: any, context: Ctx) => {
      try {
        const prisma = context.sudo().prisma
        const actor = await actorOf(context)
        if (!actor) throw new CommandError('Sign in to continue.')
        const familyId = (await transaction(prisma, async (tx) => (await import('../lib/actor')).guardianFamily(tx, actor, true))) as string
        const keys = await stripeKeys(prisma)
        if (!keys.secretKey) throw new CommandError('Card payments are not set up yet.')
        await ensureProviders(prisma)
        const customer = await ensureCustomer(prisma, keys, familyId)
        const session = await prisma.paymentSession.create({ data: { family: { connect: { id: familyId } }, purpose: 'setup', idempotencyKeyHash: `setup:${familyId}:${Date.now()}:${Math.random().toString(36).slice(2)}`, status: 'pending', amount: 0, ...(keys.providerId ? { paymentProvider: { connect: { id: keys.providerId } } } : {}), createdBy: { connect: { id: actor.userId } } } })
        const si = await stripe.createSetupIntent(keys, { customer, metadata: { familyId, paymentSessionId: session.id } }, `setup:${session.id}`)
        await prisma.paymentSession.update({ where: { id: session.id }, data: { providerPaymentId: si.id, clientSecret: si.client_secret || '' } })
        return { success: true, error: null, id: session.id, data: { setupIntentId: si.id, clientSecret: si.client_secret, publishableKey: keys.publishableKey } }
      } catch (error) { return fail(error) }
    },

    setDefaultPaymentMethod: async (_: unknown, args: any, context: Ctx) => {
      try {
        const prisma = context.sudo().prisma
        const actor = await actorOf(context)
        const session = await prisma.paymentSession.findFirst({ where: { providerPaymentId: String(args.setupIntentId), purpose: 'setup' }, select: { id: true, familyId: true } })
        if (!session) throw new CommandError('That card setup was not found.')
        await requireGuardianOf(prisma, actor, session.familyId)
        const keys = await stripeKeys(prisma)
        const si = await stripe.retrieveSetupIntent(keys, String(args.setupIntentId))
        const outcome = await settleSetupIntent(prisma, si)
        if (outcome !== 'card_saved') throw new CommandError('The card was not saved. Please try again.')
        const family = await prisma.family.findUnique({ where: { id: session.familyId }, select: { defaultPaymentMethodLabel: true } })
        return { success: true, error: null, id: session.familyId, data: { label: family.defaultPaymentMethodLabel } }
      } catch (error) { return fail(error) }
    },

    recordOfflinePayment: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'recordOfflinePayment', idempotencyKey: keyOf(args), input: { i: args.invoiceId, a: args.amount, m: args.method, r: args.reference ?? '' } }, async (tx, actor) => {
      const invoice = await tx.invoice.findUnique({ where: { id: String(args.invoiceId) }, select: { id: true, familyId: true, locationId: true, currency: true } })
      if (!invoice) throw new CommandError('That invoice was not found.')
      requireFlag(actor, 'canManageBilling', invoice.locationId)
      if (!(OFFLINE_METHODS as readonly string[]).includes(args.method)) throw new CommandError('Pick cash, cheque or bank transfer. Card payments go through the card form.')
      const amount = requireInt(args.amount, 'Amount', 1)
      const reference = optionalString(args.reference, 200)
      if (args.method !== 'cash' && !reference) throw new CommandError('Enter the cheque number or transfer reference.')
      const r = await applyPayment(tx, invoice.id, amount)
      const payment = await tx.payment.create({ data: { invoice: { connect: { id: invoice.id } }, family: { connect: { id: invoice.familyId } }, amount, currency: invoice.currency, method: args.method, reference, status: 'captured', receivedBy: { connect: { id: actor!.userId } } } })
      await recordChange(tx, { type: 'Payment', id: payment.id, to: 'captured', actorId: actor!.userId, reason: args.method, data: { invoiceId: invoice.id, amount } })
      return { id: payment.id, data: { invoiceStatus: r.to } }
    }),

    refundPayment: async (_: unknown, args: any, context: Ctx) => {
      let refundId: string | null = null
      const r = await runCommand(context, { name: 'refundPayment', idempotencyKey: keyOf(args), input: { p: args.paymentId, a: args.amount } }, async (tx, actor) => {
        const payment = await tx.payment.findUnique({ where: { id: String(args.paymentId) }, select: { id: true, invoiceId: true, amount: true, refundedAmount: true, method: true, invoice: { select: { locationId: true, kind: true, fulfilment: true } } } })
        if (!payment) throw new CommandError('That payment was not found.')
        requireFlag(actor, 'canIssueRefunds', payment.invoice?.locationId ?? null)
        const amount = requireInt(args.amount, 'Amount', 1)
        const reason = requireString(args.reason, 'Reason', 500)
        const refund = await requestRefund(tx, { paymentId: payment.id, amount, reason, actorId: actor!.userId, key: `refund:${payment.id}:${keyOf(args) ?? `${amount}:${Date.now()}`}` })
        refundId = refund.id
        // W8: a package refund also removes the unused credit it paid for.
        const removedMinutes = payment.invoiceId && ['package', 'enrolment'].includes(payment.invoice?.kind ?? '') ? await removePackageCredit(tx, payment.invoiceId, actor!.userId) : 0
        return { id: refund.id, data: { refundId: refund.id, status: refund.status, removedMinutes }, after: async () => { await processRefund(context.sudo().prisma, refund.id) } }
      })
      if (r.success && refundId) {
        const after = await context.sudo().prisma.refund.findUnique({ where: { id: refundId }, select: { status: true, failureReason: true } })
        return { ...r, data: { ...(r.data as object), status: after.status, failureReason: after.failureReason || null } }
      }
      return r
    },

    issueCreditNote: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'issueCreditNote', idempotencyKey: keyOf(args), input: { i: args.invoiceId, a: args.amount } }, async (tx, actor) => {
      const invoice = await tx.invoice.findUnique({ where: { id: String(args.invoiceId) }, select: { id: true, locationId: true } })
      if (!invoice) throw new CommandError('That invoice was not found.')
      requireFlag(actor, 'canManageBilling', invoice.locationId)
      const amount = requireInt(args.amount, 'Amount', 1)
      const reason = requireString(args.reason, 'Reason', 500)
      const r = await applyToInvoice(tx, invoice.id, amount, 'amountCredited')
      const note = await tx.creditNote.create({ data: { invoice: { connect: { id: invoice.id } }, amount, reason, issuedBy: { connect: { id: actor!.userId } } } })
      await recordChange(tx, { type: 'CreditNote', id: note.id, to: 'issued', actorId: actor!.userId, reason, data: { invoiceId: invoice.id, amount } })
      if (r.to === 'paid') await fulfilInvoice(tx, invoice.id)
      return { id: note.id, data: { invoiceStatus: r.to } }
    }),

    voidInvoice: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'voidInvoice', input: { i: args.invoiceId } }, async (tx, actor) => {
      const invoice = await tx.invoice.findUnique({ where: { id: String(args.invoiceId) }, select: { id: true, locationId: true, fulfilment: true } })
      if (!invoice) throw new CommandError('That invoice was not found.')
      requireFlag(actor, 'canManageBilling', invoice.locationId)
      const reason = requireString(args.reason, 'Reason', 500)
      const f = (invoice.fulfilment ?? {}) as any
      const cancelled = f.kind === 'enrolment' && f.enrollmentId ? await cancelPendingEnrolment(tx, f.enrollmentId, reason, actor!.userId) : ''
      if (!cancelled && !(await voidInvoiceIfUnpaid(tx, invoice.id, reason, actor!.userId))) throw new CommandError('Only an invoice with no payments can be voided. Use a credit note instead.')
      return { id: invoice.id }
    }),
  },
}
