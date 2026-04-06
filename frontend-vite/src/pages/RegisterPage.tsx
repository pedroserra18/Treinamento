import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

function validateRegisterInput(input: { name: string; email: string; password: string }): string | null {
  if (input.name.trim().length < 2) {
    return 'Nome deve ter pelo menos 2 caracteres.'
  }

  if (!input.email.includes('@')) {
    return 'Informe um e-mail valido.'
  }

  if (input.password.length < 8) {
    return 'Senha deve ter no minimo 8 caracteres.'
  }

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

    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      await requestSignUpVerificationCode({ email })
      setCodeRequested(true)
      setSuccess('Codigo enviado para o seu e-mail. Digite abaixo para concluir o cadastro.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar codigo de verificacao')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const validationError = validateRegisterInput({ name, email, password })
    if (validationError) {
      setError(validationError)
      return
    }

    if (!codeRequested) {
      setError('Solicite o codigo de verificacao antes de concluir o cadastro.')
      return
    }

    if (!/^\d{6}$/.test(verificationCode)) {
      setError('Codigo deve ter 6 digitos numericos.')
      return
    }

    setLoading(true)

    try {
      await signUp({ name, email, password, verificationCode })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao validar codigo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      <h1 className="mb-2 text-2xl font-extrabold text-[var(--text)]">Criar conta</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Cadastre com email e senha e confirme com o codigo enviado por e-mail.
      </p>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-[var(--text)]">
          Nome
          <input
            required
            minLength={2}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
        </label>

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
          <div className="mt-1 flex gap-2">
            <input
              required
              type={showPassword ? 'text' : 'password'}
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--text)]"
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </label>

        <div className="rounded-xl border border-[var(--line)] p-3">
          <p className="text-xs text-[var(--muted)]">Etapa 1: receba o codigo no e-mail informado.</p>
          <button
            disabled={loading}
            type="button"
            onClick={() => {
              void handleRequestCode()
            }}
            className="mt-2 w-full rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-60"
          >
            {loading ? 'Enviando codigo...' : codeRequested ? 'Reenviar codigo' : 'Enviar codigo'}
          </button>
        </div>

        <label className="block text-sm font-medium text-[var(--text)]">
          Codigo de verificacao
          <input
            required
            inputMode="numeric"
            pattern="[0-9]{6}"
            placeholder="Ex.: 123456"
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
        </label>

        {success ? <p className="text-sm text-emerald-600">{success}</p> : null}

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <button
          disabled={loading}
          type="submit"
          className="w-full rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Validando codigo...' : 'Criar conta'}
        </button>
      </form>

      <p className="mt-4 text-sm text-[var(--muted)]">
        Ja possui conta?{' '}
        <Link to="/login" className="font-semibold text-[var(--brand)]">
          Entrar
        </Link>
      </p>
    </section>
  )
}
