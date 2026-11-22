import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, PillLink, Readouts, Section, StatusCell, Tag, Td, Track } from '@/features/platform/lib/ui'
import { dateOnly, dateTime, label, toneFor } from '@/features/platform/families/lib/format'
import { getStudent } from '../actions/students'
import { GoalStatus, HomeworkStatus, PlanDrawer, SessionReportDrawer } from '../components/StudentForms'

type PageProps = { params: Promise<{ id: string }> }
const PRESENT = ['attended', 'late']
const FINISHED = ['attended', 'late', 'no_show', 'cancelled_late', 'cancelled_late_excused']

export default async function StudentPage({ params }: PageProps) {
  const { id } = await params
  const res = await getStudent(id)
  const st = res.ok ? res.data.student : null
  const crumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'link' as const, label: 'Students', href: '/dashboard/platform/students' },
    { type: 'page' as const, label: st ? `${st.firstName} ${st.lastName}` : 'Student' },
  ]
  if (!res.ok || !st) {
    return (
      <PageContainer title="Student" header={<PageHeader title="Student" />} breadcrumbs={crumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.ok ? 'That student was not found, or is not at one of your centres.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const { programs, progressReports } = res.data
  const tz: string = st.family?.primaryLocation?.timezone || 'UTC'
  const at = (v: string) => dateTime(v, tz)
  const live = st.plans.find((p: any) => ['proposed', 'accepted', 'active'].includes(p.status))
  const draftOrDeclined = st.plans.find((p: any) => ['draft', 'declined'].includes(p.status))
  const current = live ?? draftOrDeclined
  const older = st.plans.filter((p: any) => p !== current)
  const finished = st.bookings.filter((b: any) => FINISHED.includes(b.status))
  const present = finished.filter((b: any) => PRESENT.includes(b.status)).length
  const mastered = current ? current.goals.filter((g: any) => g.status === 'mastered').length : 0
  const enrolledProgram = st.enrolments.find((e: any) => ['matched', 'active', 'paused', 'pending_match'].includes(e.status))?.program?.id
  const completedAssessments = st.assessments.filter((a: any) => a.status === 'completed' && a.results.length)

  const header = (
    <PageHeader
      title={`${st.firstName} ${st.lastName}`}
      tone={toneFor(st.status)}
      meta={[st.level?.name, st.school, st.family?.name].filter(Boolean).join(' · ')}
      actions={<Track wrap>{st.family ? <PillLink href={`/dashboard/platform/families/${st.family.id}?tab=children`}>Family and details</PillLink> : null}{!current ? <PlanDrawer studentId={st.id} programs={programs} programId={enrolledProgram} /> : null}</Track>}
    />
  )

  return (
    <PageContainer title={`${st.firstName} ${st.lastName}`} header={header} breadcrumbs={crumbs}>
      <div className="grid gap-8 px-4 pb-10 md:px-6">
        <Readouts items={[
          { label: 'Attendance', value: finished.length ? `${Math.round((present / finished.length) * 100)}%` : '—' },
          { label: 'Sessions attended', value: present },
          { label: 'Goals mastered', value: current ? `${mastered} of ${current.goals.length}` : '—' },
          { label: 'Progress reports', value: progressReports.length },
        ]} />
        {st.medicalNotes ? <p className="rounded-[6px] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><span className="font-medium">Medical: </span>{st.medicalNotes}</p> : null}

        <Section title="Learning plan" actions={current ? <PlanDrawer studentId={st.id} plan={current} programs={programs} /> : null}>
          {current ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusCell tone={current.status === 'declined' ? 'alert' : current.status === 'proposed' || current.status === 'draft' ? 'wait' : 'live'}>{label(current.status)}</StatusCell>
                <span className="text-muted-foreground">Version {current.version} · {current.program?.name}{current.sessionsPerWeek ? ` · ${current.sessionsPerWeek} a week` : ''}{current.totalHours ? ` · ${current.totalHours} h` : ''}{current.targetDate ? ` · target ${dateOnly(current.targetDate)}` : ''}</span>
              </div>
              {current.status === 'declined' && current.declineReason ? <p className="text-sm"><span className="text-muted-foreground">The family declined: </span>{current.declineReason}</p> : null}
              {current.summary ? <p className="whitespace-pre-wrap text-sm">{current.summary}</p> : null}
              <DataTable label="Goals" head={[{ label: 'Goal' }, { label: 'Baseline' }, { label: 'Target' }, { label: 'Status' }]}>
                {current.goals.map((g: any) => (
                  <tr key={g.id}>
                    <Td>{g.title}{g.skill ? <span className="block text-xs text-muted-foreground">{g.skill}</span> : null}</Td>
                    <Td>{g.baseline || '—'}</Td>
                    <Td>{g.target || '—'}</Td>
                    <Td>{['accepted', 'active'].includes(current.status) ? <GoalStatus studentId={st.id} goalId={g.id} status={g.status} /> : <StatusCell tone={toneFor(g.status)}>{label(g.status)}</StatusCell>}{g.masteredAt ? <span className="block text-xs text-muted-foreground">{dateOnly(g.masteredAt)}</span> : null}</Td>
                  </tr>
                ))}
              </DataTable>
              {older.length ? <p className="text-xs text-muted-foreground">Earlier versions: {older.map((p: any) => `v${p.version} (${label(p.status)})`).join(', ')}</p> : null}
            </div>
          ) : <Empty>No learning plan yet. Draft one with goals from the assessment, then propose it to the family.</Empty>}
        </Section>

        <Section title="Assessments compared" count={completedAssessments.length}>
          {completedAssessments.length ? (() => {
            const skills = [...new Set(completedAssessments.flatMap((a: any) => a.results.map((r: any) => r.skill as string)))] as string[]
            const cols = [...completedAssessments].reverse()
            return (
              <DataTable label="Assessment results by skill" head={[{ label: 'Skill' }, ...cols.map((a: any) => ({ label: `${label(a.kind)} ${dateOnly(a.completedAt ?? a.scheduledAt)}`, className: 'text-right' }))]}>
                {skills.map((sk) => (
                  <tr key={sk}>
                    <Td>{sk}</Td>
                    {cols.map((a: any) => { const r = a.results.find((x: any) => x.skill === sk); return <Td key={a.id} className="text-right tabular-nums">{r ? `${r.score}/${r.maxScore}${r.levelEquivalent ? ` · ${r.levelEquivalent}` : ''}` : '—'}</Td> })}
                  </tr>
                ))}
              </DataTable>
            )
          })() : <Empty>No completed assessment with results yet.</Empty>}
          {st.assessments.length ? <p className="mt-2 text-xs text-muted-foreground">All assessments: {st.assessments.map((a: any) => `${label(a.kind)} ${a.scheduledAt ? dateOnly(a.scheduledAt) : ''} (${label(a.status)})`).join(', ')}</p> : null}
        </Section>

        <Section title="Attendance and session reports" count={st.bookings.length}>
          {st.bookings.length ? (
            <DataTable label="Sessions" head={[{ label: 'Session' }, { label: 'Attendance' }, { label: 'Report' }, { label: '' }]}>
              {st.bookings.map((b: any) => {
                const r = b.reports[0]
                return (
                  <tr key={b.id}>
                    <Td>{at(b.startsAt)}<span className="block text-xs text-muted-foreground">{b.session?.program?.name}{b.session?.tutor ? ` · ${b.session.tutor.displayName}` : ''}{b.session?.isTrial ? ' · trial' : ''}</span></Td>
                    <Td><StatusCell tone={PRESENT.includes(b.status) ? 'live' : b.status === 'booked' ? 'info' : b.status === 'no_show' ? 'alert' : 'off'}>{label(b.status)}</StatusCell></Td>
                    <Td>{r ? (
                      <div className="max-w-md text-sm">
                        <p>{r.topicsCovered}</p>
                        {r.homework ? <p className="mt-1 text-xs text-muted-foreground">Homework: {r.homework}{r.homeworkStatus ? ` · ${label(r.homeworkStatus)}` : ''}</p> : null}
                        <p className="mt-1 text-xs text-muted-foreground">{r.publishedAt ? `Published ${dateOnly(r.publishedAt)}${r.guardianSeenAt ? ', seen by family' : ''}` : 'Draft'}{r.effort ? ` · effort ${r.effort}/5` : ''}</p>
                      </div>
                    ) : PRESENT.includes(b.status) ? <Tag tone="wait">Not written</Tag> : <span className="text-muted-foreground">—</span>}</Td>
                    <Td><Track wrap>{PRESENT.includes(b.status) ? <SessionReportDrawer studentId={st.id} bookingId={b.id} report={r} when={at(b.startsAt)} /> : null}{r?.homework && r.homeworkStatus === 'set' ? <HomeworkStatus studentId={st.id} reportId={r.id} status={r.homeworkStatus} /> : null}</Track></Td>
                  </tr>
                )
              })}
            </DataTable>
          ) : <Empty>No sessions booked yet.</Empty>}
        </Section>

        <Section title="Progress reports" count={progressReports.length} actions={<PillLink size="sm" href={`/dashboard/platform/progress?student=${st.id}`}>Open in Progress</PillLink>}>
          {progressReports.length ? (
            <ul className="grid gap-1 text-sm">{progressReports.map((p: any) => <li key={p.id}><Link className="underline-offset-4 hover:underline" href={`/dashboard/platform/progress/${p.id}`}>{dateOnly(p.periodStart)} – {dateOnly(p.periodEnd)}</Link> · {p.sessionsAttended} attended, {p.sessionsMissed} missed · <StatusCell tone={toneFor(p.status)}>{label(p.status)}</StatusCell>{p.acknowledgedAt ? <span className="text-xs text-muted-foreground"> · read by family</span> : null}</li>)}</ul>
          ) : <Empty>No progress reports yet.</Empty>}
        </Section>

        <Section title="Enrolments" count={st.enrolments.length}>
          {st.enrolments.length ? (
            <ul className="grid gap-1 text-sm">{st.enrolments.map((e: any) => <li key={e.id}>{e.program?.name} · {e.location?.name ?? label(e.mode)} · {e.tutor?.displayName ?? 'no tutor yet'} · <StatusCell tone={toneFor(e.status)}>{label(e.status)}</StatusCell>{e.startDate ? <span className="text-xs text-muted-foreground"> · since {dateOnly(e.startDate)}</span> : null}</li>)}</ul>
          ) : <Empty>Not enrolled.</Empty>}
        </Section>
      </div>
    </PageContainer>
  )
}
