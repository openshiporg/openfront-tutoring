import { keystoneContext } from '@/features/keystone/context'
import { serveFile } from '@/features/keystone/lib/files'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return serveFile(keystoneContext, request, path ?? [])
}
