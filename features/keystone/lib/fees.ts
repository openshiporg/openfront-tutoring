/**
 * Assessment fee on cancel / no-show (§4.2): ≥ refund window or centre cancel → refunded in full;
 * later or no-show → kept when `assessmentFeeKeptOnLateCancel`. An unpaid fee invoice is voided
 * either way (nothing was taken). Card refunds are reserved here and sent to Stripe after commit.
 */
import type { Actor } from './actor'
import { requestRefund, voidInvoiceIfUnpaid } from './payments'

type Tx = any

export async function settleAssessmentFee(tx: Tx, actor: Actor | null, a: { id: string; invoiceId: string | null; fee: number }, decision: 'refund' | 'keep') {
  if (!a.invoiceId || !a.fee) return { action: 'none', refundIds: [] as string[] }
  const invoice = await tx.invoice.findUnique({ where: { id: a.invoiceId }, select: { id: true, status: true, amountPaid: true, payments: { where: { status: { in: ['captured', 'partially_refunded'] } }, select: { id: true, amount: true, refundedAmount: true } } } })
  if (!invoice) return { action: 'none', refundIds: [] }
  if (!invoice.amountPaid) {
    await voidInvoiceIfUnpaid(tx, invoice.id, 'Assessment cancelled before payment', actor?.userId)
    return { action: 'voided', refundIds: [] }
  }
  if (decision === 'keep') return { action: 'kept', refundIds: [] }
  const refundIds: string[] = []
  for (const p of invoice.payments) {
    const left = p.amount - (p.refundedAmount ?? 0)
    if (left <= 0) continue
    const refund = await requestRefund(tx, { paymentId: p.id, amount: left, reason: 'Assessment cancelled: fee refunded', actorId: actor?.userId, key: `assessment-refund:${a.id}:${p.id}` })
    refundIds.push(refund.id)
  }
  await tx.assessment.update({ where: { id: a.id }, data: { feeRefunded: true } })
  return { action: 'refunded', refundIds }
}
