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
  graphql: { plural: "SessionSeriesList" },
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

// features/keystone/mutations/index.ts
var graphql5 = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql5`
      type Query {
        redirectToInit: Boolean
      }
    `,
    resolvers: {
      Query: {
        redirectToInit: redirectToInit_default
      }
    }
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
