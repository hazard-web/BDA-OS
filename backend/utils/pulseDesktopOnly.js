/** BDA OS sign-in is desktop-only — block phone / mobile browser User-Agents. */

const MOBILE_UA =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS|FxiOS/i;

const DESKTOP_ONLY_MESSAGE =
  'BDA OS is built for desktop. Please open this on a computer to sign in.';

function isMobileUserAgent(ua = '') {
  return MOBILE_UA.test(String(ua || ''));
}

function isMobileRequest(req) {
  const ua = req?.get?.('user-agent') || req?.headers?.['user-agent'] || '';
  return isMobileUserAgent(ua);
}

module.exports = {
  DESKTOP_ONLY_MESSAGE,
  isMobileUserAgent,
  isMobileRequest,
};
