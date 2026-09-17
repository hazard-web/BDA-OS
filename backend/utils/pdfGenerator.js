const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// ─── Color Palette (Udayan / Rohit payslip) ───────────────────────────────────
const C = {
  green:       '#58833b',
  greenPale:   '#eef0e8',
  rowAlt:      '#f3f5ef',
  white:       '#ffffff',
  border:      '#d4d9c8',
  textDark:    '#1a1a1a',
  textMid:     '#3a3a3a',
  textMuted:   '#5a5a5a',
  textLight:   '#777777',
  totalRow:    '#dce2d4',
};

const FONT_DIR = path.join(__dirname, '../assets/fonts');
const BDA_LOGO_PATH = path.join(__dirname, '../assets/bda-logo.png');

const BDA_BRAND = {
  companyName: 'BDA Technologies Private Limited',
  companyEmail: 'hr@bdatechnologies.com',
  companyWebsite: 'www.bdatechnologies.com',
  companyCIN: 'U74999UP2017PTC096671',
  companyGST: '09AAHCB4248F1ZO',
  companyAddress:
    'Flat No. 207, Plot No. 31A, Unione Residency, Akbarpur, Behrampur, Ghaziabad, Uttar Pradesh, India, 201009',
};

function formatINR(amount) {
  const num = parseFloat(amount) || 0;
  return 'Rs. ' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numberToWords(num) {
  const amount = Math.round(parseFloat(num) || 0);
  if (amount === 0) return 'Zero Rupees Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(n) {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + (ones[n % 10] ? ' ' + ones[n % 10] : '') + ' ';
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + convert(n % 100);
    if (n < 100000) return convert(Math.floor(n / 1000)) + 'Thousand ' + convert(n % 1000);
    if (n < 10000000) return convert(Math.floor(n / 100000)) + 'Lakh ' + convert(n % 100000);
    return convert(Math.floor(n / 10000000)) + 'Crore ' + convert(n % 10000000);
  }

  return convert(amount).trim() + ' Rupees Only';
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function daysInMonth(monthName, year) {
  const monthIndex = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ].indexOf(monthName);
  if (monthIndex === -1) return 30;
  return new Date(year, monthIndex + 1, 0).getDate();
}

function drawPayslip(doc, payslip) {
  const PW = 595.28;
  const PH = 841.89;
  const M = 36;
  const CW = PW - M * 2;

  let fR = 'Helvetica';
  let fB = 'Helvetica-Bold';
  try {
    if (fs.existsSync(path.join(FONT_DIR, 'Inter-Regular.ttf'))) {
      doc.registerFont('Inter', path.join(FONT_DIR, 'Inter-Regular.ttf'));
      fR = 'Inter';
    }
  } catch { /* fallback */ }
  try {
    if (fs.existsSync(path.join(FONT_DIR, 'Inter-Bold.ttf'))) {
      doc.registerFont('Inter-Bold', path.join(FONT_DIR, 'Inter-Bold.ttf'));
      fB = 'Inter-Bold';
    }
  } catch { /* fallback */ }
  try { doc.font(fR); } catch { fR = 'Helvetica'; }

  const hr = (y, color = C.border, w = 0.4) => {
    doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(color).lineWidth(w).stroke();
  };

  // Label (fixed width) + value — keeps both columns vertically aligned
  const infoRow = (label, value, x, y, labelW, valueW) => {
    doc.font(fR).fontSize(7.5).fillColor(C.textMuted)
      .text(String(label), x, y, { width: labelW, lineBreak: false });
    doc.font(fB).fontSize(7.5).fillColor(C.textDark)
      .text(String(value || '—'), x + labelW, y, { width: valueW, lineBreak: false });
  };

  // ── Header (BDA logo + fixed BDA branding) ──────────────────────────────────
  let y = 28;
  const companyName = BDA_BRAND.companyName;
  const companyEmail = BDA_BRAND.companyEmail;
  const companyWebsite = BDA_BRAND.companyWebsite;
  const companyCIN = payslip.companyCIN || BDA_BRAND.companyCIN;
  const companyGST = payslip.companyGST || BDA_BRAND.companyGST;
  const companyAddress = payslip.companyAddress || BDA_BRAND.companyAddress;

  const rightW = 168;
  const logoSize = 36;
  const logoGap = 10;
  let textX = M;
  let hasLogo = false;

  try {
    if (fs.existsSync(BDA_LOGO_PATH)) {
      doc.image(BDA_LOGO_PATH, M, y - 2, { width: logoSize, height: logoSize });
      textX = M + logoSize + logoGap;
      hasLogo = true;
    }
  } catch { /* continue without logo */ }

  const leftW = CW - rightW - 12 - (hasLogo ? logoSize + logoGap : 0);

  doc.font(fB).fontSize(12).fillColor(C.green)
    .text(companyName, textX, y, { width: leftW });

  doc.font(fR).fontSize(7).fillColor(C.textMid)
    .text(companyEmail, M + CW - rightW, y + 2, { width: rightW, align: 'right' });

  y += 16;
  doc.font(fR).fontSize(6.5).fillColor(C.textMuted)
    .text(`CIN: ${companyCIN}  GST No: ${companyGST}`, textX, y, { width: leftW });
  doc.font(fR).fontSize(7).fillColor(C.textMid)
    .text(companyWebsite, M + CW - rightW, y, { width: rightW, align: 'right' });

  y += 14;
  doc.font(fR).fontSize(6.5).fillColor(C.textMid)
    .text(companyAddress, textX, y, { width: CW - (textX - M), align: 'left' });

  y = Math.max(y + 18, hasLogo ? 28 + logoSize + 8 : y + 18);
  hr(y, C.border, 0.5);

  // ── Pay date bar ────────────────────────────────────────────────────────────
  y += 10;
  const barY = y - 4;
  const barH = 22;
  doc.rect(M, barY, CW, barH).fill('#f3f4f1');

  doc.font(fR).fontSize(8.5).fillColor(C.textMid)
    .text('Pay Date: ', M + 10, barY + 6, { continued: true })
    .font(fB).fillColor(C.textDark).text(formatDate(payslip.payDate));

  const rightPrefix = 'Payslip for the month of ';
  const monthYearStr = `${payslip.month} ${payslip.year}`;
  doc.font(fR).fontSize(8.5);
  const prefixW = doc.widthOfString(rightPrefix);
  doc.font(fB);
  const monthW = doc.widthOfString(monthYearStr);
  const rightX = M + CW - 10 - prefixW - monthW;
  doc.font(fR).fillColor(C.textMid)
    .text(rightPrefix, rightX, barY + 6, { continued: true })
    .font(fB).fillColor(C.textDark).text(monthYearStr);

  y = barY + barH + 10;

  // ── Employee details (aligned two-column grid, no icons) ────────────────────
  const empBgH = 96;
  doc.rect(M, y, CW, empBgH).fill(C.greenPale);

  const midX = M + CW / 2;
  const labelW = 82;
  const gap = 6;
  const colPad = 14;
  const col1X = M + colPad;
  const col1ValueW = midX - col1X - labelW - gap - 8;
  const col2X = midX + colPad;
  const col2ValueW = (M + CW) - col2X - labelW - gap - colPad;
  const rowH = 15;
  let rowY = y + 12;

  const leftRows = [
    ['Employee Name', payslip.employeeName],
    ['Designation', payslip.designation],
    ['Department', payslip.department],
    ['Pay Period', `01 ${payslip.month} ${payslip.year} - ${daysInMonth(payslip.month, payslip.year)} ${payslip.month} ${payslip.year}`],
    ['Pay Person', payslip.employeeId],
  ];
  leftRows.forEach(([label, value]) => {
    infoRow(label, value, col1X, rowY, labelW, col1ValueW);
    rowY += rowH;
  });

  rowY = y + 12;
  const rightRows = [
    ['PF Number', payslip.pfNumber || '—'],
    ['PAN Number', payslip.panNumber || '—'],
    ['Bank Account', payslip.bankAccount ? `**** ${String(payslip.bankAccount).slice(-4)}` : '—'],
    ['Bank Name', payslip.bankName || '—'],
  ];
  rightRows.forEach(([label, value]) => {
    infoRow(label, value, col2X, rowY, labelW, col2ValueW);
    rowY += rowH;
  });

  y += empBgH + 12;

  // ── Attendance chips (text only, no icons) ──────────────────────────────────
  const chipGap = 10;
  const chipW = (CW - 2 * chipGap) / 3;
  const chipH = 28;
  const chips = [
    { label: 'Working Days', val: payslip.workingDays ?? 26 },
    { label: 'Paid Days', val: payslip.paidDays ?? 26 },
    { label: 'Loss of Pay Days', val: Math.max(0, (payslip.workingDays ?? 26) - (payslip.paidDays ?? 26)) },
  ];

  chips.forEach((chip, i) => {
    const cx = M + i * (chipW + chipGap);
    doc.rect(cx, y, chipW, chipH).strokeColor(C.border).lineWidth(0.6).stroke();
    const prefix = `${chip.label} - `;
    const val = String(chip.val);
    doc.font(fR).fontSize(8);
    const prefixW = doc.widthOfString(prefix);
    doc.font(fB);
    const valW = doc.widthOfString(val);
    const tx = cx + (chipW - prefixW - valW) / 2;
    doc.font(fR).fillColor(C.textMuted)
      .text(prefix, tx, y + 9, { continued: true, lineBreak: false })
      .font(fB).fillColor(C.textDark).text(val, { lineBreak: false });
  });

  y += chipH + 14;

  // ── Earnings / Deductions ───────────────────────────────────────────────────
  const tW = (CW - 12) / 2;
  const tL = M;
  const tR = M + tW + 12;
  const tAmtW = 78;
  const ROW_H = 16;

  const isIntern = payslip.employmentType === 'intern';
  let earningsRows = [];
  if (isIntern) {
    earningsRows = [['Monthly Stipend', payslip.stipend || payslip.grossEarnings || 0]];
  } else {
    earningsRows = [
      ['Basic Salary (50%)', payslip.basicSalary],
      ['House Rent Allowance (25%)', payslip.hra],
      ['Special Allowance', payslip.specialAllowance],
      ['Internet Allowance', payslip.internetAllowance || 0],
      ['Performance Incentive', payslip.performanceIncentive || 0],
    ].filter((r) => (parseFloat(r[1]) || 0) > 0);

    if ((payslip.conveyanceAllowance || 0) > 0) {
      earningsRows.push(['Conveyance Allowance', payslip.conveyanceAllowance]);
    }
    if ((payslip.medicalAllowance || 0) > 0) {
      earningsRows.push(['Medical Allowance', payslip.medicalAllowance]);
    }
    if ((payslip.employerPF || 0) > 0) {
      earningsRows.push(['Employer PF Contribution', payslip.employerPF]);
    }
    if ((payslip.otherEarnings || 0) > 0) {
      earningsRows.push([payslip.otherEarningsLabel || 'Other Earnings', payslip.otherEarnings]);
    }
  }

  const deductionRows = [
    ['Employee PF (12% of Basic)', payslip.providentFund],
    ['Employee ESI', payslip.esi],
    ['Income Tax (TDS)', payslip.tds],
    ['Adjustment / Other Deduction', payslip.otherDeductions || payslip.professionalTax || 0],
  ]
    .map((r) => [r[0], parseFloat(r[1]) || 0])
    .filter((r) => r[1] > 0 || r[0] !== 'Adjustment / Other Deduction');

  const maxRows = Math.max(earningsRows.length, deductionRows.length, 4);

  doc.rect(tL, y, tW, 18).fill(C.green);
  doc.rect(tR, y, tW, 18).fill(C.green);
  doc.font(fB).fontSize(7.5).fillColor(C.white)
    .text('EARNINGS', tL + 10, y + 5)
    .text('AMOUNT (Rs.)', tL + tW - tAmtW - 10, y + 5, { width: tAmtW, align: 'right' })
    .text('DEDUCTIONS', tR + 10, y + 5)
    .text('AMOUNT (Rs.)', tR + tW - tAmtW - 10, y + 5, { width: tAmtW, align: 'right' });

  y += 18;

  for (let i = 0; i < maxRows; i++) {
    const bg = i % 2 === 0 ? C.white : C.rowAlt;
    doc.rect(tL, y, tW, ROW_H).fill(bg);
    doc.rect(tR, y, tW, ROW_H).fill(bg);
    doc.moveTo(tL, y + ROW_H).lineTo(tL + tW, y + ROW_H).strokeColor(C.border).lineWidth(0.3).stroke();
    doc.moveTo(tR, y + ROW_H).lineTo(tR + tW, y + ROW_H).strokeColor(C.border).lineWidth(0.3).stroke();

    if (earningsRows[i]) {
      doc.font(fR).fontSize(7.5).fillColor(C.textDark)
        .text(String(earningsRows[i][0]), tL + 10, y + 4, { width: tW - tAmtW - 20 });
      doc.font(fB).fontSize(7.5).fillColor(C.textDark)
        .text(formatINR(earningsRows[i][1]), tL + tW - tAmtW - 10, y + 4, { width: tAmtW, align: 'right' });
    }
    if (deductionRows[i]) {
      doc.font(fR).fontSize(7.5).fillColor(C.textDark)
        .text(String(deductionRows[i][0]), tR + 10, y + 4, { width: tW - tAmtW - 20 });
      doc.font(fB).fontSize(7.5).fillColor(C.textDark)
        .text(formatINR(deductionRows[i][1]), tR + tW - tAmtW - 10, y + 4, { width: tAmtW, align: 'right' });
    }
    y += ROW_H;
  }

  doc.rect(tL, y, tW, 18).fill(C.totalRow);
  doc.rect(tR, y, tW, 18).fill(C.totalRow);
  doc.font(fB).fontSize(7.5).fillColor(C.textDark)
    .text('GROSS EARNINGS', tL + 10, y + 5)
    .text(formatINR(payslip.grossEarnings), tL + tW - tAmtW - 10, y + 5, { width: tAmtW, align: 'right' })
    .text('TOTAL DEDUCTIONS', tR + 10, y + 5)
    .text(formatINR(payslip.totalDeductions), tR + tW - tAmtW - 10, y + 5, { width: tAmtW, align: 'right' });

  y += 28;

  // ── Net salary (no wallet icon) ─────────────────────────────────────────────
  const netH = 48;
  doc.rect(M, y, CW, netH).fill(C.green);

  const netLabel = isIntern ? 'NET STIPEND PAYABLE' : 'NET SALARY PAYABLE';
  doc.font(fB).fontSize(10).fillColor(C.white)
    .text(netLabel, M + 14, y + 10);
  doc.font(fR).fontSize(7).fillColor(C.white)
    .text(`(In Words) ${numberToWords(payslip.netSalary)}`, M + 14, y + 26, { width: CW * 0.58 });

  doc.font(fB).fontSize(15).fillColor(C.white)
    .text(formatINR(payslip.netSalary), M + CW * 0.55, y + 15, {
      width: CW * 0.45 - 14,
      align: 'right',
    });

  // ── Footer ──────────────────────────────────────────────────────────────────
  const footerY = PH - 40;
  hr(footerY - 10, C.border, 0.4);
  doc.font(fB).fontSize(8).fillColor(C.textMuted)
    .text('Thank you for your hard work and dedication!', M, footerY, { width: CW, align: 'center' });
  doc.font(fR).fontSize(6.5).fillColor(C.textLight)
    .text('This is a system generated payslip and does not require any signature.', M, footerY + 14, {
      width: CW,
      align: 'center',
    });

  doc.end();
}

function generatePayslipPDF(payslip, res) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: `Payslip - ${payslip.employeeName} - ${payslip.month} ${payslip.year}`,
      Author: payslip.companyName || 'Payroll System',
      Subject: 'Employee Payslip',
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="Payslip_${(payslip.employeeName || 'Employee').replace(/\s+/g, '_')}_${payslip.month}_${payslip.year}.pdf"`,
  );

  doc.pipe(res);
  try {
    drawPayslip(doc, payslip);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'PDF generation failed', details: err.message });
    } else {
      try { doc.end(); } catch { /* ignore */ }
    }
  }
}

function generatePayslipBuffer(payslip) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      drawPayslip(doc, payslip);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generatePayslipPDF, generatePayslipBuffer, drawPayslip };
