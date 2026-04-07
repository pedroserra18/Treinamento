import { useEffect, useState } from 'react'

import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import { listWorkoutHistory } from '../services/workoutService'
import type { WorkoutSessionHistory } from '../types/workout'

function formatDuration(totalSeconds: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) {
    return '0m'
  }

  const hours = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

export function HistoryPage() {
  const { authorizedFetch } = useAuth()
  const [items, setItems] = useState<WorkoutSessionHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
          </motion.article>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/workouts"
          className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
        >
          Explorar treinos
        </Link>
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
