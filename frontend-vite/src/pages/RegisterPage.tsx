import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { BrandLogo } from '../components/common/BrandLogo'
import { Link, useNavigate } from 'react-router-dom'
import { Input } from '../components/common/Input'

function validateRegisterInput(input: { name: string; email: string; password: string }): string | null {
  if (input.name.trim().length < 2) return 'Nome deve ter pelo menos 2 caracteres.'
  if (!input.email.includes('@')) return 'Informe um e-mail válido.'
  if (input.password.length < 8) return 'Senha deve ter no mínimo 8 caracteres.'
  return null
}

export function RegisterPage() {
  const { signUp, requestSignUpVerificationCode } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [codeRequested, setCodeRequested] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleRequestCode = async () => {
    const validationError = validateRegisterInput({ name, email, password })
    if (validationError) { setError(validationError); return }
    setError(null); setSuccess(null); setLoading(true)
    try {
      await requestSignUpVerificationCode({ email })
      setCodeRequested(true)
      setSuccess('Código enviado para o seu e-mail. Digite abaixo para concluir o cadastro.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar código de verificação')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null); setSuccess(null)
    const validationError = validateRegisterInput({ name, email, password })
    if (validationError) { setError(validationError); return }
    if (!codeRequested) { setError('Solicite o código de verificação antes de concluir o cadastro.'); return }
    if (!/^\d{6}$/.test(verificationCode)) { setError('Código deve ter 6 dígitos numéricos.'); return }
    setLoading(true)
    try {
      await signUp({ name, email, password, verificationCode })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao validar código')
    } finally {
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
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle, var(--accent-emerald), transparent 70%)' }} aria-hidden />
      <div className="relative mb-6 flex justify-center">
        <BrandLogo compact className="h-14 w-auto rounded-xl border border-red-500/35" />
      </div>
      <h1 className="relative mb-1 text-2xl font-black text-[var(--text)]">Criar conta</h1>
      <p className="relative mb-6 text-sm text-[var(--muted)]">
        Cadastre com email e senha e confirme com o código enviado por e-mail.
      </p>

      <form className="relative space-y-4" onSubmit={handleSubmit}>
        <Input
          label="Nome"
          required
          minLength={2}
          value={name}
          placeholder="Seu nome completo"
          onChange={(event) => setName(event.target.value)}
        />

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
              type={showPassword ? 'text' : 'password'}
              minLength={8}
              value={password}
              placeholder="Mínimo 8 caracteres"
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

        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
          <p className="text-xs font-medium text-[var(--muted)]">Etapa 1: receba o código no e-mail informado.</p>
          <button
            disabled={loading}
            type="button"
            onClick={() => { void handleRequestCode() }}
            className="mt-2 w-full rounded-xl bg-[var(--surface)] border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-60"
          >
            {loading ? 'Enviando código...' : codeRequested ? 'Reenviar código' : 'Enviar código'}
          </button>
        </div>

        <Input
          label="Código de verificação"
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          placeholder="Ex.: 123456"
          value={verificationCode}
          onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
        />

        {success ? <p className="text-sm font-medium text-emerald-500">{success}</p> : null}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <button
          disabled={loading}
          type="submit"
          className="w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {loading ? 'Validando código...' : 'Criar conta'}
        </button>
      </form>

      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <p className="text-sm text-[var(--muted)]">
          Já possui conta?{' '}
          <Link to="/login" className="font-bold text-[var(--brand)]">
            Entrar
          </Link>
        </p>
      </div>
    </section>
  )
}
