'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { redeemResetAction, registerAction, requestResetAction, signInAction, type ActionState } from '../lib/actions'

const initial: ActionState = { ok: false, error: null }
const Err = ({ s }: { s: ActionState }) => (s.error ? <div className="bp-notice is-error" role="alert">{s.error}</div> : null)

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, initial)
  return (
    <form action={action} className="bp-form bp-panel">
      <input type="hidden" name="next" value={next} />
      <label className="bp-field"><span>Email</span><input className="bp-input" type="email" name="email" required autoComplete="email" /></label>
      <label className="bp-field"><span>Password</span><input className="bp-input" type="password" name="password" required autoComplete="current-password" /></label>
      <Err s={state} />
      <button className="bp-btn is-primary" type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      <p className="bp-small"><Link className="bp-accent" href="/account/reset">Forgot your password?</Link></p>
      <p className="bp-small bp-muted">New here? <Link className="bp-accent" href={`/account/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>Create a family account</Link> or <Link className="bp-accent" href="/assessment">book an assessment</Link>; we set up the account for you.</p>
    </form>
  )
}

export function RegisterForm({ next, idempotencyKey }: { next: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(registerAction, initial)
  return (
    <form action={action} className="bp-form bp-panel">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="bp-field"><span>Your name</span><input className="bp-input" name="name" required autoComplete="name" /></label>
      <label className="bp-field"><span>Email</span><input className="bp-input" type="email" name="email" required autoComplete="email" /></label>
      <label className="bp-field"><span>Phone <small>(optional)</small></span><input className="bp-input" type="tel" name="phone" autoComplete="tel" /></label>
      <label className="bp-field"><span>Password</span><input className="bp-input" type="password" name="password" required minLength={8} autoComplete="new-password" /><small className="bp-muted">At least 8 characters.</small></label>
      <Err s={state} />
      <button className="bp-btn is-primary" type="submit" disabled={pending}>{pending ? 'Creating your account…' : 'Create account'}</button>
      <p className="bp-small bp-muted">Already registered? <Link className="bp-accent" href="/account/sign-in">Sign in</Link>.</p>
    </form>
  )
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(requestResetAction, initial)
  if (state.ok) return <div className="bp-panel" role="status"><h2 style={{ fontSize: 22 }}>Check your email</h2><p style={{ marginTop: 8 }}>If an account uses that address, a link to set a new password is on its way. It works for one hour.</p></div>
  return (
    <form action={action} className="bp-form bp-panel">
      <label className="bp-field"><span>Email</span><input className="bp-input" type="email" name="email" required autoComplete="email" /></label>
      <Err s={state} />
      <button className="bp-btn is-primary" type="submit" disabled={pending}>{pending ? 'Sending…' : 'Email me a link'}</button>
      <p className="bp-small"><Link className="bp-accent" href="/account/sign-in">Back to sign in</Link></p>
    </form>
  )
}

export function ResetRedeemForm({ email, token }: { email: string; token: string }) {
  const [state, action, pending] = useActionState(redeemResetAction, initial)
  if (state.ok) return <div className="bp-panel" role="status"><h2 style={{ fontSize: 22 }}>Password saved</h2><p style={{ marginTop: 8 }}><Link className="bp-accent" href="/account/sign-in">Sign in</Link> with your new password.</p></div>
  return (
    <form action={action} className="bp-form bp-panel">
      <input type="hidden" name="token" value={token} />
      {email ? (<><input type="hidden" name="email" value={email} /><p className="bp-small bp-muted">Setting the password for {email}.</p></>) : (
        <label className="bp-field"><span>Your email</span><input className="bp-input" type="email" name="email" required autoComplete="email" /></label>
      )}
      <label className="bp-field"><span>New password</span><input className="bp-input" type="password" name="password" required minLength={8} autoComplete="new-password" /></label>
      <label className="bp-field"><span>Type it again</span><input className="bp-input" type="password" name="confirm" required minLength={8} autoComplete="new-password" /></label>
      <Err s={state} />
      <button className="bp-btn is-primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save password'}</button>
    </form>
  )
}
