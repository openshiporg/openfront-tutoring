import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, StatusCell, StatusTabs, Td } from '@/features/platform/lib/ui'
import { dateOnly, label, toneFor } from '@/features/platform/families/lib/format'
import { listProgress } from '../actions/progress'
import { DraftProgress } from '../components/ProgressForms'

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
const STATES = ['draft', 'published', 'acknowledged', 'withdrawn']
const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: basePath },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Progress reports' },
]

export default async function ProgressPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {}
  const status = STATES.includes(one(sp.status)) ? one(sp.status) : ''
  const studentId = one(sp.student)
  const res = await listProgress({ status, studentId })
  if (!res.ok) {
    return (
      <PageContainer title="Progress reports" header={<PageHeader title="Progress reports" />} breadcrumbs={breadcrumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.forbidden ? 'Your role does not include progress reports.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const { progressReports: rows, counts, enrollments } = res.data
  const header = <PageHeader title="Progress reports" meta="A draft opens every 4 weeks or 12 sessions; review it, then publish." actions={<DraftProgress enrollments={enrollments} studentId={studentId || undefined} />} />
  const href = (st: string) => { const u = new URLSearchParams({ ...(studentId ? { student: studentId } : {}), ...(st ? { status: st } : {}) }); return `/dashboard/platform/progress${u.toString() ? `?${u}` : ''}` }
  return (
    <PageContainer title="Progress reports" header={header} breadcrumbs={breadcrumbs}>
      <div className="grid gap-4 px-4 pb-10 md:px-6">
        {studentId && rows[0] ? <p className="text-sm">Showing {rows[0].student?.firstName} {rows[0].student?.lastName} only. <Link className="underline underline-offset-4" href="/dashboard/platform/progress">Show everyone</Link></p> : null}
        <StatusTabs current={status} hrefFor={href} tabs={[{ value: '', label: 'All', count: counts.length }, ...STATES.map((s) => ({ value: s, label: label(s), count: counts.filter((c: any) => c.status === s).length, tone: toneFor(s === 'acknowledged' ? 'done' : s) }))]} />
        {rows.length ? (
          <DataTable label="Progress reports" head={[{ label: 'Student' }, { label: 'Period' }, { label: 'Sessions', className: 'text-right' }, { label: 'Programme' }, { label: 'Status' }]}>
            {rows.map((r: any) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <Td><Link href={`/dashboard/platform/progress/${r.id}`} className="font-medium underline-offset-4 hover:underline">{r.student?.firstName} {r.student?.lastName}</Link><span className="block text-xs text-muted-foreground">{r.student?.family?.name}</span></Td>
                <Td>{dateOnly(r.periodStart)} – {dateOnly(r.periodEnd)}</Td>
                <Td className="text-right tabular-nums">{r.sessionsAttended} attended{r.sessionsMissed ? `, ${r.sessionsMissed} missed` : ''}</Td>
                <Td>{r.enrollment?.program?.name ?? '—'}<span className="block text-xs text-muted-foreground">{r.enrollment?.tutor?.displayName}</span></Td>
                <Td><StatusCell tone={r.status === 'draft' ? 'wait' : r.status === 'withdrawn' ? 'off' : 'live'}>{label(r.status === 'acknowledged' ? 'read_by_family' : r.status)}</StatusCell></Td>
              </tr>
            ))}
          </DataTable>
        ) : <Empty>{status ? `No ${label(status).toLowerCase()} reports.` : 'No progress reports yet.'}</Empty>}
      </div>
    </PageContainer>
  )
}
