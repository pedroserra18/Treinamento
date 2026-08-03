import { useAuth } from '../hooks/useAuth'
import { useShowPlanLimit } from '../components/plan/use-plan-limit'
import { catchPlanLimitError } from '../lib/plan-features'
import { useCallback, useEffect, useState } from 'react'
import {
  getExerciseExplorerSelectionEventName,
  type ExerciseExplorerSelection,
} from '../lib/exercise/exercise-explorer'
import { resolveBodyweightFlag } from '../lib/exercise/exercise-meta'
import type { ExerciseOption, WorkoutPlan } from '../types/workout'
import { type DropEntry } from '../components/common/setTypeOptions'
import {
  addExerciseToPlan,
  createWorkoutPlan,
  deletePlanExercise,
  listWorkoutPlans,
  updateWorkoutPlan,
  updatePlanExercise,
} from '../services/workoutService'
import { SkeletonCard } from '../components/common/Skeleton'
import { type ReorderItem } from './train/ReorderExercisesSheet'
import {
  createSeriesDraft,
  parsePerformanceFromNotes,
  buildNotesWithPerformance,
  isDuplicateExerciseError,
  type SeriesDraft,
  type PerformanceDraft,
} from './workouts/workouts-utils'
import { CreatePlanCard } from './workouts/CreatePlanCard'
import { WorkoutPlanModals } from './workouts/WorkoutPlanModals'
import { WorkoutPlanCard } from './workouts/WorkoutPlanCard'

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
          <WorkoutPlanCard
            key={plan.id}
            plan={plan}
            hideInlineSaveButton={hideInlineSaveButton}
            authorizedFetch={authorizedFetch}
            loadAll={loadAll}
            setError={setError}
            editingPlanNameById={editingPlanNameById}
            planNameDraftById={planNameDraftById}
            setEditingPlanNameById={setEditingPlanNameById}
            setPlanNameDraftById={setPlanNameDraftById}
            savePlanName={savePlanName}
            saveFullPlan={saveFullPlan}
            draftByExercise={draftByExercise}
            expandedByExercise={expandedByExercise}
            editingNameByExercise={editingNameByExercise}
            customNameByExercise={customNameByExercise}
            setCustomNameByExercise={setCustomNameByExercise}
            saveCustomExerciseName={saveCustomExerciseName}
            setEditingNameByExercise={setEditingNameByExercise}
            setRestPickerTarget={setRestPickerTarget}
            setExpandedByExercise={setExpandedByExercise}
            setCtxMenuTarget={setCtxMenuTarget}
            setSeriesPicker={setSeriesPicker}
            setAddExerciseTargetPlanId={setAddExerciseTargetPlanId}
            patchDraft={patchDraft}
            removeSeries={removeSeries}
            patchSeries={patchSeries}
            patchDropEntry={patchDropEntry}
            removeDropEntry={removeDropEntry}
            addDropEntry={addDropEntry}
            addSeries={addSeries}
            saveExerciseMetrics={saveExerciseMetrics}
          />
        ))}
      </div>

      <WorkoutPlanModals
        authorizedFetch={authorizedFetch}
        plans={plans}
        ctxMenuTarget={ctxMenuTarget}
        setCtxMenuTarget={setCtxMenuTarget}
        reorderPlanId={reorderPlanId}
        setReorderPlanId={setReorderPlanId}
        substituteTarget={substituteTarget}
        setSubstituteTarget={setSubstituteTarget}
        createExerciseOpen={createExerciseOpen}
        setCreateExerciseOpen={setCreateExerciseOpen}
        createExerciseForSubstitute={createExerciseForSubstitute}
        setCreateExerciseForSubstitute={setCreateExerciseForSubstitute}
        createExerciseForAddPlanId={createExerciseForAddPlanId}
        setCreateExerciseForAddPlanId={setCreateExerciseForAddPlanId}
        addExerciseTargetPlanId={addExerciseTargetPlanId}
        setAddExerciseTargetPlanId={setAddExerciseTargetPlanId}
        restPickerTarget={restPickerTarget}
        setRestPickerTarget={setRestPickerTarget}
        infoDialog={infoDialog}
        setInfoDialog={setInfoDialog}
        seriesPicker={seriesPicker}
        setSeriesPicker={setSeriesPicker}
        draftByExercise={draftByExercise}
        setError={setError}
        removeExerciseFromPlan={removeExerciseFromPlan}
        applyReorder={applyReorder}
        applySubstitution={applySubstitution}
        addToPlan={addToPlan}
        patchSeries={patchSeries}
        removeSeries={removeSeries}
        loadAll={loadAll}
      />
    </section>
  )
}
