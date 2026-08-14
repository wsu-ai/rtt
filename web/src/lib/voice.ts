import { Room, RoomEvent, Track, type RemoteTrack, type RemoteTrackPublication } from 'livekit-client'
import { logDebug } from './debugLog'

// LiveKit(WebRTC) 음성 송출/청취 래퍼.
// 교수: 언어별 번역 음성을 "언어 이름표" 트랙으로 송출(+ 비활성 언어 트랙 정리). 학생: 자기 언어 트랙 1개만 구독·재생.
// 자막은 Supabase(room.ts)로 그대로, 음성만 여기로. URL만 클라이언트 노출(시크릿은 서버 토큰함수).
const LK_URL = (import.meta.env.VITE_LIVEKIT_URL ?? '').trim()
const RECV_RATE = 24000 // 모델 번역 음성 샘플레이트(24kHz PCM)

export function voiceConfigured(): boolean { return !!LK_URL }

async function fetchToken(code: string, identity: string, role: 'host' | 'guest'): Promise<string> {
  const res = await fetch(`/api/livekit-token?room=${encodeURIComponent(code)}&identity=${encodeURIComponent(identity)}&role=${role}`)
  if (!res.ok) throw new Error('토큰 발급 실패 (' + res.status + ')')
  const data = await res.json()
  if (!data?.token) throw new Error('토큰이 비어 있음')
  return data.token as string
}

// ── 교수: 언어별 번역 음성 송출 ──
export type VoicePublisher = {
  pushAudio: (lang: string, b64: string) => void // 세션에서 온 24kHz PCM(base64) 청크
  setLanguages: (langs: string[]) => void          // 활성 언어만 유지 — 나머지 트랙 unpublish(누적 방지)
  stop: () => void
}

export async function startVoicePublish(code: string): Promise<VoicePublisher> {
  if (!LK_URL) throw new Error('VITE_LIVEKIT_URL 미설정')
  const token = await fetchToken(code, 'host-' + code, 'host')
  const room = new Room()
  await room.connect(LK_URL, token)
  room.on(RoomEvent.Disconnected, () => logDebug('voice(host) 연결 끊김'))
  room.on(RoomEvent.Reconnecting, () => logDebug('voice(host) 재연결 중'))
  room.on(RoomEvent.Reconnected, () => logDebug('voice(host) 재연결됨'))

  const Ctor: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Ctor({ sampleRate: RECV_RATE })
  if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ })

  type Lane = { dest: MediaStreamAudioDestinationNode; cursor: number; track: MediaStreamTrack | null }
  const lanes = new Map<string, Lane>()
  let closed = false

  // 언어별 레인: 첫 오디오가 오면 MediaStream 트랙을 만들어 LiveKit에 publish(트랙명=언어코드)
  const ensureLane = (lang: string): Lane => {
    const existing = lanes.get(lang)
    if (existing) return existing
    const dest = ctx.createMediaStreamDestination()
    const track = dest.stream.getAudioTracks()[0] ?? null
    const lane: Lane = { dest, cursor: 0, track }
    lanes.set(lang, lane)
    if (track && !closed) {
      room.localParticipant.publishTrack(track, { name: lang })
        .then(() => logDebug(`voice publish OK: ${lang} (트랙 ${lanes.size}개)`))
        .catch((e) => logDebug(`voice publish 실패: ${lang} — ${e?.message || e}`))
    }
    return lane
  }

  return {
    pushAudio: (lang, b64) => {
      if (closed) return
      const lane = ensureLane(lang)
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
      node.connect(lane.dest)
      const t = ctx.currentTime
      if (lane.cursor < t + 0.05) lane.cursor = t + 0.05
      node.start(lane.cursor)
      lane.cursor += buf.duration
    },
    setLanguages: (langs) => {
      // 활성 언어가 아닌 레인의 트랙은 unpublish + 제거 — 학생이 언어를 여러 번 바꿔 트랙이 쌓이는 것 방지
      for (const [lang, lane] of Array.from(lanes)) {
        if (!langs.includes(lang)) {
          if (lane.track) { try { room.localParticipant.unpublishTrack(lane.track) } catch { /* noop */ } }
          lanes.delete(lang)
          logDebug(`voice prune: ${lang} (남은 ${lanes.size}개)`)
        }
      }
    },
    stop: () => {
      closed = true
      try { room.disconnect() } catch { /* noop */ }
      ctx.close().catch(() => { /* noop */ })
    },
  }
}

// ── 학생: 자기 언어 트랙 1개만 구독·재생 ──
export type VoiceListener = {
  setLang: (lang: string) => void
  stop: () => void
}

export async function startVoiceListen(code: string, lang: string, identity: string): Promise<VoiceListener> {
  if (!LK_URL) throw new Error('VITE_LIVEKIT_URL 미설정')
  const token = await fetchToken(code, identity, 'guest')
  const room = new Room()
  let cur = lang
  let el: HTMLMediaElement | null = null
  let attachedTrack: RemoteTrack | null = null

  const detach = () => {
    if (el) { try { el.remove() } catch { /* noop */ } el = null }
    attachedTrack = null
  }
  const attach = (track: RemoteTrack) => {
    if (attachedTrack === track && el) return // 이미 이 트랙 재생 중 — 중복 attach 방지
    logDebug('voice listen attach: ' + cur)
    detach()
    attachedTrack = track
    el = track.attach()
    el.setAttribute('playsinline', '')
    el.style.display = 'none'
    document.body.appendChild(el) // 일부 브라우저는 DOM에 붙어 있어야 재생됨(오디오는 숨겨도 들림)
    void el.play().catch(() => { /* noop */ })
  }

  // 현재 언어 트랙만 구독+재생. 이미 구독돼 있으면 이벤트를 기다리지 않고 "바로 attach"
  // → 언어를 바꿨다 돌아왔을 때 소리가 안 나던 문제 해결.
  const apply = () => {
    let curTrack: RemoteTrack | null = null
    room.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        const want = pub.trackName === cur
        if (pub.isSubscribed !== want) pub.setSubscribed(want)
        if (want && pub.track) curTrack = pub.track
      })
    })
    if (curTrack) attach(curTrack)
    else detach() // 현재 언어 트랙이 아직 없음(교수가 그 언어로 아직 말 안 함) → 비움
  }

  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication) => {
    if (pub.trackName === cur && track.kind === Track.Kind.Audio) attach(track)
  })
  room.on(RoomEvent.TrackPublished, () => apply())
  room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
    try { track.detach().forEach((e) => e.remove()) } catch { /* noop */ }
  })

  room.on(RoomEvent.Disconnected, () => logDebug('voice(listen) 연결 끊김'))
  room.on(RoomEvent.Reconnecting, () => logDebug('voice(listen) 재연결 중'))
  room.on(RoomEvent.Reconnected, () => logDebug('voice(listen) 재연결됨'))
  await room.connect(LK_URL, token, { autoSubscribe: false })
  try { await room.startAudio() } catch { /* noop */ }
  apply()

  return {
    setLang: (l) => { cur = l; logDebug('voice listen setLang: ' + l); void room.startAudio().catch(() => { /* noop */ }); apply() },
    stop: () => { detach(); try { room.disconnect() } catch { /* noop */ } },
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
