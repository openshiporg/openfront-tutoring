import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Input } from '@/components/ui/input'
import { DataTable, Empty, Notice, PageHeader, Pill, Section, Td, selectClass } from '@/features/platform/lib/ui'
import { getTasks } from '../actions/tasks'
import { TaskForm } from '../components/TaskForm'
export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams
  const r = await getTasks(p.status ?? 'open', p.kind ?? '')
  return <PageContainer title="Tasks" breadcrumbs={[{ type: 'page', label: 'Tasks' }]}><div className="grid gap-5 p-4 md:p-6">
    <PageHeader title="Tasks" meta="Follow-ups and exceptions from daily operations." />
    <form className="flex flex-wrap gap-3"><select className={selectClass + ' max-w-40'} name="status" defaultValue={p.status ?? 'open'}><option value="open">Open</option><option value="done">Done</option><option value="dismissed">Dismissed</option><option value="">All</option></select><Input className="max-w-64" name="kind" aria-label="Task kind" placeholder="Kind, e.g. failed_payment" defaultValue={p.kind} /><Pill type="submit">Filter</Pill></form>
    {!r.ok ? <Notice tone="alert">{r.error}</Notice> : <Section title="Follow-up list" count={r.data.tasks.length}>{r.data.tasks.length ? <DataTable label="Tasks" head={[{ label: 'Task' }, { label: 'Family' }, { label: 'Due' }, { label: 'Owner / outcome' }, { label: 'Action' }]}>{r.data.tasks.map(t => <tr key={t.id}><Td>{t.title}<p className="text-xs text-muted-foreground">{t.kind} · {t.status}</p></Td><Td>{t.family ? <Link className="underline" href={`/dashboard/platform/families/${t.family.id}`}>{t.family.name}</Link> : '—'}</Td><Td>{t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 10) : '—'}</Td><Td>{t.owner?.name || 'Unassigned'}<p>{t.outcomeNote}</p></Td><Td>{t.status === 'open' ? <TaskForm id={t.id} /> : '—'}</Td></tr>)}</DataTable> : <Empty>No matching tasks.</Empty>}</Section>}
  </div></PageContainer>
}
