import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS(basicSsl)는 폰에서 LAN IP로 접속해 마이크를 쓰기 위함.
// localhost 미리보기는 http로도 secure context라 마이크가 동작하므로,
// VITE_HTTPS=0 이면 http로 띄운다(자체서명 인증서 경고 회피).
const useHttps = process.env.VITE_HTTPS !== '0'

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: { host: true, port: 5173 },
})
