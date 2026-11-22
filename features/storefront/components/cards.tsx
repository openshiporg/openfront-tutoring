import Link from 'next/link'
import { ArrowRight, Check } from './icons'
import { FORMAT_LABEL, MODE_LABEL, levelRange, money } from '../lib/format'

export function ProgramCard({ p, currency }: { p: any; currency: string }) {
  return (
    <Link className="bp-card" href={`/programs/${p.slug}`}>
      <div className="bp-card-img" style={p.image ? { backgroundImage: `url(${p.image})` } : undefined} />
      <div className="bp-card-body">
        <h3>{p.name}</h3>
        <p>{p.summary}</p>
        <div className="bp-card-meta">
          <span>{levelRange(p.levelsFrom, p.levelsTo)}</span>
          <span>{FORMAT_LABEL[p.format] || p.format}</span>
          <span>{(p.deliveryModes || []).map((m: string) => MODE_LABEL[m]).join(', ')}</span>
          {p.fromPrice && p.fromPrice < Number.MAX_SAFE_INTEGER ? <span className="bp-strong">From {money(p.fromPrice, currency)}</span> : null}
        </div>
        <ArrowRight className="bp-card-arrow" />
      </div>
    </Link>
  )
}

export function Stars({ rating, count }: { rating: number | null; count?: number }) {
  if (!rating) return null
  const full = Math.round(rating)
  return (
    <span className="bp-stars" aria-label={`Rated ${rating} out of 5${count ? ` from ${count} reviews` : ''}`}>
      {'★'.repeat(full)}{'☆'.repeat(5 - full)} <span className="bp-muted bp-small">{rating}{count ? ` (${count})` : ''}</span>
    </span>
  )
}

export function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

export function Avatar({ name, photo, large }: { name: string; photo?: string | null; large?: boolean }) {
  return (
    <span className={`bp-avatar${large ? ' is-large' : ''}`} style={photo ? { backgroundImage: `url(${photo})` } : undefined} aria-hidden="true">
      {photo ? null : initials(name)}
    </span>
  )
}

export function TutorCard({ t }: { t: any }) {
  return (
    <Link className="bp-person" href={`/tutors/${t.slug}`}>
      <Avatar name={t.displayName} photo={t.photo} />
      <div>
        <h3>{t.displayName}</h3>
        <p>{t.headline}</p>
        <p>{(t.subjects || []).map((s: any) => s.name).join(', ')}</p>
        <p>{(t.deliveryModes || []).map((m: string) => MODE_LABEL[m]).join(' · ')}{t.yearsExperience ? ` · ${t.yearsExperience} years` : ''}</p>
        <Stars rating={t.averageRating} count={t.reviewCount} />
      </div>
    </Link>
  )
}

export function PlanTile({ plan, currency, href, cta = 'Choose plan' }: { plan: any; currency: string; href?: string; cta?: string }) {
  return (
    <div className={`bp-price${plan.highlight ? ' is-highlight' : ''}`}>
      {plan.highlight ? <span className="bp-price-tag">Most chosen</span> : null}
      <h3>{plan.name}</h3>
      <div className="bp-price-amount">{money(plan.price, currency)}<small> / month</small></div>
      <div className="bp-small bp-muted">
        {plan.sessionsPerPeriod ? `${plan.sessionsPerPeriod} sessions a month` : `Unlimited, up to ${plan.weeklyCapForUnlimited || 5} a week`}
        {plan.enrolmentFee ? ` · ${money(plan.enrolmentFee, currency)} enrolment fee` : ''}
        {plan.minimumTermMonths ? ` · ${plan.minimumTermMonths}-month minimum` : ''}
      </div>
      {plan.features?.length ? <ul>{plan.features.map((f: string) => <li key={f}>{f}</li>)}</ul> : null}
      {href ? <Link className={`bp-btn is-small${plan.highlight ? ' is-primary' : ''}`} href={href}>{cta}</Link> : null}
    </div>
  )
}

export function PackageTile({ pack, currency, href, cta = 'Choose package' }: { pack: any; currency: string; href?: string; cta?: string }) {
  return (
    <div className="bp-price">
      <h3>{pack.name}</h3>
      <div className="bp-price-amount">{money(pack.price, currency)}</div>
      <div className="bp-small bp-muted">
        {pack.hours} hours · {money(pack.pricePerHour, currency)} an hour{pack.expiryMonths ? ` · use within ${pack.expiryMonths} months` : ''}
      </div>
      {pack.description ? <p className="bp-small">{pack.description}</p> : null}
      {href ? <Link className="bp-btn is-small" href={href}>{cta}</Link> : null}
    </div>
  )
}

export function Ticks({ items }: { items: string[] }) {
  return <ul className="bp-list">{items.map((t) => <li key={t}><Check />{t}</li>)}</ul>
}

export function Quote({ r }: { r: any }) {
  return (
    <figure className="bp-panel" style={{ margin: 0 }}>
      <Stars rating={r.rating} />
      <blockquote style={{ margin: '8px 0 0', fontStyle: 'italic', fontSize: 15 }}>“{r.text}”</blockquote>
      <figcaption className="bp-small bp-muted" style={{ marginTop: 8 }}>— {r.authorName}{r.program ? `, ${r.program.name}` : ''}</figcaption>
    </figure>
  )
}

/** Renders a Keystone document field (paragraphs, headings, lists) as plain markup. */
export function DocumentText({ doc }: { doc: any }) {
  if (!Array.isArray(doc)) return null
  const text = (n: any): string => (n.text !== undefined ? n.text : (n.children || []).map(text).join(''))
  return (
    <div className="bp-prose">
      {doc.map((n: any, i: number) => {
        if (n.type === 'heading') return <h3 key={i} style={{ margin: '18px 0 6px' }}>{text(n)}</h3>
        if (n.type === 'unordered-list' || n.type === 'ordered-list') return <ul key={i}>{(n.children || []).map((li: any, j: number) => <li key={j}>{text(li)}</li>)}</ul>
        return <p key={i}>{text(n)}</p>
      })}
    </div>
  )
}
