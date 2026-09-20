import { useHeatCalendar } from './context'
import { cn, fmtRange, STEPS } from './utils'

export function HeatCalendarLegend({ className }) {
  const { start, end, step, setStep, fill, canHover, reduce } = useHeatCalendar()
  return (
    <div className={cn('pulse-hc-legend', className)}>
      <span className="pulse-hc-legend-range">
        {start && end ? `${fmtRange.format(start)} – ${fmtRange.format(end)}` : '\u00a0'}
      </span>
      <span className="pulse-hc-legend-steps" onPointerLeave={() => setStep(null)}>
        <span>Less</span>
        {STEPS.map((s, i) => (
          <button
            type="button"
            aria-label={`Show activity level ${i}`}
            aria-pressed={step === i}
            key={s}
            onPointerEnter={() => {
              if (canHover) setStep(i)
            }}
            onFocus={() => setStep(i)}
            onBlur={() => setStep(null)}
            onClick={() => setStep(step === i ? null : i)}
            className="pulse-hc-legend-swatch"
            style={{
              background: fill(i),
              transform: !reduce && step === i ? 'scale(1.25)' : undefined,
            }}
          />
        ))}
        <span>More</span>
      </span>
    </div>
  )
}
