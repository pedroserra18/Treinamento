import { defineConfig } from 'vitest/config'

// Config dedicada de testes (separada do vite.config de build/PWA). Ambiente
// jsdom pra os utilitários que tocam navigator/DOM. Cobre só *.test.ts(x).
// Os arquivos de teste ficam fora do tsconfig.app (que define jsx: react-jsx),
// então forçamos aqui o JSX runtime automático — sem isso o esbuild cai no
// runtime clássico (React.createElement) e quebra os testes de componente.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Registra matchers do jest-dom e faz cleanup do DOM entre testes.
    setupFiles: ['./src/test/setup.ts'],
  },
})
