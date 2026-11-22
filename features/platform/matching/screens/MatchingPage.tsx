import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { DataTable, Empty, Notice, PageHeader, Section, Td } from '@/features/platform/lib/ui'
import { getMatching } from '../actions/matching'
import { SendOffer, WithdrawOffer } from '../components/OfferForms'
export default async function MatchingPage({ searchParams }: { searchParams: Promise<{ enrollment?: string }> }) {
  const p = await searchParams
  const r = await getMatching(p.enrollment)
  return <PageContainer title="Matching" breadcrumbs={[{ type: 'page', label: 'Matching' }]}><div className="grid gap-5 p-4 md:p-6">
    <PageHeader title="Tutor matching" meta="Ranked candidates, preferred-time fit and re-match queue." />
    {!r.ok ? <Notice tone="alert">{r.error}</Notice> : <>
      <Section title="Waiting and trial placements" count={r.data.enrollments.length}>{r.data.enrollments.length ? <DataTable label="Matching queue" head={[{ label: 'Student / programme' }, { label: 'Status' }, { label: 'Offers' }, { label: 'Candidates' }]}>{r.data.enrollments.map(e => <tr key={e.id}><Td>{e.student?.firstName} {e.student?.lastName}<p>{e.program?.name}</p><p className="text-xs text-muted-foreground">{e.location?.name} · {e.mode}</p></Td><Td>{e.status}</Td><Td>{e.offers.map((o: any) => <div key={o.id} className="mb-2">{o.tutor?.displayName} · {o.status}{o.declineReason ? <p>{o.declineReason}</p> : null}{o.status === 'sent' ? <WithdrawOffer offerId={o.id} /> : null}</div>)}</Td><Td><Link className="underline" href={`/dashboard/platform/matching?enrollment=${e.id}`}>Rank tutors</Link></Td></tr>)}</DataTable> : <Empty>No enrolments waiting for a match.</Empty>}</Section>
      {p.enrollment ? <Section title="Ranked tutors">{!r.data.matchingCandidates ? <Empty>No matching details available for your role.</Empty> : <><p className="mb-3 text-sm">{r.data.matchingCandidates.enrollment.studentFirstName} · {r.data.matchingCandidates.enrollment.programName} · {r.data.matchingCandidates.enrollment.area}</p>{r.data.matchingCandidates.candidates.length ? <DataTable label="Ranked tutors" head={[{ label: 'Tutor' }, { label: 'Fit' }, { label: 'Pay rate' }, { label: 'Action' }]}>{r.data.matchingCandidates.candidates.map((c: any) => <tr key={c.tutorId}><Td>{c.name}</Td><Td>{c.reasons.map((reason: string) => <p key={reason}>{reason}</p>)}<p className="text-xs text-muted-foreground">{c.fits.map((s: any) => `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.weekday]} ${Math.floor(s.startMinute / 60)}:${String(s.startMinute % 60).padStart(2,'0')}`).join(', ')}</p></Td><Td>{(c.payRate / 100).toFixed(2)} / hour</Td><Td><SendOffer enrollmentId={p.enrollment!} tutorId={c.tutorId} /></Td></tr>)}</DataTable> : <Empty>No eligible tutors fit. Review subjects, levels, availability and verified credentials.</Empty>}</>}</Section> : null}
    </>}
  </div></PageContainer>
}
