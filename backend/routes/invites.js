const express = require('express')
const jwt = require('jsonwebtoken')
const { auth } = require('./auth')
const User = require('../models/User')
const PulseInvite = require('../models/PulseInvite')
const Candidate = require('../models/Candidate')
const { isPulseAdmin, orgIdOf, publicUserWithApps, orgCompanyDomain } = require('../utils/pulseAuth')
const { assertAllowedCompanyEmail, resolveCompanyDomain } = require('../utils/companyDomain')
const { createAndSendOrgInvite } = require('../utils/pulseOrgInvite')
const { DEFAULT_GENDER } = require('../utils/indiaLocation')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (!isPulseAdmin(req.user)) {
    return res.status(403).json({ success: false, message: 'Admin access required' })
  }
  return next()
}

function inviterName(user) {
  const n = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return n || user.displayName || user.email || 'Your admin'
}

// GET /api/invites — list for this org (admin)
router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgIdOf(req.user)
    const companyDomain = await orgCompanyDomain(req.user)
    const invites = await PulseInvite.find({ organizationId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()
    const members = await User.find({
      $or: [{ organizationId }, { _id: organizationId }],
    })
      .select('email firstName lastName role createdAt organizationId')
      .sort({ createdAt: 1 })
      .lean()

    res.json({
      success: true,
      data: {
        companyDomain,
        members: members.map((m) => ({
          _id: m._id,
          email: m.email,
          firstName: m.firstName || '',
          lastName: m.lastName || '',
          role: m.role || 'admin',
          createdAt: m.createdAt,
        })),
        invites: invites.map((i) => ({
          _id: i._id,
          email: i.email,
          role: i.role,
          status: i.status,
          expiresAt: i.expiresAt,
          createdAt: i.createdAt,
          acceptedAt: i.acceptedAt,
        })),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load invites' })
  }
})

// POST /api/invites — send invite (admin)
router.post('/', auth, requireAdmin, async (req, res) => {
  try {
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase()
    const role = req.body.role === 'admin' ? 'admin' : 'member'
    const organizationId = orgIdOf(req.user)
    const { invite, inviteUrl, emailSent } = await createAndSendOrgInvite({
      email,
      role,
      organizationId,
      invitedBy: req.user._id,
      companyName: req.user.companyName || '',
      invitedByName: inviterName(req.user),
    })

    const devInviteLink = !emailSent && process.env.NODE_ENV !== 'production' ? inviteUrl : null

    res.status(201).json({
      success: true,
      message: emailSent ? `Invite sent to ${email}` : `Invite created (email not sent) — use the link`,
      data: {
        _id: invite._id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
        ...(devInviteLink ? { devInviteLink } : {}),
      },
    })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({
      success: false,
      code: err.code,
      message: err.message || 'Failed to send invite',
    })
  }
})

// DELETE /api/invites/:id — revoke pending invite
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgIdOf(req.user)
    const invite = await PulseInvite.findOne({ _id: req.params.id, organizationId })
    if (!invite) return res.status(404).json({ success: false, message: 'Invite not found' })
    if (invite.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending invites can be revoked' })
    }
    invite.status = 'revoked'
    await invite.save()
    res.json({ success: true, message: 'Invite revoked' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to revoke invite' })
  }
})

// GET /api/invites/accept/:token — public preview
router.get('/accept/:token', async (req, res) => {
  try {
    const invite = await PulseInvite.findOne({ token: req.params.token }).lean()
    if (!invite || invite.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This invite is invalid or already used' })
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'This invite has expired' })
    }
    res.json({
      success: true,
      data: {
        email: invite.email,
        role: invite.role,
        companyName: invite.companyName || '',
        firstName: invite.firstName || '',
        lastName: invite.lastName || '',
        expiresAt: invite.expiresAt,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load invite' })
  }
})

// POST /api/invites/accept — set password and join
router.post('/accept', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim()
    const password = String(req.body.password || '')
    const firstName = String(req.body.firstName || '').trim()
    const lastName = String(req.body.lastName || '').trim()

    if (!token) return res.status(400).json({ success: false, message: 'Invite token is required' })
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' })
    }

    const invite = await PulseInvite.findOne({ token })
    if (!invite || invite.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This invite is invalid or already used' })
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(400).json({ success: false, message: 'This invite has expired' })
    }

    const existing = await User.findOne({ email: invite.email })
    if (existing) {
      return res.status(400).json({ success: false, message: 'An account already exists for this email. Sign in instead.' })
    }

    const admin = await User.findById(invite.organizationId).lean()
    const domainCheck = assertAllowedCompanyEmail(invite.email)
    if (!domainCheck.ok) {
      return res.status(400).json({
        success: false,
        code: 'COMPANY_DOMAIN_REQUIRED',
        message: domainCheck.message,
      })
    }
    const companyDomain = resolveCompanyDomain()

    const givenName = firstName || invite.firstName || ''
    const familyName = lastName || invite.lastName || ''

    const user = new User({
      email: invite.email,
      password,
      firstName: givenName,
      lastName: familyName,
      role: invite.role,
      organizationId: invite.organizationId,
      companyName: (admin && admin.companyName) || invite.companyName || '',
      companyAddress: (admin && admin.companyAddress) || '',
      companyPhone: (admin && admin.companyPhone) || '',
      companyEmail: (admin && admin.companyEmail) || invite.email,
      companyDomain,
      companyCIN: (admin && admin.companyCIN) || '',
      companyGST: (admin && admin.companyGST) || '',
      companyWebsite: (admin && admin.companyWebsite) || '',
      companyLogo: (admin && admin.companyLogo) || '',
      industry: (admin && admin.industry) || '',
      gender: DEFAULT_GENDER,
      country: 'India',
      isVerified: true,
      onboardingCompleted: true,
      pulseSetupCompleted: true,
      pulsePortalId: (admin && admin.pulsePortalId) || '',
    })
    await user.save()

    invite.status = 'accepted'
    invite.acceptedAt = new Date()
    invite.acceptedUser = user._id
    await invite.save()

    await Candidate.updateMany(
      { organizationId: invite.organizationId, officialEmail: invite.email },
      { $set: { status: 'Joined' } },
    )

    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'fallback_secret', {
      expiresIn: '7d',
    })

    res.status(201).json({
      success: true,
      message: 'Welcome to Pulse',
      token: jwtToken,
      user: await publicUserWithApps(user),
    })
  } catch (err) {
    console.error('Accept invite error:', err)
    res.status(500).json({ success: false, message: err.message || 'Failed to accept invite' })
  }
})

module.exports = router
