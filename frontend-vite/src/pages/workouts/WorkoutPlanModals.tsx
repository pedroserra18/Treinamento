import { lazy, Suspense, type Dispatch, type SetStateAction } from 'react'
import type { ExerciseOption, WorkoutPlan } from '../../types/workout'
import { addExerciseToPlan, updatePlanExercise } from '../../services/workoutService'
import { pushRecentExerciseId } from '../../lib/exercise/recent-exercises'
import { InfoDialog } from '../../components/common/InfoDialog'
import { SetTypePickerSheet } from '../../components/common/SetTypePickerSheet'
import { ExerciseContextMenuSheet } from '../train/ExerciseContextMenuSheet'
import { RestTimePickerSheet } from '../train/RestTimePickerSheet'
import { type ReorderItem } from '../train/ReorderExercisesSheet'
import type { PerformanceDraft, SeriesDraft } from './workouts-utils'

// Modais lazy-loaded — mesmo chunk usado pelo TrainPage (import() dinamico
// aponta pro mesmo modulo, carregado uma vez e cacheado).
const ReorderExercisesSheet = lazy(() =>
  import('../train/ReorderExercisesSheet').then((m) => ({ default: m.ReorderExercisesSheet })),
)
const SubstituteExerciseModal = lazy(() =>
  import('../train/SubstituteExerciseModal').then((m) => ({ default: m.SubstituteExerciseModal })),
)
const CreateExerciseModal = lazy(() =>
  import('../train/CreateExerciseModal').then((m) => ({ default: m.CreateExerciseModal })),
)
const AddExerciseModal = lazy(() =>
  import('../train/AddExerciseModal').then((m) => ({ default: m.AddExerciseModal })),
)

type ExerciseTarget = { planId: string; planExerciseId: string; exerciseId: string; exerciseName: string }

// Cluster de sheets/modais da WorkoutsPage: menu de contexto do exercicio,
// reordenar / substituir / criar / adicionar exercicio, picker de descanso,
// dialog de info e picker de tipo de serie. Uma unica instancia (fora do loop
// de planos); quem dispara informa o alvo via state. Extraido verbatim; estado
// e handlers ficam na WorkoutsPage (passados por props).
export function WorkoutPlanModals({
  authorizedFetch, plans,
  ctxMenuTarget, setCtxMenuTarget,
  reorderPlanId, setReorderPlanId,
  substituteTarget, setSubstituteTarget,
  createExerciseOpen, setCreateExerciseOpen,
  createExerciseForSubstitute, setCreateExerciseForSubstitute,
  createExerciseForAddPlanId, setCreateExerciseForAddPlanId,
  addExerciseTargetPlanId, setAddExerciseTargetPlanId,
  restPickerTarget, setRestPickerTarget,
  infoDialog, setInfoDialog,
  seriesPicker, setSeriesPicker,
  draftByExercise, setError,
  removeExerciseFromPlan, applyReorder, applySubstitution, addToPlan, patchSeries, removeSeries, loadAll,
}: {
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  plans: WorkoutPlan[]
  ctxMenuTarget: ExerciseTarget | null
  setCtxMenuTarget: Dispatch<SetStateAction<ExerciseTarget | null>>
  reorderPlanId: string | null
  setReorderPlanId: Dispatch<SetStateAction<string | null>>
  substituteTarget: ExerciseTarget | null
  setSubstituteTarget: Dispatch<SetStateAction<ExerciseTarget | null>>
  createExerciseOpen: boolean
  setCreateExerciseOpen: Dispatch<SetStateAction<boolean>>
  createExerciseForSubstitute: { planId: string; planExerciseId: string } | null
  setCreateExerciseForSubstitute: Dispatch<SetStateAction<{ planId: string; planExerciseId: string } | null>>
  createExerciseForAddPlanId: string | null
  setCreateExerciseForAddPlanId: Dispatch<SetStateAction<string | null>>
  addExerciseTargetPlanId: string | null
  setAddExerciseTargetPlanId: Dispatch<SetStateAction<string | null>>
  restPickerTarget: { planId: string; planExerciseId: string; currentSec: number } | null
  setRestPickerTarget: Dispatch<SetStateAction<{ planId: string; planExerciseId: string; currentSec: number } | null>>
  infoDialog: { title: string; message: string } | null
  setInfoDialog: Dispatch<SetStateAction<{ title: string; message: string } | null>>
  seriesPicker: { exerciseId: string; seriesIndex: number } | null
  setSeriesPicker: Dispatch<SetStateAction<{ exerciseId: string; seriesIndex: number } | null>>
  draftByExercise: Record<string, PerformanceDraft>
  setError: Dispatch<SetStateAction<string | null>>
  removeExerciseFromPlan: (planId: string, planExerciseId: string) => Promise<void>
  applyReorder: (plan: WorkoutPlan, next: ReorderItem[]) => Promise<void>
  applySubstitution: (planId: string, planExerciseId: string, newExerciseId: string) => Promise<void>
  addToPlan: (plan: WorkoutPlan, option: ExerciseOption) => Promise<void>
  patchSeries: (planExerciseId: string, seriesIndex: number, patch: Partial<SeriesDraft>) => void
  removeSeries: (planExerciseId: string, seriesIndex: number) => void
  loadAll: () => Promise<void>
}) {
  return (
    <>
      {/* Sheets / modais compartilhados com o TrainPage. Ficam fora do
          loop de planos pra montar uma única instância — quem dispara
          informa qual plano + plan_exercise é o alvo via state. */}
      {ctxMenuTarget && (
        <ExerciseContextMenuSheet
          open
          exerciseName={ctxMenuTarget.exerciseName}
          onReorder={() => {
            setReorderPlanId(ctxMenuTarget.planId)
            setCtxMenuTarget(null)
          }}
          onSubstitute={() => {
            setSubstituteTarget(ctxMenuTarget)
            setCtxMenuTarget(null)
          }}
          onRemove={() => {
            void removeExerciseFromPlan(ctxMenuTarget.planId, ctxMenuTarget.planExerciseId)
            setCtxMenuTarget(null)
          }}
          onClose={() => setCtxMenuTarget(null)}
        />
      )}
      {/* Modais lazy-loaded compartilham um Suspense. Fallback null
          porque o user já tá em transição (acabou de tocar um botão)
          e a aparição em ~100-300ms parece animação normal. */}
      <Suspense fallback={null}>
      {reorderPlanId && (() => {
        const targetPlan = plans.find((p) => p.id === reorderPlanId)
        if (!targetPlan) return null
        return (
          <ReorderExercisesSheet
            open
            items={targetPlan.exercises.map((ex): ReorderItem => ({
              id: ex.id,
              name: ex.customName ?? ex.exercise.name,
              thumbnailUrl: ex.exercise.thumbnailUrl,
            }))}
            onReorder={(next) => { void applyReorder(targetPlan, next) }}
            onClose={() => setReorderPlanId(null)}
          />
        )
      })()}
      {substituteTarget && (
        <SubstituteExerciseModal
          key={`sub-${substituteTarget.planExerciseId}`}
          open
          source={{ id: substituteTarget.exerciseId, name: substituteTarget.exerciseName }}
          onPick={(option) => {
            void applySubstitution(substituteTarget.planId, substituteTarget.planExerciseId, option.id)
          }}
          onCreateRequest={() => {
            setCreateExerciseForSubstitute({
              planId: substituteTarget.planId,
              planExerciseId: substituteTarget.planExerciseId,
            })
            setSubstituteTarget(null)
            setCreateExerciseOpen(true)
          }}
          onClose={() => setSubstituteTarget(null)}
        />
      )}
      {createExerciseOpen && (
        <CreateExerciseModal
          open
          onCreated={(newExercise) => {
            pushRecentExerciseId(newExercise.id)
            if (createExerciseForSubstitute) {
              void applySubstitution(
                createExerciseForSubstitute.planId,
                createExerciseForSubstitute.planExerciseId,
                newExercise.id,
              )
            } else if (createExerciseForAddPlanId) {
              const targetPlan = plans.find((p) => p.id === createExerciseForAddPlanId)
              if (targetPlan) void addToPlan(targetPlan, newExercise)
            }
            setCreateExerciseForSubstitute(null)
            setCreateExerciseForAddPlanId(null)
          }}
          onClose={() => {
            setCreateExerciseOpen(false)
            setCreateExerciseForSubstitute(null)
            setCreateExerciseForAddPlanId(null)
          }}
        />
      )}
      {addExerciseTargetPlanId && (
        <AddExerciseModal
          key={`add-${addExerciseTargetPlanId}`}
          open
          currentExerciseIds={
            plans.find((p) => p.id === addExerciseTargetPlanId)?.exercises.map((e) => e.exercise.id) ?? []
          }
          onPickBatch={async (options) => {
            const targetPlan = plans.find((p) => p.id === addExerciseTargetPlanId)
            if (!targetPlan) return
            // Filtra duplicatas em relação ao que JÁ está no plano —
            // agrega o aviso em um único diálogo (evita N popups).
            const presentIds = new Set(targetPlan.exercises.map((entry) => entry.exercise.id))
            const skipped = options.filter((opt) => presentIds.has(opt.id))
            const toAdd = options.filter((opt) => !presentIds.has(opt.id))

            // Add em série pro backend sequenciar o orderIndex sem
            // colisão. Um único loadAll no final (em vez de N), evitando
            // refetch repetido enquanto o usuário espera.
            try {
              for (const option of toAdd) {
                pushRecentExerciseId(option.id)
                await addExerciseToPlan(authorizedFetch, targetPlan.id, {
                  exerciseId: option.id,
                  sets: 3,
                  repsMin: 8,
                  repsMax: 12,
                })
              }
              await loadAll()
              if (skipped.length > 0) {
                setInfoDialog({
                  title: skipped.length === 1 ? 'Exercício já na rotina' : 'Exercícios já na rotina',
                  message:
                    skipped.length === 1
                      ? `${skipped[0].name} já faz parte desta rotina e não foi adicionado novamente.`
                      : `${skipped.length} exercícios já faziam parte desta rotina e não foram adicionados novamente:\n\n${skipped.map((s) => `• ${s.name}`).join('\n')}`,
                })
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erro ao adicionar exercícios à rotina')
            }
          }}
          onCreateRequest={() => {
            setCreateExerciseForAddPlanId(addExerciseTargetPlanId)
            setAddExerciseTargetPlanId(null)
            setCreateExerciseOpen(true)
          }}
          onClose={() => setAddExerciseTargetPlanId(null)}
        />
      )}
      </Suspense>
      {restPickerTarget && (
        <RestTimePickerSheet
          key={`rest-${restPickerTarget.planExerciseId}`}
          open
          currentSec={restPickerTarget.currentSec}
          onConfirm={async (sec) => {
            try {
              await updatePlanExercise(authorizedFetch, restPickerTarget.planId, restPickerTarget.planExerciseId, {
                restSec: sec,
              })
              await loadAll()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Erro ao salvar descanso')
            }
          }}
          onClose={() => setRestPickerTarget(null)}
        />
      )}
      {infoDialog && (
        <InfoDialog
          open
          title={infoDialog.title}
          message={infoDialog.message}
          onClose={() => setInfoDialog(null)}
        />
      )}
      {seriesPicker && draftByExercise[seriesPicker.exerciseId]?.series[seriesPicker.seriesIndex] && (
        <SetTypePickerSheet
          open
          current={draftByExercise[seriesPicker.exerciseId].series[seriesPicker.seriesIndex].setType}
          onSelect={(type) => patchSeries(seriesPicker.exerciseId, seriesPicker.seriesIndex, { setType: type })}
          onRemove={() => removeSeries(seriesPicker.exerciseId, seriesPicker.seriesIndex)}
          onClose={() => setSeriesPicker(null)}
        />
      )}
    </>
  )
}
