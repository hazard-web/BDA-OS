const express = require('express')
const mongoose = require('mongoose')
const { auth } = require('./auth')
const User = require('../models/User')
const Staff = require('../models/Staff')
const PulsePerformanceMonth = require('../models/PulsePerformanceMonth')
const PulsePayrollPayslip = require('../models/PulsePayrollPayslip')
const PulseWorkDay = require('../models/PulseWorkDay')
const LeaveRequest = require('../models/LeaveRequest')
const { isPulseAdmin, orgIdOf } = require('../utils/pulseAuth')
const { personName } = require('../utils/pulsePerson')
const { computeMonthlyCompensation, monthKey } = require('../utils/pulsePerformanceCalc')
const { generatePulsePayslipPDF } = require('../utils/pulsePayslipPdf')

const router = express.Router()

function toOrgObjectId(organizationId) {
  return mongoose.Types.ObjectId.isValid(organizationId)
    ? new mongoose.Types.ObjectId(organizationId)
    : organizationId
}

function assertMonth(value) {
  const month = String(value || monthKey())
  if (!/^\d{4}-\d{2}$/.test(month)) {
    const err = new Error('Invalid month. Use yyyy-MM.')
    err.status = 400
    throw err
  }
  return month
}

function monthBounds(month) {
  const [y, m] = String(month).split('-').map(Number)
  const from = `${month}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${month}-${String(last).padStart(2, '0')}`
  const fromDate = new Date(y, m - 1, 1)
  const toDate = new Date(y, m - 1, last, 23, 59, 59, 999)
  return { from, to, fromDate, toDate, payableDays: last }
}

function countLeaveDaysInMonth(leaves, from, to) {
  let total = 0
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T23:59:59`)
  leaves.forEach((row) => {
    const a = new Date(row.startDate)
    const b = new Date(row.endDate || row.startDate)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return
    const fromMs = Math.max(a.getTime(), start.getTime())
    const toMs = Math.min(b.getTime(), end.getTime())
    if (toMs < fromMs) return
    total += Math.floor((toMs - fromMs) / 86400000) + 1
  })
  return total
}

function serializePayslip(doc, user) {
  const plain = doc?.toObject ? doc.toObject() : doc || {}
  return {
    id: plain._id ? String(plain._id) : null,
    user: String(plain.user),
    email: plain.email,
    name: user ? personName(user) : plain.employeeName || plain.email,
    avatarUrl: user?.avatarUrl || '',
    month: plain.month,
    performanceId: plain.performanceId ? String(plain.performanceId) : null,
    fixedPay: plain.fixedPay || 0,
    performanceBonus: plain.performanceBonus || 0,
    projectBonus: plain.projectBonus || 0,
    learningBonus: plain.learningBonus || 0,
    innovationBonus: plain.innovationBonus || 0,
    totalBonus: plain.totalBonus || 0,
    weightedScore: plain.weightedScore || 0,
    performanceStatus: plain.performanceStatus || '',
    grossPay: plain.grossPay || 0,
    netPay: plain.netPay || 0,
    netPayManual: Boolean(plain.netPayManual),
    status: plain.status || 'generated',
    generatedAt: plain.generatedAt || null,
    paidAt: plain.paidAt || null,
  }
}

async function enrichPayslipForPdf(doc, employeeUser) {
  const plain = doc?.toObject ? doc.toObject() : doc
  const orgId = plain.organizationId || orgIdOf(employeeUser) || employeeUser?._id
  const email = String(plain.email || employeeUser?.email || '').toLowerCase().trim()
  const month = plain.month
  const { from, to, fromDate, toDate, payableDays } = monthBounds(month)

  const [org, staff, presentDays] = await Promise.all([
    User.findById(orgId)
      .select('companyName companyAddress companyPhone companyEmail companyWebsite companyCIN companyGST companyLogo')
      .lean(),
    email
      ? Staff.findOne({ email, user: orgId })
          .select(
            'employeeId designation department panNumber pfNumber joiningDate bankDetails financials fullName',
          )
          .lean()
      : null,
    plain.user
      ? PulseWorkDay.countDocuments({
          user: plain.user,
          date: { $gte: from, $lte: to },
          $or: [
            { 'sessions.0': { $exists: true } },
            { totalActiveMs: { $gt: 0 } },
            { status: { $in: ['active', 'stopped', 'closed'] } },
          ],
        })
      : Promise.resolve(0),
  ])

  let leaveDays = 0
  if (staff?._id) {
    const leaves = await LeaveRequest.find({
      staff: staff._id,
      status: 'Approved',
      startDate: { $lte: toDate },
      endDate: { $gte: fromDate },
    })
      .select('startDate endDate')
      .lean()
    leaveDays = countLeaveDaysInMonth(leaves, from, to)
  }

  const bankAccount =
    staff?.bankDetails?.accountNumber || staff?.financials?.accountNumber || ''
  const bankName = staff?.bankDetails?.bankName || staff?.financials?.bankName || ''
  const panNumber = staff?.panNumber || staff?.financials?.panNumber || ''
  const pfNumber = staff?.pfNumber || ''

  return {
    ...plain,
    employeeName: plain.employeeName || staff?.fullName || personName(employeeUser),
    email: email || '',
    employeeId: staff?.employeeId || employeeUser?.employeeId || '',
    designation: staff?.designation || employeeUser?.designation || employeeUser?.jobTitle || '',
    department: staff?.department || '',
    dateOfJoining: staff?.joiningDate || null,
    panNumber,
    pfNumber,
    uan: pfNumber || 'N.A.',
    bankAccount,
    bankName,
    payableDays,
    presentDays: presentDays || 0,
    leaveDays,
    lopDays: Math.max(0, payableDays - (presentDays || 0) - leaveDays),
    pf: Number(plain.pf) || 0,
    esi: Number(plain.esi) || 0,
    tds: Number(plain.tds) || 0,
    otherDeductions: Number(plain.otherDeductions) || 0,
    employerPF: Number(plain.employerPF) || 0,
    hra: Number(plain.hra) || 0,
    companyName: 'BDA Technologies Private Limited',
    companyAddress: org?.companyAddress
      || 'Flat No. 207, Plot No. 31A, Unione Residency, Akbarpur, Behrampur, Ghaziabad, Uttar Pradesh, India, 201009',
    companyPhone: org?.companyPhone || '',
    companyEmail: 'hr@bdatechnologies.com',
    companyWebsite: 'www.bdatechnologies.com',
    companyCIN: org?.companyCIN || 'U74999UP2017PTC096671',
    companyGST: org?.companyGST || '09AAHCB4248F1ZO',
    companyLogo: org?.companyLogo || '',
  }
}

function buildPayslipPayload({ organizationId, member, performance, actorId, netPay, month }) {
  const perf = performance || {}
  const calc = computeMonthlyCompensation({
    fixedPay: perf.fixedPay,
    scores: perf.scores,
    projectTier: perf.projectTier,
    projectApproved: perf.projectApproved,
    learningApproved: perf.learningApproved,
    innovationApproved: perf.innovationApproved,
  })
  const fixedPay = Math.max(0, Number(perf.fixedPay) || 0)
  const grossPay = fixedPay + calc.totalBonus
  const standing = Math.max(0, Math.round(Number(member.pulseNetPay) || 0))
  const hasManualNet = netPay != null && Number.isFinite(Number(netPay))
  const resolvedNet = hasManualNet
    ? Math.max(0, Math.round(Number(netPay)))
    : standing > 0
      ? standing
      : grossPay
  return {
    organizationId,
    user: member._id,
    email: String(member.email || '').toLowerCase(),
    month: perf.month || month,
    performanceId: perf._id || undefined,
    employeeName: personName(member),
    fixedPay,
    performanceBonus: calc.performanceBonus,
    projectBonus: calc.projectBonus,
    learningBonus: calc.learningBonus,
    innovationBonus: calc.innovationBonus,
    totalBonus: calc.totalBonus,
    weightedScore: calc.weightedScore,
    performanceStatus: calc.performanceStatus,
    grossPay,
    netPay: resolvedNet,
    netPayManual: hasManualNet || standing > 0,
    status: 'generated',
    generatedAt: new Date(),
    generatedBy: actorId,
  }
}

async function upsertPayslipFromPerformance({ organizationId, member, performance, actorId, netPay, month }) {
  const slipMonth = performance?.month || month
  if (!slipMonth) {
    const err = new Error('Month is required')
    err.status = 400
    throw err
  }

  const existing = await PulsePayrollPayslip.findOne({
    user: member._id,
    month: slipMonth,
  }).lean()

  let resolvedNet = netPay
  if (resolvedNet == null && existing?.netPayManual && Number(existing.netPay) > 0) {
    resolvedNet = existing.netPay
  }
  if (resolvedNet == null && Number(member.pulseNetPay) > 0) {
    resolvedNet = member.pulseNetPay
  }

  const payload = buildPayslipPayload({
    organizationId,
    member,
    performance,
    actorId,
    netPay: resolvedNet,
    month: slipMonth,
  })

  if (existing?.status === 'paid') {
    payload.status = 'paid'
    payload.paidAt = existing.paidAt
  }

  const doc = await PulsePayrollPayslip.findOneAndUpdate(
    { user: member._id, month: slipMonth },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  return doc
}

// Employee: own payslip for month
router.get('/me', auth, async (req, res) => {
  try {
    const month = assertMonth(req.query.month)
    const doc = await PulsePayrollPayslip.findOne({ user: req.user._id, month }).lean()
    if (!doc) {
      return res.json({ success: true, data: null, meta: { month } })
    }
    res.json({ success: true, data: serializePayslip(doc, req.user) })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to load payslip' })
  }
})

// Employee: download PDF for a month (after payroll generate)
router.get('/me/download', auth, async (req, res) => {
  try {
    const month = assertMonth(req.query.month)
    const doc = await PulsePayrollPayslip.findOne({ user: req.user._id, month }).lean()
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Payslip not found for this month' })
    }
    const employee = await User.findById(req.user._id)
      .select('firstName lastName displayName email avatarUrl role')
      .lean()
    const enriched = await enrichPayslipForPdf(doc, employee || req.user)
    generatePulsePayslipPDF(enriched, res)
  } catch (err) {
    if (!res.headersSent) {
      res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to download payslip' })
    }
  }
})

// Employee: list recent payslips
router.get('/me/list', auth, async (req, res) => {
  try {
    const rows = await PulsePayrollPayslip.find({ user: req.user._id })
      .sort({ month: -1 })
      .limit(24)
      .lean()
    res.json({
      success: true,
      data: rows.map((row) => serializePayslip(row, req.user)),
    })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to load payslips' })
  }
})

// Admin: month board — all org members + performance lock + payslip status
router.get('/admin/month', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const month = assertMonth(req.query.month)
    const organizationId = orgIdOf(req.user)
    const orgObjectId = toOrgObjectId(organizationId)

    const [perfRows, payslips, members] = await Promise.all([
      PulsePerformanceMonth.find({ organizationId: orgObjectId, month })
        .select('user email fixedPay scores projectTier projectApproved learningApproved innovationApproved status lockedAt')
        .lean(),
      PulsePayrollPayslip.find({ organizationId: orgObjectId, month }).lean(),
      User.find({
        $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
      })
      .select('_id firstName lastName displayName email avatarUrl role pulseNetPay pulseNetPayUpdatedAt')
      .lean(),
    ])

    const perfByUser = new Map(perfRows.map((p) => [String(p.user), p]))
    const payByUser = new Map(payslips.map((p) => [String(p.user), p]))

    const rows = members
      .filter((member) => Boolean(member.email))
      .map((member) => {
        const perf = perfByUser.get(String(member._id))
        const slip = payByUser.get(String(member._id))
        const calc = computeMonthlyCompensation({
          fixedPay: perf?.fixedPay,
          scores: perf?.scores,
          projectTier: perf?.projectTier,
          projectApproved: perf?.projectApproved,
          learningApproved: perf?.learningApproved,
          innovationApproved: perf?.innovationApproved,
        })
        const locked = perf?.status === 'locked'
        const standingNetPay = Math.max(0, Math.round(Number(member.pulseNetPay) || 0))
        return {
          user: String(member._id),
          email: member.email,
          name: personName(member),
          avatarUrl: member.avatarUrl || '',
          month,
          performanceStatus: locked || Number(calc.weightedScore) > 0 ? calc.performanceStatus : '',
          weightedScore: calc.weightedScore || 0,
          totalBonus: calc.totalBonus || 0,
          fixedPay: perf?.fixedPay || 0,
          standingNetPay,
          netPay: slip?.netPay ?? standingNetPay,
          performanceLocked: locked,
          performanceState: perf?.status || 'none',
          lockedAt: perf?.lockedAt || null,
          payslip: slip ? serializePayslip(slip, member) : null,
          hasPayslip: Boolean(slip),
        }
      })

    rows.sort((a, b) => {
      const rank = (row) => (row.hasPayslip ? 0 : row.standingNetPay > 0 ? 1 : 2)
      return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name))
    })

    const lockedCount = rows.filter((r) => r.performanceLocked).length
    res.json({
      success: true,
      data: rows,
      meta: {
        month,
        locked: lockedCount,
        generated: rows.filter((r) => r.hasPayslip).length,
        members: rows.length,
      },
    })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to load payroll' })
  }
})

// Admin: download an employee payslip PDF
router.get('/admin/:userId/download', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const month = assertMonth(req.query.month)
    const organizationId = orgIdOf(req.user)
    const orgObjectId = toOrgObjectId(organizationId)
    const doc = await PulsePayrollPayslip.findOne({
      user: req.params.userId,
      month,
      organizationId: orgObjectId,
    }).lean()
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Payslip not found' })
    }
    const employee = await User.findById(doc.user)
      .select('firstName lastName displayName email avatarUrl role')
      .lean()
    const enriched = await enrichPayslipForPdf(doc, employee)
    generatePulsePayslipPDF(enriched, res)
  } catch (err) {
    if (!res.headersSent) {
      res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to download payslip' })
    }
  }
})

// Admin: generate payslips for the month (all members with standing net, or one user)
router.post('/admin/generate', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const month = assertMonth(req.body.month)
    const organizationId = orgIdOf(req.user)
    const orgObjectId = toOrgObjectId(organizationId)
    const onlyUserId = req.body.userId ? String(req.body.userId) : null
    const netPayOverride =
      req.body.netPay != null && Number.isFinite(Number(req.body.netPay))
        ? Math.max(0, Math.round(Number(req.body.netPay)))
        : null

    const memberQuery = {
      $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
    }
    if (onlyUserId) memberQuery._id = onlyUserId

    const members = await User.find(memberQuery)
      .select('_id firstName lastName displayName email avatarUrl pulseNetPay')
      .lean()
    if (!members.length) {
      return res.status(404).json({ success: false, message: 'No members found' })
    }

    const memberIds = members.map((m) => m._id)
    const perfRows = await PulsePerformanceMonth.find({
      organizationId: orgObjectId,
      month,
      user: { $in: memberIds },
    })
    const perfByUser = new Map(perfRows.map((p) => [String(p.user), p]))

    const created = []
    for (const member of members) {
      if (!member.email) continue
      const performance = perfByUser.get(String(member._id)) || null
      const standing = Math.max(0, Math.round(Number(member.pulseNetPay) || 0))
      const netForOne = onlyUserId ? (netPayOverride != null ? netPayOverride : standing || null) : null
      // Batch generate: skip people with no standing net and no performance month
      if (!onlyUserId && standing <= 0 && !performance) continue

      const doc = await upsertPayslipFromPerformance({
        organizationId: orgObjectId,
        member,
        performance,
        actorId: req.user._id,
        netPay: onlyUserId ? netForOne : (standing > 0 ? standing : null),
        month,
      })
      created.push(serializePayslip(doc, member))
    }

    if (!created.length) {
      return res.status(400).json({
        success: false,
        message: onlyUserId
          ? 'Set net pay for this employee first'
          : 'Set standing net pay for employees before generating',
      })
    }

    res.json({
      success: true,
      data: created,
      meta: { month, count: created.length },
    })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to generate payroll' })
  }
})

// Admin / superadmin: set standing net pay (persists until hike / promotion change)
router.put('/admin/:userId/net-pay', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const month = assertMonth(req.body.month || monthKey())
    const netPay = Math.max(0, Math.round(Number(req.body.netPay)))
    if (!Number.isFinite(netPay)) {
      return res.status(400).json({ success: false, message: 'Enter a valid net pay amount' })
    }

    const organizationId = orgIdOf(req.user)
    const orgObjectId = toOrgObjectId(organizationId)
    const userId = String(req.params.userId)

    const memberDoc = await User.findOne({
      _id: userId,
      $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
    }).select('_id firstName lastName displayName email avatarUrl pulseNetPay')
    if (!memberDoc) {
      return res.status(404).json({ success: false, message: 'Member not found in your organization' })
    }

    memberDoc.pulseNetPay = netPay
    memberDoc.pulseNetPayUpdatedAt = new Date()
    await memberDoc.save()

    const member = memberDoc.toObject()
    const performance = await PulsePerformanceMonth.findOne({
      organizationId: orgObjectId,
      user: userId,
      month,
    })

    const doc = await upsertPayslipFromPerformance({
      organizationId: orgObjectId,
      member,
      performance,
      actorId: req.user._id,
      netPay,
      month,
    })

    res.json({
      success: true,
      data: serializePayslip(doc, member),
      meta: {
        month,
        netPay: doc.netPay,
        standingNetPay: netPay,
      },
    })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to set net pay' })
  }
})

// Admin: mark payslip paid
router.post('/admin/:userId/paid', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const month = assertMonth(req.body.month)
    const organizationId = orgIdOf(req.user)
    const orgObjectId = toOrgObjectId(organizationId)
    const doc = await PulsePayrollPayslip.findOne({
      user: req.params.userId,
      month,
      organizationId: orgObjectId,
    })
    if (!doc) return res.status(404).json({ success: false, message: 'Payslip not found' })
    doc.status = 'paid'
    doc.paidAt = new Date()
    await doc.save()
    const member = await User.findById(doc.user).select('firstName lastName displayName email avatarUrl').lean()
    res.json({ success: true, data: serializePayslip(doc, member) })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to mark paid' })
  }
})

module.exports = {
  router,
  upsertPayslipFromPerformance,
}
