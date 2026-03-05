import { db } from './firebase'
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import {
  Chart,
  LineController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js'
import QRCode from 'qrcode'

Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

// ── 타입 ──────────────────────────────────────────────────────
interface Response {
  id:          string
  name?:       string
  department?: string
  position?:   string
  email?:      string
  ai_experience?: string
  expectation?: string[]
  ai_tool_level?: string
  requests?:   string
  submittedAt?: Timestamp
}

// ── 상수 ──────────────────────────────────────────────────────
const ADMIN_PIN   = import.meta.env.VITE_ADMIN_PIN ?? '1234'
const SURVEY_URL  = `${location.origin}/survey.html`
const PAGE_SIZE   = 20

// ── 상태 ──────────────────────────────────────────────────────
let allResponses: Response[] = []
let filteredResponses: Response[] = []
let currentPage = 1
let timelineChart: Chart | null = null

// ── DOM 헬퍼 ─────────────────────────────────────────────────
const $ = <T extends Element = Element>(id: string) => document.getElementById(id) as T | null

// ── 로그인 ────────────────────────────────────────────────────
function setupLogin() {
  const form  = $<HTMLFormElement>('login-form')
  const input = $<HTMLInputElement>('pin-input')
  const errEl = $('login-error')

  form?.addEventListener('submit', e => {
    e.preventDefault()
    if (input?.value === ADMIN_PIN) {
      $('login-screen')!.hidden = true
      $('admin-app')!.hidden    = false
      initAdmin()
    } else {
      if (errEl) errEl.hidden = false
      if (input) { input.value = ''; input.focus() }
    }
  })
}

// ── 탭 전환 ───────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll<HTMLButtonElement>('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')

      const tab = btn.dataset.tab!
      document.querySelectorAll('.tab-content').forEach(s => {
        ;(s as HTMLElement).hidden = s.id !== `tab-${tab}`
      })

      if (tab === 'analytics') renderAnalytics()
      if (tab === 'responses') renderResponsesTable()
    })
  })

  // 모바일 메뉴
  $('menu-toggle')?.addEventListener('click', () => {
    $('sidebar')?.classList.toggle('open')
  })
}

// ── Firestore 실시간 구독 ─────────────────────────────────────
function subscribeResponses() {
  const q = query(collection(db, 'responses'), orderBy('submittedAt', 'desc'))

  onSnapshot(q, snapshot => {
    allResponses = snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Omit<Response, 'id'>),
    }))
    filteredResponses = [...allResponses]
    updateAll()
  })
}

// ── 전체 업데이트 ─────────────────────────────────────────────
function updateAll() {
  updateHeaderStats()
  updateOverviewStats()
  updateTimeline()
}

// ── 헤더 통계 ─────────────────────────────────────────────────
function updateHeaderStats() {
  const total = allResponses.length
  const today = countToday(allResponses)
  const last  = allResponses[0]?.submittedAt

  const headerTotal = $('header-total')
  const headerToday = $('header-today')
  const headerLast  = $('header-last')
  const headerLastBadge = $('header-last-badge')

  if (headerTotal) headerTotal.textContent = String(total)
  if (headerToday) headerToday.textContent = String(today)
  if (last && headerLast) {
    headerLast.textContent = timeAgo(last.toDate())
    if (headerLastBadge) headerLastBadge.style.display = ''
  }
}

// ── 개요 통계 카드 ────────────────────────────────────────────
function updateOverviewStats() {
  const total = allResponses.length
  const today = countToday(allResponses)
  const last  = allResponses[0]?.submittedAt

  const statTotal      = $('stat-total')
  const statToday      = $('stat-today')
  const statTodayDate  = $('stat-today-date')
  const statCompletion = $('stat-completion')
  const statLast       = $('stat-last')

  if (statTotal)      statTotal.textContent      = String(total)
  if (statToday)      statToday.textContent      = String(today)
  if (statTodayDate)  statTodayDate.textContent  = new Date().toLocaleDateString('ko-KR')
  if (statCompletion) {
    const filled = allResponses.filter(r => r.name && r.email && r.ai_experience).length
    statCompletion.textContent = total ? `${Math.round((filled / total) * 100)}%` : '—'
  }
  if (statLast) statLast.textContent = last ? timeAgo(last.toDate()) : '—'
}

// ── 타임라인 차트 ─────────────────────────────────────────────
function updateTimeline() {
  const canvas = $<HTMLCanvasElement>('timeline-chart')
  if (!canvas) return

  const days  = 14
  const labels: string[] = []
  const counts: number[] = []
  const now   = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
    labels.push(key)

    const count = allResponses.filter(r => {
      if (!r.submittedAt) return false
      const rd = r.submittedAt.toDate()
      return (
        rd.getFullYear() === d.getFullYear() &&
        rd.getMonth()    === d.getMonth()    &&
        rd.getDate()     === d.getDate()
      )
    }).length
    counts.push(count)
  }

  if (timelineChart) timelineChart.destroy()
  timelineChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label:           '응답 수',
          data:            counts,
          borderColor:     '#003087',
          backgroundColor: 'rgba(0,48,135,0.1)',
          fill:            true,
          tension:         0.3,
          pointRadius:     4,
        },
      ],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: { tooltip: { mode: 'index', intersect: false } },
      scales:  { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  })
}

// ── QR 코드 ───────────────────────────────────────────────────
async function renderQR() {
  const canvas = $<HTMLCanvasElement>('qr-canvas')
  const urlBox = $('survey-url-display')

  if (urlBox) urlBox.textContent = SURVEY_URL
  if (canvas) {
    await QRCode.toCanvas(canvas, SURVEY_URL, {
      width:         180,
      margin:        1,
      color: { dark: '#003087', light: '#ffffff' },
    })
  }

  $('download-qr')?.addEventListener('click', () => {
    if (!canvas) return
    const a = document.createElement('a')
    a.href     = canvas.toDataURL('image/png')
    a.download = 'survey-qr.png'
    a.click()
  })

  $('copy-url')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(SURVEY_URL)
    const btn = $('copy-url')
    if (btn) { btn.textContent = '✅ 복사됨'; setTimeout(() => { btn.textContent = '🔗 URL 복사' }, 2000) }
  })
}

// ── 문항 분석 ─────────────────────────────────────────────────
function renderAnalytics() {
  const container = $('analytics-container')
  if (!container || allResponses.length === 0) {
    if (container) container.innerHTML = '<p class="no-data">아직 응답이 없습니다.</p>'
    return
  }

  const questions = [
    { id: 'position',      label: '직급',             type: 'choice' },
    { id: 'ai_experience', label: 'AI 업무 경험',     type: 'choice' },
    { id: 'expectation',   label: '기대하는 것 (복수)', type: 'multi'  },
    { id: 'ai_tool_level', label: 'AI 도구 활용 수준', type: 'rating' },
    { id: 'requests',      label: '기타 요청 사항',    type: 'text'   },
  ]

  container.innerHTML = questions
    .map((q, i) => buildAnalyticsCard(q, i))
    .join('')
}

function buildAnalyticsCard(
  q: { id: string; label: string; type: string },
  idx: number
): string {
  const responses = allResponses
  const num = idx + 1

  let body = ''

  if (q.type === 'choice' || q.type === 'multi') {
    const freq: Record<string, number> = {}
    responses.forEach(r => {
      const val = (r as Record<string, unknown>)[q.id]
      const vals = Array.isArray(val) ? val : val ? [String(val)] : []
      vals.forEach(v => { freq[v] = (freq[v] ?? 0) + 1 })
    })
    const total  = Object.values(freq).reduce((a, b) => a + b, 0)
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1])

    body = sorted
      .map(([label, count]) => {
        const pct = total ? Math.round((count / total) * 100) : 0
        return `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.88rem">
              <span>${label}</span>
              <span style="color:var(--muted)">${count}명 (${pct}%)</span>
            </div>
            <div style="background:#e8efff;border-radius:4px;height:8px">
              <div style="background:var(--blue);width:${pct}%;height:100%;border-radius:4px"></div>
            </div>
          </div>`
      })
      .join('')

  } else if (q.type === 'rating') {
    const vals = responses
      .map(r => Number((r as Record<string, unknown>)[q.id]))
      .filter(v => !isNaN(v) && v > 0)
    const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '—'

    const freq: Record<number, number> = {}
    vals.forEach(v => { freq[v] = (freq[v] ?? 0) + 1 })
    const barHtml = [1, 2, 3, 4, 5]
      .map(v => {
        const count = freq[v] ?? 0
        const pct   = vals.length ? Math.round((count / vals.length) * 100) : 0
        return `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:0.88rem">
            <span style="min-width:16px;color:var(--muted)">${v}</span>
            <div style="flex:1;background:#e8efff;border-radius:4px;height:8px">
              <div style="background:var(--blue);width:${pct}%;height:100%;border-radius:4px"></div>
            </div>
            <span style="color:var(--muted);min-width:36px;text-align:right">${count}명</span>
          </div>`
      })
      .join('')

    body = `<p class="rating-avg">평균 <strong>${avg}</strong> / 5</p>${barHtml}`

  } else if (q.type === 'text') {
    const texts = responses
      .map(r => String((r as Record<string, unknown>)[q.id] ?? '').trim())
      .filter(Boolean)
    if (texts.length === 0) {
      body = '<p class="no-data">응답 없음</p>'
    } else {
      body = `<div class="text-responses">
        ${texts
          .map(
            (t, i) => `
          <div class="text-response-item">
            <div class="text-response-num">${i + 1}</div>
            <div class="text-response-content">${escHtml(t)}</div>
          </div>`
          )
          .join('')}
      </div>`
    }
  }

  const respCount = responses.filter(r => {
    const val = (r as Record<string, unknown>)[q.id]
    return Array.isArray(val) ? val.length > 0 : !!val
  }).length

  return `
    <div class="analytics-card">
      <div class="analytics-card-header">
        <div class="q-meta">
          <span class="q-badge">Q${num}</span>
          <span class="analytics-q-title">${q.label}</span>
        </div>
        <span class="q-response-rate">응답 ${respCount} / ${responses.length}명</span>
      </div>
      <div class="analytics-chart-area">${body}</div>
    </div>`
}

// ── 응답 테이블 ───────────────────────────────────────────────
function renderResponsesTable() {
  currentPage = 1
  applyFilter()
}

function applyFilter() {
  const search = ($<HTMLInputElement>('response-search')?.value ?? '').toLowerCase()
  filteredResponses = allResponses.filter(r => {
    const text = [r.name, r.department, r.position, r.email, r.requests].join(' ').toLowerCase()
    return !search || text.includes(search)
  })
  currentPage = 1
  renderTable()
}

function renderTable() {
  const container = $('responses-table-container')
  const countEl   = $('response-count')
  const pagEl     = $('pagination')
  if (!container) return

  const total      = filteredResponses.length
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const start      = (currentPage - 1) * PAGE_SIZE
  const page       = filteredResponses.slice(start, start + PAGE_SIZE)

  if (countEl) countEl.textContent = `${total}개 응답`

  if (total === 0) {
    container.innerHTML = '<p class="no-data">검색 결과가 없습니다.</p>'
    if (pagEl) pagEl.innerHTML = ''
    return
  }

  const header = `
    <tr>
      <th>#</th>
      <th>이름</th>
      <th>부서/팀</th>
      <th>직급</th>
      <th>이메일</th>
      <th>AI 경험</th>
      <th>AI 도구 수준</th>
      <th>제출 시각</th>
    </tr>`

  const rows = page
    .map(
      (r, i) => `
      <tr>
        <td class="nowrap">${start + i + 1}</td>
        <td class="nowrap">${escHtml(r.name ?? '—')}</td>
        <td class="nowrap">${escHtml(r.department ?? '—')}</td>
        <td class="nowrap">${escHtml(r.position ?? '—')}</td>
        <td class="nowrap">${escHtml(r.email ?? '—')}</td>
        <td>${escHtml(r.ai_experience ?? '—')}</td>
        <td class="nowrap">${escHtml(r.ai_tool_level ?? '—')}</td>
        <td class="nowrap">${r.submittedAt ? r.submittedAt.toDate().toLocaleString('ko-KR') : '—'}</td>
      </tr>`
    )
    .join('')

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="responses-table">
        <thead>${header}</thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`

  // 페이지네이션
  if (pagEl) {
    pagEl.innerHTML = Array.from({ length: totalPages }, (_, i) => i + 1)
      .map(
        p =>
          `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`
      )
      .join('')
    pagEl.querySelectorAll<HTMLButtonElement>('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = Number(btn.dataset.page)
        renderTable()
      })
    })
  }
}

// ── 내보내기 ──────────────────────────────────────────────────
function setupExport() {
  $('export-csv')?.addEventListener('click', exportCSV)
  $('export-json')?.addEventListener('click', exportJSON)
  $('export-summary')?.addEventListener('click', exportSummary)
}

function exportCSV() {
  const headers = ['번호', '이름', '부서/팀', '직급', '이메일', 'AI 경험', '기대', 'AI 도구 수준', '요청 사항', '제출 시각']
  const rows    = allResponses.map((r, i) => [
    i + 1,
    r.name        ?? '',
    r.department  ?? '',
    r.position    ?? '',
    r.email       ?? '',
    r.ai_experience ?? '',
    (r.expectation ?? []).join(' / '),
    r.ai_tool_level ?? '',
    r.requests    ?? '',
    r.submittedAt ? r.submittedAt.toDate().toLocaleString('ko-KR') : '',
  ])

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  download('\uFEFF' + csv, 'responses.csv', 'text/csv;charset=utf-8')
}

function exportJSON() {
  const data = allResponses.map(r => ({
    ...r,
    submittedAt: r.submittedAt?.toDate().toISOString(),
  }))
  download(JSON.stringify(data, null, 2), 'responses.json', 'application/json')
}

async function exportSummary() {
  const total = allResponses.length
  const lines = [`HMG Learning Session 사전 설문 요약 (총 ${total}명)\n`]

  lines.push('== AI 경험 ==')
  const expFreq: Record<string, number> = {}
  allResponses.forEach(r => { if (r.ai_experience) expFreq[r.ai_experience] = (expFreq[r.ai_experience] ?? 0) + 1 })
  Object.entries(expFreq).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => lines.push(`  ${k}: ${v}명`))

  lines.push('\n== AI 도구 수준 ==')
  const levels = allResponses.map(r => Number(r.ai_tool_level)).filter(v => !isNaN(v) && v > 0)
  const avg    = levels.length ? (levels.reduce((a, b) => a + b, 0) / levels.length).toFixed(2) : '—'
  lines.push(`  평균: ${avg} / 5`)

  await navigator.clipboard.writeText(lines.join('\n'))
  const btn = $('export-summary')
  if (btn) { btn.textContent = '✅ 복사됨'; setTimeout(() => { btn.textContent = '요약 복사' }, 2000) }
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── 로그아웃 ──────────────────────────────────────────────────
function setupLogout() {
  $('logout-btn')?.addEventListener('click', () => location.reload())
}

// ── 유틸 ─────────────────────────────────────────────────────
function countToday(responses: Response[]) {
  const today = new Date()
  return responses.filter(r => {
    if (!r.submittedAt) return false
    const d = r.submittedAt.toDate()
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth()    === today.getMonth()    &&
      d.getDate()     === today.getDate()
    )
  }).length
}

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60)   return `${diff}초 전`
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  return `${Math.floor(diff / 86400)}일 전`
}

function escHtml(str: string) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── 어드민 초기화 ─────────────────────────────────────────────
async function initAdmin() {
  setupTabs()
  setupLogout()
  setupExport()
  await renderQR()
  subscribeResponses()

  $('response-search')?.addEventListener('input', applyFilter)
}

// ── 엔트리 ───────────────────────────────────────────────────
setupLogin()
