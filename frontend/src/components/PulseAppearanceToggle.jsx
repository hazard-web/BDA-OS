import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import { ThemeToggle, useThemeToggle } from './beui/ThemeToggle'

export default function PulseAppearanceToggle({ variant = 'switch' }) {
  const { isDark, toggle } = useThemeToggle({
    variant: 'circle',
    start: 'center',
  })
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle()
    }
  }

  if (variant === 'rail') {
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={isDark}
        className={isDark ? 'is-on' : undefined}
        onClick={toggle}
      >
        {isDark ? <SunOutlined /> : <MoonOutlined />}
      </button>
    )
  }

  if (variant === 'ribbon') {
    return (
      <button
        type="button"
        title={label}
        className={`pulse-ribbon-btn${isDark ? ' is-on' : ''}`}
        aria-label={label}
        aria-pressed={isDark}
        onClick={toggle}
      >
        {isDark ? <SunOutlined /> : <MoonOutlined />}
      </button>
    )
  }

  if (variant === 'icon') {
    return (
      <span
        role="button"
        tabIndex={0}
        title={label}
        className="pulse-appearance-btn"
        aria-label={label}
        aria-pressed={isDark}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        {isDark ? <SunOutlined /> : <MoonOutlined />}
      </span>
    )
  }

  // Header CTA — beUI circle View Transition theme toggle
  return (
    <ThemeToggle
      variant="circle"
      start="center"
      className="pulse-theme-toggle"
      iconClassName="pulse-theme-toggle-icon"
    />
  )
}
