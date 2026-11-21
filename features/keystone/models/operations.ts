import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'

import { appendOnlyAccess, isOwner, scopedAccess, type Session } from '../access'
import { trackingFields } from './trackingFields'
import { activeKey, choice, serverRel, serverText, serverTime, statusField } from './fields'

type Args = { session?: Session }

// §5.7 Task. openKey = "<kind>:<subjectId>" while open, so daily jobs do not duplicate.
export const Task = list({
  access: scopedAccess({ read: 'canAccessDashboard', write: 'canAccessDashboard', location: 'location', noDelete: true }),
  ui: { listView: { initialColumns: ['kind', 'family', 'student', 'dueAt', 'status', 'owner'] } },
  fields: {
    kind: choice(['no_show_follow_up', 'absence_streak', 'low_balance', 'failed_payment', 'assessment_follow_up', 'proposal_follow_up', 'first_week_check_in', 'membership_ending', 'credential_expiring', 'needs_cover', 'rematch_requested', 'pause_requested', 'cancel_requested', 'manual'], 'manual'),
    title: text({ validation: { isRequired: true } }),
    family: relationship({ ref: 'Family.tasks' }),
    student: relationship({ ref: 'Student' }),
    lead: relationship({ ref: 'Lead' }),
    location: relationship({ ref: 'Location' }),
    owner: relationship({ ref: 'User' }),
    relatedType: text(),
    relatedId: text(),
    dueAt: timestamp({ isIndexed: true }),
    status: statusField(['open', 'done', 'dismissed'], 'open'),
    openKey: activeKey(),
    outcomeNote: serverText(),
    completedBy: serverRel('User'),
    completedAt: serverTime(),
    ...trackingFields,
  },
})

// §5.7 Message. Per the revised §6.3, staff log emails and calls on the family timeline (logFamilyContact).
export const Message = list({
  access: { ...appendOnlyAccess('canManageFamilies', 'family.primaryLocation'), filter: { query: scopedAccess({ read: 'canManageFamilies', write: false, location: 'family.primaryLocation', guardian: 'family', guardianWhere: { visibleToFamily: { equals: true } } }).filter.query } },
  fields: {
    family: relationship({ ref: 'Family.messages' }),
    sender: relationship({ ref: 'User' }),
    direction: choice(['outbound', 'inbound', 'internal'], 'outbound'),
    channel: choice(['email', 'phone', 'in_person', 'portal', 'sms'], 'email'),
    subject: text(),
    body: text({ ui: { displayMode: 'textarea' }, validation: { isRequired: true } }),
    visibleToFamily: checkbox({ defaultValue: true }),
    threadKey: text({ isIndexed: true }),
    readAt: timestamp(),
    ...trackingFields,
  },
})

export const NotificationLog = list({
  access: appendOnlyAccess('canManageSettings'),
  fields: {
    recipient: text({ validation: { isRequired: true } }),
    template: text({ validation: { isRequired: true } }),
    subject: text(),
    relatedType: text(),
    relatedId: text(),
    channel: choice(['email', 'sms'], 'email'),
    status: choice(['queued', 'sent', 'failed'], 'queued'),
    error: text(),
    sentAt: timestamp(),
    ...trackingFields,
  },
})

// §5.7 Review. Recorded by staff on the family page (recordReview); published or hidden in settings.
export const Review = list({
  access: scopedAccess({ read: 'canManageFamilies', write: false, location: 'family.primaryLocation' }),
  fields: {
    family: relationship({ ref: 'Family.reviews' }),
    tutor: relationship({ ref: 'Tutor' }),
    location: relationship({ ref: 'Location' }),
    program: relationship({ ref: 'Program' }),
    authorName: text({ validation: { isRequired: true } }),
    rating: integer({ validation: { isRequired: true, min: 1, max: 5 }, defaultValue: 5 }),
    text: text({ ui: { displayMode: 'textarea' } }),
    source: choice(['email', 'phone', 'in_person', 'survey', 'other'], 'email'),
    status: statusField(['pending', 'published', 'hidden'], 'pending'),
    recordedBy: serverRel('User'),
    ...trackingFields,
  },
})

// §5.7 ChangeEvent: append only.
export const ChangeEvent = list({
  access: appendOnlyAccess('canViewReports'),
  db: { extendPrismaSchema: prismaIndex() },
  fields: {
    aggregateType: text({ validation: { isRequired: true } }),
    aggregateId: text({ validation: { isRequired: true } }),
    from: text(),
    to: text(),
    actor: relationship({ ref: 'User' }),
    reason: text(),
    data: json({ defaultValue: {} }),
    at: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' } }),
    ...trackingFields,
  },
})

function prismaIndex() {
  return (schema: string) => schema.replace(/\}\s*$/, '  @@index([aggregateType, aggregateId])\n}')
}

// From Barbershop, with `location` in place of `shop` (§5.7).
export const CommandReceipt = list({
  access: {
    operation: { query: ({ session }: Args) => isOwner(session), create: () => false, update: () => false, delete: () => false },
  },
  fields: {
    eventKey: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    eventType: text({ validation: { isRequired: true } }),
    schemaVersion: integer({ validation: { isRequired: true }, defaultValue: 1 }),
    aggregateType: text({ validation: { isRequired: true } }),
    aggregateId: text({ validation: { isRequired: true } }),
    location: relationship({ ref: 'Location' }),
    payload: json(),
    result: json(),
    actorId: text(),
    payloadHash: text({ validation: { isRequired: true } }),
    occurredAt: timestamp({ validation: { isRequired: true } }),
    ...trackingFields,
  },
})
