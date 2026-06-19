import { defineConfig } from 'vitest/config'

// Config dedicada de testes (separada do vite.config de build/PWA). Ambiente
// jsdom pra os utilitários que tocam navigator/DOM. Cobre só *.test.ts(x).
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
