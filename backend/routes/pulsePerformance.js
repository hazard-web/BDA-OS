const express = require('express')
const mongoose = require('mongoose')
const { auth } = require('./auth')
const User = require('../models/User')
const Candidate = require('../models/Candidate')
const PulsePerformanceMonth = require('../models/PulsePerformanceMonth')
const { isPulseAdmin, orgIdOf } = require('../utils/pulseAuth')
const { upsertPayslipFromPerformance } = require('./pulsePayroll')
const {
  AREA_LABELS,
  AREA_WEIGHTS,
  PERFORMANCE_TIERS,
  PROJECT_TIERS,
  clampScore,
  computeMonthlyCompensation,
  monthKey,
} = require('../utils/pulsePerformanceCalc')

const router = express.Router()

const EMPTY_SCORES = Object.freeze({
  outcomes: 0,
  quality: 0,
  deadline: 0,
  ownership: 0,
  bms: 0,
})

const MEMBER_SELECT = '_id firstName lastName displayName email avatarUrl role'
const MONTH_SELECT =
  'user email month scores fixedPay projectTier projectApproved learningApproved innovationApproved managerNote employeeNote correctionRequested correctionNote status lockedAt'

function safeListAvatarUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^https?:\/\//i.test(url) && url.length <= 2048) return url
  return ''
}

function hasEmbeddedAvatar(value) {
  const raw = String(value || '').trim()
  return raw.startsWith('data:image/') || (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 200)
}

function looksLikeEmail(value) {
  return /@/.test(String(value || ''))
}

function personName(user) {
  const parts = [user?.firstName, user?.lastName].filter(Boolean)
  if (parts.length) return parts.join(' ')
  const display = String(user?.displayName || '').trim()
  // Some invites store the mailbox as displayName — never show that as the title.
  if (display && !looksLikeEmail(display)) return display
  return String(user?.email || '').split('@')[0] || 'Employee'
}

/** Batch: emails that still have an onboarding Candidate photo (metadata only). */
async function emailsWithOnboardingPhoto(organizationId, emails) {
  const list = [...new Set((emails || []).map((e) => String(e || '').toLowerCase()).filter(Boolean))]
  if (!list.length) return new Set()
  const rows = await Candidate.find({
    organizationId,
    $and: [
      { $or: [{ email: { $in: list } }, { officialEmail: { $in: list } }] },
      {
        $or: [
          { 'photo.size': { $gt: 0 } },
          { 'photo.mime': { $regex: /^image\//i } },
        ],
      },
    ],
  })
    .select('email officialEmail')
    .lean()
  const out = new Set()
  rows.forEach((row) => {
    if (row.email) out.add(String(row.email).toLowerCase())
    if (row.officialEmail) out.add(String(row.officialEmail).toLowerCase())
  })
  return out
}

function emptyMonthDoc({ organizationId, user, email, month }) {
  return {
    _id: null,
    organizationId,
    user: user._id || user,
    email: String(email || '').toLowerCase(),
    month,
    scores: { ...EMPTY_SCORES },
    fixedPay: 0,
    projectTier: 'Core',
    projectApproved: false,
    learningApproved: false,
    innovationApproved: false,
    managerNote: '',
    employeeNote: '',
    correctionRequested: false,
    correctionNote: '',
    status: 'draft',
    lockedAt: null,
  }
}

function serializeRow(doc, user) {
  const plain = doc?.toObject ? doc.toObject() : doc || {}
  const calc = computeMonthlyCompensation({
    fixedPay: plain.fixedPay,
    scores: plain.scores,
    projectTier: plain.projectTier,
    projectApproved: plain.projectApproved,
    learningApproved: plain.learningApproved,
    innovationApproved: plain.innovationApproved,
  })
  return {
    id: plain._id ? String(plain._id) : null,
    user: String(plain.user),
    email: plain.email,
    name: user ? personName(user) : plain.email,
    // HTTPS only in list JSON — data: photos go through Attendance avatar proxy.
    avatarUrl: safeListAvatarUrl(user?.avatarUrl),
    avatarUserId:
      user && !safeListAvatarUrl(user?.avatarUrl) && hasEmbeddedAvatar(user?.avatarUrl)
        ? String(user._id)
        : '',
    month: plain.month,
    scores: plain.scores || { ...EMPTY_SCORES },
    fixedPay: plain.fixedPay || 0,
    projectTier: plain.projectTier || 'Core',
    projectApproved: Boolean(plain.projectApproved),
    learningApproved: Boolean(plain.learningApproved),
    innovationApproved: Boolean(plain.innovationApproved),
    managerNote: plain.managerNote || '',
    employeeNote: plain.employeeNote || '',
    correctionRequested: Boolean(plain.correctionRequested),
    correctionNote: plain.correctionNote || '',
    status: plain.status || 'draft',
    lockedAt: plain.lockedAt || null,
    ...calc,
  }
}

function normalizeScores(raw = {}) {
  return {
    outcomes: clampScore(raw.outcomes),
    quality: clampScore(raw.quality),
    deadline: clampScore(raw.deadline),
    ownership: clampScore(raw.ownership),
    bms: clampScore(raw.bms),
  }
}

function toOrgObjectId(organizationId) {
  return mongoose.Types.ObjectId.isValid(organizationId)
    ? new mongoose.Types.ObjectId(organizationId)
    : organizationId
}

async function getOrCreateMonth({ organizationId, user, email, month }) {
  const userId = user._id || user
  let doc = await PulsePerformanceMonth.findOne({ user: userId, month })
  if (doc) return doc
  try {
    doc = await PulsePerformanceMonth.create({
      organizationId,
      user: userId,
      email: String(email || '').toLowerCase(),
      month,
      scores: { ...EMPTY_SCORES },
    })
    return doc
  } catch (err) {
    // Race: another request created the unique (user, month) row first.
    if (err && err.code === 11000) {
      doc = await PulsePerformanceMonth.findOne({ user: userId, month })
      if (doc) return doc
    }
    throw err
  }
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

router.get('/meta', auth, (_req, res) => {
  res.json({
    success: true,
    data: {
      areaWeights: AREA_WEIGHTS,
      areaLabels: AREA_LABELS,
      performanceTiers: PERFORMANCE_TIERS,
      projectTiers: PROJECT_TIERS,
      guide: {
        performanceBonusCap: 3000,
        projectBonusCap: 5000,
        innovationBonusCap: 1000,
        learningBonusCap: 1000,
        monthlyVariableCap: 10000,
        promotionMinScore: 80,
      },
    },
  })
})

// Employee: own month (read-only — no write on open)
router.get('/me', auth, async (req, res) => {
  try {
    const month = assertMonth(req.query.month)
    const organizationId = orgIdOf(req.user)
    const doc = await PulsePerformanceMonth.findOne({ user: req.user._id, month })
      .select(MONTH_SELECT)
      .lean()
    const row = doc || emptyMonthDoc({
      organizationId,
      user: req.user,
      email: req.user.email,
      month,
    })
    res.json({ success: true, data: serializeRow(row, req.user) })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to load performance' })
  }
})

// Employee: request one evidence-based correction before lock
router.post('/me/correction', auth, async (req, res) => {
  try {
    const month = assertMonth(req.body.month)
    const note = String(req.body.note || '').trim()
    if (!note) {
      return res.status(400).json({ success: false, message: 'Add evidence for your correction request' })
    }
    const organizationId = orgIdOf(req.user)
    const doc = await getOrCreateMonth({
      organizationId,
      user: req.user,
      email: req.user.email,
      month,
    })
    if (doc.status === 'locked') {
      return res.status(400).json({ success: false, message: 'Payroll is locked. Score cannot be changed.' })
    }
    if (doc.correctionRequested) {
      return res.status(400).json({ success: false, message: 'You already requested one correction this month' })
    }
    doc.correctionRequested = true
    doc.correctionNote = note.slice(0, 2000)
    doc.employeeNote = note.slice(0, 2000)
    if (doc.status === 'draft') doc.status = 'review'
    await doc.save()
    res.json({ success: true, data: serializeRow(doc, req.user) })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to request correction' })
  }
})

// Admin: org-wide month list (no N+1 creates — virtual rows until first save)
router.get('/admin/month', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const month = assertMonth(req.query.month)
    const organizationId = orgIdOf(req.user)
    const orgObjectId = toOrgObjectId(organizationId)

    const [members, existing] = await Promise.all([
      User.aggregate([
        {
          $match: {
            $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
          },
        },
        {
          $project: {
            firstName: 1,
            lastName: 1,
            displayName: 1,
            email: 1,
            role: 1,
            avatarUrl: {
              $let: {
                vars: { raw: { $ifNull: ['$avatarUrl', ''] } },
                in: {
                  $cond: [
                    { $regexMatch: { input: '$$raw', regex: '^https?://' } },
                    '$$raw',
                    '',
                  ],
                },
              },
            },
            hasEmbeddedAvatar: {
              $let: {
                vars: { raw: { $ifNull: ['$avatarUrl', ''] } },
                in: {
                  $or: [
                    { $regexMatch: { input: '$$raw', regex: '^data:image/' } },
                    {
                      $and: [
                        { $gt: [{ $strLenCP: '$$raw' }, 200] },
                        {
                          $not: [
                            { $regexMatch: { input: '$$raw', regex: '^https?://' } },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ]),
      PulsePerformanceMonth.find({ organizationId: orgObjectId, month })
        .select(MONTH_SELECT)
        .lean(),
    ])

    const byUser = new Map(existing.map((row) => [String(row.user), row]))
    const needOnboarding = members
      .filter((m) => !safeListAvatarUrl(m.avatarUrl) && !m.hasEmbeddedAvatar)
      .map((m) => m.email)
    const onboardingEmails = await emailsWithOnboardingPhoto(orgObjectId, needOnboarding)

    const rows = members.map((member) => {
      const doc =
        byUser.get(String(member._id)) ||
        emptyMonthDoc({
          organizationId: orgObjectId,
          user: member,
          email: member.email,
          month,
        })
      const row = serializeRow(doc, member)
      const email = String(member.email || '').toLowerCase()
      if (
        !row.avatarUrl
        && (member.hasEmbeddedAvatar || onboardingEmails.has(email))
      ) {
        row.avatarUserId = String(member._id)
      }
      return row
    })

    rows.sort(
      (a, b) =>
        (b.weightedScore || 0) - (a.weightedScore || 0) ||
        String(a.name).localeCompare(String(b.name)),
    )
    res.json({ success: true, data: rows, meta: { month, count: rows.length } })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to load team performance' })
  }
})

// Admin: update one member month (scores + bonus gates)
router.put('/admin/:userId', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const month = assertMonth(req.body.month)
    const organizationId = orgIdOf(req.user)
    const orgObjectId = toOrgObjectId(organizationId)
    const userId = req.params.userId

    const member = await User.findOne({
      _id: userId,
      $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
    }).select(MEMBER_SELECT)
    if (!member) return res.status(404).json({ success: false, message: 'Member not found in your organization' })

    const doc = await getOrCreateMonth({
      organizationId: orgObjectId,
      user: member,
      email: member.email,
      month,
    })
    if (doc.status === 'locked') {
      return res.status(400).json({ success: false, message: 'This month is locked for payroll' })
    }

    if (req.body.scores) doc.scores = normalizeScores(req.body.scores)
    if (req.body.fixedPay != null) doc.fixedPay = Math.max(0, Number(req.body.fixedPay) || 0)
    if (req.body.projectTier && PROJECT_TIERS[req.body.projectTier] != null) {
      doc.projectTier = req.body.projectTier
    }
    if (typeof req.body.projectApproved === 'boolean') doc.projectApproved = req.body.projectApproved
    if (typeof req.body.learningApproved === 'boolean') doc.learningApproved = req.body.learningApproved
    if (typeof req.body.innovationApproved === 'boolean') doc.innovationApproved = req.body.innovationApproved
    if (req.body.managerNote != null) doc.managerNote = String(req.body.managerNote).slice(0, 2000)
    if (req.body.status && ['draft', 'review', 'confirmed'].includes(req.body.status)) {
      doc.status = req.body.status
    }
    if (req.body.resolveCorrection) {
      doc.correctionRequested = false
    }
    doc.reviewedBy = req.user._id
    await doc.save()

    res.json({ success: true, data: serializeRow(doc, member) })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to update performance' })
  }
})

// Admin / superadmin: lock month for payroll
router.post('/admin/:userId/lock', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const month = assertMonth(req.body.month)
    const organizationId = orgIdOf(req.user)
    const orgObjectId = toOrgObjectId(organizationId)

    const member = await User.findOne({
      _id: req.params.userId,
      $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
    }).select(MEMBER_SELECT)
    if (!member) return res.status(404).json({ success: false, message: 'Member not found in your organization' })

    const doc = await getOrCreateMonth({
      organizationId: orgObjectId,
      user: member,
      email: member.email,
      month,
    })
    doc.status = 'locked'
    doc.lockedAt = new Date()
    doc.reviewedBy = req.user._id
    await doc.save()

    let payslip = null
    try {
      payslip = await upsertPayslipFromPerformance({
        organizationId: orgObjectId,
        member,
        performance: doc,
        actorId: req.user._id,
      })
    } catch {
      /* payslip generation should not block lock */
    }

    res.json({
      success: true,
      data: serializeRow(doc, member),
      meta: {
        payslipId: payslip?._id ? String(payslip._id) : null,
      },
    })
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to lock performance' })
  }
})

module.exports = router
