"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all2) => {
  for (var name in all2)
    __defProp(target, name, { get: all2[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core14 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/identity.ts
var import_core = require("@keystone-6/core");
var import_access2 = require("@keystone-6/core/access");
var import_fields3 = require("@keystone-6/core/fields");

// features/keystone/access.ts
var ROLE_FLAGS = [
  "canAccessDashboard",
  "canManageSettings",
  "canManageStaff",
  "canManageLocations",
  "canManagePrograms",
  "canManageLeads",
  "canManageFamilies",
  "canManageSchedule",
  "canMarkAttendance",
  "canManageBilling",
  "canIssueRefunds",
  "canManagePayroll",
  "canViewReports",
  "canManageTutors",
  "isTutor",
  "canManagePeople",
  "canManageRoles",
  "canSeeOtherPeople",
  "canEditOtherPeople"
];
var LOCATION_ROLE_CAPABILITIES = {
  manager: ["canAccessDashboard", "canManageLeads", "canManageFamilies", "canManageSchedule", "canMarkAttendance", "canManageBilling", "canIssueRefunds", "canManagePayroll", "canViewReports", "canManageTutors", "canManagePrograms"],
  front_desk: ["canAccessDashboard", "canManageLeads", "canManageFamilies", "canManageSchedule", "canMarkAttendance", "canManageBilling"],
  tutor: ["canAccessDashboard", "canMarkAttendance", "isTutor"]
};
var LOCATION_SCOPED_FLAGS = new Set(LOCATION_ROLE_CAPABILITIES.manager);
function locationRoleAllows(locationRole, flag) {
  if (!LOCATION_SCOPED_FLAGS.has(flag)) return true;
  const caps = LOCATION_ROLE_CAPABILITIES[locationRole || ""];
  return Boolean(caps?.includes(flag));
}
function isSignedIn({ session }) {
  return Boolean(session);
}
function isOwner(session) {
  return Boolean(session?.data.role?.canManageSettings);
}
function hasFlag(session, flag) {
  return Boolean(session?.data.role?.[flag]);
}
function locationIdsFor(session, flag) {
  if (!hasFlag(session, flag)) return [];
  return Array.from(new Set((session?.data.locationMemberships ?? []).filter((m) => m.status === "active" && m.location?.id && m.location.status !== "closed" && locationRoleAllows(m.role, flag)).map((m) => m.location.id))).sort();
}
function staffFilter(session, flag, path = "location") {
  if (!hasFlag(session, flag)) return false;
  if (isOwner(session)) return true;
  const ids = locationIdsFor(session, flag);
  if (!ids.length) return false;
  if (path === "") return { id: { in: ids } };
  if (path.endsWith("[]")) {
    const many = path.slice(0, -2);
    return { OR: [nest(many, { some: { id: { in: ids } } }), nest(many, { none: {} })] };
  }
  return { OR: [nest(path, { id: { in: ids } }), nest(path, null)] };
}
function nest(path, leaf) {
  if (!path) return leaf;
  const keys = path.split(".");
  return keys.reduceRight((acc, key) => ({ [key]: acc }), leaf);
}
function guardianFilter(session, path = "family") {
  if (!session?.itemId) return false;
  return nest(path, { guardians: { some: { id: { equals: session.itemId } } } });
}
function tutorFilter(session, path = "tutor") {
  if (!session?.itemId || !hasFlag(session, "isTutor")) return false;
  return nest(path, { user: { id: { equals: session.itemId } } });
}
function anyOf(...filters) {
  if (filters.some((f) => f === true)) return true;
  const objects = filters.filter((f) => Boolean(f) && typeof f === "object");
  if (!objects.length) return false;
  return objects.length === 1 ? objects[0] : { OR: objects };
}
function staffScope(session, flag, location) {
  if (location === null || location === void 0) return hasFlag(session, flag) && (isOwner(session) || locationIdsFor(session, flag).length > 0 || !LOCATION_SCOPED_FLAGS.has(flag));
  return staffFilter(session, flag, location);
}
function scopedAccess(scope) {
  const tutorRead = (session) => {
    if (!session || !hasFlag(session, "isTutor")) return false;
    if (scope.tutorCustom) return scope.tutorCustom(session);
    return scope.tutor ? withWhere(tutorFilter(session, scope.tutor), scope.tutorWhere) : false;
  };
  const readFilter = ({ session }) => anyOf(
    staffScope(session, scope.read, scope.location),
    scope.guardian ? withWhere(guardianFilter(session, scope.guardian), scope.guardianWhere) : false,
    tutorRead(session)
  );
  const writeFilter = ({ session }) => anyOf(
    scope.write ? staffScope(session, scope.write, scope.location) : false,
    scope.tutorWrite ? tutorRead(session) : false
  );
  const canWrite = ({ session }) => Boolean(scope.write && hasFlag(session, scope.write));
  const canWriteOrTutor = (args) => canWrite(args) || Boolean(scope.tutorWrite && hasFlag(args.session, "isTutor"));
  return {
    operation: {
      query: isSignedIn,
      create: canWriteOrTutor,
      update: canWriteOrTutor,
      delete: (args) => !scope.noDelete && canWrite(args)
    },
    filter: { query: readFilter, update: writeFilter, delete: ({ session }) => scope.write ? staffScope(session, scope.write, scope.location) : false }
  };
}
function withWhere(filter, where) {
  if (!filter || !where) return filter;
  return filter === true ? where : { AND: [filter, where] };
}
var serverOnly = { create: () => false, update: () => false };
function appendOnlyAccess(read, location) {
  return {
    operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false },
    filter: { query: ({ session }) => staffScope(session, read, location) }
  };
}
var permissions = Object.fromEntries(
  ROLE_FLAGS.map((flag) => [flag, ({ session }) => hasFlag(session, flag)])
);
var rules = {
  canReadPeople: ({ session }) => {
    if (!session) return false;
    if (session.data.role?.canSeeOtherPeople || session.data.role?.canManageStaff || session.data.role?.canManageFamilies) return true;
    return { id: { equals: session.itemId } };
  },
  canUpdatePeople: ({ session }) => {
    if (!session) return false;
    if (session.data.role?.canEditOtherPeople) return true;
    return { id: { equals: session.itemId } };
  }
};

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  // Set from the session on create; server commands set it explicitly.
  createdBy: (0, import_fields.relationship)({
    ref: "User",
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } },
    hooks: {
      resolveInput: ({ operation, context, resolvedData }) => {
        if (operation === "create" && context.session?.itemId) return { connect: { id: context.session.itemId } };
        return resolvedData.createdBy;
      }
    }
  })
};

// features/keystone/models/fields.ts
var import_fields2 = require("@keystone-6/core/fields");
var label = (value) => value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
var options = (values) => values.map((value) => ({ value, label: label(value) }));
function statusField(values, defaultValue) {
  return (0, import_fields2.select)({
    type: "string",
    options: options(values),
    defaultValue,
    validation: { isRequired: true },
    isIndexed: true,
    access: serverOnly,
    ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
  });
}
function choice(values, defaultValue, extra = {}) {
  return (0, import_fields2.select)({
    type: "string",
    options: options(values),
    ...defaultValue ? { defaultValue, validation: { isRequired: true } } : {},
    ...extra
  });
}
function publishField(values, defaultValue, flag) {
  const allowed = ({ session }) => hasFlag(session, "canManageSettings") || hasFlag(session, flag);
  return (0, import_fields2.select)({
    type: "string",
    options: options(values),
    defaultValue,
    validation: { isRequired: true },
    isIndexed: true,
    access: { create: allowed, update: allowed }
  });
}
var money = (extra = {}) => (0, import_fields2.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, ...extra });
var signedMoney = () => (0, import_fields2.integer)({ defaultValue: 0, validation: { isRequired: true } });
var serverText = () => (0, import_fields2.text)({ access: serverOnly, ui: { itemView: { fieldMode: "read" }, createView: { fieldMode: "hidden" } } });
var serverTime = () => (0, import_fields2.timestamp)({ access: serverOnly, ui: { itemView: { fieldMode: "read" }, createView: { fieldMode: "hidden" } } });
var serverInt = (defaultValue = 0) => (0, import_fields2.integer)({ defaultValue, access: serverOnly, ui: { itemView: { fieldMode: "read" }, createView: { fieldMode: "hidden" } } });
var serverRel = (ref, many = false) => (0, import_fields2.relationship)({ ref, many, access: serverOnly, ui: { itemView: { fieldMode: "read" }, createView: { fieldMode: "hidden" } } });
var activeKey = () => (0, import_fields2.text)({
  isIndexed: "unique",
  db: { isNullable: true },
  access: { read: () => true, create: () => false, update: () => false },
  ui: { itemView: { fieldMode: "hidden" }, createView: { fieldMode: "hidden" }, listView: { fieldMode: "hidden" } }
});
function prismaExtras(...lines) {
  return (schema) => schema.replace(/\}\s*$/, `${lines.map((line) => `  ${line}`).join("\n")}
}`);
}
var DELIVERY_MODES = ["in_centre", "online", "in_home"];

// features/keystone/models/identity.ts
var ownerOnly = ({ session }) => isOwner(session);
var staffRead = ({ session }) => hasFlag(session, "canAccessDashboard");
var User = (0, import_core.list)({
  access: {
    operation: {
      ...(0, import_access2.allOperations)(isSignedIn),
      // Guardians register through `registerGuardian` (a server mutation); staff are added by managers.
      create: permissions.canManageStaff,
      delete: permissions.canManagePeople
    },
    filter: { query: rules.canReadPeople, update: rules.canUpdatePeople }
  },
  ui: {
    listView: { initialColumns: ["name", "email", "role", "phone"] },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.itemId === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true } }),
    email: (0, import_fields3.text)({ isFilterable: true, isOrderable: true, isIndexed: "unique", validation: { isRequired: true } }),
    password: (0, import_fields3.password)({
      access: {
        read: import_access2.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      validation: { isRequired: true }
    }),
    phone: (0, import_fields3.text)(),
    role: (0, import_fields3.relationship)({
      ref: "Role.assignedTo",
      access: {
        create: ({ session }) => hasFlag(session, "canManageStaff") || hasFlag(session, "canManagePeople"),
        update: ({ session }) => hasFlag(session, "canManageStaff") || hasFlag(session, "canManagePeople")
      }
    }),
    tutor: (0, import_fields3.relationship)({ ref: "Tutor.user", access: { update: permissions.canManageTutors, create: permissions.canManageTutors } }),
    family: (0, import_fields3.relationship)({ ref: "Family.guardians", access: { update: permissions.canManageFamilies, create: permissions.canManageFamilies } }),
    locationMemberships: (0, import_fields3.relationship)({ ref: "LocationMembership.user", many: true, access: { create: permissions.canManageStaff, update: permissions.canManageStaff } }),
    onboardingStatus: (0, import_fields3.select)({
      type: "string",
      options: options(["not_started", "in_progress", "completed", "dismissed"]),
      defaultValue: "not_started",
      access: { update: ownerOnly, create: ownerOnly }
    }),
    notifyByEmail: (0, import_fields3.checkbox)({ defaultValue: true }),
    lastLoginAt: serverTime(),
    ...trackingFields
  }
});
var Role = (0, import_core.list)({
  access: {
    operation: { ...(0, import_access2.allOperations)(permissions.canManageRoles), query: isSignedIn }
  },
  ui: {
    listView: { initialColumns: ["name", "assignedTo"] },
    itemView: { defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read" }
  },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    canAccessDashboard: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageSettings: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageStaff: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageLocations: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManagePrograms: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageLeads: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageFamilies: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageSchedule: (0, import_fields3.checkbox)({ defaultValue: false }),
    canMarkAttendance: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageBilling: (0, import_fields3.checkbox)({ defaultValue: false }),
    canIssueRefunds: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManagePayroll: (0, import_fields3.checkbox)({ defaultValue: false }),
    canViewReports: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageTutors: (0, import_fields3.checkbox)({ defaultValue: false }),
    isTutor: (0, import_fields3.checkbox)({ defaultValue: false }),
    // Starter people/role administration
    canSeeOtherPeople: (0, import_fields3.checkbox)({ defaultValue: false }),
    canEditOtherPeople: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManagePeople: (0, import_fields3.checkbox)({ defaultValue: false }),
    canManageRoles: (0, import_fields3.checkbox)({ defaultValue: false }),
    assignedTo: (0, import_fields3.relationship)({ ref: "User.role", many: true, ui: { itemView: { fieldMode: "read" } } }),
    ...trackingFields
  }
});
var Business = (0, import_core.list)({
  isSingleton: true,
  access: {
    operation: { query: staffRead, create: ownerOnly, update: ownerOnly, delete: () => false }
  },
  graphql: { plural: "Businesses" },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true }, defaultValue: "" }),
    legalName: (0, import_fields3.text)(),
    logo: (0, import_fields3.image)({ storage: "my_images" }),
    currency: (0, import_fields3.text)({ defaultValue: "USD", validation: { isRequired: true, length: { min: 3, max: 3 } } }),
    country: (0, import_fields3.text)({ defaultValue: "US" }),
    supportEmail: (0, import_fields3.text)(),
    careersEmail: (0, import_fields3.text)({ ui: { description: 'Shown as "Work with us" in the storefront footer.' } }),
    phone: (0, import_fields3.text)(),
    brandPrimary: (0, import_fields3.text)({ defaultValue: "#1f5f8b" }),
    brandAccent: (0, import_fields3.text)({ defaultValue: "#f2a541" }),
    about: (0, import_fields3.text)({ ui: { displayMode: "textarea" } }),
    socialLinks: (0, import_fields3.json)({ defaultValue: {} }),
    kind: choice(["centre", "test_prep", "agency", "mixed"], "centre"),
    // Sequential invoice numbers, advanced with a guarded update.
    nextInvoiceNumber: serverInt(1001),
    onboardedAt: serverTime(),
    ...trackingFields
  }
});
var BusinessSettings = (0, import_core.list)({
  isSingleton: true,
  access: {
    operation: { query: staffRead, create: ownerOnly, update: ownerOnly, delete: () => false }
  },
  graphql: { plural: "BusinessSettingsList" },
  fields: {
    cancellationWindowHours: (0, import_fields3.integer)({ defaultValue: 24, validation: { isRequired: true, min: 0 } }),
    lateCancelCharged: (0, import_fields3.checkbox)({ defaultValue: true }),
    noShowCharged: (0, import_fields3.checkbox)({ defaultValue: true }),
    excusedAbsencesPerMonth: (0, import_fields3.integer)({ defaultValue: 1, validation: { isRequired: true, min: 0 } }),
    makeUpExpiryDays: (0, import_fields3.integer)({ defaultValue: 60, validation: { isRequired: true, min: 1 } }),
    membershipRolloverPeriods: (0, import_fields3.integer)({ defaultValue: 1, validation: { isRequired: true, min: 0 } }),
    membershipCancelNoticeDays: (0, import_fields3.integer)({ defaultValue: 30, validation: { isRequired: true, min: 0 } }),
    pauseMinDays: (0, import_fields3.integer)({ defaultValue: 14, validation: { isRequired: true, min: 1 } }),
    pauseMaxDays: (0, import_fields3.integer)({ defaultValue: 28, validation: { isRequired: true, min: 1 } }),
    pausesPerYear: (0, import_fields3.integer)({ defaultValue: 1, validation: { isRequired: true, min: 0 } }),
    pastDueRetryDays: (0, import_fields3.json)({ defaultValue: [3, 7] }),
    suspendAfterDays: (0, import_fields3.integer)({ defaultValue: 10, validation: { isRequired: true, min: 1 } }),
    siblingDiscountPercent: (0, import_fields3.integer)({ defaultValue: 10, validation: { isRequired: true, min: 0, max: 100 } }),
    offerExpiryHours: (0, import_fields3.integer)({ defaultValue: 24, validation: { isRequired: true, min: 1 } }),
    freeRematches: (0, import_fields3.integer)({ defaultValue: 1, validation: { isRequired: true, min: 0 } }),
    trialChargedOnRematch: (0, import_fields3.checkbox)({ defaultValue: false }),
    tutorPaidOnLateCancelPercent: (0, import_fields3.integer)({ defaultValue: 100, validation: { isRequired: true, min: 0, max: 100 } }),
    tutorPaidOnNoShowPercent: (0, import_fields3.integer)({ defaultValue: 100, validation: { isRequired: true, min: 0, max: 100 } }),
    payrollPeriodDays: (0, import_fields3.integer)({ defaultValue: 14, validation: { isRequired: true, min: 1 } }),
    progressReportEverySessions: (0, import_fields3.integer)({ defaultValue: 12, validation: { isRequired: true, min: 1 } }),
    progressReportEveryWeeks: (0, import_fields3.integer)({ defaultValue: 4, validation: { isRequired: true, min: 1 } }),
    reassessEveryWeeks: (0, import_fields3.integer)({ defaultValue: 12, validation: { isRequired: true, min: 1 } }),
    lowBalanceMinutes: (0, import_fields3.integer)({ defaultValue: 120, validation: { isRequired: true, min: 0 } }),
    bookingHorizonDays: (0, import_fields3.integer)({ defaultValue: 42, validation: { isRequired: true, min: 1 } }),
    attendanceEditWindowHours: (0, import_fields3.integer)({ defaultValue: 48, validation: { isRequired: true, min: 1 } }),
    assessmentCancelRefundHours: (0, import_fields3.integer)({ defaultValue: 24, validation: { isRequired: true, min: 0 } }),
    assessmentFeeKeptOnLateCancel: (0, import_fields3.checkbox)({ defaultValue: true }),
    enrolmentFeeWaivedWithinDays: (0, import_fields3.integer)({ defaultValue: 90, validation: { isRequired: true, min: 0 } }),
    frontDeskRefundLimit: (0, import_fields3.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 }, ui: { description: "Largest refund (minor units) front desk may issue. 0 means none." } }),
    reopenWindowDays: (0, import_fields3.integer)({ defaultValue: 14, validation: { isRequired: true, min: 0 } }),
    policiesText: (0, import_fields3.text)({ ui: { displayMode: "textarea" }, defaultValue: "" }),
    // Daily jobs: the secret for POST /api/jobs/daily is generated by onboarding; only its hash is stored.
    jobsSecretHash: (0, import_fields3.text)({ access: { read: import_access2.denyAll, create: () => false, update: () => false }, ui: { itemView: { fieldMode: "hidden" }, createView: { fieldMode: "hidden" }, listView: { fieldMode: "hidden" } } }),
    lastDailyJobsAt: serverTime(),
    ...trackingFields
  }
});
var Location = (0, import_core.list)({
  access: {
    operation: { query: isSignedIn, create: permissions.canManageLocations, update: permissions.canManageLocations, delete: ownerOnly },
    filter: { query: ({ session }) => hasFlag(session, "canAccessDashboard") }
  },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true } }),
    slug: (0, import_fields3.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[a-z0-9-]+$/, explanation: "Use lowercase letters, numbers and dashes." } } }),
    addressLine1: (0, import_fields3.text)(),
    addressLine2: (0, import_fields3.text)(),
    city: (0, import_fields3.text)(),
    region: (0, import_fields3.text)(),
    postalCode: (0, import_fields3.text)(),
    country: (0, import_fields3.text)({ defaultValue: "US" }),
    lat: (0, import_fields3.float)(),
    lng: (0, import_fields3.float)(),
    phone: (0, import_fields3.text)(),
    email: (0, import_fields3.text)(),
    timezone: (0, import_fields3.text)({ defaultValue: "America/New_York", validation: { isRequired: true } }),
    openingHours: (0, import_fields3.json)({ defaultValue: {}, ui: { description: 'By weekday: { "mon": [["15:00","20:00"]], ... }' } }),
    taxRatePercent: (0, import_fields3.decimal)({ precision: 6, scale: 3, defaultValue: "0" }),
    photo: (0, import_fields3.image)({ storage: "my_images" }),
    description: (0, import_fields3.text)({ ui: { displayMode: "textarea" } }),
    status: publishField(["active", "coming_soon", "closed"], "active", "canManageLocations"),
    rooms: (0, import_fields3.relationship)({ ref: "Room.location", many: true }),
    closures: (0, import_fields3.relationship)({ ref: "Closure.location", many: true }),
    memberships: (0, import_fields3.relationship)({ ref: "LocationMembership.location", many: true }),
    programs: (0, import_fields3.relationship)({ ref: "Program.locations", many: true }),
    tutors: (0, import_fields3.relationship)({ ref: "Tutor.locations", many: true }),
    ...trackingFields
  }
});
var LocationMembership = (0, import_core.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: "canManageStaff", location: "location" }),
  db: { extendPrismaSchema: prismaExtras("@@unique([userId, locationId])") },
  ui: { listView: { initialColumns: ["user", "location", "role", "status"] } },
  fields: {
    user: (0, import_fields3.relationship)({ ref: "User.locationMemberships", db: { foreignKey: true } }),
    location: (0, import_fields3.relationship)({ ref: "Location.memberships", db: { foreignKey: true } }),
    role: choice(["manager", "front_desk", "tutor"], "front_desk"),
    status: choice(["active", "inactive"], "active"),
    ...trackingFields
  }
});
var Room = (0, import_core.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: "canManageLocations", location: "location" }),
  fields: {
    location: (0, import_fields3.relationship)({ ref: "Location.rooms" }),
    name: (0, import_fields3.text)({ validation: { isRequired: true } }),
    capacity: (0, import_fields3.integer)({ defaultValue: 4, validation: { isRequired: true, min: 1 } }),
    kind: choice(["room", "table", "online"], "room"),
    status: choice(["active", "inactive"], "active"),
    ...trackingFields
  }
});
var Closure = (0, import_core.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: "canManageSchedule", location: "location" }),
  fields: {
    location: (0, import_fields3.relationship)({ ref: "Location.closures" }),
    startsOn: (0, import_fields3.timestamp)({ validation: { isRequired: true } }),
    endsOn: (0, import_fields3.timestamp)({ validation: { isRequired: true } }),
    reason: (0, import_fields3.text)({ validation: { isRequired: true } }),
    ...trackingFields
  },
  hooks: {
    validate: {
      create: ({ resolvedData, addValidationError }) => {
        if (resolvedData.startsOn && resolvedData.endsOn && new Date(resolvedData.endsOn) < new Date(resolvedData.startsOn)) addValidationError("The closure must end after it starts.");
      }
    }
  }
});

// features/keystone/models/catalogue.ts
var import_core2 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
var import_core3 = require("@keystone-6/core");
var import_fields_document = require("@keystone-6/fields-document");
var catalogueAccess = {
  operation: { query: isSignedIn, create: permissions.canManagePrograms, update: permissions.canManagePrograms, delete: permissions.canManagePrograms },
  filter: { query: ({ session }) => hasFlag(session, "canAccessDashboard") }
};
var slug = () => (0, import_fields5.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[a-z0-9-]+$/, explanation: "Use lowercase letters, numbers and dashes." } } });
var Subject = (0, import_core2.list)({
  access: catalogueAccess,
  fields: {
    name: (0, import_fields5.text)({ validation: { isRequired: true } }),
    slug: slug(),
    category: choice(["maths", "english", "science", "languages", "test_prep", "study_skills", "other"], "other"),
    description: (0, import_fields5.text)({ ui: { displayMode: "textarea" } }),
    icon: (0, import_fields5.text)(),
    sortOrder: (0, import_fields5.integer)({ defaultValue: 0 }),
    programs: (0, import_fields5.relationship)({ ref: "Program.subjects", many: true }),
    ...trackingFields
  }
});
var Level = (0, import_core2.list)({
  access: catalogueAccess,
  fields: {
    name: (0, import_fields5.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    sortOrder: (0, import_fields5.integer)({ defaultValue: 0, validation: { isRequired: true } }),
    kind: choice(["grade", "exam", "adult"], "grade"),
    ...trackingFields
  }
});
var Program = (0, import_core2.list)({
  access: catalogueAccess,
  ui: { listView: { initialColumns: ["name", "format", "deliveryModes", "status"] } },
  fields: {
    name: (0, import_fields5.text)({ validation: { isRequired: true } }),
    slug: slug(),
    summary: (0, import_fields5.text)(),
    description: (0, import_fields_document.document)({ formatting: true, links: true, dividers: true }),
    image: (0, import_fields5.image)({ storage: "my_images" }),
    subjects: (0, import_fields5.relationship)({ ref: "Subject.programs", many: true }),
    levelsFrom: (0, import_fields5.relationship)({ ref: "Level" }),
    levelsTo: (0, import_fields5.relationship)({ ref: "Level" }),
    deliveryModes: (0, import_fields5.multiselect)({ type: "string", options: options(DELIVERY_MODES), defaultValue: ["in_centre"] }),
    format: choice(["one_to_one", "small_group", "class"], "small_group"),
    maxStudentsPerSession: (0, import_fields5.integer)({ defaultValue: 4, validation: { isRequired: true, min: 1 } }),
    sessionMinutes: (0, import_fields5.integer)({ defaultValue: 60, validation: { isRequired: true, min: 15 } }),
    billingModel: choice(["managed", "placement_fee"], "managed"),
    requiresAssessment: (0, import_fields5.checkbox)({ defaultValue: true }),
    assessmentFee: money(),
    assessmentMinutes: (0, import_fields5.integer)({ defaultValue: 45, validation: { isRequired: true, min: 15 } }),
    allowsTrial: (0, import_fields5.checkbox)({ defaultValue: false }),
    placementFee: money(),
    payAsYouGoPrice: money({ ui: { description: "Per session, minor units. 0 = not offered." } }),
    locations: (0, import_fields5.relationship)({ ref: "Location.programs", many: true }),
    status: publishField(["draft", "published", "archived"], "draft", "canManagePrograms"),
    featured: (0, import_fields5.checkbox)({ defaultValue: false }),
    outcomes: (0, import_fields5.text)({ ui: { displayMode: "textarea" } }),
    faq: (0, import_fields5.json)({ defaultValue: [] }),
    plans: (0, import_fields5.relationship)({ ref: "MembershipPlan.program", many: true }),
    packages: (0, import_fields5.relationship)({ ref: "Package.program", many: true }),
    ...trackingFields
  }
});
var MembershipPlan = (0, import_core2.list)({
  access: catalogueAccess,
  fields: {
    name: (0, import_fields5.text)({ validation: { isRequired: true } }),
    program: (0, import_fields5.relationship)({ ref: "Program.plans" }),
    sessionsPerPeriod: (0, import_fields5.integer)({ ui: { description: "Sessions per monthly period. Empty = unlimited." } }),
    weeklyCapForUnlimited: (0, import_fields5.integer)({ defaultValue: 5 }),
    price: money(),
    enrolmentFee: money(),
    minimumTermMonths: (0, import_fields5.integer)({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    description: (0, import_fields5.text)({ ui: { displayMode: "textarea" } }),
    features: (0, import_fields5.json)({ defaultValue: [] }),
    status: publishField(["draft", "published", "archived"], "published", "canManagePrograms"),
    sortOrder: (0, import_fields5.integer)({ defaultValue: 0 }),
    highlight: (0, import_fields5.checkbox)({ defaultValue: false }),
    ...trackingFields
  }
});
var Package = (0, import_core2.list)({
  access: catalogueAccess,
  fields: {
    name: (0, import_fields5.text)({ validation: { isRequired: true } }),
    program: (0, import_fields5.relationship)({ ref: "Program.packages" }),
    hours: (0, import_fields5.integer)({ validation: { isRequired: true, min: 1 }, defaultValue: 10 }),
    price: money(),
    expiryMonths: (0, import_fields5.integer)({ defaultValue: 6, validation: { isRequired: true, min: 1 } }),
    description: (0, import_fields5.text)({ ui: { displayMode: "textarea" } }),
    status: publishField(["draft", "published", "archived"], "published", "canManagePrograms"),
    sortOrder: (0, import_fields5.integer)({ defaultValue: 0 }),
    pricePerHour: (0, import_fields5.virtual)({
      field: import_core3.graphql.field({
        type: import_core3.graphql.Int,
        resolve: (item) => item.hours ? Math.round(item.price / item.hours) : 0
      })
    }),
    ...trackingFields
  }
});
var PromoCode = (0, import_core2.list)({
  access: {
    operation: { query: permissions.canManageBilling, create: permissions.canManagePrograms, update: permissions.canManagePrograms, delete: permissions.canManagePrograms }
  },
  fields: {
    code: (0, import_fields5.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[A-Z0-9_-]+$/, explanation: "Use capital letters, numbers, dashes and underscores." } } }),
    percentOff: (0, import_fields5.integer)({ validation: { min: 0, max: 100 } }),
    amountOff: (0, import_fields5.integer)({ validation: { min: 0 } }),
    appliesTo: choice(["plan", "package", "assessment", "any"], "any"),
    validFrom: (0, import_fields5.timestamp)(),
    validTo: (0, import_fields5.timestamp)(),
    maxUses: (0, import_fields5.integer)({ validation: { min: 0 } }),
    uses: serverInt(0),
    ...trackingFields
  },
  hooks: {
    validate: {
      create: ({ resolvedData, addValidationError }) => {
        if (!resolvedData.percentOff && !resolvedData.amountOff) addValidationError("Set a percent off or an amount off.");
      }
    }
  }
});

// features/keystone/models/people.ts
var import_core4 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");
var import_core5 = require("@keystone-6/core");
var staff = (flag) => ({ session }) => hasFlag(session, flag);
function assignedStudentFilter(session) {
  const me = { user: { id: { equals: session.itemId } } };
  return {
    OR: [
      { enrolments: { some: { tutor: me } } },
      { bookings: { some: { session: { tutor: me } } } }
    ]
  };
}
async function canReadMedicalNotes({ session, context, item }) {
  if (!session || !item) return false;
  if (hasFlag(session, "canManageFamilies")) return true;
  if (hasFlag(session, "isTutor")) {
    const count = await context.sudo().prisma.student.count({ where: { id: item.id, OR: [
      { enrolments: { some: { tutor: { userId: session.itemId } } } },
      { bookings: { some: { session: { tutor: { userId: session.itemId } } } } }
    ] } });
    if (count > 0) return true;
  }
  const guardian = await context.sudo().prisma.family.count({ where: { id: item.familyId, guardians: { some: { id: session.itemId } } } });
  return guardian > 0;
}
var Family = (0, import_core4.list)({
  access: {
    operation: { query: ({ session }) => Boolean(session), create: staff("canManageFamilies"), update: staff("canManageFamilies"), delete: ({ session }) => isOwner(session) },
    filter: {
      query: ({ session }) => anyOf(staffFilter(session, "canManageFamilies", "primaryLocation"), guardianFilter(session, "")),
      update: ({ session }) => staffFilter(session, "canManageFamilies", "primaryLocation"),
      delete: ({ session }) => staffFilter(session, "canManageFamilies", "primaryLocation")
    }
  },
  ui: { listView: { initialColumns: ["name", "billingEmail", "primaryLocation", "status"] } },
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    guardians: (0, import_fields7.relationship)({ ref: "User.family", many: true }),
    students: (0, import_fields7.relationship)({ ref: "Student.family", many: true }),
    primaryLocation: (0, import_fields7.relationship)({ ref: "Location" }),
    billingEmail: (0, import_fields7.text)({ isIndexed: true }),
    phone: (0, import_fields7.text)(),
    addressLine1: (0, import_fields7.text)(),
    addressLine2: (0, import_fields7.text)(),
    city: (0, import_fields7.text)(),
    region: (0, import_fields7.text)(),
    postalCode: (0, import_fields7.text)(),
    country: (0, import_fields7.text)(),
    // Provider references only; card data never touches this database.
    stripeCustomerId: (0, import_fields7.text)({ access: { read: staff("canManageBilling"), create: () => false, update: () => false }, ui: { itemView: { fieldMode: "read" } } }),
    defaultPaymentMethodId: (0, import_fields7.text)({ access: { read: staff("canManageBilling"), create: () => false, update: () => false }, ui: { itemView: { fieldMode: "read" } } }),
    defaultPaymentMethodLabel: serverText(),
    payAsYouGoAllowed: (0, import_fields7.checkbox)({ defaultValue: false }),
    notes: (0, import_fields7.text)({ ui: { displayMode: "textarea" }, access: { read: staff("canManageFamilies") } }),
    secondGuardianName: (0, import_fields7.text)(),
    secondGuardianEmail: (0, import_fields7.text)(),
    secondGuardianPhone: (0, import_fields7.text)(),
    status: choice(["active", "inactive"], "active"),
    sourceLead: (0, import_fields7.relationship)({ ref: "Lead.convertedFamily" }),
    leads: (0, import_fields7.relationship)({ ref: "Lead.family", many: true }),
    enrolments: (0, import_fields7.relationship)({ ref: "Enrollment.family", many: true }),
    memberships: (0, import_fields7.relationship)({ ref: "Membership.family", many: true }),
    invoices: (0, import_fields7.relationship)({ ref: "Invoice.family", many: true }),
    creditGrants: (0, import_fields7.relationship)({ ref: "CreditGrant.family", many: true }),
    messages: (0, import_fields7.relationship)({ ref: "Message.family", many: true }),
    reviews: (0, import_fields7.relationship)({ ref: "Review.family", many: true }),
    tasks: (0, import_fields7.relationship)({ ref: "Task.family", many: true }),
    ...trackingFields
  }
});
var Student = (0, import_core4.list)({
  // Generated update is omitted: `updateStudent` is the §5.9 command for guardians and staff.
  graphql: { omit: { update: true } },
  access: scopedAccess({ read: "canManageFamilies", write: "canManageFamilies", location: "family.primaryLocation", guardian: "family", tutorCustom: assignedStudentFilter }),
  ui: { listView: { initialColumns: ["firstName", "lastName", "family", "level", "status"] } },
  fields: {
    family: (0, import_fields7.relationship)({ ref: "Family.students" }),
    firstName: (0, import_fields7.text)({ validation: { isRequired: true } }),
    lastName: (0, import_fields7.text)({ defaultValue: "" }),
    dateOfBirth: (0, import_fields7.timestamp)(),
    level: (0, import_fields7.relationship)({ ref: "Level" }),
    school: (0, import_fields7.text)(),
    photo: (0, import_fields7.image)({ storage: "my_images" }),
    learningNotes: (0, import_fields7.text)({ ui: { displayMode: "textarea", description: "Visible to tutors." } }),
    medicalNotes: (0, import_fields7.text)({ ui: { displayMode: "textarea", description: "Staff, guardians and assigned tutors only." }, access: { read: canReadMedicalNotes } }),
    pickupPeople: (0, import_fields7.json)({ defaultValue: [] }),
    status: statusField(["prospect", "active", "paused", "alumni"], "prospect"),
    enrolments: (0, import_fields7.relationship)({ ref: "Enrollment.student", many: true }),
    assessments: (0, import_fields7.relationship)({ ref: "Assessment.student", many: true }),
    plans: (0, import_fields7.relationship)({ ref: "LearningPlan.student", many: true }),
    bookings: (0, import_fields7.relationship)({ ref: "Booking.student", many: true }),
    ...trackingFields
  }
});
var Lead = (0, import_core4.list)({
  access: scopedAccess({ read: "canManageLeads", write: "canManageLeads", location: "location" }),
  ui: { listView: { initialColumns: ["guardianName", "studentName", "program", "status", "nextFollowUpAt"] } },
  fields: {
    guardianName: (0, import_fields7.text)({ validation: { isRequired: true } }),
    email: (0, import_fields7.text)({ isIndexed: true }),
    phone: (0, import_fields7.text)(),
    studentName: (0, import_fields7.text)(),
    level: (0, import_fields7.relationship)({ ref: "Level" }),
    subjects: (0, import_fields7.relationship)({ ref: "Subject", many: true }),
    program: (0, import_fields7.relationship)({ ref: "Program" }),
    location: (0, import_fields7.relationship)({ ref: "Location" }),
    preferredMode: choice(DELIVERY_MODES),
    preferredTimes: (0, import_fields7.text)(),
    area: (0, import_fields7.text)(),
    intent: choice(["enquiry", "request_tutor"], "enquiry"),
    message: (0, import_fields7.text)({ ui: { displayMode: "textarea" } }),
    source: choice(["website", "phone", "walk_in", "referral", "other"], "website"),
    status: statusField(["new", "contacted", "assessment_booked", "assessed", "proposal_sent", "enrolled", "lost"], "new"),
    lostReason: serverText(),
    owner: (0, import_fields7.relationship)({ ref: "User" }),
    family: (0, import_fields7.relationship)({ ref: "Family.leads" }),
    convertedFamily: (0, import_fields7.relationship)({ ref: "Family.sourceLead" }),
    student: (0, import_fields7.relationship)({ ref: "Student" }),
    nextFollowUpAt: (0, import_fields7.timestamp)(),
    lastContactedAt: (0, import_fields7.timestamp)(),
    assessments: (0, import_fields7.relationship)({ ref: "Assessment.lead", many: true }),
    ...trackingFields
  }
});
var Tutor = (0, import_core4.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: "canManageTutors", location: "locations[]", tutor: "" }),
  ui: { listView: { initialColumns: ["displayName", "employmentType", "status", "publicProfile"] } },
  fields: {
    user: (0, import_fields7.relationship)({ ref: "User.tutor" }),
    displayName: (0, import_fields7.text)({ validation: { isRequired: true } }),
    slug: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[a-z0-9-]+$/, explanation: "Use lowercase letters, numbers and dashes." } } }),
    photo: (0, import_fields7.image)({ storage: "my_images" }),
    photoUrl: (0, import_fields7.text)({ ui: { description: "External photo URL used when no photo is uploaded." } }),
    headline: (0, import_fields7.text)(),
    bio: (0, import_fields7.text)({ ui: { displayMode: "textarea" } }),
    education: (0, import_fields7.text)(),
    yearsExperience: (0, import_fields7.integer)({ defaultValue: 0 }),
    employmentType: choice(["employee", "contractor"], "contractor"),
    deliveryModes: (0, import_fields7.multiselect)({ type: "string", options: options(DELIVERY_MODES), defaultValue: ["in_centre"] }),
    travelAreas: (0, import_fields7.text)({ ui: { description: "Areas served for in-home lessons, comma separated." } }),
    travelRadiusKm: (0, import_fields7.integer)(),
    homeLocation: (0, import_fields7.relationship)({ ref: "Location" }),
    locations: (0, import_fields7.relationship)({ ref: "Location.tutors", many: true }),
    defaultPayRate: money({ access: { read: ({ session, item }) => hasFlag(session, "canManagePayroll") || hasFlag(session, "canManageTutors") || item?.userId === session?.itemId } }),
    meetingUrl: (0, import_fields7.text)(),
    status: statusField(["onboarding", "active", "paused", "inactive"], "onboarding"),
    publicProfile: (0, import_fields7.checkbox)({ defaultValue: false }),
    averageRating: (0, import_fields7.virtual)({
      field: import_core5.graphql.field({
        type: import_core5.graphql.Float,
        async resolve(item, _args, context) {
          const rows = await context.sudo().prisma.review.aggregate({ where: { tutorId: item.id, status: "published" }, _avg: { rating: true } });
          return rows._avg.rating ?? null;
        }
      })
    }),
    subjects: (0, import_fields7.relationship)({ ref: "TutorSubject.tutor", many: true }),
    availability: (0, import_fields7.relationship)({ ref: "TutorAvailability.tutor", many: true }),
    timeOff: (0, import_fields7.relationship)({ ref: "TutorTimeOff.tutor", many: true }),
    credentials: (0, import_fields7.relationship)({ ref: "TutorCredential.tutor", many: true }),
    application: (0, import_fields7.relationship)({ ref: "TutorApplication.tutor" }),
    ...trackingFields
  }
});
var ownTutorValidate = ({ resolvedData, item, context, addValidationError }) => {
  const session = context.session;
  if (hasFlag(session, "canManageTutors")) return;
  const tutorId = resolvedData.tutor?.connect?.id ?? item?.tutorId;
  const mine = session?.data.tutor?.id;
  if (!mine || tutorId !== mine) addValidationError("Tutors can only change their own records.");
};
var TutorSubject = (0, import_core4.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: "canManageTutors", location: "tutor.locations[]", tutor: "tutor" }),
  db: { extendPrismaSchema: prismaExtras("@@unique([tutorId, subjectId])") },
  fields: {
    tutor: (0, import_fields7.relationship)({ ref: "Tutor.subjects", db: { foreignKey: true } }),
    subject: (0, import_fields7.relationship)({ ref: "Subject", db: { foreignKey: true } }),
    levelFrom: (0, import_fields7.relationship)({ ref: "Level" }),
    levelTo: (0, import_fields7.relationship)({ ref: "Level" }),
    payRate: (0, import_fields7.integer)({ ui: { description: "Per hour, minor units. Overrides the tutor default." }, access: { read: ({ session }) => hasFlag(session, "canManagePayroll") || hasFlag(session, "canManageTutors") || hasFlag(session, "isTutor") } }),
    ...trackingFields
  }
});
var TutorAvailability = (0, import_core4.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: "canManageTutors", location: "tutor.locations[]", tutor: "tutor", tutorWrite: true }),
  hooks: { validate: { create: ownTutorValidate, update: ownTutorValidate } },
  fields: {
    tutor: (0, import_fields7.relationship)({ ref: "Tutor.availability" }),
    weekday: (0, import_fields7.integer)({ validation: { isRequired: true, min: 0, max: 6 }, defaultValue: 1, ui: { description: "0 = Sunday ... 6 = Saturday" } }),
    startMinute: (0, import_fields7.integer)({ validation: { isRequired: true, min: 0, max: 1440 }, defaultValue: 900 }),
    endMinute: (0, import_fields7.integer)({ validation: { isRequired: true, min: 0, max: 1440 }, defaultValue: 1200 }),
    mode: choice(DELIVERY_MODES, "in_centre"),
    location: (0, import_fields7.relationship)({ ref: "Location" }),
    effectiveFrom: (0, import_fields7.timestamp)(),
    effectiveTo: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});
var TutorTimeOff = (0, import_core4.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: "canManageTutors", location: "tutor.locations[]", tutor: "tutor", tutorWrite: true }),
  hooks: { validate: { create: ownTutorValidate, update: ownTutorValidate } },
  fields: {
    tutor: (0, import_fields7.relationship)({ ref: "Tutor.timeOff" }),
    startsAt: (0, import_fields7.timestamp)({ validation: { isRequired: true } }),
    endsAt: (0, import_fields7.timestamp)({ validation: { isRequired: true } }),
    reason: (0, import_fields7.text)(),
    status: statusField(["requested", "approved", "declined"], "requested"),
    ...trackingFields
  }
});
var TutorCredential = (0, import_core4.list)({
  access: scopedAccess({ read: "canManageTutors", write: "canManageTutors", location: "tutor.locations[]", tutor: "tutor", tutorWrite: true }),
  hooks: { validate: { create: ownTutorValidate, update: ownTutorValidate } },
  fields: {
    tutor: (0, import_fields7.relationship)({ ref: "Tutor.credentials" }),
    kind: choice(["background_check", "id", "teaching_certificate", "degree", "safeguarding"], "background_check"),
    document: (0, import_fields7.file)({ storage: "my_files" }),
    reference: (0, import_fields7.text)(),
    issuedAt: (0, import_fields7.timestamp)(),
    expiresAt: (0, import_fields7.timestamp)(),
    status: statusField(["pending", "verified", "expired", "rejected"], "pending"),
    verifiedBy: serverRel("User"),
    verifiedAt: serverTime(),
    ...trackingFields
  }
});
var TutorApplication = (0, import_core4.list)({
  // Generated create is omitted: `createTutorApplication` is the §5.9 staff command.
  graphql: { omit: { create: true } },
  access: scopedAccess({ read: "canManageTutors", write: "canManageTutors", location: null }),
  ui: { listView: { initialColumns: ["name", "email", "status", "createdAt"] } },
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    email: (0, import_fields7.text)({ validation: { isRequired: true }, isIndexed: true }),
    phone: (0, import_fields7.text)(),
    subjectsText: (0, import_fields7.text)(),
    subjects: (0, import_fields7.relationship)({ ref: "Subject", many: true }),
    levels: (0, import_fields7.text)(),
    modes: (0, import_fields7.multiselect)({ type: "string", options: options(DELIVERY_MODES), defaultValue: [] }),
    areas: (0, import_fields7.text)(),
    availability: (0, import_fields7.json)({ defaultValue: {} }),
    cv: (0, import_fields7.file)({ storage: "my_files" }),
    references: (0, import_fields7.json)({ defaultValue: [] }),
    coverNote: (0, import_fields7.text)({ ui: { displayMode: "textarea" } }),
    source: choice(["email", "referral", "job_board", "walk_in", "other"], "email"),
    status: statusField(["applied", "screening", "interview", "checks", "approved", "rejected", "withdrawn"], "applied"),
    reviewer: (0, import_fields7.relationship)({ ref: "User" }),
    notes: (0, import_fields7.text)({ ui: { displayMode: "textarea" } }),
    tutor: (0, import_fields7.relationship)({ ref: "Tutor.application" }),
    ...trackingFields
  }
});

// features/keystone/models/learning.ts
var import_core6 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
var nestStudent = (session) => ({ student: assignedStudentFilter(session) });
var Assessment = (0, import_core6.list)({
  access: scopedAccess({
    read: "canManageLeads",
    write: "canManageLeads",
    location: "location",
    guardian: "family",
    guardianWhere: { status: { in: ["scheduled", "completed", "cancelled", "no_show", "requested"] } },
    tutor: "assessor"
  }),
  db: { extendPrismaSchema: prismaExtras("@@index([assessorId, scheduledAt])", "@@index([roomId, scheduledAt])") },
  ui: { listView: { initialColumns: ["student", "program", "scheduledAt", "status", "assessor"] } },
  fields: {
    student: (0, import_fields9.relationship)({ ref: "Student.assessments" }),
    family: (0, import_fields9.relationship)({ ref: "Family" }),
    program: (0, import_fields9.relationship)({ ref: "Program" }),
    subject: (0, import_fields9.relationship)({ ref: "Subject" }),
    location: (0, import_fields9.relationship)({ ref: "Location" }),
    room: (0, import_fields9.relationship)({ ref: "Room" }),
    assessor: (0, import_fields9.relationship)({ ref: "Tutor" }),
    assessorUser: (0, import_fields9.relationship)({ ref: "User" }),
    mode: choice(DELIVERY_MODES, "in_centre"),
    kind: choice(["initial", "re_assessment", "parent_meeting"], "initial"),
    scheduledAt: (0, import_fields9.timestamp)({ isIndexed: true }),
    minutes: (0, import_fields9.integer)({ defaultValue: 45, validation: { isRequired: true, min: 15 } }),
    status: statusField(["requested", "scheduled", "in_progress", "completed", "cancelled", "no_show"], "requested"),
    // Unique while scheduled: "<assessorId>:<startISO>" so two people cannot take one slot.
    slotKey: activeKey(),
    fee: money({ access: { update: () => false } }),
    feeRefunded: (0, import_fields9.checkbox)({ defaultValue: false, access: { create: () => false, update: () => false } }),
    invoice: serverRel("Invoice"),
    summary: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    recommendation: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    recommendedPlan: (0, import_fields9.relationship)({ ref: "MembershipPlan" }),
    recommendedPackage: (0, import_fields9.relationship)({ ref: "Package" }),
    recommendedSessionsPerWeek: (0, import_fields9.integer)(),
    results: (0, import_fields9.relationship)({ ref: "AssessmentResult.assessment", many: true }),
    lead: (0, import_fields9.relationship)({ ref: "Lead.assessments" }),
    cancelReason: serverText(),
    completedAt: serverTime(),
    rescheduledFrom: serverRel("Assessment"),
    ...trackingFields
  }
});
var AssessmentResult = (0, import_core6.list)({
  access: scopedAccess({
    read: "canManageLeads",
    write: "canManageLeads",
    location: "assessment.location",
    guardian: "assessment.family",
    guardianWhere: { assessment: { status: { equals: "completed" } } },
    tutor: "assessment.assessor",
    tutorWrite: true
  }),
  fields: {
    assessment: (0, import_fields9.relationship)({ ref: "Assessment.results" }),
    skill: (0, import_fields9.text)({ validation: { isRequired: true } }),
    strand: (0, import_fields9.text)(),
    score: (0, import_fields9.float)({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    maxScore: (0, import_fields9.float)({ validation: { isRequired: true, min: 0 }, defaultValue: 10 }),
    levelEquivalent: (0, import_fields9.text)(),
    note: (0, import_fields9.text)(),
    percent: (0, import_fields9.virtual)({
      field: import_core6.graphql.field({ type: import_core6.graphql.Float, resolve: (item) => item.maxScore ? Math.round(item.score / item.maxScore * 1e3) / 10 : null })
    }),
    ...trackingFields
  }
});
var LearningPlan = (0, import_core6.list)({
  access: scopedAccess({
    read: "canManageFamilies",
    write: "canManageFamilies",
    location: "student.family.primaryLocation",
    guardian: "student.family",
    guardianWhere: { status: { in: ["proposed", "accepted", "active", "completed", "declined"] } },
    tutorCustom: nestStudent,
    tutorWrite: true
  }),
  fields: {
    student: (0, import_fields9.relationship)({ ref: "Student.plans" }),
    subject: (0, import_fields9.relationship)({ ref: "Subject" }),
    program: (0, import_fields9.relationship)({ ref: "Program" }),
    version: serverInt(1),
    status: statusField(["draft", "proposed", "accepted", "active", "completed", "archived", "declined"], "draft"),
    summary: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    startDate: (0, import_fields9.timestamp)(),
    targetDate: (0, import_fields9.timestamp)(),
    sessionsPerWeek: (0, import_fields9.integer)({ defaultValue: 2 }),
    totalHours: (0, import_fields9.integer)(),
    recommendedPlan: (0, import_fields9.relationship)({ ref: "MembershipPlan" }),
    recommendedPackage: (0, import_fields9.relationship)({ ref: "Package" }),
    baselineAssessment: (0, import_fields9.relationship)({ ref: "Assessment" }),
    goals: (0, import_fields9.relationship)({ ref: "PlanGoal.plan", many: true }),
    previousVersion: serverRel("LearningPlan"),
    declineReason: serverText(),
    proposedAt: serverTime(),
    acceptedAt: serverTime(),
    ...trackingFields
  }
});
var PlanGoal = (0, import_core6.list)({
  access: scopedAccess({
    read: "canManageFamilies",
    write: "canManageFamilies",
    location: "plan.student.family.primaryLocation",
    guardian: "plan.student.family",
    guardianWhere: { plan: { status: { in: ["proposed", "accepted", "active", "completed"] } } },
    tutorCustom: (session) => ({ plan: nestStudent(session) }),
    tutorWrite: true
  }),
  fields: {
    plan: (0, import_fields9.relationship)({ ref: "LearningPlan.goals" }),
    title: (0, import_fields9.text)({ validation: { isRequired: true } }),
    skill: (0, import_fields9.text)(),
    baseline: (0, import_fields9.text)(),
    target: (0, import_fields9.text)(),
    status: statusField(["not_started", "in_progress", "mastered"], "not_started"),
    masteredAt: serverTime(),
    sortOrder: (0, import_fields9.integer)({ defaultValue: 0 }),
    ...trackingFields
  }
});
var Enrollment = (0, import_core6.list)({
  access: scopedAccess({ read: "canManageFamilies", write: false, location: "location", guardian: "family", tutor: "tutor" }),
  ui: { listView: { initialColumns: ["student", "program", "status", "fundingType", "tutor"] } },
  fields: {
    student: (0, import_fields9.relationship)({ ref: "Student.enrolments" }),
    family: (0, import_fields9.relationship)({ ref: "Family.enrolments" }),
    program: (0, import_fields9.relationship)({ ref: "Program" }),
    location: (0, import_fields9.relationship)({ ref: "Location" }),
    mode: choice(DELIVERY_MODES, "in_centre"),
    status: statusField(["pending_payment", "pending_match", "matched", "active", "paused", "ended", "cancelled"], "pending_payment"),
    fundingType: choice(["membership", "package", "pay_as_you_go"], "membership"),
    membership: (0, import_fields9.relationship)({ ref: "Membership.enrollment" }),
    studentPackage: (0, import_fields9.relationship)({ ref: "StudentPackage.enrollment" }),
    tutor: (0, import_fields9.relationship)({ ref: "Tutor" }),
    plan: (0, import_fields9.relationship)({ ref: "LearningPlan" }),
    preferredTimes: (0, import_fields9.json)({ defaultValue: [] }),
    homeAddress: (0, import_fields9.text)(),
    startDate: (0, import_fields9.timestamp)(),
    endDate: (0, import_fields9.timestamp)(),
    endReason: serverText(),
    rematchCount: serverInt(0),
    trialAttendedAt: serverTime(),
    tutorConfirmedAt: serverTime(),
    series: (0, import_fields9.relationship)({ ref: "SessionSeries.enrollment", many: true }),
    offers: (0, import_fields9.relationship)({ ref: "Offer.enrollment", many: true }),
    bookings: (0, import_fields9.relationship)({ ref: "Booking.enrollment", many: true }),
    ...trackingFields
  }
});
var Offer = (0, import_core6.list)({
  access: scopedAccess({ read: "canManageTutors", write: false, location: "enrollment.location", tutor: "tutor" }),
  fields: {
    enrollment: (0, import_fields9.relationship)({ ref: "Enrollment.offers" }),
    tutor: (0, import_fields9.relationship)({ ref: "Tutor" }),
    status: statusField(["sent", "accepted", "declined", "expired", "withdrawn"], "sent"),
    openKey: activeKey(),
    payRate: money(),
    proposedSlots: (0, import_fields9.json)({ defaultValue: [] }),
    sentAt: serverTime(),
    expiresAt: serverTime(),
    respondedAt: serverTime(),
    declineReason: serverText(),
    sentBy: serverRel("User"),
    ...trackingFields
  }
});
var SessionSeries = (0, import_core6.list)({
  access: scopedAccess({ read: "canManageSchedule", write: false, location: "location", tutor: "tutor" }),
  // Generated create is omitted: `createSessionSeries` is the §5.9 command.
  graphql: { plural: "SessionSeriesList", omit: { create: true } },
  fields: {
    program: (0, import_fields9.relationship)({ ref: "Program" }),
    subject: (0, import_fields9.relationship)({ ref: "Subject" }),
    location: (0, import_fields9.relationship)({ ref: "Location" }),
    room: (0, import_fields9.relationship)({ ref: "Room" }),
    tutor: (0, import_fields9.relationship)({ ref: "Tutor" }),
    mode: choice(DELIVERY_MODES, "in_centre"),
    weekday: (0, import_fields9.integer)({ validation: { isRequired: true, min: 0, max: 6 }, defaultValue: 1 }),
    startMinute: (0, import_fields9.integer)({ validation: { isRequired: true, min: 0, max: 1440 }, defaultValue: 960 }),
    minutes: (0, import_fields9.integer)({ validation: { isRequired: true, min: 15 }, defaultValue: 60 }),
    capacity: (0, import_fields9.integer)({ validation: { isRequired: true, min: 1 }, defaultValue: 4 }),
    startDate: (0, import_fields9.timestamp)({ validation: { isRequired: true } }),
    endDate: (0, import_fields9.timestamp)(),
    enrollment: (0, import_fields9.relationship)({ ref: "Enrollment.series" }),
    status: statusField(["active", "ended"], "active"),
    meetingUrl: (0, import_fields9.text)(),
    generatedThrough: serverTime(),
    sessions: (0, import_fields9.relationship)({ ref: "Session.series", many: true }),
    ...trackingFields
  }
});
var Session = (0, import_core6.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: false, location: "location", tutor: "tutor" }),
  db: { extendPrismaSchema: prismaExtras("@@unique([seriesId, startsAt])", "@@index([tutorId, startsAt])", "@@index([roomId, startsAt])", "@@index([locationId, startsAt])") },
  ui: { listView: { initialColumns: ["startsAt", "program", "tutor", "room", "status", "capacity"] } },
  fields: {
    series: (0, import_fields9.relationship)({ ref: "SessionSeries.sessions", db: { foreignKey: true } }),
    program: (0, import_fields9.relationship)({ ref: "Program" }),
    subject: (0, import_fields9.relationship)({ ref: "Subject" }),
    location: (0, import_fields9.relationship)({ ref: "Location", db: { foreignKey: true } }),
    room: (0, import_fields9.relationship)({ ref: "Room", db: { foreignKey: true } }),
    tutor: (0, import_fields9.relationship)({ ref: "Tutor", db: { foreignKey: true } }),
    mode: choice(DELIVERY_MODES, "in_centre"),
    startsAt: (0, import_fields9.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    endsAt: (0, import_fields9.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    capacity: (0, import_fields9.integer)({ validation: { isRequired: true, min: 1 }, defaultValue: 1 }),
    status: statusField(["scheduled", "in_progress", "completed", "cancelled", "needs_cover"], "scheduled"),
    cancelReason: serverText(),
    meetingUrl: (0, import_fields9.text)(),
    isTrial: (0, import_fields9.checkbox)({ defaultValue: false }),
    substituteFor: serverRel("Tutor"),
    bookings: (0, import_fields9.relationship)({ ref: "Booking.session", many: true }),
    waitlist: (0, import_fields9.relationship)({ ref: "WaitlistEntry.session", many: true }),
    reports: (0, import_fields9.relationship)({ ref: "SessionReport.session", many: true }),
    payLines: (0, import_fields9.relationship)({ ref: "PayLine.session", many: true }),
    bookedCount: (0, import_fields9.virtual)({
      field: import_core6.graphql.field({
        type: import_core6.graphql.Int,
        resolve: (item, _a, context) => context.sudo().prisma.booking.count({ where: { sessionId: item.id, status: { in: ["booked", "attended", "late", "cancelled_late", "cancelled_late_excused", "no_show"] } } })
      })
    }),
    ...trackingFields
  }
});
var Booking = (0, import_core6.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: false, location: "session.location", guardian: "family", tutor: "session.tutor" }),
  db: { extendPrismaSchema: prismaExtras("@@index([studentId, status])") },
  ui: { listView: { initialColumns: ["session", "student", "status", "source", "minutes"] } },
  fields: {
    session: (0, import_fields9.relationship)({ ref: "Session.bookings", db: { foreignKey: true } }),
    student: (0, import_fields9.relationship)({ ref: "Student.bookings", db: { foreignKey: true } }),
    family: (0, import_fields9.relationship)({ ref: "Family" }),
    enrollment: (0, import_fields9.relationship)({ ref: "Enrollment.bookings" }),
    status: statusField(["booked", "attended", "late", "cancelled_early", "cancelled_late", "cancelled_late_excused", "no_show", "cancelled_by_centre", "waitlisted", "waitlist_expired"], "booked"),
    activeKey: activeKey(),
    source: choice(["fixed_seat", "self_booked", "staff", "make_up", "waitlist"], "staff"),
    creditGrant: (0, import_fields9.relationship)({ ref: "CreditGrant.bookings" }),
    payAsYouGo: (0, import_fields9.checkbox)({ defaultValue: false, access: { create: () => false, update: () => false } }),
    invoice: serverRel("Invoice"),
    minutes: serverInt(0),
    startsAt: serverTime(),
    endsAt: serverTime(),
    markedBy: serverRel("User"),
    markedAt: serverTime(),
    cancelledAt: serverTime(),
    cancelledBy: serverRel("User"),
    lateReason: serverText(),
    makeUpGrant: (0, import_fields9.relationship)({ ref: "CreditGrant.sourceBooking" }),
    payLine: (0, import_fields9.relationship)({ ref: "PayLine.booking" }),
    reopenedAt: serverTime(),
    reports: (0, import_fields9.relationship)({ ref: "SessionReport.booking", many: true }),
    ...trackingFields
  }
});
var SessionReport = (0, import_core6.list)({
  access: scopedAccess({
    read: "canManageFamilies",
    write: false,
    location: "session.location",
    guardian: "booking.family",
    guardianWhere: { publishedAt: { not: null } },
    tutor: "tutor"
  }),
  fields: {
    booking: (0, import_fields9.relationship)({ ref: "Booking.reports" }),
    session: (0, import_fields9.relationship)({ ref: "Session.reports" }),
    student: (0, import_fields9.relationship)({ ref: "Student" }),
    tutor: (0, import_fields9.relationship)({ ref: "Tutor" }),
    topicsCovered: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    wentWell: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    toImprove: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    homework: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    homeworkDueAt: (0, import_fields9.timestamp)(),
    homeworkStatus: choice(["set", "done", "not_done"]),
    effort: (0, import_fields9.integer)({ validation: { min: 1, max: 5 } }),
    // §5.8: never shown to guardians.
    staffNote: (0, import_fields9.text)({ ui: { displayMode: "textarea" }, access: { read: ({ session }) => hasFlag(session, "canAccessDashboard") } }),
    attachment: (0, import_fields9.file)({ storage: "my_files" }),
    publishedAt: serverTime(),
    guardianSeenAt: serverTime(),
    ...trackingFields
  }
});
var WaitlistEntry = (0, import_core6.list)({
  access: scopedAccess({ read: "canManageSchedule", write: false, location: "session.location", guardian: "family" }),
  fields: {
    session: (0, import_fields9.relationship)({ ref: "Session.waitlist", db: { foreignKey: true } }),
    student: (0, import_fields9.relationship)({ ref: "Student" }),
    family: (0, import_fields9.relationship)({ ref: "Family" }),
    status: statusField(["waiting", "promoted", "cancelled", "expired"], "waiting"),
    activeKey: activeKey(),
    position: serverInt(0),
    promotedAt: serverTime(),
    booking: serverRel("Booking"),
    ...trackingFields
  }
});
var ProgressReport = (0, import_core6.list)({
  access: scopedAccess({
    read: "canManageFamilies",
    write: false,
    location: "student.family.primaryLocation",
    guardian: "student.family",
    guardianWhere: { status: { in: ["published", "acknowledged"] } },
    tutor: "authorTutor"
  }),
  fields: {
    student: (0, import_fields9.relationship)({ ref: "Student" }),
    enrollment: (0, import_fields9.relationship)({ ref: "Enrollment" }),
    periodStart: (0, import_fields9.timestamp)(),
    periodEnd: (0, import_fields9.timestamp)(),
    sessionsAttended: serverInt(0),
    sessionsMissed: serverInt(0),
    narrative: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    goalsSnapshot: (0, import_fields9.json)({ defaultValue: [] }),
    nextSteps: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    status: statusField(["draft", "published", "acknowledged", "withdrawn"], "draft"),
    author: serverRel("User"),
    authorTutor: (0, import_fields9.relationship)({ ref: "Tutor" }),
    withdrawReason: serverText(),
    publishedAt: serverTime(),
    acknowledgedAt: serverTime(),
    ...trackingFields
  }
});

// features/keystone/models/money.ts
var import_core7 = require("@keystone-6/core");
var import_access7 = require("@keystone-6/core/access");
var import_fields11 = require("@keystone-6/core/fields");
var Membership = (0, import_core7.list)({
  access: scopedAccess({ read: "canManageBilling", write: false, location: "enrollment.location", guardian: "family" }),
  ui: { listView: { initialColumns: ["family", "student", "plan", "status", "currentPeriodEnd"] } },
  fields: {
    family: (0, import_fields11.relationship)({ ref: "Family.memberships" }),
    student: (0, import_fields11.relationship)({ ref: "Student" }),
    plan: (0, import_fields11.relationship)({ ref: "MembershipPlan" }),
    enrollment: (0, import_fields11.relationship)({ ref: "Enrollment.membership" }),
    status: statusField(["pending_payment", "active", "past_due", "suspended", "paused", "cancelling", "cancelled"], "pending_payment"),
    price: serverInt(0),
    discountPercent: serverInt(0),
    sessionsPerPeriod: (0, import_fields11.integer)({ access: { create: () => false, update: () => false } }),
    weeklyCap: (0, import_fields11.integer)({ access: { create: () => false, update: () => false } }),
    startedAt: serverTime(),
    currentPeriodStart: serverTime(),
    currentPeriodEnd: serverTime(),
    pausedFrom: serverTime(),
    pausedUntil: serverTime(),
    pauseRequestedFrom: serverTime(),
    pauseRequestedUntil: serverTime(),
    cancelRequestedAt: serverTime(),
    endsAt: serverTime(),
    pastDueSince: serverTime(),
    lastPauseAt: serverTime(),
    pendingPlan: serverRel("MembershipPlan"),
    billingAttempts: (0, import_fields11.relationship)({ ref: "BillingAttempt.membership", many: true }),
    grants: (0, import_fields11.relationship)({ ref: "CreditGrant.membership", many: true }),
    ...trackingFields
  }
});
var StudentPackage = (0, import_core7.list)({
  access: scopedAccess({ read: "canManageBilling", write: false, location: "invoice.location", guardian: "family" }),
  fields: {
    family: (0, import_fields11.relationship)({ ref: "Family" }),
    student: (0, import_fields11.relationship)({ ref: "Student" }),
    package: (0, import_fields11.relationship)({ ref: "Package" }),
    enrollment: (0, import_fields11.relationship)({ ref: "Enrollment.studentPackage" }),
    hours: serverInt(0),
    price: serverInt(0),
    purchasedAt: serverTime(),
    expiresAt: serverTime(),
    invoice: serverRel("Invoice"),
    status: statusField(["pending_payment", "active", "exhausted", "expired", "refunded"], "pending_payment"),
    grants: (0, import_fields11.relationship)({ ref: "CreditGrant.studentPackage", many: true }),
    ...trackingFields
  }
});
var CreditGrant = (0, import_core7.list)({
  access: scopedAccess({ read: "canManageBilling", write: false, location: "family.primaryLocation", guardian: "family" }),
  db: { extendPrismaSchema: prismaExtras("@@index([familyId, studentId, status])") },
  ui: { listView: { initialColumns: ["family", "student", "kind", "minutesGranted", "minutesAvailable", "expiresAt", "status"] } },
  fields: {
    family: (0, import_fields11.relationship)({ ref: "Family.creditGrants" }),
    student: (0, import_fields11.relationship)({ ref: "Student" }),
    program: (0, import_fields11.relationship)({ ref: "Program" }),
    kind: choice(["membership_period", "package", "make_up", "goodwill", "pay_as_you_go"], "goodwill", { access: { create: () => false, update: () => false } }),
    membership: (0, import_fields11.relationship)({ ref: "Membership.grants" }),
    studentPackage: (0, import_fields11.relationship)({ ref: "StudentPackage.grants" }),
    sourceBooking: (0, import_fields11.relationship)({ ref: "Booking.makeUpGrant" }),
    rolledFrom: serverRel("CreditGrant"),
    minutesGranted: serverInt(0),
    minutesAvailable: serverInt(0),
    unlimited: (0, import_fields11.checkbox)({ defaultValue: false, access: { create: () => false, update: () => false } }),
    weeklyCap: (0, import_fields11.integer)({ access: { create: () => false, update: () => false } }),
    expiresAt: serverTime(),
    periodStart: serverTime(),
    periodEnd: serverTime(),
    status: statusField(["active", "exhausted", "expired", "refunded", "voided"], "active"),
    entries: (0, import_fields11.relationship)({ ref: "CreditEntry.grant", many: true }),
    bookings: (0, import_fields11.relationship)({ ref: "Booking.creditGrant", many: true }),
    ...trackingFields
  }
});
var CreditEntry = (0, import_core7.list)({
  access: {
    ...appendOnlyAccess("canManageBilling"),
    filter: { query: scopedAccess({ read: "canManageBilling", write: false, location: "grant.family.primaryLocation", guardian: "grant.family" }).filter.query }
  },
  db: { extendPrismaSchema: prismaExtras("@@index([grantId, type])") },
  fields: {
    grant: (0, import_fields11.relationship)({ ref: "CreditGrant.entries", db: { foreignKey: true } }),
    type: choice(["grant", "hold", "release", "debit", "rollover_in", "rollover_out", "expire", "refund", "adjustment", "reversal"], "grant"),
    minutes: (0, import_fields11.integer)({ validation: { isRequired: true }, defaultValue: 0 }),
    booking: (0, import_fields11.relationship)({ ref: "Booking", db: { foreignKey: true } }),
    note: (0, import_fields11.text)(),
    actor: (0, import_fields11.relationship)({ ref: "User" }),
    ...trackingFields
  }
});
var Invoice = (0, import_core7.list)({
  access: scopedAccess({ read: "canManageBilling", write: false, location: "location", guardian: "family", guardianWhere: { status: { not: { equals: "draft" } } } }),
  ui: { listView: { initialColumns: ["number", "family", "kind", "status", "total", "amountPaid", "dueAt"] } },
  fields: {
    number: (0, import_fields11.integer)({ isIndexed: "unique", access: { create: () => false, update: () => false } }),
    family: (0, import_fields11.relationship)({ ref: "Family.invoices" }),
    location: (0, import_fields11.relationship)({ ref: "Location" }),
    status: statusField(["draft", "open", "partially_paid", "paid", "void"], "draft"),
    kind: choice(["assessment", "enrolment", "package", "membership", "pay_as_you_go", "placement", "manual"], "manual"),
    issuedAt: serverTime(),
    dueAt: serverTime(),
    subtotal: serverInt(0),
    discount: serverInt(0),
    tax: serverInt(0),
    total: serverInt(0),
    amountPaid: serverInt(0),
    amountCredited: serverInt(0),
    currency: (0, import_fields11.text)({ defaultValue: "USD", access: { create: () => false, update: () => false } }),
    promoCode: serverRel("PromoCode"),
    lines: (0, import_fields11.relationship)({ ref: "InvoiceLine.invoice", many: true }),
    payments: (0, import_fields11.relationship)({ ref: "Payment.invoice", many: true }),
    creditNotes: (0, import_fields11.relationship)({ ref: "CreditNote.invoice", many: true }),
    paymentSessions: (0, import_fields11.relationship)({ ref: "PaymentSession.invoice", many: true }),
    notes: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    // What to do once paid (activate a membership, package, assessment, booking). Server only.
    fulfilment: (0, import_fields11.json)({ defaultValue: {}, access: { read: ({ session }) => hasFlag(session, "canManageBilling"), create: () => false, update: () => false } }),
    fulfilledAt: serverTime(),
    amountDue: (0, import_fields11.virtual)({ field: import_core7.graphql.field({ type: import_core7.graphql.Int, resolve: (item) => Math.max(0, item.total - item.amountPaid - item.amountCredited) }) }),
    ...trackingFields
  }
});
var InvoiceLine = (0, import_core7.list)({
  access: scopedAccess({ read: "canManageBilling", write: false, location: "invoice.location", guardian: "invoice.family", guardianWhere: { invoice: { status: { not: { equals: "draft" } } } } }),
  fields: {
    invoice: (0, import_fields11.relationship)({ ref: "Invoice.lines", db: { foreignKey: true } }),
    description: (0, import_fields11.text)({ validation: { isRequired: true } }),
    kind: choice(["assessment", "enrolment_fee", "membership", "package", "pay_as_you_go", "placement", "discount", "manual"], "manual"),
    quantity: (0, import_fields11.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    unitAmount: signedMoney(),
    amount: signedMoney(),
    student: (0, import_fields11.relationship)({ ref: "Student" }),
    program: (0, import_fields11.relationship)({ ref: "Program" }),
    booking: (0, import_fields11.relationship)({ ref: "Booking" }),
    membership: (0, import_fields11.relationship)({ ref: "Membership" }),
    studentPackage: (0, import_fields11.relationship)({ ref: "StudentPackage" }),
    assessment: (0, import_fields11.relationship)({ ref: "Assessment" }),
    ...trackingFields
  }
});
var CreditNote = (0, import_core7.list)({
  access: appendOnlyAccess("canManageBilling", "invoice.location"),
  fields: {
    invoice: (0, import_fields11.relationship)({ ref: "Invoice.creditNotes" }),
    amount: money(),
    reason: (0, import_fields11.text)({ validation: { isRequired: true } }),
    issuedBy: (0, import_fields11.relationship)({ ref: "User" }),
    ...trackingFields
  }
});
var Payment = (0, import_core7.list)({
  access: scopedAccess({ read: "canManageBilling", write: false, location: "invoice.location", guardian: "family" }),
  fields: {
    invoice: (0, import_fields11.relationship)({ ref: "Invoice.payments" }),
    family: (0, import_fields11.relationship)({ ref: "Family" }),
    amount: money(),
    currency: (0, import_fields11.text)({ defaultValue: "USD" }),
    method: choice(["card", "cash", "cheque", "bank_transfer"], "card"),
    reference: (0, import_fields11.text)(),
    status: statusField(["captured", "refunded", "partially_refunded", "failed"], "captured"),
    paymentSession: (0, import_fields11.relationship)({ ref: "PaymentSession.payment" }),
    providerPaymentId: (0, import_fields11.text)({ isIndexed: "unique", db: { isNullable: true } }),
    receivedBy: (0, import_fields11.relationship)({ ref: "User" }),
    refundedAmount: serverInt(0),
    refunds: (0, import_fields11.relationship)({ ref: "Refund.payment", many: true }),
    ...trackingFields
  }
});
var Refund = (0, import_core7.list)({
  access: scopedAccess({ read: "canManageBilling", write: false, location: "payment.invoice.location", guardian: "payment.family" }),
  fields: {
    payment: (0, import_fields11.relationship)({ ref: "Payment.refunds" }),
    amount: money(),
    reason: (0, import_fields11.text)(),
    status: statusField(["requested", "succeeded", "failed", "unknown"], "requested"),
    providerRefundId: (0, import_fields11.text)(),
    idempotencyKey: (0, import_fields11.text)({ isIndexed: "unique", access: { read: () => false } }),
    failureReason: serverText(),
    requestedBy: (0, import_fields11.relationship)({ ref: "User" }),
    ...trackingFields
  }
});
var BillingAttempt = (0, import_core7.list)({
  access: scopedAccess({ read: "canManageBilling", write: false, location: "membership.enrollment.location" }),
  db: { extendPrismaSchema: prismaExtras("@@unique([membershipId, periodStart, attemptNumber])") },
  fields: {
    membership: (0, import_fields11.relationship)({ ref: "Membership.billingAttempts", db: { foreignKey: true } }),
    periodStart: (0, import_fields11.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    periodEnd: (0, import_fields11.timestamp)(),
    invoice: (0, import_fields11.relationship)({ ref: "Invoice" }),
    attemptNumber: (0, import_fields11.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    status: statusField(["pending", "succeeded", "failed", "unknown"], "pending"),
    amount: serverInt(0),
    requestHash: (0, import_fields11.text)({ access: { read: () => false } }),
    leaseExpiresAt: serverTime(),
    providerPaymentId: (0, import_fields11.text)(),
    failureCode: serverText(),
    failureMessage: serverText(),
    nextRetryAt: serverTime(),
    ...trackingFields
  }
});
var PayLine = (0, import_core7.list)({
  access: scopedAccess({ read: "canManagePayroll", write: false, location: "session.location", tutor: "tutor" }),
  db: { extendPrismaSchema: prismaExtras("@@index([tutorId, status])") },
  ui: { listView: { initialColumns: ["tutor", "kind", "minutes", "amount", "status", "payrollRun"] } },
  fields: {
    tutor: (0, import_fields11.relationship)({ ref: "Tutor", db: { foreignKey: true } }),
    session: (0, import_fields11.relationship)({ ref: "Session.payLines", db: { foreignKey: true } }),
    booking: (0, import_fields11.relationship)({ ref: "Booking.payLine" }),
    kind: choice(["session", "late_cancel", "no_show", "trial", "prep", "training", "bonus", "deduction", "adjustment"], "session"),
    workedAt: (0, import_fields11.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    minutes: (0, import_fields11.integer)({ defaultValue: 0, validation: { isRequired: true } }),
    rate: money(),
    amount: signedMoney(),
    status: statusField(["accrued", "approved", "paid", "void"], "accrued"),
    // One accrued line per session (group) or per booking (1:1): "<kind>:<sessionId|bookingId>" while not void.
    activeKey: (0, import_fields11.text)({ isIndexed: "unique", db: { isNullable: true }, access: { read: () => true, create: () => false, update: () => false }, ui: { itemView: { fieldMode: "hidden" } } }),
    payrollRun: (0, import_fields11.relationship)({ ref: "PayrollRun.lines" }),
    voidReason: serverText(),
    note: (0, import_fields11.text)(),
    ...trackingFields
  }
});
var PayrollRun = (0, import_core7.list)({
  // Generated create is omitted: `createPayrollRun` is the §5.9 command.
  graphql: { omit: { create: true } },
  access: scopedAccess({ read: "canManagePayroll", write: false, location: "location" }),
  fields: {
    location: (0, import_fields11.relationship)({ ref: "Location" }),
    periodStart: (0, import_fields11.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    periodEnd: (0, import_fields11.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    status: statusField(["draft", "approved", "paid", "cancelled"], "draft"),
    lines: (0, import_fields11.relationship)({ ref: "PayLine.payrollRun", many: true }),
    totalAmount: (0, import_fields11.virtual)({
      field: import_core7.graphql.field({
        type: import_core7.graphql.Int,
        async resolve(item, _a, context) {
          const r = await context.sudo().prisma.payLine.aggregate({ where: { payrollRunId: item.id, status: { not: "void" } }, _sum: { amount: true } });
          return r._sum.amount ?? 0;
        }
      })
    }),
    totalMinutes: (0, import_fields11.virtual)({
      field: import_core7.graphql.field({
        type: import_core7.graphql.Int,
        async resolve(item, _a, context) {
          const r = await context.sudo().prisma.payLine.aggregate({ where: { payrollRunId: item.id, status: { not: "void" } }, _sum: { minutes: true } });
          return r._sum.minutes ?? 0;
        }
      })
    }),
    approvedBy: serverRel("User"),
    approvedAt: serverTime(),
    paidAt: serverTime(),
    payments: (0, import_fields11.json)({ defaultValue: [], access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var PaymentProvider = (0, import_core7.list)({
  access: {
    operation: {
      query: ({ session }) => hasFlag(session, "canManageBilling"),
      create: ({ session }) => isOwner(session),
      update: ({ session }) => isOwner(session),
      delete: () => false
    }
  },
  fields: {
    name: (0, import_fields11.text)({ validation: { isRequired: true } }),
    code: (0, import_fields11.text)({
      isIndexed: "unique",
      validation: { isRequired: true, match: { regex: /^pp_[a-zA-Z0-9-_]+$/, explanation: 'Payment provider code must start with "pp_".' } }
    }),
    isInstalled: (0, import_fields11.checkbox)({ defaultValue: true }),
    isDefault: (0, import_fields11.checkbox)({ defaultValue: false }),
    // Write-only: Stripe keys entered in settings. Never returned through GraphQL.
    credentials: (0, import_fields11.json)({
      defaultValue: {},
      access: { read: import_access7.denyAll, create: () => false, update: () => false },
      ui: { itemView: { fieldMode: "hidden" }, createView: { fieldMode: "hidden" }, listView: { fieldMode: "hidden" } }
    }),
    credentialsSet: (0, import_fields11.virtual)({
      field: import_core7.graphql.field({
        type: import_core7.graphql.JSON,
        resolve: (item) => {
          const c = item.credentials || {};
          return { secretKey: Boolean(c.secretKey), publishableKey: typeof c.publishableKey === "string" ? c.publishableKey : null, webhookSecret: Boolean(c.webhookSecret) };
        }
      })
    }),
    metadata: (0, import_fields11.json)({ defaultValue: {} }),
    paymentSessions: (0, import_fields11.relationship)({ ref: "PaymentSession.paymentProvider", many: true, access: { create: () => false, update: () => false } }),
    ...trackingFields
  }
});
var PaymentSession = (0, import_core7.list)({
  access: { operation: { query: ({ session }) => hasFlag(session, "canManageBilling"), create: () => false, update: () => false, delete: () => false } },
  fields: {
    invoice: (0, import_fields11.relationship)({ ref: "Invoice.paymentSessions" }),
    paymentProvider: (0, import_fields11.relationship)({ ref: "PaymentProvider.paymentSessions" }),
    payment: (0, import_fields11.relationship)({ ref: "Payment.paymentSession" }),
    purpose: choice(["invoice", "setup"], "invoice"),
    family: (0, import_fields11.relationship)({ ref: "Family" }),
    idempotencyKeyHash: (0, import_fields11.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { read: () => false } }),
    status: statusField(["pending", "requires_action", "authorized", "captured", "failed", "cancelled", "unknown", "refunded", "partially_refunded"], "pending"),
    amount: (0, import_fields11.integer)({ validation: { isRequired: true, min: 0 }, defaultValue: 0 }),
    currencyCode: (0, import_fields11.text)({ defaultValue: "USD", validation: { isRequired: true } }),
    providerPaymentId: (0, import_fields11.text)({ isIndexed: true }),
    // Handed to the browser for Stripe.js; never a secret.
    clientSecret: (0, import_fields11.text)({ access: { read: () => false } }),
    offSession: (0, import_fields11.checkbox)({ defaultValue: false }),
    failureMessage: (0, import_fields11.text)(),
    capturedAt: (0, import_fields11.timestamp)(),
    cancelledAt: (0, import_fields11.timestamp)(),
    refundedAmount: (0, import_fields11.integer)({ defaultValue: 0, validation: { min: 0 } }),
    metadata: (0, import_fields11.json)({ defaultValue: {} }),
    reviewReason: (0, import_fields11.text)({ ui: { description: "Set when a webhook did not match (amount, currency, invoice) and was parked for review." } }),
    ...trackingFields
  }
});
var PaymentWebhookEvent = (0, import_core7.list)({
  access: appendOnlyAccess("canManageSettings"),
  fields: {
    replayKey: (0, import_fields11.text)({ isIndexed: "unique", validation: { isRequired: true }, access: { read: () => false } }),
    providerCode: (0, import_fields11.text)({ validation: { isRequired: true } }),
    providerEventId: (0, import_fields11.text)({ validation: { isRequired: true } }),
    eventType: (0, import_fields11.text)({ validation: { isRequired: true } }),
    payloadHash: (0, import_fields11.text)({ validation: { isRequired: true }, access: { read: () => false } }),
    outcome: (0, import_fields11.text)({ ui: { description: "applied, ignored, parked (with reason)" } }),
    processedAt: (0, import_fields11.timestamp)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});

// features/keystone/models/operations.ts
var import_core8 = require("@keystone-6/core");
var import_fields13 = require("@keystone-6/core/fields");
var Task = (0, import_core8.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: "canAccessDashboard", location: "location", noDelete: true }),
  ui: { listView: { initialColumns: ["kind", "family", "student", "dueAt", "status", "owner"] } },
  fields: {
    kind: choice(["no_show_follow_up", "absence_streak", "low_balance", "failed_payment", "assessment_follow_up", "proposal_follow_up", "first_week_check_in", "membership_ending", "credential_expiring", "needs_cover", "rematch_requested", "pause_requested", "cancel_requested", "manual"], "manual"),
    title: (0, import_fields13.text)({ validation: { isRequired: true } }),
    family: (0, import_fields13.relationship)({ ref: "Family.tasks" }),
    student: (0, import_fields13.relationship)({ ref: "Student" }),
    lead: (0, import_fields13.relationship)({ ref: "Lead" }),
    location: (0, import_fields13.relationship)({ ref: "Location" }),
    owner: (0, import_fields13.relationship)({ ref: "User" }),
    relatedType: (0, import_fields13.text)(),
    relatedId: (0, import_fields13.text)(),
    dueAt: (0, import_fields13.timestamp)({ isIndexed: true }),
    status: statusField(["open", "done", "dismissed"], "open"),
    openKey: activeKey(),
    outcomeNote: serverText(),
    completedBy: serverRel("User"),
    completedAt: serverTime(),
    ...trackingFields
  }
});
var Message = (0, import_core8.list)({
  access: { ...appendOnlyAccess("canManageFamilies", "family.primaryLocation"), filter: { query: scopedAccess({ read: "canManageFamilies", write: false, location: "family.primaryLocation", guardian: "family", guardianWhere: { visibleToFamily: { equals: true } } }).filter.query } },
  fields: {
    family: (0, import_fields13.relationship)({ ref: "Family.messages" }),
    sender: (0, import_fields13.relationship)({ ref: "User" }),
    direction: choice(["outbound", "inbound", "internal"], "outbound"),
    channel: choice(["email", "phone", "in_person", "portal", "sms"], "email"),
    subject: (0, import_fields13.text)(),
    body: (0, import_fields13.text)({ ui: { displayMode: "textarea" }, validation: { isRequired: true } }),
    visibleToFamily: (0, import_fields13.checkbox)({ defaultValue: true }),
    threadKey: (0, import_fields13.text)({ isIndexed: true }),
    readAt: (0, import_fields13.timestamp)(),
    ...trackingFields
  }
});
var NotificationLog = (0, import_core8.list)({
  access: appendOnlyAccess("canManageSettings"),
  fields: {
    recipient: (0, import_fields13.text)({ validation: { isRequired: true } }),
    template: (0, import_fields13.text)({ validation: { isRequired: true } }),
    subject: (0, import_fields13.text)(),
    relatedType: (0, import_fields13.text)(),
    relatedId: (0, import_fields13.text)(),
    channel: choice(["email", "sms"], "email"),
    status: choice(["queued", "sent", "failed"], "queued"),
    error: (0, import_fields13.text)(),
    sentAt: (0, import_fields13.timestamp)(),
    ...trackingFields
  }
});
var Review = (0, import_core8.list)({
  access: scopedAccess({ read: "canManageFamilies", write: false, location: "family.primaryLocation" }),
  fields: {
    family: (0, import_fields13.relationship)({ ref: "Family.reviews" }),
    tutor: (0, import_fields13.relationship)({ ref: "Tutor" }),
    location: (0, import_fields13.relationship)({ ref: "Location" }),
    program: (0, import_fields13.relationship)({ ref: "Program" }),
    authorName: (0, import_fields13.text)({ validation: { isRequired: true } }),
    rating: (0, import_fields13.integer)({ validation: { isRequired: true, min: 1, max: 5 }, defaultValue: 5 }),
    text: (0, import_fields13.text)({ ui: { displayMode: "textarea" } }),
    source: choice(["email", "phone", "in_person", "survey", "other"], "email"),
    status: statusField(["pending", "published", "hidden"], "pending"),
    recordedBy: serverRel("User"),
    ...trackingFields
  }
});
var ChangeEvent = (0, import_core8.list)({
  access: appendOnlyAccess("canViewReports"),
  db: { extendPrismaSchema: prismaIndex() },
  fields: {
    aggregateType: (0, import_fields13.text)({ validation: { isRequired: true } }),
    aggregateId: (0, import_fields13.text)({ validation: { isRequired: true } }),
    from: (0, import_fields13.text)(),
    to: (0, import_fields13.text)(),
    actor: (0, import_fields13.relationship)({ ref: "User" }),
    reason: (0, import_fields13.text)(),
    data: (0, import_fields13.json)({ defaultValue: {} }),
    at: (0, import_fields13.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" } }),
    ...trackingFields
  }
});
function prismaIndex() {
  return (schema) => schema.replace(/\}\s*$/, "  @@index([aggregateType, aggregateId])\n}");
}
var CommandReceipt = (0, import_core8.list)({
  access: {
    operation: { query: ({ session }) => isOwner(session), create: () => false, update: () => false, delete: () => false }
  },
  fields: {
    eventKey: (0, import_fields13.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    eventType: (0, import_fields13.text)({ validation: { isRequired: true } }),
    schemaVersion: (0, import_fields13.integer)({ validation: { isRequired: true }, defaultValue: 1 }),
    aggregateType: (0, import_fields13.text)({ validation: { isRequired: true } }),
    aggregateId: (0, import_fields13.text)({ validation: { isRequired: true } }),
    location: (0, import_fields13.relationship)({ ref: "Location" }),
    payload: (0, import_fields13.json)(),
    result: (0, import_fields13.json)(),
    actorId: (0, import_fields13.text)(),
    payloadHash: (0, import_fields13.text)({ validation: { isRequired: true } }),
    occurredAt: (0, import_fields13.timestamp)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});

// features/keystone/models/OAuthApp.ts
var import_core9 = require("@keystone-6/core");
var import_fields15 = require("@keystone-6/core/fields");

// features/keystone/mcp-oauth/core.ts
var import_node_crypto = __toESM(require("node:crypto"));
var MCP_SCOPES = ["mcp:read", "mcp:write"];
var MCP_ACCESS_PREFIX = "mcp_at_";
var ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
var REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1e3;
var CONSENT_TICKET_TTL_MS = 10 * 60 * 1e3;
var DEVELOPMENT_SECRET = "this secret should only be used in testing";
function secret() {
  return process.env.SESSION_SECRET || DEVELOPMENT_SECRET;
}
function randomToken(prefix, bytes = 32) {
  return `${prefix}${import_node_crypto.default.randomBytes(bytes).toString("base64url")}`;
}
function digestToken(token, purpose = "mcp-oauth-token") {
  return import_node_crypto.default.createHmac("sha256", secret()).update(`${purpose}\0${token}`, "utf8").digest("hex");
}
function bearerToken(header) {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
  return match ? match[1] : null;
}
function isMcpAccessToken(token) {
  return typeof token === "string" && token.startsWith(MCP_ACCESS_PREFIX) && token.length > MCP_ACCESS_PREFIX.length;
}
function storedScopes(value) {
  return Array.isArray(value) ? MCP_SCOPES.filter((scope) => value.includes(scope)) : [];
}

// features/keystone/models/OAuthApp.ts
var OAuthApp = (0, import_core9.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    name: (0, import_fields15.text)({
      validation: {
        isRequired: true
      }
    }),
    clientId: (0, import_fields15.text)({
      isIndexed: "unique",
      hooks: {
        resolveInput: ({ operation, resolvedData }) => {
          if (operation === "create" && !resolvedData.clientId) {
            return randomToken("mcp_cl_", 18);
          }
          return resolvedData.clientId;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
        description: "Auto-generated unique identifier for your application."
      }
    }),
    clientSecret: (0, import_fields15.text)({
      access: {
        read: () => false
      },
      hooks: {
        resolveInput: ({ resolvedData }) => {
          if (resolvedData.clientSecret) {
            return digestToken(resolvedData.clientSecret, "oauth-client-secret");
          }
          return void 0;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "hidden" },
        description: "Stored only as a digest. Public MCP clients have no secret."
      }
    }),
    tokenEndpointAuthMethod: (0, import_fields15.select)({
      options: [
        { label: "Client secret (POST)", value: "client_secret_post" },
        { label: "Client secret (Basic)", value: "client_secret_basic" },
        { label: "None (public PKCE client)", value: "none" }
      ],
      defaultValue: "client_secret_post",
      ui: {
        description: "How the app authenticates at the token endpoint. MCP clients are public (none)."
      }
    }),
    redirectUris: (0, import_fields15.json)({
      defaultValue: [],
      ui: {
        description: "Array of allowed redirect URIs for OAuth callbacks"
      }
    }),
    scopes: (0, import_fields15.json)({
      defaultValue: [...MCP_SCOPES],
      ui: {
        description: "Array of allowed OAuth scopes. MCP scopes only narrow the signed-in user's own access."
      }
    }),
    webhookUrl: (0, import_fields15.text)({
      ui: {
        description: "URL to receive webhook notifications"
      }
    }),
    status: (0, import_fields15.select)({
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Pending", value: "pending" }
      ],
      defaultValue: "active"
    }),
    installUrl: (0, import_fields15.text)({
      ui: {
        description: "URL where users can install this app"
      }
    }),
    uninstallUrl: (0, import_fields15.text)({
      ui: {
        description: "URL to handle app uninstallation"
      }
    }),
    description: (0, import_fields15.text)({
      ui: {
        displayMode: "textarea"
      }
    }),
    metadata: (0, import_fields15.json)({
      defaultValue: {},
      ui: {
        description: "Additional app-specific configuration and settings"
      }
    }),
    developerEmail: (0, import_fields15.text)(),
    privacyPolicyUrl: (0, import_fields15.text)(),
    termsOfServiceUrl: (0, import_fields15.text)(),
    supportUrl: (0, import_fields15.text)(),
    ...trackingFields
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "clientId", "status", "createdAt"]
    }
  }
});

// features/keystone/models/OAuthToken.ts
var import_core11 = require("@keystone-6/core");
var import_fields16 = require("@keystone-6/core/fields");
var digestTokenInput = {
  resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] ? digestToken(resolvedData[fieldKey]) : resolvedData[fieldKey]
};
var OAuthToken = (0, import_core11.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    tokenType: (0, import_fields16.select)({
      options: [
        { label: "Authorization Code", value: "authorization_code" },
        { label: "Access Token", value: "access_token" },
        { label: "Refresh Token", value: "refresh_token" }
      ],
      validation: {
        isRequired: true
      }
    }),
    token: (0, import_fields16.text)({
      access: { read: () => false },
      validation: {
        isRequired: true
      },
      isIndexed: "unique",
      hooks: digestTokenInput
    }),
    clientId: (0, import_fields16.text)({
      validation: {
        isRequired: true
      },
      isIndexed: true
    }),
    user: (0, import_fields16.relationship)({
      ref: "User",
      ui: {
        description: "The user who authorized this token"
      }
    }),
    scopes: (0, import_fields16.json)({
      defaultValue: [],
      ui: {
        description: "Array of granted scopes"
      }
    }),
    redirectUri: (0, import_fields16.text)({
      ui: {
        description: "The redirect URI used during authorization"
      }
    }),
    resource: (0, import_fields16.text)({
      ui: {
        description: "The MCP endpoint (RFC 8707 resource) this grant is for"
      }
    }),
    expiresAt: (0, import_fields16.timestamp)({
      ui: {
        description: "When this token expires"
      }
    }),
    isRevoked: (0, import_fields16.select)({
      options: [
        { label: "Active", value: "false" },
        { label: "Revoked", value: "true" }
      ],
      defaultValue: "false"
    }),
    authorizationCode: (0, import_fields16.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "The authorization code that was exchanged for this token (for access tokens)"
      }
    }),
    refreshToken: (0, import_fields16.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated refresh token (for access tokens)"
      }
    }),
    accessToken: (0, import_fields16.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated access token (for refresh tokens)"
      }
    }),
    state: (0, import_fields16.text)({
      ui: {
        description: "OAuth state parameter for CSRF protection"
      }
    }),
    codeChallenge: (0, import_fields16.text)({
      ui: {
        description: "PKCE code challenge"
      }
    }),
    codeChallengeMethod: (0, import_fields16.select)({
      options: [
        { label: "Plain", value: "plain" },
        { label: "SHA256", value: "S256" }
      ],
      ui: {
        description: "PKCE code challenge method"
      }
    }),
    ...trackingFields
  },
  ui: {
    labelField: "clientId",
    listView: {
      initialColumns: ["tokenType", "clientId", "user", "scopes", "expiresAt", "isRevoked"]
    }
  }
});

// features/keystone/models/index.ts
var models = {
  // §5.1
  User,
  Role,
  Business,
  BusinessSettings,
  Location,
  LocationMembership,
  Room,
  Closure,
  // §5.2
  Subject,
  Level,
  Program,
  MembershipPlan,
  Package,
  PromoCode,
  // §5.3
  Family,
  Student,
  Lead,
  Tutor,
  TutorSubject,
  TutorAvailability,
  TutorTimeOff,
  TutorCredential,
  TutorApplication,
  // §5.4, §5.5
  Assessment,
  AssessmentResult,
  LearningPlan,
  PlanGoal,
  Enrollment,
  Offer,
  SessionSeries,
  Session,
  Booking,
  SessionReport,
  WaitlistEntry,
  ProgressReport,
  // §5.6
  Membership,
  StudentPackage,
  CreditGrant,
  CreditEntry,
  Invoice,
  InvoiceLine,
  CreditNote,
  Payment,
  Refund,
  BillingAttempt,
  PayLine,
  PayrollRun,
  PaymentProvider,
  PaymentSession,
  PaymentWebhookEvent,
  // §5.7
  Task,
  Message,
  NotificationLog,
  Review,
  ChangeEvent,
  CommandReceipt,
  // MCP OAuth (starter)
  OAuthApp,
  OAuthToken
};

// features/keystone/index.ts
var import_session = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/schedule.ts
var schedule_exports = {};
__export(schedule_exports, {
  resolvers: () => resolvers,
  typeDefs: () => typeDefs
});

// features/keystone/lib/command.ts
var import_node_crypto2 = require("node:crypto");

// features/keystone/lib/json.ts
function canonicalJson(value) {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value;
    return `{${Object.keys(record).filter((k) => record[k] !== void 0).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// features/keystone/lib/errors.ts
var CommandError = class extends Error {
  constructor(message, data) {
    super(message);
    this.data = data;
    this.name = "CommandError";
  }
};

// features/keystone/lib/actor.ts
var roleSelect = Object.fromEntries(ROLE_FLAGS.map((f) => [f, true]));
async function loadActor(prisma, userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      familyId: true,
      role: { select: roleSelect },
      tutor: { select: { id: true, status: true } },
      locationMemberships: { where: { status: "active", location: { status: { not: "closed" } } }, select: { locationId: true, role: true } }
    }
  });
  if (!user) return null;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    flags: user.role ?? {},
    memberships: user.locationMemberships.filter((m) => m.locationId).map((m) => ({ locationId: m.locationId, role: m.role })),
    tutorId: user.role?.isTutor && user.tutor && user.tutor.status !== "inactive" ? user.tutor.id : null,
    familyId: user.familyId ?? null
  };
}
function can(actor, flag) {
  return Boolean(actor?.flags[flag]);
}
function isOwnerActor(actor) {
  return can(actor, "canManageSettings");
}
function canAt(actor, flag, locationId) {
  if (!can(actor, flag)) return false;
  if (isOwnerActor(actor) || !LOCATION_SCOPED_FLAGS.has(flag)) return true;
  const scoped = actor.memberships.filter((m) => locationRoleAllows(m.role, flag));
  if (!scoped.length) return false;
  if (!locationId) return true;
  return scoped.some((m) => m.locationId === locationId);
}
function requireFlag(actor, flag, locationId) {
  if (!actor) throw new CommandError("Sign in to continue.");
  if (locationId === void 0 ? !can(actor, flag) || !isOwnerActor(actor) && LOCATION_SCOPED_FLAGS.has(flag) && !actor.memberships.some((m) => locationRoleAllows(m.role, flag)) : !canAt(actor, flag, locationId)) {
    throw new CommandError("You do not have permission to do that here.");
  }
  return actor;
}
async function requireGuardianOf(tx, actor, familyId) {
  if (!actor) throw new CommandError("Sign in to continue.");
  if (!familyId) throw new CommandError("That was not found.");
  const family = await tx.family.findFirst({ where: { id: familyId, guardians: { some: { id: actor.userId } } }, select: { id: true } });
  if (!family) throw new CommandError("That was not found.");
  return family.id;
}

// features/keystone/lib/command.ts
var TX_OPTIONS = { maxWait: 6e4, timeout: 12e4 };
function isRetryable(error) {
  const code = error?.code;
  return code === "P2034" || /deadlock detected|could not serialize/i.test(String(error?.message || ""));
}
async function transaction(prisma, fn, attempts = 6) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(fn, TX_OPTIONS);
    } catch (error) {
      if (!isRetryable(error) || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(400, 20 * 2 ** attempt) + Math.floor(Math.random() * 25)));
    }
  }
}
async function lockKey(tx, key) {
  await tx.$queryRaw`SELECT true AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))) AS acquired`;
}
async function cas(tx, model, id, from, data, message) {
  const expected = Array.isArray(from) ? from : [from];
  const result = await tx[model].updateMany({ where: { id, status: { in: expected } }, data });
  if (result.count !== 1) throw new CommandError(message || "This record was changed by someone else. Reload and try again.");
}
async function recordChange(tx, input) {
  await tx.changeEvent.create({
    data: {
      aggregateType: input.type,
      aggregateId: input.id,
      from: input.from ?? "",
      to: input.to ?? "",
      reason: input.reason ?? "",
      data: input.data ?? {},
      at: /* @__PURE__ */ new Date(),
      ...input.actorId ? { actor: { connect: { id: input.actorId } }, createdBy: { connect: { id: input.actorId } } } : {}
    }
  });
}
async function transition(tx, actor, model, type, id, from, to, extra = {}, reason) {
  const current = await tx[model].findUnique({ where: { id }, select: { status: true } });
  if (!current) throw new CommandError("That record was not found.");
  const expected = Array.isArray(from) ? from : [from];
  if (!expected.includes(current.status)) throw new CommandError(`This ${type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} is ${current.status.replace(/_/g, " ")}; it cannot move to ${to.replace(/_/g, " ")}.`);
  await cas(tx, model, id, expected, { ...extra, status: to });
  await recordChange(tx, { type, id, from: current.status, to, actorId: actor?.userId, reason });
}
function isUnique(error) {
  return error?.code === "P2002";
}
async function runCommand(context, options2, fn) {
  const prisma = context.sudo().prisma;
  let after;
  try {
    const actor = context.session?.itemId ? await loadActor(prisma, context.session.itemId) : null;
    if (!actor && !options2.allowAnonymous) throw new CommandError("Sign in to continue.");
    const key = typeof options2.idempotencyKey === "string" ? options2.idempotencyKey.trim() : "";
    if (key && (key.length < 8 || key.length > 200)) throw new CommandError("The idempotency key must be 8 to 200 characters.");
    const outcome = await transaction(prisma, async (tx) => {
      let eventKey = "";
      let payloadHash = "";
      if (key) {
        eventKey = `${options2.name}:${actor?.userId ?? "public"}:${key}`;
        payloadHash = (0, import_node_crypto2.createHash)("sha256").update(canonicalJson({ name: options2.name, input: options2.input })).digest("hex");
        await lockKey(tx, `command-receipt:${eventKey}`);
        const existing = await tx.commandReceipt.findUnique({ where: { eventKey } });
        if (existing) {
          if (existing.payloadHash !== payloadHash) throw new CommandError("This idempotency key was already used with different details.");
          return { replay: true, result: existing.result };
        }
      }
      const value = await fn(tx, actor);
      const result = { success: !value.refusal, error: value.refusal ?? null, id: value.id ?? null, data: value.data ?? null };
      if (key) {
        await tx.commandReceipt.create({
          data: {
            eventKey,
            eventType: options2.name,
            schemaVersion: 1,
            aggregateType: options2.name,
            aggregateId: value.id ?? "",
            payload: { input: options2.input ?? null },
            result,
            actorId: actor?.userId ?? "",
            payloadHash,
            occurredAt: /* @__PURE__ */ new Date()
          }
        });
      }
      after = value.after;
      return { replay: false, result };
    });
    if (!outcome.replay && after) {
      try {
        await after();
      } catch (error) {
        console.error(`${options2.name}: after-commit step failed`, error?.message);
      }
    }
    return outcome.result;
  } catch (error) {
    if (error instanceof CommandError) return { success: false, error: error.message, id: null, data: error.data ?? null };
    if (isUnique(error)) return { success: false, error: options2.conflictMessage || "That conflicts with an existing record.", id: null, data: null };
    console.error(`${options2.name} failed:`, error?.message);
    return { success: false, error: "Something went wrong. Please try again.", id: null, data: null };
  }
}
function requireString(value, label2, max = 500) {
  const text10 = typeof value === "string" ? value.trim() : "";
  if (!text10) throw new CommandError(`${label2} is required.`);
  if (text10.length > max) throw new CommandError(`${label2} is too long.`);
  return text10;
}
function optionalString(value, max = 2e3) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function requireInt(value, label2, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new CommandError(`${label2} must be a whole number${min === 0 ? "" : ` from ${min}`}.`);
  return n;
}
function requireDate(value, label2) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) throw new CommandError(`${label2} is not a valid date.`);
  return date;
}

// features/keystone/lib/ledger.ts
var SEAT_STATUSES = ["booked", "attended", "late", "no_show"];
async function entry(tx, e) {
  await tx.creditEntry.create({
    data: {
      grant: { connect: { id: e.grantId } },
      type: e.type,
      minutes: e.minutes,
      note: e.note ?? "",
      ...e.bookingId ? { booking: { connect: { id: e.bookingId } } } : {},
      ...e.actorId ? { actor: { connect: { id: e.actorId } } } : {}
    }
  });
}
async function createGrant(tx, input) {
  if (!Number.isInteger(input.minutes) || input.minutes < 0) throw new CommandError("Credit minutes must be a whole number of 0 or more.");
  const grant = await tx.creditGrant.create({
    data: {
      family: { connect: { id: input.familyId } },
      ...input.studentId ? { student: { connect: { id: input.studentId } } } : {},
      ...input.programId ? { program: { connect: { id: input.programId } } } : {},
      ...input.membershipId ? { membership: { connect: { id: input.membershipId } } } : {},
      ...input.studentPackageId ? { studentPackage: { connect: { id: input.studentPackageId } } } : {},
      ...input.sourceBookingId ? { sourceBooking: { connect: { id: input.sourceBookingId } } } : {},
      ...input.rolledFromId ? { rolledFrom: { connect: { id: input.rolledFromId } } } : {},
      ...input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {},
      kind: input.kind,
      minutesGranted: input.minutes,
      minutesAvailable: input.minutes,
      unlimited: Boolean(input.unlimited),
      weeklyCap: input.weeklyCap ?? null,
      expiresAt: input.expiresAt ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      status: input.minutes > 0 || input.unlimited ? "active" : "exhausted"
    }
  });
  await entry(tx, { grantId: grant.id, type: input.kind === "membership_period" && input.rolledFromId ? "rollover_in" : "grant", minutes: input.minutes, note: input.note, actorId: input.actorId });
  return grant;
}
async function reserveMinutes(tx, grant, minutes, validAt) {
  if (grant.unlimited) return;
  const rows = await tx.$executeRaw`
    UPDATE "CreditGrant" SET "minutesAvailable" = "minutesAvailable" - ${minutes},
      "status" = CASE WHEN "minutesAvailable" - ${minutes} = 0 THEN 'exhausted' ELSE "status" END,
      "updatedAt" = now()
    WHERE id = ${grant.id} AND status = 'active' AND "minutesAvailable" >= ${minutes}
      AND ("expiresAt" IS NULL OR "expiresAt" >= ${validAt})`;
  if (rows !== 1) throw new CommandError("Not enough credit for this session.");
}
async function writeHold(tx, grant, bookingId, minutes, actorId) {
  await entry(tx, { grantId: grant.id, type: "hold", minutes: grant.unlimited ? 0 : -minutes, bookingId, note: grant.unlimited ? `${minutes} minutes (unlimited)` : "", actorId });
}
async function openHold(tx, bookingId) {
  const entries = await tx.creditEntry.findMany({ where: { bookingId, type: { in: ["hold", "release", "debit", "reversal"] } }, orderBy: { createdAt: "asc" }, select: { grantId: true, type: true, minutes: true } });
  const hold = entries.find((e) => e.type === "hold");
  if (!hold) return null;
  const opens = entries.filter((e) => e.type === "hold" || e.type === "reversal").length;
  const closes = entries.filter((e) => e.type === "release" || e.type === "debit").length;
  const last = [...entries].reverse().find((e) => e.type === "release" || e.type === "debit") ?? null;
  return { grantId: hold.grantId, minutes: -hold.minutes, open: opens > closes, lastClose: last };
}
async function releaseHold(tx, bookingId, actorId, note = "") {
  const hold = await openHold(tx, bookingId);
  if (!hold || !hold.open) return;
  await entry(tx, { grantId: hold.grantId, type: "release", minutes: hold.minutes, bookingId, note, actorId });
  if (hold.minutes > 0) {
    await tx.$executeRaw`UPDATE "CreditGrant" SET "minutesAvailable" = "minutesAvailable" + ${hold.minutes},
      "status" = CASE WHEN status = 'exhausted' THEN 'active' ELSE status END, "updatedAt" = now() WHERE id = ${hold.grantId}`;
    const grant = await tx.creditGrant.findUnique({ where: { id: hold.grantId }, select: { expiresAt: true, status: true } });
    if (grant?.expiresAt && grant.expiresAt < /* @__PURE__ */ new Date() && grant.status === "active") await expireGrant(tx, hold.grantId, "Expired when the held minutes were returned");
  }
}
async function debitHold(tx, bookingId, actorId, note = "") {
  const hold = await openHold(tx, bookingId);
  if (!hold || !hold.open) return;
  await entry(tx, { grantId: hold.grantId, type: "debit", minutes: 0, bookingId, note: note || `${hold.minutes} minutes spent`, actorId });
}
async function reverseClose(tx, bookingId, actorId) {
  const hold = await openHold(tx, bookingId);
  if (!hold || hold.open || !hold.lastClose) return;
  if (hold.lastClose.type === "release" && hold.minutes > 0) {
    const rows = await tx.$executeRaw`UPDATE "CreditGrant" SET "minutesAvailable" = "minutesAvailable" - ${hold.minutes},
      "status" = CASE WHEN "minutesAvailable" - ${hold.minutes} = 0 THEN 'exhausted' ELSE status END, "updatedAt" = now()
      WHERE id = ${hold.grantId} AND status IN ('active') AND "minutesAvailable" >= ${hold.minutes}`;
    if (rows !== 1) throw new CommandError("The credit returned for this booking has since been used, so it cannot be reopened.");
    await entry(tx, { grantId: hold.grantId, type: "reversal", minutes: -hold.minutes, bookingId, note: "Reopened: release reversed", actorId });
  } else {
    await entry(tx, { grantId: hold.grantId, type: "reversal", minutes: 0, bookingId, note: "Reopened: debit reversed", actorId });
  }
}
async function expireGrant(tx, grantId, note = "Expired") {
  const grant = await tx.creditGrant.findUnique({ where: { id: grantId }, select: { minutesAvailable: true, status: true } });
  if (!grant || !["active", "exhausted"].includes(grant.status)) return 0;
  const minutes = grant.minutesAvailable;
  const rows = await tx.creditGrant.updateMany({ where: { id: grantId, status: grant.status, minutesAvailable: minutes }, data: { minutesAvailable: 0, status: "expired" } });
  if (rows.count !== 1) throw new CommandError("Credit changed while expiring; retry.");
  if (minutes > 0) await entry(tx, { grantId, type: "expire", minutes: -minutes, note });
  return minutes;
}
async function removeUnused(tx, grantId, type, status, actorId, note = "") {
  const grant = await tx.creditGrant.findUnique({ where: { id: grantId }, select: { minutesAvailable: true, status: true } });
  if (!grant) throw new CommandError("Credit not found.");
  const minutes = grant.minutesAvailable;
  const rows = await tx.creditGrant.updateMany({ where: { id: grantId, minutesAvailable: minutes }, data: { minutesAvailable: 0, status } });
  if (rows.count !== 1) throw new CommandError("Credit changed; retry.");
  if (minutes > 0) await entry(tx, { grantId, type, minutes: -minutes, note, actorId });
  return minutes;
}
async function pickGrant(tx, input) {
  const grants = await tx.creditGrant.findMany({
    where: {
      familyId: input.familyId,
      status: "active",
      OR: [{ studentId: input.studentId }, { studentId: null }],
      AND: [
        { OR: [{ programId: input.programId }, { programId: null }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: input.startsAt } }] },
        { OR: [{ periodStart: null }, { periodStart: { lte: input.startsAt } }] }
      ]
    },
    select: { id: true, kind: true, unlimited: true, weeklyCap: true, minutesAvailable: true, expiresAt: true, createdAt: true }
  });
  const rank = { make_up: 0, goodwill: 1, membership_period: 2, package: 3, pay_as_you_go: 4 };
  grants.sort((a, b) => (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || (a.expiresAt ? a.expiresAt.getTime() : Infinity) - (b.expiresAt ? b.expiresAt.getTime() : Infinity) || a.createdAt.getTime() - b.createdAt.getTime());
  for (const grant of grants) {
    if (grant.unlimited) {
      if (grant.weeklyCap) {
        const { start, end } = weekOf(input.startsAt);
        const used = await tx.booking.count({ where: { creditGrantId: grant.id, startsAt: { gte: start, lt: end }, status: { in: [...SEAT_STATUSES, "cancelled_late", "cancelled_late_excused"] } } });
        if (used >= grant.weeklyCap) continue;
      }
      return grant;
    }
    if (grant.minutesAvailable >= input.minutes) return grant;
  }
  return null;
}
function weekOf(at) {
  const start = new Date(at);
  const day = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - day);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end: new Date(start.getTime() + 7 * 864e5) };
}

// features/keystone/lib/settings.ts
var DEFAULT_SETTINGS = {
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
  pastDueRetryDays: [3, 7],
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
  policiesText: "",
  jobsSecretHash: "",
  lastDailyJobsAt: null
};
async function getSettings(db) {
  const row = await db.businessSettings.findUnique({ where: { id: 1 } });
  const merged = { ...DEFAULT_SETTINGS };
  if (row) {
    for (const key of Object.keys(DEFAULT_SETTINGS)) if (row[key] !== null && row[key] !== void 0) merged[key] = row[key];
  }
  if (!Array.isArray(merged.pastDueRetryDays)) merged.pastDueRetryDays = DEFAULT_SETTINGS.pastDueRetryDays;
  return merged;
}
async function getBusiness(db) {
  const row = await db.business.findUnique({ where: { id: 1 } });
  return row ?? { id: 1, name: "", currency: "USD", country: "US", nextInvoiceNumber: 1001, supportEmail: "", careersEmail: "" };
}
var HOUR = 36e5;
var DAY = 24 * HOUR;

// features/keystone/lib/pay.ts
async function rateFor(tx, tutorId, subjectId) {
  if (subjectId) {
    const ts = await tx.tutorSubject.findFirst({ where: { tutorId, subjectId }, select: { payRate: true } });
    if (ts?.payRate) return ts.payRate;
  }
  const tutor = await tx.tutor.findUnique({ where: { id: tutorId }, select: { defaultPayRate: true } });
  return tutor?.defaultPayRate ?? 0;
}
var amountFor = (rate, minutes, percent = 100) => Math.round(rate * minutes * percent / 6e3);
async function voidByKey(tx, key, reason) {
  const line = await tx.payLine.findUnique({ where: { activeKey: key }, select: { id: true, status: true } });
  if (!line) return { voided: false, locked: false, line: null };
  if (line.status !== "accrued") return { voided: false, locked: true, line };
  await tx.payLine.updateMany({ where: { id: line.id, status: "accrued" }, data: { status: "void", activeKey: null, voidReason: reason } });
  return { voided: true, locked: false, line };
}
async function payLocked(tx, booking) {
  const locked = await tx.payLine.findFirst({
    where: { OR: [{ activeKey: `booking:${booking.id}` }, { activeKey: `session:${booking.sessionId}` }], status: { in: ["approved", "paid"] } },
    select: { id: true }
  });
  return Boolean(locked);
}
async function accruePay(tx, sessionId) {
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    select: { id: true, tutorId: true, subjectId: true, startsAt: true, endsAt: true, status: true, program: { select: { format: true } }, bookings: { select: { id: true, status: true, minutes: true } } }
  });
  if (!session?.tutorId) return;
  const settings = await getSettings(tx);
  const minutes = Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 6e4);
  const rate = await rateFor(tx, session.tutorId, session.subjectId);
  const percentFor = (status) => status === "attended" || status === "late" ? 100 : status === "cancelled_late" || status === "cancelled_late_excused" ? settings.lateCancelCharged ? settings.tutorPaidOnLateCancelPercent : 0 : status === "no_show" ? settings.noShowCharged ? settings.tutorPaidOnNoShowPercent : 0 : 0;
  const kindFor = (status) => status === "no_show" ? "no_show" : status.startsWith("cancelled_late") ? "late_cancel" : "session";
  if (session.program?.format === "one_to_one") {
    for (const b of session.bookings) {
      const key2 = `booking:${b.id}`;
      const percent = session.status === "cancelled" ? 0 : percentFor(b.status);
      const existing2 = await tx.payLine.findUnique({ where: { activeKey: key2 }, select: { id: true, status: true, amount: true, kind: true } });
      const amount2 = amountFor(rate, b.minutes || minutes, percent);
      if (existing2?.status && existing2.status !== "accrued") continue;
      if (existing2 && (percent === 0 || existing2.amount !== amount2 || existing2.kind !== kindFor(b.status))) await voidByKey(tx, key2, "Attendance changed");
      if (percent > 0 && !(existing2 && existing2.amount === amount2 && existing2.kind === kindFor(b.status))) {
        await tx.payLine.create({ data: { tutor: { connect: { id: session.tutorId } }, session: { connect: { id: session.id } }, booking: { connect: { id: b.id } }, kind: kindFor(b.status), workedAt: session.startsAt, minutes: b.minutes || minutes, rate, amount: amount2, status: "accrued", activeKey: key2 } });
      }
    }
    return;
  }
  const key = `session:${session.id}`;
  const best = session.status === "cancelled" ? 0 : Math.max(0, ...session.bookings.map((b) => percentFor(b.status)));
  const amount = amountFor(rate, minutes, best);
  const existing = await tx.payLine.findUnique({ where: { activeKey: key }, select: { id: true, status: true, amount: true } });
  if (existing?.status && existing.status !== "accrued") return;
  if (existing && existing.amount !== amount) await voidByKey(tx, key, "Attendance changed");
  if (best > 0 && !(existing && existing.amount === amount)) {
    await tx.payLine.create({ data: { tutor: { connect: { id: session.tutorId } }, session: { connect: { id: session.id } }, kind: "session", workedAt: session.startsAt, minutes, rate, amount, status: "accrued", activeKey: key } });
  }
}
async function voidSessionPay(tx, sessionId, reason) {
  const lines = await tx.payLine.findMany({ where: { sessionId, status: "accrued" }, select: { id: true } });
  for (const l of lines) await tx.payLine.updateMany({ where: { id: l.id, status: "accrued" }, data: { status: "void", activeKey: null, voidReason: reason } });
  return lines.length;
}
async function adjustmentLine(tx, input) {
  return tx.payLine.create({
    data: {
      tutor: { connect: { id: input.tutorId } },
      session: { connect: { id: input.sessionId } },
      kind: "adjustment",
      workedAt: /* @__PURE__ */ new Date(),
      minutes: 0,
      rate: 0,
      amount: input.amount,
      status: "accrued",
      note: input.note,
      ...input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}
    }
  });
}

// features/keystone/lib/invoices.ts
async function nextNumber(tx) {
  await tx.business.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const rows = await tx.$queryRaw`
    UPDATE "Business" SET "nextInvoiceNumber" = COALESCE("nextInvoiceNumber", 1001) + 1 WHERE id = 1
    RETURNING COALESCE("nextInvoiceNumber", 1002) - 1 AS n`;
  return Number(rows[0].n);
}
async function createInvoice(tx, input) {
  if (!input.lines.length) throw new CommandError("An invoice needs at least one line.");
  const business = await getBusiness(tx);
  let taxRate = 0;
  if (input.locationId) {
    const loc = await tx.location.findUnique({ where: { id: input.locationId }, select: { taxRatePercent: true } });
    taxRate = Number(loc?.taxRatePercent ?? 0);
  }
  const lines = input.lines.map((l) => ({ ...l, quantity: l.quantity ?? 1, amount: (l.quantity ?? 1) * l.unitAmount }));
  const subtotal = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const lineDiscount = -lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
  const discount = Math.min(subtotal, (input.discount ?? 0) + lineDiscount);
  const tax = Math.round((subtotal - discount) * taxRate / 100);
  const total = subtotal - discount + tax;
  const status = input.status ?? "open";
  const invoice = await tx.invoice.create({
    data: {
      number: await nextNumber(tx),
      family: { connect: { id: input.familyId } },
      ...input.locationId ? { location: { connect: { id: input.locationId } } } : {},
      ...input.promoCodeId ? { promoCode: { connect: { id: input.promoCodeId } } } : {},
      ...input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {},
      kind: input.kind,
      status,
      issuedAt: status === "open" ? /* @__PURE__ */ new Date() : null,
      dueAt: input.dueAt ?? /* @__PURE__ */ new Date(),
      subtotal,
      discount,
      tax,
      total,
      currency: business.currency || "USD",
      fulfilment: input.fulfilment ?? {},
      notes: input.notes ?? "",
      lines: {
        create: lines.map((l) => ({
          description: l.description,
          kind: l.kind,
          quantity: l.quantity,
          unitAmount: l.unitAmount,
          amount: l.amount,
          ...l.studentId ? { student: { connect: { id: l.studentId } } } : {},
          ...l.programId ? { program: { connect: { id: l.programId } } } : {},
          ...l.bookingId ? { booking: { connect: { id: l.bookingId } } } : {},
          ...l.membershipId ? { membership: { connect: { id: l.membershipId } } } : {},
          ...l.studentPackageId ? { studentPackage: { connect: { id: l.studentPackageId } } } : {},
          ...l.assessmentId ? { assessment: { connect: { id: l.assessmentId } } } : {}
        }))
      }
    }
  });
  return invoice;
}

// features/keystone/lib/booking.ts
var activeKeyFor = (sessionId, studentId) => `${sessionId}:${studentId}`;
async function lockSession(tx, sessionId) {
  const rows = await tx.$queryRaw`SELECT id FROM "Session" WHERE id = ${sessionId} FOR UPDATE`;
  if (!rows.length) throw new CommandError("That session was not found.");
}
async function seatsTaken(tx, sessionId) {
  return tx.booking.count({ where: { sessionId, status: { in: [...SEAT_STATUSES] } } });
}
async function bookSeat(tx, actor, input) {
  await lockSession(tx, input.sessionId);
  const session = await tx.session.findUnique({
    where: { id: input.sessionId },
    include: { program: { select: { id: true, name: true, payAsYouGoPrice: true, format: true } }, location: { select: { id: true } } }
  });
  if (!session || !["scheduled", "needs_cover"].includes(session.status)) throw new CommandError("That session is not open for booking.");
  if (session.startsAt.getTime() <= Date.now()) throw new CommandError("That session has already started.");
  const student = await tx.student.findUnique({ where: { id: input.studentId }, select: { id: true, familyId: true, firstName: true, status: true } });
  if (!student?.familyId) throw new CommandError("That student was not found.");
  const existing = await tx.booking.findUnique({ where: { activeKey: activeKeyFor(session.id, student.id) }, select: { id: true } });
  if (existing) throw new CommandError(`${student.firstName} is already booked on this session.`);
  const taken = await seatsTaken(tx, session.id);
  if (taken >= session.capacity) {
    if (input.whenFull !== "waitlist") throw new CommandError("That session is full.");
    return joinWaitlistInTx(tx, actor, session.id, student.id, student.familyId);
  }
  const overlap = await tx.booking.findFirst({
    where: { studentId: student.id, status: { in: ["booked"] }, startsAt: { lt: session.endsAt }, endsAt: { gt: session.startsAt } },
    select: { id: true }
  });
  if (overlap) throw new CommandError(`${student.firstName} already has a session at that time.`);
  const minutes = Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 6e4);
  const enrollment = await tx.enrollment.findFirst({
    where: { studentId: student.id, programId: session.programId, status: { in: ["active", "matched"] } },
    select: { id: true },
    orderBy: { createdAt: "desc" }
  });
  const grant = await pickGrant(tx, { familyId: student.familyId, studentId: student.id, programId: session.programId, minutes, startsAt: session.startsAt });
  let payAsYouGo = false;
  if (!grant) {
    const family = await tx.family.findUnique({ where: { id: student.familyId }, select: { payAsYouGoAllowed: true } });
    if (!family?.payAsYouGoAllowed || !session.program?.payAsYouGoPrice) throw new CommandError("Not enough credit for this session.");
    payAsYouGo = true;
  }
  if (grant) await reserveMinutes(tx, grant, minutes, session.startsAt);
  const booking = await tx.booking.create({
    data: {
      session: { connect: { id: session.id } },
      student: { connect: { id: student.id } },
      family: { connect: { id: student.familyId } },
      ...enrollment ? { enrollment: { connect: { id: enrollment.id } } } : {},
      ...grant ? { creditGrant: { connect: { id: grant.id } } } : {},
      ...actor ? { createdBy: { connect: { id: actor.userId } } } : {},
      status: "booked",
      activeKey: activeKeyFor(session.id, student.id),
      source: grant?.kind === "make_up" ? "make_up" : input.source,
      payAsYouGo,
      minutes,
      startsAt: session.startsAt,
      endsAt: session.endsAt
    }
  });
  let invoiceId = null;
  if (grant) await writeHold(tx, grant, booking.id, minutes, actor?.userId);
  else {
    const invoice = await createInvoice(tx, {
      familyId: student.familyId,
      locationId: session.locationId,
      kind: "pay_as_you_go",
      actorId: actor?.userId,
      lines: [{ description: `${session.program?.name ?? "Session"} (${session.startsAt.toISOString().slice(0, 10)})`, kind: "pay_as_you_go", unitAmount: session.program.payAsYouGoPrice, studentId: student.id, programId: session.programId, bookingId: booking.id }],
      dueAt: session.startsAt
    });
    invoiceId = invoice.id;
    await tx.booking.update({ where: { id: booking.id }, data: { invoice: { connect: { id: invoice.id } } } });
  }
  await recordChange(tx, { type: "Booking", id: booking.id, from: null, to: "booked", actorId: actor?.userId, data: { sessionId: session.id, grantId: grant?.id ?? null, payAsYouGo } });
  return { kind: "booked", bookingId: booking.id, grantId: grant?.id ?? null, payAsYouGo, invoiceId };
}
async function joinWaitlistInTx(tx, actor, sessionId, studentId, familyId) {
  const key = activeKeyFor(sessionId, studentId);
  const existing = await tx.waitlistEntry.findUnique({ where: { activeKey: key }, select: { id: true, position: true } });
  if (existing) return { kind: "waitlisted", waitlistEntryId: existing.id, position: existing.position };
  const last = await tx.waitlistEntry.aggregate({ where: { sessionId }, _max: { position: true } });
  const position = (last._max.position ?? 0) + 1;
  const entry2 = await tx.waitlistEntry.create({
    data: { session: { connect: { id: sessionId } }, student: { connect: { id: studentId } }, family: { connect: { id: familyId } }, status: "waiting", activeKey: key, position, ...actor ? { createdBy: { connect: { id: actor.userId } } } : {} }
  });
  await recordChange(tx, { type: "WaitlistEntry", id: entry2.id, to: "waiting", actorId: actor?.userId });
  return { kind: "waitlisted", waitlistEntryId: entry2.id, position };
}
async function promoteWaitlist(tx, sessionId) {
  const session = await tx.session.findUnique({ where: { id: sessionId }, select: { capacity: true, startsAt: true, status: true } });
  if (!session || !["scheduled", "needs_cover"].includes(session.status) || session.startsAt.getTime() <= Date.now()) return [];
  const promoted = [];
  const waiting = await tx.waitlistEntry.findMany({ where: { sessionId, status: "waiting" }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  for (const w of waiting) {
    if (await seatsTaken(tx, sessionId) >= session.capacity) break;
    try {
      const result = await bookSeatIfFundable(tx, sessionId, w.studentId);
      if (!result) continue;
      await tx.waitlistEntry.updateMany({ where: { id: w.id, status: "waiting" }, data: { status: "promoted", activeKey: null, promotedAt: /* @__PURE__ */ new Date(), bookingId: result } });
      await recordChange(tx, { type: "WaitlistEntry", id: w.id, from: "waiting", to: "promoted", data: { bookingId: result } });
      promoted.push(result);
    } catch (error) {
      if (error instanceof CommandError) continue;
      throw error;
    }
  }
  return promoted;
}
async function bookSeatIfFundable(tx, sessionId, studentId) {
  const session = await tx.session.findUnique({ where: { id: sessionId }, select: { programId: true, startsAt: true, endsAt: true, program: { select: { payAsYouGoPrice: true } } } });
  const student = await tx.student.findUnique({ where: { id: studentId }, select: { familyId: true, family: { select: { payAsYouGoAllowed: true } } } });
  const minutes = Math.round((session.endsAt - session.startsAt) / 6e4);
  const overlap = await tx.booking.findFirst({ where: { studentId, status: "booked", startsAt: { lt: session.endsAt }, endsAt: { gt: session.startsAt } }, select: { id: true } });
  if (overlap) return null;
  const grant = await pickGrant(tx, { familyId: student.familyId, studentId, programId: session.programId, minutes, startsAt: session.startsAt });
  if (!grant && !(student.family?.payAsYouGoAllowed && session.program?.payAsYouGoPrice)) return null;
  const r = await bookSeat(tx, null, { sessionId, studentId, source: "waitlist", whenFull: "reject" });
  return r.kind === "booked" ? r.bookingId : null;
}
async function previewCancel(tx, booking, excused) {
  const settings = await getSettings(tx);
  const hoursBefore = (booking.startsAt.getTime() - Date.now()) / HOUR;
  const monthStart = new Date(booking.startsAt.getFullYear(), booking.startsAt.getMonth(), 1);
  const monthEnd = new Date(booking.startsAt.getFullYear(), booking.startsAt.getMonth() + 1, 1);
  const used = await tx.booking.count({ where: { studentId: booking.studentId, status: "cancelled_late_excused", startsAt: { gte: monthStart, lt: monthEnd } } });
  const left = Math.max(0, settings.excusedAbsencesPerMonth - used);
  const base = { hoursBefore: Math.round(hoursBefore * 10) / 10, windowHours: settings.cancellationWindowHours, excusedLeftThisMonth: left };
  if (hoursBefore >= settings.cancellationWindowHours || !settings.lateCancelCharged) {
    return { ...base, outcome: hoursBefore >= settings.cancellationWindowHours ? "cancelled_early" : "cancelled_late", creditReturned: true, makeUpGranted: false, makeUpExpiresAt: null, message: "Cancelling now returns the credit." };
  }
  if (excused && left > 0 && !booking.payAsYouGo) {
    const exp = new Date(Date.now() + settings.makeUpExpiryDays * DAY);
    return { ...base, outcome: "cancelled_late_excused", creditReturned: false, makeUpGranted: true, makeUpExpiresAt: exp.toISOString(), message: `This is inside ${settings.cancellationWindowHours} hours. The session is charged, and a make-up credit valid for ${settings.makeUpExpiryDays} days is added.` };
  }
  return { ...base, outcome: "cancelled_late", creditReturned: false, makeUpGranted: false, makeUpExpiresAt: null, message: `This is inside ${settings.cancellationWindowHours} hours, so the session is charged.` };
}
async function cancelSeat(tx, actor, bookingId, opts = {}) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { session: { select: { id: true, programId: true, status: true } } } });
  if (!booking) throw new CommandError("That booking was not found.");
  await lockSession(tx, booking.sessionId);
  if (booking.status !== "booked") throw new CommandError(`This booking is already ${booking.status.replace(/_/g, " ")}.`);
  let outcome;
  let preview = null;
  if (opts.byCentre) outcome = "cancelled_by_centre";
  else {
    if (booking.startsAt.getTime() <= Date.now()) throw new CommandError("This session has started; ask the centre to mark attendance.");
    preview = await previewCancel(tx, booking, Boolean(opts.excused));
    outcome = preview.outcome;
  }
  const res = await tx.booking.updateMany({ where: { id: booking.id, status: "booked" }, data: { status: outcome, activeKey: null, cancelledAt: /* @__PURE__ */ new Date(), lateReason: opts.reason ?? "", ...actor ? { cancelledById: actor.userId } : {} } });
  if (res.count !== 1) throw new CommandError("This booking was changed by someone else. Reload and try again.");
  await recordChange(tx, { type: "Booking", id: booking.id, from: "booked", to: outcome, actorId: actor?.userId, reason: opts.reason });
  if (preview?.creditReturned || outcome === "cancelled_by_centre" || outcome === "cancelled_early") {
    await releaseHold(tx, booking.id, actor?.userId, outcome);
    if (booking.payAsYouGo && booking.invoiceId) await voidUnpaidInvoice(tx, booking.invoiceId, actor, "Booking cancelled in time");
  } else {
    await debitHold(tx, booking.id, actor?.userId, outcome);
  }
  if (outcome === "cancelled_late_excused") {
    const settings = await getSettings(tx);
    await createGrant(tx, {
      familyId: booking.familyId,
      studentId: booking.studentId,
      programId: booking.session.programId,
      kind: "make_up",
      minutes: booking.minutes,
      expiresAt: new Date(Date.now() + settings.makeUpExpiryDays * DAY),
      sourceBookingId: booking.id,
      note: "Make-up for an excused late cancel",
      actorId: actor?.userId
    });
  }
  if (outcome !== "cancelled_by_centre") await accruePay(tx, booking.sessionId);
  const promoted = await promoteWaitlist(tx, booking.sessionId);
  return { outcome, preview, promoted };
}
async function voidUnpaidInvoice(tx, invoiceId, actor, reason) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, amountPaid: true } });
  if (!inv || inv.amountPaid > 0 || !["open", "draft"].includes(inv.status)) return false;
  const r = await tx.invoice.updateMany({ where: { id: invoiceId, status: inv.status, amountPaid: 0 }, data: { status: "void" } });
  if (r.count === 1) await recordChange(tx, { type: "Invoice", id: invoiceId, from: inv.status, to: "void", actorId: actor?.userId, reason });
  return r.count === 1;
}
var ATTENDANCE_OUTCOMES = ["attended", "late", "no_show", "cancelled_late", "cancelled_late_excused"];
async function markSeat(tx, actor, bookingId, outcome) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { session: { select: { id: true, programId: true } } } });
  if (!booking) throw new CommandError("That booking was not found.");
  await lockSession(tx, booking.sessionId);
  if (booking.status !== "booked") throw new CommandError(`Attendance is already marked (${booking.status.replace(/_/g, " ")}). A manager can reopen it.`);
  const keepKey = outcome === "attended" || outcome === "late" || outcome === "no_show";
  const res = await tx.booking.updateMany({ where: { id: booking.id, status: "booked" }, data: { status: outcome, markedById: actor.userId, markedAt: /* @__PURE__ */ new Date(), ...keepKey ? {} : { activeKey: null } } });
  if (res.count !== 1) throw new CommandError("This booking was changed by someone else. Reload and try again.");
  await recordChange(tx, { type: "Booking", id: booking.id, from: "booked", to: outcome, actorId: actor.userId });
  await debitHold(tx, booking.id, actor.userId, outcome);
  if (outcome === "cancelled_late_excused") {
    const settings = await getSettings(tx);
    await createGrant(tx, { familyId: booking.familyId, studentId: booking.studentId, programId: booking.session.programId, kind: "make_up", minutes: booking.minutes, expiresAt: new Date(Date.now() + settings.makeUpExpiryDays * DAY), sourceBookingId: booking.id, note: "Make-up for an excused absence", actorId: actor.userId });
  }
  if (outcome === "attended" || outcome === "late") {
    if (booking.enrollmentId) await tx.enrollment.updateMany({ where: { id: booking.enrollmentId, trialAttendedAt: null, status: "matched" }, data: { trialAttendedAt: /* @__PURE__ */ new Date() } });
    await tx.student.updateMany({ where: { id: booking.studentId, status: "prospect" }, data: { status: "active" } });
  }
  await accruePay(tx, booking.sessionId);
  await completeSessionIfDone(tx, booking.sessionId, actor);
}
async function completeSessionIfDone(tx, sessionId, actor) {
  const open = await tx.booking.count({ where: { sessionId, status: "booked" } });
  if (open > 0) return false;
  const s = await tx.session.findUnique({ where: { id: sessionId }, select: { status: true, startsAt: true } });
  if (!s || !["scheduled", "in_progress", "needs_cover"].includes(s.status) || s.startsAt.getTime() > Date.now() + 15 * 6e4) return false;
  const r = await tx.session.updateMany({ where: { id: sessionId, status: s.status }, data: { status: "completed" } });
  if (r.count === 1) await recordChange(tx, { type: "Session", id: sessionId, from: s.status, to: "completed", actorId: actor?.userId });
  return true;
}
async function reopenSeat(tx, actor, bookingId, correctedStatus, reason) {
  const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { session: { select: { id: true, tutorId: true, subjectId: true, status: true, program: { select: { format: true } } } }, makeUpGrant: { select: { id: true, minutesGranted: true, minutesAvailable: true } } } });
  if (!booking) throw new CommandError("That booking was not found.");
  await lockSession(tx, booking.sessionId);
  const settings = await getSettings(tx);
  const final = ["attended", "late", "cancelled_early", "cancelled_late", "cancelled_late_excused", "no_show", "cancelled_by_centre"];
  if (!final.includes(booking.status)) throw new CommandError("Only a marked or cancelled booking can be reopened.");
  if (booking.startsAt.getTime() < Date.now() - settings.reopenWindowDays * DAY) throw new CommandError(`Bookings can be reopened for ${settings.reopenWindowDays} days.`);
  if (await payLocked(tx, booking)) {
    let delta = 0;
    if (booking.session.tutorId && correctedStatus) {
      const rate = await rateFor(tx, booking.session.tutorId, booking.session.subjectId);
      const pct = (s) => s === "attended" || s === "late" ? 100 : s.startsWith("cancelled_late") ? settings.lateCancelCharged ? settings.tutorPaidOnLateCancelPercent : 0 : s === "no_show" ? settings.noShowCharged ? settings.tutorPaidOnNoShowPercent : 0 : 0;
      delta = Math.round(rate * booking.minutes * (pct(correctedStatus) - pct(booking.status)) / 6e3);
    }
    let lineId = null;
    if (delta !== 0 && booking.session.tutorId) {
      const line = await adjustmentLine(tx, { tutorId: booking.session.tutorId, sessionId: booking.sessionId, amount: delta, note: `Correction for booking ${booking.id}: ${booking.status} \u2192 ${correctedStatus}. ${reason}`.trim(), actorId: actor.userId });
      lineId = line.id;
    }
    await recordChange(tx, { type: "Booking", id: booking.id, from: booking.status, to: booking.status, actorId: actor.userId, reason: "reopen refused: pay approved", data: { adjustmentLineId: lineId, correctedStatus } });
    return { reopened: false, adjustmentLineId: lineId };
  }
  if (booking.status === "cancelled_late_excused" && booking.makeUpGrant) {
    if (booking.makeUpGrant.minutesAvailable < booking.makeUpGrant.minutesGranted) throw new CommandError("The make-up credit from this booking has been used, so it cannot be reopened.");
    await removeUnused(tx, booking.makeUpGrant.id, "adjustment", "voided", actor.userId, "Booking reopened");
    await tx.booking.update({ where: { id: booking.id }, data: { makeUpGrant: { disconnect: true } } });
  }
  await reverseClose(tx, booking.id, actor.userId);
  const r = await tx.booking.updateMany({ where: { id: booking.id, status: booking.status }, data: { status: "booked", activeKey: activeKeyFor(booking.sessionId, booking.studentId), reopenedAt: /* @__PURE__ */ new Date(), markedAt: null, markedById: null, cancelledAt: null, cancelledById: null } });
  if (r.count !== 1) throw new CommandError("This booking was changed by someone else. Reload and try again.");
  await recordChange(tx, { type: "Booking", id: booking.id, from: booking.status, to: "booked", actorId: actor.userId, reason: reason || "reopened", data: { event: "reopened" } });
  if (booking.session.status === "completed") {
    await tx.session.updateMany({ where: { id: booking.sessionId, status: "completed" }, data: { status: "in_progress" } });
    await recordChange(tx, { type: "Session", id: booking.sessionId, from: "completed", to: "in_progress", actorId: actor.userId, reason: "booking reopened" });
  }
  await accruePay(tx, booking.sessionId);
  if (correctedStatus && ATTENDANCE_OUTCOMES.includes(correctedStatus)) await markSeat(tx, actor, booking.id, correctedStatus);
  return { reopened: true, adjustmentLineId: null };
}

// features/keystone/lib/schedule.ts
var import_tz = require("@date-fns/tz");
function localStart(day, startMinute, timezone) {
  return new Date(new import_tz.TZDate(day.y, day.m, day.d, Math.floor(startMinute / 60), startMinute % 60, timezone).getTime());
}
function weeklyDays(from, through, weekday, timezone) {
  const out = [];
  const start = new import_tz.TZDate(from.getTime(), timezone);
  let cursor = new import_tz.TZDate(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, timezone);
  while (cursor.getDay() !== weekday) cursor = new import_tz.TZDate(cursor.getTime() + DAY, timezone);
  while (cursor.getTime() <= through.getTime() + DAY) {
    out.push({ y: cursor.getFullYear(), m: cursor.getMonth(), d: cursor.getDate() });
    cursor = new import_tz.TZDate(cursor.getTime() + 7 * DAY, timezone);
  }
  return out;
}
async function assertTutorFree(tx, tutorId, startsAt, endsAt, exceptSessionId, exceptSeriesId) {
  await lockKey(tx, `tutor:${tutorId}`);
  const clash = await tx.session.findFirst({
    where: {
      tutorId,
      status: { in: ["scheduled", "in_progress", "needs_cover"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...exceptSessionId ? { id: { not: exceptSessionId } } : {},
      ...exceptSeriesId ? { NOT: { seriesId: exceptSeriesId } } : {}
    },
    select: { id: true }
  });
  if (clash) throw new CommandError("That tutor is already teaching at that time.");
  const off = await tx.tutorTimeOff.findFirst({ where: { tutorId, status: "approved", startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
  if (off) throw new CommandError("That tutor has approved time off then.");
  const assessment = await tx.assessment.findFirst({ where: { assessorId: tutorId, status: { in: ["scheduled", "in_progress"] }, scheduledAt: { lt: endsAt, gte: new Date(startsAt.getTime() - 4 * 36e5) } }, select: { scheduledAt: true, minutes: true } });
  if (assessment && assessment.scheduledAt.getTime() + assessment.minutes * 6e4 > startsAt.getTime()) throw new CommandError("That tutor has an assessment at that time.");
}
async function assertRoomFree(tx, roomId, startsAt, endsAt, exceptSessionId, exceptSeriesId) {
  await lockKey(tx, `room:${roomId}`);
  const clash = await tx.session.findFirst({
    where: {
      roomId,
      status: { in: ["scheduled", "in_progress", "needs_cover"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
      ...exceptSessionId ? { id: { not: exceptSessionId } } : {},
      ...exceptSeriesId ? { NOT: { seriesId: exceptSeriesId } } : {}
    },
    select: { id: true }
  });
  if (clash) throw new CommandError("That room is already in use at that time.");
}
async function closedOn(tx, locationId, at) {
  if (!locationId) return false;
  const c = await tx.closure.findFirst({ where: { locationId, startsOn: { lte: at }, endsOn: { gte: new Date(at.getTime() - DAY) } }, select: { id: true } });
  return Boolean(c);
}
async function generateSessions(tx, seriesId, through) {
  await lockKey(tx, `series:${seriesId}`);
  const series = await tx.sessionSeries.findUnique({ where: { id: seriesId }, include: { location: { select: { timezone: true } }, program: { select: { format: true } } } });
  if (!series || series.status !== "active") return 0;
  const tz = series.location?.timezone || "UTC";
  const from = new Date(Math.max(series.startDate.getTime(), (series.generatedThrough?.getTime() ?? 0) + 1, Date.now() - DAY));
  const end = series.endDate && series.endDate < through ? series.endDate : through;
  if (end < from) return 0;
  const rows = [];
  for (const day of weeklyDays(from, end, series.weekday, tz)) {
    const startsAt = localStart(day, series.startMinute, tz);
    if (startsAt < from || startsAt > end) continue;
    if (await closedOn(tx, series.locationId, startsAt)) continue;
    const endsAt = new Date(startsAt.getTime() + series.minutes * 6e4);
    if (series.tutorId) await assertTutorFree(tx, series.tutorId, startsAt, endsAt, null, series.id);
    if (series.roomId) await assertRoomFree(tx, series.roomId, startsAt, endsAt, null, series.id);
    rows.push({
      seriesId: series.id,
      programId: series.programId,
      subjectId: series.subjectId,
      locationId: series.locationId,
      roomId: series.roomId,
      tutorId: series.tutorId,
      mode: series.mode,
      startsAt,
      endsAt,
      capacity: series.capacity,
      status: "scheduled",
      meetingUrl: series.meetingUrl
    });
  }
  const created = rows.length ? await tx.session.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
  await tx.sessionSeries.update({ where: { id: series.id }, data: { generatedThrough: end } });
  return created.count;
}

// features/keystone/mutations/schedule.ts
var gql = String.raw;
var typeDefs = gql`
  type CommandResult {
    success: Boolean!
    error: String
    id: ID
    data: JSON
  }

  type CancellationPreview {
    outcome: String!
    hoursBefore: Float!
    windowHours: Int!
    creditReturned: Boolean!
    makeUpGranted: Boolean!
    makeUpExpiresAt: String
    excusedLeftThisMonth: Int!
    message: String!
  }

  type Query {
    cancellationPreview(bookingId: ID!, excused: Boolean): CancellationPreview
  }

  type Mutation {
    bookSession(sessionId: ID!, studentId: ID!, idempotencyKey: String): CommandResult!
    staffBookSession(sessionId: ID!, studentId: ID!, whenFull: String, idempotencyKey: String): CommandResult!
    cancelBooking(bookingId: ID!, excused: Boolean, reason: String, idempotencyKey: String): CommandResult!
    rescheduleBooking(bookingId: ID!, newSessionId: ID!, idempotencyKey: String): CommandResult!
    joinWaitlist(sessionId: ID!, studentId: ID!, idempotencyKey: String): CommandResult!
    leaveWaitlist(waitlistEntryId: ID!, idempotencyKey: String): CommandResult!
    markAttendance(bookingId: ID!, outcome: String!, idempotencyKey: String): CommandResult!
    reopenBooking(bookingId: ID!, correctedStatus: String, reason: String!, idempotencyKey: String): CommandResult!
    createSessionSeries(data: JSON!, idempotencyKey: String): CommandResult!
    ensureSessionsGenerated(seriesId: ID, weeks: Int, idempotencyKey: String): CommandResult!
    cancelSession(sessionId: ID!, reason: String!, note: String, idempotencyKey: String): CommandResult!
    markSessionNeedsCover(sessionId: ID!, idempotencyKey: String): CommandResult!
    assignSubstitute(sessionId: ID!, tutorId: ID!, idempotencyKey: String): CommandResult!
  }
`;
var keyOf = (a) => typeof a?.idempotencyKey === "string" ? a.idempotencyKey : null;
async function sessionLocation(tx, sessionId) {
  const s = await tx.session.findUnique({ where: { id: sessionId }, select: { id: true, locationId: true, tutorId: true, startsAt: true, endsAt: true, status: true, programId: true } });
  if (!s) throw new CommandError("That session was not found.");
  return s;
}
async function assertMayMark(tx, actor, booking) {
  const s = await sessionLocation(tx, booking.sessionId);
  if (canAt(actor, "canManageSchedule", s.locationId) || canAt(actor, "canMarkAttendance", s.locationId) && !actor.flags.isTutor) return s;
  if (actor.tutorId && s.tutorId === actor.tutorId) {
    const settings = await getSettings(tx);
    const now = Date.now();
    if (now < s.startsAt.getTime() - 15 * 6e4) throw new CommandError("Attendance opens 15 minutes before the session starts.");
    if (now > s.endsAt.getTime() + settings.attendanceEditWindowHours * HOUR) throw new CommandError(`Attendance closed ${settings.attendanceEditWindowHours} hours after the session. Ask the front desk.`);
    return s;
  }
  throw new CommandError("You do not have permission to do that here.");
}
var resolvers = {
  Query: {
    async cancellationPreview(_, args, context) {
      const actorId = context.session?.itemId;
      if (!actorId) return null;
      const prisma = context.sudo().prisma;
      const booking = await prisma.booking.findFirst({ where: { id: args.bookingId, status: "booked", family: { guardians: { some: { id: actorId } } } } });
      if (!booking) {
        const staff2 = await prisma.booking.findUnique({ where: { id: args.bookingId } });
        if (!staff2 || !context.session?.data?.role?.canManageSchedule || staff2.status !== "booked") return null;
        return previewCancel(prisma, staff2, Boolean(args.excused));
      }
      return previewCancel(prisma, booking, Boolean(args.excused));
    }
  },
  Mutation: {
    bookSession: (_, args, context) => runCommand(context, { name: "bookSession", input: { s: args.sessionId, st: args.studentId }, idempotencyKey: keyOf(args), conflictMessage: "That student is already booked on this session." }, async (tx, actor) => {
      const student = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { familyId: true } });
      await requireGuardianOf(tx, actor, student?.familyId);
      const settings = await getSettings(tx);
      const s = await sessionLocation(tx, String(args.sessionId));
      if (s.startsAt.getTime() > Date.now() + settings.bookingHorizonDays * DAY) throw new CommandError(`Sessions can be booked up to ${settings.bookingHorizonDays} days ahead.`);
      const r = await bookSeat(tx, actor, { sessionId: s.id, studentId: String(args.studentId), source: "self_booked", whenFull: "reject" });
      return { id: r.kind === "booked" ? r.bookingId : r.waitlistEntryId, data: r };
    }),
    staffBookSession: (_, args, context) => runCommand(context, { name: "staffBookSession", input: { s: args.sessionId, st: args.studentId, w: args.whenFull }, idempotencyKey: keyOf(args), conflictMessage: "That student is already booked on this session." }, async (tx, actor) => {
      const s = await sessionLocation(tx, String(args.sessionId));
      requireFlag(actor, "canManageSchedule", s.locationId);
      const r = await bookSeat(tx, actor, { sessionId: s.id, studentId: String(args.studentId), source: "staff", whenFull: args.whenFull === "waitlist" ? "waitlist" : "reject" });
      return { id: r.kind === "booked" ? r.bookingId : r.waitlistEntryId, data: r };
    }),
    cancelBooking: (_, args, context) => runCommand(context, { name: "cancelBooking", input: { b: args.bookingId, e: Boolean(args.excused) }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const booking = await tx.booking.findUnique({ where: { id: String(args.bookingId) }, select: { id: true, familyId: true, sessionId: true } });
      if (!booking) throw new CommandError("That booking was not found.");
      const s = await sessionLocation(tx, booking.sessionId);
      if (!canAt(actor, "canManageSchedule", s.locationId)) await requireGuardianOf(tx, actor, booking.familyId);
      const r = await cancelSeat(tx, actor, booking.id, { excused: Boolean(args.excused), reason: optionalString(args.reason, 500) });
      return { id: booking.id, data: r };
    }),
    rescheduleBooking: (_, args, context) => runCommand(context, { name: "rescheduleBooking", input: { b: args.bookingId, n: args.newSessionId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const booking = await tx.booking.findUnique({ where: { id: String(args.bookingId) }, select: { id: true, familyId: true, sessionId: true, studentId: true, startsAt: true, status: true } });
      if (!booking || booking.status !== "booked") throw new CommandError("Only an upcoming booking can be moved.");
      const s = await sessionLocation(tx, booking.sessionId);
      const staff2 = canAt(actor, "canManageSchedule", s.locationId);
      if (!staff2) await requireGuardianOf(tx, actor, booking.familyId);
      const settings = await getSettings(tx);
      if (!staff2 && booking.startsAt.getTime() - Date.now() < settings.cancellationWindowHours * HOUR) throw new CommandError(`Sessions can be moved up to ${settings.cancellationWindowHours} hours before they start. Inside that, cancel instead.`);
      const target = await sessionLocation(tx, String(args.newSessionId));
      if (target.id === s.id) throw new CommandError("Pick a different session.");
      if (target.programId !== s.programId) throw new CommandError("A booking can only move to a session of the same programme.");
      for (const id of [s.id, target.id].sort()) await lockSession(tx, id);
      await tx.booking.updateMany({ where: { id: booking.id, status: "booked" }, data: { status: "cancelled_early", activeKey: null, cancelledAt: /* @__PURE__ */ new Date(), cancelledById: actor.userId, lateReason: "rescheduled" } });
      await recordChange(tx, { type: "Booking", id: booking.id, from: "booked", to: "cancelled_early", actorId: actor.userId, reason: "rescheduled", data: { to: target.id } });
      await releaseHold(tx, booking.id, actor.userId, "rescheduled");
      const r = await bookSeat(tx, actor, { sessionId: target.id, studentId: booking.studentId, source: staff2 ? "staff" : "self_booked", whenFull: "reject" });
      await promoteWaitlist(tx, s.id);
      return { id: r.kind === "booked" ? r.bookingId : null, data: { from: booking.id, ...r } };
    }),
    joinWaitlist: (_, args, context) => runCommand(context, { name: "joinWaitlist", input: { s: args.sessionId, st: args.studentId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const student = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { familyId: true } });
      const s = await sessionLocation(tx, String(args.sessionId));
      if (!canAt(actor, "canManageSchedule", s.locationId)) await requireGuardianOf(tx, actor, student?.familyId);
      await lockSession(tx, s.id);
      if (!["scheduled", "needs_cover"].includes(s.status) || s.startsAt.getTime() <= Date.now()) throw new CommandError("That session is not open.");
      const r = await joinWaitlistInTx(tx, actor, s.id, String(args.studentId), student.familyId);
      return { id: r.kind === "waitlisted" ? r.waitlistEntryId : null, data: r };
    }),
    leaveWaitlist: (_, args, context) => runCommand(context, { name: "leaveWaitlist", input: { w: args.waitlistEntryId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const w = await tx.waitlistEntry.findUnique({ where: { id: String(args.waitlistEntryId) }, select: { id: true, familyId: true, sessionId: true } });
      if (!w) throw new CommandError("That waitlist place was not found.");
      const s = await sessionLocation(tx, w.sessionId);
      if (!canAt(actor, "canManageSchedule", s.locationId)) await requireGuardianOf(tx, actor, w.familyId);
      await transition(tx, actor, "waitlistEntry", "WaitlistEntry", w.id, "waiting", "cancelled", { activeKey: null });
      return { id: w.id };
    }),
    markAttendance: (_, args, context) => runCommand(context, { name: "markAttendance", input: { b: args.bookingId, o: args.outcome }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      if (!ATTENDANCE_OUTCOMES.includes(args.outcome)) throw new CommandError("Choose attended, late, no show or late cancel.");
      const booking = await tx.booking.findUnique({ where: { id: String(args.bookingId) }, select: { id: true, sessionId: true } });
      if (!booking) throw new CommandError("That booking was not found.");
      await assertMayMark(tx, actor, booking);
      await markSeat(tx, actor, booking.id, args.outcome);
      return { id: booking.id, data: { status: args.outcome } };
    }),
    reopenBooking: (_, args, context) => runCommand(context, { name: "reopenBooking", input: { b: args.bookingId, c: args.correctedStatus ?? null, r: args.reason }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const booking = await tx.booking.findUnique({ where: { id: String(args.bookingId) }, select: { id: true, sessionId: true } });
      if (!booking) throw new CommandError("That booking was not found.");
      const s = await sessionLocation(tx, booking.sessionId);
      if (!canAt(actor, "canManagePayroll", s.locationId)) throw new CommandError("Only a manager can reopen a marked booking.");
      const r = await reopenSeat(tx, actor, booking.id, args.correctedStatus ?? null, requireString(args.reason, "A reason", 500));
      if (!r.reopened) return { id: booking.id, data: r, refusal: "Pay for this session is already in an approved payroll run, so it cannot be reopened. An adjustment line was added to the next run instead." };
      return { id: booking.id, data: r };
    }),
    createSessionSeries: (_, args, context) => runCommand(context, { name: "createSessionSeries", input: args.data, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const d = args.data || {};
      const locationId = d.locationId ? String(d.locationId) : null;
      requireFlag(actor, "canManageSchedule", locationId);
      const program = await tx.program.findUnique({ where: { id: requireString(d.programId, "Programme") }, select: { id: true, sessionMinutes: true, maxStudentsPerSession: true, format: true } });
      if (!program) throw new CommandError("That programme was not found.");
      const weekday = requireInt(d.weekday, "Weekday", 0, 6);
      const startMinute = requireInt(d.startMinute, "Start time", 0, 1439);
      const minutes = d.minutes ? requireInt(d.minutes, "Length", 15, 600) : program.sessionMinutes;
      const capacity = program.format === "one_to_one" ? 1 : d.capacity ? requireInt(d.capacity, "Capacity", 1, 200) : program.maxStudentsPerSession;
      if (d.roomId) {
        const room = await tx.room.findUnique({ where: { id: String(d.roomId) }, select: { capacity: true, locationId: true } });
        if (!room || room.locationId !== locationId) throw new CommandError("That room is not at this location.");
        if (capacity > room.capacity) throw new CommandError(`That room seats ${room.capacity}.`);
      }
      const startDate = requireDate(d.startDate, "Start date");
      const series = await tx.sessionSeries.create({
        data: {
          program: { connect: { id: program.id } },
          ...d.subjectId ? { subject: { connect: { id: String(d.subjectId) } } } : {},
          ...locationId ? { location: { connect: { id: locationId } } } : {},
          ...d.roomId ? { room: { connect: { id: String(d.roomId) } } } : {},
          ...d.tutorId ? { tutor: { connect: { id: String(d.tutorId) } } } : {},
          ...d.enrollmentId ? { enrollment: { connect: { id: String(d.enrollmentId) } } } : {},
          mode: d.mode || "in_centre",
          weekday,
          startMinute,
          minutes,
          capacity,
          startDate,
          endDate: d.endDate ? requireDate(d.endDate, "End date") : null,
          meetingUrl: optionalString(d.meetingUrl, 500),
          status: "active",
          createdBy: { connect: { id: actor.userId } }
        }
      });
      await recordChange(tx, { type: "SessionSeries", id: series.id, to: "active", actorId: actor.userId });
      const weeks = d.weeks ? requireInt(d.weeks, "Weeks", 1, 26) : 4;
      const generated = await generateSessions(tx, series.id, new Date(Date.now() + weeks * 7 * DAY));
      return { id: series.id, data: { generated } };
    }),
    ensureSessionsGenerated: (_, args, context) => runCommand(context, { name: "ensureSessionsGenerated", input: { s: args.seriesId ?? null, w: args.weeks ?? null }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      requireFlag(actor, "canManageSchedule");
      const settings = await getSettings(tx);
      const through = new Date(Date.now() + (args.weeks ? requireInt(args.weeks, "Weeks", 1, 26) * 7 : settings.bookingHorizonDays) * DAY);
      const series = await tx.sessionSeries.findMany({ where: { status: "active", ...args.seriesId ? { id: String(args.seriesId) } : {} }, select: { id: true, locationId: true } });
      let generated = 0;
      for (const s of series) if (canAt(actor, "canManageSchedule", s.locationId)) generated += await generateSessions(tx, s.id, through);
      return { id: null, data: { generated, series: series.length } };
    }),
    cancelSession: (_, args, context) => runCommand(context, { name: "cancelSession", input: { s: args.sessionId, r: args.reason }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const reasons = ["tutor_absent", "closure", "low_enrolment", "other"];
      if (!reasons.includes(args.reason)) throw new CommandError("Choose a reason: tutor absent, closure, low enrolment or other.");
      const s = await sessionLocation(tx, String(args.sessionId));
      requireFlag(actor, "canManageSchedule", s.locationId);
      await lockSession(tx, s.id);
      await transition(tx, actor, "session", "Session", s.id, ["scheduled", "needs_cover", "in_progress"], "cancelled", { cancelReason: `${args.reason}${args.note ? `: ${optionalString(args.note, 300)}` : ""}` }, args.reason);
      const bookings = await tx.booking.findMany({ where: { sessionId: s.id, status: "booked" }, select: { id: true } });
      for (const b of bookings) await cancelSeat(tx, actor, b.id, { byCentre: true, reason: args.reason });
      const voided = await voidSessionPay(tx, s.id, `Session cancelled: ${args.reason}`);
      await tx.waitlistEntry.updateMany({ where: { sessionId: s.id, status: "waiting" }, data: { status: "cancelled", activeKey: null } });
      return { id: s.id, data: { bookingsCancelled: bookings.length, payLinesVoided: voided } };
    }),
    markSessionNeedsCover: (_, args, context) => runCommand(context, { name: "markSessionNeedsCover", input: { s: args.sessionId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const s = await sessionLocation(tx, String(args.sessionId));
      requireFlag(actor, "canManageSchedule", s.locationId);
      await transition(tx, actor, "session", "Session", s.id, "scheduled", "needs_cover");
      return { id: s.id };
    }),
    assignSubstitute: (_, args, context) => runCommand(context, { name: "assignSubstitute", input: { s: args.sessionId, t: args.tutorId }, idempotencyKey: keyOf(args) }, async (tx, actor) => {
      const s = await sessionLocation(tx, String(args.sessionId));
      requireFlag(actor, "canManageSchedule", s.locationId);
      const tutor = await tx.tutor.findUnique({ where: { id: String(args.tutorId) }, select: { id: true, status: true } });
      if (!tutor || tutor.status !== "active") throw new CommandError("That tutor is not active.");
      if (tutor.id === s.tutorId) throw new CommandError("That tutor is already on this session.");
      await assertTutorFree(tx, tutor.id, s.startsAt, s.endsAt, s.id);
      await lockSession(tx, s.id);
      if (!["scheduled", "needs_cover"].includes(s.status)) throw new CommandError("Only an upcoming session can get a substitute.");
      const r = await tx.session.updateMany({ where: { id: s.id, status: s.status }, data: { tutorId: tutor.id, substituteForId: s.tutorId, status: "scheduled" } });
      if (r.count !== 1) throw new CommandError("This session was changed by someone else. Reload and try again.");
      await recordChange(tx, { type: "Session", id: s.id, from: s.status, to: "scheduled", actorId: actor.userId, reason: "substitute", data: { from: s.tutorId, to: tutor.id } });
      await voidSessionPay(tx, s.id, "Substitute assigned");
      return { id: s.id };
    })
  }
};

// features/keystone/queries/storefront.ts
var storefront_exports = {};
__export(storefront_exports, {
  resolvers: () => resolvers2,
  typeDefs: () => typeDefs2,
  tzOffset: () => tzOffset,
  zonedTime: () => zonedTime
});
var gql2 = String.raw;
var typeDefs2 = gql2`
  type Query {
    storefrontBusiness: JSON
    storefrontPrograms(subject: String, level: String, mode: String): JSON
    storefrontProgram(slug: String!): JSON
    storefrontLocations: JSON
    storefrontLocation(slug: String!): JSON
    storefrontTutors(filter: JSON): JSON
    storefrontTutor(slug: String!): JSON
    storefrontPricing: JSON
    storefrontPolicies: JSON
    assessmentSlots(programId: ID!, locationId: ID, mode: String, from: String, to: String): JSON
    openSessions(programId: ID, locationId: ID, from: String, to: String): JSON
    myFamily: JSON
    myStudent(id: ID!): JSON
    myUpcomingBookings(includePast: Boolean, studentId: ID): JSON
    myBooking(id: ID!): JSON
    myCredits: JSON
    myInvoices: JSON
    myInvoice(id: ID!): JSON
  }
`;
var DAY2 = 864e5;
var ACTIVE_BOOKING = ["booked", "attended", "late", "cancelled_late", "cancelled_late_excused", "no_show"];
function tzOffset(t, tz) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(t / 1e3) * 1e3;
}
function zonedTime(y, m, d, minute, tz) {
  const guess = Date.UTC(y, m, d, 0, minute);
  const first = guess - tzOffset(guess, tz);
  return first - (tzOffset(first, tz) - tzOffset(guess, tz));
}
function localDay(t, tz) {
  const local = new Date(t + tzOffset(t, tz));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate(), weekday: local.getUTCDay() };
}
async function imageUrl(context, id, ext) {
  if (!id || !ext) return null;
  try {
    return await context.images("my_images").getUrl(id, ext);
  } catch {
    return null;
  }
}
var sinceAndUntil = (from, to, days = 28) => {
  const start = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : /* @__PURE__ */ new Date();
  const end = to && !Number.isNaN(Date.parse(to)) ? new Date(to) : new Date(start.getTime() + days * DAY2);
  return { start, end: new Date(Math.min(end.getTime(), start.getTime() + 62 * DAY2)) };
};
async function defaultTimezone(prisma) {
  const loc = await prisma.location.findFirst({ where: { status: "active" }, orderBy: { createdAt: "asc" }, select: { timezone: true } });
  return loc?.timezone || "America/New_York";
}
var publicLocation = { id: true, name: true, slug: true, city: true, region: true, timezone: true, status: true };
async function programCard(context, p) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    summary: p.summary,
    image: await imageUrl(context, p.image_id, p.image_extension),
    format: p.format,
    deliveryModes: Array.isArray(p.deliveryModes) ? p.deliveryModes : [],
    sessionMinutes: p.sessionMinutes,
    maxStudentsPerSession: p.maxStudentsPerSession,
    requiresAssessment: p.requiresAssessment,
    assessmentFee: p.assessmentFee,
    assessmentMinutes: p.assessmentMinutes,
    payAsYouGoPrice: p.payAsYouGoPrice,
    featured: p.featured,
    billingModel: p.billingModel,
    placementFee: p.placementFee,
    subjects: (p.subjects ?? []).map((s) => ({ id: s.id, name: s.name, slug: s.slug, category: s.category })),
    levelsFrom: p.levelsFrom ? { id: p.levelsFrom.id, name: p.levelsFrom.name } : null,
    levelsTo: p.levelsTo ? { id: p.levelsTo.id, name: p.levelsTo.name } : null,
    locations: (p.locations ?? []).filter((l) => l.status !== "closed").map((l) => ({ id: l.id, name: l.name, slug: l.slug, city: l.city })),
    fromPrice: Math.min(...[...(p.plans ?? []).map((x) => x.price), ...(p.packages ?? []).map((x) => x.price)].filter((n) => n > 0), Number.MAX_SAFE_INTEGER)
  };
}
var programInclude = {
  subjects: { orderBy: { sortOrder: "asc" } },
  levelsFrom: true,
  levelsTo: true,
  locations: { select: { id: true, name: true, slug: true, city: true, status: true } },
  plans: { where: { status: "published" }, select: { price: true } },
  packages: { where: { status: "published" }, select: { price: true } }
};
var planOut = (p) => ({ id: p.id, name: p.name, sessionsPerPeriod: p.sessionsPerPeriod, weeklyCapForUnlimited: p.weeklyCapForUnlimited, price: p.price, enrolmentFee: p.enrolmentFee, minimumTermMonths: p.minimumTermMonths, description: p.description, features: Array.isArray(p.features) ? p.features : [], highlight: p.highlight, programId: p.programId });
var packageOut = (p) => ({ id: p.id, name: p.name, hours: p.hours, price: p.price, pricePerHour: p.hours ? Math.round(p.price / p.hours) : 0, expiryMonths: p.expiryMonths, description: p.description, programId: p.programId });
async function tutorCard(context, t, ratings) {
  const r = ratings.get(t.id);
  return {
    id: t.id,
    slug: t.slug,
    displayName: t.displayName,
    headline: t.headline,
    photo: await imageUrl(context, t.photo_id, t.photo_extension) || t.photoUrl || null,
    yearsExperience: t.yearsExperience,
    education: t.education,
    deliveryModes: Array.isArray(t.deliveryModes) ? t.deliveryModes : [],
    travelAreas: t.travelAreas,
    subjects: (t.subjects ?? []).map((s) => ({ id: s.subject?.id, name: s.subject?.name, slug: s.subject?.slug, levelFrom: s.levelFrom?.name ?? null, levelTo: s.levelTo?.name ?? null })).filter((s) => s.id),
    locations: (t.locations ?? []).map((l) => ({ id: l.id, name: l.name, slug: l.slug })),
    averageRating: r ? Math.round(r.avg * 10) / 10 : null,
    reviewCount: r?.count ?? 0
  };
}
var tutorInclude = { subjects: { include: { subject: true, levelFrom: true, levelTo: true } }, locations: { select: { id: true, name: true, slug: true } } };
async function ratingsFor(prisma, ids) {
  const rows = await prisma.review.groupBy({ by: ["tutorId"], where: { tutorId: { in: ids }, status: "published" }, _avg: { rating: true }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.tutorId, { avg: r._avg.rating ?? 0, count: r._count._all }]));
}
var reviewOut = (r) => ({ id: r.id, authorName: r.authorName, rating: r.rating, text: r.text, tutor: r.tutor ? { name: r.tutor.displayName, slug: r.tutor.slug } : null, program: r.program ? { name: r.program.name, slug: r.program.slug } : null, location: r.location ? { name: r.location.name } : null, createdAt: r.createdAt });
async function myFamilyId(context) {
  const userId = context.session?.itemId;
  if (!userId) return null;
  const family = await context.sudo().prisma.family.findFirst({ where: { guardians: { some: { id: userId } } }, select: { id: true } });
  return family?.id ?? null;
}
function sessionOut(s) {
  return {
    id: s.id,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    mode: s.mode,
    status: s.status,
    capacity: s.capacity,
    isTrial: s.isTrial,
    program: s.program ? { id: s.program.id, name: s.program.name, slug: s.program.slug, format: s.program.format } : null,
    subject: s.subject ? { name: s.subject.name } : null,
    location: s.location ? { id: s.location.id, name: s.location.name, slug: s.location.slug, timezone: s.location.timezone } : null,
    room: s.room ? { name: s.room.name } : null,
    tutor: s.tutor ? { id: s.tutor.id, displayName: s.tutor.displayName, slug: s.tutor.publicProfile ? s.tutor.slug : null } : null
  };
}
var sessionInclude = { program: true, subject: true, location: true, room: true, tutor: { select: { id: true, displayName: true, slug: true, publicProfile: true } } };
var resolvers2 = {
  Query: {
    async storefrontBusiness(_, __, context) {
      const prisma = context.sudo().prisma;
      const [business, settings, featured, locations, reviews] = await Promise.all([
        prisma.business.findUnique({ where: { id: 1 } }),
        prisma.businessSettings.findUnique({ where: { id: 1 } }),
        prisma.program.findMany({ where: { status: "published", featured: true }, include: programInclude, orderBy: { createdAt: "asc" }, take: 6 }),
        prisma.location.findMany({ where: { status: { in: ["active", "coming_soon"] } }, select: { ...publicLocation, addressLine1: true, phone: true }, orderBy: { name: "asc" } }),
        prisma.review.findMany({ where: { status: "published" }, include: { tutor: true, program: true, location: true }, orderBy: [{ rating: "desc" }, { createdAt: "desc" }], take: 6 })
      ]);
      if (!business || !business.name) return null;
      const [tutorStats, reviewStats, programCount] = await Promise.all([
        prisma.tutor.aggregate({ where: { status: "active", publicProfile: true }, _count: { _all: true }, _avg: { yearsExperience: true } }),
        prisma.review.aggregate({ where: { status: "published" }, _count: { _all: true }, _avg: { rating: true } }),
        prisma.program.count({ where: { status: "published" } })
      ]);
      return {
        stats: {
          tutors: tutorStats._count._all,
          averageYearsExperience: Math.round(tutorStats._avg.yearsExperience ?? 0),
          reviews: reviewStats._count._all,
          averageRating: reviewStats._avg.rating ? Math.round(reviewStats._avg.rating * 10) / 10 : null,
          programs: programCount,
          locations: locations.filter((l) => l.status === "active").length
        },
        name: business.name,
        legalName: business.legalName,
        about: business.about,
        kind: business.kind,
        logo: await imageUrl(context, business.logo_id, business.logo_extension),
        currency: business.currency,
        country: business.country,
        supportEmail: business.supportEmail,
        careersEmail: business.careersEmail,
        phone: business.phone,
        socialLinks: business.socialLinks ?? {},
        // Marketing copy lives in socialLinks/about until a dedicated field exists; claims are only shown when set.
        homepage: business.homepage ?? null,
        policiesSet: Boolean(settings?.policiesText),
        featuredPrograms: await Promise.all(featured.map((p) => programCard(context, p))),
        locations,
        reviews: reviews.map(reviewOut)
      };
    },
    async storefrontPrograms(_, args, context) {
      const prisma = context.sudo().prisma;
      const where = { status: "published" };
      if (args.subject) where.subjects = { some: { slug: args.subject } };
      const rows = await prisma.program.findMany({ where, include: programInclude, orderBy: [{ featured: "desc" }, { name: "asc" }] });
      let filtered = rows;
      if (args.mode) filtered = filtered.filter((p) => Array.isArray(p.deliveryModes) && p.deliveryModes.includes(args.mode));
      if (args.level) {
        const level = await prisma.level.findFirst({ where: { OR: [{ id: args.level }, { name: args.level }] } });
        if (level) filtered = filtered.filter((p) => (!p.levelsFrom || p.levelsFrom.sortOrder <= level.sortOrder) && (!p.levelsTo || p.levelsTo.sortOrder >= level.sortOrder));
      }
      const [subjects, levels] = await Promise.all([
        prisma.subject.findMany({ where: { programs: { some: { status: "published" } } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, slug: true, category: true } }),
        prisma.level.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, kind: true } })
      ]);
      return { programs: await Promise.all(filtered.map((p) => programCard(context, p))), subjects, levels };
    },
    async storefrontProgram(_, { slug: slug2 }, context) {
      const prisma = context.sudo().prisma;
      const p = await prisma.program.findFirst({
        where: { slug: slug2, status: "published" },
        include: { ...programInclude, plans: { where: { status: "published" }, orderBy: { sortOrder: "asc" } }, packages: { where: { status: "published" }, orderBy: { sortOrder: "asc" } } }
      });
      if (!p) return null;
      const [tutors, reviews, settings] = await Promise.all([
        prisma.tutor.findMany({ where: { status: "active", publicProfile: true, subjects: { some: { subjectId: { in: p.subjects.map((s) => s.id) } } } }, include: tutorInclude, take: 6, orderBy: { yearsExperience: "desc" } }),
        prisma.review.findMany({ where: { status: "published", programId: p.id }, include: { tutor: true, program: true, location: true }, orderBy: { createdAt: "desc" }, take: 6 }),
        prisma.businessSettings.findUnique({ where: { id: 1 } })
      ]);
      const ratings = await ratingsFor(prisma, tutors.map((t) => t.id));
      return {
        ...await programCard(context, p),
        description: p.description,
        outcomes: p.outcomes,
        faq: Array.isArray(p.faq) ? p.faq : [],
        allowsTrial: p.allowsTrial,
        plans: p.plans.map(planOut),
        packages: p.packages.map(packageOut),
        tutors: await Promise.all(tutors.map((t) => tutorCard(context, t, ratings))),
        reviews: reviews.map(reviewOut),
        siblingDiscountPercent: settings?.siblingDiscountPercent ?? 10
      };
    },
    async storefrontLocations(_, __, context) {
      const prisma = context.sudo().prisma;
      const rows = await prisma.location.findMany({
        where: { status: { in: ["active", "coming_soon"] } },
        orderBy: { name: "asc" },
        include: { programs: { where: { status: "published" }, select: { id: true, name: true, slug: true } } }
      });
      return Promise.all(rows.map(async (l) => locationOut(context, l)));
    },
    async storefrontLocation(_, { slug: slug2 }, context) {
      const prisma = context.sudo().prisma;
      const l = await prisma.location.findFirst({
        where: { slug: slug2, status: { in: ["active", "coming_soon"] } },
        include: { programs: { where: { status: "published" }, include: programInclude } }
      });
      if (!l) return null;
      const [tutors, reviews, closures] = await Promise.all([
        prisma.tutor.findMany({ where: { status: "active", publicProfile: true, locations: { some: { id: l.id } } }, include: tutorInclude, orderBy: { displayName: "asc" } }),
        prisma.review.findMany({ where: { status: "published", locationId: l.id }, include: { tutor: true, program: true, location: true }, orderBy: { createdAt: "desc" }, take: 6 }),
        prisma.closure.findMany({ where: { locationId: l.id, endsOn: { gte: /* @__PURE__ */ new Date() } }, orderBy: { startsOn: "asc" }, take: 5, select: { startsOn: true, endsOn: true, reason: true } })
      ]);
      const ratings = await ratingsFor(prisma, tutors.map((t) => t.id));
      return {
        ...await locationOut(context, l),
        programs: await Promise.all(l.programs.map((p) => programCard(context, p))),
        tutors: await Promise.all(tutors.map((t) => tutorCard(context, t, ratings))),
        reviews: reviews.map(reviewOut),
        closures
      };
    },
    async storefrontTutors(_, { filter }, context) {
      const prisma = context.sudo().prisma;
      const where = { status: "active", publicProfile: true };
      if (filter?.subject) where.subjects = { some: { subject: { slug: String(filter.subject) } } };
      if (filter?.location) where.locations = { some: { slug: String(filter.location) } };
      let rows = await prisma.tutor.findMany({ where, include: tutorInclude, orderBy: { displayName: "asc" } });
      if (filter?.mode) rows = rows.filter((t) => Array.isArray(t.deliveryModes) && t.deliveryModes.includes(String(filter.mode)));
      const ratings = await ratingsFor(prisma, rows.map((t) => t.id));
      const [subjects, locations] = await Promise.all([
        prisma.subject.findMany({ orderBy: { sortOrder: "asc" }, select: { name: true, slug: true } }),
        prisma.location.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { name: true, slug: true } })
      ]);
      return { tutors: await Promise.all(rows.map((t) => tutorCard(context, t, ratings))), subjects, locations };
    },
    async storefrontTutor(_, { slug: slug2 }, context) {
      const prisma = context.sudo().prisma;
      const t = await prisma.tutor.findFirst({ where: { slug: slug2, status: "active", publicProfile: true }, include: tutorInclude });
      if (!t) return null;
      const ratings = await ratingsFor(prisma, [t.id]);
      const reviews = await prisma.review.findMany({ where: { status: "published", tutorId: t.id }, include: { tutor: true, program: true, location: true }, orderBy: { createdAt: "desc" }, take: 10 });
      const subjectIds = t.subjects.map((s) => s.subjectId);
      const programs = await prisma.program.findMany({ where: { status: "published", subjects: { some: { id: { in: subjectIds } } } }, include: programInclude, orderBy: { name: "asc" } });
      return {
        ...await tutorCard(context, t, ratings),
        bio: t.bio,
        reviews: reviews.map(reviewOut),
        programs: await Promise.all(programs.map((p) => programCard(context, p)))
      };
    },
    async storefrontPricing(_, __, context) {
      const prisma = context.sudo().prisma;
      const [programs, settings, business] = await Promise.all([
        prisma.program.findMany({
          where: { status: "published" },
          orderBy: [{ featured: "desc" }, { name: "asc" }],
          include: { ...programInclude, plans: { where: { status: "published" }, orderBy: { sortOrder: "asc" } }, packages: { where: { status: "published" }, orderBy: { sortOrder: "asc" } } }
        }),
        prisma.businessSettings.findUnique({ where: { id: 1 } }),
        prisma.business.findUnique({ where: { id: 1 }, select: { currency: true } })
      ]);
      return {
        currency: business?.currency || "USD",
        siblingDiscountPercent: settings?.siblingDiscountPercent ?? 10,
        cancellationWindowHours: settings?.cancellationWindowHours ?? 24,
        membershipCancelNoticeDays: settings?.membershipCancelNoticeDays ?? 30,
        programs: await Promise.all(programs.map(async (p) => ({ ...await programCard(context, p), plans: p.plans.map(planOut), packages: p.packages.map(packageOut) })))
      };
    },
    /** Live policy numbers from settings (§6.1 P15): shown on /policies and at checkout. */
    async storefrontPolicies(_, __, context) {
      const prisma = context.sudo().prisma;
      const [s, business] = await Promise.all([
        prisma.businessSettings.findUnique({ where: { id: 1 } }),
        prisma.business.findUnique({ where: { id: 1 }, select: { name: true, supportEmail: true, phone: true } })
      ]);
      const pick = (key, fallback) => s && s[key] !== null && s[key] !== void 0 ? s[key] : fallback;
      return {
        businessName: business?.name ?? "",
        supportEmail: business?.supportEmail ?? "",
        phone: business?.phone ?? "",
        cancellationWindowHours: pick("cancellationWindowHours", 24),
        lateCancelCharged: pick("lateCancelCharged", true),
        noShowCharged: pick("noShowCharged", true),
        excusedAbsencesPerMonth: pick("excusedAbsencesPerMonth", 1),
        makeUpExpiryDays: pick("makeUpExpiryDays", 60),
        membershipRolloverPeriods: pick("membershipRolloverPeriods", 1),
        membershipCancelNoticeDays: pick("membershipCancelNoticeDays", 30),
        pauseMinDays: pick("pauseMinDays", 14),
        pauseMaxDays: pick("pauseMaxDays", 28),
        pausesPerYear: pick("pausesPerYear", 1),
        siblingDiscountPercent: pick("siblingDiscountPercent", 10),
        freeRematches: pick("freeRematches", 1),
        assessmentCancelRefundHours: pick("assessmentCancelRefundHours", 24),
        assessmentFeeKeptOnLateCancel: pick("assessmentFeeKeptOnLateCancel", true),
        suspendAfterDays: pick("suspendAfterDays", 10),
        enrolmentFeeWaivedWithinDays: pick("enrolmentFeeWaivedWithinDays", 90),
        policiesText: pick("policiesText", "")
      };
    },
    /**
     * Real assessment availability: for each assessor who teaches one of the programme's subjects
     * and is available in that mode (and at that location for in-centre), every start on the
     * assessment-length grid inside their availability, minus their sessions, assessments, time off
     * and the location's closures. Mirrors the `slotKey` "<tutorId>:<startISO>" used by bookAssessment.
     */
    async assessmentSlots(_, args, context) {
      const prisma = context.sudo().prisma;
      const program = await prisma.program.findFirst({ where: { id: args.programId, status: "published" }, include: { subjects: { select: { id: true } }, locations: { select: { id: true } } } });
      if (!program) return { slots: [], reason: "That programme is not available." };
      const mode = args.mode || (args.locationId ? "in_centre" : "online");
      const modes = Array.isArray(program.deliveryModes) ? program.deliveryModes : [];
      if (!modes.includes(mode)) return { slots: [], reason: "This programme is not offered that way." };
      let location = null;
      if (mode === "in_centre") {
        if (!args.locationId) return { slots: [], reason: "Choose a centre." };
        location = await prisma.location.findFirst({ where: { id: args.locationId, status: "active" } });
        if (!location) return { slots: [], reason: "That centre is not taking bookings." };
      }
      const tz = location?.timezone || await defaultTimezone(prisma);
      const minutes = program.assessmentMinutes || 45;
      const { start, end } = sinceAndUntil(args.from, args.to, 14);
      const earliest = Math.max(start.getTime(), Date.now() + 12 * 36e5);
      const subjectIds = program.subjects.map((s) => s.id);
      const tutors = await prisma.tutor.findMany({
        where: {
          status: "active",
          ...subjectIds.length ? { subjects: { some: { subjectId: { in: subjectIds } } } } : {},
          ...location ? { locations: { some: { id: location.id } } } : {}
        },
        select: {
          id: true,
          displayName: true,
          deliveryModes: true,
          availability: { where: { mode, ...location ? { OR: [{ locationId: location.id }, { locationId: null }] } : {} } }
        }
      });
      const usable = tutors.filter((t) => Array.isArray(t.deliveryModes) && t.deliveryModes.includes(mode) && t.availability.length);
      if (!usable.length) return { slots: [], timezone: tz, reason: "No assessor is available for this choice yet." };
      const tutorIds = usable.map((t) => t.id);
      const [sessions, assessments, timeOff, closures] = await Promise.all([
        prisma.session.findMany({ where: { tutorId: { in: tutorIds }, status: { in: ["scheduled", "in_progress", "needs_cover"] }, startsAt: { lt: end }, endsAt: { gt: start } }, select: { tutorId: true, startsAt: true, endsAt: true } }),
        prisma.assessment.findMany({ where: { assessorId: { in: tutorIds }, status: { in: ["scheduled", "in_progress"] }, scheduledAt: { lt: end, gt: new Date(start.getTime() - 4 * 36e5) } }, select: { assessorId: true, scheduledAt: true, minutes: true } }),
        prisma.tutorTimeOff.findMany({ where: { tutorId: { in: tutorIds }, status: { in: ["approved", "requested"] }, startsAt: { lt: end }, endsAt: { gt: start } }, select: { tutorId: true, startsAt: true, endsAt: true } }),
        location ? prisma.closure.findMany({ where: { locationId: location.id, startsOn: { lt: end }, endsOn: { gte: start } }, select: { startsOn: true, endsOn: true } }) : Promise.resolve([])
      ]);
      const busy = /* @__PURE__ */ new Map();
      const add = (id, a, b) => {
        if (!busy.has(id)) busy.set(id, []);
        busy.get(id).push([a, b]);
      };
      sessions.forEach((s) => add(s.tutorId, s.startsAt.getTime(), s.endsAt.getTime()));
      assessments.forEach((a) => add(a.assessorId, a.scheduledAt.getTime(), a.scheduledAt.getTime() + a.minutes * 6e4));
      timeOff.forEach((o) => add(o.tutorId, o.startsAt.getTime(), o.endsAt.getTime()));
      const closed = (a, b) => closures.some((c) => a < c.endsOn.getTime() + DAY2 && b > c.startsOn.getTime());
      const byStart = /* @__PURE__ */ new Map();
      for (let t = start.getTime(); t < end.getTime(); t += DAY2) {
        const { y, m, d, weekday } = localDay(t, tz);
        for (const tutor of usable) {
          for (const window of tutor.availability) {
            if (window.weekday !== weekday) continue;
            if (window.effectiveFrom && window.effectiveFrom.getTime() > t + DAY2) continue;
            if (window.effectiveTo && window.effectiveTo.getTime() < t) continue;
            for (let minute = window.startMinute; minute + minutes <= window.endMinute; minute += 30) {
              const a = zonedTime(y, m, d, minute, tz);
              const b = a + minutes * 6e4;
              if (a < earliest || a >= end.getTime() || byStart.has(a)) continue;
              if (closed(a, b)) continue;
              if ((busy.get(tutor.id) ?? []).some(([x, y2]) => a < y2 && b > x)) continue;
              byStart.set(a, { startsAt: new Date(a).toISOString(), endsAt: new Date(b).toISOString(), tutorId: tutor.id, tutorName: tutor.displayName });
            }
          }
        }
      }
      const slots = Array.from(byStart.entries()).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
      return { slots, timezone: tz, minutes, fee: program.assessmentFee, location: location ? { id: location.id, name: location.name } : null };
    },
    async openSessions(_, args, context) {
      const prisma = context.sudo().prisma;
      const { start, end } = sinceAndUntil(args.from, args.to, 14);
      const rows = await prisma.session.findMany({
        where: {
          status: "scheduled",
          startsAt: { gte: new Date(Math.max(start.getTime(), Date.now())), lt: end },
          program: { status: "published", format: { in: ["small_group", "class"] } },
          series: { enrollmentId: null },
          ...args.programId ? { programId: args.programId } : {},
          ...args.locationId ? args.locationId === "online" ? { mode: "online" } : { locationId: args.locationId } : {}
        },
        include: sessionInclude,
        orderBy: { startsAt: "asc" },
        take: 300
      });
      const counts = await prisma.booking.groupBy({ by: ["sessionId"], where: { sessionId: { in: rows.map((s) => s.id) }, status: { in: ACTIVE_BOOKING } }, _count: { _all: true } });
      const booked = new Map(counts.map((c) => [c.sessionId, c._count._all]));
      const [programs, locations] = await Promise.all([
        prisma.program.findMany({ where: { status: "published", format: { in: ["small_group", "class"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
        prisma.location.findMany({ where: { status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, timezone: true } })
      ]);
      return {
        timezone: await defaultTimezone(prisma),
        programs,
        locations,
        sessions: rows.map((s) => ({ ...sessionOut(s), seatsLeft: Math.max(0, s.capacity - Number(booked.get(s.id) ?? 0)) }))
      };
    },
    // ------------------------------------------------------------ guardian
    async myFamily(_, __, context) {
      const userId = context.session?.itemId;
      if (!userId) return null;
      const prisma = context.sudo().prisma;
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true, notifyByEmail: true, role: { select: { canAccessDashboard: true } } } });
      if (!user) return null;
      const familyId = await myFamilyId(context);
      const base = { user: { id: user.id, name: user.name, email: user.email, phone: user.phone, notifyByEmail: user.notifyByEmail, isStaff: Boolean(user.role?.canAccessDashboard) } };
      if (!familyId) return { ...base, family: null };
      const now = /* @__PURE__ */ new Date();
      const [family, grants, openInvoices, unreadReports, nextBookings, assessments, proposedPlans, settings] = await Promise.all([
        prisma.family.findUnique({
          where: { id: familyId },
          include: {
            primaryLocation: { select: { id: true, name: true } },
            students: { orderBy: { createdAt: "asc" }, include: { level: true, enrolments: { where: { status: { notIn: ["cancelled", "ended"] } }, include: { program: { select: { id: true, name: true, slug: true, format: true } }, tutor: { select: { id: true, displayName: true, slug: true, publicProfile: true } }, offers: { where: { status: "accepted" }, select: { id: true } } } } } },
            memberships: { where: { status: { not: "cancelled" } }, include: { plan: { include: { program: { select: { name: true, slug: true } } } }, student: { select: { firstName: true } } }, orderBy: { createdAt: "desc" } }
          }
        }),
        prisma.creditGrant.findMany({ where: { familyId, status: "active" }, include: { program: { select: { name: true } }, student: { select: { id: true, firstName: true } } } }),
        prisma.invoice.findMany({ where: { familyId, status: { in: ["open", "partially_paid"] } }, select: { id: true, number: true, total: true, amountPaid: true, dueAt: true, currency: true } }),
        prisma.sessionReport.count({ where: { booking: { familyId }, publishedAt: { not: null }, guardianSeenAt: null } }),
        prisma.booking.findMany({ where: { familyId, status: "booked", session: { startsAt: { gte: new Date(now.getTime() - 2 * 36e5) } } }, include: { student: { select: { id: true, firstName: true } }, session: { include: sessionInclude } }, orderBy: { session: { startsAt: "asc" } }, take: 8 }),
        prisma.assessment.findMany({ where: { familyId, status: "scheduled", scheduledAt: { gte: now } }, include: { program: { select: { name: true } }, location: { select: { name: true, timezone: true } }, student: { select: { firstName: true } } }, orderBy: { scheduledAt: "asc" } }),
        prisma.learningPlan.findMany({ where: { student: { familyId }, status: "proposed" }, select: { id: true, student: { select: { firstName: true } }, program: { select: { name: true, slug: true } } } }),
        prisma.businessSettings.findUnique({ where: { id: 1 } })
      ]);
      if (!family) return { ...base, family: null };
      const lowBalance = settings?.lowBalanceMinutes ?? 120;
      const perStudent = /* @__PURE__ */ new Map();
      grants.forEach((g) => {
        if (!g.unlimited && g.studentId) perStudent.set(g.studentId, (perStudent.get(g.studentId) ?? 0) + (g.minutesAvailable ?? 0));
      });
      const alerts = [];
      family.memberships.filter((m) => ["past_due", "suspended"].includes(m.status)).forEach((m) => alerts.push({ kind: "payment_failed", message: `The payment for ${m.student?.firstName ?? "your"} ${m.plan?.name ?? "membership"} did not go through. Pay the open invoice to keep booking.`, href: "/account/billing" }));
      openInvoices.forEach((i) => alerts.push({ kind: "invoice_open", message: `Invoice ${i.number ?? ""} is open.`, href: `/account/billing/invoices/${i.id}` }));
      family.students.forEach((s) => {
        const left = perStudent.get(s.id);
        const hasPackage = grants.some((g) => g.studentId === s.id && g.kind === "package");
        if (hasPackage && left !== void 0 && left <= lowBalance) alerts.push({ kind: "low_balance", message: `${s.firstName} has ${Math.round(left / 60 * 10) / 10} hours of credit left.`, href: "/account/credits" });
      });
      if (unreadReports) alerts.push({ kind: "report", message: `${unreadReports} new session report${unreadReports === 1 ? "" : "s"} to read.`, href: "/account/progress" });
      proposedPlans.forEach((p) => alerts.push({ kind: "plan", message: `A learning plan for ${p.student?.firstName} is ready for you to review.`, href: `/account/progress/plan/${p.id}` }));
      return {
        ...base,
        family: {
          id: family.id,
          name: family.name,
          billingEmail: family.billingEmail,
          phone: family.phone,
          addressLine1: family.addressLine1,
          addressLine2: family.addressLine2,
          city: family.city,
          region: family.region,
          postalCode: family.postalCode,
          country: family.country,
          primaryLocation: family.primaryLocation,
          cardLabel: family.defaultPaymentMethodLabel || null,
          students: family.students.map((s) => ({
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            school: s.school,
            status: s.status,
            dateOfBirth: s.dateOfBirth,
            learningNotes: s.learningNotes,
            medicalNotes: s.medicalNotes,
            level: s.level ? { id: s.level.id, name: s.level.name } : null,
            minutesAvailable: perStudent.get(s.id) ?? 0,
            enrolments: s.enrolments.map((e) => ({ id: e.id, status: e.status, mode: e.mode, fundingType: e.fundingType, program: e.program, tutor: e.tutor ? { id: e.tutor.id, displayName: e.tutor.displayName, slug: e.tutor.publicProfile ? e.tutor.slug : null } : null, trialAttendedAt: e.trialAttendedAt, tutorConfirmedAt: e.tutorConfirmedAt, rematchCount: e.rematchCount }))
          })),
          memberships: family.memberships.map((m) => ({ id: m.id, status: m.status, price: m.price, planName: m.plan?.name, programName: m.plan?.program?.name, studentName: m.student?.firstName, currentPeriodEnd: m.currentPeriodEnd, cancelRequestedAt: m.cancelRequestedAt, endsAt: m.endsAt, pausedFrom: m.pausedFrom, pausedUntil: m.pausedUntil, pauseRequestedFrom: m.pauseRequestedFrom })),
          upcoming: nextBookings.map((b) => ({ id: b.id, status: b.status, student: b.student, session: sessionOut(b.session) })),
          assessments: assessments.map((a) => ({ id: a.id, scheduledAt: a.scheduledAt, minutes: a.minutes, mode: a.mode, program: a.program, location: a.location, student: a.student })),
          alerts
        },
        settings: { pauseMinDays: settings?.pauseMinDays ?? 14, pauseMaxDays: settings?.pauseMaxDays ?? 28, membershipCancelNoticeDays: settings?.membershipCancelNoticeDays ?? 30 }
      };
    },
    async myStudent(_, { id }, context) {
      const familyId = await myFamilyId(context);
      if (!familyId) return null;
      const prisma = context.sudo().prisma;
      const s = await prisma.student.findFirst({ where: { id, familyId }, include: { level: true } });
      if (!s) return null;
      const [assessments, plans, reports, progress, attendance] = await Promise.all([
        prisma.assessment.findMany({ where: { studentId: s.id, status: { in: ["completed", "scheduled"] } }, include: { program: { select: { name: true } }, results: { orderBy: { createdAt: "asc" } }, location: { select: { name: true, timezone: true } } }, orderBy: { scheduledAt: "desc" } }),
        prisma.learningPlan.findMany({ where: { studentId: s.id, status: { in: ["proposed", "accepted", "active", "completed", "declined"] } }, include: { goals: { orderBy: { sortOrder: "asc" } }, program: { select: { id: true, name: true, slug: true } }, subject: { select: { name: true } }, recommendedPlan: true, recommendedPackage: true }, orderBy: { createdAt: "desc" } }),
        prisma.sessionReport.findMany({ where: { studentId: s.id, publishedAt: { not: null }, booking: { familyId } }, select: { id: true, topicsCovered: true, wentWell: true, toImprove: true, homework: true, homeworkDueAt: true, homeworkStatus: true, effort: true, publishedAt: true, guardianSeenAt: true, tutor: { select: { displayName: true } }, session: { select: { startsAt: true, program: { select: { name: true } }, location: { select: { timezone: true } } } } }, orderBy: { publishedAt: "desc" }, take: 50 }),
        prisma.progressReport.findMany({ where: { studentId: s.id, status: { in: ["published", "acknowledged"] } }, orderBy: { periodEnd: "desc" }, select: { id: true, periodStart: true, periodEnd: true, sessionsAttended: true, sessionsMissed: true, narrative: true, goalsSnapshot: true, nextSteps: true, status: true, publishedAt: true, acknowledgedAt: true } }),
        prisma.booking.groupBy({ by: ["status"], where: { studentId: s.id, familyId }, _count: { _all: true } })
      ]);
      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        level: s.level?.name ?? null,
        school: s.school,
        attendance: Object.fromEntries(attendance.map((a) => [a.status, a._count._all])),
        assessments: assessments.map((a) => ({ id: a.id, status: a.status, scheduledAt: a.scheduledAt, minutes: a.minutes, mode: a.mode, program: a.program, location: a.location, summary: a.status === "completed" ? a.summary : "", recommendation: a.status === "completed" ? a.recommendation : "", results: a.status === "completed" ? a.results.map((r) => ({ id: r.id, skill: r.skill, strand: r.strand, score: r.score, maxScore: r.maxScore, levelEquivalent: r.levelEquivalent, note: r.note, percent: r.maxScore ? Math.round(r.score / r.maxScore * 1e3) / 10 : null })) : [] })),
        plans: plans.map((p) => ({ id: p.id, status: p.status, summary: p.summary, version: p.version, startDate: p.startDate, targetDate: p.targetDate, sessionsPerWeek: p.sessionsPerWeek, totalHours: p.totalHours, program: p.program, subject: p.subject, proposedAt: p.proposedAt, acceptedAt: p.acceptedAt, recommendedPlan: p.recommendedPlan ? planOut(p.recommendedPlan) : null, recommendedPackage: p.recommendedPackage ? packageOut(p.recommendedPackage) : null, goals: p.goals.map((g) => ({ id: g.id, title: g.title, skill: g.skill, baseline: g.baseline, target: g.target, status: g.status, masteredAt: g.masteredAt })) })),
        reports: reports.map((r) => ({ ...r, startsAt: r.session?.startsAt, programName: r.session?.program?.name, timezone: r.session?.location?.timezone, tutorName: r.tutor?.displayName, session: void 0, tutor: void 0 })),
        progressReports: progress
      };
    },
    async myUpcomingBookings(_, { includePast, studentId }, context) {
      const familyId = await myFamilyId(context);
      if (!familyId) return null;
      const prisma = context.sudo().prisma;
      const now = Date.now();
      const where = { familyId, ...studentId ? { studentId } : {} };
      const [upcoming, past, waitlist, assessments, tz] = await Promise.all([
        prisma.booking.findMany({ where: { ...where, status: { in: ["booked", "waitlisted"] }, session: { endsAt: { gte: new Date(now) } } }, include: { student: { select: { id: true, firstName: true } }, session: { include: { ...sessionInclude, series: { select: { meetingUrl: true } } } } }, orderBy: { session: { startsAt: "asc" } }, take: 100 }),
        includePast ? prisma.booking.findMany({ where: { ...where, session: { startsAt: { lt: new Date(now) } } }, include: { student: { select: { id: true, firstName: true } }, session: { include: sessionInclude } }, orderBy: { session: { startsAt: "desc" } }, take: 60 }) : Promise.resolve([]),
        prisma.waitlistEntry.findMany({ where: { familyId, status: "waiting", ...studentId ? { studentId } : {}, session: { startsAt: { gte: new Date(now) } } }, include: { student: { select: { id: true, firstName: true } }, session: { include: sessionInclude } }, orderBy: { createdAt: "asc" } }),
        prisma.assessment.findMany({ where: { familyId, ...studentId ? { studentId } : {}, status: { in: ["scheduled", "requested"] } }, include: { program: { select: { name: true } }, location: { select: { name: true, timezone: true } }, student: { select: { id: true, firstName: true } } }, orderBy: { scheduledAt: "asc" } }),
        defaultTimezone(prisma)
      ]);
      const joinable = (s) => s.mode === "online" && now >= s.startsAt.getTime() - 10 * 6e4 && now <= s.endsAt.getTime();
      return {
        timezone: tz,
        upcoming: upcoming.map((b) => ({ id: b.id, status: b.status, source: b.source, student: b.student, session: sessionOut(b.session), joinUrl: joinable(b.session) ? b.session.meetingUrl || b.session.series?.meetingUrl || null : null })),
        past: past.map((b) => ({ id: b.id, status: b.status, student: b.student, session: sessionOut(b.session) })),
        waitlist: waitlist.map((w) => ({ id: w.id, position: w.position, student: w.student, session: sessionOut(w.session) })),
        assessments: assessments.map((a) => ({ id: a.id, status: a.status, scheduledAt: a.scheduledAt, minutes: a.minutes, mode: a.mode, program: a.program, location: a.location, student: a.student, fee: a.fee }))
      };
    },
    async myBooking(_, { id }, context) {
      const familyId = await myFamilyId(context);
      if (!familyId) return null;
      const prisma = context.sudo().prisma;
      const b = await prisma.booking.findFirst({ where: { id, familyId }, include: { student: { select: { id: true, firstName: true, lastName: true } }, session: { include: { ...sessionInclude, series: { select: { meetingUrl: true } } } }, creditGrant: { select: { kind: true, expiresAt: true, program: { select: { name: true } } } }, reports: { where: { publishedAt: { not: null } }, select: { id: true } } } });
      if (!b) return null;
      return { id: b.id, status: b.status, source: b.source, minutes: b.minutes, cancelledAt: b.cancelledAt, student: b.student, session: sessionOut(b.session), funding: b.creditGrant ? { kind: b.creditGrant.kind, program: b.creditGrant.program?.name, expiresAt: b.creditGrant.expiresAt } : b.payAsYouGo ? { kind: "pay_as_you_go" } : null, reportId: b.reports[0]?.id ?? null };
    },
    async myCredits(_, __, context) {
      const familyId = await myFamilyId(context);
      if (!familyId) return null;
      const prisma = context.sudo().prisma;
      const [grants, packages] = await Promise.all([
        prisma.creditGrant.findMany({
          where: { familyId, status: { in: ["active", "exhausted", "expired"] } },
          include: { program: { select: { id: true, name: true, slug: true } }, student: { select: { id: true, firstName: true } }, entries: { orderBy: { createdAt: "desc" }, take: 40, select: { id: true, type: true, minutes: true, note: true, createdAt: true, booking: { select: { session: { select: { startsAt: true, program: { select: { name: true } } } } } } } } },
          orderBy: [{ status: "asc" }, { expiresAt: "asc" }]
        }),
        prisma.package.findMany({ where: { status: "published", program: { status: "published" } }, include: { program: { select: { id: true, name: true, slug: true } } }, orderBy: { sortOrder: "asc" } })
      ]);
      return {
        grants: grants.map((g) => ({ id: g.id, kind: g.kind, status: g.status, minutesGranted: g.minutesGranted, minutesAvailable: g.minutesAvailable, unlimited: g.unlimited, weeklyCap: g.weeklyCap, expiresAt: g.expiresAt, periodStart: g.periodStart, periodEnd: g.periodEnd, program: g.program, student: g.student, entries: g.entries.map((e) => ({ id: e.id, type: e.type, minutes: e.minutes, note: e.note, createdAt: e.createdAt, sessionStartsAt: e.booking?.session?.startsAt ?? null, sessionProgram: e.booking?.session?.program?.name ?? null })) })),
        packages: packages.map((p) => ({ ...packageOut(p), program: p.program }))
      };
    },
    async myInvoices(_, __, context) {
      const familyId = await myFamilyId(context);
      if (!familyId) return null;
      const rows = await context.sudo().prisma.invoice.findMany({ where: { familyId, status: { not: "draft" } }, orderBy: { issuedAt: "desc" }, select: { id: true, number: true, status: true, kind: true, issuedAt: true, dueAt: true, total: true, amountPaid: true, amountCredited: true, currency: true } });
      return rows;
    },
    async myInvoice(_, { id }, context) {
      const familyId = await myFamilyId(context);
      if (!familyId) return null;
      const prisma = context.sudo().prisma;
      const i = await prisma.invoice.findFirst({
        where: { id, familyId, status: { not: "draft" } },
        include: {
          lines: { orderBy: { createdAt: "asc" }, select: { id: true, description: true, kind: true, quantity: true, unitAmount: true, amount: true, student: { select: { firstName: true } } } },
          payments: { orderBy: { createdAt: "asc" }, select: { id: true, amount: true, method: true, status: true, refundedAmount: true, createdAt: true } },
          creditNotes: { select: { id: true, amount: true, reason: true, createdAt: true } },
          location: { select: { name: true, addressLine1: true, city: true, region: true, postalCode: true } },
          family: { select: { name: true, billingEmail: true, addressLine1: true, city: true, region: true, postalCode: true } }
        }
      });
      if (!i) return null;
      const business = await prisma.business.findUnique({ where: { id: 1 }, select: { name: true, legalName: true, supportEmail: true, phone: true } });
      return { id: i.id, number: i.number, status: i.status, kind: i.kind, issuedAt: i.issuedAt, dueAt: i.dueAt, subtotal: i.subtotal, discount: i.discount, tax: i.tax, total: i.total, amountPaid: i.amountPaid, amountCredited: i.amountCredited, currency: i.currency, notes: i.notes, lines: i.lines, payments: i.payments, creditNotes: i.creditNotes, location: i.location, family: i.family, business };
    }
  }
};
async function locationOut(context, l) {
  return {
    id: l.id,
    name: l.name,
    slug: l.slug,
    status: l.status,
    addressLine1: l.addressLine1,
    addressLine2: l.addressLine2,
    city: l.city,
    region: l.region,
    postalCode: l.postalCode,
    country: l.country,
    lat: l.lat,
    lng: l.lng,
    phone: l.phone,
    email: l.email,
    timezone: l.timezone,
    description: l.description,
    openingHours: l.openingHours ?? {},
    photo: await imageUrl(context, l.photo_id, l.photo_extension),
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([l.addressLine1, l.city, l.region, l.postalCode].filter(Boolean).join(", ") || l.name)}`,
    programs: (l.programs ?? []).map((p) => ({ id: p.id, name: p.name, slug: p.slug }))
  };
}

// features/keystone/mutations/index.ts
var graphql5 = String.raw;
var COMMAND_OVERRIDES = /* @__PURE__ */ new Set(["createSessionSeries", "createPayrollRun", "createTutorApplication", "updateStudent"]);
var modules = [storefront_exports, schedule_exports];
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: [
      graphql5`
        type Query {
          redirectToInit: Boolean
        }
      `,
      ...modules.map((m) => m.typeDefs)
    ],
    ...{ onFieldTypeConflict: (existing, incoming, type) => {
      if (type?.name?.value === "Mutation" && COMMAND_OVERRIDES.has(incoming?.name?.value)) return incoming;
      throw new Error(`GraphQL field clash: ${type?.name?.value}.${incoming?.name?.value}`);
    } },
    resolvers: [
      { Query: { redirectToInit: redirectToInit_default } },
      ...modules.map((m) => m.resolvers)
    ]
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/mcp-oauth/session.ts
async function resolveMcpAccessToken(context, token, listKey = "User") {
  try {
    const sudo = context.sudo();
    const record = await sudo.db.OAuthToken.findOne({ where: { token: digestToken(token) } });
    if (!record || record.tokenType !== "access_token" || record.isRevoked !== "false" || !record.userId || !record.expiresAt || new Date(record.expiresAt).getTime() <= Date.now()) {
      return void 0;
    }
    const app = await sudo.db.OAuthApp.findOne({ where: { clientId: record.clientId } });
    if (!app || app.status !== "active") return void 0;
    const mcp = {
      clientId: record.clientId,
      scopes: storedScopes(record.scopes),
      tokenId: String(record.id)
    };
    return { itemId: String(record.userId), listKey, mcp };
  } catch {
    return void 0;
  }
}
function withMcpBearerSessions(strategy, listKey = "User") {
  return {
    ...strategy,
    async get({ context }) {
      const token = bearerToken(context?.req?.headers?.authorization);
      if (isMcpAccessToken(token)) return resolveMcpAccessToken(context, token, listKey);
      return strategy.get({ context });
    }
  };
}

// features/keystone/lib/storage.ts
function s3ForcePathStyle(endpoint) {
  let hostname = "";
  try {
    hostname = endpoint ? new URL(endpoint).hostname : "";
  } catch {
  }
  return !(hostname === "storageapi.dev" || hostname.endsWith(".storageapi.dev"));
}
function store(type, folder) {
  const { S3_BUCKET_NAME, S3_REGION = "auto", S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT } = process.env;
  if (S3_BUCKET_NAME && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
    return {
      kind: "s3",
      type,
      bucketName: S3_BUCKET_NAME,
      region: S3_REGION,
      accessKeyId: S3_ACCESS_KEY_ID,
      secretAccessKey: S3_SECRET_ACCESS_KEY,
      endpoint: S3_ENDPOINT,
      pathPrefix: `${folder}/`,
      signed: { expiry: 3600 },
      forcePathStyle: s3ForcePathStyle(S3_ENDPOINT)
    };
  }
  return type === "image" ? { kind: "local", type, storagePath: "public/uploads/images", serverRoute: null, generateUrl: (path) => `/uploads/images${path}` } : { kind: "local", type, storagePath: "uploads/files", serverRoute: null, generateUrl: (path) => `/api/files${path}` };
}
function storageConfig() {
  return {
    my_images: store("image", "images"),
    my_files: store("file", "files")
  };
}

// features/keystone/lib/roles.ts
var all = {
  canAccessDashboard: true,
  canManageSettings: true,
  canManageStaff: true,
  canManageLocations: true,
  canManagePrograms: true,
  canManageLeads: true,
  canManageFamilies: true,
  canManageSchedule: true,
  canMarkAttendance: true,
  canManageBilling: true,
  canIssueRefunds: true,
  canManagePayroll: true,
  canViewReports: true,
  canManageTutors: true,
  isTutor: false,
  canSeeOtherPeople: true,
  canEditOtherPeople: true,
  canManagePeople: true,
  canManageRoles: true
};
var ROLE_TEMPLATES = {
  Owner: { name: "Owner", ...all },
  Manager: {
    name: "Manager",
    canAccessDashboard: true,
    canManageStaff: true,
    canManagePrograms: true,
    canManageLeads: true,
    canManageFamilies: true,
    canManageSchedule: true,
    canMarkAttendance: true,
    canManageBilling: true,
    canIssueRefunds: true,
    canManagePayroll: true,
    canViewReports: true,
    canManageTutors: true,
    canSeeOtherPeople: true
  },
  "Front desk": {
    name: "Front desk",
    canAccessDashboard: true,
    canManageLeads: true,
    canManageFamilies: true,
    canManageSchedule: true,
    canMarkAttendance: true,
    canManageBilling: true
  },
  Tutor: { name: "Tutor", canAccessDashboard: true, canMarkAttendance: true, isTutor: true },
  Customer: { name: "Customer" }
};

// features/keystone/index.ts
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 30,
  secret: process.env.SESSION_SECRET || "this secret should only be used in testing"
};
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  // The first account is the owner (§9: "the owner's account from the first sign-up").
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: { role: { create: ROLE_TEMPLATES.Owner } }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
    role { id name ${ROLE_FLAGS.join(" ")} }
    locationMemberships { id role status location { id status } }
    tutor { id }
    family { id }
  `
});
var keystone_default = withAuth(
  (0, import_core14.config)({
    db: {
      provider: "postgresql",
      url: databaseURL
    },
    lists: models,
    storage: storageConfig(),
    ui: {
      isAccessAllowed: ({ session }) => session?.data.role?.canAccessDashboard ?? false
    },
    // MCP OAuth bearer tokens resolve to the approving user; everything else is unchanged.
    session: withMcpBearerSessions((0, import_session.statelessSessions)(sessionConfig)),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
