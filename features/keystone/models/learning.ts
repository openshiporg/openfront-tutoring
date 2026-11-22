import { list, graphql } from '@keystone-6/core'
import { checkbox, file, float, integer, json, relationship, text, timestamp, virtual } from '@keystone-6/core/fields'

import { hasFlag, scopedAccess, type Session as AuthSession } from '../access'
import { assignedStudentFilter } from './people'
import { trackingFields } from './trackingFields'
import { activeKey, choice, DELIVERY_MODES, money, prismaExtras, serverInt, serverRel, serverText, serverTime, statusField } from './fields'

const nestStudent = (session: AuthSession) => ({ student: assignedStudentFilter(session) })

// §5.4 Assessment
export const Assessment = list({
  access: scopedAccess({
    read: 'canManageLeads', write: 'canManageLeads', location: 'location',
    guardian: 'family', guardianWhere: { status: { in: ['scheduled', 'completed', 'cancelled', 'no_show', 'requested'] } },
    tutor: 'assessor',
  }),
  db: { extendPrismaSchema: prismaExtras('@@index([assessorId, scheduledAt])', '@@index([roomId, scheduledAt])') },
  ui: { listView: { initialColumns: ['student', 'program', 'scheduledAt', 'status', 'assessor'] } },
  fields: {
    student: relationship({ ref: 'Student.assessments' }),
    family: relationship({ ref: 'Family' }),
    program: relationship({ ref: 'Program' }),
    subject: relationship({ ref: 'Subject' }),
    location: relationship({ ref: 'Location' }),
    room: relationship({ ref: 'Room' }),
    assessor: relationship({ ref: 'Tutor' }),
    assessorUser: relationship({ ref: 'User' }),
    mode: choice(DELIVERY_MODES, 'in_centre'),
    kind: choice(['initial', 're_assessment', 'parent_meeting'], 'initial'),
    scheduledAt: timestamp({ isIndexed: true }),
    minutes: integer({ defaultValue: 45, validation: { isRequired: true, min: 15 } }),
    status: statusField(['requested', 'scheduled', 'in_progress', 'completed', 'cancelled', 'no_show'], 'requested'),
    // Unique while scheduled: "<assessorId>:<startISO>" so two people cannot take one slot.
    slotKey: activeKey(),
    fee: money({ access: { update: () => false } }),
    feeRefunded: checkbox({ defaultValue: false, access: { create: () => false, update: () => false } }),
    invoice: serverRel('Invoice'),
    summary: text({ ui: { displayMode: 'textarea' } }),
    recommendation: text({ ui: { displayMode: 'textarea' } }),
    recommendedPlan: relationship({ ref: 'MembershipPlan' }),
    recommendedPackage: relationship({ ref: 'Package' }),
    recommendedSessionsPerWeek: integer(),
    results: relationship({ ref: 'AssessmentResult.assessment', many: true }),
    lead: relationship({ ref: 'Lead.assessments' }),
    cancelReason: serverText(),
    completedAt: serverTime(),
    rescheduledFrom: serverRel('Assessment'),
    ...trackingFields,
  },
})

export const AssessmentResult = list({
  access: scopedAccess({
    read: 'canManageLeads', write: 'canManageLeads', location: 'assessment.location',
    guardian: 'assessment.family', guardianWhere: { assessment: { status: { equals: 'completed' } } },
    tutor: 'assessment.assessor', tutorWrite: true,
  }),
  fields: {
    assessment: relationship({ ref: 'Assessment.results' }),
    skill: text({ validation: { isRequired: true } }),
    strand: text(),
    score: float({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    maxScore: float({ validation: { isRequired: true, min: 0 }, defaultValue: 10 }),
    levelEquivalent: text(),
    note: text(),
    percent: virtual({
      field: graphql.field({ type: graphql.Float, resolve: (item: any) => (item.maxScore ? Math.round((item.score / item.maxScore) * 1000) / 10 : null) }),
    }),
    ...trackingFields,
  },
})

// §5.4 LearningPlan
export const LearningPlan = list({
  access: scopedAccess({
    read: 'canManageFamilies', write: 'canManageFamilies', location: 'student.family.primaryLocation',
    guardian: 'student.family', guardianWhere: { status: { in: ['proposed', 'accepted', 'active', 'completed', 'declined'] } },
    tutorCustom: nestStudent, tutorWrite: true,
  }),
  fields: {
    student: relationship({ ref: 'Student.plans' }),
    subject: relationship({ ref: 'Subject' }),
    program: relationship({ ref: 'Program' }),
    version: serverInt(1),
    status: statusField(['draft', 'proposed', 'accepted', 'active', 'completed', 'archived', 'declined'], 'draft'),
    summary: text({ ui: { displayMode: 'textarea' } }),
    startDate: timestamp(),
    targetDate: timestamp(),
    sessionsPerWeek: integer({ defaultValue: 2 }),
    totalHours: integer(),
    recommendedPlan: relationship({ ref: 'MembershipPlan' }),
    recommendedPackage: relationship({ ref: 'Package' }),
    baselineAssessment: relationship({ ref: 'Assessment' }),
    goals: relationship({ ref: 'PlanGoal.plan', many: true }),
    previousVersion: serverRel('LearningPlan'),
    declineReason: serverText(),
    proposedAt: serverTime(),
    acceptedAt: serverTime(),
    ...trackingFields,
  },
})

export const PlanGoal = list({
  access: scopedAccess({
    read: 'canManageFamilies', write: 'canManageFamilies', location: 'plan.student.family.primaryLocation',
    guardian: 'plan.student.family', guardianWhere: { plan: { status: { in: ['proposed', 'accepted', 'active', 'completed'] } } },
    tutorCustom: (session) => ({ plan: nestStudent(session) }), tutorWrite: true,
  }),
  fields: {
    plan: relationship({ ref: 'LearningPlan.goals' }),
    title: text({ validation: { isRequired: true } }),
    skill: text(),
    baseline: text(),
    target: text(),
    status: statusField(['not_started', 'in_progress', 'mastered'], 'not_started'),
    masteredAt: serverTime(),
    sortOrder: integer({ defaultValue: 0 }),
    ...trackingFields,
  },
})

// §5.5 Enrollment
export const Enrollment = list({
  access: scopedAccess({ read: 'canManageFamilies', write: false, location: 'location', guardian: 'family', tutor: 'tutor' }),
  ui: { listView: { initialColumns: ['student', 'program', 'status', 'fundingType', 'tutor'] } },
  fields: {
    student: relationship({ ref: 'Student.enrolments' }),
    family: relationship({ ref: 'Family.enrolments' }),
    program: relationship({ ref: 'Program' }),
    location: relationship({ ref: 'Location' }),
    mode: choice(DELIVERY_MODES, 'in_centre'),
    status: statusField(['pending_payment', 'pending_match', 'matched', 'active', 'paused', 'ended', 'cancelled'], 'pending_payment'),
    fundingType: choice(['membership', 'package', 'pay_as_you_go'], 'membership'),
    membership: relationship({ ref: 'Membership.enrollment' }),
    studentPackage: relationship({ ref: 'StudentPackage.enrollment' }),
    tutor: relationship({ ref: 'Tutor' }),
    plan: relationship({ ref: 'LearningPlan' }),
    preferredTimes: json({ defaultValue: [] }),
    homeAddress: text(),
    startDate: timestamp(),
    endDate: timestamp(),
    endReason: serverText(),
    rematchCount: serverInt(0),
    trialAttendedAt: serverTime(),
    tutorConfirmedAt: serverTime(),
    series: relationship({ ref: 'SessionSeries.enrollment', many: true }),
    offers: relationship({ ref: 'Offer.enrollment', many: true }),
    bookings: relationship({ ref: 'Booking.enrollment', many: true }),
    ...trackingFields,
  },
})

// §4.5 Offer. One open offer per enrolment: openKey is the enrolment id while status is `sent`.
export const Offer = list({
  access: scopedAccess({ read: 'canManageTutors', write: false, location: 'enrollment.location', tutor: 'tutor' }),
  fields: {
    enrollment: relationship({ ref: 'Enrollment.offers' }),
    tutor: relationship({ ref: 'Tutor' }),
    status: statusField(['sent', 'accepted', 'declined', 'expired', 'withdrawn'], 'sent'),
    openKey: activeKey(),
    payRate: money(),
    proposedSlots: json({ defaultValue: [] }),
    sentAt: serverTime(),
    expiresAt: serverTime(),
    respondedAt: serverTime(),
    declineReason: serverText(),
    sentBy: serverRel('User'),
    ...trackingFields,
  },
})

// §5.5 SessionSeries
export const SessionSeries = list({
  access: scopedAccess({ read: 'canManageSchedule', write: false, location: 'location', tutor: 'tutor' }),
  // Generated create is omitted: `createSessionSeries` is the §5.9 command.
  graphql: { plural: 'SessionSeriesList', omit: { create: true } },
  fields: {
    program: relationship({ ref: 'Program' }),
    subject: relationship({ ref: 'Subject' }),
    location: relationship({ ref: 'Location' }),
    room: relationship({ ref: 'Room' }),
    tutor: relationship({ ref: 'Tutor' }),
    mode: choice(DELIVERY_MODES, 'in_centre'),
    weekday: integer({ validation: { isRequired: true, min: 0, max: 6 }, defaultValue: 1 }),
    startMinute: integer({ validation: { isRequired: true, min: 0, max: 1440 }, defaultValue: 960 }),
    minutes: integer({ validation: { isRequired: true, min: 15 }, defaultValue: 60 }),
    capacity: integer({ validation: { isRequired: true, min: 1 }, defaultValue: 4 }),
    startDate: timestamp({ validation: { isRequired: true } }),
    endDate: timestamp(),
    enrollment: relationship({ ref: 'Enrollment.series' }),
    status: statusField(['active', 'ended'], 'active'),
    meetingUrl: text(),
    generatedThrough: serverTime(),
    sessions: relationship({ ref: 'Session.series', many: true }),
    ...trackingFields,
  },
})

// §4.6 Session. Unique (series, startsAt); index (tutor, startsAt), (room, startsAt).
export const Session = list({
  access: scopedAccess({ read: 'canAccessDashboard', write: false, location: 'location', tutor: 'tutor' }),
  db: { extendPrismaSchema: prismaExtras('@@unique([seriesId, startsAt])', '@@index([tutorId, startsAt])', '@@index([roomId, startsAt])', '@@index([locationId, startsAt])') },
  ui: { listView: { initialColumns: ['startsAt', 'program', 'tutor', 'room', 'status', 'capacity'] } },
  fields: {
    series: relationship({ ref: 'SessionSeries.sessions', db: { foreignKey: true } }),
    program: relationship({ ref: 'Program' }),
    subject: relationship({ ref: 'Subject' }),
    location: relationship({ ref: 'Location', db: { foreignKey: true } }),
    room: relationship({ ref: 'Room', db: { foreignKey: true } }),
    tutor: relationship({ ref: 'Tutor', db: { foreignKey: true } }),
    mode: choice(DELIVERY_MODES, 'in_centre'),
    startsAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    endsAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    capacity: integer({ validation: { isRequired: true, min: 1 }, defaultValue: 1 }),
    status: statusField(['scheduled', 'in_progress', 'completed', 'cancelled', 'needs_cover'], 'scheduled'),
    cancelReason: serverText(),
    meetingUrl: text(),
    isTrial: checkbox({ defaultValue: false }),
    substituteFor: serverRel('Tutor'),
    bookings: relationship({ ref: 'Booking.session', many: true }),
    waitlist: relationship({ ref: 'WaitlistEntry.session', many: true }),
    reports: relationship({ ref: 'SessionReport.session', many: true }),
    payLines: relationship({ ref: 'PayLine.session', many: true }),
    bookedCount: virtual({
      field: graphql.field({
        type: graphql.Int,
        resolve: (item: any, _a, context) => context.sudo().prisma.booking.count({ where: { sessionId: item.id, status: { in: ['booked', 'attended', 'late', 'cancelled_late', 'cancelled_late_excused', 'no_show'] } } }),
      }),
    }),
    ...trackingFields,
  },
})

// §4.7 Booking. activeKey = "<sessionId>:<studentId>" while booked or attended-ish, so duplicates are refused by Postgres.
export const Booking = list({
  access: scopedAccess({ read: 'canAccessDashboard', write: false, location: 'session.location', guardian: 'family', tutor: 'session.tutor' }),
  db: { extendPrismaSchema: prismaExtras('@@index([studentId, status])') },
  ui: { listView: { initialColumns: ['session', 'student', 'status', 'source', 'minutes'] } },
  fields: {
    session: relationship({ ref: 'Session.bookings', db: { foreignKey: true } }),
    student: relationship({ ref: 'Student.bookings', db: { foreignKey: true } }),
    family: relationship({ ref: 'Family' }),
    enrollment: relationship({ ref: 'Enrollment.bookings' }),
    status: statusField(['booked', 'attended', 'late', 'cancelled_early', 'cancelled_late', 'cancelled_late_excused', 'no_show', 'cancelled_by_centre', 'waitlisted', 'waitlist_expired'], 'booked'),
    activeKey: activeKey(),
    source: choice(['fixed_seat', 'self_booked', 'staff', 'make_up', 'waitlist'], 'staff'),
    creditGrant: relationship({ ref: 'CreditGrant.bookings' }),
    payAsYouGo: checkbox({ defaultValue: false, access: { create: () => false, update: () => false } }),
    invoice: serverRel('Invoice'),
    minutes: serverInt(0),
    startsAt: serverTime(),
    endsAt: serverTime(),
    markedBy: serverRel('User'),
    markedAt: serverTime(),
    cancelledAt: serverTime(),
    cancelledBy: serverRel('User'),
    lateReason: serverText(),
    makeUpGrant: relationship({ ref: 'CreditGrant.sourceBooking' }),
    payLine: relationship({ ref: 'PayLine.booking' }),
    reopenedAt: serverTime(),
    reports: relationship({ ref: 'SessionReport.booking', many: true }),
    ...trackingFields,
  },
})

export const SessionReport = list({
  access: scopedAccess({
    read: 'canManageFamilies', write: false, location: 'session.location',
    guardian: 'booking.family', guardianWhere: { publishedAt: { not: null } },
    tutor: 'tutor',
  }),
  fields: {
    booking: relationship({ ref: 'Booking.reports' }),
    session: relationship({ ref: 'Session.reports' }),
    student: relationship({ ref: 'Student' }),
    tutor: relationship({ ref: 'Tutor' }),
    topicsCovered: text({ ui: { displayMode: 'textarea' } }),
    wentWell: text({ ui: { displayMode: 'textarea' } }),
    toImprove: text({ ui: { displayMode: 'textarea' } }),
    homework: text({ ui: { displayMode: 'textarea' } }),
    homeworkDueAt: timestamp(),
    homeworkStatus: choice(['set', 'done', 'not_done']),
    effort: integer({ validation: { min: 1, max: 5 } }),
    // §5.8: never shown to guardians.
    staffNote: text({ ui: { displayMode: 'textarea' }, access: { read: ({ session }: { session?: AuthSession }) => hasFlag(session, 'canAccessDashboard') } }),
    attachment: file({ storage: 'my_files' }),
    publishedAt: serverTime(),
    guardianSeenAt: serverTime(),
    ...trackingFields,
  },
})

export const WaitlistEntry = list({
  access: scopedAccess({ read: 'canManageSchedule', write: false, location: 'session.location', guardian: 'family' }),
  fields: {
    session: relationship({ ref: 'Session.waitlist', db: { foreignKey: true } }),
    student: relationship({ ref: 'Student' }),
    family: relationship({ ref: 'Family' }),
    status: statusField(['waiting', 'promoted', 'cancelled', 'expired'], 'waiting'),
    activeKey: activeKey(),
    position: serverInt(0),
    promotedAt: serverTime(),
    booking: serverRel('Booking'),
    ...trackingFields,
  },
})

export const ProgressReport = list({
  access: scopedAccess({
    read: 'canManageFamilies', write: false, location: 'student.family.primaryLocation',
    guardian: 'student.family', guardianWhere: { status: { in: ['published', 'acknowledged'] } },
    tutor: 'authorTutor',
  }),
  fields: {
    student: relationship({ ref: 'Student' }),
    enrollment: relationship({ ref: 'Enrollment' }),
    periodStart: timestamp(),
    periodEnd: timestamp(),
    sessionsAttended: serverInt(0),
    sessionsMissed: serverInt(0),
    narrative: text({ ui: { displayMode: 'textarea' } }),
    goalsSnapshot: json({ defaultValue: [] }),
    nextSteps: text({ ui: { displayMode: 'textarea' } }),
    status: statusField(['draft', 'published', 'acknowledged', 'withdrawn'], 'draft'),
    author: serverRel('User'),
    authorTutor: relationship({ ref: 'Tutor' }),
    withdrawReason: serverText(),
    publishedAt: serverTime(),
    acknowledgedAt: serverTime(),
    ...trackingFields,
  },
})
