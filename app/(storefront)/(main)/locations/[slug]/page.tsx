import { getLocation } from '@/features/storefront/lib/data'
export { LocationPage as default } from '@/features/storefront/screens/LocationsPages'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const l = await getLocation((await params).slug)
  return l ? { title: l.name, description: l.description } : { title: 'Location not found' }
}
