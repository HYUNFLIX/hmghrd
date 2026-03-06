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

// ── Dynamic floating dots ─────────────────────────────────────
function initParticles() {
  const heroBg = document.querySelector('.hero .hero-bg')
  if (!heroBg) return

  // Remove statically positioned dots from HTML; generate them via JS
  heroBg.querySelectorAll('.dot').forEach(d => d.remove())

  const COUNT = 14
  const particles = []

  for (let i = 0; i < COUNT; i++) {
    const el = document.createElement('div')
    el.className = 'dot'
    heroBg.appendChild(el)

    const size = 4 + Math.random() * 4          // 4–8 px
    const speed = 0.018 + Math.random() * 0.028 // % per frame
    const angle = Math.random() * Math.PI * 2

    el.style.width  = size + 'px'
    el.style.height = size + 'px'
    el.style.opacity = (0.25 + Math.random() * 0.45).toFixed(2)

    particles.push({
      el,
      x: Math.random() * 98,
      y: Math.random() * 98,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    })
  }

  function animate() {
    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy

      if (p.x <= 0 || p.x >= 99) { p.vx *= -1; p.x = Math.max(0, Math.min(99, p.x)) }
      if (p.y <= 0 || p.y >= 99) { p.vy *= -1; p.y = Math.max(0, Math.min(99, p.y)) }

      p.el.style.left = p.x + '%'
      p.el.style.top  = p.y + '%'
    }
    requestAnimationFrame(animate)
  }
  animate()
}

initCountdown()
initParticles()
