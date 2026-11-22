/** Invoices (§4.10). Numbers are sequential per business, taken with a guarded increment. */
import { CommandError } from './errors'
import { getBusiness } from './settings'

export type Tx = any

export type LineInput = {
  description: string
  kind: string
  quantity?: number
  unitAmount: number
  studentId?: string | null
  programId?: string | null
  bookingId?: string | null
  membershipId?: string | null
  studentPackageId?: string | null
  assessmentId?: string | null
}

async function nextNumber(tx: Tx): Promise<number> {
  await tx.business.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })
  const rows: Array<{ n: number }> = await tx.$queryRaw`
    UPDATE "Business" SET "nextInvoiceNumber" = COALESCE("nextInvoiceNumber", 1001) + 1 WHERE id = 1
    RETURNING COALESCE("nextInvoiceNumber", 1002) - 1 AS n`
  return Number(rows[0].n)
}

export async function createInvoice(tx: Tx, input: {
  familyId: string; locationId?: string | null; kind: string; lines: LineInput[]; dueAt?: Date | null
  status?: 'draft' | 'open'; discount?: number; promoCodeId?: string | null; fulfilment?: Record<string, unknown>; actorId?: string | null; notes?: string
}) {
  if (!input.lines.length) throw new CommandError('An invoice needs at least one line.')
  const business = await getBusiness(tx)
  let taxRate = 0
  if (input.locationId) {
    const loc = await tx.location.findUnique({ where: { id: input.locationId }, select: { taxRatePercent: true } })
    taxRate = Number(loc?.taxRatePercent ?? 0)
  }
  const lines = input.lines.map((l) => ({ ...l, quantity: l.quantity ?? 1, amount: (l.quantity ?? 1) * l.unitAmount }))
  const subtotal = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0)
  const lineDiscount = -lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0)
  const discount = Math.min(subtotal, (input.discount ?? 0) + lineDiscount)
  const tax = Math.round(((subtotal - discount) * taxRate) / 100)
  const total = subtotal - discount + tax
  const status = input.status ?? 'open'
  const invoice = await tx.invoice.create({
    data: {
      number: await nextNumber(tx),
      family: { connect: { id: input.familyId } },
      ...(input.locationId ? { location: { connect: { id: input.locationId } } } : {}),
      ...(input.promoCodeId ? { promoCode: { connect: { id: input.promoCodeId } } } : {}),
      ...(input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}),
      kind: input.kind,
      status,
      issuedAt: status === 'open' ? new Date() : null,
      dueAt: input.dueAt ?? new Date(),
      subtotal, discount, tax, total,
      currency: business.currency || 'USD',
      fulfilment: (input.fulfilment ?? {}) as any,
      notes: input.notes ?? '',
      lines: {
        create: lines.map((l) => ({
          description: l.description, kind: l.kind, quantity: l.quantity, unitAmount: l.unitAmount, amount: l.amount,
          ...(l.studentId ? { student: { connect: { id: l.studentId } } } : {}),
          ...(l.programId ? { program: { connect: { id: l.programId } } } : {}),
          ...(l.bookingId ? { booking: { connect: { id: l.bookingId } } } : {}),
          ...(l.membershipId ? { membership: { connect: { id: l.membershipId } } } : {}),
          ...(l.studentPackageId ? { studentPackage: { connect: { id: l.studentPackageId } } } : {}),
          ...(l.assessmentId ? { assessment: { connect: { id: l.assessmentId } } } : {}),
        })),
      },
    },
  })
  return invoice
}

export function amountDue(inv: { total: number; amountPaid: number; amountCredited: number }) {
  return Math.max(0, inv.total - inv.amountPaid - inv.amountCredited)
}

/**
 * Apply money to an invoice with a guarded update (never over the total).
 * Returns the new status. Fulfilment runs when it becomes paid (caller's job).
 */
export async function applyToInvoice(tx: Tx, invoiceId: string, amount: number, field: 'amountPaid' | 'amountCredited' = 'amountPaid') {
  const col = field === 'amountPaid' ? 'amountPaid' : 'amountCredited'
  const rows: number = col === 'amountPaid'
    ? await tx.$executeRaw`UPDATE "Invoice" SET "amountPaid" = "amountPaid" + ${amount}, "updatedAt" = now()
        WHERE id = ${invoiceId} AND status IN ('open','partially_paid') AND "amountPaid" + "amountCredited" + ${amount} <= total`
    : await tx.$executeRaw`UPDATE "Invoice" SET "amountCredited" = "amountCredited" + ${amount}, "updatedAt" = now()
        WHERE id = ${invoiceId} AND status IN ('open','partially_paid','paid') AND "amountPaid" + "amountCredited" + ${amount} <= total`
  if (rows !== 1) throw new CommandError(field === 'amountPaid' ? 'That is more than the amount due on this invoice.' : 'That credit note is more than the invoice total less payments.')
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, total: true, amountPaid: true, amountCredited: true } })
  const due = amountDue(inv)
  const next = due === 0 ? 'paid' : inv.amountPaid + inv.amountCredited > 0 ? 'partially_paid' : 'open'
  if (next !== inv.status) {
    await tx.invoice.updateMany({ where: { id: invoiceId, status: inv.status }, data: { status: next } })
    await tx.changeEvent.create({ data: { aggregateType: 'Invoice', aggregateId: invoiceId, from: inv.status, to: next, reason: field, data: { amount } } })
  }
  return { from: inv.status as string, to: next as string }
}
