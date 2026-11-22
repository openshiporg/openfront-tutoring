import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, Pager, StatusCell, StatusTabs, Td } from '@/features/platform/lib/ui'
import { label, toneFor } from '@/features/platform/families/lib/format'
import { listStudents } from '../actions/students'

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: basePath },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Students' },
]
const STATES = ['prospect', 'active', 'paused', 'alumni']

export default async function StudentsPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {}
  const q = one(sp.q).slice(0, 80)
  const status = STATES.includes(one(sp.status)) ? one(sp.status) : ''
  const page = Math.max(1, Number.parseInt(one(sp.page) || '1', 10) || 1)
  const res = await listStudents({ q, status, page })
  const header = <PageHeader title="Students" meta="Add a student from their family’s page." />
  if (!res.ok) {
    return (
      <PageContainer title="Students" header={header} breadcrumbs={breadcrumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.forbidden ? 'Your role does not include student records.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const { students, studentsCount } = res.data
  const pages = Math.max(1, Math.ceil(studentsCount / 40))
  const href = (over: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...over })
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k)
    return `/dashboard/platform/students${u.toString() ? `?${u}` : ''}`
  }
  return (
    <PageContainer title="Students" header={header} breadcrumbs={breadcrumbs}>
      <div className="grid gap-4 px-4 pb-10 md:px-6">
        <form method="get" className="flex flex-wrap gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input name="q" defaultValue={q} aria-label="Search students" placeholder="Search a student, school or family" className="h-9 w-full max-w-md rounded-[6px] border bg-background px-3 text-sm" />
          <button type="submit" className="h-9 rounded-[6px] border px-3 text-sm font-medium hover:bg-muted">Search</button>
        </form>
        <StatusTabs current={status} hrefFor={(v) => href({ status: v, page: '' })} tabs={[{ value: '', label: 'All' }, ...STATES.map((s) => ({ value: s, label: label(s), tone: toneFor(s) }))]} />
        {students.length ? (
          <DataTable label="Students" head={[{ label: 'Student' }, { label: 'Family' }, { label: 'Enrolled in' }, { label: 'Plan' }, { label: 'Status' }]}>
            {students.map((s: any) => (
              <tr key={s.id} className="hover:bg-muted/40">
                <Td><Link href={`/dashboard/platform/students/${s.id}`} className="font-medium underline-offset-4 hover:underline">{s.firstName} {s.lastName}</Link><span className="block text-xs text-muted-foreground">{[s.level?.name, s.school].filter(Boolean).join(' · ')}</span></Td>
                <Td>{s.family ? <Link href={`/dashboard/platform/families/${s.family.id}`} className="underline-offset-4 hover:underline">{s.family.name}</Link> : '—'}<span className="block text-xs text-muted-foreground">{s.family?.primaryLocation?.name}</span></Td>
                <Td>{s.enrolments.length ? s.enrolments.map((e: any) => <span key={e.id} className="block">{e.program?.name}{e.tutor ? ` · ${e.tutor.displayName}` : ` · ${label(e.status)}`}</span>) : <span className="text-muted-foreground">—</span>}</Td>
                <Td>{s.plans[0] ? <StatusCell tone={toneFor(s.plans[0].status === 'proposed' ? 'pending' : 'active')}>{label(s.plans[0].status)}</StatusCell> : <span className="text-muted-foreground">None</span>}</Td>
                <Td><StatusCell tone={toneFor(s.status)}>{label(s.status)}</StatusCell></Td>
              </tr>
            ))}
          </DataTable>
        ) : <Empty>{q ? `No student matches “${q}”.` : 'No students yet.'}</Empty>}
        <Pager label="Students pages" page={page} pages={pages} prev={page > 1 ? href({ page: String(page - 1) }) : null} next={page < pages ? href({ page: String(page + 1) }) : null} />
      </div>
    </PageContainer>
  )
}
