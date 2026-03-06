import { db } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

// ── 설문 메타데이터 ────────────────────────────────────────────
const SURVEY_TITLE       = 'AI 기반 솔루션 기획 기본 과정 사전 설문'
const SURVEY_DESCRIPTION = '3/26(수) 교육 참석에 앞서 간단한 사전 설문을 작성해 주세요.\n응답 내용은 교육 설계에 활용됩니다.'
const SUBMIT_KEY         = 'hmg-survey-submitted'

// ── 질문 타입 ─────────────────────────────────────────────────
type QType = 'text' | 'email' | 'select' | 'radio' | 'checkbox' | 'rating' | 'textarea'

interface Question {
  id:           string
  type:         QType
  title:        string
  description?: string
  required:     boolean
  options?:     string[]
  min?:         number
  max?:         number
}

// ── 질문 목록 ─────────────────────────────────────────────────
const questions: Question[] = [
  { id: 'name',          type: 'text',     title: '이름',        required: true },
  { id: 'department',    type: 'text',     title: '부서 / 팀',   required: true },
  { id: 'position',      type: 'select',   title: '직급',        required: true,
    options: ['사원', '주임', '대리', '과장', '차장', '부장', '수석/책임', '기타'] },
  { id: 'email',         type: 'email',    title: '사내 이메일', required: true },
  { id: 'ai_experience', type: 'radio',    title: 'AI 관련 업무 경험이 있으신가요?', required: true,
    options: ['없음 (처음 접함)', '간접 경험 (ChatGPT 등 개인적으로 사용)', '업무 활용 경험 있음', 'AI 프로젝트 참여 경험 있음'] },
  { id: 'expectation',   type: 'checkbox', title: '이번 과정에서 가장 기대하는 것을 모두 선택해 주세요.', required: false,
    options: ['AI 개념 및 트렌드 이해', 'AI 솔루션 기획 방법론 습득', '실습 / 실무 적용 사례 학습', '타 부서 협업 네트워킹', '향후 심화 과정 연계'] },
  { id: 'ai_tool_level', type: 'rating',   title: '현재 AI 도구(ChatGPT, Copilot 등) 활용 수준을 평가해 주세요.',
    description: '1 = 전혀 사용 안 함 · 5 = 일상 업무에 적극 활용', required: true, min: 1, max: 5 },
  { id: 'requests',      type: 'textarea', title: '강사/운영진에게 전달하고 싶은 요청 사항이나 궁금한 점을 자유롭게 적어 주세요.', required: false },
]

// ── DOM 헬퍼 ─────────────────────────────────────────────────
const $ = <T extends Element = Element>(id: string) => document.getElementById(id) as T | null

// ── 화면 전환 ─────────────────────────────────────────────────
function showScreen(id: 'loading' | 'already-submitted' | 'success-message' | 'survey-container') {
  ;['loading', 'already-submitted', 'success-message', 'survey-container'].forEach(s => {
    const el = $(s)
    if (el) el.hidden = s !== id
  })
}

// ── 질문 렌더링 ───────────────────────────────────────────────
function renderInput(q: Question): string {
  switch (q.type) {
    case 'text':
    case 'email':
      return `<input class="form-input" type="${q.type}" id="q-${q.id}" name="${q.id}" autocomplete="off" />`

    case 'select':
      return `<select class="form-select" id="q-${q.id}" name="${q.id}">
        <option value="">선택해 주세요</option>
        ${(q.options ?? []).map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>`

    case 'radio':
      return `<div class="options-group">${(q.options ?? []).map(o => `
        <label class="option-item">
          <input class="option-input" type="radio" name="${q.id}" value="${o}" />
          <span class="option-label">${o}</span>
        </label>`).join('')}</div>`

    case 'checkbox':
      return `<div class="options-group">${(q.options ?? []).map(o => `
        <label class="option-item">
          <input class="option-input" type="checkbox" name="${q.id}" value="${o}" />
          <span class="option-label">${o}</span>
        </label>`).join('')}</div>`

    case 'rating': {
      const min = q.min ?? 1
      const max = q.max ?? 5
      const vals = Array.from({ length: max - min + 1 }, (_, i) => min + i)
      return `<div class="rating-group">${vals.map(v => `
        <input class="rating-input" type="radio" name="${q.id}" id="r-${q.id}-${v}" value="${v}" />
        <label class="rating-label" for="r-${q.id}-${v}">${v}</label>`).join('')}</div>`
    }

    case 'textarea':
      return `<textarea class="form-textarea" id="q-${q.id}" name="${q.id}" rows="4"></textarea>`
  }
}

function renderQuestions() {
  const container = $('questions')
  if (!container) return
  container.innerHTML = questions.map((q, i) => {
    const num  = `<span class="question-number">Q${i + 1}.</span>`
    const req  = q.required ? ' <span class="required-mark">*</span>' : ''
    const desc = q.description ? `<p class="question-desc">${q.description}</p>` : ''
    return `<div class="question-block" id="block-${q.id}">
      <p class="question-title">${num} ${q.title}${req}</p>
      ${desc}${renderInput(q)}
      <p class="field-error" id="err-${q.id}"></p>
    </div>`
  }).join('')
}

// ── 값 수집 ───────────────────────────────────────────────────
function collectValue(q: Question): string | string[] | null {
  switch (q.type) {
    case 'text': case 'email': case 'select': case 'textarea': {
      const el = document.getElementById(`q-${q.id}`) as HTMLInputElement | null
      return el?.value.trim() ?? ''
    }
    case 'radio': {
      const el = document.querySelector<HTMLInputElement>(`input[name="${q.id}"]:checked`)
      return el?.value ?? ''
    }
    case 'checkbox': {
      const els = document.querySelectorAll<HTMLInputElement>(`input[name="${q.id}"]:checked`)
      return Array.from(els).map(e => e.value)
    }
    case 'rating': {
      const el = document.querySelector<HTMLInputElement>(`input[name="${q.id}"]:checked`)
      return el?.value ?? ''
    }
  }
}

// ── 유효성 검사 ───────────────────────────────────────────────
function validate(): boolean {
  let valid = true
  for (const q of questions) {
    const errEl = $(`err-${q.id}`)
    const block = $(`block-${q.id}`)
    const val   = collectValue(q)
    let msg = ''
    if (q.required) {
      if (Array.isArray(val) && val.length === 0) msg = '필수 항목입니다.'
      else if (!Array.isArray(val) && !val)       msg = '필수 항목입니다.'
    }
    if (!msg && q.type === 'email' && typeof val === 'string' && val)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) msg = '올바른 이메일 형식을 입력해 주세요.'
    if (errEl) errEl.textContent = msg
    if (block) block.classList.toggle('has-error', !!msg)
    if (msg) valid = false
  }
  return valid
}

// ── 제출 ─────────────────────────────────────────────────────
async function handleSubmit(e: Event) {
  e.preventDefault()
  const banner = $('error-banner')
  if (banner) banner.hidden = true
  if (!validate()) {
    document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  const btn = $<HTMLButtonElement>('submit-btn')
  if (btn) { btn.disabled = true; btn.textContent = '제출 중...' }

  const answers: Record<string, string | string[]> = {}
  for (const q of questions) {
    const val = collectValue(q)
    if (val !== null) answers[q.id] = val
  }

  try {
    await addDoc(collection(db, 'responses'), {
      ...answers,
      submittedAt: serverTimestamp(),
      userAgent:   navigator.userAgent,
    })
    localStorage.setItem(SUBMIT_KEY, 'true')
    showScreen('success-message')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (err) {
    console.error(err)
    if (banner) { banner.textContent = '제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'; banner.hidden = false }
    if (btn) { btn.disabled = false; btn.textContent = '신청하기' }
  }
}

// ── 초기화 ────────────────────────────────────────────────────
function init() {
  if (localStorage.getItem(SUBMIT_KEY)) { showScreen('already-submitted'); return }
  const titleEl = $('survey-title')
  const descEl  = $('survey-description')
  if (titleEl) titleEl.textContent = SURVEY_TITLE
  if (descEl)  descEl.textContent  = SURVEY_DESCRIPTION
  renderQuestions()
  showScreen('survey-container')
  $<HTMLFormElement>('survey-form')?.addEventListener('submit', handleSubmit)
}

init()
