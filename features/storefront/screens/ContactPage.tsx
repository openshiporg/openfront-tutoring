import { randomUUID } from 'node:crypto'
import { getBusiness, getLocations, getPrograms } from '../lib/data'
import { ContactForm } from '../components/ContactForm'
import { PageHead } from '../components/states'
import { address } from '../lib/format'

type SP = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export default async function ContactPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const [business, programs, locations] = await Promise.all([getBusiness(), getPrograms(), getLocations()])
  const locs: any[] = locations.value ?? []
  return (
    <>
      <PageHead title="Contact us" lead="Ask a question, or tell us what you need and we will find the right tutor." />
      <section className="bp-body">
        <div className="bp-wrap bp-grid-2">
          <ContactForm
            programs={programs.value?.programs ?? []} subjects={programs.value?.subjects ?? []} levels={programs.value?.levels ?? []} locations={locs}
            defaults={{ intent: one(sp.intent), programId: one(sp.program), tutor: one(sp.tutor) }} idempotencyKey={randomUUID()}
          />
          <aside className="bp-sticky">
            <div className="bp-panel is-grey">
              <h2 style={{ fontSize: 22 }}>Talk to us</h2>
              {business?.phone ? <p style={{ marginTop: 8 }}><a className="bp-strong" href={`tel:${business.phone.replace(/[^\d+]/g, '')}`}>{business.phone}</a></p> : null}
              {business?.supportEmail ? <p><a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a></p> : null}
              {locs.map((l) => (
                <div key={l.id} style={{ marginTop: 14 }}>
                  <p className="bp-strong">{l.name}</p>
                  <p className="bp-small">{address(l)}</p>
                  {l.phone ? <p className="bp-small">{l.phone}</p> : null}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </>
  )
}
