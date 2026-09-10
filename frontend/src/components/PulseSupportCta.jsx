import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CaretRight,
  ChatCircleDots,
  ChatTeardropText,
  House,
  PaperPlaneTilt,
} from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import PulseMark from './PulseMark'
import './pulse-support-cta.css'

/**
 * Support help widget opened from the green chat CTA on the Smart Chat bar.
 * Views: home → form → conversation
 */
export default function PulseSupportCta({ open, startView = 'home' }) {
  const { user } = useAuth() || {}
  const [view, setView] = useState(startView)
  const [tab, setTab] = useState('home')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!open) return
    setView(startView || 'home')
    setTab('home')
    setStarted(false)
    const fromParts = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
    const fromName = String(user?.name || user?.fullName || '').trim()
    setDisplayName(fromParts || fromName)
    setEmail(String(user?.email || '').trim())
    setMessage('')
  }, [open, startView, user])

  if (!open) return null

  const goHome = () => {
    setView('home')
    setTab('home')
  }

  const goConversation = () => {
    setTab('conversation')
    setView('conversation')
  }

  const openForm = () => {
    setView('form')
    setTab('conversation')
  }

  const startChat = (e) => {
    e.preventDefault()
    if (!message.trim()) return
    setStarted(true)
    setView('conversation')
    setTab('conversation')
  }

  const showTabs = view === 'home' || view === 'conversation'

  return (
    <div className="psup-root" role="dialog" aria-label="BDA OS Support">
      <div className={`psup-card${view === 'form' ? ' is-form' : ''}${view === 'home' ? ' is-home' : ''}`}>
        {view === 'home' ? (
          <>
            <header className="psup-hero">
              <div className="psup-hero-badge" aria-hidden="true">
                <svg className="psup-hero-badge-ico" viewBox="0 0 32 32">
                  <path
                    fill="currentColor"
                    fillRule="evenodd"
                    d="
                      M5 27V10.75c0-.5.28-.96.73-1.2l8.05-4.4a1.4 1.4 0 0 1 1.4 0L17.8 6.5V5.7c0-.66.54-1.2 1.2-1.2H26c.66 0 1.2.54 1.2 1.2V27H5z
                      M8.35 13.1h2.45v2.45H8.35V13.1zm0 4.05h2.45v2.45H8.35v-2.45zm0 4.05h2.45V23.7H8.35v-2.45z
                      M12.95 13.1h2.45v2.45h-2.45V13.1zm0 4.05h2.45v2.45h-2.45v-2.45zm0 4.05h2.45V23.7h-2.45v-2.45z
                      M19.2 11.35h2.2v2.1H19.2v-2.1zm3.4 0H24.8v2.1h-2.2v-2.1z
                      M19.2 14.7h2.2v2.1H19.2v-2.1zm3.4 0H24.8v2.1h-2.2v-2.1z
                    "
                  />
                </svg>
              </div>
              <div className="psup-hero-copy">
                <h2>BDA OS Support</h2>
                <p>We are here to help you!</p>
              </div>
            </header>

            <button type="button" className="psup-cta-chip" onClick={openForm}>
              <span className="psup-cta-ico" aria-hidden="true">
                <ChatCircleDots size={22} weight="fill" />
              </span>
              <span className="psup-cta-label">Chat with us now</span>
              <CaretRight size={16} weight="bold" className="psup-cta-caret" />
            </button>

            <div className="psup-home-body" />
          </>
        ) : null}

        {view === 'form' ? (
          <>
            <header className="psup-form-head">
              <button type="button" className="psup-back" aria-label="Back" onClick={goHome}>
                <ArrowLeft size={18} weight="bold" />
              </button>
              <div className="psup-form-brand" aria-hidden="true">
                <PulseMark size={22} />
              </div>
              <h2>Chat with us now</h2>
            </header>

            <form className="psup-form" onSubmit={startChat}>
              <label className="psup-field">
                <span>Last name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="family-name"
                />
              </label>
              <label className="psup-field">
                <span>Email address</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label className="psup-field is-message">
                <span>Message</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message and hit 'Start Chat'"
                  rows={6}
                  required
                />
              </label>
              <button type="submit" className="psup-start" disabled={!message.trim()}>
                <PaperPlaneTilt size={16} weight="fill" />
                Start Chat
              </button>
            </form>
          </>
        ) : null}

        {view === 'conversation' ? (
          <>
            <header className="psup-conv-head">
              <h2>Conversation</h2>
            </header>
            <div className="psup-conv-body">
              {started && message.trim() ? (
                <div className="psup-bubble-wrap">
                  <div className="psup-bubble">{message.trim()}</div>
                  <p className="psup-pending">Thanks - our support team will reply shortly.</p>
                </div>
              ) : (
                <>
                  <div className="psup-empty-art" aria-hidden="true">
                    <ChatTeardropText size={72} weight="duotone" />
                  </div>
                  <p className="psup-empty-copy">No ongoing conversation</p>
                  <button type="button" className="psup-new" onClick={openForm}>
                    <ChatCircleDots size={18} weight="fill" />
                    New conversation
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}

        {showTabs ? (
          <nav className="psup-tabs" aria-label="Support sections">
            <button
              type="button"
              className={`psup-tab${tab === 'home' ? ' is-on' : ''}`}
              onClick={goHome}
            >
              <House size={20} weight={tab === 'home' ? 'fill' : 'regular'} />
              <span>Home</span>
            </button>
            <button
              type="button"
              className={`psup-tab${tab === 'conversation' ? ' is-on' : ''}`}
              onClick={goConversation}
            >
              <ChatTeardropText size={20} weight={tab === 'conversation' ? 'fill' : 'regular'} />
              <span>Conversation</span>
            </button>
          </nav>
        ) : null}

        <footer className="psup-foot">
          <span className="psup-foot-mark" aria-hidden="true">
            <PulseMark size={14} />
          </span>
          Powered by BDA OS Support
        </footer>
      </div>
    </div>
  )
}
