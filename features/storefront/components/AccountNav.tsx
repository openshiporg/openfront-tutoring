'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOutAction } from '../lib/actions'

const LINKS: Array<{ href: string; label: string; also?: string[] }> = [
  { href: '/account', label: 'Overview' },
  { href: '/account/schedule', label: 'Schedule', also: ['/account/bookings'] },
  { href: '/account/book', label: 'Book a session' },
  { href: '/account/progress', label: 'Progress' },
  { href: '/account/credits', label: 'Hours and packages' },
  { href: '/account/billing', label: 'Billing' },
  { href: '/account/profile', label: 'Profile and card' },
]

export function AccountNav() {
  const path = usePathname() ?? ''
  return (
    <nav className="bp-account-nav" aria-label="Account">
      {LINKS.map((l) => {
        // Whole path segments only: /account/bookings/x is under Schedule, not "Book a session".
        const under = (base: string) => path === base || path.startsWith(base + '/')
        const active = l.href === '/account' ? path === '/account' : under(l.href) || (l.also ?? []).some(under)
        return <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined}>{l.label}</Link>
      })}
      <form action={signOutAction}><button className="bp-btn is-link" type="submit">Sign out</button></form>
    </nav>
  )
}
