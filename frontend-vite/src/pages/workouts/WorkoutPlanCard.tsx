import { type Dispatch, type SetStateAction } from 'react'
import { Plus } from 'lucide-react'
import type { WorkoutPlan } from '../../types/workout'
import { type DropEntry } from '../../components/common/setTypeOptions'
import { deleteWorkoutPlan, addPlanCardio, deletePlanCardio } from '../../services/workoutService'
import { PlanHeader } from './PlanHeader'
import { ExerciseCard } from './ExerciseCard'
import { PlanCardioPanel } from './PlanCardioPanel'
import type { PerformanceDraft, SeriesDraft } from './workouts-utils'

type ExerciseTarget = { planId: string; planExerciseId: string; exerciseId: string; exerciseName: string }

// Card de UMA rotina na WorkoutsPage: cabeçalho (nome editável + salvar/excluir),
// lista de exercícios (ExerciseCard), botão "adicionar exercício" e o painel de
// cardio. Extraído verbatim; estado e handlers ficam na WorkoutsPage (props).
export function WorkoutPlanCard({
  plan, hideInlineSaveButton, authorizedFetch, loadAll, setError,
  editingPlanNameById, planNameDraftById, setEditingPlanNameById, setPlanNameDraftById,
  savePlanName, saveFullPlan,
  draftByExercise, expandedByExercise, editingNameByExercise, customNameByExercise,
  setCustomNameByExercise, saveCustomExerciseName, setEditingNameByExercise,
  setRestPickerTarget, setExpandedByExercise, setCtxMenuTarget, setSeriesPicker, setAddExerciseTargetPlanId,
  patchDraft, removeSeries, patchSeries, patchDropEntry, removeDropEntry, addDropEntry, addSeries, saveExerciseMetrics,
}: {
  plan: WorkoutPlan
  hideInlineSaveButton: boolean
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  loadAll: () => Promise<void>
  setError: Dispatch<SetStateAction<string | null>>
  editingPlanNameById: Record<string, boolean>
  planNameDraftById: Record<string, string>
  setEditingPlanNameById: Dispatch<SetStateAction<Record<string, boolean>>>
  setPlanNameDraftById: Dispatch<SetStateAction<Record<string, string>>>
  savePlanName: (planId: string) => Promise<void>
  saveFullPlan: (plan: WorkoutPlan) => void
  draftByExercise: Record<string, PerformanceDraft>
  expandedByExercise: Record<string, boolean>
  editingNameByExercise: Record<string, boolean>
  customNameByExercise: Record<string, string>
  setCustomNameByExercise: Dispatch<SetStateAction<Record<string, string>>>
  saveCustomExerciseName: (planId: string, planExerciseId: string) => Promise<void>
  setEditingNameByExercise: Dispatch<SetStateAction<Record<string, boolean>>>
  setRestPickerTarget: Dispatch<SetStateAction<{ planId: string; planExerciseId: string; currentSec: number } | null>>
  setExpandedByExercise: Dispatch<SetStateAction<Record<string, boolean>>>
  setCtxMenuTarget: Dispatch<SetStateAction<ExerciseTarget | null>>
  setSeriesPicker: Dispatch<SetStateAction<{ exerciseId: string; seriesIndex: number } | null>>
  setAddExerciseTargetPlanId: Dispatch<SetStateAction<string | null>>
  patchDraft: (planExerciseId: string, patch: Partial<Omit<PerformanceDraft, 'series'>>) => void
  removeSeries: (planExerciseId: string, seriesIndex: number) => void
  patchSeries: (planExerciseId: string, seriesIndex: number, patch: Partial<SeriesDraft>) => void
  patchDropEntry: (planExerciseId: string, seriesIndex: number, dropIndex: number, patch: Partial<DropEntry>) => void
  removeDropEntry: (planExerciseId: string, seriesIndex: number, dropIndex: number) => void
  addDropEntry: (planExerciseId: string, seriesIndex: number) => void
  addSeries: (planExerciseId: string) => void
  saveExerciseMetrics: (planId: string, planExerciseId: string, refresh?: boolean) => Promise<boolean>
}) {
  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <PlanHeader
        plan={plan}
        editingName={Boolean(editingPlanNameById[plan.id])}
        nameDraft={planNameDraftById[plan.id] ?? plan.name}
        hideInlineSaveButton={hideInlineSaveButton}
        onStartEdit={() => setEditingPlanNameById((current) => ({ ...current, [plan.id]: true }))}
        onNameDraftChange={(value) => setPlanNameDraftById((current) => ({ ...current, [plan.id]: value }))}
        onSaveName={() => void savePlanName(plan.id)}
        onCancelEdit={() => {
          setEditingPlanNameById((current) => ({ ...current, [plan.id]: false }))
          setPlanNameDraftById((current) => ({ ...current, [plan.id]: plan.name }))
        }}
        onSaveFullPlan={() => void saveFullPlan(plan)}
        onDelete={() => {
          void deleteWorkoutPlan(authorizedFetch, plan.id)
            .then(loadAll)
            .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao excluir treino'))
        }}
      />

      <div className="mt-3 space-y-2">
        {plan.exercises.length === 0 ? <p className="text-sm text-[var(--muted)]">Sem exercicios.</p> : null}
        {plan.exercises.map((item, index) => (
          <ExerciseCard
            key={item.id}
            item={item}
            index={index}
            rawDraft={draftByExercise[item.id]}
            expanded={Boolean(expandedByExercise[item.id])}
            editingName={Boolean(editingNameByExercise[item.id])}
            nameDraft={customNameByExercise[item.id] ?? item.customName ?? item.exercise.name}
            onNameDraftChange={(value) => setCustomNameByExercise((current) => ({ ...current, [item.id]: value }))}
            onSaveName={() => { void saveCustomExerciseName(plan.id, item.id) }}
            onStartEditName={() => setEditingNameByExercise((current) => ({ ...current, [item.id]: true }))}
            onOpenRestPicker={() => setRestPickerTarget({ planId: plan.id, planExerciseId: item.id, currentSec: item.restSec ?? 0 })}
            onToggleExpand={() => setExpandedByExercise((current) => ({ ...current, [item.id]: !current[item.id] }))}
            onOpenMenu={() => setCtxMenuTarget({ planId: plan.id, planExerciseId: item.id, exerciseId: item.exercise.id, exerciseName: item.customName ?? item.exercise.name })}
            onPatchDraft={(patch) => patchDraft(item.id, patch)}
            onOpenSeriesPicker={(seriesIndex) => setSeriesPicker({ exerciseId: item.id, seriesIndex })}
            onRemoveSeries={(seriesIndex) => removeSeries(item.id, seriesIndex)}
            onPatchSeries={(seriesIndex, patch) => patchSeries(item.id, seriesIndex, patch)}
            onPatchDrop={(seriesIndex, dropIndex, patch) => patchDropEntry(item.id, seriesIndex, dropIndex, patch)}
            onRemoveDrop={(seriesIndex, dropIndex) => removeDropEntry(item.id, seriesIndex, dropIndex)}
            onAddDrop={(seriesIndex) => addDropEntry(item.id, seriesIndex)}
            onAddSeries={() => addSeries(item.id)}
            onSaveSeries={() => { void saveExerciseMetrics(plan.id, item.id) }}
          />
        ))}

        {/* Botão grande "Adicionar Exercício" no rodapé — mesmo
            padrão do TrainPage durante treino ativo. Abre o
            AddExerciseModal full-screen com busca live + Recentes. */}
        <button
          type="button"
          onClick={() => setAddExerciseTargetPlanId(plan.id)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] py-3 text-[14px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
        >
          <Plus size={16} />
          Adicionar Exercício
        </button>
      </div>

      <PlanCardioPanel
        plan={plan}
        onAdd={async (input) => {
          await addPlanCardio(authorizedFetch, plan.id, input)
          await loadAll()
        }}
        onRemove={async (cardioId) => {
          await deletePlanCardio(authorizedFetch, plan.id, cardioId)
          await loadAll()
        }}
      />
    </article>
  )
}
