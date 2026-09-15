const cloudinary = require('cloudinary').v2

function env(name) {
  return String(process.env[name] || '').trim().replace(/^['"]|['"]$/g, '')
}

function configureCloudinary() {
  const cloud_name = env('CLOUDINARY_CLOUD_NAME')
  const api_key = env('CLOUDINARY_API_KEY')
  const api_secret = env('CLOUDINARY_API_SECRET')
  if (!cloud_name || !api_key || !api_secret) return false
  cloudinary.config({
    cloud_name,
    api_key,
    api_secret,
    secure: true,
  })
  return true
}

const configured = configureCloudinary()

/**
 * Uploads a base64 Data URL to Cloudinary.
 * @param {string} base64Str - data URL (e.g. data:application/pdf;base64,...)
 * @param {string} folder - Cloudinary folder
 * @param {{ resourceType?: string, publicId?: string }} [opts]
 * @returns {Promise<string>} secure HTTPS URL
 */
async function uploadBase64(base64Str, folder = 'payroll_portal', opts = {}) {
  if (!configured && !configureCloudinary()) {
    throw new Error('Cloudinary environment variables are not configured in .env')
  }
  try {
    const uploadOpts = {
      folder,
      resource_type: opts.resourceType || 'auto',
    }
    if (opts.publicId) uploadOpts.public_id = opts.publicId

    const result = await cloudinary.uploader.upload(base64Str, uploadOpts)
    return result.secure_url
  } catch (error) {
    const detail = String(
      error?.error?.message || error?.message || error || 'Cloudinary upload failed',
    )
    if (/invalid signature/i.test(detail)) {
      throw new Error(
        'Cloudinary Invalid Signature — check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET (matching pair, no quotes/spaces).',
      )
    }
    if (/403|missing permissions|actions=\["create"\]/i.test(detail)) {
      throw new Error(
        'Cloudinary 403 — this API key cannot upload (missing “create” permission). In Cloudinary → Settings → API Keys, edit the production key and enable Upload / Create, or use a full-access key.',
      )
    }
    throw new Error(detail)
  }
}

function cloudinaryResourceType(mimeType = '') {
  const mime = String(mimeType).toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  // PDF + Office docs must be raw so Drive/Office Online can fetch them
  return 'raw'
}

module.exports = {
  cloudinary,
  uploadBase64,
  cloudinaryResourceType,
}
