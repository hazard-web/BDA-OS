/**
 * Pulse desk Zip wrappers — daily seed + local score storage.
 * Puzzle math lives in zipEngine.js.
 */

import {
  ZIP_DEFAULT_SIZE,
  generateZip,
  formatZipTime,
  nextZipNumber,
  zipAdjacent,
  zipEdgeKey,
  zipNeighbors,
  zipPathLegal,
  zipSolved,
  zipStepOptions,
  zipWallBetween,
  extendZipPath,
  steerZipPath,
} from './zipEngine'

export {
  formatZipTime,
  nextZipNumber,
  zipAdjacent,
  zipEdgeKey,
  zipNeighbors,
  zipPathLegal,
  zipSolved,
  zipStepOptions,
  zipWallBetween,
  extendZipPath,
  steerZipPath,
  generateZip,
}

export const ZIP_SIZE = ZIP_DEFAULT_SIZE

const STORAGE_PREFIX = 'pulseDeskGames.v1:'
const GAME = 'zip'

function storageKey(email) {
  return `${STORAGE_PREFIX}${String(email || '').trim().toLowerCase()}`
}

export function deskDayKey(when = new Date()) {
  const y = when.getFullYear()
  const m = String(when.getMonth() + 1).padStart(2, '0')
  const d = String(when.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function deskPuzzleNumber(when = new Date()) {
  const start = Date.UTC(2026, 0, 1)
  const now = Date.UTC(when.getFullYear(), when.getMonth(), when.getDate())
  return Math.floor((now - start) / 86400000) + 1
}

export function makeZip(seed, opts) {
  return generateZip(seed, { size: ZIP_SIZE, ...opts })
}

export function shuffleZip() {
  const seed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now() ^ (performance.now() * 1000)) >>> 0
  return makeZip(seed || 1)
}

export function todayZip(when = new Date()) {
  const n = deskPuzzleNumber(when)
  // LinkedIn-like 6×6 with a gentle puzzle: fewer marks, light walls.
  return makeZip(n * 131 + 17, { size: 6, markCount: 6, wallIntensity: 0.12 })
}

export function zipScore(ms, backtracks) {
  const seconds = Math.max(0, Math.floor(Number(ms) / 1000))
  return Math.max(12, 48 - Math.floor(seconds / 4) - Number(backtracks) * 2)
}

function emptyState() {
  return {
    points: 0,
    streak: 0,
    lastPlayDay: '',
    completed: {},
    scores: {},
  }
}

export function loadDeskGames(email) {
  try {
    const raw = localStorage.getItem(storageKey(email))
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') return emptyState()
    return {
      ...emptyState(),
      ...parsed,
      completed: parsed.completed && typeof parsed.completed === 'object' ? parsed.completed : {},
      scores: parsed.scores && typeof parsed.scores === 'object' ? parsed.scores : {},
    }
  } catch {
    return emptyState()
  }
}

export function saveDeskGames(email, state) {
  if (!email) return state
  try {
    localStorage.setItem(storageKey(email), JSON.stringify(state))
  } catch {
    /* ignore */
  }
  return state
}

function bumpStreak(state, day) {
  if (state.lastPlayDay === day) return state
  const yesterday = new Date(`${day}T12:00:00`)
  yesterday.setDate(yesterday.getDate() - 1)
  const yKey = deskDayKey(yesterday)
  const streak = state.lastPlayDay === yKey ? (Number(state.streak) || 0) + 1 : 1
  return { ...state, streak, lastPlayDay: day }
}

export function markZipPlayed(email, payload) {
  const day = deskDayKey()
  const prev = loadDeskGames(email)
  const already = prev.completed[GAME] === day
  let next = bumpStreak(prev, day)
  next = {
    ...next,
    points: already ? next.points : next.points + payload.points,
    completed: { ...next.completed, [GAME]: day },
    scores: {
      ...next.scores,
      [GAME]: { day, ...payload },
    },
  }
  return saveDeskGames(email, next)
}

export function todayCompleted(state, day = deskDayKey()) {
  return state?.completed?.[GAME] === day
}

export function savedZip(state, day = deskDayKey()) {
  const row = state?.scores?.[GAME]
  if (!row || row.day !== day) return null
  return row
}
