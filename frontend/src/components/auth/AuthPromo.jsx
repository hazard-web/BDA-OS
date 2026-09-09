import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { periodForHour, PulseSkyWash } from '../PulseGreetingBanner'

function greetingTitle(period) {
  if (period === 'morning') return 'Good morning'
  if (period === 'afternoon') return 'Good afternoon'
  return 'Good evening'
}

function promoTitle(period) {
  if (period === 'morning') return 'Your day starts here'
  if (period === 'afternoon') return 'Keep the momentum'
  return 'Ease into the evening'
}

export default function AuthPromo() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000)
    return () => window.clearInterval(id)
  }, [])

  const period = periodForHour(now.getHours())

  return (
    <div className={`auth-promo is-${period}`}>
      <img className="auth-promo-photo" src="/pulse-overview-peak.jpg" alt="" />
      <div className="auth-promo-shade" />
      <div className="auth-promo-sheen" />
      {period === 'evening' ? <span className="auth-promo-stars" aria-hidden="true" /> : null}
      <PulseSkyWash hour={now.getHours()} />

      <div className="auth-promo-when">
        <span className="auth-promo-clock">{format(now, 'h:mm a').toLowerCase()}</span>
        <time className="auth-promo-date" dateTime={format(now, 'yyyy-MM-dd')}>
          {format(now, 'EEE d MMM')}
        </time>
      </div>

      <div className="auth-promo-copy">
        <p className="auth-promo-greet">{greetingTitle(period)}</p>
        <p className="auth-promo-title">{promoTitle(period)}</p>
        <span className="auth-promo-rule" aria-hidden="true" />
        <p className="auth-promo-body">Check in, take leave, and see the week in Pulse.</p>
        <div className="auth-promo-beats">
          <span className="auth-promo-beat is-live">
            <i />
            Check-in
          </span>
          <span className="auth-promo-beat">Leave</span>
          <span className="auth-promo-beat">Week</span>
        </div>
      </div>
    </div>
  )
}
