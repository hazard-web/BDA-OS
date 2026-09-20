const express = require('express')
const mongoose = require('mongoose')
const { auth } = require('./auth')
const User = require('../models/User')
const Candidate = require('../models/Candidate')
const Staff = require('../models/Staff')
const PulseCompanyFile = require('../models/PulseCompanyFile')
const { isPulseAdmin, orgIdOf } = require('../utils/pulseAuth')
const { personName } = require('../utils/pulsePerson')
const { uploadBase64, cloudinaryResourceType } = require('../utils/cloudinary')
const { logActivity } = require('../utils/logger')

const router = express.Router()

const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const STAFF_DOC_LABELS = [
  { key: 'profileImage', label: 'Profile picture' },
  { key: 'aadharCard', label: 'Aadhaar card' },
  { key: 'panCard', label: 'PAN card' },
]

const ONBOARDING_DOC_LABELS = [
  { key: 'photo', label: 'Onboarding photo' },
  { key: 'aadhaarFront', label: 'Aadhaar front' },
  { key: 'aadhaarBack', label: 'Aadhaar back' },
  { key: 'panFront', label: 'PAN front' },
  { key: 'panBack', label: 'PAN back' },
  { key: 'offerLetter', label: 'Offer letter' },
]

function toOrgObjectId(organizationId) {
  return mongoose.Types.ObjectId.isValid(organizationId)
    ? new mongoose.Types.ObjectId(organizationId)
    : organizationId
}

function formatBytes(size) {
  const n = Number(size) || 0
  if (n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function extLabel(name = '', mime = '') {
  const fromName = String(name).split('.').pop()
  if (fromName && fromName !== name && fromName.length <= 5) return fromName.toUpperCase()
  if (String(mime).includes('pdf')) return 'PDF'
  if (String(mime).includes('sheet') || String(mime).includes('excel')) return 'Sheet'
  if (String(mime).includes('word')) return 'Doc'
  if (String(mime).startsWith('image/')) return 'Image'
  return 'File'
}

function fileMetaLine({ originalName, mimeType, size, hint }) {
  const bits = [extLabel(originalName, mimeType), formatBytes(size), hint].filter(Boolean)
  return bits.join(' · ')
}

function parseDataUrl(data) {
  const match = String(data || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return { mimeType: match[1].toLowerCase(), base64: match[2] }
}

async function linkedStaff(user) {
  return Staff.findOne({
    email: String(user.email || '').toLowerCase(),
    user: orgIdOf(user),
  }).lean()
}

async function linkedCandidate(user) {
  const orgId = toOrgObjectId(orgIdOf(user))
  const email = String(user.email || '').toLowerCase().trim()
  if (!email) return null
  return Candidate.findOne({
    organizationId: orgId,
    $or: [{ email }, { officialEmail: email }],
  }).lean()
}

function hasOnboardingFile(file) {
  return Boolean(file && (file.data || file.size || file.name))
}

function serializeCompanyFile(doc) {
  const plain = doc?.toObject ? doc.toObject() : doc || {}
  return {
    id: String(plain._id),
    title: plain.title || plain.originalName || plain.fileName,
    fileName: plain.fileName,
    originalName: plain.originalName,
    mimeType: plain.mimeType || '',
    size: plain.size || 0,
    url: plain.url,
    uploadedByName: plain.uploadedByName || '',
    createdAt: plain.createdAt,
    section: 'org',
    meta: fileMetaLine({
      originalName: plain.originalName,
      mimeType: plain.mimeType,
      size: plain.size,
      hint: plain.uploadedByName ? `by ${plain.uploadedByName}` : 'Company',
    }),
  }
}

function dashFileRow(item) {
  return {
    id: item.id,
    title: item.title,
    meta: item.meta || '',
    section: item.section,
    url: item.url || null,
    openPath: item.openPath || null,
    downloadName: item.downloadName || item.title,
    to: item.url || item.openPath ? 'file' : undefined,
  }
}

async function collectMyFiles(user) {
  const orgId = orgIdOf(user)
  const [companyDocs, employeeFiles] = await Promise.all([
    PulseCompanyFile.find({ organizationId: toOrgObjectId(orgId) })
      .sort({ createdAt: -1 })
      .lean(),
    collectEmployeeFiles(user),
  ])

  const files = companyDocs.map((doc) => dashFileRow({
    id: `org-${doc._id}`,
    title: doc.title || doc.originalName || doc.fileName,
    meta: fileMetaLine({
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      size: doc.size,
      hint: 'Company',
    }),
    section: 'org',
    url: doc.url,
    downloadName: doc.originalName || doc.fileName,
  }))

  return [...files, ...employeeFiles]
}

async function collectEmployeeFiles(user, { openPathPrefix } = {}) {
  const [staff, candidate] = await Promise.all([
    linkedStaff(user),
    linkedCandidate(user),
  ])
  const files = []
  const prefix = openPathPrefix || '/pulse-files/open/onboarding'

  if (staff?.documents) {
    STAFF_DOC_LABELS.forEach(({ key, label }) => {
      const doc = staff.documents[key]
      if (!doc?.url) return
      files.push(dashFileRow({
        id: `staff-${key}`,
        title: label,
        meta: fileMetaLine({
          originalName: doc.originalName || label,
          mimeType: '',
          size: 0,
          hint: 'Employee',
        }),
        section: 'employee',
        url: doc.url,
        downloadName: doc.originalName || label,
      }))
    })
  }

  ;(staff?.additionalDocuments || []).forEach((doc) => {
    if (!doc?.url) return
    files.push({
      ...dashFileRow({
        id: `extra-${doc._id}`,
        title: doc.documentType || doc.originalName || 'Document',
        meta: fileMetaLine({
          originalName: doc.originalName,
          mimeType: '',
          size: 0,
          hint: 'Employee file',
        }),
        section: 'employee',
        url: doc.url,
        downloadName: doc.originalName || doc.documentType || 'document',
      }),
      canDelete: true,
      staffDocId: String(doc._id),
    })
  })

  if (candidate) {
    ONBOARDING_DOC_LABELS.forEach(({ key, label }) => {
      const file = candidate[key]
      if (!hasOnboardingFile(file)) return
      files.push(dashFileRow({
        id: `onboard-${key}`,
        title: label,
        meta: fileMetaLine({
          originalName: file.name || label,
          mimeType: file.mime,
          size: file.size,
          hint: 'Onboarding',
        }),
        section: 'employee',
        openPath: `${prefix}/${key}`,
        downloadName: file.name || `${key}`,
      }))
    })
  }

  return files
}

async function assertOrgMember(orgId, userId) {
  const member = await User.findById(userId)
    .select('_id email firstName lastName displayName organizationId role')
    .lean()
  if (!member) return null
  const org = String(orgId)
  const memberOrg = String(member.organizationId || member._id)
  if (memberOrg !== org && String(member._id) !== org) return null
  return member
}

// GET /api/pulse-files/mine — company + personal/onboarding files for current user
router.get('/mine', auth, async (req, res) => {
  try {
    const files = await collectMyFiles(req.user)
    res.json({ success: true, data: files })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load files' })
  }
})

// GET /api/pulse-files/admin/employees — org members for file picker
router.get('/admin/employees', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const organizationId = orgIdOf(req.user)
    const members = await User.find({
      $or: [{ organizationId }, { _id: organizationId }],
    })
      .select('_id email firstName lastName displayName role')
      .sort({ firstName: 1, email: 1 })
      .lean()

    res.json({
      success: true,
      data: members.map((m) => ({
        id: String(m._id),
        email: m.email,
        name: personName(m),
        role: m.role || 'member',
      })),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load employees' })
  }
})

async function findOrCreateStaffForMember(member, orgId) {
  const email = String(member.email || '').toLowerCase().trim()
  if (!email) return null
  let staff = await Staff.findOne({ email, user: orgId })
  if (staff) return staff
  staff = new Staff({
    user: orgId,
    email,
    fullName: personName(member),
    additionalDocuments: [],
  })
  await staff.save()
  return staff
}

// GET /api/pulse-files/admin/employee/:userId — that employee's personal/onboarding files
router.get('/admin/employee/:userId', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const orgId = orgIdOf(req.user)
    const member = await assertOrgMember(orgId, req.params.userId)
    if (!member) {
      return res.status(404).json({ success: false, message: 'Employee not found' })
    }
    const files = await collectEmployeeFiles(member, {
      openPathPrefix: `/pulse-files/admin/employee/${member._id}/onboarding`,
    })
    res.json({
      success: true,
      data: files,
      employee: {
        id: String(member._id),
        email: member.email,
        name: personName(member),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load employee files' })
  }
})

// POST /api/pulse-files/admin/employee/:userId — admin upload into that employee's My files
router.post('/admin/employee/:userId', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const orgId = orgIdOf(req.user)
    const member = await assertOrgMember(orgId, req.params.userId)
    if (!member) {
      return res.status(404).json({ success: false, message: 'Employee not found' })
    }

    const { data, originalName, title } = req.body || {}
    if (!data) {
      return res.status(400).json({ success: false, message: 'File data is required' })
    }
    const parsed = parseDataUrl(data)
    if (!parsed) {
      return res.status(400).json({ success: false, message: 'Invalid file format. Expected base64 data URL.' })
    }
    if (!ALLOWED_MIMES.includes(parsed.mimeType)) {
      return res.status(400).json({ success: false, message: 'File type not allowed' })
    }
    const byteSize = Buffer.byteLength(parsed.base64, 'base64')
    if (byteSize > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File must be under 10 MB' })
    }

    const staff = await findOrCreateStaffForMember(member, orgId)
    if (!staff) {
      return res.status(400).json({ success: false, message: 'Employee has no email — cannot attach files' })
    }

    let url = data
    try {
      url = await uploadBase64(data, `payroll_portal/employee_files/${orgId}/${staff._id}`, {
        resourceType: cloudinaryResourceType(parsed.mimeType),
      })
    } catch (uploadErr) {
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        return res.status(500).json({
          success: false,
          message: uploadErr.message || 'Cloudinary upload failed',
        })
      }
      // Keep data URL when Cloudinary is not configured
      url = data
    }

    const documentType = String(title || originalName || 'Document').trim() || 'Document'
    const ext = (String(originalName || '').split('.').pop() || parsed.mimeType.split('/')[1] || 'bin')
      .toLowerCase()
      .slice(0, 8)
    const fileName = `employee_${Date.now()}.${ext}`
    if (!staff.additionalDocuments) staff.additionalDocuments = []
    staff.additionalDocuments.push({
      documentType,
      fileName,
      originalName: originalName || fileName,
      url,
      uploadedAt: new Date(),
      notes: `Uploaded by ${personName(req.user)}`,
    })
    await staff.save()

    const saved = staff.additionalDocuments[staff.additionalDocuments.length - 1]
    await logActivity(
      req.user._id,
      'PULSE_EMPLOYEE_FILE_UPLOADED',
      `Uploaded ${documentType} for ${staff.fullName || member.email}`,
      { staffId: String(staff._id), userId: String(member._id) },
    )

    res.json({
      success: true,
      message: 'File uploaded to employee My files',
      data: {
        id: `extra-${saved._id}`,
        title: documentType,
        section: 'employee',
        url,
        canDelete: true,
        staffDocId: String(saved._id),
        meta: fileMetaLine({
          originalName: originalName || fileName,
          mimeType: parsed.mimeType,
          size: byteSize,
          hint: 'Employee file',
        }),
        downloadName: originalName || fileName,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Upload failed' })
  }
})

// DELETE /api/pulse-files/admin/employee/:userId/files/:docId
router.delete('/admin/employee/:userId/files/:docId', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const orgId = orgIdOf(req.user)
    const member = await assertOrgMember(orgId, req.params.userId)
    if (!member) {
      return res.status(404).json({ success: false, message: 'Employee not found' })
    }
    const staff = await linkedStaff(member)
    if (!staff) {
      return res.status(404).json({ success: false, message: 'No employee files found' })
    }
    const staffDoc = await Staff.findById(staff._id)
    if (!staffDoc) {
      return res.status(404).json({ success: false, message: 'No employee files found' })
    }
    const before = (staffDoc.additionalDocuments || []).length
    staffDoc.additionalDocuments = (staffDoc.additionalDocuments || []).filter(
      (doc) => String(doc._id) !== String(req.params.docId),
    )
    if (staffDoc.additionalDocuments.length === before) {
      return res.status(404).json({ success: false, message: 'File not found' })
    }
    await staffDoc.save()
    await logActivity(
      req.user._id,
      'PULSE_EMPLOYEE_FILE_DELETED',
      `Deleted employee file for ${staffDoc.fullName || member.email}`,
      { staffId: String(staffDoc._id), docId: String(req.params.docId) },
    )
    res.json({ success: true, message: 'File deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete file' })
  }
})

// GET /api/pulse-files/company — list company files (org members)
router.get('/company', auth, async (req, res) => {
  try {
    const docs = await PulseCompanyFile.find({ organizationId: toOrgObjectId(orgIdOf(req.user)) })
      .sort({ createdAt: -1 })
      .lean()
    res.json({
      success: true,
      data: docs.map(serializeCompanyFile),
      canManage: isPulseAdmin(req.user),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load company files' })
  }
})

// POST /api/pulse-files/company — admin/superadmin upload
router.post('/company', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Only admins can upload company files' })
    }

    const { data, originalName, title } = req.body || {}
    if (!data) {
      return res.status(400).json({ success: false, message: 'File data is required' })
    }

    const parsed = parseDataUrl(data)
    if (!parsed) {
      return res.status(400).json({ success: false, message: 'Invalid file format. Expected base64 data URL.' })
    }
    if (!ALLOWED_MIMES.includes(parsed.mimeType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Allowed: JPEG, PNG, WEBP, PDF, DOC, DOCX, TXT, XLS, XLSX',
      })
    }

    const byteSize = Buffer.byteLength(parsed.base64, 'base64')
    if (byteSize > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File size must be under 10MB.' })
    }

    const orgId = orgIdOf(req.user)
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(503).json({
        success: false,
        message: 'Cloudinary is not configured. Company files need a public URL for Drive-style viewing.',
      })
    }

    const safeName = String(originalName || 'company-file').trim() || 'company-file'
    const extFromName = safeName.includes('.') ? safeName.split('.').pop().toLowerCase() : ''
    const ext = extFromName || (parsed.mimeType === 'application/pdf'
      ? 'pdf'
      : (parsed.mimeType.includes('word') ? 'docx'
        : (parsed.mimeType.includes('sheet') || parsed.mimeType.includes('excel') ? 'xlsx'
          : (parsed.mimeType.includes('/') ? parsed.mimeType.split('/')[1] : 'bin'))))
    const resourceType = cloudinaryResourceType(parsed.mimeType)
    const publicId = `company_${Date.now()}${ext ? `.${ext}` : ''}`

    let url
    try {
      url = await uploadBase64(data, `payroll_portal/company_files/${orgId}`, {
        resourceType,
        publicId,
      })
    } catch (uploadErr) {
      return res.status(500).json({ success: false, message: `Upload failed: ${uploadErr.message}` })
    }

    const fileName = `company_${Date.now()}.${ext || 'bin'}`

    const doc = await PulseCompanyFile.create({
      organizationId: toOrgObjectId(orgId),
      title: String(title || '').trim() || safeName,
      fileName,
      originalName: safeName,
      mimeType: parsed.mimeType,
      size: byteSize,
      url,
      uploadedBy: req.user._id,
      uploadedByName: personName(req.user),
    })

    await logActivity(
      req.user._id,
      'COMPANY_FILE_UPLOADED',
      `Uploaded company file ${safeName}`,
      { fileId: String(doc._id) },
    )

    res.json({ success: true, message: 'File uploaded', data: serializeCompanyFile(doc) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to upload file' })
  }
})

// POST /api/pulse-files/company/:id/publish — move data: URL files to Cloudinary for Drive viewers
router.post('/company/:id/publish', auth, async (req, res) => {
  try {
    const orgId = toOrgObjectId(orgIdOf(req.user))
    const doc = await PulseCompanyFile.findOne({ _id: req.params.id, organizationId: orgId })
    if (!doc) {
      return res.status(404).json({ success: false, message: 'File not found' })
    }

    if (doc.url && /^https:\/\//i.test(doc.url)) {
      return res.json({ success: true, data: serializeCompanyFile(doc), alreadyPublic: true })
    }

    if (!doc.url || !String(doc.url).startsWith('data:')) {
      return res.status(400).json({ success: false, message: 'File has no publishable data' })
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(503).json({
        success: false,
        message: 'Cloudinary is not configured. Cannot open Drive-style viewer.',
      })
    }

    const parsed = parseDataUrl(doc.url)
    const mime = parsed?.mimeType || doc.mimeType || 'application/octet-stream'
    const safeName = doc.originalName || doc.fileName || 'file'
    const extFromName = safeName.includes('.') ? safeName.split('.').pop().toLowerCase() : ''
    const ext = extFromName || 'bin'
    const publicId = `company_${doc._id}_${Date.now()}.${ext}`

    const url = await uploadBase64(doc.url, `payroll_portal/company_files/${orgIdOf(req.user)}`, {
      resourceType: cloudinaryResourceType(mime),
      publicId,
    })

    doc.url = url
    if (!doc.mimeType) doc.mimeType = mime
    await doc.save()

    res.json({ success: true, data: serializeCompanyFile(doc), alreadyPublic: false })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to publish file' })
  }
})

// DELETE /api/pulse-files/company/:id
router.delete('/company/:id', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Only admins can delete company files' })
    }
    const doc = await PulseCompanyFile.findOneAndDelete({
      _id: req.params.id,
      organizationId: toOrgObjectId(orgIdOf(req.user)),
    })
    if (!doc) {
      return res.status(404).json({ success: false, message: 'File not found' })
    }
    await logActivity(
      req.user._id,
      'COMPANY_FILE_DELETED',
      `Deleted company file ${doc.originalName || doc.fileName}`,
      { fileId: String(doc._id) },
    )
    res.json({ success: true, message: 'File deleted' })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to delete file' })
  }
})

// GET /api/pulse-files/open/onboarding/:field — stream onboarding doc for current employee
router.get('/open/onboarding/:field', auth, async (req, res) => {
  try {
    const field = String(req.params.field || '')
    if (!ONBOARDING_DOC_LABELS.some((row) => row.key === field)) {
      return res.status(400).json({ success: false, message: 'Unknown document' })
    }
    const candidate = await linkedCandidate(req.user)
    const file = candidate?.[field]
    if (!hasOnboardingFile(file) || !file.data) {
      return res.status(404).json({ success: false, message: 'File not found' })
    }

    let buffer
    let mime = file.mime || 'application/octet-stream'
    const parsed = parseDataUrl(file.data)
    if (parsed) {
      mime = parsed.mimeType || mime
      buffer = Buffer.from(parsed.base64, 'base64')
    } else if (/^[A-Za-z0-9+/=]+$/.test(String(file.data).slice(0, 80))) {
      buffer = Buffer.from(file.data, 'base64')
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported file encoding' })
    }

    const downloadName = file.name || `${field}`
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `inline; filename="${downloadName.replace(/"/g, '')}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to open file' })
  }
})

// GET /api/pulse-files/admin/employee/:userId/onboarding/:field — admin stream for an employee
router.get('/admin/employee/:userId/onboarding/:field', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const field = String(req.params.field || '')
    if (!ONBOARDING_DOC_LABELS.some((row) => row.key === field)) {
      return res.status(400).json({ success: false, message: 'Unknown document' })
    }
    const member = await assertOrgMember(orgIdOf(req.user), req.params.userId)
    if (!member) {
      return res.status(404).json({ success: false, message: 'Employee not found' })
    }
    const candidate = await linkedCandidate(member)
    const file = candidate?.[field]
    if (!hasOnboardingFile(file) || !file.data) {
      return res.status(404).json({ success: false, message: 'File not found' })
    }

    let buffer
    let mime = file.mime || 'application/octet-stream'
    const parsed = parseDataUrl(file.data)
    if (parsed) {
      mime = parsed.mimeType || mime
      buffer = Buffer.from(parsed.base64, 'base64')
    } else if (/^[A-Za-z0-9+/=]+$/.test(String(file.data).slice(0, 80))) {
      buffer = Buffer.from(file.data, 'base64')
    } else {
      return res.status(400).json({ success: false, message: 'Unsupported file encoding' })
    }

    const downloadName = file.name || `${field}`
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `inline; filename="${downloadName.replace(/"/g, '')}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to open file' })
  }
})

module.exports = {
  router,
  collectMyFiles,
}
