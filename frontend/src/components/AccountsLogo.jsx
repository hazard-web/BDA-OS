/**
 * BDA OS mark - filled shield + person.
 */
export default function AccountsLogo({ size = 32, className = '', title = 'BDA OS' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <path
        fill="#15bc83"
        d="M16 3.2c2.55 1.55 5.55 2.5 8.55 2.65v8.55c0 5.35-3.45 9.95-8.55 12.05-5.1-2.1-8.55-6.7-8.55-12.05V5.85C10.45 5.7 13.45 4.75 16 3.2Z"
      />
      <circle cx="16" cy="12.4" r="3.15" fill="#fff" />
      <path
        fill="#fff"
        d="M9.55 22.35c1.05-3.55 3.55-5.35 6.45-5.35s5.4 1.8 6.45 5.35C20.7 23.55 18.45 24.3 16 24.45c-2.45-.15-4.7-.9-6.45-2.1Z"
      />
    </svg>
  )
}
