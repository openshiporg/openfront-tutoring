import { headers } from 'next/headers'

/**
 * Public origin for canonical URLs, sitemap and Open Graph. Not used for anything that carries the
 * session (that always goes over loopback): a spoofed Host only changes links the requester sees.
 */
export async function siteOrigin() {
  const fixed = process.env.NEXT_PUBLIC_SITE_URL || process.env.FRONTEND_URL
  if (fixed) return fixed.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000'
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}
