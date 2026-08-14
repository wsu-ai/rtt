import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AccessToken } from 'livekit-server-sdk'

// LiveKit 입장 토큰(JWT) 발급. 시크릿(LIVEKIT_API_SECRET)은 서버 env에만 둔다 — 번들 노출 X.
// 교수(role=host)=송출 가능, 학생(role=guest)=구독만.
// (v1 보안: 룸 코드만 알면 guest 토큰을 받을 수 있음 = 강의 입장과 동일 수준. host 위변조 방지는 추후 방 비번 검증으로 강화.)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const room = String(req.query.room || '').trim()
  const identity = String(req.query.identity || '').trim()
  const role = String(req.query.role || 'guest')
  if (!room || !identity) {
    res.status(400).json({ error: 'room and identity required' })
    return
  }

  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    res.status(500).json({ error: 'LiveKit not configured on server' })
    return
  }

  const isHost = role === 'host'
  const at = new AccessToken(apiKey, apiSecret, { identity, ttl: '4h' })
  at.addGrant({ roomJoin: true, room, canPublish: isHost, canSubscribe: true, canPublishData: false })
  const token = await at.toJwt()
  res.status(200).json({ token })
}
