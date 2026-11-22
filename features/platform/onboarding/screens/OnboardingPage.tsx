import { redirect } from 'next/navigation'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Notice, PageHeader, Restricted } from '@/features/platform/lib/ui'
import { getOnboardingState } from '../actions/onboarding'
import { OnboardingForm } from '../components/OnboardingForm'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const r = await getOnboardingState()
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Set up' }]
  if (!r.ok) return <PageContainer title="Set up" breadcrumbs={breadcrumbs}><div className="p-4 md:p-6"><Notice tone="alert">{r.error}</Notice></div></PageContainer>
  if (!r.data.authenticatedItem) redirect('/dashboard/signin')
  const state = r.data.onboardingState
  return (
    <PageContainer title="Set up" breadcrumbs={breadcrumbs}>
      <div className="w-full max-w-3xl p-4 md:p-6 grid gap-6">
        <PageHeader title="Set up your tutoring business" />
        {!r.data.authenticatedItem.role?.canManageSettings ? <Restricted>Only the owner can set up the business.</Restricted>
          : state?.onboarded ? <Notice>{state.businessName || 'Your business'} is already set up. Change its details in Settings.</Notice>
          : !state?.canLoadStarterSet ? <Notice tone="alert">Programmes or locations already exist, so setup cannot run again. Change details in Settings.</Notice>
          : <OnboardingForm />}
      </div>
    </PageContainer>
  )
}
