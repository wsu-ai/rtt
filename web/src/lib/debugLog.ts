// 디버그 로그 — 화면이나 콘솔에 띄우지 않고 localStorage(ltx.debugLog)에만 최근 100건 누적.
// 디버그 시 브라우저 콘솔에서 ltxDumpLog() 실행 → ltx-debug.txt 파일로 내려받아 참고한다.
const KEY = 'ltx.debugLog'
const MAX = 100

export function logDebug(msg: string): void {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(KEY) || '[]')
    arr.push(`${new Date().toISOString()} ${msg}`)
    localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX)))
  } catch { /* noop */ }
}

// 디버그용: 콘솔에서 ltxDumpLog() 호출 → 누적 로그를 텍스트 파일로 저장
;(globalThis as any).ltxDumpLog = function ltxDumpLog(): void {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(KEY) || '[]')
    const blob = new Blob([arr.join('\n')], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'ltx-debug.txt'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  } catch { /* noop */ }
}

// 콘솔을 못 여는 폰용 — 화면에 로그를 띄우고 복사/공유 제공
export function showDebugLog(): void {
  try {
    const text = (JSON.parse(localStorage.getItem(KEY) || '[]') as string[]).join('\n') || '(로그 없음)'
    const ov = document.createElement('div')
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,10,10,.93);color:#eee;font:12px/1.45 monospace;padding:46px 12px 12px;overflow:auto'
    const bar = document.createElement('div')
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;display:flex;gap:8px;padding:6px;background:#000'
    const mkBtn = (label: string, fn: () => void) => {
      const b = document.createElement('button')
      b.textContent = label
      b.style.cssText = 'flex:1;padding:9px;font-size:13px;border:none;border-radius:6px;background:#333;color:#fff'
      b.onclick = fn
      return b
    }
    bar.appendChild(mkBtn('복사', () => { try { void navigator.clipboard?.writeText(text) } catch { /* noop */ } }))
    bar.appendChild(mkBtn('공유', () => { try { void (navigator as unknown as { share?: (d: { text: string }) => Promise<void> }).share?.({ text }) } catch { /* noop */ } }))
    bar.appendChild(mkBtn('닫기', () => ov.remove()))
    const pre = document.createElement('pre')
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:0'
    pre.textContent = text
    ov.appendChild(bar)
    ov.appendChild(pre)
    document.body.appendChild(ov)
  } catch { /* noop */ }
}
