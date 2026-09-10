const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, powerMonitor } = require('electron')
const http = require('http')
const path = require('path')

const PROTOCOL = 'pulse-timer'
const BRIDGE_PORT = 39217
const WINDOW_WIDTH = 118
const WINDOW_HEIGHT = 36
const IDLE_GAP_MS = 90_000

/** @type {BrowserWindow | null} */
let win = null
/** @type {http.Server | null} */
let bridge = null
/** @type {Tray | null} */
let tray = null

let state = {
  email: null,
  checkedInAt: null,
  activeMs: 0,
  lastTickAt: null,
}

/** @type {ReturnType<typeof setInterval> | null} */
let topKeepAlive = null
/** @type {ReturnType<typeof setInterval> | null} */
let sessionTick = null

function reconcileState(now = Date.now()) {
  if (!state.checkedInAt) return state
  const lastTickAt = state.lastTickAt || state.checkedInAt
  const delta = Math.max(0, now - lastTickAt)
  let activeMs = Math.max(0, state.activeMs || 0)
  if (delta > 0 && delta < IDLE_GAP_MS) activeMs += delta
  state = {
    ...state,
    activeMs,
    lastTickAt: now,
  }
  return state
}

function elapsedSeconds() {
  if (!state.checkedInAt) return 0
  reconcileState()
  return Math.max(0, Math.floor((state.activeMs || 0) / 1000))
}

function startSessionTick() {
  if (sessionTick) return
  sessionTick = setInterval(() => {
    if (!state.checkedInAt) return
    reconcileState()
    sendState()
  }, 1000)
}

function stopSessionTick() {
  if (!sessionTick) return
  clearInterval(sessionTick)
  sessionTick = null
}

function applyAlwaysOnTop(target = win, { raise = false } = {}) {
  if (!target || target.isDestroyed()) return
  try {
    // Highest practical level — needed to float over Electron apps like Cursor.
    target.setAlwaysOnTop(true, 'screen-saver', 1)
  } catch {
    try {
      target.setAlwaysOnTop(true, 'screen-saver')
    } catch {
      target.setAlwaysOnTop(true)
    }
  }
  try {
    target.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    })
  } catch {
    try {
      target.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    } catch {
      /* ignore */
    }
  }
  try {
    target.setFullScreenable(false)
  } catch {
    /* ignore */
  }
  // Only raise on show — periodic moveTop() steals OS activation and forces double-clicks.
  if (raise) {
    try {
      target.moveTop()
    } catch {
      /* ignore */
    }
  }
}

function startTopKeepAlive() {
  if (topKeepAlive) return
  topKeepAlive = setInterval(() => {
    if (!state.checkedInAt || !win || win.isDestroyed() || !win.isVisible()) return
    applyAlwaysOnTop(win, { raise: false })
  }, 4000)
}

function stopTopKeepAlive() {
  if (!topKeepAlive) return
  clearInterval(topKeepAlive)
  topKeepAlive = null
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${PROTOCOL}://`))
    if (url) handleProtocolUrl(url)
    if (state.checkedInAt) showTimer()
  })
}

function registerProtocol() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
      return
    }
  }
  app.setAsDefaultProtocolClient(PROTOCOL)
}

function parseProtocolUrl(raw) {
  try {
    const url = new URL(raw)
    if (url.protocol !== `${PROTOCOL}:`) return null
    const host = url.hostname || url.pathname.replace(/^\//, '')
    const checkedInAt = url.searchParams.get('checkedInAt')
    const email = url.searchParams.get('email')
    const activeMs = url.searchParams.get('activeMs')
    const lastTickAt = url.searchParams.get('lastTickAt')
    return {
      action: host || 'sync',
      email: email || null,
      checkedInAt: checkedInAt ? Number(checkedInAt) : null,
      activeMs: activeMs != null ? Number(activeMs) : 0,
      lastTickAt: lastTickAt ? Number(lastTickAt) : null,
    }
  } catch {
    return null
  }
}

function handleProtocolUrl(raw) {
  const parsed = parseProtocolUrl(raw)
  if (!parsed) return
  if (parsed.action === 'checkout' || parsed.action === 'close') {
    applyCheckIn({ email: null, checkedInAt: null })
    return
  }
  if (parsed.checkedInAt) {
    applyCheckIn(parsed)
  } else if (state.checkedInAt) {
    showTimer()
  }
}

function sendState() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('pulse-timer-state', state)
  }
  updateTray()
}

function createWindow() {
  const display = screen.getPrimaryDisplay()
  const { width: sw } = display.workAreaSize
  const { x: ox, y: oy } = display.workArea

  /** @type {Electron.BrowserWindowConstructorOptions} */
  const options = {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    x: ox + sw - WINDOW_WIDTH - 20,
    y: oy + 20,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    show: false,
    // Never steal focus from the browser — otherwise every CTA needs a double-click.
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  }

  // macOS panel floats above other apps (including Cursor / VS Code).
  if (process.platform === 'darwin') {
    options.type = 'panel'
  }

  win = new BrowserWindow(options)
  try {
    win.setFocusable(false)
  } catch {
    /* ignore */
  }
  applyAlwaysOnTop(win, { raise: true })
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  win.once('ready-to-show', () => {
    if (state.checkedInAt) {
      win.showInactive()
      applyAlwaysOnTop(win, { raise: true })
      sendState()
    }
  })

  // Keep floating without reclaiming keyboard/mouse focus from the browser.
  win.on('blur', () => {
    if (state.checkedInAt) applyAlwaysOnTop(win, { raise: false })
  })
  win.on('show', () => {
    try {
      win.setFocusable(false)
    } catch {
      /* ignore */
    }
  })

  win.on('close', (event) => {
    event.preventDefault()
    win.hide()
  })

  win.on('closed', () => {
    win = null
  })
}

function showTimer() {
  if (!state.checkedInAt) {
    hideTimer()
    return
  }
  if (!win || win.isDestroyed()) createWindow()
  if (!win) return
  if (typeof win.showInactive === 'function') win.showInactive()
  else win.show()
  applyAlwaysOnTop(win, { raise: true })
  startTopKeepAlive()
  startSessionTick()
  sendState()
}

function hideTimer() {
  stopTopKeepAlive()
  stopSessionTick()
  if (win && !win.isDestroyed()) win.hide()
  updateTray()
}

function applyCheckIn(payload) {
  const email = payload?.email || null
  const checkedInAt = payload?.checkedInAt ? Number(payload.checkedInAt) : null
  if (checkedInAt && Number.isFinite(checkedInAt) && checkedInAt > 0) {
    const now = Date.now()
    const incomingActive = Math.max(0, Number(payload.activeMs) || 0)
    const incomingLast = Number(payload.lastTickAt) || now
    state = {
      email,
      checkedInAt,
      // Trust browser session mapping — live elapsed, not a hardcoded clock.
      activeMs: incomingActive,
      lastTickAt: incomingLast,
    }
    reconcileState(now)
    showTimer()
    return true
  }
  state = { email: null, checkedInAt: null, activeMs: 0, lastTickAt: null }
  hideTimer()
  sendState()
  return true
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function startBridge() {
  bridge = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      })
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${BRIDGE_PORT}`)

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true, checkedIn: Boolean(state.checkedInAt) })
        return
      }

      if (req.method === 'GET' && url.pathname === '/state') {
        reconcileState()
        sendJson(res, 200, { ...state, elapsedSeconds: elapsedSeconds() })
        return
      }

      if (req.method === 'POST' && (url.pathname === '/checkin' || url.pathname === '/sync')) {
        const body = await readBody(req)
        applyCheckIn(body)
        sendJson(res, 200, { ok: true, ...state })
        return
      }

      if (req.method === 'POST' && url.pathname === '/checkout') {
        applyCheckIn({ email: null, checkedInAt: null })
        sendJson(res, 200, { ok: true })
        return
      }

      sendJson(res, 404, { ok: false, error: 'not_found' })
    } catch (err) {
      sendJson(res, 400, { ok: false, error: String(err?.message || err) })
    }
  })

  bridge.listen(BRIDGE_PORT, '127.0.0.1', () => {
    console.log(`[pulse-desktop] bridge http://127.0.0.1:${BRIDGE_PORT}`)
    console.log(`[pulse-desktop] protocol ${PROTOCOL}://`)
  })

  bridge.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[pulse-desktop] port ${BRIDGE_PORT} already in use`)
    } else {
      console.error('[pulse-desktop] bridge error', err)
    }
  })
}

function trayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="12" fill="#1A5F4A"/><circle cx="16" cy="16" r="5" fill="#34d399"/></svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
}

function updateTray() {
  if (!tray) return
  tray.setToolTip(state.checkedInAt ? 'BDA OS · Working' : 'BDA OS Timer')
}

function createTray() {
  tray = new Tray(trayIcon())
  tray.setToolTip('BDA OS Timer')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show timer',
        click: () => {
          if (state.checkedInAt) showTimer()
        },
      },
      {
        label: 'Hide timer',
        click: () => hideTimer(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit()
        },
      },
    ]),
  )
  tray.on('click', () => {
    if (state.checkedInAt) showTimer()
    else hideTimer()
  })
}

ipcMain.handle('get-state', () => {
  reconcileState()
  return { ...state, elapsedSeconds: elapsedSeconds() }
})
ipcMain.on('close-timer', () => hideTimer())

app.whenReady().then(() => {
  registerProtocol()
  createWindow()
  createTray()
  startBridge()

  try {
    powerMonitor.on('suspend', () => {
      if (state.checkedInAt) reconcileState()
    })
    powerMonitor.on('resume', () => {
      if (!state.checkedInAt) return
      // Skip downtime while the machine was asleep / off.
      state = { ...state, lastTickAt: Date.now() }
      sendState()
      showTimer()
    })
    powerMonitor.on('unlock-screen', () => {
      if (!state.checkedInAt) return
      state = { ...state, lastTickAt: Date.now() }
      sendState()
    })
    powerMonitor.on('shutdown', () => {
      if (state.checkedInAt) reconcileState()
    })
  } catch {
    /* older Electron */
  }

  const launchArg = process.argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${PROTOCOL}://`))
  if (launchArg) handleProtocolUrl(launchArg)

  app.on('activate', () => {
    if (!win || win.isDestroyed()) createWindow()
    if (state.checkedInAt) showTimer()
  })
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleProtocolUrl(url)
})

app.on('window-all-closed', () => {
  /* keep running for bridge + tray */
})

app.on('before-quit', () => {
  if (win && !win.isDestroyed()) {
    win.removeAllListeners('close')
    win.destroy()
    win = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
  if (bridge) {
    bridge.close()
    bridge = null
  }
})
