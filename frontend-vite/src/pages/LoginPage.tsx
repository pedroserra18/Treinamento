import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { BrandLogo } from '../components/common/BrandLogo'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Input } from '../components/common/Input'

export function LoginPage() {
  const { signIn, startGoogleSignIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    <section className="mx-auto max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
      <div className="mb-6 flex justify-center">
        <BrandLogo compact className="h-14 w-auto rounded-xl border border-red-500/35" />
      </div>
      <h1 className="mb-1 text-2xl font-black text-[var(--text)]">Entrar</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Acesse com email/senha ou Google.</p>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <Input
          label="Email"
          required
          type="email"
          value={email}
          placeholder="seu@email.com"
          onChange={(event) => setEmail(event.target.value)}
        />

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Senha</label>
          <div className="flex gap-2">
            <input
              required
              minLength={8}
              type={showPassword ? 'text' : 'password'}
              value={password}
              placeholder="••••••••"
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)]"
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </div>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <button
          disabled={loading}
          type="submit"
          className="w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <button
        disabled={loading}
        type="button"
        onClick={handleGoogle}
        className="mt-3 w-full rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] disabled:opacity-60"
      >
        Continuar com Google
      </button>

      <div className="mt-5 space-y-2 border-t border-[var(--line)] pt-4">
        <p className="text-sm text-[var(--muted)]">
          Não tem conta?{' '}
          <Link to="/register" className="font-bold text-[var(--brand)]">
            Criar conta
          </Link>
        </p>
        <p className="text-sm text-[var(--muted)]">
          Esqueceu a senha?{' '}
          <Link to="/forgot-password" className="font-bold text-[var(--brand)]">
            Recuperar senha
          </Link>
        </p>
      </div>
    </section>
  )
}
