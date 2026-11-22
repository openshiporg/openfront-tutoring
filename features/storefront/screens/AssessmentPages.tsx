import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getBusiness, getMyAssessment, getMyFamily, getPrograms, getViewer } from '../lib/data'
import { AssessmentForm } from '../components/AssessmentForm'
import { PayInvoice } from '../components/PayInvoice'
import { PageHead } from '../components/states'
import { MODE_LABEL, address, money, when } from '../lib/format'

type SP = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export async function AssessmentPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const [business, programs, viewer] = await Promise.all([getBusiness(), getPrograms(), getViewer()])
  const family = viewer ? (await getMyFamily()).value : null
  const list: any[] = (programs.value?.programs ?? []).filter((p: any) => p.requiresAssessment)
  return (
    <>
      <PageHead title="Book an assessment" lead="Every plan starts with an assessment: we find where your child is, then build the plan around it." />
      <section className="bp-body">
        <div className="bp-wrap">
          <AssessmentForm
            programs={list} levels={programs.value?.levels ?? []} currency={business?.currency || 'USD'}
            initial={{ program: one(sp.program), location: one(sp.location) }}
            viewer={viewer ? { name: viewer.name, email: viewer.email } : null}
            students={(family?.family?.students ?? []).map((s: any) => ({ id: s.id, firstName: s.firstName, lastName: s.lastName }))}
            idempotencyKey={randomUUID()}
          />
        </div>
      </section>
    </>
  )
}

export async function AssessmentConfirmedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(`/account/sign-in?next=${encodeURIComponent(`/assessment/confirmed/${id}`)}`)
  const result = await getMyAssessment(id)
  const a = result.value
  if (!a) {
    return (
      <>
        <PageHead title="Assessment" />
        <section className="bp-body"><div className="bp-wrap bp-narrow"><div className="bp-empty"><b>We could not find that booking</b>It may belong to another account. See <Link className="bp-accent" href="/account/schedule">your schedule</Link>.</div></div></section>
      </>
    )
  }
  const invoice = a.invoice
  const due = invoice && ['open', 'partially_paid'].includes(invoice.status) ? invoice.total - invoice.amountPaid : 0
  const cancelled = a.status === 'cancelled'
  return (
    <>
      <PageHead title={cancelled ? 'Assessment cancelled' : due ? 'Almost done: pay the assessment fee' : 'Your assessment is booked'} lead={cancelled ? undefined : `We look forward to meeting ${a.student.firstName}.`} />
      <section className="bp-body">
        <div className="bp-wrap bp-grid-2">
          <div className="bp-panel">
            <h2 style={{ fontSize: 22, marginBottom: 12 }}>{a.program.name} assessment</h2>
            <dl className="bp-dl">
              <dt>Student</dt><dd>{a.student.firstName} {a.student.lastName}</dd>
              <dt>When</dt><dd>{when(a.scheduledAt, a.endsAt, a.timezone)}</dd>
              <dt>Where</dt><dd>{a.location ? <>{a.location.name}{a.room ? `, ${a.room.name}` : ''}<br /><span className="bp-muted" style={{ fontWeight: 400 }}>{address(a.location)}</span></> : MODE_LABEL[a.mode]}</dd>
              {a.assessor ? (<><dt>With</dt><dd>{a.assessor}</dd></>) : null}
              <dt>Fee</dt><dd>{a.fee ? `${money(a.fee, invoice?.currency || 'USD')}${invoice?.status === 'paid' ? ' (paid)' : ''}` : 'Free'}</dd>
              <dt>Reference</dt><dd>{invoice?.number ? `Invoice ${invoice.number}` : a.id}</dd>
            </dl>
            <hr className="bp-sep" />
            <h3>What happens next</h3>
            <ul className="bp-list" style={{ marginTop: 6 }}>
              <li>We have emailed the details{viewer ? ` to ${viewer.email}` : ''}. New families also get a link to set a password.</li>
              <li>{a.mode === 'online' ? 'The video link appears in your account 10 minutes before the start.' : 'Please arrive five minutes early; the assessor will meet you at the front desk.'}</li>
              <li>Afterwards we share the results and a recommended plan in your account.</li>
              <li>Need to change it? Cancel or move it from <Link className="bp-accent" href="/account/schedule">your schedule</Link>. Cancelling at least {a.refundHours} hours ahead refunds the fee.</li>
            </ul>
          </div>
          <aside className="bp-sticky">
            <div className="bp-panel">
              {due > 0 && !cancelled ? (
                <>
                  <h2 style={{ fontSize: 22, marginBottom: 6 }}>Pay {money(due, invoice.currency)}</h2>
                  <p className="bp-small bp-muted" style={{ marginBottom: 14 }}>Your time is held. Pay the fee now to confirm it.</p>
                  <PayInvoice invoiceId={invoice.id} amount={due} currency={invoice.currency} idempotencyKey={`assessment:${a.id}`} />
                </>
              ) : (
                <>
                  <h2 style={{ fontSize: 22 }}>{cancelled ? 'This assessment was cancelled' : 'All set'}</h2>
                  <p style={{ marginTop: 8 }}>{cancelled ? 'Book another time whenever you are ready.' : 'Everything is in your account.'}</p>
                  <div className="bp-stack" style={{ marginTop: 16 }}>
                    <Link className="bp-btn is-primary" style={{ width: '100%' }} href={cancelled ? '/assessment' : '/account'}>{cancelled ? 'Book again' : 'Go to my account'}</Link>
                    <Link className="bp-btn" style={{ width: '100%' }} href={`/programs/${a.program.slug}`}>About {a.program.name}</Link>
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}
