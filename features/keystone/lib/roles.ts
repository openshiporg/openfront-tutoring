/** Seeded roles (§5.1). Plain module. */
const all = {
  canAccessDashboard: true, canManageSettings: true, canManageStaff: true, canManageLocations: true,
  canManagePrograms: true, canManageLeads: true, canManageFamilies: true, canManageSchedule: true,
  canMarkAttendance: true, canManageBilling: true, canIssueRefunds: true, canManagePayroll: true,
  canViewReports: true, canManageTutors: true, isTutor: false,
  canSeeOtherPeople: true, canEditOtherPeople: true, canManagePeople: true, canManageRoles: true,
}

export const ROLE_TEMPLATES = {
  Owner: { name: 'Owner', ...all },
  Manager: {
    name: 'Manager', canAccessDashboard: true, canManageStaff: true, canManagePrograms: true, canManageLeads: true,
    canManageFamilies: true, canManageSchedule: true, canMarkAttendance: true, canManageBilling: true,
    canIssueRefunds: true, canManagePayroll: true, canViewReports: true, canManageTutors: true, canSeeOtherPeople: true,
  },
  'Front desk': {
    name: 'Front desk', canAccessDashboard: true, canManageLeads: true, canManageFamilies: true,
    canManageSchedule: true, canMarkAttendance: true, canManageBilling: true,
  },
  Tutor: { name: 'Tutor', canAccessDashboard: true, canMarkAttendance: true, isTutor: true },
  Customer: { name: 'Customer' },
} as const

export type RoleTemplateName = keyof typeof ROLE_TEMPLATES
