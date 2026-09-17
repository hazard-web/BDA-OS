import { useEffect, useRef, useState } from 'react'
import api from '../api'
import { hiResAvatarUrl } from '../utils/hiResAvatar'

function personInitial(row) {
  const name = String(row?.name || '').trim()
  const label = name && !name.includes('@')
    ? name
    : String(row?.email || '').split('@')[0] || 'E'
  return label.trim().charAt(0).toUpperCase() || 'E'
}

/**
 * Org admin list avatar: HTTPS inline (no-referrer), else lazy blob via
 * /pulse-checkin/admin/avatar/:id — avoids N requests before cards paint.
 */
export default function PulseOrgPersonAvatar({ row, className = 'pulse-ts-person-avatar' }) {
  const initial = personInitial(row)
  const httpsSrc = hiResAvatarUrl(row?.avatarUrl, 128)
  const proxyId = String(row?.avatarUserId || '')
  const [src, setSrc] = useState(httpsSrc || '')
  const [broken, setBroken] = useState(false)
  const [visible, setVisible] = useState(Boolean(httpsSrc))
  const rootRef = useRef(null)

  useEffect(() => {
    setBroken(false)
    if (httpsSrc) {
      setSrc(httpsSrc)
      setVisible(true)
      return undefined
    }
    setSrc('')
    if (!proxyId) {
      setVisible(false)
      return undefined
    }
    const node = rootRef.current
    if (!node || typeof IntersectionObserver !== 'function') {
      setVisible(true)
      return undefined
    }
    let cancelled = false
    const io = new IntersectionObserver(
      (entries) => {
        if (cancelled) return
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '120px 0px', threshold: 0.01 },
    )
    io.observe(node)
    return () => {
      cancelled = true
      io.disconnect()
    }
  }, [httpsSrc, proxyId])

  useEffect(() => {
    if (httpsSrc || !proxyId || !visible) return undefined
    let alive = true
    let objectUrl = ''
    api
      .get(`/pulse-checkin/admin/avatar/${proxyId}`, { responseType: 'blob', timeout: 20000 })
      .then((res) => {
        if (!alive) return
        const type = String(res.data?.type || '')
        if (type && !type.startsWith('image/')) {
          setSrc('')
          return
        }
        objectUrl = URL.createObjectURL(res.data)
        setSrc(objectUrl)
      })
      .catch(() => {
        if (alive) setSrc('')
      })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [httpsSrc, proxyId, visible])

  if (!src || broken) {
    return (
      <span ref={rootRef} className={`${className} is-fallback`} aria-hidden="true">
        {initial}
      </span>
    )
  }

  return (
    <img
      ref={rootRef}
      className={className}
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  )
}
