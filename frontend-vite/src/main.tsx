import './index.css'
import App from './App'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Sentry, initSentryFrontend } from './lib/sentry'
import { pwa } from './lib/pwa'

initSentryFrontend()
// Registra Service Worker (idempotente, só roda em prod por design).
pwa.register()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Ocorreu um erro inesperado. Tente recarregar a pagina.</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
