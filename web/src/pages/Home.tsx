import { useEffect, useState } from 'react'
import { DEFAULT_OUTPUT_LANGUAGE, hasApiKey, unlockInstructor } from '../lib/settings'
import { UI_LANGUAGES, UI_DICTS, getStoredUiLang, setStoredUiLang, type UiLang } from '../lib/uiLang'
import { hasSupabase } from '../lib/supabase'
import { createRoom, verifyRoom } from '../lib/room'
import type { StudentSession, InstructorSession } from '../App'

function Emblem() {
  return (
    <svg className="emblem" viewBox="0 0 300 122" role="img" aria-label="Woosong University">
      <circle cx="46" cy="46" r="29" fill="none" stroke="#1A7A40" strokeWidth="22" />
      <polyline points="112,74 150,24 188,74" fill="none" stroke="#1C5FA8" strokeWidth="22" strokeLinejoin="miter" />
      <path d="M 292 20 H 244 V 72 H 292" fill="none" stroke="#B4283E" strokeWidth="22" />
      <text x="150" y="113" textAnchor="middle" fontSize="17" fontWeight="700" letterSpacing="1.5" fill="#2C2C2A" fontFamily="-apple-system, 'Segoe UI', sans-serif">WOOSONG UNIVERSITY</text>
    </svg>
  )
}

// 랜딩 하단 현재 시각·오늘 날짜·요일 — 화면 언어에 맞춘 표기
const DATE_LOCALES: Record<UiLang, string> = { ko: 'ko-KR', en: 'en-US', bn: 'bn-BD', zh: 'zh-CN' }

// 랜딩(역할 선택) 아이콘 — 강단 앞 교수 / 학사모 쓴 학생
function ProfessorIcon() {
  return (
    <svg className="role-icon" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="6" y="6" width="34" height="22" rx="2" fill="#F2FBF8" stroke="#085041" strokeWidth="2.5" />
      <path d="M12 14h18M12 20h12" stroke="#0F6E56" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="46" cy="22" r="7" fill="#0F6E56" />
      <path d="M33 58v-14a13 13 0 0 1 26 0v14z" fill="#085041" />
      <path d="M40 34l-8-6" stroke="#085041" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M22 44h20v14H22z" fill="#9FE1CB" stroke="#085041" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

function StudentIcon() {
  return (
    <svg className="role-icon" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 6L6 17l26 11 26-11z" fill="#085041" />
      <path d="M52 20v12" stroke="#085041" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="52" cy="34" r="2.5" fill="#085041" />
      <path d="M18 22v6c0 6 6 10 14 10s14-4 14-10v-6l-14 6z" fill="#0F6E56" />
      <path d="M12 60v-6a12 12 0 0 1 12-12h16a12 12 0 0 1 12 12v6z" fill="#9FE1CB" stroke="#085041" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

export default function Home({ onJoinStudent, onCreateInstructor }: {
  onJoinStudent: (s: StudentSession) => void
  onCreateInstructor: (s: InstructorSession) => void
}) {
  const [uiLang, setUiLang] = useState<UiLang>(getStoredUiLang())
  const t = UI_DICTS[uiLang]
  function changeUiLang(lang: UiLang) { setUiLang(lang); setStoredUiLang(lang) }

  // 랜딩 시계 — 1초마다 갱신(자정 넘으면 날짜·요일도 자동으로 바뀜)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // 첫 화면은 역할 선택(교수/학생) — 고른 뒤 입장/개설 폼으로
  const [stage, setStage] = useState<'landing' | 'form'>('landing')
  const [role, setRole] = useState<'student' | 'instructor'>('student')
  // 학생
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [language] = useState(DEFAULT_OUTPUT_LANGUAGE) // 출력 언어는 한국어로 고정 — 학생이 바꿀 수 없음
  // 교수
  const [title, setTitle] = useState('')
  const [iCode, setICode] = useState('')
  const [iPassword, setIPassword] = useState('')
  // 교수자 비밀번호 모달
  const [lockOpen, setLockOpen] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [lockErr, setLockErr] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const sbReady = hasSupabase()

  async function joinStudent() {
    setErr('')
    if (!code.trim() || !password.trim()) return
    if (!sbReady) { setErr('서버 설정(Supabase)이 아직 없습니다. .env.local에 키를 넣어주세요.'); return }
    setBusy(true)
    const r = await verifyRoom(code.trim(), password.trim())
    setBusy(false)
    if (!r.ok) { setErr('방 코드 또는 비밀번호가 올바르지 않습니다.'); return }
    onJoinStudent({ code: code.trim(), language, title: r.title ?? '' })
  }

  function submitPasscode() {
    if (!passcode.trim()) { setLockOpen(false); setLockErr(''); return }
    const mode = unlockInstructor(passcode)
    if (!mode) { setLockErr('비밀번호가 올바르지 않습니다.'); return }
    setLockOpen(false); setPasscode(''); setLockErr(''); setErr('')
    if (mode === 'personal') {
      // 개인 비번 → 방 개설 폼 건너뛰고 바로 개인 모드로 입장(1인용이라 방 불필요)
      const code = Math.floor(1000 + Math.random() * 9000).toString()
      onCreateInstructor({ code, password: '', title: '개인 통역', mode: 'personal' })
    } else {
      setRole('instructor'); setStage('form') // 강의 비번 → 기본 화면을 '강의 개설'로
    }
  }

  // 랜딩: 교수 아이콘 = 항상 교수자 비밀번호 입력(이미 잠금 해제여도 다시 확인), 학생 아이콘 = 입장 폼
  function pickProfessors() { setPasscode(''); setLockErr(''); setLockOpen(true) }
  function pickStudents() { setErr(''); setRole('student'); setStage('form') }


  async function createInstructor() {
    setErr('')
    if (!iCode.trim() || !iPassword.trim()) return
    if (!sbReady) { setErr('서버 설정(Supabase)이 아직 없습니다. .env.local에 키를 넣어주세요.'); return }
    if (!hasApiKey()) { setErr('서버에 Gemini 키가 설정되어 있지 않습니다.'); return }
    setBusy(true)
    const res = await createRoom(iCode.trim(), iPassword.trim(), title.trim())
    setBusy(false)
    if (res === 'taken') { setErr('이미 사용 중인 방 코드입니다. 다른 코드를 쓰세요.'); return }
    if (res === 'error') { setErr('방 생성에 실패했습니다. 서버 설정을 확인하세요.'); return }
    onCreateInstructor({ code: iCode.trim(), password: iPassword.trim(), title: title.trim() })
  }

  const studentValid = code.trim().length > 0 && password.trim().length > 0
  const instructorValid = iCode.trim().length > 0 && iPassword.trim().length > 0

  return (
    <div className="screen home">
      <header className="home-top">
        {stage === 'form' && (
          <button className="home-back" onClick={() => { setStage('landing'); setErr('') }} aria-label={t.home} title={t.home}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 11.5L12 4l9 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </header>

      <div className="home-body">
        <Emblem />
        <div className="ui-lang-picker">
          <select
            className="lang-select"
            aria-label={t.languageSelectLabel}
            value={uiLang}
            onChange={(e) => changeUiLang(e.target.value as UiLang)}
          >
            {UI_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <h1 className="brand">My Translation Buddy</h1>

        {stage === 'landing' ? (
          <>
            <p className="brand-sub landing-sub">{t.landingPrompt}</p>
            <div className="role-cards">
              <button className="role-card" onClick={pickProfessors}>
                <ProfessorIcon />
                <span>{t.landingProfessors}</span>
              </button>
              <button className="role-card" onClick={pickStudents}>
                <StudentIcon />
                <span>{t.landingStudents}</span>
              </button>
            </div>
            <p className="landing-time">
              {now.toLocaleTimeString(DATE_LOCALES[uiLang], { hour: 'numeric', minute: '2-digit' })}
            </p>
            <p className="landing-date">
              {now.toLocaleDateString(DATE_LOCALES[uiLang], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </>
        ) : (
        <>
        <p className="brand-sub">
          {role === 'student' ? t.subStudent : t.subInstructor}
        </p>

        {/* 역할 토글 대신 제목 텍스트만 — 교수는 '강의 개설'(파랑), 학생은 '강의 입장'(초록) */}
        <h2 className={'role-title' + (role === 'student' ? ' student' : '')}>
          {role === 'instructor' ? t.roleInstructor : t.roleStudent}
        </h2>

        {role === 'student' ? (
          <>
            <label className="field">
              <span>{t.fieldCode}</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.codePlaceholder} inputMode="numeric" />
            </label>
            <label className="field">
              <span>{t.fieldPassword}</span>
              <input type="password" inputMode="numeric" pattern="[0-9]*" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t.studentPasswordPlaceholder} autoComplete="off" />
            </label>
            <label className="field">
              <span>{t.fieldOutputLang}</span>
              <select value={language} disabled>
                <option value="한국어">한국어</option>
              </select>
            </label>
            <button className="primary" disabled={!studentValid || busy} onClick={joinStudent}>{busy ? t.joining : t.join}</button>
          </>
        ) : (
          <>
            <label className="field">
              <span>{t.fieldTitle}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t.titlePlaceholder} />
            </label>
            <label className="field">
              <span>{t.fieldRoomCode}</span>
              <input value={iCode} onChange={(e) => setICode(e.target.value)} placeholder={t.roomCodePlaceholder} inputMode="numeric" />
            </label>
            <label className="field">
              <span>{t.fieldPassword}</span>
              <input type="password" inputMode="numeric" pattern="[0-9]*" value={iPassword} onChange={(e) => setIPassword(e.target.value)} placeholder={t.instructorPasswordPlaceholder} autoComplete="off" />
            </label>
            <button className="primary" disabled={!instructorValid || busy} onClick={createInstructor}>{busy ? t.creating : t.create}</button>
          </>
        )}

        {err && <p className="hint" style={{ color: 'var(--live)' }}>{err}</p>}
        {role === 'instructor' && !hasApiKey() && (
          <p className="hint">{t.hintNoGeminiKey}</p>
        )}
        {!sbReady && (
          <p className="hint">{t.hintNoSupabasePre}<code>.env.local</code>{t.hintNoSupabasePost}</p>
        )}
        </>
        )}

        <div className="home-footer">
          {t.footer}
          <div className="home-copyright">© {now.getFullYear()} Woosong University. All Rights Reserved.</div>
        </div>
      </div>

      {lockOpen && (
        <div className="modal-backdrop" onClick={() => setLockOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{t.lockTitle}</h2>
            <p className="modal-desc">{t.lockDesc}</p>
            <input
              type="password" inputMode="numeric" pattern="[0-9]*" autoFocus
              value={passcode} onChange={(e) => { setPasscode(e.target.value); setLockErr('') }}
              placeholder={t.passcodePlaceholder} autoComplete="off"
              onKeyDown={(e) => { if (e.key === 'Enter') submitPasscode() }}
            />
            {lockErr && <p className="modal-err">{lockErr}</p>}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setLockOpen(false)}>{t.cancel}</button>
              <button className="primary modal-ok" disabled={!passcode.trim()} onClick={submitPasscode}>{t.confirm}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
