"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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

// features/keystone/access.ts
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
function appendOnlyAccess(read, location) {
  return {
    operation: { query: isSignedIn, create: () => false, update: () => false, delete: () => false },
    filter: { query: ({ session }) => staffScope(session, read, location) }
  };
}
var ROLE_FLAGS, LOCATION_ROLE_CAPABILITIES, LOCATION_SCOPED_FLAGS, serverOnly, permissions, rules;
var init_access = __esm({
  "features/keystone/access.ts"() {
    "use strict";
    ROLE_FLAGS = [
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
    LOCATION_ROLE_CAPABILITIES = {
      manager: ["canAccessDashboard", "canManageLeads", "canManageFamilies", "canManageSchedule", "canMarkAttendance", "canManageBilling", "canIssueRefunds", "canManagePayroll", "canViewReports", "canManageTutors", "canManagePrograms"],
      front_desk: ["canAccessDashboard", "canManageLeads", "canManageFamilies", "canManageSchedule", "canMarkAttendance", "canManageBilling"],
      tutor: ["canAccessDashboard", "canMarkAttendance", "isTutor"]
    };
    LOCATION_SCOPED_FLAGS = new Set(LOCATION_ROLE_CAPABILITIES.manager);
    serverOnly = { create: () => false, update: () => false };
    permissions = Object.fromEntries(
      ROLE_FLAGS.map((flag) => [flag, ({ session }) => hasFlag(session, flag)])
    );
    rules = {
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
  }
});

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
var init_json = __esm({
  "features/keystone/lib/json.ts"() {
    "use strict";
  }
});

// features/keystone/lib/errors.ts
var CommandError;
var init_errors = __esm({
  "features/keystone/lib/errors.ts"() {
    "use strict";
    CommandError = class extends Error {
      constructor(message, data) {
        super(message);
        this.data = data;
        this.name = "CommandError";
      }
    };
  }
});

// features/keystone/lib/actor.ts
var actor_exports = {};
__export(actor_exports, {
  can: () => can,
  canAt: () => canAt,
  guardianFamily: () => guardianFamily,
  isOwnerActor: () => isOwnerActor,
  loadActor: () => loadActor,
  requireActor: () => requireActor,
  requireFlag: () => requireFlag,
  requireGuardianOf: () => requireGuardianOf
});
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
function requireActor(actor) {
  if (!actor) throw new CommandError("Sign in to continue.");
  return actor;
}
async function requireGuardianOf(tx, actor, familyId) {
  if (!actor) throw new CommandError("Sign in to continue.");
  if (!familyId) throw new CommandError("That was not found.");
  const family = await tx.family.findFirst({ where: { id: familyId, guardians: { some: { id: actor.userId } } }, select: { id: true } });
  if (!family) throw new CommandError("That was not found.");
  return family.id;
}
async function guardianFamily(tx, actor, create = false) {
  if (!actor) throw new CommandError("Sign in to continue.");
  const family = await tx.family.findFirst({ where: { guardians: { some: { id: actor.userId } } }, select: { id: true } });
  if (family) return family.id;
  if (!create) throw new CommandError("Add your family details first.");
  const created = await tx.family.create({
    data: { name: `${actor.name.split(" ").slice(-1)[0] || actor.name} family`, billingEmail: actor.email, guardians: { connect: { id: actor.userId } }, createdBy: { connect: { id: actor.userId } } },
    select: { id: true }
  });
  return created.id;
}
var roleSelect;
var init_actor = __esm({
  "features/keystone/lib/actor.ts"() {
    "use strict";
    init_access();
    init_errors();
    roleSelect = Object.fromEntries(ROLE_FLAGS.map((f) => [f, true]));
  }
});

// features/keystone/lib/command.ts
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
var import_node_crypto2, TX_OPTIONS;
var init_command = __esm({
  "features/keystone/lib/command.ts"() {
    "use strict";
    import_node_crypto2 = require("node:crypto");
    init_json();
    init_actor();
    init_errors();
    TX_OPTIONS = { maxWait: 6e4, timeout: 12e4 };
  }
});

// features/keystone/lib/ledger.ts
var ledger_exports = {};
__export(ledger_exports, {
  FINAL_STATUSES: () => FINAL_STATUSES,
  SEAT_STATUSES: () => SEAT_STATUSES,
  SPENT_STATUSES: () => SPENT_STATUSES,
  adjustGrant: () => adjustGrant,
  checkGrant: () => checkGrant,
  createGrant: () => createGrant,
  debitHold: () => debitHold,
  expireGrant: () => expireGrant,
  pickGrant: () => pickGrant,
  releaseHold: () => releaseHold,
  removeUnused: () => removeUnused,
  reserveMinutes: () => reserveMinutes,
  reverseClose: () => reverseClose,
  rollOverGrant: () => rollOverGrant,
  weekOf: () => weekOf,
  writeHold: () => writeHold
});
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
async function rollOverGrant(tx, grantId, into, allow) {
  const g = await tx.creditGrant.findUnique({ where: { id: grantId }, select: { id: true, familyId: true, studentId: true, programId: true, membershipId: true, minutesAvailable: true, status: true, rolledFromId: true, unlimited: true } });
  if (!g || g.unlimited || !["active", "exhausted"].includes(g.status)) return 0;
  if (!allow || g.rolledFromId || g.minutesAvailable <= 0) {
    await expireGrant(tx, g.id, g.rolledFromId ? "Rolled-over credit expires after one period" : "Period ended");
    return 0;
  }
  const minutes = g.minutesAvailable;
  const rows = await tx.creditGrant.updateMany({ where: { id: g.id, minutesAvailable: minutes, status: g.status }, data: { minutesAvailable: 0, status: "expired" } });
  if (rows.count !== 1) throw new CommandError("Credit changed while rolling over; retry.");
  await entry(tx, { grantId: g.id, type: "rollover_out", minutes: -minutes, note: "Rolled into the next period" });
  await createGrant(tx, { familyId: g.familyId, studentId: g.studentId, programId: g.programId, membershipId: g.membershipId, kind: "membership_period", minutes, periodStart: into.periodStart, periodEnd: into.periodEnd, expiresAt: into.periodEnd, rolledFromId: g.id, note: "Unused credit from the last period" });
  return minutes;
}
async function adjustGrant(tx, grantId, minutes, actorId, note) {
  const rows = await tx.$executeRaw`UPDATE "CreditGrant" SET "minutesAvailable" = "minutesAvailable" + ${minutes},
    "status" = CASE WHEN "minutesAvailable" + ${minutes} = 0 THEN 'exhausted' WHEN status = 'exhausted' THEN 'active' ELSE status END, "updatedAt" = now()
    WHERE id = ${grantId} AND status IN ('active','exhausted') AND "minutesAvailable" + ${minutes} >= 0`;
  if (rows !== 1) throw new CommandError("That adjustment would make the balance negative.");
  await entry(tx, { grantId, type: "adjustment", minutes, note, actorId });
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
        { OR: [{ periodStart: null }, { periodStart: { lte: input.startsAt } }] },
        // W6.3: past due holds back bookings beyond 7 days; suspended or ended memberships fund nothing.
        { OR: [{ membershipId: null }, { membership: { status: { in: ["active", "cancelling", "paused"] } } }, ...input.startsAt.getTime() - Date.now() <= 7 * 864e5 ? [{ membership: { status: "past_due" } }] : []] }
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
async function checkGrant(tx, grantId) {
  const grant = await tx.creditGrant.findUnique({ where: { id: grantId }, select: { minutesAvailable: true, minutesGranted: true } });
  const entries = await tx.creditEntry.findMany({ where: { grantId }, select: { type: true, minutes: true } });
  const sum = entries.reduce((s, e) => s + e.minutes, 0);
  if (grant.minutesAvailable < 0) return `grant ${grantId} negative`;
  if (sum !== grant.minutesAvailable) return `grant ${grantId}: entries ${sum} != available ${grant.minutesAvailable}`;
  return null;
}
var SEAT_STATUSES, FINAL_STATUSES, SPENT_STATUSES;
var init_ledger = __esm({
  "features/keystone/lib/ledger.ts"() {
    "use strict";
    init_errors();
    SEAT_STATUSES = ["booked", "attended", "late", "no_show"];
    FINAL_STATUSES = ["attended", "late", "cancelled_early", "cancelled_late", "cancelled_late_excused", "no_show", "cancelled_by_centre"];
    SPENT_STATUSES = ["attended", "late", "cancelled_late", "cancelled_late_excused", "no_show"];
  }
});

// features/keystone/lib/settings.ts
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
var DEFAULT_SETTINGS, HOUR, DAY;
var init_settings = __esm({
  "features/keystone/lib/settings.ts"() {
    "use strict";
    DEFAULT_SETTINGS = {
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
    HOUR = 36e5;
    DAY = 24 * HOUR;
  }
});

// features/keystone/lib/pay.ts
async function rateFor(tx, tutorId, subjectId) {
  if (subjectId) {
    const ts = await tx.tutorSubject.findFirst({ where: { tutorId, subjectId }, select: { payRate: true } });
    if (ts?.payRate) return ts.payRate;
  }
  const tutor = await tx.tutor.findUnique({ where: { id: tutorId }, select: { defaultPayRate: true } });
  return tutor?.defaultPayRate ?? 0;
}
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
var amountFor;
var init_pay = __esm({
  "features/keystone/lib/pay.ts"() {
    "use strict";
    init_settings();
    amountFor = (rate, minutes, percent = 100) => Math.round(rate * minutes * percent / 6e3);
  }
});

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
function amountDue(inv) {
  return Math.max(0, inv.total - inv.amountPaid - inv.amountCredited);
}
async function applyToInvoice(tx, invoiceId, amount, field = "amountPaid") {
  const col = field === "amountPaid" ? "amountPaid" : "amountCredited";
  const rows = col === "amountPaid" ? await tx.$executeRaw`UPDATE "Invoice" SET "amountPaid" = "amountPaid" + ${amount}, "updatedAt" = now()
        WHERE id = ${invoiceId} AND status IN ('open','partially_paid') AND "amountPaid" + "amountCredited" + ${amount} <= total` : await tx.$executeRaw`UPDATE "Invoice" SET "amountCredited" = "amountCredited" + ${amount}, "updatedAt" = now()
        WHERE id = ${invoiceId} AND status IN ('open','partially_paid','paid') AND "amountPaid" + "amountCredited" + ${amount} <= total`;
  if (rows !== 1) throw new CommandError(field === "amountPaid" ? "That is more than the amount due on this invoice." : "That credit note is more than the invoice total less payments.");
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, total: true, amountPaid: true, amountCredited: true } });
  const due = amountDue(inv);
  const next = due === 0 ? "paid" : inv.amountPaid + inv.amountCredited > 0 ? "partially_paid" : "open";
  if (next !== inv.status) {
    await tx.invoice.updateMany({ where: { id: invoiceId, status: inv.status }, data: { status: next } });
    await tx.changeEvent.create({ data: { aggregateType: "Invoice", aggregateId: invoiceId, from: inv.status, to: next, reason: field, data: { amount } } });
  }
  return { from: inv.status, to: next };
}
var init_invoices = __esm({
  "features/keystone/lib/invoices.ts"() {
    "use strict";
    init_errors();
    init_settings();
  }
});

// features/keystone/lib/booking.ts
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
var activeKeyFor, ATTENDANCE_OUTCOMES;
var init_booking = __esm({
  "features/keystone/lib/booking.ts"() {
    "use strict";
    init_errors();
    init_command();
    init_ledger();
    init_pay();
    init_invoices();
    init_settings();
    activeKeyFor = (sessionId, studentId) => `${sessionId}:${studentId}`;
    ATTENDANCE_OUTCOMES = ["attended", "late", "no_show", "cancelled_late", "cancelled_late_excused"];
  }
});

// features/keystone/lib/schedule.ts
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
var import_tz;
var init_schedule = __esm({
  "features/keystone/lib/schedule.ts"() {
    "use strict";
    import_tz = require("@date-fns/tz");
    init_errors();
    init_command();
    init_settings();
  }
});

// features/keystone/lib/assessments.ts
async function timezoneFor(tx, locationId) {
  if (locationId) {
    const loc = await tx.location.findUnique({ where: { id: locationId }, select: { timezone: true } });
    if (loc?.timezone) return loc.timezone;
  }
  const first = await tx.location.findFirst({ where: { status: "active" }, orderBy: { createdAt: "asc" }, select: { timezone: true } });
  return first?.timezone || "America/New_York";
}
async function holdAssessmentSlot(tx, input, exceptAssessmentId) {
  const program = await tx.program.findUnique({ where: { id: input.programId }, select: { id: true, name: true, status: true, deliveryModes: true, assessmentMinutes: true, assessmentFee: true, subjects: { select: { id: true } }, locations: { select: { id: true } } } });
  if (!program || program.status !== "published") throw new CommandError("That programme is not available.");
  const modes = Array.isArray(program.deliveryModes) ? program.deliveryModes : [];
  if (!modes.includes(input.mode)) throw new CommandError("This programme is not offered that way.");
  let location = null;
  if (input.mode === "in_centre") {
    if (!input.locationId) throw new CommandError("Choose a centre.");
    location = await tx.location.findUnique({ where: { id: input.locationId }, select: { id: true, name: true, status: true, timezone: true } });
    if (!location || location.status !== "active") throw new CommandError("That centre is not taking bookings.");
  }
  const minutes = input.minutes ?? (program.assessmentMinutes || 45);
  const startsAt = input.startsAt;
  const endsAt = new Date(startsAt.getTime() + minutes * 6e4);
  if (!input.staff && startsAt.getTime() < Date.now() + 12 * HOUR) throw new CommandError("Assessments can be booked from 12 hours ahead. Please pick a later time.");
  if (startsAt.getTime() < Date.now()) throw new CommandError("That time has passed.");
  const tutor = await tx.tutor.findUnique({
    where: { id: input.tutorId },
    select: {
      id: true,
      displayName: true,
      status: true,
      deliveryModes: true,
      subjects: { select: { subjectId: true } },
      locations: { select: { id: true } },
      availability: { where: { mode: input.mode, ...location ? { OR: [{ locationId: location.id }, { locationId: null }] } : {} } }
    }
  });
  if (!tutor || tutor.status !== "active") throw new CommandError(SLOT_TAKEN);
  const subjectIds = program.subjects.map((s) => s.id);
  if (subjectIds.length && !tutor.subjects.some((s) => subjectIds.includes(s.subjectId))) throw new CommandError(SLOT_TAKEN);
  if (!(Array.isArray(tutor.deliveryModes) && tutor.deliveryModes.includes(input.mode))) throw new CommandError(SLOT_TAKEN);
  if (location && !tutor.locations.some((l) => l.id === location.id)) throw new CommandError(SLOT_TAKEN);
  const tz = location?.timezone || await timezoneFor(tx, null);
  if (!input.staff) {
    const local = new import_tz2.TZDate(startsAt.getTime(), tz);
    const weekday = local.getDay();
    const minute = local.getHours() * 60 + local.getMinutes();
    const fits = tutor.availability.some((w) => w.weekday === weekday && minute >= w.startMinute && minute + minutes <= w.endMinute && (minute - w.startMinute) % 30 === 0 && (!w.effectiveFrom || w.effectiveFrom.getTime() <= startsAt.getTime() + DAY) && (!w.effectiveTo || w.effectiveTo.getTime() >= startsAt.getTime()));
    if (!fits) throw new CommandError(SLOT_TAKEN);
  }
  if (location) {
    const closed = await tx.closure.findFirst({ where: { locationId: location.id, startsOn: { lt: endsAt }, endsOn: { gte: new Date(startsAt.getTime() - DAY) } }, select: { startsOn: true, endsOn: true } });
    if (closed && startsAt.getTime() < closed.endsOn.getTime() + DAY && endsAt.getTime() > closed.startsOn.getTime()) throw new CommandError("The centre is closed then.");
  }
  try {
    await assertTutorFree(tx, tutor.id, startsAt, endsAt);
  } catch (error) {
    if (error instanceof CommandError) throw new CommandError(SLOT_TAKEN);
    throw error;
  }
  const pending = await tx.tutorTimeOff.findFirst({ where: { tutorId: tutor.id, status: "requested", startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
  if (pending && !input.staff) throw new CommandError(SLOT_TAKEN);
  const overlapping = await tx.assessment.findMany({
    where: { assessorId: tutor.id, status: { in: [...OPEN_ASSESSMENT] }, scheduledAt: { lt: endsAt, gt: new Date(startsAt.getTime() - 4 * HOUR) }, ...exceptAssessmentId ? { id: { not: exceptAssessmentId } } : {} },
    select: { scheduledAt: true, minutes: true }
  });
  if (overlapping.some((a) => a.scheduledAt.getTime() + a.minutes * 6e4 > startsAt.getTime())) throw new CommandError(SLOT_TAKEN);
  let roomId = null;
  if (location) {
    await lockKey(tx, `rooms:${location.id}`);
    const rooms = await tx.room.findMany({ where: { locationId: location.id, status: "active" }, orderBy: [{ capacity: "asc" }, { name: "asc" }], select: { id: true } });
    for (const r of rooms) {
      const session = await tx.session.findFirst({ where: { roomId: r.id, status: { in: ["scheduled", "in_progress", "needs_cover"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { id: true } });
      if (session) continue;
      const other = await tx.assessment.findMany({ where: { roomId: r.id, status: { in: [...OPEN_ASSESSMENT] }, scheduledAt: { lt: endsAt, gt: new Date(startsAt.getTime() - 4 * HOUR) }, ...exceptAssessmentId ? { id: { not: exceptAssessmentId } } : {} }, select: { scheduledAt: true, minutes: true } });
      if (other.some((a) => a.scheduledAt.getTime() + a.minutes * 6e4 > startsAt.getTime())) continue;
      roomId = r.id;
      break;
    }
    if (!roomId && rooms.length) throw new CommandError(SLOT_TAKEN);
  }
  return {
    program,
    location,
    tutor: { id: tutor.id, displayName: tutor.displayName },
    roomId,
    minutes,
    startsAt,
    endsAt,
    timezone: tz,
    slotKey: `${tutor.id}:${startsAt.toISOString()}`
  };
}
async function customerRoleId(tx) {
  const role = await tx.role.findFirst({ where: { name: "Customer" }, select: { id: true } });
  if (role) return role.id;
  const created = await tx.role.create({ data: { name: "Customer" }, select: { id: true } });
  return created.id;
}
var import_tz2, SLOT_TAKEN, OPEN_ASSESSMENT;
var init_assessments = __esm({
  "features/keystone/lib/assessments.ts"() {
    "use strict";
    import_tz2 = require("@date-fns/tz");
    init_errors();
    init_command();
    init_schedule();
    init_settings();
    SLOT_TAKEN = "That time was just taken. Please pick another.";
    OPEN_ASSESSMENT = ["scheduled", "in_progress"];
  }
});

// features/integrations/payment/stripe.ts
var stripe_exports = {};
__export(stripe_exports, {
  StripeError: () => StripeError,
  attachPaymentMethod: () => attachPaymentMethod,
  cancelPaymentIntent: () => cancelPaymentIntent,
  confirmPaymentIntent: () => confirmPaymentIntent,
  createCustomer: () => createCustomer,
  createPaymentIntent: () => createPaymentIntent,
  createRefund: () => createRefund,
  createSetupIntent: () => createSetupIntent,
  listPaymentIntentsByMetadata: () => listPaymentIntentsByMetadata,
  retrievePaymentIntent: () => retrievePaymentIntent,
  retrievePaymentMethod: () => retrievePaymentMethod,
  retrieveSetupIntent: () => retrieveSetupIntent,
  signStripePayload: () => signStripePayload,
  verifyStripeSignature: () => verifyStripeSignature
});
function form(values) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== void 0 && value !== null && value !== "") body.append(key, String(value));
  return body;
}
async function call(keys, path, init = {}) {
  if (!keys.secretKey) throw new StripeError("Card payments are not set up yet. Add the Stripe keys in Settings \u2192 Payments.", 0, "not_configured", false, false);
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${keys.secretKey}`,
        "Stripe-Version": "2024-06-20",
        ...init.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
        ...init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}
      },
      body: init.body,
      redirect: "error",
      signal: AbortSignal.timeout(3e4)
    });
  } catch (error) {
    throw new StripeError(`Stripe did not answer: ${error?.message || "network error"}`, 0, "network", false, true);
  }
  const json9 = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e = json9.error ?? {};
    throw new StripeError(e.message || `Stripe request failed (${response.status}).`, response.status, e.code || e.decline_code || null, e.type === "card_error", response.status >= 500 || response.status === 429);
  }
  return json9;
}
function createCustomer(keys, input, idempotencyKey) {
  return call(keys, "/customers", { method: "POST", idempotencyKey, body: form({ email: input.email, name: input.name, ...meta({ familyId: input.familyId }) }) });
}
function createPaymentIntent(keys, input, idempotencyKey) {
  const cents = Math.round(input.amount);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new StripeError("Payment amount must be greater than zero.", 400, "amount", false, false);
  return call(keys, "/payment_intents", {
    method: "POST",
    idempotencyKey,
    body: form({
      amount: cents,
      currency: input.currency.toLowerCase(),
      description: input.description,
      customer: input.customer || void 0,
      receipt_email: input.receiptEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.receiptEmail) ? input.receiptEmail : void 0,
      ...input.offSession ? { payment_method: input.paymentMethod || void 0, off_session: "true", confirm: "true", "payment_method_types[0]": "card" } : { "automatic_payment_methods[enabled]": "true", "automatic_payment_methods[allow_redirects]": "never", ...input.saveCard && input.customer ? { setup_future_usage: "off_session" } : {} },
      ...meta(input.metadata)
    })
  });
}
function retrievePaymentIntent(keys, id) {
  return call(keys, `/payment_intents/${encodeURIComponent(id)}`);
}
function confirmPaymentIntent(keys, id, paymentMethod, idempotencyKey) {
  return call(keys, `/payment_intents/${encodeURIComponent(id)}/confirm`, { method: "POST", idempotencyKey, body: form({ payment_method: paymentMethod }) });
}
function cancelPaymentIntent(keys, id) {
  return call(keys, `/payment_intents/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}
function listPaymentIntentsByMetadata(keys, key, value) {
  const q = encodeURIComponent(`metadata['${key}']:'${value.replace(/'/g, "")}'`);
  return call(keys, `/payment_intents/search?query=${q}&limit=10`);
}
function createSetupIntent(keys, input, idempotencyKey) {
  return call(keys, "/setup_intents", { method: "POST", idempotencyKey, body: form({ customer: input.customer, usage: "off_session", "automatic_payment_methods[enabled]": "true", "automatic_payment_methods[allow_redirects]": "never", ...meta(input.metadata) }) });
}
function retrieveSetupIntent(keys, id) {
  return call(keys, `/setup_intents/${encodeURIComponent(id)}`);
}
function retrievePaymentMethod(keys, id) {
  return call(keys, `/payment_methods/${encodeURIComponent(id)}`);
}
function attachPaymentMethod(keys, id, customer) {
  return call(keys, `/payment_methods/${encodeURIComponent(id)}/attach`, { method: "POST", body: form({ customer }) });
}
function createRefund(keys, input, idempotencyKey) {
  return call(keys, "/refunds", { method: "POST", idempotencyKey, body: form({ payment_intent: input.paymentIntent, amount: Math.round(input.amount), ...meta({ ...input.metadata ?? {}, note: input.reason }) }) });
}
function verifyStripeSignature(rawBody, header, secret2, toleranceSeconds = 300, now = Date.now()) {
  if (!rawBody.byteLength || !header || !secret2) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v).filter((v) => typeof v === "string" && /^[a-f0-9]{64}$/i.test(v));
  if (!t || !/^\d+$/.test(t) || !signatures.length) return false;
  if (Math.abs(now / 1e3 - Number(t)) > toleranceSeconds) return false;
  const expected = (0, import_node_crypto3.createHmac)("sha256", secret2).update(`${t}.`).update(rawBody).digest();
  return signatures.some((s) => {
    const received = Buffer.from(s, "hex");
    return received.length === expected.length && (0, import_node_crypto3.timingSafeEqual)(received, expected);
  });
}
function signStripePayload(rawBody, secret2, t = Math.floor(Date.now() / 1e3)) {
  return `t=${t},v1=${(0, import_node_crypto3.createHmac)("sha256", secret2).update(`${t}.${rawBody}`).digest("hex")}`;
}
var import_node_crypto3, API, StripeError, meta;
var init_stripe = __esm({
  "features/integrations/payment/stripe.ts"() {
    "use strict";
    import_node_crypto3 = require("node:crypto");
    API = "https://api.stripe.com/v1";
    StripeError = class extends Error {
      constructor(message, status, code, declined, unclear) {
        super(message);
        this.status = status;
        this.code = code;
        this.declined = declined;
        this.unclear = unclear;
      }
    };
    meta = (m = {}) => Object.fromEntries(Object.entries(m).filter(([, v]) => v != null && v !== "").map(([k, v]) => [`metadata[${k}]`, String(v)]));
  }
});

// features/keystone/lib/payments.ts
var payments_exports = {};
__export(payments_exports, {
  applyPayment: () => applyPayment,
  ensureCustomer: () => ensureCustomer,
  ensureProviders: () => ensureProviders,
  fulfilInvoice: () => fulfilInvoice,
  processRefund: () => processRefund,
  refreshPaymentSession: () => refreshPaymentSession,
  registerFulfilment: () => registerFulfilment,
  requestRefund: () => requestRefund,
  saveCardReference: () => saveCardReference,
  settlePaymentIntent: () => settlePaymentIntent,
  startInvoicePayment: () => startInvoicePayment,
  stripe: () => stripe_exports,
  stripeKeys: () => stripeKeys,
  voidInvoiceIfUnpaid: () => voidInvoiceIfUnpaid
});
async function ensureProviders(db) {
  for (const p of [{ code: STRIPE_CODE, name: "Card (Stripe)", isDefault: true }, { code: "pp_manual", name: "Cash, cheque or bank transfer", isDefault: false }]) {
    await db.paymentProvider.upsert({ where: { code: p.code }, create: { ...p, isInstalled: true }, update: {} });
  }
  return db.paymentProvider.findUnique({ where: { code: STRIPE_CODE } });
}
async function stripeKeys(db) {
  const provider = await db.paymentProvider.findUnique({ where: { code: STRIPE_CODE }, select: { id: true, isInstalled: true, credentials: true } });
  const c = provider?.credentials ?? {};
  return {
    providerId: provider?.id ?? null,
    secretKey: c.secretKey || process.env.STRIPE_SECRET_KEY || "",
    publishableKey: c.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_KEY || "",
    webhookSecret: c.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || ""
  };
}
function registerFulfilment(kind, fn) {
  fulfilments.set(kind, fn);
}
async function fulfilInvoice(tx, invoiceId) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.status !== "paid" || invoice.fulfilledAt) return false;
  const won = await tx.invoice.updateMany({ where: { id: invoiceId, fulfilledAt: null, status: "paid" }, data: { fulfilledAt: /* @__PURE__ */ new Date() } });
  if (won.count !== 1) return false;
  const f = invoice.fulfilment ?? {};
  const fn = f.kind ? fulfilments.get(String(f.kind)) : void 0;
  if (fn) await fn(tx, invoice, f);
  return true;
}
async function applyPayment(tx, invoiceId, amount) {
  const r = await applyToInvoice(tx, invoiceId, amount, "amountPaid");
  if (r.to === "paid") await fulfilInvoice(tx, invoiceId);
  return r;
}
async function ensureCustomer(prisma, keys, familyId) {
  const family = await prisma.family.findUnique({ where: { id: familyId }, select: { id: true, name: true, billingEmail: true, stripeCustomerId: true, guardians: { select: { email: true }, take: 1 } } });
  if (!family) throw new CommandError("That family was not found.");
  if (family.stripeCustomerId) return family.stripeCustomerId;
  const customer = await createCustomer(keys, { email: family.billingEmail || family.guardians[0]?.email || "", name: family.name, familyId }, `customer:${familyId}`);
  await prisma.family.updateMany({ where: { id: familyId, stripeCustomerId: "" }, data: { stripeCustomerId: customer.id } });
  const after = await prisma.family.findUnique({ where: { id: familyId }, select: { stripeCustomerId: true } });
  return after.stripeCustomerId;
}
async function startInvoicePayment(prisma, input) {
  const keys = await stripeKeys(prisma);
  if (!keys.secretKey) throw new CommandError("Card payments are not set up yet. Please pay at the centre or ask the owner to add the Stripe keys in Settings \u2192 Payments.");
  await ensureProviders(prisma);
  const invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId }, select: { id: true, number: true, familyId: true, status: true, total: true, amountPaid: true, amountCredited: true, currency: true, kind: true, family: { select: { defaultPaymentMethodId: true, billingEmail: true } } } });
  if (!invoice || !["open", "partially_paid"].includes(invoice.status)) throw new CommandError("This invoice has nothing to pay.");
  const amount = amountDue(invoice);
  if (amount <= 0) throw new CommandError("This invoice has nothing to pay.");
  const currency = (invoice.currency || "USD").toUpperCase();
  const customer = await ensureCustomer(prisma, keys, invoice.familyId);
  const session = await transaction(prisma, async (tx) => {
    await lockKey(tx, `invoice-pay:${invoice.id}`);
    if (!input.offSession) {
      const open = await tx.paymentSession.findFirst({ where: { invoiceId: invoice.id, amount, currencyCode: currency, offSession: false, status: { in: ["pending", "requires_action"] }, createdAt: { gte: new Date(Date.now() - 23 * 36e5) } }, orderBy: { createdAt: "desc" } });
      if (open) return open;
    }
    const keyHash = hash(`invoice:${invoice.id}:${amount}:${input.offSession ? "off" : "on"}:${input.attemptKey || Date.now()}`);
    const existing = await tx.paymentSession.findUnique({ where: { idempotencyKeyHash: keyHash } });
    if (existing) return existing;
    return tx.paymentSession.create({
      data: {
        invoice: { connect: { id: invoice.id } },
        family: { connect: { id: invoice.familyId } },
        ...keys.providerId ? { paymentProvider: { connect: { id: keys.providerId } } } : {},
        purpose: "invoice",
        idempotencyKeyHash: keyHash,
        status: "pending",
        amount,
        currencyCode: currency,
        offSession: Boolean(input.offSession),
        metadata: { saveCard: Boolean(input.saveCard), invoiceNumber: invoice.number },
        ...input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}
      }
    });
  });
  if (session.providerPaymentId && session.clientSecret && !input.offSession) {
    if (input.saveCard && !session.metadata?.saveCard) await prisma.paymentSession.update({ where: { id: session.id }, data: { metadata: { ...session.metadata, saveCard: true } } });
    return { paymentSessionId: session.id, clientSecret: session.clientSecret, publishableKey: keys.publishableKey, amount, currency, status: session.status, invoiceId: invoice.id };
  }
  if (session.providerPaymentId) {
    const settled2 = await refreshPaymentSession(prisma, session.id);
    return { paymentSessionId: session.id, clientSecret: session.clientSecret || null, publishableKey: keys.publishableKey, amount, currency, status: settled2.status, invoiceId: invoice.id };
  }
  let pi;
  try {
    pi = await createPaymentIntent(keys, {
      amount,
      currency,
      customer,
      description: `Invoice ${invoice.number ?? ""}`.trim(),
      receiptEmail: invoice.family?.billingEmail,
      metadata: { paymentSessionId: session.id, invoiceId: invoice.id, familyId: invoice.familyId },
      offSession: input.offSession,
      paymentMethod: input.offSession ? invoice.family?.defaultPaymentMethodId : null,
      saveCard: input.saveCard
    }, `ps:${session.id}`);
  } catch (error) {
    const e = error;
    const status = e.unclear ? "unknown" : "failed";
    await prisma.paymentSession.updateMany({ where: { id: session.id, status: "pending" }, data: { status, failureMessage: String(e.message).slice(0, 500) } });
    await prisma.changeEvent.create({ data: { aggregateType: "PaymentSession", aggregateId: session.id, from: "pending", to: status, reason: e.code || "stripe_error" } });
    if (e.unclear) throw new CommandError("The card processor did not answer. We will check the payment before trying again.");
    throw new CommandError(e.declined ? `The card was declined: ${e.message}` : e.message);
  }
  await prisma.paymentSession.update({ where: { id: session.id }, data: { providerPaymentId: pi.id, clientSecret: pi.client_secret || "" } });
  const settled = await settlePaymentIntent(prisma, pi, "create");
  return { paymentSessionId: session.id, clientSecret: pi.client_secret, publishableKey: keys.publishableKey, amount, currency, status: settled.status, invoiceId: invoice.id };
}
function mapStatus(pi) {
  switch (pi.status) {
    case "succeeded":
      return "captured";
    case "requires_capture":
      return "authorized";
    case "requires_action":
      return "requires_action";
    case "canceled":
      return "cancelled";
    case "requires_payment_method":
      return pi.last_payment_error ? "failed" : "pending";
    default:
      return "pending";
  }
}
async function settlePaymentIntent(prisma, pi, source) {
  return transaction(prisma, async (tx) => {
    const byId = await tx.paymentSession.findFirst({ where: { providerPaymentId: pi.id } });
    const session = byId ?? (pi.metadata?.paymentSessionId ? await tx.paymentSession.findUnique({ where: { id: pi.metadata.paymentSessionId } }) : null);
    if (!session) return { status: "ignored", paymentId: null, parked: "no payment session for this PaymentIntent", invoiceStatus: null, paymentSessionId: null };
    await lockKey(tx, `payment-session:${session.id}`);
    const current = await tx.paymentSession.findUnique({ where: { id: session.id } });
    const next = mapStatus(pi);
    const problems = [];
    if (pi.amount !== current.amount) problems.push(`amount ${pi.amount} != ${current.amount}`);
    if ((pi.currency || "").toUpperCase() !== (current.currencyCode || "").toUpperCase()) problems.push(`currency ${pi.currency} != ${current.currencyCode}`);
    if (pi.metadata?.invoiceId && pi.metadata.invoiceId !== current.invoiceId) problems.push("invoice does not match");
    if (current.providerPaymentId && current.providerPaymentId !== pi.id) problems.push("payment intent does not match");
    if (problems.length) {
      const reason = problems.join("; ");
      if (current.reviewReason !== reason || current.status !== "unknown") {
        await tx.paymentSession.update({ where: { id: current.id }, data: { status: current.status === "captured" ? current.status : "unknown", reviewReason: reason } });
        await recordChange(tx, { type: "PaymentSession", id: current.id, from: current.status, to: "unknown", reason: `parked: ${reason}`, data: { source, paymentIntent: pi.id } });
      }
      return { status: "parked", paymentId: null, parked: reason, invoiceStatus: null, paymentSessionId: current.id };
    }
    if (next !== "captured") {
      if (current.status !== next && !["captured", "refunded", "partially_refunded"].includes(current.status)) {
        await tx.paymentSession.updateMany({ where: { id: current.id, status: current.status }, data: { status: next, ...next === "failed" ? { failureMessage: pi.last_payment_error?.message?.slice(0, 500) || "Payment failed" } : {}, ...next === "cancelled" ? { cancelledAt: /* @__PURE__ */ new Date() } : {} } });
        await recordChange(tx, { type: "PaymentSession", id: current.id, from: current.status, to: next, reason: source });
      }
      return { status: next, paymentId: null, parked: null, invoiceStatus: null, paymentSessionId: current.id };
    }
    const existing = await tx.payment.findFirst({ where: { OR: [{ paymentSessionId: current.id }, { providerPaymentId: pi.id }] }, select: { id: true } });
    if (existing) {
      const inv = current.invoiceId ? await tx.invoice.findUnique({ where: { id: current.invoiceId }, select: { status: true } }) : null;
      return { status: "captured", paymentId: existing.id, parked: null, invoiceStatus: inv?.status ?? null, paymentSessionId: current.id };
    }
    await tx.paymentSession.updateMany({ where: { id: current.id }, data: { status: "captured", capturedAt: /* @__PURE__ */ new Date(), reviewReason: "" } });
    await recordChange(tx, { type: "PaymentSession", id: current.id, from: current.status, to: "captured", reason: source });
    const payment = await tx.payment.create({
      data: {
        ...current.invoiceId ? { invoice: { connect: { id: current.invoiceId } } } : {},
        ...current.familyId ? { family: { connect: { id: current.familyId } } } : {},
        amount: pi.amount,
        currency: current.currencyCode,
        method: "card",
        reference: pi.id,
        status: "captured",
        paymentSession: { connect: { id: current.id } },
        providerPaymentId: pi.id
      }
    });
    await recordChange(tx, { type: "Payment", id: payment.id, to: "captured", reason: source });
    let invoiceStatus = null;
    if (current.invoiceId) {
      try {
        invoiceStatus = (await applyPayment(tx, current.invoiceId, pi.amount)).to;
      } catch (error) {
        if (!(error instanceof CommandError)) throw error;
        await tx.paymentSession.update({ where: { id: current.id }, data: { reviewReason: "Captured after the invoice was already settled; refund or credit the family." } });
        invoiceStatus = "overpaid";
      }
    }
    const metadata = current.metadata ?? {};
    if (metadata.saveCard && pi.payment_method && current.familyId) await saveCardReference(tx, prisma, current.familyId, pi.payment_method);
    return { status: "captured", paymentId: payment.id, parked: null, invoiceStatus, paymentSessionId: current.id };
  });
}
async function saveCardReference(tx, prisma, familyId, paymentMethodId, label2) {
  let display = label2 ?? "";
  if (!display) {
    try {
      const keys = await stripeKeys(prisma);
      const pm = await retrievePaymentMethod(keys, paymentMethodId);
      display = pm.card ? `${pm.card.brand.toUpperCase()} \u2022\u2022\u2022\u2022 ${pm.card.last4} (${String(pm.card.exp_month).padStart(2, "0")}/${String(pm.card.exp_year).slice(-2)})` : "Saved card";
    } catch {
      display = "Saved card";
    }
  }
  await tx.family.update({ where: { id: familyId }, data: { defaultPaymentMethodId: paymentMethodId, defaultPaymentMethodLabel: display } });
}
async function refreshPaymentSession(prisma, paymentSessionId) {
  const session = await prisma.paymentSession.findUnique({ where: { id: paymentSessionId } });
  if (!session?.providerPaymentId) throw new CommandError("That payment was not found.");
  const keys = await stripeKeys(prisma);
  const pi = await retrievePaymentIntent(keys, session.providerPaymentId);
  return settlePaymentIntent(prisma, pi, "confirm");
}
async function requestRefund(tx, input) {
  const amount = Math.round(input.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new CommandError("Enter a refund amount.");
  const existing = await tx.refund.findUnique({ where: { idempotencyKey: input.key } });
  if (existing) return existing;
  const rows = await tx.$executeRaw`
    UPDATE "Payment" SET "refundedAmount" = COALESCE("refundedAmount", 0) + ${amount},
      status = CASE WHEN COALESCE("refundedAmount", 0) + ${amount} = amount THEN 'refunded' ELSE 'partially_refunded' END,
      "updatedAt" = now()
    WHERE id = ${input.paymentId} AND status IN ('captured', 'partially_refunded') AND COALESCE("refundedAmount", 0) + ${amount} <= amount`;
  if (rows !== 1) throw new CommandError("That is more than is left to refund on this payment.");
  const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, select: { method: true, status: true, invoiceId: true, amount: true, refundedAmount: true } });
  const refund = await tx.refund.create({
    data: {
      payment: { connect: { id: input.paymentId } },
      amount,
      reason: input.reason.slice(0, 500),
      idempotencyKey: input.key,
      // Cash, cheque and transfer refunds are recorded as handed back; card goes to Stripe after commit.
      status: payment.method === "card" ? "requested" : "succeeded",
      ...input.actorId ? { requestedBy: { connect: { id: input.actorId } } } : {}
    }
  });
  await recordChange(tx, { type: "Payment", id: input.paymentId, to: payment.status, actorId: input.actorId, reason: "refund", data: { refundId: refund.id, amount } });
  return refund;
}
async function processRefund(prisma, refundId) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId }, include: { payment: { select: { providerPaymentId: true, method: true } } } });
  if (!refund || refund.status !== "requested" || refund.payment?.method !== "card") return refund?.status ?? null;
  const keys = await stripeKeys(prisma);
  try {
    const r = await createRefund(keys, { paymentIntent: refund.payment.providerPaymentId, amount: refund.amount, reason: refund.reason, metadata: { refundId: refund.id } }, `refund:${refund.id}`);
    const status = r.status === "succeeded" || r.status === "pending" ? "succeeded" : "failed";
    await prisma.refund.updateMany({ where: { id: refund.id, status: "requested" }, data: { status, providerRefundId: r.id, failureReason: status === "failed" ? r.status : "" } });
    if (status === "failed") await releaseRefundReservation(prisma, refund.id);
    return status;
  } catch (error) {
    const e = error;
    if (e.unclear) {
      await prisma.refund.updateMany({ where: { id: refund.id, status: "requested" }, data: { status: "unknown", failureReason: e.message.slice(0, 500) } });
      return "unknown";
    }
    await prisma.refund.updateMany({ where: { id: refund.id, status: "requested" }, data: { status: "failed", failureReason: e.message.slice(0, 500) } });
    await releaseRefundReservation(prisma, refund.id);
    return "failed";
  }
}
async function releaseRefundReservation(prisma, refundId) {
  await transaction(prisma, async (tx) => {
    const refund = await tx.refund.findUnique({ where: { id: refundId }, select: { paymentId: true, amount: true } });
    await tx.$executeRaw`
      UPDATE "Payment" SET "refundedAmount" = GREATEST(0, COALESCE("refundedAmount", 0) - ${refund.amount}),
        status = CASE WHEN COALESCE("refundedAmount", 0) - ${refund.amount} <= 0 THEN 'captured' ELSE 'partially_refunded' END, "updatedAt" = now()
      WHERE id = ${refund.paymentId}`;
    await recordChange(tx, { type: "Refund", id: refundId, from: "requested", to: "failed", reason: "provider refused" });
  });
}
async function voidInvoiceIfUnpaid(tx, invoiceId, reason, actorId) {
  const r = await tx.invoice.updateMany({ where: { id: invoiceId, status: { in: ["open", "draft"] }, amountPaid: 0 }, data: { status: "void", notes: reason.slice(0, 500) } });
  if (r.count) {
    await recordChange(tx, { type: "Invoice", id: invoiceId, from: "open", to: "void", actorId, reason });
    await tx.paymentSession.updateMany({ where: { invoiceId, status: { in: ["pending", "requires_action"] } }, data: { status: "cancelled", cancelledAt: /* @__PURE__ */ new Date() } });
  }
  return r.count === 1;
}
var import_node_crypto4, STRIPE_CODE, hash, fulfilments;
var init_payments = __esm({
  "features/keystone/lib/payments.ts"() {
    "use strict";
    import_node_crypto4 = require("node:crypto");
    init_stripe();
    init_command();
    init_errors();
    init_invoices();
    STRIPE_CODE = "pp_stripe";
    hash = (s) => (0, import_node_crypto4.createHash)("sha256").update(s).digest("hex");
    fulfilments = /* @__PURE__ */ new Map();
  }
});

// features/keystone/lib/enrolment.ts
async function buildCheckout(tx, input) {
  if (!input.planId === !input.packageId) throw new CommandError("Pick a membership plan or a package.");
  await lockKey(tx, `enrol:${input.studentId}:${input.programId}`);
  const program = await tx.program.findUnique({ where: { id: input.programId }, select: { id: true, name: true, status: true, format: true, sessionMinutes: true, deliveryModes: true, billingModel: true, locations: { select: { id: true } } } });
  if (!program || program.status !== "published") throw new CommandError("That programme is not open for enrolment.");
  const modes = Array.isArray(program.deliveryModes) ? program.deliveryModes : [];
  if (!modes.includes(input.mode)) throw new CommandError("That programme is not offered in this format.");
  const locationId = input.mode === "in_centre" ? input.locationId ?? null : input.locationId ?? null;
  if (input.mode === "in_centre") {
    if (!locationId) throw new CommandError("Pick a location.");
    if (!program.locations.some((l) => l.id === locationId)) throw new CommandError("That programme is not run at this location.");
  }
  const student = await tx.student.findUnique({ where: { id: input.studentId }, select: { id: true, familyId: true, firstName: true, lastName: true } });
  if (!student || student.familyId !== input.familyId) throw new CommandError("That student was not found.");
  const open = await tx.enrollment.findMany({ where: { studentId: student.id, programId: program.id, status: { in: [...OPEN_ENROLMENT] } }, select: { id: true, status: true } });
  if (open.some((e) => e.status !== "pending_payment")) throw new CommandError(`${student.firstName} is already enrolled on ${program.name}.`);
  const superseded = [];
  for (const e of open) superseded.push(await cancelPendingEnrolment(tx, e.id, "Replaced by a new checkout", input.actorId));
  const settings = await getSettings(tx);
  const lines = [];
  let plan = null;
  let pkg = null;
  let membershipId = null;
  let studentPackageId = null;
  let discountPercent = 0;
  if (input.planId) {
    plan = await tx.membershipPlan.findUnique({ where: { id: input.planId }, select: { id: true, name: true, programId: true, price: true, enrolmentFee: true, sessionsPerPeriod: true, weeklyCapForUnlimited: true, status: true } });
    if (!plan || plan.status !== "published" || plan.programId && plan.programId !== program.id) throw new CommandError("That plan is not available for this programme.");
    const siblings = await tx.membership.count({ where: { familyId: input.familyId, studentId: { not: student.id }, status: { in: ["active", "past_due", "paused", "cancelling"] } } });
    discountPercent = siblings > 0 ? settings.siblingDiscountPercent : 0;
    const membership = await tx.membership.create({
      data: {
        family: { connect: { id: input.familyId } },
        student: { connect: { id: student.id } },
        plan: { connect: { id: plan.id } },
        status: "pending_payment",
        price: plan.price,
        discountPercent,
        sessionsPerPeriod: plan.sessionsPerPeriod ?? null,
        weeklyCap: plan.sessionsPerPeriod ? null : plan.weeklyCapForUnlimited ?? 5,
        ...input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}
      }
    });
    membershipId = membership.id;
    lines.push({ description: `${plan.name}: first month (${student.firstName})`, kind: "membership", unitAmount: plan.price, studentId: student.id, programId: program.id, membershipId });
    if (discountPercent) lines.push({ description: `Sibling discount ${discountPercent}%`, kind: "discount", unitAmount: -Math.round(plan.price * discountPercent / 100), studentId: student.id, membershipId });
    if (plan.enrolmentFee > 0 && !await enrolmentFeeWaived(tx, student.id, settings.enrolmentFeeWaivedWithinDays)) {
      lines.push({ description: `Enrolment fee (${student.firstName})`, kind: "enrolment_fee", unitAmount: plan.enrolmentFee, studentId: student.id, programId: program.id });
    }
  } else {
    pkg = await tx.package.findUnique({ where: { id: input.packageId }, select: { id: true, name: true, programId: true, hours: true, price: true, expiryMonths: true, status: true } });
    if (!pkg || pkg.status !== "published" || pkg.programId && pkg.programId !== program.id) throw new CommandError("That package is not available for this programme.");
    const sp = await tx.studentPackage.create({
      data: {
        family: { connect: { id: input.familyId } },
        student: { connect: { id: student.id } },
        package: { connect: { id: pkg.id } },
        hours: pkg.hours,
        price: pkg.price,
        status: "pending_payment",
        ...input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}
      }
    });
    studentPackageId = sp.id;
    lines.push({ description: `${pkg.name} (${pkg.hours} hours, ${student.firstName})`, kind: "package", unitAmount: pkg.price, studentId: student.id, programId: program.id, studentPackageId });
  }
  const promo = input.promoCode ? await validPromo(tx, input.promoCode, plan ? "plan" : "package") : null;
  const gross = lines.filter((l) => l.unitAmount > 0).reduce((s, l) => s + l.unitAmount, 0) + lines.filter((l) => l.unitAmount < 0).reduce((s, l) => s + l.unitAmount, 0);
  const promoDiscount = promo ? Math.min(gross, promo.percentOff ? Math.round(gross * promo.percentOff / 100) : promo.amountOff ?? 0) : 0;
  const seriesIds = [...new Set((input.seriesIds ?? []).map(String))].slice(0, 7);
  if (seriesIds.length) {
    const series = await tx.sessionSeries.findMany({ where: { id: { in: seriesIds }, status: "active", programId: program.id }, select: { id: true, mode: true, locationId: true, enrollmentId: true } });
    if (series.length !== seriesIds.length || series.some((s) => s.enrollmentId || locationId && s.locationId && s.locationId !== locationId)) throw new CommandError("One of the chosen weekly times is not available. Pick again.");
  }
  const enrollment = await tx.enrollment.create({
    data: {
      student: { connect: { id: student.id } },
      family: { connect: { id: input.familyId } },
      program: { connect: { id: program.id } },
      ...locationId ? { location: { connect: { id: locationId } } } : {},
      mode: input.mode,
      status: "pending_payment",
      fundingType: plan ? "membership" : "package",
      ...membershipId ? { membership: { connect: { id: membershipId } } } : {},
      ...studentPackageId ? { studentPackage: { connect: { id: studentPackageId } } } : {},
      ...input.learningPlanId ? { plan: { connect: { id: input.learningPlanId } } } : {},
      preferredTimes: { seriesIds, note: (input.preferredTimes ?? "").slice(0, 500) },
      homeAddress: (input.homeAddress ?? "").slice(0, 300),
      ...input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}
    }
  });
  await recordChange(tx, { type: "Enrollment", id: enrollment.id, to: "pending_payment", actorId: input.actorId, data: { planId: plan?.id ?? null, packageId: pkg?.id ?? null } });
  const invoice = await createInvoice(tx, {
    familyId: input.familyId,
    locationId,
    kind: plan ? "enrolment" : "package",
    lines,
    discount: promoDiscount,
    promoCodeId: promo?.id ?? null,
    actorId: input.actorId,
    fulfilment: { kind: "enrolment", enrollmentId: enrollment.id, membershipId, studentPackageId, promoCodeId: promo?.id ?? null }
  });
  if (studentPackageId) await tx.studentPackage.update({ where: { id: studentPackageId }, data: { invoice: { connect: { id: invoice.id } } } });
  return { enrollmentId: enrollment.id, membershipId, studentPackageId, invoice, superseded: superseded.filter(Boolean), program, student };
}
async function validPromo(tx, code, kind) {
  const promo = await tx.promoCode.findFirst({ where: { code: { equals: code.trim(), mode: "insensitive" } } });
  const now = /* @__PURE__ */ new Date();
  if (!promo || promo.validFrom && promo.validFrom > now || promo.validTo && promo.validTo < now || promo.maxUses != null && promo.uses >= promo.maxUses || !["any", kind].includes(promo.appliesTo)) {
    throw new CommandError("That promo code is not valid.");
  }
  return promo;
}
async function enrolmentFeeWaived(tx, studentId, withinDays) {
  const paid = await tx.invoiceLine.count({ where: { studentId, kind: "enrolment_fee", invoice: { status: { in: ["paid", "partially_paid"] } } } });
  if (paid > 0) return true;
  const recent = await tx.membership.count({ where: { studentId, status: "cancelled", endsAt: { gte: new Date(Date.now() - withinDays * DAY) } } });
  return recent > 0;
}
async function cancelPendingEnrolment(tx, enrollmentId, reason, actorId) {
  const e = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { id: true, status: true, membershipId: true, studentPackageId: true } });
  if (!e || e.status !== "pending_payment") return "";
  const invoices = await tx.invoice.findMany({ where: { kind: { in: ["enrolment", "package"] }, fulfilment: { path: ["enrollmentId"], equals: e.id } }, select: { id: true, status: true, amountPaid: true } });
  if (invoices.some((i) => i.amountPaid > 0)) throw new CommandError("A payment for this enrolment is already in; ask the centre to finish it.");
  const r = await tx.enrollment.updateMany({ where: { id: e.id, status: "pending_payment" }, data: { status: "cancelled", endReason: reason.slice(0, 300), endDate: /* @__PURE__ */ new Date() } });
  if (!r.count) return "";
  await recordChange(tx, { type: "Enrollment", id: e.id, from: "pending_payment", to: "cancelled", actorId, reason });
  if (e.membershipId) await tx.membership.updateMany({ where: { id: e.membershipId, status: "pending_payment" }, data: { status: "cancelled", endsAt: /* @__PURE__ */ new Date() } });
  if (e.studentPackageId) await tx.studentPackage.updateMany({ where: { id: e.studentPackageId, status: "pending_payment" }, data: { status: "refunded" } });
  for (const i of invoices) {
    await tx.invoice.updateMany({ where: { id: i.id, status: { in: ["open", "draft"] }, amountPaid: 0 }, data: { status: "void", notes: reason.slice(0, 300) } });
    await recordChange(tx, { type: "Invoice", id: i.id, from: i.status, to: "void", actorId, reason });
    await tx.paymentSession.updateMany({ where: { invoiceId: i.id, status: { in: ["pending", "requires_action"] } }, data: { status: "cancelled", cancelledAt: /* @__PURE__ */ new Date() } });
  }
  return e.id;
}
async function startMembershipPeriod(tx, membershipId, start, actorId, rolledFromId) {
  const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { plan: { select: { programId: true } }, enrollment: { select: { programId: true, program: { select: { sessionMinutes: true } } } } } });
  const end = (0, import_date_fns.addMonths)(start, 1);
  const minutes = m.sessionsPerPeriod ? m.sessionsPerPeriod * (m.enrollment?.program?.sessionMinutes ?? 60) : 0;
  const grant = await createGrant(tx, {
    familyId: m.familyId,
    studentId: m.studentId,
    programId: m.enrollment?.programId ?? m.plan?.programId ?? null,
    kind: "membership_period",
    minutes,
    unlimited: !m.sessionsPerPeriod,
    weeklyCap: m.sessionsPerPeriod ? null : m.weeklyCap ?? 5,
    periodStart: start,
    periodEnd: end,
    expiresAt: end,
    membershipId: m.id,
    note: `Period ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`,
    actorId,
    rolledFromId: rolledFromId ?? null
  });
  return { grant, end };
}
async function bookFixedSeats(tx, enrollmentId, from, through) {
  const e = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { id: true, studentId: true, familyId: true, status: true, preferredTimes: true } });
  const seriesIds = Array.isArray(e?.preferredTimes?.seriesIds) ? e.preferredTimes.seriesIds : [];
  if (!e || !seriesIds.length || !["active", "matched"].includes(e.status)) return { booked: 0, missed: 0 };
  let booked = 0;
  const missed = [];
  for (const seriesId of seriesIds) {
    await generateSessions(tx, seriesId, through);
    const sessions = await tx.session.findMany({ where: { seriesId, status: "scheduled", startsAt: { gt: new Date(Math.max(from.getTime(), Date.now())), lte: through }, bookings: { none: { studentId: e.studentId, status: { in: ["booked", "attended", "late", "no_show"] } } } }, select: { id: true }, orderBy: { startsAt: "asc" } });
    for (const s of sessions) {
      try {
        const r = await bookSeat(tx, null, { sessionId: s.id, studentId: e.studentId, source: "fixed_seat", whenFull: "reject" });
        if (r.kind === "booked") {
          booked += 1;
          await tx.booking.update({ where: { id: r.bookingId }, data: { enrollment: { connect: { id: e.id } } } });
        }
      } catch (error) {
        if (!(error instanceof CommandError)) throw error;
        missed.push(`${s.id}: ${error.message}`);
      }
    }
  }
  if (missed.length) {
    await tx.task.upsert({ where: { openKey: `seats:${e.id}` }, create: { kind: "schedule_problem", title: `${missed.length} fixed seat(s) could not be booked`, family: { connect: { id: e.familyId } }, student: { connect: { id: e.studentId } }, relatedType: "Enrollment", relatedId: e.id, dueAt: /* @__PURE__ */ new Date(), openKey: `seats:${e.id}`, outcomeNote: missed.join("; ").slice(0, 1e3) }, update: { title: `${missed.length} fixed seat(s) could not be booked`, outcomeNote: missed.join("; ").slice(0, 1e3) } });
  }
  return { booked, missed: missed.length };
}
async function activatePackage(tx, studentPackageId, programId) {
  const sp = await tx.studentPackage.findUnique({ where: { id: studentPackageId }, include: { package: { select: { expiryMonths: true, programId: true, name: true } } } });
  const now = /* @__PURE__ */ new Date();
  const expiresAt = (0, import_date_fns.addMonths)(now, sp.package?.expiryMonths ?? 6);
  const r = await tx.studentPackage.updateMany({ where: { id: sp.id, status: "pending_payment" }, data: { status: "active", purchasedAt: now, expiresAt } });
  if (!r.count) return;
  await recordChange(tx, { type: "StudentPackage", id: sp.id, from: "pending_payment", to: "active", reason: "paid" });
  await createGrant(tx, { familyId: sp.familyId, studentId: sp.studentId, programId: programId ?? sp.package?.programId ?? null, kind: "package", minutes: (sp.hours ?? 0) * 60, expiresAt, studentPackageId: sp.id, note: sp.package?.name ?? "Package" });
}
async function removePackageCredit(tx, invoiceId, actorId) {
  const sps = await tx.studentPackage.findMany({ where: { invoiceId, status: { in: ["active", "exhausted"] } }, select: { id: true, grants: { where: { status: "active" }, select: { id: true } } } });
  let minutes = 0;
  for (const sp of sps) {
    for (const g of sp.grants) minutes += await removeUnused(tx, g.id, "refund", "refunded", actorId, "Package refunded");
    await tx.studentPackage.update({ where: { id: sp.id }, data: { status: "refunded" } });
    await recordChange(tx, { type: "StudentPackage", id: sp.id, to: "refunded", actorId, reason: "refund" });
  }
  return minutes;
}
var import_date_fns, OPEN_ENROLMENT, FIXED_SEAT_WEEKS;
var init_enrolment = __esm({
  "features/keystone/lib/enrolment.ts"() {
    "use strict";
    import_date_fns = require("date-fns");
    init_errors();
    init_command();
    init_invoices();
    init_ledger();
    init_booking();
    init_schedule();
    init_payments();
    init_settings();
    OPEN_ENROLMENT = ["pending_payment", "pending_match", "matched", "active", "paused"];
    FIXED_SEAT_WEEKS = 4;
    registerFulfilment("enrolment", async (tx, invoice, f) => {
      const e = await tx.enrollment.findUnique({ where: { id: f.enrollmentId }, include: { program: { select: { format: true, billingModel: true, name: true } } } });
      if (!e) return;
      const now = /* @__PURE__ */ new Date();
      if (e.status !== "pending_payment") {
        await tx.task.create({ data: { kind: "billing_review", title: `Payment received for a cancelled checkout (invoice ${invoice.number})`, family: { connect: { id: invoice.familyId } }, relatedType: "Invoice", relatedId: invoice.id, dueAt: now, openKey: `late-pay:${invoice.id}` } }).catch(() => {
        });
        return;
      }
      const next = e.program?.format === "one_to_one" ? "pending_match" : "active";
      await tx.enrollment.update({ where: { id: e.id }, data: { status: next, startDate: now } });
      await recordChange(tx, { type: "Enrollment", id: e.id, from: "pending_payment", to: next, reason: "payment captured", data: { invoiceId: invoice.id } });
      await tx.student.updateMany({ where: { id: e.studentId, status: "prospect" }, data: { status: "active" } });
      if (f.promoCodeId) await tx.$executeRaw`UPDATE "PromoCode" SET uses = COALESCE(uses, 0) + 1 WHERE id = ${f.promoCodeId}`;
      if (f.membershipId) {
        const r = await tx.membership.updateMany({ where: { id: f.membershipId, status: "pending_payment" }, data: { status: "active", startedAt: now, currentPeriodStart: now, currentPeriodEnd: (0, import_date_fns.addMonths)(now, 1) } });
        if (r.count) {
          await recordChange(tx, { type: "Membership", id: f.membershipId, from: "pending_payment", to: "active", reason: "first period paid" });
          await startMembershipPeriod(tx, f.membershipId, now, null);
        }
      }
      if (f.studentPackageId) await activatePackage(tx, f.studentPackageId, e.programId);
      const seats = next === "active" ? await bookFixedSeats(tx, e.id, now, new Date(now.getTime() + FIXED_SEAT_WEEKS * 7 * DAY)) : { booked: 0, missed: 0 };
      const lead = await tx.lead.findFirst({ where: { familyId: e.familyId, status: { in: ["new", "contacted", "assessment_booked", "assessed", "proposal_sent"] } }, select: { id: true, status: true }, orderBy: { createdAt: "desc" } });
      if (lead) {
        await tx.lead.updateMany({ where: { id: lead.id, status: lead.status }, data: { status: "enrolled" } });
        await recordChange(tx, { type: "Lead", id: lead.id, from: lead.status, to: "enrolled", reason: "enrolment paid" });
      }
      if (e.planId) await tx.learningPlan.updateMany({ where: { id: e.planId, status: { in: ["proposed", "accepted"] } }, data: { status: "active" } });
      await tx.notificationLog.create({ data: { recipient: "", template: "enrolment_confirmed", subject: `Enrolment confirmed: ${e.program?.name ?? ""}`, relatedType: "Enrollment", relatedId: e.id, status: "queued" } });
      await tx.invoice.update({ where: { id: invoice.id }, data: { fulfilment: { ...f, bookedSeats: seats.booked, missedSeats: seats.missed } } });
    });
    registerFulfilment("package", async (tx, _invoice, f) => {
      await activatePackage(tx, f.studentPackageId, f.programId ?? null);
      if (f.enrollmentId) {
        const e = await tx.enrollment.findUnique({ where: { id: f.enrollmentId }, select: { id: true, status: true } });
        if (e && e.status === "ended") {
          await tx.enrollment.updateMany({ where: { id: e.id, status: "ended" }, data: { status: "active", endDate: null, endReason: "" } });
          await recordChange(tx, { type: "Enrollment", id: e.id, from: "ended", to: "active", reason: "package renewed" });
        }
      }
    });
  }
});

// features/keystone/lib/notify.ts
async function queueEmail(tx, input) {
  if (!input.to) return null;
  return tx.notificationLog.create({ data: { recipient: input.to, template: input.template, subject: input.subject.slice(0, 200), relatedType: input.relatedType, relatedId: input.relatedId, channel: "email", status: "queued" } });
}
async function deliverQueued(prisma, limit = 50) {
  const host = process.env.SMTP_HOST;
  const rows = await prisma.notificationLog.findMany({ where: { status: "queued", channel: "email" }, orderBy: { createdAt: "asc" }, take: limit });
  if (!rows.length) return { sent: 0, failed: 0, waiting: 0 };
  if (!host) {
    await prisma.notificationLog.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { status: "failed", error: "Email is not set up (SMTP settings missing)." } });
    return { sent: 0, failed: rows.length, waiting: 0 };
  }
  const transport2 = (0, import_nodemailer.createTransport)({ host, port: Number(process.env.SMTP_PORT || 587), auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : void 0 });
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@localhost";
  const link = `${process.env.SMTP_STORE_LINK || ""}/account`;
  let sent = 0;
  let failed = 0;
  for (const r of rows) {
    if (!r.recipient) continue;
    try {
      await transport2.sendMail({ from, to: r.recipient, subject: r.subject, text: (BODIES[r.template] ?? BODIES.default)(r.subject, link) });
      await prisma.notificationLog.update({ where: { id: r.id }, data: { status: "sent", sentAt: /* @__PURE__ */ new Date(), error: "" } });
      sent += 1;
    } catch (error) {
      await prisma.notificationLog.update({ where: { id: r.id }, data: { status: "failed", error: String(error?.message).slice(0, 500) } });
      failed += 1;
    }
  }
  return { sent, failed, waiting: 0 };
}
var import_nodemailer, BODIES;
var init_notify = __esm({
  "features/keystone/lib/notify.ts"() {
    "use strict";
    import_nodemailer = require("nodemailer");
    BODIES = {
      default: (subject, link) => `${subject}.

See the details in your account: ${link}`
    };
  }
});

// features/keystone/lib/matching.ts
function slotsOf(value) {
  const raw = Array.isArray(value) ? value : Array.isArray(value?.slots) ? value.slots : [];
  return raw.slice(0, 14).map((s) => ({ weekday: Number(s.weekday), startMinute: Number(s.startMinute), minutes: Number(s.minutes) })).filter((s) => Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6 && Number.isInteger(s.startMinute) && s.startMinute >= 0 && s.startMinute < 1440 && s.minutes >= 15 && s.minutes <= 600);
}
async function enrolmentForMatch(tx, enrollmentId) {
  const e = await tx.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      program: { select: { id: true, name: true, sessionMinutes: true, format: true, billingModel: true, placementFee: true, subjects: { select: { id: true, name: true } } } },
      student: { select: { id: true, firstName: true, level: { select: { id: true, name: true, sortOrder: true } } } },
      location: { select: { id: true, name: true, timezone: true } },
      plan: { select: { subjectId: true } },
      family: { select: { id: true, city: true, postalCode: true, primaryLocationId: true } }
    }
  });
  if (!e) throw new CommandError("That enrolment was not found.");
  return e;
}
async function rankCandidates(tx, enrollmentId, now = /* @__PURE__ */ new Date()) {
  const e = await enrolmentForMatch(tx, enrollmentId);
  const subjectIds = e.plan?.subjectId ? [e.plan.subjectId] : e.program.subjects.map((s) => s.id);
  const levelOrder = e.student.level?.sortOrder ?? null;
  const slots = slotsOf(e.preferredTimes).map((s) => ({ ...s, minutes: s.minutes || e.program.sessionMinutes }));
  const rejected = await tx.changeEvent.findMany({ where: { aggregateType: "Enrollment", aggregateId: e.id, reason: "rematch requested" }, select: { data: true } });
  const excluded = new Set(rejected.map((r) => r.data?.tutorId).filter(Boolean));
  const declined = await tx.offer.findMany({ where: { enrollmentId: e.id, status: { in: ["declined", "expired", "withdrawn"] } }, select: { tutorId: true, status: true } });
  const tutors = await tx.tutor.findMany({
    where: {
      status: "active",
      id: { notIn: [...excluded] },
      subjects: { some: { subjectId: { in: subjectIds } } },
      ...e.mode === "in_centre" && e.locationId ? { locations: { some: { id: e.locationId } } } : {}
    },
    include: {
      subjects: { where: { subjectId: { in: subjectIds } }, include: { levelFrom: { select: { sortOrder: true } }, levelTo: { select: { sortOrder: true } } } },
      availability: true,
      credentials: { where: { kind: "background_check", status: "verified" }, select: { expiresAt: true } }
    }
  });
  const weekAhead = new Date(now.getTime() + 7 * DAY);
  const out = [];
  for (const t of tutors) {
    const reasons = [];
    const modes = Array.isArray(t.deliveryModes) ? t.deliveryModes : [];
    if (!modes.includes(e.mode)) continue;
    const check = t.credentials.find((c) => !c.expiresAt || c.expiresAt > now);
    if (!check) continue;
    const levelOk = t.subjects.some((s) => levelOrder == null || (s.levelFrom?.sortOrder ?? -Infinity) <= levelOrder && levelOrder <= (s.levelTo?.sortOrder ?? Infinity));
    if (!levelOk) continue;
    const avail = t.availability.filter((a) => a.mode === e.mode && (!a.effectiveTo || a.effectiveTo > now) && (!a.effectiveFrom || a.effectiveFrom <= weekAhead) && (e.mode !== "in_centre" || !a.locationId || a.locationId === e.locationId));
    let overlap = 0;
    const fits = [];
    for (const s of slots) {
      const [a0, a1] = mins(s);
      if (avail.some((a) => a.weekday === s.weekday && a.weekday * 1440 + a.startMinute <= a0 && a.weekday * 1440 + a.endMinute >= a1)) {
        overlap += 1;
        fits.push(s);
      }
    }
    if (slots.length && !overlap) continue;
    const load = await tx.session.aggregate({ where: { tutorId: t.id, status: { in: ["scheduled", "needs_cover"] }, startsAt: { gte: now, lt: weekAhead } }, _count: { _all: true } });
    const rating = await tx.review.aggregate({ where: { tutorId: t.id, familyId: e.familyId, status: { in: ["published", "pending"] } }, _avg: { rating: true } });
    const rate = t.subjects.find((s) => s.payRate)?.payRate ?? t.defaultPayRate;
    reasons.push(slots.length ? `Free for ${overlap} of ${slots.length} preferred times` : "No preferred times given");
    reasons.push(`${load._count._all} sessions in the next 7 days`);
    if (rating._avg.rating) reasons.push(`Rated ${rating._avg.rating.toFixed(1)} by this family`);
    const prior = declined.find((d) => d.tutorId === t.id);
    if (prior) reasons.push(`Earlier offer ${prior.status}`);
    out.push({ tutorId: t.id, name: t.displayName, overlap, load: load._count._all, rating: rating._avg.rating ?? null, payRate: rate, fits, reasons, previouslyOffered: Boolean(prior) });
  }
  out.sort((a, b) => b.overlap - a.overlap || a.load - b.load || (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name));
  return { enrollment: { id: e.id, status: e.status, mode: e.mode, programName: e.program.name, studentFirstName: e.student.firstName, level: e.student.level?.name ?? null, slots, location: e.location?.name ?? null, area: [e.family?.city, e.family?.postalCode].filter(Boolean).join(" ") }, candidates: out };
}
function nextStarts(slot, from, tz) {
  const local = new import_tz3.TZDate(from.getTime(), tz);
  let day = new import_tz3.TZDate(local.getFullYear(), local.getMonth(), local.getDate(), Math.floor(slot.startMinute / 60), slot.startMinute % 60, tz);
  while (day.getDay() !== slot.weekday || day.getTime() < from.getTime()) day = new import_tz3.TZDate(day.getFullYear(), day.getMonth(), day.getDate() + 1, Math.floor(slot.startMinute / 60), slot.startMinute % 60, tz);
  return new Date(day.getTime());
}
async function acceptOffer(tx, offerId, tutorId, now = /* @__PURE__ */ new Date()) {
  await lockKey(tx, `offer:${offerId}`);
  const offer = await tx.offer.findUnique({ where: { id: offerId } });
  if (!offer || offer.tutorId !== tutorId) throw new CommandError("That offer was not found.");
  if (offer.status !== "sent") throw new CommandError(`This offer is ${offer.status}.`);
  if (offer.expiresAt && offer.expiresAt <= now) {
    await tx.offer.update({ where: { id: offer.id }, data: { status: "expired", openKey: null, respondedAt: now, declineReason: "expired" } });
    await recordChange(tx, { type: "Offer", id: offer.id, from: "sent", to: "expired", reason: "expired" });
    return { refusal: "This offer has expired.", offerId: offer.id };
  }
  const e = await enrolmentForMatch(tx, offer.enrollmentId);
  if (e.status !== "pending_match") throw new CommandError("This enrolment no longer needs a tutor.");
  const slots = slotsOf(offer.proposedSlots).map((s) => ({ ...s, minutes: s.minutes || e.program.sessionMinutes }));
  if (!slots.length) throw new CommandError("This offer has no times.");
  const tz = e.location?.timezone || "UTC";
  try {
    for (const s of slots) {
      const first = nextStarts(s, new Date(now.getTime() + 24 * 36e5), tz);
      for (let w = 0; w < 4; w += 1) {
        const startsAt = new Date(first.getTime() + w * 7 * DAY);
        await assertTutorFree(tx, tutorId, startsAt, new Date(startsAt.getTime() + s.minutes * 6e4));
      }
    }
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    await tx.offer.update({ where: { id: offer.id }, data: { status: "expired", openKey: null, respondedAt: now, declineReason: "conflict" } });
    await recordChange(tx, { type: "Offer", id: offer.id, from: "sent", to: "expired", reason: "conflict", data: { message: error.message } });
    return { refusal: `You are no longer free for these times (${error.message}) The centre will send another offer.`, offerId: offer.id };
  }
  await tx.offer.update({ where: { id: offer.id }, data: { status: "accepted", openKey: null, respondedAt: now } });
  await recordChange(tx, { type: "Offer", id: offer.id, from: "sent", to: "accepted" });
  await tx.enrollment.update({ where: { id: e.id }, data: { status: "matched", tutor: { connect: { id: tutorId } } } });
  await recordChange(tx, { type: "Enrollment", id: e.id, from: "pending_match", to: "matched", data: { tutorId } });
  const subjectId = e.plan?.subjectId ?? e.program.subjects[0]?.id ?? null;
  const seriesIds = [];
  let firstSession = null;
  for (const s of slots) {
    const startDate = nextStarts(s, new Date(now.getTime() + 24 * 36e5), tz);
    const series = await tx.sessionSeries.create({
      data: {
        program: { connect: { id: e.programId } },
        ...subjectId ? { subject: { connect: { id: subjectId } } } : {},
        ...e.locationId ? { location: { connect: { id: e.locationId } } } : {},
        tutor: { connect: { id: tutorId } },
        enrollment: { connect: { id: e.id } },
        mode: e.mode,
        weekday: s.weekday,
        startMinute: s.startMinute,
        minutes: s.minutes,
        capacity: 1,
        startDate,
        status: "active"
      }
    });
    await recordChange(tx, { type: "SessionSeries", id: series.id, to: "active", reason: "offer accepted" });
    await generateSessions(tx, series.id, new Date(now.getTime() + 28 * DAY));
    seriesIds.push(series.id);
    const s1 = await tx.session.findFirst({ where: { seriesId: series.id, status: "scheduled" }, orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true } });
    if (s1 && (!firstSession || s1.startsAt < firstSession.startsAt)) firstSession = s1;
  }
  if (firstSession) await tx.session.update({ where: { id: firstSession.id }, data: { isTrial: true } });
  const prefs = e.preferredTimes ?? {};
  await tx.enrollment.update({ where: { id: e.id }, data: { preferredTimes: { ...prefs, seriesIds } } });
  return { offerId: offer.id, enrollmentId: e.id, seriesIds, trialSessionId: firstSession?.id ?? null };
}
var import_tz3, mins;
var init_matching = __esm({
  "features/keystone/lib/matching.ts"() {
    "use strict";
    import_tz3 = require("@date-fns/tz");
    init_errors();
    init_command();
    init_schedule();
    init_settings();
    mins = (a) => [a.weekday * 1440 + a.startMinute, a.weekday * 1440 + a.startMinute + a.minutes];
  }
});

// features/keystone/mutations/tutors.ts
var tutors_exports = {};
__export(tutors_exports, {
  autoConfirmMatches: () => autoConfirmMatches,
  confirmMatch: () => confirmMatch,
  resolvers: () => resolvers4,
  typeDefs: () => typeDefs4
});
async function actorOf2(context) {
  return context.session?.itemId ? loadActor(context.sudo().prisma, context.session.itemId) : null;
}
async function confirmMatch(tx, enrollmentId, actorId, reason) {
  const e = await enrolmentForMatch(tx, enrollmentId);
  if (e.status !== "matched") throw new CommandError("This enrolment is not waiting for a tutor confirmation.");
  await tx.enrollment.update({ where: { id: e.id }, data: { status: "active", tutorConfirmedAt: /* @__PURE__ */ new Date(), startDate: e.startDate ?? /* @__PURE__ */ new Date() } });
  await recordChange(tx, { type: "Enrollment", id: e.id, from: "matched", to: "active", actorId, reason });
  let invoiceId = null;
  if (e.program.billingModel === "placement_fee" && e.program.placementFee > 0) {
    const inv = await createInvoice(tx, { familyId: e.familyId, locationId: e.locationId, kind: "placement", actorId, lines: [{ description: `Placement: ${e.program.name} (${e.student.firstName})`, kind: "placement", unitAmount: e.program.placementFee, studentId: e.studentId, programId: e.programId }] });
    invoiceId = inv.id;
  }
  return { invoiceId };
}
async function autoConfirmMatches(prisma, now = /* @__PURE__ */ new Date()) {
  const due = await prisma.enrollment.findMany({ where: { status: "matched", trialAttendedAt: { lte: new Date(now.getTime() - 48 * HOUR) } }, select: { id: true } });
  let confirmed = 0;
  for (const e of due) {
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `enrol-match:${e.id}`);
      const row = await tx.enrollment.findUnique({ where: { id: e.id }, select: { status: true } });
      if (row.status === "matched") {
        await confirmMatch(tx, e.id, null, "no objection 48 hours after the trial");
        confirmed += 1;
      }
    }, { maxWait: 6e4, timeout: 12e4 });
  }
  return { confirmed };
}
var import_node_crypto8, gql4, keyOf4, EMAIL3, typeDefs4, resolvers4;
var init_tutors = __esm({
  "features/keystone/mutations/tutors.ts"() {
    "use strict";
    import_node_crypto8 = require("node:crypto");
    init_command();
    init_errors();
    init_actor();
    init_matching();
    init_enrolment();
    init_invoices();
    init_booking();
    init_notify();
    init_settings();
    gql4 = String.raw;
    keyOf4 = (a) => typeof a?.idempotencyKey === "string" ? a.idempotencyKey : null;
    EMAIL3 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    typeDefs4 = gql4`
  type Query {
    matchingCandidates(enrollmentId: ID!): JSON
    myOffers: JSON
  }
  type Mutation {
    sendOffer(enrollmentId: ID!, tutorId: ID!, slots: JSON, idempotencyKey: String): CommandResult!
    withdrawOffer(offerId: ID!, reason: String, idempotencyKey: String): CommandResult!
    respondToOffer(offerId: ID!, accept: Boolean!, reason: String, idempotencyKey: String): CommandResult!
    confirmTutor(enrollmentId: ID!, idempotencyKey: String): CommandResult!
    requestRematch(enrollmentId: ID!, reason: String!, idempotencyKey: String): CommandResult!
    createEnrolmentForFamily(data: JSON!, idempotencyKey: String): CommandResult!
    setTutorStatus(tutorId: ID!, status: String!, reason: String, coverSessions: Boolean, idempotencyKey: String): CommandResult!
    verifyCredential(credentialId: ID!, decision: String!, expiresAt: String, idempotencyKey: String): CommandResult!
    requestTimeOff(startsAt: String!, endsAt: String!, reason: String, idempotencyKey: String): CommandResult!
    decideTimeOff(timeOffId: ID!, approve: Boolean!, idempotencyKey: String): CommandResult!
    createTutorApplication(data: JSON!, idempotencyKey: String): CommandResult!
    transitionApplication(applicationId: ID!, status: String!, note: String, idempotencyKey: String): CommandResult!
    approveApplication(applicationId: ID!, data: JSON, idempotencyKey: String): CommandResult!
  }
`;
    resolvers4 = {
      Query: {
        matchingCandidates: async (_, args, context) => {
          const prisma = context.sudo().prisma;
          const e = await prisma.enrollment.findUnique({ where: { id: String(args.enrollmentId) }, select: { locationId: true, family: { select: { primaryLocationId: true } } } });
          if (!e) return null;
          if (!canAt(await actorOf2(context), "canManageTutors", e.locationId ?? e.family?.primaryLocationId)) return null;
          return rankCandidates(prisma, String(args.enrollmentId));
        },
        /** Tutor portal: offers without family contact details until accepted (W2.3). */
        myOffers: async (_, _args, context) => {
          const actor = await actorOf2(context);
          if (!actor?.tutorId) return [];
          const offers = await context.sudo().prisma.offer.findMany({
            where: { tutorId: actor.tutorId },
            orderBy: { createdAt: "desc" },
            take: 50,
            include: { enrollment: { select: { id: true, mode: true, status: true, program: { select: { name: true } }, student: { select: { firstName: true, level: { select: { name: true } }, lastName: true } }, location: { select: { name: true } }, family: { select: { city: true, postalCode: true, name: true, phone: true, billingEmail: true, addressLine1: true } }, homeAddress: true } } }
          });
          return offers.map((o) => {
            const accepted = o.status === "accepted";
            const f = o.enrollment?.family ?? {};
            return {
              id: o.id,
              status: o.status,
              payRate: o.payRate,
              slots: o.proposedSlots,
              sentAt: o.sentAt,
              expiresAt: o.expiresAt,
              respondedAt: o.respondedAt,
              declineReason: o.declineReason,
              programme: o.enrollment?.program?.name,
              mode: o.enrollment?.mode,
              level: o.enrollment?.student?.level?.name ?? null,
              location: o.enrollment?.location?.name ?? null,
              area: [f.city, f.postalCode].filter(Boolean).join(" "),
              student: accepted ? `${o.enrollment.student.firstName} ${o.enrollment.student.lastName}`.trim() : o.enrollment?.student?.firstName,
              family: accepted ? { name: f.name, phone: f.phone, email: f.billingEmail, address: o.enrollment.homeAddress || f.addressLine1 } : null
            };
          });
        }
      },
      Mutation: {
        sendOffer: (_, args, context) => runCommand(context, { name: "sendOffer", idempotencyKey: keyOf4(args), input: { e: args.enrollmentId, t: args.tutorId, s: args.slots ?? null }, conflictMessage: "This enrolment already has an open offer. Withdraw it first." }, async (tx, actor) => {
          const e = await enrolmentForMatch(tx, String(args.enrollmentId));
          const a = requireFlag(actor, "canManageTutors", e.locationId ?? e.family?.primaryLocationId);
          if (e.status !== "pending_match") throw new CommandError("This enrolment is not waiting for a tutor.");
          await lockKey(tx, `enrol-match:${e.id}`);
          if (await tx.offer.findUnique({ where: { openKey: e.id }, select: { id: true } })) throw new CommandError("This enrolment already has an open offer. Withdraw it first.");
          const ranked = await rankCandidates(tx, e.id);
          const c = ranked.candidates.find((x) => x.tutorId === String(args.tutorId));
          if (!c) throw new CommandError("That tutor is not a candidate (subject, level, mode, background check, availability or a past re-match).");
          const slots = args.slots ? slotsOf(args.slots) : c.fits.length ? c.fits : ranked.enrollment.slots;
          if (!slots.length) throw new CommandError("Pick at least one weekly time for the offer.");
          const settings = await getSettings(tx);
          const now = /* @__PURE__ */ new Date();
          const offer = await tx.offer.create({ data: { enrollment: { connect: { id: e.id } }, tutor: { connect: { id: c.tutorId } }, status: "sent", openKey: e.id, payRate: c.payRate, proposedSlots: slots, sentAt: now, expiresAt: new Date(now.getTime() + settings.offerExpiryHours * HOUR), sentBy: { connect: { id: a.userId } }, createdBy: { connect: { id: a.userId } } } });
          await recordChange(tx, { type: "Offer", id: offer.id, to: "sent", actorId: a.userId, data: { tutorId: c.tutorId } });
          const tutorUser = await tx.tutor.findUnique({ where: { id: c.tutorId }, select: { user: { select: { email: true } } } });
          await queueEmail(tx, { to: tutorUser?.user?.email ?? "", template: "offer_sent", subject: `New student offer: ${e.program.name}`, relatedType: "Offer", relatedId: offer.id });
          return { id: offer.id, data: { offerId: offer.id, expiresAt: offer.expiresAt.toISOString() } };
        }),
        withdrawOffer: (_, args, context) => runCommand(context, { name: "withdrawOffer", idempotencyKey: keyOf4(args), input: { o: args.offerId } }, async (tx, actor) => {
          const o = await tx.offer.findUnique({ where: { id: String(args.offerId) }, select: { id: true, enrollment: { select: { locationId: true, family: { select: { primaryLocationId: true } } } } } });
          if (!o) throw new CommandError("That offer was not found.");
          requireFlag(actor, "canManageTutors", o.enrollment?.locationId ?? o.enrollment?.family?.primaryLocationId);
          await transition(tx, actor, "offer", "Offer", o.id, "sent", "withdrawn", { openKey: null, respondedAt: /* @__PURE__ */ new Date(), declineReason: optionalString(args.reason, 300) }, optionalString(args.reason, 300) || "withdrawn");
          return { id: o.id, data: { status: "withdrawn" } };
        }),
        respondToOffer: (_, args, context) => runCommand(context, { name: "respondToOffer", idempotencyKey: keyOf4(args), input: { o: args.offerId, a: Boolean(args.accept) } }, async (tx, actor) => {
          const a = requireActor(actor);
          if (!a.tutorId) throw new CommandError("Only the offered tutor can answer this offer.");
          const offer = await tx.offer.findUnique({ where: { id: String(args.offerId) }, select: { id: true, tutorId: true, status: true, enrollmentId: true } });
          if (!offer || offer.tutorId !== a.tutorId) throw new CommandError("That offer was not found.");
          await lockKey(tx, `enrol-match:${offer.enrollmentId}`);
          if (!args.accept) {
            await transition(tx, a, "offer", "Offer", offer.id, "sent", "declined", { openKey: null, respondedAt: /* @__PURE__ */ new Date(), declineReason: optionalString(args.reason, 300) }, "declined");
            await tx.task.upsert({ where: { openKey: `offer-declined:${offer.enrollmentId}` }, create: { kind: "manual", title: "Offer declined: send the next candidate", relatedType: "Enrollment", relatedId: offer.enrollmentId, dueAt: /* @__PURE__ */ new Date(), openKey: `offer-declined:${offer.enrollmentId}` }, update: {} });
            return { id: offer.id, data: { status: "declined" } };
          }
          const r = await acceptOffer(tx, offer.id, a.tutorId);
          if (r.refusal) return { id: offer.id, refusal: r.refusal, data: { status: "expired" } };
          const seats = await bookFixedSeats(tx, r.enrollmentId, /* @__PURE__ */ new Date(), new Date(Date.now() + 28 * DAY));
          const e = await tx.enrollment.findUnique({ where: { id: r.enrollmentId }, select: { family: { select: { billingEmail: true } } } });
          await queueEmail(tx, { to: e?.family?.billingEmail ?? "", template: "tutor_matched", subject: "We have matched a tutor: your first session is a trial", relatedType: "Enrollment", relatedId: r.enrollmentId });
          await queueEmail(tx, { to: a.email, template: "offer_accepted", subject: "You accepted a new student", relatedType: "Offer", relatedId: offer.id });
          return { id: offer.id, data: { status: "accepted", ...r, bookedSeats: seats.booked, missedSeats: seats.missed } };
        }),
        confirmTutor: (_, args, context) => runCommand(context, { name: "confirmTutor", idempotencyKey: keyOf4(args), input: { e: args.enrollmentId } }, async (tx, actor) => {
          const e = await tx.enrollment.findUnique({ where: { id: String(args.enrollmentId) }, select: { id: true, familyId: true, status: true } });
          if (!e) throw new CommandError("That enrolment was not found.");
          await requireGuardianOf(tx, actor, e.familyId);
          await lockKey(tx, `enrol-match:${e.id}`);
          if (e.status === "active") return { id: e.id, data: { status: "active" } };
          const r = await confirmMatch(tx, e.id, actor.userId, "guardian kept the tutor");
          return { id: e.id, data: { status: "active", invoiceId: r.invoiceId } };
        }),
        /** Re-match: back to pending_match; first free (trial not charged, setting); the tutor's future seats released. */
        requestRematch: (_, args, context) => runCommand(context, { name: "requestRematch", idempotencyKey: keyOf4(args), input: { e: args.enrollmentId } }, async (tx, actor) => {
          const e = await tx.enrollment.findUnique({ where: { id: String(args.enrollmentId) }, select: { id: true, familyId: true, status: true, tutorId: true, rematchCount: true, locationId: true, preferredTimes: true } });
          if (!e) throw new CommandError("That enrolment was not found.");
          if (!canAt(actor, "canManageTutors", e.locationId)) await requireGuardianOf(tx, actor, e.familyId);
          await lockKey(tx, `enrol-match:${e.id}`);
          if (!["matched", "active"].includes(e.status) || !e.tutorId) throw new CommandError("This enrolment has no tutor to change.");
          const reason = requireString(args.reason, "Reason", 500);
          const settings = await getSettings(tx);
          const free = (e.rematchCount ?? 0) < settings.freeRematches;
          await tx.enrollment.update({ where: { id: e.id }, data: { status: "pending_match", tutorId: null, rematchCount: (e.rematchCount ?? 0) + 1, tutorConfirmedAt: null, trialAttendedAt: null, preferredTimes: { ...e.preferredTimes ?? {}, seriesIds: [] } } });
          await recordChange(tx, { type: "Enrollment", id: e.id, from: e.status, to: "pending_match", actorId: actor.userId, reason: "rematch requested", data: { tutorId: e.tutorId, note: reason, free } });
          const series = await tx.sessionSeries.findMany({ where: { enrollmentId: e.id, status: "active" }, select: { id: true } });
          let released = 0;
          for (const s of series) {
            await tx.sessionSeries.update({ where: { id: s.id }, data: { status: "ended", endDate: /* @__PURE__ */ new Date() } });
            const sessions = await tx.session.findMany({ where: { seriesId: s.id, status: { in: ["scheduled", "needs_cover"] }, startsAt: { gt: /* @__PURE__ */ new Date() } }, select: { id: true, bookings: { where: { status: "booked" }, select: { id: true } } } });
            for (const sess of sessions) {
              for (const b of sess.bookings) {
                await cancelSeat(tx, null, b.id, { byCentre: true, reason: "Re-match" });
                released += 1;
              }
              await tx.session.update({ where: { id: sess.id }, data: { status: "cancelled", cancelReason: "other: re-match" } });
            }
          }
          if (free && !settings.trialChargedOnRematch) {
            const trial = await tx.booking.findFirst({ where: { enrollmentId: e.id, session: { isTrial: true }, status: { in: ["attended", "late", "no_show", "cancelled_late", "cancelled_late_excused"] } }, select: { id: true, creditGrantId: true, minutes: true } });
            if (trial?.creditGrantId) {
              const { adjustGrant: adjustGrant2 } = await Promise.resolve().then(() => (init_ledger(), ledger_exports));
              await adjustGrant2(tx, trial.creditGrantId, trial.minutes, actor.userId, "Trial not charged (free re-match)");
            }
          }
          await tx.task.upsert({ where: { openKey: `rematch:${e.id}` }, create: { kind: "rematch_requested", title: "Re-match requested", family: { connect: { id: e.familyId } }, relatedType: "Enrollment", relatedId: e.id, dueAt: /* @__PURE__ */ new Date(), openKey: `rematch:${e.id}`, outcomeNote: reason }, update: {} });
          return { id: e.id, data: { status: "pending_match", free, released } };
        }),
        /** Front desk enrol a family by phone (§6.4 enrolments): same checkout, invoice left open for the front desk to take payment. */
        createEnrolmentForFamily: (_, args, context) => runCommand(context, { name: "createEnrolmentForFamily", idempotencyKey: keyOf4(args), input: args.data }, async (tx, actor) => {
          const d = args.data ?? {};
          const family = await tx.family.findUnique({ where: { id: requireString(d.familyId, "Family") }, select: { id: true, primaryLocationId: true } });
          if (!family) throw new CommandError("That family was not found.");
          const a = requireFlag(actor, "canManageFamilies", d.locationId ?? family.primaryLocationId);
          requireFlag(a, "canManageBilling", d.locationId ?? family.primaryLocationId);
          const c = await buildCheckout(tx, {
            familyId: family.id,
            studentId: requireString(d.studentId, "Student"),
            programId: requireString(d.programId, "Programme"),
            planId: d.planId ? String(d.planId) : null,
            packageId: d.packageId ? String(d.packageId) : null,
            locationId: d.locationId ? String(d.locationId) : null,
            mode: String(d.mode ?? "in_centre"),
            seriesIds: Array.isArray(d.seriesIds) ? d.seriesIds.map(String) : [],
            promoCode: d.promoCode ?? null,
            learningPlanId: d.learningPlanId ? String(d.learningPlanId) : null,
            homeAddress: optionalString(d.homeAddress, 300),
            preferredTimes: optionalString(d.preferredTimes, 500),
            actorId: a.userId
          });
          if (Array.isArray(d.slots)) {
            const e = await tx.enrollment.findUnique({ where: { id: c.enrollmentId }, select: { preferredTimes: true } });
            await tx.enrollment.update({ where: { id: c.enrollmentId }, data: { preferredTimes: { ...e.preferredTimes ?? {}, slots: slotsOf(d.slots) } } });
          }
          return { id: c.enrollmentId, data: { enrollmentId: c.enrollmentId, invoiceId: c.invoice.id, invoiceNumber: c.invoice.number, total: c.invoice.total } };
        }),
        setTutorStatus: (_, args, context) => runCommand(context, { name: "setTutorStatus", idempotencyKey: keyOf4(args), input: { t: args.tutorId, s: args.status } }, async (tx, actor) => {
          const a = requireFlag(actor, "canManageTutors");
          const t = await tx.tutor.findUnique({ where: { id: String(args.tutorId) }, select: { id: true, status: true, userId: true } });
          if (!t) throw new CommandError("That tutor was not found.");
          const allowed = { onboarding: ["active", "inactive"], active: ["paused", "inactive"], paused: ["active", "inactive"], inactive: ["active"] };
          if (!(allowed[t.status] ?? []).includes(args.status)) throw new CommandError(`A tutor who is ${t.status} cannot move to ${args.status}.`);
          if (args.status === "active") {
            const check = await tx.tutorCredential.count({ where: { tutorId: t.id, kind: "background_check", status: "verified", OR: [{ expiresAt: null }, { expiresAt: { gt: /* @__PURE__ */ new Date() } }] } });
            if (!check) throw new CommandError("Verify a current background check before making the tutor active.");
          }
          await transition(tx, a, "tutor", "Tutor", t.id, t.status, args.status, {}, optionalString(args.reason, 300) || void 0);
          await tx.offer.updateMany({ where: { tutorId: t.id, status: "sent" }, data: args.status === "active" ? {} : { status: "withdrawn", openKey: null, declineReason: `Tutor ${args.status}` } });
          let covered = 0;
          if (args.status !== "active" && args.coverSessions) {
            const r = await tx.session.updateMany({ where: { tutorId: t.id, status: "scheduled", startsAt: { gt: /* @__PURE__ */ new Date() } }, data: { status: "needs_cover" } });
            covered = r.count;
          }
          return { id: t.id, data: { status: args.status, sessionsNeedingCover: covered } };
        }),
        verifyCredential: (_, args, context) => runCommand(context, { name: "verifyCredential", idempotencyKey: keyOf4(args), input: { c: args.credentialId, d: args.decision } }, async (tx, actor) => {
          const a = requireFlag(actor, "canManageTutors");
          const c = await tx.tutorCredential.findUnique({ where: { id: String(args.credentialId) }, select: { id: true, status: true, expiresAt: true } });
          if (!c) throw new CommandError("That credential was not found.");
          if (!["verified", "rejected"].includes(args.decision)) throw new CommandError("Verify or reject.");
          const expiresAt = args.expiresAt ? requireDate(args.expiresAt, "Expiry") : c.expiresAt;
          if (args.decision === "verified" && expiresAt && expiresAt <= /* @__PURE__ */ new Date()) throw new CommandError("That credential has already expired.");
          await transition(tx, a, "tutorCredential", "TutorCredential", c.id, ["pending", "expired", "rejected", "verified"], args.decision, { verifiedById: a.userId, verifiedAt: /* @__PURE__ */ new Date(), expiresAt });
          return { id: c.id, data: { status: args.decision } };
        }),
        requestTimeOff: (_, args, context) => runCommand(context, { name: "requestTimeOff", idempotencyKey: keyOf4(args), input: { s: args.startsAt, e: args.endsAt } }, async (tx, actor) => {
          const a = requireActor(actor);
          if (!a.tutorId) throw new CommandError("Only tutors can request time off.");
          const startsAt = requireDate(args.startsAt, "Start");
          const endsAt = requireDate(args.endsAt, "End");
          if (endsAt <= startsAt) throw new CommandError("The end must be after the start.");
          const t = await tx.tutorTimeOff.create({ data: { tutor: { connect: { id: a.tutorId } }, startsAt, endsAt, reason: optionalString(args.reason, 300), status: "requested", createdBy: { connect: { id: a.userId } } } });
          await recordChange(tx, { type: "TutorTimeOff", id: t.id, to: "requested", actorId: a.userId });
          const clashes = await tx.session.count({ where: { tutorId: a.tutorId, status: "scheduled", startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
          return { id: t.id, data: { timeOffId: t.id, sessionsAffected: clashes } };
        }),
        decideTimeOff: (_, args, context) => runCommand(context, { name: "decideTimeOff", idempotencyKey: keyOf4(args), input: { t: args.timeOffId, a: Boolean(args.approve) } }, async (tx, actor) => {
          const a = requireFlag(actor, "canManageTutors");
          const t = await tx.tutorTimeOff.findUnique({ where: { id: String(args.timeOffId) }, select: { id: true, tutorId: true, startsAt: true, endsAt: true } });
          if (!t) throw new CommandError("That request was not found.");
          const to = args.approve ? "approved" : "declined";
          await transition(tx, a, "tutorTimeOff", "TutorTimeOff", t.id, "requested", to);
          let needsCover = 0;
          if (args.approve) {
            const r = await tx.session.updateMany({ where: { tutorId: t.tutorId, status: "scheduled", startsAt: { lt: t.endsAt }, endsAt: { gt: t.startsAt } }, data: { status: "needs_cover" } });
            needsCover = r.count;
          }
          return { id: t.id, data: { status: to, sessionsNeedingCover: needsCover } };
        }),
        /** Staff add an applicant (§6.3: recruiting is staff work). */
        createTutorApplication: (_, args, context) => runCommand(context, { name: "createTutorApplication", idempotencyKey: keyOf4(args), input: args.data }, async (tx, actor) => {
          const a = requireFlag(actor, "canManageTutors");
          const d = args.data ?? {};
          const email = requireString(d.email, "Email", 200).toLowerCase();
          if (!EMAIL3.test(email)) throw new CommandError("Enter a valid email address.");
          const open = await tx.tutorApplication.findFirst({ where: { email: { equals: email, mode: "insensitive" }, status: { in: ["applied", "screening", "interview", "checks"] } }, select: { id: true } });
          if (open) throw new CommandError("This person already has an open application.");
          const modes = Array.isArray(d.modes) ? d.modes.filter((m) => ["in_centre", "online", "in_home"].includes(m)) : [];
          const refs = Array.isArray(d.references) ? d.references.slice(0, 4).map((r) => ({ name: requireString(r?.name, "Reference name", 120), contact: optionalString(r?.contact, 200), relation: optionalString(r?.relation, 120) })) : [];
          const app = await tx.tutorApplication.create({
            data: {
              name: requireString(d.name, "Name", 120),
              email,
              phone: optionalString(d.phone, 40),
              subjectsText: optionalString(d.subjectsText, 500),
              levels: optionalString(d.levels, 300),
              modes,
              areas: optionalString(d.areas, 300),
              availability: d.availability ?? null,
              references: refs,
              coverNote: optionalString(d.coverNote, 4e3),
              source: optionalString(d.source, 60) || "email",
              status: "applied",
              notes: optionalString(d.notes, 4e3),
              ...Array.isArray(d.subjectIds) && d.subjectIds.length ? { subjects: { connect: d.subjectIds.slice(0, 20).map((id) => ({ id: String(id) })) } } : {},
              reviewer: { connect: { id: a.userId } },
              createdBy: { connect: { id: a.userId } }
            }
          });
          await recordChange(tx, { type: "TutorApplication", id: app.id, to: "applied", actorId: a.userId });
          return { id: app.id, data: { applicationId: app.id } };
        }),
        transitionApplication: (_, args, context) => runCommand(context, { name: "transitionApplication", idempotencyKey: keyOf4(args), input: { a: args.applicationId, s: args.status } }, async (tx, actor) => {
          const a = requireFlag(actor, "canManageTutors");
          const app = await tx.tutorApplication.findUnique({ where: { id: String(args.applicationId) }, select: { id: true, status: true, notes: true } });
          if (!app) throw new CommandError("That application was not found.");
          const next = { applied: ["screening", "rejected", "withdrawn"], screening: ["interview", "rejected", "withdrawn"], interview: ["checks", "rejected", "withdrawn"], checks: ["rejected", "withdrawn"] };
          if (args.status === "approved") throw new CommandError("Use \u201CApprove\u201D to create the tutor.");
          if (!(next[app.status] ?? []).includes(args.status)) throw new CommandError(`An application in ${app.status} cannot move to ${args.status}.`);
          const note = optionalString(args.note, 2e3);
          await transition(tx, a, "tutorApplication", "TutorApplication", app.id, app.status, args.status, { reviewerId: a.userId, ...note ? { notes: [app.notes, `${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)} ${args.status}: ${note}`].filter(Boolean).join("\n") } : {} }, note || void 0);
          return { id: app.id, data: { status: args.status } };
        }),
        /** Approve: a Tutor and a tutor User (W9.3); the tutor gets a set-password email. */
        approveApplication: async (_, args, context) => {
          let email = "";
          const r = await runCommand(context, { name: "approveApplication", idempotencyKey: keyOf4(args), input: { a: args.applicationId } }, async (tx, actor) => {
            const a = requireFlag(actor, "canManageTutors");
            const app = await tx.tutorApplication.findUnique({ where: { id: String(args.applicationId) }, include: { subjects: { select: { id: true } } } });
            if (!app) throw new CommandError("That application was not found.");
            if (app.status !== "checks") throw new CommandError("Finish the checks stage before approving.");
            const d = args.data ?? {};
            email = app.email.toLowerCase();
            await lockKey(tx, `signup:${email}`);
            const tutorRole = await tx.role.findFirst({ where: { isTutor: true, canManageSettings: false }, orderBy: { createdAt: "asc" }, select: { id: true } });
            if (!tutorRole) throw new CommandError("Create a Tutor role first (Settings \u2192 Roles).");
            let user = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, tutor: { select: { id: true } }, role: { select: { canAccessDashboard: true } } } });
            if (user?.tutor) throw new CommandError("This person is already a tutor.");
            if (user && user.role?.canAccessDashboard) throw new CommandError("This email belongs to a staff account. Use another email.");
            if (!user) user = await tx.user.create({ data: { name: app.name, email, phone: app.phone, password: (0, import_node_crypto8.randomBytes)(24).toString("base64url"), role: { connect: { id: tutorRole.id } } }, select: { id: true, tutor: { select: { id: true } }, role: { select: { canAccessDashboard: true } } } });
            else await tx.user.update({ where: { id: user.id }, data: { role: { connect: { id: tutorRole.id } } } });
            const base = app.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "tutor";
            const slug2 = await tx.tutor.count({ where: { slug: base } }) ? `${base}-${(0, import_node_crypto8.randomBytes)(2).toString("hex")}` : base;
            const tutor = await tx.tutor.create({
              data: {
                user: { connect: { id: user.id } },
                displayName: app.name,
                slug: slug2,
                status: "onboarding",
                deliveryModes: Array.isArray(app.modes) ? app.modes : [],
                travelAreas: app.areas,
                defaultPayRate: d.defaultPayRate ? requireInt(d.defaultPayRate, "Pay rate", 0, 1e5) : 0,
                employmentType: d.employmentType === "employee" ? "employee" : "contractor",
                application: { connect: { id: app.id } },
                createdBy: { connect: { id: a.userId } },
                ...Array.isArray(d.locationIds) && d.locationIds.length ? { locations: { connect: d.locationIds.map((id) => ({ id: String(id) })) } } : {}
              }
            });
            for (const s of app.subjects) await tx.tutorSubject.create({ data: { tutor: { connect: { id: tutor.id } }, subject: { connect: { id: s.id } } } });
            for (const lid of Array.isArray(d.locationIds) ? d.locationIds : []) await tx.locationMembership.create({ data: { user: { connect: { id: user.id } }, location: { connect: { id: String(lid) } }, role: "tutor" } }).catch(() => {
            });
            await transition(tx, a, "tutorApplication", "TutorApplication", app.id, "checks", "approved", { reviewerId: a.userId });
            await recordChange(tx, { type: "Tutor", id: tutor.id, to: "onboarding", actorId: a.userId, reason: "application approved" });
            return { id: tutor.id, data: { tutorId: tutor.id, userId: user.id } };
          });
          if (r.success) {
            try {
              await context.sudo().graphql.run({ query: "mutation($e: String!) { sendUserPasswordResetLink(email: $e) }", variables: { e: email } });
            } catch (error) {
              console.error("approveApplication: set-password link not sent", error?.message);
            }
          }
          return r;
        }
      }
    };
  }
});

// features/keystone/mutations/families.ts
var families_exports = {};
__export(families_exports, {
  draftDueProgressReports: () => draftDueProgressReports,
  draftProgressFor: () => draftProgressFor,
  resolvers: () => resolvers5,
  typeDefs: () => typeDefs5
});
async function familyOf(tx, familyId) {
  const f = await tx.family.findUnique({ where: { id: familyId }, select: { id: true, primaryLocationId: true, billingEmail: true, name: true } });
  if (!f) throw new CommandError("That family was not found.");
  return f;
}
async function familyAccess(tx, actor, familyId, flag = "canManageFamilies") {
  const f = await familyOf(tx, familyId);
  if (canAt(actor, flag, f.primaryLocationId)) return { family: f, staff: true };
  await requireGuardianOf(tx, actor, f.id);
  return { family: f, staff: false };
}
function pickupPeople(value) {
  if (value == null) return void 0;
  if (!Array.isArray(value)) throw new CommandError("Pickup people must be a list.");
  return value.slice(0, 10).map((p) => ({ name: requireString(p?.name, "Pickup name", 120), relation: optionalString(p?.relation, 60), phone: optionalString(p?.phone, 40) }));
}
function studentData(d, staff2) {
  const out = {};
  if (d.firstName !== void 0) out.firstName = requireString(d.firstName, "First name", 80);
  if (d.lastName !== void 0) out.lastName = optionalString(d.lastName, 80);
  if (d.school !== void 0) out.school = optionalString(d.school, 160);
  if (d.dateOfBirth !== void 0) {
    const dob = d.dateOfBirth ? new Date(String(d.dateOfBirth)) : null;
    if (dob && (Number.isNaN(dob.getTime()) || dob > /* @__PURE__ */ new Date())) throw new CommandError("Enter a valid date of birth.");
    out.dateOfBirth = dob;
  }
  if (d.levelId !== void 0) out.level = d.levelId ? { connect: { id: String(d.levelId) } } : { disconnect: true };
  if (d.learningNotes !== void 0) out.learningNotes = optionalString(d.learningNotes, 4e3);
  if (d.medicalNotes !== void 0) out.medicalNotes = optionalString(d.medicalNotes, 4e3);
  if (d.pickupPeople !== void 0) out.pickupPeople = pickupPeople(d.pickupPeople);
  if (staff2 && d.status !== void 0) {
    if (!["prospect", "active", "paused", "alumni"].includes(d.status)) throw new CommandError("Unknown student status.");
    out.status = d.status;
  }
  return out;
}
async function progressDraftData(tx, enrollmentId, periodStart, periodEnd) {
  const e = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { id: true, studentId: true, planId: true, tutorId: true } });
  const bookings = await tx.booking.findMany({ where: { studentId: e.studentId, startsAt: { gte: periodStart, lt: periodEnd } }, select: { status: true } });
  const attended = bookings.filter((b) => ["attended", "late"].includes(b.status)).length;
  const missed = bookings.filter((b) => ["no_show", "cancelled_late", "cancelled_late_excused"].includes(b.status)).length;
  const goals = e.planId ? await tx.planGoal.findMany({ where: { planId: e.planId }, select: { title: true, status: true, baseline: true, target: true }, orderBy: { sortOrder: "asc" } }) : [];
  const reports = await tx.sessionReport.findMany({ where: { studentId: e.studentId, publishedAt: { gte: periodStart, lt: periodEnd } }, select: { topicsCovered: true, wentWell: true, toImprove: true }, orderBy: { publishedAt: "asc" } });
  const topics = reports.map((r) => r.topicsCovered).filter(Boolean);
  const narrative = [
    `Attended ${attended} of ${attended + missed} sessions.`,
    topics.length ? `Covered: ${topics.join("; ")}.` : "",
    reports.map((r) => r.wentWell).filter(Boolean).slice(-3).join(" ")
  ].filter(Boolean).join("\n\n");
  const nextSteps = reports.map((r) => r.toImprove).filter(Boolean).slice(-3).join(" ");
  return { studentId: e.studentId, tutorId: e.tutorId, attended, missed, goals, narrative: narrative.slice(0, 4e3), nextSteps: nextSteps.slice(0, 2e3) };
}
async function draftProgressFor(tx, enrollmentId, actorId, now = /* @__PURE__ */ new Date()) {
  await lockKey(tx, `progress:${enrollmentId}`);
  const last = await tx.progressReport.findFirst({ where: { enrollmentId, status: { not: "withdrawn" } }, orderBy: { periodEnd: "desc" }, select: { id: true, status: true, periodEnd: true } });
  if (last?.status === "draft") return { id: last.id, created: false };
  const e = await tx.enrollment.findUnique({ where: { id: enrollmentId }, select: { startDate: true, createdAt: true } });
  const periodStart = last?.periodEnd ?? e.startDate ?? e.createdAt;
  const d = await progressDraftData(tx, enrollmentId, periodStart, now);
  const r = await tx.progressReport.create({
    data: {
      student: { connect: { id: d.studentId } },
      enrollment: { connect: { id: enrollmentId } },
      periodStart,
      periodEnd: now,
      sessionsAttended: d.attended,
      sessionsMissed: d.missed,
      narrative: d.narrative,
      goalsSnapshot: d.goals,
      nextSteps: d.nextSteps,
      status: "draft",
      ...d.tutorId ? { authorTutor: { connect: { id: d.tutorId } } } : {},
      ...actorId ? { author: { connect: { id: actorId } }, createdBy: { connect: { id: actorId } } } : {}
    }
  });
  await recordChange(tx, { type: "ProgressReport", id: r.id, to: "draft", actorId });
  return { id: r.id, created: true };
}
async function draftDueProgressReports(prisma, now = /* @__PURE__ */ new Date()) {
  const settings = await getSettings(prisma);
  const active = await prisma.enrollment.findMany({ where: { status: "active" }, select: { id: true, studentId: true, startDate: true, createdAt: true } });
  let drafted = 0;
  for (const e of active) {
    const last = await prisma.progressReport.findFirst({ where: { enrollmentId: e.id, status: { not: "withdrawn" } }, orderBy: { periodEnd: "desc" }, select: { status: true, periodEnd: true } });
    if (last?.status === "draft") continue;
    const since = last?.periodEnd ?? e.startDate ?? e.createdAt;
    const weeks = (now.getTime() - since.getTime()) / (7 * DAY);
    const sessions = await prisma.booking.count({ where: { studentId: e.studentId, enrollmentId: e.id, status: { in: ["attended", "late"] }, startsAt: { gte: since, lt: now } } });
    if (weeks >= settings.progressReportEveryWeeks || sessions >= settings.progressReportEverySessions) {
      const r = await prisma.$transaction((tx) => draftProgressFor(tx, e.id, null, now), { maxWait: 6e4, timeout: 12e4 });
      if (r.created) drafted += 1;
    }
  }
  return { drafted };
}
async function canWriteForBooking(tx, actor, bookingId) {
  const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { id: true, status: true, studentId: true, familyId: true, sessionId: true, session: { select: { tutorId: true, locationId: true } } } });
  if (!b) throw new CommandError("That booking was not found.");
  const a = requireActor(actor);
  const ownSession = Boolean(a.tutorId && b.session?.tutorId === a.tutorId);
  if (!ownSession && !canAt(a, "canMarkAttendance", b.session?.locationId)) throw new CommandError("You can write reports for your own sessions only.");
  return { booking: b, actor: a };
}
async function progressAccess(tx, actor, reportId) {
  const r = await tx.progressReport.findUnique({ where: { id: reportId }, select: { id: true, status: true, studentId: true, authorTutorId: true, enrollmentId: true, student: { select: { familyId: true, firstName: true, family: { select: { primaryLocationId: true, billingEmail: true } } } } } });
  if (!r) throw new CommandError("That progress report was not found.");
  const a = requireActor(actor);
  const own = Boolean(a.tutorId && r.authorTutorId === a.tutorId);
  if (!own && !canAt(a, "canManageFamilies", r.student?.family?.primaryLocationId)) throw new CommandError("You can only work on your own students\u2019 reports.");
  return { report: r, actor: a };
}
var gql5, keyOf5, EMAIL4, typeDefs5, resolvers5;
var init_families = __esm({
  "features/keystone/mutations/families.ts"() {
    "use strict";
    init_command();
    init_errors();
    init_actor();
    init_assessments();
    init_notify();
    init_settings();
    gql5 = String.raw;
    keyOf5 = (a) => typeof a?.idempotencyKey === "string" ? a.idempotencyKey : null;
    EMAIL4 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    typeDefs5 = gql5`
  type Mutation {
    registerGuardian(data: JSON!, idempotencyKey: String): CommandResult!
    addStudent(data: JSON!, idempotencyKey: String): CommandResult!
    updateStudent(studentId: ID!, data: JSON!, idempotencyKey: String): CommandResult!
    updateFamilyProfile(familyId: ID, data: JSON!, idempotencyKey: String): CommandResult!
    acceptLearningPlan(planId: ID!, idempotencyKey: String): CommandResult!
    declineLearningPlan(planId: ID!, reason: String, idempotencyKey: String): CommandResult!
    acknowledgeProgressReport(reportId: ID!): CommandResult!
    markSessionReportSeen(reportId: ID!): CommandResult!
    proposeLearningPlan(planId: ID, data: JSON, idempotencyKey: String): CommandResult!
    setGoalStatus(goalId: ID!, status: String!, idempotencyKey: String): CommandResult!
    publishSessionReport(bookingId: ID!, data: JSON!, idempotencyKey: String): CommandResult!
    setHomeworkStatus(reportId: ID!, status: String!): CommandResult!
    draftProgressReport(enrollmentId: ID!, idempotencyKey: String): CommandResult!
    publishProgressReport(reportId: ID!, data: JSON, idempotencyKey: String): CommandResult!
    withdrawProgressReport(reportId: ID!, reason: String!, idempotencyKey: String): CommandResult!
    logFamilyContact(familyId: ID!, data: JSON!, idempotencyKey: String): CommandResult!
    recordReview(familyId: ID!, data: JSON!, idempotencyKey: String): CommandResult!
    moderateReview(reviewId: ID!, status: String!, idempotencyKey: String): CommandResult!
    completeTask(taskId: ID!, outcome: String!, dismiss: Boolean, idempotencyKey: String): CommandResult!
  }
`;
    resolvers5 = {
      Mutation: {
        /**
         * Storefront sign-up: Customer user + Family through Keystone (its password field hashes) with
         * the family created and linked in the same write. The storefront then signs in.
         */
        registerGuardian: async (_, args, context) => {
          try {
            if (context.session?.itemId) throw new CommandError("You are already signed in.");
            const d = args.data ?? {};
            const email = requireString(d.email, "Email", 200).toLowerCase();
            if (!EMAIL4.test(email)) throw new CommandError("Enter a valid email address.");
            const name = requireString(d.name, "Your name", 120);
            const password2 = String(d.password ?? "");
            if (password2.length < 8 || password2.length > 200) throw new CommandError("Use a password of at least 8 characters.");
            const phone = optionalString(d.phone, 40);
            const sudo = context.sudo();
            if (await sudo.prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } })) throw new CommandError("That email already has an account. Sign in, or use \u201CForgot password\u201D.");
            let user;
            try {
              user = await sudo.db.User.createOne({ data: { name, email, phone, password: password2, role: { connect: { id: await customerRoleId(sudo.prisma) } }, family: { create: { name: `${name.split(" ").slice(-1)[0] || name} family`, billingEmail: email, phone } } } });
            } catch (error) {
              if (/unique/i.test(String(error?.message))) throw new CommandError("That email already has an account. Sign in, or use \u201CForgot password\u201D.");
              throw error;
            }
            const familyId = (await sudo.prisma.user.findUnique({ where: { id: user.id }, select: { familyId: true } })).familyId;
            await sudo.prisma.changeEvent.create({ data: { aggregateType: "Family", aggregateId: familyId, from: "", to: "active", reason: "guardian registered", data: {}, at: /* @__PURE__ */ new Date(), actor: { connect: { id: user.id } } } });
            return { success: true, error: null, id: user.id, data: { userId: user.id, familyId } };
          } catch (error) {
            if (error instanceof CommandError) return { success: false, error: error.message, id: null, data: null };
            console.error("registerGuardian failed", error?.message);
            return { success: false, error: "Something went wrong. Please try again.", id: null, data: null };
          }
        },
        addStudent: (_, args, context) => runCommand(context, { name: "addStudent", idempotencyKey: keyOf5(args), input: args.data ?? {} }, async (tx, actor) => {
          const d = args.data ?? {};
          let familyId;
          let staff2 = false;
          if (d.familyId && can(actor, "canManageFamilies")) {
            const f = await familyOf(tx, String(d.familyId));
            requireFlag(actor, "canManageFamilies", f.primaryLocationId);
            familyId = f.id;
            staff2 = true;
          } else {
            const f = await tx.family.findFirst({ where: { guardians: { some: { id: requireActor(actor).userId } } }, select: { id: true } });
            if (!f) throw new CommandError("Add your family details first.");
            familyId = f.id;
          }
          const data = studentData({ ...d, firstName: d.firstName ?? "" }, staff2);
          const s = await tx.student.create({ data: { ...data, family: { connect: { id: familyId } }, status: staff2 && d.status ? d.status : "prospect", createdBy: { connect: { id: actor.userId } } }, select: { id: true } });
          await recordChange(tx, { type: "Student", id: s.id, to: "prospect", actorId: actor.userId, reason: staff2 ? "added by staff" : "added by guardian" });
          return { id: s.id, data: { studentId: s.id } };
        }),
        updateStudent: (_, args, context) => runCommand(context, { name: "updateStudent", idempotencyKey: keyOf5(args), input: { s: args.studentId, d: args.data } }, async (tx, actor) => {
          const s = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { id: true, familyId: true, status: true } });
          if (!s) throw new CommandError("That student was not found.");
          const { staff: staff2 } = await familyAccess(tx, actor, s.familyId);
          const data = studentData(args.data ?? {}, staff2);
          if (!Object.keys(data).length) throw new CommandError("Nothing to change.");
          await tx.student.update({ where: { id: s.id }, data });
          await recordChange(tx, { type: "Student", id: s.id, from: s.status, to: data.status ?? s.status, actorId: actor.userId, reason: "details updated", data: { fields: Object.keys(data) } });
          return { id: s.id, data: { studentId: s.id } };
        }),
        updateFamilyProfile: (_, args, context) => runCommand(context, { name: "updateFamilyProfile", idempotencyKey: keyOf5(args), input: { f: args.familyId ?? null, d: args.data } }, async (tx, actor) => {
          const a = requireActor(actor);
          let familyId = args.familyId ? String(args.familyId) : "";
          if (!familyId) {
            const f = await tx.family.findFirst({ where: { guardians: { some: { id: a.userId } } }, select: { id: true } });
            familyId = f?.id ?? (await tx.family.create({ data: { name: `${a.name.split(" ").slice(-1)[0] || a.name} family`, billingEmail: a.email, guardians: { connect: { id: a.userId } }, createdBy: { connect: { id: a.userId } } }, select: { id: true } })).id;
          }
          const { staff: staff2 } = await familyAccess(tx, a, familyId);
          const d = args.data ?? {};
          const data = {};
          for (const k of ["phone", "addressLine1", "addressLine2", "city", "region", "postalCode", "country", "secondGuardianName", "secondGuardianPhone"]) if (d[k] !== void 0) data[k] = optionalString(d[k], 200);
          if (d.name !== void 0) data.name = requireString(d.name, "Family name", 120);
          for (const k of ["billingEmail", "secondGuardianEmail"]) if (d[k] !== void 0) {
            const v = optionalString(d[k], 200).toLowerCase();
            if (v && !EMAIL4.test(v)) throw new CommandError("Enter a valid email address.");
            if (k === "billingEmail" && !v) throw new CommandError("A billing email is needed.");
            data[k] = v;
          }
          if (staff2) {
            if (d.notes !== void 0) data.notes = optionalString(d.notes, 4e3);
            if (d.payAsYouGoAllowed !== void 0) {
              requireFlag(a, "canManageBilling");
              data.payAsYouGoAllowed = Boolean(d.payAsYouGoAllowed);
            }
            if (d.primaryLocationId !== void 0) data.primaryLocation = d.primaryLocationId ? { connect: { id: String(d.primaryLocationId) } } : { disconnect: true };
            if (d.status !== void 0) {
              if (!["active", "inactive"].includes(d.status)) throw new CommandError("Unknown family status.");
              data.status = d.status;
            }
          }
          if (!staff2 && (d.guardianName !== void 0 || d.guardianPhone !== void 0)) {
            await tx.user.update({ where: { id: a.userId }, data: { ...d.guardianName !== void 0 ? { name: requireString(d.guardianName, "Your name", 120) } : {}, ...d.guardianPhone !== void 0 ? { phone: optionalString(d.guardianPhone, 40) } : {} } });
          }
          if (Object.keys(data).length) await tx.family.update({ where: { id: familyId }, data });
          await recordChange(tx, { type: "Family", id: familyId, actorId: a.userId, reason: "profile updated", data: { fields: Object.keys(data) } });
          return { id: familyId, data: { familyId } };
        }),
        acceptLearningPlan: (_, args, context) => runCommand(context, { name: "acceptLearningPlan", idempotencyKey: keyOf5(args), input: { p: args.planId } }, async (tx, actor) => {
          const p = await tx.learningPlan.findUnique({ where: { id: String(args.planId) }, select: { id: true, status: true, programId: true, studentId: true, recommendedPlanId: true, recommendedPackageId: true, student: { select: { familyId: true } } } });
          if (!p) throw new CommandError("That plan was not found.");
          await requireGuardianOf(tx, actor, p.student?.familyId);
          if (p.status === "accepted") return { id: p.id, data: { status: "accepted", programId: p.programId, studentId: p.studentId, recommendedPlanId: p.recommendedPlanId, recommendedPackageId: p.recommendedPackageId } };
          await transition(tx, actor, "learningPlan", "LearningPlan", p.id, "proposed", "accepted", { acceptedAt: /* @__PURE__ */ new Date() }, "guardian accepted");
          return { id: p.id, data: { status: "accepted", programId: p.programId, studentId: p.studentId, recommendedPlanId: p.recommendedPlanId, recommendedPackageId: p.recommendedPackageId } };
        }),
        declineLearningPlan: (_, args, context) => runCommand(context, { name: "declineLearningPlan", idempotencyKey: keyOf5(args), input: { p: args.planId } }, async (tx, actor) => {
          const p = await tx.learningPlan.findUnique({ where: { id: String(args.planId) }, select: { id: true, studentId: true, student: { select: { familyId: true } } } });
          if (!p) throw new CommandError("That plan was not found.");
          await requireGuardianOf(tx, actor, p.student?.familyId);
          await transition(tx, actor, "learningPlan", "LearningPlan", p.id, ["proposed", "accepted"], "declined", { declineReason: optionalString(args.reason, 500) }, "guardian declined");
          const lead = await tx.lead.findFirst({ where: { studentId: p.studentId, status: "proposal_sent" }, select: { id: true } });
          if (lead) await tx.task.upsert({ where: { openKey: `plan-declined:${p.id}` }, create: { kind: "proposal_follow_up", title: "Learning plan declined: call the family", lead: { connect: { id: lead.id } }, student: { connect: { id: p.studentId } }, relatedType: "LearningPlan", relatedId: p.id, dueAt: /* @__PURE__ */ new Date(), openKey: `plan-declined:${p.id}`, outcomeNote: optionalString(args.reason, 500) }, update: {} });
          return { id: p.id, data: { status: "declined" } };
        }),
        acknowledgeProgressReport: (_, args, context) => runCommand(context, { name: "acknowledgeProgressReport", input: { r: args.reportId } }, async (tx, actor) => {
          const r = await tx.progressReport.findUnique({ where: { id: String(args.reportId) }, select: { id: true, status: true, student: { select: { familyId: true } } } });
          if (!r) throw new CommandError("That report was not found.");
          await requireGuardianOf(tx, actor, r.student?.familyId);
          if (r.status === "acknowledged") return { id: r.id, data: { status: "acknowledged" } };
          await transition(tx, actor, "progressReport", "ProgressReport", r.id, "published", "acknowledged", { acknowledgedAt: /* @__PURE__ */ new Date() }, "guardian read it");
          return { id: r.id, data: { status: "acknowledged" } };
        }),
        markSessionReportSeen: (_, args, context) => runCommand(context, { name: "markSessionReportSeen", input: { r: args.reportId } }, async (tx, actor) => {
          const r = await tx.sessionReport.findUnique({ where: { id: String(args.reportId) }, select: { id: true, publishedAt: true, guardianSeenAt: true, booking: { select: { familyId: true } } } });
          if (!r || !r.publishedAt) throw new CommandError("That report was not found.");
          await requireGuardianOf(tx, actor, r.booking?.familyId);
          if (!r.guardianSeenAt) await tx.sessionReport.updateMany({ where: { id: r.id, guardianSeenAt: null }, data: { guardianSeenAt: /* @__PURE__ */ new Date() } });
          return { id: r.id, data: { seen: true } };
        }),
        /** Staff draft (or revise) a plan with goals and propose it to the family (§4.3). */
        proposeLearningPlan: (_, args, context) => runCommand(context, { name: "proposeLearningPlan", idempotencyKey: keyOf5(args), input: { p: args.planId ?? null, d: args.data ?? null } }, async (tx, actor) => {
          const d = args.data ?? {};
          let plan;
          if (args.planId) {
            plan = await tx.learningPlan.findUnique({ where: { id: String(args.planId) }, include: { goals: true, student: { select: { id: true, familyId: true, firstName: true, family: { select: { primaryLocationId: true, billingEmail: true } } } } } });
            if (!plan) throw new CommandError("That plan was not found.");
          }
          const studentId = plan?.studentId ?? (d.studentId ? String(d.studentId) : "");
          const student = plan?.student ?? await tx.student.findUnique({ where: { id: studentId }, select: { id: true, familyId: true, firstName: true, family: { select: { primaryLocationId: true, billingEmail: true } } } });
          if (!student) throw new CommandError("Pick the student.");
          requireFlag(actor, "canManageFamilies", student.family?.primaryLocationId);
          const goals = Array.isArray(d.goals) ? d.goals.slice(0, 20).map((g, i) => ({ title: requireString(g?.title, "Goal", 200), skill: optionalString(g?.skill, 120), baseline: optionalString(g?.baseline, 200), target: optionalString(g?.target, 200), sortOrder: i })) : null;
          const fields = {};
          if (d.summary !== void 0) fields.summary = optionalString(d.summary, 4e3);
          if (d.sessionsPerWeek !== void 0) fields.sessionsPerWeek = requireInt(d.sessionsPerWeek, "Sessions a week", 1, 7);
          if (d.totalHours !== void 0 && d.totalHours !== null) fields.totalHours = requireInt(d.totalHours, "Total hours", 1, 1e3);
          if (d.startDate) fields.startDate = new Date(String(d.startDate));
          if (d.targetDate) fields.targetDate = new Date(String(d.targetDate));
          for (const [k, rel] of [["programId", "program"], ["subjectId", "subject"], ["recommendedPlanId", "recommendedPlan"], ["recommendedPackageId", "recommendedPackage"], ["baselineAssessmentId", "baselineAssessment"]]) {
            if (d[k] !== void 0) fields[rel] = d[k] ? { connect: { id: String(d[k]) } } : plan ? { disconnect: true } : void 0;
            if (fields[rel] === void 0) delete fields[rel];
          }
          const now = /* @__PURE__ */ new Date();
          let id;
          if (plan && ["active", "accepted"].includes(plan.status)) {
            await transition(tx, actor, "learningPlan", "LearningPlan", plan.id, plan.status, "archived", {}, "revised");
            const next = await tx.learningPlan.create({
              data: {
                student: { connect: { id: student.id } },
                version: (plan.version ?? 1) + 1,
                status: "proposed",
                proposedAt: now,
                previousVersion: { connect: { id: plan.id } },
                summary: plan.summary,
                sessionsPerWeek: plan.sessionsPerWeek,
                totalHours: plan.totalHours,
                startDate: plan.startDate,
                targetDate: plan.targetDate,
                ...plan.programId ? { program: { connect: { id: plan.programId } } } : {},
                ...plan.subjectId ? { subject: { connect: { id: plan.subjectId } } } : {},
                ...plan.recommendedPlanId ? { recommendedPlan: { connect: { id: plan.recommendedPlanId } } } : {},
                ...plan.recommendedPackageId ? { recommendedPackage: { connect: { id: plan.recommendedPackageId } } } : {},
                ...plan.baselineAssessmentId ? { baselineAssessment: { connect: { id: plan.baselineAssessmentId } } } : {},
                ...fields,
                createdBy: { connect: { id: actor.userId } }
              }
            });
            const source = goals ?? plan.goals.map((g) => ({ title: g.title, skill: g.skill, baseline: g.baseline, target: g.target, sortOrder: g.sortOrder, status: g.status, masteredAt: g.masteredAt }));
            for (const g of source) await tx.planGoal.create({ data: { ...g, plan: { connect: { id: next.id } } } });
            await tx.enrollment.updateMany({ where: { planId: plan.id }, data: { planId: next.id } });
            await recordChange(tx, { type: "LearningPlan", id: next.id, to: "proposed", actorId: actor.userId, reason: `version ${next.version}` });
            id = next.id;
          } else if (plan) {
            if (!["draft", "proposed", "declined"].includes(plan.status)) throw new CommandError(`This plan is ${plan.status}; it cannot be proposed.`);
            if (Object.keys(fields).length) await tx.learningPlan.update({ where: { id: plan.id }, data: fields });
            if (goals) {
              await tx.planGoal.deleteMany({ where: { planId: plan.id } });
              for (const g of goals) await tx.planGoal.create({ data: { ...g, plan: { connect: { id: plan.id } } } });
            }
            if (plan.status !== "proposed") await transition(tx, actor, "learningPlan", "LearningPlan", plan.id, plan.status, "proposed", { proposedAt: now, declineReason: "" }, "proposed");
            id = plan.id;
          } else {
            if (!goals?.length) throw new CommandError("Add at least one goal.");
            const created = await tx.learningPlan.create({ data: { student: { connect: { id: student.id } }, version: 1, status: "proposed", proposedAt: now, ...fields, createdBy: { connect: { id: actor.userId } } } });
            for (const g of goals) await tx.planGoal.create({ data: { ...g, plan: { connect: { id: created.id } } } });
            await recordChange(tx, { type: "LearningPlan", id: created.id, to: "proposed", actorId: actor.userId });
            id = created.id;
          }
          const final = await tx.learningPlan.findUnique({ where: { id }, select: { programId: true, goals: { select: { id: true } } } });
          if (!final.programId) throw new CommandError("Pick the programme this plan is for.");
          if (!final.goals.length) throw new CommandError("Add at least one goal.");
          const lead = await tx.lead.findFirst({ where: { studentId: student.id, status: { in: ["assessed", "assessment_booked", "contacted", "new"] } }, select: { id: true, status: true } });
          if (lead) await transition(tx, actor, "lead", "Lead", lead.id, lead.status, "proposal_sent", { lastContactedAt: now }, "plan proposed");
          await queueEmail(tx, { to: student.family?.billingEmail ?? "", template: "plan_proposed", subject: `A learning plan for ${student.firstName} is ready`, relatedType: "LearningPlan", relatedId: id });
          return { id, data: { planId: id } };
        }),
        setGoalStatus: (_, args, context) => runCommand(context, { name: "setGoalStatus", idempotencyKey: keyOf5(args), input: { g: args.goalId, s: args.status } }, async (tx, actor) => {
          const g = await tx.planGoal.findUnique({ where: { id: String(args.goalId) }, select: { id: true, status: true, plan: { select: { studentId: true, student: { select: { family: { select: { primaryLocationId: true } } } } } } } });
          if (!g) throw new CommandError("That goal was not found.");
          const a = requireActor(actor);
          const assigned = a.tutorId ? await tx.student.count({ where: { id: g.plan.studentId, OR: [{ enrolments: { some: { tutorId: a.tutorId } } }, { bookings: { some: { session: { tutorId: a.tutorId } } } }] } }) : 0;
          if (!assigned && !canAt(a, "canManageFamilies", g.plan.student?.family?.primaryLocationId)) throw new CommandError("Only the student\u2019s tutor or a manager can move goals.");
          if (!["not_started", "in_progress", "mastered"].includes(args.status)) throw new CommandError("Unknown goal status.");
          if (g.status === args.status) return { id: g.id, data: { status: g.status } };
          await transition(tx, a, "planGoal", "PlanGoal", g.id, g.status, args.status, { masteredAt: args.status === "mastered" ? /* @__PURE__ */ new Date() : null });
          return { id: g.id, data: { status: args.status } };
        }),
        /** Tutor writes and publishes the report for one student's seat; guardian sees it at once (D12). */
        publishSessionReport: (_, args, context) => runCommand(context, { name: "publishSessionReport", idempotencyKey: keyOf5(args), input: { b: args.bookingId, d: args.data } }, async (tx, actor) => {
          const { booking, actor: a } = await canWriteForBooking(tx, actor, String(args.bookingId));
          if (!["attended", "late"].includes(booking.status)) throw new CommandError("Mark the student attended before writing the report.");
          const d = args.data ?? {};
          const data = {
            topicsCovered: requireString(d.topicsCovered, "What we covered", 2e3),
            wentWell: optionalString(d.wentWell, 2e3),
            toImprove: optionalString(d.toImprove, 2e3),
            homework: optionalString(d.homework, 2e3),
            homeworkDueAt: d.homeworkDueAt ? new Date(String(d.homeworkDueAt)) : null,
            homeworkStatus: optionalString(d.homework, 10) ? "set" : null,
            effort: d.effort != null && d.effort !== "" ? requireInt(d.effort, "Effort", 1, 5) : null,
            staffNote: optionalString(d.staffNote, 2e3)
          };
          const publish = d.publish !== false;
          const existing = await tx.sessionReport.findFirst({ where: { bookingId: booking.id }, select: { id: true, publishedAt: true } });
          const now = /* @__PURE__ */ new Date();
          const session = await tx.session.findUnique({ where: { id: booking.sessionId }, select: { tutorId: true } });
          let id;
          if (existing) {
            await tx.sessionReport.update({ where: { id: existing.id }, data: { ...data, ...publish && !existing.publishedAt ? { publishedAt: now } : {} } });
            id = existing.id;
          } else {
            const r = await tx.sessionReport.create({ data: { ...data, booking: { connect: { id: booking.id } }, session: { connect: { id: booking.sessionId } }, student: { connect: { id: booking.studentId } }, ...session?.tutorId ? { tutor: { connect: { id: session.tutorId } } } : {}, publishedAt: publish ? now : null, createdBy: { connect: { id: a.userId } } } });
            id = r.id;
          }
          await recordChange(tx, { type: "SessionReport", id, to: publish ? "published" : "draft", actorId: a.userId });
          if (publish && !existing?.publishedAt) {
            const fam = await tx.family.findUnique({ where: { id: booking.familyId }, select: { billingEmail: true } });
            await queueEmail(tx, { to: fam?.billingEmail ?? "", template: "session_report", subject: "A new session report is in your account", relatedType: "SessionReport", relatedId: id });
          }
          return { id, data: { reportId: id, published: publish } };
        }),
        setHomeworkStatus: (_, args, context) => runCommand(context, { name: "setHomeworkStatus", input: { r: args.reportId, s: args.status } }, async (tx, actor) => {
          const r = await tx.sessionReport.findUnique({ where: { id: String(args.reportId) }, select: { id: true, bookingId: true, homeworkStatus: true, studentId: true } });
          if (!r?.bookingId) throw new CommandError("That report was not found.");
          const a = requireActor(actor);
          const teaches = a.tutorId ? await tx.booking.count({ where: { studentId: r.studentId, session: { tutorId: a.tutorId } } }) : 0;
          if (!teaches) await canWriteForBooking(tx, a, r.bookingId);
          if (!["set", "done", "not_done"].includes(args.status)) throw new CommandError("Unknown homework status.");
          await tx.sessionReport.update({ where: { id: r.id }, data: { homeworkStatus: args.status } });
          await recordChange(tx, { type: "SessionReport", id: r.id, from: r.homeworkStatus ?? "", to: args.status, actorId: a.userId, reason: "homework" });
          return { id: r.id, data: { homeworkStatus: args.status } };
        }),
        draftProgressReport: (_, args, context) => runCommand(context, { name: "draftProgressReport", idempotencyKey: keyOf5(args), input: { e: args.enrollmentId } }, async (tx, actor) => {
          const e = await tx.enrollment.findUnique({ where: { id: String(args.enrollmentId) }, select: { id: true, tutorId: true, status: true, family: { select: { primaryLocationId: true } }, locationId: true } });
          if (!e) throw new CommandError("That enrolment was not found.");
          const a = requireActor(actor);
          if (!(a.tutorId && e.tutorId === a.tutorId) && !canAt(a, "canManageFamilies", e.locationId ?? e.family?.primaryLocationId)) throw new CommandError("You can draft reports for your own students only.");
          const r = await draftProgressFor(tx, e.id, a.userId);
          return { id: r.id, data: { reportId: r.id, created: r.created } };
        }),
        publishProgressReport: (_, args, context) => runCommand(context, { name: "publishProgressReport", idempotencyKey: keyOf5(args), input: { r: args.reportId, d: args.data ?? null } }, async (tx, actor) => {
          const { report, actor: a } = await progressAccess(tx, actor, String(args.reportId));
          const d = args.data ?? {};
          const edits = {};
          if (d.narrative !== void 0) edits.narrative = requireString(d.narrative, "Narrative", 8e3);
          if (d.nextSteps !== void 0) edits.nextSteps = optionalString(d.nextSteps, 4e3);
          if (report.status === "published" || report.status === "acknowledged") return { id: report.id, data: { status: report.status } };
          await transition(tx, a, "progressReport", "ProgressReport", report.id, "draft", "published", { ...edits, publishedAt: /* @__PURE__ */ new Date(), authorId: a.userId });
          await queueEmail(tx, { to: report.student?.family?.billingEmail ?? "", template: "progress_report", subject: `${report.student?.firstName ?? "Your child"}\u2019s progress report is ready`, relatedType: "ProgressReport", relatedId: report.id });
          return { id: report.id, data: { status: "published" } };
        }),
        withdrawProgressReport: (_, args, context) => runCommand(context, { name: "withdrawProgressReport", idempotencyKey: keyOf5(args), input: { r: args.reportId } }, async (tx, actor) => {
          const r = await tx.progressReport.findUnique({ where: { id: String(args.reportId) }, select: { id: true, student: { select: { family: { select: { primaryLocationId: true } } } } } });
          if (!r) throw new CommandError("That report was not found.");
          requireFlag(actor, "canManageFamilies", r.student?.family?.primaryLocationId);
          const reason = requireString(args.reason, "Reason", 500);
          await transition(tx, actor, "progressReport", "ProgressReport", r.id, ["published", "acknowledged"], "withdrawn", { withdrawReason: reason }, reason);
          return { id: r.id, data: { status: "withdrawn" } };
        }),
        /** Staff log a call, email or visit on the family timeline (§6.3: replaces portal messaging). */
        logFamilyContact: (_, args, context) => runCommand(context, { name: "logFamilyContact", idempotencyKey: keyOf5(args), input: { f: args.familyId, d: args.data } }, async (tx, actor) => {
          const f = await familyOf(tx, String(args.familyId));
          const a = requireFlag(actor, "canManageFamilies", f.primaryLocationId);
          const d = args.data ?? {};
          const channel = String(d.channel ?? "phone");
          if (!["email", "phone", "in_person", "sms"].includes(channel)) throw new CommandError("Pick how you were in touch.");
          const direction = String(d.direction ?? "outbound");
          if (!["outbound", "inbound", "internal"].includes(direction)) throw new CommandError("Pick who got in touch.");
          const m = await tx.message.create({ data: { family: { connect: { id: f.id } }, sender: { connect: { id: a.userId } }, direction, channel, subject: optionalString(d.subject, 200), body: requireString(d.body, "Note", 4e3), visibleToFamily: false, threadKey: `family:${f.id}`, createdBy: { connect: { id: a.userId } } } });
          const leads = await tx.lead.findMany({ where: { familyId: f.id, status: { notIn: ["enrolled", "lost"] } }, select: { id: true, status: true } });
          for (const l of leads) {
            await tx.lead.update({ where: { id: l.id }, data: { lastContactedAt: /* @__PURE__ */ new Date(), ...d.nextFollowUpAt ? { nextFollowUpAt: new Date(String(d.nextFollowUpAt)) } : {} } });
            if (l.status === "new") await transition(tx, a, "lead", "Lead", l.id, "new", "contacted", {}, `contact logged (${channel})`);
          }
          if (d.taskId) {
            const t = await tx.task.findUnique({ where: { id: String(d.taskId) }, select: { id: true, status: true, familyId: true } });
            if (t?.familyId === f.id && t.status === "open") await transition(tx, a, "task", "Task", t.id, "open", "done", { openKey: null, completedAt: /* @__PURE__ */ new Date(), completedById: a.userId, outcomeNote: requireString(d.body, "Note", 4e3).slice(0, 1e3) }, "contact logged");
          }
          await recordChange(tx, { type: "Family", id: f.id, actorId: a.userId, reason: `contact: ${channel} ${direction}`, data: { messageId: m.id } });
          return { id: m.id, data: { messageId: m.id } };
        }),
        /** Staff record a family's review (email, phone, survey); it shows on the storefront once published. */
        recordReview: (_, args, context) => runCommand(context, { name: "recordReview", idempotencyKey: keyOf5(args), input: { f: args.familyId, d: args.data } }, async (tx, actor) => {
          const f = await familyOf(tx, String(args.familyId));
          const a = requireFlag(actor, "canManageFamilies", f.primaryLocationId);
          const d = args.data ?? {};
          const rating = requireInt(d.rating, "Rating", 1, 5);
          const source = String(d.source ?? "email");
          if (!["email", "phone", "in_person", "survey", "other"].includes(source)) throw new CommandError("Pick where the review came from.");
          if (!d.tutorId && !d.locationId && !d.programId) throw new CommandError("Pick the tutor, location or programme the review is about.");
          if (d.tutorId) {
            const taught = await tx.booking.count({ where: { familyId: f.id, session: { tutorId: String(d.tutorId) } } }) + await tx.enrollment.count({ where: { familyId: f.id, tutorId: String(d.tutorId) } });
            if (!taught) throw new CommandError("That tutor has not taught this family.");
          }
          const r = await tx.review.create({
            data: {
              family: { connect: { id: f.id } },
              authorName: requireString(d.authorName ?? f.name, "Name shown", 120),
              rating,
              text: optionalString(d.text, 4e3),
              source,
              status: "pending",
              ...d.tutorId ? { tutor: { connect: { id: String(d.tutorId) } } } : {},
              ...d.locationId ? { location: { connect: { id: String(d.locationId) } } } : {},
              ...d.programId ? { program: { connect: { id: String(d.programId) } } } : {},
              recordedBy: { connect: { id: a.userId } },
              createdBy: { connect: { id: a.userId } }
            }
          });
          await recordChange(tx, { type: "Review", id: r.id, to: "pending", actorId: a.userId });
          return { id: r.id, data: { reviewId: r.id, status: "pending" } };
        }),
        moderateReview: (_, args, context) => runCommand(context, { name: "moderateReview", idempotencyKey: keyOf5(args), input: { r: args.reviewId, s: args.status } }, async (tx, actor) => {
          requireFlag(actor, "canManageSettings");
          if (!["published", "hidden"].includes(args.status)) throw new CommandError("Publish or hide.");
          const r = await tx.review.findUnique({ where: { id: String(args.reviewId) }, select: { id: true, status: true } });
          if (!r) throw new CommandError("That review was not found.");
          if (r.status === args.status) return { id: r.id, data: { status: r.status } };
          await transition(tx, actor, "review", "Review", r.id, r.status, args.status);
          return { id: r.id, data: { status: args.status } };
        }),
        completeTask: (_, args, context) => runCommand(context, { name: "completeTask", idempotencyKey: keyOf5(args), input: { t: args.taskId, o: args.outcome, d: Boolean(args.dismiss) } }, async (tx, actor) => {
          const t = await tx.task.findUnique({ where: { id: String(args.taskId) }, select: { id: true, status: true, locationId: true, ownerId: true, family: { select: { primaryLocationId: true } } } });
          if (!t) throw new CommandError("That task was not found.");
          const a = requireActor(actor);
          if (t.ownerId !== a.userId && !canAt(a, "canAccessDashboard", t.locationId ?? t.family?.primaryLocationId)) throw new CommandError("That task is not yours.");
          const to = args.dismiss ? "dismissed" : "done";
          await transition(tx, a, "task", "Task", t.id, "open", to, { openKey: null, completedAt: /* @__PURE__ */ new Date(), completedById: a.userId, outcomeNote: requireString(args.outcome, "Outcome", 1e3) });
          return { id: t.id, data: { status: to } };
        })
      }
    };
  }
});

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
init_access();

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
init_access();
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
init_access();
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
init_access();
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
init_access();
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
init_access();
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
init_access();
var Task = (0, import_core8.list)({
  access: scopedAccess({ read: "canAccessDashboard", write: "canAccessDashboard", location: "location", noDelete: true }),
  ui: { listView: { initialColumns: ["kind", "family", "student", "dueAt", "status", "owner"] } },
  fields: {
    kind: choice(["no_show_follow_up", "absence_streak", "low_balance", "failed_payment", "assessment_follow_up", "proposal_follow_up", "first_week_check_in", "membership_ending", "credential_expiring", "needs_cover", "rematch_requested", "pause_requested", "cancel_requested", "lead_follow_up", "billing_review", "schedule_problem", "manual"], "manual"),
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
init_access();

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
init_access();
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
init_command();
init_errors();
init_actor();
init_booking();
init_ledger();
init_pay();
init_schedule();
init_settings();
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

// features/keystone/mutations/assessments.ts
var assessments_exports = {};
__export(assessments_exports, {
  advanceLead: () => advanceLead,
  resolvers: () => resolvers2,
  typeDefs: () => typeDefs2
});
init_command();
init_errors();
init_actor();
init_assessments();
init_invoices();
init_settings();

// features/keystone/lib/fees.ts
init_payments();
async function settleAssessmentFee(tx, actor, a, decision) {
  if (!a.invoiceId || !a.fee) return { action: "none", refundIds: [] };
  const invoice = await tx.invoice.findUnique({ where: { id: a.invoiceId }, select: { id: true, status: true, amountPaid: true, payments: { where: { status: { in: ["captured", "partially_refunded"] } }, select: { id: true, amount: true, refundedAmount: true } } } });
  if (!invoice) return { action: "none", refundIds: [] };
  if (!invoice.amountPaid) {
    await voidInvoiceIfUnpaid(tx, invoice.id, "Assessment cancelled before payment", actor?.userId);
    return { action: "voided", refundIds: [] };
  }
  if (decision === "keep") return { action: "kept", refundIds: [] };
  const refundIds = [];
  for (const p of invoice.payments) {
    const left = p.amount - (p.refundedAmount ?? 0);
    if (left <= 0) continue;
    const refund = await requestRefund(tx, { paymentId: p.id, amount: left, reason: "Assessment cancelled: fee refunded", actorId: actor?.userId, key: `assessment-refund:${a.id}:${p.id}` });
    refundIds.push(refund.id);
  }
  await tx.assessment.update({ where: { id: a.id }, data: { feeRefunded: true } });
  return { action: "refunded", refundIds };
}

// features/keystone/mutations/assessments.ts
init_payments();

// features/keystone/lib/accounts.ts
var import_node_crypto5 = require("node:crypto");
init_errors();
init_command();
init_assessments();
init_actor();
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function guardianForCommand(tx, actor, input, locationId, reason) {
  if (actor) {
    const familyId = await guardianFamily(tx, actor, true);
    return { userId: actor.userId, name: actor.name, email: actor.email, phone: "", isNew: false, familyId };
  }
  if (!input) throw new CommandError("Enter your name and email.");
  const email = requireString(input.email, "Email", 200).toLowerCase();
  if (!EMAIL.test(email)) throw new CommandError("Enter a valid email address.");
  const name = requireString(input.name, "Your name", 120);
  const phone = optionalString(input.phone, 40);
  await lockKey(tx, `signup:${email}`);
  const taken = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (taken) throw new CommandError("That email already has an account. Sign in to continue, or use \u201CForgot password\u201D.");
  const user = await tx.user.create({ data: { name, email, phone, password: (0, import_node_crypto5.randomBytes)(24).toString("base64url"), role: { connect: { id: await customerRoleId(tx) } } }, select: { id: true } });
  const family = await tx.family.create({
    data: { name: `${name.split(" ").slice(-1)[0] || name} family`, billingEmail: email, phone, guardians: { connect: { id: user.id } }, ...locationId ? { primaryLocation: { connect: { id: locationId } } } : {} },
    select: { id: true }
  });
  await recordChange(tx, { type: "Family", id: family.id, to: "active", actorId: user.id, reason });
  return { userId: user.id, name, email, phone, isNew: true, familyId: family.id };
}
async function studentForCommand(tx, guardian, studentId, student) {
  if (studentId) {
    const s = await tx.student.findUnique({ where: { id: String(studentId) }, select: { id: true, familyId: true } });
    if (!s || s.familyId !== guardian.familyId) throw new CommandError("That student was not found.");
    return s.id;
  }
  if (!student) throw new CommandError("Enter the student\u2019s name.");
  const created = await tx.student.create({
    data: {
      family: { connect: { id: guardian.familyId } },
      firstName: requireString(student.firstName, "Student first name", 80),
      lastName: optionalString(student.lastName, 80) || guardian.name.split(" ").slice(-1)[0] || "",
      school: optionalString(student.school, 160),
      ...student.levelId ? { level: { connect: { id: String(student.levelId) } } } : {},
      status: "prospect",
      createdBy: { connect: { id: guardian.userId } }
    },
    select: { id: true }
  });
  return created.id;
}
async function welcomeNewGuardian(context, guardian, label2) {
  if (!guardian.isNew) return;
  try {
    await context.sudo().graphql.run({ query: "mutation($e: String!) { sendUserPasswordResetLink(email: $e) }", variables: { e: guardian.email } });
  } catch (error) {
    console.error(`${label2}: password link not sent`, error?.message);
  }
  if (context.sessionStrategy && context.res) {
    try {
      await context.sessionStrategy.start({ data: { listKey: "User", itemId: guardian.userId }, context });
    } catch (error) {
      console.error(`${label2}: sign-in failed`, error?.message);
    }
  }
}

// features/keystone/mutations/assessments.ts
var gql2 = String.raw;
var typeDefs2 = gql2`
  input AssessmentGuardianInput { name: String!, email: String!, phone: String }
  input AssessmentStudentInput { firstName: String!, lastName: String, levelId: ID, school: String }

  type Mutation {
    submitEnquiry(data: JSON!, idempotencyKey: String): CommandResult!
    bookAssessment(
      programId: ID!, mode: String!, locationId: ID, startsAt: String!, tutorId: ID!, subjectId: ID,
      studentId: ID, student: AssessmentStudentInput, guardian: AssessmentGuardianInput, notes: String, idempotencyKey: String
    ): CommandResult!
    staffBookAssessment(
      familyId: ID!, studentId: ID!, programId: ID!, mode: String!, locationId: ID, startsAt: String!, tutorId: ID!,
      subjectId: ID, kind: String, minutes: Int, waiveFee: Boolean, idempotencyKey: String
    ): CommandResult!
    cancelAssessment(assessmentId: ID!, reason: String, idempotencyKey: String): CommandResult!
    rescheduleAssessment(assessmentId: ID!, startsAt: String!, tutorId: ID!, idempotencyKey: String): CommandResult!
    startAssessment(assessmentId: ID!, idempotencyKey: String): CommandResult!
    markAssessmentNoShow(assessmentId: ID!, idempotencyKey: String): CommandResult!
    completeAssessment(assessmentId: ID!, summary: String, recommendation: String, results: JSON, recommendedPlanId: ID, recommendedPackageId: ID, recommendedSessionsPerWeek: Int, idempotencyKey: String): CommandResult!
    transitionLead(leadId: ID!, to: String!, reason: String, idempotencyKey: String): CommandResult!
  }
`;
var keyOf2 = (a) => typeof a?.idempotencyKey === "string" ? a.idempotencyKey : null;
var EMAIL2 = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var OPEN_LEAD = ["new", "contacted", "assessment_booked", "assessed", "proposal_sent"];
async function advanceLead(tx, leadId, to, actorId) {
  if (!leadId) return;
  const order = ["new", "contacted", "assessment_booked", "assessed", "proposal_sent", "enrolled"];
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!lead || !order.includes(lead.status) || order.indexOf(lead.status) >= order.indexOf(to)) return;
  const r = await tx.lead.updateMany({ where: { id: leadId, status: lead.status }, data: { status: to } });
  if (r.count) await recordChange(tx, { type: "Lead", id: leadId, from: lead.status, to, actorId, reason: "system" });
}
async function findOrCreateLead(tx, input) {
  const existing = await tx.lead.findFirst({ where: { OR: [{ familyId: input.familyId }, { email: { equals: input.email, mode: "insensitive" } }], status: { in: OPEN_LEAD } }, orderBy: { createdAt: "desc" }, select: { id: true, familyId: true } });
  if (existing) {
    if (!existing.familyId) await tx.lead.update({ where: { id: existing.id }, data: { family: { connect: { id: input.familyId } }, student: { connect: { id: input.studentId } } } });
    return existing.id;
  }
  const lead = await tx.lead.create({
    data: {
      guardianName: input.guardianName,
      email: input.email,
      phone: input.phone,
      studentName: input.studentName,
      program: { connect: { id: input.programId } },
      ...input.locationId ? { location: { connect: { id: input.locationId } } } : {},
      ...input.subjectId ? { subjects: { connect: [{ id: input.subjectId }] } } : {},
      ...input.levelId ? { level: { connect: { id: input.levelId } } } : {},
      preferredMode: input.mode,
      source: "website",
      status: "new",
      message: input.message ?? "",
      family: { connect: { id: input.familyId } },
      student: { connect: { id: input.studentId } },
      ...input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}
    },
    select: { id: true }
  });
  await recordChange(tx, { type: "Lead", id: lead.id, to: "new", actorId: input.actorId });
  return lead.id;
}
async function createAssessmentRow(tx, input) {
  const { slot } = input;
  let assessment;
  try {
    assessment = await tx.assessment.create({
      data: {
        student: { connect: { id: input.studentId } },
        family: { connect: { id: input.familyId } },
        program: { connect: { id: slot.program.id } },
        ...input.subjectId ? { subject: { connect: { id: input.subjectId } } } : {},
        ...slot.location ? { location: { connect: { id: slot.location.id } } } : {},
        ...slot.roomId ? { room: { connect: { id: slot.roomId } } } : {},
        assessor: { connect: { id: slot.tutor.id } },
        ...input.leadId ? { lead: { connect: { id: input.leadId } } } : {},
        mode: input.mode,
        kind: input.kind ?? "initial",
        scheduledAt: slot.startsAt,
        minutes: slot.minutes,
        status: "scheduled",
        slotKey: slot.slotKey,
        fee: input.fee,
        ...input.actorId ? { createdBy: { connect: { id: input.actorId } } } : {}
      },
      select: { id: true }
    });
  } catch (error) {
    if (error?.code === "P2002") throw new CommandError(SLOT_TAKEN);
    throw error;
  }
  await recordChange(tx, { type: "Assessment", id: assessment.id, to: "scheduled", actorId: input.actorId, data: { startsAt: slot.startsAt.toISOString(), assessor: slot.tutor.id } });
  let invoiceId = null;
  if (input.fee > 0) {
    const invoice = await createInvoice(tx, {
      familyId: input.familyId,
      locationId: slot.location?.id ?? null,
      kind: "assessment",
      actorId: input.actorId,
      lines: [{ description: `Assessment: ${slot.program.name}`, kind: "assessment", unitAmount: input.fee, studentId: input.studentId, programId: slot.program.id, assessmentId: assessment.id }],
      fulfilment: { kind: "assessment", assessmentId: assessment.id }
    });
    invoiceId = invoice.id;
    await tx.assessment.update({ where: { id: assessment.id }, data: { invoice: { connect: { id: invoice.id } } } });
  }
  return { id: assessment.id, invoiceId };
}
async function assessmentFor(tx, actor, id) {
  const a = await tx.assessment.findUnique({ where: { id }, select: { id: true, status: true, familyId: true, locationId: true, scheduledAt: true, minutes: true, programId: true, mode: true, assessorId: true, leadId: true, invoiceId: true, fee: true } });
  if (!a) throw new CommandError("That assessment was not found.");
  const staff2 = canAt(actor, "canManageLeads", a.locationId);
  if (!staff2) await requireGuardianOf(tx, actor, a.familyId);
  return { a, staff: staff2 };
}
var resolvers2 = {
  Mutation: {
    /** W1 "Find a tutor" / general enquiry: a Lead only. */
    submitEnquiry: (_, args, context) => runCommand(context, { name: "submitEnquiry", input: args.data, idempotencyKey: keyOf2(args), allowAnonymous: true }, async (tx, actor) => {
      const d = args.data || {};
      const email = requireString(d.email, "Email", 200).toLowerCase();
      if (!EMAIL2.test(email)) throw new CommandError("Enter a valid email address.");
      const lead = await tx.lead.create({
        data: {
          guardianName: requireString(d.guardianName ?? d.name, "Your name", 120),
          email,
          phone: optionalString(d.phone, 40),
          studentName: optionalString(d.studentName, 120),
          message: optionalString(d.message, 3e3),
          preferredTimes: optionalString(d.preferredTimes, 500),
          area: optionalString(d.area, 200),
          intent: d.intent === "request_tutor" ? "request_tutor" : "enquiry",
          preferredMode: ["in_centre", "online", "in_home"].includes(d.mode) ? d.mode : null,
          ...d.programId ? { program: { connect: { id: String(d.programId) } } } : {},
          ...d.locationId ? { location: { connect: { id: String(d.locationId) } } } : {},
          ...d.levelId ? { level: { connect: { id: String(d.levelId) } } } : {},
          ...Array.isArray(d.subjectIds) && d.subjectIds.length ? { subjects: { connect: d.subjectIds.slice(0, 10).map((id) => ({ id: String(id) })) } } : {},
          ...actor?.familyId ? { family: { connect: { id: actor.familyId } } } : {},
          source: "website",
          status: "new"
        },
        select: { id: true }
      });
      await recordChange(tx, { type: "Lead", id: lead.id, to: "new", actorId: actor?.userId ?? null });
      return { id: lead.id };
    }),
    bookAssessment: (_, args, context) => runCommand(context, {
      name: "bookAssessment",
      input: { p: args.programId, m: args.mode, l: args.locationId ?? null, s: args.startsAt, t: args.tutorId, st: args.studentId ?? args.student ?? null, g: args.guardian?.email ?? null },
      idempotencyKey: keyOf2(args),
      allowAnonymous: true,
      conflictMessage: SLOT_TAKEN
    }, async (tx, actor) => {
      const startsAt = requireDate(args.startsAt, "Time");
      const mode = String(args.mode);
      const locationId = mode === "in_centre" ? args.locationId ? String(args.locationId) : null : null;
      const guardian = await guardianForCommand(tx, actor, args.guardian, locationId, "assessment booking");
      const familyId = guardian.familyId;
      const studentId = await studentForCommand(tx, guardian, args.studentId, args.student);
      const slot = await holdAssessmentSlot(tx, { programId: String(args.programId), locationId, mode, startsAt, tutorId: String(args.tutorId) });
      const student = await tx.student.findUnique({ where: { id: studentId }, select: { firstName: true, lastName: true, levelId: true } });
      const leadId = await findOrCreateLead(tx, {
        email: guardian.email,
        guardianName: guardian.name,
        phone: guardian.phone,
        studentName: `${student.firstName} ${student.lastName}`.trim(),
        programId: slot.program.id,
        locationId,
        mode,
        familyId,
        studentId,
        subjectId: args.subjectId ? String(args.subjectId) : null,
        levelId: student.levelId,
        message: optionalString(args.notes, 2e3),
        actorId: guardian.userId
      });
      const created = await createAssessmentRow(tx, { slot, familyId, studentId, subjectId: args.subjectId ? String(args.subjectId) : null, leadId, fee: slot.program.assessmentFee || 0, actorId: guardian.userId, mode });
      await advanceLead(tx, leadId, "assessment_booked", guardian.userId);
      await tx.notificationLog.create({ data: { recipient: guardian.email, template: "assessment_booked", subject: `Assessment booked: ${slot.program.name}`, relatedType: "Assessment", relatedId: created.id, status: "queued" } });
      const data = {
        assessmentId: created.id,
        familyId,
        studentId,
        leadId,
        invoiceId: created.invoiceId,
        fee: slot.program.assessmentFee || 0,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        timezone: slot.timezone,
        assessor: slot.tutor.displayName,
        location: slot.location ? { id: slot.location.id, name: slot.location.name } : null,
        newAccount: guardian.isNew,
        signedIn: Boolean(actor)
      };
      return {
        id: created.id,
        data,
        after: () => welcomeNewGuardian(context, guardian, "bookAssessment")
      };
    }),
    staffBookAssessment: (_, args, context) => runCommand(context, { name: "staffBookAssessment", input: args, idempotencyKey: keyOf2(args), conflictMessage: SLOT_TAKEN }, async (tx, actor) => {
      const mode = String(args.mode);
      const locationId = mode === "in_centre" ? args.locationId ? String(args.locationId) : null : null;
      requireFlag(actor, "canManageLeads", locationId);
      const student = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { id: true, familyId: true, firstName: true, lastName: true, levelId: true } });
      if (!student || student.familyId !== String(args.familyId)) throw new CommandError("That student is not in this family.");
      const kind = ["initial", "re_assessment", "parent_meeting"].includes(args.kind) ? args.kind : "initial";
      const slot = await holdAssessmentSlot(tx, { programId: String(args.programId), locationId, mode, startsAt: requireDate(args.startsAt, "Time"), tutorId: String(args.tutorId), minutes: args.minutes ?? void 0, staff: true });
      const guardianUser = await tx.user.findFirst({ where: { familyId: student.familyId }, select: { name: true, email: true, phone: true } });
      const leadId = kind === "initial" && guardianUser ? await findOrCreateLead(tx, { email: guardianUser.email, guardianName: guardianUser.name, phone: guardianUser.phone, studentName: `${student.firstName} ${student.lastName}`, programId: slot.program.id, locationId, mode, familyId: student.familyId, studentId: student.id, levelId: student.levelId, actorId: actor.userId }) : null;
      const fee = args.waiveFee || kind !== "initial" ? 0 : slot.program.assessmentFee || 0;
      const created = await createAssessmentRow(tx, { slot, familyId: student.familyId, studentId: student.id, subjectId: args.subjectId ? String(args.subjectId) : null, leadId, kind, fee, actorId: actor.userId, mode });
      await advanceLead(tx, leadId, "assessment_booked", actor.userId);
      return { id: created.id, data: { invoiceId: created.invoiceId, startsAt: slot.startsAt.toISOString(), assessor: slot.tutor.displayName } };
    }),
    cancelAssessment: (_, args, context) => runCommand(context, { name: "cancelAssessment", input: { a: args.assessmentId }, idempotencyKey: keyOf2(args) }, async (tx, actor) => {
      const { a, staff: staff2 } = await assessmentFor(tx, actor, String(args.assessmentId));
      if (a.status !== "scheduled" && a.status !== "requested") throw new CommandError("Only an upcoming assessment can be cancelled.");
      const settings = await getSettings(tx);
      const hoursBefore = a.scheduledAt ? (a.scheduledAt.getTime() - Date.now()) / HOUR : Infinity;
      const byCentre = staff2;
      const refundable = byCentre || hoursBefore >= settings.assessmentCancelRefundHours || !settings.assessmentFeeKeptOnLateCancel;
      await transition(tx, actor, "assessment", "Assessment", a.id, ["scheduled", "requested"], "cancelled", { slotKey: null, cancelReason: optionalString(args.reason, 500) || (byCentre ? "Cancelled by the centre" : "Cancelled by the family") }, byCentre ? "centre" : "family");
      const fee = await settleAssessmentFee(tx, actor, a, refundable ? "refund" : "keep");
      return { id: a.id, data: { refundable, fee }, after: async () => {
        for (const id of fee.refundIds) await processRefund(context.sudo().prisma, id);
      } };
    }),
    rescheduleAssessment: (_, args, context) => runCommand(context, { name: "rescheduleAssessment", input: { a: args.assessmentId, s: args.startsAt, t: args.tutorId }, idempotencyKey: keyOf2(args), conflictMessage: SLOT_TAKEN }, async (tx, actor) => {
      const { a, staff: staff2 } = await assessmentFor(tx, actor, String(args.assessmentId));
      if (a.status !== "scheduled") throw new CommandError("Only an upcoming assessment can be moved.");
      const settings = await getSettings(tx);
      if (!staff2 && a.scheduledAt.getTime() - Date.now() < settings.assessmentCancelRefundHours * HOUR) throw new CommandError(`Assessments can be moved up to ${settings.assessmentCancelRefundHours} hours before. Please call the centre.`);
      const slot = await holdAssessmentSlot(tx, { programId: a.programId, locationId: a.locationId, mode: a.mode, startsAt: requireDate(args.startsAt, "Time"), tutorId: String(args.tutorId), minutes: a.minutes, staff: staff2 }, a.id);
      let r;
      try {
        r = await tx.assessment.updateMany({ where: { id: a.id, status: "scheduled", scheduledAt: a.scheduledAt }, data: { scheduledAt: slot.startsAt, assessorId: slot.tutor.id, roomId: slot.roomId, slotKey: slot.slotKey } });
      } catch (error) {
        if (error?.code === "P2002") throw new CommandError(SLOT_TAKEN);
        throw error;
      }
      if (r.count !== 1) throw new CommandError("This assessment was changed by someone else. Reload and try again.");
      await recordChange(tx, { type: "Assessment", id: a.id, from: "scheduled", to: "scheduled", actorId: actor.userId, reason: "rescheduled", data: { from: a.scheduledAt.toISOString(), to: slot.startsAt.toISOString(), assessor: slot.tutor.id } });
      return { id: a.id, data: { startsAt: slot.startsAt.toISOString(), assessor: slot.tutor.displayName } };
    }),
    startAssessment: (_, args, context) => runCommand(context, { name: "startAssessment", input: { a: args.assessmentId }, idempotencyKey: keyOf2(args) }, async (tx, actor) => {
      const a = await tx.assessment.findUnique({ where: { id: String(args.assessmentId) }, select: { id: true, locationId: true, assessorId: true } });
      if (!a) throw new CommandError("That assessment was not found.");
      if (!(actor?.tutorId && a.assessorId === actor.tutorId) && !canAt(actor, "canManageLeads", a.locationId)) throw new CommandError("You do not have permission to do that here.");
      await transition(tx, actor, "assessment", "Assessment", a.id, "scheduled", "in_progress");
      return { id: a.id };
    }),
    markAssessmentNoShow: (_, args, context) => runCommand(context, { name: "markAssessmentNoShow", input: { a: args.assessmentId }, idempotencyKey: keyOf2(args) }, async (tx, actor) => {
      const a = await tx.assessment.findUnique({ where: { id: String(args.assessmentId) }, select: { id: true, locationId: true, scheduledAt: true, assessorId: true, invoiceId: true, fee: true, familyId: true, status: true } });
      if (!a) throw new CommandError("That assessment was not found.");
      requireFlag(actor, "canManageLeads", a.locationId);
      if (a.scheduledAt && a.scheduledAt.getTime() > Date.now()) throw new CommandError("An assessment can be marked as a no-show once it has started.");
      await transition(tx, actor, "assessment", "Assessment", a.id, ["scheduled", "in_progress"], "no_show", { slotKey: null });
      const settings = await getSettings(tx);
      const fee = await settleAssessmentFee(tx, actor, a, settings.assessmentFeeKeptOnLateCancel ? "keep" : "refund");
      return { id: a.id, data: { fee }, after: async () => {
        for (const id of fee.refundIds) await processRefund(context.sudo().prisma, id);
      } };
    }),
    completeAssessment: (_, args, context) => runCommand(context, { name: "completeAssessment", input: { a: args.assessmentId, s: args.summary ?? "", r: args.results ?? null }, idempotencyKey: keyOf2(args) }, async (tx, actor) => {
      const a = await tx.assessment.findUnique({ where: { id: String(args.assessmentId) }, select: { id: true, locationId: true, assessorId: true, leadId: true, studentId: true, status: true, _count: { select: { results: true } } } });
      if (!a) throw new CommandError("That assessment was not found.");
      if (!(actor?.tutorId && a.assessorId === actor.tutorId) && !canAt(actor, "canManageStaff", a.locationId)) throw new CommandError("Only the assessor or a manager can complete this assessment.");
      const results = Array.isArray(args.results) ? args.results.slice(0, 60) : [];
      const summary = optionalString(args.summary, 5e3);
      if (!results.length && !summary && !a._count.results) throw new CommandError("Add at least one score or a summary.");
      for (const r of results) {
        const score = Number(r?.score);
        const maxScore = Number(r?.maxScore ?? 10);
        if (!Number.isFinite(score) || !Number.isFinite(maxScore) || score < 0 || maxScore <= 0 || score > maxScore) throw new CommandError("Each score must be between 0 and its maximum.");
        await tx.assessmentResult.create({ data: { assessment: { connect: { id: a.id } }, skill: requireString(r.skill, "Skill", 120), strand: optionalString(r.strand, 120), score, maxScore, levelEquivalent: optionalString(r.levelEquivalent, 60), note: optionalString(r.note, 1e3), createdBy: { connect: { id: actor.userId } } } });
      }
      await transition(tx, actor, "assessment", "Assessment", a.id, ["scheduled", "in_progress"], "completed", {
        slotKey: null,
        completedAt: /* @__PURE__ */ new Date(),
        summary,
        recommendation: optionalString(args.recommendation, 5e3),
        recommendedPlanId: args.recommendedPlanId ? String(args.recommendedPlanId) : null,
        recommendedPackageId: args.recommendedPackageId ? String(args.recommendedPackageId) : null,
        recommendedSessionsPerWeek: args.recommendedSessionsPerWeek ?? null
      });
      await advanceLead(tx, a.leadId, "assessed", actor.userId);
      return { id: a.id, data: { results: results.length } };
    }),
    transitionLead: (_, args, context) => runCommand(context, { name: "transitionLead", input: { l: args.leadId, t: args.to }, idempotencyKey: keyOf2(args) }, async (tx, actor) => {
      const lead = await tx.lead.findUnique({ where: { id: String(args.leadId) }, select: { id: true, status: true, locationId: true } });
      if (!lead) throw new CommandError("That lead was not found.");
      requireFlag(actor, "canManageLeads", lead.locationId);
      const to = String(args.to);
      const allowed = {
        new: ["contacted", "assessment_booked", "lost"],
        contacted: ["assessment_booked", "proposal_sent", "lost", "new"],
        assessment_booked: ["assessed", "contacted", "lost"],
        assessed: ["proposal_sent", "lost"],
        proposal_sent: ["enrolled", "assessed", "lost"],
        lost: ["new"],
        enrolled: []
      };
      if (!(allowed[lead.status] ?? []).includes(to)) throw new CommandError(`A ${lead.status.replace("_", " ")} lead cannot move to ${to.replace("_", " ")}.`);
      const reason = to === "lost" ? requireString(args.reason, "A reason", 500) : optionalString(args.reason, 500);
      await transition(tx, actor, "lead", "Lead", lead.id, lead.status, to, { ...to === "lost" ? { lostReason: reason } : {}, ...to === "contacted" ? { lastContactedAt: /* @__PURE__ */ new Date() } : {}, ...to === "new" ? { lostReason: "" } : {} }, reason || void 0);
      return { id: lead.id };
    })
  }
};

// features/keystone/mutations/billing.ts
var billing_exports = {};
__export(billing_exports, {
  resolvers: () => resolvers3,
  typeDefs: () => typeDefs3
});
init_command();
init_errors();
init_actor();
init_enrolment();
init_invoices();
init_payments();

// features/keystone/lib/webhook.ts
var import_node_crypto6 = require("node:crypto");
init_stripe();
init_payments();
init_command();
async function settleSetupIntent(prisma, si) {
  if (si.status !== "succeeded" || !si.payment_method) return si.status;
  const session = await prisma.paymentSession.findFirst({ where: { providerPaymentId: si.id, purpose: "setup" } });
  if (!session?.familyId) return "ignored: unknown setup intent";
  await transaction(prisma, async (tx) => {
    const current = await tx.paymentSession.findUnique({ where: { id: session.id } });
    if (current.status === "captured") return;
    await tx.paymentSession.updateMany({ where: { id: session.id, status: current.status }, data: { status: "captured", capturedAt: /* @__PURE__ */ new Date() } });
    await recordChange(tx, { type: "PaymentSession", id: session.id, from: current.status, to: "captured", reason: "setup_intent.succeeded" });
    await saveCardReference(tx, prisma, session.familyId, si.payment_method);
  });
  return "card_saved";
}

// features/keystone/mutations/billing.ts
var gql3 = String.raw;
var keyOf3 = (a) => typeof a?.idempotencyKey === "string" ? a.idempotencyKey : null;
var OFFLINE_METHODS = ["cash", "cheque", "bank_transfer"];
var typeDefs3 = gql3`
  input CheckoutGuardianInput { name: String!, email: String!, phone: String }
  input CheckoutStudentInput { firstName: String!, lastName: String, levelId: ID, school: String }

  type Mutation {
    startEnrolmentCheckout(
      programId: ID!, planId: ID, packageId: ID, mode: String!, locationId: ID, seriesIds: [ID!],
      studentId: ID, student: CheckoutStudentInput, guardian: CheckoutGuardianInput,
      promoCode: String, learningPlanId: ID, homeAddress: String, preferredTimes: String,
      acceptPolicies: Boolean!, saveCard: Boolean, idempotencyKey: String
    ): CommandResult!
    completeEnrolmentCheckout(paymentSessionId: ID!): CommandResult!
    cancelEnrolmentCheckout(enrollmentId: ID!): CommandResult!
    purchasePackage(packageId: ID!, studentId: ID!, saveCard: Boolean, useSavedCard: Boolean, idempotencyKey: String): CommandResult!
    payInvoice(invoiceId: ID!, saveCard: Boolean, useSavedCard: Boolean): CommandResult!
    refreshPayment(paymentSessionId: ID!): CommandResult!
    createSetupIntent: CommandResult!
    setDefaultPaymentMethod(setupIntentId: ID!): CommandResult!
    recordOfflinePayment(invoiceId: ID!, amount: Int!, method: String!, reference: String, idempotencyKey: String): CommandResult!
    refundPayment(paymentId: ID!, amount: Int!, reason: String!, idempotencyKey: String): CommandResult!
    issueCreditNote(invoiceId: ID!, amount: Int!, reason: String!, idempotencyKey: String): CommandResult!
    voidInvoice(invoiceId: ID!, reason: String!): CommandResult!
  }
`;
var fail = (error) => ({ success: false, error: error instanceof CommandError ? error.message : "Something went wrong. Please try again.", id: null, data: null });
async function actorOf(context) {
  return context.session?.itemId ? loadActor(context.sudo().prisma, context.session.itemId) : null;
}
async function requireInvoiceAccess(prisma, actor, invoiceId) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, familyId: true, locationId: true, status: true } });
  if (!invoice) throw new CommandError("That invoice was not found.");
  if (canAt(actor, "canManageBilling", invoice.locationId)) return { invoice, staff: true };
  await requireGuardianOf(prisma, actor, invoice.familyId);
  return { invoice, staff: false };
}
async function payStep(context, invoiceId, actorId, opts) {
  const prisma = context.sudo().prisma;
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, family: { select: { defaultPaymentMethodId: true } } } });
  if (inv.status === "paid") return { status: "captured", invoiceStatus: "paid", clientSecret: null };
  if (opts.useSavedCard) {
    if (!inv.family?.defaultPaymentMethodId) throw new CommandError("There is no saved card on this family.");
    const started2 = await startInvoicePayment(prisma, { invoiceId, actorId, offSession: true, attemptKey: opts.attemptKey ?? `saved:${Date.now()}` });
    const after = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { status: true } });
    return { ...started2, clientSecret: null, invoiceStatus: after.status };
  }
  const started = await startInvoicePayment(prisma, { invoiceId, actorId, saveCard: opts.saveCard });
  return { ...started, invoiceStatus: inv.status };
}
var resolvers3 = {
  Mutation: {
    startEnrolmentCheckout: async (_, args, context) => {
      let guardianRef = null;
      const r = await runCommand(context, {
        name: "startEnrolmentCheckout",
        allowAnonymous: true,
        idempotencyKey: keyOf3(args),
        input: { p: args.programId, pl: args.planId ?? null, pk: args.packageId ?? null, m: args.mode, l: args.locationId ?? null, s: args.seriesIds ?? [], st: args.studentId ?? args.student ?? null, g: args.guardian?.email ?? null, c: args.promoCode ?? null }
      }, async (tx, actor) => {
        if (!args.acceptPolicies) throw new CommandError("Please accept the policies to continue.");
        const locationId = args.locationId ? String(args.locationId) : null;
        const guardian = await guardianForCommand(tx, actor, args.guardian, locationId, "enrolment checkout");
        guardianRef = guardian;
        const studentId = await studentForCommand(tx, guardian, args.studentId, args.student);
        if (args.learningPlanId) {
          const plan = await tx.learningPlan.findUnique({ where: { id: String(args.learningPlanId) }, select: { studentId: true, status: true } });
          if (!plan || plan.studentId !== studentId || !["proposed", "accepted"].includes(plan.status)) throw new CommandError("That learning plan is not open for enrolment.");
        }
        const c = await buildCheckout(tx, {
          familyId: guardian.familyId,
          studentId,
          programId: String(args.programId),
          planId: args.planId ? String(args.planId) : null,
          packageId: args.packageId ? String(args.packageId) : null,
          locationId,
          mode: String(args.mode),
          seriesIds: args.seriesIds ?? [],
          promoCode: args.promoCode ?? null,
          learningPlanId: args.learningPlanId ? String(args.learningPlanId) : null,
          homeAddress: optionalString(args.homeAddress, 300),
          preferredTimes: optionalString(args.preferredTimes, 500),
          actorId: guardian.userId
        });
        if (c.invoice.total === 0) {
          await tx.invoice.update({ where: { id: c.invoice.id }, data: { status: "paid" } });
          await recordChange(tx, { type: "Invoice", id: c.invoice.id, from: "open", to: "paid", actorId: guardian.userId, reason: "nothing to pay" });
          await fulfilInvoice(tx, c.invoice.id);
        }
        return {
          id: c.enrollmentId,
          data: { enrollmentId: c.enrollmentId, invoiceId: c.invoice.id, invoiceNumber: c.invoice.number, total: c.invoice.total, subtotal: c.invoice.subtotal, discount: c.invoice.discount, tax: c.invoice.tax, currency: c.invoice.currency, familyId: guardian.familyId, studentId, newAccount: guardian.isNew },
          after: () => welcomeNewGuardian(context, guardian, "startEnrolmentCheckout")
        };
      });
      if (!r.success || !r.data) return r;
      const d = r.data;
      if (d.total === 0) return { ...r, data: { ...d, status: "captured", invoiceStatus: "paid" } };
      try {
        const pay = await payStep(context, d.invoiceId, guardianRef?.userId ?? context.session?.itemId ?? null, { saveCard: args.saveCard !== false });
        return { ...r, data: { ...d, ...pay } };
      } catch (error) {
        return { ...fail(error), id: r.id, data: d };
      }
    },
    /** Browser finished Stripe confirm: read the PaymentIntent server-side and settle (never trust the browser). */
    completeEnrolmentCheckout: async (_, args, context) => {
      try {
        const prisma = context.sudo().prisma;
        const actor = await actorOf(context);
        const ps = await prisma.paymentSession.findUnique({ where: { id: String(args.paymentSessionId) }, select: { id: true, invoiceId: true, familyId: true } });
        if (!ps?.invoiceId) throw new CommandError("That payment was not found.");
        await requireInvoiceAccess(prisma, actor, ps.invoiceId);
        const settled = await refreshPaymentSession(prisma, ps.id);
        const invoice = await prisma.invoice.findUnique({ where: { id: ps.invoiceId }, select: { status: true, fulfilment: true } });
        const f = invoice.fulfilment ?? {};
        const enrollment = f.enrollmentId ? await prisma.enrollment.findUnique({ where: { id: f.enrollmentId }, select: { id: true, status: true } }) : null;
        return { success: settled.status === "captured", error: settled.status === "captured" ? null : settled.parked ? "The payment needs a check by the centre." : settled.status === "failed" ? "The card was not charged. Please try again." : null, id: enrollment?.id ?? null, data: { status: settled.status, invoiceStatus: invoice.status, enrollmentStatus: enrollment?.status ?? null, bookedSeats: f.bookedSeats ?? 0, missedSeats: f.missedSeats ?? 0 } };
      } catch (error) {
        return fail(error);
      }
    },
    cancelEnrolmentCheckout: (_, args, context) => runCommand(context, { name: "cancelEnrolmentCheckout", input: { e: args.enrollmentId } }, async (tx, actor) => {
      const e = await tx.enrollment.findUnique({ where: { id: String(args.enrollmentId) }, select: { id: true, familyId: true, locationId: true, status: true } });
      if (!e) throw new CommandError("That enrolment was not found.");
      if (!canAt(actor, "canManageFamilies", e.locationId)) await requireGuardianOf(tx, actor, e.familyId);
      if (e.status !== "pending_payment") throw new CommandError("Only an unpaid checkout can be cancelled here.");
      await cancelPendingEnrolment(tx, e.id, "Checkout cancelled", actor.userId);
      return { id: e.id };
    }),
    purchasePackage: async (_, args, context) => {
      const r = await runCommand(context, { name: "purchasePackage", idempotencyKey: keyOf3(args), input: { p: args.packageId, s: args.studentId } }, async (tx, actor) => {
        const student = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { id: true, familyId: true, firstName: true } });
        if (!student) throw new CommandError("That student was not found.");
        const family = await tx.family.findUnique({ where: { id: student.familyId }, select: { primaryLocationId: true } });
        if (!canAt(actor, "canManageBilling", family?.primaryLocationId ?? null)) await requireGuardianOf(tx, actor, student.familyId);
        const pkg = await tx.package.findUnique({ where: { id: String(args.packageId) }, select: { id: true, name: true, programId: true, hours: true, price: true, status: true } });
        if (!pkg || pkg.status !== "published") throw new CommandError("That package is not on sale.");
        const enrollment = pkg.programId ? await tx.enrollment.findFirst({ where: { studentId: student.id, programId: pkg.programId, status: { in: ["active", "matched", "paused", "ended"] } }, orderBy: { createdAt: "desc" }, select: { id: true, locationId: true } }) : null;
        const sp = await tx.studentPackage.create({ data: { family: { connect: { id: student.familyId } }, student: { connect: { id: student.id } }, package: { connect: { id: pkg.id } }, hours: pkg.hours, price: pkg.price, status: "pending_payment", createdBy: { connect: { id: actor.userId } } } });
        const invoice = await createInvoice(tx, {
          familyId: student.familyId,
          locationId: enrollment?.locationId ?? family?.primaryLocationId ?? null,
          kind: "package",
          actorId: actor.userId,
          lines: [{ description: `${pkg.name} (${pkg.hours} hours, ${student.firstName})`, kind: "package", unitAmount: pkg.price, studentId: student.id, programId: pkg.programId, studentPackageId: sp.id }],
          fulfilment: { kind: "package", studentPackageId: sp.id, programId: pkg.programId, enrollmentId: enrollment?.id ?? null }
        });
        await tx.studentPackage.update({ where: { id: sp.id }, data: { invoice: { connect: { id: invoice.id } } } });
        await recordChange(tx, { type: "StudentPackage", id: sp.id, to: "pending_payment", actorId: actor.userId });
        if (invoice.total === 0) {
          await tx.invoice.update({ where: { id: invoice.id }, data: { status: "paid" } });
          await fulfilInvoice(tx, invoice.id);
        }
        return { id: sp.id, data: { studentPackageId: sp.id, invoiceId: invoice.id, total: invoice.total, currency: invoice.currency } };
      });
      if (!r.success || !r.data || r.data.total === 0) return r;
      try {
        const pay = await payStep(context, r.data.invoiceId, context.session?.itemId ?? null, { saveCard: Boolean(args.saveCard), useSavedCard: Boolean(args.useSavedCard), attemptKey: `pkg:${r.id}` });
        return { ...r, data: { ...r.data, ...pay } };
      } catch (error) {
        return { ...fail(error), id: r.id, data: r.data };
      }
    },
    payInvoice: async (_, args, context) => {
      try {
        const prisma = context.sudo().prisma;
        const actor = await actorOf(context);
        if (!actor) throw new CommandError("Sign in to continue.");
        const { invoice } = await requireInvoiceAccess(prisma, actor, String(args.invoiceId));
        if (!["open", "partially_paid"].includes(invoice.status)) throw new CommandError("This invoice has nothing to pay.");
        const pay = await payStep(context, invoice.id, actor.userId, { saveCard: Boolean(args.saveCard), useSavedCard: Boolean(args.useSavedCard) });
        return { success: true, error: null, id: invoice.id, data: pay };
      } catch (error) {
        return fail(error);
      }
    },
    refreshPayment: async (_, args, context) => {
      try {
        const prisma = context.sudo().prisma;
        const actor = await actorOf(context);
        const ps = await prisma.paymentSession.findUnique({ where: { id: String(args.paymentSessionId) }, select: { id: true, invoiceId: true } });
        if (!ps?.invoiceId) throw new CommandError("That payment was not found.");
        await requireInvoiceAccess(prisma, actor, ps.invoiceId);
        const settled = await refreshPaymentSession(prisma, ps.id);
        return { success: true, error: null, id: ps.id, data: settled };
      } catch (error) {
        return fail(error);
      }
    },
    createSetupIntent: async (_, _args, context) => {
      try {
        const prisma = context.sudo().prisma;
        const actor = await actorOf(context);
        if (!actor) throw new CommandError("Sign in to continue.");
        const familyId = await transaction(prisma, async (tx) => (await Promise.resolve().then(() => (init_actor(), actor_exports))).guardianFamily(tx, actor, true));
        const keys = await stripeKeys(prisma);
        if (!keys.secretKey) throw new CommandError("Card payments are not set up yet.");
        await ensureProviders(prisma);
        const customer = await ensureCustomer(prisma, keys, familyId);
        const session = await prisma.paymentSession.create({ data: { family: { connect: { id: familyId } }, purpose: "setup", idempotencyKeyHash: `setup:${familyId}:${Date.now()}:${Math.random().toString(36).slice(2)}`, status: "pending", amount: 0, ...keys.providerId ? { paymentProvider: { connect: { id: keys.providerId } } } : {}, createdBy: { connect: { id: actor.userId } } } });
        const si = await stripe_exports.createSetupIntent(keys, { customer, metadata: { familyId, paymentSessionId: session.id } }, `setup:${session.id}`);
        await prisma.paymentSession.update({ where: { id: session.id }, data: { providerPaymentId: si.id, clientSecret: si.client_secret || "" } });
        return { success: true, error: null, id: session.id, data: { setupIntentId: si.id, clientSecret: si.client_secret, publishableKey: keys.publishableKey } };
      } catch (error) {
        return fail(error);
      }
    },
    setDefaultPaymentMethod: async (_, args, context) => {
      try {
        const prisma = context.sudo().prisma;
        const actor = await actorOf(context);
        const session = await prisma.paymentSession.findFirst({ where: { providerPaymentId: String(args.setupIntentId), purpose: "setup" }, select: { id: true, familyId: true } });
        if (!session) throw new CommandError("That card setup was not found.");
        await requireGuardianOf(prisma, actor, session.familyId);
        const keys = await stripeKeys(prisma);
        const si = await stripe_exports.retrieveSetupIntent(keys, String(args.setupIntentId));
        const outcome = await settleSetupIntent(prisma, si);
        if (outcome !== "card_saved") throw new CommandError("The card was not saved. Please try again.");
        const family = await prisma.family.findUnique({ where: { id: session.familyId }, select: { defaultPaymentMethodLabel: true } });
        return { success: true, error: null, id: session.familyId, data: { label: family.defaultPaymentMethodLabel } };
      } catch (error) {
        return fail(error);
      }
    },
    recordOfflinePayment: (_, args, context) => runCommand(context, { name: "recordOfflinePayment", idempotencyKey: keyOf3(args), input: { i: args.invoiceId, a: args.amount, m: args.method, r: args.reference ?? "" } }, async (tx, actor) => {
      const invoice = await tx.invoice.findUnique({ where: { id: String(args.invoiceId) }, select: { id: true, familyId: true, locationId: true, currency: true } });
      if (!invoice) throw new CommandError("That invoice was not found.");
      requireFlag(actor, "canManageBilling", invoice.locationId);
      if (!OFFLINE_METHODS.includes(args.method)) throw new CommandError("Pick cash, cheque or bank transfer. Card payments go through the card form.");
      const amount = requireInt(args.amount, "Amount", 1);
      const reference = optionalString(args.reference, 200);
      if (args.method !== "cash" && !reference) throw new CommandError("Enter the cheque number or transfer reference.");
      const r = await applyPayment(tx, invoice.id, amount);
      const payment = await tx.payment.create({ data: { invoice: { connect: { id: invoice.id } }, family: { connect: { id: invoice.familyId } }, amount, currency: invoice.currency, method: args.method, reference, status: "captured", receivedBy: { connect: { id: actor.userId } } } });
      await recordChange(tx, { type: "Payment", id: payment.id, to: "captured", actorId: actor.userId, reason: args.method, data: { invoiceId: invoice.id, amount } });
      return { id: payment.id, data: { invoiceStatus: r.to } };
    }),
    refundPayment: async (_, args, context) => {
      let refundId = null;
      const r = await runCommand(context, { name: "refundPayment", idempotencyKey: keyOf3(args), input: { p: args.paymentId, a: args.amount } }, async (tx, actor) => {
        const payment = await tx.payment.findUnique({ where: { id: String(args.paymentId) }, select: { id: true, invoiceId: true, amount: true, refundedAmount: true, method: true, invoice: { select: { locationId: true, kind: true, fulfilment: true } } } });
        if (!payment) throw new CommandError("That payment was not found.");
        requireFlag(actor, "canIssueRefunds", payment.invoice?.locationId ?? null);
        const amount = requireInt(args.amount, "Amount", 1);
        const reason = requireString(args.reason, "Reason", 500);
        const refund = await requestRefund(tx, { paymentId: payment.id, amount, reason, actorId: actor.userId, key: `refund:${payment.id}:${keyOf3(args) ?? `${amount}:${Date.now()}`}` });
        refundId = refund.id;
        const removedMinutes = payment.invoiceId && ["package", "enrolment"].includes(payment.invoice?.kind ?? "") ? await removePackageCredit(tx, payment.invoiceId, actor.userId) : 0;
        return { id: refund.id, data: { refundId: refund.id, status: refund.status, removedMinutes }, after: async () => {
          await processRefund(context.sudo().prisma, refund.id);
        } };
      });
      if (r.success && refundId) {
        const after = await context.sudo().prisma.refund.findUnique({ where: { id: refundId }, select: { status: true, failureReason: true } });
        return { ...r, data: { ...r.data, status: after.status, failureReason: after.failureReason || null } };
      }
      return r;
    },
    issueCreditNote: (_, args, context) => runCommand(context, { name: "issueCreditNote", idempotencyKey: keyOf3(args), input: { i: args.invoiceId, a: args.amount } }, async (tx, actor) => {
      const invoice = await tx.invoice.findUnique({ where: { id: String(args.invoiceId) }, select: { id: true, locationId: true } });
      if (!invoice) throw new CommandError("That invoice was not found.");
      requireFlag(actor, "canManageBilling", invoice.locationId);
      const amount = requireInt(args.amount, "Amount", 1);
      const reason = requireString(args.reason, "Reason", 500);
      const r = await applyToInvoice(tx, invoice.id, amount, "amountCredited");
      const note = await tx.creditNote.create({ data: { invoice: { connect: { id: invoice.id } }, amount, reason, issuedBy: { connect: { id: actor.userId } } } });
      await recordChange(tx, { type: "CreditNote", id: note.id, to: "issued", actorId: actor.userId, reason, data: { invoiceId: invoice.id, amount } });
      if (r.to === "paid") await fulfilInvoice(tx, invoice.id);
      return { id: note.id, data: { invoiceStatus: r.to } };
    }),
    voidInvoice: (_, args, context) => runCommand(context, { name: "voidInvoice", input: { i: args.invoiceId } }, async (tx, actor) => {
      const invoice = await tx.invoice.findUnique({ where: { id: String(args.invoiceId) }, select: { id: true, locationId: true, fulfilment: true } });
      if (!invoice) throw new CommandError("That invoice was not found.");
      requireFlag(actor, "canManageBilling", invoice.locationId);
      const reason = requireString(args.reason, "Reason", 500);
      const f = invoice.fulfilment ?? {};
      const cancelled = f.kind === "enrolment" && f.enrollmentId ? await cancelPendingEnrolment(tx, f.enrollmentId, reason, actor.userId) : "";
      if (!cancelled && !await voidInvoiceIfUnpaid(tx, invoice.id, reason, actor.userId)) throw new CommandError("Only an invoice with no payments can be voided. Use a credit note instead.");
      return { id: invoice.id };
    })
  }
};

// features/keystone/mutations/memberships.ts
var memberships_exports = {};
__export(memberships_exports, {
  resolvers: () => resolvers6,
  typeDefs: () => typeDefs6
});
var import_node_crypto10 = require("node:crypto");
init_command();
init_errors();
init_actor();

// features/keystone/lib/membership.ts
var import_date_fns2 = require("date-fns");
var import_node_crypto7 = require("node:crypto");
init_errors();
init_command();
init_invoices();
init_payments();
init_enrolment();
init_booking();
init_ledger();
init_settings();
init_notify();
var LEASE_MS = 10 * 6e4;
async function billMembership(prisma, membershipId, now = /* @__PURE__ */ new Date()) {
  let claim;
  try {
    claim = await transaction(prisma, async (tx) => {
      await lockKey(tx, `membership-billing:${membershipId}`);
      const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { plan: true, pendingPlan: true, student: { select: { firstName: true } }, family: { select: { defaultPaymentMethodId: true, billingEmail: true } }, enrollment: { select: { locationId: true, programId: true } } } });
      if (!m || !["active", "past_due", "cancelling"].includes(m.status) || !m.currentPeriodEnd) return { skip: "not billable" };
      const periodStart = m.currentPeriodEnd;
      const periodEnd = (0, import_date_fns2.addMonths)(periodStart, 1);
      if (periodStart.getTime() - DAY > now.getTime()) return { skip: "not due" };
      if (m.endsAt && m.endsAt <= periodStart) return { skip: "membership ends" };
      const last = await tx.billingAttempt.findFirst({ where: { membershipId, periodStart }, orderBy: { attemptNumber: "desc" } });
      if (last?.status === "succeeded") return { skip: "paid" };
      if (last?.status === "unknown") return { skip: "waiting for reconcile" };
      if (last?.status === "pending") {
        if (last.leaseExpiresAt && last.leaseExpiresAt > now) return { skip: "in progress" };
        await tx.billingAttempt.update({ where: { id: last.id }, data: { status: "unknown", failureMessage: "Lease expired before the provider answered" } });
        await recordChange(tx, { type: "BillingAttempt", id: last.id, from: "pending", to: "unknown", reason: "lease expired" });
        return { skip: "waiting for reconcile" };
      }
      if (last?.status === "failed" && (!last.nextRetryAt || last.nextRetryAt > now)) return { skip: last.nextRetryAt ? "waiting for retry day" : "retries used" };
      let invoiceId2 = last?.invoiceId ?? null;
      if (invoiceId2) {
        const inv2 = await tx.invoice.findUnique({ where: { id: invoiceId2 }, select: { status: true } });
        if (inv2.status === "paid") return { skip: "paid" };
        if (inv2.status === "void") invoiceId2 = null;
      }
      if (!invoiceId2) {
        const plan = m.pendingPlan ?? m.plan;
        const price = m.pendingPlan ? m.pendingPlan.price : m.price;
        const lines = [{ description: `${plan?.name ?? "Membership"}: ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)} (${m.student?.firstName ?? ""})`, kind: "membership", unitAmount: price, studentId: m.studentId, programId: m.enrollment?.programId ?? null, membershipId: m.id }];
        if (m.discountPercent) lines.push({ description: `Sibling discount ${m.discountPercent}%`, kind: "discount", unitAmount: -Math.round(price * m.discountPercent / 100), studentId: m.studentId, membershipId: m.id });
        const inv2 = await createInvoice(tx, { familyId: m.familyId, locationId: m.enrollment?.locationId ?? null, kind: "membership", lines, dueAt: periodStart, fulfilment: { kind: "membership_period", membershipId: m.id, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() } });
        invoiceId2 = inv2.id;
        if (inv2.total === 0) {
          await tx.invoice.update({ where: { id: inv2.id }, data: { status: "paid" } });
          const { fulfilInvoice: fulfilInvoice2 } = await Promise.resolve().then(() => (init_payments(), payments_exports));
          await fulfilInvoice2(tx, inv2.id);
          return { skip: "nothing to charge" };
        }
      }
      const n = (last?.attemptNumber ?? 0) + 1;
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId2 }, select: { total: true, amountPaid: true, amountCredited: true } });
      const attempt2 = await tx.billingAttempt.create({
        data: {
          membership: { connect: { id: m.id } },
          periodStart,
          periodEnd,
          invoice: { connect: { id: invoiceId2 } },
          attemptNumber: n,
          status: "pending",
          amount: inv.total - inv.amountPaid - inv.amountCredited,
          requestHash: (0, import_node_crypto7.createHash)("sha256").update(`${m.id}:${periodStart.toISOString()}:${n}`).digest("hex"),
          leaseExpiresAt: new Date(now.getTime() + LEASE_MS)
        }
      });
      await recordChange(tx, { type: "BillingAttempt", id: attempt2.id, to: "pending", data: { membershipId: m.id, attemptNumber: n } });
      return { attempt: attempt2, invoiceId: invoiceId2, hasCard: Boolean(m.family?.defaultPaymentMethodId), email: m.family?.billingEmail ?? "" };
    });
  } catch (error) {
    if (error?.code === "P2002") return { membershipId, outcome: "skipped", reason: "another run claimed this period" };
    throw error;
  }
  if (claim.skip) return { membershipId, outcome: "skipped", reason: claim.skip };
  const { attempt, invoiceId } = claim;
  if (!claim.hasCard) {
    await finishAttempt(prisma, attempt.id, "failed", { code: "no_card", message: "No saved card on file" }, now);
    return { membershipId, outcome: "no_card", attemptId: attempt.id, invoiceId };
  }
  let status = "unknown";
  let message = "";
  try {
    const started = await startInvoicePayment(prisma, { invoiceId, actorId: null, offSession: true, attemptKey: attempt.id });
    status = started.status;
  } catch (error) {
    message = error.message;
    const ps2 = await prisma.paymentSession.findFirst({ where: { invoiceId, offSession: true }, orderBy: { createdAt: "desc" }, select: { status: true, failureMessage: true } });
    status = ps2?.status === "failed" ? "failed" : "unknown";
    if (ps2?.failureMessage) message = ps2.failureMessage;
  }
  const ps = await prisma.paymentSession.findFirst({ where: { invoiceId, offSession: true }, orderBy: { createdAt: "desc" }, select: { providerPaymentId: true } });
  if (status === "captured") {
    await finishAttempt(prisma, attempt.id, "succeeded", { providerPaymentId: ps?.providerPaymentId }, now);
    return { membershipId, outcome: "captured", attemptId: attempt.id, invoiceId };
  }
  if (status === "unknown") {
    await finishAttempt(prisma, attempt.id, "unknown", { message, providerPaymentId: ps?.providerPaymentId }, now);
    return { membershipId, outcome: "unknown", attemptId: attempt.id, invoiceId };
  }
  await finishAttempt(prisma, attempt.id, "failed", { code: status === "requires_action" ? "authentication_required" : "declined", message: message || status, providerPaymentId: ps?.providerPaymentId }, now);
  return { membershipId, outcome: "failed", attemptId: attempt.id, invoiceId };
}
async function finishAttempt(prisma, attemptId, status, detail, now) {
  await transaction(prisma, async (tx) => {
    const a = await tx.billingAttempt.findUnique({ where: { id: attemptId }, include: { membership: { select: { id: true, status: true, pastDueSince: true, familyId: true, family: { select: { billingEmail: true } } } } } });
    if (!a || !["pending", "unknown"].includes(a.status)) return;
    let nextRetryAt = null;
    if (status === "failed") {
      const settings = await getSettings(tx);
      const since = a.membership.pastDueSince ?? now;
      const days = settings.pastDueRetryDays[a.attemptNumber - 1];
      nextRetryAt = days != null ? new Date(since.getTime() + days * DAY) : null;
      if (["active", "cancelling"].includes(a.membership.status)) {
        await tx.membership.updateMany({ where: { id: a.membership.id, status: a.membership.status }, data: { status: "past_due", pastDueSince: since } });
        await recordChange(tx, { type: "Membership", id: a.membership.id, from: a.membership.status, to: "past_due", reason: detail.code ?? "payment failed", data: { attemptId } });
      }
      if (a.invoiceId) await queueEmail(tx, { to: a.membership.family?.billingEmail ?? "", template: "payment_failed", subject: "Your tutoring payment did not go through", relatedType: "Invoice", relatedId: a.invoiceId });
    }
    if (status === "unknown") {
      await tx.task.upsert({ where: { openKey: `reconcile:${attemptId}` }, create: { kind: "billing_review", title: "A membership charge needs checking with Stripe", family: { connect: { id: a.membership.familyId } }, relatedType: "BillingAttempt", relatedId: attemptId, dueAt: now, openKey: `reconcile:${attemptId}` }, update: {} });
    }
    await tx.billingAttempt.update({ where: { id: attemptId }, data: { status, leaseExpiresAt: null, nextRetryAt, failureCode: detail.code ?? "", failureMessage: (detail.message ?? "").slice(0, 500), providerPaymentId: detail.providerPaymentId ?? a.providerPaymentId ?? "" } });
    await recordChange(tx, { type: "BillingAttempt", id: attemptId, from: a.status, to: status, reason: detail.code ?? null });
  });
}
async function reconcileAttempt(prisma, attemptId, now = /* @__PURE__ */ new Date()) {
  const a = await prisma.billingAttempt.findUnique({ where: { id: attemptId } });
  if (!a) throw new CommandError("That billing attempt was not found.");
  if (!["unknown", "pending"].includes(a.status)) return { status: a.status };
  if (a.status === "pending" && a.leaseExpiresAt && a.leaseExpiresAt > now) throw new CommandError("This charge is still in progress.");
  const keys = await stripeKeys(prisma);
  const ps = await prisma.paymentSession.findFirst({ where: { invoiceId: a.invoiceId, offSession: true, createdAt: { gte: new Date(a.createdAt.getTime() - 6e4) } }, orderBy: { createdAt: "asc" } });
  let pi = null;
  if (ps?.providerPaymentId) pi = await stripe_exports.retrievePaymentIntent(keys, ps.providerPaymentId);
  else if (ps) {
    const found = await stripe_exports.listPaymentIntentsByMetadata(keys, "paymentSessionId", ps.id);
    pi = found.data[0] ?? null;
    if (pi) await prisma.paymentSession.update({ where: { id: ps.id }, data: { providerPaymentId: pi.id } });
  }
  if (!pi) {
    await transaction(prisma, async (tx) => {
      await tx.billingAttempt.update({ where: { id: a.id }, data: { status: "failed", failureCode: "not_sent", failureMessage: "Stripe has no record of this charge", nextRetryAt: now, leaseExpiresAt: null } });
      if (ps) await tx.paymentSession.updateMany({ where: { id: ps.id, status: { in: ["pending", "unknown"] } }, data: { status: "failed", failureMessage: "Not sent" } });
      await recordChange(tx, { type: "BillingAttempt", id: a.id, from: a.status, to: "failed", reason: "reconcile: not sent" });
      await tx.task.updateMany({ where: { openKey: `reconcile:${a.id}` }, data: { status: "done", openKey: null, completedAt: now, outcomeNote: "Stripe had no charge; retry allowed" } });
    });
    return { status: "failed" };
  }
  const settled = await settlePaymentIntent(prisma, pi, "reconcile");
  const final = settled.status === "captured" ? "succeeded" : ["failed", "cancelled", "requires_action"].includes(settled.status) ? "failed" : "unknown";
  if (final === "unknown") return { status: "unknown" };
  await prisma.billingAttempt.update({ where: { id: a.id }, data: { status: "unknown" } }).catch(() => {
  });
  await finishAttempt(prisma, a.id, final, { code: final === "failed" ? "declined" : void 0, providerPaymentId: pi.id, message: pi.last_payment_error?.message }, now);
  await prisma.task.updateMany({ where: { openKey: `reconcile:${a.id}` }, data: { status: "done", openKey: null, completedAt: now, outcomeNote: `Stripe: ${pi.status}` } });
  return { status: final };
}
registerFulfilment("membership_period", async (tx, invoice, f) => {
  await lockKey(tx, `membership:${f.membershipId}`);
  const m = await tx.membership.findUnique({ where: { id: f.membershipId }, include: { pendingPlan: true } });
  if (!m) return;
  const periodStart = new Date(f.periodStart);
  const periodEnd = new Date(f.periodEnd);
  if (!m.currentPeriodEnd || m.currentPeriodEnd.getTime() !== periodStart.getTime() || m.status === "cancelled") {
    await tx.task.create({ data: { kind: "billing_review", title: `Membership payment received for a period that no longer applies (invoice ${invoice.number})`, family: { connect: { id: invoice.familyId } }, relatedType: "Invoice", relatedId: invoice.id, dueAt: /* @__PURE__ */ new Date(), openKey: `stale-period:${invoice.id}` } }).catch(() => {
    });
    return;
  }
  const next = ["past_due", "suspended"].includes(m.status) ? "active" : m.status;
  const planData = m.pendingPlan ? { plan: { connect: { id: m.pendingPlan.id } }, pendingPlan: { disconnect: true }, price: m.pendingPlan.price, sessionsPerPeriod: m.pendingPlan.sessionsPerPeriod ?? null, weeklyCap: m.pendingPlan.sessionsPerPeriod ? null : m.pendingPlan.weeklyCapForUnlimited ?? 5 } : {};
  await tx.membership.update({ where: { id: m.id }, data: { status: next, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, pastDueSince: null, ...planData } });
  await recordChange(tx, { type: "Membership", id: m.id, from: m.status, to: next, reason: "period paid", data: { periodStart: f.periodStart, invoiceId: invoice.id, planChanged: Boolean(m.pendingPlan) } });
  await startMembershipPeriod(tx, m.id, periodStart, null);
  const e = await tx.enrollment.findFirst({ where: { membershipId: m.id, status: "active" }, select: { id: true } });
  if (e) await bookFixedSeats(tx, e.id, periodStart, periodEnd);
  await tx.billingAttempt.updateMany({ where: { invoiceId: invoice.id, status: { in: ["pending", "unknown"] } }, data: { status: "succeeded", leaseExpiresAt: null } });
  await tx.billingAttempt.updateMany({ where: { invoiceId: invoice.id, status: "failed" }, data: { nextRetryAt: null } });
});
async function cancelFutureBookings(tx, where, reason, actorId) {
  const bookings = await tx.booking.findMany({ where: { status: "booked", startsAt: { gt: /* @__PURE__ */ new Date() }, ...where }, select: { id: true }, orderBy: { startsAt: "asc" } });
  for (const b of bookings) await cancelSeat(tx, null, b.id, { byCentre: true, reason });
  return bookings.length;
}
function membershipBookings(m) {
  return { studentId: m.studentId, creditGrant: { membershipId: m.id } };
}
async function endEnrolment(tx, membershipId, reason, actorId) {
  const e = await tx.enrollment.findFirst({ where: { membershipId, status: { in: ["pending_match", "matched", "active", "paused"] } }, select: { id: true, status: true } });
  if (!e) return;
  await tx.enrollment.update({ where: { id: e.id }, data: { status: "ended", endDate: /* @__PURE__ */ new Date(), endReason: reason.slice(0, 300) } });
  await recordChange(tx, { type: "Enrollment", id: e.id, from: e.status, to: "ended", actorId, reason });
}
async function closeMembership(tx, m, reason, actorId, now) {
  const r = await tx.membership.updateMany({ where: { id: m.id, status: m.status }, data: { status: "cancelled", endsAt: m.endsAt && m.endsAt < now ? m.endsAt : now } });
  if (!r.count) return false;
  await recordChange(tx, { type: "Membership", id: m.id, from: m.status, to: "cancelled", actorId, reason });
  await cancelFutureBookings(tx, membershipBookings(m), reason, actorId);
  const grants = await tx.creditGrant.findMany({ where: { membershipId: m.id, status: { in: ["active", "exhausted"] } }, select: { id: true } });
  for (const g of grants) await removeUnused(tx, g.id, "adjustment", "voided", actorId, "Membership ended");
  await endEnrolment(tx, m.id, reason, actorId);
  return true;
}
async function advanceMemberships(prisma, now = /* @__PURE__ */ new Date()) {
  const settings = await getSettings(prisma);
  const out = { suspended: 0, cancelled: 0, ended: 0, paused: 0, resumed: 0 };
  const suspendBefore = new Date(now.getTime() - settings.suspendAfterDays * DAY);
  for (const m of await prisma.membership.findMany({ where: { status: "past_due", pastDueSince: { lte: suspendBefore } }, select: { id: true } })) {
    await transaction(prisma, async (tx) => {
      const row = await tx.membership.findUnique({ where: { id: m.id }, include: { family: { select: { billingEmail: true } } } });
      if (row.status !== "past_due") return;
      await tx.membership.update({ where: { id: m.id }, data: { status: "suspended" } });
      await recordChange(tx, { type: "Membership", id: m.id, from: "past_due", to: "suspended", reason: `unpaid ${settings.suspendAfterDays} days` });
      await cancelFutureBookings(tx, membershipBookings(row), "Membership suspended for non-payment", null);
      await tx.task.upsert({ where: { openKey: `suspended:${m.id}` }, create: { kind: "failed_payment", title: "Membership suspended for non-payment", family: { connect: { id: row.familyId } }, student: { connect: { id: row.studentId } }, relatedType: "Membership", relatedId: m.id, dueAt: now, openKey: `suspended:${m.id}` }, update: {} });
      await queueEmail(tx, { to: row.family?.billingEmail ?? "", template: "membership_suspended", subject: "Your tutoring membership is suspended", relatedType: "Membership", relatedId: m.id });
      out.suspended += 1;
    });
  }
  const cancelBefore = new Date(now.getTime() - (settings.suspendAfterDays + 30) * DAY);
  for (const m of await prisma.membership.findMany({ where: { status: "suspended", pastDueSince: { lte: cancelBefore } } })) {
    if (await transaction(prisma, (tx) => closeMembership(tx, m, "Unpaid 30 days after suspension", null, now))) out.cancelled += 1;
  }
  for (const m of await prisma.membership.findMany({ where: { status: { in: ["cancelling", "active", "past_due"] }, endsAt: { lte: now } } })) {
    if (await transaction(prisma, (tx) => closeMembership(tx, m, "Notice period ended", null, now))) out.ended += 1;
  }
  for (const m of await prisma.membership.findMany({ where: { status: { in: ["active", "cancelling"] }, pausedFrom: { lte: now }, pausedUntil: { gt: now } }, select: { id: true, status: true } })) {
    await transaction(prisma, async (tx) => {
      const r = await tx.membership.updateMany({ where: { id: m.id, status: m.status }, data: { status: "paused" } });
      if (!r.count) return;
      await recordChange(tx, { type: "Membership", id: m.id, from: m.status, to: "paused", reason: "pause started" });
      await tx.enrollment.updateMany({ where: { membershipId: m.id, status: "active" }, data: { status: "paused" } });
      out.paused += 1;
    });
  }
  for (const m of await prisma.membership.findMany({ where: { status: "paused", pausedUntil: { lte: now } }, select: { id: true, endsAt: true } })) {
    await transaction(prisma, async (tx) => {
      const to = m.endsAt ? "cancelling" : "active";
      const r = await tx.membership.updateMany({ where: { id: m.id, status: "paused" }, data: { status: to, pausedFrom: null, pausedUntil: null } });
      if (!r.count) return;
      await recordChange(tx, { type: "Membership", id: m.id, from: "paused", to, reason: "pause ended" });
      await tx.enrollment.updateMany({ where: { membershipId: m.id, status: "paused" }, data: { status: "active" } });
      out.resumed += 1;
    });
  }
  return out;
}
async function runMembershipBilling(prisma, now = /* @__PURE__ */ new Date(), onlyIds) {
  const due = await prisma.membership.findMany({ where: { status: { in: ["active", "past_due", "cancelling"] }, currentPeriodEnd: { lte: new Date(now.getTime() + DAY) }, ...onlyIds ? { id: { in: onlyIds } } : {} }, select: { id: true } });
  const results = [];
  for (const m of due) results.push(await billMembership(prisma, m.id, now));
  return results;
}
function noticeEndDate(m, noticeDays, now = /* @__PURE__ */ new Date()) {
  const target = new Date(now.getTime() + noticeDays * DAY);
  let end = m.currentPeriodEnd ?? (0, import_date_fns2.addMonths)(now, 1);
  let guard = 0;
  while (end < target && guard < 36) {
    end = (0, import_date_fns2.addMonths)(end, 1);
    guard += 1;
  }
  return end;
}
async function giveNotice(tx, m, actorId, now = /* @__PURE__ */ new Date()) {
  if (!["active", "past_due", "paused"].includes(m.status)) throw new CommandError(m.status === "cancelling" ? "Notice has already been given." : "This membership cannot be cancelled now.");
  const settings = await getSettings(tx);
  const endsAt = noticeEndDate(m, settings.membershipCancelNoticeDays, now);
  const to = m.status === "paused" ? "paused" : m.status === "past_due" ? "past_due" : "cancelling";
  const r = await tx.membership.updateMany({ where: { id: m.id, status: m.status }, data: { status: to, endsAt, cancelRequestedAt: now, pendingPlanId: null } });
  if (!r.count) throw new CommandError("This membership changed; reload and try again.");
  await recordChange(tx, { type: "Membership", id: m.id, from: m.status, to, actorId, reason: "notice given", data: { endsAt: endsAt.toISOString() } });
  const released = await cancelFutureBookings(tx, { ...membershipBookings(m), startsAt: { gte: endsAt } }, "After the membership end date", actorId);
  return { endsAt, released };
}
async function applyPause(tx, m, from, until, actorId, opts) {
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const settings = await getSettings(tx);
  if (!["active", "cancelling"].includes(m.status)) throw new CommandError("Only an active membership can be paused.");
  if (m.pausedUntil && m.pausedUntil > now) throw new CommandError("A pause is already booked.");
  const days = Math.round((until.getTime() - from.getTime()) / DAY);
  if (until <= from) throw new CommandError("The pause must end after it starts.");
  if (!opts.staff) {
    if (days < settings.pauseMinDays || days > settings.pauseMaxDays) throw new CommandError(`A pause is ${settings.pauseMinDays} to ${settings.pauseMaxDays} days.`);
    if (from < new Date(now.getTime() - DAY)) throw new CommandError("A pause cannot start in the past.");
    const yearAgo = new Date(now.getTime() - 365 * DAY);
    if (m.lastPauseAt && m.lastPauseAt > yearAgo && settings.pausesPerYear <= 1) throw new CommandError("A membership can be paused once in 12 months.");
  }
  if (m.currentPeriodEnd && from >= m.currentPeriodEnd) throw new CommandError(`A pause must start before the next bill date (${m.currentPeriodEnd.toISOString().slice(0, 10)}).`);
  const shift = until.getTime() - from.getTime();
  const data = { pausedFrom: from, pausedUntil: until, lastPauseAt: now, pauseRequestedFrom: from, pauseRequestedUntil: until };
  if (m.currentPeriodEnd) data.currentPeriodEnd = new Date(m.currentPeriodEnd.getTime() + shift);
  if (m.endsAt) data.endsAt = new Date(m.endsAt.getTime() + shift);
  const startsNow = from <= now;
  if (startsNow) data.status = "paused";
  const r = await tx.membership.updateMany({ where: { id: m.id, status: m.status }, data });
  if (!r.count) throw new CommandError("This membership changed; reload and try again.");
  await recordChange(tx, { type: "Membership", id: m.id, from: m.status, to: startsNow ? "paused" : m.status, actorId, reason: "pause booked", data: { from: from.toISOString(), until: until.toISOString() } });
  const grants = await tx.creditGrant.findMany({ where: { membershipId: m.id, status: { in: ["active", "exhausted"] }, expiresAt: { gt: now } }, select: { id: true, expiresAt: true, periodEnd: true } });
  for (const g of grants) await tx.creditGrant.update({ where: { id: g.id }, data: { expiresAt: new Date(g.expiresAt.getTime() + shift), ...g.periodEnd ? { periodEnd: new Date(g.periodEnd.getTime() + shift) } : {} } });
  if (startsNow) await tx.enrollment.updateMany({ where: { membershipId: m.id, status: "active" }, data: { status: "paused" } });
  const released = await cancelFutureBookings(tx, { ...membershipBookings(m), startsAt: { gte: from, lt: until } }, "Membership paused", actorId);
  return { from, until, released, nextBillDate: data.currentPeriodEnd ?? null };
}
async function planChangePreview(tx, membershipId, planId, now = /* @__PURE__ */ new Date()) {
  const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { plan: true, enrollment: { select: { programId: true, program: { select: { sessionMinutes: true } } } } } });
  if (!m) throw new CommandError("That membership was not found.");
  const plan = await tx.membershipPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.status === "archived") throw new CommandError("That plan is not available.");
  if (plan.programId && m.enrollment?.programId && plan.programId !== m.enrollment.programId) throw new CommandError("That plan is for a different programme.");
  if (plan.id === m.planId) throw new CommandError("The membership is already on that plan.");
  const start = m.currentPeriodStart ?? now;
  const end = m.currentPeriodEnd ?? (0, import_date_fns2.addMonths)(now, 1);
  const periodMs = Math.max(1, end.getTime() - start.getTime());
  const leftMs = Math.max(0, end.getTime() - now.getTime());
  const fraction = leftMs / periodMs;
  const discount = (price) => price - Math.round(price * (m.discountPercent ?? 0) / 100);
  const prorationAmount = Math.round((discount(plan.price) - discount(m.price ?? 0)) * fraction);
  const minutesPerSession = m.enrollment?.program?.sessionMinutes ?? 60;
  const extraMinutes = plan.sessionsPerPeriod && m.sessionsPerPeriod ? Math.round((plan.sessionsPerPeriod - m.sessionsPerPeriod) * minutesPerSession * fraction) : 0;
  return {
    membershipId: m.id,
    fromPlan: { id: m.planId, name: m.plan?.name ?? "", price: m.price },
    toPlan: { id: plan.id, name: plan.name, price: plan.price },
    discountPercent: m.discountPercent ?? 0,
    daysLeft: Math.round(leftMs / DAY),
    periodDays: Math.round(periodMs / DAY),
    prorationAmount,
    extraMinutes,
    nextBillDate: end.toISOString(),
    nextBillAmount: discount(plan.price),
    canApplyNow: prorationAmount >= 0 && m.status === "active"
  };
}
async function changePlan(tx, membershipId, planId, effective, actorId) {
  await lockKey(tx, `membership:${membershipId}`);
  const preview = await planChangePreview(tx, membershipId, planId);
  const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { enrollment: { select: { locationId: true, programId: true } }, student: { select: { firstName: true } } } });
  if (!["active", "past_due", "paused"].includes(m.status)) throw new CommandError("Only a live membership can change plan.");
  if (effective === "next_period") {
    await tx.membership.update({ where: { id: m.id }, data: { pendingPlan: { connect: { id: planId } } } });
    await recordChange(tx, { type: "Membership", id: m.id, from: m.status, to: m.status, actorId, reason: "plan change at next period", data: { planId } });
    return { ...preview, effective, invoiceId: null };
  }
  if (!preview.canApplyNow) throw new CommandError("A cheaper plan starts at the next bill date. Choose \u201Cnext period\u201D.");
  const plan = await tx.membershipPlan.findUnique({ where: { id: planId } });
  await tx.membership.update({ where: { id: m.id }, data: { plan: { connect: { id: plan.id } }, pendingPlan: { disconnect: true }, price: plan.price, sessionsPerPeriod: plan.sessionsPerPeriod ?? null, weeklyCap: plan.sessionsPerPeriod ? null : plan.weeklyCapForUnlimited ?? 5 } });
  await recordChange(tx, { type: "Membership", id: m.id, from: m.status, to: m.status, actorId, reason: "plan changed now", data: { planId, prorationAmount: preview.prorationAmount } });
  let invoiceId = null;
  if (preview.prorationAmount > 0) {
    const inv = await createInvoice(tx, { familyId: m.familyId, locationId: m.enrollment?.locationId ?? null, kind: "membership", actorId, lines: [{ description: `Plan change to ${plan.name}: ${preview.daysLeft} days (${m.student?.firstName ?? ""})`, kind: "membership", unitAmount: preview.prorationAmount, studentId: m.studentId, programId: m.enrollment?.programId ?? null, membershipId: m.id }] });
    invoiceId = inv.id;
  }
  if (preview.extraMinutes > 0) {
    const g = await tx.creditGrant.findFirst({ where: { membershipId: m.id, status: { in: ["active", "exhausted"] }, rolledFromId: null, periodStart: m.currentPeriodStart }, select: { id: true } });
    if (g) await adjustGrant(tx, g.id, preview.extraMinutes, actorId, `Plan change to ${plan.name}`);
  }
  return { ...preview, effective, invoiceId };
}
async function endNow(tx, membershipId, opts) {
  const now = opts.now ?? /* @__PURE__ */ new Date();
  await lockKey(tx, `membership:${membershipId}`);
  const m = await tx.membership.findUnique({ where: { id: membershipId } });
  if (!m || m.status === "cancelled") throw new CommandError("This membership has already ended.");
  let refundIds = [];
  let refundAmount = 0;
  if (opts.refund && m.currentPeriodStart && m.currentPeriodEnd && m.currentPeriodEnd > now) {
    const lines = await tx.invoiceLine.findMany({ where: { membershipId: m.id, kind: { in: ["membership", "discount"] }, invoice: { status: { in: ["paid", "partially_paid"] }, createdAt: { lte: now } } }, select: { amount: true, invoiceId: true, invoice: { select: { createdAt: true } } }, orderBy: { createdAt: "desc" } });
    const invoiceId = lines[0]?.invoiceId;
    if (invoiceId) {
      const paidForPeriod = lines.filter((l) => l.invoiceId === invoiceId).reduce((s, l) => s + l.amount, 0);
      const fraction = (m.currentPeriodEnd.getTime() - now.getTime()) / (m.currentPeriodEnd.getTime() - m.currentPeriodStart.getTime());
      refundAmount = Math.max(0, Math.round(paidForPeriod * fraction));
      let left = refundAmount;
      const payments = await tx.payment.findMany({ where: { invoiceId, status: { in: ["captured", "partially_refunded"] } }, orderBy: { createdAt: "asc" } });
      for (const p of payments) {
        if (left <= 0) break;
        const amount = Math.min(left, p.amount - (p.refundedAmount ?? 0));
        if (amount <= 0) continue;
        const refund = await requestRefund(tx, { paymentId: p.id, amount, reason: `Membership ended: ${opts.reason}`.slice(0, 500), actorId: opts.actorId, key: `end-refund:${m.id}:${p.id}` });
        refundIds.push(refund.id);
        left -= amount;
      }
      refundAmount -= left;
    }
  }
  await closeMembership(tx, m, opts.reason, opts.actorId, now);
  return { refundAmount, refundIds };
}

// features/keystone/mutations/memberships.ts
init_payments();
init_ledger();

// features/keystone/lib/jobs.ts
var import_node_crypto9 = require("node:crypto");
init_command();
init_ledger();
init_schedule();
init_notify();
init_settings();
async function expireCredits(prisma, now = /* @__PURE__ */ new Date()) {
  const settings = await getSettings(prisma);
  let rolled = 0;
  let expired = 0;
  const ended = await prisma.creditGrant.findMany({ where: { kind: "membership_period", status: { in: ["active", "exhausted"] }, periodEnd: { lte: now } }, select: { id: true, membershipId: true, periodEnd: true } });
  for (const g of ended) {
    await transaction(prisma, async (tx) => {
      await lockKey(tx, `grant:${g.id}`);
      const next = await tx.creditGrant.findFirst({ where: { membershipId: g.membershipId, kind: "membership_period", rolledFromId: null, periodStart: g.periodEnd }, select: { periodStart: true, periodEnd: true } });
      if (next) {
        const m = await rollOverGrant(tx, g.id, { periodStart: next.periodStart, periodEnd: next.periodEnd }, settings.membershipRolloverPeriods > 0);
        if (m) rolled += 1;
        else expired += 1;
      } else {
        await expireGrant(tx, g.id, "Period ended");
        expired += 1;
      }
    });
  }
  const others = await prisma.creditGrant.findMany({ where: { kind: { not: "membership_period" }, status: "active", expiresAt: { lte: now } }, select: { id: true } });
  for (const g of others) {
    await transaction(prisma, (tx) => expireGrant(tx, g.id, "Expired"));
    expired += 1;
  }
  return { rolled, expired };
}
async function openTask(tx, key, data) {
  const existing = await tx.task.findUnique({ where: { openKey: key }, select: { id: true } });
  if (existing) return false;
  await tx.task.create({ data: { ...data, openKey: key, status: "open" } });
  return true;
}
async function raiseTasks(prisma, now = /* @__PURE__ */ new Date()) {
  const settings = await getSettings(prisma);
  let raised = 0;
  await transaction(prisma, async (tx) => {
    const low = await tx.creditGrant.findMany({ where: { kind: "package", status: "active", minutesAvailable: { lte: settings.lowBalanceMinutes, gt: 0 } }, select: { id: true, familyId: true, studentId: true, minutesAvailable: true, family: { select: { billingEmail: true } } } });
    for (const g of low) {
      if (await openTask(tx, `low-balance:${g.id}`, { kind: "low_balance", title: `Low balance: ${Math.round(g.minutesAvailable / 60 * 10) / 10} hours left`, family: { connect: { id: g.familyId } }, ...g.studentId ? { student: { connect: { id: g.studentId } } } : {}, relatedType: "CreditGrant", relatedId: g.id, dueAt: now })) {
        await queueEmail(tx, { to: g.family?.billingEmail ?? "", template: "low_balance", subject: "Time to top up your tutoring hours", relatedType: "CreditGrant", relatedId: g.id });
        raised += 1;
      }
    }
    const stale = await tx.lead.findMany({ where: { status: { in: ["new", "contacted", "proposal_sent"] }, updatedAt: { lte: new Date(now.getTime() - 3 * DAY) } }, select: { id: true, guardianName: true, status: true, locationId: true, ownerId: true } });
    for (const l of stale) if (await openTask(tx, `lead-follow-up:${l.id}:${l.status}`, { kind: "lead_follow_up", title: `Follow up ${l.guardianName || "enquiry"} (${l.status.replace(/_/g, " ")})`, lead: { connect: { id: l.id } }, ...l.locationId ? { location: { connect: { id: l.locationId } } } : {}, ...l.ownerId ? { owner: { connect: { id: l.ownerId } } } : {}, relatedType: "Lead", relatedId: l.id, dueAt: now })) raised += 1;
    const noProposal = await tx.assessment.findMany({ where: { status: "completed", completedAt: { lte: new Date(now.getTime() - 3 * DAY) }, student: { plans: { none: { status: { in: ["proposed", "accepted", "active"] } } } } }, select: { id: true, familyId: true, studentId: true, locationId: true } });
    for (const a of noProposal) if (await openTask(tx, `no-proposal:${a.id}`, { kind: "assessment_follow_up", title: "Assessment done, no learning plan sent yet", ...a.familyId ? { family: { connect: { id: a.familyId } } } : {}, ...a.studentId ? { student: { connect: { id: a.studentId } } } : {}, ...a.locationId ? { location: { connect: { id: a.locationId } } } : {}, relatedType: "Assessment", relatedId: a.id, dueAt: now })) raised += 1;
    const recent = await tx.booking.findMany({ where: { startsAt: { gte: new Date(now.getTime() - 30 * DAY), lte: now }, status: { in: ["attended", "late", "no_show", "cancelled_late", "cancelled_late_excused"] } }, select: { studentId: true, familyId: true, status: true, startsAt: true }, orderBy: { startsAt: "desc" } });
    const byStudent = /* @__PURE__ */ new Map();
    for (const b of recent) byStudent.set(b.studentId, [...byStudent.get(b.studentId) ?? [], b]);
    for (const [studentId, list9] of byStudent) {
      if (list9.length >= 2 && list9.slice(0, 2).every((b) => b.status !== "attended" && b.status !== "late")) {
        if (await openTask(tx, `absences:${studentId}:${list9[0].startsAt.toISOString().slice(0, 10)}`, { kind: "absence_streak", title: "Two absences in a row", student: { connect: { id: studentId } }, family: { connect: { id: list9[0].familyId } }, relatedType: "Student", relatedId: studentId, dueAt: now })) raised += 1;
      }
    }
    const ending = await tx.membership.findMany({ where: { status: { in: ["cancelling", "paused"] }, endsAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY) } }, select: { id: true, familyId: true, studentId: true } });
    for (const m of ending) if (await openTask(tx, `membership-ending:${m.id}`, { kind: "membership_ending", title: "Membership ends this week", family: { connect: { id: m.familyId } }, student: { connect: { id: m.studentId } }, relatedType: "Membership", relatedId: m.id, dueAt: now })) raised += 1;
    const fresh = await tx.enrollment.findMany({ where: { status: "active", startDate: { gte: new Date(now.getTime() - 8 * DAY), lte: new Date(now.getTime() - 6 * DAY) } }, select: { id: true, familyId: true, studentId: true, locationId: true } });
    for (const e of fresh) if (await openTask(tx, `first-week:${e.id}`, { kind: "first_week_check_in", title: "First-week check-in with the family", family: { connect: { id: e.familyId } }, student: { connect: { id: e.studentId } }, ...e.locationId ? { location: { connect: { id: e.locationId } } } : {}, relatedType: "Enrollment", relatedId: e.id, dueAt: now })) raised += 1;
  });
  const soon = await prisma.booking.findMany({ where: { status: "booked", startsAt: { gt: new Date(now.getTime() + 20 * HOUR), lte: new Date(now.getTime() + 28 * HOUR) } }, select: { id: true, startsAt: true, family: { select: { billingEmail: true } } } });
  for (const b of soon) {
    const already = await prisma.notificationLog.findFirst({ where: { template: "session_reminder", relatedId: b.id }, select: { id: true } });
    if (!already) await queueEmail(prisma, { to: b.family?.billingEmail ?? "", template: "session_reminder", subject: `Reminder: session on ${b.startsAt.toISOString().slice(0, 16).replace("T", " ")} UTC`, relatedType: "Booking", relatedId: b.id });
  }
  return { raised };
}
async function generateAll(prisma, now = /* @__PURE__ */ new Date()) {
  const settings = await getSettings(prisma);
  const through = new Date(now.getTime() + settings.bookingHorizonDays * DAY);
  const series = await prisma.sessionSeries.findMany({ where: { status: "active", OR: [{ generatedThrough: null }, { generatedThrough: { lt: through } }] }, select: { id: true } });
  let generated = 0;
  for (const s of series) generated += await transaction(prisma, (tx) => generateSessions(tx, s.id, through));
  return { generated };
}
async function expireCredentials(prisma, now = /* @__PURE__ */ new Date()) {
  const expired = await prisma.tutorCredential.findMany({ where: { status: "verified", expiresAt: { lte: now } }, select: { id: true } });
  for (const c of expired) {
    const r = await prisma.tutorCredential.updateMany({ where: { id: c.id, status: "verified" }, data: { status: "expired" } });
    if (r.count === 1) await prisma.changeEvent.create({ data: { aggregateType: "TutorCredential", aggregateId: c.id, from: "verified", to: "expired", reason: "expiry date passed", data: {}, at: now } });
  }
  const soon = await prisma.tutorCredential.findMany({ where: { status: "verified", expiresAt: { gt: now, lte: new Date(now.getTime() + 30 * DAY) } }, select: { id: true, kind: true, expiresAt: true, tutor: { select: { displayName: true } } } });
  for (const c of soon) {
    await prisma.task.upsert({ where: { openKey: `credential:${c.id}` }, create: { kind: "credential_expiring", title: `${c.tutor?.displayName}: ${c.kind.replace(/_/g, " ")} expires ${c.expiresAt.toISOString().slice(0, 10)}`, relatedType: "TutorCredential", relatedId: c.id, dueAt: c.expiresAt, openKey: `credential:${c.id}` }, update: {} });
  }
  return { expired: expired.length, expiringSoon: soon.length };
}
async function runDailyJobs(prisma, now = /* @__PURE__ */ new Date()) {
  const started = Date.now();
  const steps = {};
  const step = async (name, fn) => {
    try {
      steps[name] = await fn();
    } catch (error) {
      steps[name] = { error: error.message };
      console.error(`daily job ${name} failed`, error?.message);
    }
  };
  const got = await prisma.$queryRaw`SELECT pg_try_advisory_lock(hashtextextended('daily-jobs', 0)) AS ok`;
  if (!got[0]?.ok) return { skipped: "another run is in progress" };
  try {
    await step("sessions", () => generateAll(prisma, now));
    await step("billing", async () => {
      const r = await runMembershipBilling(prisma, now);
      return r.reduce((acc, x) => ({ ...acc, [x.outcome]: (acc[x.outcome] ?? 0) + 1 }), {});
    });
    await step("memberships", () => advanceMemberships(prisma, now));
    await step("credits", () => expireCredits(prisma, now));
    await step("tasks", () => raiseTasks(prisma, now));
    await step("offers", async () => {
      const due = await prisma.offer.findMany({ where: { status: "sent", expiresAt: { lte: now } }, select: { id: true, enrollmentId: true } });
      for (const o of due) {
        const r = await prisma.offer.updateMany({ where: { id: o.id, status: "sent" }, data: { status: "expired", openKey: null, respondedAt: now, declineReason: "expired" } });
        if (r.count !== 1) continue;
        await prisma.changeEvent.create({ data: { aggregateType: "Offer", aggregateId: o.id, from: "sent", to: "expired", reason: "no answer in time", data: {}, at: now } });
        await prisma.task.upsert({ where: { openKey: `offer-declined:${o.enrollmentId}` }, create: { kind: "manual", title: "Offer expired: send the next candidate", relatedType: "Enrollment", relatedId: o.enrollmentId, dueAt: now, openKey: `offer-declined:${o.enrollmentId}` }, update: {} });
      }
      return { expired: due.length };
    });
    await step("matches", async () => (await Promise.resolve().then(() => (init_tutors(), tutors_exports))).autoConfirmMatches(prisma, now));
    await step("credentials", () => expireCredentials(prisma, now));
    await step("progressReports", async () => (await Promise.resolve().then(() => (init_families(), families_exports))).draftDueProgressReports(prisma, now));
    await step("email", () => deliverQueued(prisma));
    await prisma.businessSettings.upsert({ where: { id: 1 }, create: { id: 1, lastDailyJobsAt: now }, update: { lastDailyJobsAt: now } });
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(hashtextextended('daily-jobs', 0))`;
  }
  return { ranAt: now.toISOString(), ms: Date.now() - started, steps };
}
var hashSecret = (s) => (0, import_node_crypto9.createHash)("sha256").update(s).digest("hex");

// features/keystone/mutations/memberships.ts
init_settings();
var gql6 = String.raw;
var keyOf6 = (a) => typeof a?.idempotencyKey === "string" ? a.idempotencyKey : null;
var typeDefs6 = gql6`
  type Query {
    membershipPlanChangePreview(membershipId: ID!, planId: ID!): JSON
  }
  type Mutation {
    requestMembershipPause(membershipId: ID!, from: String!, until: String!, idempotencyKey: String): CommandResult!
    requestMembershipCancel(membershipId: ID!, idempotencyKey: String): CommandResult!
    pauseMembership(membershipId: ID!, from: String!, until: String!, reason: String, idempotencyKey: String): CommandResult!
    endMembership(membershipId: ID!, mode: String!, refund: Boolean, reason: String!, idempotencyKey: String): CommandResult!
    changeMembershipPlan(membershipId: ID!, planId: ID!, effective: String!, idempotencyKey: String): CommandResult!
    runMembershipBilling(membershipId: ID): CommandResult!
    reconcileBillingAttempt(billingAttemptId: ID!): CommandResult!
    expireCredits: CommandResult!
    grantGoodwillCredit(familyId: ID!, studentId: ID, programId: ID, minutes: Int!, expiresInDays: Int, reason: String!, idempotencyKey: String): CommandResult!
    runDailyJobs: CommandResult!
    rotateJobsSecret: CommandResult!
  }
`;
var fail2 = (error) => ({ success: false, error: error instanceof CommandError ? error.message : "Something went wrong. Please try again.", id: null, data: null });
async function actorOf3(context) {
  return context.session?.itemId ? loadActor(context.sudo().prisma, context.session.itemId) : null;
}
async function membershipFor(tx, id) {
  const m = await tx.membership.findUnique({ where: { id }, include: { enrollment: { select: { locationId: true } } } });
  if (!m) throw new CommandError("That membership was not found.");
  return { m, locationId: m.enrollment?.locationId ?? null };
}
var resolvers6 = {
  Query: {
    membershipPlanChangePreview: async (_, args, context) => {
      const prisma = context.sudo().prisma;
      const actor = await actorOf3(context);
      const { locationId } = await membershipFor(prisma, String(args.membershipId));
      requireFlag(actor, "canManageBilling", locationId);
      return planChangePreview(prisma, String(args.membershipId), String(args.planId));
    }
  },
  Mutation: {
    requestMembershipPause: (_, args, context) => runCommand(context, { name: "requestMembershipPause", idempotencyKey: keyOf6(args), input: { m: args.membershipId, f: args.from, u: args.until } }, async (tx, actor) => {
      const { m } = await membershipFor(tx, String(args.membershipId));
      await requireGuardianOf(tx, actor, m.familyId);
      const r = await applyPause(tx, m, requireDate(args.from, "Pause start"), requireDate(args.until, "Pause end"), actor.userId, { staff: false });
      return { id: m.id, data: { ...r, from: r.from.toISOString(), until: r.until.toISOString(), nextBillDate: r.nextBillDate?.toISOString() ?? null } };
    }),
    requestMembershipCancel: (_, args, context) => runCommand(context, { name: "requestMembershipCancel", idempotencyKey: keyOf6(args), input: { m: args.membershipId } }, async (tx, actor) => {
      const { m } = await membershipFor(tx, String(args.membershipId));
      await requireGuardianOf(tx, actor, m.familyId);
      const r = await giveNotice(tx, m, actor.userId);
      return { id: m.id, data: { endsAt: r.endsAt.toISOString(), released: r.released } };
    }),
    pauseMembership: (_, args, context) => runCommand(context, { name: "pauseMembership", idempotencyKey: keyOf6(args), input: { m: args.membershipId, f: args.from, u: args.until } }, async (tx, actor) => {
      const { m, locationId } = await membershipFor(tx, String(args.membershipId));
      requireFlag(actor, "canManageBilling", locationId);
      const r = await applyPause(tx, m, requireDate(args.from, "Pause start"), requireDate(args.until, "Pause end"), actor.userId, { staff: true });
      return { id: m.id, data: { ...r, from: r.from.toISOString(), until: r.until.toISOString(), nextBillDate: r.nextBillDate?.toISOString() ?? null, reason: optionalString(args.reason, 300) } };
    }),
    endMembership: (_, args, context) => runCommand(context, { name: "endMembership", idempotencyKey: keyOf6(args), input: { m: args.membershipId, mode: args.mode, r: Boolean(args.refund) } }, async (tx, actor) => {
      const { m, locationId } = await membershipFor(tx, String(args.membershipId));
      requireFlag(actor, "canManageBilling", locationId);
      const reason = requireString(args.reason, "Reason", 300);
      if (args.mode === "notice") {
        const r2 = await giveNotice(tx, m, actor.userId);
        return { id: m.id, data: { mode: "notice", endsAt: r2.endsAt.toISOString(), released: r2.released } };
      }
      if (args.mode !== "now") throw new CommandError("Choose \u201Cat the end of the notice period\u201D or \u201Cnow\u201D.");
      if (args.refund) requireFlag(actor, "canIssueRefunds", locationId);
      const r = await endNow(tx, m.id, { refund: Boolean(args.refund), reason, actorId: actor.userId });
      return { id: m.id, data: { mode: "now", refundAmount: r.refundAmount }, after: async () => {
        for (const id of r.refundIds) await processRefund(context.sudo().prisma, id);
      } };
    }),
    changeMembershipPlan: (_, args, context) => runCommand(context, { name: "changeMembershipPlan", idempotencyKey: keyOf6(args), input: { m: args.membershipId, p: args.planId, e: args.effective } }, async (tx, actor) => {
      const { m, locationId } = await membershipFor(tx, String(args.membershipId));
      requireFlag(actor, "canManageBilling", locationId);
      if (!["next_period", "now"].includes(args.effective)) throw new CommandError("Choose when the plan changes: now or at the next bill date.");
      const r = await changePlan(tx, m.id, String(args.planId), args.effective, actor.userId);
      return { id: m.id, data: r };
    }),
    runMembershipBilling: async (_, args, context) => {
      try {
        const actor = await actorOf3(context);
        requireFlag(actor, "canManageBilling");
        const prisma = context.sudo().prisma;
        if (args.membershipId) {
          const { locationId } = await membershipFor(prisma, String(args.membershipId));
          requireFlag(actor, "canManageBilling", locationId);
          const r = await billMembership(prisma, String(args.membershipId));
          return { success: true, error: null, id: args.membershipId, data: r };
        }
        requireFlag(actor, "canManageSettings");
        const results = await runMembershipBilling(prisma);
        return { success: true, error: null, id: null, data: { results } };
      } catch (error) {
        return fail2(error);
      }
    },
    reconcileBillingAttempt: async (_, args, context) => {
      try {
        const actor = await actorOf3(context);
        const prisma = context.sudo().prisma;
        const a = await prisma.billingAttempt.findUnique({ where: { id: String(args.billingAttemptId) }, select: { membershipId: true } });
        if (!a) throw new CommandError("That billing attempt was not found.");
        const { locationId } = await membershipFor(prisma, a.membershipId);
        requireFlag(actor, "canManageBilling", locationId);
        const r = await reconcileAttempt(prisma, String(args.billingAttemptId));
        return { success: true, error: null, id: String(args.billingAttemptId), data: r };
      } catch (error) {
        return fail2(error);
      }
    },
    expireCredits: async (_, _args, context) => {
      try {
        requireFlag(await actorOf3(context), "canManageBilling");
        return { success: true, error: null, id: null, data: await expireCredits(context.sudo().prisma) };
      } catch (error) {
        return fail2(error);
      }
    },
    grantGoodwillCredit: (_, args, context) => runCommand(context, { name: "grantGoodwillCredit", idempotencyKey: keyOf6(args), input: { f: args.familyId, s: args.studentId ?? null, m: args.minutes } }, async (tx, actor) => {
      const family = await tx.family.findUnique({ where: { id: String(args.familyId) }, select: { id: true, primaryLocationId: true } });
      if (!family) throw new CommandError("That family was not found.");
      requireFlag(actor, "canManageBilling", family.primaryLocationId ?? void 0);
      const minutes = requireInt(args.minutes, "Minutes", 1, 6e3);
      if (args.studentId) {
        const s = await tx.student.findUnique({ where: { id: String(args.studentId) }, select: { familyId: true } });
        if (s?.familyId !== family.id) throw new CommandError("That student is not in this family.");
      }
      const days = args.expiresInDays ? requireInt(args.expiresInDays, "Expiry days", 1, 730) : 60;
      const g = await createGrant(tx, { familyId: family.id, studentId: args.studentId ? String(args.studentId) : null, programId: args.programId ? String(args.programId) : null, kind: "goodwill", minutes, expiresAt: new Date(Date.now() + days * DAY), note: requireString(args.reason, "Reason", 300), actorId: actor.userId });
      return { id: g.id, data: { grantId: g.id, minutes } };
    }),
    runDailyJobs: async (_, _args, context) => {
      try {
        requireFlag(await actorOf3(context), "canManageSettings");
        const r = await runDailyJobs(context.sudo().prisma);
        return { success: !("skipped" in r), error: "skipped" in r ? "The daily jobs are already running." : null, id: null, data: r };
      } catch (error) {
        return fail2(error);
      }
    },
    /** Onboarding and settings → jobs: a new secret for POST /api/jobs/daily, shown once. */
    rotateJobsSecret: (_, _args, context) => runCommand(context, { name: "rotateJobsSecret", input: {} }, async (tx, actor) => {
      requireFlag(actor, "canManageSettings");
      const secret2 = (0, import_node_crypto10.randomBytes)(32).toString("base64url");
      await tx.businessSettings.upsert({ where: { id: 1 }, create: { id: 1, jobsSecretHash: hashSecret(secret2) }, update: { jobsSecretHash: hashSecret(secret2) } });
      await recordChange(tx, { type: "BusinessSettings", id: "1", actorId: actor.userId, reason: "jobs secret rotated" });
      return { id: "1", data: { secret: secret2 } };
    })
  }
};

// features/keystone/mutations/index.ts
init_families();
init_tutors();

// features/keystone/mutations/payroll.ts
var payroll_exports = {};
__export(payroll_exports, {
  payrollCsv: () => payrollCsv,
  resolvers: () => resolvers7,
  tutorTotals: () => tutorTotals,
  typeDefs: () => typeDefs7
});
init_command();
init_errors();
init_actor();
init_settings();
var gql7 = String.raw;
var keyOf7 = (a) => typeof a?.idempotencyKey === "string" ? a.idempotencyKey : null;
var MANUAL_KINDS = ["prep", "training", "bonus", "deduction", "adjustment", "trial"];
var PAY_METHODS = ["bank_transfer", "cheque", "cash", "payroll_provider", "other"];
var typeDefs7 = gql7`
  type Query {
    payrollRunCsv(payrollRunId: ID!): String
    payrollPreview(periodStart: String!, periodEnd: String!, locationId: ID): JSON
    myPayStatement(from: String, to: String): JSON
  }
  type Mutation {
    addPayLine(tutorId: ID!, kind: String!, amount: Int!, minutes: Int, workedAt: String, sessionId: ID, note: String!, idempotencyKey: String): CommandResult!
    voidPayLine(payLineId: ID!, reason: String!, idempotencyKey: String): CommandResult!
    createPayrollRun(periodStart: String, periodEnd: String, locationId: ID, idempotencyKey: String): CommandResult!
    approvePayrollRun(payrollRunId: ID!, idempotencyKey: String): CommandResult!
    cancelPayrollRun(payrollRunId: ID!, reason: String!, idempotencyKey: String): CommandResult!
    markPayrollRunPaid(payrollRunId: ID!, payments: JSON!, idempotencyKey: String): CommandResult!
  }
`;
function eligibleWhere(periodStart, periodEnd, locationId) {
  return {
    status: "accrued",
    payrollRunId: null,
    workedAt: { gte: periodStart, lt: periodEnd },
    ...locationId ? { OR: [{ session: { locationId } }, { sessionId: null, tutor: { locations: { some: { id: locationId } } } }] } : {}
  };
}
async function tutorLocation(tx, tutorId) {
  const t = await tx.tutor.findUnique({ where: { id: tutorId }, select: { id: true, status: true, locations: { select: { id: true } } } });
  if (!t) throw new CommandError("That tutor was not found.");
  return t;
}
function requirePayrollFor(actor, locationIds) {
  if (!locationIds.length) return requireFlag(actor, "canManagePayroll");
  let last;
  for (const id of locationIds) {
    try {
      return requireFlag(actor, "canManagePayroll", id);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
async function runFor(tx, id) {
  const run = await tx.payrollRun.findUnique({ where: { id }, select: { id: true, status: true, locationId: true, periodStart: true, periodEnd: true, payments: true } });
  if (!run) throw new CommandError("That payroll run was not found.");
  return run;
}
async function tutorTotals(tx, where) {
  const lines = await tx.payLine.findMany({
    where: { ...where, status: { not: "void" } },
    select: { id: true, tutorId: true, kind: true, minutes: true, amount: true, tutor: { select: { displayName: true, employmentType: true } } }
  });
  const by = /* @__PURE__ */ new Map();
  for (const l of lines) {
    const t = by.get(l.tutorId) ?? { tutorId: l.tutorId, name: l.tutor?.displayName ?? "", employmentType: l.tutor?.employmentType ?? "", lines: 0, minutes: 0, amount: 0 };
    t.lines += 1;
    t.minutes += l.minutes;
    t.amount += l.amount;
    by.set(l.tutorId, t);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}
var csvCell = (v) => {
  const s = v === null || v === void 0 ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
var money2 = (minor) => (minor / 100).toFixed(2);
async function payrollCsv(prisma, runId) {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, select: { id: true, status: true, periodStart: true, periodEnd: true, paidAt: true, payments: true, location: { select: { name: true } } } });
  if (!run) throw new CommandError("That payroll run was not found.");
  const lines = await prisma.payLine.findMany({
    where: { payrollRunId: runId, status: { not: "void" } },
    orderBy: [{ tutorId: "asc" }, { workedAt: "asc" }],
    select: { id: true, kind: true, workedAt: true, minutes: true, rate: true, amount: true, status: true, note: true, tutorId: true, tutor: { select: { displayName: true, employmentType: true } }, session: { select: { startsAt: true, program: { select: { name: true } }, location: { select: { name: true } } } } }
  });
  const paid = new Map((Array.isArray(run.payments) ? run.payments : []).map((p) => [p.tutorId, p]));
  const rows = [["run_id", "period_start", "period_end", "location", "tutor", "employment_type", "line_id", "kind", "worked_at", "programme", "minutes", "rate", "amount", "status", "note", "paid_method", "paid_reference", "paid_at"]];
  for (const l of lines) {
    const p = paid.get(l.tutorId);
    rows.push([run.id, run.periodStart.toISOString().slice(0, 10), run.periodEnd.toISOString().slice(0, 10), l.session?.location?.name ?? run.location?.name ?? "", l.tutor?.displayName ?? "", l.tutor?.employmentType ?? "", l.id, l.kind, l.workedAt.toISOString(), l.session?.program?.name ?? "", String(l.minutes), money2(l.rate), money2(l.amount), l.status, l.note ?? "", p?.method ?? "", p?.reference ?? "", p?.paidAt ?? (run.paidAt ? run.paidAt.toISOString() : "")]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
async function actorOf4(context) {
  return context.session?.itemId ? loadActor(context.sudo().prisma, context.session.itemId) : null;
}
var orNull = (fn) => async (...a) => {
  try {
    return await fn(...a);
  } catch (error) {
    if (error instanceof CommandError) return null;
    throw error;
  }
};
var resolvers7 = {
  Query: {
    payrollRunCsv: orNull(async (_, args, context) => {
      const prisma = context.sudo().prisma;
      const actor = await actorOf4(context);
      const run = await runFor(prisma, String(args.payrollRunId));
      const a = requireFlag(actor, "canManagePayroll", run.locationId ?? void 0);
      if (!run.locationId && !isOwnerActor(a)) throw new CommandError("Only the owner sees the all-locations run.");
      return payrollCsv(prisma, run.id);
    }),
    payrollPreview: orNull(async (_, args, context) => {
      const prisma = context.sudo().prisma;
      const actor = await actorOf4(context);
      const locationId = args.locationId ? String(args.locationId) : null;
      const a = requireFlag(actor, "canManagePayroll", locationId ?? void 0);
      if (!locationId && !isOwnerActor(a)) throw new CommandError("Pick a location.");
      const where = eligibleWhere(requireDate(args.periodStart, "Period start"), requireDate(args.periodEnd, "Period end"), locationId);
      return { tutors: await tutorTotals(prisma, where) };
    }),
    /** The signed-in tutor's own lines: every session, minutes, rate, amount, paid date (W10.4). */
    myPayStatement: async (_, args, context) => {
      const prisma = context.sudo().prisma;
      const actor = await actorOf4(context);
      if (!actor?.tutorId) return null;
      const to = args.to ? requireDate(args.to, "To") : /* @__PURE__ */ new Date();
      const from = args.from ? requireDate(args.from, "From") : new Date(to.getTime() - 90 * DAY);
      const lines = await prisma.payLine.findMany({
        where: { tutorId: actor.tutorId, status: { not: "void" }, workedAt: { gte: from, lt: to } },
        orderBy: { workedAt: "desc" },
        take: 500,
        select: { id: true, kind: true, workedAt: true, minutes: true, rate: true, amount: true, status: true, note: true, session: { select: { program: { select: { name: true } } } }, payrollRun: { select: { id: true, status: true, paidAt: true } } }
      });
      return {
        from,
        to,
        totals: { accrued: lines.filter((l) => l.status === "accrued").reduce((s, l) => s + l.amount, 0), approved: lines.filter((l) => l.status === "approved").reduce((s, l) => s + l.amount, 0), paid: lines.filter((l) => l.status === "paid").reduce((s, l) => s + l.amount, 0) },
        lines: lines.map((l) => ({ id: l.id, kind: l.kind, workedAt: l.workedAt, programme: l.session?.program?.name ?? null, minutes: l.minutes, rate: l.rate, amount: l.amount, status: l.status, note: l.note, paidAt: l.payrollRun?.paidAt ?? null }))
      };
    }
  },
  Mutation: {
    addPayLine: (_, args, context) => runCommand(context, { name: "addPayLine", idempotencyKey: keyOf7(args), input: { t: args.tutorId, k: args.kind, a: args.amount, m: args.minutes ?? null, w: args.workedAt ?? null, s: args.sessionId ?? null, n: args.note } }, async (tx, actor) => {
      const tutor = await tutorLocation(tx, String(args.tutorId));
      let sessionLocation2 = null;
      if (args.sessionId) {
        const s = await tx.session.findUnique({ where: { id: String(args.sessionId) }, select: { id: true, tutorId: true, locationId: true } });
        if (!s || s.tutorId !== tutor.id) throw new CommandError("That session is not this tutor\u2019s.");
        sessionLocation2 = s.locationId;
      }
      const a = sessionLocation2 ? requireFlag(actor, "canManagePayroll", sessionLocation2) : requirePayrollFor(actor, tutor.locations.map((l) => l.id));
      const kind = String(args.kind);
      if (!MANUAL_KINDS.includes(kind)) throw new CommandError(`Pick a line kind: ${MANUAL_KINDS.join(", ")}.`);
      const raw = Number(args.amount);
      if (!Number.isInteger(raw) || raw === 0 || Math.abs(raw) > 1e7) throw new CommandError("Enter an amount (in cents), not zero.");
      const amount = kind === "deduction" ? -Math.abs(raw) : kind === "adjustment" ? raw : Math.abs(raw);
      const minutes = args.minutes == null ? 0 : requireInt(args.minutes, "Minutes", 0, 24 * 60);
      const workedAt = args.workedAt ? requireDate(args.workedAt, "Worked on") : /* @__PURE__ */ new Date();
      const note = requireString(args.note, "Note", 500);
      const rate = minutes > 0 && amount > 0 ? Math.round(amount * 60 / minutes) : 0;
      const line = await tx.payLine.create({
        data: {
          tutor: { connect: { id: tutor.id } },
          ...args.sessionId ? { session: { connect: { id: String(args.sessionId) } } } : {},
          kind,
          workedAt,
          minutes,
          rate,
          amount,
          status: "accrued",
          note,
          createdBy: { connect: { id: a.userId } }
        }
      });
      await recordChange(tx, { type: "PayLine", id: line.id, to: "accrued", actorId: a.userId, reason: note, data: { kind, amount } });
      return { id: line.id, data: { amount } };
    }),
    voidPayLine: (_, args, context) => runCommand(context, { name: "voidPayLine", idempotencyKey: keyOf7(args), input: { l: args.payLineId, r: args.reason } }, async (tx, actor) => {
      const line = await tx.payLine.findUnique({ where: { id: String(args.payLineId) }, select: { id: true, status: true, tutorId: true, payrollRunId: true, payrollRun: { select: { status: true } }, session: { select: { locationId: true } } } });
      if (!line) throw new CommandError("That pay line was not found.");
      const a = line.session?.locationId ? requireFlag(actor, "canManagePayroll", line.session.locationId) : requirePayrollFor(actor, (await tutorLocation(tx, line.tutorId)).locations.map((l) => l.id));
      if (line.status !== "accrued") throw new CommandError("Approved and paid lines are locked. Add an adjustment line to the next run instead.");
      const reason = requireString(args.reason, "Reason", 300);
      await transition(tx, a, "payLine", "PayLine", line.id, "accrued", "void", { activeKey: null, voidReason: reason, payrollRunId: null }, reason);
      return { id: line.id };
    }),
    createPayrollRun: (_, args, context) => runCommand(context, { name: "createPayrollRun", idempotencyKey: keyOf7(args), input: { s: args.periodStart ?? null, e: args.periodEnd ?? null, l: args.locationId ?? null } }, async (tx, actor) => {
      const locationId = args.locationId ? String(args.locationId) : null;
      const a = locationId ? requireFlag(actor, "canManagePayroll", locationId) : requireFlag(actor, "canManagePayroll");
      if (!locationId && !isOwnerActor(a)) throw new CommandError("Pick a location. Only the owner runs payroll for all locations.");
      const settings = await getSettings(tx);
      const periodEnd = args.periodEnd ? requireDate(args.periodEnd, "Period end") : /* @__PURE__ */ new Date();
      const periodStart = args.periodStart ? requireDate(args.periodStart, "Period start") : new Date(periodEnd.getTime() - settings.payrollPeriodDays * DAY);
      if (periodStart >= periodEnd) throw new CommandError("The period must end after it starts.");
      if (periodEnd.getTime() - periodStart.getTime() > 62 * DAY) throw new CommandError("A run covers at most two months.");
      await lockKey(tx, `payroll:${locationId ?? "all"}`);
      const open = await tx.payrollRun.findFirst({ where: { status: "draft", locationId }, select: { id: true } });
      if (open) throw new CommandError("A draft run is already open here. Approve or cancel it first.", { payrollRunId: open.id });
      const where = eligibleWhere(periodStart, periodEnd, locationId);
      const lines = await tx.payLine.findMany({ where, select: { id: true } });
      if (!lines.length) throw new CommandError("No unpaid lines in that period.");
      const run = await tx.payrollRun.create({ data: { ...locationId ? { location: { connect: { id: locationId } } } : {}, periodStart, periodEnd, status: "draft", payments: [], createdBy: { connect: { id: a.userId } } } });
      const claimed = await tx.payLine.updateMany({ where: { id: { in: lines.map((l) => l.id) }, status: "accrued", payrollRunId: null }, data: { payrollRunId: run.id } });
      await recordChange(tx, { type: "PayrollRun", id: run.id, to: "draft", actorId: a.userId, data: { lines: claimed.count } });
      return { id: run.id, data: { lines: claimed.count, tutors: await tutorTotals(tx, { payrollRunId: run.id }) } };
    }),
    approvePayrollRun: (_, args, context) => runCommand(context, { name: "approvePayrollRun", idempotencyKey: keyOf7(args), input: { r: args.payrollRunId } }, async (tx, actor) => {
      const run = await runFor(tx, String(args.payrollRunId));
      const a = requireFlag(actor, "canManagePayroll", run.locationId ?? void 0);
      if (!isOwnerActor(a)) throw new CommandError("Only the owner approves a payroll run.");
      await lockKey(tx, `payroll-run:${run.id}`);
      await transition(tx, a, "payrollRun", "PayrollRun", run.id, "draft", "approved", { approvedById: a.userId, approvedAt: /* @__PURE__ */ new Date() });
      const moved = await tx.payLine.updateMany({ where: { payrollRunId: run.id, status: "accrued" }, data: { status: "approved" } });
      const total = await tx.payLine.aggregate({ where: { payrollRunId: run.id, status: "approved" }, _sum: { amount: true } });
      return { id: run.id, data: { lines: moved.count, total: total._sum.amount ?? 0 } };
    }),
    cancelPayrollRun: (_, args, context) => runCommand(context, { name: "cancelPayrollRun", idempotencyKey: keyOf7(args), input: { r: args.payrollRunId, x: args.reason } }, async (tx, actor) => {
      const run = await runFor(tx, String(args.payrollRunId));
      const a = requireFlag(actor, "canManagePayroll", run.locationId ?? void 0);
      if (!run.locationId && !isOwnerActor(a)) throw new CommandError("Only the owner cancels the all-locations run.");
      const reason = requireString(args.reason, "Reason", 300);
      await lockKey(tx, `payroll-run:${run.id}`);
      await transition(tx, a, "payrollRun", "PayrollRun", run.id, "draft", "cancelled", {}, reason);
      const released = await tx.payLine.updateMany({ where: { payrollRunId: run.id, status: "accrued" }, data: { payrollRunId: null } });
      return { id: run.id, data: { released: released.count } };
    }),
    markPayrollRunPaid: (_, args, context) => runCommand(context, { name: "markPayrollRunPaid", idempotencyKey: keyOf7(args), input: { r: args.payrollRunId, p: args.payments } }, async (tx, actor) => {
      const run = await runFor(tx, String(args.payrollRunId));
      const a = requireFlag(actor, "canManagePayroll", run.locationId ?? void 0);
      if (!isOwnerActor(a)) throw new CommandError("Only the owner marks a payroll run paid.");
      await lockKey(tx, `payroll-run:${run.id}`);
      if (run.status !== "approved") throw new CommandError(run.status === "paid" ? "This run is already marked paid." : "Approve the run before marking it paid.");
      const totals = await tutorTotals(tx, { payrollRunId: run.id });
      const input = Array.isArray(args.payments) ? args.payments : [];
      const byTutor = new Map(input.map((p) => [String(p?.tutorId ?? ""), p]));
      const now = /* @__PURE__ */ new Date();
      const payments = totals.map((t) => {
        const p = byTutor.get(t.tutorId);
        if (!p) throw new CommandError(`Record how ${t.name || "each tutor"} was paid.`);
        const method = String(p.method ?? "");
        if (!PAY_METHODS.includes(method)) throw new CommandError(`Pick a payment method for ${t.name}: ${PAY_METHODS.join(", ")}.`);
        const reference = optionalString(p.reference, 200);
        if (method !== "cash" && !reference) throw new CommandError(`Enter the payment reference for ${t.name}.`);
        return { tutorId: t.tutorId, name: t.name, amount: t.amount, method, reference, paidAt: (p.paidAt ? requireDate(p.paidAt, "Paid on") : now).toISOString() };
      });
      const extra = input.filter((p) => !totals.some((t) => t.tutorId === String(p?.tutorId ?? "")));
      if (extra.length) throw new CommandError("One of the payments is for a tutor who is not in this run.");
      await transition(tx, a, "payrollRun", "PayrollRun", run.id, "approved", "paid", { paidAt: now, payments });
      const moved = await tx.payLine.updateMany({ where: { payrollRunId: run.id, status: "approved" }, data: { status: "paid" } });
      return { id: run.id, data: { lines: moved.count, payments } };
    })
  }
};

// features/keystone/queries/storefront.ts
var storefront_exports = {};
__export(storefront_exports, {
  resolvers: () => resolvers8,
  typeDefs: () => typeDefs8,
  tzOffset: () => tzOffset,
  zonedTime: () => zonedTime
});
var gql8 = String.raw;
var typeDefs8 = gql8`
  type Query {
    storefrontBusiness: JSON
    storefrontPrograms(subject: String, level: String, mode: String): JSON
    storefrontProgram(slug: String!): JSON
    storefrontLocations: JSON
    storefrontLocation(slug: String!): JSON
    storefrontTutors(filter: JSON): JSON
    storefrontTutor(slug: String!): JSON
    storefrontPricing: JSON
    enrolmentOptions(programId: ID!): JSON
    storefrontPolicies: JSON
    assessmentSlots(programId: ID!, locationId: ID, mode: String, from: String, to: String): JSON
    openSessions(programId: ID, locationId: ID, from: String, to: String): JSON
    myFamily: JSON
    myStudent(id: ID!): JSON
    myUpcomingBookings(includePast: Boolean, studentId: ID): JSON
    myBooking(id: ID!): JSON
    myAssessment(id: ID!): JSON
    myEnrolment(id: ID!): JSON
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
var resolvers8 = {
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
    /** Weekly class times (open group series) a family can pick at enrolment, with seats left. */
    async enrolmentOptions(_, { programId }, context) {
      const prisma = context.sudo().prisma;
      const now = /* @__PURE__ */ new Date();
      const series = await prisma.sessionSeries.findMany({
        where: { programId, status: "active", enrollmentId: null, OR: [{ endDate: null }, { endDate: { gt: now } }], program: { status: "published" } },
        include: { location: { select: { id: true, name: true, slug: true, timezone: true, status: true } }, subject: { select: { name: true } }, tutor: { select: { displayName: true, publicProfile: true } } },
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }]
      });
      const live = series.filter((s) => !s.location || s.location.status !== "closed");
      const out = await Promise.all(live.map(async (s) => {
        const next = await prisma.session.findFirst({ where: { seriesId: s.id, status: "scheduled", startsAt: { gt: now } }, orderBy: { startsAt: "asc" }, select: { id: true, startsAt: true, capacity: true, _count: { select: { bookings: { where: { status: "booked" } } } } } });
        const capacity = next?.capacity ?? s.capacity;
        return {
          id: s.id,
          weekday: s.weekday,
          startMinute: s.startMinute,
          minutes: s.minutes,
          mode: s.mode,
          location: s.location ? { id: s.location.id, name: s.location.name, slug: s.location.slug } : null,
          timezone: s.location?.timezone || await defaultTimezone(prisma),
          subject: s.subject?.name ?? null,
          tutor: s.tutor?.publicProfile ? s.tutor.displayName : null,
          capacity,
          seatsLeft: Math.max(0, capacity - (next?._count.bookings ?? 0)),
          nextStartsAt: next?.startsAt ?? null
        };
      }));
      return { series: out };
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
          memberships: family.memberships.map((m) => ({ id: m.id, status: m.status, price: m.price, planName: m.plan?.name, programName: m.plan?.program?.name, studentName: m.student?.firstName, currentPeriodEnd: m.currentPeriodEnd, cancelRequestedAt: m.cancelRequestedAt, endsAt: m.endsAt, pausedFrom: m.pausedFrom, pausedUntil: m.pausedUntil, pauseRequestedFrom: m.pauseRequestedFrom, lastPauseAt: m.lastPauseAt ?? null })),
          upcoming: nextBookings.map((b) => ({ id: b.id, status: b.status, student: b.student, session: sessionOut(b.session) })),
          assessments: assessments.map((a) => ({ id: a.id, scheduledAt: a.scheduledAt, minutes: a.minutes, mode: a.mode, program: a.program, location: a.location, student: a.student })),
          alerts
        },
        settings: { pauseMinDays: settings?.pauseMinDays ?? 14, pauseMaxDays: settings?.pauseMaxDays ?? 28, membershipCancelNoticeDays: settings?.membershipCancelNoticeDays ?? 30, pausesPerYear: settings?.pausesPerYear ?? 1 }
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
    /** One of the family's enrolments with its checkout invoice (enrol confirmation, retry payment). */
    async myEnrolment(_, { id }, context) {
      const familyId = await myFamilyId(context);
      if (!familyId) return null;
      const prisma = context.sudo().prisma;
      const e = await prisma.enrollment.findFirst({
        where: { id, familyId },
        include: {
          program: { select: { id: true, name: true, slug: true, format: true } },
          student: { select: { id: true, firstName: true, lastName: true } },
          location: { select: { id: true, name: true, timezone: true } },
          tutor: { select: { displayName: true } },
          membership: { select: { status: true, price: true, currentPeriodEnd: true, plan: { select: { name: true } } } },
          studentPackage: { select: { status: true, hours: true, price: true, package: { select: { name: true } } } },
          bookings: { where: { status: "booked" }, select: { id: true, session: { select: { startsAt: true, endsAt: true } } }, orderBy: { session: { startsAt: "asc" } }, take: 6 }
        }
      });
      if (!e) return null;
      const lines = await prisma.invoiceLine.findMany({ where: { OR: [e.membershipId ? { membershipId: e.membershipId } : { id: "_" }, e.studentPackageId ? { studentPackageId: e.studentPackageId } : { id: "_" }] }, select: { invoiceId: true }, take: 1, orderBy: { createdAt: "asc" } });
      const invoice = lines[0]?.invoiceId ? await prisma.invoice.findUnique({ where: { id: lines[0].invoiceId }, select: { id: true, number: true, status: true, total: true, amountPaid: true, currency: true, fulfilment: true } }) : null;
      const tz = e.location?.timezone || await defaultTimezone(prisma);
      return {
        id: e.id,
        status: e.status,
        mode: e.mode,
        fundingType: e.fundingType,
        startDate: e.startDate,
        timezone: tz,
        program: e.program,
        student: e.student,
        location: e.location,
        tutor: e.tutor?.displayName ?? null,
        membership: e.membership ? { status: e.membership.status, price: e.membership.price, planName: e.membership.plan?.name, currentPeriodEnd: e.membership.currentPeriodEnd } : null,
        studentPackage: e.studentPackage ? { status: e.studentPackage.status, hours: e.studentPackage.hours, price: e.studentPackage.price, name: e.studentPackage.package?.name } : null,
        upcoming: e.bookings.map((b) => ({ id: b.id, startsAt: b.session?.startsAt, endsAt: b.session?.endsAt })),
        invoice: invoice ? { id: invoice.id, number: invoice.number, status: invoice.status, total: invoice.total, amountPaid: invoice.amountPaid, currency: invoice.currency, missedSeats: invoice.fulfilment?.missedSeats ?? 0 } : null
      };
    },
    /** One of the family's assessments, with its fee invoice (confirmation page, schedule row). */
    async myAssessment(_, { id }, context) {
      const familyId = await myFamilyId(context);
      if (!familyId) return null;
      const prisma = context.sudo().prisma;
      const a = await prisma.assessment.findFirst({
        where: { id, familyId },
        include: {
          program: { select: { id: true, name: true, slug: true } },
          student: { select: { id: true, firstName: true, lastName: true } },
          location: { select: { id: true, name: true, slug: true, timezone: true, addressLine1: true, city: true, region: true, postalCode: true, phone: true } },
          room: { select: { name: true } },
          assessor: { select: { displayName: true } },
          invoice: { select: { id: true, number: true, status: true, total: true, amountPaid: true, currency: true } }
        }
      });
      if (!a) return null;
      const [settings, tz] = await Promise.all([prisma.businessSettings.findUnique({ where: { id: 1 } }), defaultTimezone(prisma)]);
      return {
        id: a.id,
        status: a.status,
        kind: a.kind,
        mode: a.mode,
        scheduledAt: a.scheduledAt,
        minutes: a.minutes,
        fee: a.fee,
        endsAt: new Date(a.scheduledAt.getTime() + (a.minutes || 0) * 6e4),
        timezone: a.location?.timezone || tz,
        program: a.program,
        student: a.student,
        location: a.location,
        room: a.room,
        assessor: a.assessor?.displayName ?? null,
        invoice: a.invoice,
        refundHours: settings?.assessmentCancelRefundHours ?? 24
      };
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
var modules = [storefront_exports, schedule_exports, assessments_exports, billing_exports, memberships_exports, families_exports, tutors_exports, payroll_exports];
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
var import_nodemailer2 = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer2.createTransport)({
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
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer2.getTestMessageUrl)(info)}`);
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

// features/keystone/index.ts
init_access();

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
function withSocketTimeout(url) {
  if (!/^postgres(ql)?:\/\//.test(url)) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("socket_timeout")) u.searchParams.set("socket_timeout", "150");
    return u.toString();
  } catch {
    return url;
  }
}
var databaseURL = withSocketTimeout(process.env.DATABASE_URL || "file:./keystone.db");
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
