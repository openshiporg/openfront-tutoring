import Link from 'next/link'
import { getBusiness, getPrograms } from '../lib/data'
import { ProgramCard } from '../components/cards'
import { Empty, LoadError, PageHead } from '../components/states'
import { MODE_LABEL } from '../lib/format'

type SP = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export default async function ProgramsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const filter = { subject: one(sp.subject), level: one(sp.level), mode: one(sp.mode) }
  const [business, result] = await Promise.all([getBusiness(), getPrograms(filter)])
  const currency = business?.currency || 'USD'
  const programs: any[] = result.value?.programs ?? []
  const subjects: any[] = result.value?.subjects ?? []
  const levels: any[] = result.value?.levels ?? []
  const filtered = Boolean(filter.subject || filter.level || filter.mode)

  return (
    <>
      <PageHead title="Programs" lead="Test prep, tutoring and small-group classes. Filter by subject, grade and how you want to learn." />
      <section className="bp-body">
        <div className="bp-wrap">
          <form className="bp-filters" method="get" action="/programs">
            <label className="bp-field"><span>Subject</span>
              <select className="bp-select" name="subject" defaultValue={filter.subject}>
                <option value="">All subjects</option>
                {subjects.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
              </select>
            </label>
            <label className="bp-field"><span>Grade or exam</span>
              <select className="bp-select" name="level" defaultValue={filter.level}>
                <option value="">Any</option>
                {levels.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
            </label>
            <label className="bp-field"><span>Where</span>
              <select className="bp-select" name="mode" defaultValue={filter.mode}>
                <option value="">Anywhere</option>
                {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <button className="bp-btn is-dark" type="submit">Show programs</button>
            {filtered ? <Link className="bp-btn is-link" href="/programs">Clear filters</Link> : null}
          </form>
          {result.error && !result.value ? <LoadError message={result.error} /> : programs.length ? (
            <>
              <p className="bp-muted bp-small" style={{ marginBottom: 14 }}>{programs.length} {programs.length === 1 ? 'program' : 'programs'}</p>
              <div className="bp-cards">{programs.map((p) => <ProgramCard key={p.id} p={p} currency={currency} />)}</div>
            </>
          ) : (
            <Empty title={filtered ? 'No program matches those filters' : 'No programs are published yet'}>
              {filtered ? <>Try fewer filters, or <Link className="bp-accent" href="/contact?intent=request_tutor">ask us to find a tutor</Link> for exactly what you need.</> : <>Call us or <Link className="bp-accent" href="/contact">send a message</Link>.</>}
            </Empty>
          )}
        </div>
      </section>
    </>
  )
}
