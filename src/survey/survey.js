import { db } from '/src/firebase.js'
import { collection, addDoc, serverTimestamp } from 'https://esm.sh/firebase@12.10.0/firestore'

const SURVEY_TITLE       = 'AI 기반 솔루션 기획 기본 과정(3/26) 신청서'
const SURVEY_DESCRIPTION = '본 내용은 HRDer 러닝세션 연계과정인 AI 기반 솔루션 기획 과정 신청서 입니다.\n더욱 의미있는 과정이 될 수 있도록 현업에서 본인의 고민을 담아 작성 부탁드립니다.\n\n과정일정 : 3/26(목) 오후 1시30분~5시30분\n방식 : 실시간 온라인'
const SUBMIT_KEY         = 'hmg-survey-submitted'

const questions = [
  { id: 'name',            type: 'text',     title: '성함을 작성해주세요',          required: true,
    placeholder: '답변을 적어주세요' },
  { id: 'company',         type: 'text',     title: '소속 회사를 입력해주세요.',     required: true,
    placeholder: '예) 현대자동차' },
  { id: 'team',            type: 'text',     title: '소속 팀명을 입력해주세요.',     required: true,
    placeholder: '예) HRD전략팀' },
  { id: 'position',        type: 'text',     title: '직급/직책을 입력해주세요.',     required: true,
    placeholder: '예) 책임매니저, 파트장 등' },
  { id: 'email',           type: 'email',    title: '회사 이메일을 입력해주세요.',   required: true,
    description: '과정 안내 발송용으로만 사용됩니다.',
    placeholder: 'example@hyundai.com' },
  { type: 'info',
    content: '본 과정은 본인의 현업 문제에 적용할 수 있는 아이디어를 기획하고 실제 구현해보는 PBL(Problem Based Learning) 형태의 교육입니다. 본 과정을 더 의미있게 진행하기 위해 본인의 평소 고민을 담아 최대한 자세히 작성해주세요.' },
  { id: 'problem',         type: 'textarea', title: '본인이 이번 프로젝트를 통해서 해결하고 싶거나 향상시키고 싶은 문제를 작성해주세요.', required: true },
  { id: 'output',          type: 'textarea', title: 'AI 바이브코딩 과정을 통해 만들고 싶은 서비스의 아웃풋(구체적 이미지)를 작성해주세요.', required: true },
  { id: 'value',           type: 'textarea', title: '이를 통해 해결하고 싶은 문제나 Value가 무엇인지 작성해주세요.',        required: true },
  { id: 'scenario',        type: 'textarea', title: '구현하고 싶은 서비스 시나리오나 기능에 대해 작성해주세요',             required: true },
  { id: 'advanced_course', type: 'radio',    title: '이후 실제 프로토타입 구현을 위한 심화 과정(4/13~14, 16h, 오프라인)까지 참석하기 원하시나요?', required: true,
    options: [{ label: '참석하기 원함', value: 'yes' }, { label: '참석하기 원하지 않음', value: 'no' }] },
  { id: 'privacy_consent', type: 'checkbox', isConsent: true, title: '개인정보 수집 및 이용 동의', required: true,
    description: '수집 항목: 성명, 소속, 이메일\n목적: 교육 과정 운영 및 안내\n보유 기간: 교육 종료 후 1년\n※ 동의를 거부할 수 있으나, 거부 시 신청이 불가합니다.',
    options: [{ label: '개인정보 수집 및 이용에 동의합니다.', value: 'agree' }] },
]

const $ = (id) => document.getElementById(id)

function showScreen(id) {
  ['loading', 'already-submitted', 'success-message', 'survey-container'].forEach(s => {
    const el = $(s)
    if (el) el.hidden = s !== id
  })
}

function renderInput(q) {
  const ph = q.placeholder ? ` placeholder="${q.placeholder}"` : ''
  switch (q.type) {
    case 'text': case 'email':
      return `<input class="form-input" type="${q.type}" id="q-${q.id}" name="${q.id}" autocomplete="off"${ph} />`
    case 'radio':
      return `<div class="options-group">${(q.options ?? []).map(o => {
        const val = typeof o === 'object' ? o.value : o
        const lbl = typeof o === 'object' ? o.label : o
        return `<label class="option-item">
          <input class="option-input" type="radio" name="${q.id}" value="${val}" />
          <span class="option-label">${lbl}</span>
        </label>`
      }).join('')}</div>`
    case 'checkbox':
      return `<div class="options-group">${(q.options ?? []).map(o => {
        const val = typeof o === 'object' ? o.value : o
        const lbl = typeof o === 'object' ? o.label : o
        return `<label class="option-item">
          <input class="option-input" type="checkbox" name="${q.id}" value="${val}" />
          <span class="option-label">${lbl}</span>
        </label>`
      }).join('')}</div>`
    case 'textarea':
      return `<textarea class="form-textarea" id="q-${q.id}" name="${q.id}" rows="4"${ph}></textarea>`
  }
}

function renderQuestions() {
  const container = $('questions')
  if (!container) return
  let qNum = 0
  const requiredNote = '<p class="required-note"><span class="required-mark">*</span> 표시는 필수 항목입니다.</p>'
  container.innerHTML = requiredNote + questions.map(q => {
    // Info notice block (not a question)
    if (q.type === 'info') {
      return `<div class="info-block">
        <span class="info-icon">💡</span>
        <p>${q.content}</p>
      </div>`
    }
    // Consent block (no question number)
    if (q.isConsent) {
      const desc = q.description ? `<p class="consent-desc">${q.description}</p>` : ''
      return `<div class="consent-block" id="block-${q.id}">
        <p class="consent-title">${q.title}</p>
        ${desc}${renderInput(q)}
        <p class="field-error" id="err-${q.id}"></p>
      </div>`
    }
    // Regular question
    qNum++
    const req  = q.required ? ' <span class="required-mark">*</span>' : ''
    const desc = q.description ? `<p class="question-desc">${q.description}</p>` : ''
    return `<div class="question-block" id="block-${q.id}">
      <p class="question-title"><span class="question-number">Q${qNum}.</span> ${q.title}${req}</p>
      ${desc}${renderInput(q)}
      <p class="field-error" id="err-${q.id}"></p>
    </div>`
  }).join('')
}

function collectValue(q) {
  if (q.type === 'info') return null
  switch (q.type) {
    case 'text': case 'email': case 'textarea':
      return document.getElementById(`q-${q.id}`)?.value.trim() ?? ''
    case 'radio':
      return document.querySelector(`input[name="${q.id}"]:checked`)?.value ?? ''
    case 'checkbox':
      return Array.from(document.querySelectorAll(`input[name="${q.id}"]:checked`)).map(e => e.value)
  }
}

function validate() {
  let valid = true
  for (const q of questions) {
    if (q.type === 'info') continue
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
  for (const q of questions) {
    if (q.type === 'info') continue
    const v = collectValue(q)
    if (v !== null) answers[q.id] = v
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

function init() {
  if (localStorage.getItem(SUBMIT_KEY)) { showScreen('already-submitted'); return }
  const titleEl = $('survey-title'), descEl = $('survey-description')
  if (titleEl) titleEl.textContent = SURVEY_TITLE
  if (descEl)  { descEl.textContent = SURVEY_DESCRIPTION; descEl.style.whiteSpace = 'pre-line' }
  renderQuestions()
  showScreen('survey-container')
  $('survey-form')?.addEventListener('submit', handleSubmit)
}

init()
