// Setup global dos testes (carregado via vitest.config -> setupFiles).
// 1) Registra os matchers do jest-dom (toBeInTheDocument, toHaveTextContent...).
// 2) Desmonta a árvore React e limpa o DOM depois de cada teste, pra um teste
//    não vazar render no outro.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
