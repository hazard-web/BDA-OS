/**
 * Centralized URL generation utility.
 *
 * All invitation / setup / reset links MUST go through this module so they
 * never accidentally use a preview/deployment URL.
 *
 * Rules:
 *  1. Production base URL comes from env (FRONTEND_URL or APP_URL).
 *  2. Fallback is the hardcoded production alias (never a preview URL).
 *  3. Request origin is used ONLY as a last resort and only if it passes
 *     the preview/deployment URL checks.
 */

const DEFAULT_PROD_URL = 'https://rohit98k-payroll-portal.vercel.app';

/**
 * Detect if a URL looks like a Vercel preview / git-branch deployment.
 * These have a commit-hash or branch slug in the hostname before .vercel.app.
 * Production aliases have NO hash in the hostname.
 */
function isPreviewOrDeadUrl(value) {
  if (!value) return true;
  // Git preview pattern: abc123-def456-ghi789-projects.vercel.app
  const previewPattern = /[a-z0-9]+-[a-z0-9]+-[a-z0-9]+-projects\.vercel\.app/i;
  // App preview pattern: appname-abc123.vercel.app (has a hyphen + hash after the app name)
  const appPreviewPattern = /payslip-generator-[a-z0-9]+-[a-z0-9]+\.vercel\.app/i;
  return previewPattern.test(value) || appPreviewPattern.test(value);
}

/**
 * Check if a URL is a local development URL.
 */
function isLocalUrl(value) {
  if (!value) return false;
  return /(^https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(value);
}

/**
 * Clean and validate a URL string.
 */
function cleanUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

/**
 * Get the production base URL.
 * Priority: FRONTEND_URL → APP_URL → hardcoded production alias.
 *
 * NEVER uses request origin for invitation links.
 */
function getProductionBaseUrl() {
  const envFrontendUrl = cleanUrl(process.env.FRONTEND_URL);
  const envAppUrl = cleanUrl(process.env.APP_URL);

  if (envFrontendUrl) return envFrontendUrl;
  if (envAppUrl) return envAppUrl;

  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  if (isDev) {
    return 'http://localhost:3001';
  }

  if (envFrontendUrl && !isLocalUrl(envFrontendUrl) && !isPreviewOrDeadUrl(envFrontendUrl)) {
    return envFrontendUrl;
  }
  if (envAppUrl && !isLocalUrl(envAppUrl) && !isPreviewOrDeadUrl(envAppUrl)) {
    return envAppUrl;
  }

  console.warn('[URL Helper] No valid production URL found in env vars (FRONTEND_URL/APP_URL). Using default production URL.');
  return DEFAULT_PROD_URL;
}

/**
 * Build a setup/invitation link using ONLY the production base URL.
 * This function MUST be used for ALL invitation emails.
 *
 * @param {string} token - The setup/invitation token
 * @returns {string} Full URL to the setup-password page
 */
function buildSetupLink(token) {
  const baseUrl = getProductionBaseUrl();
  return `${baseUrl}/portal/setup-password?token=${token}`;
}

/**
 * Build a password reset link using ONLY the production base URL.
 *
 * @param {string} token - The password reset token
 * @returns {string} Full URL to the reset-password page
 */
function buildResetLink(token) {
  const baseUrl = getProductionBaseUrl();
  return `${baseUrl}/reset-password?token=${token}`;
}

function buildInviteLink(token) {
  const baseUrl = getProductionBaseUrl();
  return `${baseUrl}/invite/${token}`;
}

function buildCandidateOnboardLink(token) {
  const baseUrl = getProductionBaseUrl();
  return `${baseUrl}/onboard/${token}`;
}

/**
 * Build an email verification link using ONLY the production base URL.
 *
 * @param {string} token - The verification token
 * @returns {string} Full URL to the verify page
 */
function buildVerifyLink(token) {
  const baseUrl = getProductionBaseUrl();
  return `${baseUrl}/verify?token=${token}`;
}

module.exports = {
  getProductionBaseUrl,
  buildSetupLink,
  buildResetLink,
  buildVerifyLink,
  buildInviteLink,
  buildCandidateOnboardLink,
  isPreviewOrDeadUrl,
  isLocalUrl,
  cleanUrl,
};
