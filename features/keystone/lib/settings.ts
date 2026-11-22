/** BusinessSettings singleton (§0 D4–D8). Every number has a working default. */
export const DEFAULT_SETTINGS = {
  cancellationWindowHours: 24,
  lateCancelCharged: true,
  noShowCharged: true,
  excusedAbsencesPerMonth: 1,
  makeUpExpiryDays: 60,
  membershipRolloverPeriods: 1,
  membershipCancelNoticeDays: 30,
  pauseMinDays: 14,
  pauseMaxDays: 28,
  pausesPerYear: 1,
  pastDueRetryDays: [3, 7] as number[],
  suspendAfterDays: 10,
  siblingDiscountPercent: 10,
  offerExpiryHours: 24,
  freeRematches: 1,
  trialChargedOnRematch: false,
  tutorPaidOnLateCancelPercent: 100,
  tutorPaidOnNoShowPercent: 100,
  payrollPeriodDays: 14,
  progressReportEverySessions: 12,
  progressReportEveryWeeks: 4,
  reassessEveryWeeks: 12,
  lowBalanceMinutes: 120,
  bookingHorizonDays: 42,
  attendanceEditWindowHours: 48,
  assessmentCancelRefundHours: 24,
  assessmentFeeKeptOnLateCancel: true,
  enrolmentFeeWaivedWithinDays: 90,
  frontDeskRefundLimit: 0,
  reopenWindowDays: 14,
  policiesText: '',
  jobsSecretHash: '',
  lastDailyJobsAt: null as Date | null,
}

export type Settings = typeof DEFAULT_SETTINGS

export async function getSettings(db: any): Promise<Settings> {
  const row = await db.businessSettings.findUnique({ where: { id: 1 } })
  const merged: any = { ...DEFAULT_SETTINGS }
  if (row) for (const key of Object.keys(DEFAULT_SETTINGS)) if (row[key] !== null && row[key] !== undefined) merged[key] = row[key]
  if (!Array.isArray(merged.pastDueRetryDays)) merged.pastDueRetryDays = DEFAULT_SETTINGS.pastDueRetryDays
  return merged
}

export async function getBusiness(db: any) {
  const row = await db.business.findUnique({ where: { id: 1 } })
  return row ?? { id: 1, name: '', currency: 'USD', country: 'US', nextInvoiceNumber: 1001, supportEmail: '', careersEmail: '' }
}

export const HOUR = 3600_000
export const DAY = 24 * HOUR
