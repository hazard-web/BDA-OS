/**
 * Server-side check-in time trust rules.
 * Client activeMs is advisory; heartbeats + session wall + daily cap decide the total.
 */

const TARGET_HOURS = 9;
/** Hard ceiling for a single calendar day. */
const DAILY_CAP_MS = 14 * 3_600_000;
/** Max time credited between two heartbeats (covers background-tab throttle). */
const MAX_HEARTBEAT_CREDIT_MS = 3 * 60_000;
/** Heartbeats older than this do not keep accruing open-session wall time. */
const HEARTBEAT_STALE_MS = 5 * 60_000;
/** Flag when verified hours exceed honest session wall by this ratio (+ buffer). */
const ANOMALY_RATIO = 1.2;
const ANOMALY_BUFFER_MS = 15 * 60_000;
/** Allow writes for yesterday / today / tomorrow (timezone edge). */
const DATE_SLACK_DAYS = 1;

function msToHours(ms) {
  return Math.round((Math.max(0, Number(ms) || 0) / 3_600_000) * 100) / 100;
}

function shiftKey(key, days) {
  const [y, m, d] = String(key).split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate(),
  ).padStart(2, '0')}`;
}

function todayKey(raw) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function assertWritableDate(date, now = new Date()) {
  const key = todayKey(date);
  const today = todayKey(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  );
  const allowed = new Set();
  for (let i = -DATE_SLACK_DAYS; i <= DATE_SLACK_DAYS; i += 1) {
    allowed.add(shiftKey(today, i));
  }
  if (!allowed.has(key)) {
    const err = new Error('Check-in date must be today (or adjacent day for timezone)');
    err.status = 400;
    err.code = 'DATE_OUT_OF_RANGE';
    throw err;
  }
  return key;
}

function sumClosedSessionMs(sessions = []) {
  return (sessions || []).reduce((sum, session) => {
    if (!session?.checkInAt || !session?.checkOutAt) return sum;
    const stored = Number(session.durationMs);
    if (Number.isFinite(stored) && stored >= 0) return sum + stored;
    const wall = Math.max(
      0,
      new Date(session.checkOutAt).getTime() - new Date(session.checkInAt).getTime(),
    );
    return sum + wall;
  }, 0);
}

function findOpenSession(doc) {
  return [...(doc.sessions || [])].reverse().find((s) => s.checkInAt && !s.checkOutAt) || null;
}

function sessionWallMs(doc, now = new Date()) {
  let total = sumClosedSessionMs(doc.sessions);
  const open = findOpenSession(doc);
  if (!open?.checkInAt) return total;
  const lastBeat = doc.lastHeartbeatAt ? new Date(doc.lastHeartbeatAt).getTime() : 0;
  const start = new Date(open.checkInAt).getTime();
  const end = Math.min(
    now.getTime(),
    lastBeat > start ? lastBeat : start,
  );
  // Stale open session without heartbeat: do not grow wall past last beat / start
  if (lastBeat && now.getTime() - lastBeat > HEARTBEAT_STALE_MS) {
    total += Math.max(0, Math.min(lastBeat, now.getTime()) - start);
  } else {
    total += Math.max(0, end - start);
  }
  return total;
}

/**
 * Apply a client time claim under heartbeat + daily-cap rules.
 * Returns { totalActiveMs, creditedDelta, capped, anomaly }.
 */
function applyTrustedActiveMs(doc, clientActiveMs, now = new Date(), { allowInflate = true } = {}) {
  const prior = Math.max(0, Number(doc.totalActiveMs) || 0);
  const claim = Math.max(0, Number(clientActiveMs) || 0);
  const nowMs = now.getTime();
  const lastBeat = doc.lastHeartbeatAt ? new Date(doc.lastHeartbeatAt).getTime() : 0;

  let maxGain = DAILY_CAP_MS;
  if (allowInflate) {
    const sinceBeat = lastBeat > 0 ? Math.max(0, nowMs - lastBeat) : MAX_HEARTBEAT_CREDIT_MS;
    maxGain = Math.min(MAX_HEARTBEAT_CREDIT_MS, sinceBeat || MAX_HEARTBEAT_CREDIT_MS);
  } else {
    // Check-in / hydrate: never raise above prior (ignore client inflate)
    maxGain = 0;
  }

  const ceiling = Math.min(DAILY_CAP_MS, prior + Math.max(0, maxGain));
  let next = Math.min(ceiling, Math.max(prior, Math.min(claim, ceiling)));
  if (!allowInflate) {
    next = Math.min(DAILY_CAP_MS, prior);
  }

  const wall = sessionWallMs({ ...doc.toObject?.() || doc, lastHeartbeatAt: doc.lastHeartbeatAt }, now);
  const anomaly =
    next > wall * ANOMALY_RATIO + ANOMALY_BUFFER_MS
      ? {
          flagged: true,
          reason: `Active ${msToHours(next)}h exceeds session wall ${msToHours(wall)}h`,
          at: now,
          wallMs: wall,
          activeMs: next,
        }
      : doc.anomaly?.flagged
        ? doc.anomaly
        : undefined;

  return {
    totalActiveMs: next,
    creditedDelta: Math.max(0, next - prior),
    capped: next < claim || next >= DAILY_CAP_MS,
    anomaly,
    dailyCapMs: DAILY_CAP_MS,
  };
}

function closeOpenSession(doc, now, { location, ip, userAgent } = {}) {
  const open = findOpenSession(doc);
  if (!open) return null;
  const priorClosed = sumClosedSessionMs(
    (doc.sessions || []).filter((s) => s !== open && s.checkOutAt),
  );
  const wall = Math.max(0, now.getTime() - new Date(open.checkInAt).getTime());
  const credited = Math.max(
    0,
    Math.min(wall, Math.max(0, (Number(doc.totalActiveMs) || 0) - priorClosed)),
  );
  open.checkOutAt = now;
  open.durationMs = credited;
  if (location) open.locationOut = location;
  if (ip) open.ip = open.ip || ip;
  if (userAgent) open.userAgent = open.userAgent || userAgent;
  return open;
}

function touchHeartbeat(doc, now = new Date()) {
  doc.lastHeartbeatAt = now;
}

module.exports = {
  TARGET_HOURS,
  DAILY_CAP_MS,
  MAX_HEARTBEAT_CREDIT_MS,
  HEARTBEAT_STALE_MS,
  todayKey,
  shiftKey,
  assertWritableDate,
  sumClosedSessionMs,
  findOpenSession,
  sessionWallMs,
  applyTrustedActiveMs,
  closeOpenSession,
  touchHeartbeat,
  msToHours,
};
