import { StorefrontShell } from '@/features/storefront/screens/StorefrontShell'

export const dynamic = 'force-dynamic'

export default function StorefrontMainLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontShell>{children}</StorefrontShell>
}
