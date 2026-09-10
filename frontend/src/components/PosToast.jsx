import toast from 'react-hot-toast'
import { Check, WarningCircle, Info } from '@phosphor-icons/react'
import './pos-toast.css'

function ToastCard({ tone = 'success', title, detail, visible }) {
  const Icon = tone === 'error' ? WarningCircle : tone === 'info' ? Info : Check
  return (
    <div className={`pos-toast pos-toast--${tone}${visible ? ' is-in' : ' is-out'}`} role="status">
      <span className="pos-toast-mark" aria-hidden="true">
        <Icon size={16} weight="bold" />
      </span>
      <div className="pos-toast-copy">
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
    </div>
  )
}

/** BDA OS-styled welcome toast (login / OAuth). */
export function toastWelcomeBack(name) {
  const detail = name ? `Signed in as ${name}` : 'You’re signed in to BDA OS'
  return toast.custom(
    (t) => (
      <ToastCard
        tone="success"
        title="Welcome back!"
        detail={detail}
        visible={t.visible}
      />
    ),
    { duration: 3200, position: 'top-center' },
  )
}

export function toastPosSuccess(title, detail) {
  return toast.custom(
    (t) => <ToastCard tone="success" title={title} detail={detail} visible={t.visible} />,
    { duration: 3200, position: 'top-center' },
  )
}
