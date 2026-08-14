import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 방/실시간 백엔드(Supabase). 공개되어도 안전한 anon 키만 사용한다.
// 나중에 학교 서버(자체 WebSocket)로 옮길 때는 lib/room.ts만 교체하면 된다.
// Project URL만 필요하다. 실수로 끝에 `/rest/v1` 나 슬래시가 붙어 들어와도 정규화한다
// (안 그러면 요청 경로가 /rest/v1/rest/v1/... 로 깨져 PGRST125 "Invalid path" 발생).
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!url || !anon) return null
  if (!client) client = createClient(url, anon, { realtime: { params: { eventsPerSecond: 20 } } })
  return client
}

export function hasSupabase(): boolean {
  return Boolean(url && anon)
}
