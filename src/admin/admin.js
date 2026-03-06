import { db, auth } from '/src/firebase.js'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://esm.sh/firebase@12.10.0/auth'
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'https://esm.sh/firebase@12.10.0/firestore'
import { Chart, LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler } from 'https://esm.sh/chart.js@4.5.1'
import QRCode from 'https://esm.sh/qrcode@1.5.3'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler)

const SURVEY_URL = `${location.origin}/survey/`
const PAGE_SIZE  = 20

let allResponses      = []
let filteredResponses = []
let currentPage       = 1
let timelineChart     = null
let unsubscribe       = null
let currentModalId    = null

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
      if (tab === 'advanced')  renderAdvancedList()
      if (tab === 'report')    renderReport()
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
  const total       = allResponses.length
  const today       = countToday(allResponses)
  const last        = allResponses[0]?.submittedAt
  const advancedYes = allResponses.filter(r => r.advanced_course === 'yes').length
  $('stat-total').textContent        = String(total)
  $('stat-today').textContent        = String(today)
  $('stat-today-date').textContent   = new Date().toLocaleDateString('ko-KR')
  $('stat-advanced-yes').textContent = total ? `${advancedYes}명` : '—'
  $('stat-last').textContent         = last ? timeAgo(last.toDate()) : '—'
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
function renderAnalytics() {
  const container = $('analytics-container')
  if (!container) return
  if (allResponses.length === 0) {
    container.innerHTML = '<p class="no-data">아직 응답이 없습니다.</p>'
    return
  }

  const total = allResponses.length

  // 심화과정 참석 여부 카드
  const yesCount = allResponses.filter(r => r.advanced_course === 'yes').length
  const noCount  = allResponses.filter(r => r.advanced_course === 'no').length
  const yesPct   = Math.round(yesCount / total * 100)
  const noPct    = Math.round(noCount  / total * 100)
  const undecided = total - yesCount - noCount

  const advancedCard = `<div class="analytics-card">
    <div class="analytics-card-header">
      <div class="q-meta">
        <span class="q-badge">Q1</span>
        <span class="analytics-q-title">심화 과정(4/13~14) 참석 희망</span>
      </div>
      <span class="q-response-rate">응답 ${yesCount + noCount} / ${total}명</span>
    </div>
    <div class="advanced-split">
      <div class="advanced-side yes">
        <div class="advanced-big">${yesCount}</div>
        <div class="advanced-name">참석 희망</div>
        <div class="advanced-pct">${yesPct}%</div>
      </div>
      <div class="advanced-divider">vs</div>
      <div class="advanced-side no">
        <div class="advanced-big">${noCount}</div>
        <div class="advanced-name">불참</div>
        <div class="advanced-pct">${noPct}%</div>
      </div>
    </div>
    <div class="progress-track">
      <div class="progress-fill-yes" style="width:${yesPct}%"></div>
      <div class="progress-fill-no"  style="width:${noPct}%"></div>
    </div>
    ${undecided > 0 ? `<p style="font-size:0.8rem;color:var(--text-muted);margin-top:8px">미응답 ${undecided}명</p>` : ''}
  </div>`

  // 서술형 문항 카드
  const textQuestions = [
    { id: 'problem',  label: '해결하고 싶은 문제',              qNum: 'Q2' },
    { id: 'output',   label: '만들고 싶은 서비스 아웃풋',       qNum: 'Q3' },
    { id: 'value',    label: '해결하고 싶은 Value',             qNum: 'Q4' },
    { id: 'scenario', label: '구현하고 싶은 시나리오 / 기능',   qNum: 'Q5' },
  ]

  const textCards = textQuestions.map(q => {
    const items = allResponses
      .map(r => ({ name: r.name ?? '익명', team: r.team ?? '', text: String(r[q.id] ?? '').trim() }))
      .filter(i => i.text)
    const body = items.length === 0
      ? '<p class="no-data">응답 없음</p>'
      : `<div class="text-responses">${items.map((item, i) =>
          `<div class="text-response-item">
            <div class="text-response-num">${i + 1}</div>
            <div class="text-response-content">
              <div class="text-respondent">${escHtml(item.name)}${item.team ? ` · ${escHtml(item.team)}` : ''}</div>
              <div class="text-response-text">${escHtml(item.text)}</div>
            </div>
          </div>`).join('')}</div>`
    return `<div class="analytics-card">
      <div class="analytics-card-header">
        <div class="q-meta">
          <span class="q-badge">${q.qNum}</span>
          <span class="analytics-q-title">${q.label}</span>
        </div>
        <span class="q-response-rate">응답 ${items.length} / ${total}명</span>
      </div>
      <div>${body}</div>
    </div>`
  }).join('')

  container.innerHTML = advancedCard + textCards
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
  const rows = page.map((r, i) => `<tr class="response-row" data-id="${escHtml(r.id)}" style="cursor:pointer">
    <td class="nowrap">${start + i + 1}</td>
    <td class="nowrap">${escHtml(r.name ?? '—')}</td>
    <td class="nowrap">${escHtml(r.company ?? '—')}</td>
    <td class="nowrap">${escHtml(r.team ?? '—')}</td>
    <td class="nowrap">${escHtml(r.position ?? '—')}</td>
    <td class="nowrap">${escHtml(r.email ?? '—')}</td>
    <td class="nowrap">${escHtml(r.advanced_course === 'yes' ? '✅ 참석 희망' : r.advanced_course === 'no' ? '불참' : '—')}</td>
    <td class="nowrap">${r.submittedAt ? r.submittedAt.toDate().toLocaleString('ko-KR') : '—'}</td>
    <td class="nowrap"><button class="btn-row-delete" data-id="${escHtml(r.id)}">🗑</button></td>
  </tr>`).join('')
  container.innerHTML = `<div class="table-wrapper">
    <table class="responses-table">
      <thead><tr>
        <th>#</th><th>성함</th><th>소속 회사</th><th>팀명</th><th>직급/직책</th><th>이메일</th>
        <th>심화과정</th><th>제출 시각</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`
  container.querySelectorAll('.response-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('.btn-row-delete')) return
      const id = row.dataset.id
      const r  = allResponses.find(x => x.id === id)
      if (r) openModal(r)
    })
  })
  container.querySelectorAll('.btn-row-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      deleteResponse(btn.dataset.id)
    })
  })
  pagEl.innerHTML = Array.from({ length: totalPages }, (_, i) => i + 1)
    .map(p => `<button class="page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`)
    .join('')
  pagEl.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => { currentPage = Number(btn.dataset.page); renderTable() })
  })
}

// ── 상세 모달 ─────────────────────────────────────────────────
function openModal(r) {
  currentModalId = r.id
  const advanced = r.advanced_course === 'yes' ? '✅ 참석 희망' : r.advanced_course === 'no' ? '불참' : '—'
  const consent  = (r.privacy_consent ?? []).join(', ') || '—'
  const time     = r.submittedAt ? r.submittedAt.toDate().toLocaleString('ko-KR') : '—'

  function field(label, value) {
    return `<div class="modal-field">
      <div class="modal-field-label">${label}</div>
      <div class="modal-field-value">${escHtml(String(value || '—'))}</div>
    </div>`
  }
  function textarea(label, value) {
    return `<div class="modal-field">
      <div class="modal-field-label">${label}</div>
      <div class="modal-field-value modal-field-long">${escHtml(String(value || '—'))}</div>
    </div>`
  }

  $('modal-body').innerHTML = `
    <div class="modal-section-title">기본 정보</div>
    <div class="modal-fields-grid">
      ${field('성함', r.name)}
      ${field('소속 회사', r.company)}
      ${field('팀명', r.team)}
      ${field('직급/직책', r.position)}
      ${field('이메일', r.email)}
    </div>
    <div class="modal-section-title">과제 내용</div>
    ${textarea('해결하고 싶은 문제', r.problem)}
    ${textarea('만들고 싶은 서비스 아웃풋', r.output)}
    ${textarea('해결하고 싶은 Value', r.value)}
    ${textarea('서비스 시나리오 / 기능', r.scenario)}
    <div class="modal-section-title">기타</div>
    <div class="modal-fields-grid">
      ${field('심화과정 참석', advanced)}
      ${field('개인정보 동의', consent)}
      ${field('제출 시각', time)}
    </div>`
  $('detail-modal').hidden = false
}

function closeModal() {
  $('detail-modal').hidden = true
  currentModalId = null
}

async function deleteResponse(id) {
  if (!confirm('이 응답을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return
  try {
    await deleteDoc(doc(db, 'responses', id))
    closeModal()
  } catch (err) {
    console.error(err)
    alert('삭제 중 오류가 발생했습니다.')
  }
}

function setupModal() {
  $('modal-close').addEventListener('click', closeModal)
  $('detail-modal').addEventListener('click', e => {
    if (e.target === $('detail-modal')) closeModal()
  })
  $('modal-delete').addEventListener('click', () => {
    if (currentModalId) deleteResponse(currentModalId)
  })
}

// ── 심화과정 참석자 명단 ──────────────────────────────────────
function renderAdvancedList() {
  const container = $('advanced-table-container')
  const countEl   = $('advanced-count')
  if (!container || !countEl) return
  const list = allResponses.filter(r => r.advanced_course === 'yes')
  countEl.textContent = `${list.length}명`
  if (list.length === 0) {
    container.innerHTML = '<p class="no-data">심화과정 참석 희망자가 없습니다.</p>'
    return
  }
  const rows = list.map((r, i) => `<tr>
    <td class="nowrap">${i + 1}</td>
    <td class="nowrap">${escHtml(r.name ?? '—')}</td>
    <td class="nowrap">${escHtml(r.company ?? '—')}</td>
    <td class="nowrap">${escHtml(r.team ?? '—')}</td>
    <td class="nowrap">${escHtml(r.position ?? '—')}</td>
    <td class="nowrap">${escHtml(r.email ?? '—')}</td>
    <td class="nowrap">${r.submittedAt ? r.submittedAt.toDate().toLocaleString('ko-KR') : '—'}</td>
  </tr>`).join('')
  container.innerHTML = `<div class="table-wrapper">
    <table class="responses-table">
      <thead><tr>
        <th>#</th><th>성함</th><th>소속 회사</th><th>팀명</th><th>직급/직책</th><th>이메일</th><th>제출 시각</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`
}

// ── 심화과정 엑셀 내보내기 ────────────────────────────────────
function exportAdvancedExcel() {
  const list = allResponses.filter(r => r.advanced_course === 'yes')
  if (list.length === 0) { alert('심화과정 참석 희망자가 없습니다.'); return }

  const headers = ['번호', '성함', '소속 회사', '팀명', '직급/직책', '이메일', '제출 시각']
  const rows = list.map((r, i) => [
    i + 1,
    r.name    ?? '',
    r.company ?? '',
    r.team    ?? '',
    r.position ?? '',
    r.email   ?? '',
    r.submittedAt ? r.submittedAt.toDate().toLocaleString('ko-KR') : '',
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [4, 10, 14, 14, 12, 22, 18].map(w => ({ wch: w }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '심화과정 참석 희망자')
  XLSX.writeFile(wb, `심화과정_참석자명단_${new Date().toLocaleDateString('ko-KR').replace(/\./g, '').replace(/ /g, '')}.xlsx`)
}

// ── 보고서 만들기 ─────────────────────────────────────────────
function renderReport() {
  const container = $('report-content')
  if (!container) return

  if (allResponses.length === 0) {
    container.innerHTML = '<p class="no-data">아직 응답이 없습니다.</p>'
    return
  }

  const total        = allResponses.length
  const advancedYes  = allResponses.filter(r => r.advanced_course === 'yes').length
  const advancedNo   = allResponses.filter(r => r.advanced_course === 'no').length
  const undecided    = total - advancedYes - advancedNo
  const yesPct       = total ? Math.round(advancedYes / total * 100) : 0
  const noPct        = total ? Math.round(advancedNo  / total * 100) : 0
  const today        = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  const earliest     = allResponses.at(-1)?.submittedAt?.toDate().toLocaleDateString('ko-KR') ?? '—'
  const latest       = allResponses[0]?.submittedAt?.toDate().toLocaleDateString('ko-KR') ?? '—'

  // 소속사별 집계
  const companyCounts = {}
  allResponses.forEach(r => {
    const c = r.company?.trim() || '미입력'
    companyCounts[c] = (companyCounts[c] ?? 0) + 1
  })
  const companyRows = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n], i) => `<tr>
      <td>${i + 1}</td>
      <td>${escHtml(c)}</td>
      <td>${n}명 (${Math.round(n / total * 100)}%)</td>
    </tr>`).join('')

  // 심화과정 참석자 명단
  const advancedList = allResponses.filter(r => r.advanced_course === 'yes')
  const advancedRows = advancedList.map((r, i) => `<tr>
    <td>${i + 1}</td>
    <td>${escHtml(r.name ?? '—')}</td>
    <td>${escHtml(r.company ?? '—')}</td>
    <td>${escHtml(r.team ?? '—')}</td>
    <td>${escHtml(r.position ?? '—')}</td>
    <td>${escHtml(r.email ?? '—')}</td>
  </tr>`).join('')

  // 서술형 응답 섹션
  const textQuestions = [
    { id: 'problem',  label: 'Q2. 해결하고 싶은 문제' },
    { id: 'output',   label: 'Q3. 만들고 싶은 서비스 아웃풋' },
    { id: 'value',    label: 'Q4. 해결하고 싶은 Value' },
    { id: 'scenario', label: 'Q5. 구현하고 싶은 시나리오 / 기능' },
  ]

  const textSections = textQuestions.map(q => {
    const items = allResponses.filter(r => String(r[q.id] ?? '').trim())
    const answered = items.length
    const itemsHtml = items.map(r => `
      <div class="rpt-response-item">
        <div class="rpt-response-meta">${escHtml(r.name ?? '익명')}${r.company ? ` · ${escHtml(r.company)}` : ''}${r.team ? ` · ${escHtml(r.team)}` : ''}</div>
        <div class="rpt-response-text">${escHtml(String(r[q.id] ?? '').trim())}</div>
      </div>`).join('')
    return `
      <div class="rpt-section">
        <div class="rpt-section-title">${q.label} <span style="font-weight:400;font-size:0.82rem;color:#718096">(응답 ${answered}/${total}명)</span></div>
        ${answered === 0 ? '<p style="color:#718096;font-size:0.85rem">응답 없음</p>' : itemsHtml}
      </div>`
  }).join('')

  container.innerHTML = `
    <!-- 커버 -->
    <div class="rpt-cover">
      <div class="rpt-cover-tag">SURVEY REPORT</div>
      <h1>HMG HRD Hackathon 2026<br>사전설문 결과 보고서</h1>
      <div class="rpt-cover-meta">
        <span>보고서 생성일: ${today}</span>
        <span>응답 기간: ${earliest} ~ ${latest}</span>
        <span>총 응답: ${total}명</span>
      </div>
    </div>

    <!-- 통계 요약 -->
    <div class="rpt-section">
      <div class="rpt-section-title">01 응답 현황 요약</div>
      <div class="rpt-stats-row">
        <div class="rpt-stat">
          <div class="rpt-stat-val">${total}</div>
          <div class="rpt-stat-label">총 응답</div>
        </div>
        <div class="rpt-stat">
          <div class="rpt-stat-val" style="color:#16a34a">${advancedYes}</div>
          <div class="rpt-stat-label">심화 참석 희망</div>
        </div>
        <div class="rpt-stat">
          <div class="rpt-stat-val" style="color:#6b7280">${advancedNo}</div>
          <div class="rpt-stat-label">심화 불참</div>
        </div>
        <div class="rpt-stat">
          <div class="rpt-stat-val" style="color:#f59e0b">${undecided}</div>
          <div class="rpt-stat-label">미응답</div>
        </div>
      </div>
    </div>

    <!-- 심화과정 참석 현황 -->
    <div class="rpt-section">
      <div class="rpt-section-title">02 심화과정(4/13~14) 참석 의향</div>
      <div class="rpt-bar-row">
        <div class="rpt-bar-label">참석 희망</div>
        <div class="rpt-bar-track">
          <div class="rpt-bar-fill" style="width:${yesPct}%;background:#16a34a"></div>
        </div>
        <div class="rpt-bar-pct">${advancedYes}명 (${yesPct}%)</div>
      </div>
      <div class="rpt-bar-row">
        <div class="rpt-bar-label">불참</div>
        <div class="rpt-bar-track">
          <div class="rpt-bar-fill" style="width:${noPct}%;background:#6b7280"></div>
        </div>
        <div class="rpt-bar-pct">${advancedNo}명 (${noPct}%)</div>
      </div>
      ${undecided > 0 ? `<div class="rpt-bar-row">
        <div class="rpt-bar-label">미응답</div>
        <div class="rpt-bar-track">
          <div class="rpt-bar-fill" style="width:${Math.round(undecided/total*100)}%;background:#f59e0b"></div>
        </div>
        <div class="rpt-bar-pct">${undecided}명</div>
      </div>` : ''}
    </div>

    <!-- 심화과정 참석자 명단 -->
    <div class="rpt-section">
      <div class="rpt-section-title">03 심화과정 참석 희망자 명단 (${advancedYes}명)</div>
      ${advancedYes === 0
        ? '<p style="color:#718096;font-size:0.85rem">참석 희망자 없음</p>'
        : `<table class="rpt-table">
            <thead><tr><th>#</th><th>성함</th><th>소속 회사</th><th>팀명</th><th>직급/직책</th><th>이메일</th></tr></thead>
            <tbody>${advancedRows}</tbody>
          </table>`}
    </div>

    <!-- 소속사별 현황 -->
    <div class="rpt-section">
      <div class="rpt-section-title">04 소속사별 응답 현황</div>
      <table class="rpt-table">
        <thead><tr><th>#</th><th>소속 회사</th><th>응답 수</th></tr></thead>
        <tbody>${companyRows}</tbody>
      </table>
    </div>

    <!-- 서술형 응답 -->
    <div class="rpt-section">
      <div class="rpt-section-title">05 사전과제 응답 전체</div>
    </div>
    ${textSections}

    <div class="rpt-footer">
      본 보고서는 ${today} 기준으로 자동 생성되었습니다.<br>
      © 2026 REFERENCE HRD. All Rights Reserved.
    </div>`
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
  setupModal()
  $('response-search').addEventListener('input', applyFilter)
  $('export-advanced-excel').addEventListener('click', exportAdvancedExcel)
  $('print-report').addEventListener('click', () => window.print())
  await renderQR()
  subscribeResponses()
}

setupLogin()
setupAuthState()
