const express = require('express')
const router = express.Router()
const { auth } = require('./auth')
const PulseZipScore = require('../models/PulseZipScore')
const { orgIdOf } = require('../utils/pulseAuth')

function dayKey(when = new Date()) {
  const y = when.getFullYear()
  const m = String(when.getMonth() + 1).padStart(2, '0')
  const d = String(when.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function puzzleNoFor(when = new Date()) {
  const start = Date.UTC(2026, 0, 1)
  const now = Date.UTC(when.getFullYear(), when.getMonth(), when.getDate())
  return Math.floor((now - start) / 86400000) + 1
}

function displayName(user) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  if (name) return name
  return String(user?.email || '').split('@')[0] || 'Teammate'
}

function packBoard(rows, userId) {
  const mineId = String(userId || '')
  const ranks = rows.map((row, index) => ({
    rank: index + 1,
    name: row.name || String(row.email || '').split('@')[0] || 'Teammate',
    timeMs: row.timeMs,
    backtracks: row.backtracks || 0,
    isMe: String(row.user) === mineId,
  }))
  const mine = ranks.find((row) => row.isMe) || null
  const avgMs = ranks.length
    ? Math.round(ranks.reduce((sum, row) => sum + row.timeMs, 0) / ranks.length)
    : 0
  return { ranks, mine, avgMs }
}

async function loadRows(organizationId, date) {
  return PulseZipScore.find({ organizationId, date })
    .sort({ timeMs: 1, createdAt: 1 })
    .limit(40)
    .lean()
}

router.get('/today', auth, async (req, res) => {
  try {
    const date = dayKey()
    const rows = await loadRows(orgIdOf(req.user), date)
    res.json({
      date,
      puzzleNo: puzzleNoFor(),
      ...packBoard(rows, req.user._id),
    })
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not load Zip board' })
  }
})

router.post('/finish', auth, async (req, res) => {
  try {
    const date = dayKey()
    const organizationId = orgIdOf(req.user)
    const puzzleNo = puzzleNoFor()
    const timeMs = Math.min(30 * 60 * 1000, Math.max(1200, Number(req.body?.timeMs) || 0))
    const backtracks = Math.max(0, Math.min(400, Number(req.body?.backtracks) || 0))
    const name = displayName(req.user)
    const email = String(req.user.email || '').toLowerCase()

    await PulseZipScore.findOneAndUpdate(
      { organizationId, user: req.user._id, date },
      {
        $setOnInsert: {
          organizationId,
          user: req.user._id,
          email,
          name,
          date,
          puzzleNo,
          timeMs,
          backtracks,
        },
      },
      { upsert: true, new: true },
    )

    const rows = await loadRows(organizationId, date)
    const packed = packBoard(rows, req.user._id)
    res.json({
      date,
      puzzleNo,
      kept: packed.mine ? packed.mine.timeMs !== timeMs : false,
      ...packed,
    })
  } catch (err) {
    res.status(500).json({ message: err.message || 'Could not save Zip time' })
  }
})

module.exports = router
