import { HeatCalendarContext, useHeatCalendarModel } from './context'
import { HeatCalendarGrid } from './grid'
import { HeatCalendarLegend } from './legend'
import { HeatCalendarTooltip } from './tooltip'
import { cn } from './utils'
import './heat-calendar.css'

/**
 * beUI Heat Calendar — composable Grid, Legend, and Tooltip.
 * @see https://beui.dev/charts/heat-calendar
 */
export function HeatCalendar({ children, className, ...props }) {
  const model = useHeatCalendarModel(props)
  return (
    <HeatCalendarContext.Provider value={model}>
      <div className={cn('pulse-hc', className)}>
        {children === undefined ? (
          <>
            <HeatCalendarGrid>
              <HeatCalendarTooltip />
            </HeatCalendarGrid>
            <HeatCalendarLegend />
          </>
        ) : (
          children
        )}
      </div>
    </HeatCalendarContext.Provider>
  )
}

export { useHeatCalendar } from './context'
export { HeatCalendarGrid } from './grid'
export { HeatCalendarLegend } from './legend'
export { HeatCalendarTooltip } from './tooltip'
export { demoHeatValues, hoursToHeatValues } from './utils'
