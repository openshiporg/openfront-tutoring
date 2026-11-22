import type { MetadataRoute } from 'next'
import { getLocations, getPrograms, getTutors } from '@/features/storefront/lib/data'
import { siteOrigin } from '@/features/storefront/lib/site'

export const dynamic = 'force-dynamic'

/** Public pages plus every published programme, open location and public tutor profile. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin()
  const [programs, locations, tutors] = await Promise.all([getPrograms(), getLocations(), getTutors()])
  const now = new Date()
  const page = (path: string, priority = 0.6): MetadataRoute.Sitemap[number] => ({ url: `${origin}${path}`, lastModified: now, changeFrequency: 'weekly', priority })
  return [
    page('/', 1), page('/programs', 0.9), page('/assessment', 0.9), page('/pricing', 0.8), page('/schedule', 0.7),
    page('/locations', 0.7), page('/tutors', 0.7), page('/contact', 0.6), page('/policies', 0.3),
    ...((programs.value?.programs ?? []) as any[]).map((p) => page(`/programs/${p.slug}`, 0.8)),
    ...((locations.value ?? []) as any[]).map((l) => page(`/locations/${l.slug}`, 0.6)),
    ...((tutors.value?.tutors ?? tutors.value ?? []) as any[]).filter((t: any) => t?.slug).map((t: any) => page(`/tutors/${t.slug}`, 0.5)),
  ]
}
