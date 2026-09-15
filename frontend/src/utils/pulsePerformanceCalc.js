/** Mirrors backend/utils/pulsePerformanceCalc.js for UI labels. */

export const AREA_WEIGHTS = {
  outcomes: 0.25,
  quality: 0.2,
  deadline: 0.2,
  ownership: 0.2,
  bms: 0.15,
}

export const AREA_LABELS = {
  outcomes: 'Agreed outcomes completed',
  quality: 'Quality and low rework',
  deadline: 'Deadline reliability',
  ownership: 'Ownership and escalation',
  bms: 'BMS discipline and teamwork',
}

/** Short labels for the product UI */
export const AREA_SHORT = {
  outcomes: 'Outcomes',
  quality: 'Quality',
  deadline: 'Deadline',
  ownership: 'Ownership',
  bms: 'BMS',
}

export const AREA_KEYS = Object.keys(AREA_WEIGHTS)

export const PERFORMANCE_TIERS = [
  { min: 0, max: 49, status: 'Needs improvement', bonus: 0 },
  { min: 50, max: 59, status: 'Developing', bonus: 1000 },
  { min: 60, max: 69, status: 'Dependable', bonus: 1500 },
  { min: 70, max: 79, status: 'Strong', bonus: 2000 },
  { min: 80, max: 100, status: 'Exceptional', bonus: 3000 },
]

export const PROJECT_TIER_OPTIONS = [
  { value: 'Core', label: 'Core' },
  { value: 'Enhanced', label: 'Enhanced' },
  { value: 'Significant', label: 'Significant' },
  { value: 'Strategic', label: 'Strategic' },
]

export function monthKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function formatInr(amount) {
  const n = Math.round(Number(amount) || 0)
  return `₹${n.toLocaleString('en-IN')}`
}

export function statusTone(status) {
  switch (String(status || '')) {
    case 'Exceptional':
      return 'is-top'
    case 'Strong':
      return 'is-strong'
    case 'Dependable':
      return 'is-ok'
    case 'Developing':
      return 'is-mid'
    default:
      return 'is-low'
  }
}

function clampScore(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function weightedPerformanceScore(scores = {}) {
  let total = 0
  for (const [key, weight] of Object.entries(AREA_WEIGHTS)) {
    total += clampScore(scores[key]) * weight
  }
  return Math.round(total * 10) / 10
}

export function performanceTierFor(score) {
  const s = clampScore(score)
  return PERFORMANCE_TIERS.find((tier) => s >= tier.min && s <= tier.max) || PERFORMANCE_TIERS[0]
}

const PROJECT_AMOUNTS = { Core: 0, Enhanced: 1000, Significant: 3000, Strategic: 5000 }

export function previewCompensation(draft = {}) {
  const weightedScore = weightedPerformanceScore(draft.scores)
  const tier = performanceTierFor(weightedScore)
  const performanceBonus = tier.bonus
  const projectBonus = draft.projectApproved ? PROJECT_AMOUNTS[draft.projectTier] || 0 : 0
  const learningBonus = draft.learningApproved ? 1000 : 0
  const innovationBonus = draft.innovationApproved ? 1000 : 0
  const totalBonus = Math.min(10000, performanceBonus + projectBonus + learningBonus + innovationBonus)
  const fixedPay = Math.max(0, Number(draft.fixedPay) || 0)
  return {
    weightedScore,
    performanceStatus: tier.status,
    totalBonus,
    totalCompensation: fixedPay + totalBonus,
  }
}
