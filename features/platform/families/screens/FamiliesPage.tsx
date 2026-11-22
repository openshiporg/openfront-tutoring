import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, Pager, StatusCell, StatusTabs, Td } from '@/features/platform/lib/ui'
import { listFamilies } from '../actions/families'
import { NewFamily } from '../components/FamilyForms'

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')
const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: basePath },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Families' },
]

export default async function FamiliesPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {}
  const q = one(sp.q).slice(0, 80)
  const status = ['active', 'inactive'].includes(one(sp.status)) ? one(sp.status) : ''
  const locationId = one(sp.location)
  const page = Math.max(1, Number.parseInt(one(sp.page) || '1', 10) || 1)
  const res = await listFamilies({ q, status, locationId, page })

  if (!res.ok) {
    return (
      <PageContainer title="Families" header={<PageHeader title="Families" />} breadcrumbs={breadcrumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.forbidden ? 'Your role does not include family records. Ask the owner or a manager for access.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const d = res.data
  const pages = Math.max(1, Math.ceil(d.familiesCount / 30))
  const href = (over: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(locationId ? { location: locationId } : {}), ...over })
    for (const [k, v] of [...u.entries()]) if (!v) u.delete(k)
    const s = u.toString()
    return `/dashboard/platform/families${s ? `?${s}` : ''}`
  }
  const header = <PageHeader title="Families" meta={`${d.active} active, ${d.inactive} inactive`} actions={<NewFamily locations={d.locations} />} />

  return (
    <PageContainer title="Families" header={header} breadcrumbs={breadcrumbs}>
      <div className="grid gap-4 px-4 pb-10 md:px-6">
        <form method="get" className="flex flex-wrap items-center gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input name="q" defaultValue={q} placeholder="Search a family, guardian, child, email or phone" aria-label="Search families" className="h-9 w-full max-w-md rounded-[6px] border bg-background px-3 text-sm" />
          {d.locations.length > 1 ? (
            <select name="location" defaultValue={locationId} aria-label="Home centre" className="h-9 rounded-[6px] border bg-background px-3 text-sm">
              <option value="">Every centre</option>
              {d.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          ) : null}
          <button className="h-9 rounded-[6px] border px-3 text-sm font-medium hover:bg-muted" type="submit">Search</button>
        </form>
        <StatusTabs current={status} hrefFor={(v) => href({ status: v, page: '' })} tabs={[
          { value: '', label: 'All' }, { value: 'active', label: 'Active', count: d.active, tone: 'live' }, { value: 'inactive', label: 'Inactive', count: d.inactive, tone: 'off' },
        ]} />
        {d.families.length ? (
          <DataTable label="Families" head={[{ label: 'Family' }, { label: 'Guardians' }, { label: 'Children' }, { label: 'Home centre' }, { label: 'Status' }]}>
            {d.families.map((f) => (
              <tr key={f.id} className="hover:bg-muted/40">
                <Td><Link className="font-medium underline-offset-4 hover:underline" href={`/dashboard/platform/families/${f.id}`}>{f.name}</Link><span className="block text-xs text-muted-foreground">{f.billingEmail || '—'}{f.phone ? ` · ${f.phone}` : ''}</span></Td>
                <Td>{f.guardians.map((g) => g.name).join(', ') || <span className="text-muted-foreground">No sign-in yet</span>}</Td>
                <Td>{f.students.map((s) => s.firstName).join(', ') || <span className="text-muted-foreground">None</span>}</Td>
                <Td>{f.primaryLocation?.name ?? <span className="text-muted-foreground">Online / in-home</span>}</Td>
                <Td><StatusCell tone={f.status === 'active' ? 'live' : 'off'}>{f.status}</StatusCell></Td>
              </tr>
            ))}
          </DataTable>
        ) : <Empty>{q ? `No family matches “${q}”.` : 'No families yet. Families appear here when someone books an assessment, registers, or is added with “New family”.'}</Empty>}
        <Pager label="Families pages" page={page} pages={pages} prev={page > 1 ? href({ page: String(page - 1) }) : null} next={page < pages ? href({ page: String(page + 1) }) : null} />
      </div>
    </PageContainer>
  )
}
