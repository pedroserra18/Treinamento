import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

export function RegisterPage() {
  const { signUp } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await signUp({ name, email, password })
      navigate('/exercises', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      <h1 className="mb-2 text-2xl font-extrabold text-[var(--text)]">Criar conta</h1>
      <p className="mb-5 text-sm text-[var(--muted)]">Cadastre com email e senha.</p>

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
          <input
            required
            type="password"
            minLength={8}
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
          {loading ? 'Criando...' : 'Criar conta'}
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
