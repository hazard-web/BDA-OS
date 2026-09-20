import { createContext, useContext, useEffect, useRef } from 'react'
import {
  AnimatedToastStack,
  useAnimatedToastStack,
} from './animated-toast-stack'
import { PULSE_TOAST_EVENT, sanitizeToast } from '../utils/pulseToast'

const PulseToastContext = createContext(null)

export function usePulseToast() {
  return useContext(PulseToastContext)
}

export default function PulseToastProvider({ children }) {
  const api = useAnimatedToastStack({
    defaultDuration: 3600,
    limit: 5,
  })
  const apiRef = useRef(api)
  apiRef.current = api

  useEffect(() => {
    const onEvent = (event) => {
      const detail = event.detail || {}
      const host = apiRef.current
      if (detail.type === 'show') host.showToast(sanitizeToast(detail.input || {}))
      if (detail.type === 'update' && detail.id) host.updateToast(detail.id, sanitizeToast(detail.patch || {}))
      if (detail.type === 'dismiss' && detail.id) host.dismissToast(detail.id)
      if (detail.type === 'clear') host.clearToasts()
    }
    window.addEventListener(PULSE_TOAST_EVENT, onEvent)
    return () => window.removeEventListener(PULSE_TOAST_EVENT, onEvent)
  }, [])

  return (
    <PulseToastContext.Provider value={api}>
      {children}
      <AnimatedToastStack
        toasts={api.toasts}
        onDismiss={api.dismissToast}
        position="top-center"
        placement="fixed"
        portal
        maxVisible={4}
      />
    </PulseToastContext.Provider>
  )
}
