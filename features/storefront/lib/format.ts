/** Formatting for the storefront. Plain module: safe on server and client. */

export function money(minor: number | null | undefined, currency = 'USD') {
  const value = (minor ?? 0) / 100
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: value % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(value)
}

/** "Central Time (CST)" */
export function tzLabel(tz: string, at: Date = new Date()) {
  try {
    const long = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longGeneric' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value
    const short = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value
    return long && short && long !== short ? `${long} (${short})` : long || short || tz
  } catch {
    return tz
  }
}

const asDate = (d: string | Date) => (typeof d === 'string' ? new Date(d) : d)

export function dateLong(d: string | Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(asDate(d))
}
export function dateShort(d: string | Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(asDate(d))
}
export function dateOnly(d: string | Date | null | undefined, tz = 'UTC') {
  if (!d) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric', year: 'numeric' }).format(asDate(d))
}
export function time(d: string | Date, tz: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(asDate(d))
}
/** "Mon, Nov 24 · 3:00 – 4:00 PM Central Time (CST)" */
export function when(start: string | Date, end: string | Date | null, tz: string) {
  const s = asDate(start)
  const range = end ? `${time(s, tz)} – ${time(end, tz)}` : time(s, tz)
  return `${dateShort(s, tz)} · ${range} ${tzLabel(tz, s)}`
}
export function dayKey(d: string | Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(asDate(d))
}

export function hoursFromMinutes(m: number | null | undefined) {
  const h = (m ?? 0) / 60
  return `${Math.round(h * 10) / 10} ${h === 1 ? 'hour' : 'hours'}`
}

export const label = (value: string | null | undefined) => (value || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

export const MODE_LABEL: Record<string, string> = { in_centre: 'In a centre', online: 'Online', in_home: 'At home' }
export const FORMAT_LABEL: Record<string, string> = { one_to_one: 'One-to-one', small_group: 'Small group', class: 'Class' }

export function levelRange(from?: { name: string } | null, to?: { name: string } | null) {
  if (from && to) return from.name === to.name ? from.name : `${from.name} to ${to.name}`
  return from?.name || to?.name || 'All levels'
}

const WEEKDAY: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }
function clock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`
}
export function openingHours(hours: Record<string, Array<[string, string]>> | null | undefined) {
  return Object.keys(WEEKDAY).map((key) => {
    const ranges = hours?.[key] ?? []
    return { day: WEEKDAY[key], text: ranges.length ? ranges.map(([a, b]) => `${clock(a)} – ${clock(b)}`).join(', ') : 'Closed' }
  })
}

export function address(l: { addressLine1?: string; addressLine2?: string; city?: string; region?: string; postalCode?: string }) {
  return [l.addressLine1, l.addressLine2, [l.city, [l.region, l.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ')
}

export const STATUS_TEXT: Record<string, string> = {
  booked: 'Booked', attended: 'Attended', late: 'Attended (late)', cancelled_early: 'Cancelled', cancelled_late: 'Cancelled late (charged)',
  cancelled_late_excused: 'Excused absence', no_show: 'Missed', cancelled_by_centre: 'Cancelled by us', waitlisted: 'On the waitlist', waitlist_expired: 'Waitlist ended',
  scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', requested: 'Requested',
  open: 'Open', partially_paid: 'Part paid', paid: 'Paid', void: 'Void',
  active: 'Active', past_due: 'Payment due', suspended: 'Suspended', paused: 'Paused', cancelling: 'Ending', pending_payment: 'Awaiting payment',
  pending_match: 'Finding a tutor', matched: 'Tutor matched', ended: 'Ended', exhausted: 'Used up', expired: 'Expired',
  proposed: 'Ready to review', accepted: 'Accepted', declined: 'Declined', published: 'New', acknowledged: 'Read',
  not_started: 'Not started', in_progress: 'In progress', mastered: 'Mastered',
}
export const statusText = (s: string | null | undefined) => STATUS_TEXT[s || ''] || label(s)
