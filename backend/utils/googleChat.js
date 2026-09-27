/**
 * Google Chat app client (app authentication with a service account) and request verification.
 * Env: GOOGLE_CHAT_SA_JSON (key JSON) or GOOGLE_CHAT_SA_EMAIL + GOOGLE_CHAT_SA_PRIVATE_KEY,
 * GOOGLE_CHAT_PROJECT_NUMBER (classic app audience), and for a Workspace add-on Chat app:
 * GOOGLE_CHAT_ADDON=true + GOOGLE_CHAT_ENDPOINT_URL (defaults to BACKEND_URL/api/chat-bot/events).
 */
const jwt = require('jsonwebtoken')

const CHAT_API = 'https://chat.googleapis.com/v1'
const CHAT_ISSUER = 'chat@system.gserviceaccount.com'
const CERTS_URL = `https://www.googleapis.com/service_accounts/v1/metadata/x509/${CHAT_ISSUER}`
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs'
const ADDON_SA_SUFFIX = '@gcp-sa-gsuiteaddons.iam.gserviceaccount.com'

let serviceAccount = null
let accessToken = { value: '', expiresAt: 0 }
const certCache = new Map()

function chatServiceAccount() {
  if (serviceAccount) return serviceAccount
  const email = String(process.env.GOOGLE_CHAT_SA_EMAIL || '').trim()
  const key = String(process.env.GOOGLE_CHAT_SA_PRIVATE_KEY || '').trim()
  if (email && key) {
    // Env files and hosting dashboards usually store the PEM with literal "\n"
    serviceAccount = { client_email: email, private_key: key.replace(/^"|"$/g, '').replace(/\\n/g, '\n') }
    return serviceAccount
  }
  const raw = String(process.env.GOOGLE_CHAT_SA_JSON || '').trim()
  if (!raw) return null
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  serviceAccount = JSON.parse(json)
  return serviceAccount
}

function isChatConfigured() {
  try {
    const sa = chatServiceAccount()
    return Boolean(sa?.client_email && sa?.private_key)
  } catch {
    return false
  }
}

async function chatAccessToken() {
  if (accessToken.value && Date.now() < accessToken.expiresAt - 60_000) return accessToken.value
  const sa = chatServiceAccount()
  if (!sa) throw new Error('Google Chat is not configured (GOOGLE_CHAT_SA_JSON)')
  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign(
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/chat.bot',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
    { algorithm: 'RS256' },
  )
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.access_token) throw new Error(json.error_description || 'Google Chat token request failed')
  accessToken = { value: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000 }
  return accessToken.value
}

async function chatRequest(method, path, body) {
  const res = await fetch(`${CHAT_API}/${path}`, {
    method,
    headers: {
      authorization: `Bearer ${await chatAccessToken()}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error?.message || `Google Chat request failed (${res.status})`)
  return json
}

async function sendChatMessage(space, message) {
  const res = await chatRequest('POST', `${space}/messages`, message)
  return res.name || ''
}

async function updateChatMessage(name, message) {
  return chatRequest('PATCH', `${name}?updateMask=text,cardsV2`, message)
}

async function signingCerts(url) {
  const cached = certCache.get(url)
  if (cached && Date.now() < cached.expiresAt) return cached.keys
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not load Google signing certs')
  const keys = await res.json()
  certCache.set(url, { keys, expiresAt: Date.now() + 60 * 60 * 1000 })
  return keys
}

function isAddonMode() {
  return process.env.GOOGLE_CHAT_ADDON === 'true'
}

function chatEndpointUrl() {
  const explicit = String(process.env.GOOGLE_CHAT_ENDPOINT_URL || '').trim()
  if (explicit) return explicit
  const backend = String(process.env.BACKEND_URL || '').trim().replace(/\/+$/, '')
  return backend ? `${backend}/api/chat-bot/events` : ''
}

async function verifyWith(token, certsUrl, options) {
  const decoded = jwt.decode(token, { complete: true })
  const cert = (await signingCerts(certsUrl))[decoded?.header?.kid]
  if (!cert) return null
  try {
    return jwt.verify(token, cert, { algorithms: ['RS256'], ...options })
  } catch {
    return null
  }
}

/**
 * Verify the bearer token Google attaches to Chat events.
 * Classic app: signed by chat@system, audience = project number.
 * Workspace add-on: Google ID token for the add-ons service account, audience = endpoint URL.
 * GOOGLE_CHAT_VERIFY=false skips it for local simulation, never in production.
 */
async function verifyChatRequest(req) {
  if (process.env.GOOGLE_CHAT_VERIFY === 'false' && process.env.NODE_ENV !== 'production') return true
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  if (req.body?.chat || req.body?.commonEventObject) {
    const audience = chatEndpointUrl()
    if (!audience) return false
    const claims = await verifyWith(token, GOOGLE_CERTS_URL, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    })
    const email = String(claims?.email || '')
    const project = String(process.env.GOOGLE_CHAT_PROJECT_NUMBER || '').trim()
    return Boolean(claims?.email_verified && email.endsWith(ADDON_SA_SUFFIX) && (!project || email.includes(project)))
  }
  const audience = String(process.env.GOOGLE_CHAT_PROJECT_NUMBER || '').trim()
  if (!audience) return false
  return Boolean(await verifyWith(token, CERTS_URL, { issuer: CHAT_ISSUER, audience }))
}

module.exports = {
  isChatConfigured,
  isAddonMode,
  chatEndpointUrl,
  sendChatMessage,
  updateChatMessage,
  verifyChatRequest,
}
