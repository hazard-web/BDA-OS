const crypto = require('crypto')
const express = require('express')
const { auth } = require('./auth')
const Candidate = require('../models/Candidate')
const User = require('../models/User')
const { isPulseAdmin, orgIdOf } = require('../utils/pulseAuth')
const { assertAllowedCompanyEmail, completeCompanyEmail } = require('../utils/companyDomain')
const { sendCandidateOnboardingEmail } = require('../utils/emailService')
const { buildCandidateOnboardLink } = require('../utils/urlHelper')
const { createAndSendOrgInvite, inviterDisplayName } = require('../utils/pulseOrgInvite')

const router = express.Router()

const STATUSES = ['Draft', 'Not started', 'In progress', 'Details received', 'Offer sent', 'Joined', 'Withdrawn']
const MAX_FILE_BYTES = 5 * 1024 * 1024
const PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg', 'image/webp']
const ID_MIMES = [...PHOTO_MIMES, 'application/pdf']
const LETTER_MIMES = [
  ...PHOTO_MIMES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ONBOARD_TTL_MS = 14 * 24 * 60 * 60 * 1000

function isId(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || ''))
}

function httpError(status, message, code) {
  const err = new Error(message)
  err.status = status
  if (code) err.code = code
  return err
}

function requireAdmin(req, res, next) {
  if (!isPulseAdmin(req.user)) {
    return res.status(403).json({ success: false, message: 'Admin access required' })
  }
  return next()
}

function actorName(user) {
  const n = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  return n || user.displayName || user.email || 'Admin'
}

function fileMeta(file) {
  if (!file || !file.name) return null
  return {
    name: file.name,
    mime: file.mime || '',
    size: file.size || 0,
    hasFile: Boolean(file.data),
  }
}

function joinParts(parts) {
  return parts.map(cleanStr).filter(Boolean).join(', ')
}

function formatAddress(addr) {
  const src = addr && typeof addr === 'object' ? addr : {}
  return joinParts([src.line1, src.line2, src.city, src.state, src.postalCode, src.country])
}

function formatEntries(list, keys) {
  if (!Array.isArray(list)) return ''
  return list
    .map((entry) => joinParts(keys.map((key) => entry?.[key])))
    .filter(Boolean)
    .join(' · ')
}

function toListItem(doc) {
  const row = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  const emergency = row.emergencyContact && typeof row.emergencyContact === 'object' ? row.emergencyContact : {}
  return {
    _id: row._id,
    candidateId: row.candidateId || '',
    status: row.status || 'Draft',
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    email: row.email || '',
    officialEmail: row.officialEmail || '',
    phone: row.phone || '',
    countryCode: row.countryCode || '+91',
    dob: row.dob || null,
    gender: row.gender || '',
    emergencyName: cleanStr(emergency.name),
    emergencyRelationship: cleanStr(emergency.relationship),
    emergencyPhone: cleanStr(emergency.phone),
    presentAddressLine: formatAddress(row.presentAddress),
    permanentAddressLine: formatAddress(row.permanentAddress),
    educationSummary: formatEntries(row.education, ['degree', 'fieldOfStudy', 'schoolName']),
    experienceSummary: formatEntries(row.experience, ['occupation', 'company']),
    uan: row.uan || '',
    aadhaar: row.aadhaar || '',
    pan: row.pan || '',
    department: row.department || '',
    sourceOfHire: row.sourceOfHire || '',
    workLocation: row.workLocation || '',
    title: row.title || '',
    experienceYears: row.experienceYears || '',
    skillSet: row.skillSet || '',
    highestQualification: row.highestQualification || '',
    currentSalary: row.currentSalary || '',
    additionalInfo: row.additionalInfo || '',
    tentativeJoiningDate: row.tentativeJoiningDate || null,
    photo: fileMeta(row.photo),
    offerLetter: fileMeta(row.offerLetter),
    aadhaarFront: fileMeta(row.aadhaarFront),
    aadhaarBack: fileMeta(row.aadhaarBack),
    panFront: fileMeta(row.panFront),
    panBack: fileMeta(row.panBack),
    addedByName: row.addedByName || '',
    modifiedByName: row.modifiedByName || '',
    onboardingEmailSentAt: row.onboardingEmailSentAt || null,
    employeeSubmittedAt: row.employeeSubmittedAt || null,
    pulseInviteSentAt: row.pulseInviteSentAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toDetail(doc) {
  const row = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  return {
    ...toListItem(row),
    presentAddress: row.presentAddress || {},
    permanentAddress: row.permanentAddress || {},
    emergencyContact: row.emergencyContact || {},
    sameAsPresent: Boolean(row.sameAsPresent),
    education: row.education || [],
    experience: row.experience || [],
    photo: row.photo && row.photo.data ? row.photo : fileMeta(row.photo),
    offerLetter: row.offerLetter && row.offerLetter.data ? row.offerLetter : fileMeta(row.offerLetter),
    aadhaarFront: row.aadhaarFront && row.aadhaarFront.data ? row.aadhaarFront : fileMeta(row.aadhaarFront),
    aadhaarBack: row.aadhaarBack && row.aadhaarBack.data ? row.aadhaarBack : fileMeta(row.aadhaarBack),
    panFront: row.panFront && row.panFront.data ? row.panFront : fileMeta(row.panFront),
    panBack: row.panBack && row.panBack.data ? row.panBack : fileMeta(row.panBack),
  }
}

function toPublicOnboard(doc, { companyName }) {
  const detail = toDetail(doc)
  return {
    submitted: Boolean(doc.employeeSubmittedAt),
    companyName: companyName || '',
    firstName: detail.firstName,
    lastName: detail.lastName,
    email: detail.email,
    officialEmail: detail.officialEmail,
    phone: detail.phone,
    countryCode: detail.countryCode,
    dob: detail.dob,
    gender: detail.gender,
    emergencyContact: detail.emergencyContact,
    aadhaar: detail.aadhaar,
    pan: detail.pan,
    photo: null,
    aadhaarFront: null,
    aadhaarBack: null,
    panFront: null,
    panBack: null,
    presentAddress: detail.presentAddress,
    permanentAddress: detail.permanentAddress,
    sameAsPresent: detail.sameAsPresent,
    experienceYears: detail.experienceYears,
    skillSet: detail.skillSet,
    highestQualification: detail.highestQualification,
    additionalInfo: detail.additionalInfo,
    education: detail.education,
    experience: detail.experience,
    tentativeJoiningDate: detail.tentativeJoiningDate,
    department: detail.department,
    title: detail.title,
    workLocation: detail.workLocation,
  }
}

function cleanStr(value) {
  return String(value == null ? '' : value).trim()
}

function sanitizeFile(file, allowedMimes) {
  if (!file || typeof file !== 'object') return undefined
  const name = cleanStr(file.name)
  const data = cleanStr(file.data)
  if (!name && !data) return undefined
  const size = Number(file.size) || 0
  const mime = cleanStr(file.mime).toLowerCase()
  if (size > MAX_FILE_BYTES) {
    throw httpError(400, 'File is larger than 5 MB')
  }
  if (data && data.length > MAX_FILE_BYTES * 1.4) {
    throw httpError(400, 'File is larger than 5 MB')
  }
  if (mime && allowedMimes.length && !allowedMimes.includes(mime) && !mime.startsWith('image/')) {
    throw httpError(400, 'This file type is not supported')
  }
  return { name, mime, size, data }
}

const GENDERS = ['Male', 'Female', 'Other']

function sanitizeAddress(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    line1: cleanStr(src.line1),
    line2: cleanStr(src.line2),
    city: cleanStr(src.city),
    country: cleanStr(src.country) || 'India',
    state: cleanStr(src.state),
    postalCode: cleanStr(src.postalCode),
  }
}

function sanitizeEmergency(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    name: cleanStr(src.name),
    relationship: cleanStr(src.relationship),
    phone: cleanStr(src.phone).replace(/\D/g, '').slice(0, 12),
  }
}

function sanitizeGender(value) {
  const gender = cleanStr(value)
  return GENDERS.includes(gender) ? gender : ''
}

function parseDob(value) {
  if (!value) return null
  const dob = new Date(value)
  if (Number.isNaN(dob.getTime())) return null
  return dob
}

function sanitizeRows(list, keys) {
  if (!Array.isArray(list)) return []
  return list
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const next = {}
      keys.forEach((key) => {
        next[key] = cleanStr(row[key])
      })
      const hasValue = keys.some((key) => next[key])
      return hasValue ? next : null
    })
    .filter(Boolean)
}

function pickAdminPayload(body, { keepFiles }) {
  const status = STATUSES.includes(body.status) ? body.status : undefined
  const payload = {
    firstName: cleanStr(body.firstName),
    lastName: cleanStr(body.lastName),
    email: cleanStr(body.email).toLowerCase(),
    officialEmail: completeCompanyEmail(body.officialEmail),
    department: cleanStr(body.department),
    sourceOfHire: cleanStr(body.sourceOfHire),
    workLocation: cleanStr(body.workLocation),
    title: cleanStr(body.title),
    additionalInfo: cleanStr(body.additionalInfo),
    tentativeJoiningDate: body.tentativeJoiningDate ? new Date(body.tentativeJoiningDate) : null,
  }
  if (status) payload.status = status
  if (keepFiles && body.offerLetter !== undefined) {
    payload.offerLetter = sanitizeFile(body.offerLetter, LETTER_MIMES)
  }
  return payload
}

function pickEmployeePayload(body, { keepFiles }) {
  const payload = {
    firstName: cleanStr(body.firstName),
    lastName: cleanStr(body.lastName),
    phone: cleanStr(body.phone),
    countryCode: cleanStr(body.countryCode) || '+91',
    dob: parseDob(body.dob),
    gender: sanitizeGender(body.gender),
    emergencyContact: sanitizeEmergency(body.emergencyContact),
    aadhaar: cleanStr(body.aadhaar),
    pan: cleanStr(body.pan).toUpperCase(),
    presentAddress: sanitizeAddress(body.presentAddress),
    permanentAddress: sanitizeAddress(body.permanentAddress),
    sameAsPresent: Boolean(body.sameAsPresent),
    experienceYears: cleanStr(body.experienceYears),
    skillSet: cleanStr(body.skillSet),
    highestQualification: cleanStr(body.highestQualification),
    additionalInfo: cleanStr(body.additionalInfo),
    education: sanitizeRows(body.education, [
      'schoolName',
      'degree',
      'fieldOfStudy',
      'dateOfCompletion',
      'additionalNotes',
    ]),
    experience: sanitizeRows(body.experience, [
      'occupation',
      'company',
      'summary',
      'duration',
      'currentlyWorkHere',
    ]),
  }
  if (payload.sameAsPresent) payload.permanentAddress = { ...payload.presentAddress }
  if (keepFiles) {
    if (body.photo !== undefined) payload.photo = sanitizeFile(body.photo, PHOTO_MIMES)
    if (body.aadhaarFront !== undefined) payload.aadhaarFront = sanitizeFile(body.aadhaarFront, ID_MIMES)
    if (body.aadhaarBack !== undefined) payload.aadhaarBack = sanitizeFile(body.aadhaarBack, ID_MIMES)
    if (body.panFront !== undefined) payload.panFront = sanitizeFile(body.panFront, ID_MIMES)
    if (body.panBack !== undefined) payload.panBack = sanitizeFile(body.panBack, ID_MIMES)
  }
  return payload
}

function hasCardFile(file) {
  return Boolean(file && (file.data || file.name))
}

function requireIdCards(payload, existing) {
  const aadhaarFront = payload.aadhaarFront || existing?.aadhaarFront
  const aadhaarBack = payload.aadhaarBack || existing?.aadhaarBack
  const panFront = payload.panFront || existing?.panFront
  const panBack = payload.panBack || existing?.panBack
  if (!hasCardFile(aadhaarFront) || !hasCardFile(aadhaarBack) || !hasCardFile(panFront) || !hasCardFile(panBack)) {
    throw httpError(400, 'Upload Aadhaar and PAN card (front and back)')
  }
}

function requirePersonalEmail(row) {
  const email = cleanStr(row.email).toLowerCase()
  if (!email || !email.includes('@')) {
    throw httpError(400, 'Personal email is required so we can send the details form')
  }
  row.email = email
}

function requireAdminHireFields(row) {
  const officialEmail = completeCompanyEmail(row.officialEmail)
  const domainCheck = assertAllowedCompanyEmail(officialEmail)
  if (!domainCheck.ok) {
    throw httpError(
      400,
      `Work email must be @${domainCheck.domain}. That address is the BDA OS login.`,
      'WORK_EMAIL_DOMAIN_REQUIRED',
    )
  }
  if (!row.tentativeJoiningDate) {
    throw httpError(400, 'Joining date is required')
  }
  if (!hasCardFile(row.offerLetter)) {
    throw httpError(400, 'Upload the offer letter')
  }
  row.officialEmail = officialEmail
}

async function nextCandidateId(organizationId) {
  const count = await Candidate.countDocuments({ organizationId })
  return `CAND-${String(count + 1).padStart(4, '0')}`
}

async function resolveInviter(candidate) {
  if (candidate.addedBy) {
    const added = await User.findById(candidate.addedBy)
    if (added) return added
  }
  return User.findById(candidate.organizationId)
}

async function companyNameFor(candidate) {
  const inviter = await resolveInviter(candidate)
  return (inviter && inviter.companyName) || 'BDA Technologies'
}

function issueOnboardingToken(candidate) {
  candidate.onboardingToken = crypto.randomBytes(32).toString('hex')
  candidate.onboardingTokenExpires = new Date(Date.now() + ONBOARD_TTL_MS)
}

async function findOnboardCandidate(token) {
  const value = cleanStr(token)
  if (!value || value.length < 16) return null
  const row = await Candidate.findOne({ onboardingToken: value })
  if (!row) return null
  if (row.onboardingTokenExpires && row.onboardingTokenExpires < new Date()) return 'expired'
  return row
}

async function sendPulseInviteForCandidate(candidate) {
  const officialEmail = completeCompanyEmail(candidate.officialEmail)
  const domainCheck = assertAllowedCompanyEmail(officialEmail)
  if (!domainCheck.ok) {
    throw httpError(
      400,
      `Work email must be @${domainCheck.domain}. That address is the BDA OS login.`,
      'WORK_EMAIL_DOMAIN_REQUIRED',
    )
  }
  const inviter = await resolveInviter(candidate)
  if (!inviter) {
    throw httpError(400, 'Could not find an admin to send the BDA OS invite')
  }
  const { invite, emailSent, inviteUrl, emailError } = await createAndSendOrgInvite({
    email: officialEmail,
    role: 'member',
    organizationId: candidate.organizationId,
    invitedBy: inviter._id,
    companyName: inviter.companyName || '',
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    invitedByName: inviterDisplayName(inviter),
  })
  candidate.officialEmail = officialEmail
  candidate.pulseInviteId = invite._id
  candidate.pulseInviteSentAt = new Date()
  if (candidate.status !== 'Joined') candidate.status = 'Offer sent'
  await candidate.save()
  return { emailSent, inviteUrl, officialEmail, emailError }
}

router.get('/onboard/:token', async (req, res) => {
  try {
    const row = await findOnboardCandidate(req.params.token)
    if (row === 'expired') {
      return res.status(400).json({ success: false, message: 'This link has expired. Ask HR to send it again.' })
    }
    if (!row) {
      return res.status(400).json({ success: false, message: 'This link is invalid or already used' })
    }
    if (row.employeeSubmittedAt) {
      const companyName = await companyNameFor(row)
      return res.json({
        success: true,
        data: {
          submitted: true,
          companyName,
          officialEmail: row.officialEmail || '',
          firstName: row.firstName || '',
        },
      })
    }
    if (row.status === 'Not started') {
      row.status = 'In progress'
      await row.save()
    }
    const companyName = await companyNameFor(row)
    res.json({ success: true, data: toPublicOnboard(row, { companyName }) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load form' })
  }
})

router.post('/onboard/:token', async (req, res) => {
  try {
    const row = await findOnboardCandidate(req.params.token)
    if (row === 'expired') {
      return res.status(400).json({ success: false, message: 'This link has expired. Ask HR to send it again.' })
    }
    if (!row) {
      return res.status(400).json({ success: false, message: 'This link is invalid or already used' })
    }
    if (row.employeeSubmittedAt) {
      return res.status(400).json({
        success: false,
        message: 'You already submitted these details.',
      })
    }

    const payload = pickEmployeePayload(req.body || {}, { keepFiles: true })
    if (!payload.firstName || !payload.lastName || !payload.phone) {
      return res.status(400).json({
        success: false,
        message: 'First name, last name, and phone are required',
      })
    }
    if (!payload.dob) {
      return res.status(400).json({ success: false, message: 'Date of birth is required' })
    }
    if (payload.dob > new Date()) {
      return res.status(400).json({ success: false, message: 'Date of birth cannot be in the future' })
    }
    if (!payload.gender) {
      return res.status(400).json({ success: false, message: 'Gender is required' })
    }
    if (!payload.emergencyContact.name || !payload.emergencyContact.phone) {
      return res.status(400).json({
        success: false,
        message: 'Emergency contact name and phone are required',
      })
    }
    requireIdCards(payload, row)

    Object.assign(row, payload)
    row.employeeSubmittedAt = new Date()
    row.status = 'Details received'
    await row.save()

    res.json({
      success: true,
      message: 'Details saved. HR will send sign-in instructions to your work email.',
      data: {
        submitted: true,
        inviteSent: false,
      },
    })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ success: false, message: err.message || 'Failed to submit details' })
  }
})

router.get('/', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgIdOf(req.user)
    const q = cleanStr(req.query.q).toLowerCase()
    const department = cleanStr(req.query.department)
    const location = cleanStr(req.query.location)
    const status = cleanStr(req.query.status)
    const scope = cleanStr(req.query.scope) || 'all'
    const filter = { organizationId }
    if (department && department !== 'all') filter.department = department
    if (location && location !== 'all') filter.workLocation = location
    if (status && STATUSES.includes(status)) filter.status = status
    if (scope === 'mine') filter.addedBy = req.user._id

    let rows = await Candidate.find(filter).sort({ createdAt: -1 }).limit(500).lean()
    if (q) {
      rows = rows.filter((row) => {
        const blob = [
          row.firstName,
          row.lastName,
          row.email,
          row.officialEmail,
          row.phone,
          row.candidateId,
          row.department,
          row.gender,
          row.pan,
          row.aadhaar,
          row.emergencyContact?.name,
          row.emergencyContact?.phone,
          row.presentAddress?.city,
          row.workLocation,
          row.title,
        ]
          .join(' ')
          .toLowerCase()
        return blob.includes(q)
      })
    }

    const departments = [...new Set(rows.map((r) => r.department).filter(Boolean))].sort()
    const locations = [...new Set(rows.map((r) => r.workLocation).filter(Boolean))].sort()

    res.json({
      success: true,
      data: {
        candidates: rows.map(toListItem),
        departments,
        locations,
        statuses: STATUSES,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load candidates' })
  }
})

router.post('/:id/send-onboarding', auth, requireAdmin, async (req, res) => {
  try {
    if (!isId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid candidate' })
    }
    const organizationId = orgIdOf(req.user)
    const row = await Candidate.findOne({ _id: req.params.id, organizationId })
    if (!row) return res.status(404).json({ success: false, message: 'Candidate not found' })
    if (row.employeeSubmittedAt) {
      return res.status(400).json({
        success: false,
        message: 'This person already submitted details. Resend the BDA OS invite instead.',
      })
    }

    requirePersonalEmail(row)
    issueOnboardingToken(row)
    const onboardUrl = buildCandidateOnboardLink(row.onboardingToken)
    const candidateName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim()

    let emailSent = true
    let emailError = ''
    let devOnboardLink = null
    try {
      await sendCandidateOnboardingEmail({
        to: row.email,
        onboardUrl,
        companyName: req.user.companyName,
        candidateName,
        invitedByName: actorName(req.user),
      })
    } catch (emailErr) {
      console.error('Candidate onboarding email failed:', emailErr.message)
      emailSent = false
      emailError = emailErr.message || 'Email provider rejected the message'
      devOnboardLink = onboardUrl
    }

    if (emailSent) {
      row.onboardingEmailSentAt = new Date()
      if (row.status === 'Draft' || !row.status) row.status = 'Not started'
    }
    row.modifiedBy = req.user._id
    row.modifiedByName = actorName(req.user)
    await row.save()

    res.json({
      success: true,
      emailSent,
      message: emailSent
        ? `Details form sent to ${row.email}`
        : `Record saved, but the email could not be sent. ${emailError}`,
      data: {
        ...toListItem(row),
        ...(emailSent ? {} : { onboardUrl, devOnboardLink }),
      },
    })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ success: false, message: err.message || 'Failed to send details email' })
  }
})

router.post('/:id/send-invite', auth, requireAdmin, async (req, res) => {
  try {
    if (!isId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid candidate' })
    }
    const organizationId = orgIdOf(req.user)
    const row = await Candidate.findOne({ _id: req.params.id, organizationId })
    if (!row) return res.status(404).json({ success: false, message: 'Candidate not found' })
    if (!row.employeeSubmittedAt) {
      return res.status(400).json({
        success: false,
        message: 'Wait until the employee submits personal details, then send the BDA OS invite.',
      })
    }

    requireAdminHireFields(row)
    const sent = await sendPulseInviteForCandidate(row)
    res.json({
      success: true,
      emailSent: sent.emailSent,
      message: sent.emailSent
        ? `BDA OS invite sent to ${sent.officialEmail}`
        : `Invite created, but the email could not be sent. ${sent.emailError || ''}`.trim(),
      data: {
        ...toListItem(row),
        ...(sent.emailSent ? {} : { inviteUrl: sent.inviteUrl, devInviteLink: sent.inviteUrl }),
      },
    })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ success: false, message: err.message || 'Failed to send BDA OS invite' })
  }
})

router.get('/:id', auth, requireAdmin, async (req, res) => {
  try {
    if (!isId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid candidate' })
    }
    const organizationId = orgIdOf(req.user)
    const row = await Candidate.findOne({ _id: req.params.id, organizationId })
    if (!row) return res.status(404).json({ success: false, message: 'Candidate not found' })
    res.json({ success: true, data: toDetail(row) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load candidate' })
  }
})

router.post('/', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgIdOf(req.user)
    const payload = pickAdminPayload(req.body || {}, { keepFiles: true })
    payload.status = 'Draft'
    const name = actorName(req.user)
    const row = await Candidate.create({
      ...payload,
      organizationId,
      candidateId: await nextCandidateId(organizationId),
      addedBy: req.user._id,
      addedByName: name,
      modifiedBy: req.user._id,
      modifiedByName: name,
    })
    res.status(201).json({
      success: true,
      message: 'Draft saved',
      data: toListItem(row),
    })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ success: false, message: err.message || 'Failed to add candidate' })
  }
})

router.patch('/:id', auth, requireAdmin, async (req, res) => {
  try {
    if (!isId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid candidate' })
    }
    const organizationId = orgIdOf(req.user)
    const row = await Candidate.findOne({ _id: req.params.id, organizationId })
    if (!row) return res.status(404).json({ success: false, message: 'Candidate not found' })
    const payload = pickAdminPayload(req.body || {}, { keepFiles: true })
    delete payload.status
    if (row.employeeSubmittedAt) {
      delete payload.firstName
      delete payload.lastName
      delete payload.additionalInfo
    }
    Object.assign(row, payload)
    row.modifiedBy = req.user._id
    row.modifiedByName = actorName(req.user)
    await row.save()
    res.json({ success: true, message: 'Saved', data: toListItem(row) })
  } catch (err) {
    const status = err.status || 500
    res.status(status).json({ success: false, message: err.message || 'Failed to update candidate' })
  }
})

router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    if (!isId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid candidate' })
    }
    const organizationId = orgIdOf(req.user)
    const row = await Candidate.findOneAndDelete({ _id: req.params.id, organizationId })
    if (!row) return res.status(404).json({ success: false, message: 'Candidate not found' })
    res.json({ success: true, message: 'Candidate removed' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to remove candidate' })
  }
})

module.exports = router
