import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEffect, useMemo, useState } from 'react'
import { BrandLogo } from '../components/common/BrandLogo'
import { CountUp } from '../components/common/CountUp'
import { listWorkoutHistory } from '../services/workoutService'
import type { WorkoutSessionHistory } from '../types/workout'
import { Flame, Dumbbell, TrendingUp, CalendarDays } from 'lucide-react'

function calcVolumeKg(session: WorkoutSessionHistory): number {
  return session.history.reduce((acc, e) => acc + (e.weightKg ?? 0) * (e.reps ?? 0), 0)
}

function computeHomeStats(items: WorkoutSessionHistory[]) {
  const completed = items.filter((s) => s.endedAt)
  const sorted = [...completed].sort(
    (a, b) => new Date(b.endedAt!).getTime() - new Date(a.endedAt!).getTime(),
  )

  const today = new Date()
  const last30: { day: string; active: boolean }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    last30.push({ day: d.toISOString().slice(0, 10), active: false })
  }

  const sessionDays = new Set(sorted.map((s) => s.endedAt!.slice(0, 10)))
  for (const entry of last30) entry.active = sessionDays.has(entry.day)

  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  weekStart.setHours(0, 0, 0, 0)
  const weekSessions = completed.filter((s) => new Date(s.endedAt!) >= weekStart)
  const weekVolume = weekSessions.reduce((acc, s) => acc + calcVolumeKg(s), 0)

  let streak = 0
  const check = new Date(today)
  check.setHours(0, 0, 0, 0)
  if (!sessionDays.has(check.toISOString().slice(0, 10))) check.setDate(check.getDate() - 1)
  while (sessionDays.has(check.toISOString().slice(0, 10))) {
    streak++
    check.setDate(check.getDate() - 1)
  }

  return { heatmap: last30, weekCount: weekSessions.length, weekVolume, streak, lastWorkout: sorted[0] ?? null }
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

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

function normalizeDivisionLabel(value: string): string {
  return value === 'Torso Legs' ? 'Torso Limbs' : value
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
  const [historyItems, setHistoryItems] = useState<WorkoutSessionHistory[]>([])

  useEffect(() => {
    if (!isAuthenticated) return
    void listWorkoutHistory(authorizedFetch)
      .then((r) => setHistoryItems(r.items))
      .catch(() => { /* silent */ })
  }, [authorizedFetch, isAuthenticated])

  const stats = useMemo(() => computeHomeStats(historyItems), [historyItems])

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

      await authorizedFetch(`${API_URL}/recommendations/workout`)
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
            setRecommendations(
              payload.data.recommendations.slice(0, 2).map((item) => ({
                ...item,
                division: normalizeDivisionLabel(item.division),
              })),
            )
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
  }, [authorizedFetch, isAuthenticated, user?.availableDaysPerWeek, user?.sex])

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
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full opacity-30 blur-3xl animate-[tech-spin_18s_linear_infinite]"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />
        <div className="pointer-events-none absolute -bottom-16 -left-8 h-52 w-52 rounded-full bg-emerald-500/20 blur-3xl" />

        <div className="relative mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300">SerraAthlo Dashboard</p>
          <BrandLogo compact className="h-10 w-auto rounded-lg border border-red-500/30" />
        </div>
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
            to={isAuthenticated ? '/train' : '/login'}
            className="inline-flex rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-strong)]"
          >
            {isAuthenticated ? 'Explorar treinos' : 'Entrar para continuar'}
          </Link>
          <Link
            to={isAuthenticated ? '/history' : '/login'}
            className="inline-flex rounded-xl border border-red-300/40 bg-slate-900/30 px-4 py-3 text-sm font-bold text-red-100 transition hover:border-red-200/60"
          >
            Ver historico
          </Link>
        </div>
      </motion.div>

      {isAuthenticated ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.06 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"
        >
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center rounded-2xl border border-[var(--line)] bg-gradient-to-br from-orange-500/10 to-transparent p-3 text-center">
              <Flame size={18} className="text-orange-400 animate-pulse" />
              <p className="mt-1 text-2xl font-black text-[var(--text)]">
                <CountUp value={stats.streak} />
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Sequencia</p>
            </div>
            <div className="flex flex-col items-center rounded-2xl border border-[var(--line)] bg-gradient-to-br from-[var(--brand)]/10 to-transparent p-3 text-center">
              <Dumbbell size={18} className="text-[var(--brand)]" />
              <p className="mt-1 text-2xl font-black text-[var(--text)]">
                <CountUp value={stats.weekCount} />
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Treinos</p>
            </div>
            <div className="flex flex-col items-center rounded-2xl border border-[var(--line)] bg-gradient-to-br from-emerald-500/10 to-transparent p-3 text-center">
              <TrendingUp size={18} className="text-emerald-400" />
              <p className="mt-1 text-2xl font-black text-[var(--text)]">
                {stats.weekVolume > 0 ? (
                  <><CountUp value={Math.round(stats.weekVolume / 1000)} />k</>
                ) : '0'}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Vol. kg</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <CalendarDays size={13} className="text-[var(--muted)]" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Ultimos 30 dias</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {stats.heatmap.map(({ day, active }, idx) => (
              <motion.div
                key={day}
                title={day}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.01 * idx, ease: 'easeOut' }}
                className={`h-4 w-4 rounded-sm ${active ? 'shadow-[0_0_8px_rgba(240,54,27,0.5)]' : 'bg-[var(--surface-hover)]'}`}
                style={active ? { background: 'linear-gradient(135deg, var(--brand), var(--accent-violet))' } : undefined}
              />
            ))}
          </div>

          {stats.lastWorkout ? (
            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Ultimo treino</p>
                <p className="truncate text-sm font-bold text-[var(--text)]">
                  {stats.lastWorkout.workoutPlan?.name ?? 'Treino livre'}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {new Date(stats.lastWorkout.endedAt!).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <Link
                to="/history"
                className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text)]"
              >
                Ver
              </Link>
            </div>
          ) : null}
        </motion.div>
      ) : null}

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
            to={isAuthenticated ? '/train' : '/login'}
            className="group rounded-2xl border border-[var(--line)] bg-gradient-to-br from-red-500/15 to-transparent p-4 transition hover:border-red-300/60"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Atalho 01</p>
            <h3 className="mt-2 text-lg font-bold text-[var(--text)]">Explorar treinos</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">Escolha exercicios e monte sua sessao agora.</p>
            <span className="mt-3 inline-block text-sm font-semibold text-red-200">Abrir area</span>
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
          const normalizedDivision = normalizeDivisionLabel(recommendation.division)
          const previewExercises = mainSession?.exercises.slice(0, 3) ?? []

          return (
            <motion.article
              key={`${normalizedDivision}-${index}`}
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
                  <h3 className="mt-1 text-xl font-black text-[var(--text)]">{normalizedDivision}</h3>
                </div>
                <span className="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-200">
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
                  to={isAuthenticated ? '/train' : '/login'}
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
