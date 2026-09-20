/**
 * Adapted from beUI Command Palette (MIT)
 * https://beui.dev/components/blocks/command-palette
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Search } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOnOpen, useRowCursor, useTouchCapable } from './hooks'
import { searchCommands } from './search'
import './command-palette.css'

const EASE_OUT = [0.16, 1, 0.3, 1]
const PANEL_SPRING = { type: 'spring', stiffness: 560, damping: 40, mass: 0.5 }

export function CommandPalette({
  items,
  shortcut = 'k',
  placeholder = 'Type a command or search…',
  emptyMessage = 'No results found.',
  open: controlledOpen,
  onOpenChange,
  onQueryChange,
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : internalOpen
  const setOpen = useCallback(
    (value) => {
      if (!controlled) setInternalOpen(value)
      onOpenChange?.(value)
    },
    [controlled, onOpenChange],
  )

  const [query, setQuery] = useState('')
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const uid = useId()
  const reduce = useReducedMotion()
  const canTouch = useTouchCapable()
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const updateQuery = (value) => {
    setQuery(value)
    onQueryChange?.(value)
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.isComposing) return
      if (event.repeat) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === shortcut.toLowerCase()) {
        event.preventDefault()
        setOpen(!open)
        return
      }
      if (event.key === 'Escape' && open) {
        event.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, shortcut, setOpen])

  useEffect(() => {
    if (!open) return undefined
    const root = document.documentElement
    const previousRootOverflow = root.style.overflow
    const previousBodyOverflow = document.body.style.overflow
    root.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previousRootOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [open])

  const filtered = useMemo(() => searchCommands(items, query), [items, query])
  const hasIcons = useMemo(() => items.some((item) => item.icon), [items])
  const grouped = useMemo(() => {
    const map = new Map()
    filtered.forEach((item) => {
      const group = item.group || 'Results'
      const list = map.get(group) || []
      list.push(item)
      map.set(group, list)
    })
    return Array.from(map.entries())
  }, [filtered])
  const rows = useMemo(() => grouped.flatMap(([, list]) => list), [grouped])
  const { activeIndex: active, moveTo, moveActive } = useRowCursor(rows, query)

  useOnOpen(open, () => {
    setQuery('')
    moveTo(null)
  })

  useEffect(() => {
    if (open) onQueryChange?.('')
  }, [open, onQueryChange])

  useEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = rows[active]
      if (item) {
        item.onSelect()
        setOpen(false)
      }
    }
  }

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <>
      <AnimatePresence>
        {open ? (
          <motion.button
            key="pulse-cmd-backdrop"
            type="button"
            aria-label="Close command palette"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            onClick={() => setOpen(false)}
            className="pulse-cmd-backdrop"
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open ? (
          <motion.div
            key="pulse-cmd-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: reduce ? 0 : -8, scale: reduce ? 1 : 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: reduce ? 0 : -8,
              scale: reduce ? 1 : 0.97,
              transition: { duration: 0.12, ease: EASE_OUT },
            }}
            transition={reduce ? { duration: 0.1 } : PANEL_SPRING}
            onKeyDown={onKeyDown}
            className="pulse-cmd-panel"
          >
                  <div className="pulse-cmd-head">
                    <Search className="pulse-cmd-search-ico" size={16} aria-hidden="true" />
                    <input
                      ref={inputRef}
                      value={query}
                      onChange={(event) => updateQuery(event.target.value)}
                      placeholder={placeholder}
                      role="combobox"
                      aria-expanded="true"
                      aria-controls={`${uid}-list`}
                      aria-activedescendant={rows.length > 0 ? `${uid}-opt-${active}` : undefined}
                      aria-autocomplete="list"
                      className={`pulse-cmd-input${canTouch ? ' is-touch' : ''}`}
                    />
                    <kbd className="pulse-cmd-esc">ESC</kbd>
                  </div>

                  <div
                    ref={listRef}
                    id={`${uid}-list`}
                    role="listbox"
                    aria-label="Commands"
                    className="pulse-cmd-list"
                  >
                    {rows.length === 0 ? (
                      <p className="pulse-cmd-empty">{emptyMessage}</p>
                    ) : (
                      grouped.map(([group, list]) => (
                        <div key={group} className="pulse-cmd-group">
                          <div className="pulse-cmd-group-label" aria-hidden="true">
                            {group}
                          </div>
                          {list.map((item) => {
                            const idx = rows.indexOf(item)
                            const isActive = idx === active
                            const Icon = item.icon
                            return (
                              <button
                                key={item.id}
                                type="button"
                                id={`${uid}-opt-${idx}`}
                                role="option"
                                aria-selected={isActive}
                                data-index={idx}
                                onMouseEnter={() => moveTo(item.id)}
                                onClick={() => {
                                  item.onSelect()
                                  setOpen(false)
                                }}
                                className={`pulse-cmd-row${isActive ? ' is-active' : ''}`}
                              >
                                {isActive ? (
                                  <motion.span
                                    layoutId={`${uid}-active`}
                                    className="pulse-cmd-active"
                                    transition={
                                      reduce
                                        ? { duration: 0 }
                                        : { type: 'spring', stiffness: 480, damping: 38 }
                                    }
                                  />
                                ) : null}
                                {Icon ? (
                                  <Icon className="pulse-cmd-ico" size={16} aria-hidden="true" />
                                ) : hasIcons ? (
                                  <span className="pulse-cmd-ico-gap" aria-hidden="true" />
                                ) : null}
                                <span className="pulse-cmd-copy">
                                  <span className="pulse-cmd-label">{item.label}</span>
                                </span>
                                {item.badge || item.hint ? (
                                  <span className="pulse-cmd-meta">
                                    {item.badge ? <span className="pulse-cmd-badge">{item.badge}</span> : null}
                                    {item.hint ? <span className="pulse-cmd-hint">{item.hint}</span> : null}
                                  </span>
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
            ) : null}
          </AnimatePresence>
    </>,
    document.body,
  )
}

export default CommandPalette
