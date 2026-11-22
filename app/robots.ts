import type { MetadataRoute } from 'next'
import { siteOrigin } from '@/features/storefront/lib/site'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin()
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/dashboard', '/api', '/account', '/enrol', '/assessment/confirmed'] }],
    sitemap: `${origin}/sitemap.xml`,
  }
}
