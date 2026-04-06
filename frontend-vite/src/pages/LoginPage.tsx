import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { signIn, startGoogleSignIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const fallbackPath = '/dashboard'
  const redirectTo = (location.state as { from?: string } | undefined)?.from ?? fallbackPath

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await signIn({ email, password })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao autenticar')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError(null)
    setLoading(true)

    try {
      await startGoogleSignIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar Google')
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      <h1 className="mb-2 text-2xl font-extrabold text-[var(--text)]">Entrar</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">Acesse com email/senha ou Google.</p>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-[var(--text)]">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
        </label>

        <label className="block text-sm font-medium text-[var(--text)]">
          Senha
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
        </label>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <button
          disabled={loading}
          type="submit"
          className="w-full rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <button
        disabled={loading}
        type="button"
        onClick={handleGoogle}
        className="mt-3 w-full rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-60"
      >
        Continuar com Google
      </button>

      <p className="mt-4 text-sm text-[var(--muted)]">
        Nao tem conta?{' '}
        <Link to="/register" className="font-semibold text-[var(--brand)]">
          Criar conta
        </Link>
      </p>

      <p className="mt-3 text-xs text-[var(--muted)]">
        Para fluxo Google funcionar no app, configure o callback da API para retornar ao frontend em
        /auth/google/callback.
      </p>
    </section>
  )
}
