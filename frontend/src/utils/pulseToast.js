const PULSE_TOAST_EVENT = 'pulse:toast'

/** Strip dash-like separators so toast copy stays plain. */
export function sanitizeToastCopy(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/\s*[·•—–−]\s*/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function sanitizeToast(input = {}) {
  const next = { ...input }
  if (typeof next.title === 'string') next.title = sanitizeToastCopy(next.title)
  if (typeof next.description === 'string') next.description = sanitizeToastCopy(next.description)
  return next
}

function emitToast(detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(PULSE_TOAST_EVENT, { detail }))
}

/** Show a Pulse toast from anywhere (title + description, no dashes). */
export function pulseToast(input) {
  emitToast({ type: 'show', input: sanitizeToast(input) })
}

function showStatus(status, title, description, extra) {
  pulseToast({
    status,
    title,
    ...(description ? { description } : {}),
    ...extra,
  })
}

pulseToast.success = (title, description, extra) => showStatus('success', title, description, extra)
pulseToast.info = (title, description, extra) => showStatus('info', title, description, extra)
pulseToast.error = (title, description, extra) => showStatus('error', title, description, extra)
pulseToast.loading = (title, description, extra) =>
  showStatus('loading', title, description, { duration: 0, ...extra })

pulseToast.update = (id, patch) =>
  emitToast({ type: 'update', id, patch: sanitizeToast(patch) })

pulseToast.dismiss = (id) => emitToast({ type: 'dismiss', id })

pulseToast.clear = () => emitToast({ type: 'clear' })

export { PULSE_TOAST_EVENT }
