import type { Metadata } from 'next'
import { DM_Sans, Plus_Jakarta_Sans } from 'next/font/google'
import { getBusiness } from '@/features/storefront/lib/data'
import { siteOrigin } from '@/features/storefront/lib/site'
import '@/features/storefront/styles/brightpath.css'

// Mira: a tight geometric grotesk for headlines, a friendly humanist sans for body text.
const head = Plus_Jakarta_Sans({ variable: '--font-bp-head', weight: ['500', '600', '700', '800'], subsets: ['latin'] })
const body = DM_Sans({ variable: '--font-bp-body', weight: ['400', '500', '600', '700'], subsets: ['latin'] })

export async function generateMetadata(): Promise<Metadata> {
  const business = await getBusiness()
  if (!business) return { title: 'Tutoring', robots: { index: false, follow: false } }
  const description = business.about || `Tutoring and test prep with ${business.name}.`
  return {
    metadataBase: new URL(await siteOrigin()),
    title: { default: business.name, template: `%s · ${business.name}` },
    description,
    applicationName: business.name,
    openGraph: { type: 'website', siteName: business.name, title: business.name, description, images: [{ url: '/storefront/hero.jpg', width: 1600, height: 1067 }] },
    icons: { icon: '/storefront/icon.svg' },
  }
}

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${head.variable} ${body.variable}`}>{children}</div>
}
