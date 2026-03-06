import { db } from '/src/firebase.js'
import { collection, addDoc, serverTimestamp } from 'https://esm.sh/firebase@12.10.0/firestore'

const SURVEY_TITLE       = 'AI 기반 솔루션 기획 기본 과정 사전 설문'
const SURVEY_DESCRIPTION = '3/26(수) 교육 참석에 앞서 간단한 사전 설문을 작성해 주세요.\n응답 내용은 교육 설계에 활용됩니다.'
const SUBMIT_KEY         = 'hmg-survey-submitted'

const questions = [
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

const $ = (id) => document.getElementById(id)

function showScreen(id) {
  ['loading', 'already-submitted', 'success-message', 'survey-container'].forEach(s => {
    const el = $(s)
    if (el) el.hidden = s !== id
  })
}

function renderInput(q) {
  switch (q.type) {
    case 'text': case 'email':
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
      const min = q.min ?? 1, max = q.max ?? 5
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

function collectValue(q) {
  switch (q.type) {
    case 'text': case 'email': case 'select': case 'textarea':
      return document.getElementById(`q-${q.id}`)?.value.trim() ?? ''
    case 'radio':
      return document.querySelector(`input[name="${q.id}"]:checked`)?.value ?? ''
    case 'checkbox':
      return Array.from(document.querySelectorAll(`input[name="${q.id}"]:checked`)).map(e => e.value)
    case 'rating':
      return document.querySelector(`input[name="${q.id}"]:checked`)?.value ?? ''
  }
}

function validate() {
  let valid = true
  for (const q of questions) {
    const errEl = $(`err-${q.id}`), block = $(`block-${q.id}`)
    const val = collectValue(q)
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

async function handleSubmit(e) {
  e.preventDefault()
  const banner = $('error-banner')
  if (banner) banner.hidden = true
  if (!validate()) {
    document.querySelector('.has-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  const btn = $('submit-btn')
  if (btn) { btn.disabled = true; btn.textContent = '제출 중...' }
  const answers = {}
  for (const q of questions) { const v = collectValue(q); if (v !== null) answers[q.id] = v }
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

function init() {
  if (localStorage.getItem(SUBMIT_KEY)) { showScreen('already-submitted'); return }
  const titleEl = $('survey-title'), descEl = $('survey-description')
  if (titleEl) titleEl.textContent = SURVEY_TITLE
  if (descEl)  descEl.textContent  = SURVEY_DESCRIPTION
  renderQuestions()
  showScreen('survey-container')
  $('survey-form')?.addEventListener('submit', handleSubmit)
}

init()
