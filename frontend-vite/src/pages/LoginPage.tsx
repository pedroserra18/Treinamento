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

  // Convite PRO e outros fluxos públicos passam ?next=/pro-invite/:token
  // pra mandar o user pra página certa depois do login. State tem prioridade
  // (vem de ProtectedRoute), querystring é fallback pra links externos.
  const fallbackPath = '/dashboard'
  const stateFrom = (location.state as { from?: string } | undefined)?.from
  const queryNext = new URLSearchParams(location.search).get('next')
  const redirectTo = stateFrom ?? queryNext ?? fallbackPath

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
    <section className="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl animate-[tech-spin_20s_linear_infinite]"
        style={{ background: 'var(--tech-gradient-conic)' }}
      />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle, var(--accent-cyan), transparent 70%)' }} aria-hidden />
      <div className="relative mb-6 flex justify-center">
        <BrandLogo compact className="h-14 w-auto rounded-xl border border-red-500/35" />
      </div>
      <h1 className="relative mb-1 text-2xl font-black text-[var(--text)]">Entrar</h1>
      <p className="relative mb-6 text-sm text-[var(--muted)]">Acesse com email/senha ou Google.</p>

      <form className="relative space-y-4" onSubmit={handleSubmit}>
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
        className="relative mt-3 w-full rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] disabled:opacity-60"
      >
        Continuar com Google
      </button>

      <div className="relative mt-5 space-y-2 border-t border-[var(--line)] pt-4">
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
        <p className="mt-3 text-[11px] text-[var(--muted)]">
          <Link to="/termos" target="_blank" rel="noopener" className="hover:text-[var(--text)] hover:underline">Termos de Uso</Link>
          <span className="mx-1.5 opacity-40">·</span>
          <Link to="/privacidade" target="_blank" rel="noopener" className="hover:text-[var(--text)] hover:underline">Política de Privacidade</Link>
        </p>
      </div>
    </section>
  )
}
