import { AnimatePresence, motion } from 'framer-motion'
import { useHeatCalendar } from './context'
import { cn, DAYS, EASE_OUT, fmtDay, GAP, LIFT, MONTH_ROW, PITCH, SPRING_PRESS } from './utils'

export function HeatCalendarGrid({ children, className }) {
  const {
    weeks,
    reduce,
    canHover,
    pinned,
    step,
    settled,
    level,
    bucket,
    fill,
    hoursText,
    dateOf,
    future,
    cols,
    span,
    hot,
    hotMonth,
    setHover,
    gridRef,
    tooltipId,
  } = useHeatCalendar()

  return (
    <div
      ref={gridRef}
      className={cn('pulse-hc-grid', className)}
      style={{
        width: weeks * PITCH - GAP,
        maxWidth: '100%',
        gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
        gridTemplateRows: `${MONTH_ROW}px repeat(7, auto)`,
        gap: GAP,
      }}
      onPointerLeave={() => setHover(null)}
    >
      {cols.map((c) =>
        (c.label ? (
          <span
            key={c.id}
            className={cn('pulse-hc-month', hotMonth === c.m && 'is-hot')}
            style={{ gridColumn: c.w + 1, gridRow: 1 }}
          >
            {c.label}
          </span>
        ) : null),
      )}
      {cols.map(({ id, w }) =>
        DAYS.map(({ id: dayId, d }) => {
          const date = dateOf(w, d)
          if (future(w, d)) return null
          const v = level(w, d)
          const b = bucket(v)
          const i = w * 7 + d
          const on = hot?.w === w && hot?.d === d
          const isEnd = span ? i === span.lo || i === span.hi : pinned?.w === w && pinned?.d === d
          const dim = (step !== null && step !== b) || (span !== null && (i < span.lo || i > span.hi))
          const dist = hot ? Math.max(Math.abs(hot.w - w), Math.abs(hot.d - d)) : 9
          const lift =
            reduce || !canHover ? 1 : dist === 0 ? LIFT[0] : canHover && dist < LIFT.length ? LIFT[dist] : 1

          return (
            <span
              key={`${id}-${dayId}`}
              className="pulse-hc-cell"
              style={{
                gridColumn: w + 1,
                gridRow: d + 2,
                opacity: dim ? 0.25 : 1,
                zIndex: lift > 1 ? LIFT.length - dist : 0,
              }}
            >
              <motion.button
                type="button"
                tabIndex={0}
                aria-label={`${hoursText(w, d)}${date ? ` on ${fmtDay.format(date)}` : ''}`}
                data-heat-cell={`${w}-${d}`}
                aria-describedby={on ? tooltipId : undefined}
                onPointerEnter={() => setHover({ w, d })}
                onFocus={() => setHover({ w, d })}
                onBlur={() => setHover(null)}
                className="pulse-hc-hit"
              >
                <motion.span
                  className={cn('pulse-hc-swatch', isEnd && 'is-end')}
                  style={{ background: fill(b) }}
                  initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                  animate={
                    settled
                      ? {
                          opacity: 1,
                          scale: lift,
                          transition: { ...SPRING_PRESS, delay: Math.min(dist, 3) * 0.03 },
                        }
                      : {
                          opacity: 1,
                          scale: 1,
                          transition: reduce ? { duration: 0 } : { ...SPRING_PRESS, delay: (w + d) * 0.018 },
                        }
                  }
                >
                  <AnimatePresence>
                    {on && !isEnd ? (
                      <motion.span
                        className="pulse-hc-ring"
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12, ease: EASE_OUT }}
                      />
                    ) : null}
                  </AnimatePresence>
                </motion.span>
              </motion.button>
            </span>
          )
        }),
      )}
      {children}
    </div>
  )
}
