// Accordion functionality
document.querySelectorAll('.accordion-trigger').forEach(trigger => {
  trigger.addEventListener('click', function () {
    const item = this.parentElement
    const wasActive = item.classList.contains('active')
    document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('active'))
    if (!wasActive) item.classList.add('active')
  })
})

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault()
    const target = document.querySelector(this.getAttribute('href'))
    if (target) target.scrollIntoView({ behavior: 'smooth' })
  })
})

// ── Countdown timer ───────────────────────────────────────────
function initCountdown() {
  const deadline = new Date('2026-03-16T23:59:59+09:00')
  const els = {
    days:    document.getElementById('cd-days'),
    hours:   document.getElementById('cd-hours'),
    minutes: document.getElementById('cd-minutes'),
    seconds: document.getElementById('cd-seconds'),
  }
  if (!els.days) return

  const pad = n => String(n).padStart(2, '0')

  function tick() {
    const diff = deadline - Date.now()
    if (diff <= 0) {
      els.days.textContent = els.hours.textContent =
      els.minutes.textContent = els.seconds.textContent = '00'
      return
    }
    els.days.textContent    = pad(Math.floor(diff / 86400000))
    els.hours.textContent   = pad(Math.floor((diff % 86400000) / 3600000))
    els.minutes.textContent = pad(Math.floor((diff % 3600000) / 60000))
    els.seconds.textContent = pad(Math.floor((diff % 60000) / 1000))
    setTimeout(tick, 1000)
  }
  tick()
}

// ── Neural Network Canvas ──────────────────────────────────────
function initNeuralNetwork() {
  const heroBg = document.querySelector('.hero .hero-bg')
  if (!heroBg) return
  heroBg.querySelectorAll('.dot').forEach(d => d.remove())

  const canvas = document.createElement('canvas')
  canvas.id = 'hero-canvas'
  heroBg.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  function resize() {
    canvas.width  = heroBg.offsetWidth  || window.innerWidth
    canvas.height = heroBg.offsetHeight || window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  // Draw simple line icons inside each node
  function drawIcon(type, x, y, r) {
    const s = r * 0.5
    ctx.save()
    ctx.translate(x, y)
    ctx.strokeStyle = 'rgba(74,236,216,0.22)'
    ctx.lineWidth = 0.9
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    switch (type) {
      case 'mail':
        ctx.rect(-s, -s * 0.65, s * 2, s * 1.3)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(-s, -s * 0.65); ctx.lineTo(0, s * 0.15); ctx.lineTo(s, -s * 0.65)
        break
      case 'chart':
        ctx.moveTo(-s * 1.1, s * 0.6); ctx.lineTo(s * 1.1, s * 0.6)
        ctx.moveTo(-s * 0.65, s * 0.6); ctx.lineTo(-s * 0.65, -s * 0.4)
        ctx.moveTo(0, s * 0.6); ctx.lineTo(0, s * 0.05)
        ctx.moveTo(s * 0.65, s * 0.6); ctx.lineTo(s * 0.65, -s * 0.8)
        break
      case 'chip':
        ctx.rect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1)
        ctx.stroke()
        ctx.beginPath()
        ctx.rect(-s * 0.25, -s * 0.25, s * 0.5, s * 0.5)
        ctx.stroke()
        ctx.beginPath()
        // pins
        ctx.moveTo(-s * 0.55, -s * 0.2); ctx.lineTo(-s * 0.85, -s * 0.2)
        ctx.moveTo(-s * 0.55,  s * 0.2); ctx.lineTo(-s * 0.85,  s * 0.2)
        ctx.moveTo( s * 0.55, -s * 0.2); ctx.lineTo( s * 0.85, -s * 0.2)
        ctx.moveTo( s * 0.55,  s * 0.2); ctx.lineTo( s * 0.85,  s * 0.2)
        ctx.moveTo(-s * 0.2, -s * 0.55); ctx.lineTo(-s * 0.2, -s * 0.85)
        ctx.moveTo( s * 0.2, -s * 0.55); ctx.lineTo( s * 0.2, -s * 0.85)
        ctx.moveTo(-s * 0.2,  s * 0.55); ctx.lineTo(-s * 0.2,  s * 0.85)
        ctx.moveTo( s * 0.2,  s * 0.55); ctx.lineTo( s * 0.2,  s * 0.85)
        break
      case 'cloud':
        ctx.arc(-s * 0.28, s * 0.1, s * 0.38, Math.PI, Math.PI * 1.75)
        ctx.arc(0, -s * 0.2, s * 0.46, -Math.PI * 0.78, 0)
        ctx.arc(s * 0.38, s * 0.1, s * 0.32, -Math.PI * 0.5, Math.PI * 0.5)
        ctx.lineTo(-s * 0.28, s * 0.42)
        ctx.arc(-s * 0.28, s * 0.1, s * 0.32, Math.PI * 0.5, Math.PI)
        break
      case 'network':
        ctx.arc(0, -s * 0.55, s * 0.27, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(-s * 0.62, s * 0.4, s * 0.24, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(s * 0.62, s * 0.4, s * 0.24, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(-s * 0.1, -s * 0.3); ctx.lineTo(-s * 0.48, s * 0.22)
        ctx.moveTo(s * 0.1, -s * 0.3); ctx.lineTo(s * 0.48, s * 0.22)
        break
      case 'doc':
        ctx.rect(-s * 0.65, -s, s * 1.3, s * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(-s * 0.35, -s * 0.35); ctx.lineTo(s * 0.35, -s * 0.35)
        ctx.moveTo(-s * 0.35, s * 0.05); ctx.lineTo(s * 0.35, s * 0.05)
        ctx.moveTo(-s * 0.35, s * 0.45); ctx.lineTo(s * 0.1, s * 0.45)
        break
      case 'gear':
        ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3
          ctx.moveTo(Math.cos(a) * s * 0.5, Math.sin(a) * s * 0.5)
          ctx.lineTo(Math.cos(a) * s * 0.78, Math.sin(a) * s * 0.78)
        }
        break
      case 'link':
        ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2)
        break
    }
    ctx.stroke()
    ctx.restore()
  }

  const ICONS = ['mail','chart','chip','cloud','network','doc','gear','link',
                 'chip','mail','network','chart','cloud','doc','gear','link',
                 'chip','network','mail','chart','gear','cloud','doc']

  const nodes = ICONS.map(icon => {
    const angle = Math.random() * Math.PI * 2
    const speed = 0.1 + Math.random() * 0.16
    return {
      icon,
      x: 0.05 * (canvas.width || 1200) + Math.random() * 0.9 * (canvas.width || 1200),
      y: 0.05 * (canvas.height || 700) + Math.random() * 0.9 * (canvas.height || 700),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 9 + Math.random() * 8,
      phase: Math.random() * Math.PI * 2,
    }
  })

  const CONNECT = 210
  const MOUSE_RADIUS = 120   // 반발 범위
  const MOUSE_FORCE  = 1.8   // 반발 세기
  const mouse = { x: -9999, y: -9999 }

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect()
    mouse.x = e.clientX - rect.left
    mouse.y = e.clientY - rect.top
  })
  canvas.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999 })

  // pointer-events 활성화 (canvas는 기본 none)
  canvas.style.pointerEvents = 'auto'

  function draw(ts) {
    const w = canvas.width, h = canvas.height
    const t = ts / 1000
    ctx.clearRect(0, 0, w, h)

    for (const n of nodes) {
      // 마우스 반발력
      const mdx = n.x - mouse.x
      const mdy = n.y - mouse.y
      const mdist = Math.sqrt(mdx * mdx + mdy * mdy)
      if (mdist < MOUSE_RADIUS && mdist > 0) {
        const force = (MOUSE_RADIUS - mdist) / MOUSE_RADIUS * MOUSE_FORCE
        n.vx += (mdx / mdist) * force * 0.08
        n.vy += (mdy / mdist) * force * 0.08
      }
      // 속도 감쇠 (원래 속도로 서서히 복귀)
      const baseSpeed = 0.13
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy)
      if (speed > baseSpeed) {
        n.vx *= 0.97
        n.vy *= 0.97
      }

      n.x += n.vx; n.y += n.vy
      if (n.x < n.r || n.x > w - n.r) { n.vx *= -1; n.x = Math.max(n.r, Math.min(w - n.r, n.x)) }
      if (n.y < n.r || n.y > h - n.r) { n.vy *= -1; n.y = Math.max(n.r, Math.min(h - n.r, n.y)) }
    }

    // Edges
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = a.x - b.x, dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > CONNECT) continue
        const alpha = (1 - dist / CONNECT) * 0.12
        ctx.beginPath()
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = `rgba(74,236,216,${alpha})`
        ctx.lineWidth = 0.5
        ctx.stroke()
        // Data packet
        const prog = ((t * 0.3) + i * 0.13 + j * 0.07) % 1
        ctx.beginPath()
        ctx.arc(a.x + (b.x - a.x) * prog, a.y + (b.y - a.y) * prog, 1, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(74,236,216,${Math.min(alpha * 3, 0.28)})`
        ctx.fill()
      }
    }

    // Nodes
    for (const n of nodes) {
      const pulse = 1 + 0.05 * Math.sin(t * 1.4 + n.phase)
      const r = n.r * pulse

      // Glow halo
      const grd = ctx.createRadialGradient(n.x, n.y, r * 0.4, n.x, n.y, r * 2.3)
      grd.addColorStop(0, 'rgba(74,236,216,0.04)')
      grd.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(n.x, n.y, r * 2.3, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()

      // Circle fill
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(8,18,52,0.35)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(74,236,216,0.22)'
      ctx.lineWidth = 0.8
      ctx.stroke()

      // Icon
      drawIcon(n.icon, n.x, n.y, r)
    }

    requestAnimationFrame(draw)
  }
  requestAnimationFrame(draw)
}

// ── Schedule Tabs ─────────────────────────────────────────────
function initScheduleTabs() {
  document.querySelectorAll('.sched-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sched-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const target = tab.dataset.target
      document.querySelectorAll('.sched-panel').forEach(p => { p.hidden = p.id !== target })
    })
  })
}

initCountdown()
initNeuralNetwork()
initScheduleTabs()
