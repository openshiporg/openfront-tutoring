import Link from 'next/link'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { basePath } from '@/features/dashboard/lib/config'
import { DataTable, Empty, PageHeader, Readouts, Restricted, Section, StatusCell, StatusTabs, Tag, Td, Track } from '@/features/platform/lib/ui'
import { getFamily } from '../actions/families'
import {
  ChangePlan, CompleteTask, EditFamily, EndMembership, GoodwillCredit, LogContact, ModerateReview, OfflinePayment,
  PauseMembership, RecordReview, RefundPayment, StudentDrawer,
} from '../components/FamilyForms'
import { dateOnly, dateTime, hours, label, money, toneFor } from '../lib/format'

type PageProps = { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }
const TABS = ['overview', 'children', 'credits', 'billing', 'contact', 'tasks', 'reviews'] as const
type TabKey = (typeof TABS)[number]

export default async function FamilyPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const sp = searchParams ? await searchParams : {}
  const tab: TabKey = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as TabKey) : 'overview'
  const res = await getFamily(id)
  const crumbs = [
    { type: 'link' as const, label: 'Dashboard', href: basePath },
    { type: 'link' as const, label: 'Families', href: '/dashboard/platform/families' },
    { type: 'page' as const, label: res.ok ? res.data.platformFamily?.family?.name ?? 'Family' : 'Family' },
  ]
  if (!res.ok || !res.data.platformFamily) {
    return (
      <PageContainer title="Family" header={<PageHeader title="Family" />} breadcrumbs={crumbs}>
        <div className="px-4 md:px-6"><Alert variant="destructive"><AlertDescription>{res.ok ? 'That family was not found.' : res.error}</AlertDescription></Alert></div>
      </PageContainer>
    )
  }
  const { platformFamily: pf, locations, levels, programs, tutors } = res.data
  const plans = res.data.membershipPlans ?? []
  const f = pf.family
  const cur: string = pf.currency
  const tz: string = pf.timezone
  const at = (v: string) => dateTime(v, tz)
  const openTasks = (pf.tasks as any[]).filter((t) => t.status === 'open')
  const activeMinutes = (pf.grants ?? []).filter((g: any) => g.status === 'active' && !g.unlimited).reduce((a: number, g: any) => a + (g.minutesAvailable ?? 0), 0)
  const owed = (pf.invoices ?? []).filter((i: any) => ['open', 'past_due'].includes(i.status)).reduce((a: number, i: any) => a + Math.max(0, i.total - i.amountPaid - i.amountCredited), 0)
  const header = (
    <PageHeader
      title={f.name}
      tone={f.status === 'active' ? 'live' : 'off'}
      meta={[f.primaryLocation?.name ?? 'Online / in-home', f.billingEmail, f.phone].filter(Boolean).join(' · ')}
      actions={<Track wrap><LogContact familyId={f.id} tasks={openTasks.map((t) => ({ id: t.id, title: t.title }))} /><EditFamily f={f} locations={locations} canBilling={pf.can.manageBilling} /></Track>}
    />
  )
  const tabHref = (t: string) => `/dashboard/platform/families/${f.id}${t === 'overview' ? '' : `?tab=${t}`}`

  return (
    <PageContainer title={f.name} header={header} breadcrumbs={crumbs}>
      <div className="grid gap-6 px-4 pb-10 md:px-6">
        <Readouts items={[
          { label: 'Children', value: f.students.length },
          { label: 'Upcoming sessions', value: pf.upcoming.length },
          { label: 'Credit available', value: pf.billing ? hours(activeMinutes) : '—' },
          { label: 'Owed', value: pf.billing ? money(owed, cur) : '—', tone: owed > 0 ? 'wait' : undefined },
          { label: 'Open tasks', value: openTasks.length, tone: openTasks.length ? 'info' : undefined },
        ]} />
        <StatusTabs label="Family sections" current={tab} hrefFor={tabHref} tabs={[
          { value: 'overview', label: 'Overview' }, { value: 'children', label: 'Children', count: f.students.length },
          { value: 'credits', label: 'Credits' }, { value: 'billing', label: 'Memberships and invoices' },
          { value: 'contact', label: 'Messages and contact', count: pf.messages.length }, { value: 'tasks', label: 'Tasks', count: openTasks.length },
          { value: 'reviews', label: 'Reviews', count: pf.reviews.length },
        ]} />

        {tab === 'overview' ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="Guardians" count={f.guardians.length}>
              {f.guardians.length ? (
                <ul className="grid gap-2 text-sm">{f.guardians.map((g: any) => <li key={g.id}><span className="font-medium">{g.name}</span> · {g.email}{g.phone ? ` · ${g.phone}` : ''}<span className="block text-xs text-muted-foreground">{g.lastLoginAt ? `Last signed in ${at(g.lastLoginAt)}` : 'Has not signed in yet'}</span></li>)}</ul>
              ) : <Empty>No guardian has an account yet. They can register at the storefront with {f.billingEmail || 'their email'}.</Empty>}
              {f.secondGuardianName ? <p className="mt-3 text-sm">Second guardian: {[f.secondGuardianName, f.secondGuardianEmail, f.secondGuardianPhone].filter(Boolean).join(' · ')}</p> : null}
              <dl className="mt-4 grid grid-cols-[10rem_1fr] gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Address</dt><dd>{[f.addressLine1, f.addressLine2, [f.city, f.region, f.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}</dd>
                <dt className="text-muted-foreground">Pay as you go</dt><dd>{f.payAsYouGoAllowed ? 'Allowed' : 'Not allowed'}</dd>
                <dt className="text-muted-foreground">Card on file</dt><dd>{f.defaultPaymentMethodLabel || 'None'}</dd>
                <dt className="text-muted-foreground">Family since</dt><dd>{dateOnly(f.createdAt)}</dd>
              </dl>
              {f.notes ? <p className="mt-4 whitespace-pre-wrap rounded-[6px] border bg-muted/40 p-3 text-sm"><span className="block text-xs font-medium text-muted-foreground">Staff notes</span>{f.notes}</p> : null}
            </Section>
            <Section title="Coming up" count={pf.upcoming.length}>
              {pf.upcoming.length ? (
                <ul className="grid gap-2 text-sm">{pf.upcoming.map((b: any) => <li key={b.id}><span className="font-medium">{at(b.startsAt)}</span> · {b.student?.firstName} · {b.session?.program?.name}{b.session?.tutor ? ` with ${b.session.tutor.displayName}` : ''}<span className="block text-xs text-muted-foreground">{b.session?.location?.name ?? label(b.session?.mode)}</span></li>)}</ul>
              ) : <Empty>Nothing booked.</Empty>}
            </Section>
          </div>
        ) : null}

        {tab === 'children' ? (
          <Section title="Children" count={f.students.length} actions={<StudentDrawer familyId={f.id} levels={levels} />}>
            {f.students.length ? (
              <div className="grid gap-4">
                {f.students.map((s: any) => (
                  <div key={s.id} className="rounded-[6px] border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <Link href={`/dashboard/platform/students/${s.id}`} className="font-semibold underline-offset-4 hover:underline">{s.firstName} {s.lastName}</Link>
                        <p className="text-sm text-muted-foreground">{[s.level?.name, s.school, s.dateOfBirth ? `born ${dateOnly(s.dateOfBirth)}` : ''].filter(Boolean).join(' · ') || 'No details yet'}</p>
                      </div>
                      <Track><StatusCell tone={toneFor(s.status)}>{label(s.status)}</StatusCell><StudentDrawer familyId={f.id} student={s} levels={levels} /></Track>
                    </div>
                    {s.learningNotes ? <p className="mt-2 text-sm"><span className="text-muted-foreground">Learning: </span>{s.learningNotes}</p> : null}
                    {s.medicalNotes ? <p className="mt-1 text-sm"><span className="text-muted-foreground">Medical: </span>{s.medicalNotes}</p> : null}
                    {Array.isArray(s.pickupPeople) && s.pickupPeople.length ? <p className="mt-1 text-sm"><span className="text-muted-foreground">Collected by: </span>{s.pickupPeople.map((p: any) => [p.name, p.relation, p.phone].filter(Boolean).join(', ')).join('; ')}</p> : null}
                    {s.enrolments.length ? (
                      <DataTable className="mt-3" label={`${s.firstName}'s enrolments`} head={[{ label: 'Programme' }, { label: 'Centre' }, { label: 'Tutor' }, { label: 'Status' }, { label: 'Since' }]}>
                        {s.enrolments.map((e: any) => (
                          <tr key={e.id}>
                            <Td>{e.program?.name}<span className="block text-xs text-muted-foreground">{label(e.mode)} · {label(e.fundingType)}</span></Td>
                            <Td>{e.location?.name ?? '—'}</Td>
                            <Td>{e.tutor?.displayName ?? <span className="text-muted-foreground">Not matched</span>}{e.rematchCount ? <span className="block text-xs text-muted-foreground">{e.rematchCount} re-match{e.rematchCount === 1 ? '' : 'es'}</span> : null}</Td>
                            <Td><StatusCell tone={toneFor(e.status)}>{label(e.status)}</StatusCell></Td>
                            <Td>{e.startDate ? dateOnly(e.startDate) : '—'}</Td>
                          </tr>
                        ))}
                      </DataTable>
                    ) : <p className="mt-2 text-sm text-muted-foreground">Not enrolled.</p>}
                  </div>
                ))}
              </div>
            ) : <Empty>No children on this family yet.</Empty>}
          </Section>
        ) : null}

        {tab === 'credits' ? (
          !pf.billing ? <Restricted>Credits are visible to staff who manage billing at this centre.</Restricted> : (
            <Section title="Credit ledger" count={pf.grants.length} actions={<GoodwillCredit familyId={f.id} students={f.students} programs={programs} />}>
              {pf.grants.length ? (
                <div className="grid gap-4">
                  {pf.grants.map((g: any) => (
                    <div key={g.id} className="rounded-[6px] border">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2 text-sm">
                        <span><span className="font-medium">{label(g.kind)}</span>{g.student ? ` · ${g.student.firstName}` : ''}{g.program ? ` · ${g.program.name}` : ''}</span>
                        <span className="flex items-center gap-3"><span className="tabular-nums">{g.unlimited ? `Unlimited${g.weeklyCap ? `, ${g.weeklyCap} a week` : ''}` : `${hours(g.minutesAvailable)} of ${hours(g.minutesGranted)} left`}</span>{g.expiresAt ? <span className="text-xs text-muted-foreground">use by {dateOnly(g.expiresAt)}</span> : null}<StatusCell tone={toneFor(g.status)}>{label(g.status)}</StatusCell></span>
                      </div>
                      <table className="w-full text-sm" aria-label="Ledger entries">
                        <tbody>{g.entries.map((e: any) => (
                          <tr key={e.id} className="border-b last:border-0"><td className="px-3 py-1.5 text-muted-foreground">{at(e.createdAt)}</td><td className="px-3 py-1.5">{label(e.type)}</td><td className="px-3 py-1.5 text-right tabular-nums">{e.minutes > 0 ? '+' : ''}{hours(e.minutes)}</td><td className="px-3 py-1.5 text-muted-foreground">{e.note}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : <Empty>No credit yet. Credit is added when a membership period starts or a package is paid.</Empty>}
            </Section>
          )
        ) : null}

        {tab === 'billing' ? (
          !pf.billing ? <Restricted>Memberships and invoices are visible to staff who manage billing at this centre.</Restricted> : (
            <div className="grid gap-8">
              <Section title="Memberships" count={pf.memberships.length}>
                {pf.memberships.length ? (
                  <DataTable label="Memberships" head={[{ label: 'Plan' }, { label: 'Price', className: 'text-right' }, { label: 'Period' }, { label: 'Status' }, { label: '' }]}>
                    {pf.memberships.map((m: any) => {
                      const live = ['active', 'past_due', 'paused'].includes(m.status)
                      return (
                        <tr key={m.id}>
                          <Td>{m.plan?.name}<span className="block text-xs text-muted-foreground">{m.student?.firstName}{m.pendingPlan ? ` · moves to ${m.pendingPlan.name} at renewal` : ''}</span></Td>
                          <Td className="text-right tabular-nums">{money(Math.round(m.price * (100 - (m.discountPercent ?? 0)) / 100), cur)}{m.discountPercent ? <span className="block text-xs text-muted-foreground">{m.discountPercent}% off</span> : null}</Td>
                          <Td>{m.currentPeriodStart ? `${dateOnly(m.currentPeriodStart)} – ${dateOnly(m.currentPeriodEnd)}` : '—'}{m.pausedFrom ? <span className="block text-xs text-muted-foreground">paused {dateOnly(m.pausedFrom)} – {dateOnly(m.pausedUntil)}</span> : null}{m.endsAt ? <span className="block text-xs text-muted-foreground">ends {dateOnly(m.endsAt)}</span> : null}</Td>
                          <Td><StatusCell tone={toneFor(m.status)}>{label(m.status)}</StatusCell></Td>
                          <Td>{live ? <Track wrap><PauseMembership familyId={f.id} membershipId={m.id} /><ChangePlan familyId={f.id} membershipId={m.id} plans={plans.filter((p) => p.id !== m.plan?.id && p.program?.id === m.plan?.programId)} /><EndMembership familyId={f.id} membershipId={m.id} /></Track> : null}</Td>
                        </tr>
                      )
                    })}
                  </DataTable>
                ) : <Empty>No memberships.</Empty>}
              </Section>
              <Section title="Invoices" count={pf.invoices.length}>
                {pf.invoices.length ? (
                  <DataTable label="Invoices" head={[{ label: 'Invoice' }, { label: 'Issued' }, { label: 'Total', className: 'text-right' }, { label: 'Paid', className: 'text-right' }, { label: 'Status' }, { label: 'Payments' }]}>
                    {pf.invoices.map((i: any) => {
                      const due = Math.max(0, i.total - i.amountPaid - i.amountCredited)
                      return (
                        <tr key={i.id}>
                          <Td>#{i.number ?? '—'}<span className="block text-xs text-muted-foreground">{label(i.kind)}</span></Td>
                          <Td>{i.issuedAt ? dateOnly(i.issuedAt) : '—'}{i.dueAt ? <span className="block text-xs text-muted-foreground">due {dateOnly(i.dueAt)}</span> : null}</Td>
                          <Td className="text-right tabular-nums">{money(i.total, i.currency)}</Td>
                          <Td className="text-right tabular-nums">{money(i.amountPaid, i.currency)}{i.amountCredited ? <span className="block text-xs text-muted-foreground">{money(i.amountCredited, i.currency)} credited</span> : null}</Td>
                          <Td><StatusCell tone={toneFor(i.status)}>{label(i.status)}</StatusCell>{due > 0 && ['open', 'past_due'].includes(i.status) ? <div className="mt-1"><OfflinePayment familyId={f.id} invoiceId={i.id} due={due} /></div> : null}</Td>
                          <Td>
                            {i.payments.length ? (
                              <ul className="grid gap-1">{i.payments.map((p: any) => (
                                <li key={p.id} className="flex flex-wrap items-center gap-2 text-xs"><span className="tabular-nums">{money(p.amount, i.currency)}</span><Tag>{label(p.method)}</Tag><span className="text-muted-foreground">{dateOnly(p.createdAt)}{p.refundedAmount ? ` · ${money(p.refundedAmount, i.currency)} refunded` : ''}</span>
                                  {pf.can.issueRefunds && p.amount - (p.refundedAmount ?? 0) > 0 && ['captured', 'partially_refunded'].includes(p.status) ? <RefundPayment familyId={f.id} paymentId={p.id} max={p.amount - (p.refundedAmount ?? 0)} /> : null}
                                </li>
                              ))}</ul>
                            ) : <span className="text-xs text-muted-foreground">None</span>}
                          </Td>
                        </tr>
                      )
                    })}
                  </DataTable>
                ) : <Empty>No invoices.</Empty>}
              </Section>
            </div>
          )
        ) : null}

        {tab === 'contact' ? (
          <Section title="Messages and contact log" count={pf.messages.length} actions={<LogContact familyId={f.id} tasks={openTasks.map((t) => ({ id: t.id, title: t.title }))} />}>
            {pf.messages.length ? (
              <ul className="grid gap-3">{pf.messages.map((m: any) => (
                <li key={m.id} className="rounded-[6px] border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Tag>{label(m.channel)}</Tag><span>{label(m.direction)}</span><span>{at(m.createdAt)}</span>{m.sender ? <span>by {m.sender.name}</span> : null}{m.visibleToFamily ? <span>· sent to family</span> : <span>· staff only</span>}</div>
                  {m.subject ? <p className="mt-1 font-medium">{m.subject}</p> : null}
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}</ul>
            ) : <Empty>No messages or contact logged yet.</Empty>}
          </Section>
        ) : null}

        {tab === 'tasks' ? (
          <Section title="Tasks" count={pf.tasks.length}>
            {pf.tasks.length ? (
              <DataTable label="Tasks" head={[{ label: 'Task' }, { label: 'Due' }, { label: 'Owner' }, { label: 'Status' }, { label: '' }]}>
                {pf.tasks.map((t: any) => (
                  <tr key={t.id}>
                    <Td>{t.title}<span className="block text-xs text-muted-foreground">{label(t.kind)}{t.student ? ` · ${t.student.firstName}` : ''}{t.outcomeNote ? ` · ${t.outcomeNote}` : ''}</span></Td>
                    <Td>{t.dueAt ? dateOnly(t.dueAt) : '—'}</Td>
                    <Td>{t.owner?.name ?? '—'}</Td>
                    <Td><StatusCell tone={t.status === 'open' ? (t.dueAt && new Date(t.dueAt) < new Date() ? 'alert' : 'info') : 'off'}>{label(t.status)}</StatusCell></Td>
                    <Td>{t.status === 'open' ? <CompleteTask familyId={f.id} taskId={t.id} title={t.title} /> : null}</Td>
                  </tr>
                ))}
              </DataTable>
            ) : <Empty>No tasks for this family.</Empty>}
          </Section>
        ) : null}

        {tab === 'reviews' ? (
          <Section title="Reviews" count={pf.reviews.length} actions={<RecordReview familyId={f.id} defaultLocationId={f.primaryLocation?.id} tutors={tutors} locations={locations} programs={programs} defaultName={f.guardians[0] ? `${f.guardians[0].name.split(' ')[0]} ${(f.guardians[0].name.split(' ').slice(-1)[0] ?? '')[0] ?? ''}., parent` : ''} />}>
            {pf.reviews.length ? (
              <ul className="grid gap-3">{pf.reviews.map((r: any) => (
                <li key={r.id} className="rounded-[6px] border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{'★'.repeat(r.rating)}<span className="text-muted-foreground">{'★'.repeat(5 - r.rating)}</span> <span className="ml-2 font-normal">{r.authorName}</span></span>
                    <span className="flex items-center gap-2"><StatusCell tone={r.status === 'published' ? 'live' : r.status === 'hidden' ? 'off' : 'wait'}>{label(r.status)}</StatusCell>{pf.can.owner ? <ModerateReview familyId={f.id} reviewId={r.id} status={r.status} /> : null}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{r.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{label(r.source)} · {dateOnly(r.createdAt)}{r.tutor ? ` · about ${r.tutor.displayName}` : ''}</p>
                </li>
              ))}</ul>
            ) : <Empty>No reviews recorded.</Empty>}
            {!pf.can.owner && pf.reviews.some((r: any) => r.status === 'pending') ? <p className="mt-3 text-xs text-muted-foreground">The owner publishes or hides reviews.</p> : null}
          </Section>
        ) : null}
      </div>
    </PageContainer>
  )
}

