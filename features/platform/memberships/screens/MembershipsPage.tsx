import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { DataTable, Empty, Notice, PageHeader, Section, Td } from '@/features/platform/lib/ui'
import { PauseMembership, EndMembership, ChangePlan } from '@/features/platform/families/components/FamilyForms'
import { getMemberships } from '../actions/memberships'
import { RunBilling, ReconcileAttempt } from '../components/BillingForms'
export default async function MembershipsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const p = await searchParams
  const r = await getMemberships(p.status || '')
  return <PageContainer title="Memberships" breadcrumbs={[{ type: 'page', label: 'Memberships' }]}><div className="grid gap-5 p-4 md:p-6">
    <PageHeader title="Memberships" actions={<RunBilling />} />
    <nav className="flex flex-wrap gap-3 text-sm">{['','active','past_due','paused','cancelling','cancelled'].map(status => <Link className="underline" key={status} href={`/dashboard/platform/memberships?status=${status}`}>{status.replaceAll('_',' ') || 'All'}</Link>)}</nav>
    {!r.ok ? <Notice tone="alert">{r.error}</Notice> : <Section title="Memberships" count={r.data.memberships.length}>{r.data.memberships.length ? <DataTable label="Memberships" head={[{ label: 'Student / family' }, { label: 'Plan / status' }, { label: 'Billing' }, { label: 'Actions' }]}>{r.data.memberships.map(m => <tr key={m.id}><Td>{m.student?.firstName} {m.student?.lastName}<p><Link className="underline" href={`/dashboard/platform/families/${m.family?.id}`}>{m.family?.name}</Link></p></Td><Td>{m.plan?.name}<p>{m.status} · {(m.price / 100).toFixed(2)}</p><p className="text-xs">Period ends {m.currentPeriodEnd?.slice(0,10)}</p></Td><Td>{m.billingAttempts.map((a: any) => <div key={a.id}>{a.status}<p className="text-xs">{a.failureMessage}</p>{a.status === 'unknown' ? <ReconcileAttempt id={a.id} /> : null}</div>)}</Td><Td><div className="flex flex-wrap gap-2"><RunBilling membershipId={m.id} /><PauseMembership familyId={m.family?.id} membershipId={m.id} /><EndMembership familyId={m.family?.id} membershipId={m.id} /><ChangePlan familyId={m.family?.id} membershipId={m.id} plans={r.data.membershipPlans.filter(pl => pl.program?.id === m.plan?.program?.id)} /></div></Td></tr>)}</DataTable> : <Empty>No matching memberships.</Empty>}</Section>}
  </div></PageContainer>
}
