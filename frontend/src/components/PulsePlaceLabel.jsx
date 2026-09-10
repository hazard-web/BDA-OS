import { useEffect, useState } from 'react'
import { formatPulseLocationLabel, resolvePulsePlaceName } from '../utils/pulseLocation'

/**
 * Admin activity Location cell — city/town first; reverse-geocode coords if needed.
 */
export default function PulsePlaceLabel({ location }) {
  const initial = formatPulseLocationLabel(location)
  const needsResolve =
    Boolean(location) &&
    Number.isFinite(Number(location.lat)) &&
    Number.isFinite(Number(location.lng)) &&
    !location.city &&
    !location.locality &&
    !location.sector &&
    !location.displayName

  const [label, setLabel] = useState(initial)

  useEffect(() => {
    setLabel(formatPulseLocationLabel(location))
    if (!needsResolve) return undefined
    let cancelled = false
    void resolvePulsePlaceName(location).then((next) => {
      if (!cancelled && next) setLabel(next)
    })
    return () => {
      cancelled = true
    }
  }, [
    location?.lat,
    location?.lng,
    location?.city,
    location?.locality,
    location?.sector,
    location?.state,
    location?.displayName,
    needsResolve,
  ])

  return label || '—'
}
