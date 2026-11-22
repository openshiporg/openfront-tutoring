import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, PillLink, StatusCell, StatusTabs, Tag, Td, selectClass } from '@/features/platform/lib/ui'
import { label, toneFor } from '@/features/platform/families/lib/format'
import { listTutors } from '../actions/tutors'

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
const STATES = ['onboarding', 'active', 'paused', 'inactive']
const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: basePath },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Tutors' },
]

export default async function TutorsPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {}
  const q = one(sp.q).slice(0, 80)
  const status = STATES.includes(one(sp.status)) ? one(sp.status) : ''
  const locationId = one(sp.location)
  const res = await listTutors({ q, status, locationId })
  const header = <PageHeader title="Tutors" meta="New tutors join through an approved application." actions={<PillLink href="/dashboard/platform/applications">Applications</PillLink>} />
  if (!res.ok) {
    return (
      <PageContainer title="Tutors" header={header} breadcrumbs={breadcrumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.forbidden ? 'Your role does not include the tutor directory.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const { tutors, locations } = res.data
  const href = (over: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(locationId ? { location: locationId } : {}), ...over })
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k)
    return `/dashboard/platform/tutors${u.toString() ? `?${u}` : ''}`
  }
  return (
    <PageContainer title="Tutors" header={header} breadcrumbs={breadcrumbs}>
      <div className="grid gap-4 px-4 pb-10 md:px-6">
        <form method="get" className="flex flex-wrap gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input name="q" defaultValue={q} aria-label="Search tutors" placeholder="Search a name, subject or area" className="h-9 w-full max-w-md rounded-[6px] border bg-background px-3 text-sm" />
          <select name="location" aria-label="Centre" defaultValue={locationId} className={`${selectClass} w-48`}><option value="">All centres</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <button type="submit" className="h-9 rounded-[6px] border px-3 text-sm font-medium hover:bg-muted">Search</button>
        </form>
        <StatusTabs current={status} hrefFor={(v) => href({ status: v })} tabs={[{ value: '', label: 'All' }, ...STATES.map((s) => ({ value: s, label: label(s), tone: toneFor(s) }))]} />
        {tutors.length ? (
          <DataTable label="Tutors" head={[{ label: 'Tutor' }, { label: 'Subjects' }, { label: 'Teaches' }, { label: 'Centres' }, { label: 'Rating', className: 'text-right' }, { label: 'Status' }]}>
            {tutors.map((t: any) => (
              <tr key={t.id} className="hover:bg-muted/40">
                <Td><Link href={`/dashboard/platform/tutors/${t.id}`} className="font-medium underline-offset-4 hover:underline">{t.displayName}</Link><span className="block text-xs text-muted-foreground">{label(t.employmentType)}{t.user ? '' : ' · no sign-in yet'}{t.publicProfile ? ' · public profile' : ''}</span></Td>
                <Td><span className="flex max-w-xs flex-wrap gap-1">{t.subjects.slice(0, 5).map((s: any) => <Tag key={s.id}>{s.subject?.name}</Tag>)}{t.subjects.length > 5 ? <span className="text-xs text-muted-foreground">+{t.subjects.length - 5}</span> : null}</span></Td>
                <Td>{(t.deliveryModes ?? []).map(label).join(', ')}</Td>
                <Td>{t.locations.map((l: any) => l.name).join(', ') || '—'}</Td>
                <Td className="text-right tabular-nums">{t.averageRating != null ? t.averageRating.toFixed(1) : '—'}</Td>
                <Td><StatusCell tone={toneFor(t.status)}>{label(t.status)}</StatusCell></Td>
              </tr>
            ))}
          </DataTable>
        ) : <Empty>{q || status || locationId ? 'No tutor matches.' : 'No tutors yet. Approve an application to add one.'}</Empty>}
      </div>
    </PageContainer>
  )
}
