import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Focus coverage on the logic we actually test; exclude entry points,
      // config, and pure-presentation shells that carry no branching logic.
      include: ['src/lib/**', 'src/components/**'],
      exclude: ['src/**/__tests__/**', 'src/main.jsx', 'src/lib/supabase.js'],
    },
  },
})
