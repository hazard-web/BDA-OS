const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// ─── Color Palette (matches reference image exactly) ──────────────────────────
const C = {
  green:       '#58833b',   // BDA Forest Green — net salary bar, table headers
  greenDark:   '#4f5626',   // slightly darker green
  greenMid:    '#58833b',   // mid green
  greenAccent: '#7d8538',   // lighter green accent
  greenLight:  '#e5ebdd',   // sage — employee section bg
  greenPale:   '#eef0e8',   // pale sage — employee details bg
  rowAlt:      '#f3f5ef',   // alternating row color
  white:       '#ffffff',
  border:      '#d4d9c8',   // thin green-grey border
  borderMed:   '#c2c9b3',   // medium green-grey border
  borderDark:  '#a8af98',   // darker green-grey
  textDark:    '#1a1a1a',
  textMid:     '#3a3a3a',
  textMuted:   '#5a5a5a',
  textLight:   '#777777',
  totalRow:    '#dce2d4',   // footer for totals row
};

// Font paths
const FONT_DIR = path.resolve(process.cwd(), 'backend/assets/fonts');

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

  const words = convert(amount).trim();
  return words + ' Rupees Only';
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

// ─── BDA Logo Drawing (geometric monogram in green square) ────────────────────

function drawBdaLogo(doc, x, y, size) {
  const s = size;

  // Outer dark green rounded square
  doc.roundedRect(x, y, s, s, s * 0.08).fill(C.green);

  // Three angled parallel bars in lighter green forming "BDA" monogram
  const cx = x + s / 2;
  const cy = y + s / 2;
  const barW = s * 0.18;   // bar thickness
  const barH = s * 0.55;   // bar length
  const gap = s * 0.06;
  const skew = s * 0.10;   // horizontal shift per bar
  const startX = cx - (barW * 1.5 + gap);

  doc.save();
  for (let i = 0; i < 3; i++) {
    const bx = startX + i * (barW + gap);
    // Each bar is a slanted parallelogram (all positive coords)
    doc.moveTo(bx + skew, cy - barH / 2)
       .lineTo(bx + barW + skew, cy - barH / 2)
       .lineTo(bx + barW, cy + barH / 2)
       .lineTo(bx, cy + barH / 2)
       .closePath()
       .fill(C.greenLight);
  }
  doc.restore();
}

// ─── Icon Drawing Helpers ─────────────────────────────────────────────────────

function drawLocationPin(doc, x, y, size) {
  const s = size;
  // Pin teardrop — circle top
  doc.circle(x, y - s * 0.15, s * 0.35).fill(C.green);
  // Tail of pin (triangle) — use path with absolute coords
  doc.moveTo(x - s * 0.22, y - s * 0.0)
     .lineTo(x + s * 0.22, y - s * 0.0)
     .lineTo(x, y + s * 0.35)
     .closePath()
     .fill(C.green);
  // Inner white circle
  doc.circle(x, y - s * 0.15, s * 0.15).fill(C.white);
}

function drawEmailIcon(doc, x, y, size) {
  const s = size;
  // Envelope body
  doc.rect(x - s * 0.5, y - s * 0.32, s, s * 0.62)
    .strokeColor(C.green).lineWidth(0.7).stroke();
  // Envelope flap
  doc.moveTo(x - s * 0.5, y - s * 0.32)
    .lineTo(x, y + s * 0.05)
    .lineTo(x + s * 0.5, y - s * 0.32)
    .strokeColor(C.green).lineWidth(0.7).stroke();
}

function drawWebIcon(doc, x, y, size) {
  const s = size;
  // Globe circle
  doc.circle(x, y, s * 0.4).strokeColor(C.green).lineWidth(0.7).stroke();
  // Equator
  doc.moveTo(x - s * 0.4, y).lineTo(x + s * 0.4, y)
    .strokeColor(C.green).lineWidth(0.5).stroke();
  // Meridian (ellipse)
  doc.ellipse(x, y, s * 0.15, s * 0.4)
    .strokeColor(C.green).lineWidth(0.5).stroke();
}

function drawCalendarIcon(doc, x, y, width, height) {
  const w = width;
  const h = height;
  // Calendar body (border)
  doc.rect(x, y, w, h).strokeColor(C.green).lineWidth(0.6).stroke();
  // Calendar top bar (green filled)
  doc.rect(x, y, w, h * 0.32).fill(C.green);
  // Body fill
  doc.rect(x, y + h * 0.32, w, h * 0.68).fill(C.white);
  // Tiny dots in body to look like grid
  const dotY1 = y + h * 0.5;
  const dotY2 = y + h * 0.75;
  for (let i = 0; i < 3; i++) {
    const dx = x + 3 + i * (w - 6) / 2;
    doc.circle(dx, dotY1, 0.4).fill(C.green);
    doc.circle(dx, dotY2, 0.4).fill(C.green);
  }
}

function drawWalletIcon(doc, x, y, size) {
  const s = size;
  doc.save();
  doc.translate(x, y);
  // Outer wallet rectangle
  doc.roundedRect(-s * 0.6, -s * 0.4, s * 1.2, s * 0.8, s * 0.08)
    .fillAndStroke(C.white, C.white);
  // Top fold line
  doc.moveTo(-s * 0.6, -s * 0.15).lineTo(s * 0.6, -s * 0.15)
    .strokeColor(C.green).lineWidth(0.6).stroke();
  // Currency circle in the middle
  doc.circle(-s * 0.15, s * 0.1, s * 0.18).fill(C.green);
  // Bill sticking out on right
  doc.rect(s * 0.1, -s * 0.3, s * 0.5, s * 0.5).fill(C.white).stroke(C.green).lineWidth(0.5);
  // Bill inner line
  doc.moveTo(s * 0.1, 0).lineTo(s * 0.6, 0)
    .strokeColor(C.green).lineWidth(0.4).stroke();
  doc.restore();
}

// ─── Main Drawing Function ─────────────────────────────────────────────────────

function drawPayslip(doc, payslip) {
  // ── Page Geometry ────────────────────────────────────────────────────────────
  const PW = 595.28; // A4 width
  const PH = 841.89; // A4 height
  const M  = 30;      // margin
  const CW = PW - M * 2; // content width

  // ── Font Setup ───────────────────────────────────────────────────────────────
  let fR = 'Helvetica';
  let fB = 'Helvetica-Bold';

  try {
    if (fs.existsSync(path.join(FONT_DIR, 'Inter-Regular.ttf'))) {
      doc.registerFont('Inter', path.join(FONT_DIR, 'Inter-Regular.ttf'));
      fR = 'Inter';
    }
  } catch (e) { /* fallback */ }

  try {
    if (fs.existsSync(path.join(FONT_DIR, 'Inter-Bold.ttf'))) {
      doc.registerFont('Inter-Bold', path.join(FONT_DIR, 'Inter-Bold.ttf'));
      fB = 'Inter-Bold';
    }
  } catch (e) { /* fallback */ }

  try { doc.font(fR); } catch { fR = 'Helvetica'; }

  // ── Helper: thin horizontal rule ─────────────────────────────────────────────
  const hr = (y, color = C.border, w = 0.4) => {
    doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(color).lineWidth(w).stroke();
  };

  // ── Helper: thick header rule ────────────────────────────────────────────────
  const hrThick = (y, color = C.green, w = 2) => {
    doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(color).lineWidth(w).stroke();
  };

  // ── Helper: label + value row ────────────────────────────────────────────────
  const infoRow = (label, value, lx, vx, y, maxVw = 130, labelWidth = 60) => {
    doc.font(fR).fontSize(7).fillColor(C.textMuted)
       .text(String(label), lx, y, { width: labelWidth });
    doc.font(fB).fontSize(7.5).fillColor(C.textDark)
       .text(String(value || '—'), vx, y, { width: maxVw });
  };

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 1: HEADER — Logo + Company Name + CIN/GST + Address + Contact
  // ══════════════════════════════════════════════════════════════════════════════
  const headerTop = 10;

  // Logo on the left
  const logoX = M;
  const logoY = headerTop + 4;
  const logoSz = 55;

  let logoDrawn = false;
  if (payslip.companyLogo && payslip.companyLogo.length > 100) {
    try {
      const b64 = payslip.companyLogo.replace(/^data:image\/[a-z]+;base64,/, '');
      const imgBuf = Buffer.from(b64, 'base64');
      doc.image(imgBuf, logoX, logoY, { width: logoSz, height: logoSz, fit: [logoSz, logoSz] });
      logoDrawn = true;
    } catch (e) { /* fallback */ }
  }

  if (!logoDrawn) {
    drawBdaLogo(doc, logoX, logoY, logoSz);
  }

  // Company name and info — right of logo, taking most of the width
  const compX = logoX + logoSz + 14;
  const compW = CW * 0.65;

  // Company name — large bold dark green
  doc.font(fB).fontSize(12).fillColor(C.green)
     .text(payslip.companyName || 'BDA Technologies Private Limited', compX, logoY + 3, { width: compW });

  // CIN and GST on one line
  const cinGstParts = [];
  const companyCIN = payslip.companyCIN || 'U74999UP2017PTC096671';
  const companyGST = payslip.companyGST || '09AAHCB4248F1ZO';
  if (companyCIN) cinGstParts.push(`CIN: ${companyCIN}`);
  if (companyGST) cinGstParts.push(`GST No: ${companyGST}`);
  if (cinGstParts.length) {
    doc.font(fR).fontSize(6.2).fillColor(C.textMuted)
       .text(cinGstParts.join('   '), compX, logoY + 19, { width: compW });
  }

  // Address with location pin icon
  const companyAddress = payslip.companyAddress || 'Flat No. 207, Plot No. 31A, Unione Residency, Akbarpur, Behrampur, Ghaziabad, Uttar Pradesh, India, 201009';
  if (companyAddress) {
    const addrY = logoY + 31;
    drawLocationPin(doc, compX + 1, addrY + 4, 6);
    doc.font(fR).fontSize(6).fillColor(C.textMid)
       .text(companyAddress, compX + 10, addrY, { width: compW - 10 });
  }

  // Right side: Email and Website (positioned to not overlap)
  const ctX = M + CW * 0.72;
  const ctW = CW * 0.28;
  let ctY = logoY + 4;

  const companyEmail = payslip.companyEmail || 'hr@bdatechnologies.com';
  if (companyEmail) {
    drawEmailIcon(doc, ctX, ctY + 5, 7);
    doc.font(fR).fontSize(6.2).fillColor(C.textMid)
       .text(companyEmail, ctX + 9, ctY, { width: ctW - 9 });
    ctY += 13;
  }
  const companyWebsite = payslip.companyWebsite || 'www.bdatechnologies.com';
  if (companyWebsite) {
    drawWebIcon(doc, ctX, ctY + 5, 7);
    doc.font(fR).fontSize(6.2).fillColor(C.textMid)
       .text(companyWebsite, ctX + 9, ctY, { width: ctW - 9 });
  }

  // Thin grey separator under header — positioned below the tallest element
  let y = logoY + logoSz + 8;
  hr(y, C.border, 0.5);

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 2: PAY DATE + PAYSLIP PERIOD
  // ══════════════════════════════════════════════════════════════════════════════
  y += 8;
  doc.font(fR).fontSize(8.5).fillColor(C.textMid)
     .text('Pay Date: ', M, y, { continued: true })
     .font(fB).fillColor(C.textDark).text(formatDate(payslip.payDate));

  // Right side: "Payslip for the month of" + month/year — measure the prefix and right-align
  const rightLabel = 'Payslip for the month of ';
  doc.font(fR).fontSize(8.5);
  const labelW = doc.widthOfString(rightLabel);
  const monthYearStr = `${payslip.month} ${payslip.year}`;
  doc.font(fB);
  const monthYearW = doc.widthOfString(monthYearStr);
  const totalRW = labelW + monthYearW;
  const rightStartX = M + CW - totalRW;

  doc.font(fR).fillColor(C.textMid)
     .text(rightLabel, rightStartX, y, { continued: true })
     .font(fB).fillColor(C.textDark).text(monthYearStr);

  y += 18;
  hr(y, C.border, 0.5);

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 3: EMPLOYEE DETAILS (two columns with vertical divider)
  // ══════════════════════════════════════════════════════════════════════════════
  y += 6;

  // Light green background for employee section
  const empBgH = 92;
  doc.rect(M, y, CW, empBgH).fill(C.greenPale);

  // Thin vertical dividing line between columns
  const divX = M + CW / 2;
  doc.moveTo(divX, y + 4).lineTo(divX, y + empBgH - 4)
    .strokeColor(C.border).lineWidth(0.5).stroke();

  // Column positions
  const col1Lx = M + 10;
  const col1Vx = M + 78;
  const col2Lx = divX + 10;
  const col2Vx = divX + 60;
  const empRowH = 15;
  let empInnerY = y + 10;

  // Left column
  const col1Rows = [
    ['Employee Name', payslip.employeeName],
    ['Designation', payslip.designation],
    ['Department', payslip.department],
    ['Pay Period', `01 ${payslip.month} ${payslip.year} - ${daysInMonth(payslip.month, payslip.year)} ${payslip.month} ${payslip.year}`],
    ['Pay Person', payslip.employeeId],
  ];

  col1Rows.forEach(([label, value]) => {
    infoRow(label, value, col1Lx, col1Vx, empInnerY, CW / 2 - col1Vx + M - 10, 65);
    empInnerY += empRowH;
  });

  // Right column
  const col2Rows = [
    ['PF Number', payslip.pfNumber || '—'],
    ['PAN Number', payslip.panNumber || '—'],
    ['Bank Account', payslip.bankAccount ? `**** ${String(payslip.bankAccount).slice(-4)}` : '—'],
    ['Bank Name', payslip.bankName || '—'],
  ];

  empInnerY = y + 10;
  col2Rows.forEach(([label, value]) => {
    infoRow(label, value, col2Lx, col2Vx, empInnerY, CW / 2 - col2Vx + M - 10, 50);
    empInnerY += empRowH;
  });

  y += empBgH + 2;

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 4: ATTENDANCE SUMMARY (3 calendar icon chips)
  // ══════════════════════════════════════════════════════════════════════════════
  y += 8;

  const chipTotalW = CW;
  const chipGap = 8;
  const chipW = (chipTotalW - 2 * chipGap) / 3;
  const chipH = 28;
  const chipIconW = 18;
  const chipIconH = 16;
  const chipIconXOffset = 10;
  const chipLabelXOffset = 33;

  const chips = [
    { label: 'Working Days',    val: payslip.workingDays ?? 26 },
    { label: 'Paid Days',       val: payslip.paidDays ?? 26 },
    { label: 'Loss of Pay Days', val: Math.max(0, (payslip.workingDays ?? 26) - (payslip.paidDays ?? 26)) },
  ];

  chips.forEach((chip, i) => {
    const cx = M + i * (chipW + chipGap);
    // Chip border
    doc.rect(cx, y, chipW, chipH).strokeColor(C.border).lineWidth(0.5).stroke();

    // Calendar icon
    const iconX = cx + chipIconXOffset;
    const iconY = y + (chipH - chipIconH) / 2;
    drawCalendarIcon(doc, iconX, iconY, chipIconW, chipIconH);

    // Label + value
    const labelX = cx + chipLabelXOffset;
    const labelY = y + 9;
    doc.font(fR).fontSize(7).fillColor(C.textMuted)
       .text(`${chip.label} - `, labelX, labelY, { continued: true })
       .font(fB).fillColor(C.textDark).text(String(chip.val));
  });

  y += chipH + 12;

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 5: EARNINGS & DEDUCTIONS TABLE
  // ══════════════════════════════════════════════════════════════════════════════
  const tW    = CW / 2 - 6;
  const tL    = M;
  const tR    = M + CW / 2 + 6;
  const tAmtW = 72;
  const ROW_H = 15;

  // Build earnings rows
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
    ].filter(r => (parseFloat(r[1]) || 0) > 0);

    if ((payslip.conveyanceAllowance || 0) > 0)
      earningsRows.push(['Conveyance Allowance', payslip.conveyanceAllowance]);
    if ((payslip.medicalAllowance || 0) > 0)
      earningsRows.push(['Medical Allowance', payslip.medicalAllowance]);
    if ((payslip.employerPF || 0) > 0)
      earningsRows.push(['Employer PF Contribution', payslip.employerPF]);
    if ((payslip.otherEarnings || 0) > 0)
      earningsRows.push([payslip.otherEarningsLabel || 'Other Earnings', payslip.otherEarnings]);
  }

  // Build deductions rows
  const deductionRows = [
    [`Employee PF (12% of Basic)`, payslip.providentFund],
    ['Employee ESI', payslip.esi],
    ['Income Tax (TDS)', payslip.tds],
    ['Adjustment / Other Deduction', payslip.otherDeductions || payslip.professionalTax || 0],
  ].map(r => [r[0], parseFloat(r[1]) || 0]).filter(r => r[1] > 0 || r[0] !== 'Adjustment / Other Deduction');

  // Ensure at least 5 rows for clean layout
  const maxRows = Math.max(earningsRows.length, deductionRows.length, 5);

  // Table header — dark green background, white text
  doc.rect(tL, y, tW, 18).fill(C.green);
  doc.rect(tR, y, tW, 18).fill(C.green);
  doc.font(fB).fontSize(7).fillColor(C.white)
     .text('EARNINGS', tL + 8, y + 5)
     .text('AMOUNT (Rs.)', tL + tW - tAmtW - 8, y + 5, { width: tAmtW, align: 'right' })
     .text('DEDUCTIONS', tR + 8, y + 5)
     .text('AMOUNT (Rs.)', tR + tW - tAmtW - 8, y + 5, { width: tAmtW, align: 'right' });

  y += 18;

  // Table rows — alternating white / light grey-green
  for (let i = 0; i < maxRows; i++) {
    const bg = i % 2 === 0 ? C.white : C.rowAlt;
    doc.rect(tL, y, tW, ROW_H).fill(bg);
    doc.rect(tR, y, tW, ROW_H).fill(bg);

    // Thin horizontal row separator
    doc.moveTo(tL, y + ROW_H).lineTo(tL + tW, y + ROW_H).strokeColor(C.border).lineWidth(0.3).stroke();
    doc.moveTo(tR, y + ROW_H).lineTo(tR + tW, y + ROW_H).strokeColor(C.border).lineWidth(0.3).stroke();

    if (earningsRows[i]) {
      doc.font(fR).fontSize(7).fillColor(C.textDark)
         .text(String(earningsRows[i][0]), tL + 8, y + 4, { width: tW - tAmtW - 16 });
      doc.font(fB).fontSize(7).fillColor(C.textDark)
         .text(formatINR(earningsRows[i][1]), tL + tW - tAmtW - 8, y + 4, { width: tAmtW, align: 'right' });
    }

    const ded = deductionRows[i];
    if (ded) {
      doc.font(fR).fontSize(7).fillColor(C.textDark)
         .text(String(ded[0]), tR + 8, y + 4, { width: tW - tAmtW - 16 });
      doc.font(fB).fontSize(7).fillColor(C.textDark)
         .text(formatINR(ded[1]), tR + tW - tAmtW - 8, y + 4, { width: tAmtW, align: 'right' });
    }

    y += ROW_H;
  }

  // Totals footer row — slightly darker grey-green background
  doc.rect(tL, y, tW, 18).fill(C.totalRow);
  doc.rect(tR, y, tW, 18).fill(C.totalRow);
  doc.moveTo(tL, y + 18).lineTo(tL + tW, y + 18).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.moveTo(tR, y + 18).lineTo(tR + tW, y + 18).strokeColor(C.border).lineWidth(0.5).stroke();

  doc.font(fB).fontSize(7.5).fillColor(C.textDark)
     .text('GROSS EARNINGS', tL + 8, y + 5)
     .text(formatINR(payslip.grossEarnings), tL + tW - tAmtW - 8, y + 5, { width: tAmtW, align: 'right' })
     .text('TOTAL DEDUCTIONS', tR + 8, y + 5)
     .text(formatINR(payslip.totalDeductions), tR + tW - tAmtW - 8, y + 5, { width: tAmtW, align: 'right' });

  y += 26;

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 6: NET SALARY PAYABLE (solid dark green bar)
  // ══════════════════════════════════════════════════════════════════════════════
  const netH = 50;
  const netY = y;

  // Dark forest green background box
  doc.rect(M, netY, CW, netH).fill(C.green);

  // Wallet icon on the left
  const walletX = M + 18;
  const walletY = netY + netH / 2;
  drawWalletIcon(doc, walletX, walletY, 22);

  // "NET SALARY PAYABLE" label
  const netLabel = isIntern ? 'NET STIPEND PAYABLE' : 'NET SALARY PAYABLE';
  doc.font(fB).fontSize(9).fillColor(C.white)
     .text(netLabel, M + 48, netY + 10);

  // Amount in words
  const inWords = numberToWords(payslip.netSalary);
  doc.font(fR).fontSize(6.8).fillColor('rgba(255,255,255,0.85)')
     .text(`(In Words)   ${inWords}`, M + 48, netY + 24, { width: CW * 0.55 });

  // Large amount on the right
  doc.font(fB).fontSize(16).fillColor(C.white)
     .text(formatINR(payslip.netSalary), M + CW - (CW * 0.40) - 18, netY + 16, { width: CW * 0.40, align: 'right' });

  y += netH + 18;

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 7: FOOTER
  // ══════════════════════════════════════════════════════════════════════════════
  const footerY = PH - 36;

  // Horizontal line above footer (thin grey)
  hr(footerY - 10, C.border, 0.4);

  // "Thank you" message
  doc.font(fB).fontSize(8).fillColor(C.textMuted)
     .text('Thank you for your hard work and dedication!', M, footerY, { width: CW, align: 'center' });

  // System generated note
  doc.font(fR).fontSize(6.5).fillColor(C.textLight)
     .text('This is a system generated payslip and does not require any signature.', M, footerY + 14, { width: CW, align: 'center' });

  doc.end();
}

// ─── Public API ──────────────────────────────────────────────────────────────

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
    `attachment; filename="Payslip_${(payslip.employeeName || 'Employee').replace(/\s+/g, '_')}_${payslip.month}_${payslip.year}.pdf"`
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
    doc.on('data', chunk => chunks.push(chunk));
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
