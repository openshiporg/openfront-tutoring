/**
 * Notices (§5.7 NotificationLog). Commands queue a row inside their transaction; delivery runs
 * after commit (daily job, or immediately by the caller) through the deployment's SMTP settings.
 * Without SMTP a row is marked `failed` with the reason, so the platform shows what was not sent.
 */
import { createTransport } from 'nodemailer'

type Tx = any

export async function queueEmail(tx: Tx, input: { to: string; template: string; subject: string; relatedType: string; relatedId: string }) {
  if (!input.to) return null
  return tx.notificationLog.create({ data: { recipient: input.to, template: input.template, subject: input.subject.slice(0, 200), relatedType: input.relatedType, relatedId: input.relatedId, channel: 'email', status: 'queued' } })
}

const BODIES: Record<string, (subject: string, link: string) => string> = {
  default: (subject, link) => `${subject}.\n\nSee the details in your account: ${link}`,
}

export async function deliverQueued(prisma: any, limit = 50) {
  const host = process.env.SMTP_HOST
  const rows = await prisma.notificationLog.findMany({ where: { status: 'queued', channel: 'email' }, orderBy: { createdAt: 'asc' }, take: limit })
  if (!rows.length) return { sent: 0, failed: 0, waiting: 0 }
  if (!host) {
    // §8: nothing pretends to have sent. The dashboard shows a banner while SMTP is missing.
    await prisma.notificationLog.updateMany({ where: { id: { in: rows.map((r: any) => r.id) } }, data: { status: 'failed', error: 'Email is not set up (SMTP settings missing).' } })
    return { sent: 0, failed: rows.length, waiting: 0 }
  }
  const transport = createTransport({ host, port: Number(process.env.SMTP_PORT || 587), auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined } as any)
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost'
  const link = `${process.env.SMTP_STORE_LINK || ''}/account`
  let sent = 0
  let failed = 0
  for (const r of rows) {
    if (!r.recipient) continue
    try {
      await transport.sendMail({ from, to: r.recipient, subject: r.subject, text: (BODIES[r.template] ?? BODIES.default)(r.subject, link) })
      await prisma.notificationLog.update({ where: { id: r.id }, data: { status: 'sent', sentAt: new Date(), error: '' } })
      sent += 1
    } catch (error) {
      await prisma.notificationLog.update({ where: { id: r.id }, data: { status: 'failed', error: String((error as Error)?.message).slice(0, 500) } })
      failed += 1
    }
  }
  return { sent, failed, waiting: 0 }
}
