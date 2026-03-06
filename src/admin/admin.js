import { db, auth } from '/src/firebase.js'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://esm.sh/firebase@12.10.0/auth'
import { collection, onSnapshot, query, orderBy } from 'https://esm.sh/firebase@12.10.0/firestore'
import { Chart, LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'https://esm.sh/chart.js@4.5.1'
import QRCode from 'https://esm.sh/qrcode@1.5.3'

Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const SURVEY_URL = `${location.origin}/survey/`
const PAGE_SIZE  = 20

let allResponses      = []
let filteredResponses = []
let currentPage       = 1
let timelineChart     = null
let unsubscribe       = null

const $ = (id) => document.getElementById(id)

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function countToday(responses) {
  const t = new Date()
  return responses.filter(r => {
    if (!r.submittedAt) return false
    const d = r.submittedAt.toDate()
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
  }).length
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60)    return `${s}초 전`
  if (s < 3600)  return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

function download(content, filename, type) {
  const blob = new Blob([content], { type })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Auth ─────────────────────────────────────────────────────
function setupAuthState() {
  onAuthStateChanged(auth, user => {
    if (user) {
      $('login-screen').hidden = true
      $('admin-app').hidden    = false
      initAdmin()
    } else {
      $('login-screen').hidden = false
      $('admin-app').hidden    = true
      if (unsubscribe) { unsubscribe(); unsubscribe = null }
    }
  })
}

function setupLogin() {
  $('login-form').addEventListener('submit', async e => {
    e.preventDefault()
    const email    = $('email-input').value.trim()
    const password = $('password-input').value
    const errEl    = $('login-error')
    const btn      = $('login-btn')
    errEl.hidden = true
    btn.disabled = true; btn.textContent = '로그인 중...'
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      errEl.textContent = firebaseErrorMsg(err.code ?? '')
      errEl.hidden = false
      $('password-input').value = ''
      $('password-input').focus()
    } finally {
      btn.disabled = false; btn.textContent = '로그인'
    }
  })
}

function firebaseErrorMsg(code) {
  switch (code) {
    case 'auth/invalid-email':          return '이메일 형식이 올바르지 않습니다.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':     return '이메일 또는 비밀번호가 올바르지 않습니다.'
    case 'auth/too-many-requests':      return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.'
    case 'auth/network-request-failed': return '네트워크 오류입니다. 연결을 확인하세요.'
    default:                            return `오류가 발생했습니다. (${code})`
  }
}

// ── 탭 ───────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const tab = btn.dataset.tab
      document.querySelectorAll('.tab-content').forEach(s => { s.hidden = s.id !== `tab-${tab}` })
      if (tab === 'analytics') renderAnalytics()
      if (tab === 'responses') renderResponsesTable()
    })
  })
  $('menu-toggle').addEventListener('click', () => $('sidebar').classList.toggle('open'))
}

// ── Firestore ────────────────────────────────────────────────
function subscribeResponses() {
  const q = query(collection(db, 'responses'), orderBy('submittedAt', 'desc'))
  unsubscribe = onSnapshot(q, snapshot => {
    allResponses      = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    filteredResponses = [...allResponses]
    updateHeaderStats()
    updateOverviewStats()
    updateTimeline()
  })
}

function updateHeaderStats() {
  const total = allResponses.length
  const today = countToday(allResponses)
  const last  = allResponses[0]?.submittedAt
  $('header-total').textContent = String(total)
  $('header-today').textContent = String(today)
  if (last) {
    $('header-last').textContent = timeAgo(last.toDate())
    $('header-last-badge').style.display = ''
  }
}

function updateOverviewStats() {
  const total  = allResponses.length
  const today  = countToday(allResponses)
  const last   = allResponses[0]?.submittedAt
  const filled = allResponses.filter(r => r.name && r.email && r.advanced_course).length
  $('stat-total').textContent      = String(total)
  $('stat-today').textContent      = String(today)
  $('stat-today-date').textContent = new Date().toLocaleDateString('ko-KR')
  $('stat-completion').textContent = total ? `${Math.round((filled / total) * 100)}%` : '—'
  $('stat-last').textContent       = last ? timeAgo(last.toDate()) : '—'
}

function updateTimeline() {
  const canvas = $('timeline-chart')
  if (!canvas) return
  const days = 14, labels = [], counts = [], now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    labels.push(d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }))
    counts.push(allResponses.filter(r => {
      if (!r.submittedAt) return false
      const rd = r.submittedAt.toDate()
      return rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth() && rd.getDate() === d.getDate()
    }).length)
  }
  if (timelineChart) timelineChart.destroy()
  timelineChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '응답 수', data: counts,
        borderColor: '#003087', backgroundColor: 'rgba(0,48,135,0.1)',
        fill: true, tension: 0.3, pointRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { tooltip: { mode: 'index', intersect: false } },
      scales:  { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  })
}

// ── QR ───────────────────────────────────────────────────────
async function renderQR() {
  const canvas = $('qr-canvas')
  if (!canvas) return
  $('survey-url-display').textContent = SURVEY_URL
  await QRCode.toCanvas(canvas, SURVEY_URL, {
    width: 180, margin: 1,
    color: { dark: '#003087', light: '#ffffff' },
  })
  $('download-qr').addEventListener('click', () => {
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png'); a.download = 'survey-qr.png'; a.click()
  })
  $('copy-url').addEventListener('click', async () => {
    await navigator.clipboard.writeText(SURVEY_URL)
    const btn = $('copy-url')
    btn.textContent = '✅ 복사됨'
    setTimeout(() => { btn.textContent = '🔗 URL 복사' }, 2000)
  })
}

// ── 문항 분석 ─────────────────────────────────────────────────
const QUESTIONS = [
  { id: 'advanced_course', label: '심화 과정 참석 희망',                    type: 'choice' },
  { id: 'problem',         label: '해결하고 싶은 문제',                      type: 'text'   },
  { id: 'output',          label: '만들고 싶은 서비스 아웃풋',               type: 'text'   },
  { id: 'value',           label: '해결하고 싶은 문제 / Value',              type: 'text'   },
  { id: 'scenario',        label: '구현하고 싶은 시나리오 / 기능',           type: 'text'   },
]

function renderAnalytics() {
  const container = $('analytics-container')
  if (!container) return
  if (allResponses.length === 0) {
    container.innerHTML = '<p class="no-data">아직 응답이 없습니다.</p>'
    return
  }
  container.innerHTML = QUESTIONS.map((q, i) => buildAnalyticsCard(q, i)).join('')
}

function buildAnalyticsCard(q, idx) {
  let body = ''
  if (q.type === 'choice' || q.type === 'multi') {
    const freq = {}
    allResponses.forEach(r => {
      const val  = r[q.id]
      const vals = Array.isArray(val) ? val : val ? [String(val)] : []
      vals.forEach(v => { freq[v] = (freq[v] ?? 0) + 1 })
    })
    const total = Object.values(freq).reduce((a, b) => a + b, 0)
    body = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([label, count]) => {
      const pct = total ? Math.round((count / total) * 100) : 0
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.88rem">
          <span>${escHtml(label)}</span><span style="color:var(--text-muted)">${count}명 (${pct}%)</span>
        </div>
        <div style="background:var(--brand-blue-light);border-radius:4px;height:8px">
          <div style="background:var(--brand-blue);width:${pct}%;height:100%;border-radius:4px"></div>
        </div>
      </div>`
    }).join('')
  } else if (q.type === 'rating') {
    const vals = allResponses.map(r => Number(r[q.id])).filter(v => !isNaN(v) && v > 0)
    const avg  = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '—'
    const freq = {}
    vals.forEach(v => { freq[v] = (freq[v] ?? 0) + 1 })
    const bars = [1, 2, 3, 4, 5].map(v => {
      const count = freq[v] ?? 0
      const pct   = vals.length ? Math.round((count / vals.length) * 100) : 0
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.88rem">
        <span style="min-width:16px;color:var(--text-muted)">${v}</span>
        <div style="flex:1;background:var(--brand-blue-light);border-radius:4px;height:8px">
          <div style="background:var(--brand-blue);width:${pct}%;height:100%;border-radius:4px"></div>
        </div>
        <span style="color:var(--text-muted);min-width:36px;text-align:right">${count}명</span>
      </div>`
    }).join('')
    body = `<p class="rating-avg">평균 <strong>${avg}</strong> / 5</p>${bars}`
  } else if (q.type === 'text') {
    const texts = allResponses.map(r => String(r[q.id] ?? '').trim()).filter(Boolean)
    body = texts.length === 0
      ? '<p class="no-data">응답 없음</p>'
      : `<div class="text-responses">${texts.map((t, i) =>
          `<div class="text-response-item">
            <div class="text-response-num">${i + 1}</div>
            <div class="text-response-content">${escHtml(t)}</div>
          </div>`).join('')}</div>`
  }
  const respCount = allResponses.filter(r => {
    const v = r[q.id]
    return Array.isArray(v) ? v.length > 0 : !!v
  }).length
  return `<div class="analytics-card">
    <div class="analytics-card-header">
      <div class="q-meta">
        <span class="q-badge">Q${idx + 1}</span>
        <span class="analytics-q-title">${q.label}</span>
      </div>
      <span class="q-response-rate">응답 ${respCount} / ${allResponses.length}명</span>
    </div>
    <div>${body}</div>
  </div>`
}

// ── 응답 테이블 ───────────────────────────────────────────────
function renderResponsesTable() { currentPage = 1; applyFilter() }

function applyFilter() {
  const search = ($('response-search')?.value ?? '').toLowerCase()
  filteredResponses = allResponses.filter(r => {
    if (!search) return true
    return [r.name, r.company, r.team, r.position, r.email].join(' ').toLowerCase().includes(search)
  })
  currentPage = 1
  renderTable()
}

function renderTable() {
  const container = $('responses-table-container')
  const countEl   = $('response-count')
  const pagEl     = $('pagination')
  if (!container || !countEl || !pagEl) return
  const total      = filteredResponses.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const start      = (currentPage - 1) * PAGE_SIZE
  const page       = filteredResponses.slice(start, start + PAGE_SIZE)
  countEl.textContent = `${total}개 응답`
  if (total === 0) {
    container.innerHTML = '<p class="no-data">검색 결과가 없습니다.</p>'
    pagEl.innerHTML = ''
    return
  }
  const rows = page.map((r, i) => `<tr>
    <td class="nowrap">${start + i + 1}</td>
    <td class="nowrap">${escHtml(r.name ?? '—')}</td>
    <td class="nowrap">${escHtml(r.company ?? '—')}</td>
    <td class="nowrap">${escHtml(r.team ?? '—')}</td>
    <td class="nowrap">${escHtml(r.position ?? '—')}</td>
    <td class="nowrap">${escHtml(r.email ?? '—')}</td>
    <td class="nowrap">${escHtml(r.advanced_course === 'yes' ? '참석 희망' : r.advanced_course === 'no' ? '불참' : '—')}</td>
    <td class="nowrap">${r.submittedAt ? r.submittedAt.toDate().toLocaleString('ko-KR') : '—'}</td>
  </tr>`).join('')
  container.innerHTML = `<div class="table-wrapper">
    <table class="responses-table">
      <thead><tr>
        <th>#</th><th>성함</th><th>소속 회사</th><th>팀명</th><th>직급/직책</th><th>이메일</th>
        <th>심화과정</th><th>제출 시각</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`
  pagEl.innerHTML = Array.from({ length: totalPages }, (_, i) => i + 1)
    .map(p => `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`)
    .join('')
  pagEl.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => { currentPage = Number(btn.dataset.page); renderTable() })
  })
}

// ── 내보내기 ──────────────────────────────────────────────────
function setupExport() {
  $('export-csv').addEventListener('click', () => {
    const headers = ['번호', '성함', '소속 회사', '팀명', '직급/직책', '이메일',
      '해결하고 싶은 문제', '만들고 싶은 서비스 아웃풋', '해결하고 싶은 Value',
      '서비스 시나리오/기능', '심화과정 참석', '개인정보동의', '제출 시각']
    const rows = allResponses.map((r, i) => [
      i + 1, r.name ?? '', r.company ?? '', r.team ?? '', r.position ?? '', r.email ?? '',
      r.problem ?? '', r.output ?? '', r.value ?? '', r.scenario ?? '',
      r.advanced_course === 'yes' ? '참석 희망' : r.advanced_course === 'no' ? '불참' : '',
      (r.privacy_consent ?? []).join(' / '),
      r.submittedAt ? r.submittedAt.toDate().toLocaleString('ko-KR') : '',
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    download('\uFEFF' + csv, 'responses.csv', 'text/csv;charset=utf-8')
  })

  $('export-json').addEventListener('click', () => {
    const data = allResponses.map(r => ({ ...r, submittedAt: r.submittedAt?.toDate().toISOString() }))
    download(JSON.stringify(data, null, 2), 'responses.json', 'application/json')
  })

  $('export-summary').addEventListener('click', async () => {
    const total = allResponses.length
    const lines = [`AI 기반 솔루션 기획 기본 과정(3/26) 신청 현황 요약 (총 ${total}명)\n`]
    lines.push('== 심화 과정(4/13~14) 참석 희망 ==')
    const yesCount = allResponses.filter(r => r.advanced_course === 'yes').length
    const noCount  = allResponses.filter(r => r.advanced_course === 'no').length
    lines.push(`  참석 희망: ${yesCount}명`)
    lines.push(`  불참: ${noCount}명`)
    lines.push(`  미응답: ${total - yesCount - noCount}명`)
    await navigator.clipboard.writeText(lines.join('\n'))
    const btn = $('export-summary')
    btn.textContent = '✅ 복사됨'
    setTimeout(() => { btn.textContent = '요약 복사' }, 2000)
  })
}

// ── 초기화 ────────────────────────────────────────────────────
async function initAdmin() {
  setupTabs()
  $('logout-btn').addEventListener('click', () => signOut(auth))
  setupExport()
  $('response-search').addEventListener('input', applyFilter)
  await renderQR()
  subscribeResponses()
}

setupLogin()
setupAuthState()
