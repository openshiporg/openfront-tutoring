import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { DataTable, Empty, Notice, PageHeader, Section, Td } from '@/features/platform/lib/ui'
import { getAssessments } from '../actions/assessments'
import { BookAssessment, CompleteAssessment, AssessmentState } from '../components/AssessmentForms'
export default async function AssessmentsPage() {
  const r = await getAssessments()
  return <PageContainer title="Assessments" breadcrumbs={[{ type: 'page', label: 'Assessments' }]}><div className="grid gap-5 p-4 md:p-6">
    <PageHeader title="Assessments and parent meetings" actions={r.ok ? <BookAssessment {...r.data} /> : null} />
    {!r.ok ? <Notice tone="alert">{r.error}</Notice> : <Section title="Appointments" count={r.data.assessments.length}>{r.data.assessments.length ? <DataTable label="Assessments" head={[{ label: 'When / assessor' }, { label: 'Student / programme' }, { label: 'Results' }, { label: 'Actions' }]}>{r.data.assessments.map(a => <tr key={a.id}><Td>{a.scheduledAt ? new Date(a.scheduledAt).toISOString().replace('T',' ').slice(0,16) + ' UTC' : 'Unscheduled'}<p>{a.assessor?.displayName}</p><p>{a.kind} · {a.status}</p></Td><Td>{a.student?.firstName} {a.student?.lastName}<p>{a.program?.name}</p></Td><Td>{a.summary}{a.results.map((result: any) => <p key={result.skill}>{result.skill}: {result.score} / {result.maxScore}</p>)}</Td><Td><div className="flex flex-wrap gap-2">{a.status === 'scheduled' ? <><AssessmentState id={a.id} operation="startAssessment" label="Start" /><AssessmentState id={a.id} operation="markAssessmentNoShow" label="No show" /><AssessmentState id={a.id} operation="cancelAssessment" label="Cancel" /></> : null}{['scheduled','in_progress'].includes(a.status) ? <CompleteAssessment id={a.id} /> : null}{a.student ? <Link className="underline" href={`/dashboard/platform/students/${a.student.id}`}>Learning plan</Link> : null}</div></Td></tr>)}</DataTable> : <Empty>No assessments yet.</Empty>}</Section>}
  </div></PageContainer>
}
