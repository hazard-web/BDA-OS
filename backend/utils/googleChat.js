/**
 * Google Chat app client (app authentication with a service account) and request verification.
 * Env: GOOGLE_CHAT_SA_JSON (key JSON) or GOOGLE_CHAT_SA_EMAIL + GOOGLE_CHAT_SA_PRIVATE_KEY,
 * GOOGLE_CHAT_PROJECT_NUMBER (classic app audience), and for a Workspace add-on Chat app:
 * GOOGLE_CHAT_ADDON=true + GOOGLE_CHAT_ENDPOINT_URL (defaults to BACKEND_URL/api/chat-bot/events).
 */
const crypto = require('crypto')
const jwt = require('jsonwebtoken')

const CHAT_API = 'https://chat.googleapis.com/v1'
const CHAT_ISSUER = 'chat@system.gserviceaccount.com'
const CERTS_URL = `https://www.googleapis.com/service_accounts/v1/metadata/x509/${CHAT_ISSUER}`
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs'
const ADDON_SA_SUFFIX = '@gcp-sa-gsuiteaddons.iam.gserviceaccount.com'

let serviceAccount = null
let accessToken = { value: '', expiresAt: 0 }
const certCache = new Map()

/**
 * Rebuild a PEM private key however the hosting dashboard stored it: quoted, with literal or
 * double-escaped "\n", or with line breaks collapsed into spaces.
 */
function normalizePrivateKey(raw) {
  const text = String(raw || '').trim().replace(/^['"]|['"]$/g, '').replace(/(\\+r)?\\+n/g, '\n')
  const match = text.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/)
  if (!match) throw new Error('GOOGLE_CHAT_SA_PRIVATE_KEY is not a PEM private key (missing BEGIN/END lines)')
  const body = match[2].replace(/[^A-Za-z0-9+/=]/g, '')
  const pem = `-----BEGIN ${match[1]}-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END ${match[1]}-----\n`
  crypto.createPrivateKey(pem)
  return pem
}

function chatServiceAccount() {
  if (serviceAccount) return serviceAccount
  const email = String(process.env.GOOGLE_CHAT_SA_EMAIL || '').trim()
  const key = String(process.env.GOOGLE_CHAT_SA_PRIVATE_KEY || '').trim()
  if (email && key) {
    serviceAccount = { client_email: email, private_key: normalizePrivateKey(key) }
    return serviceAccount
  }
  const raw = String(process.env.GOOGLE_CHAT_SA_JSON || '').trim()
  if (!raw) return null
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  const parsed = JSON.parse(json)
  serviceAccount = { ...parsed, private_key: normalizePrivateKey(parsed.private_key) }
  return serviceAccount
}

/** Why Google Chat can't be used on this server, or '' when it can. */
function chatConfigError() {
  try {
    const sa = chatServiceAccount()
    if (!sa?.client_email || !sa?.private_key) {
      return 'set GOOGLE_CHAT_SA_EMAIL + GOOGLE_CHAT_SA_PRIVATE_KEY on this server'
    }
    return ''
  } catch (err) {
    return err.message
  }
}

function isChatConfigured() {
  return !chatConfigError()
}

async function chatAccessToken() {
  if (accessToken.value && Date.now() < accessToken.expiresAt - 60_000) return accessToken.value
  const sa = chatServiceAccount()
  if (!sa) throw new Error('Google Chat is not configured (set GOOGLE_CHAT_SA_EMAIL + GOOGLE_CHAT_SA_PRIVATE_KEY on this server)')
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
  if (!cert) return { error: 'token is not signed by a current Google key' }
  try {
    return { claims: jwt.verify(token, cert, { algorithms: ['RS256'], ...options }) }
  } catch (err) {
    const got = decoded?.payload || {}
    return { error: `${err.message} (token aud=${got.aud}, iss=${got.iss})` }
  }
}

/**
 * Verify the bearer token Google attaches to Chat events. Returns { ok, reason }.
 * Classic app: signed by chat@system, audience = project number.
 * Workspace add-on: Google ID token for this project's add-ons service account; the audience is the
 * endpoint URL or the project number, depending on the Chat app's "Authentication audience" setting.
 * GOOGLE_CHAT_VERIFY=false skips it for local simulation, never in production.
 */
async function verifyChatRequest(req) {
  if (process.env.GOOGLE_CHAT_VERIFY === 'false' && process.env.NODE_ENV !== 'production') return { ok: true, reason: '' }
  const header = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  // Add-on events also carry the same Google ID token in the body
  const token = header || String(req.body?.authorizationEventObject?.systemIdToken || '')
  if (!token) return { ok: false, reason: 'no Google ID token on the request' }
  const project = String(process.env.GOOGLE_CHAT_PROJECT_NUMBER || '').trim()
  if (req.body?.chat || req.body?.commonEventObject) {
    const endpoint = chatEndpointUrl()
    const variants = endpoint ? [endpoint, endpoint.replace('://www.', '://'), endpoint.replace('://', '://www.')] : []
    const audience = [...new Set(variants.flatMap((url) => [url, `${url}/`]))].concat(project ? [project] : [])
    if (!audience.length) return { ok: false, reason: 'set GOOGLE_CHAT_ENDPOINT_URL or GOOGLE_CHAT_PROJECT_NUMBER' }
    const { claims, error } = await verifyWith(token, GOOGLE_CERTS_URL, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience,
    })
    if (error) return { ok: false, reason: error }
    const email = String(claims.email || '')
    if (!claims.email_verified || !email.endsWith(ADDON_SA_SUFFIX) || (project && !email.includes(project))) {
      return { ok: false, reason: `token is for ${email || 'no email'}, not this project's add-ons service account` }
    }
    return { ok: true, reason: '' }
  }
  if (!project) return { ok: false, reason: 'set GOOGLE_CHAT_PROJECT_NUMBER' }
  const { error } = await verifyWith(token, CERTS_URL, { issuer: CHAT_ISSUER, audience: project })
  return error ? { ok: false, reason: error } : { ok: true, reason: '' }
}

module.exports = {
  isChatConfigured,
  chatConfigError,
  isAddonMode,
  chatEndpointUrl,
  sendChatMessage,
  updateChatMessage,
  verifyChatRequest,
}
