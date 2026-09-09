export const COMPANY_EMAIL_DOMAIN = 'bda.co.in'

/** `shivam` or `shivam@` → `shivam@bda.co.in`. Full addresses stay as typed. */
export function normalizeCompanyEmail(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  if (!raw) return ''
  const at = raw.indexOf('@')
  if (at === -1) return `${raw}@${COMPANY_EMAIL_DOMAIN}`
  const local = raw.slice(0, at)
  const domain = raw.slice(at + 1)
  if (!local) return ''
  if (!domain) return `${local}@${COMPANY_EMAIL_DOMAIN}`
  return `${local}@${domain}`
}

export function isCompanyEmail(email) {
  const domain = normalizeCompanyEmail(email).split('@')[1]
  return domain === COMPANY_EMAIL_DOMAIN
}

export function companyEmailRequiredMessage() {
  return `This workspace is invite-only for @${COMPANY_EMAIL_DOMAIN} accounts. Personal email cannot sign in.`
}
