/**
 * Upload fat data: User.avatarUrl values to Cloudinary and replace with HTTPS URLs.
 * Also fills empty User.avatarUrl from Candidate onboarding photos when possible.
 *
 * Usage:
 *   MONGODB_URI='...' node backend/scripts/backfillAvatarUrlsToCloudinary.js
 *   MONGODB_URI='...' node backend/scripts/backfillAvatarUrlsToCloudinary.js --dry-run
 *   MONGODB_URI='...' node backend/scripts/backfillAvatarUrlsToCloudinary.js --limit=50
 */
require('dotenv').config()
const path = require('path')
// Prefer repo-root .env when script is run from backend/
require('dotenv').config({ path: path.join(__dirname, '../../.env') })

const mongoose = require('mongoose')
const User = require('../models/User')
const Candidate = require('../models/Candidate')
const Staff = require('../models/Staff')
const { ensureHttpsAvatar, isHttpsAvatar, isDataAvatar } = require('../utils/pulseAvatar')

const DRY = process.argv.includes('--dry-run')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : 0

async function candidatePhotoForEmail(email) {
  const key = String(email || '').toLowerCase().trim()
  if (!key) return null
  const row = await Candidate.findOne({
    $or: [{ email: key }, { officialEmail: key }],
    'photo.data': { $exists: true, $nin: [null, ''] },
  })
    .select('photo organizationId')
    .lean()
  if (!row?.photo?.data) return null
  return {
    data: row.photo.data,
    mime: row.photo.mime || 'image/jpeg',
    organizationId: row.organizationId,
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!uri) {
    console.error('MONGODB_URI is required')
    process.exit(1)
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME && !DRY) {
    console.error('CLOUDINARY_CLOUD_NAME / API keys are required (or use --dry-run)')
    process.exit(1)
  }

  await mongoose.connect(uri)
  console.log('Connected', DRY ? '(dry-run)' : '')

  const filter = {
    $or: [
      { avatarUrl: { $regex: '^data:image/' } },
      { avatarUrl: { $exists: false } },
      { avatarUrl: null },
      { avatarUrl: '' },
    ],
  }

  let query = User.find(filter).select('_id email avatarUrl organizationId')
  if (LIMIT) query = query.limit(LIMIT)
  const users = await query.lean()
  console.log(`Candidates to process: ${users.length}`)

  let updated = 0
  let skipped = 0
  let failed = 0

  for (const user of users) {
    const email = String(user.email || '').toLowerCase()
    const current = String(user.avatarUrl || '').trim()

    if (isHttpsAvatar(current)) {
      skipped += 1
      continue
    }

    let source = current
    let mime = 'image/jpeg'
    let alreadyHttps = ''

    if (!isDataAvatar(current)) {
      const staff = await Staff.findOne({ email })
        .select('documents.profileImage.url')
        .lean()
      const staffUrl = String(staff?.documents?.profileImage?.url || '').trim()
      if (isHttpsAvatar(staffUrl)) {
        alreadyHttps = staffUrl
      } else {
        const fromCandidate = await candidatePhotoForEmail(email)
        if (!fromCandidate) {
          skipped += 1
          continue
        }
        source = fromCandidate.data
        mime = fromCandidate.mime
      }
    }

    if (alreadyHttps) {
      if (DRY) {
        console.log(`[dry] would set ${email} from staff profileImage`)
        updated += 1
        continue
      }
      await User.updateOne({ _id: user._id }, { $set: { avatarUrl: alreadyHttps } })
      updated += 1
      console.log(`ok ${email} ← staff ${alreadyHttps.slice(0, 64)}…`)
      continue
    }

    if (DRY) {
      console.log(`[dry] would upload ${email} (${isDataAvatar(current) ? 'user-data' : 'candidate'})`)
      updated += 1
      continue
    }

    const https = await ensureHttpsAvatar(source, {
      mime,
      folder: 'payroll_portal/avatars',
      publicId: `user_${String(user._id)}`,
    })
    if (!https) {
      console.warn(`fail ${email}`)
      failed += 1
      continue
    }

    await User.updateOne({ _id: user._id }, { $set: { avatarUrl: https } })
    updated += 1
    console.log(`ok ${email} → ${https.slice(0, 72)}…`)
  }

  console.log(JSON.stringify({ updated, skipped, failed, dry: DRY }, null, 2))
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
