'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DrawerForm, Field } from '@/features/platform/lib/forms'
import { Pill, Track, selectClass } from '@/features/platform/lib/ui'
import { addMemberAction, removeClosure, saveClosureAction, saveHoursAction, saveLocationAction, saveRoomAction, setMember } from '../actions/locations'
import { WEEKDAYS, WEEKDAY_NAMES } from '../lib/hours'

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Dublin', 'Australia/Sydney', 'Asia/Dubai', 'Asia/Singapore']

function Run({ label, run, variant = 'flat' }: { label: string; run: () => Promise<{ success: boolean; error: string | null }>; variant?: 'flat' | 'raised' }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  return (
    <span className="inline-grid gap-1">
      <Pill size="sm" variant={variant} disabled={pending} onClick={() => start(async () => { setError(null); const r = await run(); if (!r.success) setError(r.error); else router.refresh() })}>{pending ? '…' : label}</Pill>
      {error ? <span role="alert" className="max-w-56 text-xs text-destructive">{error}</span> : null}
    </span>
  )
}

export function LocationDrawer({ location }: { location?: any }) {
  const router = useRouter()
  const l = location ?? {}
  const zones = l.timezone && !ZONES.includes(l.timezone) ? [l.timezone, ...ZONES] : ZONES
  return (
    <DrawerForm trigger={location ? 'Edit centre' : 'New centre'} triggerVariant={location ? 'raised' : 'primary'} title={location ? `Edit ${l.name}` : 'New centre'}
      action={async (form) => { const r = await saveLocationAction(form); if (r.success && !location && r.id) router.push(`/dashboard/platform/locations/${r.id}`); return r }}>
      {location ? <input type="hidden" name="locationId" value={l.id} /> : null}
      <Field id="lc-n" label="Name"><Input id="lc-n" name="name" required defaultValue={l.name ?? ''} /></Field>
      <Field id="lc-s" label="Web address"><Input id="lc-s" name="slug" defaultValue={l.slug ?? ''} placeholder="made from the name" pattern="[a-z0-9-]*" /></Field>
      <Field id="lc-a1" label="Address" wide><Input id="lc-a1" name="addressLine1" defaultValue={l.addressLine1 ?? ''} /></Field>
      <Field id="lc-a2" label="Address line 2" wide><Input id="lc-a2" name="addressLine2" defaultValue={l.addressLine2 ?? ''} /></Field>
      <Field id="lc-c" label="City"><Input id="lc-c" name="city" defaultValue={l.city ?? ''} /></Field>
      <Field id="lc-r" label="State or region"><Input id="lc-r" name="region" defaultValue={l.region ?? ''} /></Field>
      <Field id="lc-pc" label="Postal code"><Input id="lc-pc" name="postalCode" defaultValue={l.postalCode ?? ''} /></Field>
      <Field id="lc-co" label="Country"><Input id="lc-co" name="country" defaultValue={l.country ?? 'US'} maxLength={2} /></Field>
      <Field id="lc-p" label="Phone"><Input id="lc-p" name="phone" type="tel" defaultValue={l.phone ?? ''} /></Field>
      <Field id="lc-e" label="Email"><Input id="lc-e" name="email" type="email" defaultValue={l.email ?? ''} /></Field>
      <Field id="lc-tz" label="Time zone"><select id="lc-tz" name="timezone" className={selectClass} defaultValue={l.timezone ?? 'America/Chicago'}>{zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}</select></Field>
      <Field id="lc-tx" label="Sales tax (%)"><Input id="lc-tx" name="taxRatePercent" type="number" min={0} max={30} step="0.001" defaultValue={l.taxRatePercent ?? '0'} /></Field>
      {location ? <Field id="lc-st" label="Status" wide><select id="lc-st" name="status" className={selectClass} defaultValue={l.status}><option value="active">Open</option><option value="coming_soon">Coming soon</option><option value="closed">Closed</option></select></Field> : null}
      <Field id="lc-d" label="Description" wide><Textarea id="lc-d" name="description" rows={3} defaultValue={l.description ?? ''} /></Field>
    </DrawerForm>
  )
}

export function HoursDrawer({ locationId, hours }: { locationId: string; hours: Record<string, string[][]> }) {
  return (
    <DrawerForm trigger="Edit hours" title="Opening hours" description="Leave a day empty when the centre is closed. Bookings and assessments are only offered inside these hours." action={saveHoursAction}>
      <input type="hidden" name="locationId" value={locationId} />
      {WEEKDAYS.map((d) => {
        const [open, close] = hours?.[d]?.[0] ?? ['', '']
        return (
          <div key={d} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2 sm:col-span-2">
            <span className="text-sm font-medium">{WEEKDAY_NAMES[d]}</span>
            <Input name={`${d}_open`} type="time" aria-label={`${WEEKDAY_NAMES[d]} opens`} defaultValue={open} />
            <Input name={`${d}_close`} type="time" aria-label={`${WEEKDAY_NAMES[d]} closes`} defaultValue={close} />
          </div>
        )
      })}
    </DrawerForm>
  )
}

export function RoomDrawer({ locationId, room }: { locationId: string; room?: any }) {
  const r = room ?? {}
  return (
    <DrawerForm trigger={room ? 'Edit' : 'Add a room'} triggerVariant={room ? 'flat' : 'raised'} title={room ? `Edit ${r.name}` : 'Add a room'} action={saveRoomAction}>
      <input type="hidden" name="locationId" value={locationId} />
      {room ? <input type="hidden" name="roomId" value={r.id} /> : null}
      <Field id="rm-n" label="Name"><Input id="rm-n" name="name" required defaultValue={r.name ?? ''} /></Field>
      <Field id="rm-c" label="Seats"><Input id="rm-c" name="capacity" type="number" min={1} max={200} required defaultValue={r.capacity ?? 4} /></Field>
      <Field id="rm-k" label="Kind"><select id="rm-k" name="kind" className={selectClass} defaultValue={r.kind ?? 'room'}><option value="room">Room</option><option value="table">Table</option><option value="online">Online room</option></select></Field>
      <Field id="rm-s" label="Status"><select id="rm-s" name="status" className={selectClass} defaultValue={r.status ?? 'active'}><option value="active">In use</option><option value="inactive">Not in use</option></select></Field>
    </DrawerForm>
  )
}

export function ClosureDrawer({ locationId }: { locationId: string }) {
  return (
    <DrawerForm trigger="Add a closure" title="Close the centre" description="No sessions, bookings or assessments are offered on these days." action={saveClosureAction}>
      <input type="hidden" name="locationId" value={locationId} />
      <Field id="cl-s" label="First day"><Input id="cl-s" name="startsOn" type="date" required /></Field>
      <Field id="cl-e" label="Last day"><Input id="cl-e" name="endsOn" type="date" /></Field>
      <Field id="cl-r" label="Reason" wide><Input id="cl-r" name="reason" required placeholder="Thanksgiving" /></Field>
    </DrawerForm>
  )
}

export function RemoveClosure({ locationId, id }: { locationId: string; id: string }) {
  return <Run label="Remove" run={() => removeClosure(locationId, id)} />
}

export function AddMember({ locationId, users }: { locationId: string; users: Array<{ id: string; name: string; email: string }> }) {
  return (
    <DrawerForm trigger="Add staff" title="Add staff to this centre" description="Managers and front desk see this centre’s families, schedule and billing, as their role allows." action={addMemberAction}>
      <input type="hidden" name="locationId" value={locationId} />
      <Field id="mb-u" label="Staff member" wide><select id="mb-u" name="userId" className={selectClass} required defaultValue=""><option value="">Choose…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></Field>
      <Field id="mb-r" label="Role here" wide><select id="mb-r" name="role" className={selectClass} defaultValue="front_desk"><option value="manager">Manager</option><option value="front_desk">Front desk</option><option value="tutor">Tutor</option></select></Field>
    </DrawerForm>
  )
}

export function MemberActions({ locationId, member }: { locationId: string; member: any }) {
  return (
    <Track>
      {member.status === 'active' ? <Run label="Remove from centre" run={() => setMember(locationId, member.id, { status: 'inactive' })} /> : <Run label="Restore" run={() => setMember(locationId, member.id, { status: 'active' })} />}
    </Track>
  )
}
