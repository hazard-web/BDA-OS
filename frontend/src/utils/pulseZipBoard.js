import api from '../api'

export async function fetchZipToday() {
  const { data } = await api.get('/pulse-zip/today')
  return data
}

export async function submitZipFinish({ timeMs, backtracks }) {
  const { data } = await api.post('/pulse-zip/finish', { timeMs, backtracks })
  return data
}

export function emptyZipBoard() {
  return { ranks: [], mine: null, avgMs: 0, date: '', puzzleNo: 0 }
}
