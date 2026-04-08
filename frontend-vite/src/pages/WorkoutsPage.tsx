import { useAuth } from '../hooks/useAuth'
import { useCallback, useEffect, useState } from 'react'
import {
  getExerciseExplorerSelectionEventName,
  type ExerciseExplorerSelection,
} from '../lib/exercise-explorer'
import type { ExerciseOption, WorkoutPlan } from '../types/workout'
import {
  addExerciseToPlan,
  createWorkoutPlan,
  deletePlanExercise,
  deleteWorkoutPlan,
  listWorkoutPlans,
  searchExercisesForPlan,
  updateWorkoutPlan,
  updatePlanExercise,
} from '../services/workoutService'

const muscleOptions = [
  'CHEST',
  'BACK',
  'SHOULDERS',
  'ARMS',
  'BICEPS',
  'TRICEPS',
  'CORE',
  'LEGS',
  'GLUTES',
  'CALVES',
  'ABDOMEN',
  'FOREARM',
  'FULL_BODY',
]

type SeriesDraft = {
  reps: string
  loadKg: string
  rpe: string
  rir: string
}

type PerformanceDraft = {
  series: SeriesDraft[]
}

const PERF_MARKER = '__PERF__:'

const BODYWEIGHT_HINTS = [
  /flex[aã]o/i,
  /barra\s*f(i|í)xa/i,
  /pull\s*up/i,
  /chin\s*up/i,
  /mergulho/i,
  /\bdip\b/i,
  /prancha/i,
  /plank/i,
  /burpee/i,
]

function isLikelyBodyweight(name: string): boolean {
  return BODYWEIGHT_HINTS.some((pattern) => pattern.test(name))
}

function resolveBodyweightFlag(flag: boolean | undefined, name: string): boolean {
  if (typeof flag === 'boolean') {
    return flag
  }

  return isLikelyBodyweight(name)
}

function resolveAllowsExtraLoad(flag: boolean | undefined, isBodyweight: boolean): boolean {
  if (!isBodyweight) {
    return true
  }

  return flag ?? true
}

function createSeriesDraft(initial?: Partial<SeriesDraft>): SeriesDraft {
  return {
    reps: initial?.reps ?? '',
    loadKg: initial?.loadKg ?? '',
    rpe: initial?.rpe ?? '',
    rir: initial?.rir ?? '',
  }
}

function estimate1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) {
    return 0
  }

  return weightKg * (1 + 0.0333 * reps)
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const h = String(Math.floor(safe / 3600)).padStart(2, '0')
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, '0')
  const s = String(safe % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function parsePerformanceFromNotes(notes: string | null): Partial<PerformanceDraft> {
  if (!notes || !notes.includes(PERF_MARKER)) {
    return {}
  }

  const markerIndex = notes.indexOf(PERF_MARKER)
  const raw = notes.slice(markerIndex + PERF_MARKER.length).trim()

  try {
    const parsed = JSON.parse(raw) as {
      reps?: number
      sets?: number
      series?: Array<{ reps?: number; loadKg?: number; rpe?: number; rir?: number }>
    }

    if (Array.isArray(parsed.series) && parsed.series.length > 0) {
      return {
        series: parsed.series.map((entry) =>
          createSeriesDraft({
            reps: entry.reps != null ? String(entry.reps) : '',
            loadKg: entry.loadKg != null ? String(entry.loadKg) : '',
            rpe: entry.rpe != null ? String(entry.rpe) : '',
            rir: entry.rir != null ? String(entry.rir) : '',
          }),
        ),
      }
    }

    const sets = Math.max(1, Number(parsed.sets ?? 1))
    return {
      series: Array.from({ length: sets }, () =>
        createSeriesDraft({
          reps: parsed.reps != null ? String(parsed.reps) : '',
        }),
      ),
    }
  } catch {
    return {}
  }
}

function buildNotesWithPerformance(existing: string | null, draft: PerformanceDraft): string {
  const base = (existing ?? '').split(PERF_MARKER)[0].trim()
  const validSeries = draft.series
    .map((entry) => ({
      reps: Number(entry.reps),
      loadKg: entry.loadKg ? Number(entry.loadKg) : undefined,
      rpe: entry.rpe ? Number(entry.rpe) : undefined,
      rir: entry.rir ? Number(entry.rir) : undefined,
    }))
    .filter((entry) => Number.isFinite(entry.reps) && entry.reps > 0)

  const payload = {
    sets: validSeries.length,
    reps: validSeries[0]?.reps,
    rpe: validSeries[0]?.rpe,
    rir: validSeries[0]?.rir,
    loadKg: validSeries[0]?.loadKg,
    series: validSeries,
  }

  return `${base}${base ? ' ' : ''}${PERF_MARKER}${JSON.stringify(payload)}`.trim()
}

function isDuplicateExerciseError(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('duplicate') || normalized.includes('ja existe') || normalized.includes('already exists')
}

type WorkoutsPageProps = {
  selectedPlanId?: string | null
  onlySelectedPlan?: boolean
  showCreateSection?: boolean
}

export function WorkoutsPage({
  selectedPlanId = null,
  onlySelectedPlan = false,
  showCreateSection = true,
}: WorkoutsPageProps) {
  const { authorizedFetch } = useAuth()
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newPlanName, setNewPlanName] = useState('')
  const [newPlanDescription, setNewPlanDescription] = useState('')

  const [addQueryByPlan, setAddQueryByPlan] = useState<Record<string, string>>({})
  const [addMuscleByPlan, setAddMuscleByPlan] = useState<Record<string, string>>({})
  const [optionsByPlan, setOptionsByPlan] = useState<Record<string, ExerciseOption[]>>({})

  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null)
  const [replaceQuery, setReplaceQuery] = useState('')
  const [replaceMuscle, setReplaceMuscle] = useState('')
  const [replaceOptions, setReplaceOptions] = useState<ExerciseOption[]>([])

  const [draftByExercise, setDraftByExercise] = useState<Record<string, PerformanceDraft>>({})
  const [expandedByExercise, setExpandedByExercise] = useState<Record<string, boolean>>({})
  const [editingNameByExercise, setEditingNameByExercise] = useState<Record<string, boolean>>({})
  const [customNameByExercise, setCustomNameByExercise] = useState<Record<string, string>>({})
  const [extraLoadByExercise, setExtraLoadByExercise] = useState<Record<string, boolean>>({})
  const [editingRestByExercise, setEditingRestByExercise] = useState<Record<string, boolean>>({})
  const [restDraftByExercise, setRestDraftByExercise] = useState<Record<string, string>>({})
  const [editingPlanNameById, setEditingPlanNameById] = useState<Record<string, boolean>>({})
  const [planNameDraftById, setPlanNameDraftById] = useState<Record<string, string>>({})

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

            next[exercise.id] = {
              series: fromNotes.series?.length ? fromNotes.series : fallbackSeries,
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
      setExtraLoadByExercise((current) => {
        const next = { ...current }
        planData.forEach((plan) => {
          plan.exercises.forEach((exercise) => {
            const fromNotes = parsePerformanceFromNotes(exercise.notes)
            const hasLoad = (fromNotes.series ?? []).some((series) => Number(series.loadKg) > 0)
            const effectiveBodyweight = resolveBodyweightFlag(
              exercise.exercise.isBodyweight,
              exercise.customName ?? exercise.exercise.name,
            )
            next[exercise.id] = effectiveBodyweight ? hasLoad : true
          })
        })
        return next
      })
      setRestDraftByExercise((current) => {
        const next = { ...current }
        planData.forEach((plan) => {
          plan.exercises.forEach((exercise) => {
            next[exercise.id] = String(exercise.restSec ?? 0)
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const planIds = Array.from(new Set([...plans.map((plan) => plan.id), ...Object.keys(addMuscleByPlan), ...Object.keys(addQueryByPlan)]))

      planIds.forEach((planId) => {
        const normalized = (addQueryByPlan[planId] ?? '').trim()
        const selectedMuscle = addMuscleByPlan[planId] || undefined

        if (!normalized && !selectedMuscle) {
          setOptionsByPlan((current) => ({ ...current, [planId]: [] }))
          return
        }

        void searchExercisesForPlan(authorizedFetch, {
          q: normalized || undefined,
          primaryMuscleGroup: selectedMuscle,
          limit: 12,
        })
          .then((options) => {
            setOptionsByPlan((current) => ({ ...current, [planId]: options }))
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : 'Erro no autocomplete de exercicios')
          })
      })
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [addMuscleByPlan, addQueryByPlan, authorizedFetch, plans])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalized = replaceQuery.trim()
      if (!replaceTargetId || (!normalized && !replaceMuscle)) {
        setReplaceOptions([])
        return
      }

      void searchExercisesForPlan(authorizedFetch, {
        q: normalized || undefined,
        primaryMuscleGroup: replaceMuscle || undefined,
        limit: 12,
      })
        .then((options) => {
          setReplaceOptions(options)
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Erro no autocomplete para substituicao')
        })
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [authorizedFetch, replaceMuscle, replaceQuery, replaceTargetId])

  const createCustom = async () => {
    if (newPlanName.trim().length < 2) {
      setError('Nome do treino deve ter ao menos 2 caracteres')
      return
    }

    try {
      await createWorkoutPlan(authorizedFetch, {
        name: newPlanName.trim(),
        description: newPlanDescription.trim() || undefined,
        source: 'CUSTOM',
      })
      setNewPlanName('')
      setNewPlanDescription('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar treino')
    }
  }

  const lookupExercises = async (planId: string) => {
    const q = (addQueryByPlan[planId] ?? '').trim()
    const selectedMuscle = addMuscleByPlan[planId] || undefined

    if (!q && !selectedMuscle) {
      setError('Digite algo ou selecione um musculo para buscar exercicios')
      return
    }

    try {
      const options = await searchExercisesForPlan(authorizedFetch, {
        q: q || undefined,
        primaryMuscleGroup: selectedMuscle,
        limit: 12,
      })
      setOptionsByPlan((current) => ({ ...current, [planId]: options }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar exercicios')
    }
  }

  const addToPlan = useCallback(async (plan: WorkoutPlan, option: ExerciseOption) => {
    const alreadyExists = plan.exercises.some((entry) => entry.exercise.id === option.id)
    if (alreadyExists) {
      window.alert('Este exercicio ja faz parte do treino. Escolha outro para manter variedade.')
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
      setError(message)
      if (isDuplicateExerciseError(message)) {
        window.alert('Exercicio repetido bloqueado. Nao e permitido duplicar exercicio no mesmo treino.')
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

      const targetPlan = (selectedPlanId ? plans.find((plan) => plan.id === selectedPlanId) : null) ?? plans[0]
      if (!targetPlan) {
        setError('Crie uma rotina antes de adicionar exercicios pelo explorador.')
        return
      }

      void addToPlan(targetPlan, payload)
    }

    window.addEventListener(eventName, handler)

    return () => {
      window.removeEventListener(eventName, handler)
    }
  }, [addToPlan, plans, selectedPlanId])

  const patchSeries = (planExerciseId: string, seriesIndex: number, patch: Partial<SeriesDraft>) => {
    setDraftByExercise((current) => ({
      ...current,
      [planExerciseId]: {
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
          series: nextSeries.length ? nextSeries : [createSeriesDraft()],
        },
      }
    })
  }

  const saveExerciseMetrics = async (planId: string, planExerciseId: string, refresh = true) => {
    const draft = draftByExercise[planExerciseId]
    const targetPlan = plans.find((plan) => plan.id === planId)
    const targetExercise = targetPlan?.exercises.find((exercise) => exercise.id === planExerciseId)

    if (!draft || !targetExercise) {
      return
    }

    const validSeries = draft.series.filter((series) => Number(series.reps) > 0)

    if (validSeries.length === 0) {
      setError('Adicione ao menos uma serie com repeticoes maior que 0 antes de salvar.')
      return
    }

    const normalizedReps = validSeries.map((series) => Math.max(1, Math.min(50, Math.floor(Number(series.reps)))))
    const repsMin = Math.min(...normalizedReps)
    const repsMax = Math.max(...normalizedReps)
    const sets = Math.min(12, validSeries.length)

    const normalizedDraft: PerformanceDraft = {
      series: validSeries.slice(0, sets).map((series) =>
        createSeriesDraft({
          reps: String(Math.max(1, Math.min(50, Math.floor(Number(series.reps))))),
          loadKg: (() => {
            const effectiveBodyweight = resolveBodyweightFlag(
              targetExercise.exercise.isBodyweight,
              targetExercise.customName ?? targetExercise.exercise.name,
            )
            return effectiveBodyweight && !extraLoadByExercise[planExerciseId] ? '' : series.loadKg
          })(),
          rpe: series.rpe,
          rir: series.rir,
        }),
      ),
    }

    try {
      await updatePlanExercise(authorizedFetch, planId, planExerciseId, {
        sets,
        repsMin,
        repsMax,
        notes: buildNotesWithPerformance(targetExercise.notes, normalizedDraft),
      })
      if (refresh) {
        await loadAll()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar series do exercicio')
    }
  }

  const saveFullPlan = async (plan: WorkoutPlan) => {
    try {
      await Promise.all(plan.exercises.map((entry) => saveExerciseMetrics(plan.id, entry.id, false)))
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar treino completo')
    }
  }

  const moveExercise = async (plan: WorkoutPlan, planExerciseId: string, direction: -1 | 1) => {
    const currentIndex = plan.exercises.findIndex((item) => item.id === planExerciseId)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= plan.exercises.length) {
      return
    }

    try {
      await updatePlanExercise(authorizedFetch, plan.id, planExerciseId, {
        orderIndex: nextIndex + 1,
      })
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao reordenar exercicios')
    }
  }

  const openReplace = async (planExerciseId: string) => {
    setReplaceTargetId(planExerciseId)
    setReplaceQuery('')
    setReplaceMuscle('')
    setReplaceOptions([])
  }

  const searchReplace = async () => {
    if (!replaceQuery.trim() && !replaceMuscle) {
      setError('Digite algo ou selecione um musculo para buscar substituicao')
      return
    }

    try {
      const options = await searchExercisesForPlan(authorizedFetch, {
        q: replaceQuery.trim() || undefined,
        primaryMuscleGroup: replaceMuscle || undefined,
        limit: 12,
      })
      setReplaceOptions(options)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar substituicao')
    }
  }

  const applyReplace = async (plan: WorkoutPlan, newExerciseId: string) => {
    if (!replaceTargetId) {
      return
    }

    try {
      await updatePlanExercise(authorizedFetch, plan.id, replaceTargetId, {
        exerciseId: newExerciseId,
      })
      setReplaceTargetId(null)
      setReplaceOptions([])
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

  const saveRestSec = async (planId: string, planExerciseId: string) => {
    const raw = restDraftByExercise[planExerciseId] ?? '0'
    const parsed = Number(raw)
    const isInt = Number.isInteger(parsed)
    const isZero = parsed === 0
    const inRange = parsed >= 10 && parsed <= 300

    if (!isInt || (!isZero && !inRange)) {
      setError('Descanso deve ser 0 ou um valor entre 10 e 300 segundos.')
      return
    }

    try {
      await updatePlanExercise(authorizedFetch, planId, planExerciseId, {
        restSec: parsed === 0 ? null : parsed,
      })
      setEditingRestByExercise((current) => ({
        ...current,
        [planExerciseId]: false,
      }))
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar descanso do exercicio')
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

  const visiblePlans = onlySelectedPlan
    ? plans.filter((plan) => (selectedPlanId ? plan.id === selectedPlanId : false))
    : plans

  return (
    <section className="space-y-5">
      {loading ? <p className="text-sm text-[var(--muted)]">Carregando treinos...</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {showCreateSection ? (
        <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="text-lg font-extrabold text-[var(--text)]">Criar treino</h2>
          <div className="mt-2 grid gap-2">
            <input
              value={newPlanName}
              onChange={(event) => setNewPlanName(event.target.value)}
              placeholder="Nome do treino"
              className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            <textarea
              value={newPlanDescription}
              onChange={(event) => setNewPlanDescription(event.target.value)}
              placeholder="Descricao"
              rows={2}
              className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              className="w-fit rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-bold text-black"
              onClick={() => {
                void createCustom()
              }}
            >
              Criar e salvar treino
            </button>
          </div>
        </article>
      ) : null}

      {onlySelectedPlan && !loading && visiblePlans.length === 0 ? (
        <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--muted)]">A rotina selecionada nao foi encontrada.</p>
        </article>
      ) : null}

      <div className="space-y-4">
        {visiblePlans.map((plan) => (
          <article key={plan.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                {editingPlanNameById[plan.id] ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={planNameDraftById[plan.id] ?? plan.name}
                      onChange={(event) =>
                        setPlanNameDraftById((current) => ({
                          ...current,
                          [plan.id]: event.target.value,
                        }))
                      }
                      className="rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-sm font-semibold"
                    />
                    <button
                      type="button"
                      className="rounded-md border border-[var(--brand)] px-2 py-1 text-xs font-semibold text-[var(--brand)]"
                      onClick={() => {
                        void savePlanName(plan.id)
                      }}
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)]"
                      onClick={() => {
                        setEditingPlanNameById((current) => ({
                          ...current,
                          [plan.id]: false,
                        }))
                        setPlanNameDraftById((current) => ({
                          ...current,
                          [plan.id]: plan.name,
                        }))
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-left text-lg font-black text-[var(--text)] transition hover:opacity-80"
                    onClick={() => {
                      setEditingPlanNameById((current) => ({
                        ...current,
                        [plan.id]: true,
                      }))
                    }}
                  >
                    {plan.name}
                  </button>
                )}
                <p className="text-sm text-[var(--muted)]">{plan.description ?? 'Sem descricao'}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300"
                  onClick={() => {
                    void saveFullPlan(plan)
                  }}
                >
                  Salvar treino completo
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-red-500/60 px-3 py-1 text-xs font-semibold text-red-400"
                  onClick={() => {
                    void deleteWorkoutPlan(authorizedFetch, plan.id)
                      .then(loadAll)
                      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao excluir treino'))
                  }}
                >
                  Excluir treino
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-[var(--line)] p-3">
              <p className="text-sm font-semibold text-[var(--text)]">Adicionar exercicio</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <input
                  value={addQueryByPlan[plan.id] ?? ''}
                  onChange={(event) =>
                    setAddQueryByPlan((current) => ({
                      ...current,
                      [plan.id]: event.target.value,
                    }))
                  }
                  placeholder="Buscar exercicio"
                  className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                />
                <select
                  value={addMuscleByPlan[plan.id] ?? ''}
                  onChange={(event) =>
                    setAddMuscleByPlan((current) => ({
                      ...current,
                      [plan.id]: event.target.value,
                    }))
                  }
                  className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                >
                  <option value="">Todos</option>
                  {muscleOptions.map((muscle) => (
                    <option key={muscle} value={muscle}>
                      {muscle}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
                  onClick={() => {
                    void lookupExercises(plan.id)
                  }}
                >
                  Buscar
                </button>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(optionsByPlan[plan.id] ?? []).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="rounded-lg border border-[var(--line)] px-3 py-2 text-left text-sm text-[var(--text)]"
                    onClick={() => {
                      void addToPlan(plan, option)
                    }}
                  >
                    <span className="font-semibold">{option.name}</span>
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      {option.primaryMuscleGroup} • {option.difficulty}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {plan.exercises.length === 0 ? <p className="text-sm text-[var(--muted)]">Sem exercicios.</p> : null}
              {plan.exercises.map((item, index) => {
                const draft = draftByExercise[item.id] ?? { series: [createSeriesDraft({ reps: '10' })] }
                const exerciseLabel = item.customName ?? item.exercise.name
                const effectiveBodyweight = resolveBodyweightFlag(item.exercise.isBodyweight, exerciseLabel)
                const allowsExtraLoad = resolveAllowsExtraLoad(item.exercise.allowsExtraLoad, effectiveBodyweight)
                const showLoad = !effectiveBodyweight || (allowsExtraLoad && extraLoadByExercise[item.id])
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
                        {editingRestByExercise[item.id] ? (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              value={restDraftByExercise[item.id] ?? '0'}
                              onChange={(event) =>
                                setRestDraftByExercise((current) => ({
                                  ...current,
                                  [item.id]: event.target.value.replace(/[^\d]/g, ''),
                                }))
                              }
                              className="w-24 rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                              placeholder="seg"
                            />
                            <button
                              type="button"
                              className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
                              onClick={() => {
                                void saveRestSec(plan.id, item.id)
                              }}
                            >
                              Salvar descanso
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="mt-2 rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)]"
                            onClick={() =>
                              setEditingRestByExercise((current) => ({
                                ...current,
                                [item.id]: true,
                              }))
                            }
                          >
                            Descanso: {formatClock(item.restSec ?? 0)}
                          </button>
                        )}
                        {effectiveBodyweight ? (
                          <label className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--muted)]">
                            <input
                              type="checkbox"
                              checked={Boolean(extraLoadByExercise[item.id])}
                              disabled={!allowsExtraLoad}
                              onChange={(event) =>
                                setExtraLoadByExercise((current) => ({
                                  ...current,
                                  [item.id]: event.target.checked,
                                }))
                              }
                            />
                            {allowsExtraLoad ? 'Adicionar peso extra' : 'Peso extra indisponivel'}
                          </label>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
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
                        <button
                          type="button"
                          className="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)]"
                          onClick={() => {
                            void moveExercise(plan, item.id, -1)
                          }}
                        >
                          Subir
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)]"
                          onClick={() => {
                            void moveExercise(plan, item.id, 1)
                          }}
                        >
                          Descer
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)]"
                          onClick={() => {
                            void openReplace(item.id)
                          }}
                        >
                          Substituir
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-red-500/60 px-2 py-1 text-xs text-red-400"
                          onClick={() => {
                            void removeExerciseFromPlan(plan.id, item.id)
                          }}
                        >
                          Remover
                        </button>
                      </div>
                    </div>

                    {expandedByExercise[item.id] ? (
                      <div className="mt-3 rounded-lg border border-[var(--line)] p-2">
                        <div className="space-y-2">
                          {draft.series.map((series, seriesIndex) => (
                            <div
                              key={`${item.id}-serie-${seriesIndex}`}
                              className={`grid gap-2 rounded-xl border border-[var(--line)] p-3 ${
                                showLoad
                                  ? 'sm:grid-cols-[50px_1fr_1fr_1fr_auto]'
                                  : 'sm:grid-cols-[50px_1fr_1fr_auto]'
                              }`}
                            >
                              <p className="self-center text-xs font-bold text-[var(--muted)]">Serie {seriesIndex + 1}</p>
                              {showLoad ? (
                                <label className="text-[11px] uppercase text-[var(--muted)]">
                                  Peso (kg)
                                  <input
                                    value={series.loadKg}
                                    onChange={(event) =>
                                      patchSeries(item.id, seriesIndex, {
                                        loadKg: event.target.value.replace(/[^\d.]/g, ''),
                                      })
                                    }
                                    className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                                  />
                                </label>
                              ) : null}
                              <label className="text-[11px] uppercase text-[var(--muted)]">
                                Repeticoes
                                <input
                                  value={series.reps}
                                  onChange={(event) =>
                                    patchSeries(item.id, seriesIndex, { reps: event.target.value.replace(/[^\d]/g, '') })
                                  }
                                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                                />
                              </label>
                              <label className="text-[11px] uppercase text-[var(--muted)]">
                                RIR
                                <input
                                  value={series.rir}
                                  onChange={(event) =>
                                    patchSeries(item.id, seriesIndex, { rir: event.target.value.replace(/[^\d]/g, '') })
                                  }
                                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                                />
                              </label>
                              <button
                                type="button"
                                className="self-end rounded-lg border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-300"
                                onClick={() => removeSeries(item.id, seriesIndex)}
                              >
                                Remover
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                            onClick={() => addSeries(item.id)}
                          >
                            Adicionar serie
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                            onClick={() => {
                              void saveExerciseMetrics(plan.id, item.id)
                            }}
                          >
                            Salvar series
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {replaceTargetId === item.id ? (
                      <div className="mt-3 rounded-lg border border-[var(--line)] p-2">
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                          <input
                            value={replaceQuery}
                            onChange={(event) => setReplaceQuery(event.target.value)}
                            placeholder="Buscar substituto"
                            className="rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                          />
                          <select
                            value={replaceMuscle}
                            onChange={(event) => setReplaceMuscle(event.target.value)}
                            className="rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                          >
                            <option value="">Todos</option>
                            {muscleOptions.map((muscle) => (
                              <option key={muscle} value={muscle}>
                                {muscle}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="rounded-md border border-[var(--line)] px-3 py-1 text-sm font-semibold text-[var(--text)]"
                            onClick={() => {
                              void searchReplace()
                            }}
                          >
                            Buscar
                          </button>
                        </div>

                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {replaceOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className="rounded-md border border-[var(--line)] px-2 py-2 text-left text-xs text-[var(--text)]"
                              onClick={() => {
                                void applyReplace(plan, option.id)
                              }}
                            >
                              {option.name}
                              <span className="block text-[10px] text-[var(--muted)]">
                                {option.primaryMuscleGroup} • {option.difficulty}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
