export const DRAG_THRESHOLD = 6
export const SWAP_LOCK_PX = 36

export function moveId(list, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return list
  const next = [...list]
  const from = next.indexOf(fromId)
  const to = next.indexOf(toId)
  if (from < 0 || to < 0) return list
  next.splice(from, 1)
  next.splice(to, 0, fromId)
  return next
}

export function hitIdFromPoint(ids, refs, clientX, clientY, skipId) {
  let insideId = null
  let insideArea = Infinity
  let best = null
  let bestDist = Infinity
  for (const id of ids) {
    if (skipId && id === skipId) continue
    const el = refs.current.get(id)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    const isInside =
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    if (isInside) {
      const area = r.width * r.height
      if (area < insideArea) {
        insideArea = area
        insideId = id
      }
    }
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dist = (clientX - cx) ** 2 + (clientY - cy) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = id
    }
  }
  return insideId || best
}

/** Swap only after the pointer crosses the target's center in the drag direction. */
export function crossedSwapMid(ids, refs, fromId, hitId, x, y) {
  if (!fromId || !hitId || fromId === hitId) return false
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(hitId)
  if (from < 0 || to < 0) return false
  const el = refs.current.get(hitId)
  if (!el) return false
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const tall = hitId === 'today' || r.height >= 180
  if (from < to) {
    return tall ? y >= cy : (y >= cy || x >= cx)
  }
  return tall ? y <= cy : (y <= cy || x <= cx)
}
