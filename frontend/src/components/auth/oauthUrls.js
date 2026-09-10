/** Build backend OAuth start URL for a Sign-in-using provider id */
export function oauthStartUrl(providerId) {
  const id = String(providerId || '')
    .toLowerCase()
    .replace(/\s+/g, '')
  const map = {
    google: 'google',
    facebook: 'facebook',
    linkedin: 'linkedin',
    x: 'x',
    twitter: 'x',
    apple: 'apple',
    microsoft: 'microsoft',
    github: 'github',
    gitlab: 'gitlab',
  }
  const key = map[id] || id
  const apiBase = import.meta.env.DEV
    ? ''
    : (import.meta.env.VITE_API_BASE_URL || 'https://people-os-api-uat.onrender.com').replace(/\/+$/, '')
  return `${apiBase}/api/auth/oauth/${key}`
}
