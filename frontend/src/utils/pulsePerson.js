function looksLikeEmail(value) {
  return /@/.test(String(value || ''))
}

function stripEmailTokens(value) {
  return String(value || '')
    .split(/\s+/)
    .filter((token) => token && !looksLikeEmail(token))
    .join(' ')
    .trim()
}

/** First + last, ignoring mailbox tokens stored in name fields. */
export function personName(user, fallback = 'Employee') {
  const fromParts = [user?.firstName, user?.lastName]
    .map(stripEmailTokens)
    .filter(Boolean)
  if (fromParts.length) return fromParts.join(' ')
  const display = stripEmailTokens(user?.displayName)
  if (display) return display
  const named = stripEmailTokens(user?.name)
  if (named) return named
  const local = String(user?.email || '').split('@')[0].trim()
  return local || fallback
}

export function namesMatch(typed, user) {
  const want = personName(user).trim().toLowerCase().replace(/\s+/g, ' ')
  const got = String(typed || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return Boolean(want && got === want)
}
