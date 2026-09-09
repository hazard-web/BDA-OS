const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/emailService');
const { buildVerifyLink, buildResetLink } = require('../utils/urlHelper');
const { DEFAULT_GENDER, extractIndiaState } = require('../utils/indiaLocation');
const { publicUserWithApps } = require('../utils/pulseAuth');
const { assertAllowedCompanyEmail, resolveCompanyDomain, completeCompanyEmail } = require('../utils/companyDomain');

// In-process JWT → User cache.
// Same token tends to be reused on every protected request; hitting Mongo
// each time adds a 30-80ms round-trip plus a bcrypt-shaped hydration cost.
// We cache the lean User doc keyed by token; TTL is short so password
// changes or account deletion still propagate quickly.
const AUTH_CACHE_TTL_MS = 30 * 1000;
const authCache = new Map(); // token → { user, expiresAt }

function authCacheGet(token) {
  const entry = authCache.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    authCache.delete(token);
    return null;
  }
  return entry.user;
}
function authCacheSet(token, user) {
  authCache.set(token, { user, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
  // Bound the cache size so it doesn't grow unbounded under high traffic.
  if (authCache.size > 1000) {
    const firstKey = authCache.keys().next().value;
    if (firstKey) authCache.delete(firstKey);
  }
}

// Middleware to verify JWT
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) throw new Error();

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');

    // Hot path: same token on every request → cache hit
    const cached = authCacheGet(token);
    if (cached) {
      const cachedDomain = assertAllowedCompanyEmail(cached.email);
      if (!cachedDomain.ok) {
        authCache.delete(token);
        return res.status(403).json({
          success: false,
          code: 'COMPANY_DOMAIN_REQUIRED',
          message: cachedDomain.message,
        });
      }
      req.user = cached;
      req.token = token;
      return next();
    }

    // Cold path: lean() drops the Mongoose document overhead and only
    // projects the fields the API actually needs.
    const user = await User.findById(decoded.id).lean();

    if (!user) throw new Error();

    const domainCheck = assertAllowedCompanyEmail(user.email);
    if (!domainCheck.ok) {
      return res.status(403).json({
        success: false,
        code: 'COMPANY_DOMAIN_REQUIRED',
        message: domainCheck.message,
      });
    }

    authCacheSet(token, user);
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Please authenticate' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/auth/register - Bootstrap first admin only (invite-only after)
// ─────────────────────────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const existingCount = await User.countDocuments();
    if (existingCount > 0) {
      return res.status(403).json({
        success: false,
        code: 'INVITE_ONLY',
        message: 'Pulse is invite-only. Ask your admin for an invite link.',
      });
    }

    const email = completeCompanyEmail(req.body.email);
    const { password, companyName, companyAddress, companyPhone } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const domainCheck = assertAllowedCompanyEmail(email);
    if (!domainCheck.ok) {
      return res.status(403).json({
        success: false,
        code: 'COMPANY_DOMAIN_REQUIRED',
        message: domainCheck.message,
      });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = Date.now() + 24 * 3600000;

    const address = companyAddress || '';
    const user = new User({
      email,
      password,
      companyName: companyName || '',
      companyAddress: address,
      companyPhone: companyPhone || '',
      companyEmail: email,
      companyDomain: resolveCompanyDomain(),
      companyCIN: '',
      companyGST: '',
      companyWebsite: '',
      companyLogo: '',
      gender: DEFAULT_GENDER,
      country: 'India',
      state: extractIndiaState(address),
      role: 'admin',
      onboardingCompleted: false,
      pulseSetupCompleted: false,
      verificationToken,
      verificationExpires,
      isVerified: true,
    });
    await user.save();
    user.organizationId = user._id;
    await user.save();

    try {
      const verifyUrl = buildVerifyLink(verificationToken);
      await sendVerificationEmail(user, verificationToken, verifyUrl);
    } catch (emailErr) {
      console.error('📧 Email failed to send:', emailErr);
    }

    res.status(201).json({
      success: true,
      message: 'Admin account created. You can sign in now.',
    });
  } catch (err) {
    console.error('Register error:', err);
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/check-email - Does this company account exist?
// ─────────────────────────────────────────────────────────────
router.post('/check-email', async (req, res, next) => {
  try {
    const email = completeCompanyEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const domainCheck = assertAllowedCompanyEmail(email);
    if (!domainCheck.ok) {
      return res.status(403).json({
        success: false,
        exists: false,
        code: 'COMPANY_DOMAIN_REQUIRED',
        message: domainCheck.message,
      });
    }

    const user = await User.findOne({ email }).select('_id').lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        exists: false,
        message: 'No account found with this email address',
      });
    }

    return res.json({ success: true, exists: true });
  } catch (err) {
    console.error('Check email error:', err);
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/login - Login to company account
// ─────────────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const email = completeCompanyEmail(req.body.email);
    const { password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const domainCheck = assertAllowedCompanyEmail(email);
    if (!domainCheck.ok) {
      return res.status(403).json({
        success: false,
        code: 'COMPANY_DOMAIN_REQUIRED',
        message: domainCheck.message,
      });
    }

    // Project only what we need: skip the embedded 50KB base64 logo by
    // default and pull it lazily if/when needed (e.g. PDF generation).
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    let passwordMatches = false;
    try {
      passwordMatches = await user.comparePassword(password);
    } catch (compareErr) {
      console.error('Password compare failed:', compareErr);
    }

    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.companyDomain) user.companyDomain = resolveCompanyDomain();

    const isProduction = process.env.NODE_ENV === 'production';
    const skipEmailVerification =
      process.env.SKIP_EMAIL_VERIFICATION === 'true' ||
      !isProduction;

    if (!user.isVerified && !skipEmailVerification) {
      return res.status(403).json({ success: false, message: 'Please verify your email address before logging in.' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '7d' });

    // Ensure legacy accounts have an organization root
    if (!user.organizationId) {
      user.organizationId = user._id;
      if (!user.role) user.role = 'admin';
    }
    if (user.isModified()) await user.save();

    res.json({
      success: true,
      token,
      user: await publicUserWithApps(user),
    });
  } catch (err) {
    console.error('Login error:', err);
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/auth/verify-email - Verify account
// ─────────────────────────────────────────────────────────────
router.get('/verify-email', async (req, res) => {
  console.log(`🔍 Verification Request: ${req.url}`);
  try {
    let { token } = req.query;
    
    // Fallback: Manually parse if req.query is empty (some Vercel edge cases)
    if (!token && req.url.includes('token=')) {
      token = req.url.split('token=')[1];
    }
    
    if (!token) {
      console.warn('⚠️ Verification Failed: Token missing in request');
      return res.status(400).json({ success: false, message: 'Token is required', receivedUrl: req.url });
    }

    const user = await User.findOne({
      verificationToken: token,
      verificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      const isApiRequest = req.headers.accept && req.headers.accept.includes('application/json');
      if (isApiRequest) {
        return res.status(400).json({ success: false, message: 'The link is invalid or has expired.' });
      }
      return res.status(400).send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #ef4444;">Verification Failed</h1>
          <p>The link is invalid or has expired.</p>
          <a href="/login" style="color: #1e3a5f; font-weight: bold;">Back to Login</a>
        </div>
      `);
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationExpires = undefined;
    await user.save();

    const isApiRequest = req.headers.accept && req.headers.accept.includes('application/json');
    if (isApiRequest) {
      return res.json({ success: true, message: 'Email Verified Successfully!' });
    }

    const fallbackUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://rohit98k-payroll-portal.vercel.app';
    res.send(`
      <div style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #10b981;">Email Verified Successfully!</h1>
        <p>Redirecting you to the login page...</p>
        <script>
          setTimeout(() => {
            window.location.href = window.location.hostname === 'localhost' ? 'http://localhost:3000/login' : '${fallbackUrl}/login';
          }, 2000);
        </script>
        <a href="${fallbackUrl}/login" style="display: inline-block; background: #1e3a5f; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 20px;">Go to Login</a>
      </div>
    `);
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/auth/profile - Get company profile (always fresh from DB)
// ─────────────────────────────────────────────────────────────
router.get('/profile', auth, async (req, res) => {
  try {
    // Always fetch fresh from DB - never serve stale auth-cache data here.
    const user = await User.findById(req.user._id)
      .select('-password -verificationToken -verificationExpires -resetPasswordToken -resetPasswordExpires');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    let dirty = false;
    if (!user.gender) {
      user.gender = DEFAULT_GENDER;
      dirty = true;
    }
    if (!user.country) {
      user.country = 'India';
      dirty = true;
    }
    if (!user.state) {
      const fromAddress = extractIndiaState(user.companyAddress || '');
      if (fromAddress) {
        user.state = fromAddress;
        dirty = true;
      }
    }
    if (!user.organizationId) {
      user.organizationId = user._id;
      dirty = true;
    }
    if (!user.role) {
      user.role = 'admin';
      dirty = true;
    }
    if (dirty) await user.save();

    const { listActiveGrantsForEmail } = require('../utils/appCatalog');
    const assignedApps = await listActiveGrantsForEmail(user.email);
    const safe = user.toObject();
    safe.onboardingCompleted = safe.onboardingCompleted !== false;
    if (safe.pulseSetupCompleted == null) {
      safe.pulseSetupCompleted = false;
    }
    if (!safe.role) safe.role = 'admin';
    if (!safe.organizationId) safe.organizationId = safe._id;
    safe.assignedApps = assignedApps;
    safe.assignedAppCount = assignedApps.length;
    // Keep JWT auth cache in sync after admin resets / field changes.
    if (req.token) authCacheSet(req.token, safe);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, user: safe });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/auth/profile - Update company profile & logo
// ─────────────────────────────────────────────────────────────
router.put('/profile', auth, async (req, res, next) => {
  try {
    // req.user may be a lean() plain object from the auth cache (no .save()).
    // Always fetch a full Mongoose document for any write operation.
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const allowedFields = [
      'companyName', 'companyAddress', 'companyPhone', 'companyEmail',
      'companyCIN', 'companyGST', 'companyWebsite', 'companyDomain', 'companyLogo', 'industry',
      'firstName', 'lastName', 'avatarUrl', 'displayName', 'gender',
      'country', 'state', 'timezone', 'language',
    ];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) user[field] = req.body[field];
    });

    if (!user.gender) user.gender = DEFAULT_GENDER;
    if (!user.country) user.country = 'India';
    if (req.body.companyAddress !== undefined && !req.body.state) {
      const fromAddress = extractIndiaState(user.companyAddress || '');
      if (fromAddress) user.state = fromAddress;
    }

    // Normalize / replace additionalEmails when provided
    if (Array.isArray(req.body.additionalEmails)) {
      const primary = String(user.email || '').toLowerCase().trim();
      const seen = new Set([primary]);
      const cleaned = [];
      for (const item of req.body.additionalEmails) {
        const address = String(item?.email || item || '')
          .toLowerCase()
          .trim();
        if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
          return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
        }
        const extraDomain = assertAllowedCompanyEmail(address);
        if (!extraDomain.ok) {
          return res.status(403).json({
            success: false,
            code: 'COMPANY_DOMAIN_REQUIRED',
            message: extraDomain.message,
          });
        }
        if (seen.has(address)) continue;
        seen.add(address);
        cleaned.push({
          email: address,
          createdAt: item?.createdAt ? new Date(item.createdAt) : new Date(),
        });
      }
      // Block addresses already used as another account's primary email
      if (cleaned.length) {
        const taken = await User.findOne({
          email: { $in: cleaned.map((e) => e.email) },
          _id: { $ne: user._id },
        }).select('email');
        if (taken) {
          return res.status(409).json({
            success: false,
            message: `${taken.email} is already linked to another People OS account.`,
          });
        }
      }
      user.additionalEmails = cleaned;
    }

    // Promote an additional email to primary (login identity)
    if (req.body.primaryEmail) {
      const nextPrimary = String(req.body.primaryEmail || '')
        .toLowerCase()
        .trim();
      if (!nextPrimary || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextPrimary)) {
        return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
      }
      const primaryDomain = assertAllowedCompanyEmail(nextPrimary);
      if (!primaryDomain.ok) {
        return res.status(403).json({
          success: false,
          code: 'COMPANY_DOMAIN_REQUIRED',
          message: primaryDomain.message,
        });
      }
      const currentPrimary = String(user.email || '').toLowerCase().trim();
      if (nextPrimary !== currentPrimary) {
        const extras = Array.isArray(user.additionalEmails)
          ? user.additionalEmails.map((e) => String(e.email || '').toLowerCase())
          : [];
        if (!extras.includes(nextPrimary)) {
          return res.status(400).json({
            success: false,
            message: 'That email is not on your account. Add it first.',
          });
        }
        const clash = await User.findOne({ email: nextPrimary, _id: { $ne: user._id } }).select('_id');
        if (clash) {
          return res.status(409).json({
            success: false,
            message: 'That email is already used by another account.',
          });
        }
        const rest = extras.filter((e) => e !== nextPrimary);
        if (currentPrimary) rest.unshift(currentPrimary);
        user.email = nextPrimary;
        user.additionalEmails = [...new Set(rest)].map((email) => ({ email, createdAt: new Date() }));
      }
    }

    await user.save();

    // Bust the in-process auth cache so the next GET /profile returns
    // the freshly saved data instead of the stale lean object.
    const token = req.token;
    if (token) authCache.delete(token);

    const safe = user.toObject();
    delete safe.password;
    delete safe.verificationToken;
    delete safe.verificationExpires;
    delete safe.resetPasswordToken;
    delete safe.resetPasswordExpires;

    res.json({ success: true, message: 'Profile updated', user: safe });
  } catch (err) {
    console.error('Profile update error:', err);
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/complete-onboarding - HR org setup wizard finish
// ─────────────────────────────────────────────────────────────
router.post('/complete-onboarding', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const companyName = String(req.body.companyName || '').trim();
    if (!companyName) {
      return res.status(400).json({ success: false, message: 'Organization name is required.' });
    }

    user.companyName = companyName;
    if (req.body.companyAddress !== undefined) user.companyAddress = String(req.body.companyAddress || '').trim();
    if (req.body.companyPhone !== undefined) user.companyPhone = String(req.body.companyPhone || '').trim();
    if (req.body.companyEmail !== undefined) user.companyEmail = String(req.body.companyEmail || '').trim();
    if (req.body.companyDomain !== undefined) {
      user.companyDomain = String(req.body.companyDomain || '').trim().toLowerCase().replace(/^@/, '');
    }
    if (req.body.industry !== undefined) user.industry = String(req.body.industry || '').trim();

    if (!user.gender) user.gender = DEFAULT_GENDER;
    if (!user.country) user.country = 'India';
    const fromAddress = extractIndiaState(user.companyAddress || '');
    if (fromAddress) user.state = fromAddress;
    else if (req.body.state) user.state = String(req.body.state || '').trim();

    user.onboardingCompleted = true;
    if (!user.role) user.role = 'admin';
    if (!user.organizationId) user.organizationId = user._id;
    const derivedDomain = resolveCompanyDomain();
    if (derivedDomain) user.companyDomain = derivedDomain;
    await user.save();

    const token = req.token;
    if (token) authCache.delete(token);

    const safe = await publicUserWithApps(user);

    res.json({ success: true, message: 'Organization setup complete', user: safe });
  } catch (err) {
    console.error('Complete onboarding error:', err);
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/pulse-setup - Pulse product company setup
// ─────────────────────────────────────────────────────────────
router.post('/pulse-setup', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const companyName = String(req.body.companyName || '').trim();
    const industry = String(req.body.industry || '').trim();
    const employeeCount = String(req.body.employeeCount || '').trim();
    let portalId = String(req.body.portalId || '').trim().slice(0, 50);

    if (!companyName) {
      return res.status(400).json({ success: false, message: 'Company name is required.' });
    }
    if (!industry) {
      return res.status(400).json({ success: false, message: 'Industry is required.' });
    }
    if (!employeeCount) {
      return res.status(400).json({ success: false, message: 'Employee count is required.' });
    }
    if (!portalId || portalId.length < 6 || portalId.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Portal name must have minimum of 6 and maximum of 50 characters',
        code: 'PORTAL_LENGTH',
      });
    }

    const portalTaken = await User.findOne({
      _id: { $ne: user._id },
      pulsePortalId: { $regex: new RegExp(`^${portalId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    }).select('_id');

    if (portalTaken) {
      return res.status(400).json({
        success: false,
        message: 'This Portal Name already exists',
        code: 'PORTAL_EXISTS',
      });
    }

    user.companyName = companyName;
    user.industry = industry;
    user.pulseEmployeeCount = employeeCount;
    user.pulsePortalId = portalId;
    user.pulseSetupCompleted = true;
    await user.save();

    const token = req.token;
    if (token) authCache.delete(token);

    const safe = user.toObject();
    delete safe.password;
    delete safe.verificationToken;
    delete safe.verificationExpires;
    delete safe.resetPasswordToken;
    delete safe.resetPasswordExpires;

    res.json({ success: true, message: 'Pulse account ready', user: safe });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'This Portal Name already exists',
        code: 'PORTAL_EXISTS',
      });
    }
    console.error('Pulse setup error:', err);
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password - Send reset link to email
// ─────────────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = completeCompanyEmail(req.body.email);
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

    const domainCheck = assertAllowedCompanyEmail(email);
    if (!domainCheck.ok) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const user = await User.findOne({ email });
    // Always respond success to prevent email enumeration
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Always use centralized URL helper - never use request origin for reset links
    const resetLink = buildResetLink(resetToken);

    // In dev (no NODE_ENV=production), always print the link to the terminal
    // so devs can recover accounts even without a working SMTP setup.
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n────────────────────────────────────────────────────');
      console.log('🔑 DEV MODE - Password Reset Link');
      console.log(`   For: ${user.email}`);
      console.log(`   Link: ${resetLink}`);
      console.log('   (Valid for 1 hour)');
      console.log('────────────────────────────────────────────────────\n');
    }

    try {
      const { sendPasswordResetEmail } = require('../utils/emailService');
      // Pass pre-built URL as customLink (4th param) to override the built-in URL construction
      const previewUrl = await sendPasswordResetEmail(user, resetToken, '', resetLink);
      // If SMTP is not configured and Ethereal is used, the function returns a previewUrl.
      // Surface it so the frontend can show "View test email" link.
      if (previewUrl && process.env.NODE_ENV !== 'production') {
        console.log(`📭 Ethereal preview URL: ${previewUrl}`);
      }
      res.json({
        success: true,
        message: 'If that email exists, a reset link has been sent.',
        // Surface the link in non-production so the UI can offer a "Use this link" button
        ...(process.env.NODE_ENV !== 'production' && { devResetLink: resetLink }),
        // If using Ethereal, give a way to view the actual email
        ...(previewUrl && process.env.NODE_ENV !== 'production' && { devEmailPreview: previewUrl }),
      });
    } catch (emailErr) {
      console.error('📧 Password reset email failed (dev link above still works):', emailErr.message);
      res.json({
        success: true,
        message: 'If that email exists, a reset link has been sent.',
        ...(process.env.NODE_ENV !== 'production' && { devResetLink: resetLink }),
      });
    }
  } catch (err) {
    console.error('Forgot-password error:', err);
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/reset-password - Set new password using token
// ─────────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'The reset link is invalid or has expired.' });
    }

    user.password = password; // will be hashed by pre-save hook
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    console.error('Reset-password error:', err);
    return next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/auth/dev-latest-reset-link - DEV-ONLY
// Returns the latest active reset link for an email so devs can
// recover accounts when SMTP is broken. Disabled in production.
// ─────────────────────────────────────────────────────────────
router.post('/dev-latest-reset-link', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  const email = req.body.email?.trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

  const user = await User.findOne({ email });
  if (!user || !user.resetPasswordToken || user.resetPasswordExpires < Date.now()) {
    return res.status(404).json({ success: false, message: 'No active reset link for that email. Trigger a forgot-password first.' });
  }
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const link = `${frontendUrl}/reset-password?token=${user.resetPasswordToken}`;
  console.log('🔑 DEV latest-reset-link served for', email, '→', link);
  res.json({ success: true, link });
});

module.exports = { router, auth };
