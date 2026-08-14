import { useState } from 'react'
import { DEFAULT_OUTPUT_LANGUAGE, hasApiKey, isInstructorUnlocked, unlockInstructor, lockInstructor, getStoredApiKey, setStoredApiKey, hasStoredApiKey } from '../lib/settings'
import { LANGUAGES } from '../lib/languages'
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
  const [role, setRole] = useState<'student' | 'instructor'>(isInstructorUnlocked() ? 'instructor' : 'student')
  // 학생
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [language, setLanguage] = useState(DEFAULT_OUTPUT_LANGUAGE)
  // 교수
  const [title, setTitle] = useState('')
  const [iCode, setICode] = useState('')
  const [iPassword, setIPassword] = useState('')
  // 교수자 잠금
  const [unlocked, setUnlocked] = useState(isInstructorUnlocked())
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
      lockInstructor(); setUnlocked(false); setErr('')
      if (role === 'instructor') setRole('student')
    } else {
      setPasscode(''); setLockErr(''); setLockOpen(true)
    }
  }
  function submitPasscode() {
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
            aria-label="Gemini API 키"
            title={hasStoredApiKey() ? 'Gemini 키 — 내 키 사용 중' : 'Gemini 키 — 기본 키 사용 중'}
          >🔑</button>
        )}
        <button
          className={'gear lock' + (unlocked ? ' on' : '')}
          onClick={toggleLock}
          aria-label={unlocked ? '교수자 모드 — 누르면 잠금' : '교수자 비밀번호 입력'}
          title={unlocked ? '교수자 모드 켜짐 — 누르면 잠금' : '교수자 비밀번호'}
        >{unlocked ? '🔓' : '🔒'}</button>
      </header>

      <div className="home-body">
        <Emblem />
        <h1 className="brand">My Translation Buddy</h1>
        <p className="brand-sub">
          {role === 'student'
            ? '입장 코드로 들어가 원하는 언어로 자막을 받으세요.'
            : '강의 방을 만들고 학생에게 코드를 공유하세요.'}
        </p>

        <div className="role-seg">
          <button className={role === 'student' ? 'on' : ''} onClick={() => { setRole('student'); setErr('') }}>강의 입장</button>
          <button
            className={role === 'instructor' ? 'on' : ''}
            disabled={!unlocked}
            onClick={pickInstructor}
            title={unlocked ? '' : '교수자 전용 — 우측 상단 자물쇠로 잠금 해제'}
          >강의 개설{!unlocked && ' 🔒'}</button>
        </div>

        {role === 'student' ? (
          <>
            <label className="field">
              <span>입장 코드</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: 4821" inputMode="numeric" />
            </label>
            <label className="field">
              <span>비밀번호</span>
              <input type="password" inputMode="numeric" pattern="[0-9]*" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="강의 비밀번호" autoComplete="off" />
            </label>
            <label className="field">
              <span>출력 언어</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => <option key={l.code} value={l.label}>{l.label}</option>)}
              </select>
            </label>
            <button className="primary" disabled={!studentValid || busy} onClick={joinStudent}>{busy ? '확인 중…' : '입장'}</button>
          </>
        ) : (
          <>
            <label className="field">
              <span>강의명</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 한국 문화의 이해" />
            </label>
            <label className="field">
              <span>방 코드</span>
              <input value={iCode} onChange={(e) => setICode(e.target.value)} placeholder="예: 4821" inputMode="numeric" />
            </label>
            <label className="field">
              <span>비밀번호</span>
              <input type="password" inputMode="numeric" pattern="[0-9]*" value={iPassword} onChange={(e) => setIPassword(e.target.value)} placeholder="방 비밀번호" autoComplete="off" />
            </label>
            <button className="primary" disabled={!instructorValid || busy} onClick={createInstructor}>{busy ? '개설 중…' : '개설'}</button>
          </>
        )}

        {err && <p className="hint" style={{ color: 'var(--live)' }}>{err}</p>}
        {role === 'instructor' && !hasApiKey() && (
          <p className="hint">⚠ 서버에 Gemini 키가 설정되어 있지 않습니다. 관리자에게 문의하세요.</p>
        )}
        {!sbReady && (
          <p className="hint">⚠ 서버(Supabase) 설정이 아직 없습니다. <code>.env.local</code>에 URL/anon 키를 넣어주세요.</p>
        )}

        <div className="home-footer">WSU Live Translation</div>
      </div>

      {lockOpen && (
        <div className="modal-backdrop" onClick={() => setLockOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">🔒 교수자 비밀번호</h2>
            <p className="modal-desc">교수자만 강의를 개설할 수 있습니다.</p>
            <input
              type="password" inputMode="numeric" pattern="[0-9]*" autoFocus
              value={passcode} onChange={(e) => { setPasscode(e.target.value); setLockErr('') }}
              placeholder="비밀번호" autoComplete="off"
              onKeyDown={(e) => { if (e.key === 'Enter') submitPasscode() }}
            />
            {lockErr && <p className="modal-err">{lockErr}</p>}
            <div className="modal-actions">
              <button className="ghost" onClick={() => setLockOpen(false)}>취소</button>
              <button className="primary modal-ok" disabled={!passcode.trim()} onClick={submitPasscode}>확인</button>
            </div>
          </div>
        </div>
      )}

      {keyOpen && (
        <div className="modal-backdrop" onClick={() => setKeyOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">🔑 Gemini API 키</h2>
            <p className="modal-desc">안정적 운영을 위해 본인 키를 넣을 수 있어요. 비우면 기본 키를 씁니다. <b>이 브라우저에만</b> 저장됩니다.</p>
            <div className="key-row">
              <input type={keyShow ? 'text' : 'password'} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="AIza…" autoComplete="off" spellCheck={false} />
              <button className="ghost" onClick={() => setKeyShow((s) => !s)}>{keyShow ? '숨기기' : '보기'}</button>
            </div>
            <p className="modal-desc" style={{ marginTop: 8 }}>현재: <b>{hasStoredApiKey() ? '내 키' : '기본 키'}</b> 사용 중</p>
            <div className="modal-actions">
              <button className="ghost" onClick={resetKey}>기본값</button>
              <button className="primary modal-ok" onClick={saveKey}>저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
