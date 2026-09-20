/**
 * BDA Team Career Growth Guide — Performance Bonus rules.
 * Source: spreadsheet “Performance Rules” + “Compensation Calculator”.
 */

const AREA_WEIGHTS = {
  outcomes: 0.25,
  quality: 0.2,
  deadline: 0.2,
  ownership: 0.2,
  bms: 0.15,
}

const AREA_LABELS = {
  outcomes: 'Agreed outcomes completed',
  quality: 'Quality and low rework',
  deadline: 'Deadline reliability',
  ownership: 'Ownership and escalation',
  bms: 'BMS discipline and teamwork',
}

/** Fixed payout tiers (sheet had overlapping ranges; use non-overlapping bands). */
const PERFORMANCE_TIERS = [
  { min: 0, max: 49, status: 'Needs improvement', bonus: 0 },
  { min: 50, max: 59, status: 'Developing', bonus: 1000 },
  { min: 60, max: 69, status: 'Dependable', bonus: 1500 },
  { min: 70, max: 79, status: 'Strong', bonus: 2000 },
  { min: 80, max: 100, status: 'Exceptional', bonus: 3000 },
]

const PROJECT_TIERS = {
  Core: 0,
  Enhanced: 1000,
  Significant: 3000,
  Strategic: 5000,
}

const LEARNING_BONUS = 1000
const INNOVATION_BONUS = 1000
const PERFORMANCE_BONUS_CAP = 3000
const MONTHLY_VARIABLE_CAP = 10000

function clampScore(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  const clamped = Math.max(0, Math.min(100, n))
  return Math.round(clamped / 25) * 25
}

function weightedPerformanceScore(scores = {}) {
  let total = 0
  for (const [key, weight] of Object.entries(AREA_WEIGHTS)) {
    total += clampScore(scores[key]) * weight
  }
  return Math.round(total * 10) / 10
}

function performanceTierFor(score) {
  const s = clampScore(score)
  return (
    PERFORMANCE_TIERS.find((tier) => s >= tier.min && s <= tier.max) ||
    PERFORMANCE_TIERS[0]
  )
}

function projectBonusAmount(tier, approved) {
  if (!approved) return 0
  const key = String(tier || 'Core')
  return PROJECT_TIERS[key] != null ? PROJECT_TIERS[key] : 0
}

function computeMonthlyCompensation({
  fixedPay = 0,
  scores = {},
  projectTier = 'Core',
  projectApproved = false,
  learningApproved = false,
  innovationApproved = false,
} = {}) {
  const weightedScore = weightedPerformanceScore(scores)
  const tier = performanceTierFor(weightedScore)
  const performanceBonus = Math.min(PERFORMANCE_BONUS_CAP, tier.bonus)
  const projectBonus = projectBonusAmount(projectTier, projectApproved)
  const learningBonus = learningApproved ? LEARNING_BONUS : 0
  const innovationBonus = innovationApproved ? INNOVATION_BONUS : 0
  const totalBonus = Math.min(
    MONTHLY_VARIABLE_CAP,
    performanceBonus + projectBonus + learningBonus + innovationBonus,
  )
  const fixed = Math.max(0, Number(fixedPay) || 0)
  return {
    weightedScore,
    performanceStatus: tier.status,
    performanceBonus,
    projectBonus,
    learningBonus,
    innovationBonus,
    totalBonus,
    totalCompensation: fixed + totalBonus,
    promotionEligible: weightedScore >= 80,
  }
}

function monthKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

module.exports = {
  AREA_WEIGHTS,
  AREA_LABELS,
  PERFORMANCE_TIERS,
  PROJECT_TIERS,
  LEARNING_BONUS,
  INNOVATION_BONUS,
  MONTHLY_VARIABLE_CAP,
  clampScore,
  weightedPerformanceScore,
  performanceTierFor,
  projectBonusAmount,
  computeMonthlyCompensation,
  monthKey,
}
