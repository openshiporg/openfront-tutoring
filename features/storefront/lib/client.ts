import { cookies } from 'next/headers'

/**
 * Server-side GraphQL for the storefront, through the app's own /api/graphql with the
 * visitor's session cookie, so Keystone access rules and the guardian checks apply.
 * Always this same server over loopback: the cookie never follows a request Host header.
 */
async function endpoint() {
  // Railway and `next start` with PORT set: this server's own port. A port only ever reaches 127.0.0.1.
  if (/^\d{1,5}$/.test(process.env.PORT || '')) return `http://127.0.0.1:${process.env.PORT}/api/graphql`
  // PORT unset (e.g. `next start -p 3217` locally): use the port this request came in on, but only when it
  // came in on localhost, so a forged Host header can never point the session cookie at another place.
  try {
    const { headers } = await import('next/headers')
    const host = (await headers()).get('host') || ''
    const m = host.match(/^(?:localhost|127\.0\.0\.1|\[::1\]):(\d{1,5})$/)
    if (m) return `http://127.0.0.1:${m[1]}/api/graphql`
  } catch {
    // Outside a request (build, sitemap prerender): fall through.
  }
  return 'http://127.0.0.1:3000/api/graphql'
}

/**
 * A mutation may start a session (bookAssessment signs a new guardian in, sign-out ends one).
 * Keystone sets it on the response to this server-side request; hand it on to the browser.
 * cookies().set only works inside server actions and route handlers; on page renders it throws and is ignored.
 */
async function forwardSession(res: Response) {
  const raw = res.headers.getSetCookie?.() ?? []
  const line = raw.find((c) => c.startsWith('keystonejs-session='))
  if (!line) return
  const value = decodeURIComponent(line.split(';')[0].slice('keystonejs-session='.length))
  try {
    const store = await cookies()
    if (!value || /max-age=0|expires=thu, 01 jan 1970/i.test(line)) store.delete('keystonejs-session')
    else store.set('keystonejs-session', value, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30 })
  } catch {
    // Page render: nothing to forward to.
  }
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
    await forwardSession(res)
    const json = await res.json().catch(() => null)
    if (!json) { console.error(`[storefront] ${opName(query)}: HTTP ${res.status} with no JSON body`); return { data: null, error: GENERIC } }
    if (json.errors?.length) {
      const message = String(json.errors[0]?.message || '')
      console.error(`[storefront] ${opName(query)}: ${message.slice(0, 300)}`)
      // Field-not-found means the operation is not deployed on this server yet.
      if (/Cannot query field|Unknown argument|Unknown type/.test(message)) return { data: json.data ?? null, error: 'This step is not available yet. Please call or email us and we will take care of it.' }
      return { data: json.data ?? null, error: message.length < 240 && !/prisma|invalid `|stack/i.test(message) ? message : GENERIC }
    }
    return { data: json.data as T, error: null }
  } catch (err) {
    console.error(`[storefront] ${opName(query)}: ${String((err as any)?.cause?.code || (err as any)?.message || err).slice(0, 200)}`)
    return { data: null, error: GENERIC }
  }
}

const opName = (q: string) => q.match(/\{\s*(\w+)/)?.[1] ?? 'query'

/** A §5.9 command: { success, error, id, data }. */
export type Command<D = Record<string, any>> = { success: boolean; error: string | null; id: string | null; data: D | null }

export async function command<D = Record<string, any>>(name: string, query: string, variables: Record<string, unknown>): Promise<Command<D>> {
  const result = await gql<Record<string, Command<D>>>(query, variables)
  const outcome = result.data?.[name]
  if (outcome) return outcome
  return { success: false, error: result.error || GENERIC, id: null, data: null }
}
