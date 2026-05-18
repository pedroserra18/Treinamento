import { useAuth } from '../hooks/useAuth'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Both flows (login + link) land here because Google only allows one
// authorized redirect URI per OAuth client. We distinguish via a
// sessionStorage flag set by startGoogleLink() — absence means "login".
const FLOW_KEY = 'googleOAuthFlow'

export function GoogleCallbackPage() {
  const navigate = useNavigate()
  const { completeGoogleSignIn, completeGoogleLink } = useAuth()
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const code = params.get('code')
  const state = params.get('state')
  const hasValidParams = Boolean(code && state)
  const [error, setError] = useState<string | null>(null)

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
      })
  }, [completeGoogleSignIn, completeGoogleLink, navigate, hasValidParams, code, state, flow])

  const title = flow === 'link' ? 'Vinculando conta Google' : 'Login Google'

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
      <h1 className="mb-2 text-xl font-bold text-[var(--text)]">{title}</h1>
      {!hasValidParams ? (
        <p className="text-sm text-red-500">Callback invalido do Google</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          {flow === 'link' ? 'Vinculando sua conta Google…' : 'Finalizando autenticação…'}
        </p>
      )}
    </section>
  )
}
