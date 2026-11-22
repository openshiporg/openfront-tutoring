import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, Section, StatusCell, StatusTabs, Tag, Td } from '@/features/platform/lib/ui'
import { dateOnly, label, money } from '@/features/platform/families/lib/format'
import { getCatalogue } from '../actions/programs'
import { EndPromo, LevelDrawer, ProgramDrawer, PromoDrawer, StatusSwitch, SubjectDrawer } from '../components/CatalogueForms'

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
const TABS = ['programmes', 'subjects', 'levels', 'promo-codes'] as const
const breadcrumbs = [
  { type: 'link' as const, label: 'Dashboard', href: basePath },
  { type: 'page' as const, label: 'Platform' },
  { type: 'page' as const, label: 'Programmes and pricing' },
]
const tone = (s: string) => (s === 'published' ? 'live' : s === 'draft' ? 'wait' : 'off') as 'live' | 'wait' | 'off'

export default async function ProgramsPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {}
  const tab = (TABS as readonly string[]).includes(String(sp.tab)) ? String(sp.tab) : 'programmes'
  const res = await getCatalogue()
  if (!res.ok) {
    return (
      <PageContainer title="Programmes and pricing" header={<PageHeader title="Programmes and pricing" />} breadcrumbs={breadcrumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const { programs, subjects, levels, promoCodes, locations } = res.data
  const header = <PageHeader title="Programmes and pricing" meta="Everything here shows on the storefront once published." actions={tab === 'programmes' ? <ProgramDrawer subjects={subjects} levels={levels} locations={locations} /> : null} />
  const now = Date.now()
  return (
    <PageContainer title="Programmes and pricing" header={header} breadcrumbs={breadcrumbs}>
      <div className="grid gap-6 px-4 pb-10 md:px-6">
        <StatusTabs label="Catalogue sections" current={tab} hrefFor={(t) => `/dashboard/platform/programs${t === 'programmes' ? '' : `?tab=${t}`}`} tabs={[
          { value: 'programmes', label: 'Programmes', count: programs.length }, { value: 'subjects', label: 'Subjects', count: subjects.length },
          { value: 'levels', label: 'Levels', count: levels.length }, { value: 'promo-codes', label: 'Promo codes', count: promoCodes.length },
        ]} />

        {tab === 'programmes' ? (programs.length ? (
          <DataTable label="Programmes" head={[{ label: 'Programme' }, { label: 'Format' }, { label: 'Centres' }, { label: 'Assessment', className: 'text-right' }, { label: 'Plans / packages', className: 'text-right' }, { label: 'Status' }, { label: '' }]}>
            {programs.map((p: any) => (
              <tr key={p.id} className="hover:bg-muted/40">
                <Td><Link href={`/dashboard/platform/programs/${p.id}`} className="font-medium underline-offset-4 hover:underline">{p.name}</Link>{p.featured ? <> <Tag>Featured</Tag></> : null}<span className="block text-xs text-muted-foreground">{p.subjects.map((s: any) => s.name).join(', ')}</span></Td>
                <Td>{label(p.format)}<span className="block text-xs text-muted-foreground">{(p.deliveryModes ?? []).map(label).join(', ')} · {p.sessionMinutes} min</span></Td>
                <Td>{p.locations.map((l: any) => l.name).join(', ') || '—'}</Td>
                <Td className="text-right tabular-nums">{p.requiresAssessment ? money(p.assessmentFee) : 'None'}</Td>
                <Td className="text-right tabular-nums">{p.plansCount} / {p.packagesCount}</Td>
                <Td><StatusCell tone={tone(p.status)}>{label(p.status)}</StatusCell></Td>
                <Td><StatusSwitch list="Program" id={p.id} status={p.status} programId={p.id} /></Td>
              </tr>
            ))}
          </DataTable>
        ) : <Empty>No programmes yet.</Empty>) : null}

        {tab === 'subjects' ? (
          <Section title="Subjects" count={subjects.length} actions={<SubjectDrawer />}>
            {subjects.length ? (
              <DataTable label="Subjects" head={[{ label: 'Subject' }, { label: 'Category' }, { label: 'Programmes', className: 'text-right' }, { label: 'Order', className: 'text-right' }, { label: '' }]}>
                {subjects.map((s: any) => <tr key={s.id}><Td>{s.name}<span className="block text-xs text-muted-foreground">{s.description}</span></Td><Td>{label(s.category)}</Td><Td className="text-right tabular-nums">{s.programsCount}</Td><Td className="text-right tabular-nums">{s.sortOrder}</Td><Td><SubjectDrawer subject={s} /></Td></tr>)}
              </DataTable>
            ) : <Empty>No subjects yet.</Empty>}
          </Section>
        ) : null}

        {tab === 'levels' ? (
          <Section title="Levels" count={levels.length} actions={<LevelDrawer />}>
            {levels.length ? (
              <DataTable label="Levels" head={[{ label: 'Level' }, { label: 'Kind' }, { label: 'Order', className: 'text-right' }, { label: '' }]}>
                {levels.map((l: any) => <tr key={l.id}><Td>{l.name}</Td><Td>{label(l.kind)}</Td><Td className="text-right tabular-nums">{l.sortOrder}</Td><Td><LevelDrawer level={l} /></Td></tr>)}
              </DataTable>
            ) : <Empty>No levels yet.</Empty>}
          </Section>
        ) : null}

        {tab === 'promo-codes' ? (
          <Section title="Promo codes" count={promoCodes.length} actions={<PromoDrawer />}>
            {promoCodes.length ? (
              <DataTable label="Promo codes" head={[{ label: 'Code' }, { label: 'Discount', className: 'text-right' }, { label: 'Applies to' }, { label: 'Valid' }, { label: 'Used', className: 'text-right' }, { label: '' }]}>
                {promoCodes.map((p: any) => {
                  const ended = p.validTo && new Date(p.validTo).getTime() < now
                  return (
                    <tr key={p.id}>
                      <Td className="font-mono">{p.code}</Td>
                      <Td className="text-right tabular-nums">{p.percentOff ? `${p.percentOff}%` : money(p.amountOff)}</Td>
                      <Td>{label(p.appliesTo)}</Td>
                      <Td>{p.validFrom ? dateOnly(p.validFrom) : 'Now'} – {p.validTo ? dateOnly(p.validTo) : 'no end'}{ended ? <> <Tag tone="off">Ended</Tag></> : null}</Td>
                      <Td className="text-right tabular-nums">{p.uses}{p.maxUses ? ` of ${p.maxUses}` : ''}</Td>
                      <Td><span className="flex gap-1"><PromoDrawer promo={p} />{!ended ? <EndPromo id={p.id} /> : null}</span></Td>
                    </tr>
                  )
                })}
              </DataTable>
            ) : <Empty>No promo codes.</Empty>}
          </Section>
        ) : null}
      </div>
    </PageContainer>
  )
}
