import axios from 'axios'

const API_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || 'https://people-os-api-uat.onrender.com').replace(/\/+$/, '')

// Default timeout for normal API calls. Heavy endpoints (PDF generation,
// payslip emails, portal provisioning with SMTP) need more headroom -
// those callers override `timeout` per-request.
const DEFAULT_TIMEOUT_MS = 30000

// Endpoints known to take longer (PDF generation, SMTP-bound flows,
// document uploads). These get a longer timeout to avoid spurious
// "timeout of 30000ms exceeded" errors during legitimate work.
const SLOW_ENDPOINT_PATTERNS = [
  /\/payslips\/[^/]+\/download/,         // PDF payslip download (admin)
  /\/portal\/payslips\/[^/]+\/download/, // PDF payslip download (staff portal)
  /\/payslips\/generate/,
  /\/staff\/[^/]+\/provision-portal/,    // SMTP onboarding email
  /\/staff\/[^/]+\/documents/,           // base64 document upload
  /\/candidates/,                        // candidate photo / offer letter uploads
  /\/portal\/me\/documents\//,           // base64 document upload
  /\/portal\/login/,                     // bcrypt + Atlas cold-start can be slow
]

const api = axios.create({
  baseURL: API_BASE ? `${API_BASE}/api` : '/api',
  timeout: DEFAULT_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const url = config.url || ''
  const isStaffRoute =
    url.startsWith('/portal/') ||
    url.startsWith('/assigned-tasks/staff') ||
    (url.startsWith('/attendance/') && !url.startsWith('/attendance/admin/')) ||
    (url.startsWith('/leaves/') && !url.startsWith('/leaves/admin/'))

  // For payslip download: use staffToken only when explicitly on a portal
  // route (i.e. the staff portal UI triggered this download). For admin
  // payslip downloads the admin token must be used, otherwise the backend
  // receives a staff-audience JWT, looks up by employeeId, and returns 404.
  const token = isStaffRoute
    ? localStorage.getItem('staffToken') || localStorage.getItem('token')
    : localStorage.getItem('token') || localStorage.getItem('staffToken')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Auto-bump timeout for known-slow endpoints when the caller hasn't
  // already set an explicit timeout.
  if (!config.timeout || config.timeout === DEFAULT_TIMEOUT_MS) {
    if (SLOW_ENDPOINT_PATTERNS.some((re) => re.test(url))) {
      config.timeout = 90000 // 90s - PDF gen + SMTP worst case
    }
  }

  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!err.message) {
      err.message = 'Something went wrong. Please try again.'
    }
    const code = err.response?.data?.code
    if (code === 'COMPANY_DOMAIN_REQUIRED' && typeof window !== 'undefined') {
      localStorage.removeItem('token')
    }
    return Promise.reject(err)
  }
)

api.invalidateCache = () => {}

export default api
