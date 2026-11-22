import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBusiness, getProgram } from '../lib/data'
import { DocumentText, PackageTile, PlanTile, Quote, Ticks, TutorCard } from '../components/cards'
import { PageHead } from '../components/states'
import { ArrowRight } from '../components/icons'
import { FORMAT_LABEL, MODE_LABEL, levelRange, money } from '../lib/format'

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [business, p] = await Promise.all([getBusiness(), getProgram(slug)])
  if (!p) notFound()
  const currency = business?.currency || 'USD'
  const outcomes = String(p.outcomes || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const hasPrices = p.plans.length > 0 || p.packages.length > 0 || p.payAsYouGoPrice > 0

  return (
    <>
      <PageHead title={p.name} lead={p.summary} crumbs={[{ href: '/programs', label: 'Programs' }]} />
      <section className="bp-body">
        <div className="bp-wrap bp-grid-2">
          <div>
            {p.image ? <div className="bp-card-img" style={{ backgroundImage: `url(${p.image})`, aspectRatio: '16 / 7', borderRadius: 10, marginBottom: 28 }} role="img" aria-label={p.name} /> : null}
            <DocumentText doc={p.description} />
            {outcomes.length ? (<><h2 className="bp-h2">What you get</h2><Ticks items={outcomes} /></>) : null}

            <h2 className="bp-h2" id="prices">Plans and prices</h2>
            {!hasPrices ? <div className="bp-empty"><b>Prices are set after the assessment</b>Book the assessment and we will recommend a plan.</div> : null}
            {p.plans.length ? (
              <>
                <h3 style={{ fontSize: 18, margin: '0 0 10px' }}>Monthly memberships</h3>
                <div className="bp-prices">{p.plans.map((plan: any) => <PlanTile key={plan.id} plan={plan} currency={currency} href={`/enrol/${p.slug}?plan=${plan.id}`} />)}</div>
              </>
            ) : null}
            {p.packages.length ? (
              <>
                <h3 style={{ fontSize: 18, margin: '24px 0 10px' }}>Hour packages</h3>
                <div className="bp-prices">{p.packages.map((pack: any) => <PackageTile key={pack.id} pack={pack} currency={currency} href={`/enrol/${p.slug}?package=${pack.id}`} />)}</div>
              </>
            ) : null}
            {p.payAsYouGoPrice ? <p className="bp-small" style={{ marginTop: 14 }}>Or pay as you go: {money(p.payAsYouGoPrice, currency)} a session.</p> : null}
            {p.siblingDiscountPercent ? <p className="bp-small bp-muted" style={{ marginTop: 8 }}>Brothers and sisters get {p.siblingDiscountPercent}% off their memberships.</p> : null}

            {p.tutors.length ? (<><h2 className="bp-h2">Tutors who teach this</h2><div className="bp-people">{p.tutors.map((t: any) => <TutorCard key={t.id} t={t} />)}</div></>) : null}
            {p.reviews.length ? (<><h2 className="bp-h2">What families say</h2><div className="bp-grid-cards-2">{p.reviews.map((r: any) => <Quote key={r.id} r={r} />)}</div></>) : null}
            {p.faq.length ? (
              <>
                <h2 className="bp-h2">Questions</h2>
                {p.faq.map((f: any) => (
                  <details key={f.q} className="bp-panel" style={{ marginTop: 10 }}>
                    <summary className="bp-strong" style={{ cursor: 'pointer' }}>{f.q}</summary>
                    <p style={{ marginTop: 8 }}>{f.a}</p>
                  </details>
                ))}
              </>
            ) : null}
          </div>

          <aside className="bp-sticky">
            <div className="bp-panel">
              <h2 style={{ fontSize: 22, marginBottom: 14 }}>At a glance</h2>
              <dl className="bp-dl">
                <dt>For</dt><dd>{levelRange(p.levelsFrom, p.levelsTo)}</dd>
                <dt>Format</dt><dd>{FORMAT_LABEL[p.format]}{p.format !== 'one_to_one' ? `, up to ${p.maxStudentsPerSession}` : ''}</dd>
                <dt>Session</dt><dd>{p.sessionMinutes} minutes</dd>
                <dt>Where</dt><dd>{p.deliveryModes.map((m: string) => MODE_LABEL[m]).join(', ')}</dd>
                {p.locations.length ? (<><dt>Centres</dt><dd>{p.locations.map((l: any, i: number) => <span key={l.id}>{i ? ', ' : ''}<Link href={`/locations/${l.slug}`}>{l.name}</Link></span>)}</dd></>) : null}
                {p.requiresAssessment ? (<><dt>Assessment</dt><dd>{p.assessmentMinutes} min, {p.assessmentFee ? money(p.assessmentFee, currency) : 'free'}</dd></>) : null}
                {p.fromPrice < Number.MAX_SAFE_INTEGER ? (<><dt>From</dt><dd>{money(p.fromPrice, currency)}</dd></>) : null}
              </dl>
              <div className="bp-stack" style={{ marginTop: 18 }}>
                {p.requiresAssessment ? <Link className="bp-btn is-primary" style={{ width: '100%' }} href={`/assessment?program=${p.slug}`}>Book the assessment<ArrowRight /></Link> : null}
                {hasPrices ? <Link className={`bp-btn${p.requiresAssessment ? '' : ' is-primary'}`} style={{ width: '100%' }} href={`/enrol/${p.slug}`}>Enrol now</Link> : null}
                <Link className="bp-btn is-link" href={`/contact?program=${p.id}`}>Ask a question</Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}
