import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, StatusCell, StatusTabs, Tag, Td } from '@/features/platform/lib/ui'
import { dateOnly, label, toneFor } from '@/features/platform/families/lib/format'
import { listApplications } from '../actions/applications'
import { NewApplication } from '../components/ApplicationForms'

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
const STAGES = ['applied', 'screening', 'interview', 'checks', 'approved', 'rejected', 'withdrawn']
const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: basePath },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Tutor applications' },
]

export default async function ApplicationsPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {}
  const q = one(sp.q).slice(0, 80)
  const status = STAGES.includes(one(sp.status)) ? one(sp.status) : ''
  const res = await listApplications({ q, status })
  if (!res.ok) {
    return (
      <PageContainer title="Tutor applications" header={<PageHeader title="Tutor applications" />} breadcrumbs={breadcrumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.forbidden ? 'Recruiting is open to staff who manage tutors.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const { tutorApplications: apps, counts, subjects } = res.data
  const count = (st: string) => counts.filter((c: any) => c.status === st).length
  const header = <PageHeader title="Tutor applications" meta="Applied → screening → interview → checks → approved." actions={<NewApplication subjects={subjects} />} />
  const href = (st: string) => { const u = new URLSearchParams({ ...(q ? { q } : {}), ...(st ? { status: st } : {}) }); return `/dashboard/platform/applications${u.toString() ? `?${u}` : ''}` }
  return (
    <PageContainer title="Tutor applications" header={header} breadcrumbs={breadcrumbs}>
      <div className="grid gap-4 px-4 pb-10 md:px-6">
        <form method="get" className="flex flex-wrap gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input name="q" defaultValue={q} aria-label="Search applications" placeholder="Search a name, email or subject" className="h-9 w-full max-w-md rounded-[6px] border bg-background px-3 text-sm" />
          <button type="submit" className="h-9 rounded-[6px] border px-3 text-sm font-medium hover:bg-muted">Search</button>
        </form>
        <StatusTabs current={status} hrefFor={href} tabs={[{ value: '', label: 'All', count: counts.length }, ...STAGES.map((s) => ({ value: s, label: label(s), count: count(s), tone: toneFor(s) }))]} />
        {apps.length ? (
          <DataTable label="Applications" head={[{ label: 'Applicant' }, { label: 'Subjects' }, { label: 'Can teach' }, { label: 'Came through' }, { label: 'Received' }, { label: 'Stage' }]}>
            {apps.map((a: any) => (
              <tr key={a.id} className="hover:bg-muted/40">
                <Td><Link href={`/dashboard/platform/applications/${a.id}`} className="font-medium underline-offset-4 hover:underline">{a.name}</Link><span className="block text-xs text-muted-foreground">{a.email}</span></Td>
                <Td><span className="flex max-w-xs flex-wrap gap-1">{a.subjects.length ? a.subjects.map((s: any) => <Tag key={s.id}>{s.name}</Tag>) : <span className="text-sm">{a.subjectsText || '—'}</span>}</span></Td>
                <Td>{(a.modes ?? []).map(label).join(', ') || '—'}</Td>
                <Td>{label(a.source)}</Td>
                <Td>{dateOnly(a.createdAt)}</Td>
                <Td><StatusCell tone={toneFor(a.status)}>{label(a.status)}</StatusCell></Td>
              </tr>
            ))}
          </DataTable>
        ) : <Empty>{q || status ? 'No application matches.' : 'No applications yet. Add an applicant when someone gets in touch.'}</Empty>}
      </div>
    </PageContainer>
  )
}
