// Gemini API 키는 환경변수(VITE_GEMINI_API_KEY — Vercel/.env.local)에서만 읽는다.
// (예전 설정 화면의 키 입력/기본 언어는 제거됨)

export const DEFAULT_LANGUAGE = '한국어' // 강의 원문(소스) 언어 — 교수가 말하는 언어
export const DEFAULT_OUTPUT_LANGUAGE = '한국어' // 화면 기본 출력 언어(학생·교수 공통)

// 본인 키 우선(localStorage), 없으면 기본 키(env). 본인 키는 이 브라우저에만 저장되고
// 빌드 번들에 들어가지 않는다(= 남에게 노출 안 됨). env 기본 키는 번들에 포함됨.
const API_KEY_STORE = 'ltx.geminiKey'
export function getStoredApiKey(): string {
  try { return (localStorage.getItem(API_KEY_STORE) ?? '').trim() } catch { return '' }
}
export function setStoredApiKey(k: string): void {
  try { const v = k.trim(); if (v) localStorage.setItem(API_KEY_STORE, v); else localStorage.removeItem(API_KEY_STORE) } catch { /* noop */ }
}
export function hasStoredApiKey(): boolean { return getStoredApiKey().length > 0 }

export function getEffectiveApiKey(): string {
  return getStoredApiKey() || (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim()
}

export function hasApiKey(): boolean {
  return getEffectiveApiKey().length > 0
}

// ── 교수자 로그인(간단 게이트) ──────────────────────────────────────
// 아무나 방을 만들지 못하게 막는 클라이언트 측 잠금.
// (참고: 클라이언트 측 잠금이라 번들을 뜯어보면 비밀번호가 노출됨 — 캐주얼 차단용.
//  진짜 보안은 방 비밀번호 + Supabase RLS가 담당한다.)
// 세션당 잠금 해제 — 기억하지 않음. 앱을 새로 열 때마다 항상 잠긴 상태로 시작한다.
const INSTRUCTOR_PASSCODE = '19220'
const PERSONAL_PASSCODE = (import.meta.env.VITE_PERSONAL_PASSCODE ?? '0426309660').trim()

// 맞으면 시작 모드 반환('lecture'|'personal'), 틀리면 null. 두 비번 모두 교수자 잠금 해제.
export function unlockInstructor(passcode: string): 'lecture' | 'personal' | null {
  const p = passcode.trim()
  return p === INSTRUCTOR_PASSCODE ? 'lecture' : p === PERSONAL_PASSCODE ? 'personal' : null
}
