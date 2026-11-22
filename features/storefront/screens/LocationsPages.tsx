import { Fragment } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBusiness, getLocation, getLocations } from '../lib/data'
import { ProgramCard, Quote, TutorCard } from '../components/cards'
import { Empty, LoadError, PageHead } from '../components/states'
import { address, dateOnly, openingHours, tzLabel } from '../lib/format'

export async function LocationsPage() {
  const result = await getLocations()
  const locations: any[] = result.value ?? []
  return (
    <>
      <PageHead title="Locations" lead="Visit a centre for small-group classes and assessments, or learn online from anywhere." />
      <section className="bp-body">
        <div className="bp-wrap">
          {result.error && !result.value ? <LoadError message={result.error} /> : locations.length ? (
            <div className="bp-grid-cards-2">
              {locations.map((l) => (
                <article className="bp-card" key={l.id}>
                  <div className="bp-card-img" style={{ backgroundImage: `url(${l.photo || '/storefront/centre.jpg'})`, aspectRatio: '16 / 7' }} />
                  <div className="bp-card-body" style={{ paddingRight: 22 }}>
                    <h3>{l.name}</h3>
                    {l.status === 'coming_soon' ? <p className="bp-accent bp-strong">Opening soon</p> : null}
                    <p>{address(l)}</p>
                    <p>{[l.phone, l.email].filter(Boolean).join(' · ')}</p>
                    {l.programs.length ? <p className="bp-muted">{l.programs.map((p: any) => p.name).join(', ')}</p> : null}
                    <div className="bp-actions" style={{ marginTop: 14 }}>
                      <Link className="bp-btn is-small is-dark" href={`/locations/${l.slug}`}>Hours and details</Link>
                      <a className="bp-btn is-small" href={l.mapUrl} target="_blank" rel="noopener noreferrer">Directions</a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : <Empty title="No centres are listed yet">Our online sessions are open; see <Link className="bp-accent" href="/programs?mode=online">online programs</Link>.</Empty>}
        </div>
      </section>
    </>
  )
}

export async function LocationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [business, l] = await Promise.all([getBusiness(), getLocation(slug)])
  if (!l) notFound()
  const currency = business?.currency || 'USD'
  return (
    <>
      <PageHead title={l.name} lead={l.description} crumbs={[{ href: '/locations', label: 'Locations' }]} />
      <section className="bp-body">
        <div className="bp-wrap bp-grid-2">
          <div>
            {l.programs.length ? (<><h2 className="bp-h2">Programs here</h2><div className="bp-grid-cards-2">{l.programs.map((p: any) => <ProgramCard key={p.id} p={p} currency={currency} />)}</div></>) : null}
            {l.tutors.length ? (<><h2 className="bp-h2">Tutors at this centre</h2><div className="bp-people">{l.tutors.map((t: any) => <TutorCard key={t.id} t={t} />)}</div></>) : null}
            {l.reviews.length ? (<><h2 className="bp-h2">Reviews</h2><div className="bp-grid-cards-2">{l.reviews.map((r: any) => <Quote key={r.id} r={r} />)}</div></>) : null}
          </div>
          <aside className="bp-sticky">
            <div className="bp-panel">
              <h2 style={{ fontSize: 22 }}>Visit</h2>
              <p style={{ marginTop: 8 }}>{address(l)}</p>
              {l.phone ? <p><a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`}>{l.phone}</a></p> : null}
              {l.email ? <p><a href={`mailto:${l.email}`}>{l.email}</a></p> : null}
              <a className="bp-btn is-small" style={{ marginTop: 12 }} href={l.mapUrl} target="_blank" rel="noopener noreferrer">Open in Maps</a>
              <hr className="bp-sep" />
              <h3>Opening hours</h3>
              <p className="bp-small bp-muted">{tzLabel(l.timezone)}</p>
              <dl className="bp-dl" style={{ marginTop: 8 }}>
                {openingHours(l.openingHours).map((h) => (<Fragment key={h.day}><dt>{h.day}</dt><dd style={{ fontWeight: h.text === 'Closed' ? 400 : 600 }}>{h.text}</dd></Fragment>))}
              </dl>
              {l.closures.length ? (
                <>
                  <hr className="bp-sep" />
                  <h3>Upcoming closures</h3>
                  <ul className="bp-list">{l.closures.map((c: any) => <li key={String(c.startsOn)}>{dateOnly(c.startsOn)}{String(c.endsOn) !== String(c.startsOn) ? ` to ${dateOnly(c.endsOn)}` : ''}{c.reason ? `: ${c.reason}` : ''}</li>)}</ul>
                </>
              ) : null}
              <Link className="bp-btn is-primary" style={{ width: '100%', marginTop: 18 }} href={`/assessment?location=${l.slug}`}>Book an assessment here</Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}
