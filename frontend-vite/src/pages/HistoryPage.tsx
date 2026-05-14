import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEffect, useMemo, useState } from 'react'
import type { WorkoutSessionHistory } from '../types/workout'
import { listWorkoutHistory } from '../services/workoutService'
import { getStoredWorkoutSessionImage } from '../lib/workout-session-image'
import { SkeletonCard } from '../components/common/Skeleton'
import { CountUp } from '../components/common/CountUp'
import { ImageViewer } from '../components/common/ImageViewer'
import { Dumbbell, Check, BarChart3 } from 'lucide-react'
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

// ─── Card styling helpers (shared visual language with the Feed card) ──────

// Muscle pill palette, kept in sync with FeedPage's mapping so a back/chest
// session looks identical between feed and history.
const MUSCLE_PILL: Record<string, { bg: string; fg: string }> = {
  ABDOMEN:   { bg: '#fff1cc', fg: '#8a5a00' },
  ABDOMINAL: { bg: '#fff1cc', fg: '#8a5a00' },
  CORE:      { bg: '#d6f3df', fg: '#1b6b3a' },
  BACK:      { bg: '#dbe7ff', fg: '#1c3d8f' },
  COSTAS:    { bg: '#dbe7ff', fg: '#1c3d8f' },
  CHEST:     { bg: '#ffe1d6', fg: '#8a3a18' },
  PEITO:     { bg: '#ffe1d6', fg: '#8a3a18' },
  LEGS:      { bg: '#e8dcff', fg: '#3a1c8f' },
  PERNAS:    { bg: '#e8dcff', fg: '#3a1c8f' },
  GLUTES:    { bg: '#fde2f0', fg: '#7a1c52' },
  SHOULDERS: { bg: '#fff3d6', fg: '#7a5a00' },
  OMBROS:    { bg: '#fff3d6', fg: '#7a5a00' },
  BICEPS:    { bg: '#d6f3f0', fg: '#1b5a6b' },
  TRICEPS:   { bg: '#d6e8f3', fg: '#1b4a6b' },
  ARMS:      { bg: '#d6f3f0', fg: '#1b5a6b' },
  BRACOS:    { bg: '#d6f3f0', fg: '#1b5a6b' },
}

function musclePillStyle(group: string): { bg: string; fg: string } {
  const key = group.toUpperCase().replace(/[^A-Z]/g, '')
  return MUSCLE_PILL[key] ?? { bg: 'var(--surface-hover)', fg: 'var(--muted)' }
}

type SetKind = 'duration' | 'distance' | 'reps'

function detectEntryKind(entry: HistoryEntry): SetKind {
  if (entry.durationSec != null && entry.durationSec > 0) return 'duration'
  if (entry.distanceMeters != null && entry.distanceMeters > 0) return 'distance'
  return 'reps'
}

// Volume for weighted reps, raw reps for bodyweight, or the raw time/distance
// when those are the units. Same definition as the feed card.
function entryMagnitude(entry: HistoryEntry, kind: SetKind): number {
  if (kind === 'duration') return entry.durationSec ?? 0
  if (kind === 'distance') return entry.distanceMeters ?? 0
  const reps = entry.reps ?? 0
  const w = entry.weightKg ?? 0
  return w > 0 ? w * reps : reps
}

function formatMMSS(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// RIR is still serialised inside `notes` ("RIR: N"). Extract it so the card
// can surface RIR side-by-side with RPE — same pattern used in workoutService.
function rirFromNotes(notes: string | null | undefined): number | null {
  if (!notes) return null
  const match = notes.match(/RIR\s*:\s*(\d+)/i)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

function HistorySetRow({ entry, kind, fillPct }: { entry: HistoryEntry; kind: SetKind; fillPct: number }) {
  const rpe = entry.perceivedExertion
  const rir = rirFromNotes(entry.notes)
  const rpeHigh = rpe != null && rpe >= 8

  const valueNode = (() => {
    if (kind === 'duration') return <>{formatMMSS(entry.durationSec ?? 0)}<small>s</small></>
    if (kind === 'distance') return <>{entry.distanceMeters}<small>m</small></>
    const reps = entry.reps ?? 0
    const w = entry.weightKg
    if (w != null && w > 0) return <>{w}<small>kg × {reps}</small></>
    return <>{reps}<small>reps</small></>
  })()

  const barBg = kind === 'duration'
    ? 'repeating-linear-gradient(90deg, var(--surface-hover) 0 6px, transparent 6px 8px)'
    : 'var(--surface-hover)'

  return (
    <div
      className="grid items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-[var(--surface-hover)]/60"
      style={{ gridTemplateColumns: '36px 1fr 92px 50px 50px' }}
    >
      <div className="flex items-center justify-center gap-1 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        S{entry.setNumber}
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: barBg }}>
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.max(8, Math.min(100, fillPct))}%`,
            background: 'linear-gradient(90deg, color-mix(in srgb, var(--brand) 55%, white), var(--brand))',
            boxShadow: '0 0 6px -1px color-mix(in srgb, var(--brand) 50%, transparent)',
          }}
        />
      </div>
      <div className="text-right font-mono text-[13px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
        {valueNode}
      </div>
      <div
        className={`rounded-md border px-1 py-[2px] text-center font-mono text-[10.5px] font-medium ${
          rir == null
            ? 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]'
            : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--text)]'
        }`}
        title="Reps in reserve"
      >
        {rir ?? '—'}
      </div>
      <div
        className={`rounded-md border px-1 py-[2px] text-center font-mono text-[10.5px] font-medium ${
          rpe == null
            ? 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]'
            : rpeHigh
              ? 'border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]'
              : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]'
        }`}
        title="Rate of perceived exertion"
      >
        {rpe ?? '—'}
      </div>
    </div>
  )
}

function HistoryExerciseCard({ group }: { group: GroupedExerciseHistory }) {
  // Pick tracking kind from the first entry — sessions don't mix kinds within
  // a single exercise, so this is safe and matches the feed card's logic.
  const kind: SetKind = group.entries[0] ? detectEntryKind(group.entries[0]) : 'reps'

  const totalReps = group.entries.reduce((s, e) => s + (e.reps ?? 0), 0)
  const totalDuration = group.entries.reduce((s, e) => s + (e.durationSec ?? 0), 0)
  const totalDistance = group.entries.reduce((s, e) => s + (e.distanceMeters ?? 0), 0)
  const totalVolume = group.entries.reduce(
    (s, e) => s + ((e.weightKg ?? 0) > 0 && (e.reps ?? 0) > 0 ? (e.weightKg as number) * (e.reps as number) : 0),
    0,
  )

  const summaryStat = kind === 'duration'
    ? `${totalDuration}s totais`
    : kind === 'distance'
      ? `${totalDistance}m totais`
      : `${totalReps} reps`

  const maxMagnitude = Math.max(1, ...group.entries.map((e) => entryMagnitude(e, kind)))

  const rpes = group.entries.map((e) => e.perceivedExertion).filter((v): v is number => v != null)
  const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null
  const rpeBars = avgRpe == null ? 0 : Math.max(0, Math.min(5, Math.round(avgRpe / 2)))

  const rirs = group.entries.map((e) => rirFromNotes(e.notes)).filter((v): v is number => v != null)
  const avgRir = rirs.length > 0 ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null

  const pill = musclePillStyle(group.primaryMuscleGroup)

  const valueLabel = kind === 'duration' ? 'Tempo' : kind === 'distance' ? 'Distância' : 'Reps'
  const barLabel = kind === 'duration' ? 'Sustentação' : kind === 'distance' ? 'Trajeto' : 'Intensidade'

  return (
    <li className="group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] transition-colors hover:border-[var(--brand)]/40">
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: 'linear-gradient(180deg, var(--accent-emerald), #4ac876)', opacity: 0.55 }}
      />

      {/* Header */}
      <div className="flex items-start gap-3 px-3.5 pt-3 pb-2.5 sm:px-4">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-emerald-500 text-white">
          <Check size={14} strokeWidth={3} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-bold leading-tight text-[var(--text)]">
              {group.exerciseName}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-[var(--muted)]">
            <span
              className="rounded-full px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-wider"
              style={{ background: pill.bg, color: pill.fg }}
            >
              {group.primaryMuscleGroup}
            </span>
            <span className="opacity-60">·</span>
            <span>{group.entries.length} séries</span>
            <span className="opacity-60">·</span>
            <span>{summaryStat}</span>
            {totalVolume > 0 && (
              <>
                <span className="opacity-60">·</span>
                <span>vol {totalVolume.toFixed(1)}kg</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sets table */}
      <div className="mx-3.5 border-t border-dashed border-[var(--line)] pt-2 pb-1 sm:mx-4">
        <div
          className="grid items-center gap-2.5 px-1 pb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
          style={{ gridTemplateColumns: '36px 1fr 92px 50px 50px' }}
        >
          <span>Série</span>
          <span>{barLabel}</span>
          <span className="text-right">{valueLabel}</span>
          <span className="text-right">RIR</span>
          <span className="text-right">RPE</span>
        </div>
        {group.entries.map((entry) => {
          const fillPct = (entryMagnitude(entry, kind) / maxMagnitude) * 100
          return <HistorySetRow key={entry.id} entry={entry} kind={kind} fillPct={fillPct} />
        })}
      </div>

      {/* Footer: RIR + RPE averages */}
      <div className="flex flex-wrap items-center gap-2 px-3.5 pb-3 pt-2 sm:px-4">
        <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-1 font-mono text-[10px] text-[var(--muted)]">
          RIR médio <b className="font-semibold text-[var(--text)]">{avgRir != null ? avgRir.toFixed(1) : '—'}</b>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-1 font-mono text-[10px] text-[var(--muted)]">
          RPE médio <b className="font-semibold text-[var(--text)]">{avgRpe != null ? avgRpe.toFixed(1) : '—'}</b>
          <span className="ml-0.5 inline-flex gap-[1.5px]">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className="block h-2 w-[3px] rounded-[1px]"
                style={{ background: i < rpeBars ? 'var(--brand)' : 'var(--line)' }}
              />
            ))}
          </span>
        </div>
        <div className="flex-1" />
        <Link
          to={`/exercises/${group.exerciseId}`}
          className="inline-flex items-center gap-1 font-mono text-[10.5px] tracking-wide text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          <BarChart3 size={11} />
          ver evolução
        </Link>
      </div>
    </li>
  )
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
              <p className="mt-3 rounded-xl border border-[var(--line)] p-3 text-sm text-[var(--muted)]">
                Nenhum exercicio registrado nesta sessao.
              </p>
            ) : (
              <ul className="mt-3 flex list-none flex-col gap-2.5 p-0">
                {groupedExerciseHistory.map((group) => (
                  <HistoryExerciseCard key={group.exerciseId} group={group} />
                ))}
              </ul>
            )}
          </div>
        </motion.section>

        {selectedSessionPhoto ? (
          <ImageViewer
            src={selectedSessionPhoto.url}
            alt="Foto ampliada do treino"
            shape="portrait"
            caption={formatDateTime(selectedSessionPhoto.endedAt)}
            onClose={() => setSelectedSessionPhoto(null)}
          />
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
            Sessões{period === 'week' ? ' (últimos 7 dias)' : period === 'month' ? ' (últimos 30 dias)' : period === '3months' ? ' (últimos 90 dias)' : ' (total)'}: <CountUp value={filteredItems.length} className="font-bold text-[var(--text)]" />
          </span>
          <span className="rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
            Última atualização: {filteredItems[0]?.endedAt ? new Date(filteredItems[0].endedAt).toLocaleDateString('pt-BR') : '—'}
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
