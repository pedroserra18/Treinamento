import { Link } from 'react-router-dom'
import { BarChart3, Check } from 'lucide-react'
import {
  rirFromNotes,
  userNoteFromNotes,
  type GroupedExerciseHistory,
  type HistoryEntry,
} from '../../lib/workout/workout-history-grouping'

// ─── Local visual helpers ─────────────────────────────────────────────────

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

export function HistoryExerciseCard({ group }: { group: GroupedExerciseHistory }) {
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

  const userNote =
    group.entries
      .map((entry) => userNoteFromNotes(entry.notes))
      .find((value): value is string => value != null) ?? null

  const valueLabel = kind === 'duration' ? 'Tempo' : kind === 'distance' ? 'Distância' : 'Reps'
  const barLabel = kind === 'duration' ? 'Sustentação' : kind === 'distance' ? 'Trajeto' : 'Intensidade'

  return (
    <li className="group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] transition-colors hover:border-[var(--brand)]/40">
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: 'linear-gradient(180deg, var(--accent-emerald), #4ac876)', opacity: 0.55 }}
      />

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
        {userNote ? (
          <p className="mt-2 rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1.5 text-[11.5px] italic leading-snug text-[var(--muted)]">
            "{userNote}"
          </p>
        ) : null}
      </div>

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
