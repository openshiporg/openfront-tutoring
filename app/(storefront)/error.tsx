'use client'
import '@/features/storefront/styles/brightpath.css'

export default function StorefrontError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="bp"><main className="bp-body" role="alert"><div className="bp-wrap bp-narrow">
      <div className="bp-empty"><b>This page could not load</b>Nothing was changed. Try again in a moment.
        <div style={{ marginTop: 14 }}><button className="bp-btn is-primary" type="button" onClick={reset}>Try again</button></div>
      </div>
    </div></main></div>
  )
}
