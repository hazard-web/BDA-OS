const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { generatePayslipPDFBuffer } = require('./pdfBuffer');
const { buildSetupLink, buildVerifyLink } = require('./urlHelper');

const BDA_LOGO_CID = 'bda-logo@bdatech';
/** Full BDA Technologies lockup for transactional mail headers. */
const BDA_LOGO_PATH = path.join(__dirname, '../assets/bda-logo-lockup.png');

function bdaLogoAttachment() {
  try {
    if (!fs.existsSync(BDA_LOGO_PATH)) return null;
    return {
      filename: 'bda-logo-lockup.png',
      content: fs.readFileSync(BDA_LOGO_PATH),
      contentType: 'image/png',
      cid: BDA_LOGO_CID,
      contentDisposition: 'inline',
    };
  } catch {
    return null;
  }
}

function sanitizeEmailValue(value) {
  if (!value) return '';
  let v = String(value).trim();
  // Strip surrounding markdown link like [addr](mailto:addr)
  const m = v.match(/^\[(.+?)\]\(mailto:.+?\)$/i) || v.match(/^\[(.+?)\]\((.+?)\)$/);
  if (m) v = m[1];
  return v.trim();
}

function resendApiKey() {
  return String(process.env.RESEND_API_KEY || '').trim();
}

function smtpHost() {
  return String(process.env.EMAIL_HOST || '').trim();
}

function smtpPort() {
  const n = Number(process.env.EMAIL_PORT);
  return Number.isFinite(n) && n > 0 ? n : 587;
}

function smtpAuth() {
  return {
    user: sanitizeEmailValue(process.env.EMAIL_USER),
    pass: String(process.env.EMAIL_PASS || '').trim(),
  };
}

function hasSmtpConfig() {
  const { user, pass } = smtpAuth();
  if (!smtpHost() || !user || !pass) return false;
  if (pass.includes('PASTE_') || pass.includes('YOUR_') || pass.includes('XXXX')) return false;
  return true;
}

function extractEmailAddress(value) {
  const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0] : ''
}

function emailDomain(value) {
  return (extractEmailAddress(value).split('@')[1] || '').toLowerCase()
}

function displayNameFrom(value, fallback = 'BDA Technologies') {
  let raw = String(value || fallback).replace(/"/g, '').trim()
  const named = raw.match(/^(.+?)\s*<[^>]+>$/)
  if (named) raw = named[1].trim()
  if (!raw || raw.includes('@')) return fallback
  if (raw.toLowerCase() === 'pulse') return fallback
  // Placeholder workspace names should never appear in outbound mail.
  if (/^my\s*company$/i.test(raw) || /^your\s*company$/i.test(raw)) return fallback
  return raw
}

/** Canonical brand for candidate / invite mail — never "My company". */
function brandOrgName(companyName) {
  return displayNameFrom(companyName, 'BDA Technologies')
}

function formatFrom(displayName, address) {
  const name = displayNameFrom(displayName).replace(/"/g, '')
  const email = extractEmailAddress(address)
  if (!email) return `"${name}" <beth.t@example.com>`
  return `"${name}" <${email}>`
}

/**
 * Resend only accepts a From address on a domain verified for this API key.
 * Display name is BDA Technologies (or the company). The mailbox must match a verified domain.
 */
function resendFromAddress(displayName) {
  const name = displayNameFrom(displayName)
  const configured = sanitizeEmailValue(process.env.RESEND_FROM)
  const domain = emailDomain(configured)
  const address = extractEmailAddress(configured)
  if (!address || !domain || domain === 'example.com' || domain === 'example.org') {
    return `"${name.replace(/"/g, '')}" <beth.t@example.com>`
  }
  return `"${name.replace(/"/g, '')}" <${address}>`
}

/**
 * Build a valid SMTP / Resend `from` address.
 * Resend uses the verified mailbox in RESEND_FROM; the visible name is the company.
 */
function buildFromAddress(displayName) {
  const safeDisplayName = displayNameFrom(displayName)
  if (hasSmtpConfig()) {
    const from = sanitizeEmailValue(process.env.EMAIL_FROM)
    const address = extractEmailAddress(from) || extractEmailAddress(process.env.EMAIL_USER)
    if (address) return formatFrom(safeDisplayName, address)
  }
  if (resendApiKey()) return resendFromAddress(safeDisplayName)
  const fromEmail = sanitizeEmailValue(process.env.EMAIL_FROM) || sanitizeEmailValue(process.env.EMAIL_USER)
  return `"${safeDisplayName}" <${fromEmail}>`
}

/**
 * Detect if the configured credentials look like placeholders.
 */
function hasRealCredentials() {
  if (hasSmtpConfig()) return true;
  if (resendApiKey()) return true;
  const user = sanitizeEmailValue(process.env.EMAIL_USER);
  const pass = (process.env.EMAIL_PASS || '').trim();
  if (!user || !pass) return false;
  if (pass.includes('PASTE_') || pass.includes('YOUR_') || pass.includes('XXXX')) return false;
  if (pass.replace(/\s/g, '').length < 10) return false;
  return true;
}

function toResendAttachment(file) {
  const filename = file.filename || file.name || 'attachment';
  let content = file.content;
  if (Buffer.isBuffer(content)) {
    content = content.toString('base64');
  } else if (typeof content === 'string' && content.startsWith('data:')) {
    content = content.split(',')[1];
  }
  const out = { filename, content };
  const cid = file.cid || file.contentId || file.content_id;
  if (cid) {
    out.content_id = String(cid).replace(/^cid:/i, '');
    out.contentId = out.content_id;
  }
  if (file.contentType) out.content_type = file.contentType;
  return out;
}

function friendlyMailError(raw) {
  const text = String(raw || 'Email could not be sent');
  if (/domain is not verified/i.test(text)) {
    return 'Resend rejected the sender address. Set RESEND_FROM to an address on a verified domain (see https://resend.com/domains) and restart the API.';
  }
  if (/only send testing emails/i.test(text)) {
    return 'Resend test mode can only deliver to the email on your Resend account. Verify a sending domain at https://resend.com/domains, set RESEND_FROM to an address on that domain, and restart the API.';
  }
  return text;
}

let cachedVerifiedFrom = '';

async function fromVerifiedDomain(resend, displayName) {
  const name = displayNameFrom(displayName)
  if (cachedVerifiedFrom) return formatFrom(name, cachedVerifiedFrom)
  const listed = await resend.domains.list()
  const rows = listed.data?.data || listed.data || []
  const verified = rows.find((row) => row && row.status === 'verified' && row.name)
  if (!verified) return ''
  cachedVerifiedFrom = `noreply@${verified.name}`
  return formatFrom(name, cachedVerifiedFrom)
}

function isNonRetryableMailError(err) {
  const msg = String(err?.message || '');
  if (/not verified|testing emails|invalid|forbidden|unauthorized/i.test(msg)) return true;
  const status = Number(err?.statusCode || err?.status || 0);
  return status === 400 || status === 401 || status === 403 || status === 422;
}

async function sendViaResend(mailOptions) {
  const { Resend } = require('resend');
  const resend = new Resend(resendApiKey());
  const to = mailOptions.to;
  const payload = {
    from: mailOptions.from || resendFromAddress('BDA OS'),
    to: Array.isArray(to) ? to : String(to || '').split(',').map((s) => s.trim()).filter(Boolean),
    subject: mailOptions.subject,
    html: mailOptions.html,
  };
  if (mailOptions.text) payload.text = mailOptions.text;
  if (mailOptions.replyTo && emailDomain(mailOptions.replyTo) && emailDomain(mailOptions.replyTo) !== 'example.com') {
    payload.replyTo = mailOptions.replyTo;
  }
  if (mailOptions.attachments && mailOptions.attachments.length) {
    payload.attachments = mailOptions.attachments.map(toResendAttachment);
  }

  if (['example.com', 'example.org'].includes(emailDomain(payload.from))) {
    const verifiedFrom = await fromVerifiedDomain(resend, displayNameFrom(payload.from));
    if (verifiedFrom) payload.from = verifiedFrom;
  }

  let { data, error } = await resend.emails.send(payload);
  if (error && /domain is not verified/i.test(error.message || '')) {
    const fallbackFrom = await fromVerifiedDomain(resend, displayNameFrom(payload.from));
    if (fallbackFrom && extractEmailAddress(fallbackFrom) !== extractEmailAddress(payload.from)) {
      console.warn(`Resend rejected ${payload.from}; retrying as ${fallbackFrom}`);
      payload.from = fallbackFrom;
      const retry = await resend.emails.send(payload);
      data = retry.data;
      error = retry.error;
    }
  }
  if (error) {
    const raw = error.message || 'Resend email failed';
    console.error('Resend send failed:', raw, 'from=', payload.from, 'to=', payload.to.join(', '));
    const err = new Error(friendlyMailError(raw));
    err.status = error.statusCode || 403;
    throw err;
  }
  return { messageId: data?.id, accepted: payload.to };
}

/**
 * Create a mail transporter.
 * Prefers SMTP when EMAIL_HOST is set (SocketLabs, etc). Else Resend, else Gmail, else Ethereal.
 */
async function createSMTPTransporter() {
  if (hasSmtpConfig()) {
    const port = smtpPort();
    const { user, pass } = smtpAuth();
    const transporter = nodemailer.createTransport({
      host: smtpHost(),
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false },
    });
    try {
      await transporter.verify();
    } catch {
      /* SMTP may still work for send */
    }
    return transporter;
  }

  if (resendApiKey()) {
    return {
      sendMail: (opts) => sendViaResend({ ...opts, from: opts.from || resendFromAddress('BDA Technologies') }),
    };
  }

  const emailUser = sanitizeEmailValue(process.env.EMAIL_USER);
  const emailPass = (process.env.EMAIL_PASS || '').trim();

  if (hasRealCredentials()) {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    try {
      await transporter.verify();
    } catch {
      /* Gmail may still work for send */
    }

    return transporter;
  }

  const passLooksEmpty = !emailPass;
  const passIsPlaceholder = emailPass.includes('PASTE_') || emailPass.includes('YOUR_') || emailPass.includes('XXXX');
  console.warn('────────────────────────────────────────────────────');
  console.warn('⚠️  Email credentials missing or invalid.');
  if (!smtpHost()) console.warn('   • EMAIL_HOST is empty in .env');
  if (!emailUser) console.warn('   • EMAIL_USER is empty in .env');
  if (passLooksEmpty) console.warn('   • EMAIL_PASS is empty in .env');
  if (passIsPlaceholder) console.warn('   • EMAIL_PASS is still a placeholder ("' + emailPass.substring(0, 30) + '...")');
  console.warn('   To enable real email delivery, set EMAIL_HOST + EMAIL_USER + EMAIL_PASS');
  console.warn('   or RESEND_API_KEY.');
  console.warn('   Falling back to Ethereal test SMTP for development...');
  console.warn('────────────────────────────────────────────────────');

  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Send verification email on registration
// ─────────────────────────────────────────────────────────────
async function sendVerificationEmail(user, token, origin) {
  // Support both pre-built URLs (from buildVerifyLink) and legacy origin URLs
  // If origin looks like a full URL ending with ?token=, use it directly
  // Otherwise build from origin as before
  let verifyUrl;
  if (origin && origin.includes('?token=')) {
    // Pre-built URL from centralized helper
    verifyUrl = origin;
  } else {
    const finalAppUrl = (origin || '').replace(/\/$/, '') ||
      process.env.FRONTEND_URL ||
      process.env.APP_URL ||
      'https://rohit98k-payroll-portal.vercel.app';
    verifyUrl = `${finalAppUrl}/verify?token=${token}`;
  }

  console.log(`✉️ Sending verification email to: ${user.email}`);

  const transporter = await createSMTPTransporter();

  const mailOptions = {
    from: buildFromAddress('PaySlip Pro'),
    to: user.email,
    subject: `Verify Your PaySlip Pro Account`,
    html: `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6fa; font-family: 'Segoe UI', Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6fa; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden;">
          <tr><td height="6" bgcolor="#FFBE11" style="font-size: 0; line-height: 0;">&nbsp;</td></tr>
          <tr>
            <td bgcolor="#58833b" style="padding: 40px 45px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800;">PaySlip Pro</h1>
              <p style="margin: 8px 0 0 0; color: #d0e8c0; font-size: 14px;">Professional Payroll Management</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 45px;">
              <p style="margin: 0 0 20px 0; font-size: 18px; font-weight: 700; color: #374151;">Hi ${user.companyName || 'there'},</p>
              <p style="margin: 0 0 30px 0; font-size: 15px; color: #6b7280; line-height: 1.6;">
                Thank you for registering with PaySlip Pro. Click the button below to verify your account.
              </p>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${verifyUrl}" style="display: inline-block; background: #58833b; color: #ffffff; padding: 16px 36px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">
                      Verify My Account
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0 0; font-size: 12px; color: #9ca3af;">
                Or copy this link: <a href="${verifyUrl}" style="color: #58833b;">${verifyUrl}</a><br/>
                This link expires in 24 hours.
              </p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#f9fafb" style="padding: 20px 45px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">&copy; 2026 PaySlip Pro. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to: ${user.email}`);
  } catch (err) {
    console.error(`❌ Verification email SMTP error: ${err.message}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Send payslip as PDF attachment to the employee's email
// ─────────────────────────────────────────────────────────────
async function sendPayslipEmail(payslip) {
  // Use a development test account if SMTP credentials are not configured.
  // In production, missing credentials should still be addressed by setting EMAIL_USER and EMAIL_PASS.

  // Generate PDF attachment
  console.log('📄 Generating PDF buffer for email...');
  const pdfBuffer = await generatePayslipPDFBuffer(payslip);

  if (!pdfBuffer || pdfBuffer.length < 100) {
    throw new Error('PDF generation produced an empty or invalid file. Cannot send email.');
  }
  console.log(`✅ PDF Buffer ready: ${pdfBuffer.length} bytes`);

  const transporter = await createSMTPTransporter();


  const fileName = `Payslip_${payslip.employeeName.replace(/\s+/g, '_')}_${payslip.month}_${payslip.year}.pdf`;

  const mailOptions = {
    from: buildFromAddress(payslip.companyName),
    to: payslip.employeeEmail,
    subject: `Salary Slip for ${payslip.month} ${payslip.year} - ${payslip.companyName}`,
    html: buildEmailHTML(payslip),
    attachments: [
      {
        filename: fileName,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  console.log(`🚀 Sending email to: ${payslip.employeeEmail}`);
  const result = await transporter.sendMail(mailOptions);
  console.log(`✅ Email delivered. Message ID: ${result.messageId}`);
  return result;
}

// ─────────────────────────────────────────────────────────────
// Build clean HTML email body for payslip notification
// ─────────────────────────────────────────────────────────────
function buildEmailHTML(payslip) {
  const formatINR = (n) =>
    '₹ ' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const green = '#58833b';  // BDA Forest Green
  const gold = '#FFBE11';   // BDA Accent Gold

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Payslip - ${payslip.employeeName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6fa; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08);">
          <tr><td height="6" bgcolor="${gold}" style="font-size: 0; line-height: 0;">&nbsp;</td></tr>

          <!-- Header -->
          <tr>
            <td bgcolor="${green}" style="padding: 40px 45px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">${payslip.companyName.toUpperCase()}</h1>
              <p style="margin: 6px 0 0 0; color: #d0e8c0; font-size: 14px; font-weight: 500;">Salary Slip for ${payslip.month} ${payslip.year}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 45px;">
              <p style="margin: 0 0 20px 0; color: #374151; font-size: 17px; font-weight: 700;">Dear ${payslip.employeeName},</p>
              <p style="margin: 0 0 30px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Your payslip for <strong>${payslip.month} ${payslip.year}</strong> is attached to this email. Please find the detailed salary breakdown below.
              </p>

              <!-- Salary Summary Table -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f9fafb; border-radius: 10px; border-left: 5px solid ${green};">
                <tr>
                  <td style="padding: 20px 25px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 13px; color: #6b7280; padding-bottom: 10px;">Employee ID</td>
                        <td align="right" style="font-size: 13px; color: #374151; font-weight: 700; padding-bottom: 10px;">${payslip.employeeId}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #6b7280; padding-bottom: 10px;">Designation</td>
                        <td align="right" style="font-size: 13px; color: #374151; font-weight: 700; padding-bottom: 10px;">${payslip.designation}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px; padding-bottom: 10px;">Gross Earnings</td>
                        <td align="right" style="font-size: 13px; color: #059669; font-weight: 700; border-top: 1px solid #e5e7eb; padding-top: 12px; padding-bottom: 10px;">${formatINR(payslip.grossEarnings)}</td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #6b7280; padding-bottom: 8px;">Total Deductions</td>
                        <td align="right" style="font-size: 13px; color: #dc2626; font-weight: 700; padding-bottom: 8px;">${formatINR(payslip.totalDeductions)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Net Salary -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 20px; background-color: ${green}; border-radius: 10px; text-align: center;">
                <tr>
                  <td style="padding: 25px;">
                    <p style="margin: 0; color: #d0e8c0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Net Salary Payable</p>
                    <h2 style="margin: 8px 0 0 0; color: ${gold}; font-size: 30px; font-weight: 800;">${formatINR(payslip.netSalary)}</h2>
                  </td>
                </tr>
              </table>

              <p style="margin: 25px 0 0 0; color: #9ca3af; font-size: 12px; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                <strong>Note:</strong> Please refer to the attached PDF for the full statutory breakdown.<br/>
                For queries, contact <a href="mailto:${payslip.companyEmail || ''}" style="color: ${green}; text-decoration: none; font-weight: 600;">${payslip.companyEmail || 'HR Department'}</a>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f9fafb" style="padding: 20px 45px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">&copy; 2026 PaySlip Pro. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// ─────────────────────────────────────────────────────────────
// Send password-reset email with a secure link
// ─────────────────────────────────────────────────────────────
async function sendPasswordResetEmail(user, token, origin, customLink, kind = 'admin') {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ Email credentials missing - using Ethereal test SMTP for password reset email.');
  }

  const finalAppUrl = (origin || '').replace(/\/$/, '') ||
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    'https://rohit98k-payroll-portal.vercel.app';

  const resetUrl = customLink || `${finalAppUrl}/reset-password?token=${token}`;

  const isStaff = kind === 'staff';
  const companyName = escapeHtml(user.user?.companyName || user.companyName || 'BDA Technologies');
  const greetingName = escapeHtml(
    isStaff
      ? (user.fullName || user.email || 'there')
      : ([user.firstName, user.lastName].filter(Boolean).join(' ') || user.displayName || user.email || 'there'),
  );
  const accountEmail = escapeHtml(user.email || '');
  const productName = isStaff ? `${companyName} Staff Portal` : 'BDA OS';
  const validity = isStaff ? '15 minutes' : '1 hour';

  const subject = isStaff
    ? `Reset your ${companyName} portal password`
    : 'Reset your BDA OS password';

  console.log(`✉️ Sending ${isStaff ? 'staff portal ' : ''}password reset email to: ${user.email}`);

  const transporter = await createSMTPTransporter();

  const mailOptions = {
    from: buildFromAddress(isStaff ? companyName : 'BDA Technologies'),
    to: user.email,
    replyTo: sanitizeEmailValue(process.env.EMAIL_FROM) || sanitizeEmailValue(process.env.EMAIL_USER),
    subject,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8e0d4;">
          <tr>
            <td style="background:#1A5F4A;padding:28px 32px;">
              <p style="margin:0;color:#c8e6d9;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">${productName}</p>
              <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:600;">Reset your password</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;color:#1a1a1a;font-size:15px;line-height:1.55;">
              <p style="margin:0 0 16px;">Hi <strong>${greetingName}</strong>,</p>
              <p style="margin:0 0 16px;color:#555;">
                We received a request to reset the password for
                <strong>${productName}</strong>
                (${accountEmail}).
              </p>
              <p style="margin:0 0 24px;color:#555;">
                Use the button below to choose a new password. This link expires in
                <strong>${validity}</strong> and can only be used once.
              </p>
              <p style="margin:0 0 24px;">
                <a href="${resetUrl}" style="display:inline-block;background:#1A5F4A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Reset password</a>
              </p>
              <p style="margin:0 0 20px;padding:12px 14px;background:#e8f2ee;border-radius:8px;font-size:13px;color:#1A5F4A;line-height:1.5;">
                If you didn’t ask for this, you can ignore this email. Your password stays the same.
              </p>
              <p style="margin:0;font-size:12px;color:#888;word-break:break-all;">Or open this link:<br/>${resetUrl}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #eee9e0;font-size:11px;color:#999;line-height:1.5;">
              Automated message from BDA Technologies · please don’t reply.<br/>
              &copy; ${new Date().getFullYear()} ${isStaff ? companyName : 'BDA Technologies Private Limited'}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };

  mailOptions.headers = {
    'List-Unsubscribe': `<mailto:${sanitizeEmailValue(process.env.EMAIL_FROM) || sanitizeEmailValue(process.env.EMAIL_USER)}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Mailer': 'BDA OS Mailer',
  };
  mailOptions.from = buildFromAddress(isStaff ? companyName : 'BDA Technologies');

  try {
    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`📭 Password reset email preview available at: ${previewUrl}`);
      return previewUrl;
    }
    console.log(`✅ Password reset email accepted by SMTP`);
    console.log(`   To: ${user.email}`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Accepted: ${JSON.stringify(info.accepted)}`);
    console.log(`   Rejected: ${JSON.stringify(info.rejected)}`);
    console.log(`   SMTP response: ${info.response}`);
    if (info.rejected && info.rejected.length > 0) {
      console.warn(`⚠️ Recipient ${info.rejected.join(', ')} was REJECTED. Email NOT delivered.`);
    }
    if (!info.accepted || info.accepted.length === 0) {
      console.warn(`⚠️ No recipients accepted the email. Email NOT delivered.`);
    }
    return null;
  } catch (err) {
    console.error(`❌ Password reset email SMTP error: ${err.message}`);
    throw err;
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

async function sendMailWithRetry(transporter, mailOptions, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (err) {
      lastError = err;
      if (isNonRetryableMailError(err) || attempt >= attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }

  throw lastError;
}

// ─────────────────────────────────────────────────────────────
// Send staff portal provisioning email with a password setup link
// ─────────────────────────────────────────────────────────────
async function sendStaffProvisionEmail(staff, tempPassword, setupUrl) {
  const to = String(staff?.email || '').trim().toLowerCase();
  const companyName = staff?.user?.companyName || 'Your Company';

  if (!isValidEmail(to)) {
    throw new Error('Staff email is missing or invalid.');
  }

  console.log(`✉️ Sending staff provision email to: ${to}`);

  const transporter = await createSMTPTransporter();

  const mailOptions = {
    from: buildFromAddress(companyName),
    to,
    replyTo: sanitizeEmailValue(process.env.EMAIL_FROM) || sanitizeEmailValue(process.env.EMAIL_USER),
    subject: `Welcome to the ${companyName} Staff Portal`,
    html: buildStaffProvisionEmailHTML(staff, tempPassword, setupUrl),
    text: buildStaffProvisionEmailText(staff, tempPassword, setupUrl),
  };

  // Add headers that help email providers (especially Gmail) deliver to inbox
  // instead of spam. The key insight: when From display name doesn't match the
  // actual sender domain, Gmail often marks the message as spam/phishing.
  // Solution: use a generic "PaySlip Pro" display name (not the company name)
  // and include proper List-Unsubscribe + In-Reply-To headers.
  const senderDomain = (sanitizeEmailValue(process.env.EMAIL_FROM) || sanitizeEmailValue(process.env.EMAIL_USER) || '').split('@')[1] || 'localhost';
  mailOptions.headers = {
    'List-Unsubscribe': `<mailto:${sanitizeEmailValue(process.env.EMAIL_FROM) || sanitizeEmailValue(process.env.EMAIL_USER)}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Mailer': 'PaySlip Pro Mailer',
    'X-Entity-ID': `payslip-pro-${Date.now()}`,
  };
  // Override the From to use a clean name that matches the actual sender domain.
  // This is the #1 fix for Gmail spam-folder delivery.
  mailOptions.from = buildFromAddress('PaySlip Pro');

  try {
    const info = await sendMailWithRetry(transporter, mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`📭 Staff provision email preview available at: ${previewUrl}`);
      return { previewUrl, info };
    }
    // Log SMTP delivery details so issues can be diagnosed
    console.log(`✅ Staff provision email accepted by SMTP server`);
    console.log(`   To: ${to}`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Accepted: ${JSON.stringify(info.accepted)}`);
    console.log(`   Rejected: ${JSON.stringify(info.rejected)}`);
    console.log(`   SMTP response: ${info.response}`);
    if (info.rejected && info.rejected.length > 0) {
      console.warn(`⚠️ Recipient ${info.rejected.join(', ')} was REJECTED by SMTP. Email NOT delivered.`);
    }
    if (!info.accepted || info.accepted.length === 0) {
      console.warn(`⚠️ No recipients accepted the email. Email NOT delivered.`);
    }
    return { previewUrl: null, info };
  } catch (err) {
    console.error(`❌ Staff provision email SMTP error: ${err.message}`);
    throw err;
  }
}

function buildStaffProvisionEmailHTML(staff, tempPassword, setupUrl) {
  const fullName = escapeHtml(staff?.fullName || 'there');
  const companyName = escapeHtml(staff?.user?.companyName || 'Your Company');
  const staffEmail = escapeHtml(staff?.email || '');
  const safeSetupUrl = escapeHtml(setupUrl || '');
  const safeTempPassword = escapeHtml(tempPassword);

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6fa; font-family: 'Segoe UI', Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6fa; padding: 32px 10px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);">
          <tr><td height="6" bgcolor="#FFBE11" style="font-size: 0; line-height: 0;">&nbsp;</td></tr>
          <tr>
            <td bgcolor="#58833b" style="padding: 36px 42px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Welcome to the Staff Portal</h1>
              <p style="margin: 8px 0 0 0; color: #e6f2d8; font-size: 14px; font-weight: 600;">${companyName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 42px;">
              <p style="margin: 0 0 18px 0; font-size: 18px; font-weight: 800; color: #111827;">Hi ${fullName},</p>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.65;">
                You have been added to the team at <strong>${companyName}</strong>. Use the secure button below to set your portal password and complete your access.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Portal email: <strong>${staffEmail}</strong>
              </p>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${safeSetupUrl}" style="display: inline-block; background: #58833b; color: #ffffff; padding: 15px 34px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 15px;">
                      Set Up My Portal Access
                    </a>
                  </td>
                </tr>
              </table>
              ${safeTempPassword ? `
              <div style="margin: 24px 0 0 0; padding: 16px; border-radius: 10px; background: #fff7ed; border: 1px solid #fed7aa;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #9a3412; font-weight: 800;">Temporary password</p>
                <p style="margin: 0; font-size: 16px; color: #111827; font-weight: 800; font-family: 'Courier New', monospace; letter-spacing: 1px;">${safeTempPassword}</p>
                <p style="margin: 10px 0 0 0; font-size: 12px; color: #9a3412;">If you use this password to log in, you will be asked to change it immediately.</p>
              </div>
              ` : ''}
              <p style="margin: 24px 0 0 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
                If the button does not work, copy and paste this link into your browser:<br/>
                <a href="${safeSetupUrl}" style="color: #58833b; font-weight: 700; word-break: break-all;">${safeSetupUrl}</a>
              </p>
              <p style="margin: 24px 0 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                This setup link is valid for 24 hours. If you did not expect this email, please contact your administrator.
              </p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#f9fafb" style="padding: 22px 42px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">&copy; 2026 PaySlip Pro. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function buildStaffProvisionEmailText(staff, tempPassword, setupUrl) {
  const companyName = staff?.user?.companyName || 'Your Company';
  const fullName = staff?.fullName || 'there';
  const staffEmail = staff?.email || '';
  const passwordLine = tempPassword ? `\n\nTemporary password: ${tempPassword}\nUse it to log in once, then set a new password.` : '';

  return `Hi ${fullName},\n\nYou have been added to the team at ${companyName}.\n\nPortal email: ${staffEmail}\n\nSet up your portal access here:\n${setupUrl}${passwordLine}\n\nThis setup link is valid for 24 hours. If you did not expect this email, please contact your administrator.`;
}

// ─────────────────────────────────────────────────────────────
// Team Member Onboarding email (no default password)
// Sent when an admin adds a new team member. The employee receives
// a one-time setup link and chooses their own password. The same
// passwordResetToken / passwordResetExpires fields on the Staff
// model are reused as the setup token (24h expiry).
// ─────────────────────────────────────────────────────────────
async function sendTeamMemberOnboarding(staff, setupUrl) {
  const to = String(staff?.email || '').trim().toLowerCase();
  const companyName = staff?.user?.companyName || 'Your Company';

  if (!isValidEmail(to)) {
    throw new Error('Staff email is missing or invalid.');
  }
  if (!setupUrl) {
    throw new Error('Setup link is required to send the onboarding email.');
  }

  console.log(`✉️ Sending team member onboarding email to: ${to}`);

  const transporter = await createSMTPTransporter();

  const mailOptions = {
    from: buildFromAddress(companyName),
    to,
    replyTo: sanitizeEmailValue(process.env.EMAIL_FROM) || sanitizeEmailValue(process.env.EMAIL_USER),
    subject: 'Welcome to Payroll Portal - Set Up Your Account',
    html: buildTeamMemberOnboardingEmailHTML(staff, setupUrl),
    text: buildTeamMemberOnboardingEmailText(staff, setupUrl),
  };

  // Anti-spam headers (same pattern as sendStaffProvisionEmail)
  mailOptions.headers = {
    'List-Unsubscribe': `<mailto:${sanitizeEmailValue(process.env.EMAIL_FROM) || sanitizeEmailValue(process.env.EMAIL_USER)}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Mailer': 'PaySlip Pro Mailer',
    'X-Entity-ID': `payslip-pro-${Date.now()}`,
  };
  // Force From display name to match sender domain - fixes Gmail spam delivery
  mailOptions.from = buildFromAddress('PaySlip Pro');

  try {
    const info = await sendMailWithRetry(transporter, mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`📭 Team member onboarding email preview available at: ${previewUrl}`);
      return { previewUrl, info };
    }
    console.log(`✅ Team member onboarding email accepted by SMTP server`);
    console.log(`   To: ${to}`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Accepted: ${JSON.stringify(info.accepted)}`);
    console.log(`   Rejected: ${JSON.stringify(info.rejected)}`);
    console.log(`   SMTP response: ${info.response}`);
    if (info.rejected && info.rejected.length > 0) {
      console.warn(`⚠️ Recipient ${info.rejected.join(', ')} was REJECTED. Email NOT delivered.`);
    }
    if (!info.accepted || info.accepted.length === 0) {
      console.warn(`⚠️ No recipients accepted the email. Email NOT delivered.`);
    }
    return { previewUrl: null, info };
  } catch (err) {
    console.error(`❌ Team member onboarding email SMTP error: ${err.message}`);
    throw err;
  }
}

function buildTeamMemberOnboardingEmailHTML(staff, setupUrl) {
  const fullName = escapeHtml(staff?.fullName || 'there');
  const companyName = escapeHtml(staff?.user?.companyName || 'Your Company');
  const staffEmail = escapeHtml(staff?.email || '');
  const safeSetupUrl = escapeHtml(setupUrl || '');

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6fa; font-family: 'Segoe UI', Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6fa; padding: 32px 10px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);">
          <tr><td height="6" bgcolor="#FFBE11" style="font-size: 0; line-height: 0;">&nbsp;</td></tr>
          <tr>
            <td bgcolor="#58833b" style="padding: 36px 42px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Welcome to the Payroll Portal</h1>
              <p style="margin: 8px 0 0 0; color: #e6f2d8; font-size: 14px; font-weight: 600;">${companyName}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 42px;">
              <p style="margin: 0 0 18px 0; font-size: 18px; font-weight: 800; color: #111827;">Hi ${fullName},</p>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.65;">
                You have been added to the team at <strong>${companyName}</strong>. We're excited to have you on board!
              </p>
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #374151; line-height: 1.65;">
                To get started, please set up your password using the secure button below. This link is unique to you and can only be used once.
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Your portal email: <strong>${staffEmail}</strong>
              </p>
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${safeSetupUrl}" style="display: inline-block; background: #58833b; color: #ffffff; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 16px; letter-spacing: 0.3px;">
                      Set Your Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 28px 0 0 0; font-size: 13px; color: #6b7280; line-height: 1.6;">
                If the button does not work, copy and paste this link into your browser:<br/>
                <a href="${safeSetupUrl}" style="color: #58833b; font-weight: 700; word-break: break-all;">${safeSetupUrl}</a>
              </p>
              <p style="margin: 24px 0 0 0; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; line-height: 1.6;">
                This setup link is valid for <strong>24 hours</strong>. After you set your password, you can sign in to the Payroll Portal using the email above and your new password.<br/><br/>
                If you did not expect this email, please contact your administrator.
              </p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#f9fafb" style="padding: 22px 42px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">&copy; 2026 PaySlip Pro. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function buildTeamMemberOnboardingEmailText(staff, setupUrl) {
  const companyName = staff?.user?.companyName || 'Your Company';
  const fullName = staff?.fullName || 'there';
  const staffEmail = staff?.email || '';

  return `Hi ${fullName},

Welcome to ${companyName}! You have been added to the team on the Payroll Portal.

To get started, please set up your password by visiting the secure link below. This link is unique to you and can only be used once.

Portal email: ${staffEmail}

Set Your Password:
${setupUrl}

This setup link is valid for 24 hours. After you set your password, you can sign in to the Payroll Portal using the email above and your new password.

If you did not expect this email, please contact your administrator.

© 2026 PaySlip Pro. All rights reserved.`;
}

async function sendPunchOutReminderEmail(staff, loginUrl, details = {}) {
  console.log(`✉️ Sending punch-out reminder email to: ${staff.email}`);

  const transporter = await createSMTPTransporter();
  const {
    loginTime = 'N/A',
    shiftDate = 'N/A',
    duration = 'N/A',
    workStatus = 'In Progress',
    reason = 'Your shift has crossed the expected working window.',
    autoClosed = false,
    officeClosing = false
  } = details;

  const subject = officeClosing
    ? (autoClosed ? 'Attendance Auto-Closed at Office Closing Time' : 'Office Closed: Please Punch Out')
    : (autoClosed ? 'Shift Auto-Closed: Please Review Attendance' : 'Reminder: Please Punch Out for the Day');
  const headerTitle = autoClosed ? 'Attendance Updated' : 'Action Required';
  const headerSubtitle = officeClosing ? 'Office Closing Alert' : 'Shift Duration Alert';
  const durationLabel = autoClosed ? 'Logged Duration' : 'Current Duration';
  const statusLabel = autoClosed ? 'Final Status' : 'Current Status';
  const policyTitle = officeClosing ? 'Office Timing Policy' : 'Work Hours Policy';
  const policyBody = officeClosing
    ? `Office Hours: 10:30 AM to 7:00 PM IST<br/>
                    Closing Reminder: 7:00 PM IST<br/>
                    Grace Window: 30 minutes<br/>
                    Auto Punch-Out: 7:30 PM IST, recorded at 7:00 PM IST<br/>
                    Auto-closed attendance is flagged for HR/Admin review`
    : `Start Time: 10:30 AM<br/>
                    Half Day Threshold: Punch-in after 11:00 AM<br/>
                    Full Day: 8.5+ hours logged<br/>
                    Half Day: 4 to 7.9 hours logged<br/>
                    LOP: Less than 4 hours<br/>
                    Overtime: After 8.5h (Max 1h)`;
  const autoClosedMessage = officeClosing
    ? 'Your attendance was auto-closed at 7:00 PM IST because you were still punched in after the 30-minute office-closing grace window. Please contact HR/Admin if a correction is needed.'
    : 'Your shift has been auto-closed because it exceeded the maximum allowed duration. Please review your attendance and contact HR/Admin if correction is needed.';

  const mailOptions = {
    from: buildFromAddress('PaySlip Pro'),
    to: staff.email,
    subject,
    html: `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6fa; font-family: 'Segoe UI', Arial, sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6fa; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden;">
          <tr><td height="6" bgcolor="#e11d48" style="font-size: 0; line-height: 0;">&nbsp;</td></tr>
          <tr>
            <td bgcolor="#1e3a5f" style="padding: 40px 45px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800;">${headerTitle}</h1>
              <p style="margin: 8px 0 0 0; color: #a8c0d6; font-size: 14px;">${headerSubtitle}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 45px;">
              <p style="margin: 0 0 20px 0; font-size: 18px; font-weight: 700; color: #374151;">Hi ${staff.fullName},</p>
              <p style="margin: 0 0 10px 0; font-size: 15px; color: #6b7280; line-height: 1.6;">
                ${reason}
              </p>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 18px 0 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px;">
                <tr><td style="padding: 14px 16px; font-size: 13px; color: #111827;"><strong>Shift Date:</strong> ${shiftDate}</td></tr>
                <tr><td style="padding: 0 16px 14px; font-size: 13px; color: #111827;"><strong>Login Time:</strong> ${loginTime}</td></tr>
                <tr><td style="padding: 0 16px 14px; font-size: 13px; color: #111827;"><strong>${durationLabel}:</strong> ${duration}</td></tr>
                <tr><td style="padding: 0 16px 14px; font-size: 13px; color: #111827;"><strong>${statusLabel}:</strong> ${workStatus}</td></tr>
              </table>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 30px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px;">
                <tr>
                  <td style="padding: 14px 16px; font-size: 13px; color: #7c2d12; line-height: 1.6;">
                    <strong>${policyTitle}</strong><br/>
                    ${policyBody}
                  </td>
                </tr>
              </table>
              ${autoClosed ? `
              <p style="margin: 0 0 30px 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
                ${autoClosedMessage}
              </p>` : `
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}" style="display: inline-block; background: #e11d48; color: #ffffff; padding: 16px 36px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px;">
                      Punch Out Now
                    </a>
                  </td>
                </tr>
              </table>
              `}
            </td>
          </tr>
          <tr>
            <td bgcolor="#f9fafb" style="padding: 20px 45px; text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">&copy; 2026 PaySlip Pro. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Punch-out reminder email sent to: ${staff.email}`);
  } catch (err) {
    console.error(`❌ Punch-out reminder email SMTP error: ${err.message}`);
    throw err;
  }
}

/**
 * Clean Atlassian-style transactional layout for BDA Technologies.
 * White card, centered brand lockup, hairline rules, one CTA, trust footer.
 */
function buildBdaTrustEmailHtml({
  orgName,
  title,
  subtitle,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  closing,
  expiryNote,
  poweredBy = 'Powered by BDA OS',
}) {
  const org = escapeHtml(orgName || 'BDA Technologies');
  const safeTitle = escapeHtml(title || '');
  const safeSubtitle = escapeHtml(subtitle || '');
  const safeCta = escapeHtml(ctaLabel || 'Continue');
  const safeUrl = escapeHtml(ctaUrl || '#');
  const hasClosing = Boolean(closing && String(closing).trim());
  const safeClosing = hasClosing ? String(closing).trim() : '';
  const year = new Date().getFullYear();
  const powered = escapeHtml(poweredBy || 'Powered by BDA OS');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;">
          <tr>
            <td align="center" style="padding:24px 40px 12px;">
              <img src="cid:${BDA_LOGO_CID}" width="240" alt="BDA Technologies" style="display:block;width:240px;height:auto;max-width:240px;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:#e8ebef;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 40px 8px;">
              <h1 style="margin:0;font-size:28px;line-height:1.25;font-weight:700;color:#172b4d;letter-spacing:-0.02em;">${safeTitle}</h1>
              ${safeSubtitle ? `<p style="margin:12px 0 0;font-size:18px;line-height:1.4;font-weight:500;color:#172b4d;">${safeSubtitle}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 8px;color:#172b4d;font-size:15px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 40px 28px;">
              <a href="${safeUrl}" style="display:inline-block;background:#465a27;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:15px;font-weight:700;">${safeCta}</a>
            </td>
          </tr>
          ${hasClosing ? `
          <tr>
            <td style="padding:0 40px 28px;color:#172b4d;font-size:15px;line-height:1.6;">
              ${safeClosing}
            </td>
          </tr>` : ''}
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:#e8ebef;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 40px 8px;font-size:12px;line-height:1.6;color:#6b778c;">
              Contact us · <a href="https://www.bdatechnologies.com" style="color:#6b778c;text-decoration:underline;">bdatechnologies.com</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 40px 4px;font-size:11px;line-height:1.55;color:#6b778c;">
              Copyright ${year} ${org}. All rights reserved.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 8px;font-size:11px;line-height:1.55;color:#6b778c;">
              ${powered}
            </td>
          </tr>
          ${expiryNote ? `
          <tr>
            <td align="center" style="padding:4px 40px 36px;font-size:11px;line-height:1.55;color:#6b778c;">
              ${escapeHtml(expiryNote)}
            </td>
          </tr>` : `
          <tr>
            <td style="padding:0 0 36px;font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>`}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * BDA OS invite — accept link sets password and joins the organization.
 */
async function sendPulseInviteEmail({
  to,
  inviteUrl,
  companyName,
  loginEmail,
  firstName,
  lastName,
}) {
  const transporter = await createSMTPTransporter();
  const org = brandOrgName(companyName);
  const login = escapeHtml(loginEmail || to);
  const logo = bdaLogoAttachment();
  const greetName = String(firstName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0]
    || String(lastName || '').trim().split(/\s+/).filter(Boolean)[0]
    || 'there';
  const safeFirst = escapeHtml(greetName);

  const mailOptions = {
    from: buildFromAddress('BDA Technologies'),
    to,
    subject: 'Your BDA OS access is ready',
    html: buildBdaTrustEmailHtml({
      orgName: org,
      title: 'Your BDA OS access is ready',
      bodyHtml: `
        <p style="margin:0 0 14px;">Hi ${safeFirst},</p>
        <p style="margin:0 0 14px;">
          Your onboarding details have been received, and your BDA OS account is now ready.
        </p>
        <p style="margin:0 0 14px;">
          Use the work email shown below and click the button to set your password and access the BDA Technologies workspace.
        </p>
        <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#6b778c;">Work email</p>
        <p style="margin:0 0 0;padding:12px 14px;background:#f4f5f7;border-radius:4px;font-weight:600;color:#172b4d;">${login}</p>
      `,
      ctaLabel: 'Set password and access BDA OS',
      ctaUrl: inviteUrl,
      closing: `
        <p style="margin:0 0 14px;">If you face any difficulty accessing your account, please contact <a href="mailto:office@bda.co.in" style="color:#465a27;font-weight:600;text-decoration:none;">office@bda.co.in</a>.</p>
        <p style="margin:0 0 14px;">Once again, Welcome to BDA Technologies!</p>
        <p style="margin:0;">Regards,<br/>BDA Technologies Private Limited</p>
      `,
      poweredBy: 'Powered by BDA OS',
    }),
    ...(logo ? { attachments: [logo] } : {}),
  };

  const info = await sendMailWithRetry(transporter, mailOptions);
  return info;
}

async function sendCandidateOnboardingEmail({ to, onboardUrl, companyName, candidateName }) {
  const transporter = await createSMTPTransporter();
  const org = brandOrgName(companyName);
  const logo = bdaLogoAttachment();
  const firstName = String(candidateName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || 'there';
  const safeFirst = escapeHtml(firstName);

  const mailOptions = {
    from: buildFromAddress(org),
    to,
    subject: `Welcome to ${org}`,
    html: buildBdaTrustEmailHtml({
      orgName: org,
      title: `Welcome to ${org}!`,
      bodyHtml: `
        <p style="margin:0 0 14px;">Hi ${safeFirst},</p>
        <p style="margin:0 0 14px;">
          To complete your onboarding, please submit the required information using the button below. It should take approximately 1-2 minutes.
        </p>
        <p style="margin:0;">
          Once submitted, our HR team will verify your information, complete your employment documentation, and share your work email and sign-in instructions.
        </p>
      `,
      ctaLabel: 'Complete onboarding',
      ctaUrl: onboardUrl,
      closing: `
        <p style="margin:0 0 14px;">If you face any difficulty while submitting the form, please contact the BDA HR team.</p>
        <p style="margin:0;">Regards,<br/>BDA Technologies</p>
      `,
      poweredBy: 'Powered by BDA OS',
    }),
    ...(logo ? { attachments: [logo] } : {}),
  };

  const info = await sendMailWithRetry(transporter, mailOptions);
  return info;
}

/**
 * Leave request raised in BDA OS — sent to the team inbox that has to approve it.
 */
async function sendLeaveRequestEmail({
  to,
  employeeName,
  employeeEmail,
  leaveType,
  fromDate,
  toDate,
  days,
  reason,
  reviewUrl,
  companyName,
  attachments,
}) {
  if (!isValidEmail(to)) {
    throw new Error(`Invalid notification address: ${to}`);
  }

  const transporter = await createSMTPTransporter();
  const name = escapeHtml(employeeName || employeeEmail || 'A team member');
  const dayLabel = `${days} day${days === 1 ? '' : 's'}`;
  const org = escapeHtml(companyName || 'your organization');

  const rows = [
    ['Employee', name],
    ['Email', escapeHtml(employeeEmail || '—')],
    ['Leave type', escapeHtml(leaveType || 'Casual')],
    ['From', escapeHtml(fromDate)],
    ['To', escapeHtml(toDate)],
    ['Duration', dayLabel],
    ['Reason', escapeHtml(reason || '—')],
    attachments?.length ? ['Attachment', escapeHtml(attachments[0].filename || 'File attached')] : null,
  ].filter(Boolean)
    .map(([label, value]) => `
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#777;width:120px;vertical-align:top;">${label}</td>
                  <td style="padding:8px 0;font-size:13px;color:#1a1a1a;">${value}</td>
                </tr>`)
    .join('');

  const mailOptions = {
    from: buildFromAddress(companyName || 'BDA Technologies'),
    to,
    replyTo: isValidEmail(employeeEmail) ? employeeEmail : undefined,
    subject: `Leave approval needed — ${employeeName || employeeEmail} (${fromDate} to ${toDate})`,
    attachments: Array.isArray(attachments) && attachments.length ? attachments : undefined,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8e0d4;">
          <tr>
            <td style="background:#1A5F4A;padding:28px 32px;">
              <p style="margin:0;color:#c8e6d9;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">${org}</p>
              <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:600;">Leave request awaiting approval</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;color:#1a1a1a;font-size:15px;line-height:1.55;">
              <p style="margin:0 0 20px;"><strong>${name}</strong> requested ${dayLabel} of leave at ${org} and needs your approval.</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee9e0;border-bottom:1px solid #eee9e0;margin:0 0 24px;">${rows}
              </table>
              <p style="margin:0 0 24px;">
                <a href="${reviewUrl}" style="display:inline-block;background:#1A5F4A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Review request</a>
              </p>
              <p style="margin:0;font-size:12px;color:#888;word-break:break-all;">Or open this link:<br/>${reviewUrl}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };

  const info = await sendMailWithRetry(transporter, mailOptions);
  return info;
}

/**
 * Notify a person that their BDA OS org role changed.
 */
async function sendPulseRoleChangedEmail({
  to,
  companyName,
  personName,
  previousRole,
  nextRole,
  changedByName,
}) {
  const transporter = await createSMTPTransporter();
  const org = companyName || 'BDA Technologies';
  const roleLabel = (role) =>
    role === 'superadmin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'Member';
  const fromLabel = changedByName || 'an administrator';
  const who = personName || to;

  const mailOptions = {
    from: buildFromAddress(org),
    to,
    subject: `Your ${org} role was updated`,
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Segoe UI,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e8e0d4;">
          <tr>
            <td style="background:#1A5F4A;padding:28px 32px;">
              <p style="margin:0;color:#c8e6d9;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;">${org}</p>
              <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:600;">Role updated</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;color:#1a1a1a;font-size:15px;line-height:1.55;">
              <p style="margin:0 0 12px;">Hi ${who},</p>
              <p style="margin:0 0 12px;"><strong>${fromLabel}</strong> changed your role in <strong>${org}</strong>.</p>
              <p style="margin:0 0 8px;color:#555;">Previous role</p>
              <p style="margin:0 0 16px;padding:10px 12px;background:#f4f2ec;border-radius:8px;font-weight:600;">${roleLabel(previousRole)}</p>
              <p style="margin:0 0 8px;color:#555;">New role</p>
              <p style="margin:0 0 16px;padding:10px 12px;background:#e8f2ee;border-radius:8px;font-weight:600;color:#1A5F4A;">${roleLabel(nextRole)}</p>
              <p style="margin:0;font-size:13px;color:#888;">If you did not expect this change, contact your administrator.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  };

  const info = await sendMailWithRetry(transporter, mailOptions);
  return info;
}

module.exports = {
  sendPayslipEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendStaffProvisionEmail,
  sendTeamMemberOnboarding,
  sendPunchOutReminderEmail,
  sendPulseInviteEmail,
  sendPulseRoleChangedEmail,
  sendCandidateOnboardingEmail,
  sendLeaveRequestEmail,
};
