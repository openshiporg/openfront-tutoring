'use server'

import { getAuthHeaders } from '@/features/dashboard/lib/cookies'
import { getGraphQLEndpoint } from '@/features/dashboard/lib/getBaseUrl'

export type ReportRow = {
  locationId: string | null; name: string; revenue: number; activeStudents: number
  attendanceRate: number | null; churnRate: number | null; liabilityCents: number; liabilityMinutes: number
  utilisation: number | null; leadConversion: number | null
}
export type Reports = {
  from: string; to: string; currency: string; scope: 'all' | 'mine' | 'location'
  locations: Array<{ id: string; name: string }>
  locationChoices: Array<{ id: string; name: string }>
  definitions: Record<'revenue' | 'activeStudents' | 'attendance' | 'churn' | 'liability' | 'utilisation' | 'leads', string>
  revenue: { gross: number; refunds: number; net: number; byMonth: Array<{ month: string; locationId: string | null; gross: number; refunds: number; net: number }> }
  activeStudents: number
  attendance: { present: number; finished: number; rate: number | null }
  churn: { atStart: number; ended: number; rate: number | null }
  liability: { cents: number; paidMinutes: number; unpaidMinutes: number; byKind: Record<string, { minutes: number; cents: number | null }> }
  utilisation: { taughtMinutes: number; offeredMinutes: number; rate: number | null }
  leads: { created: number; enrolled: number; assessedOrLater: number; lost: number; rate: number | null }
  byLocation: ReportRow[]
}

/**
 * Owner/manager reports. Scope and refusal are decided by the server query; its refusal
 * ("You do not have permission to see that location.") is shown as written.
 */
export async function getReports(input: { from: string; to: string; locationId?: string | null }): Promise<{ ok: true; data: Reports } | { ok: false; error: string }> {
  try {
    const res = await fetch(await getGraphQLEndpoint(), {
      method: 'POST', cache: 'no-store', redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...((await getAuthHeaders()) || {}) },
      body: JSON.stringify({
        query: 'query($from: String!, $to: String!, $locationId: ID) { platformReports(from: $from, to: $to, locationId: $locationId) }',
        variables: { from: input.from, to: input.to, locationId: input.locationId || null },
      }),
    })
    const json = await res.json()
    const err = json.errors?.[0]
    if (err) return { ok: false, error: err.extensions?.originalError?.name === 'CommandError' || /permission|sign in|date|period/i.test(err.message) ? err.message : 'The reports could not be loaded.' }
    if (!json.data?.platformReports) return { ok: false, error: 'The reports could not be loaded.' }
    return { ok: true, data: json.data.platformReports }
  } catch {
    return { ok: false, error: 'The reports could not be loaded. Check the connection and reload.' }
  }
}
