const crypto = require('crypto')
const User = require('../models/User')
const PulseInvite = require('../models/PulseInvite')
const { sendPulseInviteEmail } = require('./emailService')
const { buildInviteLink } = require('./urlHelper')
const { assertAllowedCompanyEmail } = require('./companyDomain')

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function inviterDisplayName(user) {
  const n = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  return n || user?.displayName || user?.email || 'Your admin'
}

async function createAndSendOrgInvite({
  email,
  role = 'member',
  organizationId,
  invitedBy,
  companyName,
  firstName = '',
  lastName = '',
  invitedByName,
}) {
  const address = String(email || '').trim().toLowerCase()
  if (!address || !address.includes('@')) {
    const err = new Error('Valid work email is required')
    err.status = 400
    throw err
  }

  const domainCheck = assertAllowedCompanyEmail(address)
  if (!domainCheck.ok) {
    const err = new Error(domainCheck.message)
    err.status = 400
    err.code = 'COMPANY_DOMAIN_REQUIRED'
    throw err
  }

  const existingUser = await User.findOne({ email: address }).select('_id organizationId').lean()
  if (existingUser) {
    const sameOrg =
      String(existingUser.organizationId || existingUser._id) === String(organizationId) ||
      String(existingUser._id) === String(organizationId)
    const err = new Error(
      sameOrg ? 'This person already has a Pulse account' : 'Email is already registered',
    )
    err.status = 400
    throw err
  }

  await PulseInvite.updateMany(
    { organizationId, email: address, status: 'pending' },
    { $set: { status: 'revoked' } },
  )

  const token = crypto.randomBytes(32).toString('hex')
  const invite = await PulseInvite.create({
    email: address,
    role,
    organizationId,
    invitedBy,
    companyName: companyName || '',
    firstName: String(firstName || '').trim(),
    lastName: String(lastName || '').trim(),
    token,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  })

  const inviteUrl = buildInviteLink(token)
  let emailSent = true
  let emailError = ''
  try {
    await sendPulseInviteEmail({
      to: address,
      inviteUrl,
      companyName,
      role,
      invitedByName: invitedByName || 'Pulse',
      loginEmail: address,
    })
  } catch (emailErr) {
    console.error('Pulse invite email failed:', emailErr.message)
    emailSent = false
    emailError = emailErr.message || 'Email provider rejected the message'
  }

  return { invite, inviteUrl, emailSent, emailError }
}

module.exports = {
  INVITE_TTL_MS,
  inviterDisplayName,
  createAndSendOrgInvite,
}
