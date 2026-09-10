import { useId } from 'react'

/** Pulse - HR product mark (static circular logo). */
export default function PulseMark({ size = 64, className = '', title = 'BDA OS' }) {
  const uid = useId().replace(/:/g, '')
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`pulse-ring-${uid}`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e42527" />
          <stop offset="0.35" stopColor="#f5c400" />
          <stop offset="0.65" stopColor="#21a05a" />
          <stop offset="1" stopColor="#2b8aed" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" stroke={`url(#pulse-ring-${uid})`} strokeWidth="3.5" />
      <circle cx="32" cy="24" r="8" fill="#226db4" />
      <path
        d="M16 48c2.8-8 8.2-12 16-12s13.2 4 16 12"
        stroke="#226db4"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M22 33.5h5.5l2.2-5 3.2 10 2.8-7H42"
        stroke="#e42527"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
