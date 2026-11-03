// 강의 중 화면 자동 꺼짐(스크린 타임아웃) 방지 — Screen Wake Lock API.
// 탭이 숨겨지면 브라우저가 잠금을 자동 해제하므로, 다시 보일 때마다 재요청한다.
// 미지원 브라우저나 요청 실패 시엔 조용히 무시(기존 동작 그대로).
import { useEffect } from 'react'
import { logDebug } from './debugLog'

export function useWakeLock(active = true): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    async function acquire() {
      if (cancelled || document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const l = await navigator.wakeLock.request('screen')
        if (cancelled) { l.release().catch(() => {}); return }
        lock = l
      } catch (e) {
        // 사용자 제스처가 필요한 브라우저(일부 Safari)는 다음 터치 때 재시도
        logDebug(`wakeLock: ${String(e)}`)
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('pointerdown', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('pointerdown', acquire)
      lock?.release().catch(() => {})
      lock = null
    }
  }, [active])
}
