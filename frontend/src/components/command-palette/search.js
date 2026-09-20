function normalize(value) {
  return String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokenScore(token, field) {
  const words = field.split(' ')
  if (words.includes(token)) return 100
  if (words.some((word) => word.startsWith(token))) return 80
  if (field.includes(token)) return 60
  if (token.length < 3) return 0
  for (const word of words) {
    if (word.length - token.length > 2) continue
    let matched = 0
    for (const char of word) {
      if (char === token[matched]) matched += 1
    }
    if (matched === token.length) return 20
  }
  return 0
}

/** Match every query word across fields and put direct name matches first. */
export function searchCommands(items, query) {
  const normalized = normalize(query)
  if (!normalized) return items
  const tokens = normalized.split(/\s+/)
  return items
    .map((item) => {
      const label = normalize(item.label)
      const fields = [label, normalize(item.group || ''), ...(item.keywords || []).map(normalize)]
      let score = label === normalized ? 10000 : label.startsWith(normalized) ? 2000 : 0
      for (const token of tokens) {
        const best = Math.max(
          ...fields.map((field, index) => {
            const match = tokenScore(token, field)
            return match ? match + (index === 0 ? 40 : 0) : 0
          }),
        )
        if (!best) return { item, score: 0 }
        score += best
      }
      return { item, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item)
}
