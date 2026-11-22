/**
 * W11/§4.3/§6.3 families and learning: guardian sign-up, students, plan propose → accept/decline
 * with versioned revision, session report → guardian sees it, progress report draft → publish →
 * acknowledge, staff contact log on the family timeline, staff-recorded review moderated.
 */
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { getTestContext, resetDatabase, skipReason } from './helpers/db'
import { world, family, grant, gql, BOOK, MARK, moveSessionTo, HOUR } from './helpers/fixtures'
import { draftDueProgressReports } from '../features/keystone/mutations/families'

let ctx: any
let prisma: any
before(async () => {
  if (skipReason) return
  ctx = await getTestContext()
  prisma = ctx.prisma
  await resetDatabase(ctx)
})

const R = '{ success error id data }'

test('guardian signs up, signs in with the password, adds and edits a student; duplicates refused', { skip: skipReason }, async () => {
  await world(prisma)
  const email = `sign.${Date.now()}@example.com`
  const reg = (await gql(ctx, null, `mutation($d: JSON!) { registerGuardian(data: $d) ${R} }`, { d: { name: 'Priya Shah', email, password: 'correct horse 42', phone: '555-0101' } })).registerGuardian
  assert.equal(reg.success, true, reg.error)
  const u = await prisma.user.findUnique({ where: { id: reg.data.userId }, include: { role: true, family: { include: { guardians: true } } } })
  assert.equal(u.role.name, 'Customer')
  assert.equal(u.family.id, reg.data.familyId)
  assert.equal(u.family.guardians[0].id, u.id)
  assert.equal(u.family.billingEmail, email)
  assert.notEqual(u.password, 'correct horse 42', 'password stored hashed')
  // the stored hash is the one Keystone's sign-in checks (bcrypt, via the password field)
  const bcrypt = (await import('bcryptjs' as any)).default
  assert.equal(await bcrypt.compare('correct horse 42', u.password), true)
  const dup = (await gql(ctx, null, `mutation($d: JSON!) { registerGuardian(data: $d) ${R} }`, { d: { name: 'Priya Again', email: email.toUpperCase(), password: 'another pass 9' } })).registerGuardian
  assert.equal(dup.success, false)
  assert.match(dup.error, /already has an account/)
  const add = (await gql(ctx, u.id, `mutation($d: JSON!) { addStudent(data: $d) ${R} }`, { d: { firstName: 'Anya', lastName: 'Shah', school: 'Lincoln Middle', pickupPeople: [{ name: 'Raj Shah', relation: 'uncle' }] } })).addStudent
  assert.equal(add.success, true, add.error)
  const upd = (await gql(ctx, u.id, `mutation($s: ID!, $d: JSON!) { updateStudent(studentId: $s, data: $d) ${R} }`, { s: add.id, d: { learningNotes: 'Prefers diagrams', status: 'alumni' } })).updateStudent
  assert.equal(upd.success, true, upd.error)
  const s = await prisma.student.findUnique({ where: { id: add.id } })
  assert.equal(s.learningNotes, 'Prefers diagrams')
  assert.equal(s.status, 'prospect', 'a guardian cannot set student status')
  // another family's guardian cannot edit this student
  const other = await family(prisma, (await world(prisma)).roles, 1, 'Other')
  const denied = (await gql(ctx, other.guardian.id, `mutation($s: ID!, $d: JSON!) { updateStudent(studentId: $s, data: $d) ${R} }`, { s: add.id, d: { school: 'X' } })).updateStudent
  assert.equal(denied.success, false)
})

test('learning plan: propose (lead → proposal_sent), decline raises a task, revise → v2 and v1 archived, accept', { skip: skipReason }, async () => {
  const w = await world(prisma)
  const f = await family(prisma, w.roles, 1, 'Plan')
  await prisma.family.update({ where: { id: f.family.id }, data: { primaryLocationId: w.location.id } })
  const lead = await prisma.lead.create({ data: { guardianName: 'Ana Plan', email: f.guardian.email, familyId: f.family.id, studentId: f.students[0].id, status: 'assessed', locationId: w.location.id } })
  const PROPOSE = `mutation($p: ID, $d: JSON) { proposeLearningPlan(planId: $p, data: $d) ${R} }`
  const p1 = (await gql(ctx, w.manager.id, PROPOSE, { d: { studentId: f.students[0].id, programId: w.program.id, summary: 'Close fraction gaps', sessionsPerWeek: 2, goals: [{ title: 'Add unlike fractions', baseline: '2/10', target: '9/10' }, { title: 'Word problems' }] } })).proposeLearningPlan
  assert.equal(p1.success, true, p1.error)
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, 'proposal_sent')
  // the tutor (no family flag) cannot propose
  assert.equal((await gql(ctx, w.tutorUser.id, PROPOSE, { d: { studentId: f.students[0].id, programId: w.program.id, goals: [{ title: 'x' }] } })).proposeLearningPlan.success, false)
  const dec = (await gql(ctx, f.guardian.id, `mutation($p: ID!, $r: String) { declineLearningPlan(planId: $p, reason: $r) ${R} }`, { p: p1.id, r: 'Too many sessions' })).declineLearningPlan
  assert.equal(dec.success, true, dec.error)
  const task = await prisma.task.findUnique({ where: { openKey: `plan-declined:${p1.id}` } })
  assert.equal(task.kind, 'proposal_follow_up')
  // re-propose the declined plan with one session a week, then accept
  const again = (await gql(ctx, w.manager.id, PROPOSE, { p: p1.id, d: { sessionsPerWeek: 1 } })).proposeLearningPlan
  assert.equal(again.success, true, again.error)
  const acc = (await gql(ctx, f.guardian.id, `mutation($p: ID!) { acceptLearningPlan(planId: $p) ${R} }`, { p: p1.id })).acceptLearningPlan
  assert.equal(acc.success, true, acc.error)
  assert.equal(acc.data.programId, w.program.id)
  // revision of an accepted plan: v2 proposed, v1 archived, goals copied
  const rev = (await gql(ctx, w.manager.id, PROPOSE, { p: p1.id, d: { summary: 'Fractions then ratios' } })).proposeLearningPlan
  assert.equal(rev.success, true, rev.error)
  const v1 = await prisma.learningPlan.findUnique({ where: { id: p1.id } })
  const v2 = await prisma.learningPlan.findUnique({ where: { id: rev.id }, include: { goals: true } })
  assert.equal(v1.status, 'archived')
  assert.equal(v2.version, 2)
  assert.equal(v2.previousVersionId, v1.id)
  assert.equal(v2.goals.length, 2)
  assert.equal(v2.status, 'proposed')
  // goal moves by staff; a guardian cannot
  const goal = v2.goals[0]
  assert.equal((await gql(ctx, f.guardian.id, `mutation($g: ID!) { setGoalStatus(goalId: $g, status: "mastered") ${R} }`, { g: goal.id })).setGoalStatus.success, false)
  const gm = (await gql(ctx, w.manager.id, `mutation($g: ID!) { setGoalStatus(goalId: $g, status: "mastered") ${R} }`, { g: goal.id })).setGoalStatus
  assert.equal(gm.success, true, gm.error)
  assert.ok((await prisma.planGoal.findUnique({ where: { id: goal.id } })).masteredAt)
})

test('session report → guardian sees it; progress report draft (daily job) → publish → acknowledge → withdraw', { skip: skipReason }, async () => {
  const w = await world(prisma, { capacity: 4 })
  const f = await family(prisma, w.roles, 1, 'Report')
  await prisma.family.update({ where: { id: f.family.id }, data: { primaryLocationId: w.location.id, billingEmail: f.guardian.email } })
  await grant(prisma, { familyId: f.family.id, studentId: f.students[0].id, minutes: 600 })
  const enrol = await prisma.enrollment.create({ data: { studentId: f.students[0].id, familyId: f.family.id, programId: w.program.id, locationId: w.location.id, tutorId: w.tutor.id, status: 'active', fundingType: 'package', startDate: new Date(Date.now() - 30 * 24 * HOUR) } })
  const b = (await gql(ctx, f.guardian.id, BOOK, { s: w.session.id, st: f.students[0].id })).bookSession
  assert.equal(b.success, true, b.error)
  await prisma.booking.update({ where: { id: b.id }, data: { enrollmentId: enrol.id } })
  await moveSessionTo(prisma, w.session.id, new Date(Date.now() - 2 * HOUR))
  const REPORT = `mutation($b: ID!, $d: JSON!) { publishSessionReport(bookingId: $b, data: $d) ${R} }`
  const early = (await gql(ctx, w.tutorUser.id, REPORT, { b: b.id, d: { topicsCovered: 'Fractions' } })).publishSessionReport
  assert.equal(early.success, false, 'report needs attendance first')
  assert.equal((await gql(ctx, w.tutorUser.id, MARK, { b: b.id, o: 'attended' })).markAttendance.success, true)
  const rep = (await gql(ctx, w.tutorUser.id, REPORT, { b: b.id, d: { topicsCovered: 'Adding unlike fractions', wentWell: 'Quick with common denominators.', toImprove: 'Simplify answers.', homework: 'Worksheet 3', effort: 4 } })).publishSessionReport
  assert.equal(rep.success, true, rep.error)
  const sr = await prisma.sessionReport.findUnique({ where: { id: rep.id } })
  assert.ok(sr.publishedAt)
  assert.equal(sr.homeworkStatus, 'set')
  // another family's guardian cannot mark it seen; this guardian can
  const other = await family(prisma, w.roles, 1, 'Nosy')
  assert.equal((await gql(ctx, other.guardian.id, `mutation($r: ID!) { markSessionReportSeen(reportId: $r) ${R} }`, { r: rep.id })).markSessionReportSeen.success, false)
  assert.equal((await gql(ctx, f.guardian.id, `mutation($r: ID!) { markSessionReportSeen(reportId: $r) ${R} }`, { r: rep.id })).markSessionReportSeen.success, true)
  assert.ok((await prisma.sessionReport.findUnique({ where: { id: rep.id } })).guardianSeenAt)
  assert.equal((await gql(ctx, w.tutorUser.id, `mutation($r: ID!) { setHomeworkStatus(reportId: $r, status: "done") ${R} }`, { r: rep.id })).setHomeworkStatus.success, true)
  // daily job drafts a progress report after 4 weeks; running it twice makes one
  const d1 = await draftDueProgressReports(prisma)
  const d2 = await draftDueProgressReports(prisma)
  assert.ok(d1.drafted >= 1)
  assert.equal(d2.drafted, 0)
  const pr = await prisma.progressReport.findFirst({ where: { enrollmentId: enrol.id } })
  assert.equal(pr.status, 'draft')
  assert.equal(pr.sessionsAttended, 1)
  assert.match(pr.narrative, /Adding unlike fractions/)
  const pub = (await gql(ctx, w.tutorUser.id, `mutation($r: ID!, $d: JSON) { publishProgressReport(reportId: $r, data: $d) ${R} }`, { r: pr.id, d: { narrative: 'Anya has closed the fraction gap.' } })).publishProgressReport
  assert.equal(pub.success, true, pub.error)
  assert.ok(await prisma.notificationLog.findFirst({ where: { relatedType: 'ProgressReport', relatedId: pr.id, template: 'progress_report' } }))
  assert.equal((await gql(ctx, f.guardian.id, `mutation($r: ID!) { acknowledgeProgressReport(reportId: $r) ${R} }`, { r: pr.id })).acknowledgeProgressReport.success, true)
  assert.equal((await prisma.progressReport.findUnique({ where: { id: pr.id } })).status, 'acknowledged')
  assert.equal((await gql(ctx, w.tutorUser.id, `mutation($r: ID!) { withdrawProgressReport(reportId: $r, reason: "x") ${R} }`, { r: pr.id })).withdrawProgressReport.success, false, 'tutor cannot withdraw')
  const wd = (await gql(ctx, w.manager.id, `mutation($r: ID!) { withdrawProgressReport(reportId: $r, reason: "Wrong student attached") ${R} }`, { r: pr.id })).withdrawProgressReport
  assert.equal(wd.success, true, wd.error)
})

test('staff log family contact (not visible to family, lead contacted, task closed); recordReview pending → published', { skip: skipReason }, async () => {
  const w = await world(prisma)
  const f = await family(prisma, w.roles, 1, 'Contact')
  await prisma.family.update({ where: { id: f.family.id }, data: { primaryLocationId: w.location.id } })
  const lead = await prisma.lead.create({ data: { guardianName: 'Ana Contact', email: f.guardian.email, familyId: f.family.id, status: 'new', locationId: w.location.id } })
  const task = await prisma.task.create({ data: { kind: 'lead_follow_up', title: 'Call back', familyId: f.family.id, openKey: `t:${f.family.id}` } })
  const LOG = `mutation($f: ID!, $d: JSON!) { logFamilyContact(familyId: $f, data: $d) ${R} }`
  assert.equal((await gql(ctx, f.guardian.id, LOG, { f: f.family.id, d: { body: 'x' } })).logFamilyContact.success, false, 'guardians cannot log staff contact')
  const k = `contact-${Date.now()}`
  const logged = (await gql(ctx, w.frontDesk.id, `mutation($f: ID!, $d: JSON!, $k: String) { logFamilyContact(familyId: $f, data: $d, idempotencyKey: $k) ${R} }`, { f: f.family.id, d: { channel: 'phone', direction: 'outbound', body: 'Called about Tuesday times; prefers 4pm.', taskId: task.id }, k })).logFamilyContact
  assert.equal(logged.success, true, logged.error)
  const replay = (await gql(ctx, w.frontDesk.id, `mutation($f: ID!, $d: JSON!, $k: String) { logFamilyContact(familyId: $f, data: $d, idempotencyKey: $k) ${R} }`, { f: f.family.id, d: { channel: 'phone', direction: 'outbound', body: 'Called about Tuesday times; prefers 4pm.', taskId: task.id }, k })).logFamilyContact
  assert.equal(replay.id, logged.id, 'idempotent replay')
  assert.equal(await prisma.message.count({ where: { familyId: f.family.id } }), 1)
  const m = await prisma.message.findUnique({ where: { id: logged.id } })
  assert.equal(m.visibleToFamily, false)
  const l = await prisma.lead.findUnique({ where: { id: lead.id } })
  assert.equal(l.status, 'contacted')
  assert.ok(l.lastContactedAt)
  const t = await prisma.task.findUnique({ where: { id: task.id } })
  assert.equal(t.status, 'done')
  assert.equal(t.openKey, null)
  // review about a tutor who never taught the family is refused
  const REVIEW = `mutation($f: ID!, $d: JSON!) { recordReview(familyId: $f, data: $d) ${R} }`
  assert.equal((await gql(ctx, w.frontDesk.id, REVIEW, { f: f.family.id, d: { rating: 5, tutorId: w.tutor.id, text: 'Great' } })).recordReview.success, false)
  const rv = (await gql(ctx, w.frontDesk.id, REVIEW, { f: f.family.id, d: { rating: 5, programId: w.program.id, authorName: 'Ana C.', text: 'Clear progress in six weeks.', source: 'email' } })).recordReview
  assert.equal(rv.success, true, rv.error)
  assert.equal((await prisma.review.findUnique({ where: { id: rv.id } })).status, 'pending')
  assert.equal((await gql(ctx, w.frontDesk.id, `mutation($r: ID!) { moderateReview(reviewId: $r, status: "published") ${R} }`, { r: rv.id })).moderateReview.success, false, 'front desk cannot publish')
  assert.equal((await gql(ctx, w.owner.id, `mutation($r: ID!) { moderateReview(reviewId: $r, status: "published") ${R} }`, { r: rv.id })).moderateReview.success, true)
  assert.equal((await prisma.review.findUnique({ where: { id: rv.id } })).status, 'published')
})
