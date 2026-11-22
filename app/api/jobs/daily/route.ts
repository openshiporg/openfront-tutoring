/**
 * POST /api/jobs/daily: billing, status moves, expiry, session generation, tasks, email.
 * Authorised by the secret onboarding generated (Settings → Jobs shows "Rotate"); stored hashed in
 * BusinessSettings, so no env var is needed. Send it as `Authorization: Bearer <secret>`.
 */
import { keystoneContext } from '@/features/keystone/context'
import { runDailyJobs, jobsSecretMatches } from '@/features/keystone/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const prisma = keystoneContext.sudo().prisma
  const header = request.headers.get('authorization') || ''
  const secret = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!(await jobsSecretMatches(prisma, secret))) return Response.json({ success: false, error: 'Not authorised' }, { status: 401 })
  const result = await runDailyJobs(prisma)
  return Response.json({ success: !('skipped' in result), ...result }, { status: 'skipped' in result ? 409 : 200 })
}
