import { useEffect, useState } from 'react'
import { periodForHour, PulseSkyWash } from '../PulseGreetingBanner'

export default function AuthPromo() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const period = periodForHour(now.getHours())

  return (
    <div className={`auth-promo is-${period}`}>
      <img className="auth-promo-photo" src="/pulse-peak-bg.jpg" alt="" decoding="async" />
      <div className="auth-promo-shade" />
      <div className="auth-promo-sheen" />
      {period === 'evening' ? <span className="auth-promo-stars" aria-hidden="true" /> : null}
      <PulseSkyWash hour={now.getHours()} />
    </div>
  )
}
