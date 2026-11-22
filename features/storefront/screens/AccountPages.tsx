import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getBusiness, getMyBookings, getMyCredits, getMyFamily, getMyInvoice, getMyInvoices, getMyStudent, getOpenSessions, getViewer } from '../lib/data'
import { AccountNav } from '../components/AccountNav'
import { BookSeat, BuyPackage, CancelAssessment, CancelBooking, LeaveWaitlist, MoveBooking, SaveCard } from '../components/AccountActions'
import { PayInvoice } from '../components/PayInvoice'
import { Empty, LoadError, PageHead } from '../components/states'
import { MODE_LABEL, dateLong, dateOnly, dayKey, hoursFromMinutes, label, money, statusText, time, when } from '../lib/format'

type SP = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

/** Signed-in guardian with a family, or a redirect. */
async function guardian(next: string) {
  const viewer = await getViewer()
  if (!viewer) redirect(`/account/sign-in?next=${encodeURIComponent(next)}`)
  const fam = await getMyFamily()
  return { viewer, fam: fam.value, error: fam.error }
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="bp-body">
      <div className="bp-wrap bp-account">
        <AccountNav />
        <div>{children}</div>
      </div>
    </section>
  )
}

function NoFamily({ isStaff }: { isStaff: boolean }) {
  return (
    <Empty title={isStaff ? 'This is a staff account' : 'No family is linked to this account yet'}>
      {isStaff ? <>Use the <Link className="bp-accent" href="/dashboard">dashboard</Link>.</> : <>Book an <Link className="bp-accent" href="/assessment">assessment</Link> or <Link className="bp-accent" href="/programs">enrol in a program</Link> to set it up.</>}
    </Empty>
  )
}

function SessionRow({ s, tz, children, sub }: { s: any; tz: string; children?: React.ReactNode; sub?: React.ReactNode }) {
  const zone = s.location?.timezone || tz
  return (
    <div className="bp-session">
      <div className="bp-session-time">{time(s.startsAt, zone)}<small>{dateLong(s.startsAt, zone)}</small></div>
      <div>
        <h3>{s.program?.name ?? 'Session'}{s.subject?.name ? ` · ${s.subject.name}` : ''}</h3>
        <p>{[s.location?.name ?? MODE_LABEL[s.mode], s.room?.name, s.tutor?.displayName ? `with ${s.tutor.displayName}` : null].filter(Boolean).join(' · ')}</p>
        {sub ? <p>{sub}</p> : null}
      </div>
      <div className="bp-session-actions">{children}</div>
    </div>
  )
}

// ---------------------------------------------------------------- overview (§6.2 A1)
export async function AccountOverviewPage() {
  const { viewer, fam, error } = await guardian('/account')
  const business = await getBusiness()
  const currency = business?.currency || 'USD'
  if (error) return <><PageHead title="My account" /><AccountShell><LoadError /></AccountShell></>
  const f = fam?.family
  return (
    <>
      <PageHead title={`Hello, ${viewer.name?.split(' ')[0] || 'there'}`} lead={f?.name} />
      <AccountShell>
        {!f ? <NoFamily isStaff={Boolean(fam?.user?.isStaff)} /> : (
          <>
            {f.alerts.length ? (
              <div className="bp-alerts">
                {f.alerts.map((a: any, i: number) => <Link key={i} className={`bp-notice ${a.kind === 'payment_failed' ? 'is-error' : 'is-accent'}`} href={a.href}><span>{a.message}</span><span className="bp-strong">View</span></Link>)}
              </div>
            ) : null}

            <div className="bp-account-section">
              <h2>Coming up</h2>
              {f.assessments.length || f.upcoming.length ? (
                <div className="bp-sessions">
                  {f.assessments.map((a: any) => (
                    <div className="bp-session" key={a.id}>
                      <div className="bp-session-time">{time(a.scheduledAt, a.location?.timezone || 'America/Chicago')}<small>{dateLong(a.scheduledAt, a.location?.timezone || 'America/Chicago')}</small></div>
                      <div><h3>{a.program?.name} assessment</h3><p>{a.student?.firstName} · {a.location?.name ?? MODE_LABEL[a.mode]}</p></div>
                      <div className="bp-session-actions"><Link className="bp-btn is-small" href={`/assessment/confirmed/${a.id}`}>Details</Link></div>
                    </div>
                  ))}
                  {f.upcoming.slice(0, 5).map((b: any) => <SessionRow key={b.id} s={b.session} tz="America/Chicago" sub={b.student?.firstName} />)}
                </div>
              ) : <Empty title="Nothing booked yet">Book from <Link className="bp-accent" href="/account/book">open sessions</Link>.</Empty>}
              <p style={{ marginTop: 12 }}><Link className="bp-accent" href="/account/schedule">Full schedule</Link></p>
            </div>

            <div className="bp-account-section">
              <h2>Students</h2>
              {f.students.length ? (
                <div className="bp-prices">
                  {f.students.map((s: any) => (
                    <div className="bp-price" key={s.id}>
                      <h3>{s.firstName} {s.lastName}</h3>
                      <p className="bp-small bp-muted">{[s.level?.name, s.school].filter(Boolean).join(' · ') || ' '}</p>
                      <p className="bp-small">{hoursFromMinutes(s.minutesAvailable)} of credit</p>
                      {s.enrolments.length ? <ul>{s.enrolments.map((e: any) => <li key={e.id}>{e.program?.name}: {statusText(e.status)}{e.tutor ? `, ${e.tutor.displayName}` : ''}</li>)}</ul> : <p className="bp-small bp-muted">Not enrolled yet.</p>}
                      <Link className="bp-btn is-small" href={`/account/progress?student=${s.id}`}>Progress</Link>
                    </div>
                  ))}
                </div>
              ) : <Empty title="No students yet">Book an <Link className="bp-accent" href="/assessment">assessment</Link> to add your child.</Empty>}
            </div>

            {f.memberships.length ? (
              <div className="bp-account-section">
                <h2>Memberships</h2>
                <table className="bp-table">
                  <thead><tr><th>Plan</th><th>Student</th><th>Status</th><th className="num">Monthly</th><th>Renews</th></tr></thead>
                  <tbody>{f.memberships.map((m: any) => <tr key={m.id}><td>{m.planName}<div className="bp-small bp-muted">{m.programName}</div></td><td>{m.studentName}</td><td className={['past_due', 'suspended'].includes(m.status) ? 'bp-status is-warn' : ''}>{statusText(m.status)}</td><td className="num">{money(m.price, currency)}</td><td>{m.currentPeriodEnd ? dateOnly(m.currentPeriodEnd) : ''}</td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
      </AccountShell>
    </>
  )
}

// ---------------------------------------------------------------- schedule (A5–A9)
export async function AccountSchedulePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const past = one(sp.view) === 'past'
  const { fam } = await guardian('/account/schedule')
  const r = await getMyBookings(past)
  const v = r.value
  const tz = v?.timezone || 'America/Chicago'
  // Alternatives for "Move": the next two weeks of the same programme's open sessions.
  const programIds = Array.from(new Set<string>((v?.upcoming ?? []).map((b: any) => b.session?.program?.id).filter(Boolean)))
  const open = await Promise.all(programIds.map((p) => getOpenSessions({ programId: p })))
  const alt = new Map<string, any[]>(programIds.map((p, i) => [p, open[i].value?.sessions ?? []]))
  return (
    <>
      <PageHead title="Schedule" lead="Sessions, waitlists and assessments for everyone in your family." />
      <AccountShell>
        <nav className="bp-tabs" aria-label="Schedule view">
          <Link href="/account/schedule" aria-current={!past ? 'page' : undefined}>Upcoming</Link>
          <Link href="/account/schedule?view=past" aria-current={past ? 'page' : undefined}>Past</Link>
        </nav>
        {!fam?.family ? <NoFamily isStaff={Boolean(fam?.user?.isStaff)} /> : !v ? <LoadError /> : (
          <>
            {!past && v.assessments.length ? (
              <div className="bp-account-section">
                <h2>Assessments</h2>
                <div className="bp-sessions">
                  {v.assessments.map((a: any) => {
                    const zone = a.location?.timezone || tz
                    return (
                      <div className="bp-session" key={a.id}>
                        <div className="bp-session-time">{a.scheduledAt ? time(a.scheduledAt, zone) : 'To confirm'}<small>{a.scheduledAt ? dateLong(a.scheduledAt, zone) : ''}</small></div>
                        <div><h3>{a.program?.name} assessment</h3><p>{a.student?.firstName} · {a.location?.name ?? MODE_LABEL[a.mode]} · {statusText(a.status)}</p></div>
                        <div className="bp-session-actions">
                          <Link className="bp-btn is-small" href={`/assessment/confirmed/${a.id}`}>Details</Link>
                          {a.status === 'scheduled' ? <CancelAssessment assessmentId={a.id} note={a.fee ? 'Cancelling at least 24 hours ahead refunds the fee; later cancellations keep it.' : 'You can book another time any time.'} /> : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="bp-account-section">
              <h2>{past ? 'Past sessions' : 'Sessions'}</h2>
              {(past ? v.past : v.upcoming).length ? (
                <div className="bp-sessions">
                  {(past ? v.past : v.upcoming).map((b: any) => (
                    <SessionRow key={b.id} s={b.session} tz={tz} sub={<>{b.student?.firstName} · {statusText(b.status)}</>}>
                      {b.joinUrl ? <a className="bp-btn is-small is-primary" href={b.joinUrl} target="_blank" rel="noreferrer">Join</a> : null}
                      {!past && b.status === 'booked' ? (
                        <>
                          <MoveBooking bookingId={b.id} timezone={b.session.location?.timezone || tz} options={(alt.get(b.session.program?.id) ?? []).filter((s: any) => s.id !== b.session.id && s.seatsLeft > 0 && s.mode === b.session.mode).slice(0, 20).map((s: any) => ({ id: s.id, startsAt: s.startsAt, seatsLeft: s.seatsLeft, label: s.location?.name ?? MODE_LABEL[s.mode] }))} />
                          <CancelBooking bookingId={b.id} />
                        </>
                      ) : null}
                    </SessionRow>
                  ))}
                </div>
              ) : <Empty title={past ? 'No past sessions yet' : 'No upcoming sessions'}>{past ? null : <>Book from <Link className="bp-accent" href="/account/book">open sessions</Link>.</>}</Empty>}
            </div>

            {!past && v.waitlist.length ? (
              <div className="bp-account-section">
                <h2>Waitlists</h2>
                <div className="bp-sessions">
                  {v.waitlist.map((w: any) => <SessionRow key={w.id} s={w.session} tz={tz} sub={<>{w.student?.firstName} · number {w.position} in line. We book the seat automatically if one opens.</>}><LeaveWaitlist entryId={w.id} /></SessionRow>)}
                </div>
              </div>
            ) : null}
          </>
        )}
      </AccountShell>
    </>
  )
}

// ---------------------------------------------------------------- book (A5)
export async function AccountBookPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const { fam } = await guardian('/account/book')
  const f = fam?.family
  const enrolledPrograms = new Set<string>((f?.students ?? []).flatMap((s: any) => s.enrolments.map((e: any) => e.program?.id)))
  const r = await getOpenSessions({})
  const all: any[] = r.value?.sessions ?? []
  const focus = one(sp.session)
  const sessions = all.filter((s) => s.id === focus || enrolledPrograms.has(s.program?.id))
  const students = (f?.students ?? []).map((s: any) => ({ id: s.id, firstName: s.firstName, programs: s.enrolments.map((e: any) => e.program?.id) }))
  const days = new Map<string, any[]>()
  sessions.forEach((s) => { const k = dayKey(s.startsAt, s.location?.timezone || r.value?.timezone || 'America/Chicago'); if (!days.has(k)) days.set(k, []); days.get(k)!.push(s) })
  return (
    <>
      <PageHead title="Book a session" lead="Open sessions in the programs your children are enrolled in. Each booking uses session credit." />
      <AccountShell>
        {!f ? <NoFamily isStaff={Boolean(fam?.user?.isStaff)} /> : !r.value ? <LoadError /> : !enrolledPrograms.size && !focus ? (
          <Empty title="Enrol first">Sessions open up once a child is enrolled. <Link className="bp-accent" href="/programs">See programs</Link>.</Empty>
        ) : !sessions.length ? <Empty title="No open sessions in the next two weeks">Check back soon or <Link className="bp-accent" href="/contact">ask us</Link>.</Empty> : (
          Array.from(days.entries()).map(([k, list]) => (
            <div className="bp-account-section" key={k}>
              <h2 style={{ fontSize: 20 }}>{dateLong(list[0].startsAt, list[0].location?.timezone || r.value.timezone)}</h2>
              <div className="bp-sessions">
                {list.map((s) => {
                  const eligible = students.filter((st: any) => st.programs.includes(s.program?.id))
                  return (
                    <SessionRow key={s.id} s={s} tz={r.value.timezone} sub={s.seatsLeft ? `${s.seatsLeft} seat${s.seatsLeft === 1 ? '' : 's'} left` : 'Full: join the waitlist'}>
                      <BookSeat sessionId={s.id} students={eligible.length ? eligible : students} full={!s.seatsLeft} />
                    </SessionRow>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </AccountShell>
    </>
  )
}

// ---------------------------------------------------------------- credits (A3)
export async function AccountCreditsPage() {
  const { fam } = await guardian('/account/credits')
  const [r, business] = await Promise.all([getMyCredits(), getBusiness()])
  const currency = business?.currency || 'USD'
  const students = (fam?.family?.students ?? []).map((s: any) => ({ id: s.id, firstName: s.firstName }))
  const active = (r.value?.grants ?? []).filter((g: any) => g.status === 'active')
  const old = (r.value?.grants ?? []).filter((g: any) => g.status !== 'active')
  return (
    <>
      <PageHead title="Hours and packages" lead="Session credit from memberships and packages, and every time it was used." />
      <AccountShell>
        {!fam?.family ? <NoFamily isStaff={Boolean(fam?.user?.isStaff)} /> : !r.value ? <LoadError /> : (
          <>
            <div className="bp-account-section">
              <h2>Current credit</h2>
              {active.length ? (
                <div className="bp-stats">
                  {active.map((g: any) => (
                    <div className="bp-stat" key={g.id}>
                      <b>{g.unlimited ? 'Unlimited' : hoursFromMinutes(g.minutesAvailable)}</b>
                      <span>{g.student?.firstName} · {g.program?.name ?? label(g.kind)}{g.unlimited && g.weeklyCap ? `, up to ${g.weeklyCap} a week` : ''}{g.expiresAt ? ` · use by ${dateOnly(g.expiresAt)}` : g.periodEnd ? ` · until ${dateOnly(g.periodEnd)}` : ''}</span>
                    </div>
                  ))}
                </div>
              ) : <Empty title="No credit right now">Buy a package below or enrol in a membership.</Empty>}
            </div>

            {r.value.packages.length ? (
              <div className="bp-account-section">
                <h2>Buy more hours</h2>
                <div className="bp-prices">
                  {r.value.packages.map((p: any) => (
                    <div className="bp-price" key={p.id}>
                      <h3>{p.name}</h3>
                      <div className="bp-price-amount">{money(p.price, currency)}</div>
                      <p className="bp-small bp-muted">{p.hours} hours · {p.program?.name}{p.expiryMonths ? ` · use within ${p.expiryMonths} months` : ''}</p>
                      {students.length ? <BuyPackage pkg={p} students={students} currency={currency} savedCard={fam?.family?.cardLabel ?? null} /> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="bp-account-section">
              <h2>History</h2>
              {[...active, ...old].some((g: any) => g.entries.length) ? (
                <table className="bp-table">
                  <thead><tr><th>Date</th><th>What</th><th>Student</th><th className="num">Hours</th></tr></thead>
                  <tbody>
                    {[...active, ...old].flatMap((g: any) => g.entries.map((e: any) => ({ ...e, g }))).sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 60).map((e: any) => (
                      <tr key={e.id}><td>{dateOnly(e.createdAt)}</td><td>{e.note || label(e.type)}{e.sessionProgram ? <div className="bp-small bp-muted">{e.sessionProgram}{e.sessionStartsAt ? `, ${dateOnly(e.sessionStartsAt)}` : ''}</div> : null}</td><td>{e.g.student?.firstName}</td><td className="num">{e.minutes > 0 ? '+' : ''}{Math.round((e.minutes / 60) * 10) / 10}</td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="bp-muted">No credit movements yet.</p>}
            </div>
          </>
        )}
      </AccountShell>
    </>
  )
}

// ---------------------------------------------------------------- billing (A2)
export async function AccountBillingPage() {
  const { fam } = await guardian('/account/billing')
  const r = await getMyInvoices()
  const rows: any[] = r.value ?? []
  const open = rows.filter((i) => ['open', 'partially_paid'].includes(i.status))
  return (
    <>
      <PageHead title="Billing" lead="Invoices, payments and your card on file." />
      <AccountShell>
        {!fam?.family ? <NoFamily isStaff={Boolean(fam?.user?.isStaff)} /> : !r.value ? <LoadError /> : (
          <>
            {open.length ? (
              <div className="bp-account-section">
                <h2>To pay</h2>
                <div className="bp-prices">
                  {open.map((i) => (
                    <div className="bp-price" key={i.id}>
                      <h3>Invoice {i.number}</h3>
                      <div className="bp-price-amount">{money(i.total - i.amountPaid - (i.amountCredited ?? 0), i.currency)}</div>
                      <p className="bp-small bp-muted">{label(i.kind)}{i.dueAt ? ` · due ${dateOnly(i.dueAt)}` : ''}</p>
                      <PayInvoice invoiceId={i.id} amount={i.total - i.amountPaid - (i.amountCredited ?? 0)} currency={i.currency} savedCard={fam.family.cardLabel} />
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="bp-notice is-ok" style={{ marginBottom: 24 }}>Nothing to pay right now.</div>}
            <div className="bp-account-section">
              <h2>Invoices</h2>
              {rows.length ? (
                <table className="bp-table">
                  <thead><tr><th>Number</th><th>Date</th><th>For</th><th>Status</th><th className="num">Total</th></tr></thead>
                  <tbody>{rows.map((i) => <tr key={i.id}><td><Link className="bp-accent" href={`/account/billing/invoices/${i.id}`}>{i.number}</Link></td><td>{dateOnly(i.issuedAt)}</td><td>{label(i.kind)}</td><td className={['open', 'partially_paid'].includes(i.status) ? 'bp-status is-warn' : ''}>{statusText(i.status)}</td><td className="num">{money(i.total, i.currency)}</td></tr>)}</tbody>
                </table>
              ) : <p className="bp-muted">No invoices yet.</p>}
            </div>
            <div className="bp-account-section">
              <h2>Card on file</h2>
              <SaveCard current={fam.family.cardLabel} />
            </div>
          </>
        )}
      </AccountShell>
    </>
  )
}

export async function AccountInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await guardian(`/account/billing/invoices/${id}`)
  const fam = (await getMyFamily()).value
  const r = await getMyInvoice(id)
  const i = r.value
  if (!i) notFound()
  const due = ['open', 'partially_paid'].includes(i.status) ? i.total - i.amountPaid - (i.amountCredited ?? 0) : 0
  return (
    <>
      <PageHead title={`Invoice ${i.number}`} lead={statusText(i.status)} crumbs={[{ href: '/account/billing', label: 'Billing' }]} />
      <AccountShell>
        <div className="bp-panel">
          <div className="bp-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div><p className="bp-strong">{i.business?.legalName || i.business?.name}</p><p className="bp-small bp-muted">{[i.business?.supportEmail, i.business?.phone].filter(Boolean).join(' · ')}</p></div>
            <div style={{ textAlign: 'right' }}><p className="bp-strong">{i.family?.name}</p><p className="bp-small bp-muted">{i.family?.billingEmail}</p></div>
          </div>
          <dl className="bp-dl" style={{ marginTop: 16 }}><dt>Issued</dt><dd>{dateOnly(i.issuedAt)}</dd>{i.dueAt ? (<><dt>Due</dt><dd>{dateOnly(i.dueAt)}</dd></>) : null}</dl>
          <table className="bp-table" style={{ marginTop: 18 }}>
            <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {i.lines.map((l: any) => <tr key={l.id}><td>{l.description}</td><td className="num">{l.quantity}</td><td className="num">{money(l.amount, i.currency)}</td></tr>)}
              {i.discount ? <tr><td colSpan={2}>Discount</td><td className="num">−{money(i.discount, i.currency)}</td></tr> : null}
              {i.tax ? <tr><td colSpan={2}>Tax</td><td className="num">{money(i.tax, i.currency)}</td></tr> : null}
              <tr><td colSpan={2} className="bp-strong">Total</td><td className="num bp-strong">{money(i.total, i.currency)}</td></tr>
              {i.payments.map((p: any) => <tr key={p.id}><td colSpan={2}>Payment, {label(p.method)}, {dateOnly(p.createdAt)} ({statusText(p.status)})</td><td className="num">−{money(p.amount, i.currency)}</td></tr>)}
              {i.creditNotes.map((c: any) => <tr key={c.id}><td colSpan={2}>Credit note: {c.reason}</td><td className="num">−{money(c.amount, i.currency)}</td></tr>)}
            </tbody>
          </table>
          {due > 0 ? <div style={{ marginTop: 20, maxWidth: 420 }} className="bp-noprint"><h3 style={{ marginBottom: 10 }}>Pay {money(due, i.currency)}</h3><PayInvoice invoiceId={i.id} amount={due} currency={i.currency} savedCard={fam?.family?.cardLabel ?? null} /></div> : null}
        </div>
      </AccountShell>
    </>
  )
}

// ---------------------------------------------------------------- progress (A10–A12)
export async function AccountProgressPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const { fam } = await guardian('/account/progress')
  const students: any[] = fam?.family?.students ?? []
  const current = students.find((s) => s.id === one(sp.student)) ?? students[0]
  const r = current ? await getMyStudent(current.id) : null
  const s = r?.value
  return (
    <>
      <PageHead title="Progress" lead="Assessment results, learning plans and session reports." />
      <AccountShell>
        {!fam?.family ? <NoFamily isStaff={Boolean(fam?.user?.isStaff)} /> : !current ? <Empty title="No students yet">Book an <Link className="bp-accent" href="/assessment">assessment</Link>.</Empty> : (
          <>
            {students.length > 1 ? <nav className="bp-tabs" aria-label="Student">{students.map((st) => <Link key={st.id} href={`/account/progress?student=${st.id}`} aria-current={st.id === current.id ? 'page' : undefined}>{st.firstName}</Link>)}</nav> : null}
            {!s ? <LoadError /> : (
              <>
                <div className="bp-stats" style={{ marginBottom: 28 }}>
                  <div className="bp-stat"><b>{s.attendance.attended ?? 0}</b><span>Sessions attended</span></div>
                  <div className="bp-stat"><b>{(s.attendance.no_show ?? 0) + (s.attendance.cancelled_late ?? 0)}</b><span>Missed</span></div>
                  <div className="bp-stat"><b>{s.reports.length}</b><span>Session reports</span></div>
                </div>

                <div className="bp-account-section">
                  <h2>Learning plans</h2>
                  {s.plans.length ? s.plans.map((p: any) => (
                    <div className="bp-panel" key={p.id} style={{ marginBottom: 12 }}>
                      <div className="bp-row" style={{ justifyContent: 'space-between' }}><h3>{p.program?.name ?? p.subject?.name ?? 'Plan'} <span className="bp-small bp-muted">v{p.version}</span></h3><span className={`bp-status${p.status === 'proposed' ? ' is-warn' : ''}`}>{statusText(p.status)}</span></div>
                      {p.summary ? <p style={{ marginTop: 8 }}>{p.summary}</p> : null}
                      <Link className="bp-btn is-small" style={{ marginTop: 12 }} href={`/account/progress/plan/${p.id}?student=${s.id}`}>{p.status === 'proposed' ? 'Review the plan' : 'View plan'}</Link>
                    </div>
                  )) : <p className="bp-muted">A learning plan follows the first assessment.</p>}
                </div>

                <div className="bp-account-section">
                  <h2>Assessments</h2>
                  {s.assessments.length ? s.assessments.map((a: any) => (
                    <div className="bp-panel" key={a.id} style={{ marginBottom: 12 }}>
                      <h3>{a.program?.name} · {dateOnly(a.scheduledAt)} <span className="bp-small bp-muted">{statusText(a.status)}</span></h3>
                      {a.summary ? <p style={{ marginTop: 8 }}>{a.summary}</p> : null}
                      {a.results.length ? (
                        <table className="bp-table" style={{ marginTop: 10 }}>
                          <thead><tr><th>Skill</th><th className="num">Score</th><th>Level</th></tr></thead>
                          <tbody>{a.results.map((x: any) => <tr key={x.id}><td>{x.skill}{x.strand ? <div className="bp-small bp-muted">{x.strand}</div> : null}</td><td className="num">{x.score}/{x.maxScore}{x.percent != null ? ` (${x.percent}%)` : ''}</td><td>{x.levelEquivalent}</td></tr>)}</tbody>
                        </table>
                      ) : null}
                      {a.recommendation ? <p style={{ marginTop: 10 }}><b>Recommendation:</b> {a.recommendation}</p> : null}
                    </div>
                  )) : <p className="bp-muted">No assessments yet.</p>}
                </div>

                <div className="bp-account-section">
                  <h2>Session reports</h2>
                  {s.reports.length ? (
                    <div className="bp-sessions">
                      {s.reports.map((x: any) => (
                        <div className="bp-panel" key={x.id}>
                          <h3 style={{ fontSize: 17 }}>{x.programName} · {x.startsAt ? when(x.startsAt, null, x.timezone || 'America/Chicago') : dateOnly(x.publishedAt)}{x.tutorName ? ` · ${x.tutorName}` : ''}</h3>
                          {x.topicsCovered ? <p style={{ marginTop: 6 }}><b>Covered:</b> {x.topicsCovered}</p> : null}
                          {x.wentWell ? <p><b>Went well:</b> {x.wentWell}</p> : null}
                          {x.toImprove ? <p><b>To work on:</b> {x.toImprove}</p> : null}
                          {x.homework ? <p><b>Homework:</b> {x.homework}{x.homeworkDueAt ? ` (due ${dateOnly(x.homeworkDueAt)})` : ''}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : <p className="bp-muted">Tutors publish a short report after each session.</p>}
                </div>

                {s.progressReports.length ? (
                  <div className="bp-account-section">
                    <h2>Progress reports</h2>
                    {s.progressReports.map((p: any) => (
                      <div className="bp-panel" key={p.id} style={{ marginBottom: 12 }}>
                        <h3>{dateOnly(p.periodStart)} to {dateOnly(p.periodEnd)}</h3>
                        <p className="bp-small bp-muted">{p.sessionsAttended} attended · {p.sessionsMissed} missed</p>
                        {p.narrative ? <p style={{ marginTop: 8 }}>{p.narrative}</p> : null}
                        {p.nextSteps ? <p style={{ marginTop: 8 }}><b>Next:</b> {p.nextSteps}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </AccountShell>
    </>
  )
}

export async function AccountPlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const [{ id }, sp] = await Promise.all([params, searchParams])
  const { fam } = await guardian(`/account/progress/plan/${id}`)
  const business = await getBusiness()
  const currency = business?.currency || 'USD'
  const students: any[] = fam?.family?.students ?? []
  const candidates = one(sp.student) ? [one(sp.student)] : students.map((s) => s.id)
  let plan: any = null
  let student: any = null
  for (const sid of candidates) {
    const r = await getMyStudent(sid)
    const p = r.value?.plans.find((x: any) => x.id === id)
    if (p) { plan = p; student = r.value; break }
  }
  if (!plan) notFound()
  const enrolHref = plan.program ? `/enrol/${plan.program.slug}?student=${student.id}&learningPlan=${plan.id}${plan.recommendedPlan ? `&plan=${plan.recommendedPlan.id}` : plan.recommendedPackage ? `&package=${plan.recommendedPackage.id}` : ''}` : null
  return (
    <>
      <PageHead title={`${student.firstName}'s learning plan`} lead={plan.program?.name ?? plan.subject?.name} crumbs={[{ href: `/account/progress?student=${student.id}`, label: 'Progress' }]} />
      <AccountShell>
        <div className="bp-grid-2" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
          <div className="bp-panel">
            {plan.summary ? <p>{plan.summary}</p> : null}
            <dl className="bp-dl" style={{ marginTop: 14 }}>
              <dt>Status</dt><dd>{statusText(plan.status)}</dd>
              {plan.sessionsPerWeek ? (<><dt>Sessions</dt><dd>{plan.sessionsPerWeek} a week</dd></>) : null}
              {plan.totalHours ? (<><dt>Total</dt><dd>{plan.totalHours} hours</dd></>) : null}
              {plan.startDate ? (<><dt>From</dt><dd>{dateOnly(plan.startDate)}{plan.targetDate ? ` to ${dateOnly(plan.targetDate)}` : ''}</dd></>) : null}
            </dl>
            <h3 style={{ marginTop: 22 }}>Goals</h3>
            {plan.goals.length ? (
              <table className="bp-table" style={{ marginTop: 8 }}>
                <thead><tr><th>Goal</th><th>From</th><th>Target</th><th>Status</th></tr></thead>
                <tbody>{plan.goals.map((g: any) => <tr key={g.id}><td>{g.title}{g.skill ? <div className="bp-small bp-muted">{g.skill}</div> : null}</td><td>{g.baseline}</td><td>{g.target}</td><td>{statusText(g.status)}</td></tr>)}</tbody>
              </table>
            ) : <p className="bp-muted">Goals are added with the plan.</p>}
          </div>
          <aside className="bp-sticky">
            <div className="bp-panel">
              <h2 style={{ fontSize: 20, marginBottom: 10 }}>Recommended</h2>
              {plan.recommendedPlan ? <p><b>{plan.recommendedPlan.name}</b><br />{money(plan.recommendedPlan.price, currency)}/month</p> : null}
              {plan.recommendedPackage ? <p><b>{plan.recommendedPackage.name}</b><br />{money(plan.recommendedPackage.price, currency)} for {plan.recommendedPackage.hours} hours</p> : null}
              {['proposed', 'accepted'].includes(plan.status) && enrolHref ? <Link className="bp-btn is-primary" style={{ width: '100%', marginTop: 14 }} href={enrolHref}>Accept and enrol</Link> : null}
              <Link className="bp-btn" style={{ width: '100%', marginTop: 10 }} href="/contact">Ask a question</Link>
            </div>
          </aside>
        </div>
      </AccountShell>
    </>
  )
}

// ---------------------------------------------------------------- family and card
export async function AccountSettingsPage() {
  const { viewer, fam } = await guardian('/account/settings')
  const f = fam?.family
  return (
    <>
      <PageHead title="Family and card" />
      <AccountShell>
        {!f ? <NoFamily isStaff={Boolean(fam?.user?.isStaff)} /> : (
          <>
            <div className="bp-account-section">
              <h2>Family</h2>
              <dl className="bp-dl">
                <dt>Name</dt><dd>{f.name}</dd>
                <dt>Signed in as</dt><dd>{viewer.name} ({viewer.email})</dd>
                <dt>Billing email</dt><dd>{f.billingEmail || viewer.email}</dd>
                {f.phone ? (<><dt>Phone</dt><dd>{f.phone}</dd></>) : null}
                {f.primaryLocation ? (<><dt>Home centre</dt><dd>{f.primaryLocation.name}</dd></>) : null}
                <dt>Students</dt><dd>{f.students.map((s: any) => `${s.firstName} ${s.lastName}`).join(', ') || 'None yet'}</dd>
              </dl>
              <p className="bp-small bp-muted" style={{ marginTop: 12 }}>To change these details, <Link className="bp-accent" href="/contact">message us</Link>. <Link className="bp-accent" href="/account/reset">Change your password</Link>.</p>
            </div>
            <div className="bp-account-section">
              <h2>Card on file</h2>
              <SaveCard current={f.cardLabel} />
            </div>
          </>
        )}
      </AccountShell>
    </>
  )
}
