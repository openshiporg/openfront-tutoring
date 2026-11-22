/** Navigation hints only; list access and domain commands remain the authority. */
export type PlatformRole = Partial<Record<'canAccessDashboard' | 'canManageSettings' | 'canManageLeads' | 'canManageFamilies' | 'canManageSchedule' | 'canManageBilling' | 'canManagePayroll' | 'canManageTutors' | 'canManagePrograms' | 'canViewReports' | 'canMarkAttendance' | 'isTutor', boolean>>
type Item = { title: string; slug: string; flag: keyof PlatformRole }
const GROUPS: Array<{ title: string; items: Item[] }> = [
  { title: 'Daily work', items: [
    { title: 'Today', slug: 'today', flag: 'canMarkAttendance' }, { title: 'My tutoring', slug: 'my', flag: 'isTutor' },
    { title: 'Schedule', slug: 'schedule', flag: 'canManageSchedule' }, { title: 'Tasks', slug: 'tasks', flag: 'canAccessDashboard' },
  ] },
  { title: 'Families and learning', items: [
    { title: 'Leads', slug: 'leads', flag: 'canManageLeads' }, { title: 'Assessments', slug: 'assessments', flag: 'canManageFamilies' },
    { title: 'Families', slug: 'families', flag: 'canManageFamilies' }, { title: 'Students', slug: 'students', flag: 'canMarkAttendance' },
    { title: 'Enrolments', slug: 'enrolments', flag: 'canManageFamilies' }, { title: 'Matching', slug: 'matching', flag: 'canManageTutors' },
    { title: 'Progress', slug: 'progress', flag: 'canMarkAttendance' },
  ] },
  { title: 'Money and team', items: [
    { title: 'Memberships', slug: 'memberships', flag: 'canManagePayroll' }, { title: 'Billing', slug: 'billing', flag: 'canManageBilling' },
    { title: 'Tutors', slug: 'tutors', flag: 'canManageTutors' }, { title: 'Applications', slug: 'applications', flag: 'canManageTutors' },
    { title: 'Payroll', slug: 'payroll', flag: 'canManagePayroll' }, { title: 'Reports', slug: 'reports', flag: 'canViewReports' },
  ] },
  { title: 'Business', items: [
    { title: 'Programmes', slug: 'programs', flag: 'canManagePrograms' }, { title: 'Locations', slug: 'locations', flag: 'canManageSettings' },
    { title: 'Settings', slug: 'settings', flag: 'canManageSettings' }, { title: 'First-run setup', slug: 'onboarding', flag: 'canManageSettings' },
  ] },
]
export function platformNavigation(role?: PlatformRole | null) {
  if (!role?.canAccessDashboard) return []
  return GROUPS.map(g => ({ title: g.title, items: g.items.filter(i => role.canManageSettings || role[i.flag]).map(i => ({ title: i.title, href: `/dashboard/platform/${i.slug}` })) })).filter(g => g.items.length)
}
