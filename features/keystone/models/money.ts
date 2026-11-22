import { list, graphql } from '@keystone-6/core'
import { denyAll } from '@keystone-6/core/access'
import { checkbox, integer, json, relationship, text, timestamp, virtual } from '@keystone-6/core/fields'

import { appendOnlyAccess, hasFlag, isOwner, scopedAccess, type Session } from '../access'
import { trackingFields } from './trackingFields'
import { choice, money, prismaExtras, serverInt, serverRel, serverText, serverTime, signedMoney, statusField } from './fields'

type Args = { session?: Session }

// §5.6 Membership
export const Membership = list({
  access: scopedAccess({ read: 'canManageBilling', write: false, location: 'enrollment.location', guardian: 'family' }),
  ui: { listView: { initialColumns: ['family', 'student', 'plan', 'status', 'currentPeriodEnd'] } },
  fields: {
    family: relationship({ ref: 'Family.memberships' }),
    student: relationship({ ref: 'Student' }),
    plan: relationship({ ref: 'MembershipPlan' }),
    enrollment: relationship({ ref: 'Enrollment.membership' }),
    status: statusField(['pending_payment', 'active', 'past_due', 'suspended', 'paused', 'cancelling', 'cancelled'], 'pending_payment'),
    price: serverInt(0),
    discountPercent: serverInt(0),
    sessionsPerPeriod: integer({ access: { create: () => false, update: () => false } }),
    weeklyCap: integer({ access: { create: () => false, update: () => false } }),
    startedAt: serverTime(),
    currentPeriodStart: serverTime(),
    currentPeriodEnd: serverTime(),
    pausedFrom: serverTime(),
    pausedUntil: serverTime(),
    pauseRequestedFrom: serverTime(),
    pauseRequestedUntil: serverTime(),
    cancelRequestedAt: serverTime(),
    endsAt: serverTime(),
    pastDueSince: serverTime(),
    lastPauseAt: serverTime(),
    pendingPlan: serverRel('MembershipPlan'),
    billingAttempts: relationship({ ref: 'BillingAttempt.membership', many: true }),
    grants: relationship({ ref: 'CreditGrant.membership', many: true }),
    ...trackingFields,
  },
})

export const StudentPackage = list({
  access: scopedAccess({ read: 'canManageBilling', write: false, location: 'invoice.location', guardian: 'family' }),
  fields: {
    family: relationship({ ref: 'Family' }),
    student: relationship({ ref: 'Student' }),
    package: relationship({ ref: 'Package' }),
    enrollment: relationship({ ref: 'Enrollment.studentPackage' }),
    hours: serverInt(0),
    price: serverInt(0),
    purchasedAt: serverTime(),
    expiresAt: serverTime(),
    invoice: serverRel('Invoice'),
    status: statusField(['pending_payment', 'active', 'exhausted', 'expired', 'refunded'], 'pending_payment'),
    grants: relationship({ ref: 'CreditGrant.studentPackage', many: true }),
    ...trackingFields,
  },
})

// §4.8 CreditGrant. minutesAvailable is the guarded balance: only ever moved by
// `UPDATE ... WHERE minutesAvailable >= x` inside a ledger command.
export const CreditGrant = list({
  access: scopedAccess({ read: 'canManageBilling', write: false, location: 'family.primaryLocation', guardian: 'family' }),
  db: { extendPrismaSchema: prismaExtras('@@index([familyId, studentId, status])') },
  ui: { listView: { initialColumns: ['family', 'student', 'kind', 'minutesGranted', 'minutesAvailable', 'expiresAt', 'status'] } },
  fields: {
    family: relationship({ ref: 'Family.creditGrants' }),
    student: relationship({ ref: 'Student' }),
    program: relationship({ ref: 'Program' }),
    kind: choice(['membership_period', 'package', 'make_up', 'goodwill', 'pay_as_you_go'], 'goodwill', { access: { create: () => false, update: () => false } }),
    membership: relationship({ ref: 'Membership.grants' }),
    studentPackage: relationship({ ref: 'StudentPackage.grants' }),
    sourceBooking: relationship({ ref: 'Booking.makeUpGrant' }),
    rolledFrom: serverRel('CreditGrant'),
    minutesGranted: serverInt(0),
    minutesAvailable: serverInt(0),
    unlimited: checkbox({ defaultValue: false, access: { create: () => false, update: () => false } }),
    weeklyCap: integer({ access: { create: () => false, update: () => false } }),
    expiresAt: serverTime(),
    periodStart: serverTime(),
    periodEnd: serverTime(),
    status: statusField(['active', 'exhausted', 'expired', 'refunded', 'voided'], 'active'),
    entries: relationship({ ref: 'CreditEntry.grant', many: true }),
    bookings: relationship({ ref: 'Booking.creditGrant', many: true }),
    ...trackingFields,
  },
})

// §4.8 CreditEntry: append only, for anyone.
export const CreditEntry = list({
  access: {
    ...appendOnlyAccess('canManageBilling'),
    filter: { query: scopedAccess({ read: 'canManageBilling', write: false, location: 'grant.family.primaryLocation', guardian: 'grant.family' }).filter.query },
  },
  db: { extendPrismaSchema: prismaExtras('@@index([grantId, type])') },
  fields: {
    grant: relationship({ ref: 'CreditGrant.entries', db: { foreignKey: true } }),
    type: choice(['grant', 'hold', 'release', 'debit', 'rollover_in', 'rollover_out', 'expire', 'refund', 'adjustment', 'reversal'], 'grant'),
    minutes: integer({ validation: { isRequired: true }, defaultValue: 0 }),
    booking: relationship({ ref: 'Booking', db: { foreignKey: true } }),
    note: text(),
    actor: relationship({ ref: 'User' }),
    ...trackingFields,
  },
})

// §4.10 Invoice
export const Invoice = list({
  access: scopedAccess({ read: 'canManageBilling', write: false, location: 'location', guardian: 'family', guardianWhere: { status: { not: { equals: 'draft' } } } }),
  ui: { listView: { initialColumns: ['number', 'family', 'kind', 'status', 'total', 'amountPaid', 'dueAt'] } },
  fields: {
    number: integer({ isIndexed: 'unique', access: { create: () => false, update: () => false } }),
    family: relationship({ ref: 'Family.invoices' }),
    location: relationship({ ref: 'Location' }),
    status: statusField(['draft', 'open', 'partially_paid', 'paid', 'void'], 'draft'),
    kind: choice(['assessment', 'enrolment', 'package', 'membership', 'pay_as_you_go', 'placement', 'manual'], 'manual'),
    issuedAt: serverTime(),
    dueAt: serverTime(),
    subtotal: serverInt(0),
    discount: serverInt(0),
    tax: serverInt(0),
    total: serverInt(0),
    amountPaid: serverInt(0),
    amountCredited: serverInt(0),
    currency: text({ defaultValue: 'USD', access: { create: () => false, update: () => false } }),
    promoCode: serverRel('PromoCode'),
    lines: relationship({ ref: 'InvoiceLine.invoice', many: true }),
    payments: relationship({ ref: 'Payment.invoice', many: true }),
    creditNotes: relationship({ ref: 'CreditNote.invoice', many: true }),
    paymentSessions: relationship({ ref: 'PaymentSession.invoice', many: true }),
    notes: text({ ui: { displayMode: 'textarea' } }),
    // What to do once paid (activate a membership, package, assessment, booking). Server only.
    fulfilment: json({ defaultValue: {}, access: { read: ({ session }: Args) => hasFlag(session, 'canManageBilling'), create: () => false, update: () => false } }),
    fulfilledAt: serverTime(),
    amountDue: virtual({ field: graphql.field({ type: graphql.Int, resolve: (item: any) => Math.max(0, item.total - item.amountPaid - item.amountCredited) }) }),
    ...trackingFields,
  },
})

export const InvoiceLine = list({
  access: scopedAccess({ read: 'canManageBilling', write: false, location: 'invoice.location', guardian: 'invoice.family', guardianWhere: { invoice: { status: { not: { equals: 'draft' } } } } }),
  fields: {
    invoice: relationship({ ref: 'Invoice.lines', db: { foreignKey: true } }),
    description: text({ validation: { isRequired: true } }),
    kind: choice(['assessment', 'enrolment_fee', 'membership', 'package', 'pay_as_you_go', 'placement', 'discount', 'manual'], 'manual'),
    quantity: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    unitAmount: signedMoney(),
    amount: signedMoney(),
    student: relationship({ ref: 'Student' }),
    program: relationship({ ref: 'Program' }),
    booking: relationship({ ref: 'Booking' }),
    membership: relationship({ ref: 'Membership' }),
    studentPackage: relationship({ ref: 'StudentPackage' }),
    assessment: relationship({ ref: 'Assessment' }),
    ...trackingFields,
  },
})

export const CreditNote = list({
  access: appendOnlyAccess('canManageBilling', 'invoice.location'),
  fields: {
    invoice: relationship({ ref: 'Invoice.creditNotes' }),
    amount: money(),
    reason: text({ validation: { isRequired: true } }),
    issuedBy: relationship({ ref: 'User' }),
    ...trackingFields,
  },
})

export const Payment = list({
  access: scopedAccess({ read: 'canManageBilling', write: false, location: 'invoice.location', guardian: 'family' }),
  fields: {
    invoice: relationship({ ref: 'Invoice.payments' }),
    family: relationship({ ref: 'Family' }),
    amount: money(),
    currency: text({ defaultValue: 'USD' }),
    method: choice(['card', 'cash', 'cheque', 'bank_transfer'], 'card'),
    reference: text(),
    status: statusField(['captured', 'refunded', 'partially_refunded', 'failed'], 'captured'),
    paymentSession: relationship({ ref: 'PaymentSession.payment' }),
    providerPaymentId: text({ isIndexed: 'unique', db: { isNullable: true } }),
    receivedBy: relationship({ ref: 'User' }),
    refundedAmount: serverInt(0),
    refunds: relationship({ ref: 'Refund.payment', many: true }),
    ...trackingFields,
  },
})

export const Refund = list({
  access: scopedAccess({ read: 'canManageBilling', write: false, location: 'payment.invoice.location', guardian: 'payment.family' }),
  fields: {
    payment: relationship({ ref: 'Payment.refunds' }),
    amount: money(),
    reason: text(),
    status: statusField(['requested', 'succeeded', 'failed', 'unknown'], 'requested'),
    providerRefundId: text(),
    idempotencyKey: text({ isIndexed: 'unique', access: { read: () => false } }),
    failureReason: serverText(),
    requestedBy: relationship({ ref: 'User' }),
    ...trackingFields,
  },
})

// §4.9 BillingAttempt. Unique (membership, periodStart, attemptNumber) so a double run cannot double charge.
export const BillingAttempt = list({
  access: scopedAccess({ read: 'canManageBilling', write: false, location: 'membership.enrollment.location' }),
  db: { extendPrismaSchema: prismaExtras('@@unique([membershipId, periodStart, attemptNumber])') },
  fields: {
    membership: relationship({ ref: 'Membership.billingAttempts', db: { foreignKey: true } }),
    periodStart: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    periodEnd: timestamp(),
    invoice: relationship({ ref: 'Invoice' }),
    attemptNumber: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    status: statusField(['pending', 'succeeded', 'failed', 'unknown'], 'pending'),
    amount: serverInt(0),
    requestHash: text({ access: { read: () => false } }),
    leaseExpiresAt: serverTime(),
    providerPaymentId: text(),
    failureCode: serverText(),
    failureMessage: serverText(),
    nextRetryAt: serverTime(),
    ...trackingFields,
  },
})

// §5.6 PayLine / PayrollRun (adapted from Barbershop Commission / CommissionPayout)
export const PayLine = list({
  access: scopedAccess({ read: 'canManagePayroll', write: false, location: 'session.location', tutor: 'tutor' }),
  db: { extendPrismaSchema: prismaExtras('@@index([tutorId, status])') },
  ui: { listView: { initialColumns: ['tutor', 'kind', 'minutes', 'amount', 'status', 'payrollRun'] } },
  fields: {
    tutor: relationship({ ref: 'Tutor', db: { foreignKey: true } }),
    session: relationship({ ref: 'Session.payLines', db: { foreignKey: true } }),
    booking: relationship({ ref: 'Booking.payLine' }),
    kind: choice(['session', 'late_cancel', 'no_show', 'trial', 'prep', 'training', 'bonus', 'deduction', 'adjustment'], 'session'),
    workedAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    minutes: integer({ defaultValue: 0, validation: { isRequired: true } }),
    rate: money(),
    amount: signedMoney(),
    status: statusField(['accrued', 'approved', 'paid', 'void'], 'accrued'),
    // One accrued line per session (group) or per booking (1:1): "<kind>:<sessionId|bookingId>" while not void.
    activeKey: text({ isIndexed: 'unique', db: { isNullable: true }, access: { read: () => true, create: () => false, update: () => false }, ui: { itemView: { fieldMode: 'hidden' } } }),
    payrollRun: relationship({ ref: 'PayrollRun.lines' }),
    voidReason: serverText(),
    note: text(),
    ...trackingFields,
  },
})

export const PayrollRun = list({
  // Generated create is omitted: `createPayrollRun` is the §5.9 command.
  graphql: { omit: { create: true } },
  access: scopedAccess({ read: 'canManagePayroll', write: false, location: 'location' }),
  fields: {
    location: relationship({ ref: 'Location' }),
    periodStart: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    periodEnd: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    status: statusField(['draft', 'approved', 'paid', 'cancelled'], 'draft'),
    lines: relationship({ ref: 'PayLine.payrollRun', many: true }),
    totalAmount: virtual({
      field: graphql.field({
        type: graphql.Int,
        async resolve(item: any, _a, context) {
          const r = await context.sudo().prisma.payLine.aggregate({ where: { payrollRunId: item.id, status: { not: 'void' } }, _sum: { amount: true } })
          return r._sum.amount ?? 0
        },
      }),
    }),
    totalMinutes: virtual({
      field: graphql.field({
        type: graphql.Int,
        async resolve(item: any, _a, context) {
          const r = await context.sudo().prisma.payLine.aggregate({ where: { payrollRunId: item.id, status: { not: 'void' } }, _sum: { minutes: true } })
          return r._sum.minutes ?? 0
        },
      }),
    }),
    approvedBy: serverRel('User'),
    approvedAt: serverTime(),
    paidAt: serverTime(),
    payments: json({ defaultValue: [], access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

// Copied from Barbershop, with `invoice` in place of `appointment` (§5.6).
export const PaymentProvider = list({
  access: {
    operation: {
      query: ({ session }: Args) => hasFlag(session, 'canManageBilling'),
      create: ({ session }: Args) => isOwner(session),
      update: ({ session }: Args) => isOwner(session),
      delete: () => false,
    },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    code: text({
      isIndexed: 'unique',
      validation: { isRequired: true, match: { regex: /^pp_[a-zA-Z0-9-_]+$/, explanation: 'Payment provider code must start with "pp_".' } },
    }),
    isInstalled: checkbox({ defaultValue: true }),
    isDefault: checkbox({ defaultValue: false }),
    // Write-only: Stripe keys entered in settings. Never returned through GraphQL.
    credentials: json({
      defaultValue: {},
      access: { read: denyAll, create: () => false, update: () => false },
      ui: { itemView: { fieldMode: 'hidden' }, createView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' } },
    }),
    credentialsSet: virtual({
      field: graphql.field({
        type: graphql.JSON,
        resolve: (item: any) => {
          const c = (item.credentials || {}) as Record<string, unknown>
          return { secretKey: Boolean(c.secretKey), publishableKey: typeof c.publishableKey === 'string' ? c.publishableKey : null, webhookSecret: Boolean(c.webhookSecret) }
        },
      }),
    }),
    metadata: json({ defaultValue: {} }),
    paymentSessions: relationship({ ref: 'PaymentSession.paymentProvider', many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields,
  },
})

export const PaymentSession = list({
  access: { operation: { query: ({ session }: Args) => hasFlag(session, 'canManageBilling'), create: () => false, update: () => false, delete: () => false } },
  fields: {
    invoice: relationship({ ref: 'Invoice.paymentSessions' }),
    paymentProvider: relationship({ ref: 'PaymentProvider.paymentSessions' }),
    payment: relationship({ ref: 'Payment.paymentSession' }),
    purpose: choice(['invoice', 'setup'], 'invoice'),
    family: relationship({ ref: 'Family' }),
    idempotencyKeyHash: text({ isIndexed: 'unique', validation: { isRequired: true }, access: { read: () => false } }),
    status: statusField(['pending', 'requires_action', 'authorized', 'captured', 'failed', 'cancelled', 'unknown', 'refunded', 'partially_refunded'], 'pending'),
    amount: integer({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    currencyCode: text({ defaultValue: 'USD', validation: { isRequired: true } }),
    providerPaymentId: text({ isIndexed: true }),
    // Handed to the browser for Stripe.js; never a secret.
    clientSecret: text({ access: { read: () => false } }),
    offSession: checkbox({ defaultValue: false }),
    failureMessage: text(),
    capturedAt: timestamp(),
    cancelledAt: timestamp(),
    refundedAmount: integer({ defaultValue: 0, validation: { min: 0 } }),
    metadata: json({ defaultValue: {} }),
    reviewReason: text({ ui: { description: 'Set when a webhook did not match (amount, currency, invoice) and was parked for review.' } }),
    ...trackingFields,
  },
})

export const PaymentWebhookEvent = list({
  access: appendOnlyAccess('canManageSettings'),
  fields: {
    replayKey: text({ isIndexed: 'unique', validation: { isRequired: true }, access: { read: () => false } }),
    providerCode: text({ validation: { isRequired: true } }),
    providerEventId: text({ validation: { isRequired: true } }),
    eventType: text({ validation: { isRequired: true } }),
    payloadHash: text({ validation: { isRequired: true }, access: { read: () => false } }),
    outcome: text({ ui: { description: 'applied, ignored, parked (with reason)' } }),
    processedAt: timestamp({ validation: { isRequired: true } }),
    ...trackingFields,
  },
})
