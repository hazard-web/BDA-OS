import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { AuthLogoLoader, useAuthRedirect } from '../components/auth/AuthLogoLoader'
import { getPostLoginPath, getPulseOpenPath } from '../utils/pulseEntry'
import './hr-setup.css'

const INDUSTRIES = [
  'Technology / IT',
  'Manufacturing',
  'Healthcare',
  'Education',
  'Retail / E-commerce',
  'Finance / BFSI',
  'Consulting',
  'Other',
]

/** First-time org setup for Pulse (company details only). */
export default function HrSetup() {
  const { user, updateProfile } = useAuth()
  const navigate = useNavigate()
  const { redirecting, redirectTo } = useAuthRedirect()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    industry: '',
  })

  useEffect(() => {
    if (!user) return
    if (user.onboardingCompleted !== false) {
      navigate(getPulseOpenPath(user), { replace: true })
      return
    }
    setForm((f) => ({
      ...f,
      companyName: user.companyName || '',
      companyAddress: user.companyAddress || '',
      companyPhone: user.companyPhone || '',
      companyEmail: user.companyEmail || user.email || '',
      industry: user.industry || '',
    }))
  }, [user, navigate])

  const onFinish = async (e) => {
    e.preventDefault()
    if (saving) return
    if (!form.companyName.trim()) {
      toast.error('Enter your organization name.')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/auth/complete-onboarding', {
        companyName: form.companyName.trim(),
        companyAddress: form.companyAddress.trim(),
        companyPhone: form.companyPhone.trim(),
        companyEmail: form.companyEmail.trim(),
        industry: form.industry.trim(),
      })
      const nextUser = { ...res.data.user, onboardingCompleted: true }
      updateProfile(nextUser)
      toast.success('Your workspace is ready.')
      redirectTo(getPostLoginPath(nextUser))
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not save organization')
      setSaving(false)
    }
  }

  if (!user) return <AuthLogoLoader show label="Loading setup" />

  return (
    <div className="hrs-page">
      <AuthLogoLoader show={redirecting || saving} label={saving ? 'Saving organization' : 'Opening BDA OS'} />

      <header className="hrs-top">
        <div className="hrs-brand">
          <span className="hrs-mark" aria-hidden="true">
            <i style={{ background: '#1A5F4A' }} />
            <i style={{ background: '#2d8a6e' }} />
            <i style={{ background: '#c8e6d9' }} />
            <i style={{ background: '#f5f0e8' }} />
          </span>
          <strong>BDA OS</strong>
        </div>
        <p className="hrs-progress">Company setup</p>
      </header>

      <main className="hrs-main">
        <form className="hrs-card" onSubmit={onFinish}>
          <p className="hrs-eyebrow">BDA OS</p>
          <h1>Set up your organization</h1>
          <p className="hrs-sub">
            Add your company details to get started. You can invite people and manage Company from BDA OS.
          </p>

          <label className="hrs-label" htmlFor="hrs-name">
            Company name
          </label>
          <input
            id="hrs-name"
            className="hrs-input"
            value={form.companyName}
            onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            placeholder="e.g. Acme Technologies Pvt Ltd"
            autoFocus
            required
          />

          <label className="hrs-label" htmlFor="hrs-industry">
            Industry
          </label>
          <select
            id="hrs-industry"
            className="hrs-input"
            value={form.industry}
            onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
          >
            <option value="">Select industry</option>
            {INDUSTRIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          <label className="hrs-label" htmlFor="hrs-address">
            Work location / address
          </label>
          <textarea
            id="hrs-address"
            className="hrs-input hrs-textarea"
            rows={3}
            value={form.companyAddress}
            onChange={(e) => setForm((f) => ({ ...f, companyAddress: e.target.value }))}
            placeholder="Office address"
          />

          <div className="hrs-row">
            <div>
              <label className="hrs-label" htmlFor="hrs-phone">
                Company phone
              </label>
              <input
                id="hrs-phone"
                className="hrs-input"
                value={form.companyPhone}
                onChange={(e) => setForm((f) => ({ ...f, companyPhone: e.target.value }))}
                placeholder="+91…"
              />
            </div>
            <div>
              <label className="hrs-label" htmlFor="hrs-email">
                Company email
              </label>
              <input
                id="hrs-email"
                className="hrs-input"
                type="email"
                value={form.companyEmail}
                onChange={(e) => setForm((f) => ({ ...f, companyEmail: e.target.value }))}
                placeholder="hello@company.com"
              />
              <p className="hrs-hint">
                Members can only sign in with this company domain
                {form.companyEmail.includes('@')
                  ? ` (@${form.companyEmail.split('@')[1]?.toLowerCase() || 'company.com'})`
                  : ''}
                .
              </p>
            </div>
          </div>

          <button type="submit" className="hrs-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Continue to BDA OS'}
          </button>
        </form>
      </main>

      <footer className="hrs-foot">
        © {new Date().getFullYear()}, BDA Technologies Private Limited. All Rights Reserved.
      </footer>
    </div>
  )
}
