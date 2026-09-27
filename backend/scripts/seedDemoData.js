/**
 * Fill an org with realistic demo data across every Pulse screen.
 * Usage:
 *   node scripts/seedDemoData.js [organizationId] [--admin you@bda.co.in]
 *   node scripts/seedDemoData.js --reset        # remove everything this script added
 * Every document it writes carries `demoSeed: true`; --reset deletes only those.
 * Demo people sign in with DEMO_PASSWORD (default Demo@1234).
 */
require('dotenv').config()
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const mongoose = require('mongoose')
const User = require('../models/User')
const Staff = require('../models/Staff')
const Candidate = require('../models/Candidate')
const PulseInvite = require('../models/PulseInvite')
const PulseWorkDay = require('../models/PulseWorkDay')
const LeaveRequest = require('../models/LeaveRequest')
const LeavePolicy = require('../models/LeavePolicy')
const Announcement = require('../models/Announcement')
const AssignedTask = require('../models/AssignedTask')
const Notification = require('../models/Notification')
const PulsePerformanceMonth = require('../models/PulsePerformanceMonth')
const PulsePayrollPayslip = require('../models/PulsePayrollPayslip')
const PulseCompanyFile = require('../models/PulseCompanyFile')
const { computeMonthlyCompensation } = require('../utils/pulsePerformanceCalc')
const { allowedEmailDomain } = require('../utils/companyDomain')

const TAGGED_MODELS = [
  PulseWorkDay, LeaveRequest, AssignedTask, Notification, PulsePerformanceMonth,
  PulsePayrollPayslip, PulseCompanyFile, Announcement, PulseInvite, Candidate, Staff, User,
]
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo@1234'
const DOMAIN = allowedEmailDomain()
const LOCATIONS = [
  { city: 'Ghaziabad', state: 'Uttar Pradesh', country: 'India', lat: 28.6692, lng: 77.4538 },
  { city: 'Noida', state: 'Uttar Pradesh', country: 'India', lat: 28.5355, lng: 77.391 },
  { city: 'New Delhi', state: 'Delhi', country: 'India', lat: 28.6139, lng: 77.209 },
]
const PROJECTS = ['BDA OS', 'Pulse', 'Client Portal', 'Payroll Engine', 'Marketing Site']
const TASKS = [
  'Sprint planning and standup', 'Code review for open PRs', 'Fix check-in timer edge cases',
  'Client call and follow-up notes', 'Design review with product', 'Write API integration tests',
  'Update onboarding documentation', 'Payroll data reconciliation', 'Bug triage from QA',
  'Prepare weekly status report', 'Refactor leave tracker filters', 'Customer demo preparation',
]
const HOLIDAYS_2026 = [
  ['2026-01-26', 'Republic Day'], ['2026-03-04', 'Holi'], ['2026-03-21', 'Eid ul-Fitr'],
  ['2026-08-15', 'Independence Day'], ['2026-10-02', 'Gandhi Jayanti'], ['2026-10-20', 'Dussehra'],
  ['2026-11-08', 'Diwali'], ['2026-11-24', 'Guru Nanak Jayanti'], ['2026-12-25', 'Christmas'],
]

// People: complete = fully filled profile; others are deliberately missing fields.
const PEOPLE = [
  { first: 'Aarav', last: 'Sharma', role: 'admin', dept: 'Engineering', title: 'Engineering Manager', salary: 145000, dob: '1990-04-18', joined: '2021-06-14', gender: 'Male', complete: true },
  { first: 'Priya', last: 'Verma', role: 'admin', dept: 'People Ops', title: 'HR Manager', salary: 110000, dob: '1992-11-03', joined: '2022-01-10', gender: 'Female', complete: true },
  { first: 'Rohan', last: 'Gupta', role: 'member', dept: 'Engineering', title: 'Frontend Engineer', salary: 85000, dob: '1997-09-29', joined: '2023-03-06', gender: 'Male', complete: false },
  { first: 'Ananya', last: 'Iyer', role: 'member', dept: 'Design', title: 'Product Designer', salary: 90000, dob: '1996-02-14', joined: '2022-08-22', gender: 'Female', complete: true },
  { first: 'Karan', last: 'Mehta', role: 'member', dept: 'Sales', title: 'Account Executive', salary: 70000, dob: '1994-07-09', joined: '2023-09-30', gender: 'Male', complete: true },
  { first: 'Neha', last: 'Singh', role: 'member', dept: 'Marketing', title: 'Content Strategist', salary: 65000, dob: '1995-09-12', joined: '2024-02-19', gender: 'Female', complete: false },
  { first: 'Vikram', last: 'Rao', role: 'member', dept: 'Engineering', title: 'Backend Engineer', salary: 95000, dob: '1993-12-01', joined: '2021-11-01', gender: 'Male', complete: true },
  { first: 'Sneha', last: 'Kapoor', role: 'member', dept: 'Finance', title: 'Accountant', salary: 60000, dob: '1998-05-25', joined: '2024-09-15', gender: 'Female', complete: true },
  { first: 'Arjun', last: 'Nair', role: 'member', dept: 'Operations', title: 'Operations Intern', salary: 20000, dob: '', joinedDaysAgo: 10, gender: 'Male', complete: false, intern: true },
  { first: 'Isha', last: 'Joshi', role: 'member', dept: 'Engineering', title: 'QA Engineer', salary: 75000, dob: '1999-01-20', joinedDaysAgo: 5, gender: 'Female', complete: false },
]
const PIPELINE = [
  { first: 'Rahul', last: 'Bose', status: 'Not started', title: 'Sales Associate', dept: 'Sales' },
  { first: 'Divya', last: 'Menon', status: 'In progress', title: 'UI Designer', dept: 'Design' },
  { first: 'Farhan', last: 'Qureshi', status: 'Details received', title: 'DevOps Engineer', dept: 'Engineering' },
  { first: 'Meera', last: 'Pillai', status: 'Offer sent', title: 'Recruiter', dept: 'People Ops' },
  { first: 'Siddharth', last: 'Jain', status: 'Withdrawn', title: 'Data Analyst', dept: 'Finance' },
]

let seed = 20260927
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = (list) => list[Math.floor(rand() * list.length)]
const between = (min, max) => min + Math.floor(rand() * (max - min + 1))

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysFromToday(n) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d
}
function at(key, hours, minutes) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, hours, minutes)
}
function monthOffset(n) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function insertTagged(Model, rows) {
  const list = Array.isArray(rows) ? rows : [rows]
  const now = new Date()
  const docs = []
  for (const row of list) {
    const doc = new Model(row)
    await doc.validate()
    docs.push({ createdAt: now, updatedAt: now, ...doc.toObject(), demoSeed: true })
  }
  if (docs.length) await Model.collection.insertMany(docs)
  return docs
}

async function reset() {
  for (const Model of TAGGED_MODELS) {
    const { deletedCount } = await Model.collection.deleteMany({ demoSeed: true })
    if (deletedCount) console.log(`  removed ${deletedCount} ${Model.collection.name}`)
  }
  const { modifiedCount } = await LeavePolicy.collection.updateMany(
    { 'holidays.demoSeed': true },
    { $pull: { holidays: { demoSeed: true } } },
  )
  if (modifiedCount) console.log('  removed demo holidays from leave policy')
}

async function findOrg(orgArg) {
  if (orgArg) return User.findById(orgArg).lean()
  const owners = await User.find({ $expr: { $eq: ['$_id', '$organizationId'] } }).lean()
  if (owners.length !== 1) {
    throw new Error(`Found ${owners.length} orgs; pass one: ${owners.map((o) => `${o._id} (${o.email})`).join(', ')}`)
  }
  return owners[0]
}

function workDayDoc(person, key, { today, submitted }) {
  const loc = pick(LOCATIONS)
  const inAt = at(key, 9, between(0, 70))
  const activeMin = between(450, 590)
  const lunch = between(30, 50)
  const firstMin = between(180, 240)
  const out1 = new Date(inAt.getTime() + firstMin * 60000)
  const in2 = new Date(out1.getTime() + lunch * 60000)
  const out2 = new Date(in2.getTime() + (activeMin - firstMin) * 60000)
  const activeMs = activeMin * 60000
  const base = { user: person.user._id, email: person.email, date: key, targetHours: 9 }

  if (today) {
    const openMs = Math.max(0, Date.now() - inAt.getTime())
    return {
      ...base,
      status: 'active',
      totalActiveMs: Math.min(openMs, 10 * 3600000),
      lastHeartbeatAt: new Date(),
      sessions: [{ checkInAt: inAt, locationIn: loc }],
      events: [{ type: 'CHECK_IN', at: inAt, activeMsAtEvent: 0, location: loc }],
    }
  }

  const entries = []
  let left = activeMin
  const count = between(2, 4)
  for (let i = 0; i < count; i += 1) {
    const minutes = i === count - 1 ? left : Math.max(30, Math.round(left / (count - i)) + between(-20, 20))
    if (minutes < 1) break
    entries.push({ description: pick(TASKS), project: pick(PROJECTS), minutes })
    left -= minutes
  }
  const closeAt = at(key, 23, 59)
  const hours = Math.round((activeMs / 3600000) * 100) / 100
  const events = [
    { type: 'CHECK_IN', at: inAt, activeMsAtEvent: 0, location: loc },
    { type: 'CHECK_OUT', at: out1, activeMsAtEvent: firstMin * 60000, location: loc },
    { type: 'RESUME', at: in2, activeMsAtEvent: firstMin * 60000, location: loc },
    { type: 'CHECK_OUT', at: out2, activeMsAtEvent: activeMs, location: loc },
  ]
  if (activeMs >= 9 * 3600000) events.push({ type: 'TARGET_REACHED', at: out2, activeMsAtEvent: activeMs, location: loc })
  events.push({ type: 'MIDNIGHT_CLOSE', at: closeAt, activeMsAtEvent: activeMs })
  return {
    ...base,
    status: 'closed',
    totalActiveMs: activeMs,
    targetReachedAt: activeMs >= 9 * 3600000 ? out2 : undefined,
    lastHeartbeatAt: out2,
    timesheetLogged: true,
    timesheetLoggedAt: closeAt,
    timesheetHours: hours,
    timesheetSubmitted: submitted,
    timesheetSubmittedAt: submitted ? out2 : undefined,
    taskEntries: submitted ? entries : [],
    sessions: [
      { checkInAt: inAt, checkOutAt: out1, durationMs: firstMin * 60000, locationIn: loc, locationOut: loc },
      { checkInAt: in2, checkOutAt: out2, durationMs: activeMs - firstMin * 60000, locationIn: loc, locationOut: loc },
    ],
    events,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const adminFlag = args.indexOf('--admin')
  const adminEmail = adminFlag >= 0 ? String(args[adminFlag + 1] || '').toLowerCase() : 'sahil@bda.co.in'
  const orgArg = args.find((a, i) => !a.startsWith('--') && (adminFlag < 0 || i !== adminFlag + 1))

  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required')
  await mongoose.connect(process.env.MONGODB_URI)
  const dbName = mongoose.connection.name
  console.log('Database:', dbName)
  if (/prod/i.test(dbName)) throw new Error('Refusing to write demo data to a production database')

  if (args.includes('--reset')) {
    await reset()
    console.log('Demo data removed.')
    return
  }
  if (await User.collection.countDocuments({ demoSeed: true })) {
    throw new Error('Demo data already exists. Run with --reset first.')
  }

  const org = await findOrg(orgArg)
  if (!org) throw new Error('Organization not found')
  const orgId = org._id
  console.log(`Org: ${org.companyName || '(unnamed)'} · owner ${org.email}`)

  // Users
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const people = []
  const userRows = PEOPLE.map((p, i) => {
    const email = `demo-${p.first}.${p.last}@${DOMAIN}`.toLowerCase()
    const joined = p.joined ? new Date(p.joined) : daysFromToday(-p.joinedDaysAgo)
    people.push({ ...p, email, joinedAt: joined, index: i })
    return {
      email,
      password: 'placeholder',
      firstName: p.first,
      lastName: p.last,
      displayName: `${p.first} ${p.last}`,
      role: p.role,
      organizationId: orgId,
      companyName: org.companyName || '',
      companyAddress: org.companyAddress || '',
      companyEmail: org.companyEmail || '',
      companyDomain: DOMAIN,
      companyLogo: org.companyLogo || '',
      mobilePhone: p.complete ? `+9198${String(10000000 + i * 7919).slice(0, 8)}` : '',
      gender: p.gender,
      country: 'India',
      state: 'Uttar Pradesh',
      isVerified: true,
      onboardingCompleted: true,
      pulseSetupCompleted: true,
      createdAt: joined,
    }
  })
  const userDocs = await insertTagged(User, userRows)
  await User.collection.updateMany({ demoSeed: true }, { $set: { password: passwordHash } })
  people.forEach((p, i) => { p.user = userDocs[i] })

  const admin = await User.findOne({ email: adminEmail }).lean()
  if (admin) {
    people.push({
      first: admin.firstName || 'Sahil', last: admin.lastName || '', email: admin.email, user: admin,
      role: admin.role, dept: 'Engineering', title: 'Engineering Lead', salary: 120000,
      dob: '1995-09-30', joined: '2022-04-01', joinedAt: new Date('2022-04-01'), gender: 'Male',
      complete: true, existing: true, index: people.length,
    })
  }
  console.log(`  users: ${userDocs.length} demo${admin ? ` + your data for ${admin.email}` : ''}`)

  // Staff + joined candidates
  const staffRows = []
  const candidateRows = []
  for (const p of people) {
    if (p.existing && (await Staff.exists({ user: orgId, email: p.email }))) continue
    const i = p.index
    const pan = `ABCDE${String(1000 + i * 37).slice(0, 4)}F`
    staffRows.push({
      user: orgId,
      fullName: `${p.first} ${p.last}`.trim(),
      employeeId: `BDA-D${String(101 + i)}`,
      email: p.email,
      phone: p.complete ? `98${String(10000000 + i * 7919).slice(0, 8)}` : '',
      panNumber: p.complete ? pan : undefined,
      dob: p.dob ? new Date(p.dob) : undefined,
      gender: p.gender,
      address: p.complete
        ? { street: `${between(10, 400)}, Sector ${between(1, 60)}`, city: 'Ghaziabad', state: 'Uttar Pradesh', pincode: '201009', country: 'India' }
        : undefined,
      emergencyContact: p.complete ? { name: `${pick(['Sunita', 'Rajesh', 'Anil', 'Kavita'])} ${p.last}`, relationship: pick(['Mother', 'Father', 'Spouse']), phone: '9811122233' } : undefined,
      designation: p.title,
      department: p.dept,
      joiningDate: p.joinedAt,
      type: p.intern ? 'Intern' : 'Employee',
      bankDetails: p.complete
        ? { accountHolderName: `${p.first} ${p.last}`, bankName: pick(['HDFC Bank', 'ICICI Bank', 'State Bank of India']), accountNumber: `5010${between(10000000, 99999999)}`, ifscCode: 'HDFC0001234', branch: 'Indirapuram' }
        : undefined,
      salaryDetails: { annualCTC: p.salary * 12, baseSalary: p.salary },
      profileCompleted: p.complete,
      isPortalEnabled: true,
      mustChangePassword: false,
    })
    candidateRows.push({
      organizationId: orgId,
      candidateId: `CAND-D${String(101 + i)}`,
      status: 'Joined',
      firstName: p.first,
      lastName: p.last,
      email: `${p.first}.${p.last}.personal@example.com`.toLowerCase(),
      officialEmail: p.email,
      phone: p.complete ? `98${String(10000000 + i * 7919).slice(0, 8)}` : '',
      dob: p.dob ? new Date(p.dob) : undefined,
      gender: p.gender,
      pan: p.complete ? pan : '',
      aadhaar: p.complete ? `XXXX-XXXX-${String(1000 + i * 13)}` : '',
      presentAddress: p.complete ? { line1: `${between(10, 400)}, Sector ${between(1, 60)}`, city: 'Ghaziabad', state: 'Uttar Pradesh', postalCode: '201009' } : undefined,
      sameAsPresent: p.complete,
      emergencyContact: p.complete ? { name: 'Family contact', relationship: 'Parent', phone: '9811122233' } : undefined,
      title: p.title,
      department: p.dept,
      workLocation: 'Ghaziabad Office',
      experienceYears: p.intern ? '0' : String(between(2, 9)),
      highestQualification: p.complete ? pick(['B.Tech', 'MBA', 'B.Com', 'B.Des']) : '',
      skillSet: p.complete ? pick(['React, Node.js', 'Figma, UX research', 'Sales, CRM', 'Tally, GST']) : '',
      sourceOfHire: pick(['Referral', 'LinkedIn', 'Naukri', 'Campus']),
      tentativeJoiningDate: p.joinedAt,
      education: p.complete ? [{ schoolName: pick(['Delhi University', 'IIT Roorkee', 'Amity University']), degree: 'Bachelor', fieldOfStudy: p.dept, dateOfCompletion: '2016' }] : [],
      experience: p.complete ? [{ occupation: p.title, company: pick(['Infosys', 'Zomato', 'Paytm', 'TCS']), duration: '2 years', summary: 'Previous role' }] : [],
      addedBy: orgId,
      addedByName: org.firstName || 'Admin',
      employeeSubmittedAt: p.complete ? p.joinedAt : undefined,
    })
  }
  PIPELINE.forEach((c, i) => {
    candidateRows.push({
      organizationId: orgId,
      candidateId: `CAND-P${String(201 + i)}`,
      status: c.status,
      firstName: c.first,
      lastName: c.last,
      email: `${c.first}.${c.last}@example.com`.toLowerCase(),
      officialEmail: c.status === 'Not started' ? '' : `demo-${c.first}.${c.last}@${DOMAIN}`.toLowerCase(),
      phone: c.status === 'Not started' ? '' : `97${between(10000000, 99999999)}`,
      title: c.title,
      department: c.dept,
      workLocation: 'Ghaziabad Office',
      currentSalary: String(between(4, 12) * 100000),
      sourceOfHire: pick(['Referral', 'LinkedIn', 'Naukri']),
      tentativeJoiningDate: daysFromToday(between(7, 30)),
      addedBy: orgId,
      addedByName: org.firstName || 'Admin',
    })
  })
  const staffDocs = await insertTagged(Staff, staffRows)
  await insertTagged(Candidate, candidateRows)
  const staffByEmail = new Map((await Staff.find({ user: orgId }).lean()).map((s) => [s.email, s]))
  console.log(`  staff: ${staffDocs.length} · candidates: ${candidateRows.length}`)

  // Pending invites for two pipeline hires
  await insertTagged(PulseInvite, PIPELINE.slice(2, 4).map((c) => ({
    email: `demo-${c.first}.${c.last}@${DOMAIN}`.toLowerCase(),
    role: 'member',
    organizationId: orgId,
    invitedBy: orgId,
    companyName: org.companyName || '',
    token: crypto.randomBytes(32).toString('hex'),
    expiresAt: daysFromToday(7),
    firstName: c.first,
    lastName: c.last,
  })))

  // Holidays (added to the org policy, tagged so --reset can pull them)
  const policy = await LeavePolicy.findOne({ user: orgId }).lean()
  const taken = new Set((policy?.holidays || []).map((h) => String(h?.date || h).slice(0, 10)))
  const holidays = HOLIDAYS_2026.filter(([date]) => !taken.has(date)).map(([date, name]) => ({ date, name, demoSeed: true }))
  if (policy) {
    await LeavePolicy.collection.updateOne({ _id: policy._id }, { $push: { holidays: { $each: holidays } } })
  } else {
    await LeavePolicy.create({ user: orgId, casualLeave: { daysPerMonth: 1, daysPerYear: 18, isPaid: true }, holidays })
  }
  const holidaySet = new Set(HOLIDAYS_2026.map(([d]) => d))

  // Leave requests
  const leaveRows = []
  const leaveDaysByEmail = new Map()
  people.forEach((p, i) => {
    const staff = staffByEmail.get(p.email)
    if (!staff) return
    const plan = [
      { type: 'Casual', start: -between(20, 35), len: between(1, 2), status: 'Approved', reason: 'Family function' },
      { type: 'Sick', start: -between(40, 55), len: 1, status: 'Approved', reason: 'Fever and doctor visit' },
      i % 3 === 0 && { type: 'Casual', start: between(3, 12), len: between(1, 3), status: 'Pending', reason: 'Trip to hometown' },
      i % 4 === 1 && { type: 'Casual', start: -between(8, 14), len: 1, status: 'Rejected', reason: 'Personal errand', adminNotes: 'Release week, please reschedule' },
      i % 5 === 2 && { type: 'Custom', start: between(15, 25), len: 2, status: 'Pending', reason: 'Exam leave' },
    ].filter(Boolean)
    const blocked = new Set()
    plan.forEach((l) => {
      const start = daysFromToday(l.start)
      const end = daysFromToday(l.start + l.len - 1)
      leaveRows.push({ staff: staff._id, admin: orgId, type: l.type, startDate: start, endDate: end, status: l.status, reason: l.reason, adminNotes: l.adminNotes })
      if (l.status !== 'Rejected') for (let d = 0; d < l.len; d += 1) blocked.add(dayKey(daysFromToday(l.start + d)))
    })
    leaveDaysByEmail.set(p.email, blocked)
  })
  const leaveDocs = await insertTagged(LeaveRequest, leaveRows)
  console.log(`  leave requests: ${leaveDocs.length} · holidays added: ${holidays.length}`)

  // Check-ins + timesheets for the last 60 days (Mon–Sat)
  const workRows = []
  const todayKey = dayKey(new Date())
  for (const p of people) {
    const existingDays = new Set((await PulseWorkDay.find({ user: p.user._id }).select('date').lean()).map((d) => d.date))
    const blocked = leaveDaysByEmail.get(p.email) || new Set()
    const firstDay = dayKey(p.joinedAt)
    for (let n = -60; n <= 0; n += 1) {
      const d = daysFromToday(n)
      const key = dayKey(d)
      if (d.getDay() === 0 || holidaySet.has(key) || blocked.has(key) || existingDays.has(key) || key < firstDay) continue
      const isToday = key === todayKey
      if (isToday && rand() < 0.3) continue
      if (!isToday && rand() < 0.06) continue
      const unsubmittedRecent = n >= -2 && p.index % 3 === 1
      workRows.push(workDayDoc(p, key, { today: isToday, submitted: !unsubmittedRecent && rand() > 0.08 }))
    }
  }
  await insertTagged(PulseWorkDay, workRows)
  console.log(`  work days (check-ins + timesheets): ${workRows.length}`)

  // Assigned tasks
  const taskRows = []
  people.forEach((p) => {
    const staff = staffByEmail.get(p.email)
    if (!staff) return
    ;[['Pending', 5], ['In Progress', 2], ['Completed', -6]].forEach(([status, due]) => {
      taskRows.push({
        staff: staff._id,
        title: pick(TASKS),
        description: `Assigned for the ${p.dept} team this sprint.`,
        priority: pick(['Low', 'Medium', 'High', 'Urgent']),
        status,
        dueDate: daysFromToday(due + between(0, 4)),
        assignedDate: daysFromToday(-between(3, 12)),
        startedAt: status !== 'Pending' ? daysFromToday(-2) : undefined,
        completedAt: status === 'Completed' ? daysFromToday(-1) : undefined,
      })
    })
  })
  await insertTagged(AssignedTask, taskRows)

  // Announcements
  await insertTagged(Announcement, [
    { user: orgId, title: 'Monthly town hall', message: 'Join the all-hands on Friday at 5 PM. We will cover Q3 results and the Pulse roadmap.', priority: 'Important', startDate: daysFromToday(-2), endDate: daysFromToday(10), meetingLink: 'https://meet.google.com/demo-town-hall' },
    { user: orgId, title: 'Diwali celebration', message: 'Office Diwali party with lunch and games. Traditional wear encouraged!', priority: 'Normal', startDate: daysFromToday(-1), endDate: daysFromToday(45) },
    { user: orgId, title: 'Updated leave policy', message: 'Casual leave is now 18 days a year. Please plan leaves at least a week in advance.', priority: 'Urgent', startDate: daysFromToday(-5), endDate: daysFromToday(20) },
    { user: orgId, title: 'Laptop refresh drive', message: 'IT will replace laptops older than 3 years. Book your slot with Operations.', priority: 'Normal', startDate: daysFromToday(-3), endDate: daysFromToday(14) },
  ])

  // Performance reviews (last 2 months locked, current month in progress) + payslips
  const perfRows = []
  const slipRows = []
  const months = [monthOffset(-2), monthOffset(-1), monthOffset(0)]
  people.forEach((p) => {
    months.forEach((month, mi) => {
      const scores = Object.fromEntries(['outcomes', 'quality', 'deadline', 'ownership', 'bms'].map((k) => [k, pick([50, 75, 75, 100])]))
      const locked = mi < 2
      const perf = {
        _id: new mongoose.Types.ObjectId(),
        organizationId: orgId,
        user: p.user._id,
        email: p.email,
        month,
        scores,
        fixedPay: p.salary,
        projectTier: pick(['Core', 'Core', 'Enhanced', 'Significant', 'Strategic']),
        projectApproved: rand() > 0.4,
        learningApproved: rand() > 0.5,
        innovationApproved: rand() > 0.7,
        managerNote: locked ? pick(['Great ownership this month.', 'Solid delivery, improve estimates.', 'Consistent quality work.']) : '',
        status: locked ? 'locked' : p.index % 2 ? 'review' : 'draft',
        lockedAt: locked ? daysFromToday(-30 * (2 - mi)) : undefined,
        reviewedBy: locked ? orgId : undefined,
        correctionRequested: !locked && p.index === 3,
        correctionNote: !locked && p.index === 3 ? 'Deadline score should reflect the approved scope change.' : '',
      }
      perfRows.push(perf)
      if (!locked) return
      const calc = computeMonthlyCompensation(perf)
      const grossPay = p.salary + calc.totalBonus
      slipRows.push({
        organizationId: orgId,
        user: p.user._id,
        email: p.email,
        month,
        performanceId: perf._id,
        employeeName: `${p.first} ${p.last}`.trim(),
        fixedPay: p.salary,
        performanceBonus: calc.performanceBonus,
        projectBonus: calc.projectBonus,
        learningBonus: calc.learningBonus,
        innovationBonus: calc.innovationBonus,
        totalBonus: calc.totalBonus,
        weightedScore: calc.weightedScore,
        performanceStatus: calc.performanceStatus,
        grossPay,
        netPay: grossPay,
        status: mi === 0 ? 'paid' : 'generated',
        generatedAt: daysFromToday(-30 * (2 - mi)),
        generatedBy: orgId,
        paidAt: mi === 0 ? daysFromToday(-28) : undefined,
      })
    })
  })
  const existingPerf = new Set((await PulsePerformanceMonth.find({ user: { $in: people.map((p) => p.user._id) } }).select('user month').lean()).map((r) => `${r.user}:${r.month}`))
  const existingSlips = new Set((await PulsePayrollPayslip.find({ user: { $in: people.map((p) => p.user._id) } }).select('user month').lean()).map((r) => `${r.user}:${r.month}`))
  await insertTagged(PulsePerformanceMonth, perfRows.filter((r) => !existingPerf.has(`${r.user}:${r.month}`)))
  await insertTagged(PulsePayrollPayslip, slipRows.filter((r) => !existingSlips.has(`${r.user}:${r.month}`)))
  console.log(`  performance reviews: ${perfRows.length} · payslips: ${slipRows.length}`)

  // Company files
  const pdf = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
  await insertTagged(PulseCompanyFile, ['Employee Handbook 2026', 'Leave and Holiday Policy', 'Code of Conduct', 'Reimbursement Guidelines'].map((title) => ({
    organizationId: orgId,
    title,
    fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.pdf`,
    originalName: `${title}.pdf`,
    mimeType: 'application/pdf',
    size: 13264,
    url: pdf,
    uploadedBy: orgId,
    uploadedByName: org.firstName || 'Admin',
  })))

  // Admin bell notifications for every admin in the org
  const admins = await User.find({ $or: [{ organizationId: orgId }, { _id: orgId }], role: { $ne: 'member' } }).select('_id').lean()
  const pendingLeave = leaveDocs.find((l) => l.status === 'Pending')
  const notes = [
    { type: 'LEAVE_REQUEST', message: 'New leave request waiting for your approval.', referenceId: pendingLeave?._id },
    { type: 'STAFF_CREATED', message: 'Isha Joshi joined the Engineering team.' },
    { type: 'PROFILE_UPDATE', message: 'Rohan Gupta has not completed their profile yet.' },
    { type: 'ATTENDANCE_ALERT', message: 'Two people have not submitted yesterday’s timesheet.' },
  ]
  await insertTagged(Notification, admins.flatMap((a) => notes.map((n) => ({ admin: a._id, recipientType: 'admin', ...n }))))

  console.log(`\nDone. Demo people sign in with password: ${DEMO_PASSWORD}`)
  console.log(`  e.g. ${people[0].email} (admin), ${people[2].email} (member)`)
}

main()
  .catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
