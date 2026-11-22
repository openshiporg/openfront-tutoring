import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, Readouts, Section, StatusCell, Td } from '@/features/platform/lib/ui'
import { dateOnly, label, toneFor } from '@/features/platform/families/lib/format'
import { getProgress } from '../actions/progress'
import { PublishProgress, WithdrawProgress } from '../components/ProgressForms'

type PageProps = { params: Promise<{ id: string }> }

export default async function ProgressReportPage({ params }: PageProps) {
  const { id } = await params
  const res = await getProgress(id)
  const r = res.ok ? res.data.progressReport : null
  const name = r ? `${r.student?.firstName} ${r.student?.lastName}` : 'Progress report'
  const crumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'link' as const, label: 'Progress reports', href: '/dashboard/platform/progress' },
    { type: 'page' as const, label: name },
  ]
  if (!res.ok || !r) {
    return (
      <PageContainer title="Progress report" header={<PageHeader title="Progress report" />} breadcrumbs={crumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.ok ? 'That report was not found.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const goals: any[] = Array.isArray(r.goalsSnapshot) ? r.goalsSnapshot : []
  const live = r.status === 'published' || r.status === 'acknowledged'
  const header = (
    <PageHeader
      title={`${name}: ${dateOnly(r.periodStart)} – ${dateOnly(r.periodEnd)}`}
      tone={r.status === 'draft' ? 'wait' : r.status === 'withdrawn' ? 'off' : 'live'}
      meta={[r.enrollment?.program?.name, r.enrollment?.tutor?.displayName, r.student?.family?.name].filter(Boolean).join(' · ')}
      actions={live ? <WithdrawProgress reportId={r.id} /> : null}
    />
  )
  const total = r.sessionsAttended + r.sessionsMissed
  return (
    <PageContainer title={name} header={header} breadcrumbs={crumbs}>
      <div className="grid gap-8 px-4 pb-10 md:px-6">
        <Readouts items={[
          { label: 'Status', value: label(r.status === 'acknowledged' ? 'read_by_family' : r.status), tone: r.status === 'draft' ? 'wait' : undefined },
          { label: 'Attended', value: r.sessionsAttended },
          { label: 'Missed', value: r.sessionsMissed },
          { label: 'Attendance', value: total ? `${Math.round((r.sessionsAttended / total) * 100)}%` : '—' },
        ]} />
        <p className="text-sm text-muted-foreground">
          {r.student ? <Link className="underline underline-offset-4" href={`/dashboard/platform/students/${r.student.id}`}>Student record</Link> : null}
          {r.publishedAt ? ` · Published ${dateOnly(r.publishedAt)}${r.author ? ` by ${r.author.name}` : ''}` : ''}
          {r.acknowledgedAt ? ` · Read by the family ${dateOnly(r.acknowledgedAt)}` : ''}
          {r.withdrawReason ? ` · Withdrawn: ${r.withdrawReason}` : ''}
        </p>
        <Section title="Goals at the end of the period" count={goals.length}>
          {goals.length ? (
            <DataTable label="Goals" head={[{ label: 'Goal' }, { label: 'Baseline' }, { label: 'Target' }, { label: 'Status' }]}>
              {goals.map((g, i) => <tr key={g.id ?? i}><Td>{g.title}</Td><Td>{g.baseline || '—'}</Td><Td>{g.target || '—'}</Td><Td><StatusCell tone={toneFor(g.status)}>{label(g.status)}</StatusCell></Td></tr>)}
            </DataTable>
          ) : <Empty>No learning-plan goals were active in this period.</Empty>}
        </Section>
        <Section title={r.status === 'draft' ? 'Review and publish' : 'Report'}>
          {r.status === 'draft' ? <PublishProgress report={r} /> : (
            <div className="grid gap-4 text-sm">
              <p className="whitespace-pre-wrap">{r.narrative || '—'}</p>
              {r.nextSteps ? <div><p className="text-xs font-medium text-muted-foreground">Next steps</p><p className="whitespace-pre-wrap">{r.nextSteps}</p></div> : null}
            </div>
          )}
        </Section>
      </div>
    </PageContainer>
  )
}
