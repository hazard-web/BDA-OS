const express = require('express');
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { DEFAULT_GENDER } = require('../utils/indiaLocation');
const { assertAllowedCompanyEmail, resolveCompanyDomain, allowedEmailDomain } = require('../utils/companyDomain');

const router = express.Router();

const JWT_SECRET = () => process.env.JWT_SECRET || 'fallback_secret';

function frontendUrl() {
  return (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3001').replace(/\/+$/, '');
}

function backendUrl(req) {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL.replace(/\/+$/, '');
  // Vite proxies /api from :3001 → :5001. Google's redirect URI must stay on the
  // API origin, not the frontend origin, or token exchange fails.
  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    return `http://localhost:${process.env.PORT || 5001}`;
  }
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

function callbackUrl(req, provider) {
  return `${backendUrl(req)}/api/auth/oauth/${provider}/callback`;
}

/**
 * Provider configs for "Sign in using" icons.
 * A provider is enabled only when its CLIENT_ID + CLIENT_SECRET are set in env.
 */
const PROVIDERS = {
  google: {
    label: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    mapProfile: (p) => ({
      providerId: String(p.sub),
      email: p.email?.toLowerCase(),
      name: p.name || p.given_name || '',
      firstName: p.given_name || (p.name ? String(p.name).split(/\s+/)[0] : '') || '',
      lastName:
        p.family_name ||
        (p.name ? String(p.name).split(/\s+/).slice(1).join(' ') : '') ||
        '',
      picture: p.picture || '',
      emailVerified: !!p.email_verified,
    }),
  },
  facebook: {
    label: 'Facebook',
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    userUrl: 'https://graph.facebook.com/me?fields=id,name,email',
    scope: 'email public_profile',
    clientId: () => process.env.FACEBOOK_CLIENT_ID || process.env.FACEBOOK_APP_ID,
    clientSecret: () => process.env.FACEBOOK_CLIENT_SECRET || process.env.FACEBOOK_APP_SECRET,
    mapProfile: (p) => ({
      providerId: String(p.id),
      email: p.email?.toLowerCase(),
      name: p.name || '',
      emailVerified: !!p.email,
    }),
  },
  linkedin: {
    label: 'LinkedIn',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    userUrl: 'https://api.linkedin.com/v2/userinfo',
    scope: 'openid profile email',
    clientId: () => process.env.LINKEDIN_CLIENT_ID,
    clientSecret: () => process.env.LINKEDIN_CLIENT_SECRET,
    mapProfile: (p) => ({
      providerId: String(p.sub),
      email: p.email?.toLowerCase(),
      name: p.name || '',
      emailVerified: !!p.email_verified,
    }),
  },
  x: {
    label: 'X',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    userUrl: 'https://api.twitter.com/2/users/me?user.fields=confirmed_email,name,username',
    scope: 'users.read tweet.read offline.access',
    // X OAuth2 requires PKCE
    usePkce: true,
    clientId: () => process.env.X_CLIENT_ID || process.env.TWITTER_CLIENT_ID,
    clientSecret: () => process.env.X_CLIENT_SECRET || process.env.TWITTER_CLIENT_SECRET,
    mapProfile: (p) => {
      const u = p.data || p;
      return {
        providerId: String(u.id),
        email: u.confirmed_email?.toLowerCase() || undefined,
        name: u.name || u.username || '',
        emailVerified: !!u.confirmed_email,
      };
    },
  },
  apple: {
    label: 'Apple',
    authUrl: 'https://appleid.apple.com/auth/authorize',
    tokenUrl: 'https://appleid.apple.com/auth/token',
    scope: 'name email',
    responseMode: 'form_post',
    clientId: () => process.env.APPLE_CLIENT_ID,
    clientSecret: () => process.env.APPLE_CLIENT_SECRET,
    mapProfile: () => null, // handled specially from id_token
  },
  microsoft: {
    label: 'Microsoft',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userUrl: 'https://graph.microsoft.com/v1.0/me',
    scope: 'openid email profile User.Read',
    clientId: () => process.env.MICROSOFT_CLIENT_ID,
    clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET,
    mapProfile: (p) => ({
      providerId: String(p.id),
      email: (p.mail || p.userPrincipalName || '').toLowerCase(),
      name: p.displayName || '',
      emailVerified: true,
    }),
  },
  github: {
    label: 'Github',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    emailsUrl: 'https://api.github.com/user/emails',
    scope: 'read:user user:email',
    clientId: () => process.env.GITHUB_CLIENT_ID,
    clientSecret: () => process.env.GITHUB_CLIENT_SECRET,
    mapProfile: (p) => ({
      providerId: String(p.id),
      email: p.email?.toLowerCase(),
      name: p.name || p.login || '',
      emailVerified: true,
    }),
  },
  gitlab: {
    label: 'Gitlab',
    authUrl: 'https://gitlab.com/oauth/authorize',
    tokenUrl: 'https://gitlab.com/oauth/token',
    userUrl: 'https://gitlab.com/api/v4/user',
    scope: 'read_user',
    clientId: () => process.env.GITLAB_CLIENT_ID,
    clientSecret: () => process.env.GITLAB_CLIENT_SECRET,
    mapProfile: (p) => ({
      providerId: String(p.id),
      email: p.email?.toLowerCase(),
      name: p.name || p.username || '',
      emailVerified: !!p.email,
    }),
  },
};

function isEnabled(key) {
  const p = PROVIDERS[key];
  return !!(p && p.clientId() && p.clientSecret());
}

function signState(payload) {
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: '20m' });
}

function verifyState(token) {
  return jwt.verify(token, JWT_SECRET());
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** One-time auth codes - reload of callback URL must not look like a crash */
const usedOAuthCodes = new Map(); // code → expiresAt
function rememberUsedCode(code) {
  if (!code) return;
  const now = Date.now();
  usedOAuthCodes.set(code, now + 15 * 60 * 1000);
  if (usedOAuthCodes.size > 500) {
    for (const [k, exp] of usedOAuthCodes) {
      if (exp < now) usedOAuthCodes.delete(k);
    }
  }
}
function wasCodeUsed(code) {
  const exp = usedOAuthCodes.get(code);
  if (!exp) return false;
  if (exp < Date.now()) {
    usedOAuthCodes.delete(code);
    return false;
  }
  return true;
}

function friendlyOAuthError(raw, providerLabel = 'Google') {
  const s = String(raw || '').toLowerCase();
  if (!s) return `${providerLabel} sign-in failed. Please try again.`;
  if (
    s.includes('invalid_grant') ||
    s.includes('code was already redeemed') ||
    s.includes('invalid_code') ||
    s.includes('authorization code') ||
    s.includes('already used')
  ) {
    return `This ${providerLabel} sign-in link expired or was already used. Please try again.`;
  }
  if (
    s.includes('state') ||
    s.includes('jwt expired') ||
    s.includes('jwt malformed') ||
    s.includes('session expired') ||
    s.includes('token expired')
  ) {
    return `Your ${providerLabel} sign-in session expired. Please try again.`;
  }
  if (s.includes('access_denied') || s.includes('user denied')) {
    return `${providerLabel} sign-in was cancelled.`;
  }
  if (
    s.includes('fetch failed') ||
    s.includes('failed to fetch') ||
    s.includes('network') ||
    s.includes('enotfound') ||
    s.includes('econnreset') ||
    s.includes('etimedout') ||
    s.includes('eai_again') ||
    s.includes('certificate')
  ) {
    return `Could not reach ${providerLabel}. Check that this computer is online, then try again.`;
  }
  if (s.length > 160) return `${providerLabel} sign-in failed. Please try again.`;
  return String(raw);
}

function redirectError(res, message, provider = 'google', intent = '') {
  const q = new URLSearchParams({
    oauth_error: friendlyOAuthError(message, PROVIDERS[provider]?.label || 'Google'),
    provider,
  });
  if (intent === 'workspace-apps') {
    return res.redirect(`${frontendUrl()}/account?${q}&section=connected-apps`);
  }
  return res.redirect(`${frontendUrl()}/login?${q}`);
}

function redirectSuccess(res, token, extras = {}) {
  const q = new URLSearchParams({ token, ...extras });
  return res.redirect(`${frontendUrl()}/oauth/callback?${q}`);
}

function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : String(body);
    const reqHeaders = { Accept: 'application/json', ...headers };
    if (payload) reqHeaders['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method,
        headers: reqHeaders,
        family: 4,
        timeout: 20000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = { raw };
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data,
          });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Google sign-in timed out')));
    req.on('error', (err) => {
      const detail = err.cause?.message || err.message || 'network error';
      reject(new Error(detail));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function exchangeCode({ tokenUrl, clientId, clientSecret, code, redirectUri, codeVerifier, extra = {} }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    ...extra,
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);

  const res = await requestJson(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok || res.data.error) {
    const msg = res.data.error_description || res.data.error || `Token exchange failed (${res.status})`;
    throw new Error(msg);
  }
  return res.data;
}

async function fetchJson(url, accessToken) {
  const res = await requestJson(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'BDAOS-OAuth',
    },
  });
  if (!res.ok) {
    throw new Error(res.data.message || res.data.error || `Profile fetch failed (${res.status})`);
  }
  return res.data;
}

function decodeJwtPayload(idToken) {
  const part = idToken.split('.')[1];
  if (!part) return null;
  const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json);
}

async function findExistingOAuthUser({ provider, providerId, email }) {
  if (!providerId) throw new Error('Missing provider user id');

  let user = await User.findOne({
    oauthProviders: { $elemMatch: { provider, providerId } },
  });

  if (!user && email) {
    user = await User.findOne({ email: email.toLowerCase() });
  }
  return user;
}

async function attachOAuthProvider(user, { provider, providerId, emailVerified, picture }) {
  const already = (user.oauthProviders || []).some(
    (p) => p.provider === provider && p.providerId === providerId,
  );
  if (!already) {
    user.oauthProviders = user.oauthProviders || [];
    user.oauthProviders.push({ provider, providerId });
  }
  if (emailVerified && !user.isVerified) user.isVerified = true;
  if (picture && !user.avatarUrl) user.avatarUrl = String(picture);
  await user.save();
  return user;
}

function issueToken(user) {
  return jwt.sign({ id: user._id }, JWT_SECRET(), { expiresIn: '7d' });
}

function issueSignupTicket(profile) {
  return jwt.sign(
    {
      purpose: 'oauth_signup',
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
      name: profile.name || '',
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      picture: profile.picture || '',
      emailVerified: !!profile.emailVerified,
    },
    JWT_SECRET(),
    { expiresIn: '2m' },
  );
}

function readSignupTicket(ticket) {
  const data = jwt.verify(ticket, JWT_SECRET());
  if (data.purpose !== 'oauth_signup') throw new Error('Invalid signup ticket');
  return data;
}

function redirectSignup(res, ticket) {
  const q = new URLSearchParams({ ticket });
  return res.redirect(`${frontendUrl()}/oauth/create-account?${q}`);
}

function publicUser(user) {
  const { publicUserWithApps } = require('../utils/pulseAuth');
  return publicUserWithApps(user);
}

// GET /api/auth/oauth/providers - which Sign-in-using options are live
router.get('/providers', (_req, res) => {
  const list = Object.keys(PROVIDERS).map((id) => ({
    id,
    label: PROVIDERS[id].label,
    enabled: isEnabled(id),
  }));
  res.json({ success: true, providers: list });
});

// GET /api/auth/oauth/signup-session?ticket= - hydrate Create Account page
router.get('/signup-session', (req, res) => {
  try {
    const ticket = req.query.ticket;
    if (!ticket) return res.status(400).json({ success: false, message: 'Missing ticket' });
    const data = readSignupTicket(ticket);
    const providerLabel = PROVIDERS[data.provider]?.label || data.provider;
    res.json({
      success: true,
      profile: {
        provider: data.provider,
        providerLabel,
        email: data.email,
        name: data.name,
        firstName: data.firstName,
        lastName: data.lastName,
        picture: data.picture,
      },
    });
  } catch {
    res.status(400).json({
      success: false,
      code: 'OAUTH_SESSION_EXPIRED',
      message: 'Your Google sign-in session expired. Please try again.',
    });
  }
});

// POST /api/auth/oauth/complete - finish Create Account
router.post('/complete', async (req, res, next) => {
  try {
    const { ticket, firstName, lastName, phone, agreed } = req.body || {};
    if (!ticket) return res.status(400).json({ success: false, message: 'Missing signup ticket' });
    if (!agreed) {
      return res.status(400).json({ success: false, message: 'Please agree to the Terms of Service and Privacy Policy.' });
    }

    let data;
    try {
      data = readSignupTicket(ticket);
    } catch {
      return res.status(400).json({ success: false, message: 'Signup session expired. Sign in with Google again.' });
    }

    if (!data.email) {
      return res.status(400).json({ success: false, message: 'Google did not return an email address.' });
    }

    const domainCheck = assertAllowedCompanyEmail(data.email);
    if (!domainCheck.ok) {
      return res.status(403).json({
        success: false,
        code: 'COMPANY_DOMAIN_REQUIRED',
        message: domainCheck.message,
      });
    }

    const existing = await findExistingOAuthUser({
      provider: data.provider,
      providerId: data.providerId,
      email: data.email,
    });
    if (existing) {
      await attachOAuthProvider(existing, {
        provider: data.provider,
        providerId: data.providerId,
        emailVerified: data.emailVerified,
        picture: data.picture,
      });
      const token = issueToken(existing);
      return res.json({ success: true, token, user: await publicUser(existing) });
    }

    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return res.status(403).json({
        success: false,
        code: 'INVITE_ONLY',
        message: 'BDA OS is invite-only. Ask your admin for an invite link, then sign in with email and password.',
      });
    }

    const fn = String(firstName || data.firstName || '').trim();
    const ln = String(lastName || data.lastName || '').trim();
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 10) {
      return res.status(400).json({ success: false, message: 'Enter a valid mobile number.' });
    }

    const user = new User({
      email: data.email.toLowerCase(),
      password: crypto.randomBytes(32).toString('hex'),
      firstName: fn,
      lastName: ln,
      role: 'admin',
      companyName: '',
      companyAddress: '',
      companyEmail: data.email.toLowerCase(),
      companyDomain: resolveCompanyDomain(),
      companyPhone: digits.length === 10 ? `+91${digits}` : `+${digits}`,
      companyCIN: '',
      companyGST: '',
      companyWebsite: '',
      companyLogo: '',
      avatarUrl: data.picture || '',
      gender: DEFAULT_GENDER,
      country: 'India',
      state: '',
      isVerified: true,
      onboardingCompleted: true,
      pulseSetupCompleted: false,
      oauthProviders: [{ provider: data.provider, providerId: data.providerId }],
    });
    await user.save();
    user.organizationId = user._id;
    await user.save();

    const token = issueToken(user);
    res.status(201).json({ success: true, token, user: await publicUser(user) });
  } catch (err) {
    console.error('OAuth complete error:', err);
    return next(err);
  }
});

// POST /api/auth/oauth/link - link Google to an existing BDA OS account
router.post('/link', async (req, res, next) => {
  try {
    const { ticket, password } = req.body || {};
    if (!ticket || !password) {
      return res.status(400).json({ success: false, message: 'Email password is required to link accounts.' });
    }

    let data;
    try {
      data = readSignupTicket(ticket);
    } catch {
      return res.status(400).json({ success: false, message: 'Signup session expired. Sign in with Google again.' });
    }

    const user = await User.findOne({ email: data.email?.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No BDA OS account found for this Google email. Create a new account instead.',
      });
    }

    const domainCheck = assertAllowedCompanyEmail(user.email);
    if (!domainCheck.ok) {
      return res.status(403).json({
        success: false,
        code: 'COMPANY_DOMAIN_REQUIRED',
        message: domainCheck.message,
      });
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Incorrect password for this account.' });
    }

    await attachOAuthProvider(user, {
      provider: data.provider,
      providerId: data.providerId,
      emailVerified: true,
      picture: data.picture,
    });

    const token = issueToken(user);
    res.json({ success: true, token, user: await publicUser(user) });
  } catch (err) {
    console.error('OAuth link error:', err);
    return next(err);
  }
});

// GET /api/auth/oauth/:provider - start OAuth
router.get('/:provider', (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  const cfg = PROVIDERS[provider];
  if (!cfg) return redirectError(res, 'Unknown sign-in provider');
  if (!isEnabled(provider)) {
    return res.redirect(`${frontendUrl()}/coming-soon?provider=${encodeURIComponent(cfg.label)}`);
  }

  const statePayload = { provider, n: crypto.randomBytes(8).toString('hex') };
  const workspaceApps = provider === 'google' && String(req.query.intent || '') === 'workspace-apps';
  if (workspaceApps) statePayload.intent = 'workspace-apps';
  let codeChallenge;
  if (cfg.usePkce) {
    const verifier = base64url(crypto.randomBytes(32));
    statePayload.cv = verifier;
    codeChallenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  }
  const state = signState(statePayload);
  const redirectUri = callbackUrl(req, provider);
  const { DIRECTORY_SCOPE } = require('../utils/googleLinkedApps');

  const params = new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: workspaceApps ? `${cfg.scope} ${DIRECTORY_SCOPE}` : cfg.scope,
    state,
  });
  if (provider === 'google') {
    params.set('hd', allowedEmailDomain());
    params.set('access_type', workspaceApps ? 'offline' : 'online');
    params.set('prompt', workspaceApps ? 'consent' : 'select_account');
  } else if (provider === 'microsoft') {
    params.set('access_type', 'online');
    params.set('prompt', 'select_account');
  }
  if (provider === 'apple') {
    params.set('response_mode', 'form_post');
  }
  if (cfg.usePkce) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  return res.redirect(`${cfg.authUrl}?${params}`);
});

async function handleOAuthCallback(req, res) {
  const provider = String(req.params.provider || '').toLowerCase();
  const cfg = PROVIDERS[provider];
  try {
    if (!cfg || !isEnabled(provider)) return redirectError(res, 'Provider is not configured', provider);

    const code = req.body?.code || req.query.code;
    const state = req.body?.state || req.query.state;
    const err = req.body?.error || req.query.error;
    if (err) {
      let intent = '';
      try {
        intent = verifyState(req.body?.state || req.query.state || '').intent || '';
      } catch {
        intent = '';
      }
      return redirectError(
        res,
        String(req.body?.error_description || req.query.error_description || err),
        provider,
        intent,
      );
    }
    if (!code || !state) {
      return redirectError(
        res,
        'This Google sign-in link is incomplete or expired. Please try again.',
        provider,
      );
    }

    if (wasCodeUsed(code)) {
      return redirectError(
        res,
        'This Google sign-in link was already used. Please try again.',
        provider,
      );
    }

    let stateData;
    try {
      stateData = verifyState(state);
    } catch {
      return redirectError(res, 'Your Google sign-in session expired. Please try again.', provider);
    }
    if (stateData.provider !== provider) {
      return redirectError(res, 'Invalid OAuth state. Please try again.', provider);
    }
    const workspaceIntent = stateData.intent === 'workspace-apps';
    const fail = (message) => redirectError(res, message, provider, workspaceIntent ? 'workspace-apps' : '');

    const redirectUri = callbackUrl(req, provider);
    let tokenData;
    try {
      tokenData = await exchangeCode({
        tokenUrl: cfg.tokenUrl,
        clientId: cfg.clientId(),
        clientSecret: cfg.clientSecret(),
        code,
        redirectUri,
        codeVerifier: stateData.cv,
      });
    } catch (exchangeErr) {
      rememberUsedCode(code);
      console.error('OAuth token exchange failed:', exchangeErr.message, { provider, redirectUri });
      return fail(exchangeErr.message);
    }
    rememberUsedCode(code);

    let profile;
    if (provider === 'apple') {
      const claims = decodeJwtPayload(tokenData.id_token || '');
      if (!claims?.sub) return redirectError(res, 'Apple did not return a user id', provider);
      profile = {
        providerId: String(claims.sub),
        email: claims.email?.toLowerCase(),
        name: '',
        firstName: '',
        lastName: '',
        picture: '',
        emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      };
    } else if (provider === 'github') {
      const ghUser = await fetchJson(cfg.userUrl, tokenData.access_token);
      let email = ghUser.email;
      if (!email) {
        const emails = await fetchJson(cfg.emailsUrl, tokenData.access_token);
        const primary = Array.isArray(emails)
          ? emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0]
          : null;
        email = primary?.email;
      }
      profile = {
        ...cfg.mapProfile({ ...ghUser, email }),
        picture: ghUser.avatar_url || '',
        firstName: (ghUser.name || '').split(/\s+/)[0] || '',
        lastName: (ghUser.name || '').split(/\s+/).slice(1).join(' ') || '',
      };
    } else {
      const raw = await fetchJson(cfg.userUrl, tokenData.access_token);
      profile = cfg.mapProfile(raw);
      if (!profile.picture && raw.picture) profile.picture = raw.picture;
    }

    if (!profile?.providerId) return fail('Could not read provider profile');
    profile.provider = provider;

    const emailCheck = assertAllowedCompanyEmail(profile.email);
    if (!emailCheck.ok) {
      return fail(emailCheck.message);
    }

    let existing = await findExistingOAuthUser({
      provider,
      providerId: profile.providerId,
      email: profile.email,
    });
    if (!existing && profile.email) {
      existing = await User.findOne({ email: String(profile.email).toLowerCase() });
    }

    async function finishWorkspaceImport(user) {
      if (!workspaceIntent) return redirectSuccess(res, issueToken(user));
      const { saveWorkspaceRefreshToken, syncGoogleLinkedApps } = require('../utils/googleLinkedApps');
      const withToken = await User.findById(user._id).select('+googleWorkspace.refreshToken googleWorkspace');
      if (tokenData.refresh_token) saveWorkspaceRefreshToken(withToken, tokenData.refresh_token);
      await withToken.save();
      await syncGoogleLinkedApps(withToken, { force: true });
      return redirectSuccess(res, issueToken(user), { next: '/account', section: 'connected-apps' });
    }

    // Returning user → sign in directly
    if (existing) {
      const linkedByProvider = (existing.oauthProviders || []).some(
        (p) => p.provider === provider && p.providerId === profile.providerId,
      );
      if (!linkedByProvider && !workspaceIntent) {
        if (!profile.email) {
          return fail('Google did not return an email. Cannot continue.');
        }
        const ticket = issueSignupTicket(profile);
        return redirectSignup(res, ticket);
      }
      if (!linkedByProvider && workspaceIntent) {
        await attachOAuthProvider(existing, {
          provider,
          providerId: profile.providerId,
          emailVerified: true,
          picture: profile.picture,
        });
      }
      if (profile.picture && !existing.avatarUrl) {
        existing.avatarUrl = profile.picture;
        await existing.save();
      }
      if (!existing.isVerified && profile.emailVerified) {
        existing.isVerified = true;
        await existing.save();
      }
      return finishWorkspaceImport(existing);
    }

    if (workspaceIntent) {
      return fail('Sign in to BDA OS first, then import Google linked apps.');
    }
    if (!profile.email) {
      return redirectError(
        res,
        `${cfg.label} did not return an email. Use an account that shares email access.`,
        provider,
      );
    }
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      return redirectError(
        res,
        'BDA OS is invite-only. Ask your admin for an invite link, then sign in with email and password.',
        provider,
      );
    }
    const ticket = issueSignupTicket(profile);
    return redirectSignup(res, ticket);
  } catch (e) {
    console.error('OAuth callback error:', e);
    return redirectError(res, e.message || 'Sign-in failed', provider);
  }
}

router.get('/:provider/callback', handleOAuthCallback);
router.post('/:provider/callback', express.urlencoded({ extended: true }), handleOAuthCallback);

module.exports = router;
module.exports.PROVIDERS = PROVIDERS;
module.exports.isEnabled = isEnabled;
