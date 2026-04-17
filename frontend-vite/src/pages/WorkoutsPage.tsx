import { useAuth } from '../hooks/useAuth'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getExerciseExplorerSelectionEventName,
  type ExerciseExplorerSelection,
} from '../lib/exercise-explorer'
import { MUSCLE_OPTIONS, resolveBodyweightFlag } from '../lib/exercise-meta'
import type { ExerciseOption, WorkoutPlan } from '../types/workout'
import { SetTypeSelector } from '../components/common/SetTypeSelector'
import { type SetType, type DropEntry } from '../components/common/setTypeOptions'
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
import { formatClock, formatRestOptionLabel, REST_OPTIONS_SEC } from '../lib/workout-timing'

const muscleOptions = MUSCLE_OPTIONS

type SeriesDraft = {
  reps: string
  loadKg: string
  rpe: string
  rir: string
  setType: SetType
  dropSets: DropEntry[]
  clusterReps: string
  clusterCount: string
}

type PerformanceDraft = {
  series: SeriesDraft[]
}

const PERF_MARKER = '__PERF__:'

function createSeriesDraft(initial?: Partial<SeriesDraft>): SeriesDraft {
  return {
    reps: initial?.reps ?? '',
    loadKg: initial?.loadKg ?? '',
    rpe: initial?.rpe ?? '',
    rir: initial?.rir ?? '',
    setType: initial?.setType ?? 'normal',
    dropSets: initial?.dropSets ?? [{ weightKg: '', reps: '' }],
    clusterReps: initial?.clusterReps ?? '',
    clusterCount: initial?.clusterCount ?? '',
  }
}

function estimate1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) {
    return 0
  }

  return weightKg * (1 + 0.0333 * reps)
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
      series?: Array<{
        reps?: number
        loadKg?: number
        rpe?: number
        rir?: number
        setType?: SetType
        dropSets?: Array<{ weightKg?: number; reps?: number }>
        clusterReps?: number
        clusterCount?: number
      }>
    }

    if (Array.isArray(parsed.series) && parsed.series.length > 0) {
      return {
        series: parsed.series.map((entry) =>
          createSeriesDraft({
            reps: entry.reps != null ? String(entry.reps) : '',
            loadKg: entry.loadKg != null ? String(entry.loadKg) : '',
            rpe: entry.rpe != null ? String(entry.rpe) : '',
            rir: entry.rir != null ? String(entry.rir) : '',
            setType: entry.setType ?? 'normal',
            dropSets:
              Array.isArray(entry.dropSets) && entry.dropSets.length > 0
                ? entry.dropSets.map((d) => ({
                    weightKg: d.weightKg != null ? String(d.weightKg) : '',
                    reps: d.reps != null ? String(d.reps) : '',
                  }))
                : [{ weightKg: '', reps: '' }],
            clusterReps: entry.clusterReps != null ? String(entry.clusterReps) : '',
            clusterCount: entry.clusterCount != null ? String(entry.clusterCount) : '',
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
    .map((entry) => {
      const setType = entry.setType ?? 'normal'

      if (setType === 'drop') {
        const validDrops = entry.dropSets
          .map((d) => ({
            weightKg: d.weightKg ? Number(d.weightKg) : undefined,
            reps: Number(d.reps),
          }))
          .filter((d) => Number.isFinite(d.reps) && d.reps > 0)
        if (validDrops.length === 0) return null
        // Use first drop reps as the canonical reps for plan metadata
        return { reps: validDrops[0]!.reps, setType, dropSets: validDrops }
      }

      if (setType === 'cluster') {
        const cr = Number(entry.clusterReps)
        const cc = Number(entry.clusterCount)
        if (!Number.isFinite(cr) || cr <= 0 || !Number.isFinite(cc) || cc <= 0) return null
        return {
          reps: Math.round(cr * cc),
          loadKg: entry.loadKg ? Number(entry.loadKg) : undefined,
          rir: entry.rir ? Number(entry.rir) : undefined,
          setType,
          clusterReps: cr,
          clusterCount: cc,
        }
      }

      const reps = Number(entry.reps)
      if (!Number.isFinite(reps) || reps <= 0) return null
      return {
        reps,
        loadKg: entry.loadKg ? Number(entry.loadKg) : undefined,
        rpe: entry.rpe ? Number(entry.rpe) : undefined,
        rir: entry.rir ? Number(entry.rir) : undefined,
        setType: setType === 'normal' ? undefined : setType,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const payload = {
    sets: validSeries.length,
    reps: validSeries[0]?.reps,
    rpe: 'rpe' in (validSeries[0] ?? {}) ? (validSeries[0] as { rpe?: number }).rpe : undefined,
    rir: 'rir' in (validSeries[0] ?? {}) ? (validSeries[0] as { rir?: number }).rir : undefined,
    loadKg: 'loadKg' in (validSeries[0] ?? {}) ? (validSeries[0] as { loadKg?: number }).loadKg : undefined,
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
  createOnlyMode?: boolean
  onPlanSaved?: (planId: string) => void
}

export function WorkoutsPage({
  selectedPlanId = null,
  onlySelectedPlan = false,
  showCreateSection = true,
  createOnlyMode = false,
  onPlanSaved,
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
  const [hasExploredByPlan, setHasExploredByPlan] = useState<Record<string, boolean>>({})

  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null)
  const [replaceQuery, setReplaceQuery] = useState('')
  const [replaceMuscle, setReplaceMuscle] = useState('')
  const [replaceOptions, setReplaceOptions] = useState<ExerciseOption[]>([])

  const [draftByExercise, setDraftByExercise] = useState<Record<string, PerformanceDraft>>({})
  const [expandedByExercise, setExpandedByExercise] = useState<Record<string, boolean>>({})
  const [editingNameByExercise, setEditingNameByExercise] = useState<Record<string, boolean>>({})
  const [customNameByExercise, setCustomNameByExercise] = useState<Record<string, string>>({})
  const [editingRestByExercise, setEditingRestByExercise] = useState<Record<string, boolean>>({})
  const [restDraftByExercise, setRestDraftByExercise] = useState<Record<string, string>>({})
  const [editingPlanNameById, setEditingPlanNameById] = useState<Record<string, boolean>>({})
  const [planNameDraftById, setPlanNameDraftById] = useState<Record<string, string>>({})
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null)
  const exploreSearchRequestIdRef = useRef(0)
  const replaceSearchRequestIdRef = useRef(0)
  const exerciseSearchCacheRef = useRef<Map<string, ExerciseOption[]>>(new Map())

  const fetchExerciseOptions = useCallback(
    async (input: { q?: string; primaryMuscleGroup?: string; limit: number }) => {
      const normalizedQuery = input.q?.trim().toLowerCase() ?? ''
      const normalizedMuscle = input.primaryMuscleGroup ?? ''
      const cacheKey = `${normalizedQuery}::${normalizedMuscle}::${input.limit}`

      const cached = exerciseSearchCacheRef.current.get(cacheKey)
      if (cached) {
        return cached
      }

      const options = await searchExercisesForPlan(authorizedFetch, input)
      exerciseSearchCacheRef.current.set(cacheKey, options)
      return options
    },
    [authorizedFetch],
  )

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
      exerciseSearchCacheRef.current.clear()
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
      const exploredPlanIds = Object.keys(hasExploredByPlan).filter((planId) => hasExploredByPlan[planId])
      if (exploredPlanIds.length === 0) {
        return
      }

      const requestId = ++exploreSearchRequestIdRef.current

      void Promise.all(
        exploredPlanIds.map(async (planId) => {
          const normalized = (addQueryByPlan[planId] ?? '').trim()
          const selectedMuscle = addMuscleByPlan[planId] || undefined

          const options = await fetchExerciseOptions({
            q: normalized || undefined,
            primaryMuscleGroup: selectedMuscle,
            limit: 200,
          })

          return [planId, options] as const
        }),
      )
        .then((results) => {
          if (requestId !== exploreSearchRequestIdRef.current) {
            return
          }

          setOptionsByPlan((current) => {
            const next = { ...current }
            results.forEach(([planId, options]) => {
              next[planId] = options
            })
            return next
          })
        })
        .catch((err) => {
          if (requestId !== exploreSearchRequestIdRef.current) {
            return
          }

          setError(err instanceof Error ? err.message : 'Erro ao buscar exercicios')
        })
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [addMuscleByPlan, addQueryByPlan, fetchExerciseOptions, hasExploredByPlan])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalized = replaceQuery.trim()
      if (!replaceTargetId || (!normalized && !replaceMuscle)) {
        replaceSearchRequestIdRef.current += 1
        setReplaceOptions([])
        return
      }

      const requestId = ++replaceSearchRequestIdRef.current

      void fetchExerciseOptions({
        q: normalized || undefined,
        primaryMuscleGroup: replaceMuscle || undefined,
        limit: 12,
      })
        .then((options) => {
          if (requestId !== replaceSearchRequestIdRef.current) {
            return
          }

          setReplaceOptions(options)
        })
        .catch((err) => {
          if (requestId !== replaceSearchRequestIdRef.current) {
            return
          }

          setError(err instanceof Error ? err.message : 'Erro no autocomplete para substituicao')
        })
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [fetchExerciseOptions, replaceMuscle, replaceQuery, replaceTargetId])

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
      setError(err instanceof Error ? err.message : 'Erro ao criar treino')
    }
  }

  const lookupExercises = async (planId: string) => {
    const q = (addQueryByPlan[planId] ?? '').trim()
    const selectedMuscle = addMuscleByPlan[planId] || undefined

    try {
      setHasExploredByPlan((current) => ({ ...current, [planId]: true }))
      const options = await fetchExerciseOptions({
        q: q || undefined,
        primaryMuscleGroup: selectedMuscle,
        limit: 200,
      })
      setOptionsByPlan((current) => ({ ...current, [planId]: options }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao buscar exercicios')
    }
  }

  const stopExploringExercises = (planId: string) => {
    exploreSearchRequestIdRef.current += 1
    setHasExploredByPlan((current) => ({ ...current, [planId]: false }))
    setOptionsByPlan((current) => ({
      ...current,
      [planId]: [],
    }))
  }

  const renderExerciseOptionCard = (
    option: ExerciseOption,
    actionLabel: string,
    onPrimaryAction: () => void,
  ) => (
    <article key={option.id} className="rounded-xl border border-[var(--line)] p-3">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] sm:h-20 sm:w-20">
          {option.thumbnailUrl ? (
            <img
              src={option.thumbnailUrl}
              alt={`Imagem do exercicio ${option.name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Sem foto
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--text)]">{option.name}</p>
          <span className="block text-xs text-[var(--muted)]">
            {option.primaryMuscleGroup} • {option.difficulty}
          </span>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
              onClick={onPrimaryAction}
            >
              {actionLabel}
            </button>
            <button
              type="button"
              disabled={!option.videoUrl}
              onClick={() => {
                if (option.videoUrl) {
                  window.open(option.videoUrl, '_blank', 'noopener,noreferrer')
                }
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {option.videoUrl ? 'Ver video' : 'Video em breve'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )

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

      const targetPlan =
        (createOnlyMode && createdPlanId ? plans.find((plan) => plan.id === createdPlanId) : null) ??
        (selectedPlanId ? plans.find((plan) => plan.id === selectedPlanId) : null) ??
        plans[0]
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
  }, [addToPlan, createOnlyMode, createdPlanId, plans, selectedPlanId])

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

  const addDropEntry = (planExerciseId: string, seriesIndex: number) => {
    setDraftByExercise((current) => ({
      ...current,
      [planExerciseId]: {
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

    const validSeries = draft.series.filter((series) => Number(series.reps) > 0)

    if (validSeries.length === 0) {
      setError('Adicione ao menos uma serie com repeticoes maior que 0 antes de salvar.')
      return false
    }

    const rawRestDraft = restDraftByExercise[planExerciseId] ?? String(targetExercise.restSec ?? 0)
    const parsedRest = Number(rawRestDraft)
    const isInt = Number.isInteger(parsedRest)
    const isZero = parsedRest === 0
    const inRange = parsedRest >= 10 && parsedRest <= 300

    if (!isInt || (!isZero && !inRange)) {
      setError('Descanso deve ser 0 ou um valor entre 10 e 300 segundos.')
      return false
    }

    const typedExerciseName = (customNameByExercise[planExerciseId] ?? targetExercise.customName ?? targetExercise.exercise.name).trim()
    const fallbackExerciseName = targetExercise.exercise.name
    const customName =
      typedExerciseName.length > 0 && typedExerciseName !== fallbackExerciseName
        ? typedExerciseName
        : null

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

  const saveFullPlan = async (plan: WorkoutPlan) => {
    try {
      const results = await Promise.all(plan.exercises.map((entry) => saveExerciseMetrics(plan.id, entry.id, false)))
      if (!results.every(Boolean)) {
        return
      }

      await loadAll()
      onPlanSaved?.(plan.id)
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

  const visiblePlans = createOnlyMode
    ? plans.filter((plan) => (createdPlanId ? plan.id === createdPlanId : false))
    : onlySelectedPlan
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
                  className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"
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
                    {
                      setAddQueryByPlan((current) => ({
                        ...current,
                        [plan.id]: event.target.value,
                      }))
                      if (hasExploredByPlan[plan.id]) {
                        setOptionsByPlan((current) => ({
                          ...current,
                          [plan.id]: [],
                        }))
                      }
                    }
                  }
                  placeholder="Buscar exercicio"
                  className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                />
                <select
                  value={addMuscleByPlan[plan.id] ?? ''}
                  onChange={(event) =>
                    {
                      setAddMuscleByPlan((current) => ({
                        ...current,
                        [plan.id]: event.target.value,
                      }))
                      if (hasExploredByPlan[plan.id]) {
                        setOptionsByPlan((current) => ({
                          ...current,
                          [plan.id]: [],
                        }))
                      }
                    }
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
                  Explorar exercicios
                </button>
                {hasExploredByPlan[plan.id] ? (
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--muted)]"
                    onClick={() => {
                      stopExploringExercises(plan.id)
                    }}
                  >
                    Parar exploracao
                  </button>
                ) : null}
              </div>

              <div className="mt-2 max-h-72 overflow-y-auto pr-1">
                {hasExploredByPlan[plan.id] ? null : (
                  <p className="mb-2 text-xs text-[var(--muted)]">
                    Clique em "Explorar exercicios" para carregar a lista.
                  </p>
                )}

                {hasExploredByPlan[plan.id] && (optionsByPlan[plan.id] ?? []).length === 0 ? (
                  <p className="mb-2 text-xs text-[var(--muted)]">Nenhum exercicio encontrado para o filtro atual.</p>
                ) : null}

                <div className="space-y-2">
                  {(optionsByPlan[plan.id] ?? []).map((option) => (
                    renderExerciseOptionCard(option, 'Adicionar na rotina em edicao', () => {
                      void addToPlan(plan, option)
                    })
                  ))}
                </div>
              </div>
            </div>

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
                        {editingRestByExercise[item.id] ? (
                          <div className="mt-2 flex items-center gap-2">
                            <select
                              value={restDraftByExercise[item.id] ?? '0'}
                              onChange={(event) =>
                                setRestDraftByExercise((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                              className="w-36 rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                            >
                              <option value="0">Sem descanso</option>
                              {REST_OPTIONS_SEC.map((seconds) => (
                                <option key={seconds} value={seconds}>
                                  {formatRestOptionLabel(seconds)}
                                </option>
                              ))}
                            </select>
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
                              className="space-y-2 rounded-xl border border-[var(--line)] p-3"
                            >
                              {/* Header: label + type selector + remove */}
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="shrink-0 text-xs font-bold text-[var(--muted)]">
                                  Serie {seriesIndex + 1}
                                </span>
                                <SetTypeSelector
                                  value={series.setType}
                                  onChange={(val) => patchSeries(item.id, seriesIndex, { setType: val })}
                                />
                                <button
                                  type="button"
                                  className="ml-auto rounded-lg border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-300"
                                  onClick={() => removeSeries(item.id, seriesIndex)}
                                >
                                  Remover
                                </button>
                              </div>

                              {series.setType === 'drop' ? (
                                /* Drop set inputs */
                                <div className="space-y-2 pl-1">
                                  {series.dropSets.map((drop, dropIdx) => (
                                    <div
                                      key={dropIdx}
                                      className={`grid gap-2 ${showLoad ? 'grid-cols-[auto_1fr_1fr_auto]' : 'grid-cols-[auto_1fr_auto]'}`}
                                    >
                                      <span className="self-center whitespace-nowrap text-[11px] font-semibold text-[var(--muted)]">
                                        Drop {dropIdx + 1}
                                      </span>
                                      {showLoad ? (
                                        <label className="text-[11px] uppercase text-[var(--muted)]">
                                          Peso (kg)
                                          <input
                                            value={drop.weightKg}
                                            onChange={(e) =>
                                              patchDropEntry(item.id, seriesIndex, dropIdx, {
                                                weightKg: e.target.value.replace(/[^\d.]/g, ''),
                                              })
                                            }
                                            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                                          />
                                        </label>
                                      ) : null}
                                      <label className="text-[11px] uppercase text-[var(--muted)]">
                                        Reps
                                        <input
                                          value={drop.reps}
                                          onChange={(e) =>
                                            patchDropEntry(item.id, seriesIndex, dropIdx, {
                                              reps: e.target.value.replace(/[^\d]/g, ''),
                                            })
                                          }
                                          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => removeDropEntry(item.id, seriesIndex, dropIdx)}
                                        disabled={series.dropSets.length <= 1}
                                        className="self-end rounded-lg border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-300 disabled:opacity-40"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => addDropEntry(item.id, seriesIndex)}
                                    className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                                  >
                                    + Adicionar Drop
                                  </button>
                                </div>
                              ) : series.setType === 'cluster' ? (
                                /* Cluster set inputs */
                                <div className={`grid gap-2 ${showLoad ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
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
                                    Reps/Cluster
                                    <input
                                      value={series.clusterReps}
                                      placeholder="3"
                                      onChange={(event) =>
                                        patchSeries(item.id, seriesIndex, {
                                          clusterReps: event.target.value.replace(/[^\d]/g, ''),
                                        })
                                      }
                                      className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                                    />
                                  </label>
                                  <label className="text-[11px] uppercase text-[var(--muted)]">
                                    Nº Clusters
                                    <input
                                      value={series.clusterCount}
                                      placeholder="4"
                                      onChange={(event) =>
                                        patchSeries(item.id, seriesIndex, {
                                          clusterCount: event.target.value.replace(/[^\d]/g, ''),
                                        })
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
                                </div>
                              ) : (
                                /* Normal / Warmup / Failure inputs */
                                <div className={`grid gap-2 ${showLoad ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
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
                                </div>
                              )}
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

                        <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
                          {replaceOptions.map((option) => (
                            renderExerciseOptionCard(option, 'Substituir na rotina em edicao', () => {
                              void applyReplace(plan, option.id)
                            })
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
