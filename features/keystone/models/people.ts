import { list } from '@keystone-6/core'
import { checkbox, file, image, integer, json, multiselect, relationship, text, timestamp, virtual } from '@keystone-6/core/fields'
import { graphql } from '@keystone-6/core'

import { anyOf, guardianFilter, hasFlag, isOwner, scopedAccess, staffFilter, type Session } from '../access'
import { trackingFields } from './trackingFields'
import { choice, DELIVERY_MODES, money, options, prismaExtras, serverRel, serverText, serverTime, statusField } from './fields'

type Args = { session?: Session; context?: any; item?: any }
const staff = (flag: Parameters<typeof hasFlag>[1]) => ({ session }: Args) => hasFlag(session, flag)

/** Students a tutor teaches: an enrolment assigned to them, or a booking in one of their sessions. */
export function assignedStudentFilter(session: Session) {
  const me = { user: { id: { equals: session.itemId } } }
  return {
    OR: [
      { enrolments: { some: { tutor: me } } },
      { bookings: { some: { session: { tutor: me } } } },
    ],
  }
}

/** §5.8: medical notes for staff, the student's guardians, and assigned tutors only. */
async function canReadMedicalNotes({ session, context, item }: Args) {
  if (!session || !item) return false
  if (hasFlag(session, 'canManageFamilies')) return true
  if (hasFlag(session, 'isTutor')) {
    const count = await context.sudo().prisma.student.count({ where: { id: item.id, OR: [
      { enrolments: { some: { tutor: { userId: session.itemId } } } },
      { bookings: { some: { session: { tutor: { userId: session.itemId } } } } },
    ] } })
    if (count > 0) return true
  }
  const guardian = await context.sudo().prisma.family.count({ where: { id: item.familyId, guardians: { some: { id: session.itemId } } } })
  return guardian > 0
}

// §5.3 Family
export const Family = list({
  access: {
    operation: { query: ({ session }: Args) => Boolean(session), create: staff('canManageFamilies'), update: staff('canManageFamilies'), delete: ({ session }: Args) => isOwner(session) },
    filter: {
      query: ({ session }: Args) => anyOf(staffFilter(session, 'canManageFamilies', 'primaryLocation'), guardianFilter(session, '')),
      update: ({ session }: Args) => staffFilter(session, 'canManageFamilies', 'primaryLocation'),
      delete: ({ session }: Args) => staffFilter(session, 'canManageFamilies', 'primaryLocation'),
    },
  },
  ui: { listView: { initialColumns: ['name', 'billingEmail', 'primaryLocation', 'status'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    guardians: relationship({ ref: 'User.family', many: true }),
    students: relationship({ ref: 'Student.family', many: true }),
    primaryLocation: relationship({ ref: 'Location' }),
    billingEmail: text({ isIndexed: true }),
    phone: text(),
    addressLine1: text(),
    addressLine2: text(),
    city: text(),
    region: text(),
    postalCode: text(),
    country: text(),
    // Provider references only; card data never touches this database.
    stripeCustomerId: text({ access: { read: staff('canManageBilling'), create: () => false, update: () => false }, ui: { itemView: { fieldMode: 'read' } } }),
    defaultPaymentMethodId: text({ access: { read: staff('canManageBilling'), create: () => false, update: () => false }, ui: { itemView: { fieldMode: 'read' } } }),
    defaultPaymentMethodLabel: serverText(),
    payAsYouGoAllowed: checkbox({ defaultValue: false }),
    notes: text({ ui: { displayMode: 'textarea' }, access: { read: staff('canManageFamilies') } }),
    secondGuardianName: text(),
    secondGuardianEmail: text(),
    secondGuardianPhone: text(),
    status: choice(['active', 'inactive'], 'active'),
    sourceLead: relationship({ ref: 'Lead.convertedFamily' }),
    leads: relationship({ ref: 'Lead.family', many: true }),
    enrolments: relationship({ ref: 'Enrollment.family', many: true }),
    memberships: relationship({ ref: 'Membership.family', many: true }),
    invoices: relationship({ ref: 'Invoice.family', many: true }),
    creditGrants: relationship({ ref: 'CreditGrant.family', many: true }),
    messages: relationship({ ref: 'Message.family', many: true }),
    reviews: relationship({ ref: 'Review.family', many: true }),
    tasks: relationship({ ref: 'Task.family', many: true }),
    ...trackingFields,
  },
})

// §5.3 Student
export const Student = list({
  access: scopedAccess({ read: 'canManageFamilies', write: 'canManageFamilies', location: 'family.primaryLocation', guardian: 'family', tutorCustom: assignedStudentFilter }),
  ui: { listView: { initialColumns: ['firstName', 'lastName', 'family', 'level', 'status'] } },
  fields: {
    family: relationship({ ref: 'Family.students' }),
    firstName: text({ validation: { isRequired: true } }),
    lastName: text({ defaultValue: '' }),
    dateOfBirth: timestamp(),
    level: relationship({ ref: 'Level' }),
    school: text(),
    photo: image({ storage: 'my_images' }),
    learningNotes: text({ ui: { displayMode: 'textarea', description: 'Visible to tutors.' } }),
    medicalNotes: text({ ui: { displayMode: 'textarea', description: 'Staff, guardians and assigned tutors only.' }, access: { read: canReadMedicalNotes } }),
    pickupPeople: json({ defaultValue: [] }),
    status: statusField(['prospect', 'active', 'paused', 'alumni'], 'prospect'),
    enrolments: relationship({ ref: 'Enrollment.student', many: true }),
    assessments: relationship({ ref: 'Assessment.student', many: true }),
    plans: relationship({ ref: 'LearningPlan.student', many: true }),
    bookings: relationship({ ref: 'Booking.student', many: true }),
    ...trackingFields,
  },
})

// §5.3 Lead
export const Lead = list({
  access: scopedAccess({ read: 'canManageLeads', write: 'canManageLeads', location: 'location' }),
  ui: { listView: { initialColumns: ['guardianName', 'studentName', 'program', 'status', 'nextFollowUpAt'] } },
  fields: {
    guardianName: text({ validation: { isRequired: true } }),
    email: text({ isIndexed: true }),
    phone: text(),
    studentName: text(),
    level: relationship({ ref: 'Level' }),
    subjects: relationship({ ref: 'Subject', many: true }),
    program: relationship({ ref: 'Program' }),
    location: relationship({ ref: 'Location' }),
    preferredMode: choice(DELIVERY_MODES),
    preferredTimes: text(),
    area: text(),
    intent: choice(['enquiry', 'request_tutor'], 'enquiry'),
    message: text({ ui: { displayMode: 'textarea' } }),
    source: choice(['website', 'phone', 'walk_in', 'referral', 'other'], 'website'),
    status: statusField(['new', 'contacted', 'assessment_booked', 'assessed', 'proposal_sent', 'enrolled', 'lost'], 'new'),
    lostReason: serverText(),
    owner: relationship({ ref: 'User' }),
    family: relationship({ ref: 'Family.leads' }),
    convertedFamily: relationship({ ref: 'Family.sourceLead' }),
    student: relationship({ ref: 'Student' }),
    nextFollowUpAt: timestamp(),
    lastContactedAt: timestamp(),
    assessments: relationship({ ref: 'Assessment.lead', many: true }),
    ...trackingFields,
  },
})

// §5.3 Tutor
export const Tutor = list({
  access: scopedAccess({ read: 'canAccessDashboard', write: 'canManageTutors', location: 'locations[]', tutor: '' }),
  ui: { listView: { initialColumns: ['displayName', 'employmentType', 'status', 'publicProfile'] } },
  fields: {
    user: relationship({ ref: 'User.tutor' }),
    displayName: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[a-z0-9-]+$/, explanation: 'Use lowercase letters, numbers and dashes.' } } }),
    photo: image({ storage: 'my_images' }),
    photoUrl: text({ ui: { description: 'External photo URL used when no photo is uploaded.' } }),
    headline: text(),
    bio: text({ ui: { displayMode: 'textarea' } }),
    education: text(),
    yearsExperience: integer({ defaultValue: 0 }),
    employmentType: choice(['employee', 'contractor'], 'contractor'),
    deliveryModes: multiselect({ type: 'string', options: options(DELIVERY_MODES), defaultValue: ['in_centre'] }),
    travelAreas: text({ ui: { description: 'Areas served for in-home lessons, comma separated.' } }),
    travelRadiusKm: integer(),
    homeLocation: relationship({ ref: 'Location' }),
    locations: relationship({ ref: 'Location.tutors', many: true }),
    defaultPayRate: money({ access: { read: ({ session, item }: Args) => hasFlag(session, 'canManagePayroll') || hasFlag(session, 'canManageTutors') || item?.userId === session?.itemId } }),
    meetingUrl: text(),
    status: statusField(['onboarding', 'active', 'paused', 'inactive'], 'onboarding'),
    publicProfile: checkbox({ defaultValue: false }),
    averageRating: virtual({
      field: graphql.field({
        type: graphql.Float,
        async resolve(item: any, _args, context) {
          const rows = await context.sudo().prisma.review.aggregate({ where: { tutorId: item.id, status: 'published' }, _avg: { rating: true } })
          return rows._avg.rating ?? null
        },
      }),
    }),
    subjects: relationship({ ref: 'TutorSubject.tutor', many: true }),
    availability: relationship({ ref: 'TutorAvailability.tutor', many: true }),
    timeOff: relationship({ ref: 'TutorTimeOff.tutor', many: true }),
    credentials: relationship({ ref: 'TutorCredential.tutor', many: true }),
    application: relationship({ ref: 'TutorApplication.tutor' }),
    ...trackingFields,
  },
})

const ownTutorValidate = ({ resolvedData, item, context, addValidationError }: any) => {
  const session = context.session as Session | undefined
  if (hasFlag(session, 'canManageTutors')) return
  const tutorId = resolvedData.tutor?.connect?.id ?? item?.tutorId
  const mine = session?.data.tutor?.id
  if (!mine || tutorId !== mine) addValidationError('Tutors can only change their own records.')
}

export const TutorSubject = list({
  access: scopedAccess({ read: 'canAccessDashboard', write: 'canManageTutors', location: 'tutor.locations[]', tutor: 'tutor' }),
  db: { extendPrismaSchema: prismaExtras('@@unique([tutorId, subjectId])') },
  fields: {
    tutor: relationship({ ref: 'Tutor.subjects', db: { foreignKey: true } }),
    subject: relationship({ ref: 'Subject', db: { foreignKey: true } }),
    levelFrom: relationship({ ref: 'Level' }),
    levelTo: relationship({ ref: 'Level' }),
    payRate: integer({ ui: { description: 'Per hour, minor units. Overrides the tutor default.' }, access: { read: ({ session }: Args) => hasFlag(session, 'canManagePayroll') || hasFlag(session, 'canManageTutors') || hasFlag(session, 'isTutor') } }),
    ...trackingFields,
  },
})

export const TutorAvailability = list({
  access: scopedAccess({ read: 'canAccessDashboard', write: 'canManageTutors', location: 'tutor.locations[]', tutor: 'tutor', tutorWrite: true }),
  hooks: { validate: { create: ownTutorValidate, update: ownTutorValidate } },
  fields: {
    tutor: relationship({ ref: 'Tutor.availability' }),
    weekday: integer({ validation: { isRequired: true, min: 0, max: 6 }, defaultValue: 1, ui: { description: '0 = Sunday ... 6 = Saturday' } }),
    startMinute: integer({ validation: { isRequired: true, min: 0, max: 1440 }, defaultValue: 900 }),
    endMinute: integer({ validation: { isRequired: true, min: 0, max: 1440 }, defaultValue: 1200 }),
    mode: choice(DELIVERY_MODES, 'in_centre'),
    location: relationship({ ref: 'Location' }),
    effectiveFrom: timestamp(),
    effectiveTo: timestamp(),
    ...trackingFields,
  },
})

export const TutorTimeOff = list({
  access: scopedAccess({ read: 'canAccessDashboard', write: 'canManageTutors', location: 'tutor.locations[]', tutor: 'tutor', tutorWrite: true }),
  hooks: { validate: { create: ownTutorValidate, update: ownTutorValidate } },
  fields: {
    tutor: relationship({ ref: 'Tutor.timeOff' }),
    startsAt: timestamp({ validation: { isRequired: true } }),
    endsAt: timestamp({ validation: { isRequired: true } }),
    reason: text(),
    status: statusField(['requested', 'approved', 'declined'], 'requested'),
    ...trackingFields,
  },
})

export const TutorCredential = list({
  access: scopedAccess({ read: 'canManageTutors', write: 'canManageTutors', location: 'tutor.locations[]', tutor: 'tutor', tutorWrite: true }),
  hooks: { validate: { create: ownTutorValidate, update: ownTutorValidate } },
  fields: {
    tutor: relationship({ ref: 'Tutor.credentials' }),
    kind: choice(['background_check', 'id', 'teaching_certificate', 'degree', 'safeguarding'], 'background_check'),
    document: file({ storage: 'my_files' }),
    reference: text(),
    issuedAt: timestamp(),
    expiresAt: timestamp(),
    status: statusField(['pending', 'verified', 'expired', 'rejected'], 'pending'),
    verifiedBy: serverRel('User'),
    verifiedAt: serverTime(),
    ...trackingFields,
  },
})

export const TutorApplication = list({
  access: scopedAccess({ read: 'canManageTutors', write: 'canManageTutors', location: null }),
  ui: { listView: { initialColumns: ['name', 'email', 'status', 'createdAt'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    email: text({ validation: { isRequired: true }, isIndexed: true }),
    phone: text(),
    subjectsText: text(),
    subjects: relationship({ ref: 'Subject', many: true }),
    levels: text(),
    modes: multiselect({ type: 'string', options: options(DELIVERY_MODES), defaultValue: [] }),
    areas: text(),
    availability: json({ defaultValue: {} }),
    cv: file({ storage: 'my_files' }),
    references: json({ defaultValue: [] }),
    coverNote: text({ ui: { displayMode: 'textarea' } }),
    source: choice(['email', 'referral', 'job_board', 'walk_in', 'other'], 'email'),
    status: statusField(['applied', 'screening', 'interview', 'checks', 'approved', 'rejected', 'withdrawn'], 'applied'),
    reviewer: relationship({ ref: 'User' }),
    notes: text({ ui: { displayMode: 'textarea' } }),
    tutor: relationship({ ref: 'Tutor.application' }),
    ...trackingFields,
  },
})

