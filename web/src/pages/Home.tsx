import { useState } from 'react'
import { DEFAULT_OUTPUT_LANGUAGE, hasApiKey, unlockInstructor, getStoredApiKey, setStoredApiKey, hasStoredApiKey } from '../lib/settings'
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

export default function Home({ onJoinStudent, onCreateInstructor }: {
  onJoinStudent: (s: StudentSession) => void
  onCreateInstructor: (s: InstructorSession) => void
}) {
  const [uiLang, setUiLang] = useState<UiLang>(getStoredUiLang())
  const t = UI_DICTS[uiLang]
  function changeUiLang(lang: UiLang) { setUiLang(lang); setStoredUiLang(lang) }

  const [role, setRole] = useState<'student' | 'instructor'>('student')
  // 학생
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [language] = useState(DEFAULT_OUTPUT_LANGUAGE) // 출력 언어는 한국어로 고정 — 학생이 바꿀 수 없음
  // 교수
  const [title, setTitle] = useState('')
  const [iCode, setICode] = useState('')
  const [iPassword, setIPassword] = useState('')
  // 교수자 잠금
  const [unlocked, setUnlocked] = useState(false)
  const [lockOpen, setLockOpen] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [lockErr, setLockErr] = useState('')
  // 본인 Gemini 키 입력(교수자 잠금 해제 후 🔑)
  const [keyOpen, setKeyOpen] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyShow, setKeyShow] = useState(false)

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

  function toggleLock() {
    if (unlocked) {
      setUnlocked(false); setErr('')
      if (role === 'instructor') setRole('student')
    } else {
      setPasscode(''); setLockErr(''); setLockOpen(true)
    }
  }
  function submitPasscode() {
    if (!passcode.trim()) { setLockOpen(false); setLockErr(''); return }
    const mode = unlockInstructor(passcode)
    if (!mode) { setLockErr('비밀번호가 올바르지 않습니다.'); return }
    setUnlocked(true); setLockOpen(false); setPasscode(''); setLockErr(''); setErr('')
    if (mode === 'personal') {
      // 개인 비번 → 방 개설 폼 건너뛰고 바로 개인 모드로 입장(1인용이라 방 불필요)
      const code = Math.floor(1000 + Math.random() * 9000).toString()
      onCreateInstructor({ code, password: '', title: '개인 통역', mode: 'personal' })
    } else {
      setRole('instructor') // 강의 비번 → 기본 화면을 '강의 개설'로
    }
  }

  function openKey() { setKeyInput(getStoredApiKey()); setKeyShow(false); setKeyOpen(true) }
  function saveKey() { setStoredApiKey(keyInput); setKeyOpen(false) }
  function resetKey() { setStoredApiKey(''); setKeyInput(''); setKeyOpen(false) }

  function pickInstructor() {
    if (!unlocked) return // 잠겨 있으면 버튼 비활성(클릭 무시)
    setErr(''); setRole('instructor')
  }

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
        {unlocked && (
          <button
            className={'gear lock' + (hasStoredApiKey() ? ' on' : '')}
            onClick={openKey}
            aria-label={t.keyBtnAriaMine}
            title={hasStoredApiKey() ? t.keyBtnTitleMine : t.keyBtnTitleDefault}
          >🔑</button>
        )}
        <button
          className={'gear lock' + (unlocked ? ' on' : '')}
          onClick={toggleLock}
          aria-label={unlocked ? t.lockBtnAriaOn : t.lockBtnAriaOff}
          title={unlocked ? t.lockBtnTitleOn : t.lockBtnTitleOff}
        >{unlocked ? '🔓' : '🔒'}</button>
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
        <p className="brand-sub">
          {role === 'student' ? t.subStudent : t.subInstructor}
        </p>

        <div className="role-seg">
          <button className={role === 'student' ? 'on' : ''} onClick={() => { setRole('student'); setErr('') }}>{t.roleStudent}</button>
          <button
            className={role === 'instructor' ? 'on' : ''}
            disabled={!unlocked}
            onClick={pickInstructor}
            title={unlocked ? '' : t.roleInstructorLockedTitle}
          >{t.roleInstructor}{!unlocked && ' 🔒'}</button>
        </div>

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

        <div className="home-footer">{t.footer}</div>
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

      {keyOpen && (
        <div className="modal-backdrop" onClick={() => setKeyOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{t.keyTitle}</h2>
            <p className="modal-desc">{t.keyDescPre}<b>{t.keyDescBold}</b>{t.keyDescPost}</p>
            <div className="key-row">
              <input type={keyShow ? 'text' : 'password'} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder={t.keyPlaceholder} autoComplete="off" spellCheck={false} />
              <button className="ghost" onClick={() => setKeyShow((s) => !s)}>{keyShow ? t.hide : t.show}</button>
            </div>
            <p className="modal-desc" style={{ marginTop: 8 }}>{t.keyCurrentPre}<b>{hasStoredApiKey() ? t.keyCurrentMine : t.keyCurrentDefault}</b>{t.keyCurrentPost}</p>
            <div className="modal-actions">
              <button className="ghost" onClick={resetKey}>{t.resetDefault}</button>
              <button className="primary modal-ok" onClick={saveKey}>{t.save}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
