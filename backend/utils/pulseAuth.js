const {
  resolveCompanyDomain,
  allowedEmailDomain,
  assertAllowedCompanyEmail,
} = require('./companyDomain')
const { listActiveGrantsForEmail } = require('./appCatalog')

/**
 * Pulse org roles — invite-only workspace.
 */
function orgIdOf(user) {
  if (!user) return null
  if (user.organizationId) return String(user.organizationId)
  return user._id ? String(user._id) : null
}

function isPulseAdmin(user) {
  if (!user) return false
  // Legacy accounts (no role) are admins of their own workspace
  if (user.role == null || user.role === '') return true
  return user.role === 'admin'
}

function isPulseMember(user) {
  return !!user && user.role === 'member'
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
  orgIdOf,
  isPulseAdmin,
  isPulseMember,
  orgCompanyDomain,
  assertMemberCompanyDomain,
  publicUserFields,
  publicUserWithApps,
}
