/**
 * Flowlu REST client (white-label portal or <name>.flowlu.com).
 * Env: FLOWLU_DOMAIN, FLOWLU_API_KEY, FLOWLU_AGILE_PROJECT_IDS, FLOWLU_PROJECT_IDS.
 */
const MIN_INTERVAL_MS = Number(process.env.FLOWLU_MIN_INTERVAL_MS) || 1000

let queue = Promise.resolve()
let lastRequestAt = 0

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function flowluBaseUrl() {
  const raw = String(process.env.FLOWLU_DOMAIN || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  return raw.includes('.') ? `https://${raw}` : `https://${raw}.flowlu.com`
}

function isFlowluConfigured() {
  return Boolean(flowluBaseUrl() && String(process.env.FLOWLU_API_KEY || '').trim())
}

function flowluIdList(envName) {
  return String(process.env[envName] || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
}

// Flowlu enforces a per-account requests-per-second cap, so calls are serialized.
function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastRequestAt = Date.now()
    return fn()
  })
  queue = run.catch(() => {})
  return run
}

function errorMessage(json, status) {
  const err = json?.error
  if (typeof err === 'string') return err
  return err?.error_msg || err?.message || `Flowlu request failed (${status})`
}

async function flowluRequest(path, { method = 'GET', query = {}, body } = {}, attempt = 0) {
  if (!isFlowluConfigured()) throw new Error('Flowlu is not configured (FLOWLU_DOMAIN / FLOWLU_API_KEY)')
  const url = new URL(`${flowluBaseUrl()}/api/v1/module/${path}`)
  url.searchParams.set('api_key', String(process.env.FLOWLU_API_KEY).trim())
  Object.entries(query).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value))
  })
  const form = body
    ? new URLSearchParams(Object.entries(body).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
    : undefined

  const res = await throttled(() => fetch(url, {
    method,
    headers: form ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
    body: form,
    signal: AbortSignal.timeout(20000),
  }))
  if (res.status === 429 && attempt < 3) {
    await sleep(2000 * (attempt + 1))
    return flowluRequest(path, { method, query, body }, attempt + 1)
  }
  const json = await res.json().catch(() => null)
  if (!res.ok || !json || json.error) throw new Error(errorMessage(json, res.status))
  return json.response
}

/** Every item of a paginated list endpoint; `filter` maps to filter[key]=value. */
async function flowluList(path, filter = {}) {
  const query = Object.fromEntries(Object.entries(filter).map(([key, value]) => [`filter[${key}]`, value]))
  const items = []
  for (let page = 1; page <= 200; page += 1) {
    // 100 is Flowlu's maximum page size; the default is 50
    const res = await flowluRequest(path, { query: { ...query, page, limit: 100 } })
    const batch = res?.items || []
    items.push(...batch)
    if (!batch.length || items.length >= Number(res?.total || 0)) break
  }
  return items
}

module.exports = {
  flowluBaseUrl,
  isFlowluConfigured,
  flowluIdList,
  flowluRequest,
  flowluList,
}
