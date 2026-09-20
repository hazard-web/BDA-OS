/**
 * Shared showcase snapshot for employee Performance, company admin Performance,
 * employee Payroll, and company admin Payroll — one source of truth.
 */
import { monthKey } from './pulsePerformanceCalc'

export const PULSE_PERF_DEMO_SCORES = {
  outcomes: 75,
  quality: 75,
  deadline: 75,
  ownership: 75,
  bms: 75,
}

/** Employee + admin performance month card (as if scored by admin). */
export function buildPerfDemo(overrides = {}) {
  return {
    weightedScore: 75,
    performanceStatus: 'Strong',
    scores: { ...PULSE_PERF_DEMO_SCORES },
    performanceBonus: 2000,
    projectBonus: 1500,
    learningBonus: 500,
    innovationBonus: 250,
    totalBonus: 4250,
    projectTier: 'Enhanced',
    projectApproved: true,
    learningApproved: true,
    innovationApproved: true,
    fixedPay: 45000,
    status: 'open',
    managerNote: '',
    correctionRequested: false,
    ...overrides,
  }
}

/** Company admin team row — locked month ready for payroll. */
export function buildPerfAdminDemoRow(month = monthKey()) {
  const base = buildPerfDemo({
    status: 'locked',
    managerNote: 'Demo scores entered by admin for showcase.',
  })
  return {
    ...base,
    user: 'demo-employee',
    email: 'demo.employee@bda.co.in',
    name: 'Demo Employee',
    avatarUrl: '',
    month,
    id: 'demo-perf',
  }
}

/** Employee payslip aligned to the same performance snapshot. */
export function buildPayrollDemo(month = monthKey(), overrides = {}) {
  const perf = buildPerfDemo()
  const fixedPay = Number(overrides.fixedPay ?? perf.fixedPay) || 45000
  const totalBonus = Number(overrides.totalBonus ?? perf.totalBonus) || 4250
  const netPay = fixedPay + totalBonus
  return {
    ...perf,
    user: 'demo-employee',
    email: 'demo.employee@bda.co.in',
    name: 'Demo Employee',
    month,
    fixedPay,
    totalBonus,
    grossPay: netPay,
    netPay,
    status: 'generated',
    hasPayslip: true,
    ...overrides,
  }
}

/** True when payslip / board row has no real performance-linked pay yet. */
export function needsPayrollDemo(row) {
  if (!row) return true
  // Persisted payslip from lock / generate / admin net pay — never overlay demo
  if (row.id || row.hasPayslip || row.payslip?.id) return false
  return !(Number(row.weightedScore) > 0 || Number(row.totalBonus) > 0)
}

/** Employee My Space payroll — prefer API when scored, else showcase slip. */
export function withEmployeePayrollDemo(row, month = monthKey()) {
  if (!needsPayrollDemo(row)) return row
  const overrides = {}
  if (row) {
    if (Number(row.fixedPay) > 0) overrides.fixedPay = Number(row.fixedPay)
    if (row.name) overrides.name = row.name
    if (row.email) overrides.email = row.email
    if (row.user) overrides.user = row.user
  }
  return buildPayrollDemo(month, overrides)
}

/** Company admin payroll board row with payslip already generated. */
export function buildPayrollAdminDemoRow(month = monthKey()) {
  const slip = buildPayrollDemo(month)
  return {
    user: slip.user,
    email: slip.email,
    name: slip.name,
    avatarUrl: '',
    fixedPay: slip.fixedPay,
    weightedScore: slip.weightedScore,
    performanceStatus: slip.performanceStatus,
    totalBonus: slip.totalBonus,
    hasPayslip: true,
    payslip: slip,
    status: 'locked',
    demoOverlay: true,
  }
}

export function hasScoredAreas(row) {
  const scores = row?.scores || {}
  return Object.values(scores).some((value) => Number(value) > 0)
    || Number(row?.weightedScore) > 0
}

/**
 * Overlay shared showcase scores onto an unscored admin Performance row
 * (keeps real name / email / lock status).
 */
export function withPerfAdminDemo(row, month = monthKey()) {
  if (!row || hasScoredAreas(row)) return row
  const demo = buildPerfDemo({
    status: row.status === 'locked' ? 'locked' : row.status || 'confirmed',
    managerNote: row.managerNote || 'Demo scores aligned with employee Performance.',
  })
  return {
    ...row,
    ...demo,
    user: row.user,
    email: row.email,
    name: row.name || demo.name,
    avatarUrl: row.avatarUrl || '',
    month: row.month || month,
    id: row.id,
    status: row.status || demo.status,
    lockedAt: row.lockedAt || null,
    correctionRequested: Boolean(row.correctionRequested),
    correctionNote: row.correctionNote || '',
    correctionAttachment: row.correctionAttachment || null,
    employeeNote: row.employeeNote || '',
    demoOverlay: true,
  }
}

/** Overlay shared showcase pay figures onto an unscored / empty payroll board row. */
export function withPayrollAdminDemo(row, month = monthKey()) {
  if (!row) return row
  if (!needsPayrollDemo(row)) return row

  const overrides = {
    name: row.name,
    email: row.email,
    user: row.user,
  }
  if (Number(row.fixedPay) > 0) overrides.fixedPay = Number(row.fixedPay)
  const slip = buildPayrollDemo(month, overrides)
  return {
    ...row,
    weightedScore: slip.weightedScore,
    performanceStatus: slip.performanceStatus,
    totalBonus: slip.totalBonus,
    fixedPay: slip.fixedPay,
    hasPayslip: true,
    payslip: {
      ...slip,
      user: row.user,
      email: row.email,
      name: row.name || slip.name,
    },
    status: row.status || 'locked',
    demoOverlay: true,
  }
}
