import type { ActiveExercise } from './types'

// Linha de progresso do treino ativo: Volume / Séries / Progresso (exercícios
// com ≥1 série concluída) + barra. Somente leitura — deriva tudo de
// activeExercises e dos totais já calculados.
export function ActiveProgressStats({
  activeExercises,
  totals,
}: {
  activeExercises: ActiveExercise[]
  totals: { totalSeries: number; totalVolumeKg: number }
}) {
  const totalExercises = activeExercises.length
  const completedExercises = activeExercises.filter(
    (ex) => ex.sets.some((s) => s.checked)
  ).length
  const progressPct = totalExercises > 0
    ? Math.round((completedExercises / totalExercises) * 100)
    : 0

  return (
    <div className="mt-4 border-t border-dashed border-[var(--line)] pt-3">
      <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Volume</p>
          <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[var(--text)] sm:text-base">
            {Math.round(totals.totalVolumeKg).toLocaleString('pt-BR')} <span className="font-mono text-[10px] text-[var(--muted)]">kg</span>
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Séries</p>
          <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[var(--text)] sm:text-base">
            {totals.totalSeries}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Progresso</p>
          <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[var(--text)] sm:text-base">
            {completedExercises}<span className="font-mono text-[10px] text-[var(--muted)]">/{totalExercises}</span>
          </p>
        </div>
      </div>
      {totalExercises > 0 && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
          <div
            className="h-full rounded-full bg-[var(--brand)] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
            aria-label={`Progresso: ${progressPct}%`}
          />
        </div>
      )}
    </div>
  )
}
