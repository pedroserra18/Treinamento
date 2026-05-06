import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEffect, useMemo, useState } from 'react'
import type { WorkoutSessionHistory } from '../types/workout'
import { listWorkoutHistory } from '../services/workoutService'
import { getStoredWorkoutSessionImage } from '../lib/workout-session-image'
import { SkeletonCard } from '../components/common/Skeleton'
import { CountUp } from '../components/common/CountUp'
import { Dumbbell } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

type Period = 'week' | 'month' | '3months' | 'all'

function getWeekLabel(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay() + 1)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function buildVolumeChart(items: WorkoutSessionHistory[]) {
  const byWeek = new Map<string, number>()
  for (const session of items) {
    if (!session.endedAt) continue
    const label = getWeekLabel(new Date(session.endedAt))
    const vol = session.history.reduce((acc, e) => acc + (e.weightKg ?? 0) * (e.reps ?? 0), 0)
    byWeek.set(label, (byWeek.get(label) ?? 0) + vol)
  }
  return Array.from(byWeek.entries())
    .map(([week, volume]) => ({ week, volume: Math.round(volume) }))
    .slice(-8)
}

function formatDuration(totalSeconds: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) {
    return '0m'
  }

  const hours = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '-'
  }

  return new Date(value).toLocaleString('pt-BR')
}

function calculateTotalVolumeKg(session: WorkoutSessionHistory): number {
  return session.history.reduce((acc, entry) => {
    if (entry.weightKg == null || entry.reps == null) {
      return acc
    }

    if (entry.weightKg <= 0 || entry.reps <= 0) {
      return acc
    }

    return acc + entry.weightKg * entry.reps
  }, 0)
}

type HistoryEntry = WorkoutSessionHistory['history'][number]

type GroupedExerciseHistory = {
  exerciseId: string
  exerciseName: string
  primaryMuscleGroup: string
  entries: HistoryEntry[]
  firstIndex: number
}

export function HistoryPage() {
  const { authorizedFetch } = useAuth()
  const [items, setItems] = useState<WorkoutSessionHistory[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedSessionPhoto, setSelectedSessionPhoto] = useState<{ url: string; endedAt: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('all')

  const filteredItems = useMemo(() => {
    if (period === 'all') return items
    const cutoff = new Date()
    if (period === 'week') cutoff.setDate(cutoff.getDate() - 7)
    else if (period === 'month') cutoff.setMonth(cutoff.getMonth() - 1)
    else cutoff.setMonth(cutoff.getMonth() - 3)
    return items.filter((s) => s.endedAt && new Date(s.endedAt) >= cutoff)
  }, [items, period])

  const chartData = useMemo(() => buildVolumeChart(filteredItems), [filteredItems])

  const selectedSession = items.find((session) => session.id === selectedSessionId) ?? null
  const selectedSessionImageUrl = selectedSession ? getStoredWorkoutSessionImage(selectedSession.id) : null

  const groupedExerciseHistory = selectedSession
    ? (() => {
        const grouped = new Map<string, GroupedExerciseHistory>()

        const orderedEntries = [...selectedSession.history].sort((a, b) => {
          if (a.executionOrder !== b.executionOrder) {
            return a.executionOrder - b.executionOrder
          }

          const byCompletedAt = new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
          if (byCompletedAt !== 0) {
            return byCompletedAt
          }

          if (a.setNumber !== b.setNumber) {
            return a.setNumber - b.setNumber
          }

          return a.id.localeCompare(b.id)
        })

        orderedEntries.forEach((entry, index) => {
          const existing = grouped.get(entry.exercise.id)
          if (existing) {
            existing.entries.push(entry)
            return
          }

          grouped.set(entry.exercise.id, {
            exerciseId: entry.exercise.id,
            exerciseName: entry.exercise.name,
            primaryMuscleGroup: entry.exercise.primaryMuscleGroup,
            firstIndex: index,
            entries: [entry],
          })
        })

        return Array.from(grouped.values())
          .sort((a, b) => a.firstIndex - b.firstIndex)
          .map((group) => ({
            ...group,
            entries: [...group.entries].sort((a, b) => {
              if (a.setNumber !== b.setNumber) {
                return a.setNumber - b.setNumber
              }

              return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
            }),
          }))
      })()
    : []

  useEffect(() => {
    let cancelled = false

    void listWorkoutHistory(authorizedFetch)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar historico')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [authorizedFetch])

  if (selectedSession) {
    const totalVolumeKg = calculateTotalVolumeKg(selectedSession)

    return (
      <section className="space-y-4">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="card-glow-orange rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Historico</p>
              <h1 className="mt-1 text-2xl font-black text-[var(--text)]">Detalhes do treino</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {selectedSession.workoutPlan?.name ?? 'Treino sem plano'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedSessionId(null)
              }}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              {'<- Voltar'}
            </button>
          </div>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="card-glow-mixed rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-md sm:p-5"
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card-glow-blue rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Status</p>
              <p className="font-semibold text-[var(--text)]">{selectedSession.status}</p>
            </div>
            <div className="card-glow-blue rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Duracao</p>
              <p className="font-semibold text-[var(--text)]">{formatDuration(selectedSession.durationSec)}</p>
            </div>
            <div className="card-glow-blue rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Calorias</p>
              <p className="font-semibold text-[var(--text)]">
                {selectedSession.caloriesBurned != null ? selectedSession.caloriesBurned : '-'}
              </p>
            </div>
            <div className="card-glow-blue rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Volume total</p>
              <p className="font-semibold text-[var(--text)]">
                {totalVolumeKg > 0 ? `${totalVolumeKg.toFixed(1)} kg` : '-'}
              </p>
            </div>
            <div className="card-glow-blue rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Registros</p>
              <p className="font-semibold text-[var(--text)]">{selectedSession.historyEntriesCount}</p>
            </div>
            <div className="card-glow-blue rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Inicio</p>
              <p className="font-semibold text-[var(--text)]">{formatDateTime(selectedSession.startedAt)}</p>
            </div>
            <div className="card-glow-blue rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">Fim</p>
              <p className="font-semibold text-[var(--text)]">{formatDateTime(selectedSession.endedAt)}</p>
            </div>
          </div>

          {selectedSessionImageUrl ? (
            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Foto do fim do treino</p>
              <button
                type="button"
                onClick={() =>
                  setSelectedSessionPhoto({
                    url: selectedSessionImageUrl,
                    endedAt: selectedSession.endedAt,
                  })
                }
                className="mx-auto mt-2 block w-full max-w-[17rem] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] sm:max-w-[20rem]"
                aria-label="Abrir foto do treino"
              >
                <img
                  src={selectedSessionImageUrl}
                  alt="Foto registrada ao finalizar o treino"
                  className="w-full rounded-lg object-cover transition-transform duration-200 hover:scale-[1.01]"
                  style={{ aspectRatio: '4 / 5', maxHeight: '22rem' }}
                />
              </button>
            </div>
          ) : null}

          <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--muted)]">
            <span className="font-semibold text-[var(--text)]">Observacoes:</span>{' '}
            {selectedSession.notes ?? 'Sem observacoes'}
          </p>

          <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4">
            <h3 className="text-sm font-extrabold uppercase tracking-[0.14em] text-[var(--text)]">Exercicios registrados</h3>
            {groupedExerciseHistory.length === 0 ? (
              <p className="rounded-xl border border-[var(--line)] p-3 text-sm text-[var(--muted)]">
                Nenhum exercicio registrado nesta sessao.
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                {groupedExerciseHistory.map((exerciseGroup) => {
                  const totalReps = exerciseGroup.entries.reduce((acc, entry) => acc + (entry.reps ?? 0), 0)
                  const estimatedLoad = exerciseGroup.entries.reduce(
                    (acc, entry) =>
                      entry.weightKg != null && entry.reps != null ? acc + entry.weightKg * entry.reps : acc,
                    0,
                  )

                  return (
                  <article key={exerciseGroup.exerciseId} className="card-glow-orange rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-hover)] p-3 shadow-sm sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[var(--text)]">
                        {exerciseGroup.exerciseName}
                      </p>
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
                        {exerciseGroup.primaryMuscleGroup}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--muted)]">
                        {exerciseGroup.entries.length} set(s)
                      </span>
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--muted)]">
                        Reps totais: {totalReps}
                      </span>
                      <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--muted)]">
                        Carga estimada: {estimatedLoad > 0 ? `${estimatedLoad.toFixed(1)} kg` : '-'}
                      </span>
                    </div>

                    <div className="mt-3 space-y-3 border-t border-[var(--line)] pt-3">
                      {exerciseGroup.entries.map((entry) => (
                        <div key={entry.id} className="card-glow-blue rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--text)]">
                            {entry.exercise.name} · Set {entry.setNumber}
                          </p>
                          <div className="mt-2 grid gap-1 text-xs text-[var(--muted)] sm:grid-cols-2">
                            <p>Reps: {entry.reps ?? '-'}</p>
                            <p>Carga: {entry.weightKg != null ? `${entry.weightKg} kg` : '-'}</p>
                            <p>Duracao: {entry.durationSec != null ? `${entry.durationSec}s` : '-'}</p>
                            <p>Distancia: {entry.distanceMeters != null ? `${entry.distanceMeters} m` : '-'}</p>
                            <p>RPE: {entry.perceivedExertion ?? '-'}</p>
                            <p>Concluido em: {formatDateTime(entry.completedAt)}</p>
                          </div>
                          {entry.notes ? <p className="mt-2 text-xs text-[var(--muted)]">Notas: {entry.notes}</p> : null}
                        </div>
                      ))}
                    </div>
                  </article>
                  )
                })}
              </div>
            )}
          </div>
        </motion.section>

        {selectedSessionPhoto ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setSelectedSessionPhoto(null)}
          >
            <button
              type="button"
              onClick={() => setSelectedSessionPhoto(null)}
              className="absolute right-4 top-4 rounded-full border border-white/25 bg-black/50 px-3 py-1 text-sm font-semibold text-white"
            >
              Fechar
            </button>

            <div
              className="max-h-[90vh] w-full max-w-3xl"
              onClick={(event) => event.stopPropagation()}
            >
              <img
                src={selectedSessionPhoto.url}
                alt="Foto ampliada do treino"
                className="max-h-[82vh] w-full rounded-2xl object-contain"
              />
              <p className="mt-2 text-center text-xs font-semibold text-white/85">
                {formatDateTime(selectedSessionPhoto.endedAt)}
              </p>
            </div>
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="card-glow-orange relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl animate-[tech-spin_20s_linear_infinite]"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Historico</p>
        <h1 className="relative mt-2 text-3xl font-black text-[var(--text)] sm:text-4xl">Seu progresso recente</h1>
        <p className="relative mt-2 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
          Use este painel para acompanhar consistencia e avaliar evolucao de carga, volume e frequencia.
        </p>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            Sessoes: <CountUp value={items.length} className="font-bold text-[var(--text)]" />
          </span>
          <span className="rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            Ultima atualizacao: {new Date().toLocaleDateString('pt-BR')}
          </span>
        </div>
      </motion.header>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {/* Period filter */}
      <div className="flex flex-wrap gap-2">
        {(['week', 'month', '3months', 'all'] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              period === p
                ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                : 'border-[var(--line)] text-[var(--muted)]'
            }`}
          >
            {p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : p === '3months' ? '3 meses' : 'Tudo'}
          </button>
        ))}
      </div>

      {/* Volume chart */}
      {!loading && chartData.length > 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Volume semanal (kg)</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="historyVolumeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity={0.95} />
                  <stop offset="60%" stopColor="var(--accent-blue)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--accent-violet)" stopOpacity={0.85} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text)' }}
                itemStyle={{ color: 'var(--accent-cyan)' }}
                formatter={(v) => [`${v} kg`, 'Volume']}
              />
              <Bar dataKey="volume" fill="url(#historyVolumeGradient)" radius={[6, 6, 0, 0]} animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="grid gap-3">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-10 text-center">
            <Dumbbell size={36} className="mx-auto mb-3 text-[var(--muted)]" strokeWidth={1.5} />
            <p className="text-base font-bold text-[var(--text)]">Nenhum treino registrado</p>
            <p className="mt-1 text-sm text-[var(--muted)]">Finalize seu primeiro treino para ver o histórico aqui.</p>
            <Link to="/train" className="mt-4 inline-block rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white">
              Ir para Treinar
            </Link>
          </div>
        ) : null}

        {!loading && !error && items.length > 0 && filteredItems.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--muted)]">Nenhum treino no período selecionado.</p>
        ) : null}

        {filteredItems.map((session, index) => (
          (() => {
            const totalVolumeKg = calculateTotalVolumeKg(session)

            return (
          <motion.article
            key={session.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.07 * index, ease: 'easeOut' }}
            className="card-glow-mixed rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-extrabold text-[var(--text)]">
                {session.workoutPlan?.name ?? 'Treino sem plano'}
              </h2>
              <span className="rounded-full border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">
                {formatDuration(session.durationSec)}
              </span>
            </div>
            <div className="mt-2 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-3">
              <p className="rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-1">
                Registros: {session.historyEntriesCount}
              </p>
              <p className="rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-1">
                Status: {session.status}
              </p>
              <p className="rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-1">
                Finalizado em {session.endedAt ? new Date(session.endedAt).toLocaleString('pt-BR') : '-'}
              </p>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Volume total: {totalVolumeKg > 0 ? `${totalVolumeKg.toFixed(1)} kg` : '-'}
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">{session.notes ?? 'Sem observacoes'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedSessionId(session.id)
                }}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--text)]"
              >
                Ver detalhes do treino
              </button>
            </div>
          </motion.article>
            )
          })()
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/"
          className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
        >
          Voltar ao dashboard
        </Link>
      </div>
    </section>
  )
}
