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

export function HistoryPage() {
  const { authorizedFetch } = useAuth()
  const [items, setItems] = useState<WorkoutSessionHistory[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectedSession = items.find((session) => session.id === selectedSessionId) ?? null

  useEffect(() => {
    void listWorkoutHistory(authorizedFetch)
      .then((result) => {
        setItems(result.items)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar historico')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [authorizedFetch])

  if (selectedSession) {
    return (
      <section className="space-y-4">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
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
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"
        >
          <div className="grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
            <p>
              <span className="font-semibold text-[var(--text)]">Status:</span> {selectedSession.status}
            </p>
            <p>
              <span className="font-semibold text-[var(--text)]">Duracao:</span> {formatDuration(selectedSession.durationSec)}
            </p>
            <p>
              <span className="font-semibold text-[var(--text)]">Calorias:</span>{' '}
              {selectedSession.caloriesBurned != null ? selectedSession.caloriesBurned : '-'}
            </p>
            <p>
              <span className="font-semibold text-[var(--text)]">Total de registros:</span> {selectedSession.historyEntriesCount}
            </p>
            <p>
              <span className="font-semibold text-[var(--text)]">Inicio:</span> {formatDateTime(selectedSession.startedAt)}
            </p>
            <p>
              <span className="font-semibold text-[var(--text)]">Fim:</span> {formatDateTime(selectedSession.endedAt)}
            </p>
          </div>

          <p className="mt-3 text-sm text-[var(--muted)]">
            <span className="font-semibold text-[var(--text)]">Observacoes:</span>{' '}
            {selectedSession.notes ?? 'Sem observacoes'}
          </p>

          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-extrabold uppercase tracking-[0.14em] text-[var(--text)]">Exercicios registrados</h3>
            {selectedSession.history.length === 0 ? (
              <p className="rounded-xl border border-[var(--line)] p-3 text-sm text-[var(--muted)]">
                Nenhum exercicio registrado nesta sessao.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedSession.history.map((entry) => (
                  <article key={entry.id} className="rounded-xl border border-[var(--line)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold text-[var(--text)]">
                        {entry.exercise.name} · Set {entry.setNumber}
                      </p>
                      <span className="text-xs text-[var(--muted)]">{entry.exercise.primaryMuscleGroup}</span>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-[var(--muted)] sm:grid-cols-2">
                      <p>Reps: {entry.reps ?? '-'}</p>
                      <p>Carga: {entry.weightKg != null ? `${entry.weightKg} kg` : '-'}</p>
                      <p>Duracao: {entry.durationSec != null ? `${entry.durationSec}s` : '-'}</p>
                      <p>Distancia: {entry.distanceMeters != null ? `${entry.distanceMeters} m` : '-'}</p>
                      <p>RPE: {entry.perceivedExertion ?? '-'}</p>
                      <p>Concluido em: {formatDateTime(entry.completedAt)}</p>
                    </div>
                    {entry.notes ? <p className="mt-2 text-xs text-[var(--muted)]">Notas: {entry.notes}</p> : null}
                  </article>
                ))}
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
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Historico</p>
        <h1 className="mt-2 text-3xl font-black text-[var(--text)] sm:text-4xl">Seu progresso recente</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
          Use este painel para acompanhar consistencia e avaliar evolucao de carga, volume e frequencia.
        </p>
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
            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-extrabold text-[var(--text)]">
                {session.workoutPlan?.name ?? 'Treino sem plano'}
              </h2>
              <span className="rounded-full border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">
                {formatDuration(session.durationSec)}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">{session.notes ?? 'Sem observacoes'}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Finalizado em {session.endedAt ? new Date(session.endedAt).toLocaleString('pt-BR') : '-'}
            </p>
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
