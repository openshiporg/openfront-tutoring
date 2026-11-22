/**
 * Tutor pay lines (§4.12, adapted from Barbershop Commission). Hourly, in minor units.
 * - 1:1 session: one line per booking (activeKey "booking:<id>").
 * - group/class session: one line per session however many students ("session:<id>").
 * - A tutor no-show (session cancelled by centre for tutor_absent) creates none.
 * - Late cancel / no-show pay the tutor the setting's percentage.
 */
import { getSettings } from './settings'

export type Tx = any

export async function rateFor(tx: Tx, tutorId: string, subjectId: string | null) {
  if (subjectId) {
    const ts = await tx.tutorSubject.findFirst({ where: { tutorId, subjectId }, select: { payRate: true } })
    if (ts?.payRate) return ts.payRate as number
  }
  const tutor = await tx.tutor.findUnique({ where: { id: tutorId }, select: { defaultPayRate: true } })
  return (tutor?.defaultPayRate ?? 0) as number
}

const amountFor = (rate: number, minutes: number, percent = 100) => Math.round((rate * minutes * percent) / 6000)

async function voidByKey(tx: Tx, key: string, reason: string) {
  const line = await tx.payLine.findUnique({ where: { activeKey: key }, select: { id: true, status: true } })
  if (!line) return { voided: false, locked: false, line: null }
  if (line.status !== 'accrued') return { voided: false, locked: true, line }
  await tx.payLine.updateMany({ where: { id: line.id, status: 'accrued' }, data: { status: 'void', activeKey: null, voidReason: reason } })
  return { voided: true, locked: false, line }
}

/** Is this booking's or session's pay already in an approved or paid run? */
export async function payLocked(tx: Tx, booking: { id: string; sessionId: string }) {
  const locked = await tx.payLine.findFirst({
    where: { OR: [{ activeKey: `booking:${booking.id}` }, { activeKey: `session:${booking.sessionId}` }], status: { in: ['approved', 'paid'] } },
    select: { id: true },
  })
  return Boolean(locked)
}

/** Recompute the pay line(s) for a session after attendance changes. */
export async function accruePay(tx: Tx, sessionId: string) {
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    select: { id: true, tutorId: true, subjectId: true, startsAt: true, endsAt: true, status: true, program: { select: { format: true } }, bookings: { select: { id: true, status: true, minutes: true } } },
  })
  if (!session?.tutorId) return
  const settings = await getSettings(tx)
  const minutes = Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60000)
  const rate = await rateFor(tx, session.tutorId, session.subjectId)
  const percentFor = (status: string) =>
    status === 'attended' || status === 'late' ? 100
      : status === 'cancelled_late' || status === 'cancelled_late_excused' ? (settings.lateCancelCharged ? settings.tutorPaidOnLateCancelPercent : 0)
        : status === 'no_show' ? (settings.noShowCharged ? settings.tutorPaidOnNoShowPercent : 0) : 0
  const kindFor = (status: string) => (status === 'no_show' ? 'no_show' : status.startsWith('cancelled_late') ? 'late_cancel' : 'session')

  if (session.program?.format === 'one_to_one') {
    for (const b of session.bookings) {
      const key = `booking:${b.id}`
      const percent = session.status === 'cancelled' ? 0 : percentFor(b.status)
      const existing = await tx.payLine.findUnique({ where: { activeKey: key }, select: { id: true, status: true, amount: true, kind: true } })
      const amount = amountFor(rate, b.minutes || minutes, percent)
      if (existing?.status && existing.status !== 'accrued') continue
      if (existing && (percent === 0 || existing.amount !== amount || existing.kind !== kindFor(b.status))) await voidByKey(tx, key, 'Attendance changed')
      if (percent > 0 && !(existing && existing.amount === amount && existing.kind === kindFor(b.status))) {
        await tx.payLine.create({ data: { tutor: { connect: { id: session.tutorId } }, session: { connect: { id: session.id } }, booking: { connect: { id: b.id } }, kind: kindFor(b.status), workedAt: session.startsAt, minutes: b.minutes || minutes, rate, amount, status: 'accrued', activeKey: key } })
      }
    }
    return
  }
  // Group: paid once when any student attended or (per setting) was charged.
  const key = `session:${session.id}`
  const best = session.status === 'cancelled' ? 0 : Math.max(0, ...session.bookings.map((b: any) => percentFor(b.status)))
  const amount = amountFor(rate, minutes, best)
  const existing = await tx.payLine.findUnique({ where: { activeKey: key }, select: { id: true, status: true, amount: true } })
  if (existing?.status && existing.status !== 'accrued') return
  if (existing && existing.amount !== amount) await voidByKey(tx, key, 'Attendance changed')
  if (best > 0 && !(existing && existing.amount === amount)) {
    await tx.payLine.create({ data: { tutor: { connect: { id: session.tutorId } }, session: { connect: { id: session.id } }, kind: 'session', workedAt: session.startsAt, minutes, rate, amount, status: 'accrued', activeKey: key } })
  }
}

export async function voidSessionPay(tx: Tx, sessionId: string, reason: string) {
  const lines = await tx.payLine.findMany({ where: { sessionId, status: 'accrued' }, select: { id: true } })
  for (const l of lines) await tx.payLine.updateMany({ where: { id: l.id, status: 'accrued' }, data: { status: 'void', activeKey: null, voidReason: reason } })
  return lines.length
}

/** Correction after an approved run: an adjustment line for the next run (§4.7). */
export async function adjustmentLine(tx: Tx, input: { tutorId: string; sessionId: string; bookingId?: string; amount: number; note: string; actorId?: string }) {
  return tx.payLine.create({
    data: {
      tutor: { connect: { id: input.tutorId } },
      session: { connect: { id: input.sessionId } },
      kind: 'adjustment', workedAt: new Date(), minutes: 0, rate: 0, amount: input.amount, status: 'accrued', note: input.note,
      ...(input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}),
    },
  })
}
