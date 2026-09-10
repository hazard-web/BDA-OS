/** Pulse org role helpers (mirrors backend pulseAuth). */

export const PULSE_ROLES = ['superadmin', 'admin', 'member']

export function normalizePulseRole(role) {
  const value = String(role || '').trim().toLowerCase()
  if (value === 'superadmin' || value === 'super_admin' || value === 'super-admin') return 'superadmin'
  if (value === 'admin') return 'admin'
  if (value === 'member') return 'member'
  return null
}

export function effectiveRole(user) {
  if (!user) return null
  if (user.role == null || user.role === '') return 'admin'
  return normalizePulseRole(user.role) || 'member'
}

export function isPulseSuperAdmin(user) {
  return effectiveRole(user) === 'superadmin'
}

export function isPulseAdmin(user) {
  if (!user) return false
  const role = effectiveRole(user)
  return role === 'admin' || role === 'superadmin'
}

export function isPulseMember(user) {
  return effectiveRole(user) === 'member'
}

export function pulseRoleLabel(role) {
  const normalized = normalizePulseRole(role) || (role == null || role === '' ? 'admin' : null)
  if (normalized === 'superadmin') return 'Super Admin'
  if (normalized === 'admin') return 'Admin'
  if (normalized === 'member') return 'Member'
  return 'Member'
}

export function pulseRoleTagColor(role) {
  const normalized = normalizePulseRole(role) || (role == null || role === '' ? 'admin' : 'member')
  if (normalized === 'superadmin') return 'gold'
  if (normalized === 'admin') return 'green'
  return 'default'
}

/** Roles an admin/superadmin may assign when inviting or changing people. */
export function assignableRolesFor(user) {
  if (!isPulseAdmin(user)) return []
  return [
    { value: 'member', label: 'Member' },
    { value: 'admin', label: 'Admin' },
    { value: 'superadmin', label: 'Super Admin' },
  ]
}
