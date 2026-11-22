import { getProgram } from '@/features/storefront/lib/data'
export { default } from '@/features/storefront/screens/ProgramPage'
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProgram((await params).slug)
  return p ? { title: p.name, description: p.summary } : { title: 'Program not found' }
}
