import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Empty, Notice, PageHeader, Section } from '@/features/platform/lib/ui'
import { getLeads } from '../actions/leads'
import { CreateLead, MoveLead, FollowUp } from '../components/LeadForms'
const STAGES = ['new','contacted','assessment_booked','assessed','proposal_sent','enrolled','lost']
export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const p = await searchParams
  const r = await getLeads(p.status || '')
  return <PageContainer title="Leads" breadcrumbs={[{ type: 'page', label: 'Leads' }]}><div className="grid gap-5 p-4 md:p-6">
    <PageHeader title="Lead pipeline" actions={r.ok ? <CreateLead locations={r.data.locations} /> : null} />
    <nav className="flex flex-wrap gap-3 text-sm"><Link href="/dashboard/platform/leads" className="underline">All stages</Link>{STAGES.map(s => <Link key={s} className="underline" href={`/dashboard/platform/leads?status=${s}`}>{s.replaceAll('_',' ')}</Link>)}</nav>
    {!r.ok ? <Notice tone="alert">{r.error}</Notice> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{STAGES.filter(s => !p.status || p.status === s).map(stage => <Section key={stage} title={stage.replaceAll('_',' ')} count={r.data.leads.filter(l => l.status === stage).length}>
      {r.data.leads.filter(l => l.status === stage).map(l => <article key={l.id} className="mb-3 grid gap-2 rounded-md border p-3 text-sm"><strong>{l.guardianName}</strong><p>{l.studentName} · {l.program?.name}</p><p>{l.email} · {l.phone}</p><p>{l.message}</p><p className="text-xs text-muted-foreground">{l.location?.name || 'No location'} · Follow up {l.nextFollowUpAt?.slice(0,10) || 'not scheduled'}</p>{l.lostReason ? <p>{l.lostReason}</p> : null}<div className="flex flex-wrap gap-2"><MoveLead id={l.id} /><FollowUp id={l.id} users={r.data.users} />{l.family ? <Link className="underline" href={`/dashboard/platform/families/${l.family.id}`}>Family</Link> : <Link className="underline" href={`/dashboard/platform/families?lead=${l.id}`}>Create family</Link>}<Link className="underline" href={`/dashboard/platform/assessments?lead=${l.id}`}>Book assessment</Link></div></article>)}
      {!r.data.leads.some(l => l.status === stage) ? <Empty>No leads.</Empty> : null}
    </Section>)}</div>}
  </div></PageContainer>
}
