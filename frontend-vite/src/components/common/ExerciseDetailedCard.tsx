import { Check, BarChart3 } from 'lucide-react'
import type { WorkoutSet, WorkoutExerciseSummary } from '../../services/socialService'
import { detectSetKind, setMagnitude, musclePillStyle, formatMMSS, type SetKind } from './feed-post-utils'

// Detalhamento por-exercício do post: cabeçalho (nome + pill de músculo +
// resumo) e a tabela de séries (barra de intensidade + valor + RPE). Extraído
// do FeedPostCard.

function SetRow({ set, kind, fillPct }: { set: WorkoutSet; kind: SetKind; fillPct: number }) {
  const rpe = set.perceivedExertion
  const rpeHigh = rpe != null && rpe >= 8

  const valueNode = (() => {
    if (kind === 'duration') {
      return <>{formatMMSS(set.durationSec ?? 0)}<small>s</small></>
    }
    if (kind === 'distance') {
      return <>{set.distanceMeters}<small>m</small></>
    }
    const reps = set.reps ?? 0
    const w = set.weightKg
    if (w != null && w > 0) {
      return <>{w}<small>kg × {reps}</small></>
    }
    return <>{reps}<small>reps</small></>
  })()

  const barBg = kind === 'duration'
    ? 'repeating-linear-gradient(90deg, var(--surface-hover) 0 6px, transparent 6px 8px)'
    : 'var(--surface-hover)'

  return (
    <div
      className="grid items-center gap-2.5 px-1 py-1.5 transition-colors hover:bg-[var(--surface-hover)]/60 rounded-lg"
      style={{ gridTemplateColumns: '36px 1fr 92px 50px' }}
    >
      <div className="flex items-center justify-center gap-1 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        S{set.setNumber}
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
          rpe == null
            ? 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]'
            : rpeHigh
              ? 'border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]'
              : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]'
        }`}
      >
        {rpe ?? '—'}
      </div>
    </div>
  )
}

export function ExerciseDetailedCard({ ex }: { ex: WorkoutExerciseSummary }) {
  const kind: SetKind = detectSetKind(ex.sets[0] ?? { setNumber: 1, reps: null, weightKg: null, durationSec: null, distanceMeters: null, perceivedExertion: null })

  const totalReps = ex.sets.reduce((s, set) => s + (set.reps ?? 0), 0)
  const totalDuration = ex.sets.reduce((s, set) => s + (set.durationSec ?? 0), 0)
  const totalDistance = ex.sets.reduce((s, set) => s + (set.distanceMeters ?? 0), 0)

  const summaryStat = kind === 'duration'
    ? `${totalDuration}s totais`
    : kind === 'distance'
      ? `${totalDistance}m totais`
      : `${totalReps} reps`

  const maxMagnitude = Math.max(1, ...ex.sets.map((s) => setMagnitude(s, kind)))

  const rpes = ex.sets.map((s) => s.perceivedExertion).filter((v): v is number => v != null)
  const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null
  const rpeBars = avgRpe == null ? 0 : Math.max(0, Math.min(5, Math.round(avgRpe / 2)))

  const pill = musclePillStyle(ex.primaryMuscleGroup)

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
              {ex.name}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-[var(--muted)]">
            <span
              className="rounded-full px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-wider"
              style={{ background: pill.bg, color: pill.fg }}
            >
              {ex.primaryMuscleGroup}
            </span>
            <span className="opacity-60">·</span>
            <span>{ex.sets.length} séries</span>
            <span className="opacity-60">·</span>
            <span>{summaryStat}</span>
            {ex.totalVolumeKg > 0 && (
              <>
                <span className="opacity-60">·</span>
                <span>vol {ex.totalVolumeKg}kg</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mx-3.5 border-t border-dashed border-[var(--line)] pt-2 pb-1 sm:mx-4">
        <div
          className="grid items-center gap-2.5 px-1 pb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
          style={{ gridTemplateColumns: '36px 1fr 92px 50px' }}
        >
          <span>Série</span>
          <span>{barLabel}</span>
          <span className="text-right">{valueLabel}</span>
          <span className="text-right">RPE</span>
        </div>
        {ex.sets.map((set) => {
          const fillPct = (setMagnitude(set, kind) / maxMagnitude) * 100
          return <SetRow key={set.setNumber} set={set} kind={kind} fillPct={fillPct} />
        })}
        {ex.userNote ? (
          <p className="mt-2 rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1.5 text-[11.5px] italic leading-snug text-[var(--muted)]">
            "{ex.userNote}"
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3.5 pb-3 pt-2 sm:px-4">
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
        <button
          type="button"
          className="inline-flex items-center gap-1 font-mono text-[10.5px] tracking-wide text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          title="Em breve"
        >
          <BarChart3 size={11} />
          comparar
        </button>
      </div>
    </li>
  )
}
