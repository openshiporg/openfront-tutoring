import { list } from '@keystone-6/core'
import { allOperations, denyAll } from '@keystone-6/core/access'
import { checkbox, decimal, float, image, integer, json, password, relationship, select, text, timestamp } from '@keystone-6/core/fields'

import { hasFlag, isOwner, isSignedIn, permissions, rules, scopedAccess, type Session } from '../access'
import { trackingFields } from './trackingFields'
import { choice, options, prismaExtras, publishField, serverInt, serverTime } from './fields'

const ownerOnly = ({ session }: { session?: Session }) => isOwner(session)
const staffRead = ({ session }: { session?: Session }) => hasFlag(session, 'canAccessDashboard')

// §5.1 User
export const User = list({
  access: {
    operation: {
      ...allOperations(isSignedIn),
      // Guardians register through `registerGuardian` (a server mutation); staff are added by managers.
      create: permissions.canManageStaff,
      delete: permissions.canManagePeople,
    },
    filter: { query: rules.canReadPeople, update: rules.canUpdatePeople },
  },
  ui: {
    listView: { initialColumns: ['name', 'email', 'role', 'phone'] },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return 'edit'
        if (session?.itemId === item?.id) return 'edit'
        return 'read'
      },
    },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    email: text({ isFilterable: true, isOrderable: true, isIndexed: 'unique', validation: { isRequired: true } }),
    password: password({
      access: {
        read: denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id,
      },
      validation: { isRequired: true },
    }),
    phone: text(),
    role: relationship({
      ref: 'Role.assignedTo',
      access: {
        create: ({ session }) => hasFlag(session, 'canManageStaff') || hasFlag(session, 'canManagePeople'),
        update: ({ session }) => hasFlag(session, 'canManageStaff') || hasFlag(session, 'canManagePeople'),
      },
    }),
    tutor: relationship({ ref: 'Tutor.user', access: { update: permissions.canManageTutors, create: permissions.canManageTutors } }),
    family: relationship({ ref: 'Family.guardians', access: { update: permissions.canManageFamilies, create: permissions.canManageFamilies } }),
    locationMemberships: relationship({ ref: 'LocationMembership.user', many: true, access: { create: permissions.canManageStaff, update: permissions.canManageStaff } }),
    onboardingStatus: select({
      type: 'string',
      options: options(['not_started', 'in_progress', 'completed', 'dismissed']),
      defaultValue: 'not_started',
      access: { update: ownerOnly, create: ownerOnly },
    }),
    notifyByEmail: checkbox({ defaultValue: true }),
    lastLoginAt: serverTime(),
    ...trackingFields,
  },
})

// §5.1 Role
export const Role = list({
  access: {
    operation: { ...allOperations(permissions.canManageRoles), query: isSignedIn },
  },
  ui: {
    listView: { initialColumns: ['name', 'assignedTo'] },
    itemView: { defaultFieldMode: (args) => (permissions.canManageRoles(args) ? 'edit' : 'read') },
  },
  fields: {
    name: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    canAccessDashboard: checkbox({ defaultValue: false }),
    canManageSettings: checkbox({ defaultValue: false }),
    canManageStaff: checkbox({ defaultValue: false }),
    canManageLocations: checkbox({ defaultValue: false }),
    canManagePrograms: checkbox({ defaultValue: false }),
    canManageLeads: checkbox({ defaultValue: false }),
    canManageFamilies: checkbox({ defaultValue: false }),
    canManageSchedule: checkbox({ defaultValue: false }),
    canMarkAttendance: checkbox({ defaultValue: false }),
    canManageBilling: checkbox({ defaultValue: false }),
    canIssueRefunds: checkbox({ defaultValue: false }),
    canManagePayroll: checkbox({ defaultValue: false }),
    canViewReports: checkbox({ defaultValue: false }),
    canManageTutors: checkbox({ defaultValue: false }),
    isTutor: checkbox({ defaultValue: false }),
    // Starter people/role administration
    canSeeOtherPeople: checkbox({ defaultValue: false }),
    canEditOtherPeople: checkbox({ defaultValue: false }),
    canManagePeople: checkbox({ defaultValue: false }),
    canManageRoles: checkbox({ defaultValue: false }),
    assignedTo: relationship({ ref: 'User.role', many: true, ui: { itemView: { fieldMode: 'read' } } }),
    ...trackingFields,
  },
})

// §5.1 Business (singleton)
export const Business = list({
  isSingleton: true,
  access: {
    operation: { query: staffRead, create: ownerOnly, update: ownerOnly, delete: () => false },
  },
  graphql: { plural: 'Businesses' },
  fields: {
    name: text({ validation: { isRequired: true }, defaultValue: '' }),
    legalName: text(),
    logo: image({ storage: 'my_images' }),
    currency: text({ defaultValue: 'USD', validation: { isRequired: true, length: { min: 3, max: 3 } } }),
    country: text({ defaultValue: 'US' }),
    supportEmail: text(),
    careersEmail: text({ ui: { description: 'Shown as "Work with us" in the storefront footer.' } }),
    phone: text(),
    brandPrimary: text({ defaultValue: '#1f5f8b' }),
    brandAccent: text({ defaultValue: '#f2a541' }),
    about: text({ ui: { displayMode: 'textarea' } }),
    socialLinks: json({ defaultValue: {} }),
    kind: choice(['centre', 'test_prep', 'agency', 'mixed'], 'centre'),
    // Sequential invoice numbers, advanced with a guarded update.
    nextInvoiceNumber: serverInt(1001),
    onboardedAt: serverTime(),
    ...trackingFields,
  },
})

// §5.1 BusinessSettings (singleton). Every D4 to D8 default lives here.
export const BusinessSettings = list({
  isSingleton: true,
  access: {
    operation: { query: staffRead, create: ownerOnly, update: ownerOnly, delete: () => false },
  },
  graphql: { plural: 'BusinessSettingsList' },
  fields: {
    cancellationWindowHours: integer({ defaultValue: 24, validation: { isRequired: true, min: 0 } }),
    lateCancelCharged: checkbox({ defaultValue: true }),
    noShowCharged: checkbox({ defaultValue: true }),
    excusedAbsencesPerMonth: integer({ defaultValue: 1, validation: { isRequired: true, min: 0 } }),
    makeUpExpiryDays: integer({ defaultValue: 60, validation: { isRequired: true, min: 1 } }),
    membershipRolloverPeriods: integer({ defaultValue: 1, validation: { isRequired: true, min: 0 } }),
    membershipCancelNoticeDays: integer({ defaultValue: 30, validation: { isRequired: true, min: 0 } }),
    pauseMinDays: integer({ defaultValue: 14, validation: { isRequired: true, min: 1 } }),
    pauseMaxDays: integer({ defaultValue: 28, validation: { isRequired: true, min: 1 } }),
    pausesPerYear: integer({ defaultValue: 1, validation: { isRequired: true, min: 0 } }),
    pastDueRetryDays: json({ defaultValue: [3, 7] }),
    suspendAfterDays: integer({ defaultValue: 10, validation: { isRequired: true, min: 1 } }),
    siblingDiscountPercent: integer({ defaultValue: 10, validation: { isRequired: true, min: 0, max: 100 } }),
    offerExpiryHours: integer({ defaultValue: 24, validation: { isRequired: true, min: 1 } }),
    freeRematches: integer({ defaultValue: 1, validation: { isRequired: true, min: 0 } }),
    trialChargedOnRematch: checkbox({ defaultValue: false }),
    tutorPaidOnLateCancelPercent: integer({ defaultValue: 100, validation: { isRequired: true, min: 0, max: 100 } }),
    tutorPaidOnNoShowPercent: integer({ defaultValue: 100, validation: { isRequired: true, min: 0, max: 100 } }),
    payrollPeriodDays: integer({ defaultValue: 14, validation: { isRequired: true, min: 1 } }),
    progressReportEverySessions: integer({ defaultValue: 12, validation: { isRequired: true, min: 1 } }),
    progressReportEveryWeeks: integer({ defaultValue: 4, validation: { isRequired: true, min: 1 } }),
    reassessEveryWeeks: integer({ defaultValue: 12, validation: { isRequired: true, min: 1 } }),
    lowBalanceMinutes: integer({ defaultValue: 120, validation: { isRequired: true, min: 0 } }),
    bookingHorizonDays: integer({ defaultValue: 42, validation: { isRequired: true, min: 1 } }),
    attendanceEditWindowHours: integer({ defaultValue: 48, validation: { isRequired: true, min: 1 } }),
    assessmentCancelRefundHours: integer({ defaultValue: 24, validation: { isRequired: true, min: 0 } }),
    assessmentFeeKeptOnLateCancel: checkbox({ defaultValue: true }),
    enrolmentFeeWaivedWithinDays: integer({ defaultValue: 90, validation: { isRequired: true, min: 0 } }),
    frontDeskRefundLimit: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 }, ui: { description: 'Largest refund (minor units) front desk may issue. 0 means none.' } }),
    reopenWindowDays: integer({ defaultValue: 14, validation: { isRequired: true, min: 0 } }),
    policiesText: text({ ui: { displayMode: 'textarea' }, defaultValue: '' }),
    // Daily jobs: the secret for POST /api/jobs/daily is generated by onboarding; only its hash is stored.
    jobsSecretHash: text({ access: { read: denyAll, create: () => false, update: () => false }, ui: { itemView: { fieldMode: 'hidden' }, createView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' } } }),
    lastDailyJobsAt: serverTime(),
    ...trackingFields,
  },
})

// §5.1 Location
export const Location = list({
  access: {
    operation: { query: isSignedIn, create: permissions.canManageLocations, update: permissions.canManageLocations, delete: ownerOnly },
    filter: { query: ({ session }) => hasFlag(session, 'canAccessDashboard') },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[a-z0-9-]+$/, explanation: 'Use lowercase letters, numbers and dashes.' } } }),
    addressLine1: text(),
    addressLine2: text(),
    city: text(),
    region: text(),
    postalCode: text(),
    country: text({ defaultValue: 'US' }),
    lat: float(),
    lng: float(),
    phone: text(),
    email: text(),
    timezone: text({ defaultValue: 'America/New_York', validation: { isRequired: true } }),
    openingHours: json({ defaultValue: {}, ui: { description: 'By weekday: { "mon": [["15:00","20:00"]], ... }' } }),
    taxRatePercent: decimal({ precision: 6, scale: 3, defaultValue: '0' }),
    photo: image({ storage: 'my_images' }),
    description: text({ ui: { displayMode: 'textarea' } }),
    status: publishField(['active', 'coming_soon', 'closed'], 'active', 'canManageLocations'),
    rooms: relationship({ ref: 'Room.location', many: true }),
    closures: relationship({ ref: 'Closure.location', many: true }),
    memberships: relationship({ ref: 'LocationMembership.location', many: true }),
    programs: relationship({ ref: 'Program.locations', many: true }),
    tutors: relationship({ ref: 'Tutor.locations', many: true }),
    ...trackingFields,
  },
})

export const LocationMembership = list({
  access: scopedAccess({ read: 'canAccessDashboard', write: 'canManageStaff', location: 'location' }),
  db: { extendPrismaSchema: prismaExtras('@@unique([userId, locationId])') },
  ui: { listView: { initialColumns: ['user', 'location', 'role', 'status'] } },
  fields: {
    user: relationship({ ref: 'User.locationMemberships', db: { foreignKey: true } }),
    location: relationship({ ref: 'Location.memberships', db: { foreignKey: true } }),
    role: choice(['manager', 'front_desk', 'tutor'], 'front_desk'),
    status: choice(['active', 'inactive'], 'active'),
    ...trackingFields,
  },
})

export const Room = list({
  access: scopedAccess({ read: 'canAccessDashboard', write: 'canManageLocations', location: 'location' }),
  fields: {
    location: relationship({ ref: 'Location.rooms' }),
    name: text({ validation: { isRequired: true } }),
    capacity: integer({ defaultValue: 4, validation: { isRequired: true, min: 1 } }),
    kind: choice(['room', 'table', 'online'], 'room'),
    status: choice(['active', 'inactive'], 'active'),
    ...trackingFields,
  },
})

export const Closure = list({
  access: scopedAccess({ read: 'canAccessDashboard', write: 'canManageSchedule', location: 'location' }),
  fields: {
    location: relationship({ ref: 'Location.closures' }),
    startsOn: timestamp({ validation: { isRequired: true } }),
    endsOn: timestamp({ validation: { isRequired: true } }),
    reason: text({ validation: { isRequired: true } }),
    ...trackingFields,
  },
  hooks: {
    validate: {
      create: ({ resolvedData, addValidationError }) => {
        if (resolvedData.startsOn && resolvedData.endsOn && new Date(resolvedData.endsOn) < new Date(resolvedData.startsOn)) addValidationError('The closure must end after it starts.')
      },
    },
  },
})

