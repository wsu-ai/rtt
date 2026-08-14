import { useEffect, useRef, useState } from 'react'
import type { StudentSession } from '../App'
import { LANGUAGES, codeOf } from '../lib/languages'
import { joinRoomChannel, SOURCE_LANG, type GuestHandle, type Caption, type Question } from '../lib/room'
import { startVoiceListen, voiceConfigured, type VoiceListener } from '../lib/voice'

const CAPTION_LABELS = ['번역만', '원문+번역']

export default function StudentLive({ session, onLeave }: { session: StudentSession; onLeave: () => void }) {
  const [language, setLanguage] = useState(session.language)
  const [captionMode, setCaptionMode] = useState(1) // 1 원문+번역(기본) · 0 번역만
  const [big, setBig] = useState(false)
  const [toast, setToast] = useState('')
  const [connected, setConnected] = useState(false)
  const [asking, setAsking] = useState(false)
  const [qText, setQText] = useState('')
  // 이름은 한 번 입력하면 계속 유지(새로고침·재입장해도 기억)
  const [qName, setQName] = useState(() => { try { return localStorage.getItem('ltx.qName') ?? '' } catch { return '' } })
  const [hostPresent, setHostPresent] = useState(false)
  const [sent, setSent] = useState<{ id: string; text: string; delivered: boolean }[]>([])
  const [voiceOn, setVoiceOn] = useState(false)   // 번역 음성 듣기(기본 꺼짐 — 누를 때만 연결)
  const [voiceBusy, setVoiceBusy] = useState(false)

  const [srcFinals, setSrcFinals] = useState<string[]>([])
  const [srcInterim, setSrcInterim] = useState('')
  const [transFinals, setTransFinals] = useState<string[]>([])
  const [transInterim, setTransInterim] = useState('')

  const guestRef = useRef<GuestHandle | null>(null)
  const srcRef = useRef<HTMLDivElement | null>(null)
  const transRef = useRef<HTMLDivElement | null>(null)
  const langRef = useRef(codeOf(session.language))
  const srcFinalsRef = useRef<string[]>([])
  const transFinalsRef = useRef<string[]>([])
  const voiceRef = useRef<VoiceListener | null>(null)
  const voiceIdRef = useRef('guest-' + (globalThis.crypto?.randomUUID?.() ?? String(performance.now())))

  useEffect(() => {
    function onCaption(c: Caption) {
      if (c.lang === SOURCE_LANG) {
        if (c.final) { srcFinalsRef.current = [...srcFinalsRef.current, c.text]; setSrcFinals(srcFinalsRef.current); setSrcInterim('') }
        else setSrcInterim(c.text)
      } else if (c.lang === langRef.current) {
        if (c.final) { transFinalsRef.current = [...transFinalsRef.current, c.text]; setTransFinals(transFinalsRef.current); setTransInterim('') }
        else setTransInterim(c.text)
      }
    }
    guestRef.current = joinRoomChannel(session.code, langRef.current, onCaption, (present) => setHostPresent(present))
    setConnected(true)
    return () => { voiceRef.current?.stop(); voiceRef.current = null; guestRef.current?.close(); guestRef.current = null }
  }, [session.code])

  useEffect(() => {
    if (srcRef.current) srcRef.current.scrollTop = srcRef.current.scrollHeight
    if (transRef.current) transRef.current.scrollTop = transRef.current.scrollHeight
  }, [srcFinals, srcInterim, transFinals, transInterim, captionMode])

  function changeLanguage(newLang: string) {
    setLanguage(newLang)
    langRef.current = codeOf(newLang)
    transFinalsRef.current = []; setTransFinals([]); setTransInterim('') // 새 언어 → 번역 누적 초기화
    guestRef.current?.setLang(langRef.current)
    voiceRef.current?.setLang(langRef.current) // 음성 켜져 있으면 새 언어 트랙으로 재구독
  }

  function leave() { voiceRef.current?.stop(); voiceRef.current = null; guestRef.current?.close(); guestRef.current = null; onLeave() }
  function flash(m: string) { setToast(m); setTimeout(() => setToast(''), 1500) }

  function sendQuestion() {
    const text = qText.trim()
    if (!text) return
    const name = qName.trim()
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    const q: Question = { id, lang: language, text, name: name || undefined, ts: Date.now() }
    try { if (name) localStorage.setItem('ltx.qName', name) } catch { /* noop */ }
    guestRef.current?.sendQuestion(q)
    // 전달 확인 = 교수 접속 여부(presence). 접속 중이면 broadcast가 도달한다.
    setSent((prev) => [...prev, { id, text, delivered: hostPresent }])
    setQText(''); setAsking(false)
    flash(hostPresent ? '질문을 보냈어요 ✓' : '보냈지만 교수가 아직 접속하지 않았어요')
  }

  async function toggleVoice() {
    if (voiceBusy) return
    if (voiceRef.current) { voiceRef.current.stop(); voiceRef.current = null; setVoiceOn(false); return }
    if (!voiceConfigured()) { flash('음성 기능이 아직 준비되지 않았어요'); return }
    setVoiceBusy(true)
    try {
      voiceRef.current = await startVoiceListen(session.code, langRef.current, voiceIdRef.current)
      setVoiceOn(true); flash('음성 켜짐 · 이어폰 권장')
    } catch {
      voiceRef.current = null; setVoiceOn(false); flash('음성 연결 실패 — 잠시 후 다시 시도')
    } finally { setVoiceBusy(false) }
  }

  async function share() {
    const srcText = srcFinalsRef.current.join('\n').trim()
    const transText = transFinalsRef.current.join('\n').trim()
    const blocks: string[] = []
    if (srcText) blocks.push(`[원문]\n${srcText}`)
    if (transText) blocks.push(`[번역문]\n${transText}`)
    const text = blocks.join('\n\n')
    if (!text) { flash('보낼 자막이 없어요'); return }
    const title = `${session.title || '강의'} · ${session.code} 자막`
    if (navigator.share) { try { await navigator.share({ title, text }) } catch { /* 취소 */ } return }
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`
  }

  const hasContent = srcFinals.length > 0 || transFinals.length > 0 || !!srcInterim || !!transInterim

  const transList = (
    <>
      {transFinals.map((t, i) => <p key={i} className="cap">{t}</p>)}
      {transInterim && <p className="cap dim">{transInterim}<span className="caret" /></p>}
      {!transInterim && transFinals.length === 0 && srcInterim && <p className="cap dim">통역 중…<span className="caret" /></p>}
    </>
  )

  return (
    <div className="screen live">
      <header className="top">
        <div className="r1">
          <button className="back" onClick={leave} aria-label="나가기">‹</button>
          <div className="title">{session.title || '강의'} · {session.code}</div>
          <span className={'live-badge' + (connected ? '' : ' off')}><span className="dot" />{connected ? 'LIVE' : '연결 중'}</span>
          <button className={'gear-btn fontsize' + (big ? ' on' : '')} onClick={() => setBig((b) => !b)} aria-label="글자 크기" title="글자 크기">
            <span className="fa-sm">A</span><span className="fa-lg">A</span>
          </button>
        </div>
        <div className="ctrls">
          <select className="lang-select" value={language} onChange={(e) => changeLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.label}>{l.label}</option>)}
          </select>
          <button className="chip on cap-toggle" onClick={() => setCaptionMode((m) => (m + 1) % 2)}>{CAPTION_LABELS[captionMode]}</button>
          <button className={'chip' + (voiceOn ? ' on' : '')} onClick={toggleVoice} disabled={voiceBusy} title="번역 음성 듣기 (이어폰 권장)">{voiceBusy ? '연결 중…' : voiceOn ? '🔊 음성' : '🔈 음성'}</button>
        </div>
      </header>

      <div className={'stage' + (big ? ' big' : '')}>
        {!hasContent ? (
          <div className="placeholder">
            <p className="ph-title">🎧 강의 자막 수신 중</p>
            <p className="ph-desc">교수자가 말하면 <b>{language}</b> 자막이 여기에 표시됩니다.</p>
          </div>
        ) : captionMode === 1 ? (
          <>
            <div className="scroll src-pane" ref={srcRef}>
              {srcFinals.map((t, i) => <p key={i} className="src-line">{t}</p>)}
              {srcInterim && <p className="src-line dim">{srcInterim}<span className="caret" /></p>}
            </div>
            <div className="scroll trans-pane" ref={transRef}>{transList}</div>
          </>
        ) : (
          <div className="scroll single-pane" ref={transRef}>{transList}</div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      {sent.length > 0 && (
        <div className="recent-q">
          <p className="recent-q-title">최근 내 질문</p>
          {[...sent].slice(-2).map((s) => (
            <div className="recent-q-row" key={s.id}>
              <span className="recent-q-text">{s.text}</span>
              <span className={'recent-q-stat' + (s.delivered ? '' : ' nohost')}>{s.delivered ? '✓ 전달됨' : '⚠ 교수 미접속'}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="act">
        <button className="ask" onClick={() => { setQText(''); setAsking(true) }}>✋ 질문하기</button>
        <button className="ibtn save" onClick={share}>💾 저장</button>
      </footer>

      {asking && (
        <div className="modal-backdrop" onClick={() => setAsking(false)}>
          <div className="modal-card q-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">✋ 질문하기</h2>
            <p className="modal-desc">질문을 입력하면 교수자 화면에 번역되어 전달됩니다.</p>
            <input className="q-name-in" value={qName} onChange={(e) => setQName(e.target.value)} placeholder="이름 (선택)" autoComplete="off" />
            <textarea
              className="q-text-in" value={qText} rows={4} autoFocus
              onChange={(e) => setQText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendQuestion() }}
              placeholder="질문 내용을 입력하세요"
            />
            <p className="modal-desc q-soon">✏️ 펜 글씨 입력은 준비 중입니다.</p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setAsking(false)}>취소</button>
              <button className="primary modal-ok" disabled={!qText.trim()} onClick={sendQuestion}>보내기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
