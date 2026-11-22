/**
 * §9 starter history on top of the catalogue: staff, 12 families with 18 students, assessments
 * with results, learning plans with goals, enrolments with memberships or packages, six weeks of
 * attendance with session reports and pay lines, four weeks of booked fixed seats, leads at every
 * stage, one past-due membership, one enrolment waiting for a match, a paid and a draft payroll
 * run, tutor applications at three stages.
 *
 * Every ledger move goes through the real primitives (pickGrant, reserveMinutes, writeHold,
 * markSeat, releaseHold, rollOverGrant, accruePay); future seats go through bookFixedSeats →
 * bookSeat. Historic payments are recorded as offline payments (bank transfer, cheque, cash) so no
 * card charge is ever invented. Seeded people use example.com addresses, which never deliver, so
 * the daily jobs cannot email a stranger.
 */
import { randomBytes } from 'node:crypto'
import { addMonths } from 'date-fns'
// @ts-expect-error bcryptjs ships no types; Keystone's password field uses it too
import bcrypt from 'bcryptjs'
import { TZDate } from '@date-fns/tz'
import type { Catalogue } from './catalogue'
import { ROLE_TEMPLATES } from '../roles'
import { recordChange } from '../command'
import { CommandError } from '../errors'
import { pickGrant, reserveMinutes, writeHold, releaseHold, createGrant, rollOverGrant } from '../ledger'
import { markSeat } from '../booking'
import { accruePay } from '../pay'
import { createInvoice, applyToInvoice } from '../invoices'
import { startMembershipPeriod, bookFixedSeats } from '../enrolment'
import { generateSessions, localStart } from '../schedule'
import { holdAssessmentSlot } from '../assessments'
import { getSettings, DAY, HOUR } from '../settings'
import type { Actor } from '../actor'

type Tx = any
const dollars = (n: number) => Math.round(n * 100)
const MAIL = 'example.com'
const emailOf = (first: string, last: string) => `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + `@${MAIL}`

/** A deterministic sequence so the starter set looks the same every time it is loaded. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

async function unusablePassword() {
  // Seeded staff and guardians sign in after the owner sets a password or they use "forgot password".
  return bcrypt.hash(randomBytes(24).toString('base64url'), 10)
}

export async function ensureRoles(tx: Tx) {
  const out: Record<string, string> = {}
  for (const [key, t] of Object.entries(ROLE_TEMPLATES)) {
    const r = await tx.role.upsert({ where: { name: t.name }, create: { ...t }, update: {} })
    out[key] = r.id
  }
  return out as Record<keyof typeof ROLE_TEMPLATES, string>
}

/** Weekly start times of a series between two instants, in the series' timezone. */
function weeklyStarts(weekday: number, startMinute: number, tz: string, from: Date, to: Date) {
  const out: Date[] = []
  let day = new TZDate(from.getTime(), tz)
  day = new TZDate(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, tz)
  for (let i = 0; i < 400 && day.getTime() <= to.getTime() + DAY; i += 1) {
    if (day.getDay() === weekday) {
      const at = localStart({ y: day.getFullYear(), m: day.getMonth(), d: day.getDate() }, startMinute, tz)
      if (at >= from && at < to) out.push(at)
    }
    day = new TZDate(day.getFullYear(), day.getMonth(), day.getDate() + 1, 12, 0, tz)
  }
  return out
}

/** A booking on a session that already happened: the §4.7 funding steps without the "not started" guard. */
async function historicBooking(tx: Tx, session: any, studentId: string, familyId: string, enrollmentId: string, actorId: string) {
  const minutes = Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60000)
  const grant = await pickGrant(tx, { familyId, studentId, programId: session.programId, minutes, startsAt: session.startsAt })
  if (!grant) return null
  try { await reserveMinutes(tx, grant, minutes, session.startsAt) } catch (error) { if (error instanceof CommandError) return null; throw error }
  const booking = await tx.booking.create({
    data: {
      session: { connect: { id: session.id } }, student: { connect: { id: studentId } }, family: { connect: { id: familyId } },
      enrollment: { connect: { id: enrollmentId } }, creditGrant: { connect: { id: grant.id } }, createdBy: { connect: { id: actorId } },
      status: 'booked', activeKey: `${session.id}:${studentId}`, source: grant.kind === 'make_up' ? 'make_up' : 'fixed_seat',
      payAsYouGo: false, minutes, startsAt: session.startsAt, endsAt: session.endsAt, createdAt: new Date(session.startsAt.getTime() - 7 * DAY),
    },
  })
  await writeHold(tx, grant, booking.id, minutes, actorId)
  await recordChange(tx, { type: 'Booking', id: booking.id, from: null, to: 'booked', actorId, data: { sessionId: session.id, grantId: grant.id } })
  return booking
}

type FamilySpec = {
  last: string; guardian: string; phone: string; city: string; postal: string; street: string; primary: 'maple' | 'riverside'
  students: Array<{
    first: string; level: string; school: string; program: string; funding: { plan: string } | { pkg: string }
    series?: number[]; oneToOne?: { tutor: string; mode: 'online' | 'in_home'; weekday: number; start: number; minutes: number }
    pendingMatch?: { slots: Array<{ weekday: number; startMinute: number }>; mode: 'in_home' | 'online' }
    pastDue?: boolean; started: number; notes?: string
  }>
  payBy: 'bank_transfer' | 'cheque' | 'cash'
}

// series index refers to Catalogue.series order (see catalogue.ts)
const FAMILIES: FamilySpec[] = [
  { last: 'Ruiz', guardian: 'Ana', phone: '(847) 555-0191', city: 'Evanston', postal: '60201', street: '1418 Hinman Avenue', primary: 'maple', payBy: 'bank_transfer', students: [
    { first: 'Mia', level: 'Grade 4', school: 'Lincoln Elementary', program: 'maths-foundations', funding: { plan: '8 sessions a month' }, series: [0], started: 44 },
    { first: 'Leo', level: 'Grade 2', school: 'Lincoln Elementary', program: 'reading-writing-lab', funding: { plan: '8 sessions a month' }, series: [3], started: 44 },
  ] },
  { last: 'Patel', guardian: 'Ravi', phone: '(847) 555-0123', city: 'Evanston', postal: '60202', street: '902 Forest Avenue', primary: 'maple', payBy: 'bank_transfer', students: [
    { first: 'Anika', level: 'Grade 11', school: 'Evanston Township High School', program: 'sat-prep', funding: { plan: '8 sessions a month' }, series: [5], started: 43 },
  ] },
  { last: 'Johnson', guardian: 'Keisha', phone: '(847) 555-0164', city: 'Glenview', postal: '60025', street: '2210 Sunset Ridge Road', primary: 'riverside', payBy: 'cheque', students: [
    { first: 'Jordan', level: 'Grade 11', school: 'Glenbrook South High School', program: 'act-prep', funding: { plan: '8 sessions a month' }, series: [8], started: 42 },
    { first: 'Maya', level: 'Grade 7', school: 'Springman Middle School', program: 'homework-club', funding: { pkg: '10 visits' }, series: [12], started: 30 },
  ] },
  { last: 'Nguyen', guardian: 'Linh', phone: '(847) 555-0137', city: 'Skokie', postal: '60076', street: '4920 Main Street', primary: 'riverside', payBy: 'bank_transfer', students: [
    { first: 'Ethan', level: 'Grade 5', school: 'Highland Elementary', program: 'maths-foundations', funding: { plan: '8 sessions a month' }, series: [2], started: 41 },
  ] },
  { last: "O'Brien", guardian: 'Siobhan', phone: '(847) 555-0118', city: 'Evanston', postal: '60201', street: '733 Judson Avenue', primary: 'maple', payBy: 'bank_transfer', students: [
    { first: 'Liam', level: 'Grade 3', school: 'Dewey Elementary', program: 'reading-writing-lab', funding: { plan: '8 sessions a month' }, series: [4], started: 40 },
    { first: 'Nora', level: 'Grade 6', school: 'Nichols Middle School', program: 'maths-foundations', funding: { plan: '12 sessions a month' }, series: [0, 1], started: 40, notes: 'Prefers to sit near the front; wears glasses for the board.' },
  ] },
  { last: 'Kowalski', guardian: 'Marta', phone: '(847) 555-0152', city: 'Wilmette', postal: '60091', street: '1120 Greenleaf Avenue', primary: 'maple', payBy: 'cheque', students: [
    { first: 'Zofia', level: 'Grade 10', school: 'New Trier High School', program: 'sat-prep', funding: { plan: '8 sessions a month' }, series: [6], started: 39 },
  ] },
  { last: 'Haddad', guardian: 'Omar', phone: '(847) 555-0176', city: 'Evanston', postal: '60203', street: '2601 Central Park Avenue', primary: 'maple', payBy: 'bank_transfer', students: [
    { first: 'Yasmin', level: 'Grade 12', school: 'Evanston Township High School', program: 'sat-act-prep', funding: { pkg: 'SAT & ACT 24 hours' }, oneToOne: { tutor: 'priya-raman', mode: 'online', weekday: 3, start: 1050, minutes: 60 }, started: 38 },
  ] },
  { last: 'Chen', guardian: 'Wei', phone: '(847) 555-0109', city: 'Northbrook', postal: '60062', street: '1835 Walters Avenue', primary: 'riverside', payBy: 'bank_transfer', students: [
    { first: 'Lucas', level: 'Grade 8', school: 'Wood Oaks Junior High', program: 'private-tutoring', funding: { pkg: '10 hours' }, pendingMatch: { mode: 'in_home', slots: [{ weekday: 2, startMinute: 1020 }, { weekday: 4, startMinute: 1020 }] }, started: 2 },
    { first: 'Emma', level: 'Grade 10', school: 'Glenbrook North High School', program: 'act-prep', funding: { plan: '8 sessions a month' }, series: [9], started: 33, pastDue: true },
  ] },
  { last: 'Delgado', guardian: 'Carmen', phone: '(847) 555-0145', city: 'Evanston', postal: '60202', street: '515 Custer Avenue', primary: 'maple', payBy: 'cash', students: [
    { first: 'Isabella', level: 'Grade 1', school: 'Oakton Elementary', program: 'reading-writing-lab', funding: { plan: '8 sessions a month' }, series: [3], started: 37 },
    { first: 'Mateo', level: 'Grade 4', school: 'Oakton Elementary', program: 'homework-club', funding: { pkg: '10 visits' }, series: [10], started: 28 },
  ] },
  { last: 'Thompson', guardian: 'Rachel', phone: '(847) 555-0187', city: 'Skokie', postal: '60077', street: '8224 Lawndale Avenue', primary: 'riverside', payBy: 'bank_transfer', students: [
    { first: 'Caleb', level: 'Grade 9', school: 'Niles North High School', program: 'private-tutoring', funding: { pkg: '20 hours' }, oneToOne: { tutor: 'samuel-okafor', mode: 'in_home', weekday: 2, start: 1020, minutes: 60 }, started: 36 },
  ] },
  { last: 'Fischer', guardian: 'Daniel', phone: '(847) 555-0129', city: 'Glenview', postal: '60026', street: '3314 Lindenwood Lane', primary: 'riverside', payBy: 'cheque', students: [
    { first: 'Greta', level: 'Grade 11', school: 'Glenbrook South High School', program: 'act-prep', funding: { plan: 'Unlimited' }, series: [8, 9], started: 35 },
  ] },
  { last: 'Abara', guardian: 'Ngozi', phone: '(847) 555-0113', city: 'Skokie', postal: '60076', street: '9150 Kildare Avenue', primary: 'riverside', payBy: 'bank_transfer', students: [
    { first: 'Chidi', level: 'Grade 6', school: 'Old Orchard Junior High', program: 'maths-foundations', funding: { plan: '8 sessions a month' }, series: [2], started: 34 },
    { first: 'Amara', level: 'Grade 10', school: 'Niles West High School', program: 'sat-prep', funding: { plan: '8 sessions a month' }, series: [7], started: 34 },
  ] },
]

const RESULTS: Record<string, Array<[string, string, number, number, string]>> = {
  'maths-foundations': [['Number facts', 'Number', 32, 40, ''], ['Fractions', 'Number', 11, 20, ''], ['Word problems', 'Problem solving', 7, 15, '']],
  'reading-writing-lab': [['Phonics', 'Decoding', 26, 30, ''], ['Comprehension', 'Reading', 12, 20, ''], ['Sentence writing', 'Writing', 6, 10, '']],
  'sat-prep': [['Reading and Writing', 'SAT', 560, 800, ''], ['Math', 'SAT', 540, 800, '']],
  'act-prep': [['English', 'ACT', 23, 36, ''], ['Math', 'ACT', 21, 36, ''], ['Reading', 'ACT', 24, 36, ''], ['Science', 'ACT', 20, 36, '']],
  'sat-act-prep': [['SAT total', 'SAT', 1180, 1600, ''], ['ACT composite', 'ACT', 25, 36, '']],
  'private-tutoring': [['Algebra', 'Maths', 14, 25, ''], ['Study habits', 'Study skills', 3, 5, '']],
  'homework-club': [],
}
const GOALS: Record<string, Array<[string, string, string, string]>> = {
  'maths-foundations': [['Multiplication facts to 12 × 12', 'Number facts', '80% in 3 minutes', '100% in 3 minutes'], ['Add and subtract fractions', 'Fractions', '55%', '85%'], ['Two-step word problems', 'Word problems', '45%', '80%']],
  'reading-writing-lab': [['Read grade-level text fluently', 'Fluency', '70 words a minute', '100 words a minute'], ['Retell a story in order', 'Comprehension', '60%', '90%'], ['Write a five-sentence paragraph', 'Writing', 'Two sentences', 'Five sentences']],
  'sat-prep': [['Raise Reading and Writing', 'Reading and Writing', '560', '660'], ['Raise Math', 'Math', '540', '650'], ['Finish each module on time', 'Pacing', 'Runs out of time', 'Two minutes spare']],
  'act-prep': [['Raise the composite', 'Composite', '22', '28'], ['Science reasoning', 'Science', '20', '26']],
  'sat-act-prep': [['Pick the test after both diagnostics', 'Test choice', 'Undecided', 'Decided by week 3'], ['Raise the chosen test score', 'Score', 'Baseline', '+120 SAT or +4 ACT']],
  'private-tutoring': [['Solve linear equations', 'Algebra', '56%', '90%'], ['Keep a weekly planner', 'Study habits', 'No planner', 'Planner every week']],
  'homework-club': [],
}
const TOPICS: Record<string, string[]> = {
  'maths-foundations': ['Times tables 6 to 9 and a speed round', 'Equivalent fractions with fraction strips', 'Two-step word problems', 'Place value to the millions', 'Adding fractions with unlike denominators', 'Area and perimeter of rectangles'],
  'reading-writing-lab': ['Long vowel teams and a guided reading', 'Story retell with a sequence chart', 'Writing a topic sentence', 'Reading aloud with expression', 'Finding the main idea', 'Paragraph with three details'],
  'sat-prep': ['Words in context and transitions', 'Linear equations and systems', 'Command of evidence questions', 'Module 2 pacing drill', 'Advanced math: quadratics', 'Full practice module review'],
  'act-prep': ['ACT Science: data representation', 'English punctuation rules', 'Math: plane geometry', 'Reading pacing drill', 'Science: conflicting viewpoints', 'Full practice section review'],
  'sat-act-prep': ['SAT and ACT diagnostic review', 'Algebra shared by both tests', 'Grammar rules shared by both tests', 'Reading for evidence', 'Timed mixed set', 'Test choice and plan'],
  'private-tutoring': ['Solving one-step and two-step equations', 'Graphing linear equations', 'Weekly planner set-up', 'Distributive property', 'Word problems to equations', 'Review quiz'],
  'homework-club': ['Maths worksheet and reading log', 'Science project outline', 'Spelling list practice', 'Book report draft', 'Fractions homework', 'Social studies questions'],
}

export type HistoryResult = { families: number; students: number; pastSessions: number; historicBookings: number; futureBookings: number; leads: number; payLines: number }

export async function loadHistory(tx: Tx, cat: Catalogue, owner: Actor) {
  const now = new Date()
  const tz = cat.timezone
  const rand = rng(20261122)
  const roles = await ensureRoles(tx)
  const settings = await getSettings(tx)
  const L = cat.locations
  const locKey = (k: 'maple' | 'riverside') => L[k]

  // ------------------------------------------------------------ staff (§9: 1 manager per location, 1 front desk, tutor logins)
  const pw = await unusablePassword()
  const staff = async (name: string, roleId: string, memberships: Array<[string, string]>) => {
    const [first, ...rest] = name.split(' ')
    const u = await tx.user.create({ data: { name, email: emailOf(first, rest.join('')), password: pw, role: { connect: { id: roleId } }, phone: '' } })
    for (const [locationId, role] of memberships) await tx.locationMembership.create({ data: { user: { connect: { id: u.id } }, location: { connect: { id: locationId } }, role, status: 'active' } })
    return u
  }
  const managerMaple = await staff('Laura Bennett', roles.Manager, [[L.maple.id, 'manager']])
  const managerRiverside = await staff('David Moreno', roles.Manager, [[L.riverside.id, 'manager']])
  const frontDesk = await staff('Jasmine Park', roles['Front desk'], [[L.maple.id, 'front_desk'], [L.riverside.id, 'front_desk']])
  const tutorUsers: Record<string, any> = {}
  for (const t of cat.tutorRows) {
    const tutor = cat.tutors[t.slug]
    const u = await staff(t.name, roles.Tutor, t.locs.map((l: any) => [l.id, 'tutor'] as [string, string]))
    await tx.tutor.update({ where: { id: tutor.id }, data: { user: { connect: { id: u.id } } } })
    await tx.tutorCredential.create({ data: { tutor: { connect: { id: tutor.id } }, kind: 'background_check', reference: `BG-${2026}-${String(1000 + Math.floor(rand() * 9000))}`, issuedAt: new Date(now.getTime() - 200 * DAY), expiresAt: new Date(now.getTime() + 530 * DAY), status: 'verified', verifiedBy: { connect: { id: owner.userId } }, verifiedAt: new Date(now.getTime() - 199 * DAY) } })
    tutorUsers[t.slug] = u
  }
  const actorFor = (userId: string): Actor => ({ ...owner, userId })

  // ------------------------------------------------------------ past and future sessions for the catalogue series
  const historyFrom = new Date(now.getTime() - 42 * DAY)
  const pastBySeries = new Map<string, any[]>()
  let pastSessions = 0
  const seriesRows = await tx.sessionSeries.findMany({ where: { id: { in: cat.series.map((s) => s.id) } } })
  for (const s of seriesRows) {
    const rows = weeklyStarts(s.weekday, s.startMinute, tz, historyFrom, new Date(now.getTime() - 2 * HOUR)).map((startsAt) => ({
      seriesId: s.id, programId: s.programId, subjectId: s.subjectId, locationId: s.locationId, roomId: s.roomId, tutorId: s.tutorId, mode: s.mode,
      startsAt, endsAt: new Date(startsAt.getTime() + s.minutes * 60000), capacity: s.capacity, status: 'scheduled',
    }))
    if (rows.length) await tx.session.createMany({ data: rows })
    pastSessions += rows.length
    await tx.sessionSeries.update({ where: { id: s.id }, data: { generatedThrough: now } })
    pastBySeries.set(s.id, await tx.session.findMany({ where: { seriesId: s.id, startsAt: { lt: now } }, orderBy: { startsAt: 'asc' } }))
  }

  // A tutor absence three weeks ago: the centre cancelled one Reading Lab session (credit returned).
  const cancelledSeries = cat.series[4]
  const cancelledSession = pastBySeries.get(cancelledSeries.id)?.[2] ?? null

  // ------------------------------------------------------------ families, students, assessments, plans, enrolments
  const plans = await tx.membershipPlan.findMany({ select: { id: true, name: true, programId: true, price: true, enrolmentFee: true, sessionsPerPeriod: true, weeklyCapForUnlimited: true } })
  const pkgs = await tx.package.findMany({ select: { id: true, name: true, programId: true, hours: true, price: true, expiryMonths: true } })
  let studentCount = 0
  let historicBookings = 0
  let futureBookings = 0
  const enrolledFamilies: Array<{ id: string; guardianName: string; email: string; studentId: string; studentName: string; programId: string; locationId: string; levelId: string }> = []
  const familyIds: string[] = []
  let livePlansInFamily = 0

  for (const [fi, f] of FAMILIES.entries()) {
    const email = emailOf(f.guardian, f.last)
    const guardian = await tx.user.create({ data: { name: `${f.guardian} ${f.last}`, email, password: pw, phone: f.phone, role: { connect: { id: roles.Customer } } } })
    const family = await tx.family.create({
      data: {
        name: `${f.last} family`, primaryLocation: { connect: { id: locKey(f.primary).id } }, billingEmail: email, phone: f.phone,
        addressLine1: f.street, city: f.city, region: 'IL', postalCode: f.postal, country: 'US', status: 'active',
        guardians: { connect: { id: guardian.id } }, createdBy: { connect: { id: frontDesk.id } },
      },
    })
    familyIds.push(family.id)
    livePlansInFamily = 0
    for (const st of f.students) {
      studentCount += 1
      const program = cat.programs[st.program]
      const level = cat.levels[st.level]
      const started = new Date(now.getTime() - st.started * DAY)
      const student = await tx.student.create({
        data: {
          family: { connect: { id: family.id } }, firstName: st.first, lastName: f.last, level: { connect: { id: level.id } }, school: st.school,
          learningNotes: st.notes ?? '', status: 'active', pickupPeople: [{ name: `${f.guardian} ${f.last}`, relationship: 'Parent', phone: f.phone }],
          createdBy: { connect: { id: frontDesk.id } }, createdAt: new Date(started.getTime() - 7 * DAY),
        },
      })
      // A group student's enrolment sits at the centre that runs the class.
      const locationId = st.series?.length ? cat.series[st.series[0]].locationId : locKey(f.primary).id
      // Initial assessment a week before the start, with results (W1.4–W1.6).
      const seriesTutor = st.series?.length ? cat.series[st.series[0]].tutor : st.oneToOne?.tutor ?? 'samuel-okafor'
      const assessedAt = new Date(started.getTime() - 6 * DAY)
      const subjectId = (await tx.program.findUnique({ where: { id: program.id }, select: { subjects: { select: { id: true }, take: 1 } } })).subjects[0]?.id ?? null
      const results = RESULTS[st.program] ?? []
      const assessment = results.length ? await tx.assessment.create({
        data: {
          student: { connect: { id: student.id } }, family: { connect: { id: family.id } }, program: { connect: { id: program.id } },
          ...(subjectId ? { subject: { connect: { id: subjectId } } } : {}),
          location: { connect: { id: locationId } }, assessor: { connect: { id: cat.tutors[seriesTutor].id } },
          mode: st.oneToOne?.mode === 'online' ? 'online' : 'in_centre', kind: 'initial', scheduledAt: assessedAt, minutes: program.assessmentMinutes || 45, status: 'completed',
          fee: program.assessmentFee, summary: `${st.first} is working a little below the target level. A steady weekly routine should close the gap within a term.`,
          recommendation: `${program.name}, ${st.series?.length === 2 ? 'twice' : 'once'} a week.`, recommendedSessionsPerWeek: st.series?.length ?? 1,
          completedAt: new Date(assessedAt.getTime() + 60 * 60000), createdBy: { connect: { id: frontDesk.id } }, createdAt: new Date(assessedAt.getTime() - 5 * DAY),
          results: { create: results.map(([skill, strand, score, maxScore, levelEquivalent]) => ({ skill, strand, score: Math.round(score * (0.9 + rand() * 0.2)), maxScore, levelEquivalent })) },
        },
      }) : null
      if (assessment && program.assessmentFee > 0) {
        const inv = await createInvoice(tx, { familyId: family.id, locationId, kind: 'assessment', actorId: frontDesk.id, lines: [{ description: `${program.name} diagnostic (${st.first})`, kind: 'assessment', unitAmount: program.assessmentFee, studentId: student.id, programId: program.id, assessmentId: assessment.id }] })
        await offlinePay(tx, inv, f.payBy, frontDesk.id, assessedAt)
        await tx.assessment.update({ where: { id: assessment.id }, data: { invoice: { connect: { id: inv.id } } } })
      }
      const goals = GOALS[st.program] ?? []
      const plan = goals.length ? await tx.learningPlan.create({
        data: {
          student: { connect: { id: student.id } }, ...(subjectId ? { subject: { connect: { id: subjectId } } } : {}), program: { connect: { id: program.id } }, version: 1, status: 'active',
          summary: `Twelve-week plan for ${st.first} built from the ${assessment ? 'initial assessment' : 'first conversation'}.`, startDate: started, targetDate: new Date(started.getTime() + 84 * DAY),
          sessionsPerWeek: st.series?.length ?? 1, ...(assessment ? { baselineAssessment: { connect: { id: assessment.id } } } : {}),
          proposedAt: new Date(assessedAt.getTime() + DAY), acceptedAt: new Date(assessedAt.getTime() + 2 * DAY), createdBy: { connect: { id: managerFor(f.primary).id } },
          goals: { create: goals.map(([title, skill, baseline, target], i) => ({ title, skill, baseline, target, status: i === 0 ? 'in_progress' : 'not_started', sortOrder: i })) },
        },
      }) : null

      // Funding
      let membershipId: string | null = null
      let studentPackageId: string | null = null
      let fundingType = 'membership'
      if ('plan' in st.funding) {
        const p = plans.find((x: any) => x.programId === program.id && x.name === (st.funding as any).plan)
        if (!p) throw new Error(`No plan ${(st.funding as any).plan} for ${program.slug}`)
        const discountPercent = livePlansInFamily > 0 ? settings.siblingDiscountPercent : 0
        livePlansInFamily += 1
        const m = await tx.membership.create({
          data: {
            family: { connect: { id: family.id } }, student: { connect: { id: student.id } }, plan: { connect: { id: p.id } }, status: 'active', price: p.price, discountPercent,
            sessionsPerPeriod: p.sessionsPerPeriod ?? null, weeklyCap: p.sessionsPerPeriod ? null : p.weeklyCapForUnlimited ?? 5, startedAt: started,
            currentPeriodStart: started, currentPeriodEnd: addMonths(started, 1), createdBy: { connect: { id: frontDesk.id } },
          },
        })
        membershipId = m.id
        const lines: any[] = [{ description: `${p.name}: first month (${st.first})`, kind: 'membership', unitAmount: p.price, studentId: student.id, programId: program.id, membershipId: m.id }]
        if (discountPercent) lines.push({ description: `Sibling discount ${discountPercent}%`, kind: 'discount', unitAmount: -Math.round((p.price * discountPercent) / 100), studentId: student.id, membershipId: m.id })
        if (p.enrolmentFee > 0) lines.push({ description: `Enrolment fee (${st.first})`, kind: 'enrolment_fee', unitAmount: p.enrolmentFee, studentId: student.id, programId: program.id })
        const inv = await createInvoice(tx, { familyId: family.id, locationId, kind: 'enrolment', lines, actorId: frontDesk.id, dueAt: started })
        await offlinePay(tx, inv, f.payBy, frontDesk.id, started)
      } else {
        fundingType = 'package'
        const k = pkgs.find((x: any) => x.programId === program.id && x.name === (st.funding as any).pkg)
        if (!k) throw new Error(`No package ${(st.funding as any).pkg} for ${program.slug}`)
        const expiresAt = addMonths(started, k.expiryMonths ?? 6)
        const sp = await tx.studentPackage.create({ data: { family: { connect: { id: family.id } }, student: { connect: { id: student.id } }, package: { connect: { id: k.id } }, hours: k.hours, price: k.price, status: 'active', purchasedAt: started, expiresAt, createdBy: { connect: { id: frontDesk.id } } } })
        studentPackageId = sp.id
        const inv = await createInvoice(tx, { familyId: family.id, locationId, kind: 'package', actorId: frontDesk.id, dueAt: started, lines: [{ description: `${k.name} (${k.hours} hours, ${st.first})`, kind: 'package', unitAmount: k.price, studentId: student.id, programId: program.id, studentPackageId: sp.id }] })
        await offlinePay(tx, inv, f.payBy, frontDesk.id, started)
        await tx.studentPackage.update({ where: { id: sp.id }, data: { invoice: { connect: { id: inv.id } } } })
        await createGrant(tx, { familyId: family.id, studentId: student.id, programId: program.id, kind: 'package', minutes: (k.hours ?? 0) * 60, expiresAt, studentPackageId: sp.id, note: k.name, actorId: frontDesk.id })
      }

      // One-to-one: an accepted offer and a weekly series (W2).
      let seriesIds: string[] = (st.series ?? []).map((i) => cat.series[i].id)
      let oneToOneSeries: any = null
      const enrolment = await tx.enrollment.create({
        data: {
          student: { connect: { id: student.id } }, family: { connect: { id: family.id } }, program: { connect: { id: program.id } }, location: { connect: { id: locationId } },
          mode: st.oneToOne?.mode ?? st.pendingMatch?.mode ?? 'in_centre', status: st.pendingMatch ? 'pending_match' : 'active', fundingType,
          ...(membershipId ? { membership: { connect: { id: membershipId } } } : {}), ...(studentPackageId ? { studentPackage: { connect: { id: studentPackageId } } } : {}),
          ...(plan ? { plan: { connect: { id: plan.id } } } : {}),
          preferredTimes: st.pendingMatch ? { slots: st.pendingMatch.slots.map((s) => ({ ...s, minutes: program.sessionMinutes })), note: 'After school, two evenings a week.' } : { seriesIds, note: '' },
          homeAddress: st.oneToOne?.mode === 'in_home' || st.pendingMatch?.mode === 'in_home' ? `${f.street}, ${f.city}, IL ${f.postal}` : '',
          startDate: st.pendingMatch ? null : started, ...(st.oneToOne ? { trialAttendedAt: new Date(started.getTime() + 2 * HOUR), tutorConfirmedAt: new Date(started.getTime() + 2 * DAY) } : {}),
          createdBy: { connect: { id: frontDesk.id } }, createdAt: new Date(started.getTime() - DAY),
        },
      })
      if (studentPackageId) await tx.studentPackage.update({ where: { id: studentPackageId }, data: { enrollment: { connect: { id: enrolment.id } } } })
      await recordChange(tx, { type: 'Enrollment', id: enrolment.id, to: enrolment.status, actorId: frontDesk.id, reason: 'starter set' })
      if (st.oneToOne) {
        const o = st.oneToOne
        const tutorId = cat.tutors[o.tutor].id
        await tx.offer.create({ data: { enrollment: { connect: { id: enrolment.id } }, tutor: { connect: { id: tutorId } }, status: 'accepted', payRate: cat.tutors[o.tutor].defaultPayRate, proposedSlots: [{ weekday: o.weekday, startMinute: o.start, minutes: o.minutes }], sentAt: new Date(started.getTime() - 3 * DAY), respondedAt: new Date(started.getTime() - 3 * DAY + 3 * HOUR), expiresAt: new Date(started.getTime() - 2 * DAY), sentBy: { connect: { id: managerFor(f.primary).id } } } })
        await tx.enrollment.update({ where: { id: enrolment.id }, data: { tutor: { connect: { id: tutorId } } } })
        oneToOneSeries = await tx.sessionSeries.create({ data: { program: { connect: { id: program.id } }, ...(subjectId ? { subject: { connect: { id: subjectId } } } : {}), location: { connect: { id: locationId } }, tutor: { connect: { id: tutorId } }, enrollment: { connect: { id: enrolment.id } }, mode: o.mode, weekday: o.weekday, startMinute: o.start, minutes: o.minutes, capacity: 1, startDate: started, status: 'active', generatedThrough: now } })
        const rows = weeklyStarts(o.weekday, o.start, tz, started, new Date(now.getTime() - 2 * HOUR)).map((startsAt, i) => ({ seriesId: oneToOneSeries.id, programId: program.id, subjectId, locationId, tutorId, mode: o.mode, startsAt, endsAt: new Date(startsAt.getTime() + o.minutes * 60000), capacity: 1, status: 'scheduled', isTrial: i === 0 }))
        if (rows.length) await tx.session.createMany({ data: rows })
        pastSessions += rows.length
        pastBySeries.set(oneToOneSeries.id, await tx.session.findMany({ where: { seriesId: oneToOneSeries.id }, orderBy: { startsAt: 'asc' } }))
        seriesIds = [oneToOneSeries.id]
        await tx.enrollment.update({ where: { id: enrolment.id }, data: { preferredTimes: { seriesIds, note: '' } } })
      }

      // First membership period grant (W6.1)
      let period1: any = null
      if (membershipId) period1 = (await startMembershipPeriod(tx, membershipId, started, frontDesk.id)).grant
      const period2Start = membershipId ? addMonths(started, 1) : null

      // Six weeks of attendance, oldest first (W4, W5)
      const past = seriesIds.flatMap((id) => pastBySeries.get(id) ?? []).filter((s: any) => s.startsAt >= started).sort((a: any, b: any) => a.startsAt.getTime() - b.startsAt.getTime())
      let period2Open = false
      let excusedUsed = false
      for (const s of past) {
        if (membershipId && !st.pastDue && !period2Open && period2Start && s.startsAt >= period2Start) {
          await openNextPeriod(tx, membershipId, period1.id, period2Start, f, frontDesk.id, locationId, st, settings.membershipRolloverPeriods > 0)
          period2Open = true
        }
        const booking = await historicBooking(tx, s, student.id, family.id, enrolment.id, frontDesk.id)
        if (!booking) continue
        historicBookings += 1
        const markerSlug = s.tutorId ? Object.entries(cat.tutors).find(([, t]: any) => t.id === s.tutorId)?.[0] : null
        const marker = actorFor(markerSlug ? tutorUsers[markerSlug].id : frontDesk.id)
        if (cancelledSession && s.id === cancelledSession.id) {
          await tx.booking.update({ where: { id: booking.id }, data: { status: 'cancelled_by_centre', activeKey: null, cancelledAt: new Date(s.startsAt.getTime() - 20 * HOUR), lateReason: 'Tutor illness' } })
          await recordChange(tx, { type: 'Booking', id: booking.id, from: 'booked', to: 'cancelled_by_centre', actorId: managerRiverside.id, reason: 'Tutor illness' })
          await releaseHold(tx, booking.id, managerRiverside.id, 'cancelled_by_centre')
          continue
        }
        const r = rand()
        const outcome = r < 0.84 ? 'attended' : r < 0.9 ? 'late' : r < 0.94 ? 'no_show' : !excusedUsed && r < 0.97 ? 'cancelled_late_excused' : r < 0.97 ? 'cancelled_late' : 'cancelled_early'
        if (outcome === 'cancelled_late_excused') excusedUsed = true
        if (outcome === 'cancelled_early') {
          await tx.booking.update({ where: { id: booking.id }, data: { status: 'cancelled_early', activeKey: null, cancelledAt: new Date(s.startsAt.getTime() - 3 * DAY), cancelledById: guardian.id } })
          await recordChange(tx, { type: 'Booking', id: booking.id, from: 'booked', to: 'cancelled_early', actorId: guardian.id })
          await releaseHold(tx, booking.id, guardian.id, 'cancelled_early')
          continue
        }
        await markSeat(tx, marker, booking.id, outcome as any)
        if (outcome === 'attended' || outcome === 'late') {
          const topics = TOPICS[st.program] ?? ['Session work']
          const published = s.startsAt.getTime() < now.getTime() - DAY
          await tx.sessionReport.create({
            data: {
              booking: { connect: { id: booking.id } }, session: { connect: { id: s.id } }, student: { connect: { id: student.id } }, ...(s.tutorId ? { tutor: { connect: { id: s.tutorId } } } : {}),
              topicsCovered: topics[Math.floor(rand() * topics.length)], wentWell: `${st.first} stayed focused and asked good questions.`, toImprove: 'Show every step when working through a problem.',
              homework: rand() < 0.6 ? 'Finish the practice page from today.' : '', effort: 3 + Math.floor(rand() * 3),
              publishedAt: published ? new Date(s.endsAt.getTime() + 2 * HOUR) : null, guardianSeenAt: published && rand() < 0.6 ? new Date(s.endsAt.getTime() + 20 * HOUR) : null,
              ...(s.tutorId ? { createdBy: { connect: { id: marker.userId } } } : {}),
            },
          })
        }
      }
      if (membershipId && !period2Open && period2Start && period2Start <= now && !st.pastDue) {
        await openNextPeriod(tx, membershipId, period1.id, period2Start, f, frontDesk.id, locationId, st, settings.membershipRolloverPeriods > 0)
      }
      // The past-due membership (W6.3): this period's charge failed (no saved card), retries pending.
      if (st.pastDue && membershipId) await markPastDue(tx, membershipId, period1.id, period2Start!, f, student.id, program.id, locationId, now, settings)

      // Four weeks ahead: real bookFixedSeats → bookSeat.
      if (!st.pendingMatch && !st.pastDue) {
        for (const id of seriesIds) await generateSessions(tx, id, new Date(now.getTime() + 28 * DAY))
        // Membership seats are booked through the paid period; the next period's payment books the rest (W6.1).
        const cur = membershipId ? (await tx.membership.findUnique({ where: { id: membershipId }, select: { currentPeriodEnd: true } })).currentPeriodEnd : null
        const through = new Date(Math.min(now.getTime() + 28 * DAY, cur ? cur.getTime() - 1 : Infinity))
        const r = await bookFixedSeats(tx, enrolment.id, now, through)
        futureBookings += r.booked
      }
      if (fi < 2 && st === f.students[0]) enrolledFamilies.push({ id: family.id, guardianName: `${f.guardian} ${f.last}`, email, studentId: student.id, studentName: `${st.first} ${f.last}`, programId: program.id, locationId, levelId: level.id })
    }
  }

  // Sessions for the catalogue series with nobody booked are still generated four weeks ahead.
  for (const s of cat.series) await generateSessions(tx, s.id, new Date(now.getTime() + 28 * DAY))
  // A past session nobody attended is closed; the cancelled one is cancelled (tutor illness).
  if (cancelledSession) {
    await tx.session.update({ where: { id: cancelledSession.id }, data: { status: 'cancelled', cancelReason: 'tutor_absent' } }).catch(async () => tx.session.update({ where: { id: cancelledSession.id }, data: { status: 'cancelled' } }))
    await recordChange(tx, { type: 'Session', id: cancelledSession.id, from: 'scheduled', to: 'cancelled', actorId: managerRiverside.id, reason: 'Tutor illness' })
  }
  await tx.session.updateMany({ where: { startsAt: { lt: new Date(now.getTime() - 2 * HOUR) }, status: 'scheduled', bookings: { none: { status: 'booked' } } }, data: { status: 'completed' } })

  // ------------------------------------------------------------ leads, two at every stage (W1)
  const leads = await loadLeads(tx, cat, { frontDesk, managerMaple, managerRiverside, roles, pw, enrolledFamilies, rand, now })

  // ------------------------------------------------------------ payroll: a paid run for the older weeks, a draft for the last two (W10)
  const cut = new Date(now.getTime() - 14 * DAY)
  const older = await tx.payLine.findMany({ where: { status: 'accrued', payrollRunId: null, workedAt: { lt: cut } }, select: { id: true } })
  if (older.length) {
    const run = await tx.payrollRun.create({ data: { periodStart: new Date(now.getTime() - 44 * DAY), periodEnd: cut, status: 'draft', payments: [], createdBy: { connect: { id: owner.userId } } } })
    await tx.payLine.updateMany({ where: { id: { in: older.map((l: any) => l.id) } }, data: { payrollRunId: run.id, status: 'paid' } })
    const totals = await tx.payLine.groupBy({ by: ['tutorId'], where: { payrollRunId: run.id }, _sum: { amount: true } })
    const names = await tx.tutor.findMany({ where: { id: { in: totals.map((t: any) => t.tutorId) } }, select: { id: true, displayName: true } })
    const paidAt = new Date(cut.getTime() + 3 * DAY)
    const payments = totals.map((t: any, i: number) => ({ tutorId: t.tutorId, name: names.find((n: any) => n.id === t.tutorId)?.displayName ?? '', amount: t._sum.amount ?? 0, method: 'bank_transfer', reference: `ACH-${paidAt.toISOString().slice(0, 10).replace(/-/g, '')}-${String(i + 1).padStart(2, '0')}`, paidAt: paidAt.toISOString() }))
    await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'paid', approvedBy: { connect: { id: owner.userId } }, approvedAt: new Date(cut.getTime() + DAY), paidAt, payments } })
    await recordChange(tx, { type: 'PayrollRun', id: run.id, from: 'draft', to: 'approved', actorId: owner.userId })
    await recordChange(tx, { type: 'PayrollRun', id: run.id, from: 'approved', to: 'paid', actorId: owner.userId })
  }
  const recent = await tx.payLine.findMany({ where: { status: 'accrued', payrollRunId: null, workedAt: { gte: cut, lt: now }, session: { locationId: L.maple.id } }, select: { id: true } })
  if (recent.length) {
    const draft = await tx.payrollRun.create({ data: { location: { connect: { id: L.maple.id } }, periodStart: cut, periodEnd: now, status: 'draft', payments: [], createdBy: { connect: { id: managerMaple.id } } } })
    await tx.payLine.updateMany({ where: { id: { in: recent.map((l: any) => l.id) } }, data: { payrollRunId: draft.id } })
    await recordChange(tx, { type: 'PayrollRun', id: draft.id, to: 'draft', actorId: managerMaple.id, data: { lines: recent.length } })
  }

  // ------------------------------------------------------------ tutor applications at three stages (W12)
  const apps: Array<[string, string, string, string, string]> = [
    ['Rebecca Lindqvist', 'Maths, Science', 'Grade 6 to Grade 12', 'applied', 'Former middle-school science teacher, available weekday evenings.'],
    ['Tomás Ferreira', 'Reading, Writing, Spanish', 'Grade 1 to Grade 8', 'interview', 'Bilingual reading tutor; interview booked with the Riverside manager.'],
    ['Aisha Rahman', 'SAT Prep, Maths', 'Grade 9 to SAT', 'checks', 'Strong mock lesson. Background check requested.'],
  ]
  for (const [name, subjectsText, levels, status, notes] of apps) {
    const [first, ...rest] = name.split(' ')
    const a = await tx.tutorApplication.create({ data: { name, email: emailOf(first, rest.join('')), phone: '(847) 555-0' + String(100 + Math.floor(rand() * 899)), subjectsText, levels, modes: ['in_centre', 'online'], areas: 'Evanston, Skokie', availability: { note: 'Weekdays after 3:30 pm, Saturday mornings' }, coverNote: `I would love to tutor ${subjectsText.toLowerCase()} at your centres.`, source: 'job_board', status, notes, ...(status !== 'applied' ? { reviewer: { connect: { id: managerRiverside.id } } } : {}) } })
    await recordChange(tx, { type: 'TutorApplication', id: a.id, to: status, actorId: status === 'applied' ? null : managerRiverside.id, reason: 'starter set' })
  }

  // A few logged contacts (W11)
  for (const [i, fid] of familyIds.slice(0, 4).entries()) {
    await tx.message.create({ data: { family: { connect: { id: fid } }, sender: { connect: { id: frontDesk.id } }, direction: 'outbound', channel: i % 2 ? 'phone' : 'email', subject: i % 2 ? 'Called about the new term schedule' : 'Welcome and first-week check-in', body: i % 2 ? 'Confirmed the same weekly times for next term.' : 'Shared the first session report and how to book a make-up.', visibleToFamily: i % 2 === 0, threadKey: `family:${fid}` } })
  }

  const payLines = await tx.payLine.count()
  return { families: FAMILIES.length, students: studentCount, pastSessions, historicBookings, futureBookings, leads, payLines } satisfies HistoryResult

  function managerFor(k: 'maple' | 'riverside') { return k === 'maple' ? managerMaple : managerRiverside }
}

/** Offline payment on a historic invoice (the recordOfflinePayment path, dated). */
async function offlinePay(tx: Tx, inv: any, method: string, receivedById: string, at: Date) {
  await tx.invoice.update({ where: { id: inv.id }, data: { issuedAt: at, dueAt: at, createdAt: at } })
  await applyToInvoice(tx, inv.id, inv.total, 'amountPaid')
  const reference = method === 'cash' ? '' : method === 'cheque' ? `Cheque ${1000 + (inv.number % 900)}` : `Transfer ${at.toISOString().slice(0, 10)}-${inv.number}`
  const p = await tx.payment.create({ data: { invoice: { connect: { id: inv.id } }, family: { connect: { id: inv.familyId } }, amount: inv.total, currency: inv.currency, method, reference, status: 'captured', receivedBy: { connect: { id: receivedById } }, createdAt: at } })
  await recordChange(tx, { type: 'Payment', id: p.id, to: 'captured', actorId: receivedById, reason: method, data: { invoiceId: inv.id, amount: inv.total } })
  await tx.invoice.update({ where: { id: inv.id }, data: { fulfilledAt: at } })
}

/** Second period: invoice paid, the new grant, last period's unused credit rolled once (W6.2). */
async function openNextPeriod(tx: Tx, membershipId: string, period1Id: string, start: Date, f: FamilySpec, actorId: string, locationId: string, st: any, rollover: boolean) {
  const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { plan: { select: { name: true } } } })
  const end = addMonths(start, 1)
  const lines: any[] = [{ description: `${m.plan?.name ?? 'Membership'}: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)} (${st.first})`, kind: 'membership', unitAmount: m.price, studentId: m.studentId, membershipId }]
  if (m.discountPercent) lines.push({ description: `Sibling discount ${m.discountPercent}%`, kind: 'discount', unitAmount: -Math.round((m.price * m.discountPercent) / 100), studentId: m.studentId, membershipId })
  const inv = await createInvoice(tx, { familyId: m.familyId, locationId, kind: 'membership', lines, dueAt: start, fulfilment: { kind: 'membership_period', membershipId, periodStart: start.toISOString(), periodEnd: end.toISOString() } })
  await offlinePay(tx, inv, f.payBy, actorId, start)
  await tx.billingAttempt.create({ data: { membership: { connect: { id: membershipId } }, periodStart: start, periodEnd: end, invoice: { connect: { id: inv.id } }, attemptNumber: 1, status: 'succeeded', amount: inv.total, requestHash: `${membershipId}:${start.toISOString()}:1` } })
  await tx.membership.update({ where: { id: membershipId }, data: { currentPeriodStart: start, currentPeriodEnd: end } })
  await recordChange(tx, { type: 'Membership', id: membershipId, from: 'active', to: 'active', reason: 'period paid', data: { periodStart: start.toISOString(), invoiceId: inv.id } })
  await startMembershipPeriod(tx, membershipId, start, null)
  await rollOverGrant(tx, period1Id, { periodStart: start, periodEnd: end }, rollover)
}

async function markPastDue(tx: Tx, membershipId: string, period1Id: string, start: Date, f: FamilySpec, studentId: string, programId: string, locationId: string, now: Date, settings: any) {
  const m = await tx.membership.findUnique({ where: { id: membershipId }, include: { plan: { select: { name: true } }, student: { select: { firstName: true } } } })
  const end = addMonths(start, 1)
  const inv = await createInvoice(tx, { familyId: m.familyId, locationId, kind: 'membership', dueAt: start, lines: [{ description: `${m.plan?.name ?? 'Membership'}: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)} (${m.student?.firstName ?? ''})`, kind: 'membership', unitAmount: m.price, studentId, programId, membershipId }], fulfilment: { kind: 'membership_period', membershipId, periodStart: start.toISOString(), periodEnd: end.toISOString() } })
  const since = start < now ? start : new Date(now.getTime() - 2 * DAY)
  const nextRetryAt = new Date(since.getTime() + (settings.pastDueRetryDays[0] ?? 3) * DAY)
  await tx.billingAttempt.create({ data: { membership: { connect: { id: membershipId } }, periodStart: m.currentPeriodEnd, periodEnd: addMonths(m.currentPeriodEnd, 1), invoice: { connect: { id: inv.id } }, attemptNumber: 1, status: 'failed', amount: inv.total, requestHash: `${membershipId}:${m.currentPeriodEnd.toISOString()}:1`, failureCode: 'no_card', failureMessage: 'No saved card on file', nextRetryAt } })
  await tx.membership.update({ where: { id: membershipId }, data: { status: 'past_due', pastDueSince: since } })
  await recordChange(tx, { type: 'Membership', id: membershipId, from: 'active', to: 'past_due', reason: 'no_card' })
  await tx.task.create({ data: { kind: 'failed_payment', title: `Membership payment failed: ${m.student?.firstName ?? ''} ${f.last}`, family: { connect: { id: m.familyId } }, student: { connect: { id: studentId } }, relatedType: 'Invoice', relatedId: inv.id, dueAt: now, status: 'open', openKey: `failed-payment:${inv.id}` } })
  void period1Id
}

async function loadLeads(tx: Tx, cat: Catalogue, ctx: { frontDesk: any; managerMaple: any; managerRiverside: any; roles: Record<string, string>; pw: string; enrolledFamilies: any[]; rand: () => number; now: Date }) {
  const { frontDesk, now } = ctx
  const L = cat.locations
  const P = cat.programs
  type LeadSpec = { guardian: string; student: string; level: string; program: string; loc: 'maple' | 'riverside'; status: string; source: string; message: string; daysAgo: number; lost?: string; intent?: string; area?: string }
  const specs: LeadSpec[] = [
    { guardian: 'Priya Desai', student: 'Arjun', level: 'Grade 11', program: 'sat-prep', loc: 'maple', status: 'new', source: 'website', message: 'Arjun sits the SAT in March. What does the diagnostic involve?', daysAgo: 0 },
    { guardian: 'Michael Grant', student: 'Ella', level: 'Grade 3', program: 'reading-writing-lab', loc: 'riverside', status: 'new', source: 'phone', message: 'Ella finds reading aloud hard. Saturday mornings work best.', daysAgo: 1 },
    { guardian: 'Sarah Kim', student: 'Noah', level: 'Grade 5', program: 'maths-foundations', loc: 'maple', status: 'contacted', source: 'referral', message: 'Referred by the Ruiz family.', daysAgo: 4 },
    { guardian: 'James Walker', student: 'Ava', level: 'Grade 8', program: 'private-tutoring', loc: 'riverside', status: 'contacted', source: 'website', message: 'Looking for an algebra tutor at home, Tuesdays or Thursdays.', daysAgo: 5, intent: 'request_tutor', area: 'Glenview 60025' },
    { guardian: 'Elena Rossi', student: 'Marco', level: 'Grade 10', program: 'sat-prep', loc: 'maple', status: 'assessment_booked', source: 'website', message: 'Booked the SAT diagnostic online.', daysAgo: 3 },
    { guardian: 'Kevin Brown', student: 'Lily', level: 'Grade 4', program: 'maths-foundations', loc: 'riverside', status: 'assessment_booked', source: 'walk_in', message: 'Walked in on Saturday; booked the free maths assessment.', daysAgo: 2 },
    { guardian: 'Fatima Ali', student: 'Zain', level: 'Grade 6', program: 'maths-foundations', loc: 'maple', status: 'assessed', source: 'website', message: 'Assessment done; waiting for the plan.', daysAgo: 9 },
    { guardian: 'Robert Young', student: 'Chloe', level: 'Grade 2', program: 'reading-writing-lab', loc: 'maple', status: 'assessed', source: 'referral', message: 'Assessed last week.', daysAgo: 10 },
    { guardian: 'Hannah Lee', student: 'Owen', level: 'Grade 11', program: 'act-prep', loc: 'riverside', status: 'proposal_sent', source: 'website', message: 'Plan sent; family deciding between ACT and SAT.', daysAgo: 12 },
    { guardian: 'Diego Ramirez', student: 'Lucia', level: 'Grade 7', program: 'maths-foundations', loc: 'riverside', status: 'proposal_sent', source: 'phone', message: 'Plan sent by email.', daysAgo: 8 },
    { guardian: 'Tom Becker', student: 'Max', level: 'Grade 9', program: 'private-tutoring', loc: 'riverside', status: 'lost', source: 'website', message: 'Wanted Friday evenings only.', daysAgo: 20, lost: 'No tutor free at the times the family needs' },
    { guardian: 'Grace Wilson', student: 'Sophie', level: 'Grade 12', program: 'sat-prep', loc: 'maple', status: 'lost', source: 'website', message: 'Test date too soon.', daysAgo: 25, lost: 'Chose another provider' },
  ]
  let count = 0
  for (const s of specs) {
    const [gFirst, gLast] = s.guardian.split(' ')
    const createdAt = new Date(now.getTime() - s.daysAgo * DAY - 3 * HOUR)
    const location = L[s.loc]
    const program = P[s.program]
    const level = cat.levels[s.level]
    let familyId: string | null = null
    let studentId: string | null = null
    if (['assessment_booked', 'assessed', 'proposal_sent'].includes(s.status)) {
      const email = emailOf(gFirst, gLast)
      const u = await tx.user.create({ data: { name: s.guardian, email, password: ctx.pw, role: { connect: { id: ctx.roles.Customer } } } })
      const fam = await tx.family.create({ data: { name: `${gLast} family`, primaryLocation: { connect: { id: location.id } }, billingEmail: email, status: 'active', guardians: { connect: { id: u.id } }, createdBy: { connect: { id: frontDesk.id } } } })
      const st = await tx.student.create({ data: { family: { connect: { id: fam.id } }, firstName: s.student, lastName: gLast, level: { connect: { id: level.id } }, status: 'prospect' } })
      familyId = fam.id
      studentId = st.id
    }
    const lead = await tx.lead.create({
      data: {
        guardianName: s.guardian, email: emailOf(gFirst, gLast), phone: '(847) 555-0' + String(200 + count * 7), studentName: `${s.student} ${gLast}`, level: { connect: { id: level.id } },
        program: { connect: { id: program.id } }, location: { connect: { id: location.id } }, preferredMode: s.program === 'private-tutoring' ? 'in_home' : 'in_centre',
        preferredTimes: 'Weekdays after school', area: s.area ?? '', intent: s.intent ?? 'enquiry', message: s.message, source: s.source, status: s.status, lostReason: s.lost ?? '',
        owner: { connect: { id: s.loc === 'maple' ? ctx.managerMaple.id : ctx.managerRiverside.id } }, ...(familyId ? { family: { connect: { id: familyId } }, student: { connect: { id: studentId } } } : {}),
        nextFollowUpAt: ['new', 'contacted', 'proposal_sent', 'assessed'].includes(s.status) ? new Date(now.getTime() + DAY) : null, lastContactedAt: s.status === 'new' ? null : new Date(createdAt.getTime() + DAY), createdAt,
      },
    })
    await recordChange(tx, { type: 'Lead', id: lead.id, to: s.status, actorId: frontDesk.id, reason: 'starter set' })
    count += 1
    if (s.status === 'assessment_booked' && familyId && studentId) {
      // A real slot hold (assessor free, room free) in the next few days.
      const tutorSlug = s.program === 'sat-prep' ? 'dana-whitfield' : 'samuel-okafor'
      const tutor = cat.tutorRows.find((t: any) => t.slug === tutorSlug)!
      const window = tutor.avail.find((w: any) => w[3] === 'in_centre')!
      const day = weeklyStarts(window[0], window[1], cat.timezone, new Date(now.getTime() + 2 * DAY), new Date(now.getTime() + 10 * DAY))[0]
      const slot = await holdAssessmentSlot(tx, { programId: program.id, locationId: tutor.home.id, mode: 'in_centre', startsAt: day, tutorId: cat.tutors[tutorSlug].id, staff: true })
      const a = await tx.assessment.create({ data: { student: { connect: { id: studentId } }, family: { connect: { id: familyId } }, program: { connect: { id: program.id } }, location: { connect: { id: tutor.home.id } }, ...(slot.roomId ? { room: { connect: { id: slot.roomId } } } : {}), assessor: { connect: { id: slot.tutor.id } }, mode: 'in_centre', kind: 'initial', scheduledAt: slot.startsAt, minutes: slot.minutes, status: 'scheduled', slotKey: slot.slotKey, fee: program.assessmentFee, lead: { connect: { id: lead.id } }, createdBy: { connect: { id: frontDesk.id } } } })
      if (program.assessmentFee > 0) {
        const inv = await createInvoice(tx, { familyId, locationId: tutor.home.id, kind: 'assessment', actorId: frontDesk.id, lines: [{ description: `${program.name} diagnostic (${s.student})`, kind: 'assessment', unitAmount: program.assessmentFee, studentId, programId: program.id, assessmentId: a.id }] })
        await tx.assessment.update({ where: { id: a.id }, data: { invoice: { connect: { id: inv.id } } } })
      }
    }
    if ((s.status === 'assessed' || s.status === 'proposal_sent') && familyId && studentId) {
      const results = RESULTS[s.program] ?? []
      const at = new Date(now.getTime() - (s.daysAgo - 2) * DAY)
      const a = await tx.assessment.create({ data: { student: { connect: { id: studentId } }, family: { connect: { id: familyId } }, program: { connect: { id: program.id } }, location: { connect: { id: location.id } }, assessor: { connect: { id: cat.tutors[s.program === 'act-prep' ? 'marcus-lee' : s.loc === 'maple' ? 'elena-brooks' : 'samuel-okafor'].id } }, mode: 'in_centre', kind: 'initial', scheduledAt: at, minutes: program.assessmentMinutes || 45, status: 'completed', fee: 0, summary: `${s.student} has a solid base with a few gaps to close.`, recommendation: `${program.name}, twice a week.`, recommendedSessionsPerWeek: 2, completedAt: new Date(at.getTime() + HOUR), lead: { connect: { id: lead.id } }, results: { create: results.map(([skill, strand, score, maxScore]) => ({ skill, strand, score, maxScore, levelEquivalent: '' })) } } })
      if (s.status === 'proposal_sent') {
        const goals = GOALS[s.program] ?? []
        const recommendedPlan = await tx.membershipPlan.findFirst({ where: { programId: program.id, name: '8 sessions a month' }, select: { id: true } })
        await tx.learningPlan.create({ data: { student: { connect: { id: studentId } }, program: { connect: { id: program.id } }, version: 1, status: 'proposed', summary: `A twelve-week plan for ${s.student}.`, sessionsPerWeek: 2, baselineAssessment: { connect: { id: a.id } }, ...(recommendedPlan ? { recommendedPlan: { connect: { id: recommendedPlan.id } } } : {}), proposedAt: new Date(at.getTime() + DAY), goals: { create: goals.map(([title, skill, baseline, target], i) => ({ title, skill, baseline, target, status: 'not_started', sortOrder: i })) } } })
      }
    }
  }
  // Two enrolled leads: the first two families came in as website enquiries.
  for (const f of ctx.enrolledFamilies.slice(0, 2)) {
    const lead = await tx.lead.create({ data: { guardianName: f.guardianName, email: f.email, phone: '', studentName: f.studentName, level: { connect: { id: f.levelId } }, program: { connect: { id: f.programId } }, location: { connect: { id: f.locationId } }, message: 'Enquired through the website.', source: 'website', status: 'enrolled', family: { connect: { id: f.id } }, convertedFamily: { connect: { id: f.id } }, student: { connect: { id: f.studentId } }, createdAt: new Date(now.getTime() - 52 * DAY) } })
    await recordChange(tx, { type: 'Lead', id: lead.id, to: 'enrolled', actorId: frontDesk.id, reason: 'starter set' })
    count += 1
  }
  return count
}
