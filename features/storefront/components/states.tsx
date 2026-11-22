import Link from 'next/link'

export function NotSetUp() {
  return (
    <section className="bp-body">
      <div className="bp-wrap bp-narrow">
        <div className="bp-empty">
          <b>This site is being set up</b>
          The business details have not been entered yet. If you run this centre, <a className="bp-accent" href="/dashboard">sign in to the dashboard</a> to finish onboarding.
        </div>
      </div>
    </section>
  )
}

export function LoadError({ message }: { message?: string | null }) {
  return (
    <div className="bp-notice is-error" role="alert">
      {message || 'This part of the page could not load.'} Refresh to try again.
    </div>
  )
}

export function PageHead({ title, lead, crumbs }: { title: string; lead?: React.ReactNode; crumbs?: Array<{ href: string; label: string }> }) {
  return (
    <div className="bp-page-head">
      <div className="bp-wrap">
        {crumbs?.length ? (
          <nav className="bp-crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <span key={c.href}>{i > 0 ? '/ ' : ''}<Link href={c.href}>{c.label}</Link></span>
            ))}
          </nav>
        ) : null}
        <h1>{title}</h1>
        {lead ? <p>{lead}</p> : null}
      </div>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="bp-empty"><b>{title}</b>{children}</div>
}
