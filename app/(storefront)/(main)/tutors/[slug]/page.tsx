import { getTutor } from '@/features/storefront/lib/data'
export { TutorPage as default } from '@/features/storefront/screens/TutorsPages'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTutor((await params).slug)
  return t ? { title: t.displayName, description: t.headline } : { title: 'Tutor not found' }
}
