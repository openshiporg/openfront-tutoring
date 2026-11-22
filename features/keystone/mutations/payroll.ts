/**
 * Payroll commands (W10, §4.12, adapted from Barbershop Commission / CommissionPayout).
 * Lines are never edited: disputes are fixed by voiding and adding lines. A run takes every
 * accrued line in its period (and location) not already in a run; approving moves all its
 * lines to `approved` in one transaction, so later lines for the period wait for the next run.
 * Money to tutors moves outside the system (D6): `markPayrollRunPaid` records method and
 * reference per tutor. `payrollRunCsv` is the accountant export.
 */
import { runCommand, requireString, requireInt, requireDate, optionalString, recordChange, transition, lockKey } from '../lib/command'
import { CommandError } from '../lib/errors'
import { requireFlag, isOwnerActor, loadActor, type Actor } from '../lib/actor'
import { getSettings, DAY } from '../lib/settings'

const gql = String.raw
type Ctx = any
const keyOf = (a: any) => (typeof a?.idempotencyKey === 'string' ? a.idempotencyKey : null)

const MANUAL_KINDS = ['prep', 'training', 'bonus', 'deduction', 'adjustment', 'trial'] as const
const PAY_METHODS = ['bank_transfer', 'cheque', 'cash', 'payroll_provider', 'other'] as const

export const typeDefs = gql`
  type Query {
    payrollRunCsv(payrollRunId: ID!): String
    payrollPreview(periodStart: String!, periodEnd: String!, locationId: ID): JSON
    myPayStatement(from: String, to: String): JSON
  }
  type Mutation {
    addPayLine(tutorId: ID!, kind: String!, amount: Int!, minutes: Int, workedAt: String, sessionId: ID, note: String!, idempotencyKey: String): CommandResult!
    voidPayLine(payLineId: ID!, reason: String!, idempotencyKey: String): CommandResult!
    createPayrollRun(periodStart: String, periodEnd: String, locationId: ID, idempotencyKey: String): CommandResult!
    approvePayrollRun(payrollRunId: ID!, idempotencyKey: String): CommandResult!
    cancelPayrollRun(payrollRunId: ID!, reason: String!, idempotencyKey: String): CommandResult!
    markPayrollRunPaid(payrollRunId: ID!, payments: JSON!, idempotencyKey: String): CommandResult!
  }
`

/** Lines a run for this period/location would take: accrued, not in a run, worked inside the period. */
function eligibleWhere(periodStart: Date, periodEnd: Date, locationId: string | null) {
  return {
    status: 'accrued',
    payrollRunId: null,
    workedAt: { gte: periodStart, lt: periodEnd },
    ...(locationId ? { OR: [{ session: { locationId } }, { sessionId: null, tutor: { locations: { some: { id: locationId } } } }] } : {}),
  }
}

/** A tutor's line can be added by payroll staff who cover one of the tutor's locations (or the owner). */
async function tutorLocation(tx: any, tutorId: string) {
  const t = await tx.tutor.findUnique({ where: { id: tutorId }, select: { id: true, status: true, locations: { select: { id: true } } } })
  if (!t) throw new CommandError('That tutor was not found.')
  return t
}

function requirePayrollFor(actor: Actor | null, locationIds: string[]) {
  if (!locationIds.length) return requireFlag(actor, 'canManagePayroll')
  let last: unknown
  for (const id of locationIds) {
    try { return requireFlag(actor, 'canManagePayroll', id) } catch (e) { last = e }
  }
  throw last
}

async function runFor(tx: any, id: string) {
  const run = await tx.payrollRun.findUnique({ where: { id }, select: { id: true, status: true, locationId: true, periodStart: true, periodEnd: true, payments: true } })
  if (!run) throw new CommandError('That payroll run was not found.')
  return run
}

/** Per-tutor totals for a set of lines (void lines excluded). */
export async function tutorTotals(tx: any, where: Record<string, unknown>) {
  const lines = await tx.payLine.findMany({
    where: { ...where, status: { not: 'void' } },
    select: { id: true, tutorId: true, kind: true, minutes: true, amount: true, tutor: { select: { displayName: true, employmentType: true } } },
  })
  const by = new Map<string, { tutorId: string; name: string; employmentType: string; lines: number; minutes: number; amount: number }>()
  for (const l of lines) {
    const t = by.get(l.tutorId) ?? { tutorId: l.tutorId, name: l.tutor?.displayName ?? '', employmentType: l.tutor?.employmentType ?? '', lines: 0, minutes: 0, amount: 0 }
    t.lines += 1
    t.minutes += l.minutes
    t.amount += l.amount
    by.set(l.tutorId, t)
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name))
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  // Spreadsheet formula injection guard, then RFC 4180 quoting.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
const money = (minor: number) => (minor / 100).toFixed(2)

export async function payrollCsv(prisma: any, runId: string) {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, select: { id: true, status: true, periodStart: true, periodEnd: true, paidAt: true, payments: true, location: { select: { name: true } } } })
  if (!run) throw new CommandError('That payroll run was not found.')
  const lines = await prisma.payLine.findMany({
    where: { payrollRunId: runId, status: { not: 'void' } },
    orderBy: [{ tutorId: 'asc' }, { workedAt: 'asc' }],
    select: { id: true, kind: true, workedAt: true, minutes: true, rate: true, amount: true, status: true, note: true, tutorId: true, tutor: { select: { displayName: true, employmentType: true } }, session: { select: { startsAt: true, program: { select: { name: true } }, location: { select: { name: true } } } } },
  })
  const paid = new Map<string, any>((Array.isArray(run.payments) ? run.payments : []).map((p: any) => [p.tutorId, p]))
  const rows = [['run_id', 'period_start', 'period_end', 'location', 'tutor', 'employment_type', 'line_id', 'kind', 'worked_at', 'programme', 'minutes', 'rate', 'amount', 'status', 'note', 'paid_method', 'paid_reference', 'paid_at']]
  for (const l of lines) {
    const p = paid.get(l.tutorId)
    rows.push([run.id, run.periodStart.toISOString().slice(0, 10), run.periodEnd.toISOString().slice(0, 10), l.session?.location?.name ?? run.location?.name ?? '', l.tutor?.displayName ?? '', l.tutor?.employmentType ?? '', l.id, l.kind, l.workedAt.toISOString(), l.session?.program?.name ?? '', String(l.minutes), money(l.rate), money(l.amount), l.status, l.note ?? '', p?.method ?? '', p?.reference ?? '', p?.paidAt ?? (run.paidAt ? run.paidAt.toISOString() : '')])
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

async function actorOf(context: Ctx): Promise<Actor | null> {
  return context.session?.itemId ? loadActor(context.sudo().prisma, context.session.itemId) : null
}

/** Read queries answer null when the caller may not see the data (like the generated API), never throw. */
const orNull = <A extends unknown[], T>(fn: (...a: A) => Promise<T>) => async (...a: A): Promise<T | null> => {
  try { return await fn(...a) } catch (error) { if (error instanceof CommandError) return null; throw error }
}

export const resolvers = {
  Query: {
    payrollRunCsv: orNull(async (_: unknown, args: any, context: Ctx) => {
      const prisma = context.sudo().prisma
      const actor = await actorOf(context)
      const run = await runFor(prisma, String(args.payrollRunId))
      const a = requireFlag(actor, 'canManagePayroll', run.locationId ?? undefined)
      if (!run.locationId && !isOwnerActor(a)) throw new CommandError('Only the owner sees the all-locations run.')
      return payrollCsv(prisma, run.id)
    }),
    payrollPreview: orNull(async (_: unknown, args: any, context: Ctx) => {
      const prisma = context.sudo().prisma
      const actor = await actorOf(context)
      const locationId = args.locationId ? String(args.locationId) : null
      const a = requireFlag(actor, 'canManagePayroll', locationId ?? undefined)
      if (!locationId && !isOwnerActor(a)) throw new CommandError('Pick a location.')
      const where = eligibleWhere(requireDate(args.periodStart, 'Period start'), requireDate(args.periodEnd, 'Period end'), locationId)
      return { tutors: await tutorTotals(prisma, where) }
    }),
    /** The signed-in tutor's own lines: every session, minutes, rate, amount, paid date (W10.4). */
    myPayStatement: async (_: unknown, args: any, context: Ctx) => {
      const prisma = context.sudo().prisma
      const actor = await actorOf(context)
      if (!actor?.tutorId) return null
      const to = args.to ? requireDate(args.to, 'To') : new Date()
      const from = args.from ? requireDate(args.from, 'From') : new Date(to.getTime() - 90 * DAY)
      const lines = await prisma.payLine.findMany({
        where: { tutorId: actor.tutorId, status: { not: 'void' }, workedAt: { gte: from, lt: to } },
        orderBy: { workedAt: 'desc' },
        take: 500,
        select: { id: true, kind: true, workedAt: true, minutes: true, rate: true, amount: true, status: true, note: true, session: { select: { program: { select: { name: true } } } }, payrollRun: { select: { id: true, status: true, paidAt: true } } },
      })
      return {
        from, to,
        totals: { accrued: lines.filter((l: any) => l.status === 'accrued').reduce((s: number, l: any) => s + l.amount, 0), approved: lines.filter((l: any) => l.status === 'approved').reduce((s: number, l: any) => s + l.amount, 0), paid: lines.filter((l: any) => l.status === 'paid').reduce((s: number, l: any) => s + l.amount, 0) },
        lines: lines.map((l: any) => ({ id: l.id, kind: l.kind, workedAt: l.workedAt, programme: l.session?.program?.name ?? null, minutes: l.minutes, rate: l.rate, amount: l.amount, status: l.status, note: l.note, paidAt: l.payrollRun?.paidAt ?? null })),
      }
    },
  },
  Mutation: {
    addPayLine: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'addPayLine', idempotencyKey: keyOf(args), input: { t: args.tutorId, k: args.kind, a: args.amount, m: args.minutes ?? null, w: args.workedAt ?? null, s: args.sessionId ?? null, n: args.note } }, async (tx, actor) => {
      const tutor = await tutorLocation(tx, String(args.tutorId))
      let sessionLocation: string | null = null
      if (args.sessionId) {
        const s = await tx.session.findUnique({ where: { id: String(args.sessionId) }, select: { id: true, tutorId: true, locationId: true } })
        if (!s || s.tutorId !== tutor.id) throw new CommandError('That session is not this tutor’s.')
        sessionLocation = s.locationId
      }
      const a = sessionLocation ? requireFlag(actor, 'canManagePayroll', sessionLocation) : requirePayrollFor(actor, tutor.locations.map((l: any) => l.id))
      const kind = String(args.kind)
      if (!(MANUAL_KINDS as readonly string[]).includes(kind)) throw new CommandError(`Pick a line kind: ${MANUAL_KINDS.join(', ')}.`)
      const raw = Number(args.amount)
      if (!Number.isInteger(raw) || raw === 0 || Math.abs(raw) > 10_000_000) throw new CommandError('Enter an amount (in cents), not zero.')
      // Deductions are always negative; other kinds positive unless an adjustment.
      const amount = kind === 'deduction' ? -Math.abs(raw) : kind === 'adjustment' ? raw : Math.abs(raw)
      const minutes = args.minutes == null ? 0 : requireInt(args.minutes, 'Minutes', 0, 24 * 60)
      const workedAt = args.workedAt ? requireDate(args.workedAt, 'Worked on') : new Date()
      const note = requireString(args.note, 'Note', 500)
      const rate = minutes > 0 && amount > 0 ? Math.round((amount * 60) / minutes) : 0
      const line = await tx.payLine.create({
        data: {
          tutor: { connect: { id: tutor.id } },
          ...(args.sessionId ? { session: { connect: { id: String(args.sessionId) } } } : {}),
          kind, workedAt, minutes, rate, amount, status: 'accrued', note,
          createdBy: { connect: { id: a.userId } },
        },
      })
      await recordChange(tx, { type: 'PayLine', id: line.id, to: 'accrued', actorId: a.userId, reason: note, data: { kind, amount } })
      return { id: line.id, data: { amount } }
    }),

    voidPayLine: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'voidPayLine', idempotencyKey: keyOf(args), input: { l: args.payLineId, r: args.reason } }, async (tx, actor) => {
      const line = await tx.payLine.findUnique({ where: { id: String(args.payLineId) }, select: { id: true, status: true, tutorId: true, payrollRunId: true, payrollRun: { select: { status: true } }, session: { select: { locationId: true } } } })
      if (!line) throw new CommandError('That pay line was not found.')
      const a = line.session?.locationId ? requireFlag(actor, 'canManagePayroll', line.session.locationId) : requirePayrollFor(actor, (await tutorLocation(tx, line.tutorId)).locations.map((l: any) => l.id))
      if (line.status !== 'accrued') throw new CommandError('Approved and paid lines are locked. Add an adjustment line to the next run instead.')
      const reason = requireString(args.reason, 'Reason', 300)
      // Leaving a draft run: the line drops out of it; the next run can pick up a replacement.
      await transition(tx, a, 'payLine', 'PayLine', line.id, 'accrued', 'void', { activeKey: null, voidReason: reason, payrollRunId: null }, reason)
      return { id: line.id }
    }),

    createPayrollRun: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'createPayrollRun', idempotencyKey: keyOf(args), input: { s: args.periodStart ?? null, e: args.periodEnd ?? null, l: args.locationId ?? null } }, async (tx, actor) => {
      const locationId = args.locationId ? String(args.locationId) : null
      // A business-wide run (all locations) is the owner's; a manager runs their location.
      const a = locationId ? requireFlag(actor, 'canManagePayroll', locationId) : requireFlag(actor, 'canManagePayroll')
      if (!locationId && !isOwnerActor(a)) throw new CommandError('Pick a location. Only the owner runs payroll for all locations.')
      const settings = await getSettings(tx)
      const periodEnd = args.periodEnd ? requireDate(args.periodEnd, 'Period end') : new Date()
      const periodStart = args.periodStart ? requireDate(args.periodStart, 'Period start') : new Date(periodEnd.getTime() - settings.payrollPeriodDays * DAY)
      if (periodStart >= periodEnd) throw new CommandError('The period must end after it starts.')
      if (periodEnd.getTime() - periodStart.getTime() > 62 * DAY) throw new CommandError('A run covers at most two months.')
      // One run at a time per location, so two managers cannot claim the same lines.
      await lockKey(tx, `payroll:${locationId ?? 'all'}`)
      const open = await tx.payrollRun.findFirst({ where: { status: 'draft', locationId }, select: { id: true } })
      if (open) throw new CommandError('A draft run is already open here. Approve or cancel it first.', { payrollRunId: open.id })
      const where = eligibleWhere(periodStart, periodEnd, locationId)
      const lines = await tx.payLine.findMany({ where, select: { id: true } })
      if (!lines.length) throw new CommandError('No unpaid lines in that period.')
      const run = await tx.payrollRun.create({ data: { ...(locationId ? { location: { connect: { id: locationId } } } : {}), periodStart, periodEnd, status: 'draft', payments: [], createdBy: { connect: { id: a.userId } } } })
      // Claim only lines still accrued and unclaimed (a line joins at most one run).
      const claimed = await tx.payLine.updateMany({ where: { id: { in: lines.map((l: any) => l.id) }, status: 'accrued', payrollRunId: null }, data: { payrollRunId: run.id } })
      await recordChange(tx, { type: 'PayrollRun', id: run.id, to: 'draft', actorId: a.userId, data: { lines: claimed.count } })
      return { id: run.id, data: { lines: claimed.count, tutors: await tutorTotals(tx, { payrollRunId: run.id }) } }
    }),

    approvePayrollRun: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'approvePayrollRun', idempotencyKey: keyOf(args), input: { r: args.payrollRunId } }, async (tx, actor) => {
      const run = await runFor(tx, String(args.payrollRunId))
      // §7: manager drafts, owner approves.
      const a = requireFlag(actor, 'canManagePayroll', run.locationId ?? undefined)
      if (!isOwnerActor(a)) throw new CommandError('Only the owner approves a payroll run.')
      await lockKey(tx, `payroll-run:${run.id}`)
      await transition(tx, a, 'payrollRun', 'PayrollRun', run.id, 'draft', 'approved', { approvedById: a.userId, approvedAt: new Date() })
      // Every line moves in this transaction; void lines stay void.
      const moved = await tx.payLine.updateMany({ where: { payrollRunId: run.id, status: 'accrued' }, data: { status: 'approved' } })
      const total = await tx.payLine.aggregate({ where: { payrollRunId: run.id, status: 'approved' }, _sum: { amount: true } })
      return { id: run.id, data: { lines: moved.count, total: total._sum.amount ?? 0 } }
    }),

    cancelPayrollRun: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'cancelPayrollRun', idempotencyKey: keyOf(args), input: { r: args.payrollRunId, x: args.reason } }, async (tx, actor) => {
      const run = await runFor(tx, String(args.payrollRunId))
      const a = requireFlag(actor, 'canManagePayroll', run.locationId ?? undefined)
      if (!run.locationId && !isOwnerActor(a)) throw new CommandError('Only the owner cancels the all-locations run.')
      const reason = requireString(args.reason, 'Reason', 300)
      await lockKey(tx, `payroll-run:${run.id}`)
      await transition(tx, a, 'payrollRun', 'PayrollRun', run.id, 'draft', 'cancelled', {}, reason)
      // Release the lines for the next run.
      const released = await tx.payLine.updateMany({ where: { payrollRunId: run.id, status: 'accrued' }, data: { payrollRunId: null } })
      return { id: run.id, data: { released: released.count } }
    }),

    markPayrollRunPaid: (_: unknown, args: any, context: Ctx) => runCommand(context, { name: 'markPayrollRunPaid', idempotencyKey: keyOf(args), input: { r: args.payrollRunId, p: args.payments } }, async (tx, actor) => {
      const run = await runFor(tx, String(args.payrollRunId))
      const a = requireFlag(actor, 'canManagePayroll', run.locationId ?? undefined)
      if (!isOwnerActor(a)) throw new CommandError('Only the owner marks a payroll run paid.')
      await lockKey(tx, `payroll-run:${run.id}`)
      if (run.status !== 'approved') throw new CommandError(run.status === 'paid' ? 'This run is already marked paid.' : 'Approve the run before marking it paid.')
      const totals = await tutorTotals(tx, { payrollRunId: run.id })
      const input = Array.isArray(args.payments) ? args.payments : []
      const byTutor = new Map<string, any>(input.map((p: any) => [String(p?.tutorId ?? ''), p]))
      const now = new Date()
      const payments = totals.map((t) => {
        const p = byTutor.get(t.tutorId)
        if (!p) throw new CommandError(`Record how ${t.name || 'each tutor'} was paid.`)
        const method = String(p.method ?? '')
        if (!(PAY_METHODS as readonly string[]).includes(method)) throw new CommandError(`Pick a payment method for ${t.name}: ${PAY_METHODS.join(', ')}.`)
        const reference = optionalString(p.reference, 200)
        if (method !== 'cash' && !reference) throw new CommandError(`Enter the payment reference for ${t.name}.`)
        return { tutorId: t.tutorId, name: t.name, amount: t.amount, method, reference, paidAt: (p.paidAt ? requireDate(p.paidAt, 'Paid on') : now).toISOString() }
      })
      const extra = input.filter((p: any) => !totals.some((t) => t.tutorId === String(p?.tutorId ?? '')))
      if (extra.length) throw new CommandError('One of the payments is for a tutor who is not in this run.')
      await transition(tx, a, 'payrollRun', 'PayrollRun', run.id, 'approved', 'paid', { paidAt: now, payments })
      const moved = await tx.payLine.updateMany({ where: { payrollRunId: run.id, status: 'approved' }, data: { status: 'paid' } })
      return { id: run.id, data: { lines: moved.count, payments } }
    }),
  },
}
