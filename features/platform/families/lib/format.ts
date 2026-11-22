import type { Tone } from '@/features/platform/lib/ui'

/** Display helpers for the tutoring platform slices. Times take the centre's zone from the data. */

export function money(cents: number | null | undefined, currency = 'USD') {
  const v = cents ?? 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: v % 100 === 0 ? 0 : 2 }).format(v / 100)
}
export function hours(minutes: number | null | undefined) {
  const m = minutes ?? 0
  const h = Math.round((m / 60) * 100) / 100
  return `${h} h`
}
export function dateOnly(v: string | Date | null | undefined) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
export function dateTime(v: string | Date | null | undefined, timeZone: string) {
  if (!v) return '—'
  return new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone })
}
const WORDS: Record<string, string> = {
  in_centre: 'In centre', in_home: 'In home', online: 'Online', pay_as_you_go: 'Pay as you go', membership_period: 'Membership credit',
  make_up: 'Make-up credit', pending_payment: 'Awaiting payment', pending_match: 'Finding a tutor', past_due: 'Past due',
  bank_transfer: 'Bank transfer', in_person: 'In person', rollover_in: 'Rolled over in', rollover_out: 'Rolled over out',
  read_by_family: 'Read by family', cancelled_late: 'Late cancellation', cancelled_early: 'Cancelled', no_show: 'No-show', outbound: 'Outbound', inbound: 'Inbound',
}
export function label(v: string | null | undefined) {
  if (!v) return '—'
  return WORDS[v] ?? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ')
}
export function toneFor(status: string | null | undefined): Tone {
  switch (status) {
    case 'active': case 'paid': case 'published': case 'verified': case 'approved': case 'done': case 'attended': case 'captured': return 'live'
    case 'pending_payment': case 'pending_match': case 'matched': case 'open': case 'paused': case 'cancelling': case 'onboarding': case 'pending': case 'draft': case 'requested': case 'prospect': return 'wait'
    case 'past_due': case 'suspended': case 'failed': case 'rejected': case 'expired': case 'needs_cover': return 'alert'
    case 'scheduled': case 'interview': case 'screening': case 'references': return 'info'
    default: return 'off'
  }
}
