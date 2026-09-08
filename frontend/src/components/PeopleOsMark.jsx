/** People OS brand mark — four-square grid (red / amber / green / blue). */
export default function PeopleOsMark({ size = 18, className = '', title = 'People OS' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      className={`people-os-mark${className ? ` ${className}` : ''}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <rect x="0" y="0" width="8" height="8" rx="1.6" fill="#e42527" />
      <rect x="10" y="0" width="8" height="8" rx="1.6" fill="#f5c400" />
      <rect x="0" y="10" width="8" height="8" rx="1.6" fill="#21a05a" />
      <rect x="10" y="10" width="8" height="8" rx="1.6" fill="#2b8aed" />
    </svg>
  )
}
