const { uploadBase64 } = require('./cloudinary')

function isHttpsAvatar(value) {
  const url = String(value || '').trim()
  return /^https?:\/\//i.test(url) && url.length <= 2048
}

function isDataAvatar(value) {
  const raw = String(value || '').trim()
  return raw.startsWith('data:image/')
}

function toAvatarDataUrl(raw, mime = 'image/jpeg') {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (value.startsWith('data:image/')) return value
  if (value.startsWith('data:')) return ''
  // Raw base64 from Candidate.photo.data
  if (value.length > 350_000) return ''
  if (!/^[A-Za-z0-9+/=\s]+$/.test(value) || value.length < 80) return ''
  return `data:${mime || 'image/jpeg'};base64,${value.replace(/\s/g, '')}`
}

/**
 * Normalize any avatar input to a short HTTPS CDN URL.
 * - HTTPS → keep
 * - data:/raw base64 → Cloudinary upload
 * - failure → '' (never persist fat data URLs on User)
 */
async function ensureHttpsAvatar(raw, opts = {}) {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (isHttpsAvatar(value)) return value

  const dataUrl = isDataAvatar(value)
    ? value
    : toAvatarDataUrl(value, opts.mime || 'image/jpeg')
  if (!dataUrl) return ''

  try {
    return await uploadBase64(dataUrl, opts.folder || 'payroll_portal/avatars', {
      resourceType: 'image',
      publicId: opts.publicId || undefined,
    })
  } catch (err) {
    console.error('Avatar Cloudinary upload failed:', err?.message || err)
    return ''
  }
}

module.exports = {
  isHttpsAvatar,
  isDataAvatar,
  toAvatarDataUrl,
  ensureHttpsAvatar,
}
