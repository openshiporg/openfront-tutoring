import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBusiness, getTutor, getTutors } from '../lib/data'
import { Avatar, ProgramCard, Quote, Stars, TutorCard } from '../components/cards'
import { Empty, LoadError, PageHead } from '../components/states'
import { MODE_LABEL } from '../lib/format'

type SP = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export async function TutorsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const filter = { subject: one(sp.subject), location: one(sp.location), mode: one(sp.mode) }
  const result = await getTutors(filter)
  const tutors: any[] = result.value?.tutors ?? []
  const filtered = Boolean(filter.subject || filter.location || filter.mode)
  return (
    <>
      <PageHead title="Our tutors" lead="Every tutor is interviewed, background-checked and trained in our teaching approach." />
      <section className="bp-body">
        <div className="bp-wrap">
          <form className="bp-filters" method="get" action="/tutors">
            <label className="bp-field"><span>Subject</span>
              <select className="bp-select" name="subject" defaultValue={filter.subject}>
                <option value="">All subjects</option>
                {(result.value?.subjects ?? []).map((s: any) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
              </select>
            </label>
            <label className="bp-field"><span>Centre</span>
              <select className="bp-select" name="location" defaultValue={filter.location}>
                <option value="">Any centre</option>
                {(result.value?.locations ?? []).map((l: any) => <option key={l.slug} value={l.slug}>{l.name}</option>)}
              </select>
            </label>
            <label className="bp-field"><span>Where</span>
              <select className="bp-select" name="mode" defaultValue={filter.mode}>
                <option value="">Anywhere</option>
                {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <button className="bp-btn is-dark" type="submit">Show tutors</button>
            {filtered ? <Link className="bp-btn is-link" href="/tutors">Clear filters</Link> : null}
          </form>
          {result.error && !result.value ? <LoadError message={result.error} /> : tutors.length ? (
            <div className="bp-people">{tutors.map((t) => <TutorCard key={t.id} t={t} />)}</div>
          ) : (
            <Empty title={filtered ? 'No tutor matches those filters' : 'Tutor profiles are coming soon'}>
              <Link className="bp-accent" href="/contact?intent=request_tutor">Tell us what you need</Link> and we will match a tutor for you.
            </Empty>
          )}
        </div>
      </section>
    </>
  )
}

export async function TutorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [business, t] = await Promise.all([getBusiness(), getTutor(slug)])
  if (!t) notFound()
  const currency = business?.currency || 'USD'
  return (
    <>
      <div className="bp-page-head">
        <div className="bp-wrap" style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
          <Avatar name={t.displayName} photo={t.photo} large />
          <div>
            <nav className="bp-crumbs" aria-label="Breadcrumb"><Link href="/tutors">Tutors</Link></nav>
            <h1 style={{ fontSize: 40 }}>{t.displayName}</h1>
            <p style={{ marginTop: 6, fontSize: 18 }}>{t.headline}</p>
            <div style={{ marginTop: 8 }}><Stars rating={t.averageRating} count={t.reviewCount} /></div>
          </div>
        </div>
      </div>
      <section className="bp-body">
        <div className="bp-wrap bp-grid-2">
          <div>
            <div className="bp-prose"><p>{t.bio}</p></div>
            <h2 className="bp-h2">Subjects and levels</h2>
            <ul className="bp-list">{t.subjects.map((s: any) => <li key={s.id}><span className="bp-strong">{s.name}</span><span className="bp-muted">{s.levelFrom && s.levelTo ? `${s.levelFrom} to ${s.levelTo}` : ''}</span></li>)}</ul>
            {t.programs.length ? (<><h2 className="bp-h2">Programs</h2><div className="bp-grid-cards-2">{t.programs.map((p: any) => <ProgramCard key={p.id} p={p} currency={currency} />)}</div></>) : null}
            {t.reviews.length ? (<><h2 className="bp-h2">Reviews</h2><div className="bp-grid-cards-2">{t.reviews.map((r: any) => <Quote key={r.id} r={r} />)}</div></>) : null}
          </div>
          <aside className="bp-sticky">
            <div className="bp-panel">
              <dl className="bp-dl">
                {t.education ? (<><dt>Education</dt><dd>{t.education}</dd></>) : null}
                {t.yearsExperience ? (<><dt>Experience</dt><dd>{t.yearsExperience} years</dd></>) : null}
                <dt>Teaches</dt><dd>{t.deliveryModes.map((m: string) => MODE_LABEL[m]).join(', ')}</dd>
                {t.locations.length ? (<><dt>Centres</dt><dd>{t.locations.map((l: any, i: number) => <span key={l.id}>{i ? ', ' : ''}<Link href={`/locations/${l.slug}`}>{l.name}</Link></span>)}</dd></>) : null}
                {t.travelAreas && t.deliveryModes.includes('in_home') ? (<><dt>Travels to</dt><dd>{t.travelAreas}</dd></>) : null}
              </dl>
              <div className="bp-stack" style={{ marginTop: 18 }}>
                <Link className="bp-btn is-primary" style={{ width: '100%' }} href={`/assessment${t.programs[0] ? `?program=${t.programs[0].slug}` : ''}`}>Book an assessment</Link>
                <Link className="bp-btn" style={{ width: '100%' }} href={`/contact?intent=request_tutor&tutor=${encodeURIComponent(t.displayName)}`}>Request {t.displayName.split(' ')[0]}</Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}
