/**
 * Pulse payroll PDF — uses Rohit's classic payslip layout (pdfGenerator.js).
 * Maps Pulse compensation fields into the shape drawPayslip expects.
 */
const { generatePayslipPDF, generatePayslipBuffer, drawPayslip } = require('./pdfGenerator')

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function splitMonthKey(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number)
  if (!y || !m) {
    return { month: 'Payslip', year: new Date().getFullYear() }
  }
  return { month: MONTH_NAMES[m - 1] || 'Payslip', year: y }
}

/**
 * Convert enriched Pulse payroll slip → Rohit payslip payload.
 * @param {object} slip
 */
function toRohitPayslip(slip) {
  const { month, year } = splitMonthKey(slip.month)
  const fixedPay = Number(slip.fixedPay) || 0
  const performanceBonus = Number(slip.performanceBonus) || 0
  const projectBonus = Number(slip.projectBonus) || 0
  const learningBonus = Number(slip.learningBonus) || 0
  const innovationBonus = Number(slip.innovationBonus) || 0
  const otherBonus = learningBonus + innovationBonus
  const performanceIncentive = performanceBonus + projectBonus

  const providentFund = Number(slip.pf ?? slip.providentFund) || 0
  const esi = Number(slip.esi) || 0
  const tds = Number(slip.tds) || 0
  const otherDeductions = Number(slip.otherDeductions) || 0
  const totalDeductions = providentFund + esi + tds + otherDeductions

  const grossEarnings = Number(slip.grossPay) || (
    fixedPay + performanceIncentive + otherBonus
  )
  const netSalary = Number(slip.netPay) || Math.max(0, grossEarnings - totalDeductions)

  const workingDays = Number(slip.payableDays) || Number(slip.workingDays) || 26
  const presentDays = Number(slip.presentDays) || 0
  const leaveDays = Number(slip.leaveDays) || 0
  const lopDays = Number(slip.lopDays)
  const paidDays = Number.isFinite(lopDays)
    ? Math.max(0, workingDays - lopDays)
    : Math.max(presentDays + leaveDays, workingDays)

  return {
    employeeName: slip.employeeName || 'Employee',
    employeeId: slip.employeeId || '',
    designation: slip.designation || '',
    department: slip.department || '',
    dateOfJoining: slip.dateOfJoining || '',
    panNumber: slip.panNumber || '',
    pfNumber: slip.pfNumber || slip.uan || '',
    bankAccount: slip.bankAccount || '',
    bankName: slip.bankName || '',
    month,
    year,
    payDate: slip.paidAt || slip.generatedAt || new Date(),
    workingDays,
    paidDays,
    employmentType: 'employee',
    basicSalary: fixedPay,
    hra: Number(slip.hra) || 0,
    specialAllowance: otherBonus,
    internetAllowance: 0,
    performanceIncentive,
    conveyanceAllowance: 0,
    medicalAllowance: 0,
    employerPF: Number(slip.employerPF) || 0,
    otherEarnings: 0,
    otherEarningsLabel: 'Other Earnings',
    providentFund,
    esi,
    tds,
    otherDeductions,
    professionalTax: 0,
    grossEarnings,
    totalDeductions,
    netSalary,
    companyName: slip.companyName,
    companyAddress: slip.companyAddress,
    companyEmail: slip.companyEmail,
    companyPhone: slip.companyPhone,
    companyWebsite: slip.companyWebsite,
    companyCIN: slip.companyCIN,
    companyGST: slip.companyGST,
    companyLogo: slip.companyLogo,
  }
}

function generatePulsePayslipPDF(slip, res) {
  return generatePayslipPDF(toRohitPayslip(slip), res)
}

function generatePulsePayslipBuffer(slip) {
  return generatePayslipBuffer(toRohitPayslip(slip))
}

function drawPulsePayslip(doc, slip) {
  return drawPayslip(doc, toRohitPayslip(slip))
}

module.exports = {
  toRohitPayslip,
  drawPulsePayslip,
  generatePulsePayslipPDF,
  generatePulsePayslipBuffer,
}
