import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { getBusiness } from '@/features/storefront/lib/data'
import { siteOrigin } from '@/features/storefront/lib/site'
import '@/features/storefront/styles/brightpath.css'

// Mira: a tight geometric grotesk for headlines, a friendly humanist sans for body text.
// Self-hosted variable fonts (Latin subset, SIL OFL): no build-time fetch from Google.
const head = localFont({ src: '../../features/storefront/fonts/PlusJakartaSans-latin.woff2', weight: '500 800', variable: '--font-bp-head', display: 'swap' })
const body = localFont({ src: '../../features/storefront/fonts/DMSans-latin.woff2', weight: '400 700', variable: '--font-bp-body', display: 'swap' })

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
