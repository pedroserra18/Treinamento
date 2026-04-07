import { useEffect, useMemo, useState } from 'react'

import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

type WorkoutRecommendation = {
  division: string
  daysPerWeek: number
  rationale: string
  sessions: Array<{
    dayNumber: number
    focus: string
    exercises: Array<{
      id: string
      name: string
      sets: number
      reps: string
      restSeconds: number
    }>
  }>
}

const fallbackRecommendations: WorkoutRecommendation[] = [
  {
    division: 'Push Pull Legs',
    daysPerWeek: 5,
    rationale: 'Equilibrio entre hipertrofia e recuperacao para rotina consistente.',
    sessions: [
      {
        dayNumber: 1,
        focus: 'Push',
        exercises: [
          { id: 'p1', name: 'Supino reto', sets: 4, reps: '8-10', restSeconds: 90 },
          { id: 'p2', name: 'Desenvolvimento halteres', sets: 3, reps: '10-12', restSeconds: 75 },
        ],
      },
    ],
  },
  {
    division: 'Bro Split',
    daysPerWeek: 5,
    rationale: 'Maior foco por grupamento para ganho de volume por sessao.',
    sessions: [
      {
        dayNumber: 1,
        focus: 'Chest',
        exercises: [
          { id: 'b1', name: 'Supino inclinado', sets: 4, reps: '6-8', restSeconds: 120 },
          { id: 'b2', name: 'Crucifixo no cabo', sets: 3, reps: '10-12', restSeconds: 75 },
        ],
      },
    ],
  },
]

export function HomePage() {
  const { isAuthenticated, authorizedFetch, user } = useAuth()
  const [recommendations, setRecommendations] = useState<WorkoutRecommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    let active = true

    const loadRecommendations = async () => {
      if (!active) {
        return
      }

      setLoading(true)
      setError(null)

      await authorizedFetch('http://localhost:4000/api/v1/recommendations/workout')
        .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | {
              data?: {
                recommendations?: WorkoutRecommendation[]
              }
              error?: { message?: string; code?: string }
            }
          | null

        if (!response.ok || !payload?.data?.recommendations) {
          if (payload?.error?.code === 'ONBOARDING_REQUIRED') {
            if (active) {
              setError('Finalize seu onboarding para desbloquear recomendacoes personalizadas.')
              setRecommendations(fallbackRecommendations)
            }
            return
          }

          throw new Error(payload?.error?.message ?? 'Falha ao carregar recomendacoes')
        }

          if (active) {
            setRecommendations(payload.data.recommendations.slice(0, 2))
          }
        })
        .catch((err) => {
          if (active) {
            setError(err instanceof Error ? err.message : 'Falha ao carregar recomendacoes')
            setRecommendations(fallbackRecommendations)
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false)
          }
        })
    }

    void loadRecommendations()

    return () => {
      active = false
    }
  }, [authorizedFetch, isAuthenticated])

  const topRecommendations = useMemo(
    () => (recommendations.length > 0 ? recommendations.slice(0, 2) : fallbackRecommendations),
    [recommendations],
  )

  return (
    <section className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-[var(--surface)] p-6 shadow-[0_20px_60px_-30px_rgba(20,184,166,0.65)] sm:p-8"
      >
        <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-52 w-52 rounded-full bg-emerald-500/20 blur-3xl" />

        <p className="relative mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
          Premium Fitness Dashboard
        </p>
        <h1 className="relative mb-3 text-3xl font-black tracking-tight text-[var(--text)] sm:text-4xl">
          {isAuthenticated
            ? `Bem-vindo, ${user?.name?.split(' ')[0] ?? 'Atleta'}`
            : 'Treine melhor com recomendacoes inteligentes'}
        </h1>
        <p className="relative max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
          Dashboard em dark mode com recomendacoes objetivas para acelerar sua proxima sessao.
        </p>

        <div className="relative mt-5 flex flex-wrap gap-3">
          <Link
            to={isAuthenticated ? '/workouts' : '/login'}
            className="inline-flex rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-strong)]"
          >
            {isAuthenticated ? 'Explorar treinos' : 'Entrar para continuar'}
          </Link>
          <Link
            to={isAuthenticated ? '/history' : '/login'}
            className="inline-flex rounded-xl border border-cyan-300/40 bg-slate-900/30 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:border-cyan-200/60"
          >
            Ver historico
          </Link>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: 0.08 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)]/90 p-4 backdrop-blur sm:p-5"
      >
        <h2 className="text-lg font-extrabold text-[var(--text)] sm:text-xl">Acessos rapidos</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Navegue direto para suas areas mais usadas.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            to={isAuthenticated ? '/workouts' : '/login'}
            className="group rounded-2xl border border-[var(--line)] bg-gradient-to-br from-cyan-500/15 to-transparent p-4 transition hover:border-cyan-300/60"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Atalho 01</p>
            <h3 className="mt-2 text-lg font-bold text-[var(--text)]">Explorar treinos</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">Escolha exercicios e monte sua sessao agora.</p>
            <span className="mt-3 inline-block text-sm font-semibold text-cyan-200">Abrir area</span>
          </Link>

          <Link
            to={isAuthenticated ? '/history' : '/login'}
            className="group rounded-2xl border border-[var(--line)] bg-gradient-to-br from-emerald-500/15 to-transparent p-4 transition hover:border-emerald-300/60"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Atalho 02</p>
            <h3 className="mt-2 text-lg font-bold text-[var(--text)]">Historico</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">Acompanhe sua consistencia e cargas recentes.</p>
            <span className="mt-3 inline-block text-sm font-semibold text-emerald-200">Ver progresso</span>
          </Link>
        </div>
      </motion.div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold tracking-tight text-[var(--text)]">2 recomendacoes de treino</h2>
          {loading ? <span className="text-xs text-[var(--muted)]">Atualizando...</span> : null}
        </div>
        {error ? <p className="text-sm text-amber-300">{error}</p> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {topRecommendations.map((recommendation, index) => {
          const mainSession = recommendation.sessions[0]
          const previewExercises = mainSession?.exercises.slice(0, 3) ?? []

          return (
            <motion.article
              key={`${recommendation.division}-${index}`}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + index * 0.08, ease: 'easeOut' }}
              className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.8)]"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
                    Recomendacao {index + 1}
                  </p>
                  <h3 className="mt-1 text-xl font-black text-[var(--text)]">{recommendation.division}</h3>
                </div>
                <span className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-200">
                  {recommendation.daysPerWeek}x por semana
                </span>
              </div>

              <p className="text-sm leading-6 text-[var(--muted)]">{recommendation.rationale}</p>

              <div className="mt-4 rounded-2xl border border-[var(--line)] bg-black/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Primeira sessao
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                  Dia {mainSession?.dayNumber ?? 1} - {mainSession?.focus ?? 'Sessao inicial'}
                </p>

                <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
                  {previewExercises.map((exercise) => (
                    <li key={exercise.id}>
                      {exercise.name} - {exercise.sets}x {exercise.reps} ({exercise.restSeconds}s descanso)
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to={isAuthenticated ? '/workouts' : '/login'}
                  className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white transition hover:bg-[var(--brand-strong)]"
                >
                  Comecar treino
                </Link>
                <Link
                  to={isAuthenticated ? '/history' : '/login'}
                  className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
                >
                  Ver historico
                </Link>
              </div>
            </motion.article>
          )
        })}
      </div>
    </section>
  )
}
