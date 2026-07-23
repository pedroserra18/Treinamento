import { useAuth } from '../hooks/useAuth'
import { useShowPlanLimit } from '../components/plan/use-plan-limit'
import { catchPlanLimitError } from '../lib/plan-features'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  getExerciseExplorerSelectionEventName,
  type ExerciseExplorerSelection,
} from '../lib/exercise/exercise-explorer'
import { resolveBodyweightFlag } from '../lib/exercise/exercise-meta'
import type { ExerciseOption, WorkoutPlan } from '../types/workout'
import { SetTypePickerSheet } from '../components/common/SetTypePickerSheet'
import { type DropEntry } from '../components/common/setTypeOptions'
import {
  addExerciseToPlan,
  addPlanCardio,
  createWorkoutPlan,
  deletePlanCardio,
  deletePlanExercise,
  deleteWorkoutPlan,
  listWorkoutPlans,
  updateWorkoutPlan,
  updatePlanExercise,
} from '../services/workoutService'
import { formatClock } from '../lib/workout/workout-timing'
import { SkeletonCard } from '../components/common/Skeleton'
import { ExerciseContextMenuSheet } from './train/ExerciseContextMenuSheet'
import { type ReorderItem } from './train/ReorderExercisesSheet'
import { RestTimePickerSheet } from './train/RestTimePickerSheet'

// Modais pesados — lazy-loaded. Mesmo padrão da TrainPage: cada um vira
// chunk separado, baixa só quando o user toca pra abrir, depois fica em
// cache de memória do browser. Cortou ~2.100 linhas do bundle inicial
// desta página.
const ReorderExercisesSheet = lazy(() =>
  import('./train/ReorderExercisesSheet').then((m) => ({ default: m.ReorderExercisesSheet })),
)
const SubstituteExerciseModal = lazy(() =>
  import('./train/SubstituteExerciseModal').then((m) => ({ default: m.SubstituteExerciseModal })),
)
const CreateExerciseModal = lazy(() =>
  import('./train/CreateExerciseModal').then((m) => ({ default: m.CreateExerciseModal })),
)
const AddExerciseModal = lazy(() =>
  import('./train/AddExerciseModal').then((m) => ({ default: m.AddExerciseModal })),
)
import { InfoDialog } from '../components/common/InfoDialog'
import { pushRecentExerciseId } from '../lib/exercise/recent-exercises'
import { MoreVertical, Plus } from 'lucide-react'
import {
  createSeriesDraft,
  estimate1rm,
  parsePerformanceFromNotes,
  buildNotesWithPerformance,
  isDuplicateExerciseError,
  type SeriesDraft,
  type PerformanceDraft,
} from './workouts/workouts-utils'
import { PlanCardioPanel } from './workouts/PlanCardioPanel'
import { CreatePlanCard } from './workouts/CreatePlanCard'
import { PlanHeader } from './workouts/PlanHeader'
import { SeriesEditor } from './workouts/SeriesEditor'

type WorkoutsPageProps = {
  selectedPlanId?: string | null
  onlySelectedPlan?: boolean
  showCreateSection?: boolean
  createOnlyMode?: boolean
  // Fired SÍNCRONO quando saveFullPlan dispara — antes do save terminar.
  // Permite ao parent navegar imediato (UI otimista) enquanto as N updates
  // rodam em paralelo no backend. Opcional pra back-compat com callers
  // que não querem optimistic.
  onPlanSaveStarted?: (planId: string) => void
  // Fired quando o save completa com sucesso. Continua sendo o sinal
  // padrão pra fechar editor / sincronizar lista do parent.
  onPlanSaved?: (planId: string) => void
  // Fired quando o save falha (alguma update retornou false ou throw).
  onPlanSaveFailed?: (planId: string, error: Error) => void
  // Quando true, o botão "Salvar treino completo" do cabeçalho do
  // plano fica escondido — o caller renderiza o salvar em outro lugar
  // (ex.: header do TrainPage no modo EDIT, estilo Hevy).
  hideInlineSaveButton?: boolean
  // Sinal externo de "salvar agora" — quando o valor numérico muda,
  // dispara saveFullPlan no plano visível. Usado pelo header externo
  // do TrainPage. 0 = nunca dispara (default).
  saveSignal?: number
}

export function WorkoutsPage({
  selectedPlanId = null,
  onlySelectedPlan = false,
  showCreateSection = true,
  createOnlyMode = false,
  onPlanSaveStarted,
  onPlanSaved,
  onPlanSaveFailed,
  hideInlineSaveButton = false,
  saveSignal = 0,
}: WorkoutsPageProps) {
  const { authorizedFetch } = useAuth()
  const showPlanLimit = useShowPlanLimit()
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newPlanName, setNewPlanName] = useState('')
  const [newPlanDescription, setNewPlanDescription] = useState('')

  // Estado das 3 ações compartilhadas com o TrainPage: kebab (menu de
  // contexto), reorder sheet e substitute modal. Todas operam sobre o
  // plan_exercise por id; reorder e substitute precisam saber também
  // a qual plano pertence pra rotear a chamada certa pro backend.
  const [ctxMenuTarget, setCtxMenuTarget] = useState<{ planId: string; planExerciseId: string; exerciseId: string; exerciseName: string } | null>(null)
  const [reorderPlanId, setReorderPlanId] = useState<string | null>(null)
  const [substituteTarget, setSubstituteTarget] = useState<{ planId: string; planExerciseId: string; exerciseId: string; exerciseName: string } | null>(null)
  const [createExerciseForSubstitute, setCreateExerciseForSubstitute] = useState<{ planId: string; planExerciseId: string } | null>(null)
  const [createExerciseForAddPlanId, setCreateExerciseForAddPlanId] = useState<string | null>(null)
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false)
  // AddExerciseModal — guarda o planId que vai receber o exercício.
  const [addExerciseTargetPlanId, setAddExerciseTargetPlanId] = useState<string | null>(null)
  // Diálogo de aviso pra duplicatas e similares. Trocou o window.alert
  // intrusivo + setError vermelho persistente por um modal previsível.
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string } | null>(null)
  // RestTimePickerSheet — guarda o planExerciseId cujo descanso está
  // sendo editado. Reusa o mesmo sheet do TrainPage.
  const [restPickerTarget, setRestPickerTarget] = useState<{ planId: string; planExerciseId: string; currentSec: number } | null>(null)

  const [draftByExercise, setDraftByExercise] = useState<Record<string, PerformanceDraft>>({})
  const [expandedByExercise, setExpandedByExercise] = useState<Record<string, boolean>>({})
  // Qual série está com o picker de tipo aberto (exercício + índice da série).
  const [seriesPicker, setSeriesPicker] = useState<{ exerciseId: string; seriesIndex: number } | null>(null)
  const [editingNameByExercise, setEditingNameByExercise] = useState<Record<string, boolean>>({})
  const [customNameByExercise, setCustomNameByExercise] = useState<Record<string, string>>({})
  const [editingPlanNameById, setEditingPlanNameById] = useState<Record<string, boolean>>({})
  const [planNameDraftById, setPlanNameDraftById] = useState<Record<string, string>>({})
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null)

  useEffect(() => {
    if (!createOnlyMode) {
      setCreatedPlanId(null)
    }
  }, [createOnlyMode])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const planData = await listWorkoutPlans(authorizedFetch)
      setPlans(planData)
      setDraftByExercise((current) => {
        const next = { ...current }

        planData.forEach((plan) => {
          plan.exercises.forEach((exercise) => {
            const fromNotes = parsePerformanceFromNotes(exercise.notes)
            const fallbackSeries = Array.from({ length: Math.max(1, exercise.sets ?? 1) }, () =>
              createSeriesDraft({ reps: String(exercise.repsMax ?? exercise.repsMin ?? '') }),
            )

            const repsMin = exercise.repsMin ?? null
            const repsMax = exercise.repsMax ?? null
            const isRange = repsMin !== null && repsMax !== null && repsMin !== repsMax
            next[exercise.id] = {
              series: fromNotes.series?.length ? fromNotes.series : fallbackSeries,
              repsMode: isRange ? 'range' : 'fixed',
              fixedReps: String(repsMax ?? repsMin ?? ''),
              rangeMin: String(repsMin ?? ''),
              rangeMax: String(repsMax ?? ''),
            }
          })
        })

        return next
      })
      setCustomNameByExercise((current) => {
        const next = { ...current }
        planData.forEach((plan) => {
          plan.exercises.forEach((exercise) => {
            next[exercise.id] = exercise.customName ?? exercise.exercise.name
          })
        })
        return next
      })
      setPlanNameDraftById((current) => {
        const next = { ...current }
        planData.forEach((plan) => {
          next[plan.id] = plan.name
        })
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar treinos salvos')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const createCustom = async () => {
    if (newPlanName.trim().length < 2) {
      setError('Nome do treino deve ter ao menos 2 caracteres')
      return
    }

    try {
      const created = await createWorkoutPlan(authorizedFetch, {
        name: newPlanName.trim(),
        description: newPlanDescription.trim() || undefined,
        source: 'CUSTOM',
      })
      setNewPlanName('')
      setNewPlanDescription('')
      if (createOnlyMode) {
        setCreatedPlanId(created.id)
      }
      await loadAll()
    } catch (err) {
      if (catchPlanLimitError(err, showPlanLimit)) return
      setError(err instanceof Error ? err.message : 'Erro ao criar treino')
    }
  }

  const addToPlan = useCallback(async (plan: WorkoutPlan, option: ExerciseOption) => {
    const alreadyExists = plan.exercises.some((entry) => entry.exercise.id === option.id)
    if (alreadyExists) {
      setInfoDialog({
        title: 'Exercício já na rotina',
        message: `${option.name} já faz parte desta rotina. Escolha outro para manter variedade.`,
      })
      return
    }

    try {
      await addExerciseToPlan(authorizedFetch, plan.id, {
        exerciseId: option.id,
        sets: 3,
        repsMin: 8,
        repsMax: 12,
      })
      await loadAll()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao adicionar exercicio ao treino'
      if (isDuplicateExerciseError(message)) {
        // Backend confirmou duplicata mesmo após nossa pré-checagem
        // (race entre fetch local e backend). Mostra o mesmo aviso.
        setInfoDialog({
          title: 'Exercício já na rotina',
          message: `${option.name} já faz parte desta rotina.`,
        })
      } else {
        setError(message)
      }
    }
  }, [authorizedFetch, loadAll])

  useEffect(() => {
    const eventName = getExerciseExplorerSelectionEventName()

    const handler = (event: Event) => {
      const payload = (event as CustomEvent<ExerciseExplorerSelection>).detail
      if (!payload) {
        return
      }

      const targetPlan =
        (createOnlyMode && createdPlanId ? plans.find((plan) => plan.id === createdPlanId) : null) ??
        (selectedPlanId ? plans.find((plan) => plan.id === selectedPlanId) : null) ??
        plans[0]
      if (!targetPlan) {
        setError('Crie uma rotina antes de adicionar exercicios pelo explorador.')
        return
      }

      void addToPlan(targetPlan, { ...payload, trackingType: payload.trackingType ?? 'REPS' })
    }

    window.addEventListener(eventName, handler)

    return () => {
      window.removeEventListener(eventName, handler)
    }
  }, [addToPlan, createOnlyMode, createdPlanId, plans, selectedPlanId])

  const patchDraft = (planExerciseId: string, patch: Partial<Omit<PerformanceDraft, 'series'>>) => {
    setDraftByExercise((current) => ({
      ...current,
      [planExerciseId]: { ...current[planExerciseId], ...patch },
    }))
  }

  const patchSeries = (planExerciseId: string, seriesIndex: number, patch: Partial<SeriesDraft>) => {
    setDraftByExercise((current) => ({
      ...current,
      [planExerciseId]: {
        ...current[planExerciseId],
        series:
          current[planExerciseId]?.series.map((entry, index) =>
            index === seriesIndex ? { ...entry, ...patch } : entry,
          ) ?? [createSeriesDraft()],
      },
    }))
  }

  const addSeries = (planExerciseId: string) => {
    setDraftByExercise((current) => ({
      ...current,
      [planExerciseId]: {
        ...current[planExerciseId],
        series: [...(current[planExerciseId]?.series ?? [createSeriesDraft()]), createSeriesDraft()],
      },
    }))
  }

  const removeSeries = (planExerciseId: string, seriesIndex: number) => {
    setDraftByExercise((current) => {
      const currentSeries = current[planExerciseId]?.series ?? [createSeriesDraft()]
      const nextSeries = currentSeries.filter((_, index) => index !== seriesIndex)

      return {
        ...current,
        [planExerciseId]: {
          ...current[planExerciseId],
          series: nextSeries.length ? nextSeries : [createSeriesDraft()],
        },
      }
    })
  }

  const addDropEntry = (planExerciseId: string, seriesIndex: number) => {
    setDraftByExercise((current) => ({
      ...current,
      [planExerciseId]: {
        ...current[planExerciseId],
        series: (current[planExerciseId]?.series ?? [createSeriesDraft()]).map((s, idx) =>
          idx === seriesIndex
            ? { ...s, dropSets: [...s.dropSets, { weightKg: '', reps: '' }] }
            : s,
        ),
      },
    }))
  }

  const removeDropEntry = (planExerciseId: string, seriesIndex: number, dropIndex: number) => {
    setDraftByExercise((current) => ({
      ...current,
      [planExerciseId]: {
        ...current[planExerciseId],
        series: (current[planExerciseId]?.series ?? [createSeriesDraft()]).map((s, idx) => {
          if (idx !== seriesIndex) return s
          const next = s.dropSets.filter((_, dIdx) => dIdx !== dropIndex)
          return { ...s, dropSets: next.length > 0 ? next : [{ weightKg: '', reps: '' }] }
        }),
      },
    }))
  }

  const patchDropEntry = (
    planExerciseId: string,
    seriesIndex: number,
    dropIndex: number,
    patch: Partial<DropEntry>,
  ) => {
    setDraftByExercise((current) => ({
      ...current,
      [planExerciseId]: {
        ...current[planExerciseId],
        series: (current[planExerciseId]?.series ?? [createSeriesDraft()]).map((s, idx) =>
          idx === seriesIndex
            ? {
                ...s,
                dropSets: s.dropSets.map((d, dIdx) => (dIdx === dropIndex ? { ...d, ...patch } : d)),
              }
            : s,
        ),
      },
    }))
  }

  const saveExerciseMetrics = async (planId: string, planExerciseId: string, refresh = true): Promise<boolean> => {
    const draft = draftByExercise[planExerciseId]
    const targetPlan = plans.find((plan) => plan.id === planId)
    const targetExercise = targetPlan?.exercises.find((exercise) => exercise.id === planExerciseId)

    if (!draft || !targetExercise) {
      return false
    }

    const effectiveSeries =
      draft.repsMode === 'fixed'
        ? draft.series.map((s) => ({ ...s, reps: draft.fixedReps }))
        : draft.series

    const validSeries = effectiveSeries.filter((series) => Number(series.reps) > 0)

    if (validSeries.length === 0) {
      setError('Adicione ao menos uma serie com repeticoes maior que 0 antes de salvar.')
      return false
    }

    // O descanso agora é persistido diretamente pelo RestTimePickerSheet
    // (ver onConfirm). Aqui só lemos o valor canônico do targetExercise
    // pra incluir no payload do save de séries.
    const parsedRest = targetExercise.restSec ?? 0

    const typedExerciseName = (customNameByExercise[planExerciseId] ?? targetExercise.customName ?? targetExercise.exercise.name).trim()
    const fallbackExerciseName = targetExercise.exercise.name
    const customName =
      typedExerciseName.length > 0 && typedExerciseName !== fallbackExerciseName
        ? typedExerciseName
        : null

    const sets = Math.min(12, validSeries.length)

    let repsMin: number
    let repsMax: number
    if (draft.repsMode === 'range') {
      repsMin = Math.max(1, Math.min(50, Math.floor(Number(draft.rangeMin) || 1)))
      repsMax = Math.max(repsMin, Math.min(50, Math.floor(Number(draft.rangeMax) || repsMin)))
    } else {
      const fixedVal = Math.max(1, Math.min(50, Math.floor(Number(draft.fixedReps) || 1)))
      repsMin = fixedVal
      repsMax = fixedVal
    }

    const normalizedDraft: PerformanceDraft = {
      ...draft,
      series: validSeries.slice(0, sets).map((series) =>
        createSeriesDraft({
          reps: series.reps,
          loadKg: (() => {
            const effectiveBodyweight = resolveBodyweightFlag(
              targetExercise.exercise.isBodyweight,
              targetExercise.customName ?? targetExercise.exercise.name,
              targetExercise.exercise.equipment,
            )
            return effectiveBodyweight ? '' : series.loadKg
          })(),
          rpe: series.rpe,
          rir: series.rir,
        }),
      ),
    }

    try {
      await updatePlanExercise(authorizedFetch, planId, planExerciseId, {
        customName,
        sets,
        repsMin,
        repsMax,
        restSec: parsedRest === 0 ? null : parsedRest,
        notes: buildNotesWithPerformance(targetExercise.notes, normalizedDraft),
      })
      if (refresh) {
        await loadAll()
      }
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar series do exercicio')
      return false
    }
  }

  const saveFullPlan = (plan: WorkoutPlan) => {
    // OPTIMISTIC: dispara onPlanSaveStarted ANTES de aguardar os updates.
    // Caller (ex: TrainPage EDIT) usa isso pra navegar imediato (~0ms
    // percebido). As N updates rodam em paralelo em background.
    onPlanSaveStarted?.(plan.id)

    const promise = Promise.all(
      plan.exercises.map((entry) => saveExerciseMetrics(plan.id, entry.id, false)),
    )

    promise
      .then((results) => {
        if (!results.every(Boolean)) {
          onPlanSaveFailed?.(plan.id, new Error('Alguma atualização falhou'))
          return
        }
        onPlanSaved?.(plan.id)
        // Local reload pra atualizar a vista da WorkoutsPage caso ainda
        // esteja montada. Se desmontada (caller navegou), promise vira
        // no-op (React ignora setState em unmounted).
        void loadAll().catch(() => {})
      })
      .catch((err) => {
        onPlanSaveFailed?.(plan.id, err instanceof Error ? err : new Error('Erro ao salvar treino completo'))
      })
  }

  // Aplica a nova ordem retornada pelo ReorderExercisesSheet. O backend
  // já reordena de forma atômica via temp-offset quando recebemos um
  // updatePlanExercise com orderIndex novo — então pra cada gesto de
  // drag (que move 1 item de A pra B) basta UMA chamada com o novo
  // índice do item que se moveu. O loop abaixo emite uma chamada por
  // item que mudou de posição (na prática, 1) e re-busca a lista.
  const applyReorder = async (plan: WorkoutPlan, next: ReorderItem[]) => {
    const previous = plan.exercises
    if (next.length !== previous.length) return

    try {
      for (let i = 0; i < next.length; i += 1) {
        const targetId = next[i].id
        const oldIndex = previous.findIndex((p) => p.id === targetId)
        if (oldIndex === -1 || oldIndex === i) continue
        await updatePlanExercise(authorizedFetch, plan.id, targetId, {
          orderIndex: i + 1,
        })
        break // Uma chamada já dispara o reorder atômico no backend
      }
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao reordenar exercicios')
    }
  }

  const applySubstitution = async (planId: string, planExerciseId: string, newExerciseId: string) => {
    try {
      await updatePlanExercise(authorizedFetch, planId, planExerciseId, {
        exerciseId: newExerciseId,
      })
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao substituir exercicio')
    }
  }

  const removeExerciseFromPlan = async (planId: string, planExerciseId: string) => {
    try {
      await deletePlanExercise(authorizedFetch, planId, planExerciseId)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover exercicio')
    }
  }

  const saveCustomExerciseName = async (planId: string, planExerciseId: string) => {
    const currentPlan = plans.find((plan) => plan.id === planId)
    const currentExercise = currentPlan?.exercises.find((exercise) => exercise.id === planExerciseId)

    if (!currentExercise) {
      return
    }

    const typed = (customNameByExercise[planExerciseId] ?? '').trim()
    const fallbackName = currentExercise.exercise.name
    const customName = typed && typed !== fallbackName ? typed : null

    try {
      await updatePlanExercise(authorizedFetch, planId, planExerciseId, { customName })
      setEditingNameByExercise((current) => ({ ...current, [planExerciseId]: false }))
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar nome personalizado')
    }
  }

  const savePlanName = async (planId: string) => {
    const typed = (planNameDraftById[planId] ?? '').trim()
    if (typed.length < 2) {
      setError('Nome da rotina deve ter ao menos 2 caracteres.')
      return
    }

    try {
      await updateWorkoutPlan(authorizedFetch, planId, {
        name: typed,
      })
      setEditingPlanNameById((current) => ({
        ...current,
        [planId]: false,
      }))
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar nome da rotina')
    }
  }

  const visiblePlans = createOnlyMode
    ? plans.filter((plan) => (createdPlanId ? plan.id === createdPlanId : false))
    : onlySelectedPlan
      ? plans.filter((plan) => (selectedPlanId ? plan.id === selectedPlanId : false))
      : plans

  // Save signal externo — quando o caller (header do TrainPage no EDIT)
  // incrementa saveSignal, dispara saveFullPlan no primeiro plano
  // visível. Skippa o primeiro render (saveSignal default = 0) e
  // qualquer mudança quando não há plano visível.
  useEffect(() => {
    if (saveSignal <= 0) return
    const target = visiblePlans[0]
    if (!target) return
    void saveFullPlan(target)
    // visiblePlans é derivado, mas saveSignal sendo o trigger único
    // mantém o efeito previsível. Lint desabilitado pra não pedir
    // saveFullPlan como dep (recriaria a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSignal])

  return (
    <section className="space-y-5">
      {loading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {showCreateSection ? (
        <CreatePlanCard
          name={newPlanName}
          description={newPlanDescription}
          onNameChange={setNewPlanName}
          onDescriptionChange={setNewPlanDescription}
          onCreate={() => void createCustom()}
        />
      ) : null}

      {onlySelectedPlan && !loading && visiblePlans.length === 0 ? (
        <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--muted)]">A rotina selecionada nao foi encontrada.</p>
        </article>
      ) : null}

      <div className="space-y-4">
        {visiblePlans.map((plan) => (
          <article key={plan.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
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
              {plan.exercises.map((item, index) => {
                const draft = draftByExercise[item.id] ?? { series: [createSeriesDraft({ reps: '10' })] }
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
                  <div key={item.id} className="rounded-2xl border border-[var(--line)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        {editingNameByExercise[item.id] ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={customNameByExercise[item.id] ?? item.customName ?? item.exercise.name}
                              onChange={(event) =>
                                setCustomNameByExercise((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                              className="rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              className="rounded-md border border-[var(--brand)] px-2 py-1 text-xs font-semibold text-[var(--brand)]"
                              onClick={() => {
                                void saveCustomExerciseName(plan.id, item.id)
                              }}
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
                              onClick={() =>
                                setEditingNameByExercise((current) => ({
                                  ...current,
                                  [item.id]: true,
                                }))
                              }
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
                          onClick={() => setRestPickerTarget({
                            planId: plan.id,
                            planExerciseId: item.id,
                            currentSec: item.restSec ?? 0,
                          })}
                        >
                          Descanso: {formatClock(item.restSec ?? 0)}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)]"
                          onClick={() =>
                            setExpandedByExercise((current) => ({
                              ...current,
                              [item.id]: !current[item.id],
                            }))
                          }
                        >
                          {expandedByExercise[item.id] ? 'Ocultar series' : 'Editar series'}
                        </button>
                        {/* Kebab vertical — abre o ExerciseContextMenuSheet
                            com as 3 ações padrão (reordenar / substituir /
                            remover). Mesma UX do TrainPage pra o usuário
                            não precisar aprender duas interfaces. */}
                        <button
                          type="button"
                          aria-label={`Ações para ${exerciseLabel}`}
                          className="grid h-8 w-8 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                          onClick={() => setCtxMenuTarget({
                            planId: plan.id,
                            planExerciseId: item.id,
                            exerciseId: item.exercise.id,
                            exerciseName: exerciseLabel,
                          })}
                        >
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    </div>

                    {expandedByExercise[item.id] ? (
                      <SeriesEditor
                        draft={draft}
                        showLoad={showLoad}
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
                    ) : null}

                  </div>
                )
              })}

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
        ))}
      </div>

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
    </section>
  )
}
