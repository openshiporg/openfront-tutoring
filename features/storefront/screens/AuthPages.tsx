import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { getViewer } from '../lib/data'
import { RegisterForm, ResetRedeemForm, ResetRequestForm, SignInForm } from '../components/AuthForms'
import { PageHead } from '../components/states'

type SP = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''
const safe = (v: string) => (v.startsWith('/') && !v.startsWith('//') ? v : '')

function Shell({ title, lead, children }: { title: string; lead?: string; children: React.ReactNode }) {
  return (
    <>
      <PageHead title={title} lead={lead} />
      <section className="bp-body"><div className="bp-wrap bp-narrow" style={{ maxWidth: 520 }}>{children}</div></section>
    </>
  )
}

export async function SignInPage({ searchParams }: { searchParams: SP }) {
  const next = safe(one((await searchParams).next))
  const viewer = await getViewer()
  if (viewer) redirect(next || (viewer.role?.canAccessDashboard ? '/dashboard' : '/account'))
  return <Shell title="Sign in" lead="See your schedule, progress reports and invoices."><SignInForm next={next} /></Shell>
}

export async function RegisterPage({ searchParams }: { searchParams: SP }) {
  const next = safe(one((await searchParams).next))
  if (await getViewer()) redirect(next || '/account')
  return <Shell title="Create a family account" lead="One account for every child in your family."><RegisterForm next={next} idempotencyKey={randomUUID()} /></Shell>
}

export async function ResetPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const token = one(sp.token)
  return token
    ? <Shell title="Set your password"><ResetRedeemForm token={token} email={one(sp.email)} /></Shell>
    : <Shell title="Reset your password" lead="We will email you a link to set a new one."><ResetRequestForm /></Shell>
}
