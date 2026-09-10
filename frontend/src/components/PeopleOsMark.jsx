const LOCKUP = '/bda-logo-lockup.png'

/** BDA Technologies lockup — used as the Home / brand mark. */
export default function PeopleOsMark({ size = 18, className = '', title = 'BDA Technologies' }) {
  return (
    <img
      src={LOCKUP}
      alt={title}
      width={size}
      height={size}
      className={`people-os-mark${className ? ` ${className}` : ''}`}
    />
  )
}
