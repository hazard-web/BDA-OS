/** Google/GitHub OAuth photos are stored as tiny thumbnails (often 96px). */

export function hiResAvatarUrl(raw, px = 800) {
  const src = String(raw || '').trim()
  if (!src) return ''
  try {
    const u = new URL(src)
    const host = u.hostname
    if (host.includes('googleusercontent.com')) {
      const path = u.pathname.replace(/=s\d+(-[a-z]+)*$/i, '')
      u.pathname = `${path}=s${px}-c`
      u.searchParams.delete('sz')
      return u.toString()
    }
    if (host.includes('githubusercontent.com') || host.includes('avatars.githubusercontent.com')) {
      u.searchParams.set('s', String(px))
      return u.toString()
    }
  } catch {
    return src
  }
  return src
}
