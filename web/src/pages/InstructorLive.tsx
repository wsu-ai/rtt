import { useEffect, useRef, useState } from 'react'
import type { InstructorSession } from '../App'
import { getEffectiveApiKey, DEFAULT_LANGUAGE } from '../lib/settings'
import { LANGUAGES, codeOf } from '../lib/languages'
import { startInstructorBroadcast, type BcHandle, type BcStatus } from '../lib/instructorLive'
import { startLiveTranslate, type LiveHandle } from '../lib/liveTranslate'
import { hostRoom, endRoom, touchRoom, endRoomBeacon, SOURCE_LANG, type HostHandle, type LangCounts } from '../lib/room'
import { translateText } from '../lib/translateText'
import { logDebug } from '../lib/debugLog'
import { startVoicePublish, voiceConfigured, type VoicePublisher } from '../lib/voice'

const CAPTION_LABELS = ['번역만', '원문+번역']
type Mode = 'lecture' | 'personal'
// 학생 보기에 쌓이는 질문(교수 언어로 번역됨)
type QView = { id: string; original: string; translated: string; name?: string; ts: number }

function labelOf(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code
}

export default function InstructorLive({ session, onLeave }: { session: InstructorSession; onLeave: () => void }) {
  const [mode, setMode] = useState<Mode>(session.mode ?? 'lecture')
  const [status, setStatus] = useState<BcStatus | 'idle'>('idle')
  const [micOn, setMicOn] = useState(false)
  const [error, setError] = useState('')
  const [counts, setCounts] = useState<LangCounts>({})
  const [capped, setCapped] = useState<string[]>([])
  const [toast, setToast] = useState('')

  // 기본 뷰 = 자막(강의·개인 공통). 강의 모드 [학생] 토글 → 현황 요약 + 질문 피드
  const [view, setView] = useState<'captions' | 'student'>('captions')
  const [viewLang, setViewLang] = useState(DEFAULT_LANGUAGE)
  const [captionMode, setCaptionMode] = useState(1)
  const [big, setBig] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false) // 개인 모드: 번역 음성 재생
  const [srcFinals, setSrcFinals] = useState<string[]>([])
  const [srcInterim, setSrcInterim] = useState('')
  const [transFinals, setTransFinals] = useState<string[]>([])
  const [transInterim, setTransInterim] = useState('')
  const [questions, setQuestions] = useState<QView[]>([]) // 학생 질문(최신이 아래로)
  const [qUnread, setQUnread] = useState(0)               // 자막 보는 중 도착한 새 질문 수

  const bcRef = useRef<BcHandle | null>(null)       // 강의 모드(방송)
  const voicePubRef = useRef<VoicePublisher | null>(null) // 강의 모드 번역 음성 송출(LiveKit)
  const liveRef = useRef<LiveHandle | null>(null)   // 개인 모드(단일기기+음성)
  const hostRef = useRef<HostHandle | null>(null)
  const srcRef = useRef<HTMLDivElement | null>(null)
  const transRef = useRef<HTMLDivElement | null>(null)
  const sentAtRef = useRef<Record<string, number>>({})
  const countsRef = useRef<LangCounts>({})
  const viewRef = useRef<'captions' | 'student'>('captions')
  const viewLangRef = useRef(codeOf(DEFAULT_LANGUAGE))
  const viewLangLabelRef = useRef(DEFAULT_LANGUAGE)
  const qFeedRef = useRef<HTMLDivElement | null>(null)
  const voiceOnRef = useRef(false)
  // 모드별 자막 기록 보관 — 전환해도 각 모드 기록 유지, 서로 안 섞임
  const stashRef = useRef<Record<Mode, { sf: string[]; si: string; tf: string[]; ti: string }>>({
    lecture: { sf: [], si: '', tf: [], ti: '' },
    personal: { sf: [], si: '', tf: [], ti: '' },
  })

  const apiKey = getEffectiveApiKey()
  const studentTotal = Object.values(counts).reduce((a, b) => a + b, 0)

  function syncLangs() {
    const langs = new Set(Object.keys(countsRef.current))
    if (viewRef.current === 'captions') langs.add(viewLangRef.current)
    bcRef.current?.setLanguages(Array.from(langs))
  }

  function publishCap(lang: string, text: string, final: boolean) {
    const h = hostRef.current; if (!h) return
    if (final) { sentAtRef.current[lang] = 0; h.publish({ lang, text, final: true }); return }
    const now = Date.now()
    if (now - (sentAtRef.current[lang] || 0) < 300) return
    sentAtRef.current[lang] = now
    h.publish({ lang, text, final: false })
  }

  useEffect(() => {
    hostRef.current = hostRoom(
      session.code,
      (c) => { countsRef.current = c; setCounts(c); syncLangs() },
      (q) => {
        // 질문 수신 → 즉시 목록에 추가(원문) 후 교수 보기 언어로 번역해 채움. 최신이 아래로.
        // 같은 언어여도 항상 번역 호출 — 학생 자막언어 ≠ 실제 타이핑 언어일 수 있음(예: 한국어 자막 보며 베트남어로 질문).
        // translateText는 이미 교수 언어면 원문 그대로 반환하므로 안전.
        setQuestions((prev) => [...prev, { id: q.id, original: q.text, translated: '', name: q.name, ts: q.ts }])
        if (viewRef.current !== 'student') setQUnread((n) => n + 1)
        const key = getEffectiveApiKey()
        if (!key) return
        translateText(key, q.text, viewLangLabelRef.current)
          .then((t) => { if (t) setQuestions((prev) => prev.map((x) => (x.id === q.id ? { ...x, translated: t } : x))) })
          .catch((e) => { logDebug('질문 번역 실패: ' + (e?.message || e)) /* 콘솔 대신 디버그 로그(localStorage) — 원문만 표시 */ })
      },
    )
    return () => {
      hostRef.current?.close(); hostRef.current = null
      bcRef.current?.stop(); bcRef.current = null
      voicePubRef.current?.stop(); voicePubRef.current = null
      liveRef.current?.stop(); liveRef.current = null
    }
  }, [session.code])

  // 하트비트 — 평소 5분, 실패 시 25초 간격 3회 재확인. 닫으면 ~6분 뒤 자동 삭제(3시간 하드캡)
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const NORMAL = 5 * 60 * 1000, RETRY = 25 * 1000
    async function beat(retriesLeft: number) {
      if (stopped) return
      const ok = await touchRoom(session.code, session.password)
      if (stopped) return
      const next = ok || retriesLeft <= 0 ? NORMAL : RETRY
      timer = setTimeout(() => beat(ok ? 3 : retriesLeft - 1), next)
    }
    beat(3)
    const onHide = (e: PageTransitionEvent) => { if (!e.persisted) endRoomBeacon(session.code, session.password) }
    window.addEventListener('pagehide', onHide)
    return () => { stopped = true; clearTimeout(timer); window.removeEventListener('pagehide', onHide) }
  }, [session.code, session.password])

  useEffect(() => {
    if (srcRef.current) srcRef.current.scrollTop = srcRef.current.scrollHeight
    if (transRef.current) transRef.current.scrollTop = transRef.current.scrollHeight
  }, [srcFinals, srcInterim, transFinals, transInterim, captionMode, view, mode])

  useEffect(() => {
    if (view === 'student' && qFeedRef.current) qFeedRef.current.scrollTop = qFeedRef.current.scrollHeight
  }, [questions, view])

  function stopSessions() {
    bcRef.current?.stop(); bcRef.current = null
    voicePubRef.current?.stop(); voicePubRef.current = null
    liveRef.current?.stop(); liveRef.current = null
    setMicOn(false); setStatus('idle')
  }

  function changeMode(m: Mode) {
    if (m === mode) return
    stopSessions(); setError('')
    // 떠나는 모드 기록 보관 → 들어가는 모드 기록 복원 (모드 간 음성·자막이 섞이지 않게)
    stashRef.current[mode] = { sf: srcFinals, si: srcInterim, tf: transFinals, ti: transInterim }
    const s = stashRef.current[m]
    setSrcFinals(s.sf); setSrcInterim(s.si); setTransFinals(s.tf); setTransInterim(s.ti)
    setMode(m)
    setView('captions'); viewRef.current = 'captions'
  }

  async function startLecture() {
    // 번역 음성 LiveKit 송출 준비(설정돼 있을 때만). 실패해도 자막은 정상 동작.
    if (voiceConfigured()) {
      try { voicePubRef.current = await startVoicePublish(session.code) }
      catch (e: any) { logDebug('음성 송출 시작 실패: ' + (e?.message || e)) }
    }
    bcRef.current = await startInstructorBroadcast(apiKey, {
      onSource: (text, final) => {
        if (final) { setSrcFinals((p) => [...p, text]); setSrcInterim('') } else setSrcInterim(text)
        publishCap(SOURCE_LANG, text, final)
      },
      onCaption: (lang, text, final) => {
        publishCap(lang, text, final)
        if (lang === viewLangRef.current) {
          if (final) { setTransFinals((p) => [...p, text]); setTransInterim('') } else setTransInterim(text)
        }
      },
      onAudio: (lang, b64) => { voicePubRef.current?.pushAudio(lang, b64) },
      onActiveLangs: (langs) => { voicePubRef.current?.setLanguages(langs) }, // 비활성 언어 음성 트랙 정리(누적 방지)
      onCapped: (langs) => { setCapped(langs); logDebug('[bc] 동시 세션 한도 초과 거부: ' + langs.join(',')) },
      onStatus: (s, d) => { setStatus(s); if (s === 'error') setError(d || '연결 오류') },
      onLog: (m) => logDebug('[bc] ' + m), // 세션 열림/닫힘/실패/재연결 등 → ltxDumpLog로 진단
    })
    syncLangs()
  }

  async function startPersonal() {
    liveRef.current = await startLiveTranslate(apiKey, viewLangRef.current, {
      onInterim: (src, text) => { setSrcInterim(src); setTransInterim(text) },
      onFinal: (src, text) => {
        if (src) setSrcFinals((p) => [...p, src])
        if (text) setTransFinals((p) => [...p, text])
        setSrcInterim(''); setTransInterim('')
      },
      onStatus: (s, d) => { setStatus(s === 'paused' ? 'live' : (s as BcStatus)); if (s === 'error') setError(d || '연결 오류') },
    })
    liveRef.current.setAudioEnabled(voiceOnRef.current)
  }

  async function toggleMic() {
    setError('')
    if (!apiKey) { setError('Gemini API 키가 없습니다.'); return }
    const running = mode === 'lecture' ? bcRef.current : liveRef.current
    if (!running) {
      try {
        if (mode === 'lecture') await startLecture(); else await startPersonal()
        setMicOn(true)
      } catch (e: any) { setStatus('error'); setError(e?.message || String(e)) }
    } else if (mode === 'lecture') {
      const on = !micOn; setMicOn(on); bcRef.current!.setMicEnabled(on)
    } else {
      liveRef.current!.stop(); liveRef.current = null; setMicOn(false); setStatus('idle')
    }
  }

  function changeView(v: 'captions' | 'student') {
    setView(v); viewRef.current = v
    if (v === 'student') setQUnread(0)
    syncLangs()
  }

  function changeViewLang(label: string) {
    setViewLang(label); viewLangRef.current = codeOf(label); viewLangLabelRef.current = label
    setTransFinals([]); setTransInterim('')
    if (mode === 'lecture') { syncLangs(); return }
    // 개인 모드: 대상 언어가 세션에 고정되므로 재시작
    setSrcFinals([]); setSrcInterim('')
    if (liveRef.current) {
      liveRef.current.stop(); liveRef.current = null; setMicOn(false); setStatus('idle')
      void startPersonal().then(() => setMicOn(true)).catch((e: any) => { setStatus('error'); setError(e?.message || String(e)) })
    }
  }

  function toggleVoice() {
    const on = !voiceOn
    setVoiceOn(on); voiceOnRef.current = on
    liveRef.current?.setAudioEnabled(on)
  }

  function flash(m: string) { setToast(m); setTimeout(() => setToast(''), 1500) }
  async function share() {
    const srcText = srcFinals.join('\n').trim()
    const transText = transFinals.join('\n').trim()
    const blocks: string[] = []
    if (srcText) blocks.push(`[원문]\n${srcText}`)
    if (transText) blocks.push(`[번역문]\n${transText}`)
    const text = blocks.join('\n\n')
    if (!text) { flash('보낼 자막이 없어요'); return }
    const title = `${session.title || '강의'} · ${session.code} 자막`
    if (navigator.share) { try { await navigator.share({ title, text }) } catch { /* 취소 */ } return }
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`
  }

  function leave() {
    stopSessions()
    endRoom(session.code, session.password)
    hostRef.current?.close(); hostRef.current = null
    onLeave()
  }

  const connecting = status === 'connecting'
  const badge = connecting ? '연결 중' : micOn ? 'LIVE' : 'OFF'
  const bars = Object.entries(counts).sort((a, b) => b[1] - a[1])
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
          <button className="back" onClick={leave} aria-label="강의 종료">‹</button>
          <div className="title">{session.title || '강의'} · {session.code}</div>
          <span className={'live-badge' + (micOn && !connecting ? '' : ' off')}><span className="dot" />{badge}</span>
          <button className={'gear-btn fontsize' + (big ? ' on' : '')} onClick={() => setBig((b) => !b)} aria-label="글자 크기" title="글자 크기">
            <span className="fa-sm">A</span><span className="fa-lg">A</span>
          </button>
        </div>
        <div className="ctrls">
          <span className="seg mode-seg">
            <button className={mode === 'lecture' ? 'on' : ''} onClick={() => changeMode('lecture')}>강의</button>
            <button className={mode === 'personal' ? 'on' : ''} onClick={() => changeMode('personal')}>개인</button>
          </span>
          <select className="lang-select" value={viewLang} onChange={(e) => changeViewLang(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.label}>{l.label}</option>)}
          </select>
          {/* 자막 탭: 누르면 자막 보기(초록). 이미 자막 보기면 원문+번역 ↔ 번역만 전환 */}
          <button
            className={'chip cap-toggle' + (view === 'captions' ? ' on' : '')}
            onClick={() => (view === 'captions' ? setCaptionMode((m) => (m + 1) % 2) : changeView('captions'))}
          >{CAPTION_LABELS[captionMode]}</button>
          {mode === 'lecture' ? (
            <span className="view-wrap">
              <button className={'chip view-toggle' + (view === 'student' ? ' on' : '')} onClick={() => changeView('student')}>학생</button>
              {qUnread > 0 && view !== 'student' && <span className="qbadge">{qUnread > 9 ? '9+' : qUnread}</span>}
            </span>
          ) : (
            <button className={'chip view-toggle' + (voiceOn ? ' on' : '')} onClick={toggleVoice}>{voiceOn ? '🔊 음성' : '🔈 음성'}</button>
          )}
        </div>
      </header>

      {mode === 'lecture' && view === 'student' ? (
        <div className="stage stu-stage">
          <div className="stu-summary">
            <div className="stu-sum-head">
              <span className="stu-sum-num">{studentTotal}</span>
              <span className="stu-sum-label">접속 중인 수강생</span>
            </div>
            {bars.length > 0 && (
              <div className="stu-sum-langs">
                {bars.map(([code, n]) => (
                  <span className="stu-lang-chip" key={code}>{labelOf(code)} <b>{n}</b></span>
                ))}
              </div>
            )}
            {capped.length > 0 && (
              <p className="stu-warn">⚠ 동시 한도 초과 — {capped.map(labelOf).join(', ')} 미번역 (API 키 추가 필요)</p>
            )}
          </div>
          <div className="q-feed" ref={qFeedRef}>
            {questions.length === 0 ? (
              <p className="q-empty">아직 들어온 질문이 없습니다.<br />학생이 「질문하기」로 보내면 여기에 표시됩니다.</p>
            ) : (
              questions.map((q) => {
                const time = new Date(q.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                return (
                  <div className="q-card" key={q.id}>
                    <p className="q-trans">{q.translated || q.original}</p>
                    {q.translated && q.translated !== q.original && <p className="q-orig">{q.original}</p>}
                    <p className="q-meta">{[q.name, time].filter(Boolean).join(' · ')}</p>
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : (
        <div className={'stage' + (big ? ' big' : '')}>
          {!hasContent ? (
            <div className="placeholder">
              <p className="ph-title">{mode === 'personal' ? '🎧 개인 통역' : '🎤 강의 통역'}</p>
              <p className="ph-desc">
                마이크를 켜고 말하면 원문과 <b>{viewLang}</b> 번역이 표시됩니다.
                {mode === 'personal' && ' 🔈 음성을 켜면 번역 음성이 재생됩니다.'}
              </p>
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
      )}

      {error && <div className="err-bar">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      <footer className="act">
        <button className={'ask' + (micOn ? ' stop' : '')} onClick={toggleMic} disabled={connecting}>
          {connecting ? '연결 중…' : micOn ? '⏸ 마이크 끄기' : '🎤 마이크 켜기'}
        </button>
        <button className="ibtn save" onClick={share}>💾 저장</button>
      </footer>
    </div>
  )
}
