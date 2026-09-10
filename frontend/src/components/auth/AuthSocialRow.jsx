import { oauthStartUrl } from './oauthUrls'

const googleIcon = (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.1 2.7-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1C3.3 21.4 7.4 24 12 24z" />
    <path fill="#FBBC05" d="M5.4 14.4c-.2-.7-.4-1.4-.4-2.4s.1-1.7.4-2.4V6.5H1.4C.5 8.3 0 10.1 0 12s.5 3.7 1.4 5.5l4-3.1z" />
    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.4 0 3.3 2.6 1.4 6.5l4 3.1C6.3 6.8 8.9 4.8 12 4.8z" />
  </svg>
)

const facebookIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#fff" d="M15.1 8.5h2.4V5h-2.4C12.4 5 11 7 11 9.7V11H8.5v3.5H11V24h3.6V14.5h2.6l.5-3.5h-3.1V9.9c0-.8.4-1.4.9-1.4z" />
  </svg>
)

const linkedInIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="#fff" d="M5.4 8.6H1.8V22h3.6V8.6zM3.6 2C2.4 2 1.5 2.9 1.5 4s.9 2 2.1 2 2.1-.9 2.1-2-.9-2-2.1-2zM22.2 13.2c0-4.1-2.2-6-5.1-6-2.4 0-3.5 1.3-4.1 2.2V8.6H9.5V22h3.6v-7.4c0-1.9.9-3.1 2.5-3.1s2.4 1.1 2.4 3.1V22h3.6v-8.8h.6z" />
  </svg>
)

const xIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path fill="#fff" d="M18.2 2H21l-6.6 7.5L22 22h-6.2l-4.9-7.2L5.3 22H2.5l7-8L2 2h6.3l4.4 6.6L18.2 2zm-1.1 18h1.7L7 3.9H5.2L17.1 20z" />
  </svg>
)

const appleIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="#fff" d="M16.7 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 3 2.3 1.2 0 1.6-.8 3.1-.8s1.8.8 3.1.8 2.1-1.1 2.8-2.2c.9-1.2 1.2-2.4 1.2-2.5-.1 0-2.4-.9-2.4-3.8zM14.6 5.8c.6-.8 1.1-1.9.9-3-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.6-1.3z" />
  </svg>
)

const microsoftIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
    <rect x="1" y="1" width="10" height="10" fill="#F25022" />
    <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
    <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
    <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
  </svg>
)

const githubIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#fff" d="M12 2C6.5 2 2 6.6 2 12.2c0 4.5 2.9 8.3 6.9 9.6.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.4-3.4-1.4-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.7 1 .8-.2 1.7-.3 2.5-.3s1.7.1 2.5.3c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7 1 .7 2v2.9c0 .3.2.6.7.5 4-1.3 6.9-5.1 6.9-9.6C22 6.6 17.5 2 12 2z" />
  </svg>
)

const gitlabIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#E24329" d="M12 21.2L16.4 8H7.6L12 21.2z" />
    <path fill="#FC6D26" d="M12 21.2L7.6 8H1.1L12 21.2zM12 21.2L16.4 8H22.9L12 21.2z" />
    <path fill="#FCA326" d="M1.1 8L.1 11.1c-.1.3 0 .7.3.9L12 21.2 1.1 8zM22.9 8l1 3.1c.1.3 0 .7-.3.9L12 21.2 22.9 8z" />
  </svg>
)

const ICONS = [
  { id: 'google', name: 'Google', bg: '#fff', icon: googleIcon },
  // { id: 'facebook', name: 'Facebook', bg: '#1877F2', icon: facebookIcon },
  // { id: 'linkedin', name: 'LinkedIn', bg: '#0A66C2', icon: linkedInIcon },
  // { id: 'x', name: 'X', bg: '#000', icon: xIcon },
  // { id: 'apple', name: 'Apple', bg: '#000', icon: appleIcon },
  // { id: 'microsoft', name: 'Microsoft', bg: '#2f2f2f', icon: microsoftIcon },
]

export const SIGNUP_SOCIAL = [
  { id: 'google', name: 'Google', bg: '#fff', icon: googleIcon },
  { id: 'linkedin', name: 'LinkedIn', bg: '#0A66C2', icon: linkedInIcon },
  { id: 'microsoft', name: 'Microsoft', bg: '#fff', icon: microsoftIcon },
]

export const SOCIAL_GRID = [
  { id: 'google', name: 'Google', bg: '#f2f2f2', color: '#111', icon: googleIcon },
  { id: 'facebook', name: 'Facebook', bg: '#1877F2', color: '#fff', icon: facebookIcon },
  { id: 'linkedin', name: 'LinkedIn', bg: '#0A66C2', color: '#fff', icon: linkedInIcon },
  { id: 'x', name: 'X', bg: '#000', color: '#fff', icon: xIcon },
  { id: 'apple', name: 'Apple', bg: '#000', color: '#fff', icon: appleIcon },
  { id: 'microsoft', name: 'Microsoft', bg: '#2f2f2f', color: '#fff', icon: microsoftIcon },
  { id: 'github', name: 'Github', bg: '#24292f', color: '#fff', icon: githubIcon },
  { id: 'gitlab', name: 'Gitlab', bg: '#fff', color: '#111', border: '#d5dbe3', icon: gitlabIcon },
]

export default function AuthSocialRow() {
  return (
    <div className="auth-using-row">
      <p className="auth-using">Sign in using</p>
      <div className="auth-idp-row">
        {ICONS.map((item) => (
          <a
            key={item.id}
            href={oauthStartUrl(item.id)}
            className="auth-idp"
            title={`Sign in with ${item.name}`}
            style={{ background: item.bg }}
            aria-label={`Sign in with ${item.name}`}
          >
            {item.icon}
          </a>
        ))}
        {/* <button
          type="button"
          className="auth-idp"
          title="More"
          style={{ background: '#f4f6f8' }}
          aria-label="More sign in options"
          onClick={onMore}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="6" cy="12" r="1.8" fill="#5c6370" />
            <circle cx="12" cy="12" r="1.8" fill="#5c6370" />
            <circle cx="18" cy="12" r="1.8" fill="#5c6370" />
          </svg>
        </button> */}
      </div>
    </div>
  )
}

export function AuthSocialGrid({ onBack }) {
  return (
    <div>
      <div className="auth-social-grid">
        {SOCIAL_GRID.map((item) => (
          <a
            key={item.id}
            href={oauthStartUrl(item.id)}
            className="auth-social-btn"
            style={{
              background: item.bg,
              color: item.color,
              borderColor: item.border || 'transparent',
            }}
          >
            {item.icon}
            <span>Sign in with {item.name}</span>
          </a>
        ))}
      </div>
      <button type="button" className="auth-social-home" onClick={onBack}>
        Sign in with BDA OS
        <span aria-hidden="true">›</span>
      </button>
    </div>
  )
}
