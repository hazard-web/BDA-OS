import { createPortal } from 'react-dom'
import { CloseOutlined } from '@ant-design/icons'
import './pulse-onboarding.css'

/** Floating X — same control as Add employee, for every slide-in. */
export default function PulseSlideClose({
  open,
  onClose,
  width = 920,
  from = 'end',
  label = 'Close',
  top,
  portal = true,
}) {
  if (!open) return null
  if (portal && typeof document === 'undefined') return null

  const node = (
    <button
      type="button"
      className={`ob-drawer-close${from === 'start' ? ' is-start' : ''}${portal ? '' : ' is-inline'}`}
      style={{
        '--pulse-slide-w': `${width}px`,
        ...(top != null ? { '--pulse-slide-close-top': `${top}px` } : {}),
      }}
      aria-label={label}
      onClick={onClose}
    >
      <CloseOutlined />
    </button>
  )

  if (!portal) return node
  return createPortal(node, document.body)
}
