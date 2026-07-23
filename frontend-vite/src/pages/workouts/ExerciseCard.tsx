import { MoreVertical } from 'lucide-react'
import { resolveBodyweightFlag } from '../../lib/exercise/exercise-meta'
import { formatClock } from '../../lib/workout/workout-timing'
import type { PlanExercise } from '../../types/workout'
import { type DropEntry } from '../../components/common/setTypeOptions'
import { SeriesEditor } from './SeriesEditor'
import {
  createSeriesDraft,
  estimate1rm,
  type PerformanceDraft,
  type SeriesDraft,
} from './workouts-utils'

// Card de um exercício do plano na WorkoutsPage: cabeçalho (nome com edição
// inline, meta de séries/1RM, descanso, toggle de séries, kebab de ações) + o
// SeriesEditor expandido. Verbatim da página; o estado e as ações ficam na
// WorkoutsPage (callbacks já ligados ao exercício/plano viram props). As
// derivações locais (draft, label, showLoad, 1RM) continuam junto do card.
export function ExerciseCard({
  item, index, rawDraft, expanded, editingName, nameDraft,
  onNameDraftChange, onSaveName, onStartEditName,
  onOpenRestPicker, onToggleExpand, onOpenMenu,
  onPatchDraft, onOpenSeriesPicker, onRemoveSeries, onPatchSeries,
  onPatchDrop, onRemoveDrop, onAddDrop, onAddSeries, onSaveSeries,
}: {
  item: PlanExercise
  index: number
  /** `draftByExercise[item.id]` — tipado como não-nulo (Record), mas pode faltar
   *  em runtime; por isso o `??` de fallback abaixo, igual à página original. */
  rawDraft: PerformanceDraft
  expanded: boolean
  editingName: boolean
  nameDraft: string
  onNameDraftChange: (value: string) => void
  onSaveName: () => void
  onStartEditName: () => void
  onOpenRestPicker: () => void
  onToggleExpand: () => void
  onOpenMenu: () => void
  onPatchDraft: (patch: Partial<Omit<PerformanceDraft, 'series'>>) => void
  onOpenSeriesPicker: (seriesIndex: number) => void
  onRemoveSeries: (seriesIndex: number) => void
  onPatchSeries: (seriesIndex: number, patch: Partial<SeriesDraft>) => void
  onPatchDrop: (seriesIndex: number, dropIndex: number, patch: Partial<DropEntry>) => void
  onRemoveDrop: (seriesIndex: number, dropIndex: number) => void
  onAddDrop: (seriesIndex: number) => void
  onAddSeries: () => void
  onSaveSeries: () => void
}) {
  const draft = rawDraft ?? { series: [createSeriesDraft({ reps: '10' })] }
  const exerciseLabel = item.customName ?? item.exercise.name
  const effectiveBodyweight = resolveBodyweightFlag(
    item.exercise.isBodyweight,
    exerciseLabel,
    item.exercise.equipment,
  )
  const showLoad = !effectiveBodyweight
  const bestSeries1rm = draft.series.reduce((best, series) => {
    if (!showLoad) {
      return best
    }
    const oneRm = estimate1rm(Number(series.loadKg ?? 0), Number(series.reps ?? 0))
    return Math.max(best, oneRm)
  }, 0)

  return (
    <div className="rounded-2xl border border-[var(--line)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {editingName ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={nameDraft}
                onChange={(event) => onNameDraftChange(event.target.value)}
                className="rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
              />
              <button
                type="button"
                className="rounded-md border border-[var(--brand)] px-2 py-1 text-xs font-semibold text-[var(--brand)]"
                onClick={onSaveName}
              >
                Salvar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text)]">
                {index + 1}. {exerciseLabel}
              </p>
              <button
                type="button"
                className="rounded-md border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]"
                onClick={onStartEditName}
              >
                Editar nome
              </button>
            </div>
          )}
          <p className="text-[11px] text-[var(--muted)]">
            {draft.series.length} serie(s)
            {showLoad ? ` • 1RM max: ${bestSeries1rm.toFixed(1)} kg` : ' • peso corporal'}
          </p>
          <button
            type="button"
            className="mt-2 rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)]"
            onClick={onOpenRestPicker}
          >
            Descanso: {formatClock(item.restSec ?? 0)}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)]"
            onClick={onToggleExpand}
          >
            {expanded ? 'Ocultar series' : 'Editar series'}
          </button>
          {/* Kebab vertical — abre o ExerciseContextMenuSheet
              com as 3 ações padrão (reordenar / substituir /
              remover). Mesma UX do TrainPage pra o usuário
              não precisar aprender duas interfaces. */}
          <button
            type="button"
            aria-label={`Ações para ${exerciseLabel}`}
            className="grid h-8 w-8 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            onClick={onOpenMenu}
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {expanded ? (
        <SeriesEditor
          draft={draft}
          showLoad={showLoad}
          onPatchDraft={onPatchDraft}
          onOpenSeriesPicker={onOpenSeriesPicker}
          onRemoveSeries={onRemoveSeries}
          onPatchSeries={onPatchSeries}
          onPatchDrop={onPatchDrop}
          onRemoveDrop={onRemoveDrop}
          onAddDrop={onAddDrop}
          onAddSeries={onAddSeries}
          onSaveSeries={onSaveSeries}
        />
      ) : null}
    </div>
  )
}
