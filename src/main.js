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
