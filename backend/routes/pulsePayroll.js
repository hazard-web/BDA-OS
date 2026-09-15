const express = require('express')
const mongoose = require('mongoose')
const { auth } = require('./auth')
const User = require('../models/User')
const PulsePerformanceMonth = require('../models/PulsePerformanceMonth')
const PulsePayrollPayslip = require('../models/PulsePayrollPayslip')
const { isPulseAdmin, orgIdOf } = require('../utils/pulseAuth')
const { computeMonthlyCompensation, monthKey } = require('../utils/pulsePerformanceCalc')

const router = express.Router()

function personName(user) {
  const parts = [user?.firstName, user?.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  return user?.displayName || String(user?.email || '').split('@')[0] || 'Employee'
}

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
    status: plain.status || 'generated',
    generatedAt: plain.generatedAt || null,
    paidAt: plain.paidAt || null,
  }
}

function buildPayslipPayload({ organizationId, member, performance, actorId }) {
  const calc = computeMonthlyCompensation({
    fixedPay: performance.fixedPay,
    scores: performance.scores,
    projectTier: performance.projectTier,
    projectApproved: performance.projectApproved,
    learningApproved: performance.learningApproved,
    innovationApproved: performance.innovationApproved,
  })
  const fixedPay = Math.max(0, Number(performance.fixedPay) || 0)
  const grossPay = fixedPay + calc.totalBonus
  return {
    organizationId,
    user: member._id,
    email: String(member.email || '').toLowerCase(),
    month: performance.month,
    performanceId: performance._id,
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
    netPay: grossPay,
    status: 'generated',
    generatedAt: new Date(),
    generatedBy: actorId,
  }
}

async function upsertPayslipFromPerformance({ organizationId, member, performance, actorId }) {
  const payload = buildPayslipPayload({ organizationId, member, performance, actorId })
  const doc = await PulsePayrollPayslip.findOneAndUpdate(
    { user: member._id, month: performance.month },
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

// Admin: month board — locked performance + payslip status
router.get('/admin/month', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const month = assertMonth(req.query.month)
    const organizationId = orgIdOf(req.user)
    const orgObjectId = toOrgObjectId(organizationId)

    const [lockedPerf, payslips, members] = await Promise.all([
      PulsePerformanceMonth.find({ organizationId: orgObjectId, month, status: 'locked' })
        .select('user email fixedPay scores projectTier projectApproved learningApproved innovationApproved status lockedAt')
        .lean(),
      PulsePayrollPayslip.find({ organizationId: orgObjectId, month }).lean(),
      User.find({
        $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
      })
        .select('_id firstName lastName displayName email avatarUrl')
        .lean(),
    ])

    const memberById = new Map(members.map((m) => [String(m._id), m]))
    const payByUser = new Map(payslips.map((p) => [String(p.user), p]))

    const rows = lockedPerf.map((perf) => {
      const member = memberById.get(String(perf.user))
      const calc = computeMonthlyCompensation({
        fixedPay: perf.fixedPay,
        scores: perf.scores,
        projectTier: perf.projectTier,
        projectApproved: perf.projectApproved,
        learningApproved: perf.learningApproved,
        innovationApproved: perf.innovationApproved,
      })
      const slip = payByUser.get(String(perf.user))
      return {
        user: String(perf.user),
        email: perf.email,
        name: member ? personName(member) : perf.email,
        avatarUrl: member?.avatarUrl || '',
        month,
        lockedAt: perf.lockedAt || null,
        fixedPay: perf.fixedPay || 0,
        ...calc,
        payslip: slip ? serializePayslip(slip, member) : null,
        hasPayslip: Boolean(slip),
      }
    })

    rows.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    res.json({
      success: true,
      data: rows,
      meta: {
        month,
        locked: rows.length,
        generated: rows.filter((r) => r.hasPayslip).length,
      },
    })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to load payroll' })
  }
})

// Admin: generate payslips for locked performance (all or one user)
router.post('/admin/generate', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const month = assertMonth(req.body.month)
    const organizationId = orgIdOf(req.user)
    const orgObjectId = toOrgObjectId(organizationId)
    const onlyUserId = req.body.userId ? String(req.body.userId) : null

    const query = { organizationId: orgObjectId, month, status: 'locked' }
    if (onlyUserId) query.user = onlyUserId

    const locked = await PulsePerformanceMonth.find(query)
    if (!locked.length) {
      return res.status(400).json({
        success: false,
        message: onlyUserId
          ? 'Lock performance before generating this payslip'
          : 'No locked performance rows for this month',
      })
    }

    const memberIds = locked.map((row) => row.user)
    const members = await User.find({ _id: { $in: memberIds } })
      .select('_id firstName lastName displayName email avatarUrl')
      .lean()
    const memberById = new Map(members.map((m) => [String(m._id), m]))

    const created = []
    for (const performance of locked) {
      const member = memberById.get(String(performance.user))
      if (!member) continue
      const doc = await upsertPayslipFromPerformance({
        organizationId: orgObjectId,
        member,
        performance,
        actorId: req.user._id,
      })
      created.push(serializePayslip(doc, member))
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
