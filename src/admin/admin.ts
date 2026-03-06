import { db, auth } from '../firebase'
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore'
import { Chart, LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'chart.js'
import QRCode from 'qrcode'

Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

// ── 상수 ─────────────────────────────────────────────────────
const SURVEY_URL = `${location.origin}/survey/`
const PAGE_SIZE  = 20

// ── 상태 ─────────────────────────────────────────────────────
interface Response {
  id:            string
  name?:         string
  department?:   string
  position?:     string
  email?:        string
  ai_experience?: string
  expectation?:  string[]
  ai_tool_level?: string
  requests?:     string
  submittedAt?:  Timestamp
  [key: string]: unknown
}

let allResponses:      Response[] = []
let filteredResponses: Response[] = []
let currentPage  = 1
let timelineChart: Chart | null = null
let unsubscribe: (() => void) | null = null

// ── DOM 헬퍼 ─────────────────────────────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null

// ── 유틸 ─────────────────────────────────────────────────────
function escHtml(str: unknown): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function countToday(responses: Response[]): number {
  const t = new Date()
  return responses.filter(r => {
    if (!r.submittedAt) return false
    const d = r.submittedAt.toDate()
    return d.getFullYear() === t.getFullYear()
        && d.getMonth()    === t.getMonth()
        && d.getDate()     === t.getDate()
  }).length
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60)    return `${s}초 전`
  if (s < 3600)  return `${Math.floor(s / 60)}분 전`
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`
  return `${Math.floor(s / 86400)}일 전`
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Firebase Auth 상태 감지 ───────────────────────────────────
function setupAuthState() {
  onAuthStateChanged(auth, user => {
    if (user) {
      $('login-screen')!.hidden = true
      $('admin-app')!.hidden    = false
      initAdmin()
    } else {
      $('login-screen')!.hidden = false
      $('admin-app')!.hidden    = true
      if (unsubscribe) { unsubscribe(); unsubscribe = null }
    }
  })
}

// ── 로그인 ───────────────────────────────────────────────────
function setupLogin() {
  $('login-form')?.addEventListener('submit', async e => {
    e.preventDefault()
    const email    = ($('email-input') as HTMLInputElement).value.trim()
    const password = ($('password-input') as HTMLInputElement).value
    const errEl    = $('login-error')
    const btn      = $<HTMLButtonElement>('login-btn')
    if (errEl) errEl.hidden = true
    if (btn) { btn.disabled = true; btn.textContent = '로그인 중...' }
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (errEl) {
        errEl.textContent = firebaseErrorMsg(code)
        errEl.hidden = false
      }
      ;($('password-input') as HTMLInputElement).value = ''
      $('password-input')?.focus()
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '로그인' }
    }
  })
}

function firebaseErrorMsg(code: string): string {
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

// ── 탭 전환 ──────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll<HTMLElement>('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      const tab = btn.dataset.tab
      document.querySelectorAll<HTMLElement>('.tab-content').forEach(s => {
        s.hidden = (s.id !== `tab-${tab}`)
      })
      if (tab === 'analytics') renderAnalytics()
      if (tab === 'responses') renderResponsesTable()
    })
  })
  $('menu-toggle')?.addEventListener('click', () => {
    $('sidebar')?.classList.toggle('open')
  })
}

// ── Firestore 실시간 구독 ─────────────────────────────────────
function subscribeResponses() {
  const q = query(collection(db, 'responses'), orderBy('submittedAt', 'desc'))
  unsubscribe = onSnapshot(q, snapshot => {
    allResponses      = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Response))
    filteredResponses = [...allResponses]
    updateHeaderStats()
    updateOverviewStats()
    updateTimeline()
  })
}

// ── 헤더 통계 ─────────────────────────────────────────────────
function updateHeaderStats() {
  const total = allResponses.length
  const today = countToday(allResponses)
  const last  = allResponses[0]?.submittedAt
  $('header-total')!.textContent = String(total)
  $('header-today')!.textContent = String(today)
  if (last) {
    $('header-last')!.textContent = timeAgo(last.toDate())
    const badge = $('header-last-badge')
    if (badge) badge.style.display = ''
  }
}

// ── 개요 통계 ─────────────────────────────────────────────────
function updateOverviewStats() {
  const total = allResponses.length
  const today = countToday(allResponses)
  const last  = allResponses[0]?.submittedAt
  $('stat-total')!.textContent      = String(total)
  $('stat-today')!.textContent      = String(today)
  $('stat-today-date')!.textContent = new Date().toLocaleDateString('ko-KR')
  const filled = allResponses.filter(r => r.name && r.email && r.ai_experience).length
  $('stat-completion')!.textContent = total ? `${Math.round((filled / total) * 100)}%` : '—'
  $('stat-last')!.textContent       = last ? timeAgo(last.toDate()) : '—'
}

// ── 타임라인 차트 ─────────────────────────────────────────────
function updateTimeline() {
  const canvas = $<HTMLCanvasElement>('timeline-chart')
  if (!canvas) return
  const days = 14, labels: string[] = [], counts: number[] = [], now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    labels.push(d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }))
    counts.push(allResponses.filter(r => {
      if (!r.submittedAt) return false
      const rd = r.submittedAt.toDate()
      return rd.getFullYear() === d.getFullYear()
          && rd.getMonth()    === d.getMonth()
          && rd.getDate()     === d.getDate()
    }).length)
  }
  if (timelineChart) timelineChart.destroy()
  timelineChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:           '응답 수',
        data:            counts,
        borderColor:     '#003087',
        backgroundColor: 'rgba(0,48,135,0.1)',
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

// ── QR 코드 ───────────────────────────────────────────────────
async function renderQR() {
  const canvas = $<HTMLCanvasElement>('qr-canvas')
  if (!canvas) return
  $('survey-url-display')!.textContent = SURVEY_URL
  await QRCode.toCanvas(canvas, SURVEY_URL, {
    width: 180, margin: 1,
    color: { dark: '#003087', light: '#ffffff' },
  })
  $('download-qr')?.addEventListener('click', () => {
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png'); a.download = 'survey-qr.png'; a.click()
  })
  $('copy-url')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(SURVEY_URL)
    const btn = $('copy-url')!
    btn.textContent = '✅ 복사됨'
    setTimeout(() => { btn.textContent = '🔗 URL 복사' }, 2000)
  })
}

// ── 문항 분석 ─────────────────────────────────────────────────
const QUESTIONS = [
  { id: 'position',      label: '직급',               type: 'choice' },
  { id: 'ai_experience', label: 'AI 업무 경험',        type: 'choice' },
  { id: 'expectation',   label: '기대하는 것 (복수)',  type: 'multi'  },
  { id: 'ai_tool_level', label: 'AI 도구 활용 수준',  type: 'rating' },
  { id: 'requests',      label: '기타 요청 사항',      type: 'text'   },
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

function buildAnalyticsCard(q: { id: string; label: string; type: string }, idx: number): string {
  let body = ''
  if (q.type === 'choice' || q.type === 'multi') {
    const freq: Record<string, number> = {}
    allResponses.forEach(r => {
      const val  = r[q.id]
      const vals = Array.isArray(val) ? val as string[] : val ? [String(val)] : []
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
    const freq: Record<number, number> = {}
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
  const search = (($('response-search') as HTMLInputElement)?.value ?? '').toLowerCase()
  filteredResponses = allResponses.filter(r => {
    if (!search) return true
    return [r.name, r.department, r.position, r.email, r.requests]
      .join(' ').toLowerCase().includes(search)
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
    <td class="nowrap">${escHtml(r.department ?? '—')}</td>
    <td class="nowrap">${escHtml(r.position ?? '—')}</td>
    <td class="nowrap">${escHtml(r.email ?? '—')}</td>
    <td>${escHtml(r.ai_experience ?? '—')}</td>
    <td class="nowrap">${escHtml(r.ai_tool_level ?? '—')}</td>
    <td class="nowrap">${r.submittedAt ? r.submittedAt.toDate().toLocaleString('ko-KR') : '—'}</td>
  </tr>`).join('')

  container.innerHTML = `<div class="table-wrapper">
    <table class="responses-table">
      <thead><tr>
        <th>#</th><th>이름</th><th>부서/팀</th><th>직급</th><th>이메일</th>
        <th>AI 경험</th><th>AI 도구 수준</th><th>제출 시각</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`

  pagEl.innerHTML = Array.from({ length: totalPages }, (_, i) => i + 1)
    .map(p => `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`)
    .join('')

  pagEl.querySelectorAll<HTMLButtonElement>('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = Number(btn.dataset.page)
      renderTable()
    })
  })
}

// ── 내보내기 ──────────────────────────────────────────────────
function setupExport() {
  $('export-csv')?.addEventListener('click', () => {
    const headers = ['번호', '이름', '부서/팀', '직급', '이메일', 'AI 경험', '기대', 'AI 도구 수준', '요청 사항', '제출 시각']
    const rows = allResponses.map((r, i) => [
      i + 1, r.name ?? '', r.department ?? '', r.position ?? '', r.email ?? '',
      r.ai_experience ?? '', (r.expectation ?? []).join(' / '), r.ai_tool_level ?? '', r.requests ?? '',
      r.submittedAt ? r.submittedAt.toDate().toLocaleString('ko-KR') : '',
    ])
    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    download('\uFEFF' + csv, 'responses.csv', 'text/csv;charset=utf-8')
  })

  $('export-json')?.addEventListener('click', () => {
    const data = allResponses.map(r => ({
      ...r, submittedAt: r.submittedAt?.toDate().toISOString(),
    }))
    download(JSON.stringify(data, null, 2), 'responses.json', 'application/json')
  })

  $('export-summary')?.addEventListener('click', async () => {
    const total = allResponses.length
    const lines = [`HMG Learning Session 사전 설문 요약 (총 ${total}명)\n`]

    lines.push('== AI 경험 ==')
    const expFreq: Record<string, number> = {}
    allResponses.forEach(r => {
      if (r.ai_experience) expFreq[r.ai_experience] = (expFreq[r.ai_experience] ?? 0) + 1
    })
    Object.entries(expFreq).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => lines.push(`  ${k}: ${v}명`))

    lines.push('\n== AI 도구 수준 ==')
    const levels = allResponses.map(r => Number(r.ai_tool_level)).filter(v => !isNaN(v) && v > 0)
    const avg    = levels.length ? (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(2) : '—'
    lines.push(`  평균: ${avg} / 5`)

    await navigator.clipboard.writeText(lines.join('\n'))
    const btn = $('export-summary')!
    btn.textContent = '✅ 복사됨'
    setTimeout(() => { btn.textContent = '요약 복사' }, 2000)
  })
}

// ── 로그아웃 ──────────────────────────────────────────────────
function setupLogout() {
  $('logout-btn')?.addEventListener('click', () => signOut(auth))
}

// ── 어드민 초기화 ─────────────────────────────────────────────
async function initAdmin() {
  setupTabs()
  setupLogout()
  setupExport()
  $('response-search')?.addEventListener('input', applyFilter)
  await renderQR()
  subscribeResponses()
}

// ── 엔트리 ───────────────────────────────────────────────────
setupLogin()
setupAuthState()
