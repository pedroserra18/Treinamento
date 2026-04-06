import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

export function GoogleCallbackPage() {
  const navigate = useNavigate()
  const { completeGoogleSignIn } = useAuth()
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const hasValidParams = Boolean(code && state)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasValidParams || !code || !state) {
      return
    }

    void completeGoogleSignIn(code, state)
      .then(() => {
        navigate('/dashboard', { replace: true })
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Falha no login com Google')
      })
  }, [completeGoogleSignIn, navigate, hasValidParams, code, state])

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
      <h1 className="mb-2 text-xl font-bold text-[var(--text)]">Login Google</h1>
      {!hasValidParams ? (
        <p className="text-sm text-red-500">Callback invalido do Google</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <p className="text-sm text-[var(--muted)]">Finalizando autenticacao...</p>
      )}
    </section>
  )
}
