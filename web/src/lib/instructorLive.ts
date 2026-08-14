import { GoogleGenAI } from '@google/genai'

// 프리뷰 전용 다중 세션 통역 브로드캐스트(교수 기기).
// 교수 마이크 1개 → 활성 언어마다 Live Translate 세션 1개(동시 N개)를 열어
//   - inputTranscription(원문) : 한 세션만 담당해 onSource로
//   - outputTranscription(번역) : 각 세션이 onCaption(lang,…)으로 스트리밍
// 동시 세션 한도를 추측하지 않는다 — 세션을 열어보고 거부되면 onCapped로 알림(적응형).
// flash 텍스트 모델(translate.ts)은 더 이상 쓰지 않는다(프리뷰만).

export type BcStatus = 'connecting' | 'live' | 'closed' | 'error'
export type BcCallbacks = {
  onSource: (text: string, final: boolean) => void
  onCaption: (lang: string, text: string, final: boolean) => void
  onActiveLangs: (langs: string[]) => void
  onCapped: (langs: string[]) => void
  onStatus: (s: BcStatus, detail?: string) => void
  onAudio?: (lang: string, b64: string) => void // 언어별 번역 음성(24kHz PCM base64) — LiveKit 송출용
  onLog?: (m: string) => void
}
export type BcHandle = {
  setLanguages: (langs: string[]) => void
  setMicEnabled: (on: boolean) => void
  stop: () => void
}

const MODEL = 'gemini-3.5-live-translate-preview'
const RATE = 16000
const ANCHOR = 'en' // 학생 0명일 때도 원문 전사가 흐르도록 기본 1개 세션

export async function startInstructorBroadcast(apiKey: string, cb: BcCallbacks): Promise<BcHandle> {
  const log = (m: string) => { cb.onLog?.(m); console.debug('[bc]', m) }
  cb.onStatus('connecting')

  if (!navigator.mediaDevices?.getUserMedia) {
    const m = '이 환경에선 마이크를 쓸 수 없습니다 (HTTPS 또는 localhost 필요).'
    cb.onStatus('error', m); throw new Error(m)
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
    log('마이크 확보됨')
  } catch (e: any) {
    const m = '마이크 권한이 거부됐거나 장치가 없습니다: ' + (e?.message || e)
    cb.onStatus('error', m); throw new Error(m)
  }

  const Ctor: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctor({ sampleRate: RATE })
  const srcNode = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(2048, 1, 1)
  const mute = ctx.createGain(); mute.gain.value = 0

  const ai = new GoogleGenAI({ apiKey })

  type Entry = { session: any; outBuf: string; srcBuf: string; lastActivity: number; openedAt: number }
  const sessions = new Map<string, Entry>()
  const reconnectAttempts = new Map<string, number>()
  let sourceLang: string | null = null
  let closed = false
  let micOn = true
  let live = false
  let useCompression = true // A: 압축으로 15분 한도 제거 시도. 거부/즉시종료면 끄고 B(재연결) 폴백

  const openOne = async (lang: string): Promise<boolean> => {
    if (sessions.has(lang)) return true
    const entry: Entry = { session: null, outBuf: '', srcBuf: '', lastActivity: 0, openedAt: 0 }
    const base: any = {
      responseModalities: ['AUDIO'],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      translationConfig: { targetLanguageCode: lang, echoTargetLanguage: true },
    }
    const callbacks = {
      onopen: () => { entry.openedAt = Date.now(); if (!live) { live = true; cb.onStatus('live') } log('세션 열림: ' + lang + (useCompression ? ' (압축)' : '')) },
      onmessage: (msg: any) => {
        const sc = msg?.serverContent; if (!sc) return
        // 번역 음성(모델 audio-out) — 지금까지 버리던 것. 언어별로 따서 LiveKit 송출용으로 넘긴다.
        const parts = sc.modelTurn?.parts
        if (Array.isArray(parts)) { for (const p of parts) if (p?.inlineData?.data) cb.onAudio?.(lang, p.inlineData.data) }
        if (sc.inputTranscription?.text && lang === sourceLang) {
          entry.srcBuf += sc.inputTranscription.text
          entry.lastActivity = Date.now()
          cb.onSource(entry.srcBuf, false)
        }
        if (sc.outputTranscription?.text) {
          entry.outBuf += sc.outputTranscription.text
          entry.lastActivity = Date.now()
          cb.onCaption(lang, entry.outBuf, false)
        }
        if (sc.turnComplete || sc.generationComplete) {
          if (lang === sourceLang && entry.srcBuf.trim()) cb.onSource(entry.srcBuf.trim(), true)
          if (entry.outBuf.trim()) cb.onCaption(lang, entry.outBuf.trim(), true)
          entry.srcBuf = ''; entry.outBuf = ''
        }
      },
      onerror: (e: any) => log('세션 오류(' + lang + '): ' + (e?.message || JSON.stringify(e))),
      onclose: () => {
        log('세션 닫힘: ' + lang)
        if (closed || !sessions.has(lang)) return // 전체 중지/의도적 종료면 재연결 안 함
        // 압축을 켰는데 곧바로 닫혔으면 미지원으로 보고 끈다(이후 압축 없이 재연결)
        if (useCompression && entry.openedAt && Date.now() - entry.openedAt < 10000) { useCompression = false; log('압축 미지원 추정 → 끄고 재연결') }
        sessions.delete(lang) // 죽은 세션 제거 → 자동 재연결(15분 한도·네트워크 끊김 등)
        cb.onActiveLangs(Array.from(sessions.keys()))
        reopen(lang)
      },
    }
    try {
      try {
        entry.session = await ai.live.connect({ model: MODEL, config: useCompression ? { ...base, contextWindowCompression: { slidingWindow: {} } } : base, callbacks })
      } catch (e: any) {
        if (!useCompression) throw e
        useCompression = false; log('압축 옵션 거부 → 압축 없이 연결: ' + lang)
        entry.session = await ai.live.connect({ model: MODEL, config: base, callbacks })
      }
      sessions.set(lang, entry)
      reconnectAttempts.set(lang, 0)
      if (!sourceLang) sourceLang = lang
      cb.onActiveLangs(Array.from(sessions.keys()))
      return true
    } catch (e: any) {
      log('세션 열기 실패(' + lang + '): ' + (e?.message || e))
      return false
    }
  }

  const closeOne = (lang: string) => {
    const e = sessions.get(lang); if (!e) return
    sessions.delete(lang) // 먼저 제거 → onclose가 자동 재연결을 시도하지 않도록
    if (sourceLang === lang) sourceLang = sessions.keys().next().value ?? null
    try { e.session?.close?.() } catch { /* noop */ }
    cb.onActiveLangs(Array.from(sessions.keys()))
  }

  // 예기치 않은 종료 시 자동 재연결(화면 자막은 컴포넌트에 남아 유지됨; ~1초 공백만 발생)
  const reopen = (lang: string) => {
    if (closed) return
    const n = (reconnectAttempts.get(lang) ?? 0) + 1
    reconnectAttempts.set(lang, n)
    if (n > 8) { log('재연결 포기(' + lang + ') — 마이크를 껐다 켜주세요'); return }
    setTimeout(async () => {
      if (closed || sessions.has(lang)) return
      const ok = await openOne(lang) // 성공 시 openOne이 attempts를 0으로 리셋
      if (!ok && !closed) reopen(lang)
    }, Math.min(500 * n, 3000))
  }

  let applying = false
  let pendingLangs: string[] | null = null
  let langTimer: ReturnType<typeof setTimeout> | null = null
  let lastWant: string[] = [ANCHOR]
  let capRetries = 0
  const apply = async (langs: string[]) => {
    const want = langs.length ? Array.from(new Set(langs)) : [ANCHOR]
    lastWant = want
    if (applying) { pendingLangs = want; return }
    applying = true
    for (const lang of Array.from(sessions.keys())) if (!want.includes(lang)) closeOne(lang)
    const capped: string[] = []
    for (const lang of want) {
      if (closed) break
      if (sessions.has(lang)) continue
      const ok = await openOne(lang)
      if (!ok) capped.push(lang)
    }
    if (capped.length) cb.onCapped(capped)
    if (!closed && sessions.size === 0) cb.onStatus('error', '세션을 열 수 없습니다. API 키·네트워크를 확인하세요.')
    applying = false
    if (pendingLangs && !closed) { const p = pendingLangs; pendingLangs = null; void apply(p); return }
    // 세션 churn(빠른 여닫기)으로 일시 거부되면 잠시 후 재시도 — 닫히는 세션이 풀리면 성공. 성공하면 카운터 리셋.
    if (capped.length && !closed) {
      if (capRetries < 5) { capRetries++; setTimeout(() => { if (!closed && !applying) void apply(lastWant) }, 2000) }
    } else { capRetries = 0 }
  }

  proc.onaudioprocess = (ev) => {
    if (closed || !micOn || sessions.size === 0) return
    const b64 = bytesToBase64(new Uint8Array(floatToPcm16(ev.inputBuffer.getChannelData(0)).buffer))
    for (const e of sessions.values()) {
      try { e.session?.sendRealtimeInput({ audio: { data: b64, mimeType: `audio/pcm;rate=${RATE}` } }) } catch { /* noop */ }
    }
  }
  srcNode.connect(proc); proc.connect(mute); mute.connect(ctx.destination)

  await apply([]) // 앵커 세션으로 시작 → 원문 전사 흐름

  // turnComplete가 안 와도 발화가 잠깐 멈추면(>1.2s) 버퍼를 확정 처리한다.
  // (안 그러면 자막이 영영 interim에 머물러 확정/보내기/스크롤이 안 됨)
  const flushTimer = setInterval(() => {
    if (closed) return
    const now = Date.now()
    for (const [lang, e] of sessions) {
      if ((!e.srcBuf && !e.outBuf) || now - e.lastActivity < 1200) continue
      if (lang === sourceLang && e.srcBuf.trim()) { cb.onSource(e.srcBuf.trim(), true); e.srcBuf = '' }
      if (e.outBuf.trim()) { cb.onCaption(lang, e.outBuf.trim(), true); e.outBuf = '' }
    }
  }, 700)

  log('준비됨 — 말해보세요')

  return {
    setLanguages: (langs) => {
      // 빠르게 여러 번 바뀌면 마지막 것만 적용 — 세션 churn·동시 한도 초과 방지
      if (langTimer) clearTimeout(langTimer)
      langTimer = setTimeout(() => { langTimer = null; void apply(langs) }, 300)
    },
    setMicEnabled: (on) => { micOn = on; log(on ? '마이크 켬' : '마이크 끔') },
    stop: () => {
      if (closed) return
      closed = true
      if (langTimer) clearTimeout(langTimer)
      clearInterval(flushTimer)
      for (const l of Array.from(sessions.keys())) closeOne(l)
      try { proc.disconnect() } catch { /* noop */ }
      try { srcNode.disconnect() } catch { /* noop */ }
      try { mute.disconnect() } catch { /* noop */ }
      stream.getTracks().forEach((t) => t.stop())
      ctx.close().catch(() => { /* noop */ })
      log('중지됨'); cb.onStatus('closed')
    },
  }
}

function floatToPcm16(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  return btoa(binary)
}
