const PDFDocument = require('pdfkit')

/**
 * Premium Indian SME payslip (aligned to SME_Simple_Payslip_Template.docx).
 * Uses Pulse payroll amounts + org logo / statutory employee fields.
 */

const C = {
  green: '#1A5F4A',
  greenDeep: '#0F3D30',
  greenSoft: '#E8F2EE',
  greenRow: '#F4F8F6',
  greenBar: '#154F3D',
  copper: '#C45C26',
  white: '#FFFFFF',
  ink: '#142019',
  muted: '#5C6B60',
  line: '#D5DDD8',
  lineSoft: '#E8EEEA',
  total: '#DCE8E3',
  paper: '#FBFCFA',
}

function formatINR(amount) {
  const num = Number(amount) || 0
  return `₹ ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatINRBare(amount) {
  const num = Number(amount) || 0
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function numberToWords(num) {
  const amount = Math.round(Number(num) || 0)
  if (amount === 0) return 'Zero Rupees Only'

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convert(n) {
    if (n === 0) return ''
    if (n < 20) return `${ones[n]} `
    if (n < 100) return `${tens[Math.floor(n / 10)]}${ones[n % 10] ? ` ${ones[n % 10]}` : ''} `
    if (n < 1000) return `${ones[Math.floor(n / 100)]} Hundred ${convert(n % 100)}`
    if (n < 100000) return `${convert(Math.floor(n / 1000))}Thousand ${convert(n % 1000)}`
    if (n < 10000000) return `${convert(Math.floor(n / 100000))}Lakh ${convert(n % 100000)}`
    return `${convert(Math.floor(n / 10000000))}Crore ${convert(n % 10000000)}`
  }

  return `Rupees ${convert(amount).trim()} Only`
}

function monthTitle(monthKey) {
  const raw = String(monthKey || '')
  const [y, m] = raw.split('-').map(Number)
  if (!y || !m) return raw || '—'
  return new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

function formatDateIN(value) {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function daysInMonthKey(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map(Number)
  if (!y || !m) return 30
  return new Date(y, m, 0).getDate()
}

function drawMark(doc, x, y, size) {
  doc.roundedRect(x, y, size, size, size * 0.12).fill(C.green)
  doc
    .fillColor(C.white)
    .font('Helvetica-Bold')
    .fontSize(size * 0.28)
    .text('BDA', x, y + size * 0.34, { width: size, align: 'center' })
}

function tryDrawLogo(doc, logo, x, y, size) {
  if (!logo) return false
  try {
    const raw = String(logo)
    if (raw.startsWith('data:image')) {
      const base64 = raw.split(',')[1]
      if (!base64) return false
      doc.image(Buffer.from(base64, 'base64'), x, y, {
        fit: [size, size],
        align: 'center',
        valign: 'center',
      })
      return true
    }
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) {
      // Remote/public paths are not fetched here; fall back to mark.
      return false
    }
  } catch {
    /* fall through */
  }
  return false
}

function hr(doc, x, y, w, color = C.line, width = 0.8) {
  doc.moveTo(x, y).lineTo(x + w, y).strokeColor(color).lineWidth(width).stroke()
}

function sectionTitle(doc, text, x, y, w) {
  doc.rect(x, y, w, 22).fill(C.green)
  doc
    .fillColor(C.white)
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(text, x + 12, y + 6.5, { width: w - 24 })
  return y + 22
}

function infoCell(doc, label, value, x, y, w) {
  doc.font('Helvetica').fontSize(7).fillColor(C.muted).text(label, x, y, { width: w })
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(C.ink)
    .text(String(value || '—'), x, y + 11, { width: w })
}

/**
 * @param {PDFKit.PDFDocument} doc
 * @param {object} slip
 */
function drawPulsePayslip(doc, slip) {
  const M = 32
  const pageW = doc.page.width
  const pageH = doc.page.height
  const CW = pageW - M * 2
  let y = M

  const companyName = slip.companyName || 'BDA Technologies Private Limited'
  const companyAddress = slip.companyAddress || ''
  const companyEmail = slip.companyEmail || ''
  const companyPhone = slip.companyPhone || ''
  const companyWebsite = slip.companyWebsite || ''
  const companyCIN = slip.companyCIN || ''
  const companyGST = slip.companyGST || ''

  const fixedPay = Number(slip.fixedPay) || 0
  const performanceBonus = Number(slip.performanceBonus) || 0
  const projectBonus = Number(slip.projectBonus) || 0
  const learningBonus = Number(slip.learningBonus) || 0
  const innovationBonus = Number(slip.innovationBonus) || 0
  const otherAllowance = learningBonus + innovationBonus
  const bonusIncentive = performanceBonus + projectBonus
  const gross = Number(slip.grossPay ?? slip.netPay) || fixedPay + bonusIncentive + otherAllowance

  const pf = Number(slip.pf) || 0
  const esi = Number(slip.esi) || 0
  const tds = Number(slip.tds) || 0
  const otherDeduction = Number(slip.otherDeductions) || 0
  const totalDeductions = pf + esi + tds + otherDeduction
  const net = Number(slip.netPay) || Math.max(0, gross - totalDeductions)
  const employerContribution = Number(slip.employerPF) || Number(slip.employerContribution) || 0

  const payableDays = Number(slip.payableDays) || daysInMonthKey(slip.month)
  const presentDays = Number(slip.presentDays) || payableDays
  const leaveDays = Number(slip.leaveDays) || 0
  const lopDays = Number(slip.lopDays) || Math.max(0, payableDays - presentDays - leaveDays)

  const payDate = slip.paidAt || slip.generatedAt || new Date()

  // Soft paper frame
  doc.rect(0, 0, pageW, pageH).fill(C.paper)
  doc
    .roundedRect(M - 8, M - 8, CW + 16, pageH - M * 2 + 16, 10)
    .strokeColor(C.lineSoft)
    .lineWidth(1)
    .stroke()

  // ── Header: logo (where company mark sits) + company ─────────────────────
  const logoSz = 52
  const logoDrawn = tryDrawLogo(doc, slip.companyLogo, M, y, logoSz)
  if (!logoDrawn) drawMark(doc, M, y, logoSz)

  const textX = M + logoSz + 14
  const textW = CW - logoSz - 14

  doc
    .fillColor(C.greenDeep)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(companyName, textX, y + 2, { width: textW })

  const cinGst = [
    companyCIN ? `CIN: ${companyCIN}` : '',
    companyGST ? `GSTIN: ${companyGST}` : '',
  ]
    .filter(Boolean)
    .join('  ·  ')

  let headerY = y + 20
  if (cinGst) {
    doc.font('Helvetica').fontSize(7).fillColor(C.muted).text(cinGst, textX, headerY, { width: textW })
    headerY += 11
  }

  const contactLine = [companyAddress, companyPhone, companyEmail, companyWebsite]
    .filter(Boolean)
    .join('  |  ')
  if (contactLine) {
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(contactLine, textX, headerY, {
      width: textW,
      lineGap: 1.5,
    })
  }

  y = Math.max(y + logoSz, headerY + 22) + 10
  hr(doc, M, y, CW, C.green, 1.4)
  y += 12

  // Title band
  doc.roundedRect(M, y, CW, 36, 6).fill(C.green)
  doc
    .fillColor(C.white)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(`PAYSLIP – ${monthTitle(slip.month).toUpperCase()}`, M, y + 11, {
      width: CW,
      align: 'center',
    })
  y += 48

  // ── Employee grid (template fields) ──────────────────────────────────────
  doc.roundedRect(M, y, CW, 108, 8).fill(C.greenSoft)
  const gridPad = 14
  const colW = (CW - gridPad * 2) / 4
  const row1Y = y + 12
  const row2Y = y + 48
  const row3Y = y + 78

  infoCell(doc, 'Employee Name', slip.employeeName || 'Employee', M + gridPad, row1Y, colW * 2 - 8)
  infoCell(doc, 'Employee ID', slip.employeeId || '—', M + gridPad + colW * 2, row1Y, colW)
  infoCell(doc, 'Designation', slip.designation || '—', M + gridPad + colW * 3, row1Y, colW)

  infoCell(doc, 'Department', slip.department || '—', M + gridPad, row2Y, colW)
  infoCell(doc, 'Date of Joining', formatDateIN(slip.dateOfJoining), M + gridPad + colW, row2Y, colW)
  infoCell(doc, 'PAN', slip.panNumber || '—', M + gridPad + colW * 2, row2Y, colW)
  infoCell(doc, 'UAN', slip.uan || slip.pfNumber || 'N.A.', M + gridPad + colW * 3, row2Y, colW)

  infoCell(doc, 'Pay Date', formatDateIN(payDate), M + gridPad, row3Y, colW)
  infoCell(
    doc,
    'Bank',
    slip.bankName ? `${slip.bankName}${slip.bankAccount ? ` · ****${String(slip.bankAccount).slice(-4)}` : ''}` : '—',
    M + gridPad + colW,
    row3Y,
    colW * 2 - 8,
  )
  infoCell(
    doc,
    'Status',
    slip.status === 'paid' ? 'Paid' : 'Generated',
    M + gridPad + colW * 3,
    row3Y,
    colW,
  )

  y += 120

  // ── Attendance strip ─────────────────────────────────────────────────────
  const chipGap = 8
  const chipW = (CW - chipGap * 3) / 4
  const chipH = 38
  const chips = [
    { label: 'Payable Days', value: payableDays },
    { label: 'Present', value: presentDays },
    { label: 'Leave', value: leaveDays },
    { label: 'LOP', value: lopDays },
  ]
  chips.forEach((chip, i) => {
    const cx = M + i * (chipW + chipGap)
    doc.roundedRect(cx, y, chipW, chipH, 6).strokeColor(C.line).lineWidth(0.9).stroke()
    doc.font('Helvetica').fontSize(7).fillColor(C.muted).text(chip.label, cx + 10, y + 7, { width: chipW - 20 })
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(C.ink)
      .text(String(chip.value), cx + 10, y + 18, { width: chipW - 20 })
  })
  y += chipH + 16

  // ── Earnings | Deductions (two columns like template) ────────────────────
  const midGap = 14
  const half = (CW - midGap) / 2
  const leftX = M
  const rightX = M + half + midGap
  const tableTop = y

  const earnings = [
    ['Basic', fixedPay],
    ['HRA', Number(slip.hra) || 0],
    ['Other Allowance', otherAllowance],
    ['Bonus / Incentive', bonusIncentive],
  ]
  const deductions = [
    ['PF', pf],
    ['ESI', esi],
    ['TDS', tds],
    ['Other', otherDeduction],
  ]

  const drawSideTable = (x, title, rows, totalLabel, totalValue) => {
    let ty = sectionTitle(doc, `${title}                          ₹`, x, tableTop, half)
    rows.forEach((row, i) => {
      const bg = i % 2 === 0 ? C.white : C.greenRow
      doc.rect(x, ty, half, 22).fill(bg)
      doc.font('Helvetica').fontSize(8.5).fillColor(C.ink).text(row[0], x + 10, ty + 6, { width: half * 0.55 })
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(C.ink)
        .text(formatINRBare(row[1]), x + half * 0.55, ty + 6, { width: half * 0.45 - 12, align: 'right' })
      ty += 22
    })
    doc.rect(x, ty, half, 26).fill(C.total)
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.ink).text(totalLabel, x + 10, ty + 8)
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(formatINR(totalValue), x + half * 0.4, ty + 7, { width: half * 0.6 - 12, align: 'right' })
    return ty + 26
  }

  const leftBottom = drawSideTable(leftX, 'EARNINGS', earnings, 'GROSS SALARY', gross)
  const rightBottom = drawSideTable(rightX, 'DEDUCTIONS', deductions, 'TOTAL DEDUCTIONS', totalDeductions)
  y = Math.max(leftBottom, rightBottom) + 14

  // ── Net salary ───────────────────────────────────────────────────────────
  doc.roundedRect(M, y, CW, 58, 8).fill(C.greenBar)
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(10).text('NET SALARY', M + 16, y + 12)
  doc
    .font('Helvetica')
    .fontSize(8)
    .text(`NET PAY IN WORDS  ·  ${numberToWords(net)}`, M + 16, y + 32, { width: CW * 0.58 })
  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(formatINR(net), M + CW * 0.55, y + 18, { width: CW * 0.45 - 16, align: 'right' })
  y += 70

  // ── Employer contribution (EPFO / ESI compliance block) ──────────────────
  doc.roundedRect(M, y, CW, 44, 6).strokeColor(C.line).lineWidth(0.9).stroke()
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.ink).text('Employer Contribution', M + 12, y + 10)
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text('PF / ESI (if applicable)', M + 12, y + 24)
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(C.ink)
    .text(formatINR(employerContribution), M + CW * 0.55, y + 16, {
      width: CW * 0.45 - 16,
      align: 'right',
    })
  y += 56

  // Performance note (Pulse-specific data retained)
  if (slip.performanceStatus || slip.weightedScore != null) {
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(C.muted)
      .text(
        `Performance: ${slip.performanceStatus || '—'}  ·  Score: ${
          slip.weightedScore != null ? slip.weightedScore : '—'
        }  ·  Variable pay reflects approved performance / project / learning / innovation bonuses.`,
        M,
        y,
        { width: CW },
      )
    y += 18
  }

  // ── Signatory + legal footer (Indian employer payslip norms) ─────────────
  const footerY = Math.max(y + 8, pageH - 92)
  hr(doc, M, footerY, CW, C.line, 0.7)

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(C.ink)
    .text('Authorised Signatory: ____________________', M, footerY + 12)

  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(C.muted)
    .text(
      'This is a computer-generated payslip issued by the employer. It may be produced for salary verification, bank, EPFO / ESIC, and Income Tax records. No physical signature is required if digitally issued under the employer\'s authority.',
      M,
      footerY + 30,
      { width: CW, align: 'left', lineGap: 1.5 },
    )

  doc
    .font('Helvetica')
    .fontSize(6.5)
    .fillColor(C.muted)
    .text(
      'Generated by BDA OS Payroll  ·  Retain for Form 16 / ITR support  ·  Subject to applicable Indian labour & tax laws',
      M,
      pageH - 28,
      { width: CW, align: 'center' },
    )
}

function buildFilename(slip) {
  const name = String(slip.employeeName || 'Employee').replace(/\s+/g, '_')
  const month = String(slip.month || 'payslip').replace(/[^0-9-]/g, '')
  return `Payslip_${name}_${month}.pdf`
}

function generatePulsePayslipPDF(slip, res) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: `Payslip - ${slip.employeeName} - ${slip.month}`,
      Author: slip.companyName || 'BDA OS',
      Subject: 'Indian Employee Payslip',
      Keywords: 'payslip, salary, India, PAN, UAN, EPFO',
    },
  })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${buildFilename(slip)}"`)

  doc.pipe(res)
  try {
    drawPulsePayslip(doc, slip)
    doc.end()
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message || 'PDF generation failed' })
    } else {
      try {
        doc.end()
      } catch {
        /* ignore */
      }
    }
  }
}

function generatePulsePayslipBuffer(slip) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 })
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      drawPulsePayslip(doc, slip)
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}

module.exports = {
  drawPulsePayslip,
  generatePulsePayslipPDF,
  generatePulsePayslipBuffer,
  monthTitle,
  formatINR,
  numberToWords,
}
