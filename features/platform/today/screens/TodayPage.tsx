import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Input } from '@/components/ui/input'
import { DataTable, Empty, Notice, PageHeader, Pill, Readouts, Section, Td, selectClass } from '@/features/platform/lib/ui'
import { getDaySheet } from '../actions/today'
import { Attendance, Reopen, FinishTask } from '../components/DayActions'

export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams
  const date = typeof p.date === 'string' ? p.date : new Date().toISOString().slice(0, 10)
  const locationId = typeof p.location === 'string' ? p.location : ''
  const r = await getDaySheet(date, locationId)
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Today' }]
  if (!r.ok) return <PageContainer title="Today" breadcrumbs={breadcrumbs}><div className="p-6"><Notice tone="alert">{r.error}</Notice></div></PageContainer>
  const { sessions, tasks, memberships, locations, authenticatedItem } = r.data
  const bookings = sessions.flatMap(s => s.bookings)
  const expected = bookings.filter(b => b.status === 'booked').length
  const arrived = bookings.filter(b => ['attended', 'late'].includes(b.status)).length
  const mayReopen = authenticatedItem?.role?.canManagePayroll || authenticatedItem?.role?.canManageSettings
  const time = (at: string, zone?: string) => new Date(at).toLocaleTimeString('en-US', { timeZone: zone || 'UTC', hour: 'numeric', minute: '2-digit' })
  return <PageContainer title="Today" breadcrumbs={breadcrumbs}>
    <div className="grid w-full gap-5 p-4 md:p-6">
      <PageHeader title="Day sheet" meta="Mark attendance, find students still expected, and clear follow-ups." />
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="grid gap-1 text-sm">Date (UTC day)<Input name="date" type="date" defaultValue={date} /></label>
        <label className="grid gap-1 text-sm">Location<select name="location" className={selectClass} defaultValue={locationId}><option value="">All permitted locations</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <Pill type="submit">Show day</Pill>
      </form>
      <Readouts items={[{ label: 'Sessions', value: sessions.length }, { label: 'Still expected', value: expected, tone: 'wait' }, { label: 'Arrived', value: arrived, tone: 'live' }, { label: 'Tasks due', value: tasks.length }, { label: 'Past due memberships', value: memberships.length, tone: 'alert' }]} />
      <Section title="Sessions" count={sessions.length}>
        {!sessions.length ? <Empty>No sessions on this day at the selected locations.</Empty> : sessions.map(s => <section key={s.id} className="mb-5 overflow-hidden rounded-md border">
          <div className="flex flex-wrap justify-between gap-2 border-b bg-muted/40 p-3 text-sm">
            <div><strong>{time(s.startsAt, s.location?.timezone)}–{time(s.endsAt, s.location?.timezone)} · {s.program?.name}</strong><p className="text-muted-foreground">{s.location?.name} · {s.room?.name || s.mode.replaceAll('_', ' ')} · {s.tutor?.displayName || 'Needs tutor'} · {s.status.replaceAll('_', ' ')}</p></div>
            <Link href={`/dashboard/platform/schedule?session=${s.id}`} className="underline">Schedule</Link>
          </div>
          {s.bookings.length ? <DataTable label="Students in session" head={[{ label: 'Student' }, { label: 'Notes' }, { label: 'Attendance' }]}>
            {s.bookings.map((b: any) => <tr key={b.id}><Td><Link className="font-medium underline" href={`/dashboard/platform/students/${b.student?.id}`}>{b.student?.firstName} {b.student?.lastName}</Link><p className="text-xs text-muted-foreground">{b.family?.name}</p></Td><Td>{b.student?.medicalNotes ? <p className="text-destructive">{b.student.medicalNotes}</p> : null}{b.student?.learningNotes || '—'}</Td><Td>{b.status === 'booked' && s.status !== 'cancelled' ? <Attendance bookingId={b.id} /> : <div className="flex items-center gap-2"><span>{b.status.replaceAll('_', ' ')}</span>{mayReopen && ['attended', 'late', 'no_show', 'cancelled_late', 'cancelled_late_excused'].includes(b.status) ? <Reopen bookingId={b.id} /> : null}</div>}</Td></tr>)}
          </DataTable> : <Empty>No students booked.</Empty>}
        </section>)}
      </Section>
      <Section title="Tasks due" count={tasks.length}>
        {tasks.length ? <DataTable label="Tasks due" head={[{ label: 'Task' }, { label: 'Family' }, { label: 'Action' }]}>{tasks.map(t => <tr key={t.id}><Td>{t.title}<p className="text-xs text-muted-foreground">{t.kind.replaceAll('_', ' ')}</p></Td><Td>{t.family ? <Link className="underline" href={`/dashboard/platform/families/${t.family.id}`}>{t.family.name}</Link> : '—'}</Td><Td><FinishTask taskId={t.id} /></Td></tr>)}</DataTable> : <Empty>No tasks due.</Empty>}
      </Section>
      <Section title="Payments needing attention" count={memberships.length}>
        {memberships.length ? <DataTable label="Past due memberships" head={[{ label: 'Student' }, { label: 'Plan' }, { label: 'Action' }]}>{memberships.map(m => <tr key={m.id}><Td>{m.student?.firstName} {m.student?.lastName}<p className="text-xs text-muted-foreground">{m.family?.name}</p></Td><Td>{m.plan?.name}</Td><Td><Link className="underline" href={`/dashboard/platform/memberships?membership=${m.id}`}>Review billing</Link></Td></tr>)}</DataTable> : <Empty>No past due memberships.</Empty>}
      </Section>
      <p className="text-xs text-muted-foreground">Up to 300 sessions and 100 tasks per day. Session times use the location timezone; the date filter is a UTC day. All records and actions are restricted by your current role and location access.</p>
    </div>
  </PageContainer>
}
