import Link from 'next/link'
import { getBusiness, getPrograms, getViewer } from '../lib/data'
import { Logo } from '../components/marks'
import { Chevron, Facebook, Instagram, MenuIcon, Tiktok, Youtube } from '../components/icons'

/** Header + footer around every storefront page. Navigation comes from the programme records. */
export async function StorefrontShell({ children }: { children: React.ReactNode }) {
  const [business, programs, viewer] = await Promise.all([getBusiness(), getPrograms(), getViewer()])
  const name = business?.name || 'Tutoring'
  const all: any[] = programs.value?.programs ?? []
  const featured: any[] = (business?.featuredPrograms ?? []).slice(0, 2)
  const signedIn = Boolean(viewer)
  const accountHref = viewer?.role?.canAccessDashboard ? '/dashboard' : '/account'

  const resources = [
    { href: '/pricing', label: 'Pricing', note: 'Plans, packages and fees' },
    { href: '/schedule', label: 'Class schedule', note: 'Open group sessions this month' },
    { href: '/policies', label: 'Policies', note: 'Cancellations, make-ups and refunds' },
  ]
  const about = [
    { href: '/tutors', label: 'Our tutors', note: 'Profiles, subjects and reviews' },
    { href: '/locations', label: 'Locations', note: 'Centres, hours and directions' },
    { href: '/contact', label: 'Contact us', note: 'Ask a question or request a tutor' },
  ]

  return (
    <div className="bp">
      <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
      <header className="bp-header">
        <div className="bp-wrap bp-header-in">
          <Link href="/" aria-label={`${name} home`}><Logo name={name} /></Link>
          <nav className="bp-nav" aria-label="Main">
            {featured.map((p) => (
              <div className="bp-nav-drop" key={p.id}>
                <button type="button" aria-haspopup="true">{p.name}<Chevron /></button>
                <div className="bp-nav-menu">
                  <Link href={`/programs/${p.slug}`}>Overview<small>{p.summary}</small></Link>
                  <Link href={`/programs/${p.slug}#prices`}>Plans and prices</Link>
                  <Link href={`/assessment?program=${p.slug}`}>{p.requiresAssessment ? 'Book a diagnostic' : 'Get started'}</Link>
                </div>
              </div>
            ))}
            <div className="bp-nav-drop">
              <button type="button" aria-haspopup="true">Programs<Chevron /></button>
              <div className="bp-nav-menu">
                {all.map((p) => <Link key={p.id} href={`/programs/${p.slug}`}>{p.name}</Link>)}
                <Link href="/programs"><span className="bp-accent">All programs</span></Link>
              </div>
            </div>
            <div className="bp-nav-drop">
              <button type="button" aria-haspopup="true">Resources<Chevron /></button>
              <div className="bp-nav-menu">{resources.map((r) => <Link key={r.href} href={r.href}>{r.label}<small>{r.note}</small></Link>)}</div>
            </div>
            <div className="bp-nav-drop">
              <button type="button" aria-haspopup="true">About<Chevron /></button>
              <div className="bp-nav-menu">{about.map((r) => <Link key={r.href} href={r.href}>{r.label}<small>{r.note}</small></Link>)}</div>
            </div>
          </nav>
          <div className="bp-head-actions">
            {signedIn ? <Link className="bp-btn" href={accountHref}>My Account</Link> : <Link className="bp-btn" href="/account/sign-in">Log In</Link>}
            <Link className="bp-btn is-primary" href="/assessment">Get Started</Link>
          </div>
          <details className="bp-menu">
            <summary aria-label="Menu"><MenuIcon /></summary>
            <div className="bp-menu-panel">
              <Link href="/programs">Programs</Link>
              {all.map((p) => <Link key={p.id} className="bp-menu-sub" href={`/programs/${p.slug}`}>{p.name}</Link>)}
              {[...resources, ...about].map((r) => <Link key={r.href} href={r.href}>{r.label}</Link>)}
              {signedIn ? <Link className="bp-btn" href={accountHref}>My Account</Link> : <Link className="bp-btn" href="/account/sign-in">Log In</Link>}
              <Link className="bp-btn is-primary" href="/assessment">Get Started</Link>
            </div>
          </details>
        </div>
      </header>
      <main id="main">{children}</main>
      <Footer business={business} featured={featured} />
    </div>
  )
}

function Footer({ business, featured }: { business: any; featured: any[] }) {
  const name = business?.name || 'Tutoring'
  const social = business?.socialLinks ?? {}
  const socials = [
    { key: 'instagram', Icon: Instagram, label: 'Instagram' },
    { key: 'youtube', Icon: Youtube, label: 'YouTube' },
    { key: 'tiktok', Icon: Tiktok, label: 'TikTok' },
    { key: 'facebook', Icon: Facebook, label: 'Facebook' },
  ].filter((s) => typeof social[s.key] === 'string' && /^https:\/\//.test(social[s.key]))
  return (
    <footer className="bp-footer">
      <div className="bp-wrap bp-footer-main">
        <Link href="/" aria-label={`${name} home`}><Logo name={name} footer /></Link>
        <nav className="bp-footer-nav" aria-label="Footer">
          {featured.map((p) => <Link key={p.id} href={`/programs/${p.slug}`}>{p.name}</Link>)}
          <Link href="/programs">Programs</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/locations">Locations</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        {socials.length ? (
          <div className="bp-social">
            {socials.map(({ key, Icon, label }) => <a key={key} href={social[key]} target="_blank" rel="noopener noreferrer" aria-label={label}><Icon /></a>)}
          </div>
        ) : null}
      </div>
      <div className="bp-footer-small">
        <div className="bp-wrap">
          <Link href="/policies">Policies</Link>
          <Link href="/schedule">Class schedule</Link>
          <Link href="/tutors">Tutors</Link>
          {business?.careersEmail ? <a href={`mailto:${business.careersEmail}`}>Work with us</a> : null}
          {business?.phone ? <a href={`tel:${business.phone.replace(/[^\d+]/g, '')}`}>{business.phone}</a> : null}
          <a href="/dashboard">Staff and tutor sign in</a>
          <span>© {new Date().getFullYear()} {business?.legalName || name}</span>
        </div>
      </div>
    </footer>
  )
}
