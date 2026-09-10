/**
 * Fast location for check-in — cache + short timeout, geocode when needed.
 */

const empty = () => ({
  lat: null,
  lng: null,
  city: '',
  sector: '',
  locality: '',
  state: '',
  country: '',
  displayName: '',
})

let cached = null
let inflight = null
const placeCache = new Map()

function readCoords(timeoutMs, highAccuracy) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('no-geo'))
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: highAccuracy,
      timeout: timeoutMs,
      maximumAge: 300_000,
    })
  })
}

async function reverseGeocode(lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('zoom', '14')
  url.searchParams.set('addressdetails', '1')

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'Accept-Language': 'en' },
  })
  if (!res.ok) return empty()
  const data = await res.json()
  const addr = data?.address || {}
  const sector =
    addr.neighbourhood ||
    addr.suburb ||
    addr.residential ||
    addr.quarter ||
    addr.city_district ||
    ''
  const city =
    addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.county || ''
  return {
    lat,
    lng,
    city: String(city || ''),
    sector: String(sector || ''),
    locality: String(addr.suburb || addr.neighbourhood || addr.hamlet || ''),
    state: String(addr.state || ''),
    country: String(addr.country || ''),
    displayName: String(data?.display_name || ''),
  }
}

/** Instant: last known location (may be empty). */
export function peekPulseLocation() {
  return cached ? { ...cached } : empty()
}

/**
 * Prefer city/town for admin activity and labels.
 * Order: city → locality/sector → state → short displayName → coords.
 */
export function formatPulseLocationLabel(loc) {
  if (!loc) return '—'
  const parts = [loc.city, loc.locality || loc.sector, loc.state].filter(Boolean)
  if (parts.length) return [...new Set(parts)].join(', ')
  if (loc.displayName) {
    const short = String(loc.displayName)
      .split(',')
      .slice(0, 3)
      .map((p) => p.trim())
      .filter(Boolean)
    if (short.length) return short.join(', ')
  }
  if (Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
    return `${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`
  }
  return '—'
}

/**
 * Resolve city/town for stored coords (admin history without named place).
 */
export async function resolvePulsePlaceName(loc) {
  if (!loc) return '—'
  const named = formatPulseLocationLabel(loc)
  if (named !== '—' && !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(named)) return named

  const lat = Number(loc.lat)
  const lng = Number(loc.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '—'

  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  if (placeCache.has(key)) return placeCache.get(key)

  try {
    const full = await reverseGeocode(lat, lng)
    const label = formatPulseLocationLabel(full)
    placeCache.set(key, label)
    return label
  } catch {
    const fallback = formatPulseLocationLabel(loc)
    placeCache.set(key, fallback)
    return fallback
  }
}

/**
 * Best-effort location. Prefer cache; optionally wait briefly for city name.
 */
export async function capturePulseLocation(timeoutMs = 2500, { waitForPlace = false } = {}) {
  if (cached?.lat != null && cached?.lng != null) {
    if (waitForPlace && !cached.city && !cached.locality && !cached.displayName) {
      try {
        const full = await Promise.race([
          reverseGeocode(cached.lat, cached.lng),
          new Promise((resolve) => setTimeout(() => resolve(null), 1800)),
        ])
        if (full?.city || full?.locality || full?.displayName) {
          cached = { ...cached, ...full }
        }
      } catch {
        /* keep coords */
      }
    }
    return { ...cached }
  }

  if (inflight) {
    try {
      return await Promise.race([
        inflight,
        new Promise((resolve) => setTimeout(() => resolve(peekPulseLocation()), Math.min(timeoutMs, 800))),
      ])
    } catch {
      return empty()
    }
  }

  inflight = (async () => {
    try {
      let coords
      try {
        coords = await readCoords(timeoutMs, false)
      } catch {
        coords = await readCoords(Math.min(timeoutMs, 2000), true)
      }
      const lat = coords.coords.latitude
      const lng = coords.coords.longitude
      const base = { ...empty(), lat, lng }
      cached = base

      const geocodePromise = reverseGeocode(lat, lng)
        .then((full) => {
          if (full?.lat != null) cached = full
          return full
        })
        .catch(() => null)

      if (waitForPlace) {
        const full = await Promise.race([
          geocodePromise,
          new Promise((resolve) => setTimeout(() => resolve(null), 1800)),
        ])
        if (full?.lat != null) return { ...full }
      } else {
        void geocodePromise
      }

      return base
    } catch {
      return empty()
    } finally {
      inflight = null
    }
  })()

  try {
    return await inflight
  } catch {
    return empty()
  }
}

/** Warm cache early without competing with first paint. */
export function prefetchPulseLocation() {
  if (typeof window === 'undefined') return
  const run = () => {
    void capturePulseLocation(4000)
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 5000 })
  } else {
    window.setTimeout(run, 2000)
  }
}
