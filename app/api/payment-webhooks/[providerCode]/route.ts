/**
 * Payment provider webhooks. Stripe posts here: /api/payment-webhooks/stripe
 * The raw body is read with a 1 MiB bound and verified against the signing secret before parsing.
 */
import { keystoneContext } from '@/features/keystone/context'
import { processStripeWebhook } from '@/features/keystone/lib/webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 1_048_576

async function boundedBody(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('content-length') || 0)
  if (declared > MAX_BYTES) return null
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) { await reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength }
  return out
}

export async function POST(request: Request, { params }: { params: Promise<{ providerCode: string }> }) {
  const { providerCode } = await params
  if (providerCode !== 'stripe' && providerCode !== 'pp_stripe') return Response.json({ success: false, outcome: 'unknown_provider' }, { status: 404 })
  const body = await boundedBody(request)
  if (!body) return Response.json({ success: false, outcome: 'too_large' }, { status: 413 })
  const result = await processStripeWebhook(keystoneContext.sudo().prisma, body, request.headers.get('stripe-signature') || '')
  return Response.json(result.body, { status: result.status })
}
