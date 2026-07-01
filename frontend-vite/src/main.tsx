import './index.css'
import App from './App'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Sentry, initSentryFrontend } from './lib/infra/sentry'
import { pwa } from './lib/infra/pwa'
import { bumpVisitCount } from './lib/infra/install-prompt'

initSentryFrontend()
// Bump ANTES de montar o React pra os componentes filhos verem o
// count já incrementado. Se ficasse num useEffect dentro do App, a
// ordem children-first dos effects faria o PwaInstallBanner sempre
// ver o count "anterior" e mostrar 1 visita depois do esperado.
bumpVisitCount()
// Registra Service Worker (idempotente, só roda em prod por design).
pwa.register()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Ocorreu um erro inesperado. Tente recarregar a pagina.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
