import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getBusiness, getEnrolmentOptions, getMyEnrolment, getMyFamily, getProgram, getPrograms, getViewer } from '../lib/data'
import { EnrolForm } from '../components/EnrolForm'
import { PayInvoice } from '../components/PayInvoice'
import { PageHead } from '../components/states'
import { MODE_LABEL, money, when } from '../lib/format'

type SP = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export async function EnrolPage({ params, searchParams }: { params: Promise<{ programSlug: string }>; searchParams: SP }) {
  const [{ programSlug }, sp] = await Promise.all([params, searchParams])
  const program = await getProgram(programSlug)
  if (!program) notFound()
  const [business, options, catalogue, viewer] = await Promise.all([getBusiness(), getEnrolmentOptions(program.id), getPrograms(), getViewer()])
  const family = viewer ? (await getMyFamily()).value : null
  return (
    <>
      <PageHead title={`Enrol in ${program.name}`} lead={program.requiresAssessment && !viewer ? <>New to us? Most families start with an <Link className="bp-accent" href={`/assessment?program=${program.slug}`}>assessment</Link>; you can also enrol straight away.</> : program.summary} />
      <section className="bp-body">
        <div className="bp-wrap">
          <EnrolForm
            program={program} series={options.value?.series ?? []} levels={catalogue.value?.levels ?? []}
            currency={business?.currency || 'USD'} siblingDiscountPercent={program.siblingDiscountPercent ?? 0}
            viewer={viewer ? { name: viewer.name, email: viewer.email } : null}
            students={(family?.family?.students ?? []).map((s: any) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName }))}
            initial={{ option: one(sp.plan) ? `plan:${one(sp.plan)}` : one(sp.package) ? `package:${one(sp.package)}` : '', location: one(sp.location), student: one(sp.student), learningPlanId: one(sp.learningPlan) }}
            idempotencyKey={randomUUID()}
          />
        </div>
      </section>
    </>
  )
}

const STATUS_TITLE: Record<string, string> = {
  active: 'You are enrolled',
  pending_match: 'You are enrolled: we are matching a tutor',
  matched: 'You are enrolled: your tutor is confirmed',
  pending_payment: 'Almost done: payment needed',
  cancelled: 'This enrolment was cancelled',
}

export async function EnrolConfirmedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(await getViewer())) redirect(`/account/sign-in?next=${encodeURIComponent(`/enrol/confirmed/${id}`)}`)
  const e = (await getMyEnrolment(id)).value
  if (!e) {
    return (
      <>
        <PageHead title="Enrolment" />
        <section className="bp-body"><div className="bp-wrap bp-narrow"><div className="bp-empty"><b>We could not find that enrolment</b>See <Link className="bp-accent" href="/account">your account</Link>.</div></div></section>
      </>
    )
  }
  const inv = e.invoice
  const due = inv && ['open', 'partially_paid'].includes(inv.status) ? inv.total - inv.amountPaid : 0
  return (
    <>
      <PageHead title={STATUS_TITLE[e.status] ?? 'Your enrolment'} lead={e.status === 'cancelled' ? undefined : `Welcome to ${e.program.name}, ${e.student.firstName}.`} />
      <section className="bp-body">
        <div className="bp-wrap bp-grid-2">
          <div className="bp-panel">
            <dl className="bp-dl">
              <dt>Student</dt><dd>{e.student.firstName} {e.student.lastName}</dd>
              <dt>Program</dt><dd>{e.program.name}</dd>
              <dt>Where</dt><dd>{e.location?.name ?? MODE_LABEL[e.mode]}</dd>
              {e.membership ? (<><dt>Plan</dt><dd>{e.membership.planName} · {money(e.membership.price, inv?.currency || 'USD')}/month</dd></>) : null}
              {e.studentPackage ? (<><dt>Package</dt><dd>{e.studentPackage.name} · {e.studentPackage.hours} hours</dd></>) : null}
              {e.tutor ? (<><dt>Tutor</dt><dd>{e.tutor}</dd></>) : null}
              {inv ? (<><dt>Invoice</dt><dd>{inv.number} · {money(inv.total, inv.currency)} · {inv.status === 'paid' ? 'paid' : 'open'}</dd></>) : null}
            </dl>
            {e.upcoming.length ? (
              <>
                <hr className="bp-sep" />
                <h3>Booked sessions</h3>
                <ul className="bp-list is-text" style={{ marginTop: 6 }}>{e.upcoming.map((b: any) => <li key={b.id}>{when(b.startsAt, b.endsAt, e.timezone)}</li>)}</ul>
              </>
            ) : null}
            {inv?.missedSeats ? <div className="bp-notice" style={{ marginTop: 14 }}>{inv.missedSeats} weekly seat{inv.missedSeats === 1 ? ' was' : 's were'} already full. Our team will be in touch to find another time.</div> : null}
            <hr className="bp-sep" />
            <h3>What happens next</h3>
            <ul className="bp-list is-text" style={{ marginTop: 6 }}>
              {e.status === 'pending_match' ? <li>We are choosing the tutor who fits best and will email you within two working days.</li> : null}
              {e.upcoming.length ? <li>Your sessions are in your schedule. Book extra sessions or cancel there too.</li> : <li>Book your first sessions from <Link className="bp-accent" href="/schedule">the class schedule</Link> or your account.</li>}
              <li>A receipt is on its way by email.</li>
            </ul>
          </div>
          <aside className="bp-sticky">
            <div className="bp-panel">
              {due > 0 && e.status !== 'cancelled' ? (
                <>
                  <h2 style={{ fontSize: 22, marginBottom: 6 }}>Pay {money(due, inv.currency)}</h2>
                  <p className="bp-small bp-muted" style={{ marginBottom: 14 }}>Your place is held until this is paid.</p>
                  <PayInvoice invoiceId={inv.id} amount={due} currency={inv.currency} />
                </>
              ) : (
                <div className="bp-stack">
                  <Link className="bp-btn is-primary" style={{ width: '100%' }} href="/account">Go to my account</Link>
                  <Link className="bp-btn" style={{ width: '100%' }} href="/account/schedule">My schedule</Link>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}

/** Resume payment for a held place (pending_payment enrolment), e.g. after closing the tab mid-checkout. */
export async function EnrolCheckoutPage({ searchParams }: { searchParams: SP }) {
  const id = one((await searchParams).enrolment)
  if (!(await getViewer())) redirect(`/account/sign-in?next=${encodeURIComponent(`/enrol/checkout?enrolment=${id}`)}`)
  if (!id) redirect('/programs')
  const e = (await getMyEnrolment(id)).value
  if (!e) notFound()
  if (e.status !== 'pending_payment') redirect(`/enrol/confirmed/${e.id}`)
  const inv = e.invoice
  const due = inv ? inv.total - inv.amountPaid : 0
  return (
    <>
      <PageHead title="Checkout" lead={`${e.program.name} for ${e.student.firstName}. Your place is held until it is paid.`} />
      <section className="bp-body">
        <div className="bp-wrap bp-grid-2">
          <div className="bp-panel">
            <dl className="bp-dl">
              <dt>Program</dt><dd>{e.program.name}</dd>
              <dt>Where</dt><dd>{e.location?.name ?? MODE_LABEL[e.mode]}</dd>
              {e.membership ? (<><dt>Plan</dt><dd>{e.membership.planName} · {money(e.membership.price, inv?.currency || 'USD')}/month</dd></>) : null}
              {e.studentPackage ? (<><dt>Package</dt><dd>{e.studentPackage.name} · {e.studentPackage.hours} hours</dd></>) : null}
              {inv ? (<><dt>Invoice</dt><dd>{inv.number}</dd><dt>Due today</dt><dd>{money(due, inv.currency)}</dd></>) : null}
            </dl>
          </div>
          <aside className="bp-sticky">
            <div className="bp-panel">
              {inv && due > 0 ? <PayInvoice invoiceId={inv.id} amount={due} currency={inv.currency} label={`Pay ${money(due, inv.currency)} and enrol`} /> : <Link className="bp-btn is-primary" href={`/enrol/confirmed/${e.id}`}>Continue</Link>}
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}
