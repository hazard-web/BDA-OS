const LOGO = '/bda-logo.png'
const RAIL_LOGO = '/bda-logo-rail.png'

/** BDA Technologies wordmark — Home dock brand mark. */
export default function PeopleOsMark({ size = 22, className = '', title = 'BDA Technologies', variant = 'default' }) {
  const src = variant === 'rail' ? RAIL_LOGO : LOGO
  return (
    <img
      src={src}
      alt={title}
      width={size}
      height={variant === 'rail' ? Math.round(size * 0.61) : size}
      className={`people-os-mark${className ? ` ${className}` : ''}`}
      draggable={false}
    />
  )
}
