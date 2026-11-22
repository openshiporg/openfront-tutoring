'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOutAction } from '../lib/actions'

const LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/account/schedule', label: 'Schedule' },
  { href: '/account/book', label: 'Book a session' },
  { href: '/account/progress', label: 'Progress' },
  { href: '/account/credits', label: 'Hours and packages' },
  { href: '/account/billing', label: 'Billing' },
  { href: '/account/settings', label: 'Family and card' },
]

export function AccountNav() {
  const path = usePathname() ?? ''
  return (
    <nav className="bp-account-nav" aria-label="Account">
      {LINKS.map((l) => {
        const active = l.href === '/account' ? path === '/account' : path.startsWith(l.href)
        return <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined}>{l.label}</Link>
      })}
      <form action={signOutAction}><button className="bp-btn is-link" type="submit">Sign out</button></form>
    </nav>
  )
}
