import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import type { ExperienceLevel, PrimaryGoal } from '../types/auth'

// Onboarding profissional v2 — 3 passos, ~90s de preenchimento. Passos
// 1 e 3 obrigatórios; passo 2 (corpo) totalmente opcional com botão Pular.
// Progress bar no topo + Voltar/Avançar fluem como wizard padrão. Cada
// passo tem um helper text explicando POR QUE a info é útil — reduz
// fricção emocional de informar peso/altura.

type SexOption = 'MALE' | 'FEMALE' | 'OTHER'

const SEX_LABELS: Record<SexOption, string> = {
  MALE: 'Masculino',
  FEMALE: 'Feminino',
  OTHER: 'Outro',
}

const EXPERIENCE_LABELS: Record<ExperienceLevel, { title: string; desc: string }> = {
  BEGINNER: {
    title: 'Iniciante',
    desc: 'Comecei agora ou tenho < 6 meses de treino consistente',
  },
  INTERMEDIATE: {
    title: 'Intermediário',
    desc: '6 meses a 2 anos treinando regularmente',
  },
  ADVANCED: {
    title: 'Avançado',
    desc: '2+ anos com treino estruturado e ciclos planejados',
  },
}

const GOAL_LABELS: Record<PrimaryGoal, { title: string; desc: string }> = {
  STRENGTH: { title: 'Força', desc: 'Levantar mais peso, menos repetições' },
  HYPERTROPHY: { title: 'Hipertrofia', desc: 'Ganhar massa muscular visível' },
  WEIGHT_LOSS: { title: 'Emagrecimento', desc: 'Perder gordura mantendo músculo' },
  ENDURANCE: { title: 'Resistência', desc: 'Aguentar mais tempo, fôlego e cardio' },
  GENERAL_FITNESS: { title: 'Saúde geral', desc: 'Movimento regular, qualidade de vida' },
}

type Step = 1 | 2 | 3

export function OnboardingPage() {
  const { ready, isAuthenticated, user, completeOnboarding } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>(1)

  // ─── Passo 1 ──────────────────────────────────────────────
  const [sex, setSex] = useState<SexOption | null>(user?.sex ?? null)
  // Inputs de data: DD/MM/AAAA pra UX brasileira; convertemos pra ISO
  // (YYYY-MM-DD) só na hora do submit.
  const [birthDay, setBirthDay] = useState<string>('')
  const [birthMonth, setBirthMonth] = useState<string>('')
  const [birthYear, setBirthYear] = useState<string>('')

  // ─── Passo 2 (opcionais) ──────────────────────────────────
  const [heightCm, setHeightCm] = useState<string>('')
  const [weightKg, setWeightKg] = useState<string>('')

  // ─── Passo 3 ──────────────────────────────────────────────
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel | null>(null)
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal | null>(null)
  const [availableDaysPerWeek, setAvailableDaysPerWeek] = useState<number>(
    user?.availableDaysPerWeek ?? 4,
  )

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const dayHint = useMemo(() => {
    if (availableDaysPerWeek <= 2) return 'Plano enxuto pra rotina corrida'
    if (availableDaysPerWeek <= 4) return 'Boa frequência pra evolução consistente'
    return 'Frequência alta pra progresso acelerado'
  }, [availableDaysPerWeek])

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Validando sessão...</p>
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.onboardingCompleted) return <Navigate to="/dashboard" replace />

  const validateStep1 = (): string | null => {
    if (!sex) return 'Selecione seu sexo.'
    const d = Number(birthDay), m = Number(birthMonth), y = Number(birthYear)
    if (!d || !m || !y) return 'Informe sua data de nascimento completa.'
    // Aproximada — backend revalida com regex estrito.
    if (m < 1 || m > 12) return 'Mês inválido.'
    if (d < 1 || d > 31) return 'Dia inválido.'
    if (y < 1900 || y > new Date().getFullYear() - 10) return 'Ano inválido (mínimo 10 anos).'
    return null
  }

  const validateStep3 = (): string | null => {
    if (!experienceLevel) return 'Selecione seu nível de experiência.'
    if (!primaryGoal) return 'Escolha seu objetivo principal.'
    if (availableDaysPerWeek < 1 || availableDaysPerWeek > 7) return 'Dias deve ser entre 1 e 7.'
    return null
  }

  const goNext = () => {
    setError(null)
    if (step === 1) {
      const err = validateStep1()
      if (err) { setError(err); return }
      setStep(2)
    } else if (step === 2) {
      // Passo 2 é totalmente opcional — sem validação de campos vazios.
      // Quando preenchidos, validamos faixa.
      if (heightCm.trim() !== '') {
        const h = Number(heightCm.replace(',', '.'))
        if (!Number.isFinite(h) || h < 100 || h > 250) {
          setError('Altura inválida (entre 100 e 250 cm).')
          return
        }
      }
      if (weightKg.trim() !== '') {
        const w = Number(weightKg.replace(',', '.'))
        if (!Number.isFinite(w) || w < 25 || w > 300) {
          setError('Peso inválido (entre 25 e 300 kg).')
          return
        }
      }
      setStep(3)
    }
  }

  const goBack = () => {
    setError(null)
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }

  const handleSubmit = async () => {
    setError(null)
    const err = validateStep3()
    if (err) { setError(err); return }

    const dd = birthDay.padStart(2, '0')
    const mm = birthMonth.padStart(2, '0')
    const birthDate = `${birthYear}-${mm}-${dd}`

    const h = heightCm.trim() === '' ? undefined : Number(heightCm.replace(',', '.'))
    const w = weightKg.trim() === '' ? undefined : Number(weightKg.replace(',', '.'))

    setSubmitting(true)
    try {
      await completeOnboarding({
        sex: sex as SexOption,
        availableDaysPerWeek,
        birthDate,
        experienceLevel: experienceLevel as ExperienceLevel,
        primaryGoal: primaryGoal as PrimaryGoal,
        heightCm: h,
        weightKg: w,
      })
      navigate('/dashboard', { replace: true })
    } catch (err2) {
      setError(err2 instanceof Error ? err2.message : 'Erro ao concluir onboarding')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="relative mx-auto max-w-xl overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full opacity-25 blur-3xl animate-[tech-spin_22s_linear_infinite]"
        style={{ background: 'var(--tech-gradient-conic)' }}
      />

      {/* Progress bar — visualiza qual passo o user está */}
      <div className="relative mb-6 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              s <= step ? 'bg-[var(--brand)]' : 'bg-[var(--line)]'
            }`}
          />
        ))}
      </div>

      <h1 className="relative text-2xl font-extrabold text-[var(--text)]">
        {step === 1 && 'Quem você é'}
        {step === 2 && 'Seu corpo'}
        {step === 3 && 'Seu treino'}
      </h1>
      <p className="relative mt-2 text-sm text-[var(--muted)]">
        Passo {step} de 3 · {step === 2 ? 'Pode pular se preferir' : 'Leva menos de 1 min'}
      </p>

      <div className="relative mt-6 space-y-6">
        {step === 1 && (
          <>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-[var(--text)]">Sexo</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(SEX_LABELS) as SexOption[]).map((option) => (
                  <label
                    key={option}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-center text-sm transition ${
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
                    {SEX_LABELS[option]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-[var(--muted)]">
                Influencia carga inicial recomendada e referência de TMB.
              </p>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-[var(--text)]">Data de nascimento</legend>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Dia"
                  min={1}
                  max={31}
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value.slice(0, 2))}
                  className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Mês"
                  min={1}
                  max={12}
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value.slice(0, 2))}
                  className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Ano"
                  min={1900}
                  max={new Date().getFullYear() - 10}
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value.slice(0, 4))}
                  className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
                />
              </div>
              <p className="text-xs text-[var(--muted)]">
                Usada pra calcular sua idade — afeta gasto calórico estimado e zonas de FC.
              </p>
            </fieldset>
          </>
        )}

        {step === 2 && (
          <>
            <p className="rounded-xl border border-dashed border-[var(--line)] p-3 text-[12px] leading-relaxed text-[var(--muted)]">
              Esses campos são <strong>opcionais</strong>. Quanto mais preenchermos, melhor a personalização — mas pode pular agora e editar depois em Configurações.
            </p>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-[var(--text)]">Altura (cm)</legend>
              <input
                type="number"
                inputMode="decimal"
                placeholder="Ex.: 175"
                min={100}
                max={250}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
              />
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-[var(--text)]">Peso atual (kg)</legend>
              <input
                type="number"
                inputMode="decimal"
                placeholder="Ex.: 72"
                step={0.1}
                min={25}
                max={300}
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
              />
              <p className="text-xs text-[var(--muted)]">
                Você pode atualizar a qualquer momento na página de Progresso.
              </p>
            </fieldset>
          </>
        )}

        {step === 3 && (
          <>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-[var(--text)]">Nível de experiência</legend>
              <div className="space-y-2">
                {(Object.keys(EXPERIENCE_LABELS) as ExperienceLevel[]).map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      experienceLevel === option
                        ? 'border-[var(--brand)] bg-[var(--brand)]/10'
                        : 'border-[var(--line)] hover:border-[var(--brand)]/40'
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="experienceLevel"
                      value={option}
                      checked={experienceLevel === option}
                      onChange={() => setExperienceLevel(option)}
                    />
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">{EXPERIENCE_LABELS[option].title}</p>
                      <p className="text-xs text-[var(--muted)]">{EXPERIENCE_LABELS[option].desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-[var(--text)]">Objetivo principal</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(GOAL_LABELS) as PrimaryGoal[]).map((option) => (
                  <label
                    key={option}
                    className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition ${
                      primaryGoal === option
                        ? 'border-[var(--brand)] bg-[var(--brand)]/10'
                        : 'border-[var(--line)] hover:border-[var(--brand)]/40'
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="primaryGoal"
                      value={option}
                      checked={primaryGoal === option}
                      onChange={() => setPrimaryGoal(option)}
                    />
                    <span className="text-sm font-semibold text-[var(--text)]">{GOAL_LABELS[option].title}</span>
                    <span className="text-xs text-[var(--muted)]">{GOAL_LABELS[option].desc}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-[var(--muted)]">
                Pode ser ajustado a cada plano específico — esse é seu objetivo de longo prazo.
              </p>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-[var(--text)]">Dias disponíveis por semana</legend>
              <div className="rounded-xl border border-[var(--line)] p-4">
                <input
                  type="range"
                  min={1}
                  max={7}
                  value={availableDaysPerWeek}
                  onChange={(e) => setAvailableDaysPerWeek(Number(e.target.value))}
                  className="w-full"
                />
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-2xl font-black text-[var(--text)]">{availableDaysPerWeek} dias</p>
                  <p className="text-xs text-[var(--muted)]">{dayHint}</p>
                </div>
              </div>
            </fieldset>
          </>
        )}

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        {/* Navegação — Voltar (sutil) à esquerda, ação primária à direita */}
        <div className="flex gap-2 pt-2">
          {step > 1 && (
            <button
              type="button"
              onClick={goBack}
              disabled={submitting}
              className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
            >
              Voltar
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={submitting}
              className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
            >
              Pular
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={submitting}
              className="flex-1 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-60"
            >
              Avançar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="flex-1 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-strong)] disabled:opacity-60"
            >
              {submitting ? 'Salvando…' : 'Concluir onboarding'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
