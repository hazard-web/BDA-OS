import { AuthLogoLoader } from './auth/AuthLogoLoader'

/** Pulse wait screen: same People OS mark as account login. */
export default function PulseLoading({ label = 'Loading' }) {
  return <AuthLogoLoader show label={label} />
}
