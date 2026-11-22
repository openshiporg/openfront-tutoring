import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, Readouts, Section, StatusCell, Tag, Td, Track } from '@/features/platform/lib/ui'
import { dateOnly, dateTime, label, money, toneFor } from '@/features/platform/families/lib/format'
import { getTutor } from '../actions/tutors'
import { AddAvailability, AddCredential, AddSubject, EditTutor, RemoveAvailability, RemoveSubject, TimeOffDecision, TutorStatus, VerifyCredential } from '../components/TutorForms'

type PageProps = { params: Promise<{ id: string }> }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export default async function TutorPage({ params }: PageProps) {
  const { id } = await params
  const res = await getTutor(id)
  const t = res.ok ? res.data.tutor : null
  const crumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'link' as const, label: 'Tutors', href: '/dashboard/platform/tutors' },
    { type: 'page' as const, label: t?.displayName ?? 'Tutor' },
  ]
  if (!res.ok || !t) {
    return (
      <PageContainer title="Tutor" header={<PageHeader title="Tutor" />} breadcrumbs={crumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.ok ? 'That tutor was not found, or is not at one of your centres.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const { subjects, levels, locations, sessions, enrollments } = res.data
  // Pay is readable only with payroll or tutor management; null means this viewer cannot see it.
  const canPay = t.defaultPayRate !== null && t.defaultPayRate !== undefined
  const tz: string = t.locations[0]?.timezone || 'UTC'
  const now = Date.now()
  const check = (t.credentials ?? []).find((c: any) => c.kind === 'background_check' && c.status === 'verified' && (!c.expiresAt || new Date(c.expiresAt).getTime() > now))
  const header = (
    <PageHeader
      title={t.displayName}
      tone={toneFor(t.status)}
      meta={[label(t.employmentType), t.user?.email, t.locations.map((l: any) => l.name).join(', ')].filter(Boolean).join(' · ')}
      actions={<Track wrap><TutorStatus tutorId={t.id} status={t.status} /><EditTutor t={t} locations={locations} canPay={canPay} /></Track>}
    />
  )
  return (
    <PageContainer title={t.displayName} header={header} breadcrumbs={crumbs}>
      <div className="grid gap-8 px-4 pb-10 md:px-6">
        <Readouts items={[
          { label: 'Status', value: label(t.status), tone: toneFor(t.status) },
          { label: 'Students', value: enrollments.length },
          { label: 'Next 15 sessions', value: sessions.length },
          { label: 'Background check', value: check ? `Valid${check.expiresAt ? ` to ${dateOnly(check.expiresAt)}` : ''}` : 'Not verified', tone: check ? 'live' : 'alert' },
          { label: 'Rating', value: t.averageRating != null ? t.averageRating.toFixed(1) : '—' },
        ]} />
        {!t.user ? <p className="text-sm text-muted-foreground">This tutor has no sign-in. Tutors get one when their application is approved.</p> : null}

        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Profile">
            <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Headline</dt><dd>{t.headline || '—'}</dd>
              <dt className="text-muted-foreground">Education</dt><dd>{t.education || '—'}</dd>
              <dt className="text-muted-foreground">Years teaching</dt><dd>{t.yearsExperience ?? 0}</dd>
              <dt className="text-muted-foreground">Teaches</dt><dd>{(t.deliveryModes ?? []).map(label).join(', ') || '—'}</dd>
              <dt className="text-muted-foreground">Home-visit areas</dt><dd>{t.travelAreas || '—'}{t.travelRadiusKm ? ` (${t.travelRadiusKm} km)` : ''}</dd>
              <dt className="text-muted-foreground">Meeting link</dt><dd className="break-all">{t.meetingUrl || '—'}</dd>
              {canPay ? (<><dt className="text-muted-foreground">Default pay</dt><dd>{money(t.defaultPayRate)} an hour</dd></>) : null}
              <dt className="text-muted-foreground">Storefront</dt><dd>{t.publicProfile ? <Link className="underline underline-offset-4" href={`/tutors/${t.slug}`}>Public profile on</Link> : 'Hidden'}</dd>
            </dl>
            {t.bio ? <p className="mt-3 whitespace-pre-wrap text-sm">{t.bio}</p> : null}
          </Section>
          <Section title="Subjects and rates" count={t.subjects.length} actions={<AddSubject tutorId={t.id} subjects={subjects.filter((s: any) => !t.subjects.some((x: any) => x.subject?.id === s.id))} levels={levels} canPay={canPay} />}>
            {t.subjects.length ? (
              <DataTable label="Subjects" head={[{ label: 'Subject' }, { label: 'Levels' }, ...(canPay ? [{ label: 'Pay', className: 'text-right' }] : []), { label: '' }]}>
                {t.subjects.map((s: any) => (
                  <tr key={s.id}>
                    <Td>{s.subject?.name}</Td>
                    <Td>{s.levelFrom || s.levelTo ? `${s.levelFrom?.name ?? 'Any'} – ${s.levelTo?.name ?? 'any'}` : 'All levels'}</Td>
                    {canPay ? <Td className="text-right tabular-nums">{s.payRate != null ? `${money(s.payRate)}/h` : <span className="text-muted-foreground">default</span>}</Td> : null}
                    <Td><RemoveSubject tutorId={t.id} rowId={s.id} name={s.subject?.name ?? 'this subject'} /></Td>
                  </tr>
                ))}
              </DataTable>
            ) : <Empty>No subjects. Matching only offers this tutor for subjects listed here.</Empty>}
          </Section>
        </div>

        <Section title="Weekly hours" count={t.availability.length} actions={<AddAvailability tutorId={t.id} locations={t.locations.length ? t.locations : locations} />}>
          {t.availability.length ? (
            <DataTable label="Availability" head={[{ label: 'Day' }, { label: 'Hours' }, { label: 'Mode' }, { label: 'Centre' }, { label: '' }]}>
              {t.availability.map((a: any) => (
                <tr key={a.id}>
                  <Td>{DAYS[a.weekday]}</Td>
                  <Td className="tabular-nums">{hhmm(a.startMinute)} – {hhmm(a.endMinute)}{a.effectiveTo ? <span className="block text-xs text-muted-foreground">until {dateOnly(a.effectiveTo)}</span> : null}</Td>
                  <Td>{label(a.mode)}</Td>
                  <Td>{a.location?.name ?? '—'}</Td>
                  <Td><RemoveAvailability tutorId={t.id} rowId={a.id} /></Td>
                </tr>
              ))}
            </DataTable>
          ) : <Empty>No weekly hours. Add them so the tutor can be matched and scheduled.</Empty>}
        </Section>

        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Credentials" count={t.credentials.length} actions={<AddCredential tutorId={t.id} />}>
            {t.credentials.length ? (
              <DataTable label="Credentials" head={[{ label: 'Credential' }, { label: 'Expires' }, { label: 'Status' }, { label: '' }]}>
                {t.credentials.map((c: any) => (
                  <tr key={c.id}>
                    <Td>{label(c.kind)}<span className="block text-xs text-muted-foreground">{c.reference || ''}{c.document?.url ? <> · <a className="underline" href={c.document.url}>{c.document.filename}</a></> : ''}</span></Td>
                    <Td>{c.expiresAt ? dateOnly(c.expiresAt) : '—'}</Td>
                    <Td><StatusCell tone={toneFor(c.status)}>{label(c.status)}</StatusCell>{c.verifiedAt ? <span className="block text-xs text-muted-foreground">{dateOnly(c.verifiedAt)}</span> : null}</Td>
                    <Td>{c.status !== 'verified' ? <VerifyCredential tutorId={t.id} credential={c} /> : null}</Td>
                  </tr>
                ))}
              </DataTable>
            ) : <Empty>No credentials recorded. A verified background check is needed before the tutor can be made active.</Empty>}
          </Section>
          <Section title="Time off" count={t.timeOff.length}>
            {t.timeOff.length ? (
              <DataTable label="Time off" head={[{ label: 'When' }, { label: 'Reason' }, { label: 'Status' }, { label: '' }]}>
                {t.timeOff.map((o: any) => (
                  <tr key={o.id}>
                    <Td>{dateTime(o.startsAt, tz)}<span className="block text-xs text-muted-foreground">to {dateTime(o.endsAt, tz)}</span></Td>
                    <Td>{o.reason || '—'}</Td>
                    <Td><StatusCell tone={o.status === 'approved' ? 'live' : o.status === 'declined' ? 'off' : 'wait'}>{label(o.status)}</StatusCell></Td>
                    <Td>{o.status === 'requested' ? <TimeOffDecision tutorId={t.id} timeOffId={o.id} /> : null}</Td>
                  </tr>
                ))}
              </DataTable>
            ) : <Empty>No time off. Tutors request it from their own page; approving it marks clashing sessions as needing cover.</Empty>}
          </Section>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Students" count={enrollments.length}>
            {enrollments.length ? (
              <ul className="grid gap-1 text-sm">{enrollments.map((e: any) => <li key={e.id}><Link className="underline-offset-4 hover:underline" href={`/dashboard/platform/students/${e.student?.id}`}>{e.student?.firstName} {e.student?.lastName}</Link> · {e.program?.name} · <StatusCell tone={toneFor(e.status)}>{label(e.status)}</StatusCell></li>)}</ul>
            ) : <Empty>No students matched yet.</Empty>}
          </Section>
          <Section title="Upcoming sessions" count={sessions.length}>
            {sessions.length ? (
              <ul className="grid gap-1 text-sm">{sessions.map((s: any) => <li key={s.id}>{dateTime(s.startsAt, tz)} · {s.program?.name} · {s.location?.name ?? label(s.mode)} · {s.bookedCount}/{s.capacity}{s.status === 'needs_cover' ? <> · <Tag tone="alert">Needs cover</Tag></> : null}</li>)}</ul>
            ) : <Empty>Nothing scheduled.</Empty>}
          </Section>
        </div>
      </div>
    </PageContainer>
  )
}
