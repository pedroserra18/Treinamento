import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  confirmForgotPasswordWithCode,
  requestForgotPasswordCode,
} from '../services/authService'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [codeRequested, setCodeRequested] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleRequestCode = async () => {
    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail.includes('@')) {
      setError('Informe um e-mail valido.')
      return
    }

    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      await requestForgotPasswordCode({ email: normalizedEmail })
      setCodeRequested(true)
      setSuccess('Se o e-mail existir, enviamos um codigo de recuperacao para ele.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar codigo')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail.includes('@')) {
      setError('Informe um e-mail valido.')
      return
    }

    if (!codeRequested) {
      setError('Solicite o codigo antes de redefinir a senha.')
      return
    }

    if (!/^\d{6}$/.test(verificationCode)) {
      setError('Codigo deve ter 6 digitos numericos.')
      return
    }

    if (newPassword.length < 8) {
      setError('Nova senha deve ter no minimo 8 caracteres.')
      return
    }

    setLoading(true)

    try {
      await confirmForgotPasswordWithCode({
        email: normalizedEmail,
        verificationCode,
        newPassword,
      })
      setSuccess('Senha redefinida com sucesso. Agora voce ja pode entrar.')
      setVerificationCode('')
      setNewPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      <h1 className="mb-2 text-2xl font-extrabold text-[var(--text)]">Recuperar senha</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">
        Informe seu e-mail, receba o codigo e defina uma nova senha.
      </p>

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

        <div className="rounded-xl border border-[var(--line)] p-3">
          <p className="text-xs text-[var(--muted)]">Etapa 1: receba o codigo de recuperacao.</p>
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
          Codigo de recuperacao
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

        <label className="block text-sm font-medium text-[var(--text)]">
          Nova senha
          <div className="mt-1 flex gap-2">
            <input
              required
              minLength={8}
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((prev) => !prev)}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--text)]"
            >
              {showNewPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </label>

        {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <button
          disabled={loading}
          type="submit"
          className="w-full rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Redefinindo...' : 'Redefinir senha'}
        </button>
      </form>

      <p className="mt-4 text-sm text-[var(--muted)]">
        Lembrou a senha?{' '}
        <Link to="/login" className="font-semibold text-[var(--brand)]">
          Entrar
        </Link>
      </p>
    </section>
  )
}
