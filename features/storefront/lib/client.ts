import { cookies } from 'next/headers'

/**
 * Server-side GraphQL for the storefront, through the app's own /api/graphql with the
 * visitor's session cookie, so Keystone access rules and the guardian checks apply.
 * Always this same server over loopback: the cookie never follows a request Host header.
 */
async function endpoint() {
  const port = /^\d{1,5}$/.test(process.env.PORT || '') ? process.env.PORT : '3000'
  return `http://127.0.0.1:${port}/api/graphql`
}

export type GqlResult<T> = { data: T | null; error: string | null }

const GENERIC = 'Something went wrong on our side. Please try again in a moment.'

export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<GqlResult<T>> {
  try {
    const token = (await cookies()).get('keystonejs-session')?.value
    const res = await fetch(await endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { cookie: `keystonejs-session=${token}` } : {}) },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
      redirect: 'error',
    })
    const json = await res.json().catch(() => null)
    if (!json) return { data: null, error: GENERIC }
    if (json.errors?.length) {
      const message = String(json.errors[0]?.message || '')
      // Field-not-found means the operation is not deployed on this server yet.
      if (/Cannot query field|Unknown argument|Unknown type/.test(message)) return { data: json.data ?? null, error: 'This step is not available yet. Please call or email us and we will take care of it.' }
      return { data: json.data ?? null, error: message.length < 240 && !/prisma|invalid `|stack/i.test(message) ? message : GENERIC }
    }
    return { data: json.data as T, error: null }
  } catch {
    return { data: null, error: GENERIC }
  }
}

/** A §5.9 command: { success, error, id, data }. */
export type Command<D = Record<string, any>> = { success: boolean; error: string | null; id: string | null; data: D | null }

export async function command<D = Record<string, any>>(name: string, query: string, variables: Record<string, unknown>): Promise<Command<D>> {
  const result = await gql<Record<string, Command<D>>>(query, variables)
  const outcome = result.data?.[name]
  if (outcome) return outcome
  return { success: false, error: result.error || GENERIC, id: null, data: null }
}
