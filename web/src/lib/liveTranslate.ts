import { GoogleGenAI } from '@google/genai'

export type LiveStatus = 'connecting' | 'live' | 'paused' | 'closed' | 'error'

export type LiveCallbacks = {
  onInterim: (src: string, text: string) => void
  onFinal: (src: string, text: string) => void
  onStatus: (status: LiveStatus, detail?: string) => void
  onLog?: (msg: string) => void
}

export type LiveHandle = {
  stop: () => void
  pause: () => void
  resume: () => void
  setAudioEnabled: (on: boolean) => void
}

const MODEL = 'gemini-3.5-live-translate-preview'
const SEND_RATE = 16000
const RECV_RATE = 24000

export async function startLiveTranslate(
  apiKey: string,
  targetLanguageCode: string,
  cb: LiveCallbacks,
): Promise<LiveHandle> {
  const log = (m: string) => { cb.onLog?.(m); console.debug('[live]', m) }

  cb.onStatus('connecting')
  log(`시작 · target=${targetLanguageCode} · key=${apiKey ? `있음(${apiKey.length}자)` : '없음'} · secure=${window.isSecureContext}`)

  if (!navigator.mediaDevices?.getUserMedia) {
    const msg = '이 환경에선 마이크를 쓸 수 없습니다. localhost 또는 HTTPS에서만 가능합니다. (폰에서 http://192.168…로 접속했다면 차단됨)'
    log(msg); cb.onStatus('error', msg); throw new Error(msg)
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    log('마이크 확보됨')
  } catch (e: any) {
    const msg = '마이크 권한이 거부됐거나 장치가 없습니다: ' + (e?.message || e)
    log(msg); cb.onStatus('error', msg); throw new Error(msg)
  }

  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

  // --- mic input (16 kHz) ---
  const inCtx = new Ctor({ sampleRate: SEND_RATE })
  log(`AudioContext in=${inCtx.sampleRate}`)
  const sourceNode = inCtx.createMediaStreamSource(stream)
  const processor = inCtx.createScriptProcessor(2048, 1, 1)
  const muteNode = inCtx.createGain()
  muteNode.gain.value = 0

  // --- translated audio playback (24 kHz) ---
  let outCtx: AudioContext | null = null
  let playCursor = 0
  let audioEnabled = false
  let audioLogged = false
  const ensureOut = (): AudioContext => {
    if (!outCtx) outCtx = new Ctor({ sampleRate: RECV_RATE })
    if (outCtx.state === 'suspended') outCtx.resume().catch(() => { /* noop */ })
    return outCtx
  }
  const playChunk = (b64: string) => {
    if (!audioEnabled) return
    let ctx: AudioContext
    try { ctx = ensureOut() } catch { return }
    const bytes = base64ToBytes(b64)
    if (bytes.length < 2) return
    const count = Math.floor(bytes.length / 2)
    const i16 = new Int16Array(bytes.buffer, 0, count)
    const f32 = new Float32Array(count)
    for (let i = 0; i < count; i++) f32[i] = i16[i] / 0x8000
    const buf = ctx.createBuffer(1, count, RECV_RATE)
    buf.getChannelData(0).set(f32)
    const node = ctx.createBufferSource()
    node.buffer = buf
    node.connect(ctx.destination)
    const t = ctx.currentTime
    if (playCursor < t + 0.05) playCursor = t + 0.05
    node.start(playCursor)
    playCursor += buf.duration
    if (!audioLogged) { audioLogged = true; log('번역 음성 수신·재생 중') }
  }

  let srcBuf = ''
  let outBuf = ''
  let closed = false
  let paused = false
  let session: any = null
  let chunks = 0

  const cleanup = () => {
    try { processor.disconnect() } catch { /* noop */ }
    try { sourceNode.disconnect() } catch { /* noop */ }
    try { muteNode.disconnect() } catch { /* noop */ }
    stream.getTracks().forEach((t) => t.stop())
    inCtx.close().catch(() => { /* noop */ })
    try { outCtx?.close() } catch { /* noop */ }
    try { session?.close?.() } catch { /* noop */ }
  }

  const config: any = {
    responseModalities: ['AUDIO'],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    translationConfig: { targetLanguageCode, echoTargetLanguage: true },
  }

  const ai = new GoogleGenAI({ apiKey })

  // 세션이 끊기면(15분 한도·네트워크 등) 자동 재연결. 화면 자막은 화면 쪽에 남아 유지되고,
  // 잃는 건 재연결 ~1초 사이의 음성뿐. 의도적 stop() 시엔 재연결하지 않는다.
  let reconnects = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let useCompression = true // A: 압축으로 15분 한도 제거 시도. 거부/즉시종료면 끄고 B(재연결) 폴백
  let openedAt = 0
  const callbacks = {
    onopen: () => { openedAt = Date.now(); reconnects = 0; log('세션 열림 ✓' + (useCompression ? ' (압축)' : '')); cb.onStatus('live') },
    onmessage: (message: any) => {
      const sc = message?.serverContent
      if (!sc) return
      if (sc.inputTranscription?.text) srcBuf += sc.inputTranscription.text
      if (sc.outputTranscription?.text) outBuf += sc.outputTranscription.text
      if (sc.inputTranscription?.text || sc.outputTranscription?.text) cb.onInterim(srcBuf, outBuf)
      const parts = sc.modelTurn?.parts
      if (Array.isArray(parts)) { for (const p of parts) if (p?.inlineData?.data) playChunk(p.inlineData.data) }
      if (sc.turnComplete || sc.generationComplete) {
        if (srcBuf.trim() || outBuf.trim()) cb.onFinal(srcBuf.trim(), outBuf.trim())
        srcBuf = ''; outBuf = ''
      }
    },
    onerror: (e: any) => log('onerror: ' + (e?.message || JSON.stringify(e))), // 재연결(onclose)이 처리
    onclose: (e: any) => {
      log('세션 닫힘: ' + (e?.reason || ''))
      session = null; srcBuf = ''; outBuf = ''
      if (closed) { cb.onStatus('closed'); return }
      // 압축을 켰는데 곧바로 닫혔으면 미지원으로 보고 끈다(이후 B 재연결로 동작)
      if (useCompression && openedAt && Date.now() - openedAt < 10000) { useCompression = false; log('압축 미지원 추정 → 끄고 재연결') }
      reconnect()
    },
  }
  const connectSession = async () => {
    const cfg = useCompression ? { ...config, contextWindowCompression: { slidingWindow: {} } } : config
    try { session = await ai.live.connect({ model: MODEL, config: cfg, callbacks }) }
    catch (e) {
      if (!useCompression) throw e
      useCompression = false; log('압축 옵션 거부 → 압축 없이 연결')
      session = await ai.live.connect({ model: MODEL, config, callbacks })
    }
  }
  const reconnect = () => {
    if (closed || reconnectTimer) return
    reconnects++
    if (reconnects > 10) { cb.onStatus('error', '재연결이 반복 실패했습니다. 마이크를 껐다 켜주세요.'); return }
    cb.onStatus('connecting')
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null
      if (closed) return
      try { await connectSession(); log('재연결됨 — 이어서 통역') } catch { reconnect() }
    }, Math.min(600 * reconnects, 3000))
  }

  log('Gemini Live 세션 연결 시도…')
  try {
    await connectSession()
    log('connect() 반환됨')
  } catch (e: any) {
    cleanup()
    const msg = e?.message || String(e)
    log('연결 실패: ' + msg)
    cb.onStatus('error', msg)
    throw new Error(msg)
  }

  processor.onaudioprocess = (ev) => {
    if (closed || paused || !session) return
    const input = ev.inputBuffer.getChannelData(0)
    const pcm = floatToPcm16(input)
    const b64 = bytesToBase64(new Uint8Array(pcm.buffer))
    try {
      session.sendRealtimeInput({ audio: { data: b64, mimeType: `audio/pcm;rate=${SEND_RATE}` } })
      chunks++
      if (chunks === 1 || chunks % 40 === 0) log(`오디오 전송 중… (${chunks})`)
    } catch (e: any) {
      log('오디오 전송 오류: ' + (e?.message || e))
    }
  }

  sourceNode.connect(processor)
  processor.connect(muteNode)
  muteNode.connect(inCtx.destination)
  log('오디오 그래프 연결됨 — 이제 말해보세요')

  return {
    stop: () => {
      if (closed) return
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      cleanup()
      log('중지됨')
      cb.onStatus('closed')
    },
    pause: () => { if (!closed && !paused) { paused = true; log('일시정지'); cb.onStatus('paused') } },
    resume: () => { if (!closed && paused) { paused = false; log('재개'); cb.onStatus('live') } },
    setAudioEnabled: (on: boolean) => {
      audioEnabled = on
      if (on) { try { ensureOut() } catch { /* noop */ } } else { playCursor = 0 }
      log(on ? '음성 재생 켬' : '음성 재생 끔')
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
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
