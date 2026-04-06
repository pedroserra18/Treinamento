import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

type SexOption = 'MALE' | 'FEMALE' | 'OTHER'

const sexLabels: Record<SexOption, string> = {
  MALE: 'Masculino',
  FEMALE: 'Feminino',
  OTHER: 'Outro',
}

function validateOnboarding(input: { sex: SexOption | null; availableDaysPerWeek: number | null }) {
  if (!input.sex) {
    return 'Selecione seu sexo para personalizar as recomendacoes.'
  }

  if (!input.availableDaysPerWeek) {
    return 'Informe quantos dias por semana voce consegue treinar.'
  }

  if (input.availableDaysPerWeek < 1 || input.availableDaysPerWeek > 7) {
    return 'Dias disponiveis deve ser entre 1 e 7.'
  }

  return null
}

export function OnboardingPage() {
  const { ready, isAuthenticated, user, completeOnboarding } = useAuth()
  const navigate = useNavigate()
  const [sex, setSex] = useState<SexOption | null>(user?.sex ?? null)
  const [availableDaysPerWeek, setAvailableDaysPerWeek] = useState<number | null>(
    user?.availableDaysPerWeek ?? null,
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const dayHint = useMemo(() => {
    if (!availableDaysPerWeek) {
      return 'Escolha de 1 a 7 dias.'
    }

    if (availableDaysPerWeek <= 2) {
      return 'Plano enxuto para rotina corrida.'
    }

    if (availableDaysPerWeek <= 4) {
      return 'Boa frequencia para evolucao consistente.'
    }

    return 'Frequencia alta para progresso acelerado.'
  }, [availableDaysPerWeek])

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Validando sessao...</p>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.onboardingCompleted) {
    return <Navigate to="/dashboard" replace />
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateOnboarding({ sex, availableDaysPerWeek })

    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setLoading(true)

    try {
      await completeOnboarding({
        sex: sex as SexOption,
        availableDaysPerWeek: availableDaysPerWeek as number,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao concluir onboarding')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-xl rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-[var(--text)]">Complete seu onboarding</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Isso leva menos de 1 minuto e ajuda a ajustar recomendacoes de treino.
      </p>

      <form className="mt-6 space-y-6" onSubmit={onSubmit}>
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-[var(--text)]">Sexo</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(sexLabels) as SexOption[]).map((option) => (
              <label
                key={option}
                className={`cursor-pointer rounded-xl border px-3 py-2 text-sm transition ${
                  sex === option
                    ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--text)]'
                    : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--brand)]/40'
                }`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="sex"
                  value={option}
                  checked={sex === option}
                  onChange={() => setSex(option)}
                />
                {sexLabels[option]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-[var(--text)]">Dias disponiveis por semana</legend>
          <div className="rounded-xl border border-[var(--line)] p-4">
            <input
              type="range"
              min={1}
              max={7}
              value={availableDaysPerWeek ?? 3}
              onChange={(event) => setAvailableDaysPerWeek(Number(event.target.value))}
              className="w-full"
            />
            <div className="mt-3 flex items-center justify-between">
              <p className="text-2xl font-black text-[var(--text)]">{availableDaysPerWeek ?? 3} dias</p>
              <p className="text-xs text-[var(--muted)]">{dayHint}</p>
            </div>
          </div>
        </fieldset>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <button
          disabled={loading}
          type="submit"
          className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Salvando...' : 'Concluir onboarding'}
        </button>
      </form>
    </section>
  )
}
