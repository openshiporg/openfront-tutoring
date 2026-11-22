/**
 * Loads the §9 catalogue for Brightpath Learning into an EMPTY database so the storefront
 * has real records to render: business and settings, two centres with hours and rooms,
 * subjects, levels, programmes (SAT Prep, ACT Prep, SAT & ACT Prep featured, plus the
 * tutoring programmes), plans, packages, ten tutors with public profiles and availability,
 * published reviews and four weeks of group sessions.
 *
 * Not shipped in any route. Run with the repo's Keystone context:
 *   DATABASE_URL=... npx tsx features/storefront/dev/load-catalogue.ts
 * The backend builder folds this into onboarding (§9).
 */
import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { keystoneContext } from '../../keystone/context'
import { zonedTime } from '../../keystone/queries/storefront'

const ctx = keystoneContext.sudo() as any
const prisma = ctx.prisma
const DAY = 86_400_000
const TZ = 'America/Chicago'
const dollars = (n: number) => Math.round(n * 100)

async function upload(file: string) {
  const full = path.join(process.cwd(), 'public', 'storefront', file)
  if (!existsSync(full)) return {}
  if (!process.env.S3_BUCKET_NAME) mkdirSync(path.join(process.cwd(), 'public', 'uploads', 'images'), { recursive: true })
  const data = await ctx.images('my_images').getDataFromStream(createReadStream(full), file)
  return { image_id: data.id, image_extension: data.extension, image_filesize: data.filesize, image_width: data.width, image_height: data.height }
}
const photoOf = (d: any) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k.replace('image_', 'photo_'), v]))

const doc = (...paragraphs: string[]) => paragraphs.map((text) => ({ type: 'paragraph', children: [{ text }] }))
const hours = (days: Record<string, Array<[string, string]>>) => days

export async function loadCatalogue() {
  if ((await prisma.program.count()) > 0) {
    console.log('Catalogue already present; nothing loaded.')
    return
  }
  // A run that stopped part-way leaves rows without programmes; clear them so the load starts clean.
  await prisma.room.deleteMany({})
  await prisma.location.deleteMany({})
  await prisma.subject.deleteMany({})
  await prisma.level.deleteMany({})

  // ---------------------------------------------------------------- business
  await prisma.business.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1, name: 'Brightpath Learning', legalName: 'Brightpath Learning LLC', currency: 'USD', country: 'US',
      supportEmail: 'hello@brightpathlearning.com', careersEmail: 'careers@brightpathlearning.com', phone: '(847) 555-0142',
      kind: 'mixed',
      about: 'Expert SAT and ACT test prep for high-school students, with the guidance, practice, and support you need to reach your goals.',
      socialLinks: { instagram: 'https://instagram.com/brightpathlearning', youtube: 'https://youtube.com/@brightpathlearning', tiktok: 'https://tiktok.com/@brightpathlearning' },
    },
  })
  await prisma.businessSettings.upsert({
    where: { id: 1 }, update: {},
    create: {
      id: 1,
      policiesText: 'We keep a seat and a tutor for every booked session, so we ask for notice when plans change.\n\nPayments are taken by card through Stripe. Membership fees renew monthly on the day you joined.\n\nIf we cancel a session (a closure or a tutor absence), the credit always comes back to you.',
    },
  })

  // ---------------------------------------------------------------- levels and subjects
  const levelNames = ['Kindergarten', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)]
  const levels: Record<string, any> = {}
  for (const [i, name] of levelNames.entries()) levels[name] = await prisma.level.create({ data: { name, sortOrder: i, kind: 'grade' } })
  levels.SAT = await prisma.level.create({ data: { name: 'SAT', sortOrder: 20, kind: 'exam' } })
  levels.ACT = await prisma.level.create({ data: { name: 'ACT', sortOrder: 21, kind: 'exam' } })

  const subjectRows: Array<[string, string, string, string]> = [
    ['Maths', 'maths', 'maths', 'Number sense through algebra and geometry.'],
    ['Reading', 'reading', 'english', 'Phonics, fluency and comprehension.'],
    ['Writing', 'writing', 'english', 'Sentences, paragraphs and the five-paragraph essay.'],
    ['Science', 'science', 'science', 'Middle and high-school science.'],
    ['SAT Prep', 'sat-prep', 'test_prep', 'Reading and Writing, and Math, for the digital SAT.'],
    ['ACT Prep', 'act-prep', 'test_prep', 'English, Math, Reading and Science for the ACT.'],
    ['Study Skills', 'study-skills', 'study_skills', 'Planning, note-taking and exam technique.'],
  ]
  const subjects: Record<string, any> = {}
  for (const [i, [name, slug, category, description]] of subjectRows.entries()) subjects[slug] = await prisma.subject.create({ data: { name, slug, category, description, sortOrder: i } })

  // ---------------------------------------------------------------- locations
  const centreHours = hours({ mon: [['15:00', '20:00']], tue: [['15:00', '20:00']], wed: [['15:00', '20:00']], thu: [['15:00', '20:00']], fri: [['15:00', '18:00']], sat: [['09:00', '14:00']], sun: [] })
  const centrePhoto = photoOf(await upload('centre.jpg'))
  const maple = await prisma.location.create({
    data: {
      name: 'Maple Avenue Centre', slug: 'maple-avenue', addressLine1: '1820 Maple Avenue', city: 'Evanston', region: 'IL', postalCode: '60201', country: 'US',
      lat: 42.0483, lng: -87.6855, phone: '(847) 555-0142', email: 'maple@brightpathlearning.com', timezone: TZ, openingHours: centreHours,
      description: 'Our first centre, two blocks from the Davis Street station. Six quiet study rooms and a bright group classroom.', status: 'active', ...centrePhoto,
    },
  })
  const riverside = await prisma.location.create({
    data: {
      name: 'Riverside Centre', slug: 'riverside', addressLine1: '415 Riverside Drive', addressLine2: 'Suite 200', city: 'Glenview', region: 'IL', postalCode: '60025', country: 'US',
      lat: 42.0698, lng: -87.7878, phone: '(847) 555-0178', email: 'riverside@brightpathlearning.com', timezone: TZ,
      openingHours: hours({ mon: [['15:30', '20:00']], tue: [['15:30', '20:00']], wed: [['15:30', '20:00']], thu: [['15:30', '20:00']], fri: [], sat: [['09:00', '15:00']], sun: [['12:00', '16:00']] }),
      description: 'Upstairs at the Riverside Commons, with free parking. Weekend SAT and ACT classes run here.', status: 'active',
    },
  })
  const rooms: Record<string, any[]> = { [maple.id]: [], [riverside.id]: [] }
  for (const loc of [maple, riverside]) for (const [name, capacity] of [['Room A', 6], ['Room B', 4], ['Room C', 4]] as const) rooms[loc.id].push(await prisma.room.create({ data: { location: { connect: { id: loc.id } }, name, capacity, kind: 'room' } }))

  // ---------------------------------------------------------------- programmes
  const both = [{ id: maple.id }, { id: riverside.id }]
  type P = { name: string; slug: string; summary: string; body: string[]; image?: string; subjects: string[]; from: string; to: string; modes: string[]; format: string; max: number; minutes: number; assess: boolean; fee: number; assessMinutes: number; trial?: boolean; payg?: number; featured?: boolean; outcomes: string; faq: Array<{ q: string; a: string }> }
  const programs: P[] = [
    {
      name: 'SAT Prep', slug: 'sat-prep', summary: 'Build the skills and strategies to raise your SAT score.', image: 'sat.jpg',
      body: ['A diagnostic test shows where the points are. Your tutor builds a plan around it: Reading and Writing, Math, timing and test-day strategy for the digital SAT.', 'Small classes of up to four, or one-to-one online, with a full practice test every three weeks.'],
      subjects: ['sat-prep'], from: 'Grade 10', to: 'Grade 12', modes: ['in_centre', 'online'], format: 'small_group', max: 4, minutes: 90, assess: true, fee: 95, assessMinutes: 60, featured: true,
      outcomes: 'Know the format and timing of every section\nA plan aimed at your weakest question types\nFull-length practice tests with a review of every miss',
      faq: [{ q: 'How long before the test should we start?', a: 'Most students start 10 to 12 weeks before their test date.' }, { q: 'Is the diagnostic a full test?', a: 'Yes: a full-length digital SAT under timed conditions, then a 15-minute review with the assessor.' }],
    },
    {
      name: 'ACT Prep', slug: 'act-prep', summary: 'Master the ACT with targeted practice and expert guidance.', image: 'act.jpg',
      body: ['English, Math, Reading and Science, with the pacing work the ACT demands. A diagnostic first, then a plan built on what it shows.'],
      subjects: ['act-prep'], from: 'Grade 10', to: 'Grade 12', modes: ['in_centre', 'online'], format: 'small_group', max: 4, minutes: 90, assess: true, fee: 95, assessMinutes: 60, featured: true,
      outcomes: 'Section-by-section pacing\nScience reasoning without the panic\nPractice tests reviewed with your tutor',
      faq: [{ q: 'Do you cover the optional writing test?', a: 'Yes, as two extra sessions near your test date.' }],
    },
    {
      name: 'SAT & ACT Prep', slug: 'sat-act-prep', summary: 'Not sure which test is right for you? Get prepared for both and keep your options open.', image: 'satact.jpg',
      body: ['Start with both diagnostics, see which test suits you, then focus. The shared skills (algebra, grammar, evidence-based reading) are taught once.'],
      subjects: ['sat-prep', 'act-prep'], from: 'Grade 10', to: 'Grade 12', modes: ['in_centre', 'online'], format: 'one_to_one', max: 1, minutes: 60, assess: true, fee: 95, assessMinutes: 90, featured: true,
      outcomes: 'Both diagnostics, compared side by side\nA recommendation on which test to sit\nOne plan for the skills both tests share',
      faq: [{ q: 'Is this one-to-one?', a: 'Yes. Sessions are one-to-one, in a centre or online.' }],
    },
    {
      name: 'Maths Foundations', slug: 'maths-foundations', summary: 'Small-group maths for grades 2 to 8, from number sense to pre-algebra.', image: 'centre.jpg',
      body: ['Students work in groups of four with one tutor, on a plan built from a free assessment. Every session ends with a short report to parents.'],
      subjects: ['maths'], from: 'Grade 2', to: 'Grade 8', modes: ['in_centre'], format: 'small_group', max: 4, minutes: 60, assess: true, fee: 0, assessMinutes: 45, featured: false,
      outcomes: 'Fluency with facts and procedures\nConfidence with word problems\nA plan reviewed every 12 weeks',
      faq: [{ q: 'Is the assessment free?', a: 'Yes, the maths assessment is free and takes 45 minutes.' }],
    },
    {
      name: 'Reading and Writing Lab', slug: 'reading-writing-lab', summary: 'Phonics, comprehension and writing in small groups for grades 1 to 6.', image: 'reading.jpg',
      body: ['Readers grow by reading aloud and talking about it. Groups of four, matched by reading level, with writing every week.'],
      subjects: ['reading', 'writing'], from: 'Grade 1', to: 'Grade 6', modes: ['in_centre'], format: 'small_group', max: 4, minutes: 60, assess: true, fee: 0, assessMinutes: 45, featured: false,
      outcomes: 'Reading at or above grade level\nClear, organised paragraphs\nA love of books',
      faq: [],
    },
    {
      name: 'Private Tutoring at Home', slug: 'private-tutoring', summary: 'One-to-one tutoring in your home or online, matched to your child.', image: 'home.jpg',
      body: ['Tell us the subject and the times that work. We match a tutor, the first session is a trial, and if it is not the right fit we re-match at no cost.'],
      subjects: ['maths', 'reading', 'writing', 'science', 'study-skills'], from: 'Grade 1', to: 'Grade 12', modes: ['in_home', 'online'], format: 'one_to_one', max: 1, minutes: 60, assess: true, fee: 0, assessMinutes: 30, trial: true, payg: 75, featured: false,
      outcomes: 'A tutor matched on subject, level and schedule\nA trial session first\nOne free re-match',
      faq: [{ q: 'Which areas do you travel to?', a: 'Evanston, Wilmette, Skokie, Glenview and Northbrook. Online anywhere.' }],
    },
    {
      name: 'Homework Club', slug: 'homework-club', summary: 'Drop-in homework help after school, Monday to Thursday.', image: 'centre.jpg',
      body: ['A calm room and a tutor on hand. Book any open slot; no assessment needed.'],
      subjects: ['study-skills'], from: 'Grade 3', to: 'Grade 8', modes: ['in_centre'], format: 'class', max: 8, minutes: 60, assess: false, fee: 0, assessMinutes: 30, payg: 25, featured: false,
      outcomes: 'Homework done before dinner\nHelp exactly when it is needed',
      faq: [],
    },
  ]
  const P: Record<string, any> = {}
  for (const p of programs) {
    const img = p.image ? await upload(p.image) : {}
    P[p.slug] = await prisma.program.create({
      data: {
        name: p.name, slug: p.slug, summary: p.summary, description: doc(...p.body), ...img,
        subjects: { connect: p.subjects.map((s) => ({ id: subjects[s].id })) },
        levelsFrom: { connect: { id: levels[p.from].id } }, levelsTo: { connect: { id: levels[p.to].id } },
        deliveryModes: p.modes, format: p.format, maxStudentsPerSession: p.max, sessionMinutes: p.minutes,
        billingModel: 'managed', requiresAssessment: p.assess, assessmentFee: dollars(p.fee), assessmentMinutes: p.assessMinutes,
        allowsTrial: Boolean(p.trial), payAsYouGoPrice: dollars(p.payg ?? 0),
        locations: { connect: p.modes.includes('in_centre') ? both : [] },
        status: 'published', featured: Boolean(p.featured), outcomes: p.outcomes, faq: p.faq,
      },
    })
  }

  // ---------------------------------------------------------------- plans and packages
  const monthly = [
    { name: '8 sessions a month', sessions: 8, price: 289, features: ['Two sessions a week', 'Session report after every visit', 'One unused month of sessions rolls over'] },
    { name: '12 sessions a month', sessions: 12, price: 389, features: ['Three sessions a week', 'Session report after every visit', 'Progress report every four weeks'], highlight: true },
    { name: 'Unlimited', sessions: null, price: 479, features: ['Up to five sessions a week', 'Book any open slot', 'Progress report every four weeks'] },
  ]
  for (const slug of ['maths-foundations', 'reading-writing-lab', 'sat-prep', 'act-prep']) {
    for (const [i, m] of monthly.entries()) {
      await prisma.membershipPlan.create({
        data: { name: m.name, program: { connect: { id: P[slug].id } }, sessionsPerPeriod: m.sessions, weeklyCapForUnlimited: 5, price: dollars(m.price), enrolmentFee: dollars(75), minimumTermMonths: 0, features: m.features, highlight: Boolean(m.highlight), sortOrder: i, status: 'published', description: '' },
      })
    }
  }
  const packages: Array<[string, string, number, number]> = [
    ['private-tutoring', '10 hours', 10, 650], ['private-tutoring', '20 hours', 20, 1200],
    ['sat-act-prep', 'SAT & ACT 24 hours', 24, 1920], ['sat-act-prep', '10 hours', 10, 850],
    ['sat-prep', 'SAT 24 hours', 24, 1920], ['act-prep', 'ACT 24 hours', 24, 1920],
    ['homework-club', '10 visits', 10, 220],
  ]
  for (const [i, [slug, name, h, price]] of packages.entries()) {
    await prisma.package.create({ data: { name, program: { connect: { id: P[slug].id } }, hours: h, price: dollars(price), expiryMonths: 6, sortOrder: i, status: 'published', description: '' } })
  }

  // ---------------------------------------------------------------- tutors
  type T = { name: string; slug: string; headline: string; bio: string; edu: string; years: number; modes: string[]; areas?: string; home: any; locs: any[]; rate: number; subjects: Array<[string, string, string]>; avail: Array<[number, number, number, string]> }
  const tutors: T[] = [
    { name: 'Dana Whitfield', slug: 'dana-whitfield', headline: 'SAT and ACT lead tutor', bio: 'Dana has taught SAT and ACT prep for twelve years and scored in the 99th percentile on both. She builds every plan from the diagnostic and keeps parents in the loop after every session.', edu: 'BA Mathematics, Northwestern University', years: 12, modes: ['in_centre', 'online'], home: maple, locs: [maple], rate: 45, subjects: [['sat-prep', 'Grade 10', 'SAT'], ['act-prep', 'Grade 10', 'ACT'], ['maths', 'Grade 6', 'Grade 12']], avail: [[1, 900, 1200, 'in_centre'], [3, 900, 1200, 'in_centre'], [6, 540, 840, 'in_centre'], [2, 960, 1200, 'online']] },
    { name: 'Marcus Lee', slug: 'marcus-lee', headline: 'ACT Math and Science specialist', bio: 'A former high-school physics teacher, Marcus makes the ACT Science section feel like a puzzle rather than a test. Students like his pacing drills.', edu: 'MS Physics, University of Illinois', years: 9, modes: ['in_centre', 'online'], home: riverside, locs: [riverside], rate: 42, subjects: [['act-prep', 'Grade 10', 'ACT'], ['science', 'Grade 6', 'Grade 12'], ['maths', 'Grade 6', 'Grade 12']], avail: [[2, 930, 1200, 'in_centre'], [4, 930, 1200, 'in_centre'], [0, 720, 960, 'in_centre'], [1, 1020, 1200, 'online']] },
    { name: 'Priya Raman', slug: 'priya-raman', headline: 'SAT Reading and Writing', bio: 'Priya coaches the reading and grammar side of the SAT. Her students learn to find the evidence fast and stop second-guessing.', edu: 'BA English, University of Chicago', years: 7, modes: ['in_centre', 'online'], home: maple, locs: [maple, riverside], rate: 40, subjects: [['sat-prep', 'Grade 10', 'SAT'], ['writing', 'Grade 6', 'Grade 12'], ['reading', 'Grade 6', 'Grade 12']], avail: [[2, 900, 1200, 'in_centre'], [4, 900, 1200, 'in_centre'], [6, 540, 900, 'in_centre'], [3, 1020, 1200, 'online']] },
    { name: 'Elena Brooks', slug: 'elena-brooks', headline: 'Maths Foundations lead', bio: 'Elena taught elementary maths for a decade before joining Brightpath. She runs the Maths Foundations groups at Maple Avenue.', edu: 'MEd Elementary Education, Loyola University Chicago', years: 11, modes: ['in_centre'], home: maple, locs: [maple], rate: 32, subjects: [['maths', 'Grade 2', 'Grade 8']], avail: [[1, 900, 1140, 'in_centre'], [2, 900, 1140, 'in_centre'], [3, 900, 1140, 'in_centre'], [4, 900, 1140, 'in_centre']] },
    { name: 'Samuel Okafor', slug: 'samuel-okafor', headline: 'Maths and study skills', bio: 'Samuel helps middle-schoolers get organised and get unstuck in maths. Patient, structured and calm.', edu: 'BS Engineering, Purdue University', years: 5, modes: ['in_centre', 'in_home', 'online'], areas: 'Evanston, Skokie, Wilmette', home: riverside, locs: [riverside], rate: 30, subjects: [['maths', 'Grade 4', 'Grade 10'], ['study-skills', 'Grade 4', 'Grade 10']], avail: [[1, 930, 1200, 'in_centre'], [3, 930, 1200, 'in_centre'], [2, 960, 1200, 'in_home'], [4, 960, 1200, 'online']] },
    { name: 'Grace Kim', slug: 'grace-kim', headline: 'Reading and Writing Lab', bio: 'Grace is a certified reading specialist. She matches every reader with the right books and the right group.', edu: 'MA Reading Education, DePaul University', years: 8, modes: ['in_centre', 'online'], home: maple, locs: [maple, riverside], rate: 34, subjects: [['reading', 'Grade 1', 'Grade 6'], ['writing', 'Grade 1', 'Grade 6']], avail: [[1, 900, 1140, 'in_centre'], [3, 900, 1140, 'in_centre'], [6, 540, 780, 'in_centre'], [4, 960, 1140, 'online']] },
    { name: 'Owen Harris', slug: 'owen-harris', headline: 'Science and maths, grades 6 to 12', bio: 'Owen is a chemistry graduate who tutors biology, chemistry and algebra, in centre, at home or online.', edu: 'BS Chemistry, Loyola University Chicago', years: 4, modes: ['in_centre', 'in_home', 'online'], areas: 'Glenview, Northbrook, Wilmette', home: riverside, locs: [riverside], rate: 30, subjects: [['science', 'Grade 6', 'Grade 12'], ['maths', 'Grade 6', 'Grade 12']], avail: [[2, 960, 1200, 'in_centre'], [4, 960, 1200, 'in_centre'], [1, 960, 1200, 'in_home'], [3, 960, 1200, 'online']] },
    { name: 'Sofia Martinez', slug: 'sofia-martinez', headline: 'Bilingual reading and writing', bio: 'Sofia tutors reading and writing in English and Spanish, and runs Homework Club at Riverside.', edu: 'BA Education, Northeastern Illinois University', years: 6, modes: ['in_centre', 'in_home', 'online'], areas: 'Evanston, Skokie', home: riverside, locs: [riverside], rate: 28, subjects: [['reading', 'Grade 1', 'Grade 8'], ['writing', 'Grade 1', 'Grade 8'], ['study-skills', 'Grade 3', 'Grade 8']], avail: [[1, 900, 1140, 'in_centre'], [2, 900, 1140, 'in_centre'], [3, 900, 1140, 'in_centre'], [4, 900, 1140, 'in_home']] },
    { name: 'Nathan Cole', slug: 'nathan-cole', headline: 'SAT Math and algebra', bio: 'Nathan scored a perfect 800 on SAT Math and loves showing students the shortcuts that save minutes.', edu: 'BS Mathematics, University of Wisconsin', years: 3, modes: ['in_centre', 'online'], home: riverside, locs: [riverside, maple], rate: 36, subjects: [['sat-prep', 'Grade 10', 'SAT'], ['maths', 'Grade 8', 'Grade 12']], avail: [[0, 720, 960, 'in_centre'], [6, 600, 900, 'in_centre'], [2, 1020, 1260, 'online'], [4, 1020, 1260, 'online']] },
    { name: 'Hannah Wright', slug: 'hannah-wright', headline: 'Homework Club and study skills', bio: 'Hannah keeps Homework Club at Maple Avenue calm and focused, and teaches planning and note-taking.', edu: 'BA Psychology, Northwestern University', years: 3, modes: ['in_centre'], home: maple, locs: [maple], rate: 22, subjects: [['study-skills', 'Grade 3', 'Grade 8'], ['maths', 'Grade 3', 'Grade 6']], avail: [[1, 900, 1080, 'in_centre'], [2, 900, 1080, 'in_centre'], [3, 900, 1080, 'in_centre'], [4, 900, 1080, 'in_centre']] },
  ]
  const T: Record<string, any> = {}
  for (const t of tutors) {
    T[t.slug] = await prisma.tutor.create({
      data: {
        displayName: t.name, slug: t.slug, headline: t.headline, bio: t.bio, education: t.edu, yearsExperience: t.years,
        employmentType: 'employee', deliveryModes: t.modes, travelAreas: t.areas ?? '', homeLocation: { connect: { id: t.home.id } },
        locations: { connect: t.locs.map((l) => ({ id: l.id })) }, defaultPayRate: dollars(t.rate), status: 'active', publicProfile: true,
        subjects: { create: t.subjects.map(([s, from, to]) => ({ subject: { connect: { id: subjects[s].id } }, levelFrom: { connect: { id: levels[from].id } }, levelTo: { connect: { id: levels[to].id } }, payRate: dollars(t.rate) })) },
        availability: { create: t.avail.map(([weekday, startMinute, endMinute, mode]) => ({ weekday, startMinute, endMinute, mode, ...(mode === 'in_centre' ? { location: { connect: { id: t.home.id } } } : {}) })) },
      },
    })
  }

  // ---------------------------------------------------------------- reviews
  const reviews: Array<[string, string, string | null, string | null, number]> = [
    ['Maya T., Class of 2025', 'Brightpath gave me a clear plan, amazing support, and the practice I needed to raise my SAT score by 150 points!', 'sat-prep', 'dana-whitfield', 5],
    ['James R., Class of 2025', 'The lessons were engaging, the strategies actually worked, and my ACT score went up 6 points. I feel so much more confident now.', 'act-prep', 'marcus-lee', 5],
    ['Elena S., Class of 2026', 'A huge difference from other test prep I\'ve tried. It\'s personalized, flexible, and really focused on results.', 'sat-act-prep', 'priya-raman', 5],
    ['Laura P., parent', 'Our son went from dreading maths to asking for extra worksheets. The weekly reports told us exactly what he was working on.', 'maths-foundations', 'elena-brooks', 5],
    ['Kevin and Joy A., parents', 'Grace found books our daughter actually wanted to read. Two reading levels up by spring.', 'reading-writing-lab', 'grace-kim', 5],
    ['Rachel D., parent', 'Samuel comes to the house on Tuesdays and our twins finally have a homework routine that sticks.', 'private-tutoring', 'samuel-okafor', 4],
  ]
  for (const [authorName, text, prog, tutor, rating] of reviews) {
    await prisma.review.create({
      data: {
        authorName, text, rating, source: 'survey', status: 'published',
        ...(prog ? { program: { connect: { id: P[prog].id } } } : {}),
        ...(tutor ? { tutor: { connect: { id: T[tutor].id } } } : {}),
        location: { connect: { id: (tutor && tutors.find((x) => x.slug === tutor)!.home.id) || maple.id } },
      },
    })
  }

  // ---------------------------------------------------------------- four weeks of group sessions
  type S = { program: string; subject: string; loc: any; room: number; tutor: string; weekday: number; start: number; capacity: number }
  const series: S[] = [
    { program: 'maths-foundations', subject: 'maths', loc: maple, room: 0, tutor: 'elena-brooks', weekday: 1, start: 960, capacity: 4 },
    { program: 'maths-foundations', subject: 'maths', loc: maple, room: 0, tutor: 'elena-brooks', weekday: 3, start: 960, capacity: 4 },
    { program: 'maths-foundations', subject: 'maths', loc: riverside, room: 0, tutor: 'samuel-okafor', weekday: 1, start: 990, capacity: 4 },
    { program: 'reading-writing-lab', subject: 'reading', loc: maple, room: 1, tutor: 'grace-kim', weekday: 1, start: 960, capacity: 4 },
    { program: 'reading-writing-lab', subject: 'reading', loc: riverside, room: 1, tutor: 'sofia-martinez', weekday: 2, start: 960, capacity: 4 },
    { program: 'sat-prep', subject: 'sat-prep', loc: maple, room: 2, tutor: 'dana-whitfield', weekday: 3, start: 1020, capacity: 4 },
    { program: 'sat-prep', subject: 'sat-prep', loc: maple, room: 2, tutor: 'priya-raman', weekday: 6, start: 600, capacity: 4 },
    { program: 'sat-prep', subject: 'sat-prep', loc: riverside, room: 2, tutor: 'nathan-cole', weekday: 0, start: 780, capacity: 4 },
    { program: 'act-prep', subject: 'act-prep', loc: riverside, room: 2, tutor: 'marcus-lee', weekday: 2, start: 1020, capacity: 4 },
    { program: 'act-prep', subject: 'act-prep', loc: riverside, room: 2, tutor: 'marcus-lee', weekday: 0, start: 720, capacity: 4 },
    { program: 'homework-club', subject: 'study-skills', loc: maple, room: 0, tutor: 'hannah-wright', weekday: 2, start: 930, capacity: 6 },
    { program: 'homework-club', subject: 'study-skills', loc: maple, room: 0, tutor: 'hannah-wright', weekday: 4, start: 930, capacity: 6 },
    { program: 'homework-club', subject: 'study-skills', loc: riverside, room: 0, tutor: 'sofia-martinez', weekday: 3, start: 930, capacity: 6 },
  ]
  const today = new Date()
  const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  let sessionCount = 0
  for (const s of series) {
    const program = P[s.program]
    const room = rooms[s.loc.id][s.room]
    const row = await prisma.sessionSeries.create({
      data: {
        program: { connect: { id: program.id } }, subject: { connect: { id: subjects[s.subject].id } }, location: { connect: { id: s.loc.id } },
        room: { connect: { id: room.id } }, tutor: { connect: { id: T[s.tutor].id } }, mode: 'in_centre',
        weekday: s.weekday, startMinute: s.start, minutes: program.sessionMinutes, capacity: s.capacity, startDate, status: 'active',
      },
    })
    let through = startDate
    for (let d = 0; d < 28; d += 1) {
      const day = new Date(startDate.getTime() + d * DAY)
      if (day.getUTCDay() !== s.weekday) continue
      const startsAt = new Date(zonedTime(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), s.start, TZ))
      if (startsAt.getTime() < Date.now()) continue
      const endsAt = new Date(startsAt.getTime() + program.sessionMinutes * 60_000)
      await prisma.session.create({
        data: {
          series: { connect: { id: row.id } }, program: { connect: { id: program.id } }, subject: { connect: { id: subjects[s.subject].id } },
          location: { connect: { id: s.loc.id } }, room: { connect: { id: room.id } }, tutor: { connect: { id: T[s.tutor].id } },
          mode: 'in_centre', startsAt, endsAt, capacity: s.capacity, status: 'scheduled',
        },
      })
      sessionCount += 1
      through = endsAt
    }
    await prisma.sessionSeries.update({ where: { id: row.id }, data: { generatedThrough: through } })
  }
  console.log(`Loaded Brightpath Learning: ${programs.length} programmes, ${tutors.length} tutors, ${reviews.length} reviews, ${sessionCount} sessions.`)
}

if (process.argv[1]?.includes('load-catalogue')) {
  loadCatalogue().then(() => process.exit(0), (error) => { console.error(String(error?.stack || error).slice(0, 2000)); process.exit(1) })
}
