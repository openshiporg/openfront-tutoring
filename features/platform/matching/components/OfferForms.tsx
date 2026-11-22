'use client'
import { Input } from '@/components/ui/input'
import { DrawerForm, Field } from '@/features/platform/lib/forms'
import { sendMatchOffer, withdrawMatchOffer } from '../actions/matching'
export function SendOffer({ enrollmentId, tutorId }: { enrollmentId: string; tutorId: string }) {
  return <DrawerForm trigger="Send offer" title="Send tutor offer" description="Uses the fitting preferred times shown here. The tutor must accept before sessions are booked." action={sendMatchOffer}>
    <input type="hidden" name="enrollmentId" value={enrollmentId} /><input type="hidden" name="tutorId" value={tutorId} /><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
  </DrawerForm>
}
export function WithdrawOffer({ offerId }: { offerId: string }) {
  return <DrawerForm trigger="Withdraw" title="Withdraw offer" action={withdrawMatchOffer}>
    <input type="hidden" name="offerId" value={offerId} /><input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
    <Field id={`reason-${offerId}`} label="Reason"><Input id={`reason-${offerId}`} name="reason" /></Field>
  </DrawerForm>
}
