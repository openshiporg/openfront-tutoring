/**
 * Command runner for every status-changing mutation (§4 rules):
 *  - loads the actor from the database (never trusts a stale session snapshot),
 *  - runs the command in ONE transaction,
 *  - makes it idempotent by `idempotencyKey` through CommandReceipt (Barbershop pattern:
 *    advisory lock on the key, same payload hash returns the stored result, a different
 *    payload is refused),
 *  - offers compare-and-set (`cas`) and ChangeEvent writing to the command body.
 */
import { createHash } from 'node:crypto'
import { canonicalJson } from './json'
import { loadActor, type Actor } from './actor'

import { CommandError } from './errors'
export { CommandError }

export type CommandResult<T = unknown> = { success: boolean; error: string | null; id: string | null; data: T | null }

export type Tx = any

const TX_OPTIONS = { maxWait: 60_000, timeout: 120_000 }

function isRetryable(error: unknown) {
  const code = (error as { code?: string })?.code
  return code === 'P2034' || /deadlock detected|could not serialize/i.test(String((error as Error)?.message || ''))
}

/** prisma.$transaction with retries on deadlock / serialization failures. */
export async function transaction<T>(prisma: any, fn: (tx: Tx) => Promise<T>, attempts = 6): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(fn, TX_OPTIONS)
    } catch (error) {
      if (!isRetryable(error) || attempt >= attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, Math.min(400, 20 * 2 ** attempt) + Math.floor(Math.random() * 25)))
    }
  }
}

export async function lockKey(tx: Tx, key: string) {
  await tx.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS acquired`
}

/** Compare-and-set: update only when the row still has one of the expected statuses. */
export async function cas(tx: Tx, model: string, id: string, from: string | string[], data: Record<string, unknown>, message?: string) {
  const expected = Array.isArray(from) ? from : [from]
  const result = await tx[model].updateMany({ where: { id, status: { in: expected } }, data })
  if (result.count !== 1) throw new CommandError(message || 'This record was changed by someone else. Reload and try again.')
}

export async function recordChange(tx: Tx, input: { type: string; id: string; from?: string | null; to?: string | null; actorId?: string | null; reason?: string | null; data?: Record<string, unknown> }) {
  await tx.changeEvent.create({
    data: {
      aggregateType: input.type,
      aggregateId: input.id,
      from: input.from ?? '',
      to: input.to ?? '',
      reason: input.reason ?? '',
      data: input.data ?? {},
      at: new Date(),
      ...(input.actorId ? { actor: { connect: { id: input.actorId } }, createdBy: { connect: { id: input.actorId } } } : {}),
    },
  })
}

/** cas + ChangeEvent in one call. */
export async function transition(tx: Tx, actor: Actor | null, model: string, type: string, id: string, from: string | string[], to: string, extra: Record<string, unknown> = {}, reason?: string) {
  const current = await tx[model].findUnique({ where: { id }, select: { status: true } })
  if (!current) throw new CommandError('That record was not found.')
  const expected = Array.isArray(from) ? from : [from]
  if (!expected.includes(current.status)) throw new CommandError(`This ${type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} is ${current.status.replace(/_/g, ' ')}; it cannot move to ${to.replace(/_/g, ' ')}.`)
  await cas(tx, model, id, expected, { ...extra, status: to })
  await recordChange(tx, { type, id, from: current.status, to, actorId: actor?.userId, reason })
}

function isUnique(error: unknown) {
  return (error as { code?: string })?.code === 'P2002'
}

export type CommandOptions = {
  name: string
  input: unknown
  idempotencyKey?: string | null
  /** Map a unique-constraint violation to a user message. */
  conflictMessage?: string
  /** Allow calls without a signed-in user (public storefront commands). */
  allowAnonymous?: boolean
}

/**
 * Runs `fn` in one transaction with idempotency. `fn` returns `{ id, data }`.
 * After-commit work (emails, provider calls) goes in `after`, which runs only on first execution.
 */
export async function runCommand<T extends { id?: string | null; data?: unknown; after?: () => Promise<void> }>(
  context: any,
  options: CommandOptions,
  fn: (tx: Tx, actor: Actor | null) => Promise<T>,
): Promise<CommandResult> {
  const prisma = context.sudo().prisma
  let after: (() => Promise<void>) | undefined
  try {
    const actor = context.session?.itemId ? await loadActor(prisma, context.session.itemId) : null
    if (!actor && !options.allowAnonymous) throw new CommandError('Sign in to continue.')
    const key = typeof options.idempotencyKey === 'string' ? options.idempotencyKey.trim() : ''
    if (key && (key.length < 8 || key.length > 200)) throw new CommandError('The idempotency key must be 8 to 200 characters.')
    const outcome = await transaction(prisma, async (tx) => {
      let eventKey = ''
      let payloadHash = ''
      if (key) {
        eventKey = `${options.name}:${actor?.userId ?? 'public'}:${key}`
        payloadHash = createHash('sha256').update(canonicalJson({ name: options.name, input: options.input })).digest('hex')
        await lockKey(tx, `command-receipt:${eventKey}`)
        const existing = await tx.commandReceipt.findUnique({ where: { eventKey } })
        if (existing) {
          if (existing.payloadHash !== payloadHash) throw new CommandError('This idempotency key was already used with different details.')
          return { replay: true, result: existing.result as CommandResult }
        }
      }
      const value = await fn(tx, actor)
      const result: CommandResult = { success: true, error: null, id: value.id ?? null, data: (value.data ?? null) as any }
      if (key) {
        await tx.commandReceipt.create({
          data: {
            eventKey,
            eventType: options.name,
            schemaVersion: 1,
            aggregateType: options.name,
            aggregateId: value.id ?? '',
            payload: { input: options.input ?? null } as any,
            result: result as any,
            actorId: actor?.userId ?? '',
            payloadHash,
            occurredAt: new Date(),
          },
        })
      }
      after = value.after
      return { replay: false, result }
    })
    if (!outcome.replay && after) {
      try { await after() } catch (error) { console.error(`${options.name}: after-commit step failed`, (error as Error)?.message) }
    }
    return outcome.result
  } catch (error) {
    if (error instanceof CommandError) return { success: false, error: error.message, id: null, data: (error.data ?? null) as any }
    if (isUnique(error)) return { success: false, error: options.conflictMessage || 'That conflicts with an existing record.', id: null, data: null }
    console.error(`${options.name} failed:`, (error as Error)?.message)
    return { success: false, error: 'Something went wrong. Please try again.', id: null, data: null }
  }
}

export function requireString(value: unknown, label: string, max = 500): string {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw new CommandError(`${label} is required.`)
  if (text.length > max) throw new CommandError(`${label} is too long.`)
  return text
}

export function optionalString(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function requireInt(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) throw new CommandError(`${label} must be a whole number${min === 0 ? '' : ` from ${min}`}.`)
  return n
}

export function requireDate(value: unknown, label: string): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? ''))
  if (Number.isNaN(date.getTime())) throw new CommandError(`${label} is not a valid date.`)
  return date
}
