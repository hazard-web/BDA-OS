/**
 * LinkedIn-style Zip engine: Hamiltonian path puzzles with optional walls.
 * Every generated board is solvable by construction.
 */

export const ZIP_DEFAULT_SIZE = 6

export function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function zipEdgeKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

export function zipNeighbors(index, size) {
  const row = Math.floor(index / size)
  const col = index % size
  const next = []
  if (row > 0) next.push(index - size)
  if (row < size - 1) next.push(index + size)
  if (col > 0) next.push(index - 1)
  if (col < size - 1) next.push(index + 1)
  return next
}

export function zipWallBetween(a, b, walls) {
  if (!walls?.length) return false
  return walls.includes(zipEdgeKey(a, b))
}

export function zipAdjacent(a, b, size, walls) {
  if (!zipNeighbors(a, size).includes(b)) return false
  return !zipWallBetween(a, b, walls)
}

function snakePath(size) {
  const path = []
  for (let row = 0; row < size; row += 1) {
    if (row % 2 === 0) {
      for (let col = 0; col < size; col += 1) path.push(row * size + col)
    } else {
      for (let col = size - 1; col >= 0; col -= 1) path.push(row * size + col)
    }
  }
  return path
}

/** Warnsdorff-ordered backtracking Hamiltonian path on an open grid. */
export function hamiltonianPath(size, rand) {
  const total = size * size
  const start = Math.floor(rand() * total)
  const path = [start]
  const used = new Uint8Array(total)
  used[start] = 1
  let steps = 0
  const limit = Math.max(12000, total * total * 8)

  const walk = () => {
    if (path.length === total) return true
    if (steps > limit) return false
    steps += 1
    const cur = path[path.length - 1]
    const opts = zipNeighbors(cur, size).filter((cell) => !used[cell])
    opts.sort((a, b) => {
      const da = zipNeighbors(a, size).filter((cell) => !used[cell]).length
      const db = zipNeighbors(b, size).filter((cell) => !used[cell]).length
      return da - db || rand() - 0.5
    })
    for (let i = 0; i < opts.length; i += 1) {
      const next = opts[i]
      path.push(next)
      used[next] = 1
      if (walk()) return true
      path.pop()
      used[next] = 0
    }
    return false
  }

  if (walk()) return path
  return snakePath(size)
}

function pickMarkSlots(length, count, rand) {
  const want = Math.max(2, Math.min(count, length))
  const picks = new Set([0, length - 1])
  let guard = 0
  while (picks.size < want && guard < 120) {
    picks.add(1 + Math.floor(rand() * Math.max(1, length - 2)))
    guard += 1
  }
  return [...picks].sort((a, b) => a - b)
}

/** Walls only on edges the solution never uses — always keeps the puzzle solvable. */
export function makeWalls(solution, size, rand, intensity = 0.22) {
  const pathEdges = new Set()
  for (let i = 1; i < solution.length; i += 1) {
    pathEdges.add(zipEdgeKey(solution[i - 1], solution[i]))
  }
  const candidates = []
  for (let i = 0; i < size * size; i += 1) {
    zipNeighbors(i, size).forEach((j) => {
      if (j <= i) return
      const key = zipEdgeKey(i, j)
      if (!pathEdges.has(key)) candidates.push(key)
    })
  }
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = candidates[i]
    candidates[i] = candidates[j]
    candidates[j] = tmp
  }
  const want = Math.min(
    candidates.length,
    Math.max(0, Math.floor(candidates.length * intensity)),
  )
  return candidates.slice(0, want)
}

/**
 * Generate a solvable Zip puzzle.
 * @param {number} seed
 * @param {{ size?: number, markCount?: number, wallIntensity?: number }} [opts]
 */
export function generateZip(seed, opts = {}) {
  const n = (seed >>> 0) || 1
  const rand = seeded(n)
  const size = Math.max(3, Math.min(9, Number(opts.size) || ZIP_DEFAULT_SIZE))
  const total = size * size
  const solution = hamiltonianPath(size, rand)
  const defaultMarks = size <= 4 ? 4 : size <= 5 ? 6 : 7 + Math.floor(rand() * 3)
  const markCount = Math.max(2, Math.min(total, Number(opts.markCount) || defaultMarks))
  const slots = pickMarkSlots(solution.length, markCount, rand)
  const marks = {}
  slots.forEach((pos, index) => {
    marks[solution[pos]] = index + 1
  })
  const wallIntensity = opts.wallIntensity ?? (size <= 4 ? 0.12 : size <= 5 ? 0.18 : 0.24)
  const walls = makeWalls(solution, size, rand, wallIntensity)
  return {
    size,
    marks,
    walls,
    solution,
    count: slots.length,
    start: solution[0],
    end: solution[solution.length - 1],
    seed: n,
  }
}

export const ZIP_LEVELS = [
  { id: 'easy', label: 'Easy', size: 4, markCount: 4, wallIntensity: 0.1 },
  { id: 'medium', label: 'Medium', size: 5, markCount: 6, wallIntensity: 0.18 },
  { id: 'hard', label: 'Hard', size: 6, markCount: 8, wallIntensity: 0.24 },
]

export function nextZipNumber(path, marks) {
  let max = 0
  path.forEach((cell) => {
    const value = marks[cell]
    if (value) max = Math.max(max, value)
  })
  return max + 1
}

export function zipPathLegal(path, marks, size, walls) {
  if (!path.length) return false
  if (marks[path[0]] !== 1) return false
  const seen = new Set()
  let expected = 1
  for (let i = 0; i < path.length; i += 1) {
    const cell = path[i]
    if (seen.has(cell)) return false
    seen.add(cell)
    if (i > 0 && !zipAdjacent(path[i - 1], cell, size, walls)) return false
    const value = marks[cell]
    if (value) {
      if (value !== expected) return false
      expected += 1
    }
  }
  return true
}

export function zipSolved(path, puzzle) {
  const total = puzzle.size * puzzle.size
  if (path.length !== total) return false
  if (!zipPathLegal(path, puzzle.marks, puzzle.size, puzzle.walls)) return false
  const order = path.map((cell) => puzzle.marks[cell]).filter(Boolean)
  return order.length === puzzle.count && order.every((value, index) => value === index + 1)
}

export function zipStepOptions(from, target, size, walls) {
  if (from < 0 || target < 0 || from === target) return []
  const fromRow = Math.floor(from / size)
  const fromCol = from % size
  const toRow = Math.floor(target / size)
  const toCol = target % size
  const options = []
  if (toRow < fromRow) options.push(from - size)
  if (toRow > fromRow) options.push(from + size)
  if (toCol < fromCol) options.push(from - 1)
  if (toCol > fromCol) options.push(from + 1)
  const preferVert = Math.abs(toRow - fromRow) >= Math.abs(toCol - fromCol)
  options.sort((a, b) => {
    const aVert = Math.abs(a - from) === size
    const bVert = Math.abs(b - from) === size
    if (preferVert) return (bVert ? 1 : 0) - (aVert ? 1 : 0)
    return (aVert ? 1 : 0) - (bVert ? 1 : 0)
  })
  return options.filter((step) => zipAdjacent(from, step, size, walls))
}

export function extendZipPath(prev, index, puzzle) {
  const { marks, size, walls } = puzzle
  if (!prev.path.length) {
    if (marks[index] !== 1) return prev
    return { path: [index], backtracks: prev.backtracks || 0 }
  }
  const at = prev.path.indexOf(index)
  if (at >= 0) {
    if (at >= prev.path.length - 1) return prev
    return { path: prev.path.slice(0, at + 1), backtracks: (prev.backtracks || 0) + 1 }
  }
  const end = prev.path[prev.path.length - 1]
  if (!zipAdjacent(end, index, size, walls)) return prev
  const mark = marks[index]
  if (mark && mark !== nextZipNumber(prev.path, marks)) return prev
  const path = [...prev.path, index]
  if (!zipPathLegal(path, marks, size, walls)) return prev
  return { path, backtracks: prev.backtracks || 0 }
}

/**
 * LinkedIn-style steer: truncate if target is on the path, else walk
 * orthogonally toward the pointer one legal cell at a time.
 */
export function steerZipPath(prev, target, puzzle) {
  if (target == null || target < 0) return prev
  const total = puzzle.size * puzzle.size
  if (target >= total) return prev
  let cur = prev
  for (let guard = 0; guard < total; guard += 1) {
    if (!cur.path.length) {
      if (puzzle.marks[target] === 1) {
        return { path: [target], backtracks: cur.backtracks || 0 }
      }
      return cur
    }
    const tip = cur.path[cur.path.length - 1]
    if (tip === target) return cur
    const at = cur.path.indexOf(target)
    if (at >= 0) {
      return {
        path: cur.path.slice(0, at + 1),
        backtracks: (cur.backtracks || 0) + 1,
      }
    }
    const options = zipStepOptions(tip, target, puzzle.size, puzzle.walls)
    let advanced = false
    for (let i = 0; i < options.length; i += 1) {
      const next = extendZipPath(cur, options[i], puzzle)
      if (next.path.length > cur.path.length) {
        cur = next
        advanced = true
        break
      }
    }
    if (!advanced) return cur
  }
  return cur
}

export function formatZipTime(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
