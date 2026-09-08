const STORAGE_PREFIX = 'pulseWelcomeCurtain.v15:'
const LINE_PREFIX = 'pulseWelcomeLines.v2:'

export function welcomeCurtainStorageKey(email) {
  return `${STORAGE_PREFIX}${String(email || '').trim().toLowerCase()}`
}

function lineStorageKey(email) {
  return `${LINE_PREFIX}${String(email || '').trim().toLowerCase()}`
}

export function hasSeenWelcomeCurtain(email) {
  if (!email) return true
  try {
    return sessionStorage.getItem(welcomeCurtainStorageKey(email)) === '1'
  } catch {
    return false
  }
}

export function markWelcomeCurtainSeen(email) {
  if (!email) return
  try {
    sessionStorage.setItem(welcomeCurtainStorageKey(email), '1')
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearWelcomeCurtainSeen() {
  try {
    const keys = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    /* ignore */
  }
}

const LINES = {
  morning: [
    { id: 'm1', text: 'Good morning. Haan, Monday nahi hai toh thoda celebrate kar sakte hain.' },
    { id: 'm2', text: 'Uth gaye? Impressive. Ab thoda productive hone ka natak bhi kar lete hain.' },
    { id: 'm3', text: 'Chai abhi nahi mili? Koi nahi, hum emotional support ke saath kaam chala lenge.' },
    { id: 'm4', text: 'Brain abhi loading pe hai? Same. Chal, slowly boot karte hain.' },
    { id: 'm5', text: 'Aaj ka plan: panic nahi karna. Baaki dekha jayega.' },
    { id: 'm6', text: 'Neend bol rahi thi "5 minute aur." Tumne uski nahi suni. Proud of you.' },
    { id: 'm7', text: 'Inbox dekhne se pehle ek deep breath. Haan, itna toh banta hai.' },
    { id: 'm8', text: 'Fresh day. Fresh start. Same tum. Honestly, solid combination.' },
    { id: 'm9', text: 'Aaj productivity ka pressure nahi. Bas thoda sa magic kar dete hain.' },
    { id: 'm10', text: 'Good morning! Ab dekhte hain aaj kaun zyada stubborn hai: tum ya tumhari to-do list.' },
  ],
  afternoon: [
    { id: 'a1', text: 'Lunch ho gaya? Great. Ab food coma se professionally bahar aate hain.' },
    { id: 'a2', text: '2 PM ho gaya. Productivity ko bhi thoda attendance lagwa dete hain.' },
    { id: 'a3', text: 'Afternoon slump aa gaya? Usko chair offer karo, par kaam mat do.' },
    { id: 'a4', text: 'Coffee khatam? Tough. Ab personality se kaam chalana padega.' },
    { id: 'a5', text: 'Half day gone. Panic karne ki zarurat nahi. Abhi toh picture baaki hai.' },
    { id: 'a6', text: 'Inbox dekh ke darr laga? Fair. Ek-ek karke nipta dete hain.' },
    { id: 'a7', text: 'Energy 20% hai, attitude 100%. Kaam chal jayega.' },
    { id: 'a8', text: 'Lunch ke baad brain officially "do not disturb" pe hai. Phir bhi, chal try karte hain.' },
    { id: 'a9', text: 'Aaj ka second half abhi bhi bachaya ja sakta hai. Comeback time.' },
    { id: 'a10', text: 'Dhoop bahar full power pe hai. Chal, hum bhi thoda effort kar lete hain.' },
  ],
  evening: [
    { id: 'e1', text: 'Din khatam hone wala hai. Bas thoda aur. Phir tum free bird.' },
    { id: 'e2', text: 'Thak gaye? Valid. Chal, bacha hua thoda sa bhi nipta dete hain.' },
    { id: 'e3', text: '6 PM ke baad ka kaam character development hota hai. Chal, kar hi lete hain.' },
    { id: 'e4', text: 'Aaj ka din kaafi kuch bol gaya. Ab usko quietly wrap karte hain.' },
    { id: 'e5', text: 'Energy low, standards high. Respect. Chal, last stretch.' },
    { id: 'e6', text: 'Office lights abhi bhi on hain? Koi toh unhe samjhao ghar jaane ka time hai.' },
    { id: 'e7', text: 'Raat ho gayi. Brain keh raha hai "kal karenge." Brain has a point.' },
    { id: 'e8', text: 'Almost done. Bas do-chaar cheezein aur, phir officially human ban sakte ho.' },
    { id: 'e9', text: 'Aaj ka quota almost complete. Chal, ek last push aur phir peace.' },
    { id: 'e10', text: 'You survived the day. Honestly, that deserves a tiny celebration.' },
  ],
}

const WEEKDAY = {
  1: {
    morning: [
      { id: 'w1m1', text: 'Monday aa gaya. Kisi ne bulaya nahi tha, but okay.' },
      { id: 'w1m2', text: 'Monday hai. Expectations low rakho, coffee high.' },
      { id: 'w1m3', text: 'New week, same chaos. Chal, thoda organised chaos karte hain.' },
      { id: 'w1m4', text: 'Monday ko productive hona zaroori nahi. Present rehna bhi achievement hai.' },
      { id: 'w1m5', text: 'Monday morning: body online, soul abhi commute mein.' },
      { id: 'w1m6', text: 'Week ka pehla din hai. Chal, overachieve nahi, bas survive karte hain.' },
    ],
    afternoon: [
      { id: 'w1a1', text: 'Monday ka second half. Ab toh officially downhill jaana chahiye. Hopefully.' },
    ],
    evening: [
      { id: 'w1e1', text: 'Monday khatam hone wala hai. See? Humne bola tha ho jayega.' },
    ],
  },
  5: {
    morning: [
      { id: 'w5m1', text: 'Friday hai. Productivity karenge, but with feelings.' },
      { id: 'w5m2', text: 'Friday morning! Calendar finally kuch achha bol raha hai.' },
    ],
    afternoon: [
      { id: 'w5a1', text: 'Friday afternoon: body office mein, mind weekend pe.' },
      { id: 'w5a2', text: 'Bas thoda aur. Weekend literally door pe khada hai.' },
    ],
    evening: [
      { id: 'w5e1', text: 'Friday ka last stretch. Chal, weekend ko disappoint nahi karte.' },
      { id: 'w5e2', text: 'Week survived. Ab officially "bas ek last kaam" bolne ka time hai.' },
      { id: 'w5e3', text: 'Friday night. Laptop band karne ka thought already beautiful lag raha hai.' },
    ],
  },
  6: {
    morning: [
      { id: 'w6m1', text: 'Saturday pe login? Okay, overachiever. Respect.' },
      { id: 'w6m2', text: 'Saturday hai aur tum yahan ho. Someone give this person a medal.' },
      { id: 'w6m3', text: 'Weekend mode: ON. Work mode: reluctantly ON.' },
      { id: 'w6m4', text: 'Aaj koi Monday wali jaldi nahi hai. Aaram se karte hain.' },
    ],
    afternoon: [
      { id: 'w6a1', text: 'Saturday ka kaam bhi ho raha hai? Chal, coffee tum deserve karte ho.' },
    ],
    evening: [
      { id: 'w6e1', text: 'Saturday night. Kal bhi chhutti hai. This is what dreams are made of.' },
    ],
  },
  0: {
    morning: [
      { id: 'w0m1', text: 'Sunday ko bhi login? Tumse zyada committed kaun hai.' },
      { id: 'w0m2', text: 'Sunday hai. Kaam karna pade toh at least cute banke karte hain.' },
      { id: 'w0m3', text: 'Aaj slow chalna allowed hai. Koi race nahi hai.' },
    ],
    afternoon: [
      { id: 'w0a1', text: 'Sunday ka golden rule: jitna ho sake, kal wale tum ke liye easy chhodo.' },
    ],
    evening: [
      { id: 'w0e1', text: 'Weekend ka last boss: Sunday night.' },
      { id: 'w0e2', text: 'Kal Monday hai. Is information ko abhi ignore karna completely valid hai.' },
      { id: 'w0e3', text: 'Sunday night: "Kal se pakka." Classic. Chal, thoda prep bhi kar lete hain.' },
    ],
  },
}

function poolFor(period, weekday) {
  const base = LINES[period] || LINES.afternoon
  const extra = WEEKDAY[weekday]?.[period] || []
  const seen = new Set()
  return [...extra, ...base].filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

function readUsedIds(email) {
  try {
    const raw = localStorage.getItem(lineStorageKey(email))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function writeUsedIds(email, ids) {
  try {
    localStorage.setItem(lineStorageKey(email), JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

/** Pick a Hinglish line that this person has not seen yet, then remember it. */
export function pickWelcomeLine(email, period, weekday) {
  const pool = poolFor(period, weekday)
  const used = readUsedIds(email)
  const unused = pool.filter((row) => !used.includes(row.id))
  const source = unused.length > 0 ? unused : pool
  const index = Math.floor(Math.random() * source.length)
  const chosen = source[index] || pool[0]
  const nextUsed = unused.length > 0 ? [...used, chosen.id] : [chosen.id]
  if (email) writeUsedIds(email, nextUsed)
  return chosen.text
}
