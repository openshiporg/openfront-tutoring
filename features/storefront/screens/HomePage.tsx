import Link from 'next/link'
import { getBusiness } from '../lib/data'
import { Spark, SummitPath, Underline } from '../components/marks'
import { ArrowRight, Cap, Chart, Check, Laptop, People } from '../components/icons'
import { NotSetUp } from '../components/states'

function headlineParts(featured: any[]) {
  // The test-prep line of the picked design when the featured programmes are exam prep; otherwise a learning line.
  const testPrep = featured.length > 0 && featured.every((p) => p.subjects?.some((s: any) => s.category === 'test_prep'))
  return testPrep
    ? { first: 'Higher Scores.', second: 'Brighter', underlined: 'Opportunities.', ticks: ['Higher Scores', 'Less Stress', 'More College Options'], prep: 'Start Your Prep', closing: ['Take the Next Step', 'on Your College Journey'] }
    : { first: 'Confident Learners.', second: 'Brighter', underlined: 'Futures.', ticks: ['A plan for every child', 'Reports after every session', 'Expert tutors'], prep: 'Book an Assessment', closing: ['Take the Next Step', 'with Your Child'] }
}

export default async function HomePage() {
  const business = await getBusiness()
  if (!business) return <NotSetUp />
  const featured: any[] = business.featuredPrograms ?? []
  const reviews: any[] = (business.reviews ?? []).slice(0, 3)
  const stats = business.stats ?? {}
  const copy = headlineParts(featured)
  const featuredNames = featured.slice(0, 2).map((p) => p.name.replace(/ Prep$/, ''))
  const sectionTitle = featured.length === 3 && featuredNames.length === 2 ? `Prep for the ${featuredNames[0]}, the ${featuredNames[1]}, or Both` : 'Find the Right Program'
  const levelNote = featured[0]?.levelsFrom && featured[0]?.levelsTo ? `${featured[0].levelsFrom.name.toLowerCase()} to ${featured[0].levelsTo.name.toLowerCase()}` : null

  const values = [
    { Icon: Cap, title: 'Test Prep Experts', text: stats.tutors ? `${stats.tutors} tutors${stats.averageYearsExperience ? `, averaging ${stats.averageYearsExperience} years of teaching,` : ''} who know every section inside and out.` : 'Experienced tutors who know every section inside and out.' },
    { Icon: Laptop, title: 'Personalized Learning', text: 'A prep plan tailored to your goals, schedule, and starting point.' },
    { Icon: Chart, title: 'Proven Results', text: stats.averageRating && stats.reviews ? `Rated ${stats.averageRating} out of 5 in ${stats.reviews} published family reviews.` : 'A diagnostic first, then progress reports you can read every month.' },
    { Icon: People, title: 'Support at Every Step', text: 'Guidance, encouragement, and strategies to build lasting confidence.' },
  ]

  return (
    <>
      <section className="bp-hero" aria-labelledby="hero-title">
        <div className="bp-hero-photo" style={{ backgroundImage: 'url(/storefront/hero.jpg)' }} role="img" aria-label="A student holding a notebook outside a school building, smiling" />
        <Spark className="bp-spark" />
        <div className="bp-wrap bp-hero-in">
          <h1 id="hero-title">{copy.first}<br />{copy.second} <span className="bp-underline">{copy.underlined}<Underline /></span></h1>
          {business.about ? <p className="bp-hero-lead">{business.about}</p> : null}
          <div className="bp-actions">
            <Link className="bp-btn is-primary is-large" href="/assessment">{copy.prep}<ArrowRight /></Link>
            <Link className="bp-btn is-large" href="/programs">Find Your Program</Link>
          </div>
          <ul className="bp-ticks">{copy.ticks.map((t) => <li key={t}><Check />{t}</li>)}</ul>
        </div>
      </section>

      <section className="bp-values" aria-label="Why families choose us">
        <div className="bp-wrap bp-values-in">
          {values.map(({ Icon, title, text }) => (
            <div className="bp-value" key={title}><Icon /><h3>{title}</h3><p>{text}</p></div>
          ))}
        </div>
      </section>

      <section className="bp-section" aria-labelledby="programs-title">
        <div className="bp-wrap">
          <div className="bp-section-head">
            <h2 id="programs-title">{sectionTitle}</h2>
            <p>Flexible, effective programs designed for {levelNote ? `students in ${levelNote}` : 'students at every level'}.</p>
          </div>
          {featured.length ? (
            <div className="bp-cards">
              {featured.slice(0, 3).map((p) => (
                <Link className="bp-card" key={p.id} href={`/programs/${p.slug}`}>
                  <div className="bp-card-img" style={p.image ? { backgroundImage: `url(${p.image})` } : undefined} />
                  <div className="bp-card-body">
                    <h3>{p.name}</h3>
                    <p>{p.summary}</p>
                    <ArrowRight className="bp-card-arrow" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bp-empty"><b>Programs are being added</b>See <Link className="bp-accent" href="/programs">all programs</Link> or call us to talk it through.</div>
          )}
        </div>
      </section>

      {reviews.length ? (
        <section className="bp-section is-grey" aria-labelledby="quotes-title">
          <div className="bp-wrap">
            <div className="bp-section-head" style={{ marginBottom: 26 }}><h2 id="quotes-title">Trusted by Students and Families</h2></div>
            <div className="bp-quotes">
              {reviews.map((r) => (
                <figure className="bp-quote" key={r.id} style={{ margin: 0 }}>
                  <blockquote>“{r.text}”</blockquote>
                  <figcaption>— {r.authorName}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="bp-band" style={{ backgroundImage: 'url(/storefront/closing.jpg)' }} aria-labelledby="band-title">
        <SummitPath className="bp-band-path" />
        <div className="bp-wrap bp-band-in">
          <h2 id="band-title">{copy.closing[0]}<br />{copy.closing[1]}</h2>
          <p>Start {featuredNames.length === 2 ? `your ${featuredNames[0]} or ${featuredNames[1]} prep` : 'today'} with {business.name}{featuredNames.length === 2 ? ' today' : ''}.</p>
          <Link className="bp-btn is-primary" href="/assessment">Get Started<ArrowRight /></Link>
        </div>
      </section>
    </>
  )
}
