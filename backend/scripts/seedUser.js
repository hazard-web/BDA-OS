/**
 * Create a verified BDA OS user in an existing org (same shape as an accepted invite).
 * Usage:
 *   node scripts/seedUser.js [email] [member|admin] [organizationId]
 *   SEED_PASSWORD='...' node scripts/seedUser.js sahil@bda.co.in admin
 * Defaults: email sahil@bda.co.in, role admin, org = the only org in the DB.
 * On an empty DB (fresh prod) the user becomes the org owner, like /api/auth/register.
 */
require('dotenv').config()
const crypto = require('crypto')
const mongoose = require('mongoose')
const User = require('../models/User')
const { normalizePulseRole } = require('../utils/pulseAuth')
const { assertAllowedCompanyEmail, resolveCompanyDomain } = require('../utils/companyDomain')
const { DEFAULT_GENDER } = require('../utils/indiaLocation')

const email = String(process.argv[2] || 'sahil@bda.co.in').trim().toLowerCase()
const role = normalizePulseRole(process.argv[3] || 'admin')
const orgArg = process.argv[4]

async function findOrgOwner() {
  if (orgArg) return User.findById(orgArg).lean()
  const owners = await User.find({ $expr: { $eq: ['$_id', '$organizationId'] } }).lean()
  if (owners.length > 1) {
    throw new Error(`Multiple orgs found; pass one: ${owners.map((o) => `${o._id} (${o.email})`).join(', ')}`)
  }
  return owners[0] || null
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required')
  if (!role) throw new Error('Role must be member or admin')

  const domainCheck = assertAllowedCompanyEmail(email)
  if (!domainCheck.ok) throw new Error(domainCheck.message)

  await mongoose.connect(process.env.MONGODB_URI)
  console.log('Database:', mongoose.connection.name)

  if (await User.exists({ email })) {
    console.log(`User ${email} already exists — nothing to do.`)
    return
  }

  const password = process.env.SEED_PASSWORD || crypto.randomBytes(9).toString('base64url')
  const [firstName = '', lastName = ''] = email.split('@')[0].split(/[._-]/).map((p) => p && p[0].toUpperCase() + p.slice(1))

  const admin = await findOrgOwner()
  if (!admin) {
    if (await User.exists({})) throw new Error('Users exist but no org owner was found; pass an organizationId.')
    const owner = new User({
      email,
      password,
      firstName,
      lastName,
      role: 'admin',
      companyEmail: email,
      companyDomain: resolveCompanyDomain(),
      companyName: '',
      companyAddress: '',
      companyCIN: '',
      companyGST: '',
      companyWebsite: '',
      companyLogo: '',
      gender: DEFAULT_GENDER,
      country: 'India',
      isVerified: true,
      onboardingCompleted: false,
      pulseSetupCompleted: false,
    })
    owner.organizationId = owner._id
    await owner.save()
    console.log(`Created org owner (admin) ${owner.email} (${owner._id}) — finish company setup after first sign-in`)
    if (!process.env.SEED_PASSWORD) console.log('Password:', password)
    return
  }

  const user = await User.create({
    email,
    password,
    firstName,
    lastName,
    role,
    organizationId: admin._id,
    companyName: admin.companyName || '',
    companyAddress: admin.companyAddress || '',
    companyPhone: admin.companyPhone || '',
    companyEmail: admin.companyEmail || email,
    companyDomain: resolveCompanyDomain(),
    companyCIN: admin.companyCIN || '',
    companyGST: admin.companyGST || '',
    companyWebsite: admin.companyWebsite || '',
    companyLogo: admin.companyLogo || '',
    industry: admin.industry || '',
    gender: DEFAULT_GENDER,
    country: 'India',
    isVerified: true,
    onboardingCompleted: true,
    pulseSetupCompleted: true,
    pulsePortalId: '',
  })

  console.log(`Created ${role} ${user.email} (${user._id}) in org ${admin._id} (${admin.email})`)
  if (!process.env.SEED_PASSWORD) console.log('Password:', password)
}

main()
  .catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
