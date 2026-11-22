/**
 * Families, students, learning plans, session and progress reports, contact log, reviews, tasks
 * (§4.3, §4.13, W11, §5.9, §6.2, §6.3).
 * Guardian: registerGuardian, addStudent, updateStudent, updateFamilyProfile, acceptLearningPlan,
 * declineLearningPlan, acknowledgeProgressReport, markSessionReportSeen.
 * Staff: proposeLearningPlan, setGoalStatus, publishSessionReport, setHomeworkStatus,
 * draftProgressReport, publishProgressReport, withdrawProgressReport, logFamilyContact,
 * recordReview, moderateReview, completeTask.
 */
import { runCommand, transition, recordChange, requireString, optionalString, requireInt, lockKey } from '../lib/command'
import { CommandError } from '../lib/errors'
import { canAt, can, requireFlag, requireGuardianOf, requireActor, type Actor } from '../lib/actor'
import { customerRoleId } from '../lib/assessments'
import { queueEmail } from '../lib/notify'
import { getSettings, DAY } from '../lib/settings'

const gql = String.raw
type Ctx = any
const keyOf = (a: any) => (typeof a?.idempotencyKey === 'string' ? a.idempotencyKey : null)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const typeDefs = gql`
  type Mutation {
    registerGuardian(data: JSON!, idempotencyKey: String): CommandResult!
    addStudent(data: JSON!, idempotencyKey: String): CommandResult!
    updateStudent(studentId: ID!, data: JSON!, idempotencyKey: String): CommandResult!
    updateFamilyProfile(familyId: ID, data: JSON!, idempotencyKey: String): CommandResult!
    acceptLearningPlan(planId: ID!, idempotencyKey: String): CommandResult!
    declineLearningPlan(planId: ID!, reason: String, idempotencyKey: String): CommandResult!
    acknowledgeProgressReport(reportId: ID!): CommandResult!
    markSessionReportSeen(reportId: ID!): CommandResult!
    proposeLearningPlan(planId: ID, data: JSON, idempotencyKey: String): CommandResult!
    setGoalStatus(goalId: ID!, status: String!, idempotencyKey: String): CommandResult!
    publishSessionReport(bookingId: ID!, data: JSON!, idempotencyKey: String): CommandResult!
    setHomeworkStatus(reportId: ID!, status: String!): CommandResult!
    draftProgressReport(enrollmentId: ID!, idempotencyKey: String): CommandResult!
    publishProgressReport(reportId: ID!, data: JSON, idempotencyKey: String): CommandResult!
    withdrawProgressReport(reportId: ID!, reason: String!, idempotencyKey: String): CommandResult!
    logFamilyContact(familyId: ID!, data: JSON!, idempotencyKey: String): CommandResult!
    recordReview(familyId: ID!, data: JSON!, idempotencyKey: String): CommandResult!
    moderateReview(reviewId: ID!, status: String!, idempotencyKey: String): CommandResult!
    completeTask(taskId: ID!, outcome: String!, dismiss: Boolean, idempotencyKey: String): CommandResult!
  }
`

// ------------------------------------------------------------------ helpers
async function familyOf(tx: any, familyId: string) {
  const f = await tx.family.findUnique({ where: { id: familyId }, select: { id: true, primaryLocationId: true, billingEmail: true, name: true } })
  if (!f) throw new CommandError('That family was not found.')
  return f
}

/** Staff with the flag at the family's location, or a guardian of it. Returns which. */
async function familyAccess(tx: any, actor: Actor | null, familyId: string, flag: 'canManageFamilies' = 'canManageFamilies') {
  const f = await familyOf(tx, familyId)
  if (canAt(actor, flag, f.primaryLocationId)) return { family: f, staff: true }
  await requireGuardianOf(tx, actor, f.id)
  return { family: f, staff: false }
}

function pickupPeople(value: unknown) {
  if (value == null) return undefined
  if (!Array.isArray(value)) throw new CommandError('Pickup people must be a list.')
  return value.slice(0, 10).map((p: any) => ({ name: requireString(p?.name, 'Pickup name', 120), relation: optionalString(p?.relation, 60), phone: optionalString(p?.phone, 40) }))
}

function studentData(d: any, staff: boolean) {
  const out: Record<string, unknown> = {}
  if (d.firstName !== undefined) out.firstName = requireString(d.firstName, 'First name', 80)
  if (d.lastName !== undefined) out.lastName = optionalString(d.lastName, 80)
  if (d.school !== undefined) out.school = optionalString(d.school, 160)
  if (d.dateOfBirth !== undefined) {
    const dob = d.dateOfBirth ? new Date(String(d.dateOfBirth)) : null
    if (dob && (Number.isNaN(dob.getTime()) || dob > new Date())) throw new CommandError('Enter a valid date of birth.')
    out.dateOfBirth = dob
  }
  if (d.levelId !== undefined) out.level = d.levelId ? { connect: { id: String(d.levelId) } } : { disconnect: true }
  if (d.learningNotes !== undefined) out.learningNotes = optionalString(d.learningNotes, 4000)
  if (d.medicalNotes !== undefined) out.medicalNotes = optionalString(d.medicalNotes, 4000)
  if (d.pickupPeople !== undefined) out.pickupPeople = pickupPeople(d.pickupPeople)
  if (staff && d.status !== undefined) {
    if (!['prospect', 'active', 'paused', 'alumni'].includes(d.status)) throw new CommandError('Unknown student status.')
    out.status = d.status
  }
  return out
}

/** Attendance numbers, goals and tutor report topics for one enrolment period (W11). */
async function progressDraftData(tx: any, enrollmentId: string, periodStart: Date, periodEnd: Date) {
  const e = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { id: true, studentId: true, planId: true, tutorId: true } })
  const bookings = await tx.booking.findMany({ where: { studentId: e.studentId, startsAt: { gte: periodStart, lt: periodEnd } }, select: { status: true } })
  const attended = bookings.filter((b: any) => ['attended', 'late'].includes(b.status)).length
  const missed = bookings.filter((b: any) => ['no_show', 'cancelled_late', 'cancelled_late_excused'].includes(b.status)).length
  const goals = e.planId ? await tx.planGoal.findMany({ where: { planId: e.planId }, select: { title: true, status: true, baseline: true, target: true }, orderBy: { sortOrder: 'asc' } }) : []
  const reports = await tx.sessionReport.findMany({ where: { studentId: e.studentId, publishedAt: { gte: periodStart, lt: periodEnd } }, select: { topicsCovered: true, wentWell: true, toImprove: true }, orderBy: { publishedAt: 'asc' } })
  const topics = reports.map((r: any) => r.topicsCovered).filter(Boolean)
  const narrative = [
    `Attended ${attended} of ${attended + missed} sessions.`,
    topics.length ? `Covered: ${topics.join('; ')}.` : '',
    reports.map((r: any) => r.wentWell).filter(Boolean).slice(-3).join(' '),
  ].filter(Boolean).join('\n\n')
  const nextSteps = reports.map((r: any) => r.toImprove).filter(Boolean).slice(-3).join(' ')
  return { studentId: e.studentId, tutorId: e.tutorId, attended, missed, goals, narrative: narrative.slice(0, 4000), nextSteps: nextSteps.slice(0, 2000) }
}

/** Create a draft progress report for an enrolment period unless one exists. Used by the daily job too. */
export async function draftProgressFor(tx: any, enrollmentId: string, actorId: string | null, now = new Date()) {
  await lockKey(tx, `progress:${enrollmentId}`)
  const last = await tx.progressReport.findFirst({ where: { enrollmentId, status: { not: 'withdrawn' } }, orderBy: { periodEnd: 'desc' }, select: { id: true, status: true, periodEnd: true } })
  if (last?.status === 'draft') return { id: last.id, created: false }
  const e = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { startDate: true, createdAt: true } })
  const periodStart: Date = last?.periodEnd ?? e.startDate ?? e.createdAt
  const d = await progressDraftData(tx, enrollmentId, periodStart, now)
  const r = await tx.progressReport.create({
    data: {
      student: { connect: { id: d.studentId } }, enrollment: { connect: { id: enrollmentId } }, periodStart, periodEnd: now,
      sessionsAttended: d.attended, sessionsMissed: d.missed, narrative: d.narrative, goalsSnapshot: d.goals, nextSteps: d.nextSteps, status: 'draft',
      ...(d.tutorId ? { authorTutor: { connect: { id: d.tutorId } } } : {}),
      ...(actorId ? { author: { connect: { id: actorId } }, createdBy: { connect: { id: actorId } } } : {}),
    },
  })
  await recordChange(tx, { type: 'ProgressReport', id: r.id, to: 'draft', actorId })
  return { id: r.id, created: true }
}

/** Daily job: every 4 weeks or 12 sessions per active enrolment a draft appears (W11). */
export async function draftDueProgressReports(prisma: any, now = new Date()) {
  const settings = await getSettings(prisma)
  const active = await prisma.enrollment.findMany({ where: { status: 'active' }, select: { id: true, studentId: true, startDate: true, createdAt: true } })
  let drafted = 0
  for (const e of active) {
    const last = await prisma.progressReport.findFirst({ where: { enrollmentId: e.id, status: { not: 'withdrawn' } }, orderBy: { periodEnd: 'desc' }, select: { status: true, periodEnd: true } })
    if (last?.status === 'draft') continue
    const since: Date = last?.periodEnd ?? e.startDate ?? e.createdAt
    const weeks = (now.getTime() - since.getTime()) / (7 * DAY)
    const sessions = await prisma.booking.count({ where: { studentId: e.studentId, enrollmentId: e.id, status: { in: ['attended', 'late'] }, startsAt: { gte: since, lt: now } } })
    if (weeks >= settings.progressReportEveryWeeks || sessions >= settings.progressReportEverySessions) {
      const r = await prisma.$transaction((tx: any) => draftProgressFor(tx, e.id, null, now), { maxWait: 60_000, timeout: 120_000 })
      if (r.created) drafted += 1
    }
  }
  return { drafted }
}

/** Tutor of the session, or staff who may mark attendance at its location. */
async function canWriteForBooking(tx: any, actor: Actor | null, bookingId: string) {
  const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { id: true, status: true, studentId: true, familyId: true, sessionId: true, session: { select: { tutorId: true, locationId: true } } } })
  if (!b) throw new CommandError('That booking was not found.')
  const a = requireActor(actor)
  const ownSession = Boolean(a.tutorId && b.session?.tutorId === a.tutorId)
  if (!ownSession && !canAt(a, 'canMarkAttendance', b.session?.locationId)) throw new CommandError('You can write reports for your own sessions only.')
  return { booking: b, actor: a }
}

async function progressAccess(tx: any, actor: Actor | null, reportId: string) {
  const r = await tx.progressReport.findUnique({ where: { id: reportId }, select: { id: true, status: true, studentId: true, authorTutorId: true, enrollmentId: true, student: { select: { familyId: true, firstName: true, family: { select: { primaryLocationId: true, billingEmail: true } } } } } })
  if (!r) throw new CommandError('That progress report was not found.')
  const a = requireActor(actor)
  const own = Boolean(a.tutorId && r.authorTutorId === a.tutorId)
  if (!own && !canAt(a, 'canManageFamilies', r.student?.family?.primaryLocationId)) throw new CommandError('You can only work on your own students’ reports.')
  return { report: r, actor: a }
}

// ------------------------------------------------------------------ resolvers
export const resolvers = {
  Mutation: {
    /**
     * Storefront sign-up: Customer user + Family through Keystone (its password field hashes) with
     * the family created and linked in the same write. The storefront then signs in.
     */
    registerGuardian: async (_: unknown, args: any, context: Ctx) => {
      try {
        if (context.session?.itemId) throw new CommandError('You are already signed in.')
        const d = args.data ?? {}
        const email = requireString(d.email, 'Email', 200).toLowerCase()
        if (!EMAIL.test(email)) throw new CommandError('Enter a valid email address.')
        const name = requireString(d.name, 'Your name', 120)
        const password = String(d.password ?? '')
        if (password.length < 8 || password.length > 200) throw new CommandError('Use a password of at least 8 characters.')
        const phone = optionalString(d.phone, 40)
        const sudo = context.sudo()
        if (await sudo.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })) throw new CommandError('That email already has an account. Sign in, or use “Forgot password”.')
        let user: any
        try {
          user = await sudo.db.User.createOne({ data: { name, email, phone, password, role: { connect: { id: await customerRoleId(sudo.prisma) } }, family: { create: { name: `${name.split(' ').slice(-1)[0] || name} family`, billingEmail: email, phone } } } })
        } catch (error: any) {
          if (/unique/i.test(String(error?.message))) throw new CommandError('That email already has an account. Sign in, or use “Forgot password”.')
          throw error
        }
        const familyId = (await sudo.prisma.user.findUnique({ where: { id: user.id }, select: { familyId: true } })).familyId
        await sudo.prisma.changeEvent.create({ data: { aggregateType: 'Family', aggregateId: familyId, from: '', to: 'active', reason: 'guardian registered', data: {}, at: new Date(), actor: { connect: { id: user.id } } } })
        return { success: true, error: null, id: user.id, data: { userId: user.id, familyId } }
      } catch (error) {
        if (error instanceof CommandError) return { success: false, error: error.message, id: null, data: null }
        console.error('registerGuardian failed', (error as Error)?.message)
        return { success: false, error: 'Something went wrong. Please try again.', id: null, data: null }
      }
    },

    addStudent: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'addStudent', idempotencyKey: keyOf(args), input: args.data ?? {} }, async (tx, actor) => {
      const d = args.data ?? {}
      let familyId: string
      let staff = false
      if (d.familyId && can(actor, 'canManageFamilies')) {
        const f = await familyOf(tx, String(d.familyId))
        requireFlag(actor, 'canManageFamilies', f.primaryLocationId)
        familyId = f.id
        staff = true
      } else {
        const f = await tx.family.findFirst({ where: { guardians: { some: { id: requireActor(actor).userId } } }, select: { id: true } })
        if (!f) throw new CommandError('Add your family details first.')
        familyId = f.id
      }
      // A missing level on create is an absent relationship, not an update disconnect.
      const data = studentData({ ...d, firstName: d.firstName ?? '', levelId: d.levelId || undefined }, staff)
      const s = await tx.student.create({ data: { ...data, family: { connect: { id: familyId } }, status: staff && d.status ? d.status : 'prospect', createdBy: { connect: { id: actor!.userId } } }, select: { id: true } })
      await recordChange(tx, { type: 'Student', id: s.id, to: 'prospect', actorId: actor!.userId, reason: staff ? 'added by staff' : 'added by guardian' })
      return { id: s.id, data: { studentId: s.id } }
    }),

    updateStudent: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'updateStudent', idempotencyKey: keyOf(args), input: { s: args.studentId, d: args.data } }, async (tx, actor) => {
      const s = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { id: true, familyId: true, status: true } })
      if (!s) throw new CommandError('That student was not found.')
      const { staff } = await familyAccess(tx, actor, s.familyId)
      const data = studentData(args.data ?? {}, staff)
      if (!Object.keys(data).length) throw new CommandError('Nothing to change.')
      await tx.student.update({ where: { id: s.id }, data })
      await recordChange(tx, { type: 'Student', id: s.id, from: s.status, to: (data.status as string) ?? s.status, actorId: actor!.userId, reason: 'details updated', data: { fields: Object.keys(data) } })
      return { id: s.id, data: { studentId: s.id } }
    }),

    updateFamilyProfile: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'updateFamilyProfile', idempotencyKey: keyOf(args), input: { f: args.familyId ?? null, d: args.data } }, async (tx, actor) => {
      const a = requireActor(actor)
      let familyId = args.familyId ? String(args.familyId) : ''
      if (!familyId) {
        const f = await tx.family.findFirst({ where: { guardians: { some: { id: a.userId } } }, select: { id: true } })
        familyId = f?.id ?? (await tx.family.create({ data: { name: `${a.name.split(' ').slice(-1)[0] || a.name} family`, billingEmail: a.email, guardians: { connect: { id: a.userId } }, createdBy: { connect: { id: a.userId } } }, select: { id: true } })).id
      }
      const { staff } = await familyAccess(tx, a, familyId)
      const d = args.data ?? {}
      const data: Record<string, unknown> = {}
      for (const k of ['phone', 'addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'country', 'secondGuardianName', 'secondGuardianPhone'] as const) if (d[k] !== undefined) data[k] = optionalString(d[k], 200)
      if (d.name !== undefined) data.name = requireString(d.name, 'Family name', 120)
      for (const k of ['billingEmail', 'secondGuardianEmail'] as const) if (d[k] !== undefined) {
        const v = optionalString(d[k], 200).toLowerCase()
        if (v && !EMAIL.test(v)) throw new CommandError('Enter a valid email address.')
        if (k === 'billingEmail' && !v) throw new CommandError('A billing email is needed.')
        data[k] = v
      }
      if (staff) {
        if (d.notes !== undefined) data.notes = optionalString(d.notes, 4000)
        if (d.payAsYouGoAllowed !== undefined) { requireFlag(a, 'canManageBilling'); data.payAsYouGoAllowed = Boolean(d.payAsYouGoAllowed) }
        if (d.primaryLocationId !== undefined) data.primaryLocation = d.primaryLocationId ? { connect: { id: String(d.primaryLocationId) } } : { disconnect: true }
        if (d.status !== undefined) { if (!['active', 'inactive'].includes(d.status)) throw new CommandError('Unknown family status.'); data.status = d.status }
      }
      // The account holder's own name and phone.
      if (!staff && (d.guardianName !== undefined || d.guardianPhone !== undefined)) {
        await tx.user.update({ where: { id: a.userId }, data: { ...(d.guardianName !== undefined ? { name: requireString(d.guardianName, 'Your name', 120) } : {}), ...(d.guardianPhone !== undefined ? { phone: optionalString(d.guardianPhone, 40) } : {}) } })
      }
      if (Object.keys(data).length) await tx.family.update({ where: { id: familyId }, data })
      await recordChange(tx, { type: 'Family', id: familyId, actorId: a.userId, reason: 'profile updated', data: { fields: Object.keys(data) } })
      return { id: familyId, data: { familyId } }
    }),

    acceptLearningPlan: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'acceptLearningPlan', idempotencyKey: keyOf(args), input: { p: args.planId } }, async (tx, actor) => {
      const p = await tx.learningPlan.findUnique({ where: { id: String(args.planId) }, select: { id: true, status: true, programId: true, studentId: true, recommendedPlanId: true, recommendedPackageId: true, student: { select: { familyId: true } } } })
      if (!p) throw new CommandError('That plan was not found.')
      await requireGuardianOf(tx, actor, p.student?.familyId)
      if (p.status === 'accepted') return { id: p.id, data: { status: 'accepted', programId: p.programId, studentId: p.studentId, recommendedPlanId: p.recommendedPlanId, recommendedPackageId: p.recommendedPackageId } }
      await transition(tx, actor, 'learningPlan', 'LearningPlan', p.id, 'proposed', 'accepted', { acceptedAt: new Date() }, 'guardian accepted')
      // The next step is enrolment checkout with learningPlanId; the plan goes active once it is paid.
      return { id: p.id, data: { status: 'accepted', programId: p.programId, studentId: p.studentId, recommendedPlanId: p.recommendedPlanId, recommendedPackageId: p.recommendedPackageId } }
    }),

    declineLearningPlan: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'declineLearningPlan', idempotencyKey: keyOf(args), input: { p: args.planId } }, async (tx, actor) => {
      const p = await tx.learningPlan.findUnique({ where: { id: String(args.planId) }, select: { id: true, studentId: true, student: { select: { familyId: true } } } })
      if (!p) throw new CommandError('That plan was not found.')
      await requireGuardianOf(tx, actor, p.student?.familyId)
      await transition(tx, actor, 'learningPlan', 'LearningPlan', p.id, ['proposed', 'accepted'], 'declined', { declineReason: optionalString(args.reason, 500) }, 'guardian declined')
      const lead = await tx.lead.findFirst({ where: { studentId: p.studentId, status: 'proposal_sent' }, select: { id: true } })
      if (lead) await tx.task.upsert({ where: { openKey: `plan-declined:${p.id}` }, create: { kind: 'proposal_follow_up', title: 'Learning plan declined: call the family', lead: { connect: { id: lead.id } }, student: { connect: { id: p.studentId } }, relatedType: 'LearningPlan', relatedId: p.id, dueAt: new Date(), openKey: `plan-declined:${p.id}`, outcomeNote: optionalString(args.reason, 500) }, update: {} })
      return { id: p.id, data: { status: 'declined' } }
    }),

    acknowledgeProgressReport: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'acknowledgeProgressReport', input: { r: args.reportId } }, async (tx, actor) => {
      const r = await tx.progressReport.findUnique({ where: { id: String(args.reportId) }, select: { id: true, status: true, student: { select: { familyId: true } } } })
      if (!r) throw new CommandError('That report was not found.')
      await requireGuardianOf(tx, actor, r.student?.familyId)
      if (r.status === 'acknowledged') return { id: r.id, data: { status: 'acknowledged' } }
      await transition(tx, actor, 'progressReport', 'ProgressReport', r.id, 'published', 'acknowledged', { acknowledgedAt: new Date() }, 'guardian read it')
      return { id: r.id, data: { status: 'acknowledged' } }
    }),

    markSessionReportSeen: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'markSessionReportSeen', input: { r: args.reportId } }, async (tx, actor) => {
      const r = await tx.sessionReport.findUnique({ where: { id: String(args.reportId) }, select: { id: true, publishedAt: true, guardianSeenAt: true, booking: { select: { familyId: true } } } })
      if (!r || !r.publishedAt) throw new CommandError('That report was not found.')
      await requireGuardianOf(tx, actor, r.booking?.familyId)
      if (!r.guardianSeenAt) await tx.sessionReport.updateMany({ where: { id: r.id, guardianSeenAt: null }, data: { guardianSeenAt: new Date() } })
      return { id: r.id, data: { seen: true } }
    }),

    /** Staff draft (or revise) a plan with goals and propose it to the family (§4.3). */
    proposeLearningPlan: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'proposeLearningPlan', idempotencyKey: keyOf(args), input: { p: args.planId ?? null, d: args.data ?? null } }, async (tx, actor) => {
      const d = args.data ?? {}
      let plan: any
      if (args.planId) {
        plan = await tx.learningPlan.findUnique({ where: { id: String(args.planId) }, include: { goals: true, student: { select: { id: true, familyId: true, firstName: true, family: { select: { primaryLocationId: true, billingEmail: true } } } } } })
        if (!plan) throw new CommandError('That plan was not found.')
      }
      const studentId = plan?.studentId ?? (d.studentId ? String(d.studentId) : '')
      const student = plan?.student ?? await tx.student.findUnique({ where: { id: studentId }, select: { id: true, familyId: true, firstName: true, family: { select: { primaryLocationId: true, billingEmail: true } } } })
      if (!student) throw new CommandError('Pick the student.')
      requireFlag(actor, 'canManageFamilies', student.family?.primaryLocationId)
      const goals = Array.isArray(d.goals) ? d.goals.slice(0, 20).map((g: any, i: number) => ({ title: requireString(g?.title, 'Goal', 200), skill: optionalString(g?.skill, 120), baseline: optionalString(g?.baseline, 200), target: optionalString(g?.target, 200), sortOrder: i })) : null
      const fields: Record<string, unknown> = {}
      if (d.summary !== undefined) fields.summary = optionalString(d.summary, 4000)
      if (d.sessionsPerWeek !== undefined) fields.sessionsPerWeek = requireInt(d.sessionsPerWeek, 'Sessions a week', 1, 7)
      if (d.totalHours !== undefined && d.totalHours !== null) fields.totalHours = requireInt(d.totalHours, 'Total hours', 1, 1000)
      if (d.startDate) fields.startDate = new Date(String(d.startDate))
      if (d.targetDate) fields.targetDate = new Date(String(d.targetDate))
      for (const [k, rel] of [['programId', 'program'], ['subjectId', 'subject'], ['recommendedPlanId', 'recommendedPlan'], ['recommendedPackageId', 'recommendedPackage'], ['baselineAssessmentId', 'baselineAssessment']] as const) {
        if (d[k] !== undefined) fields[rel] = d[k] ? { connect: { id: String(d[k]) } } : (plan ? { disconnect: true } : undefined)
        if (fields[rel] === undefined) delete fields[rel]
      }
      const now = new Date()
      let id: string
      if (plan && ['active', 'accepted'].includes(plan.status)) {
        // Revision: new version, the old one archived (§4.3).
        await transition(tx, actor, 'learningPlan', 'LearningPlan', plan.id, plan.status, 'archived', {}, 'revised')
        const next = await tx.learningPlan.create({
          data: {
            student: { connect: { id: student.id } }, version: (plan.version ?? 1) + 1, status: 'proposed', proposedAt: now, previousVersion: { connect: { id: plan.id } },
            summary: plan.summary, sessionsPerWeek: plan.sessionsPerWeek, totalHours: plan.totalHours, startDate: plan.startDate, targetDate: plan.targetDate,
            ...(plan.programId ? { program: { connect: { id: plan.programId } } } : {}), ...(plan.subjectId ? { subject: { connect: { id: plan.subjectId } } } : {}),
            ...(plan.recommendedPlanId ? { recommendedPlan: { connect: { id: plan.recommendedPlanId } } } : {}), ...(plan.recommendedPackageId ? { recommendedPackage: { connect: { id: plan.recommendedPackageId } } } : {}),
            ...(plan.baselineAssessmentId ? { baselineAssessment: { connect: { id: plan.baselineAssessmentId } } } : {}),
            ...fields, createdBy: { connect: { id: actor!.userId } },
          },
        })
        const source = goals ?? plan.goals.map((g: any) => ({ title: g.title, skill: g.skill, baseline: g.baseline, target: g.target, sortOrder: g.sortOrder, status: g.status, masteredAt: g.masteredAt }))
        for (const g of source) await tx.planGoal.create({ data: { ...g, plan: { connect: { id: next.id } } } })
        // The live enrolment follows the new version.
        await tx.enrollment.updateMany({ where: { planId: plan.id }, data: { planId: next.id } })
        await recordChange(tx, { type: 'LearningPlan', id: next.id, to: 'proposed', actorId: actor!.userId, reason: `version ${next.version}` })
        id = next.id
      } else if (plan) {
        if (!['draft', 'proposed', 'declined'].includes(plan.status)) throw new CommandError(`This plan is ${plan.status}; it cannot be proposed.`)
        if (Object.keys(fields).length) await tx.learningPlan.update({ where: { id: plan.id }, data: fields })
        if (goals) { await tx.planGoal.deleteMany({ where: { planId: plan.id } }); for (const g of goals) await tx.planGoal.create({ data: { ...g, plan: { connect: { id: plan.id } } } }) }
        if (plan.status !== 'proposed') await transition(tx, actor, 'learningPlan', 'LearningPlan', plan.id, plan.status, 'proposed', { proposedAt: now, declineReason: '' }, 'proposed')
        id = plan.id
      } else {
        if (!goals?.length) throw new CommandError('Add at least one goal.')
        const created = await tx.learningPlan.create({ data: { student: { connect: { id: student.id } }, version: 1, status: 'proposed', proposedAt: now, ...fields, createdBy: { connect: { id: actor!.userId } } } })
        for (const g of goals) await tx.planGoal.create({ data: { ...g, plan: { connect: { id: created.id } } } })
        await recordChange(tx, { type: 'LearningPlan', id: created.id, to: 'proposed', actorId: actor!.userId })
        id = created.id
      }
      const final = await tx.learningPlan.findUnique({ where: { id }, select: { programId: true, goals: { select: { id: true } } } })
      if (!final.programId) throw new CommandError('Pick the programme this plan is for.')
      if (!final.goals.length) throw new CommandError('Add at least one goal.')
      // Lead moves to proposal_sent (W1.7).
      const lead = await tx.lead.findFirst({ where: { studentId: student.id, status: { in: ['assessed', 'assessment_booked', 'contacted', 'new'] } }, select: { id: true, status: true } })
      if (lead) await transition(tx, actor, 'lead', 'Lead', lead.id, lead.status, 'proposal_sent', { lastContactedAt: now }, 'plan proposed')
      await queueEmail(tx, { to: student.family?.billingEmail ?? '', template: 'plan_proposed', subject: `A learning plan for ${student.firstName} is ready`, relatedType: 'LearningPlan', relatedId: id })
      return { id, data: { planId: id } }
    }),

    setGoalStatus: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'setGoalStatus', idempotencyKey: keyOf(args), input: { g: args.goalId, s: args.status } }, async (tx, actor) => {
      const g = await tx.planGoal.findUnique({ where: { id: String(args.goalId) }, select: { id: true, status: true, plan: { select: { studentId: true, student: { select: { family: { select: { primaryLocationId: true } } } } } } } })
      if (!g) throw new CommandError('That goal was not found.')
      const a = requireActor(actor)
      const assigned = a.tutorId ? await tx.student.count({ where: { id: g.plan.studentId, OR: [{ enrolments: { some: { tutorId: a.tutorId } } }, { bookings: { some: { session: { tutorId: a.tutorId } } } }] } }) : 0
      if (!assigned && !canAt(a, 'canManageFamilies', g.plan.student?.family?.primaryLocationId)) throw new CommandError('Only the student’s tutor or a manager can move goals.')
      if (!['not_started', 'in_progress', 'mastered'].includes(args.status)) throw new CommandError('Unknown goal status.')
      if (g.status === args.status) return { id: g.id, data: { status: g.status } }
      await transition(tx, a, 'planGoal', 'PlanGoal', g.id, g.status, args.status, { masteredAt: args.status === 'mastered' ? new Date() : null })
      return { id: g.id, data: { status: args.status } }
    }),

    /** Tutor writes and publishes the report for one student's seat; guardian sees it at once (D12). */
    publishSessionReport: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'publishSessionReport', idempotencyKey: keyOf(args), input: { b: args.bookingId, d: args.data } }, async (tx, actor) => {
      const { booking, actor: a } = await canWriteForBooking(tx, actor, String(args.bookingId))
      if (!['attended', 'late'].includes(booking.status)) throw new CommandError('Mark the student attended before writing the report.')
      const d = args.data ?? {}
      const data: Record<string, unknown> = {
        topicsCovered: requireString(d.topicsCovered, 'What we covered', 2000), wentWell: optionalString(d.wentWell, 2000), toImprove: optionalString(d.toImprove, 2000),
        homework: optionalString(d.homework, 2000), homeworkDueAt: d.homeworkDueAt ? new Date(String(d.homeworkDueAt)) : null, homeworkStatus: optionalString(d.homework, 10) ? 'set' : null,
        effort: d.effort != null && d.effort !== '' ? requireInt(d.effort, 'Effort', 1, 5) : null, staffNote: optionalString(d.staffNote, 2000),
      }
      const publish = d.publish !== false
      const existing = await tx.sessionReport.findFirst({ where: { bookingId: booking.id }, select: { id: true, publishedAt: true } })
      const now = new Date()
      const session = await tx.session.findUnique({ where: { id: booking.sessionId }, select: { tutorId: true } })
      let id: string
      if (existing) {
        await tx.sessionReport.update({ where: { id: existing.id }, data: { ...data, ...(publish && !existing.publishedAt ? { publishedAt: now } : {}) } })
        id = existing.id
      } else {
        const r = await tx.sessionReport.create({ data: { ...data, booking: { connect: { id: booking.id } }, session: { connect: { id: booking.sessionId } }, student: { connect: { id: booking.studentId } }, ...(session?.tutorId ? { tutor: { connect: { id: session.tutorId } } } : {}), publishedAt: publish ? now : null, createdBy: { connect: { id: a.userId } } } })
        id = r.id
      }
      await recordChange(tx, { type: 'SessionReport', id, to: publish ? 'published' : 'draft', actorId: a.userId })
      if (publish && !existing?.publishedAt) {
        const fam = await tx.family.findUnique({ where: { id: booking.familyId }, select: { billingEmail: true } })
        await queueEmail(tx, { to: fam?.billingEmail ?? '', template: 'session_report', subject: 'A new session report is in your account', relatedType: 'SessionReport', relatedId: id })
      }
      return { id, data: { reportId: id, published: publish } }
    }),

    setHomeworkStatus: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'setHomeworkStatus', input: { r: args.reportId, s: args.status } }, async (tx, actor) => {
      const r = await tx.sessionReport.findUnique({ where: { id: String(args.reportId) }, select: { id: true, bookingId: true, homeworkStatus: true, studentId: true } })
      if (!r?.bookingId) throw new CommandError('That report was not found.')
      const a = requireActor(actor)
      // The tutor checks homework at the next session (§6.3): any tutor now teaching the student, or staff.
      const teaches = a.tutorId ? await tx.booking.count({ where: { studentId: r.studentId, session: { tutorId: a.tutorId } } }) : 0
      if (!teaches) await canWriteForBooking(tx, a, r.bookingId)
      if (!['set', 'done', 'not_done'].includes(args.status)) throw new CommandError('Unknown homework status.')
      await tx.sessionReport.update({ where: { id: r.id }, data: { homeworkStatus: args.status } })
      await recordChange(tx, { type: 'SessionReport', id: r.id, from: r.homeworkStatus ?? '', to: args.status, actorId: a.userId, reason: 'homework' })
      return { id: r.id, data: { homeworkStatus: args.status } }
    }),

    draftProgressReport: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'draftProgressReport', idempotencyKey: keyOf(args), input: { e: args.enrollmentId } }, async (tx, actor) => {
      const e = await tx.enrollment.findUnique({ where: { id: String(args.enrollmentId) }, select: { id: true, tutorId: true, status: true, family: { select: { primaryLocationId: true } }, locationId: true } })
      if (!e) throw new CommandError('That enrolment was not found.')
      const a = requireActor(actor)
      if (!(a.tutorId && e.tutorId === a.tutorId) && !canAt(a, 'canManageFamilies', e.locationId ?? e.family?.primaryLocationId)) throw new CommandError('You can draft reports for your own students only.')
      const r = await draftProgressFor(tx, e.id, a.userId)
      return { id: r.id, data: { reportId: r.id, created: r.created } }
    }),

    publishProgressReport: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'publishProgressReport', idempotencyKey: keyOf(args), input: { r: args.reportId, d: args.data ?? null } }, async (tx, actor) => {
      const { report, actor: a } = await progressAccess(tx, actor, String(args.reportId))
      const d = args.data ?? {}
      const edits: Record<string, unknown> = {}
      if (d.narrative !== undefined) edits.narrative = requireString(d.narrative, 'Narrative', 8000)
      if (d.nextSteps !== undefined) edits.nextSteps = optionalString(d.nextSteps, 4000)
      if (report.status === 'published' || report.status === 'acknowledged') return { id: report.id, data: { status: report.status } }
      await transition(tx, a, 'progressReport', 'ProgressReport', report.id, 'draft', 'published', { ...edits, publishedAt: new Date(), authorId: a.userId })
      await queueEmail(tx, { to: report.student?.family?.billingEmail ?? '', template: 'progress_report', subject: `${report.student?.firstName ?? 'Your child'}’s progress report is ready`, relatedType: 'ProgressReport', relatedId: report.id })
      return { id: report.id, data: { status: 'published' } }
    }),

    withdrawProgressReport: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'withdrawProgressReport', idempotencyKey: keyOf(args), input: { r: args.reportId } }, async (tx, actor) => {
      const r = await tx.progressReport.findUnique({ where: { id: String(args.reportId) }, select: { id: true, student: { select: { family: { select: { primaryLocationId: true } } } } } })
      if (!r) throw new CommandError('That report was not found.')
      requireFlag(actor, 'canManageFamilies', r.student?.family?.primaryLocationId)
      const reason = requireString(args.reason, 'Reason', 500)
      await transition(tx, actor, 'progressReport', 'ProgressReport', r.id, ['published', 'acknowledged'], 'withdrawn', { withdrawReason: reason }, reason)
      return { id: r.id, data: { status: 'withdrawn' } }
    }),

    /** Staff log a call, email or visit on the family timeline (§6.3: replaces portal messaging). */
    logFamilyContact: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'logFamilyContact', idempotencyKey: keyOf(args), input: { f: args.familyId, d: args.data } }, async (tx, actor) => {
      const f = await familyOf(tx, String(args.familyId))
      const a = requireFlag(actor, 'canManageFamilies', f.primaryLocationId)
      const d = args.data ?? {}
      const channel = String(d.channel ?? 'phone')
      if (!['email', 'phone', 'in_person', 'sms'].includes(channel)) throw new CommandError('Pick how you were in touch.')
      const direction = String(d.direction ?? 'outbound')
      if (!['outbound', 'inbound', 'internal'].includes(direction)) throw new CommandError('Pick who got in touch.')
      const m = await tx.message.create({ data: { family: { connect: { id: f.id } }, sender: { connect: { id: a.userId } }, direction, channel, subject: optionalString(d.subject, 200), body: requireString(d.body, 'Note', 4000), visibleToFamily: false, threadKey: `family:${f.id}`, createdBy: { connect: { id: a.userId } } } })
      // Contact on an open lead counts as contact (W1.9 clock).
      const leads = await tx.lead.findMany({ where: { familyId: f.id, status: { notIn: ['enrolled', 'lost'] } }, select: { id: true, status: true } })
      for (const l of leads) {
        await tx.lead.update({ where: { id: l.id }, data: { lastContactedAt: new Date(), ...(d.nextFollowUpAt ? { nextFollowUpAt: new Date(String(d.nextFollowUpAt)) } : {}) } })
        if (l.status === 'new') await transition(tx, a, 'lead', 'Lead', l.id, 'new', 'contacted', {}, `contact logged (${channel})`)
      }
      if (d.taskId) {
        const t = await tx.task.findUnique({ where: { id: String(d.taskId) }, select: { id: true, status: true, familyId: true } })
        if (t?.familyId === f.id && t.status === 'open') await transition(tx, a, 'task', 'Task', t.id, 'open', 'done', { openKey: null, completedAt: new Date(), completedById: a.userId, outcomeNote: requireString(d.body, 'Note', 4000).slice(0, 1000) }, 'contact logged')
      }
      await recordChange(tx, { type: 'Family', id: f.id, actorId: a.userId, reason: `contact: ${channel} ${direction}`, data: { messageId: m.id } })
      return { id: m.id, data: { messageId: m.id } }
    }),

    /** Staff record a family's review (email, phone, survey); it shows on the storefront once published. */
    recordReview: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'recordReview', idempotencyKey: keyOf(args), input: { f: args.familyId, d: args.data } }, async (tx, actor) => {
      const f = await familyOf(tx, String(args.familyId))
      const a = requireFlag(actor, 'canManageFamilies', f.primaryLocationId)
      const d = args.data ?? {}
      const rating = requireInt(d.rating, 'Rating', 1, 5)
      const source = String(d.source ?? 'email')
      if (!['email', 'phone', 'in_person', 'survey', 'other'].includes(source)) throw new CommandError('Pick where the review came from.')
      if (!d.tutorId && !d.locationId && !d.programId) throw new CommandError('Pick the tutor, location or programme the review is about.')
      if (d.tutorId) {
        const taught = await tx.booking.count({ where: { familyId: f.id, session: { tutorId: String(d.tutorId) } } }) + await tx.enrollment.count({ where: { familyId: f.id, tutorId: String(d.tutorId) } })
        if (!taught) throw new CommandError('That tutor has not taught this family.')
      }
      const r = await tx.review.create({
        data: {
          family: { connect: { id: f.id } }, authorName: requireString(d.authorName ?? f.name, 'Name shown', 120), rating, text: optionalString(d.text, 4000), source, status: 'pending',
          ...(d.tutorId ? { tutor: { connect: { id: String(d.tutorId) } } } : {}), ...(d.locationId ? { location: { connect: { id: String(d.locationId) } } } : {}), ...(d.programId ? { program: { connect: { id: String(d.programId) } } } : {}),
          recordedBy: { connect: { id: a.userId } }, createdBy: { connect: { id: a.userId } },
        },
      })
      await recordChange(tx, { type: 'Review', id: r.id, to: 'pending', actorId: a.userId })
      return { id: r.id, data: { reviewId: r.id, status: 'pending' } }
    }),

    moderateReview: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'moderateReview', idempotencyKey: keyOf(args), input: { r: args.reviewId, s: args.status } }, async (tx, actor) => {
      requireFlag(actor, 'canManageSettings')
      if (!['published', 'hidden'].includes(args.status)) throw new CommandError('Publish or hide.')
      const r = await tx.review.findUnique({ where: { id: String(args.reviewId) }, select: { id: true, status: true } })
      if (!r) throw new CommandError('That review was not found.')
      if (r.status === args.status) return { id: r.id, data: { status: r.status } }
      await transition(tx, actor, 'review', 'Review', r.id, r.status, args.status)
      return { id: r.id, data: { status: args.status } }
    }),

    completeTask: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'completeTask', idempotencyKey: keyOf(args), input: { t: args.taskId, o: args.outcome, d: Boolean(args.dismiss) } }, async (tx, actor) => {
      const t = await tx.task.findUnique({ where: { id: String(args.taskId) }, select: { id: true, status: true, locationId: true, ownerId: true, family: { select: { primaryLocationId: true } } } })
      if (!t) throw new CommandError('That task was not found.')
      const a = requireActor(actor)
      if (t.ownerId !== a.userId && !canAt(a, 'canAccessDashboard', t.locationId ?? t.family?.primaryLocationId)) throw new CommandError('That task is not yours.')
      const to = args.dismiss ? 'dismissed' : 'done'
      await transition(tx, a, 'task', 'Task', t.id, 'open', to, { openKey: null, completedAt: new Date(), completedById: a.userId, outcomeNote: requireString(args.outcome, 'Outcome', 1000) })
      return { id: t.id, data: { status: to } }
    }),
  },
}
