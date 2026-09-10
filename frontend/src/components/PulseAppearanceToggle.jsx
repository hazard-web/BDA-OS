import { MoonOutlined, SunOutlined } from '@ant-design/icons'
import { useTheme } from '../context/ThemeContext'

export default function PulseAppearanceToggle({ variant = 'icon' }) {
  const { theme, setTheme } = useTheme()
  const dark = theme === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  const icon = dark ? <SunOutlined /> : <MoonOutlined />
  const toggle = () => setTheme(dark ? 'light' : 'dark')

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
        aria-pressed={dark}
        className={dark ? 'is-on' : undefined}
        onClick={toggle}
      >
        {icon}
      </button>
    )
  }

  if (variant === 'ribbon') {
    return (
      <button
        type="button"
        title={label}
        className={`pulse-ribbon-btn${dark ? ' is-on' : ''}`}
        aria-label={label}
        aria-pressed={dark}
        onClick={toggle}
      >
        {icon}
      </button>
    )
  }

  // No Ant Tooltip — its dark bubble was showing as a black hover smear under the header.
  return (
    <span
      role="button"
      tabIndex={0}
      title={label}
      className="pulse-appearance-btn"
      aria-label={label}
      aria-pressed={dark}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      {icon}
    </span>
  )
}
