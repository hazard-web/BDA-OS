import { useEffect, useState } from 'react'
import { Avatar } from 'antd'
import { hiResAvatarUrl } from '../utils/hiResAvatar'

/**
 * Ant Design Avatar does not forward `referrerPolicy` onto the inner <img>.
 * Google user-content URLs return 429 when the page Referer (localhost / app origin)
 * is sent — so photos fall back to initials. Always load via no-referrer img.
 */
export function resolvePulseAvatarSrc(raw, px = 128) {
  return hiResAvatarUrl(String(raw || '').trim(), px) || ''
}

export function pulseAvatarImg(src, { alt = '', onError } = {}) {
  const url = String(src || '').trim()
  if (!url) return undefined
  return (
    <img
      src={url}
      alt={alt}
      referrerPolicy="no-referrer"
      draggable={false}
      onError={onError}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
}

export default function PulseUserAvatar({
  src,
  size = 30,
  px,
  alt = '',
  children,
  className,
  style,
  ...rest
}) {
  const url = resolvePulseAvatarSrc(src, px || (typeof size === 'number' ? Math.max(size * 2, 96) : 128))
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setBroken(false)
  }, [url])

  return (
    <Avatar
      className={className}
      size={size}
      style={style}
      alt={alt}
      src={!broken && url ? pulseAvatarImg(url, { alt, onError: () => setBroken(true) }) : undefined}
      {...rest}
    >
      {children}
    </Avatar>
  )
}
