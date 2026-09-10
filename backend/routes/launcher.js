const express = require('express')
const { auth } = require('./auth')
const User = require('../models/User')
const EmployeeAppGrant = require('../models/EmployeeAppGrant')
const { isPulseAdmin, orgIdOf } = require('../utils/pulseAuth')
const { listActiveGrantsForEmail, normalizeEmail, slugAppId, iconFromUrl, hydrateGrant } = require('../utils/appCatalog')
const { syncGoogleLinkedApps } = require('../utils/googleLinkedApps')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (!isPulseAdmin(req.user)) {
    return res.status(403).json({ success: false, message: 'Admin access required' })
  }
  return next()
}

function isHttpUrl(value) {
  try {
    const u = new URL(String(value || ''))
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

async function orgMembers(organizationId) {
  return User.find({
    $or: [{ organizationId }, { _id: organizationId }],
  })
    .select('email firstName lastName role')
    .sort({ createdAt: 1 })
    .lean()
}

async function emailBelongsToOrg(organizationId, email) {
  const members = await orgMembers(organizationId)
  return members.some((m) => normalizeEmail(m.email) === email)
}

async function grantsForEmail(email) {
  return listActiveGrantsForEmail(email)
}

router.get('/apps', auth, async (req, res) => {
  try {
    const email = normalizeEmail(req.user.email)
    let google = { connected: !!(req.user.googleWorkspace && req.user.googleWorkspace.connected), imported: 0 }
    try {
      const sync = await syncGoogleLinkedApps(req.user)
      google = {
        connected: !!sync.connected,
        imported: sync.imported || 0,
        source: sync.source,
        message: sync.message || '',
      }
    } catch {
      /* keep assigned grants */
    }
    const apps = await grantsForEmail(email)
    res.set('Cache-Control', 'no-store')
    res.json({
      success: true,
      data: {
        email,
        pulse: {
          id: 'pulse',
          name: 'BDA OS',
          to: '/bda-os',
          always: true,
        },
        apps,
        count: apps.length,
        google,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load apps' })
  }
})

router.post('/google/sync', auth, async (req, res) => {
  try {
    const result = await syncGoogleLinkedApps(req.user, { force: true })
    const apps = await grantsForEmail(normalizeEmail(req.user.email))
    res.json({
      success: true,
      message: result.message || 'Synced Google linked apps',
      data: { ...result, apps, count: apps.length },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Could not import Google apps' })
  }
})

router.get('/admin', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgIdOf(req.user)
    const [members, grants] = await Promise.all([
      orgMembers(organizationId),
      EmployeeAppGrant.find({ organizationId, status: 'active' }).sort({ email: 1, name: 1 }).lean(),
    ])
    res.json({
      success: true,
      data: {
        members: members.map((m) => ({
          _id: m._id,
          email: m.email,
          firstName: m.firstName || '',
          lastName: m.lastName || '',
          role: m.role || 'admin',
        })),
        grants: grants.map((g) => ({
          ...hydrateGrant(g),
          grantedAt: g.updatedAt || g.createdAt,
        })),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load grants' })
  }
})

router.post('/admin', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgIdOf(req.user)
    const email = normalizeEmail(req.body.email)
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Employee email is required' })
    }

    const inOrg = await emailBelongsToOrg(organizationId, email)
    if (!inOrg) {
      return res.status(400).json({
        success: false,
        message: 'Assign apps only to people in this company (invite them first)',
      })
    }

    const name = String(req.body.name || '').trim()
    const url = String(req.body.url || '').trim()
    if (!name || !url) {
      return res.status(400).json({ success: false, message: 'Enter an app name and URL' })
    }
    if (!isHttpUrl(url)) {
      return res.status(400).json({ success: false, message: 'App URL must start with http:// or https://' })
    }

    const appId = slugAppId(req.body.appId || name)
    const grant = await EmployeeAppGrant.findOneAndUpdate(
      { organizationId, email, appId },
      {
        organizationId,
        email,
        appId,
        name,
        url,
        color: String(req.body.color || '').trim() || '#1A5F4A',
        iconUrl: String(req.body.iconUrl || '').trim() || iconFromUrl(url),
        grantedBy: req.user._id,
        status: 'active',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    res.json({
      success: true,
      message: `${grant.name} assigned to ${email}`,
      data: hydrateGrant(grant),
    })
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'This person already has that app' })
    }
    res.status(500).json({ success: false, message: err.message || 'Could not assign app' })
  }
})

router.delete('/admin/:id', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgIdOf(req.user)
    const grant = await EmployeeAppGrant.findOne({
      _id: req.params.id,
      organizationId,
    })
    if (!grant) {
      return res.status(404).json({ success: false, message: 'Grant not found' })
    }
    grant.status = 'revoked'
    await grant.save()
    res.json({ success: true, message: `${grant.name} removed from ${grant.email}` })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Could not revoke app' })
  }
})

module.exports = router
