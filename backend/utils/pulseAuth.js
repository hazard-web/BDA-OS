const {
  resolveCompanyDomain,
  allowedEmailDomain,
  assertAllowedCompanyEmail,
} = require('./companyDomain')
const { listActiveGrantsForEmail } = require('./appCatalog')

/**
 * Pulse org roles — invite-only workspace.
 * superadmin ≥ admin ≥ member
 */
const PULSE_ROLES = ['superadmin', 'admin', 'member']

function orgIdOf(user) {
  if (!user) return null
  if (user.organizationId) return String(user.organizationId)
  return user._id ? String(user._id) : null
}

function normalizePulseRole(role) {
  const value = String(role || '').trim().toLowerCase()
  if (value === 'superadmin' || value === 'super_admin' || value === 'super-admin') return 'superadmin'
  if (value === 'admin') return 'admin'
  if (value === 'member') return 'member'
  return null
}

function effectiveRole(user) {
  if (!user) return null
  if (user.role == null || user.role === '') return 'admin'
  return normalizePulseRole(user.role) || 'member'
}

function isPulseSuperAdmin(user) {
  return effectiveRole(user) === 'superadmin'
}

function isPulseAdmin(user) {
  if (!user) return false
  const role = effectiveRole(user)
  return role === 'admin' || role === 'superadmin'
}

function isPulseMember(user) {
  return effectiveRole(user) === 'member'
}

function pulseRoleLabel(role) {
  const normalized = normalizePulseRole(role) || (role == null || role === '' ? 'admin' : null)
  if (normalized === 'superadmin') return 'Super Admin'
  if (normalized === 'admin') return 'Admin'
  if (normalized === 'member') return 'Member'
  return 'Member'
}

/** Roles the actor may assign when inviting or changing people. */
function assignableRolesFor(actor) {
  if (!isPulseAdmin(actor)) return []
  return ['member', 'admin', 'superadmin']
}

function canAssignRole(actor, role) {
  const next = normalizePulseRole(role)
  if (!next) return false
  return assignableRolesFor(actor).includes(next)
}

function isOrgOwner(user, organizationId) {
  if (!user?._id || !organizationId) return false
  return String(user._id) === String(organizationId)
}

async function orgCompanyDomain() {
  return allowedEmailDomain()
}

async function assertMemberCompanyDomain(user) {
  return assertAllowedCompanyEmail(user?.email)
}

function publicUserFields(user) {
  if (!user) return null
  const plain = user.toObject ? user.toObject() : user
  return {
    _id: plain._id,
    email: plain.email,
    companyName: plain.companyName,
    companyEmail: plain.companyEmail || '',
    companyDomain: resolveCompanyDomain(),
    firstName: plain.firstName || '',
    lastName: plain.lastName || '',
    displayName: plain.displayName || '',
    avatarUrl: plain.avatarUrl || '',
    role: plain.role || 'admin',
    organizationId: plain.organizationId || plain._id,
    onboardingCompleted: plain.onboardingCompleted !== false,
    pulseSetupCompleted: plain.pulseSetupCompleted === true,
    pulsePortalId: plain.pulsePortalId || '',
    pulseEmployeeCount: plain.pulseEmployeeCount || '',
    industry: plain.industry || '',
  }
}

async function publicUserWithApps(user) {
  const fields = publicUserFields(user)
  if (!fields) return null
  const assignedApps = await listActiveGrantsForEmail(fields.email)
  return {
    ...fields,
    assignedApps,
    assignedAppCount: assignedApps.length,
  }
}

module.exports = {
  PULSE_ROLES,
  orgIdOf,
  normalizePulseRole,
  effectiveRole,
  isPulseSuperAdmin,
  isPulseAdmin,
  isPulseMember,
  pulseRoleLabel,
  assignableRolesFor,
  canAssignRole,
  isOrgOwner,
  orgCompanyDomain,
  assertMemberCompanyDomain,
  publicUserFields,
  publicUserWithApps,
}
