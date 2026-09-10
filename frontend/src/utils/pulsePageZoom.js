/** Block trackpad pinch / ctrl-wheel / Safari gesture zoom on Pulse. */
export function lockPulsePageZoom() {
  const viewport = document.querySelector('meta[name="viewport"]')
  const previous = viewport?.getAttribute('content') || ''
  viewport?.setAttribute(
    'content',
    'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
  )

  const onWheel = (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault()
  }
  const onGesture = (event) => event.preventDefault()
  const onKeyDown = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return
    if (event.key === '+' || event.key === '-' || event.key === '=' || event.key === '_') {
      event.preventDefault()
    }
  }

  document.addEventListener('wheel', onWheel, { passive: false })
  document.addEventListener('gesturestart', onGesture, { passive: false })
  document.addEventListener('gesturechange', onGesture, { passive: false })
  document.addEventListener('gestureend', onGesture, { passive: false })
  document.addEventListener('keydown', onKeyDown)

  return () => {
    if (viewport && previous) viewport.setAttribute('content', previous)
    document.removeEventListener('wheel', onWheel)
    document.removeEventListener('gesturestart', onGesture)
    document.removeEventListener('gesturechange', onGesture)
    document.removeEventListener('gestureend', onGesture)
    document.removeEventListener('keydown', onKeyDown)
  }
}
