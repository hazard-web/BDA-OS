import { useEffect } from 'react'
import BdaBrandIdent from './BdaBrandIdent'
import './bda-gate-loader.css'

/** Brand intro used when Pulse is opening a page. */
export default function BdaGateLoader({
  show = false,
  leaving = false,
  label = 'Opening',
}) {
  useEffect(() => {
    if (!show) return undefined
    document.documentElement.classList.add('bda-open-boot')
    document.getElementById('bda-boot')?.remove()
    return () => {
      document.documentElement.classList.remove('bda-open-boot')
    }
  }, [show])

  if (!show) return null
  return (
    <div
      className={`bda-gate${leaving ? ' is-out' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="bda-gate-stage">
        <BdaBrandIdent />
        <p className="bda-gate-label">{label}</p>
      </div>
    </div>
  )
}
