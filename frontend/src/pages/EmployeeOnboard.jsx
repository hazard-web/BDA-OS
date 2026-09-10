import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { App, Button, Form } from 'antd'
import { CheckOutlined } from '@ant-design/icons'
import api from '../api'
import PulseCandidateForm, {
  emptyCandidate,
  EMPLOYEE_STEP_FIELDS,
  EMPLOYEE_STEPS,
  payloadFromValues,
  valuesFromCandidate,
} from '../components/PulseCandidateForm'
import BdaGateLoader from '../components/BdaGateLoader'
import '../components/pulse-onboarding.css'

function Peak() {
  return (
    <div className="ob-public-scene" aria-hidden="true">
      <img className="ob-public-photo" src="/pulse-overview-peak.jpg" alt="" />
      <div className="ob-public-shade" />
    </div>
  )
}

function Plaque({ companyName, step, onStep, complete }) {
  const org = companyName || 'BDA Technologies'
  const index = complete ? EMPLOYEE_STEPS.length : EMPLOYEE_STEPS.findIndex((item) => item.key === step)
  return (
    <aside className="ob-public-plaque">
      <div className="ob-public-brand">
        <div className="ob-public-logo">
          <img src="/bda-logo-lockup.png" alt="BDA Technologies" />
        </div>
        <h1 className="ob-public-org">{org}</h1>
      </div>
      <ol className="ob-public-steps">
        {EMPLOYEE_STEPS.map((item, i) => {
          const done = i < index
          const state = i === index ? 'is-on' : done ? 'is-done' : ''
          const clickable = Boolean(onStep) && i <= index && !complete
          return (
            <li key={item.key} className={state}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStep?.(item.key)}
              >
                <span className="ob-step-mark" aria-hidden="true">
                  {done ? <CheckOutlined /> : String(i + 1).padStart(2, '0')}
                </span>
                {item.label}
              </button>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}

function Shell({ companyName, step, onStep, complete, children }) {
  return (
    <div className="ob-public-page">
      <Peak />
      <div className="ob-public-stage">
        <div className="ob-public-board">
          <Plaque companyName={companyName} step={step} onStep={onStep} complete={complete} />
          {children}
        </div>
      </div>
    </div>
  )
}

export default function EmployeeOnboard() {
  const { token } = useParams()
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [meta, setMeta] = useState(null)
  const [done, setDone] = useState(null)
  const [step, setStep] = useState('you')

  useEffect(() => {
    document.documentElement.classList.add('ob-onboard')
    return () => document.documentElement.classList.remove('ob-onboard')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await api.get(`/candidates/onboard/${token}`)
        if (cancelled) return
        const data = res.data?.data
        if (data?.submitted) {
          setDone({
            companyName: data.companyName || '',
          })
        } else {
          setMeta(data)
          form.setFieldsValue(valuesFromCandidate({ ...emptyCandidate, ...data }))
        }
      } catch (err) {
        if (cancelled) return
        setError(err?.response?.data?.message || 'This link is invalid or expired')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, form])

  const stepIndex = EMPLOYEE_STEPS.findIndex((item) => item.key === step)
  const last = stepIndex === EMPLOYEE_STEPS.length - 1

  const goNext = async () => {
    try {
      const fields = EMPLOYEE_STEP_FIELDS[step] || []
      if (fields.length) await form.validateFields(fields)
      if (last) {
        setSaving(true)
        await form.validateFields([
          ...EMPLOYEE_STEP_FIELDS.you,
          ...EMPLOYEE_STEP_FIELDS.id,
        ])
        const values = form.getFieldsValue(true)
        const payload = payloadFromValues(values, { mode: 'employee' })
        const res = await api.post(`/candidates/onboard/${token}`, payload)
        setDone({
          companyName: meta?.companyName || '',
          notice: res.data?.message,
        })
        return
      }
      setStep(EMPLOYEE_STEPS[stepIndex + 1].key)
    } catch (err) {
      if (err?.errorFields) {
        const names = err.errorFields.map((item) => String(item.name?.[0] || ''))
        const roots = (fields) => fields.map((item) => (Array.isArray(item) ? item[0] : item))
        if (names.some((name) => roots(EMPLOYEE_STEP_FIELDS.you).includes(name))) setStep('you')
        else if (names.some((name) => roots(EMPLOYEE_STEP_FIELDS.id).includes(name))) setStep('id')
        return
      }
      message.error(err?.response?.data?.message || err.message || 'Could not submit details')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <BdaGateLoader show label="Opening" />
  }

  const companyName = done?.companyName || meta?.companyName || 'BDA Technologies'

  const onSheetKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    const tag = String(event.target?.tagName || '')
    if (tag === 'TEXTAREA' || tag === 'BUTTON') return
    if (event.target?.closest?.('.ant-select, .ant-picker, .ant-dropdown')) return
    event.preventDefault()
    goNext()
  }

  if (error) {
    return (
      <Shell companyName={companyName} step="you">
        <div className="ob-public-sheet is-note">
          <h2>This link is closed</h2>
          <p>{error}</p>
        </div>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell companyName={companyName} step="work" complete>
        <div className="ob-public-sheet is-note">
          <h2>Details received</h2>
          <p>HR will send your BDA OS invite to your work email.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell companyName={companyName} step={step} onStep={setStep}>
      <div className="ob-public-sheet" onKeyDown={onSheetKeyDown}>
        <div className="ob-public-head">
          <h2>On Boarding</h2>
          <p className="ob-public-count">{stepIndex + 1} of {EMPLOYEE_STEPS.length}</p>
        </div>
        <div className="ob-public-progress" aria-hidden="true">
          {EMPLOYEE_STEPS.map((item, i) => (
            <span key={item.key} className={i <= stepIndex ? 'is-on' : ''} />
          ))}
        </div>
        <PulseCandidateForm form={form} mode="employee" employeeStep={step} />
        <div className="ob-public-actions">
          {stepIndex > 0 ? (
            <Button size="large" onClick={() => setStep(EMPLOYEE_STEPS[stepIndex - 1].key)}>Back</Button>
          ) : (
            <span />
          )}
          <Button type="primary" size="large" loading={saving} onClick={goNext}>
            {last ? 'Submit' : 'Continue'}
          </Button>
        </div>
      </div>
    </Shell>
  )
}
