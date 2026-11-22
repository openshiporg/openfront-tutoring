import Link from 'next/link'
import { getOpenSessions, getPolicies, getPricing } from '../lib/data'
import { PackageTile, PlanTile } from '../components/cards'
import { Empty, LoadError, PageHead } from '../components/states'
import { dateLong, dayKey, levelRange, money, time, tzLabel } from '../lib/format'

type SP = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

// ---------------------------------------------------------------- /pricing (P8)
export async function PricingPage() {
  const result = await getPricing()
  const v = result.value
  if (!v) return (<><PageHead title="Pricing" /><section className="bp-body"><div className="bp-wrap"><LoadError message={result.error} /></div></section></>)
  const programs: any[] = v.programs.filter((p: any) => p.plans.length || p.packages.length || p.payAsYouGoPrice)
  const enrolmentFees = Array.from(new Set(v.programs.flatMap((p: any) => p.plans.map((x: any) => x.enrolmentFee)).filter((n: number) => n > 0))) as number[]
  return (
    <>
      <PageHead title="Pricing" lead="Monthly memberships for regular sessions, hour packages for flexible tutoring. No hidden fees." />
      <section className="bp-body">
        <div className="bp-wrap">
          <div className="bp-notice is-accent" style={{ marginBottom: 28 }}>
            {enrolmentFees.length ? <>A one-time enrolment fee of {enrolmentFees.map((f) => money(f, v.currency)).join(' or ')} applies to new memberships. </> : null}
            {v.siblingDiscountPercent ? <>Brothers and sisters get {v.siblingDiscountPercent}% off. </> : null}
            Cancel a session at least {v.cancellationWindowHours} hours ahead and the credit comes back. Memberships end with {v.membershipCancelNoticeDays} days’ notice. <Link className="bp-accent" href="/policies">All policies</Link>
          </div>
          {programs.length ? programs.map((p: any) => (
            <section key={p.id} style={{ marginBottom: 40 }}>
              <div className="bp-between" style={{ marginBottom: 14 }}>
                <div>
                  <h2 style={{ fontSize: 26 }}><Link href={`/programs/${p.slug}`}>{p.name}</Link></h2>
                  <p className="bp-muted bp-small">{levelRange(p.levelsFrom, p.levelsTo)} · {p.sessionMinutes}-minute sessions{p.requiresAssessment ? ` · assessment ${p.assessmentFee ? money(p.assessmentFee, v.currency) : 'free'}` : ''}</p>
                </div>
                <Link className="bp-btn is-small" href={`/enrol/${p.slug}`}>Enrol</Link>
              </div>
              <div className="bp-prices">
                {p.plans.map((plan: any) => <PlanTile key={plan.id} plan={plan} currency={v.currency} href={`/enrol/${p.slug}?plan=${plan.id}`} />)}
                {p.packages.map((pack: any) => <PackageTile key={pack.id} pack={pack} currency={v.currency} href={`/enrol/${p.slug}?package=${pack.id}`} />)}
              </div>
              {p.payAsYouGoPrice ? <p className="bp-small" style={{ marginTop: 10 }}>Pay as you go: {money(p.payAsYouGoPrice, v.currency)} a session.</p> : null}
            </section>
          )) : <Empty title="Prices are not published yet">Call us or <Link className="bp-accent" href="/contact">send a message</Link> for a quote.</Empty>}
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------- /schedule (P12)
export async function SchedulePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const programId = one(sp.program)
  const locationId = one(sp.location)
  const result = await getOpenSessions({ programId, locationId })
  const v = result.value
  const sessions: any[] = v?.sessions ?? []
  const groups = new Map<string, any[]>()
  for (const s of sessions) {
    const tz = s.location?.timezone || v.timezone
    const key = dayKey(s.startsAt, tz)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  return (
    <>
      <PageHead title="Class schedule" lead="Open small-group sessions for the next two weeks. Members book these from their account; new families start with an assessment." />
      <section className="bp-body">
        <div className="bp-wrap">
          <form className="bp-filters" method="get" action="/schedule">
            <label className="bp-field"><span>Program</span>
              <select className="bp-select" name="program" defaultValue={programId}>
                <option value="">All programs</option>
                {(v?.programs ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="bp-field"><span>Centre</span>
              <select className="bp-select" name="location" defaultValue={locationId}>
                <option value="">All centres</option>
                {(v?.locations ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                <option value="online">Online</option>
              </select>
            </label>
            <button className="bp-btn is-dark" type="submit">Show sessions</button>
          </form>
          {!v ? <LoadError message={result.error} /> : sessions.length ? (
            <>
              <p className="bp-small bp-muted" style={{ marginBottom: 12 }}>Times in {tzLabel(v.timezone)}.</p>
              {Array.from(groups.entries()).map(([key, list]) => (
                <div key={key} style={{ marginBottom: 24 }}>
                  <h2 style={{ fontSize: 20, marginBottom: 10 }}>{dateLong(list[0].startsAt, list[0].location?.timezone || v.timezone)}</h2>
                  <div className="bp-sessions">
                    {list.map((s) => {
                      const tz = s.location?.timezone || v.timezone
                      return (
                        <div className="bp-session" key={s.id}>
                          <div className="bp-session-time">{time(s.startsAt, tz)}<small>to {time(s.endsAt, tz)}</small></div>
                          <div>
                            <h3><Link href={`/programs/${s.program.slug}`}>{s.program.name}</Link></h3>
                            <p>{s.subject?.name ? `${s.subject.name} · ` : ''}{s.location ? s.location.name : 'Online'}{s.room ? `, ${s.room.name}` : ''}{s.tutor ? ` · with ${s.tutor.displayName}` : ''}</p>
                            <p className={s.seatsLeft ? '' : 'bp-accent'}>{s.seatsLeft ? `${s.seatsLeft} of ${s.capacity} seats open` : 'Full: members can join the waitlist'}</p>
                          </div>
                          <Link className={`bp-btn is-small${s.seatsLeft ? ' is-dark' : ''}`} href={`/account/book?session=${s.id}`}>{s.seatsLeft ? 'Book' : 'Waitlist'}</Link>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              <p className="bp-small" style={{ marginTop: 12 }}>New to us? <Link className="bp-accent" href="/assessment">Start with an assessment</Link> or <Link className="bp-accent" href="/pricing">see plans</Link>.</p>
            </>
          ) : <Empty title="No open sessions match">Try another centre or program, or <Link className="bp-accent" href="/contact">ask us</Link> about times.</Empty>}
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------- /policies (P15)
export async function PoliciesPage() {
  const result = await getPolicies()
  const s = result.value
  if (!s) return (<><PageHead title="Policies" /><section className="bp-body"><div className="bp-wrap"><LoadError message={result.error} /></div></section></>)
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
  const rows: Array<[string, string[]]> = [
    ['Cancelling a session', [
      `Cancel at least ${s.cancellationWindowHours} hours before the start and the session credit comes back to you.`,
      s.lateCancelCharged ? `Inside ${s.cancellationWindowHours} hours the session is charged.` : `Late cancellations are not charged.`,
      s.excusedAbsencesPerMonth ? `Illness or emergencies: ${s.excusedAbsencesPerMonth} excused late cancellation${s.excusedAbsencesPerMonth === 1 ? '' : 's'} a month per child, which earns a make-up credit.` : '',
      s.noShowCharged ? 'Missing a session without cancelling uses the credit.' : '',
    ]],
    ['Make-up sessions', [`Make-up credits must be used within ${days(s.makeUpExpiryDays)}.`, 'If we cancel a session (a closure or a tutor absence), the credit always comes back.']],
    ['Memberships', [
      s.membershipRolloverPeriods ? `Unused sessions roll over for ${s.membershipRolloverPeriods} month${s.membershipRolloverPeriods === 1 ? '' : 's'}.` : 'Unused sessions do not roll over.',
      `You can pause ${s.pausesPerYear} time${s.pausesPerYear === 1 ? '' : 's'} a year, for ${s.pauseMinDays} to ${s.pauseMaxDays} days.`,
      `To end a membership, give ${days(s.membershipCancelNoticeDays)} notice from your account.`,
      s.enrolmentFeeWaivedWithinDays ? `Returning within ${days(s.enrolmentFeeWaivedWithinDays)} of leaving? The enrolment fee is waived.` : '',
      s.siblingDiscountPercent ? `Brothers and sisters get ${s.siblingDiscountPercent}% off their memberships.` : '',
    ]],
    ['Assessments', [
      `Cancel at least ${s.assessmentCancelRefundHours} hours ahead for a full refund of any assessment fee.`,
      s.assessmentFeeKeptOnLateCancel ? 'Later cancellations and missed assessments keep the fee.' : 'Late cancellations are refunded too.',
    ]],
    ['One-to-one tutoring', [s.freeRematches ? `If your tutor is not the right fit, ${s.freeRematches === 1 ? 'the first re-match is' : `the first ${s.freeRematches} re-matches are`} free.` : 'Re-matches are arranged on request.']],
    ['Payments', [`Unpaid invoices: sessions are suspended after ${days(s.suspendAfterDays)}, and restart as soon as the balance is paid.`, 'Refunds go back to the card you paid with.']],
  ]
  return (
    <>
      <PageHead title="Policies" lead={`How ${s.businessName || 'we'} handle${s.businessName ? 's' : ''} cancellations, make-ups, memberships and refunds.`} />
      <section className="bp-body">
        <div className="bp-wrap bp-narrow">
          {rows.map(([title, lines]) => (
            <section key={title} className="bp-panel">
              <h2 style={{ fontSize: 22, marginBottom: 8 }}>{title}</h2>
              <ul className="bp-list">{lines.filter(Boolean).map((l) => <li key={l}>{l}</li>)}</ul>
            </section>
          ))}
          {s.policiesText ? <section className="bp-panel"><h2 style={{ fontSize: 22, marginBottom: 8 }}>More from us</h2><div className="bp-prose">{String(s.policiesText).split(/\n\n+/).map((p: string) => <p key={p}>{p}</p>)}</div></section> : null}
          <p className="bp-small bp-muted" style={{ marginTop: 18 }}>Questions? {s.supportEmail ? <a className="bp-accent" href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a> : <Link className="bp-accent" href="/contact">Contact us</Link>}{s.phone ? ` or ${s.phone}` : ''}.</p>
        </div>
      </section>
    </>
  )
}
