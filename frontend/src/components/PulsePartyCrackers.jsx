import { useEffect, useRef } from 'react'
import './pulse-party.css'

const PAPER = ['#e24b4b', '#f3b133', '#f7f3ea', '#3d7a62', '#e88a2d', '#d45d8c']

function mouthOf(side, width, height, intro) {
  const slide = 1 - (1 - intro) ** 3
  if (side === 'left') {
    return {
      x: -30 + slide * 108,
      y: height - 36 - slide * 28,
      angle: -0.85,
    }
  }
  return {
    x: width + 30 - slide * 108,
    y: height - 36 - slide * 28,
    angle: Math.PI + 0.85,
  }
}

function emitPaper(bits, x, y, angle) {
  for (let i = 0; i < 8; i += 1) {
    const spread = angle + (Math.random() - 0.5) * 0.7
    const speed = 6.5 + Math.random() * 5
    bits.push({
      kind: 'ribbon',
      x,
      y,
      vx: Math.cos(spread) * speed,
      vy: Math.sin(spread) * speed,
      pts: [{ x, y }],
      color: PAPER[i % PAPER.length],
      width: 2.6 + Math.random() * 2.4,
      life: 1,
      flutter: (Math.random() - 0.5) * 0.4,
    })
  }
  for (let i = 0; i < 14; i += 1) {
    const spread = angle + (Math.random() - 0.5) * 1.05
    const speed = 4 + Math.random() * 7
    bits.push({
      kind: 'scrap',
      x,
      y,
      vx: Math.cos(spread) * speed,
      vy: Math.sin(spread) * speed,
      w: 5 + Math.random() * 7,
      h: 3 + Math.random() * 3,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.22,
      color: PAPER[(i + 2) % PAPER.length],
      life: 1,
    })
  }
  bits.push({ kind: 'flash', x, y, r: 8, life: 1 })
}

function crack(bits, x, y, hot) {
  bits.push({ kind: 'flash', x, y, r: hot ? 14 : 7, life: 1 })
  bits.push({ kind: 'ring', x, y, r: 3, life: 1 })
  bits.push({ kind: 'smoke', x, y, r: 5, vx: 0, vy: -0.25, life: 0.85 })
  const count = hot ? 42 : 16
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.15
    const speed = (hot ? 2.2 : 1.4) + Math.random() * (hot ? 4.6 : 2.4)
    bits.push({
      kind: 'spark',
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - (hot ? 0.4 : 1.1),
      heat: 1,
      life: 0.85 + Math.random() * 0.15,
      r: hot ? 1.5 + Math.random() * 1.3 : 1.1 + Math.random() * 0.8,
    })
  }
}

function drawPopper(ctx, x, y, angle, flash) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(8, 0)
  ctx.lineTo(-48, -13)
  ctx.lineTo(-48, 13)
  ctx.closePath()
  ctx.fillStyle = '#c9843a'
  ctx.fill()
  ctx.fillStyle = '#f3b133'
  ctx.fillRect(-40, -10, 8, 20)
  ctx.fillStyle = '#e24b4b'
  ctx.fillRect(-28, -8, 7, 16)
  ctx.fillStyle = '#3d7a62'
  ctx.fillRect(-16, -6, 6, 12)
  ctx.fillStyle = '#6b4a2b'
  ctx.fillRect(-52, -8, 6, 16)
  if (flash > 0) {
    ctx.globalAlpha = flash
    ctx.fillStyle = '#fff8e4'
    ctx.beginPath()
    ctx.arc(12, 0, 8 + (1 - flash) * 18, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawCracker(ctx, x, y) {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#a32020'
  ctx.fillRect(-6, -3, 12, 6)
  ctx.fillStyle = '#f3b133'
  ctx.fillRect(-6, -1, 12, 2)
  ctx.strokeStyle = '#d7d0c4'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(6, 0)
  ctx.lineTo(11, -4)
  ctx.stroke()
  ctx.restore()
}

function sparkColor(heat) {
  if (heat > 0.72) return '#fff6d4'
  if (heat > 0.4) return '#f3b133'
  return '#e24b4b'
}

export default function PulsePartyCrackers() {
  const canvasRef = useRef(null)
  const hostRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let raf = 0
    let alive = true
    const bits = []
    const fit = () => {
      const rect = host.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      return rect
    }
    fit()

    const events = { popped: false, shells: false }
    const crackers = [0, 1, 2, 3, 4].map((i) => ({
      at: 720 + i * 110,
      done: false,
    }))
    const started = performance.now()

    const frame = (now) => {
      if (!alive) return
      const box = host.getBoundingClientRect()
      const t = now - started
      const intro = Math.min(1, t / 320)
      const left = mouthOf('left', box.width, box.height, intro)
      const right = mouthOf('right', box.width, box.height, intro)
      const flash = t < 280 ? 0 : Math.max(0, 1 - (t - 280) / 180)

      ctx.clearRect(0, 0, box.width, box.height)

      if (!events.popped && t >= 280) {
        events.popped = true
        emitPaper(bits, left.x + Math.cos(left.angle) * 10, left.y + Math.sin(left.angle) * 10, left.angle)
        emitPaper(bits, right.x + Math.cos(right.angle) * 10, right.y + Math.sin(right.angle) * 10, right.angle)
      }

      const fadeProp = t < 2100 ? 1 : Math.max(0, 1 - (t - 2100) / 500)
      ctx.globalAlpha = fadeProp
      drawPopper(ctx, left.x, left.y, left.angle, flash)
      drawPopper(ctx, right.x, right.y, right.angle, flash)
      ctx.globalAlpha = 1

      crackers.forEach((cracker, index) => {
        const x = box.width * (0.32 + index * 0.09)
        const y = box.height - 22
        if (!cracker.done && t >= cracker.at) {
          cracker.done = true
          crack(bits, x, y, false)
        } else if (!cracker.done && t > 400) {
          drawCracker(ctx, x, y)
        }
      })

      if (!events.shells && t >= 1280) {
        events.shells = true
        bits.push({
          kind: 'shell',
          x: box.width * 0.38,
          y: box.height - 10,
          vx: -0.15,
          vy: -9.2,
          life: 1,
        })
        bits.push({
          kind: 'shell',
          x: box.width * 0.64,
          y: box.height - 10,
          vx: 0.2,
          vy: -8.4,
          life: 1,
        })
      }

      for (let i = bits.length - 1; i >= 0; i -= 1) {
        const bit = bits[i]
        if (bit.kind === 'ribbon') {
          bit.flutter += (Math.random() - 0.5) * 0.12
          bit.vx += bit.flutter * 0.12
          bit.vy += 0.085
          bit.vx *= 0.992
          bit.x += bit.vx
          bit.y += bit.vy
          bit.pts.unshift({ x: bit.x, y: bit.y })
          if (bit.pts.length > 26) bit.pts.pop()
          bit.life -= 0.0035
          if (bit.life <= 0) {
            bits.splice(i, 1)
            continue
          }
          ctx.strokeStyle = bit.color
          ctx.lineCap = 'round'
          for (let p = 1; p < bit.pts.length; p += 1) {
            ctx.globalAlpha = bit.life * (1 - p / bit.pts.length)
            ctx.lineWidth = Math.max(0.5, bit.width * (1 - p / bit.pts.length))
            ctx.beginPath()
            ctx.moveTo(bit.pts[p - 1].x, bit.pts[p - 1].y)
            ctx.lineTo(bit.pts[p].x, bit.pts[p].y)
            ctx.stroke()
          }
          ctx.globalAlpha = 1
          continue
        }
        if (bit.kind === 'scrap') {
          bit.vy += 0.12
          bit.vx *= 0.99
          bit.x += bit.vx
          bit.y += bit.vy
          bit.rot += bit.vr
          bit.life -= 0.006
          if (bit.life <= 0 || bit.y > box.height + 20) {
            bits.splice(i, 1)
            continue
          }
          ctx.save()
          ctx.globalAlpha = bit.life
          ctx.translate(bit.x, bit.y)
          ctx.rotate(bit.rot)
          ctx.fillStyle = bit.color
          ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h)
          ctx.restore()
          continue
        }
        if (bit.kind === 'shell') {
          bit.vy += 0.12
          bit.x += bit.vx
          bit.y += bit.vy
          ctx.fillStyle = 'rgba(90, 90, 90, 0.18)'
          ctx.beginPath()
          ctx.arc(bit.x, bit.y + 8, 3.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#f3b133'
          ctx.fillRect(bit.x - 1.2, bit.y, 2.4, 7)
          if (bit.vy >= -0.4) {
            crack(bits, bit.x, bit.y, true)
            bits.splice(i, 1)
          }
          continue
        }
        if (bit.kind === 'spark') {
          bit.vy += 0.045
          bit.vx *= 0.988
          bit.vy *= 0.992
          bit.x += bit.vx
          bit.y += bit.vy
          bit.heat -= 0.012
          bit.life -= 0.01
          if (bit.life <= 0) {
            bits.splice(i, 1)
            continue
          }
          ctx.globalAlpha = Math.max(0, bit.life)
          ctx.strokeStyle = sparkColor(bit.heat)
          ctx.lineWidth = bit.r
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(bit.x, bit.y)
          ctx.lineTo(bit.x - bit.vx * 1.6, bit.y - bit.vy * 1.6)
          ctx.stroke()
          ctx.globalAlpha = 1
          continue
        }
        if (bit.kind === 'flash') {
          bit.life -= 0.12
          bit.r += 1.4
          if (bit.life <= 0) {
            bits.splice(i, 1)
            continue
          }
          ctx.globalAlpha = bit.life * 0.85
          ctx.fillStyle = '#fff8e4'
          ctx.beginPath()
          ctx.arc(bit.x, bit.y, bit.r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
          continue
        }
        if (bit.kind === 'ring') {
          bit.r += 2.4
          bit.life -= 0.06
          if (bit.life <= 0) {
            bits.splice(i, 1)
            continue
          }
          ctx.globalAlpha = bit.life * 0.55
          ctx.strokeStyle = '#fff6d4'
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.arc(bit.x, bit.y, bit.r, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
          continue
        }
        if (bit.kind === 'smoke') {
          bit.y += bit.vy
          bit.r += 0.45
          bit.life -= 0.008
          if (bit.life <= 0) {
            bits.splice(i, 1)
            continue
          }
          ctx.globalAlpha = bit.life * 0.28
          ctx.fillStyle = '#6e726c'
          ctx.beginPath()
          ctx.arc(bit.x, bit.y, bit.r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }

      if (t < 4800) raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="pulse-party" ref={hostRef} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}
