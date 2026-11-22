/** Hand-drawn marks from the picked design: rising-sun logo, underline, spark and path. */

export function SunMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 58 32" fill="none" aria-hidden="true">
      <path d="M8 29h42" stroke="#f26a1b" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M17 27.5a12 12 0 0 1 24 0" stroke="#f26a1b" strokeWidth="3.2" strokeLinecap="round" />
      <g stroke="#f26a1b" strokeWidth="3" strokeLinecap="round">
        <path d="M29 3v8" /><path d="M18.5 6.5l3.6 6.6" /><path d="M39.5 6.5l-3.6 6.6" />
        <path d="M10 13l6.2 4.4" /><path d="M48 13l-6.2 4.4" /><path d="M4 21.5l7 1.4" /><path d="M54 21.5l-7 1.4" />
      </g>
    </svg>
  )
}

export function Logo({ name, footer = false }: { name: string; footer?: boolean }) {
  const [first, ...rest] = name.split(' ')
  if (footer) {
    return (
      <span className="bp-footer-logo">
        <SunMark />
        <span><b>{first}</b> {rest.join(' ')}</span>
      </span>
    )
  }
  return (
    <span className="bp-logo">
      <SunMark />
      <span className="bp-logo-words"><b>{first}</b>{rest.length ? <span>{rest.join(' ')}</span> : null}</span>
    </span>
  )
}

export function Underline() {
  return (
    <svg viewBox="0 0 300 16" preserveAspectRatio="none" aria-hidden="true">
      <path d="M4 12C70 3 190 1 296 9" stroke="#f26a1b" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  )
}

export function Spark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 66 66" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="5" strokeLinecap="round">
        <path d="M14 4l-7 22" /><path d="M42 12L22 34" /><path d="M60 40l-28 6" />
      </g>
    </svg>
  )
}

/** The orange road climbing to a sunrise, from the closing band. */
export function SummitPath({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 220" fill="none" aria-hidden="true">
      <g stroke="#f26a1b" strokeWidth="4" strokeLinecap="round">
        <path d="M118 6v18" /><path d="M96 14l7 14" /><path d="M140 14l-7 14" /><path d="M80 30l12 8" /><path d="M156 30l-12 8" />
      </g>
      <path d="M118 46c-14 8 20 22 6 38-14 16-58 20-62 44-4 26 60 30 24 56-18 13-60 22-84 30" stroke="#f26a1b" strokeWidth="9" strokeLinecap="round" fill="none" />
    </svg>
  )
}
