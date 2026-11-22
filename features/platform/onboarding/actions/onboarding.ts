'use server'

import { revalidatePath } from 'next/cache'
import { command, gql, s } from '@/features/platform/families/lib/gql'

export async function getOnboardingState() {
  return gql<{ onboardingState: { onboarded: boolean; businessName: string; canLoadStarterSet: boolean } | null; authenticatedItem: { id: string; role: { canManageSettings: boolean } | null } | null }>(`
    query { onboardingState authenticatedItem { ... on User { id role { canManageSettings } } } }`)
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export async function onboard(form: FormData) {
  const hours: Record<string, Array<[string, string]>> = {}
  for (const d of DAYS) {
    if (form.get(`${d}_open`) !== 'on') { hours[d] = []; continue }
    const from = s(form, `${d}_from`) || '15:00'
    const to = s(form, `${d}_to`) || '19:00'
    hours[d] = [[from, to]]
  }
  const data = {
    businessName: s(form, 'businessName'), country: s(form, 'country'), currency: s(form, 'currency'), kind: s(form, 'kind'), supportEmail: s(form, 'supportEmail'), phone: s(form, 'phone'),
    starterSet: form.get('starterSet') === 'on',
    location: {
      name: s(form, 'locationName'), timezone: s(form, 'timezone'), addressLine1: s(form, 'addressLine1'), city: s(form, 'city'), region: s(form, 'region'), postalCode: s(form, 'postalCode'),
      country: s(form, 'country'), phone: s(form, 'phone'), email: s(form, 'supportEmail'), openingHours: hours,
    },
  }
  const r = await command(`mutation($d: JSON!) { onboardBusiness(data: $d) { success error id data } }`, { d: data }, 'onboardBusiness')
  if (r.success) { revalidatePath('/dashboard'); revalidatePath('/', 'layout') }
  return { success: r.success, error: r.error, jobsSecret: r.success ? String(r.data?.jobsSecret ?? '') : null, summary: r.success ? r.data : null }
}
