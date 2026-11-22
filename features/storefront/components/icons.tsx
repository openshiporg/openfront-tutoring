import type { SVGProps } from 'react'

/** Line icons drawn to match the picked design (1.8px strokes, round caps). */
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
type P = SVGProps<SVGSVGElement>

export const ArrowRight = (p: P) => (<svg viewBox="0 0 24 24" {...base} strokeWidth={2.2} aria-hidden="true" {...p}><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></svg>)
export const Check = (p: P) => (<svg viewBox="0 0 24 24" {...base} strokeWidth={2.6} aria-hidden="true" {...p}><path d="M4 12.5l5 5L20 6.5" /></svg>)
export const Chevron = (p: P) => (<svg viewBox="0 0 24 24" {...base} strokeWidth={2.4} aria-hidden="true" {...p}><path d="M6 9l6 6 6-6" /></svg>)
export const MenuIcon = (p: P) => (<svg viewBox="0 0 24 24" {...base} strokeWidth={2.2} aria-hidden="true" {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>)

export const Cap = (p: P) => (
  <svg viewBox="0 0 64 48" {...base} strokeWidth={2.4} aria-hidden="true" {...p}>
    <path d="M6 16l26-10 26 10-26 10z" /><path d="M16 21v11c0 4 7 8 16 8s16-4 16-8V21" /><path d="M54 18v14" /><path d="M54 32l-2 6h4z" />
  </svg>
)
export const Laptop = (p: P) => (
  <svg viewBox="0 0 64 48" {...base} strokeWidth={2.4} aria-hidden="true" {...p}>
    <rect x="12" y="8" width="40" height="26" rx="2" /><path d="M4 40h56l-4-6H8z" />
  </svg>
)
export const Chart = (p: P) => (
  <svg viewBox="0 0 64 48" {...base} strokeWidth={2.4} aria-hidden="true" {...p}>
    <path d="M14 44V36" /><path d="M24 44V30" /><path d="M34 44V24" /><path d="M44 44V18" /><path d="M54 44V12" />
    <path d="M8 34l14-10 8 4 22-20" /><path d="M44 8h8v8" />
  </svg>
)
export const People = (p: P) => (
  <svg viewBox="0 0 64 48" {...base} strokeWidth={2.4} aria-hidden="true" {...p}>
    <circle cx="20" cy="14" r="6" /><circle cx="34" cy="12" r="6.5" /><circle cx="48" cy="16" r="5.5" />
    <path d="M8 36c0-7 5-12 12-12 3 0 5 1 7 2" /><path d="M22 36c0-8 5-14 12-14s12 6 12 14" /><path d="M42 26c1.5-1 3.5-2 6-2 6 0 10 4 10 11" />
  </svg>
)

export const Instagram = (p: P) => (<svg viewBox="0 0 24 24" {...base} strokeWidth={2} aria-hidden="true" {...p}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>)
export const Youtube = (p: P) => (<svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path fill="currentColor" d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.4-1.2.4-3.8.4-3.8s0-2.6-.4-3.8zM10 15.1V8.9l5.2 3.1z" /></svg>)
export const Tiktok = (p: P) => (<svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path fill="currentColor" d="M16.6 2h-3.3v13.3a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V9.1a6.3 6.3 0 1 0 5.3 6.2V8.6a7.7 7.7 0 0 0 4.5 1.4V6.7a4.5 4.5 0 0 1-4.5-4.7z" /></svg>)
export const Facebook = (p: P) => (<svg viewBox="0 0 24 24" aria-hidden="true" {...p}><path fill="currentColor" d="M14 8.5V6.8c0-.8.5-1 .9-1h2.4V2.1L14 2c-3.6 0-4.4 2.7-4.4 4.4v2.1H7.4v3.8h2.2V22H14v-9.7h3l.4-3.8z" /></svg>)
