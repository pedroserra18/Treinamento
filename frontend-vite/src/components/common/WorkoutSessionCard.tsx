import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { ArrowRight, ChevronUp } from 'lucide-react'
import type { WorkoutSessionHistory } from '../../types/workout'
import { HistoryExerciseCard } from './HistoryExerciseCard'
import { groupExerciseHistory } from '../../lib/workout-history-grouping'

// ─── Formatters (mirror FeedPage so the visual reads the same) ────────────

function formatDuration(sec: number | null): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

function formatVolume(kg: number): string {
  if (kg <= 0) return '—'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace(/\.0$/, '')} t`
  return `${Math.round(kg)} kg`
}

function formatHHMM(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatRelativeDate(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sessionDay = new Date(d)
  sessionDay.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((today.getTime() - sessionDay.getTime()) / 86400000)
  if (diffDays === 0) return 'hoje'
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return `${diffDays}d atrás`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ─── Mini stat tile inside the card (same shape as Feed's FeedStat) ───────

function StatTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
      <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-extrabold leading-none tracking-tight ${
          highlight ? 'text-[var(--brand)]' : 'text-[var(--text)]'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────

export function WorkoutSessionCard({ session }: { session: WorkoutSessionHistory }) {
  const [expanded, setExpanded] = useState(false)

  // Aggregate everything we need from the session's flat history. The work is
  // tiny per session but it'd be wasteful to redo on every render, so memo.
  const summary = useMemo(() => {
    const totalVolume = session.history.reduce(
      (acc, e) => acc + ((e.weightKg ?? 0) > 0 && (e.reps ?? 0) > 0 ? e.weightKg! * e.reps! : 0),
      0,
    )

    // Count unique exercises preserving execution order for the chip row.
    const seen = new Set<string>()
    const chips: { id: string; name: string; setCount: number }[] = []
    for (const e of session.history) {
      if (seen.has(e.exercise.id)) {
        chips[chips.findIndex((c) => c.id === e.exercise.id)].setCount += 1
        continue
      }
      seen.add(e.exercise.id)
      chips.push({ id: e.exercise.id, name: e.exercise.name, setCount: 1 })
    }

    return { totalVolume, chips }
  }, [session])

  const exerciseGroups = useMemo(() => groupExerciseHistory(session), [session])

  const endedAt = session.endedAt
  const titleSplit = session.workoutPlan?.name ?? 'Treino livre'

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] transition-colors hover:border-[var(--brand)]/40">
      <div className="space-y-4 p-5 sm:p-6">
        {/* HEADER — workout title + relative date. The "Ver stats completos"
            toggle in the footer already exposes the full session content
            inline, so we don't surface a separate /workouts/:id link here. */}
        <header className="min-w-0">
          <h3 className="truncate text-base font-bold text-[var(--text)] sm:text-lg">
            {titleSplit}
          </h3>
          {endedAt && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px] tracking-wide text-[var(--muted)]">
              <span>{formatRelativeDate(endedAt)}</span>
              <span className="opacity-50">·</span>
              <span>{formatHHMM(endedAt)}</span>
            </p>
          )}
        </header>

        {/* STATS — 3 columns, same layout as Feed PostCard */}
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="DURAÇÃO" value={formatDuration(session.durationSec)} />
          <StatTile label="VOLUME" value={formatVolume(summary.totalVolume)} highlight />
          <StatTile label="EXERCÍCIOS" value={String(summary.chips.length)} />
        </div>

        {/* EXERCISE CHIPS — collapsed view */}
        {summary.chips.length > 0 && !expanded && (
          <div className="flex flex-wrap gap-1.5">
            {summary.chips.slice(0, 6).map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1 text-xs text-[var(--text)]"
              >
                <span className="font-medium">{c.name}</span>
                <span className="font-mono text-[10.5px] font-bold text-[var(--muted)]">{c.setCount}x</span>
              </span>
            ))}
            {summary.chips.length > 6 && (
              <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1 text-xs text-[var(--muted)]">
                +{summary.chips.length - 6}
              </span>
            )}
          </div>
        )}

        {/* EXPANDED — full set-by-set view using the shared HistoryExerciseCard */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <ul className="flex list-none flex-col gap-2.5 p-0">
                {exerciseGroups.map((group) => (
                  <HistoryExerciseCard key={group.exerciseId} group={group} />
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FOOTER — toggle button (no like/comment since this is private) */}
        {summary.chips.length > 0 && (
          <div className="flex items-center justify-end border-t border-dashed border-[var(--line)] pt-3">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:border-[var(--brand)]/40"
            >
              {expanded ? 'Ocultar detalhes' : 'Ver stats completos'}
              {expanded ? <ChevronUp size={13} /> : <ArrowRight size={13} />}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
