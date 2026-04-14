import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEffect, useState } from 'react'
import type { WorkoutSessionHistory } from '../types/workout'
import { listWorkoutHistory } from '../services/workoutService'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectedSession = items.find((session) => session.id === selectedSessionId) ?? null

  const groupedExerciseHistory = selectedSession
    ? (() => {
        const grouped = new Map<string, GroupedExerciseHistory>()

        const orderedEntries = [...selectedSession.history].sort((a, b) => {
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
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <motion.header
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="card-glow-orange rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Historico</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--text)] sm:text-4xl">Seu progresso recente</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
          Use este painel para acompanhar consistencia e avaliar evolucao de carga, volume e frequencia.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            Sessoes: {items.length}
          </span>
          <span className="rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            Ultima atualizacao: {new Date().toLocaleDateString('pt-BR')}
          </span>
        </div>
      </motion.header>

      {loading ? <p className="text-sm text-[var(--muted)]">Carregando historico...</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-3">
        {!loading && !error && items.length === 0 ? (
          <p className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            Nenhum treino registrado no historico.
          </p>
        ) : null}

        {items.map((session, index) => (
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
