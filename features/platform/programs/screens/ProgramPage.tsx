import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, Readouts, Section, StatusCell, Tag, Td, Track } from '@/features/platform/lib/ui'
import { label, money } from '@/features/platform/families/lib/format'
import { getProgram } from '../actions/programs'
import { PackageDrawer, PlanDrawer, ProgramDrawer, StatusSwitch } from '../components/CatalogueForms'

type PageProps = { params: Promise<{ id: string }> }
const tone = (s: string) => (s === 'published' ? 'live' : s === 'draft' ? 'wait' : 'off') as 'live' | 'wait' | 'off'

export default async function ProgramPage({ params }: PageProps) {
  const { id } = await params
  const res = await getProgram(id)
  const p = res.ok ? res.data.program : null
  const crumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'link' as const, label: 'Programmes and pricing', href: '/dashboard/platform/programs' },
    { type: 'page' as const, label: p?.name ?? 'Programme' },
  ]
  if (!res.ok || !p) {
    return (
      <PageContainer title="Programme" header={<PageHeader title="Programme" />} breadcrumbs={crumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.ok ? 'That programme was not found.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const { subjects, levels, locations } = res.data
  const header = (
    <PageHeader
      title={p.name}
      tone={tone(p.status)}
      meta={`${label(p.status)} · ${label(p.format)} · ${(p.deliveryModes ?? []).map(label).join(', ')}`}
      actions={<Track wrap><StatusSwitch list="Program" id={p.id} status={p.status} programId={p.id} /><ProgramDrawer program={p} subjects={subjects} levels={levels} locations={locations} />{p.status === 'published' ? <Link className="self-center text-sm underline underline-offset-4" href={`/programs/${p.slug}`}>View on the storefront</Link> : null}</Track>}
    />
  )
  return (
    <PageContainer title={p.name} header={header} breadcrumbs={crumbs}>
      <div className="grid gap-8 px-4 pb-10 md:px-6">
        <Readouts items={[
          { label: 'Session', value: `${p.sessionMinutes} min` },
          { label: 'Students per session', value: p.maxStudentsPerSession },
          { label: 'Assessment', value: p.requiresAssessment ? `${money(p.assessmentFee)} · ${p.assessmentMinutes} min` : 'None' },
          { label: 'Pay as you go', value: p.payAsYouGoPrice ? `${money(p.payAsYouGoPrice)} a session` : 'Not offered' },
          { label: 'Levels', value: p.levelsFrom || p.levelsTo ? `${p.levelsFrom?.name ?? 'Any'} – ${p.levelsTo?.name ?? 'any'}` : 'All' },
        ]} />
        <p className="text-sm text-muted-foreground">{p.summary}</p>
        <p className="flex flex-wrap gap-1 text-sm">{p.subjects.map((s: any) => <Tag key={s.id}>{s.name}</Tag>)}<span className="ml-2 text-muted-foreground">{p.locations.map((l: any) => l.name).join(', ') || 'No centre yet'}</span>{p.allowsTrial ? <Tag>Trial offered</Tag> : null}</p>

        <Section title="Membership plans" count={p.plans.length} actions={<PlanDrawer programId={p.id} />}>
          {p.plans.length ? (
            <DataTable label="Membership plans" head={[{ label: 'Plan' }, { label: 'Sessions', className: 'text-right' }, { label: 'Price a month', className: 'text-right' }, { label: 'Enrolment fee', className: 'text-right' }, { label: 'Minimum term' }, { label: 'Status' }, { label: '' }]}>
              {p.plans.map((m: any) => (
                <tr key={m.id}>
                  <Td>{m.name}{m.highlight ? <> <Tag>Recommended</Tag></> : null}<span className="block text-xs text-muted-foreground">{m.description}</span></Td>
                  <Td className="text-right tabular-nums">{m.sessionsPerPeriod ?? `Unlimited (${m.weeklyCapForUnlimited}/wk)`}</Td>
                  <Td className="text-right tabular-nums">{money(m.price)}</Td>
                  <Td className="text-right tabular-nums">{m.enrolmentFee ? money(m.enrolmentFee) : '—'}</Td>
                  <Td>{m.minimumTermMonths ? `${m.minimumTermMonths} months` : 'None'}</Td>
                  <Td><StatusCell tone={tone(m.status)}>{label(m.status)}</StatusCell></Td>
                  <Td><span className="flex flex-wrap gap-1"><PlanDrawer programId={p.id} plan={m} /><StatusSwitch list="MembershipPlan" id={m.id} status={m.status} programId={p.id} /></span></Td>
                </tr>
              ))}
            </DataTable>
          ) : <Empty>No membership plans.</Empty>}
        </Section>

        <Section title="Hours packages" count={p.packages.length} actions={<PackageDrawer programId={p.id} />}>
          {p.packages.length ? (
            <DataTable label="Packages" head={[{ label: 'Package' }, { label: 'Hours', className: 'text-right' }, { label: 'Price', className: 'text-right' }, { label: 'Per hour', className: 'text-right' }, { label: 'Expires' }, { label: 'Status' }, { label: '' }]}>
              {p.packages.map((k: any) => (
                <tr key={k.id}>
                  <Td>{k.name}<span className="block text-xs text-muted-foreground">{k.description}</span></Td>
                  <Td className="text-right tabular-nums">{k.hours}</Td>
                  <Td className="text-right tabular-nums">{money(k.price)}</Td>
                  <Td className="text-right tabular-nums">{money(k.pricePerHour)}</Td>
                  <Td>{k.expiryMonths} months</Td>
                  <Td><StatusCell tone={tone(k.status)}>{label(k.status)}</StatusCell></Td>
                  <Td><span className="flex flex-wrap gap-1"><PackageDrawer programId={p.id} pkg={k} /><StatusSwitch list="Package" id={k.id} status={k.status} programId={p.id} /></span></Td>
                </tr>
              ))}
            </DataTable>
          ) : <Empty>No packages.</Empty>}
        </Section>
      </div>
    </PageContainer>
  )
}
