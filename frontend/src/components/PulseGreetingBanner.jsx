export function periodForHour(hour) {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  return 'evening'
}

function greetingTitle(period) {
  if (period === 'morning') return 'Good morning'
  if (period === 'afternoon') return 'Good afternoon'
  return 'Good evening'
}

function greetingLine(period, weekday) {
  if (period === 'morning') {
    if (weekday === 1) return 'New week. Start it kindly.'
    if (weekday === 5) return 'Friday — close the week well.'
    if (weekday === 0 || weekday === 6) return 'A quieter morning. Take it easy.'
    return 'The day is still unwritten.'
  }
  if (period === 'afternoon') {
    if (weekday === 5) return 'Almost there. Finish it clean.'
    return 'Keep the momentum going.'
  }
  if (weekday === 5) return "Week's nearly done. Ease out of it."
  return 'Ease into the rest of your evening.'
}

function Cloud({ className, delay }) {
  return (
    <svg className={className} style={{ animationDelay: delay }} viewBox="0 0 88 36" fill="none" aria-hidden="true">
      <ellipse cx="28" cy="22" rx="20" ry="12" />
      <ellipse cx="46" cy="16" rx="18" ry="14" />
      <ellipse cx="64" cy="22" rx="16" ry="11" />
    </svg>
  )
}

function SunMark() {
  return (
    <svg className="ms-sky-sun" viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r="13.5" fill="currentColor" stroke="none" />
      <g fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        <path d="M36 8v7.5M36 56.5V64M8 36h7.5M56.5 36H64M17.2 17.2l5.3 5.3M49.5 49.5l5.3 5.3M17.2 54.8l5.3-5.3M49.5 22.5l5.3-5.3" />
      </g>
    </svg>
  )
}

function MoonMark() {
  return (
    <svg className="ms-sky-moon" viewBox="0 0 72 72" aria-hidden="true">
      <path d="M48.5 14c-2.6 2.6-4.2 6.2-4.2 10.2 0 7.8 6.4 14.2 14.2 14.2 1.4 0 2.8-.2 4.1-.6C60.4 49 50.6 57 38.8 57 25.2 57 14 45.8 14 32.2 14 21.6 21.4 12.6 31.4 10.4c-2.8 6.2-2.2 13.6 1.8 19.2 4 5.6 10.4 8.6 17 8.8-3.4-7.2-3-15.4-1.7-24.4Z" />
    </svg>
  )
}

/** Time-of-day greeting with drifting sky. */
export default function PulseGreetingBanner({ name, hour = new Date().getHours() }) {
  const period = periodForHour(hour)
  const weekday = new Date().getDay()

  return (
    <article className={`ms-card ms-hello is-${period}`}>
      <span className="ms-hello-logo">
        <img src="/bda-logo.png" alt="BDA Technologies" />
      </span>
      <div className="ms-hello-copy">
        <span className="ms-hello-greet">{greetingTitle(period)}</span>
        <strong className="ms-hello-name">{name}</strong>
        <span className="ms-hello-line">{greetingLine(period, weekday)}</span>
      </div>
      <PulseSkyWash hour={hour} />
    </article>
  )
}

export function PulseSkyWash({ hour = new Date().getHours() }) {
  const period = periodForHour(hour)
  const night = period === 'evening'
  return (
    <div className={`ms-sky is-${period}`} aria-hidden="true">
      <Cloud className="ms-cloud ms-cloud-a" delay="0s" />
      <Cloud className="ms-cloud ms-cloud-b" delay="-8s" />
      <Cloud className="ms-cloud ms-cloud-c" delay="-14s" />
      {night ? <MoonMark /> : <SunMark />}
    </div>
  )
}
