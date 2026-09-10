function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) return String(forwarded[0]).trim();
  return (
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    ''
  );
}

function clientUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 512);
}

function normalizeLocation(raw = {}) {
  if (!raw || typeof raw !== 'object') return undefined;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return {
    lat,
    lng,
    city: String(raw.city || '').trim() || undefined,
    sector: String(raw.sector || raw.neighbourhood || raw.suburb || '').trim() || undefined,
    locality: String(raw.locality || raw.suburb || '').trim() || undefined,
    state: String(raw.state || '').trim() || undefined,
    country: String(raw.country || '').trim() || undefined,
    displayName: String(raw.displayName || raw.display_name || '').trim() || undefined,
  };
}

function formatLocationLabel(loc) {
  if (!loc) return 'Location unavailable';
  // Prefer city/town first so admin activity reads as a place, not coords.
  const parts = [loc.city, loc.locality || loc.sector, loc.state].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(', ');
  if (loc.displayName) {
    const short = String(loc.displayName)
      .split(',')
      .slice(0, 3)
      .map((p) => p.trim())
      .filter(Boolean);
    if (short.length) return short.join(', ');
  }
  if (Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
    return `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
  }
  return 'Location unavailable';
}

const geocodeCache = new Map();

async function reverseGeocode(lat, lng) {
  const key = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
  if (geocodeCache.has(key)) return geocodeCache.get(key);

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '14');
  url.searchParams.set('addressdetails', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en',
        'User-Agent': 'BDA-OS-Pulse/1.0 (attendance-location)',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      geocodeCache.set(key, null);
      return null;
    }
    const data = await res.json();
    const addr = data?.address || {};
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.suburb ||
      addr.county ||
      '';
    const next = {
      city: String(city || '').trim() || undefined,
      sector:
        String(
          addr.neighbourhood ||
            addr.suburb ||
            addr.residential ||
            addr.quarter ||
            addr.city_district ||
            '',
        ).trim() || undefined,
      locality: String(addr.suburb || addr.neighbourhood || addr.hamlet || '').trim() || undefined,
      state: String(addr.state || '').trim() || undefined,
      country: String(addr.country || '').trim() || undefined,
      displayName: String(data?.display_name || '').trim() || undefined,
    };
    geocodeCache.set(key, next);
    return next;
  } catch {
    geocodeCache.set(key, null);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fill city/town when the client only sent coordinates. */
async function enrichLocation(raw) {
  const loc = normalizeLocation(raw);
  if (!loc) return undefined;
  if (loc.city || loc.locality || loc.displayName) return loc;
  const geo = await reverseGeocode(loc.lat, loc.lng);
  if (!geo) return loc;
  return {
    ...loc,
    city: geo.city || loc.city,
    sector: geo.sector || loc.sector,
    locality: geo.locality || loc.locality,
    state: geo.state || loc.state,
    country: geo.country || loc.country,
    displayName: geo.displayName || loc.displayName,
  };
}

module.exports = {
  clientIp,
  clientUserAgent,
  normalizeLocation,
  formatLocationLabel,
  enrichLocation,
};
