import { motion } from 'framer-motion'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { ImageViewer } from '../components/common/ImageViewer'
import { SkeletonCard } from '../components/common/Skeleton'
import { getStoredWorkoutSessionImage } from '../lib/workout/workout-session-image'
import { getWorkoutSessionById, getSessionHighlights, type SessionHighlights } from '../services/workoutService'
import { HistoryExerciseCard } from '../components/common/HistoryExerciseCard'
import { WorkoutShareEditor } from '../components/common/WorkoutShareEditor'
import { groupExerciseHistory } from '../lib/workout/workout-history-grouping'
import type { WorkoutSessionHistory } from '../types/workout'
import { ArrowLeft, Calendar, Dumbbell, Flame, Layers, Timer, Weight, Share2 } from 'lucide-react'

function formatDuration(totalSeconds: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) return '0m'
  const hours = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR')
}

function calculateTotalVolumeKg(session: WorkoutSessionHistory): number {
  return session.history.reduce((acc, e) => {
    if (e.weightKg == null || e.reps == null) return acc
    if (e.weightKg <= 0 || e.reps <= 0) return acc
    return acc + e.weightKg * e.reps
  }, 0)
}

export function WorkoutDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { authorizedFetch } = useAuth()
  const navigate = useNavigate()
  const [session, setSession] = useState<WorkoutSessionHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [imageOpen, setImageOpen] = useState(false)
  const [shareHighlights, setShareHighlights] = useState<SessionHighlights | null>(null)
  const [loadingShare, setLoadingShare] = useState(false)

  useEffect(() => {
    if (!sessionId) {
      setError('Sessão não especificada')
      setLoading(false)
      return
    }
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await getWorkoutSessionById(authorizedFetch, sessionId)
        if (!cancelled) setSession(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Sessão não encontrada')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [authorizedFetch, sessionId])

  const groups = useMemo(() => session ? groupExerciseHistory(session) : [], [session])
  const totalVolume = session ? calculateTotalVolumeKg(session) : 0
  const imageUrl = session ? getStoredWorkoutSessionImage(session.id) : null

  if (loading) {
    return (
      <section className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </section>
    )
  }

  if (error || !session) {
    return (
      <section className="space-y-4">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-1"
        >
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft size={11} />
            Voltar
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-3xl">
            Sessão não encontrada
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {error ?? 'Esta sessão não existe ou foi removida.'}
          </p>
          <Link
            to="/profile"
            className="mt-4 inline-block rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
          >
            Voltar para o perfil
          </Link>
        </motion.header>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-1"
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={11} />
          Voltar
        </button>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
              {session.workoutPlan ? 'Sessão concluída' : 'Treino livre'}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
              {session.workoutPlan?.name ?? 'Treino livre'}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              {formatDateTime(session.endedAt)}
            </p>
          </div>
          <button
            type="button"
            disabled={loadingShare}
            onClick={async () => {
              if (!sessionId) return
              try {
                setLoadingShare(true)
                const highlights = await getSessionHighlights(authorizedFetch, sessionId)
                setShareHighlights(highlights)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Erro ao preparar imagem')
              } finally {
                setLoadingShare(false)
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--brand)] bg-[var(--brand)]/10 px-3 py-2 text-[12.5px] font-bold text-[var(--brand)] disabled:opacity-60"
          >
            <Share2 size={13} />
            {loadingShare ? 'Preparando…' : 'Compartilhar'}
          </button>
        </div>
      </motion.header>

      {/* ────────── METRICS GRID ────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
      >
        <MetricCard icon={<Timer size={14} />} label="Duração" value={formatDuration(session.durationSec)} />
        <MetricCard
          icon={<Weight size={14} />}
          label="Volume"
          value={totalVolume > 0
            ? totalVolume >= 1000
              ? `${(totalVolume / 1000).toFixed(1).replace(/\.0$/, '')}k kg`
              : `${totalVolume.toFixed(1)} kg`
            : '—'}
        />
        <MetricCard
          icon={<Flame size={14} />}
          label="Calorias"
          value={session.caloriesBurned != null ? `${session.caloriesBurned}` : '—'}
        />
        <MetricCard icon={<Layers size={14} />} label="Registros" value={`${session.historyEntriesCount}`} />
      </motion.section>

      {/* ────────── DATES + STATUS ────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
      >
        <SubMetric label="Status" value={session.status} />
        <SubMetric label="Início" value={formatDateTime(session.startedAt)} />
        <SubMetric label="Fim" value={formatDateTime(session.endedAt)} />
      </motion.div>

      {/* ────────── SESSION PHOTO (if any) ────────── */}
      {imageUrl && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 sm:p-4"
        >
          <p className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            <Calendar size={11} className="inline-block mr-1 -mt-0.5" />
            Foto do final do treino
          </p>
          <button
            type="button"
            onClick={() => setImageOpen(true)}
            className="mx-auto block w-full max-w-[20rem] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
            aria-label="Abrir foto do treino"
          >
            <img
              src={imageUrl}
              alt="Foto registrada ao finalizar o treino"
              className="w-full rounded-lg object-cover transition-transform hover:scale-[1.01]"
              style={{ aspectRatio: '4 / 5', maxHeight: '22rem' }}
            />
          </button>
        </motion.div>
      )}

      {/* ────────── NOTES ────────── */}
      {session.notes && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
        >
          <p className="mb-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Observações
          </p>
          <p className="text-[13.5px] text-[var(--text)] whitespace-pre-wrap">{session.notes}</p>
        </motion.div>
      )}

      {/* ────────── EXERCISES ────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
      >
        <div className="mb-2.5 flex items-center gap-2 px-1">
          <Dumbbell size={13} className="text-[var(--muted)]" />
          <h2 className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Exercícios registrados
          </h2>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
            Nenhum exercício registrado nesta sessão.
          </div>
        ) : (
          <ul className="flex list-none flex-col gap-2.5 p-0">
            {groups.map((group) => (
              <HistoryExerciseCard key={group.exerciseId} group={group} />
            ))}
          </ul>
        )}
      </motion.section>

      {imageOpen && imageUrl && (
        <ImageViewer
          src={imageUrl}
          alt="Foto ampliada do treino"
          shape="portrait"
          caption={formatDateTime(session.endedAt)}
          onClose={() => setImageOpen(false)}
        />
      )}

      {shareHighlights && (
        <WorkoutShareEditor
          highlights={shareHighlights}
          initialPhoto={sessionId ? getStoredWorkoutSessionImage(sessionId) : null}
          onClose={() => setShareHighlights(null)}
        />
      )}
    </section>
  )
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5">
      <div className="mb-1 flex items-center gap-1.5 text-[var(--muted)]">
        {icon}
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em]">{label}</span>
      </div>
      <p className="text-[20px] font-semibold tracking-tight text-[var(--text)]">{value}</p>
    </div>
  )
}

function SubMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2">
      <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-[var(--text)]">{value}</p>
    </div>
  )
}
