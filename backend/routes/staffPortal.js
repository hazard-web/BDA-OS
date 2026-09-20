const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const Staff = require('../models/Staff');
const User = require('../models/User'); // Required to get company details if needed
const { uploadBase64 } = require('../utils/cloudinary');

// ── Raw DB helpers ────────────────────────────────────────────
// The staffs collection has a problematic email index on Atlas M0 that causes
// queries filtered by email to hang indefinitely. We bypass Mongoose model
// queries entirely and use the raw MongoDB driver via mongoose.connection.db.
// All filtering is done in Node.js memory after fetching with no filter.
async function rawFindStaffByEmail(email) {
  const db = mongoose.connection.db;
  const normalized = email.toLowerCase().trim();
  return await db.collection('staffs').findOne({ email: normalized });
}
async function rawFindStaffById(id) {
  const db = mongoose.connection.db;
  const oid = typeof id === 'string' ? new ObjectId(id) : id;
  return db.collection('staffs').findOne({ _id: oid });
}
async function rawFindUserById(id) {
  if (!id) return null;
  const db = mongoose.connection.db;
  const oid = typeof id === 'string' ? new ObjectId(id) : id;
  return db.collection('users').findOne({ _id: oid });
}
async function rawUpdateStaff(id, update) {
  const db = mongoose.connection.db;
  const oid = typeof id === 'string' ? new ObjectId(id) : id;
  return db.collection('staffs').updateOne({ _id: oid }, { $set: update });
}
const Payslip = require('../models/Payslip');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const { sendPasswordResetEmail } = require('../utils/emailService');
const { closeAttendanceSession, getDayStart } = require('../utils/attendanceService');

// PAN validator
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i;
const isValidPAN = (pan) => typeof pan === 'string' && PAN_REGEX.test(pan);

// IFSC validator
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

// Required fields for the employee self-service profile-completion form
const PROFILE_REQUIRED_FIELDS = [
  'panNumber',
  'dob',
  'gender',
  'address.street',
  'address.city',
  'address.state',
  'address.pincode',
  'emergencyContact.name',
  'emergencyContact.phone',
  'bankDetails.accountHolderName',
  'bankDetails.bankName',
  'bankDetails.accountNumber',
  'bankDetails.ifscCode',
  'documents.profileImage.url',
  'documents.aadharCard.url',
  'documents.panCard.url',
];

const DOCUMENT_TYPES = ['aadharCard', 'panCard', 'profileImage'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024; // 3 MB

const getNested = (obj, path) =>
  path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);

const isProfileComplete = (staff) => {
  const allFields = PROFILE_REQUIRED_FIELDS.every((p) => {
    const v = getNested(staff, p);
    return v !== undefined && v !== null && String(v).trim() !== '';
  });
  const nameValid = staff.fullName && staff.fullName !== 'Pending Onboarding' && staff.fullName.trim() !== '';
  const phoneValid = staff.phone && staff.phone.trim() !== '';
  return allFields && nameValid && phoneValid;
};

// Middleware to verify Staff JWT
const authStaff = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      console.warn('⚠️  [authStaff] No token provided in Authorization header');
      throw new Error('No token');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    } catch (jwtErr) {
      console.warn('⚠️  [authStaff] JWT verification failed:', jwtErr.message);
      throw jwtErr;
    }

    if (decoded.aud !== 'staff') {
      console.warn('⚠️  [authStaff] Invalid token audience:', decoded.aud);
      throw new Error('Invalid token audience');
    }

    console.log('🔐 [authStaff] Verifying staff ID:', decoded.id);
    const staff = await rawFindStaffById(decoded.id);
    if (!staff || !staff.isPortalEnabled) {
      console.warn('⚠️  [authStaff] Staff not found or portal disabled for ID:', decoded.id);
      throw new Error('Access denied');
    }
    
    const user = await rawFindUserById(staff.user);
    staff.user = user;
    
    // Custom save function for raw driver object compatibility
    staff.save = async function() {
      const db = mongoose.connection.db;
      const userBackup = this.user;
      this.user = userBackup && userBackup._id ? userBackup._id : userBackup;
      
      const docToSave = { ...this };
      delete docToSave.save;
      
      await db.collection('staffs').replaceOne({ _id: this._id }, docToSave);
      this.user = userBackup;
    };
    
    console.log('✅ [authStaff] Authenticated staff:', staff.email);

    req.staff = staff;
    req.token = token;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Please authenticate as staff' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/portal/check-email - Does this staff portal account exist?
// ─────────────────────────────────────────────────────────────
router.post('/check-email', async (req, res, next) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const staff = await rawFindStaffByEmail(email);
    if (!staff || !staff.isPortalEnabled) {
      return res.status(404).json({
        success: false,
        exists: false,
        message: 'No account found with this email address',
      });
    }

    return res.json({ success: true, exists: true });
  } catch (err) {
    console.error('Portal check email error:', err);
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/portal/login - Staff Login
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      console.warn('⚠️  [portal/login] Missing email or password in request body');
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    console.log('🔑 [portal/login] ─── LOGIN ATTEMPT ─────────────────────────');
    console.log('🔑 [portal/login] Email:', email);
    console.log('🔑 [portal/login] Step 1: Fetching all staff docs (raw driver, in-memory email match)...');
    
    const staff = await rawFindStaffByEmail(email);
    console.log('🔑 [portal/login] Step 1 done. Found staff:', !!staff);
    
    if (!staff) {
      console.warn('⚠️  [portal/login] No staff found for email:', email);
      return res.status(401).json({ success: false, message: 'No account found with that email address.' });
    }

    console.log('🔑 [portal/login] Step 2: Fetching parent User document (raw driver)...');
    const user = await rawFindUserById(staff.user);
    console.log('🔑 [portal/login] Step 2 done. Found user:', !!user);
    staff.user = user;

    if (!staff.isPortalEnabled) {
      console.warn('⚠️  [portal/login] Portal not enabled for:', email);
      return res.status(401).json({ success: false, message: 'Your portal access has not been activated yet. Please check your email for a setup link or contact your administrator.' });
    }

    // Check lock state
    if (staff.lockUntil && new Date(staff.lockUntil) > new Date()) {
      const waitMinutes = Math.ceil((new Date(staff.lockUntil) - Date.now()) / 60000);
      console.warn('⚠️  [portal/login] Account locked for:', email, '| Unlocks in', waitMinutes, 'min');
      return res.status(423).json({ success: false, message: `Account locked. Try again in ${waitMinutes} minutes.` });
    }

    // Staff was invited but never completed the account setup via the email link.
    if (!staff.portalPassword) {
      console.warn('⚠️  [portal/login] No portal password set for:', email, '(account setup incomplete)');
      return res.status(401).json({
        success: false,
        message: 'Your account setup is not complete. Please check your email for the setup link and set your password first.'
      });
    }

    console.log('🔑 [portal/login] Step 3: Comparing password hash...');
    const isMatch = await bcrypt.compare(password, staff.portalPassword);
    console.log('🔑 [portal/login] Step 3 done. Password match:', isMatch);
    
    if (!isMatch) {
      const newAttempts = (staff.loginAttempts || 0) + 1;
      const updateData = { loginAttempts: newAttempts };
      if (newAttempts >= 5) {
        updateData.lockUntil = new Date(Date.now() + 15 * 60000);
      }
      await rawUpdateStaff(staff._id, updateData);
      
      const attemptsLeft = Math.max(0, 5 - newAttempts);
      const lockMsg = attemptsLeft === 0
        ? 'Too many failed attempts. Account locked for 15 minutes.'
        : `Incorrect password. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before lockout.`;
      console.warn('⚠️  [portal/login] Wrong password for:', email, '| Attempts:', newAttempts, '| Left:', attemptsLeft);
      return res.status(401).json({ success: false, message: lockMsg });
    }

    console.log('🔑 [portal/login] Step 4: Updating last login timestamp (raw driver)...');
    await rawUpdateStaff(staff._id, {
      loginAttempts: 0,
      lockUntil: null,
      lastLogin: new Date()
    });
    console.log('🔑 [portal/login] Step 4 done.');

    // Run previous-day attendance auto punch-out in the background so it
    // does NOT block the login response. The JWT is returned immediately
    // after bcrypt succeeds; the cleanup still runs asynchronously.
    setImmediate(async () => {
      try {
        const previousDay = getDayStart(new Date());
        previousDay.setUTCDate(previousDay.getUTCDate() - 1);
        const previousDayAttendance = await Attendance.findOne({
          staff: staff._id,
          date: previousDay,
        });

        if (previousDayAttendance) {
          const activeSession = Array.isArray(previousDayAttendance.sessions)
            ? previousDayAttendance.sessions.find((session) => session && session.isActive)
            : null;
          if (activeSession) {
            const closeResult = closeAttendanceSession(previousDayAttendance, {
              endTime: new Date(previousDay.getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000 + 999),
              source: 'AUTO_PUNCH_OUT',
              reason: 'System auto punch out at end of day'
            });
            if (closeResult.success) {
              previousDayAttendance.lastAutoPunchOutAt = new Date();
              previousDayAttendance.lastAutoPunchOutReason = 'System auto punch out at end of day';
              previousDayAttendance.notes = previousDayAttendance.notes ? `${previousDayAttendance.notes}\n` : '' + 'System auto punch out at end of day';
              await previousDayAttendance.save();
              await new Notification({
                admin: staff.user,
                staff: staff._id,
                recipientType: 'staff',
                type: 'ATTENDANCE_ALERT',
                referenceId: previousDayAttendance._id,
                message: 'Your previous day attendance was automatically punched out by the system because no manual punch-out was recorded.'
              }).save();
            }
          }
        }
      } catch (bgErr) {
        console.error('[portal/login] Background attendance cleanup failed:', bgErr.message);
      }
    });

    // Sign JWT with audience 'staff'
    console.log('🔑 [portal/login] Step 5: Signing JWT token...');
    const token = jwt.sign(
      { id: staff._id, aud: 'staff' }, 
      process.env.JWT_SECRET || 'fallback_secret', 
      { expiresIn: '1d' }
    );
    console.log('✅ [portal/login] LOGIN SUCCESS for:', email, '| Staff:', staff.fullName);

    res.json({
      success: true,
      token,
      mustChangePassword: staff.mustChangePassword,
      staff: {
        id: staff._id,
        fullName: staff.fullName,
        email: staff.email,
        phone: staff.phone || '',
        employeeId: staff.employeeId,
        designation: staff.designation,
        department: staff.department,
        type: staff.type,
        joiningDate: staff.joiningDate,
        profileCompleted: staff.profileCompleted,
        // Self-service profile fields
        panNumber: staff.panNumber || '',
        dob: staff.dob,
        gender: staff.gender || '',
        address: staff.address || {},
        emergencyContact: staff.emergencyContact || {},
        bankDetails: staff.bankDetails || {},
        documents: staff.documents || {},
        companyName: staff.user?.companyName,
        companyLogo: staff.user?.companyLogo,
      }
    });

  } catch (err) {
    console.error('\n🔴 [portal/login] ═════════════════════════════════');
    console.error('🔴 [portal/login] UNHANDLED ERROR IN LOGIN ROUTE');
    console.error('🔴 [portal/login] Name   :', err.name);
    console.error('🔴 [portal/login] Message:', err.message);
    if (err.stack) console.error('🔴 [portal/login] Stack  :\n', err.stack);
    console.error('🔴 [portal/login] ═════════════════════════════════\n');
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/portal/change-password - Mandatory First Login Change
// ─────────────────────────────────────────────────────────────
router.post('/change-password', authStaff, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!req.staff.mustChangePassword) {
      return res.status(400).json({ success: false, message: 'Password change not mandatory' });
    }

    const isMatch = await req.staff.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password incorrect' });
    }

    // Password rules validation
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!regex.test(newPassword)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.' 
      });
    }

    req.staff.portalPassword = newPassword;
    req.staff.mustChangePassword = false;
    if (typeof req.staff.markModified === 'function') {
      req.staff.markModified('portalPassword');
    }
    await req.staff.save();

    res.json({ success: true, message: 'Password updated successfully' });

  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/portal/forgot-password - Send Reset Link
// ─────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    console.log('🔑 [forgot-password] Request for:', email);

    // Use raw driver to bypass collection lock
    const staff = await rawFindStaffByEmail(email);
    
    // Security: always return success to prevent email enumeration
    if (!staff || !staff.isPortalEnabled) {
      console.warn('⚠️  [forgot-password] Staff not found or portal disabled for:', email);
      return res.json({ success: true, message: 'If that email exists and has portal access, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Save token via raw driver (no Mongoose save needed)
    await rawUpdateStaff(staff._id, {
      passwordResetToken: resetToken,
      passwordResetExpires: new Date(Date.now() + 15 * 60000),
    });
    console.log('🔑 [forgot-password] Reset token saved for:', email);

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const origin = req.get('origin') || frontendUrl;
      const resetLink = `${(origin || frontendUrl).replace(/\/$/, '')}/portal/reset-password?token=${resetToken}`;

      if (process.env.NODE_ENV !== 'production') {
        console.log('\n────────────────────────────────────────────────────');
        console.log('🔑 DEV MODE - Portal Password Reset Link');
        console.log(`   For: ${staff.email}`);
        console.log(`   Link: ${resetLink}`);
        console.log('   (Valid for 15 minutes)');
        console.log('────────────────────────────────────────────────────\n');
      }

      const previewUrl = await sendPasswordResetEmail(staff, resetToken, origin, resetLink, 'staff');
      if (previewUrl && process.env.NODE_ENV !== 'production') {
        console.log(`💭 Ethereal preview URL: ${previewUrl}`);
      }
      res.json({
        success: true,
        message: 'If that email exists and has portal access, a reset link has been sent.',
        ...(process.env.NODE_ENV !== 'production' && { devResetLink: resetLink }),
        ...(previewUrl && process.env.NODE_ENV !== 'production' && { devEmailPreview: previewUrl }),
      });
    } catch (emailErr) {
      console.error('🔴 [forgot-password] Email send failed:', emailErr.message);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const origin = req.get('origin') || frontendUrl;
      const resetLink = `${(origin || frontendUrl).replace(/\/$/, '')}/portal/reset-password?token=${resetToken}`;
      res.json({
        success: true,
        message: 'If that email exists and has portal access, a reset link has been sent.',
        ...(process.env.NODE_ENV !== 'production' && { devResetLink: resetLink }),
      });
    }
  } catch (err) {
    console.error('🔴 [forgot-password] Error:', err.message, err.stack);
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/portal/reset-password - Set New Password
// ─────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    console.log('🔑 [reset-password] Token received:', token ? token.substring(0, 10) + '...' : 'MISSING');

    if (!token) {
      return res.status(400).json({ success: false, message: 'Reset token is required' });
    }

    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!regex.test(password || '')) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
      });
    }

    // Use raw driver - query directly by token
    console.log('🔑 [reset-password] Looking up staff by reset token (raw driver)...');
    const db = mongoose.connection.db;
    const staff = await db.collection('staffs').findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() }
    });
    console.log('🔑 [reset-password] Staff found:', !!staff);

    if (!staff) {
      return res.status(400).json({ success: false, message: 'Token invalid or expired' });
    }

    // Hash the new password directly (bypasses Mongoose pre-save hook)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await rawUpdateStaff(staff._id, {
      portalPassword: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
      mustChangePassword: false,
    });
    console.log('✅ [reset-password] Password updated for:', staff.email);

    res.json({ success: true, message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    console.error('🔴 [reset-password] Error:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Failed to reset password. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/portal/setup-password - First-time account setup
// Used by new team members who received a setup link by email.
// Activates the account: sets portalPassword (bcrypt-hashed by the
// pre-save hook), clears the setup token, and marks mustChangePassword
// false so the user can use the new password directly to log in.
// ─────────────────────────────────────────────────────────────
router.post('/setup-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    console.log('🔑 [setup-password] Token received:', token ? token.substring(0, 10) + '...' : 'MISSING');

    if (!token) {
      return res.status(400).json({ success: false, message: 'Setup token is required' });
    }

    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!regex.test(password || '')) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
      });
    }

    // Use raw driver - query directly by token
    console.log('🔑 [setup-password] Looking up staff by setup token (raw driver)...');
    const db = mongoose.connection.db;
    const staff = await db.collection('staffs').findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() }
    });
    console.log('🔑 [setup-password] Staff found:', !!staff);

    if (!staff) {
      return res.status(400).json({ success: false, message: 'Setup link is invalid or has expired. Please ask your administrator to resend a new invitation.' });
    }

    if (!staff.isPortalEnabled) {
      return res.status(400).json({ success: false, message: 'This account is not active. Please contact your administrator.' });
    }

    // Hash password directly (bypasses Mongoose pre-save hook)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await rawUpdateStaff(staff._id, {
      portalPassword: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
      mustChangePassword: false,
      lastLogin: null,
    });
    console.log(`✅ [setup-password] Account activated: ${staff.email} (${staff.fullName})`);

    res.json({
      success: true,
      message: 'Password set successfully. You can now log in to the Team Portal.',
      staff: {
        email: staff.email,
        fullName: staff.fullName,
      },
    });
  } catch (err) {
    console.error('🔴 [setup-password] Error:', err.message, err.stack);
    res.status(500).json({ success: false, message: 'Failed to set password. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/portal/me - Get Profile
// ─────────────────────────────────────────────────────────────
router.get('/me', authStaff, async (req, res) => {
  const s = req.staff;
  res.json({
    success: true,
    staff: {
      id: s._id,
      fullName: s.fullName,
      email: s.email,
      phone: s.phone,
      employeeId: s.employeeId,
      designation: s.designation,
      department: s.department,
      type: s.type,
      joiningDate: s.joiningDate,
      pfNumber: s.pfNumber,
      overtimeEligible: s.overtimeEligible || false,
      workingDays: s.workingDays && s.workingDays.length ? s.workingDays : null,
      clientAssignment: s.clientAssignment || '',
      defaultWorkDays: s.user?.defaultWorkDays || [1, 2, 3, 4, 5],
      // Self-service profile fields
      panNumber: s.panNumber || '',
      dob: s.dob,
      gender: s.gender || '',
      address: s.address || {},
      emergencyContact: s.emergencyContact || {},
      bankDetails: s.bankDetails || {},
      documents: s.documents || {},
      profileCompleted: !!s.profileCompleted,
      // Legacy nested financials object (used by payslip PDFs)
      financials: s.financials,
      salaryDetails: s.salaryDetails,
      leaveBalance: s.leaveBalance,
      companyName: s.user?.companyName,
      companyLogo: s.user?.companyLogo,
    }
  });
});

// ─────────────────────────────────────────────────────────────
// PUT /api/portal/me - Update Profile
// Employees use this for both profile-completion (mandatory fields)
// and lightweight updates to their own contact info.
// Admin-controlled fields (employeeId, salaryDetails, etc.) are
// rejected here to keep this a self-service endpoint.
// ─────────────────────────────────────────────────────────────
const ADMIN_ONLY_FIELDS = [
  'role',
  'company',
  'pfNumber',
  'leaveBalance',
  'overtimeEligible',
  'workingDays',
  'clientAssignment',
  'isPortalEnabled',
  'portalPassword',
  'mustChangePassword',
  'loginAttempts',
  'lockUntil',
  'user',
  'employeeId',
  'designation',
  'department',
  'type',
  'joiningDate',
  'salaryDetails',
  'email',
];

router.put('/me', authStaff, async (req, res) => {
  try {
    // Strip any attempt to set admin-only fields
    ADMIN_ONLY_FIELDS.forEach((f) => { delete req.body[f]; });

    // PAN validation
    if (req.body.panNumber !== undefined) {
      const pan = String(req.body.panNumber || '').toUpperCase().trim();
      if (!pan) {
        return res.status(400).json({ success: false, message: 'PAN Number is required.' });
      }
      if (!isValidPAN(pan)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid PAN Number format. Expected: ABCDE1234F (5 letters, 4 digits, 1 letter).'
        });
      }
      req.body.panNumber = pan;
      // Mirror to financials for legacy payslip support
      req.staff.financials = {
        ...(req.staff.financials || {}),
        panNumber: pan,
      };
    }

    // DOB validation
    if (req.body.dob !== undefined) {
      if (req.body.dob === '' || req.body.dob === null) {
        req.body.dob = undefined;
      } else {
        const d = new Date(req.body.dob);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid date of birth.' });
        }
        req.body.dob = d;
      }
    }

    // joiningDate validation
    if (req.body.joiningDate !== undefined) {
      if (req.body.joiningDate === '' || req.body.joiningDate === null) {
        req.body.joiningDate = undefined;
      } else {
        const jd = new Date(req.body.joiningDate);
        if (Number.isNaN(jd.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid date of joining.' });
        }
        req.body.joiningDate = jd;
      }
    }

    // Gender validation
    if (req.body.gender !== undefined) {
      const allowed = ['Male', 'Female', 'Other', ''];
      if (!allowed.includes(req.body.gender)) {
        return res.status(400).json({ success: false, message: 'Invalid gender value.' });
      }
    }

    // Bank details - mirror to financials for legacy payslip support
    if (req.body.bankDetails !== undefined) {
      if (req.body.bankDetails.ifscCode) {
        const ifsc = String(req.body.bankDetails.ifscCode).toUpperCase().trim();
        if (!IFSC_REGEX.test(ifsc)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid IFSC format. Expected: 4 letters, followed by 0, followed by 6 alphanumeric characters (e.g., UTIB0000249).'
          });
        }
        req.body.bankDetails.ifscCode = ifsc;
      }
      req.staff.financials = {
        ...(req.staff.financials || {}),
        bankName: req.body.bankDetails.bankName,
        accountNumber: req.body.bankDetails.accountNumber,
        ifscCode: req.body.bankDetails.ifscCode,
      };
    }

    // Apply remaining fields (partial update - only fields present in body are touched)
    const ALLOWED = [
      'fullName', 'employeeId', 'type', 'designation', 'department', 'joiningDate', 'salaryDetails',
      'workLocation', 'email', 'phone', 'panNumber', 'dob', 'gender',
      'address', 'emergencyContact', 'bankDetails',
    ];
    ALLOWED.forEach((field) => {
      if (req.body[field] !== undefined) {
        // For nested objects (address, emergencyContact, bankDetails, salaryDetails), merge
        // the new keys into the existing object so previously-saved fields
        // are preserved when the client sends an incomplete payload.
        if (
          field === 'address' ||
          field === 'emergencyContact' ||
          field === 'bankDetails' ||
          field === 'salaryDetails'
        ) {
          req.staff[field] = {
            ...(req.staff[field] ? req.staff[field].toObject ? req.staff[field].toObject() : req.staff[field] : {}),
            ...req.body[field],
          };
        } else {
          req.staff[field] = req.body[field];
        }
      }
    });

    // Re-evaluate profileCompleted status on every update to dynamically reflect changes
    req.staff.profileCompleted = isProfileComplete(
      req.staff.toObject ? req.staff.toObject() : req.staff
    );

    await req.staff.save();

    // Return the full staff document so the frontend can refresh its
    // context and re-initialize the form from server-authoritative data
    // (no risk of dropping fields via a partial merge).
    const staffObj = req.staff.toObject ? req.staff.toObject() : req.staff;
    res.json({
      success: true,
      message: 'Profile updated successfully',
      staff: staffObj,
      profileCompleted: req.staff.profileCompleted,
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: err.message || 'Update failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/portal/me/documents/:type - Upload identity documents
// type: aadharCard | panCard | profileImage
// ─────────────────────────────────────────────────────────────
router.post('/me/documents/:type', authStaff, async (req, res) => {
  try {
    const { type } = req.params;
    const { data, originalName } = req.body;

    if (!DOCUMENT_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid document type.' });
    }
    if (!data || typeof data !== 'string') {
      return res.status(400).json({ success: false, message: 'Document data is required.' });
    }

    const match = data.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Invalid document format. Expected base64 data URL.' });
    }

    const mimeType = match[1].toLowerCase();
    const base64Data = match[2];

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return res.status(400).json({
        success: false,
        message: 'Only JPEG, PNG, WEBP images or PDF files are allowed.',
      });
    }

    const byteSize = Buffer.byteLength(base64Data, 'base64');
    if (byteSize > MAX_DOCUMENT_BYTES) {
      return res.status(400).json({ success: false, message: 'File size must be under 3MB.' });
    }

    const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1] || 'bin';
    const fileName = `${type}_${Date.now()}.${ext}`;

    if (!req.staff.documents) {
      req.staff.documents = {};
    }

    let documentUrl = data;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        documentUrl = await uploadBase64(data, `payroll_portal/documents/${req.staff._id}`);
      } catch (uploadErr) {
        return res.status(500).json({ success: false, message: `Cloudinary upload failed: ${uploadErr.message}` });
      }
    }

    req.staff.documents[type] = {
      fileName,
      originalName: originalName || fileName,
      url: documentUrl,
      uploadedAt: new Date(),
    };

    // Re-evaluate profileCompleted status on document upload to dynamically reflect changes
    req.staff.profileCompleted = isProfileComplete(
      req.staff.toObject ? req.staff.toObject() : req.staff
    );

    await req.staff.save();

    // Keep Pulse User.avatarUrl in sync when the portal profile photo is uploaded.
    if (type === 'profileImage' && documentUrl && /^https?:\/\//i.test(documentUrl)) {
      try {
        const email = String(req.staff.email || '').toLowerCase().trim();
        if (email) {
          await User.updateOne(
            { email },
            { $set: { avatarUrl: documentUrl } },
          );
        }
      } catch (syncErr) {
        console.error('Profile image → User.avatarUrl sync failed:', syncErr?.message || syncErr);
      }
    }

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      document: req.staff.documents[type],
      staff: req.staff.toObject ? req.staff.toObject() : req.staff,
      profileCompleted: req.staff.profileCompleted,
    });
  } catch (err) {
    console.error('Document upload error:', err);
    res.status(500).json({ success: false, message: err.message || 'Upload failed' });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/portal/me/profile-status
// Read-only check that returns whether the staff's profile is
// complete and which fields are still missing.
// ─────────────────────────────────────────────────────────────
router.patch('/me/profile-status', authStaff, async (req, res) => {
  const obj = req.staff.toObject ? req.staff.toObject() : req.staff;
  const missing = PROFILE_REQUIRED_FIELDS.filter((p) => {
    const v = getNested(obj, p);
    return v === undefined || v === null || String(v).trim() === '';
  });
  res.json({
    success: true,
    profileCompleted: missing.length === 0,
    missingFields: missing,
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/portal/payslips - Get Staff's Pushed Payslips (Last 3 Months)
// ─────────────────────────────────────────────────────────────
router.get('/payslips', authStaff, async (req, res) => {
  try {
    const { search } = req.query;
    
    // Filter for last 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const filter = {
      employeeId: req.staff.employeeId,
      user: req.staff.user._id,
      isPushedToPortal: true,
      createdAt: { $gte: threeMonthsAgo }
    };

    if (search) {
      filter.$or = [
        { month: { $regex: search, $options: 'i' } },
        { year: parseInt(search) || 0 }
      ];
    }

    const payslips = await Payslip.find(filter).sort({ createdAt: -1 }).lean();

    res.json({ success: true, data: payslips });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch payslips' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/portal/payslips/:id/download - Download pushed payslip as PDF (Staff)
// ─────────────────────────────────────────────────────────────
router.get('/payslips/:id/download', authStaff, async (req, res) => {
  try {
    const payslip = await Payslip.findOne({
      _id: req.params.id,
      employeeId: req.staff.employeeId,
      user: req.staff.user._id,
      isPushedToPortal: true,
    });

    if (!payslip) {
      return res.status(404).json({ success: false, message: 'Payslip not found or access denied' });
    }

    const { generatePayslipPDF } = require('../utils/pdfGenerator');
    generatePayslipPDF(payslip, res);
  } catch (err) {
    console.error('Portal PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate PDF: ' + err.message });
    }
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/portal/announcements - Active announcements for staff
// ─────────────────────────────────────────────────────────────
const Announcement = require('../models/Announcement');

router.get('/announcements', authStaff, async (req, res) => {
  try {
    const userId = req.staff.user?._id || req.staff.user;
    const now = new Date();
    // Add a 24-hour buffer to now for start date comparisons to prevent timezone/boundary offsets from hiding active announcements
    const startCompareDate = new Date(now.getTime() + 24 * 3600000);

    console.log(`[Portal] Fetching announcements for staff: ${req.staff.fullName}, admin: ${userId}`);

    const announcements = await Announcement.find({
      user: userId,
      isActive: true,
      $or: [
        { endDate: null },
        { endDate: { $gte: now } },
      ],
    }).sort({ createdAt: -1 }).lean();

    // Sort: Urgent → Important → Normal, then newest first
    const priorityOrder = { Urgent: 0, Important: 1, Normal: 2 };
    announcements.sort((a, b) => {
      const pDiff = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({ success: true, data: announcements });
  } catch (err) {
    console.error('Portal announcements error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch announcements' });
  }
});

// GET /api/portal/me/documents - Staff fetches their own documents
router.get('/me/documents', authStaff, async (req, res) => {
  try {
    const staff = req.staff;
    res.json({
      success: true,
      documents: {
        standard: staff.documents || {},
        additional: staff.additionalDocuments || []
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch documents' });
  }
});

// POST /api/portal/me/documents/additional - Staff uploads an additional document
router.post('/me/documents/additional', authStaff, async (req, res) => {
  try {
    const { documentType, data, originalName, notes } = req.body;
    const staff = req.staff;
    
    if (!documentType || !data) {
      return res.status(400).json({ success: false, message: 'Document type and file data are required' });
    }
    
    const match = data.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Invalid file format. Expected base64 data URL.' });
    }
    
    const mimeType = match[1].toLowerCase();
    const base64Data = match[2];
    
    const ALLOWED_MIMES = [
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (!ALLOWED_MIMES.includes(mimeType)) {
      return res.status(400).json({ success: false, message: 'Invalid file type. Allowed: JPEG, PNG, WEBP, PDF, DOC, DOCX, TXT, XLS, XLSX' });
    }
    
    const byteSize = Buffer.byteLength(base64Data, 'base64');
    if (byteSize > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'File size must be under 10MB.' });
    }
    
    let url = data;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      try {
        url = await uploadBase64(data, `payroll_portal/employee_records/${staff._id}`);
      } catch (uploadErr) {
        return res.status(500).json({ success: false, message: `Cloudinary upload failed: ${uploadErr.message}` });
      }
    }
    
    if (!staff.additionalDocuments) {
      staff.additionalDocuments = [];
    }
    
    const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType.includes('/') ? mimeType.split('/')[1] : 'bin';
    const fileName = `${documentType.replace(/\s+/g, '_')}_${Date.now()}.${ext}`;
    
    const newDoc = {
      documentType,
      fileName,
      originalName: originalName || fileName,
      url,
      uploadedAt: new Date(),
      notes: notes || ''
    };
    
    staff.additionalDocuments.push(newDoc);
    await staff.save();
    
    const { logActivity } = require('../utils/logger');
    const actorId = (staff.user && staff.user._id) ? staff.user._id : staff._id;
    await logActivity(actorId, 'DOCUMENT_UPLOADED', `${staff.fullName} uploaded document (${documentType})`, { staffId: staff._id });
    
    res.json({ success: true, message: 'Document uploaded successfully', documents: staff.additionalDocuments });
  } catch (err) {
    console.error('Staff document upload error:', err);
    res.status(500).json({ success: false, message: err.message || 'Upload failed' });
  }
});

// DELETE /api/portal/me/documents/additional/:docId - Staff deletes an additional document
router.delete('/me/documents/additional/:docId', authStaff, async (req, res) => {
  try {
    const { docId } = req.params;
    const staff = req.staff;
    
    if (!staff.additionalDocuments) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    
    const initialLength = staff.additionalDocuments.length;
    staff.additionalDocuments = staff.additionalDocuments.filter(doc => String(doc._id) !== docId);
    
    if (staff.additionalDocuments.length === initialLength) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    
    await staff.save();
    
    const { logActivity } = require('../utils/logger');
    const actorId = (staff.user && staff.user._id) ? staff.user._id : staff._id;
    await logActivity(actorId, 'DOCUMENT_DELETED', `${staff.fullName} deleted additional document`, { staffId: staff._id });
    
    res.json({ success: true, message: 'Document deleted successfully', documents: staff.additionalDocuments });
  } catch (err) {
    console.error('Staff document delete error:', err);
    res.status(500).json({ success: false, message: err.message || 'Delete failed' });
  }
});

module.exports = { router, authStaff };
