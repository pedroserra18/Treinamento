import { Flame, Layers, Sparkles } from 'lucide-react'
import { relativeDaysFromNow } from './helpers'
import { computeSummaryMetrics, type LastUseInfo } from './summary-metrics'
import type { ActiveExercise, TrainOriginMode } from './types'

// Cards de métricas do resumo — Volume + Séries sempre; PRs/Sets concluídos/vs
// último treino só quando há informação útil. O cálculo fica em
// computeSummaryMetrics (pura/testável); aqui só renderiza.
export function SummaryMetricsCards({
  prByExerciseId,
  prSnapshotAtStart,
  activeExercises,
  originMode,
  activePlanId,
  lastUseByPlanId,
  elapsedSec,
  totals,
}: {
  prByExerciseId: Record<string, number | null>
  prSnapshotAtStart: Record<string, number>
  activeExercises: ActiveExercise[]
  originMode: TrainOriginMode
  activePlanId: string
  lastUseByPlanId: Record<string, LastUseInfo>
  elapsedSec: number
  totals: { totalSeries: number; totalVolumeKg: number }
}) {
  const {
    newPrs,
    completedSetsCount,
    totalSetsAttempted,
    completePct,
    durationDelta,
    lastDurationMin,
    lastSessionEndedAt,
    hasSecondRow,
  } = computeSummaryMetrics({
    prByExerciseId,
    prSnapshotAtStart,
    activeExercises,
    originMode,
    activePlanId,
    lastUseByPlanId,
    elapsedSec,
  })

  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-[var(--brand)]/20 bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_12%,var(--surface))] to-[var(--surface)] p-3.5">
          <div className="flex items-center gap-1.5 text-[var(--brand)]">
            <Flame size={14} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Volume</p>
          </div>
          <p className="mt-1.5 text-2xl font-black text-[var(--text)]">
            {Math.round(totals.totalVolumeKg).toLocaleString('pt-BR')}{' '}
            <span className="text-base font-semibold text-[var(--muted)]">kg</span>
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-[var(--accent-blue)]/20 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent-blue)_10%,var(--surface))] to-[var(--surface)] p-3.5">
          <div className="flex items-center gap-1.5 text-[var(--accent-blue)]">
            <Layers size={14} />
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Séries</p>
          </div>
          <p className="mt-1.5 text-2xl font-black text-[var(--text)]">{totals.totalSeries}</p>
        </div>
      </div>

      {hasSecondRow && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {newPrs.length > 0 && (
            <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-[var(--surface)] p-3.5">
              <div className="flex items-center gap-1.5 text-amber-500">
                <Sparkles size={14} />
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">PRs novos</p>
              </div>
              <p className="mt-1.5 text-2xl font-black text-[var(--text)]">{newPrs.length}</p>
              <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--muted)]">
                {newPrs.slice(0, 3).map((pr) => (
                  <li key={pr.name} className="truncate">
                    • {pr.name}: <b className="text-amber-600">{pr.load}kg</b>
                    {pr.previous != null ? <span className="text-[var(--muted)]"> (era {pr.previous}kg)</span> : null}
                  </li>
                ))}
                {newPrs.length > 3 && <li className="italic">+ {newPrs.length - 3} mais</li>}
              </ul>
            </div>
          )}
          {completePct < 100 && (
            <div className="rounded-2xl border border-[var(--line)] p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Sets concluídos</p>
              <p className="mt-1.5 text-2xl font-black text-[var(--text)]">
                {completedSetsCount}<span className="text-base font-semibold text-[var(--muted)]">/{totalSetsAttempted}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">{completePct}% das séries marcadas</p>
            </div>
          )}
          {durationDelta != null && (
            <div className="rounded-2xl border border-[var(--line)] p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">vs último treino</p>
              <p className={`mt-1.5 text-2xl font-black tabular-nums ${
                durationDelta < 0 ? 'text-emerald-500' : durationDelta > 0 ? 'text-[var(--text)]' : 'text-[var(--muted)]'
              }`}>
                {durationDelta > 0 ? '+' : ''}{durationDelta}<span className="text-base font-semibold text-[var(--muted)]"> min</span>
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                Anterior: {lastDurationMin}min · {lastSessionEndedAt ? relativeDaysFromNow(lastSessionEndedAt) : ''}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
