import { list } from '@keystone-6/core'
import { checkbox, image, integer, json, multiselect, relationship, text, timestamp, virtual } from '@keystone-6/core/fields'
import { graphql } from '@keystone-6/core'
import { document } from '@keystone-6/fields-document'

import { hasFlag, isSignedIn, permissions } from '../access'
import { trackingFields } from './trackingFields'
import { choice, DELIVERY_MODES, money, options, publishField, serverInt } from './fields'

// Catalogue rows are business-wide. Staff read them; managers write them. The public reads published rows through storefront queries.
const catalogueAccess = {
  operation: { query: isSignedIn, create: permissions.canManagePrograms, update: permissions.canManagePrograms, delete: permissions.canManagePrograms },
  filter: { query: ({ session }: any) => hasFlag(session, 'canAccessDashboard') },
}

const slug = () => text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[a-z0-9-]+$/, explanation: 'Use lowercase letters, numbers and dashes.' } } })

export const Subject = list({
  access: catalogueAccess,
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: slug(),
    category: choice(['maths', 'english', 'science', 'languages', 'test_prep', 'study_skills', 'other'], 'other'),
    description: text({ ui: { displayMode: 'textarea' } }),
    icon: text(),
    sortOrder: integer({ defaultValue: 0 }),
    programs: relationship({ ref: 'Program.subjects', many: true }),
    ...trackingFields,
  },
})

export const Level = list({
  access: catalogueAccess,
  fields: {
    name: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    sortOrder: integer({ defaultValue: 0, validation: { isRequired: true } }),
    kind: choice(['grade', 'exam', 'adult'], 'grade'),
    ...trackingFields,
  },
})

export const Program = list({
  access: catalogueAccess,
  ui: { listView: { initialColumns: ['name', 'format', 'deliveryModes', 'status'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: slug(),
    summary: text(),
    description: document({ formatting: true, links: true, dividers: true }),
    image: image({ storage: 'my_images' }),
    subjects: relationship({ ref: 'Subject.programs', many: true }),
    levelsFrom: relationship({ ref: 'Level' }),
    levelsTo: relationship({ ref: 'Level' }),
    deliveryModes: multiselect({ type: 'string', options: options(DELIVERY_MODES), defaultValue: ['in_centre'] }),
    format: choice(['one_to_one', 'small_group', 'class'], 'small_group'),
    maxStudentsPerSession: integer({ defaultValue: 4, validation: { isRequired: true, min: 1 } }),
    sessionMinutes: integer({ defaultValue: 60, validation: { isRequired: true, min: 15 } }),
    billingModel: choice(['managed', 'placement_fee'], 'managed'),
    requiresAssessment: checkbox({ defaultValue: true }),
    assessmentFee: money(),
    assessmentMinutes: integer({ defaultValue: 45, validation: { isRequired: true, min: 15 } }),
    allowsTrial: checkbox({ defaultValue: false }),
    placementFee: money(),
    payAsYouGoPrice: money({ ui: { description: 'Per session, minor units. 0 = not offered.' } }),
    locations: relationship({ ref: 'Location.programs', many: true }),
    status: publishField(['draft', 'published', 'archived'], 'draft', 'canManagePrograms'),
    featured: checkbox({ defaultValue: false }),
    outcomes: text({ ui: { displayMode: 'textarea' } }),
    faq: json({ defaultValue: [] }),
    plans: relationship({ ref: 'MembershipPlan.program', many: true }),
    packages: relationship({ ref: 'Package.program', many: true }),
    ...trackingFields,
  },
})

export const MembershipPlan = list({
  access: catalogueAccess,
  fields: {
    name: text({ validation: { isRequired: true } }),
    program: relationship({ ref: 'Program.plans' }),
    sessionsPerPeriod: integer({ ui: { description: 'Sessions per monthly period. Empty = unlimited.' } }),
    weeklyCapForUnlimited: integer({ defaultValue: 5 }),
    price: money(),
    enrolmentFee: money(),
    minimumTermMonths: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    description: text({ ui: { displayMode: 'textarea' } }),
    features: json({ defaultValue: [] }),
    status: publishField(['draft', 'published', 'archived'], 'published', 'canManagePrograms'),
    sortOrder: integer({ defaultValue: 0 }),
    highlight: checkbox({ defaultValue: false }),
    ...trackingFields,
  },
})

export const Package = list({
  access: catalogueAccess,
  fields: {
    name: text({ validation: { isRequired: true } }),
    program: relationship({ ref: 'Program.packages' }),
    hours: integer({ validation: { isRequired: true, min: 1 }, defaultValue: 10 }),
    price: money(),
    expiryMonths: integer({ defaultValue: 6, validation: { isRequired: true, min: 1 } }),
    description: text({ ui: { displayMode: 'textarea' } }),
    status: publishField(['draft', 'published', 'archived'], 'published', 'canManagePrograms'),
    sortOrder: integer({ defaultValue: 0 }),
    pricePerHour: virtual({
      field: graphql.field({
        type: graphql.Int,
        resolve: (item: any) => (item.hours ? Math.round(item.price / item.hours) : 0),
      }),
    }),
    ...trackingFields,
  },
})

export const PromoCode = list({
  access: {
    operation: { query: permissions.canManageBilling, create: permissions.canManagePrograms, update: permissions.canManagePrograms, delete: permissions.canManagePrograms },
  },
  fields: {
    code: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[A-Z0-9_-]+$/, explanation: 'Use capital letters, numbers, dashes and underscores.' } } }),
    percentOff: integer({ validation: { min: 0, max: 100 } }),
    amountOff: integer({ validation: { min: 0 } }),
    appliesTo: choice(['plan', 'package', 'assessment', 'any'], 'any'),
    validFrom: timestamp(),
    validTo: timestamp(),
    maxUses: integer({ validation: { min: 0 } }),
    uses: serverInt(0),
    ...trackingFields,
  },
  hooks: {
    validate: {
      create: ({ resolvedData, addValidationError }) => {
        if (!resolvedData.percentOff && !resolvedData.amountOff) addValidationError('Set a percent off or an amount off.')
      },
    },
  },
})
