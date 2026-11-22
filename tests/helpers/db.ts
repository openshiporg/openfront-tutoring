/**
 * Real-Postgres harness (Dental/Gym pattern). Tests run against the scratch database
 * in its own Postgres schema `suite`, migrated with `prisma migrate deploy` once per run.
 * URL: TUTORING_TEST_DATABASE_URL, else DATABASE_URL. Never printed.
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const base = process.env.TUTORING_TEST_DATABASE_URL || process.env.DATABASE_URL || ''
export const hasDatabase = /^postgres(ql)?:\/\//.test(base)
export const skipReason = hasDatabase ? false : 'Set TUTORING_TEST_DATABASE_URL (or DATABASE_URL) to a Postgres database to run the state-machine tests.'

function withSchema(url: string, schema: string) {
  const u = new URL(url)
  u.searchParams.set('schema', schema)
  if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '20')
  if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', '60')
  // A dead TCP connection (no FIN/RST from the network path) otherwise hangs a query until the
  // OS gives up retransmitting, 15-22 minutes on macOS, then fails with P1017. 150 s is above the
  // 120 s transaction timeout, so a real lock wait never trips it.
  if (!u.searchParams.has('socket_timeout')) u.searchParams.set('socket_timeout', '150')
  return u.toString()
}

let contextPromise: Promise<any> | null = null
let suiteLock: any = null

/**
 * Two test processes on one schema TRUNCATE each other's rows mid-test. Each process holds a
 * session advisory lock on its own pinned connection until it exits; a second one waits.
 */
async function lockSuite(url: string, schema: string) {
  const { PrismaClient } = await import('@prisma/client')
  const u = new URL(url)
  u.searchParams.set('connection_limit', '1')
  u.searchParams.delete('socket_timeout')
  suiteLock = new PrismaClient({ datasourceUrl: u.toString() })
  const key = `tutoring-test-suite:${schema}`
  for (let waited = 0; ; waited += 5) {
    const [row]: any = await suiteLock.$queryRawUnsafe(`SELECT pg_try_advisory_lock(hashtext($1)) AS ok`, key)
    if (row.ok) return
    if (waited % 60 === 0) console.error(`waiting for another test run on schema "${schema}" to finish`)
    await new Promise((r) => setTimeout(r, 5000))
  }
}

export async function getTestContext(): Promise<any> {
  if (!hasDatabase) throw new Error('No database configured')
  if (!contextPromise) {
    contextPromise = (async () => {
      const schema = process.env.TUTORING_TEST_SCHEMA || 'suite'
      const url = withSchema(base, schema)
      await lockSuite(url, schema)
      process.env.DATABASE_URL = url
      if (!(globalThis as any).__tutoringMigrated) {
        try {
          execFileSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe', timeout: 300_000 })
        } catch (error: any) {
          const out = String(error?.stdout || '') + String(error?.stderr || '')
          throw new Error('prisma migrate deploy failed: ' + out.split(base).join('<db>').slice(-800))
        }
        ;(globalThis as any).__tutoringMigrated = true
      }
      const { getContext } = await import('@keystone-6/core/context')
      const PrismaModule = await import('@prisma/client')
      const config = (await import('../../features/keystone/index')).default
      return getContext(config as any, PrismaModule as any)
    })()
  }
  return contextPromise
}

/** Wipes every table (CASCADE) in the suite schema. */
export async function resetDatabase(context: any) {
  const prisma = context.prisma
  const rows: Array<{ tablename: string }> = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`)
  const names = rows.map((r) => `"${r.tablename}"`)
  if (names.length) await prisma.$executeRawUnsafe(`TRUNCATE ${names.join(', ')} RESTART IDENTITY CASCADE`)
}

export function uid(prefix = 'x') {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

/** A context acting as `userId`, the way a request with that session would. */
export async function asUser(context: any, userId: string) {
  const data = await context.sudo().query.User.findOne({
    where: { id: userId },
    query: `name email role { id name ${(await import('../../features/keystone/access')).ROLE_FLAGS.join(' ')} } locationMemberships { id role status location { id status } } tutor { id } family { id }`,
  })
  return context.withSession({ itemId: userId, listKey: 'User', data })
}
