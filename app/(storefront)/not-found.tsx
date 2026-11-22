import Link from 'next/link'
import '@/features/storefront/styles/brightpath.css'

export default function NotFound() {
  return (
    <div className="bp"><main className="bp-body"><div className="bp-wrap bp-narrow">
      <div className="bp-empty"><b>We could not find that page</b>It may have moved. <Link className="bp-accent" href="/">Go to the home page</Link> or <Link className="bp-accent" href="/programs">see all programs</Link>.</div>
    </div></main></div>
  )
}
