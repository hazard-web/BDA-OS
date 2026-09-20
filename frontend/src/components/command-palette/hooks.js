import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useOnOpen(open, start) {
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) start()
  }
}

function indexOfCursor(rows, query, cursor) {
  if (cursor === null || cursor.query !== query) return -1
  return rows.findIndex((row) => row.id === cursor.id)
}

export function useRowCursor(rows, query) {
  const [cursor, setCursor] = useState(null)
  const latest = useRef({ rows, query })
  useLayoutEffect(() => {
    latest.current = { rows, query }
  })

  const cursorRow = indexOfCursor(rows, query, cursor)
  if (cursor !== null && cursorRow < 0) setCursor(null)

  const moveTo = useCallback((id) => {
    setCursor(id === null ? null : { id, query: latest.current.query })
  }, [])

  const moveActive = useCallback((direction) => {
    const { rows: live, query: liveQuery } = latest.current
    const last = live.length - 1
    if (last < 0) return
    setCursor((current) => {
      const at = Math.max(indexOfCursor(live, liveQuery, current), 0)
      const next = Math.min(Math.max(at + direction, 0), last)
      return { id: live[next].id, query: liveQuery }
    })
  }, [])

  return { activeIndex: cursorRow < 0 ? 0 : cursorRow, moveTo, moveActive }
}

export function useTouchCapable() {
  const [canTouch, setCanTouch] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mq = window.matchMedia?.('(any-pointer: coarse)')
    const update = () => setCanTouch(Boolean(mq?.matches) || navigator.maxTouchPoints > 0)
    update()
    mq?.addEventListener?.('change', update)
    return () => mq?.removeEventListener?.('change', update)
  }, [])

  return canTouch
}
