/**
 * Assessments (§4.1 lead moves, §4.2 assessment, W1 steps 2–5).
 * bookAssessment works for a visitor (creates guardian User, Family, Student, Lead) or a signed-in
 * guardian; staffBookAssessment is the front-desk version. Fees: an open invoice is created at
 * booking and paid through payInvoice; cancel ≥ the refund window refunds, later keeps (setting).
 */
import { runCommand, transition, recordChange, requireString, optionalString, requireDate } from '../lib/command'
import { CommandError } from '../lib/errors'
import { canAt, requireFlag, requireGuardianOf, guardianFamily, type Actor } from '../lib/actor'
import { holdAssessmentSlot, SLOT_TAKEN } from '../lib/assessments'
import { createInvoice } from '../lib/invoices'
import { getSettings, HOUR } from '../lib/settings'
import { settleAssessmentFee } from '../lib/fees'
import { processRefund } from '../lib/payments'
import { guardianForCommand, studentForCommand, welcomeNewGuardian } from '../lib/accounts'

const gql = String.raw

export const typeDefs = gql`
  input AssessmentGuardianInput { name: String!, email: String!, phone: String }
  input AssessmentStudentInput { firstName: String!, lastName: String, levelId: ID, school: String }

  type Mutation {
    submitEnquiry(data: JSON!, idempotencyKey: String): CommandResult!
    bookAssessment(
      programId: ID!, mode: String!, locationId: ID, startsAt: String!, tutorId: ID!, subjectId: ID,
      studentId: ID, student: AssessmentStudentInput, guardian: AssessmentGuardianInput, notes: String, idempotencyKey: String
    ): CommandResult!
    staffBookAssessment(
      familyId: ID!, studentId: ID!, programId: ID!, mode: String!, locationId: ID, startsAt: String!, tutorId: ID!,
      subjectId: ID, kind: String, minutes: Int, waiveFee: Boolean, idempotencyKey: String
    ): CommandResult!
    cancelAssessment(assessmentId: ID!, reason: String, idempotencyKey: String): CommandResult!
    rescheduleAssessment(assessmentId: ID!, startsAt: String!, tutorId: ID!, idempotencyKey: String): CommandResult!
    startAssessment(assessmentId: ID!, idempotencyKey: String): CommandResult!
    markAssessmentNoShow(assessmentId: ID!, idempotencyKey: String): CommandResult!
    completeAssessment(assessmentId: ID!, summary: String, recommendation: String, results: JSON, recommendedPlanId: ID, recommendedPackageId: ID, recommendedSessionsPerWeek: Int, idempotencyKey: String): CommandResult!
    transitionLead(leadId: ID!, to: String!, reason: String, idempotencyKey: String): CommandResult!
  }
`

type Ctx = any
const keyOf = (a: any) => (typeof a?.idempotencyKey === 'string' ? a.idempotencyKey : null)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const OPEN_LEAD = ['new', 'contacted', 'assessment_booked', 'assessed', 'proposal_sent']

/** System lead move (§4.1): forward only, never out of enrolled or lost. */
export async function advanceLead(tx: any, leadId: string | null | undefined, to: string, actorId?: string | null) {
  if (!leadId) return
  const order = ['new', 'contacted', 'assessment_booked', 'assessed', 'proposal_sent', 'enrolled']
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { status: true } })
  if (!lead || !order.includes(lead.status) || order.indexOf(lead.status) >= order.indexOf(to)) return
  const r = await tx.lead.updateMany({ where: { id: leadId, status: lead.status }, data: { status: to } })
  if (r.count) await recordChange(tx, { type: 'Lead', id: leadId, from: lead.status, to, actorId, reason: 'system' })
}

async function findOrCreateLead(tx: any, input: { email: string; guardianName: string; phone: string; studentName: string; programId: string; locationId: string | null; mode: string; familyId: string; studentId: string; subjectId?: string | null; levelId?: string | null; message?: string; actorId?: string | null }) {
  const existing = await tx.lead.findFirst({ where: { OR: [{ familyId: input.familyId }, { email: { equals: input.email, mode: 'insensitive' } }], status: { in: OPEN_LEAD } }, orderBy: { createdAt: 'desc' }, select: { id: true, familyId: true } })
  if (existing) {
    if (!existing.familyId) await tx.lead.update({ where: { id: existing.id }, data: { family: { connect: { id: input.familyId } }, student: { connect: { id: input.studentId } } } })
    return existing.id as string
  }
  const lead = await tx.lead.create({
    data: {
      guardianName: input.guardianName, email: input.email, phone: input.phone, studentName: input.studentName,
      program: { connect: { id: input.programId } }, ...(input.locationId ? { location: { connect: { id: input.locationId } } } : {}),
      ...(input.subjectId ? { subjects: { connect: [{ id: input.subjectId }] } } : {}),
      ...(input.levelId ? { level: { connect: { id: input.levelId } } } : {}),
      preferredMode: input.mode, source: 'website', status: 'new', message: input.message ?? '',
      family: { connect: { id: input.familyId } }, student: { connect: { id: input.studentId } },
      ...(input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}),
    },
    select: { id: true },
  })
  await recordChange(tx, { type: 'Lead', id: lead.id, to: 'new', actorId: input.actorId })
  return lead.id as string
}

async function createAssessmentRow(tx: any, input: { slot: Awaited<ReturnType<typeof holdAssessmentSlot>>; familyId: string; studentId: string; subjectId?: string | null; leadId: string | null; kind?: string; fee: number; actorId: string | null; mode: string }) {
  const { slot } = input
  let assessment: any
  try {
    assessment = await tx.assessment.create({
      data: {
        student: { connect: { id: input.studentId } }, family: { connect: { id: input.familyId } }, program: { connect: { id: slot.program.id } },
        ...(input.subjectId ? { subject: { connect: { id: input.subjectId } } } : {}),
        ...(slot.location ? { location: { connect: { id: slot.location.id } } } : {}),
        ...(slot.roomId ? { room: { connect: { id: slot.roomId } } } : {}),
        assessor: { connect: { id: slot.tutor.id } },
        ...(input.leadId ? { lead: { connect: { id: input.leadId } } } : {}),
        mode: input.mode, kind: input.kind ?? 'initial', scheduledAt: slot.startsAt, minutes: slot.minutes, status: 'scheduled',
        slotKey: slot.slotKey, fee: input.fee,
        ...(input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}),
      },
      select: { id: true },
    })
  } catch (error: any) {
    if (error?.code === 'P2002') throw new CommandError(SLOT_TAKEN)
    throw error
  }
  await recordChange(tx, { type: 'Assessment', id: assessment.id, to: 'scheduled', actorId: input.actorId, data: { startsAt: slot.startsAt.toISOString(), assessor: slot.tutor.id } })
  let invoiceId: string | null = null
  if (input.fee > 0) {
    const invoice = await createInvoice(tx, {
      familyId: input.familyId, locationId: slot.location?.id ?? null, kind: 'assessment', actorId: input.actorId,
      lines: [{ description: `Assessment: ${slot.program.name}`, kind: 'assessment', unitAmount: input.fee, studentId: input.studentId, programId: slot.program.id, assessmentId: assessment.id }],
      fulfilment: { kind: 'assessment', assessmentId: assessment.id },
    })
    invoiceId = invoice.id
    await tx.assessment.update({ where: { id: assessment.id }, data: { invoice: { connect: { id: invoice.id } } } })
  }
  return { id: assessment.id as string, invoiceId }
}

/** Guardian or staff with leads at the assessment's location. */
async function assessmentFor(tx: any, actor: Actor | null, id: string) {
  const a = await tx.assessment.findUnique({ where: { id }, select: { id: true, status: true, familyId: true, locationId: true, scheduledAt: true, minutes: true, programId: true, mode: true, assessorId: true, leadId: true, invoiceId: true, fee: true } })
  if (!a) throw new CommandError('That assessment was not found.')
  const staff = canAt(actor, 'canManageLeads', a.locationId)
  if (!staff) await requireGuardianOf(tx, actor, a.familyId)
  return { a, staff }
}

export const resolvers = {
  Mutation: {
    /** W1 "Find a tutor" / general enquiry: a Lead only. */
    submitEnquiry: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'submitEnquiry', input: args.data, idempotencyKey: keyOf(args), allowAnonymous: true }, async (tx, actor) => {
      const d = args.data || {}
      const email = requireString(d.email, 'Email', 200).toLowerCase()
      if (!EMAIL.test(email)) throw new CommandError('Enter a valid email address.')
      const lead = await tx.lead.create({
        data: {
          guardianName: requireString(d.guardianName ?? d.name, 'Your name', 120), email, phone: optionalString(d.phone, 40),
          studentName: optionalString(d.studentName, 120), message: optionalString(d.message, 3000), preferredTimes: optionalString(d.preferredTimes, 500),
          area: optionalString(d.area, 200), intent: d.intent === 'request_tutor' ? 'request_tutor' : 'enquiry',
          preferredMode: ['in_centre', 'online', 'in_home'].includes(d.mode) ? d.mode : null,
          ...(d.programId ? { program: { connect: { id: String(d.programId) } } } : {}),
          ...(d.locationId ? { location: { connect: { id: String(d.locationId) } } } : {}),
          ...(d.levelId ? { level: { connect: { id: String(d.levelId) } } } : {}),
          ...(Array.isArray(d.subjectIds) && d.subjectIds.length ? { subjects: { connect: d.subjectIds.slice(0, 10).map((id: unknown) => ({ id: String(id) })) } } : {}),
          ...(actor?.familyId ? { family: { connect: { id: actor.familyId } } } : {}),
          source: 'website', status: 'new',
        },
        select: { id: true },
      })
      await recordChange(tx, { type: 'Lead', id: lead.id, to: 'new', actorId: actor?.userId ?? null })
      return { id: lead.id }
    }),

    bookAssessment: (_: unknown, args: any, context: Ctx) => runCommand(context, {
      name: 'bookAssessment',
      input: { p: args.programId, m: args.mode, l: args.locationId ?? null, s: args.startsAt, t: args.tutorId, st: args.studentId ?? args.student ?? null, g: args.guardian?.email ?? null },
      idempotencyKey: keyOf(args), allowAnonymous: true, conflictMessage: SLOT_TAKEN,
    }, async (tx, actor) => {
      const startsAt = requireDate(args.startsAt, 'Time')
      const mode = String(args.mode)
      const locationId = mode === 'in_centre' ? (args.locationId ? String(args.locationId) : null) : null
      const guardian = await guardianForCommand(tx, actor, args.guardian, locationId, 'assessment booking')
      const familyId = guardian.familyId
      const studentId = await studentForCommand(tx, guardian, args.studentId, args.student)

      const slot = await holdAssessmentSlot(tx, { programId: String(args.programId), locationId, mode, startsAt, tutorId: String(args.tutorId) })
      const student = await tx.student.findUnique({ where: { id: studentId }, select: { firstName: true, lastName: true, levelId: true } })
      const leadId = await findOrCreateLead(tx, {
        email: guardian.email, guardianName: guardian.name, phone: guardian.phone, studentName: `${student.firstName} ${student.lastName}`.trim(),
        programId: slot.program.id, locationId, mode, familyId, studentId, subjectId: args.subjectId ? String(args.subjectId) : null, levelId: student.levelId,
        message: optionalString(args.notes, 2000), actorId: guardian.userId,
      })
      const created = await createAssessmentRow(tx, { slot, familyId, studentId, subjectId: args.subjectId ? String(args.subjectId) : null, leadId, fee: slot.program.assessmentFee || 0, actorId: guardian.userId, mode })
      await advanceLead(tx, leadId, 'assessment_booked', guardian.userId)
      await tx.notificationLog.create({ data: { recipient: guardian.email, template: 'assessment_booked', subject: `Assessment booked: ${slot.program.name}`, relatedType: 'Assessment', relatedId: created.id, status: 'queued' } })
      const data = {
        assessmentId: created.id, familyId, studentId, leadId, invoiceId: created.invoiceId, fee: slot.program.assessmentFee || 0,
        startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString(), timezone: slot.timezone,
        assessor: slot.tutor.displayName, location: slot.location ? { id: slot.location.id, name: slot.location.name } : null,
        newAccount: guardian.isNew, signedIn: Boolean(actor),
      }
      return {
        id: created.id, data,
        after: () => welcomeNewGuardian(context, guardian, 'bookAssessment'),
      }
    }),

    staffBookAssessment: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'staffBookAssessment', input: args, idempotencyKey: keyOf(args), conflictMessage: SLOT_TAKEN }, async (tx, actor) => {
      const mode = String(args.mode)
      const locationId = mode === 'in_centre' ? (args.locationId ? String(args.locationId) : null) : null
      requireFlag(actor, 'canManageLeads', locationId)
      const student = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { id: true, familyId: true, firstName: true, lastName: true, levelId: true } })
      if (!student || student.familyId !== String(args.familyId)) throw new CommandError('That student is not in this family.')
      const kind = ['initial', 're_assessment', 'parent_meeting'].includes(args.kind) ? args.kind : 'initial'
      const slot = await holdAssessmentSlot(tx, { programId: String(args.programId), locationId, mode, startsAt: requireDate(args.startsAt, 'Time'), tutorId: String(args.tutorId), minutes: args.minutes ?? undefined, staff: true })
      const guardianUser = await tx.user.findFirst({ where: { familyId: student.familyId }, select: { name: true, email: true, phone: true } })
      const leadId = kind === 'initial' && guardianUser ? await findOrCreateLead(tx, { email: guardianUser.email, guardianName: guardianUser.name, phone: guardianUser.phone, studentName: `${student.firstName} ${student.lastName}`, programId: slot.program.id, locationId, mode, familyId: student.familyId, studentId: student.id, levelId: student.levelId, actorId: actor!.userId }) : null
      const fee = args.waiveFee || kind !== 'initial' ? 0 : slot.program.assessmentFee || 0
      const created = await createAssessmentRow(tx, { slot, familyId: student.familyId, studentId: student.id, subjectId: args.subjectId ? String(args.subjectId) : null, leadId, kind, fee, actorId: actor!.userId, mode })
      await advanceLead(tx, leadId, 'assessment_booked', actor!.userId)
      return { id: created.id, data: { invoiceId: created.invoiceId, startsAt: slot.startsAt.toISOString(), assessor: slot.tutor.displayName } }
    }),

    cancelAssessment: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'cancelAssessment', input: { a: args.assessmentId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const { a, staff } = await assessmentFor(tx, actor, String(args.assessmentId))
      if (a.status !== 'scheduled' && a.status !== 'requested') throw new CommandError('Only an upcoming assessment can be cancelled.')
      const settings = await getSettings(tx)
      const hoursBefore = a.scheduledAt ? (a.scheduledAt.getTime() - Date.now()) / HOUR : Infinity
      // Centre cancel (staff) or ≥ window: refund in full. Later: kept when the setting says so.
      const byCentre = staff
      const refundable = byCentre || hoursBefore >= settings.assessmentCancelRefundHours || !settings.assessmentFeeKeptOnLateCancel
      await transition(tx, actor, 'assessment', 'Assessment', a.id, ['scheduled', 'requested'], 'cancelled', { slotKey: null, cancelReason: optionalString(args.reason, 500) || (byCentre ? 'Cancelled by the centre' : 'Cancelled by the family') }, byCentre ? 'centre' : 'family')
      const fee = await settleAssessmentFee(tx, actor, a, refundable ? 'refund' : 'keep')
      return { id: a.id, data: { refundable, fee }, after: async () => { for (const id of fee.refundIds) await processRefund(context.sudo().prisma, id) } }
    }),

    rescheduleAssessment: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'rescheduleAssessment', input: { a: args.assessmentId, s: args.startsAt, t: args.tutorId }, idempotencyKey: keyOf(args), conflictMessage: SLOT_TAKEN }, async (tx, actor) => {
      const { a, staff } = await assessmentFor(tx, actor, String(args.assessmentId))
      if (a.status !== 'scheduled') throw new CommandError('Only an upcoming assessment can be moved.')
      const settings = await getSettings(tx)
      if (!staff && a.scheduledAt.getTime() - Date.now() < settings.assessmentCancelRefundHours * HOUR) throw new CommandError(`Assessments can be moved up to ${settings.assessmentCancelRefundHours} hours before. Please call the centre.`)
      const slot = await holdAssessmentSlot(tx, { programId: a.programId, locationId: a.locationId, mode: a.mode, startsAt: requireDate(args.startsAt, 'Time'), tutorId: String(args.tutorId), minutes: a.minutes, staff }, a.id)
      let r
      try {
        r = await tx.assessment.updateMany({ where: { id: a.id, status: 'scheduled', scheduledAt: a.scheduledAt }, data: { scheduledAt: slot.startsAt, assessorId: slot.tutor.id, roomId: slot.roomId, slotKey: slot.slotKey } })
      } catch (error: any) {
        if (error?.code === 'P2002') throw new CommandError(SLOT_TAKEN)
        throw error
      }
      if (r.count !== 1) throw new CommandError('This assessment was changed by someone else. Reload and try again.')
      await recordChange(tx, { type: 'Assessment', id: a.id, from: 'scheduled', to: 'scheduled', actorId: actor!.userId, reason: 'rescheduled', data: { from: a.scheduledAt.toISOString(), to: slot.startsAt.toISOString(), assessor: slot.tutor.id } })
      return { id: a.id, data: { startsAt: slot.startsAt.toISOString(), assessor: slot.tutor.displayName } }
    }),

    startAssessment: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'startAssessment', input: { a: args.assessmentId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const a = await tx.assessment.findUnique({ where: { id: String(args.assessmentId) }, select: { id: true, locationId: true, assessorId: true } })
      if (!a) throw new CommandError('That assessment was not found.')
      if (!(actor?.tutorId && a.assessorId === actor.tutorId) && !canAt(actor, 'canManageLeads', a.locationId)) throw new CommandError('You do not have permission to do that here.')
      await transition(tx, actor, 'assessment', 'Assessment', a.id, 'scheduled', 'in_progress')
      return { id: a.id }
    }),

    markAssessmentNoShow: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'markAssessmentNoShow', input: { a: args.assessmentId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const a = await tx.assessment.findUnique({ where: { id: String(args.assessmentId) }, select: { id: true, locationId: true, scheduledAt: true, assessorId: true, invoiceId: true, fee: true, familyId: true, status: true } })
      if (!a) throw new CommandError('That assessment was not found.')
      requireFlag(actor, 'canManageLeads', a.locationId)
      if (a.scheduledAt && a.scheduledAt.getTime() > Date.now()) throw new CommandError('An assessment can be marked as a no-show once it has started.')
      await transition(tx, actor, 'assessment', 'Assessment', a.id, ['scheduled', 'in_progress'], 'no_show', { slotKey: null })
      const settings = await getSettings(tx)
      const fee = await settleAssessmentFee(tx, actor, a, settings.assessmentFeeKeptOnLateCancel ? 'keep' : 'refund')
      return { id: a.id, data: { fee }, after: async () => { for (const id of fee.refundIds) await processRefund(context.sudo().prisma, id) } }
    }),

    completeAssessment: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'completeAssessment', input: { a: args.assessmentId, s: args.summary ?? '', r: args.results ?? null }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const a = await tx.assessment.findUnique({ where: { id: String(args.assessmentId) }, select: { id: true, locationId: true, assessorId: true, leadId: true, studentId: true, status: true, _count: { select: { results: true } } } })
      if (!a) throw new CommandError('That assessment was not found.')
      // §4.2: only the assessor or a manager completes it.
      if (!(actor?.tutorId && a.assessorId === actor.tutorId) && !canAt(actor, 'canManageStaff', a.locationId)) throw new CommandError('Only the assessor or a manager can complete this assessment.')
      const results: any[] = Array.isArray(args.results) ? args.results.slice(0, 60) : []
      const summary = optionalString(args.summary, 5000)
      if (!results.length && !summary && !a._count.results) throw new CommandError('Add at least one score or a summary.')
      for (const r of results) {
        const score = Number(r?.score); const maxScore = Number(r?.maxScore ?? 10)
        if (!Number.isFinite(score) || !Number.isFinite(maxScore) || score < 0 || maxScore <= 0 || score > maxScore) throw new CommandError('Each score must be between 0 and its maximum.')
        await tx.assessmentResult.create({ data: { assessment: { connect: { id: a.id } }, skill: requireString(r.skill, 'Skill', 120), strand: optionalString(r.strand, 120), score, maxScore, levelEquivalent: optionalString(r.levelEquivalent, 60), note: optionalString(r.note, 1000), createdBy: { connect: { id: actor!.userId } } } })
      }
      await transition(tx, actor, 'assessment', 'Assessment', a.id, ['scheduled', 'in_progress'], 'completed', {
        slotKey: null, completedAt: new Date(), summary, recommendation: optionalString(args.recommendation, 5000),
        recommendedPlanId: args.recommendedPlanId ? String(args.recommendedPlanId) : null,
        recommendedPackageId: args.recommendedPackageId ? String(args.recommendedPackageId) : null,
        recommendedSessionsPerWeek: args.recommendedSessionsPerWeek ?? null,
      })
      await advanceLead(tx, a.leadId, 'assessed', actor!.userId)
      return { id: a.id, data: { results: results.length } }
    }),

    transitionLead: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'transitionLead', input: { l: args.leadId, t: args.to }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const lead = await tx.lead.findUnique({ where: { id: String(args.leadId) }, select: { id: true, status: true, locationId: true } })
      if (!lead) throw new CommandError('That lead was not found.')
      requireFlag(actor, 'canManageLeads', lead.locationId)
      const to = String(args.to)
      const allowed: Record<string, string[]> = {
        new: ['contacted', 'assessment_booked', 'lost'], contacted: ['assessment_booked', 'proposal_sent', 'lost', 'new'],
        assessment_booked: ['assessed', 'contacted', 'lost'], assessed: ['proposal_sent', 'lost'], proposal_sent: ['enrolled', 'assessed', 'lost'],
        lost: ['new'], enrolled: [],
      }
      if (!(allowed[lead.status] ?? []).includes(to)) throw new CommandError(`A ${lead.status.replace('_', ' ')} lead cannot move to ${to.replace('_', ' ')}.`)
      const reason = to === 'lost' ? requireString(args.reason, 'A reason', 500) : optionalString(args.reason, 500)
      await transition(tx, actor, 'lead', 'Lead', lead.id, lead.status, to, { ...(to === 'lost' ? { lostReason: reason } : {}), ...(to === 'contacted' ? { lastContactedAt: new Date() } : {}), ...(to === 'new' ? { lostReason: '' } : {}) }, reason || undefined)
      return { id: lead.id }
    }),
  },
}
