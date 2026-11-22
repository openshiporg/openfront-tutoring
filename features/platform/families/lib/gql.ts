import { getAuthHeaders } from '@/features/dashboard/lib/cookies'
import { getGraphQLEndpoint } from '@/features/dashboard/lib/getBaseUrl'

/**
 * Server-side GraphQL as the signed-in staff member (their session cookie), so list access
 * rules and command permission checks apply. Shared by the families, students, tutors,
 * applications, progress, programs and locations slices.
 *
 * Errors: command errors and Keystone access/validation messages are written for staff and
 * shown as they are; anything else becomes one generic line (details go to the server log).
 */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string; forbidden?: boolean }
const GENERIC = 'This could not be loaded. Reload the page to try again.'

function readable(err: any): { error: string; forbidden: boolean } {
  const code = err?.extensions?.code
  const msg = String(err?.message ?? '')
  if (code === 'KS_ACCESS_DENIED') return { error: 'Your role does not allow this.', forbidden: true }
  if (code === 'KS_VALIDATION_FAILURE') return { error: msg.split('\n').slice(1).map((l) => l.replace(/^\s*-\s*/, '').replace(/^[\w.]+:\s*/, '').trim()).filter(Boolean).join(' ') || 'Check the fields and try again.', forbidden: false }
  if (/permission|not found|sign in|must be|choose|enter |is needed|is required/i.test(msg) && msg.length < 300) return { error: msg, forbidden: /permission/i.test(msg) }
  return { error: GENERIC, forbidden: false }
}

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<Result<T>> {
  try {
    const res = await fetch(await getGraphQLEndpoint(), {
      method: 'POST', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...((await getAuthHeaders()) || {}) },
      body: JSON.stringify({ query, variables }),
    })
    const json = await res.json().catch(() => null)
    if (!json) return { ok: false, error: GENERIC }
    if (json.errors?.length) {
      console.error('[platform] graphql:', json.errors.map((e: any) => e.message).join(' | ').slice(0, 500))
      if (!json.data || Object.values(json.data).every((v) => v == null)) return { ok: false, ...readable(json.errors[0]) }
    }
    return { ok: true, data: json.data as T }
  } catch (e) {
    console.error('[platform] graphql request failed:', (e as Error)?.message)
    return { ok: false, error: GENERIC }
  }
}

export type CommandOutcome = { success: boolean; error: string | null; id?: string | null; data?: any }

/** Run one CommandResult mutation; its error text is already staff copy. */
export async function command(query: string, variables: Record<string, unknown>, field: string): Promise<CommandOutcome> {
  const r = await gql<Record<string, { success: boolean; error?: string | null; id?: string | null; data?: any }>>(query, variables)
  if (!r.ok) return { success: false, error: r.error }
  const out = r.data[field]
  return out?.success ? { success: true, error: null, id: out.id ?? null, data: out.data ?? null } : { success: false, error: out?.error || 'This could not be saved.' }
}

export const key = (form: FormData) => String(form.get('idempotencyKey') || '') || crypto.randomUUID()
export const s = (form: FormData, k: string) => String(form.get(k) ?? '').trim()
export const opt = (form: FormData, k: string) => (form.has(k) ? s(form, k) : undefined)
