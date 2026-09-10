/**
 * Rebuild missing Candidate rows for an org from User members (+ optional invites).
 * Usage:
 *   MONGODB_URI='...' node backend/scripts/restoreCandidatesFromUsers.js [organizationId]
 */
require('dotenv').config()
const mongoose = require('mongoose')
const Candidate = require('../models/Candidate')
const User = require('../models/User')

const ORG_ID = process.argv[2] || '6aa258473557e26f4ad1131c'

function cleanGender(value) {
  const g = String(value || '').trim()
  if (g === 'Male' || g === 'Female' || g === 'Other') return g
  return ''
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI is required')
    process.exit(1)
  }

  await mongoose.connect(uri)
  const orgId = new mongoose.Types.ObjectId(ORG_ID)

  const owner = await User.findById(orgId).lean()
  if (!owner) {
    console.error('Org owner user not found:', ORG_ID)
    process.exit(1)
  }

  const existing = await Candidate.countDocuments({ organizationId: orgId })
  console.log('Existing candidates:', existing)

  const members = await User.find({
    $or: [{ organizationId: orgId }, { _id: orgId }],
    email: { $ne: owner.email },
  }).lean()

  console.log('Org members (excluding owner):', members.length)

  let created = 0
  let skipped = 0

  for (const member of members) {
    const workEmail = String(member.email || '').toLowerCase()
    if (!workEmail) continue

    const already = await Candidate.findOne({
      organizationId: orgId,
      $or: [{ officialEmail: workEmail }, { email: workEmail }],
    }).lean()

    if (already) {
      skipped += 1
      continue
    }

    const count = await Candidate.countDocuments({ organizationId: orgId })
    const candidateId = `C-${String(count + 1).padStart(4, '0')}`

    await Candidate.create({
      organizationId: orgId,
      candidateId,
      status: 'Joined',
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      email: workEmail,
      officialEmail: workEmail,
      phone: String(member.companyPhone || '').replace(/^\+91/, '') || '',
      countryCode: '+91',
      gender: cleanGender(member.gender),
      addedBy: owner._id,
      addedByName: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email,
      modifiedBy: owner._id,
      modifiedByName: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || owner.email,
      pulseInviteSentAt: member.createdAt || new Date(),
      employeeSubmittedAt: member.onboardingCompleted ? member.createdAt || new Date() : undefined,
    })
    created += 1
    console.log('Created candidate for', workEmail)
  }

  const after = await Candidate.countDocuments({ organizationId: orgId })
  console.log(JSON.stringify({ created, skipped, candidatesAfter: after }, null, 2))
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error(err)
  try {
    await mongoose.disconnect()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
