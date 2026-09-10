import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  deskPuzzleNumber,
  formatZipTime,
  markZipPlayed,
  nextZipNumber,
  steerZipPath,
  todayZip,
  zipScore,
  zipSolved,
} from '../utils/pulseDeskGames'
import { emptyZipBoard, fetchZipToday, submitZipFinish } from '../utils/pulseZipBoard'
import '../pages/pulse-desk-games.css'

const PATH = '#31a24c'
const WASH = '#d7f0d9'
let zipBurstFor = ''

function ordinal(n) {
  const value = Number(n) || 0
  const mod = value % 100
  if (mod >= 11 && mod <= 13) return `${value}th`
  if (value % 10 === 1) return `${value}st`
  if (value % 10 === 2) return `${value}nd`
  if (value % 10 === 3) return `${value}rd`
  return `${value}th`
}

function ZipMark() {
  return (
    <svg className="pdg-zip-mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#f26622" />
      <path
        d="M16 16h24c7 0 10 4 10 10s-3 10-10 10H28c-7 0-10 4-10 10s3 10 10 10h22"
        fill="none"
        stroke="#fff8ee"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="4.2" fill="#fff8ee" />
      <circle cx="50" cy="26" r="4.2" fill="#fff8ee" />
      <circle cx="18" cy="46" r="4.2" fill="#fff8ee" />
      <circle cx="50" cy="56" r="4.2" fill="#fff8ee" />
    </svg>
  )
}

function crushLine(ms, avgSeconds, backtracks) {
  const seconds = Math.floor(ms / 1000)
  if (backtracks === 0 && seconds <= avgSeconds) return "You're crushing it!"
  if (backtracks === 0) return 'Clean line.'
  if (seconds <= avgSeconds) return 'Quick hands.'
  return 'Path complete.'
}

function prefersQuietMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
}

function spawnZipBurst(canvas) {
  if (!canvas || prefersQuietMotion()) return () => {}
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}
  const dpr = window.devicePixelRatio || 1
  const size = () => {
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { width, height }
  }
  let { width: w, height: h } = size()
  const colors = ['#fff8ee', '#ffe36a', '#1a5f4a', '#142019', '#ffd7a8', '#ffffff', '#c45c26']
  const bits = Array.from({ length: 72 }, (_, i) => {
    const left = i % 2 === 0
    const angle = left
      ? ((-28 - Math.random() * 52) * Math.PI) / 180
      : ((-152 + Math.random() * 52) * Math.PI) / 180
    const speed = 6 + Math.random() * 8
    return {
      x: left ? w * 0.14 : w * 0.86,
      y: h * 0.62,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.34,
      bw: 3.5 + Math.random() * 5,
      bh: 5 + Math.random() * 8,
      color: colors[i % colors.length],
      round: Math.random() > 0.68,
      life: 1,
    }
  })
  let raf = 0
  let live = true
  const tick = () => {
    if (!live) return
    ctx.clearRect(0, 0, w, h)
    bits.forEach((bit) => {
      bit.vy += 0.16
      bit.vx *= 0.992
      bit.x += bit.vx
      bit.y += bit.vy
      bit.rot += bit.vr
      bit.life -= 0.008
      if (bit.life <= 0) return
      ctx.save()
      ctx.globalAlpha = Math.max(0, bit.life)
      ctx.translate(bit.x, bit.y)
      ctx.rotate(bit.rot)
      ctx.fillStyle = bit.color
      if (bit.round) {
        ctx.beginPath()
        ctx.arc(0, 0, bit.bw / 1.6, 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillRect(-bit.bw / 2, -bit.bh / 2, bit.bw, bit.bh)
      }
      ctx.restore()
    })
    raf = window.requestAnimationFrame(tick)
  }
  tick()
  const halt = window.setTimeout(() => {
    live = false
    window.cancelAnimationFrame(raf)
    ctx.clearRect(0, 0, w, h)
  }, 2200)
  return () => {
    live = false
    window.clearTimeout(halt)
    window.cancelAnimationFrame(raf)
  }
}

function cellAtPoint(board, clientX, clientY, size) {
  if (!board) return -1
  const rect = board.getBoundingClientRect()
  const x = clientX - rect.left
  const y = clientY - rect.top
  if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return -1
  const col = Math.min(size - 1, Math.floor((x / rect.width) * size))
  const row = Math.min(size - 1, Math.floor((y / rect.height) * size))
  return row * size + col
}

/** LinkedIn continuous green pipe through cell centers. */
function ZipPipe({ path, size }) {
  if (!path.length) return null
  const cell = 100 / size
  const stroke = cell * 0.58
  const points = path.map((index) => {
    const col = index % size
    const row = Math.floor(index / size)
    return `${col * cell + cell / 2},${row * cell + cell / 2}`
  }).join(' ')
  const tip = path[path.length - 1]
  const tipCol = tip % size
  const tipRow = Math.floor(tip / size)
  return (
    <svg className="pdg-zip-ink" viewBox="0 0 100 100" aria-hidden="true">
      {path.length === 1 ? (
        <circle
          cx={tipCol * cell + cell / 2}
          cy={tipRow * cell + cell / 2}
          r={stroke / 2}
          fill={PATH}
        />
      ) : (
        <polyline
          points={points}
          fill="none"
          stroke={PATH}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function ZipWalls({ walls, size }) {
  if (!walls?.length) return null
  const cell = 100 / size
  const w = Math.max(2.2, cell * 0.11)
  return (
    <svg className="pdg-zip-walls" viewBox="0 0 100 100" aria-hidden="true">
      {walls.map((key) => {
        const [a, b] = key.split('-').map(Number)
        const ar = Math.floor(a / size)
        const ac = a % size
        const br = Math.floor(b / size)
        const bc = b % size
        if (ar === br) {
          const x = Math.max(ac, bc) * cell
          const y = ar * cell
          return (
            <line
              key={key}
              x1={x}
              y1={y + cell * 0.14}
              x2={x}
              y2={y + cell * 0.86}
              stroke="#111"
              strokeWidth={w}
              strokeLinecap="round"
            />
          )
        }
        const x = ac * cell
        const y = Math.max(ar, br) * cell
        return (
          <line
            key={key}
            x1={x + cell * 0.14}
            y1={y}
            x2={x + cell * 0.86}
            y2={y}
            stroke="#111"
            strokeWidth={w}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

export default function PulseDeskGames() {
  const { user } = useAuth()
  const email = user?.email || ''
  const boardRef = useRef(null)
  const drawingRef = useRef(false)
  const lastCellRef = useRef(-1)
  const startedRef = useRef(0)
  const playRef = useRef({ path: [], backtracks: 0 })
  const lockRef = useRef(false)
  const puzzleNo = useMemo(() => deskPuzzleNumber(), [])
  const puzzle = useMemo(() => todayZip(), [])
  const [play, setPlay] = useState({ path: [], backtracks: 0 })
  const [elapsed, setElapsed] = useState(0)
  const [lock, setLock] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [board, setBoard] = useState(emptyZipBoard)
  const burstRef = useRef(null)

  playRef.current = play
  const won = lock || zipSolved(play.path, puzzle)
  const avgMs = board.avgMs || 16000
  const need = nextZipNumber(play.path, puzzle.marks)
  const nextCell = Object.entries(puzzle.marks).find(([, value]) => value === need)?.[0]
  const size = puzzle.size

  const commit = useCallback((next) => {
    if (!next || next === playRef.current) return
    if (next.path === playRef.current.path) return
    if (
      next.path.length === playRef.current.path.length
      && next.path.every((cell, i) => cell === playRef.current.path[i])
      && next.backtracks === playRef.current.backtracks
    ) return
    if (!startedRef.current && next.path.length) startedRef.current = Date.now()
    playRef.current = next
    setPlay(next)
  }, [])

  const paintTo = useCallback((index) => {
    if (lockRef.current || index < 0) return
    if (index === lastCellRef.current) return
    lastCellRef.current = index
    commit(steerZipPath(playRef.current, index, puzzle))
  }, [commit, puzzle])

  const resetBoard = useCallback(() => {
    zipBurstFor = ''
    lockRef.current = false
    startedRef.current = 0
    drawingRef.current = false
    lastCellRef.current = -1
    const empty = { path: [], backtracks: 0 }
    playRef.current = empty
    setPlay(empty)
    setElapsed(0)
    setLock(false)
    setCelebrate(false)
  }, [])

  useEffect(() => { resetBoard() }, [email, resetBoard])

  useEffect(() => {
    let live = true
    fetchZipToday()
      .then((data) => { if (live && data) setBoard(data) })
      .catch(() => {})
    return () => { live = false }
  }, [email])

  useEffect(() => {
    if (lock || !startedRef.current) return undefined
    const tick = window.setInterval(() => {
      setElapsed(Date.now() - startedRef.current)
    }, 200)
    return () => window.clearInterval(tick)
  }, [lock, play.path.length])

  const finish = useCallback((nextPlay, timeMs) => {
    const points = zipScore(timeMs, nextPlay.backtracks)
    markZipPlayed(email, {
      points,
      won: true,
      path: nextPlay.path,
      backtracks: nextPlay.backtracks,
      timeMs,
    })
    setPlay(nextPlay)
    playRef.current = nextPlay
    setLock(true)
    lockRef.current = true
    setElapsed(timeMs)
    submitZipFinish({ timeMs, backtracks: nextPlay.backtracks })
      .then((data) => { if (data) setBoard(data) })
      .catch(() => {})
  }, [email])

  useEffect(() => {
    if (!won) return
    const token = `${puzzleNo}:${email}`
    if (zipBurstFor === token) return
    zipBurstFor = token
    setCelebrate(true)
  }, [email, puzzleNo, won])

  useEffect(() => {
    if (lock || !zipSolved(play.path, puzzle)) return undefined
    const timer = window.setTimeout(() => {
      if (lockRef.current) return
      lockRef.current = true
      const timeMs = startedRef.current ? Date.now() - startedRef.current : 0
      finish(play, timeMs)
    }, 80)
    return () => window.clearTimeout(timer)
  }, [finish, lock, play, puzzle])

  useEffect(() => {
    if (!celebrate) return undefined
    let stop = () => {}
    const id = window.requestAnimationFrame(() => {
      stop = spawnZipBurst(burstRef.current)
    })
    return () => {
      window.cancelAnimationFrame(id)
      stop()
    }
  }, [celebrate])

  const undo = useCallback(() => {
    if (lockRef.current) return
    setPlay((prev) => {
      if (prev.path.length <= 1) return prev
      const next = { path: prev.path.slice(0, -1), backtracks: prev.backtracks + 1 }
      playRef.current = next
      lastCellRef.current = next.path[next.path.length - 1] ?? -1
      return next
    })
  }, [])

  const hint = useCallback(() => {
    if (lockRef.current) return
    setPlay((prev) => {
      const solution = puzzle.solution
      let match = 0
      while (match < prev.path.length && prev.path[match] === solution[match]) match += 1
      let next = prev
      if (match < prev.path.length) {
        next = { path: solution.slice(0, Math.max(1, match + 1)), backtracks: prev.backtracks + 1 }
      } else if (!prev.path.length) {
        if (!startedRef.current) startedRef.current = Date.now()
        next = { path: [solution[0]], backtracks: prev.backtracks }
      } else if (match < solution.length) {
        next = { path: solution.slice(0, Math.min(solution.length, match + 2)), backtracks: prev.backtracks }
      }
      playRef.current = next
      lastCellRef.current = next.path[next.path.length - 1] ?? -1
      return next
    })
  }, [puzzle])

  const onBoardPointerDown = (event) => {
    if (lockRef.current) return
    if (event.button != null && event.button !== 0) return
    event.preventDefault()
    const index = cellAtPoint(boardRef.current, event.clientX, event.clientY, size)
    if (index < 0) return
    drawingRef.current = true
    lastCellRef.current = -1
    try {
      boardRef.current?.setPointerCapture?.(event.pointerId)
    } catch {
      /* ignore */
    }
    paintTo(index)
  }

  const onBoardPointerMove = (event) => {
    if (!drawingRef.current || lockRef.current) return
    const index = cellAtPoint(boardRef.current, event.clientX, event.clientY, size)
    if (index < 0) return
    paintTo(index)
  }

  const onBoardPointerUp = (event) => {
    drawingRef.current = false
    try {
      if (boardRef.current?.hasPointerCapture?.(event.pointerId)) {
        boardRef.current.releasePointerCapture(event.pointerId)
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (won) return undefined
    const onKey = (event) => {
      if (event.target?.closest?.('input, textarea, [contenteditable]')) return
      const prev = playRef.current
      const end = prev.path.length ? prev.path[prev.path.length - 1] : puzzle.start
      if (event.key === 'ArrowUp') { event.preventDefault(); paintTo(end - size) }
      else if (event.key === 'ArrowDown') { event.preventDefault(); paintTo(end + size) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); paintTo(end - 1) }
      else if (event.key === 'ArrowRight') { event.preventDefault(); paintTo(end + 1) }
      else if (event.key === 'Backspace' || ((event.metaKey || event.ctrlKey) && event.key === 'z')) {
        event.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paintTo, puzzle.start, size, undo, won])

  return (
    <div
      className={`pdg${won ? ' is-win' : ''}`}
      tabIndex={0}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.focus()
      }}
    >
      {!won ? (
        <header className="pdg-top">
          <div className="pdg-brand">
            <h2>Zip</h2>
            <p className="pdg-kicker">No. {puzzleNo}</p>
          </div>
          <div className="pdg-stats">
            {board.mine ? <span><b>{ordinal(board.mine.rank)}</b></span> : null}
            <span><b>{formatZipTime(elapsed)}</b></span>
          </div>
        </header>
      ) : null}

      {won ? (
        <div className="pdg-zip-win">
          <section className={`pdg-zip-hero${celebrate ? ' is-burst' : ''}`}>
            <canvas ref={burstRef} className="pdg-zip-burst" aria-hidden="true" />
            {celebrate ? (
              <>
                <span className="pdg-zip-popper is-l" aria-hidden="true">🎉</span>
                <span className="pdg-zip-popper is-r" aria-hidden="true">🎉</span>
              </>
            ) : null}
            <span className="pdg-zip-flag" aria-hidden="true"><i /><i /><i /></span>
            <p>Zip #{puzzleNo}</p>
            <h3>{crushLine(elapsed, Math.floor(avgMs / 1000), play.backtracks)}</h3>
            <article className="pdg-zip-stat">
              <strong>{formatZipTime(elapsed)}</strong>
              <span>{play.backtracks} backtrack{play.backtracks === 1 ? '' : 's'}</span>
              <ZipMark />
              <strong>{formatZipTime(avgMs)}</strong>
              <span>Today’s avg</span>
            </article>
            {board.ranks.length ? (
              <ol className="pdg-zip-ranks">
                {(board.mine && !board.ranks.slice(0, 5).some((row) => row.isMe)
                  ? [...board.ranks.slice(0, 5), board.mine]
                  : board.ranks.slice(0, 5)
                ).map((row) => (
                  <li key={row.rank} className={row.isMe ? 'is-me' : undefined}>
                    <em>{row.rank}</em>
                    <span>{row.isMe ? 'You' : row.name}</span>
                    <b>{formatZipTime(row.timeMs)}</b>
                  </li>
                ))}
              </ol>
            ) : null}
            <button type="button" className="pdg-zip-again" onClick={resetBoard}>Play again</button>
          </section>
        </div>
      ) : (
        <div className="pdg-saucer pdg-zip">
          <div
            ref={boardRef}
            className="pdg-zip-board"
            style={{ '--zip-n': size }}
            onPointerDown={onBoardPointerDown}
            onPointerMove={onBoardPointerMove}
            onPointerUp={onBoardPointerUp}
            onPointerCancel={onBoardPointerUp}
          >
            <div className="pdg-zip-wash-layer" aria-hidden="true">
              {play.path.map((index) => {
                const col = index % size
                const row = Math.floor(index / size)
                return (
                  <span
                    key={index}
                    className="pdg-zip-wash-cell"
                    style={{
                      gridColumn: col + 1,
                      gridRow: row + 1,
                      background: WASH,
                    }}
                  />
                )
              })}
            </div>
            <ZipPipe path={play.path} size={size} />
            <ZipWalls walls={puzzle.walls} size={size} />
            <div
              className="pdg-zip-grid"
              role="grid"
              style={{
                gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: size * size }, (_, index) => {
                const mark = puzzle.marks[index]
                const start = mark === 1 && !play.path.length
                const aim = nextCell != null && Number(nextCell) === index && play.path.length > 0
                return (
                  <div
                    key={index}
                    className={[
                      'pdg-zip-cell',
                      mark ? 'is-mark' : '',
                      start ? 'is-start' : '',
                      aim ? 'is-next' : '',
                    ].filter(Boolean).join(' ')}
                    aria-label={mark ? `Number ${mark}` : `Cell ${index + 1}`}
                  >
                    {mark ? <b>{mark}</b> : null}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="pdg-zip-tools">
            <button type="button" onClick={undo} disabled={play.path.length <= 1}>Undo</button>
            <button type="button" onClick={hint}>Hint</button>
          </div>
          <details className="pdg-zip-howto">
            <summary>How to play</summary>
            <div className="pdg-zip-howto-body">
              <figure>
                <span className="pdg-zip-howto-dots" aria-hidden="true">1—2—3</span>
                <figcaption>Connect the dots in order</figcaption>
              </figure>
              <figure>
                <span className="pdg-zip-howto-fill" aria-hidden="true" />
                <figcaption>Fill every cell</figcaption>
              </figure>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
