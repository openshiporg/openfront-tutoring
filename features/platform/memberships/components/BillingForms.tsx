'use client'
import { DrawerForm } from '@/features/platform/lib/forms'
import { membershipBillingAction, reconcileAttemptAction } from '../actions/memberships'
export function RunBilling({ membershipId }: { membershipId?: string }) {
  return <DrawerForm trigger={membershipId ? 'Bill / retry' : 'Run due billing'} title="Run membership billing" description="Runs the real saved-card billing path. Unknown outcomes must be reconciled before another charge." action={membershipBillingAction}><input type="hidden" name="membershipId" value={membershipId || ''} /></DrawerForm>
}
export function ReconcileAttempt({ id }: { id: string }) {
  return <DrawerForm trigger="Reconcile unknown" title="Reconcile billing attempt" action={reconcileAttemptAction}><input type="hidden" name="attemptId" value={id} /></DrawerForm>
}
