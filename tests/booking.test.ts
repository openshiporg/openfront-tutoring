/**
 * §10 groups 1–7: capacity race, tutor double booking, credit race, ledger invariant,
 * cancellation policy, attendance → pay line, reopen after payroll approve.
 * Real Postgres (scratch database, schema `suite`).
 */
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import { getTestContext, resetDatabase, skipReason } from './helpers/db'
import { world, family, grant, gql, BOOK, STAFF_BOOK, CANCEL, MARK, REOPEN, moveSessionTo, ledgerProblems, HOUR, DAY } from './helpers/fixtures'

let ctx: any
let prisma: any
before(async () => {
  if (skipReason) return
  ctx = await getTestContext()
  prisma = ctx.prisma
  await resetDatabase(ctx)
})

test('1. capacity race: 10 parallel bookings for 4 seats → exactly 4 booked', { skip: skipReason }, async () => {
  const w = await world(prisma, { capacity: 4 })
  const fams = await Promise.all(Array.from({ length: 10 }, (_, i) => family(prisma, w.roles, 1, `Cap${i}`)))
  for (const f of fams) await grant(prisma, { familyId: f.family.id, studentId: f.students[0].id, minutes: 600 })
  const results = await Promise.all(fams.map((f) => gql(ctx, f.guardian.id, BOOK, { s: w.session.id, st: f.students[0].id })))
  const ok = results.filter((r: any) => r.bookSession.success)
  const refused = results.filter((r: any) => !r.bookSession.success)
  assert.equal(ok.length, 4, JSON.stringify(refused.map((r: any) => r.bookSession.error)))
  assert.equal(refused.length, 6)
  for (const r of refused) assert.match(r.bookSession.error, /full/i)
  assert.equal(await prisma.booking.count({ where: { sessionId: w.session.id, status: 'booked' } }), 4)
  // full + staff waitlist mode puts the student on the waitlist
  const extra = fams[results.findIndex((r: any) => !r.bookSession.success)]
  const wl = await gql(ctx, w.frontDesk.id, STAFF_BOOK, { s: w.session.id, st: extra.students[0].id, w: 'waitlist' })
  assert.equal(wl.staffBookSession.success, true, wl.staffBookSession.error)
  assert.equal(wl.staffBookSession.data.kind, 'waitlisted')
  assert.deepEqual(await ledgerProblems(prisma, fams.map((f) => f.family.id)), [])
})

test('2. tutor double booking: two series for one tutor at the same time → one fails', { skip: skipReason }, async () => {
  const w = await world(prisma)
  const start = new Date(Date.now() + 2 * DAY)
  const data = (roomId: string) => ({ programId: w.program.id, locationId: w.location.id, roomId, tutorId: w.tutor.id, weekday: start.getDay(), startMinute: 17 * 60, minutes: 60, capacity: 4, startDate: start.toISOString(), weeks: 3 })
  const room2 = await prisma.room.create({ data: { name: 'Room 2', capacity: 6, locationId: w.location.id } })
  const q = `mutation($d: JSON!) { createSessionSeries(data: $d) { success error id data } }`
  const [a, b] = await Promise.all([gql(ctx, w.manager.id, q, { d: data(w.room.id) }), gql(ctx, w.manager.id, q, { d: data(room2.id) })])
  const outcomes = [a.createSessionSeries, b.createSessionSeries]
  assert.equal(outcomes.filter((o: any) => o.success).length, 1, JSON.stringify(outcomes))
  assert.match(outcomes.find((o: any) => !o.success).error, /already teaching/)
  // the winner generated sessions, unique on (series, startsAt): generating again adds none
  const winner = outcomes.find((o: any) => o.success)
  assert.ok(winner.data.generated >= 3)
  const again = await gql(ctx, w.manager.id, `mutation($s: ID) { ensureSessionsGenerated(seriesId: $s, weeks: 3) { success data } }`, { s: winner.id })
  assert.equal(again.ensureSessionsGenerated.data.generated, 0)
})

test('3. credit race: two parallel bookings against minutes for one → one succeeds, never negative', { skip: skipReason }, async () => {
  const w = await world(prisma, { capacity: 4 })
  const s2 = await prisma.session.create({ data: { programId: w.program.id, locationId: w.location.id, tutorId: w.tutor.id, startsAt: new Date(w.session.startsAt.getTime() + 2 * HOUR), endsAt: new Date(w.session.startsAt.getTime() + 3 * HOUR), capacity: 4 } })
  const f = await family(prisma, w.roles, 1, 'Race')
  const g = await grant(prisma, { familyId: f.family.id, studentId: f.students[0].id, minutes: 60 })
  const [a, b] = await Promise.all([
    gql(ctx, f.guardian.id, BOOK, { s: w.session.id, st: f.students[0].id }),
    gql(ctx, f.guardian.id, BOOK, { s: s2.id, st: f.students[0].id }),
  ])
  const outcomes = [a.bookSession, b.bookSession]
  assert.equal(outcomes.filter((o: any) => o.success).length, 1, JSON.stringify(outcomes))
  assert.match(outcomes.find((o: any) => !o.success).error, /Not enough credit/)
  const after = await prisma.creditGrant.findUnique({ where: { id: g.id } })
  assert.equal(after.minutesAvailable, 0)
  assert.equal(after.status, 'exhausted')
  assert.deepEqual(await ledgerProblems(prisma, [f.family.id]), [])
})

test('4. ledger invariant after a random sequence of book, cancel early, cancel late, attend, reopen', { skip: skipReason }, async () => {
  const w = await world(prisma, { capacity: 6 })
  const f = await family(prisma, w.roles, 3, 'Ledger')
  await grant(prisma, { familyId: f.family.id, minutes: 60 * 30 })
  await grant(prisma, { familyId: f.family.id, minutes: 60 * 2, kind: 'goodwill' })
  const sessions = [w.session]
  for (let i = 1; i < 6; i += 1) sessions.push(await prisma.session.create({ data: { programId: w.program.id, locationId: w.location.id, tutorId: w.tutor.id, startsAt: new Date(Date.now() + (72 + i * 3) * HOUR), endsAt: new Date(Date.now() + (73 + i * 3) * HOUR), capacity: 6 } }))
  let seed = 7
  const rnd = (n: number) => { seed = (seed * 48271) % 2147483647; return seed % n }
  const booked: string[] = []
  for (let step = 0; step < 24; step += 1) {
    const op = rnd(5)
    if (op <= 1 || !booked.length) {
      const st = f.students[rnd(3)]
      const r = await gql(ctx, f.guardian.id, BOOK, { s: sessions[rnd(sessions.length)].id, st: st.id })
      if (r.bookSession.success) booked.push(r.bookSession.id)
      continue
    }
    const bookingId = booked[rnd(booked.length)]
    const b = await prisma.booking.findUnique({ where: { id: bookingId } })
    if (op === 2 && b.status === 'booked') await gql(ctx, f.guardian.id, CANCEL, { b: bookingId })
    if (op === 3 && b.status === 'booked') {
      await moveSessionTo(prisma, b.sessionId, new Date(Date.now() - HOUR * (1 + rnd(5))))
      await gql(ctx, w.frontDesk.id, MARK, { b: bookingId, o: ['attended', 'no_show', 'cancelled_late', 'late'][rnd(4)] })
    }
    if (op === 4 && b.status !== 'booked') await gql(ctx, w.manager.id, REOPEN, { b: bookingId, r: 'Corrected register' })
  }
  // a late cancel: move one booked session inside the window
  const stillBooked = await prisma.booking.findFirst({ where: { familyId: f.family.id, status: 'booked' } })
  if (stillBooked) {
    await moveSessionTo(prisma, stillBooked.sessionId, new Date(Date.now() + 5 * HOUR))
    await gql(ctx, f.guardian.id, CANCEL, { b: stillBooked.id })
  }
  assert.deepEqual(await ledgerProblems(prisma, [f.family.id]), [])
  assert.ok((await prisma.creditEntry.count({ where: { grant: { familyId: f.family.id } } })) > 5)
})

test('5. cancellation policy: early returns, late charges, excused grants one make-up a month, settings change it', { skip: skipReason }, async () => {
  const w = await world(prisma, { capacity: 6 })
  const f = await family(prisma, w.roles, 1, 'Policy')
  const st = f.students[0]
  const g = await grant(prisma, { familyId: f.family.id, studentId: st.id, minutes: 600 })
  const mk = async (hours: number) => prisma.session.create({ data: { programId: w.program.id, locationId: w.location.id, tutorId: w.tutor.id, startsAt: new Date(Date.now() + hours * HOUR), endsAt: new Date(Date.now() + (hours + 1) * HOUR), capacity: 6 } })
  const book = async (s: any) => (await gql(ctx, f.guardian.id, BOOK, { s: s.id, st: st.id })).bookSession.id

  // early
  const early = await book(await mk(48))
  assert.equal((await gql(ctx, f.guardian.id, CANCEL, { b: early })).cancelBooking.data.outcome, 'cancelled_early')
  assert.equal((await prisma.creditGrant.findUnique({ where: { id: g.id } })).minutesAvailable, 600)

  // late (inside 24h): charged
  const s1 = await mk(48); const late = await book(s1); await moveSessionTo(prisma, s1.id, new Date(Date.now() + 5 * HOUR))
  const lateRes = (await gql(ctx, f.guardian.id, CANCEL, { b: late })).cancelBooking
  assert.equal(lateRes.data.outcome, 'cancelled_late')
  assert.equal((await prisma.creditGrant.findUnique({ where: { id: g.id } })).minutesAvailable, 540)

  // excused late: make-up with the right expiry, only once a month
  const sMonth = new Date(Date.now() + 5 * HOUR)
  const s2 = await mk(48); const ex1 = await book(s2); await moveSessionTo(prisma, s2.id, sMonth)
  const r1 = (await gql(ctx, f.guardian.id, CANCEL, { b: ex1, e: true })).cancelBooking
  assert.equal(r1.data.outcome, 'cancelled_late_excused')
  const makeUp = await prisma.creditGrant.findFirst({ where: { sourceBooking: { id: ex1 } } })
  assert.equal(makeUp.kind, 'make_up')
  assert.equal(makeUp.minutesAvailable, 60)
  const expectedExpiry = Date.now() + 60 * DAY
  assert.ok(Math.abs(makeUp.expiresAt.getTime() - expectedExpiry) < 5 * 60000)
  const s3 = await mk(49); const ex2 = await book(s3)
  // the make-up credit is used first
  assert.equal((await prisma.booking.findUnique({ where: { id: ex2 } })).creditGrantId, makeUp.id)
  await moveSessionTo(prisma, s3.id, new Date(sMonth.getTime() + 30 * 60000))
  const r2 = (await gql(ctx, f.guardian.id, CANCEL, { b: ex2, e: true })).cancelBooking
  if (new Date(sMonth.getTime() + 30 * 60000).getMonth() === sMonth.getMonth()) assert.equal(r2.data.outcome, 'cancelled_late', 'second excused in a month is a normal late cancel')

  // settings change the result: window 2 hours → 5 hours before is early
  await prisma.businessSettings.upsert({ where: { id: 1 }, create: { id: 1, cancellationWindowHours: 2 }, update: { cancellationWindowHours: 2 } })
  const s4 = await mk(48); const b4 = await book(s4); await moveSessionTo(prisma, s4.id, new Date(Date.now() + 5 * HOUR))
  const preview = await gql(ctx, f.guardian.id, `query($b: ID!) { cancellationPreview(bookingId: $b) { outcome creditReturned windowHours } }`, { b: b4 })
  assert.equal(preview.cancellationPreview.outcome, 'cancelled_early')
  assert.equal(preview.cancellationPreview.windowHours, 2)
  assert.equal((await gql(ctx, f.guardian.id, CANCEL, { b: b4 })).cancelBooking.data.outcome, 'cancelled_early')
  await prisma.businessSettings.update({ where: { id: 1 }, data: { cancellationWindowHours: 24 } })
  assert.deepEqual(await ledgerProblems(prisma, [f.family.id]), [])
})

test('6. attendance → pay line: 1:1 per booking at subject rate; group one line; tutor no-show none; no-show pays per setting', { skip: skipReason }, async () => {
  // 1:1 at $30/h for 60 min = 3000
  const one = await world(prisma, { capacity: 1, format: 'one_to_one', payRate: 3000 })
  const f1 = await family(prisma, one.roles, 1, 'OneToOne')
  await grant(prisma, { familyId: f1.family.id, minutes: 600 })
  const b1 = (await gql(ctx, f1.guardian.id, BOOK, { s: one.session.id, st: f1.students[0].id })).bookSession.id
  await moveSessionTo(prisma, one.session.id, new Date(Date.now() - 2 * HOUR))
  assert.equal((await gql(ctx, one.tutorUser.id, MARK, { b: b1, o: 'attended' })).markAttendance.success, true)
  const lines1 = await prisma.payLine.findMany({ where: { sessionId: one.session.id, status: { not: 'void' } } })
  assert.equal(lines1.length, 1)
  assert.equal(lines1[0].amount, 3000)
  assert.equal(lines1[0].activeKey, `booking:${b1}`)
  assert.equal((await prisma.session.findUnique({ where: { id: one.session.id } })).status, 'completed')

  // group with 3 students: one line
  const grp = await world(prisma, { capacity: 4, payRate: 2400 })
  const fams = await Promise.all([0, 1, 2].map((i) => family(prisma, grp.roles, 1, `Group${i}`)))
  const bookings = []
  for (const f of fams) { await grant(prisma, { familyId: f.family.id, minutes: 600 }); bookings.push((await gql(ctx, f.guardian.id, BOOK, { s: grp.session.id, st: f.students[0].id })).bookSession.id) }
  await moveSessionTo(prisma, grp.session.id, new Date(Date.now() - HOUR))
  for (const [i, b] of bookings.entries()) await gql(ctx, grp.frontDesk.id, MARK, { b, o: i === 2 ? 'no_show' : 'attended' })
  const lines2 = await prisma.payLine.findMany({ where: { sessionId: grp.session.id, status: { not: 'void' } } })
  assert.equal(lines2.length, 1)
  assert.equal(lines2[0].amount, 2400)

  // tutor no-show: centre cancels for tutor_absent → no pay, credits back
  const abs = await world(prisma, { capacity: 4 })
  const fa = await family(prisma, abs.roles, 1, 'Absent')
  const ga = await grant(prisma, { familyId: fa.family.id, minutes: 120 })
  await gql(ctx, fa.guardian.id, BOOK, { s: abs.session.id, st: fa.students[0].id })
  const cancel = await gql(ctx, abs.manager.id, `mutation($s: ID!) { cancelSession(sessionId: $s, reason: "tutor_absent") { success error data } }`, { s: abs.session.id })
  assert.equal(cancel.cancelSession.success, true, cancel.cancelSession.error)
  assert.equal(await prisma.payLine.count({ where: { sessionId: abs.session.id, status: { not: 'void' } } }), 0)
  assert.equal((await prisma.creditGrant.findUnique({ where: { id: ga.id } })).minutesAvailable, 120)

  // student no-show pays per setting: 50%
  await prisma.businessSettings.upsert({ where: { id: 1 }, create: { id: 1, tutorPaidOnNoShowPercent: 50 }, update: { tutorPaidOnNoShowPercent: 50 } })
  const ns = await world(prisma, { capacity: 1, format: 'one_to_one', payRate: 4000 })
  const fn = await family(prisma, ns.roles, 1, 'NoShow')
  await grant(prisma, { familyId: fn.family.id, minutes: 600 })
  const bn = (await gql(ctx, fn.guardian.id, BOOK, { s: ns.session.id, st: fn.students[0].id })).bookSession.id
  await moveSessionTo(prisma, ns.session.id, new Date(Date.now() - HOUR))
  await gql(ctx, ns.frontDesk.id, MARK, { b: bn, o: 'no_show' })
  const ln = await prisma.payLine.findMany({ where: { sessionId: ns.session.id, status: { not: 'void' } } })
  assert.equal(ln.length, 1)
  assert.equal(ln[0].kind, 'no_show')
  assert.equal(ln[0].amount, 2000)
  await prisma.businessSettings.update({ where: { id: 1 }, data: { tutorPaidOnNoShowPercent: 100 } })

  // tutor may not mark another tutor's session
  const other = await world(prisma, { capacity: 1, format: 'one_to_one' })
  const fo = await family(prisma, other.roles, 1, 'Other')
  await grant(prisma, { familyId: fo.family.id, minutes: 600 })
  const bo = (await gql(ctx, fo.guardian.id, BOOK, { s: other.session.id, st: fo.students[0].id })).bookSession.id
  await moveSessionTo(prisma, other.session.id, new Date(Date.now() - HOUR))
  const denied = await gql(ctx, one.tutorUser.id, MARK, { b: bo, o: 'attended' })
  assert.equal(denied.markAttendance.success, false)
})

test('7. reopen after payroll approve is refused and makes an adjustment line instead', { skip: skipReason }, async () => {
  await prisma.businessSettings.upsert({ where: { id: 1 }, create: { id: 1, tutorPaidOnNoShowPercent: 50 }, update: { tutorPaidOnNoShowPercent: 50 } })
  const w = await world(prisma, { capacity: 1, format: 'one_to_one', payRate: 3000 })
  const f = await family(prisma, w.roles, 1, 'Reopen')
  const g = await grant(prisma, { familyId: f.family.id, minutes: 600 })
  const b = (await gql(ctx, f.guardian.id, BOOK, { s: w.session.id, st: f.students[0].id })).bookSession.id
  await moveSessionTo(prisma, w.session.id, new Date(Date.now() - 3 * HOUR))
  await gql(ctx, w.frontDesk.id, MARK, { b, o: 'attended' })

  // before approval a reopen works and writes reversing entries
  const r1 = (await gql(ctx, w.manager.id, REOPEN, { b, c: 'no_show', r: 'Marked the wrong child' })).reopenBooking
  assert.equal(r1.success, true, r1.error)
  assert.equal((await prisma.booking.findUnique({ where: { id: b } })).status, 'no_show')
  assert.equal(await prisma.creditEntry.count({ where: { bookingId: b, type: 'reversal' } }), 1)
  // front desk cannot reopen
  assert.equal((await gql(ctx, w.frontDesk.id, REOPEN, { b, r: 'x' })).reopenBooking.success, false)

  // approve the pay line in a run
  const line = await prisma.payLine.findFirst({ where: { activeKey: `booking:${b}`, status: 'accrued' } })
  const run = await prisma.payrollRun.create({ data: { locationId: w.location.id, periodStart: new Date(Date.now() - 7 * DAY), periodEnd: new Date(), status: 'approved' } })
  await prisma.payLine.update({ where: { id: line.id }, data: { status: 'approved', payrollRunId: run.id } })

  const r2 = (await gql(ctx, w.manager.id, REOPEN, { b, c: 'attended', r: 'Child was there after all' })).reopenBooking
  assert.equal(r2.success, false)
  assert.match(r2.error, /approved payroll run/)
  assert.equal((await prisma.booking.findUnique({ where: { id: b } })).status, 'no_show')
  const adj = await prisma.payLine.findFirst({ where: { sessionId: w.session.id, kind: 'adjustment' } })
  assert.ok(adj, 'adjustment line exists')
  assert.equal(adj.amount, 1500, 'attended pays 3000, no-show paid 50% = 1500: difference goes to the next run')
  assert.equal(adj.status, 'accrued')
  assert.equal(adj.payrollRunId, null)
  assert.equal((await prisma.creditGrant.findUnique({ where: { id: g.id } })).minutesAvailable, 540)
  await prisma.businessSettings.update({ where: { id: 1 }, data: { tutorPaidOnNoShowPercent: 100 } })
  assert.deepEqual(await ledgerProblems(prisma, [f.family.id]), [])
})
