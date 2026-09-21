import { AlertCircle, Bell, Check, Info, Loader2, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './animated-toast-stack.css'

/** beUI ease-out — same curve as Heat Calendar. */
const EASE_OUT = [0.16, 1, 0.3, 1]

const STACK_SPRING = {
  type: 'spring',
  stiffness: 420,
  damping: 34,
  mass: 0.75,
}

const CONTENT_TRANSITION = {
  duration: 0.28,
  ease: EASE_OUT,
}

const STATUS_ICON = {
  neutral: Bell,
  info: Info,
  loading: Loader2,
  success: Check,
  error: AlertCircle,
}

const POSITION_CLASS = {
  'top-left': 'pulse-toast-stack--top-left',
  'top-center': 'pulse-toast-stack--top-center',
  'top-right': 'pulse-toast-stack--top-right',
  'bottom-left': 'pulse-toast-stack--bottom-left',
  'bottom-center': 'pulse-toast-stack--bottom-center',
  'bottom-right': 'pulse-toast-stack--bottom-right',
}

let idSeed = 0

function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function createToast(input, defaultDuration) {
  return {
    duration: defaultDuration,
    dismissible: true,
    ...input,
    id: input.id ?? `toast-${Date.now()}-${idSeed++}`,
    createdAt: Date.now(),
  }
}

export function useAnimatedToastStack({
  initialToasts = [],
  defaultDuration = 4200,
  limit,
} = {}) {
  const toastTimers = useRef(new Map())
  const [toasts, setToasts] = useState(() =>
    initialToasts.map((toast) => createToast(toast, defaultDuration)),
  )

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const clearToasts = useCallback(() => {
    setToasts([])
  }, [])

  const showToast = useCallback(
    (input) => {
      const toast = createToast(input, defaultDuration)
      setToasts((current) => {
        const next = [...current, toast]
        return typeof limit === 'number' ? next.slice(-limit) : next
      })
      return toast.id
    },
    [defaultDuration, limit],
  )

  const updateToast = useCallback((id, patch) => {
    setToasts((current) =>
      current.map((toast) =>
        toast.id === id
          ? {
              ...toast,
              ...patch,
              id,
              createdAt: patch.duration === undefined ? toast.createdAt : Date.now(),
            }
          : toast,
      ),
    )
  }, [])

  useEffect(() => {
    const activeIds = new Set(toasts.map((toast) => toast.id))

    toastTimers.current.forEach((entry, id) => {
      if (!activeIds.has(id)) {
        window.clearTimeout(entry.timer)
        toastTimers.current.delete(id)
      }
    })

    toasts.forEach((toast) => {
      const duration = toast.duration ?? defaultDuration
      const existing = toastTimers.current.get(toast.id)

      if (duration <= 0) {
        if (existing) {
          window.clearTimeout(existing.timer)
          toastTimers.current.delete(toast.id)
        }
        return
      }

      const createdAt = toast.createdAt ?? Date.now()
      const signature = `${createdAt}:${duration}`

      if (existing?.signature === signature) return

      if (existing) window.clearTimeout(existing.timer)

      const elapsed = Date.now() - createdAt
      const remaining = Math.max(duration - elapsed, 0)
      const timer = window.setTimeout(() => {
        toastTimers.current.delete(toast.id)
        dismissToast(toast.id)
      }, remaining)

      toastTimers.current.set(toast.id, { timer, signature })
    })
  }, [defaultDuration, dismissToast, toasts])

  useEffect(() => {
    const timers = toastTimers.current
    return () => {
      timers.forEach((entry) => window.clearTimeout(entry.timer))
      timers.clear()
    }
  }, [])

  return useMemo(
    () => ({
      toasts,
      showToast,
      updateToast,
      dismissToast,
      clearToasts,
      setToasts,
    }),
    [clearToasts, dismissToast, showToast, toasts, updateToast],
  )
}

export function AnimatedToastStack({
  toasts,
  onDismiss,
  position = 'bottom-right',
  placement,
  fixed = false,
  portal,
  portalRoot,
  maxVisible = 4,
  className,
  classNames,
  icons,
  renderToast,
}) {
  const [portalTarget, setPortalTarget] = useState(null)
  const visibleToasts = toasts.slice(-maxVisible)
  const isBottom = position.startsWith('bottom')
  const resolvedPlacement = placement ?? (fixed ? 'fixed' : 'static')
  const shouldPortal = portal ?? resolvedPlacement === 'fixed'

  useEffect(() => {
    setPortalTarget(shouldPortal ? (portalRoot ?? document.body) : null)
  }, [portalRoot, shouldPortal])

  const stack = (
    <ol
      aria-live="polite"
      aria-atomic="false"
      className={cn(
        'pulse-toast-stack',
        isBottom ? 'pulse-toast-stack--bottom' : 'pulse-toast-stack--top',
        resolvedPlacement === 'fixed' && 'pulse-toast-stack--fixed',
        resolvedPlacement === 'absolute' && 'pulse-toast-stack--absolute',
        resolvedPlacement !== 'static' && POSITION_CLASS[position],
        classNames?.root,
        className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visibleToasts.map((toast, index) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            index={index}
            onDismiss={onDismiss}
            classNames={classNames}
            icons={icons}
            renderToast={renderToast}
          />
        ))}
      </AnimatePresence>
    </ol>
  )

  if (shouldPortal && !portalTarget) return null
  if (shouldPortal && portalTarget) return createPortal(stack, portalTarget)
  return stack
}

const ToastItem = memo(function ToastItem({
  toast,
  index,
  onDismiss,
  classNames,
  icons,
  renderToast,
}) {
  const reduce = useReducedMotion()
  const status = toast.status ?? 'neutral'
  const Icon = STATUS_ICON[status] || Bell
  const iconNode = icons?.[status] ?? toast.icon ?? <Icon className="pulse-toast-glyph" />
  const canDismiss = toast.dismissible !== false && Boolean(onDismiss)
  const hasDetails = Boolean(toast.description || toast.action)

  return (
    <motion.li
      layout
      initial={
        reduce
          ? { opacity: 0 }
          : { opacity: 0, y: 12, scale: 0.98 }
      }
      animate={
        reduce
          ? { opacity: 1 }
          : { opacity: 1, y: 0, scale: 1 }
      }
      exit={
        reduce
          ? { opacity: 0 }
          : {
              opacity: 0,
              y: -8,
              scale: 0.98,
              transition: { duration: 0.16, ease: EASE_OUT },
            }
      }
      transition={STACK_SPRING}
      drag={canDismiss && !reduce ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.18}
      onDragEnd={(_, info) => {
        if (!canDismiss || !onDismiss) return
        if (Math.abs(info.offset.x) > 72 || Math.abs(info.velocity.x) > 520) {
          onDismiss(toast.id)
        }
      }}
      className={cn('pulse-toast-item', classNames?.item)}
      style={{ zIndex: 20 - index }}
    >
      <div className={cn('pulse-toast-surface', classNames?.surface)}>
        {renderToast ? (
          renderToast(toast)
        ) : (
          <div className={cn('pulse-toast-row', hasDetails && 'pulse-toast-row--details')}>
            <motion.span
              layout
              className={cn(
                'pulse-toast-icon',
                `pulse-toast-icon--${status}`,
                hasDetails && 'pulse-toast-icon--offset',
                classNames?.iconWrap,
              )}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={status}
                  initial={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, y: 6, scale: 0.92 }
                  }
                  animate={
                    reduce
                      ? { opacity: 1 }
                      : { opacity: 1, y: 0, scale: 1 }
                  }
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, y: -6, scale: 0.94 }
                  }
                  transition={CONTENT_TRANSITION}
                  className="pulse-toast-icon-swap"
                >
                  {status === 'loading' ? (
                    <span className="pulse-toast-spin">{iconNode}</span>
                  ) : (
                    iconNode
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.span>

            <div className={cn('pulse-toast-body', classNames?.content)}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={`${toast.id}-${status}-${String(toast.title)}`}
                  initial={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, y: 6 }
                  }
                  animate={
                    reduce
                      ? { opacity: 1 }
                      : { opacity: 1, y: 0 }
                  }
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, y: -6 }
                  }
                  transition={CONTENT_TRANSITION}
                >
                  <p className={cn('pulse-toast-title', classNames?.title)}>{toast.title}</p>
                  {toast.description ? (
                    <p className={cn('pulse-toast-desc', classNames?.description)}>
                      {toast.description}
                    </p>
                  ) : null}
                </motion.div>
              </AnimatePresence>

              {toast.action ? (
                <button
                  type="button"
                  onClick={() => toast.action?.onClick(toast)}
                  className={cn('pulse-toast-action', classNames?.action)}
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>

            {canDismiss ? (
              <button
                type="button"
                onClick={() => onDismiss?.(toast.id)}
                aria-label="Dismiss"
                className={cn('pulse-toast-close', classNames?.close)}
              >
                <X className="pulse-toast-glyph" />
              </button>
            ) : null}
          </div>
        )}
      </div>
    </motion.li>
  )
})
