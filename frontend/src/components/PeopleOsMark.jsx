const LOGO = '/bda-logo.png'

/** BDA Technologies wordmark — Home dock brand mark. */
export default function PeopleOsMark({ size = 22, className = '', title = 'BDA Technologies' }) {
  return (
    <img
      src={LOGO}
      alt={title}
      width={size}
      height={size}
      className={`people-os-mark${className ? ` ${className}` : ''}`}
      draggable={false}
    />
  )
}
