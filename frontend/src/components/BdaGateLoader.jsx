import { useEffect } from 'react'
import './bda-gate-loader.css'

/** People OS four-square mark rotates as one unit. No ring, no glow, no text. */
export default function BdaGateLoader({
  show = false,
  leaving = false,
  label = 'Loading',
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
      aria-label={label || 'Loading'}
    >
      <div className="bda-gate-stage">
        <span className="bda-gate-spin" aria-hidden="true">
          <span className="bda-gate-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>
      </div>
    </div>
  )
}
