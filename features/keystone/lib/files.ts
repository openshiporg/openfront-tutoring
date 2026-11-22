/**
 * Private files (§5.8, §8), adapted from openfront-tutor `api/files`. URL: /api/files/<kind>/<id>,
 * or /api/files/<filename> (the `url` Keystone's file field generates), resolved to its record.
 * - report:      a SessionReport attachment. The report's tutor, staff who mark attendance at the
 *                session's location, or (once published) a guardian of the student's family.
 * - credential:  a TutorCredential document. The tutor it belongs to, or tutor managers at one
 *                of the tutor's locations.
 * - application: a TutorApplication CV. Tutor managers.
 * Anything else, or no access, is 404 (never reveals that a file exists).
 * Local storage streams from uploads/files (outside public/); S3 redirects to a signed URL.
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { loadActor, can, canAt, type Actor } from './actor'

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })

/** Which file this actor may download, or null. Pure data access: no request, no streaming. */
export async function allowedFile(prisma: any, actor: Actor | null, kind: string, id: string): Promise<string | null> {
  if (!actor || !id) return null
  if (kind === 'report') {
    const r = await prisma.sessionReport.findUnique({ where: { id }, select: { attachment_filename: true, publishedAt: true, tutorId: true, session: { select: { locationId: true } }, student: { select: { familyId: true } } } })
    if (!r?.attachment_filename) return null
    const ok = (actor.tutorId && r.tutorId === actor.tutorId)
      || canAt(actor, 'canMarkAttendance', r.session?.locationId ?? null)
      || (r.publishedAt && actor.familyId && r.student?.familyId === actor.familyId)
    return ok ? r.attachment_filename : null
  }
  if (kind === 'credential') {
    const c = await prisma.tutorCredential.findUnique({ where: { id }, select: { document_filename: true, tutorId: true, tutor: { select: { locations: { select: { id: true } } } } } })
    if (!c?.document_filename) return null
    const locations = (c.tutor?.locations ?? []).map((l: any) => l.id)
    const ok = (actor.tutorId && c.tutorId === actor.tutorId)
      || (can(actor, 'canManageTutors') && (locations.length ? locations.some((l: string) => canAt(actor, 'canManageTutors', l)) : canAt(actor, 'canManageTutors', null)))
    return ok ? c.document_filename : null
  }
  if (kind === 'application') {
    const a = await prisma.tutorApplication.findUnique({ where: { id }, select: { cv_filename: true } })
    if (!a?.cv_filename) return null
    return canAt(actor, 'canManageTutors', null) ? a.cv_filename : null
  }
  return null
}

/** /api/files/<filename>: find the one record that holds this stored filename. */
export async function recordForFilename(prisma: any, filename: string): Promise<{ kind: string; id: string } | null> {
  if (!filename || filename.includes('/') || filename.includes('..')) return null
  const r = await prisma.sessionReport.findFirst({ where: { attachment_filename: filename }, select: { id: true } })
  if (r) return { kind: 'report', id: r.id }
  const c = await prisma.tutorCredential.findFirst({ where: { document_filename: filename }, select: { id: true } })
  if (c) return { kind: 'credential', id: c.id }
  const a = await prisma.tutorApplication.findFirst({ where: { cv_filename: filename }, select: { id: true } })
  if (a) return { kind: 'application', id: a.id }
  return null
}

export async function serveFile(context: any, request: Request, parts: string[]) {
  const ctx = await context.withRequest({ headers: { cookie: request.headers.get('cookie') || '' }, method: request.method, url: new URL(request.url).pathname } as IncomingMessage).catch(() => null)
  const userId = ctx?.session?.itemId
  if (!userId) return notFound()
  const prisma = context.sudo().prisma
  const target = parts.length === 2 ? { kind: parts[0], id: parts[1] } : parts.length === 1 ? await recordForFilename(prisma, decodeURIComponent(parts[0])) : null
  if (!target) return notFound()
  const { kind, id } = target
  const filename = await allowedFile(prisma, await loadActor(prisma, String(userId)), kind, id)
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) return notFound()
  if (process.env.S3_BUCKET_NAME && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    const url = await context.sudo().files('my_files').getUrl(filename)
    return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'private, no-store' } })
  }
  const file = path.join(process.cwd(), 'uploads/files', filename)
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) return notFound()
  const shown = filename.replace(/^[A-Za-z0-9_-]{10,}-/, '').replace(/["\r\n]/g, '')
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      'content-length': String(info.size),
      'content-disposition': `attachment; filename="${shown}"`,
      'content-type': 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
    },
  })
}
