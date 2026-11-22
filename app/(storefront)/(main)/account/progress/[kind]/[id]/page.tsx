import { notFound } from 'next/navigation'
import { AccountPlanPage } from '@/features/storefront/screens/AccountPages'

export const metadata = { title: 'Learning plan', robots: { index: false } }

type Props = { params: Promise<{ kind: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }
export default async function Page({ params, searchParams }: Props) {
  const { kind, id } = await params
  if (kind !== 'plan') notFound()
  return AccountPlanPage({ params: Promise.resolve({ id }), searchParams })
}
