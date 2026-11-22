'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Field } from '@/features/platform/lib/forms'
import { Notice, Pill, PillLink, Section, selectClass } from '@/features/platform/lib/ui'
import { onboard } from '../actions/onboarding'

const DAYS: Array<[string, string, boolean, string, string]> = [
  ['mon', 'Monday', true, '15:00', '20:00'], ['tue', 'Tuesday', true, '15:00', '20:00'], ['wed', 'Wednesday', true, '15:00', '20:00'], ['thu', 'Thursday', true, '15:00', '20:00'],
  ['fri', 'Friday', true, '15:00', '18:00'], ['sat', 'Saturday', true, '09:00', '14:00'], ['sun', 'Sunday', false, '12:00', '16:00'],
]
const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver', 'Europe/London', 'Europe/Dublin', 'Australia/Sydney', 'Pacific/Auckland', 'Asia/Singapore', 'Asia/Dubai']

export function OnboardingForm({ defaultTimezone }: { defaultTimezone?: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ jobsSecret: string; summary: any } | null>(null)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    start(async () => {
      try {
        const r = await onboard(form)
        if (!r.success) { setError(r.error || 'Onboarding did not finish.'); return }
        setDone({ jobsSecret: r.jobsSecret ?? '', summary: r.summary })
        router.refresh()
      } catch { setError('The connection dropped. Reload this page to see whether setup finished.') }
    })
  }

  if (done) {
    const st = done.summary?.starter
    return (
      <div className="grid gap-4">
        <Notice>Your business is set up.{st ? ` Loaded ${done.summary.programmes} programmes, ${done.summary.tutors} tutors, ${st.families} families with ${st.students} students, ${st.historicBookings} past sessions attended or marked and ${st.futureBookings} booked seats ahead.` : ''}</Notice>
        <Section title="Daily jobs secret">
          <p className="text-sm text-muted-foreground">Your scheduler calls <code className="font-mono">POST /api/jobs/daily</code> with the header <code className="font-mono">Authorization: Bearer &lt;secret&gt;</code> once a day: membership billing, credit expiry, reminders and tasks. Copy the secret now; only a fingerprint of it is stored. You can rotate it in Settings.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-[6px] border bg-muted/40 px-3 py-2 font-mono text-sm" data-testid="jobs-secret">{done.jobsSecret}</code>
            <Pill size="sm" onClick={() => navigator.clipboard?.writeText(done.jobsSecret)}>Copy</Pill>
          </div>
        </Section>
        <div className="flex gap-2"><PillLink href="/dashboard/platform/families" variant="primary">Open families</PillLink><PillLink href="/dashboard">Dashboard</PillLink></div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      <Section title="Business">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="businessName" label="Business name"><Input id="businessName" name="businessName" required maxLength={120} defaultValue="" placeholder="Brightpath Learning" /></Field>
          <Field id="kind" label="Kind of business">
            <select id="kind" name="kind" className={selectClass} defaultValue="mixed">
              <option value="centre">Learning centre</option><option value="test_prep">Test prep</option><option value="agency">Tutoring agency (home and online)</option><option value="mixed">Mixed</option>
            </select>
          </Field>
          <Field id="country" label="Country"><Input id="country" name="country" maxLength={2} defaultValue="US" /></Field>
          <Field id="currency" label="Currency"><Input id="currency" name="currency" maxLength={3} defaultValue="USD" /></Field>
          <Field id="supportEmail" label="Email for families"><Input id="supportEmail" name="supportEmail" type="email" /></Field>
          <Field id="phone" label="Phone"><Input id="phone" name="phone" /></Field>
        </div>
      </Section>
      <Section title="First location">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="locationName" label="Name"><Input id="locationName" name="locationName" required defaultValue="" placeholder="Maple Avenue Centre" /></Field>
          <Field id="timezone" label="Timezone">
            <select id="timezone" name="timezone" className={selectClass} defaultValue={ZONES.includes(defaultTimezone ?? '') ? defaultTimezone : 'America/Chicago'}>
              {ZONES.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field id="addressLine1" label="Street address" wide><Input id="addressLine1" name="addressLine1" /></Field>
          <Field id="city" label="City"><Input id="city" name="city" /></Field>
          <Field id="region" label="State or region"><Input id="region" name="region" /></Field>
          <Field id="postalCode" label="Postal code"><Input id="postalCode" name="postalCode" /></Field>
        </div>
        <fieldset className="mt-4 grid gap-2">
          <legend className="mb-2 text-sm font-medium">Opening hours</legend>
          {DAYS.map(([k, label, open, from, to]) => (
            <div key={k} className="grid grid-cols-[7rem_auto_1fr_1fr] items-center gap-2 text-sm">
              <label htmlFor={`${k}_open`}>{label}</label>
              <input id={`${k}_open`} name={`${k}_open`} type="checkbox" defaultChecked={open} aria-label={`Open on ${label}`} />
              <Input name={`${k}_from`} type="time" defaultValue={from} aria-label={`${label} opens`} />
              <Input name={`${k}_to`} type="time" defaultValue={to} aria-label={`${label} closes`} />
            </div>
          ))}
        </fieldset>
      </Section>
      <Section title="Starter set">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="starterSet" defaultChecked className="mt-1" />
          <span>Load the starter set: a second centre, rooms, K–12 subjects and levels, seven programmes with plans and packages, eight tutors with profiles and availability, staff, twelve families with six weeks of sessions and reports, leads, payroll and tutor applications. Edit or archive any of it later. Leave this off to start empty.</span>
        </label>
      </Section>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      <div><Pill type="submit" variant="primary" disabled={pending}>{pending ? 'Setting up… this can take a few minutes' : 'Set up the business'}</Pill></div>
    </form>
  )
}
