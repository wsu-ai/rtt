import { getSupabase } from './supabase'
import { logDebug } from './debugLog'

// ── 전송 층(Transport) ──────────────────────────────────────────────
// 방 생성/입장(비밀번호 검증)은 Supabase RPC, 실시간 자막은 Broadcast,
// 수강생 언어 분포는 Presence로 처리한다.
// 학교 서버로 이전 시 이 파일의 구현만 바꾸면 화면/로직은 그대로 둘 수 있다.

export type Caption = { lang: string; text: string; final: boolean }
export type LangCounts = Record<string, number> // langCode -> 인원수
// 학생 → 교수 질문(원문). 교수 기기에서 교수 언어로 번역해 표시한다.
export type Question = { id: string; lang: string; text: string; name?: string; ts: number }

// 원문(교수 발화 그대로)을 싣는 가상 레인. 학생의 "원문+번역"에서 원문 표시에 사용.
// 발화 언어는 Gemini가 자동 인식하므로 교수가 따로 고를 필요가 없다.
export const SOURCE_LANG = '__src__'

// 질문 전용 채널 토픽 — 교수만 구독하고, 학생은 REST broadcast로 publish만 한다.
// (websocket으로 보내려면 채널 구독이 필요 → 다른 학생에게도 팬아웃되어 50~100명일 때 낭비가 큼)
function qTopic(code: string): string { return `room:${code}:q` }

// ── 방 수명주기(RPC) ────────────────────────────────────────────────
export async function createRoom(
  code: string, password: string, title: string,
): Promise<'created' | 'taken' | 'error'> {
  const sb = getSupabase()
  if (!sb) return 'error'
  const { data, error } = await sb.rpc('create_room', {
    p_code: code, p_password: password, p_source_lang: 'auto', p_title: title,
  })
  if (error) return 'error'
  return data === 'taken' ? 'taken' : 'created'
}

export async function verifyRoom(
  code: string, password: string,
): Promise<{ ok: boolean; title?: string }> {
  const sb = getSupabase()
  if (!sb) return { ok: false }
  const { data, error } = await sb.rpc('verify_room', { p_code: code, p_password: password })
  const row = Array.isArray(data) ? data[0] : null
  if (error || !row) return { ok: false }
  return { ok: true, title: row.title }
}

export async function endRoom(code: string, password: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return
  await sb.rpc('end_room', { p_code: code, p_password: password })
}

// 하트비트: 교수자 화면이 열려 있는 동안 주기적으로 호출해 방을 "살아있게" 유지.
// 멈추면(화면 닫힘) 서버가 6분 뒤 자동 정리한다. 성공 여부를 반환(실패 시 호출부가 빠르게 재시도).
export async function touchRoom(code: string, password: string): Promise<boolean> {
  const sb = getSupabase()
  if (!sb) return false
  const { error } = await sb.rpc('touch_room', { p_code: code, p_password: password })
  return !error
}

// 탭이 실제로 닫힐 때 즉시 방을 지우는 best-effort(keepalive fetch). 실패해도 하트비트 만료로 정리됨.
export function endRoomBeacon(code: string, password: string): void {
  const sb = getSupabase() as any
  if (!sb) return
  try {
    fetch(`${sb.supabaseUrl}/rest/v1/rpc/end_room`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: sb.supabaseKey, Authorization: `Bearer ${sb.supabaseKey}` },
      body: JSON.stringify({ p_code: code, p_password: password }),
    }).catch(() => { /* noop */ })
  } catch { /* noop */ }
}

// ── 실시간: 교수(host) ──────────────────────────────────────────────
export type HostHandle = { publish: (c: Caption) => void; close: () => void }

export function hostRoom(
  code: string,
  onLangs: (counts: LangCounts) => void,
  onQuestion?: (q: Question) => void,
): HostHandle {
  const sb = getSupabase()
  if (!sb) return { publish: () => {}, close: () => {} }
  const ch = sb.channel(`room:${code}`, { config: { presence: { key: 'host' }, broadcast: { self: false } } })

  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState() as Record<string, Array<{ role?: string; lang?: string }>>
    const counts: LangCounts = {}
    for (const key in state) {
      // 한 키(=학생 1명)당 최신 presence 1건만 센다. 언어 변경 시 과거 잔재가 남아도 중복 집계 방지.
      const metas = state[key]
      const meta = metas[metas.length - 1]
      if (meta?.role === 'student' && meta.lang) counts[meta.lang] = (counts[meta.lang] ?? 0) + 1
    }
    onLangs(counts)
  })
  ch.subscribe((status) => { logDebug('교수 자막채널: ' + status); if (status === 'SUBSCRIBED') ch.track({ role: 'host' }) })

  // 질문은 별도 채널에서 수신 — 교수만 구독하므로 학생끼리 팬아웃되지 않는다(학생은 REST로 publish만).
  const qch = sb.channel(qTopic(code))
  qch.on('broadcast', { event: 'q' }, ({ payload }) => onQuestion?.(payload as Question))
  qch.subscribe()

  return {
    publish: (c) => { ch.send({ type: 'broadcast', event: 'cap', payload: c }) },
    close: () => { ch.unsubscribe(); qch.unsubscribe() },
  }
}

// ── 실시간: 학생(guest) ─────────────────────────────────────────────
export type GuestHandle = { setLang: (lang: string) => void; sendQuestion: (q: Question) => Promise<boolean>; close: () => void }

// 학생 → 교수 질문 전송. 구독 없이 REST broadcast로 질문 채널에 publish → 교수(구독자)에게만 도달.
// (다른 학생에겐 안 퍼지므로 인원이 많아도 메시지 1건 수준)
export async function sendQuestion(code: string, q: Question): Promise<boolean> {
  const sb = getSupabase() as any
  if (!sb) return false
  try {
    const res = await fetch(`${sb.supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: sb.supabaseKey, Authorization: `Bearer ${sb.supabaseKey}` },
      body: JSON.stringify({ messages: [{ topic: qTopic(code), event: 'q', payload: q }] }),
    })
    return res.ok
  } catch { return false }
}

export function joinRoomChannel(
  code: string, lang: string,
  onCaption: (c: Caption) => void,
  onHostPresence?: (present: boolean) => void,
): GuestHandle {
  const sb = getSupabase()
  if (!sb) return { setLang: () => {}, sendQuestion: async () => false, close: () => {} }
  const supa = sb
  const guestId = (globalThis.crypto?.randomUUID?.() ?? String(performance.now()))
  let cur = lang
  let closed = false
  let gen = 0 // 채널 세대 — 재연결 시 증가, 옛 채널 콜백 무시용
  let chan: ReturnType<typeof supa.channel> | null = null
  let rejoinTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleRejoin() {
    if (closed || rejoinTimer) return
    rejoinTimer = setTimeout(() => { rejoinTimer = null; if (!closed) connect() }, 1500)
  }
  function connect() {
    if (chan) { try { void supa.removeChannel(chan) } catch { /* noop */ } }
    const myGen = ++gen
    const c = supa.channel(`room:${code}`, { config: { presence: { key: guestId } } })
    chan = c
    c.on('broadcast', { event: 'cap' }, ({ payload }) => { if (myGen === gen) onCaption(payload as Caption) })
    if (onHostPresence) {
      // 교수 접속 여부 = 질문 전달 확인용. presence는 이미 흐르고 있어 추가 메시지 0.
      c.on('presence', { event: 'sync' }, () => {
        if (myGen !== gen) return
        const state = c.presenceState() as Record<string, Array<{ role?: string }>>
        let host = false
        for (const k in state) for (const m of state[k]) if (m?.role === 'host') host = true
        onHostPresence(host)
      })
    }
    c.subscribe((status) => {
      if (myGen !== gen) return // 재연결된 뒤 옛 채널 콜백 무시
      logDebug('학생 자막채널: ' + status)
      if (status === 'SUBSCRIBED') { void c.track({ role: 'student', lang: cur }) }
      else if (!closed && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) {
        logDebug('학생 자막채널 끊김 → 재연결 예약'); scheduleRejoin()
      }
    })
  }
  connect()

  return {
    setLang: (l) => {
      cur = l
      const c = chan
      if (!c) return
      // 빠르게 여러 번 바꿔도 "마지막 언어"만 등록되도록(경합 방지)
      void (async () => {
        try { await c.untrack() } catch { /* noop */ }
        if (cur !== l || c !== chan) return
        try { await c.track({ role: 'student', lang: l }) } catch { /* noop */ }
      })()
    },
    sendQuestion: (q) => sendQuestion(code, q),
    close: () => { closed = true; if (rejoinTimer) clearTimeout(rejoinTimer); if (chan) { try { void supa.removeChannel(chan) } catch { /* noop */ } } },
  }
}
