import { Fragment } from 'react'
import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, Readouts, Section, StatusCell, Tag, Td, Track } from '@/features/platform/lib/ui'
import { dateOnly, label } from '@/features/platform/families/lib/format'
import { getLocation, staffChoices } from '../actions/locations'
import { AddMember, ClosureDrawer, HoursDrawer, LocationDrawer, MemberActions, RemoveClosure, RoomDrawer } from '../components/LocationForms'
import { WEEKDAYS, WEEKDAY_NAMES } from '../lib/hours'

type PageProps = { params: Promise<{ id: string }> }
const STATUS: Record<string, string> = { active: 'Open', coming_soon: 'Coming soon', closed: 'Closed' }

export default async function LocationPage({ params }: PageProps) {
  const { id } = await params
  const [res, users] = await Promise.all([getLocation(id), staffChoices()])
  const l = res.ok ? res.data.location : null
  const crumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'link' as const, label: 'Centres', href: '/dashboard/platform/locations' },
    { type: 'page' as const, label: l?.name ?? 'Centre' },
  ]
  if (!res.ok || !l) {
    return (
      <PageContainer title="Centre" header={<PageHeader title="Centre" />} breadcrumbs={crumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.ok ? 'That centre was not found.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const hours = (l.openingHours ?? {}) as Record<string, string[][]>
  const members = l.memberships.filter((m: any) => m.user)
  const addable = users.filter((u) => !members.some((m: any) => m.user.id === u.id && m.status === 'active'))
  const header = (
    <PageHeader
      title={l.name}
      tone={l.status === 'active' ? 'live' : l.status === 'coming_soon' ? 'wait' : 'off'}
      meta={[[l.addressLine1, l.city, l.region, l.postalCode].filter(Boolean).join(', '), l.phone, l.email].filter(Boolean).join(' · ')}
      actions={<LocationDrawer location={l} />}
    />
  )
  return (
    <PageContainer title={l.name} header={header} breadcrumbs={crumbs}>
      <div className="grid gap-8 px-4 pb-10 md:px-6">
        <Readouts items={[
          { label: 'Status', value: STATUS[l.status] ?? l.status },
          { label: 'Time zone', value: l.timezone.replace(/_/g, ' ') },
          { label: 'Sales tax', value: `${Number(l.taxRatePercent ?? 0)}%` },
          { label: 'Programmes', value: l.programs.length },
          { label: 'Tutors', value: l.tutors.length },
        ]} />
        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Opening hours" actions={<HoursDrawer locationId={l.id} hours={hours} />}>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
              {WEEKDAYS.map((d) => <Fragment key={d}><dt className="text-muted-foreground">{WEEKDAY_NAMES[d]}</dt><dd className="tabular-nums">{hours[d]?.length ? hours[d].map((r) => r.join(' – ')).join(', ') : 'Closed'}</dd></Fragment>)}
            </dl>
          </Section>
          <Section title="Closures coming up" count={l.closures.length} actions={<ClosureDrawer locationId={l.id} />}>
            {l.closures.length ? (
              <ul className="grid gap-2 text-sm">{l.closures.map((c: any) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2"><span><span className="font-medium">{dateOnly(c.startsOn)}{dateOnly(c.endsOn) !== dateOnly(c.startsOn) ? ` – ${dateOnly(c.endsOn)}` : ''}</span> · {c.reason}</span><RemoveClosure locationId={l.id} id={c.id} /></li>)}</ul>
            ) : <Empty>No closures planned.</Empty>}
          </Section>
        </div>

        <Section title="Rooms" count={l.rooms.length} actions={<RoomDrawer locationId={l.id} />}>
          {l.rooms.length ? (
            <DataTable label="Rooms" head={[{ label: 'Room' }, { label: 'Kind' }, { label: 'Seats', className: 'text-right' }, { label: 'Status' }, { label: '' }]}>
              {l.rooms.map((r: any) => <tr key={r.id}><Td>{r.name}</Td><Td>{label(r.kind)}</Td><Td className="text-right tabular-nums">{r.capacity}</Td><Td><StatusCell tone={r.status === 'active' ? 'live' : 'off'}>{r.status === 'active' ? 'In use' : 'Not in use'}</StatusCell></Td><Td><RoomDrawer locationId={l.id} room={r} /></Td></tr>)}
            </DataTable>
          ) : <Empty>No rooms. Add the rooms sessions and assessments can be held in.</Empty>}
        </Section>

        <Section title="Staff at this centre" count={members.filter((m: any) => m.status === 'active').length} actions={addable.length ? <AddMember locationId={l.id} users={addable} /> : null}>
          {members.length ? (
            <DataTable label="Staff" head={[{ label: 'Name' }, { label: 'Role here' }, { label: 'Account role' }, { label: 'Status' }, { label: '' }]}>
              {members.map((m: any) => <tr key={m.id}><Td>{m.user.name}<span className="block text-xs text-muted-foreground">{m.user.email}</span></Td><Td>{label(m.role)}</Td><Td>{m.user.role?.name ?? '—'}</Td><Td><StatusCell tone={m.status === 'active' ? 'live' : 'off'}>{label(m.status)}</StatusCell></Td><Td><MemberActions locationId={l.id} member={m} /></Td></tr>)}
            </DataTable>
          ) : <Empty>No staff assigned. Managers and front desk only see centres they belong to.</Empty>}
        </Section>

        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Programmes offered" count={l.programs.length}>
            {l.programs.length ? <p className="flex flex-wrap gap-1">{l.programs.map((p: any) => <Link key={p.id} href={`/dashboard/platform/programs/${p.id}`}><Tag>{p.name}</Tag></Link>)}</p> : <Empty>No published programme lists this centre.</Empty>}
          </Section>
          <Section title="Tutors" count={l.tutors.length}>
            {l.tutors.length ? <p className="flex flex-wrap gap-1">{l.tutors.map((t: any) => <Link key={t.id} href={`/dashboard/platform/tutors/${t.id}`}><Tag tone={t.status === 'active' ? 'live' : 'wait'}>{t.displayName}</Tag></Link>)}</p> : <Empty>No tutors at this centre.</Empty>}
          </Section>
        </div>
        <Track><span className="text-xs text-muted-foreground">Times at this centre are shown in {l.timezone.replace(/_/g, ' ')}.</span></Track>
      </div>
    </PageContainer>
  )
}
