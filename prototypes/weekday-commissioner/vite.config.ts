import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { registrationApi } from './server/registrationApi.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), registrationApi(env)],
    server: { allowedHosts: ['.trycloudflare.com'] },
  }
})
