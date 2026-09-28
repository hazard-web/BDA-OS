/** Pulse org role helpers (mirrors backend pulseAuth). */

export const PULSE_ROLES = ['admin', 'member']

export function normalizePulseRole(role) {
  const value = String(role || '').trim().toLowerCase()
  if (value === 'admin') return 'admin'
  if (value === 'member') return 'member'
  return null
}

export function effectiveRole(user) {
  if (!user) return null
  if (user.role == null || user.role === '') return 'admin'
  return normalizePulseRole(user.role) || 'member'
}

export function isPulseAdmin(user) {
  return effectiveRole(user) === 'admin'
}

export function isPulseMember(user) {
  return effectiveRole(user) === 'member'
}

export function pulseRoleLabel(role) {
  const normalized = normalizePulseRole(role) || (role == null || role === '' ? 'admin' : null)
  if (normalized === 'admin') return 'Admin'
  if (normalized === 'member') return 'Member'
  return 'Member'
}

export function pulseRoleTagColor(role) {
  const normalized = normalizePulseRole(role) || (role == null || role === '' ? 'admin' : 'member')
  if (normalized === 'admin') return 'green'
  return 'default'
}

/** Roles an admin may assign when inviting or changing people. */
export function assignableRolesFor(user) {
  if (!isPulseAdmin(user)) return []
  return [
    { value: 'member', label: 'Member' },
    { value: 'admin', label: 'Admin' },
  ]
}
