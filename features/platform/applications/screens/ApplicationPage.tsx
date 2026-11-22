import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { Empty, PageHeader, Section, StatusCell, Tag, Track } from '@/features/platform/lib/ui'
import { dateOnly, label, toneFor } from '@/features/platform/families/lib/format'
import { getApplication } from '../actions/applications'
import { ApplicationMoves, ApproveApplication } from '../components/ApplicationForms'

type PageProps = { params: Promise<{ id: string }> }
const STAGES = ['applied', 'screening', 'interview', 'checks', 'approved']

export default async function ApplicationPage({ params }: PageProps) {
  const { id } = await params
  const res = await getApplication(id)
  const a = res.ok ? res.data.tutorApplication : null
  const crumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'link' as const, label: 'Tutor applications', href: '/dashboard/platform/applications' },
    { type: 'page' as const, label: a?.name ?? 'Application' },
  ]
  if (!res.ok || !a) {
    return (
      <PageContainer title="Application" header={<PageHeader title="Application" />} breadcrumbs={crumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.ok ? 'That application was not found.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const at = STAGES.indexOf(a.status)
  const header = (
    <PageHeader
      title={a.name}
      tone={toneFor(a.status)}
      meta={[a.email, a.phone, `received ${dateOnly(a.createdAt)}`].filter(Boolean).join(' · ')}
      actions={<Track wrap>{a.status === 'checks' ? <ApproveApplication id={a.id} name={a.name} locations={res.data.locations} /> : null}<ApplicationMoves id={a.id} status={a.status} /></Track>}
    />
  )
  const refs: any[] = Array.isArray(a.references) ? a.references : []
  return (
    <PageContainer title={a.name} header={header} breadcrumbs={crumbs}>
      <div className="grid gap-8 px-4 pb-10 md:px-6">
        <ol aria-label="Stage" className="flex flex-wrap gap-2 text-sm">
          {STAGES.map((st, i) => (
            <li key={st} className={`rounded-full border px-3 py-1 ${i === at ? 'border-foreground font-semibold' : i < at ? 'text-foreground' : 'text-muted-foreground'}`} aria-current={i === at ? 'step' : undefined}>{i + 1}. {label(st)}</li>
          ))}
          {at < 0 ? <li><StatusCell tone={toneFor(a.status)}>{label(a.status)}</StatusCell></li> : null}
        </ol>
        {a.status === 'checks' ? <p className="text-sm text-muted-foreground">Approving creates the tutor as onboarding. Record and verify their background check on the tutor page before making them active.</p> : null}
        {a.tutor ? <p className="text-sm">Tutor record: <Link className="underline underline-offset-4" href={`/dashboard/platform/tutors/${a.tutor.id}`}>{a.tutor.displayName}</Link></p> : null}
        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Application">
            <dl className="grid grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Subjects</dt><dd className="flex flex-wrap gap-1">{a.subjects.map((s: any) => <Tag key={s.id}>{s.name}</Tag>)}{a.subjectsText ? <span>{a.subjectsText}</span> : null}{!a.subjects.length && !a.subjectsText ? '—' : null}</dd>
              <dt className="text-muted-foreground">Levels</dt><dd>{a.levels || '—'}</dd>
              <dt className="text-muted-foreground">Can teach</dt><dd>{(a.modes ?? []).map(label).join(', ') || '—'}</dd>
              <dt className="text-muted-foreground">Areas</dt><dd>{a.areas || '—'}</dd>
              <dt className="text-muted-foreground">Availability</dt><dd>{typeof a.availability === 'object' && a.availability ? (a.availability.note ?? JSON.stringify(a.availability)) : a.availability || '—'}</dd>
              <dt className="text-muted-foreground">Came through</dt><dd>{label(a.source)}</dd>
              <dt className="text-muted-foreground">CV</dt><dd>{a.cv?.url ? <a className="underline" href={a.cv.url}>{a.cv.filename}</a> : '—'}</dd>
              <dt className="text-muted-foreground">Reviewer</dt><dd>{a.reviewer?.name ?? '—'}</dd>
            </dl>
            {a.coverNote ? <p className="mt-4 whitespace-pre-wrap text-sm">{a.coverNote}</p> : null}
          </Section>
          <div className="grid content-start gap-8">
            <Section title="References" count={refs.length}>
              {refs.length ? <ul className="grid gap-1 text-sm">{refs.map((r, i) => <li key={i}><span className="font-medium">{r.name}</span>{r.relation ? ` · ${r.relation}` : ''}{r.contact ? ` · ${r.contact}` : ''}</li>)}</ul> : <Empty>No references given.</Empty>}
            </Section>
            <Section title="Hiring notes">
              {a.notes ? <p className="whitespace-pre-wrap text-sm">{a.notes}</p> : <Empty>No notes yet. Notes added when moving a stage appear here.</Empty>}
            </Section>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
