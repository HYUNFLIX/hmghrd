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

  // Node definitions — AI/HRD labels + category
  const DEFS = [
    { label: 'AI',     cat: 'core'  },
    { label: 'LLM',    cat: 'core'  },
    { label: 'GPT',    cat: 'core'  },
    { label: 'ML',     cat: 'core'  },
    { label: 'NLP',    cat: 'tech'  },
    { label: 'RAG',    cat: 'tech'  },
    { label: 'Agent',  cat: 'tech'  },
    { label: 'API',    cat: 'tech'  },
    { label: 'SDK',    cat: 'tech'  },
    { label: 'Cloud',  cat: 'tech'  },
    { label: 'HRD',    cat: 'hrd'   },
    { label: 'VoE',    cat: 'hrd'   },
    { label: 'PRD',    cat: 'hrd'   },
    { label: 'UX',     cat: 'hrd'   },
    { label: 'DATA',   cat: 'data'  },
    { label: 'RPA',    cat: 'data'  },
    { label: 'Vibe',   cat: 'trend' },
    { label: 'NoCode', cat: 'trend' },
  ]

  const CAT_COLOR = {
    core:  '#5fb1eb',
    tech:  '#4aecd8',
    hrd:   '#ffffff',
    data:  '#c084fc',
    trend: '#fb923c',
  }

  const nodes = DEFS.map(d => {
    const angle = Math.random() * Math.PI * 2
    const speed = 0.14 + Math.random() * 0.22
    return {
      ...d,
      color: CAT_COLOR[d.cat],
      x: 0.1 * (canvas.width  || 1200) + Math.random() * 0.8 * (canvas.width  || 1200),
      y: 0.1 * (canvas.height || 700)  + Math.random() * 0.8 * (canvas.height || 700),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r:  4 + Math.random() * 4,
      phase: Math.random() * Math.PI * 2,
    }
  })

  const CONNECT = 200

  function draw(ts) {
    const w = canvas.width, h = canvas.height
    const t = ts / 1000
    ctx.clearRect(0, 0, w, h)

    // Move nodes
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy
      if (n.x < n.r || n.x > w - n.r) { n.vx *= -1; n.x = Math.max(n.r, Math.min(w - n.r, n.x)) }
      if (n.y < n.r || n.y > h - n.r) { n.vy *= -1; n.y = Math.max(n.r, Math.min(h - n.r, n.y)) }
    }

    // Draw edges + data packets
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = a.x - b.x, dy = a.y - b.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > CONNECT) continue
        const alpha = (1 - dist / CONNECT) * 0.18

        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = `rgba(95,177,235,${alpha})`
        ctx.lineWidth = 0.8
        ctx.stroke()

        // Animated data packet along edge
        const prog = ((t * 0.35) + i * 0.11 + j * 0.07) % 1
        const px = a.x + (b.x - a.x) * prog
        const py = a.y + (b.y - a.y) * prog
        ctx.beginPath()
        ctx.arc(px, py, 1.2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(74,236,216,${Math.min(alpha * 3, 0.35)})`
        ctx.fill()
      }
    }

    // Draw nodes
    for (const n of nodes) {
      const pulse = 1 + 0.07 * Math.sin(t * 1.7 + n.phase)
      const r = n.r * pulse

      // Soft glow
      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3)
      grd.addColorStop(0, n.color + '18')
      grd.addColorStop(1, 'transparent')
      ctx.beginPath()
      ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2)
      ctx.fillStyle = grd
      ctx.fill()

      // Node dot
      ctx.beginPath()
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.fillStyle = n.color + '55'
      ctx.fill()
      ctx.strokeStyle = n.color + '66'
      ctx.lineWidth = 0.8
      ctx.stroke()
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
