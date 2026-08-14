import { GoogleGenAI } from '@google/genai'

// 학생 질문 등 짧은 텍스트를 교수 언어로 번역한다.
// 음성(Live Translate)과 별개의 가벼운 텍스트 호출 — 질문은 저빈도.
// 무료 한도가 큰 gemini-3.1-flash-lite 사용(15 RPM·500 RPD). 2.5-flash는 5 RPM·20 RPD라 부족(한도 초과 발생함).
// 단순 번역이라 라이트 모델로 충분. (3.x는 thinkingBudget 대신 thinkingLevel을 쓰므로, 무효 파라미터를 피해 thinking 설정은 생략 = 기본값.)
const MODEL = 'gemini-3.1-flash-lite'

export async function translateText(apiKey: string, text: string, targetLabel: string): Promise<string> {
  const clean = text.trim()
  if (!clean || !apiKey) return ''
  const ai = new GoogleGenAI({ apiKey })
  const prompt =
    `다음 텍스트를 ${targetLabel}(으)로 자연스럽게 번역해줘. ` +
    `번역문만 출력하고 따옴표·설명·원문은 넣지 마. 이미 ${targetLabel}면 그대로 반환해.\n\n` +
    `텍스트:\n${clean}`
  const res = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: { temperature: 0 },
  })
  return (res.text ?? '').trim()
}
