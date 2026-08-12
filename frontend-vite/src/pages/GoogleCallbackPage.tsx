import { useAuth } from '../hooks/useAuth'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/api-error'

// Both flows (login + link) land here because Google only allows one
// authorized redirect URI per OAuth client. We distinguish via a
// sessionStorage flag set by startGoogleLink() — absence means "login".
const FLOW_KEY = 'googleOAuthFlow'

// Canal de contato pra quem foi barrado. Precisa ser externo: o suporte do
// app exige login, e quem cai nestes códigos não consegue entrar. Mesmo
// endereço publicado na política de privacidade.
const CONTACT_EMAIL = 'pedrovasco98765@gmail.com'

// Códigos que significam "a conta existe, mas não pode entrar". Só estes
// ganham o canal de contato — um erro de rede ou um state inválido não têm
// nada a ver com moderação e não devem sugerir que a conta foi punida.
const BLOCKED_ACCOUNT_CODES = new Set([
  'ACCOUNT_BANNED',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_DISABLED',
  'ACCOUNT_NOT_ACTIVE',
])

export function GoogleCallbackPage() {
  const navigate = useNavigate()
  const { completeGoogleSignIn, completeGoogleLink } = useAuth()
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const code = params.get('code')
  const state = params.get('state')
  const hasValidParams = Boolean(code && state)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  // The flow tag must be captured BEFORE we touch sessionStorage in the
  // effect, otherwise a re-render after we clear it would read 'login' on
  // accident. Memoized so it's stable across the StrictMode double-run.
  const flow = useMemo<'login' | 'link'>(() => {
    return sessionStorage.getItem(FLOW_KEY) === 'link' ? 'link' : 'login'
  }, [])

  // OAuth state is single-use on the server — calling complete* twice
  // (StrictMode does this in dev) makes the second call fail and masks the
  // real error from the first. A ref guards against the double-fire.
  const startedRef = useRef(false)

  useEffect(() => {
    if (!hasValidParams || !code || !state) return
    if (startedRef.current) return
    startedRef.current = true

    // Clear the flag immediately so a fresh login flow later doesn't mistake
    // this old marker for an active link request.
    sessionStorage.removeItem(FLOW_KEY)

    const work = flow === 'link'
      ? completeGoogleLink(code, state)
      : completeGoogleSignIn(code, state)

    void work
      .then(() => {
        // Link → back to where the user came from (settings/conta).
        // Login → home.
        navigate(flow === 'link' ? '/settings?section=account' : '/', { replace: true })
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Falha no login com Google')
        setErrorCode(err instanceof ApiError ? err.code ?? null : null)
      })
  }, [completeGoogleSignIn, completeGoogleLink, navigate, hasValidParams, code, state, flow])

  const title = flow === 'link' ? 'Vinculando conta Google' : 'Login Google'

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
      <h1 className="mb-2 text-xl font-bold text-[var(--text)]">{title}</h1>
      {!hasValidParams ? (
        <p className="text-sm text-red-500">Callback inválido do Google.</p>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-sm text-red-500">{error}</p>

          {errorCode && BLOCKED_ACCOUNT_CODES.has(errorCode) ? (
            <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
              <p className="text-sm text-[var(--muted)]">
                Se você acredita que houve um engano, escreva pra{' '}
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Acesso à minha conta SerraAthlo')}`}
                  className="font-semibold text-[var(--brand)] hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>{' '}
                e a gente analisa.
              </p>
              <p className="text-[11px] text-[var(--muted)]">
                Se você mesmo excluiu sua conta e quer voltar, é só{' '}
                <Link to="/register" className="font-semibold text-[var(--brand)] hover:underline">
                  criar uma nova
                </Link>
                .
              </p>
            </div>
          ) : (
            <Link
              to="/login"
              className="inline-block text-sm font-semibold text-[var(--brand)] hover:underline"
            >
              Voltar pro login
            </Link>
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          {flow === 'link' ? 'Vinculando sua conta Google…' : 'Finalizando autenticação…'}
        </p>
      )}
    </section>
  )
}
