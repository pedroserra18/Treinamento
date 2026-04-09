import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { WorkoutsPage } from './WorkoutsPage'
import {
  getExerciseExplorerSelectionEventName,
  openExerciseExplorer,
  type ExerciseExplorerSelection,
} from '../lib/exercise-explorer'
import type { ExerciseOption, WorkoutPlan } from '../types/workout'
import {
  addExerciseToPlan,
  completeWorkoutSession,
  createWorkoutPlan,
  deleteWorkoutPlan,
  getLatestExercisePerformance,
  listWorkoutPlans,
  searchExercisesForPlan,
  startWorkoutSession,
  updatePlanExercise,
} from '../services/workoutService'

type TrainScreen = 'DASHBOARD' | 'ACTIVE' | 'SUMMARY'
type TrainOriginMode = 'EMPTY' | 'ROUTINE'
type RoutineManagerMode = 'CREATE' | 'EDIT'

type ExerciseSetInput = {
  reps: string
  weightKg: string
  rir: string
}

type ActiveExercise = {
  planExerciseId?: string
  exerciseId: string
  exerciseName: string
  isBodyweight: boolean
  allowsExtraLoad: boolean
  suggestedReps: string
  restDurationSec: number
  restRemainingSec: number
  restRunning: boolean
  sets: ExerciseSetInput[]
}

function createSet(reps = '', weightKg = '', rir = ''): ExerciseSetInput {
  return { reps, weightKg, rir }
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const h = String(Math.floor(safe / 3600)).padStart(2, '0')
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, '0')
  const s = String(safe % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function formatDateTime(value: Date | null): string {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

const REST_OPTIONS_SEC = [
  ...Array.from({ length: 6 }, (_, index) => (index + 1) * 10),
  ...Array.from({ length: 8 }, (_, index) => 90 + index * 30),
]

function formatRestOptionLabel(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}min` : `${minutes}min ${seconds}s`
}

function parsePositiveInt(value: string, fallback = 0): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return fallback
  }

  return Math.floor(n)
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapPlanToActiveExercises(plan: WorkoutPlan): ActiveExercise[] {
  return plan.exercises.map((entry) => {
    const repsText =
      entry.repsMin && entry.repsMax
        ? `${entry.repsMin}`
        : String(entry.repsMax ?? entry.repsMin ?? 8)

    return {
      planExerciseId: entry.id,
      exerciseId: entry.exercise.id,
      exerciseName: entry.customName ?? entry.exercise.name,
      isBodyweight: entry.exercise.isBodyweight,
      allowsExtraLoad: entry.exercise.allowsExtraLoad,
      suggestedReps: repsText,
      restDurationSec: entry.restSec ?? 0,
      restRemainingSec: entry.restSec ?? 0,
      restRunning: false,
      sets: Array.from({ length: Math.max(1, entry.sets ?? 3) }, () => createSet()),
    }
  })
}

function calculateTotals(exercises: ActiveExercise[]): { totalSeries: number; totalVolumeKg: number } {
  let totalSeries = 0
  let totalVolumeKg = 0

  exercises.forEach((exercise) => {
    exercise.sets.forEach((setInput) => {
      const reps = Number(setInput.reps)
      if (!Number.isFinite(reps) || reps <= 0) {
        return
      }

      totalSeries += 1
      const weight = Number(setInput.weightKg)
      if (Number.isFinite(weight) && weight > 0) {
        totalVolumeKg += weight * reps
      }
    })
  })

  return {
    totalSeries,
    totalVolumeKg: Number(totalVolumeKg.toFixed(2)),
  }
}

export function TrainPage() {
  const { authorizedFetch } = useAuth()

  const [screen, setScreen] = useState<TrainScreen>('DASHBOARD')
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showRoutineManager, setShowRoutineManager] = useState(false)
  const [routineManagerMode, setRoutineManagerMode] = useState<RoutineManagerMode>('CREATE')
  const [openRoutineMenuId, setOpenRoutineMenuId] = useState<string | null>(null)

  const [activePlanId, setActivePlanId] = useState<string>('')
  const [activePlanName, setActivePlanName] = useState<string>('Treinamento vazio')
  const [originMode, setOriginMode] = useState<TrainOriginMode>('EMPTY')
  const [activeExercises, setActiveExercises] = useState<ActiveExercise[]>([])

  const [elapsedSec, setElapsedSec] = useState(0)
  const [isWorkoutRunning, setIsWorkoutRunning] = useState(false)
  const [manualTimerMinutes, setManualTimerMinutes] = useState('')

  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [endedAt, setEndedAt] = useState<Date | null>(null)

  const [exerciseSearch, setExerciseSearch] = useState('')
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([])
  const [lastPerformanceByExercise, setLastPerformanceByExercise] = useState<
    Record<string, Record<number, { reps: number | null; weightKg: number | null; rir: number | null }>>
  >({})
  const [editingRestExerciseIndex, setEditingRestExerciseIndex] = useState<number | null>(null)
  const [restDraftSec, setRestDraftSec] = useState('0')

  const [summaryName, setSummaryName] = useState('')
  const [summaryDurationMin, setSummaryDurationMin] = useState('')
  const [summaryNotes, setSummaryNotes] = useState('')
  const [summaryImageFile, setSummaryImageFile] = useState<File | null>(null)
  const [summaryImagePreview, setSummaryImagePreview] = useState<string | null>(null)

  const reloadPlans = useCallback(async (preferredPlanId?: string) => {
    const items = await listWorkoutPlans(authorizedFetch)
    setPlans(items)

    if (preferredPlanId && items.some((plan) => plan.id === preferredPlanId)) {
      setActivePlanId(preferredPlanId)
      return
    }

    if (items[0]) {
      setActivePlanId(items[0].id)
    }
  }, [authorizedFetch])

  useEffect(() => {
    void reloadPlans()
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar rotinas')
      })
      .finally(() => {
        setLoadingPlans(false)
      })
  }, [reloadPlans])

  useEffect(() => {
    if (screen !== 'ACTIVE' || !isWorkoutRunning) {
      return
    }

    const id = window.setInterval(() => {
      setElapsedSec((current) => current + 1)
    }, 1000)

    return () => window.clearInterval(id)
  }, [isWorkoutRunning, screen])

  useEffect(() => {
    if (screen !== 'ACTIVE') {
      return
    }

    const id = window.setInterval(() => {
      setActiveExercises((current) =>
        current.map((exercise) => {
          if (!exercise.restRunning) {
            return exercise
          }

          if (exercise.restRemainingSec <= 1) {
            return {
              ...exercise,
              restRemainingSec: 0,
              restRunning: false,
            }
          }

          return {
            ...exercise,
            restRemainingSec: exercise.restRemainingSec - 1,
          }
        }),
      )
    }, 1000)

    return () => window.clearInterval(id)
  }, [screen])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const query = exerciseSearch.trim()
      if (!query || screen !== 'ACTIVE') {
        setExerciseOptions([])
        return
      }

      void searchExercisesForPlan(authorizedFetch, { q: query, limit: 8 })
        .then((options) => {
          setExerciseOptions(options)
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Erro ao buscar exercicios')
        })
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [authorizedFetch, exerciseSearch, screen])

  useEffect(() => {
    return () => {
      if (summaryImagePreview) {
        URL.revokeObjectURL(summaryImagePreview)
      }
    }
  }, [summaryImagePreview])

  const activeExerciseIdsKey = useMemo(
    () =>
      Array.from(new Set(activeExercises.map((exercise) => exercise.exerciseId)))
        .sort()
        .join(','),
    [activeExercises],
  )

  useEffect(() => {
    if (screen !== 'ACTIVE' || !activeExerciseIdsKey) {
      setLastPerformanceByExercise({})
      return
    }

    let cancelled = false

    const loadLastPerformance = async () => {
      try {
        const exerciseIds = activeExerciseIdsKey.split(',').filter(Boolean)
        const data = await getLatestExercisePerformance(authorizedFetch, exerciseIds)

        if (cancelled) {
          return
        }

        const mapped: Record<string, Record<number, { reps: number | null; weightKg: number | null; rir: number | null }>> = {}
        const latestSetCountByExercise: Record<string, number> = {}

        data.items.forEach((item) => {
          mapped[item.exerciseId] = {}
          latestSetCountByExercise[item.exerciseId] = item.sets.reduce(
            (max, setEntry) => Math.max(max, setEntry.setNumber),
            0,
          )
          item.sets.forEach((setEntry) => {
            const reps = toFiniteNumber(setEntry.reps)
            const weightKg = toFiniteNumber(setEntry.weightKg)
            const rir = toFiniteNumber(setEntry.rir)

            mapped[item.exerciseId][setEntry.setNumber] = {
              reps,
              weightKg,
              rir,
            }
          })
        })

        setLastPerformanceByExercise(mapped)
        setActiveExercises((current) =>
          current.map((exercise) => {
            const latestCount = latestSetCountByExercise[exercise.exerciseId] ?? 0
            if (latestCount <= exercise.sets.length) {
              return exercise
            }

            return {
              ...exercise,
              sets: [
                ...exercise.sets,
                ...Array.from({ length: latestCount - exercise.sets.length }, () => createSet()),
              ],
            }
          }),
        )
      } catch {
        if (!cancelled) {
          setLastPerformanceByExercise({})
        }
      }
    }

    void loadLastPerformance()

    return () => {
      cancelled = true
    }
  }, [activeExerciseIdsKey, authorizedFetch, screen])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-routine-menu]')) {
        setOpenRoutineMenuId(null)
      }
    }

    document.addEventListener('click', handleDocumentClick)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
    }
  }, [])

  useEffect(() => {
    const eventName = getExerciseExplorerSelectionEventName()

    const handler = (event: Event) => {
      if (screen !== 'ACTIVE') {
        return
      }

      const payload = (event as CustomEvent<ExerciseExplorerSelection>).detail
      if (!payload) {
        return
      }

      let added = false
      setActiveExercises((current) => {
        if (current.some((exercise) => exercise.exerciseId === payload.id)) {
          return current
        }

        added = true
        return [
          ...current,
          {
            exerciseId: payload.id,
            exerciseName: payload.name,
            isBodyweight: payload.isBodyweight,
            allowsExtraLoad: payload.allowsExtraLoad,
            suggestedReps: '10',
            restDurationSec: 0,
            restRemainingSec: 0,
            restRunning: false,
            sets: [createSet()],
          },
        ]
      })

      if (!added) {
        setError('Esse exercicio ja foi adicionado no treino ativo.')
      }
    }

    window.addEventListener(eventName, handler)

    return () => {
      window.removeEventListener(eventName, handler)
    }
  }, [screen])

  const totals = useMemo(() => calculateTotals(activeExercises), [activeExercises])

  const resetWorkflow = () => {
    setScreen('DASHBOARD')
    setShowRoutineManager(false)
    setRoutineManagerMode('CREATE')
    setOriginMode('EMPTY')
    setActivePlanName('Treinamento vazio')
    setActiveExercises([])
    setElapsedSec(0)
    setIsWorkoutRunning(false)
    setManualTimerMinutes('')
    setStartedAt(null)
    setEndedAt(null)
    setExerciseSearch('')
    setExerciseOptions([])
    setSummaryName('')
    setSummaryDurationMin('')
    setSummaryNotes('')
    setSummaryImageFile(null)
    if (summaryImagePreview) {
      URL.revokeObjectURL(summaryImagePreview)
    }
    setSummaryImagePreview(null)
  }

  const beginEmptyTraining = () => {
    setError(null)
    setShowRoutineManager(false)
    setRoutineManagerMode('CREATE')
    setOriginMode('EMPTY')
    setActivePlanName('Treinamento vazio')
    setActiveExercises([])
    setElapsedSec(0)
    setIsWorkoutRunning(true)
    setStartedAt(new Date())
    setEndedAt(null)
    setScreen('ACTIVE')
  }

  const beginRoutineTraining = (plan: WorkoutPlan) => {
    setError(null)
    setShowRoutineManager(false)
    setRoutineManagerMode('CREATE')
    setOriginMode('ROUTINE')
    setActivePlanId(plan.id)
    setActivePlanName(plan.name)
    setActiveExercises(mapPlanToActiveExercises(plan))
    setElapsedSec(0)
    setIsWorkoutRunning(true)
    setStartedAt(new Date())
    setEndedAt(null)
    setScreen('ACTIVE')
  }

  const finalizeTraining = () => {
    const end = new Date()
    setEndedAt(end)
    setIsWorkoutRunning(false)

    setSummaryName(activePlanName)
    setSummaryDurationMin(String(Math.max(1, Math.round(elapsedSec / 60))))
    setScreen('SUMMARY')
  }

  const toggleRestTimer = (exerciseIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) =>
        idx === exerciseIndex
          ? exercise.restDurationSec <= 0
            ? exercise
            : { ...exercise, restRunning: !exercise.restRunning }
          : exercise,
      ),
    )
  }

  const startRestEdit = (exerciseIndex: number) => {
    const target = activeExercises[exerciseIndex]
    if (!target) {
      return
    }

    setEditingRestExerciseIndex(exerciseIndex)
    setRestDraftSec(String(target.restDurationSec))
  }

  const applyRestEdit = async (exerciseIndex: number) => {
    const parsed = Number(restDraftSec)
    const isInt = Number.isInteger(parsed)
    const isZero = parsed === 0
    const inRange = parsed >= 10 && parsed <= 300

    if (!isInt || (!isZero && !inRange)) {
      setError('Descanso deve ser 0 ou um valor entre 10 e 300 segundos.')
      return
    }

    setError(null)

    const target = activeExercises[exerciseIndex]
    if (!target) {
      setEditingRestExerciseIndex(null)
      return
    }

    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) {
          return exercise
        }

        return {
          ...exercise,
          restDurationSec: parsed,
          restRemainingSec: parsed,
          restRunning: false,
        }
      }),
    )
    setEditingRestExerciseIndex(null)

    if (originMode !== 'ROUTINE' || !activePlanId || !target.planExerciseId) {
      return
    }

    try {
      await updatePlanExercise(authorizedFetch, activePlanId, target.planExerciseId, {
        restSec: parsed === 0 ? null : parsed,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar descanso na rotina')
    }
  }

  const patchSet = (
    exerciseIndex: number,
    setIndex: number,
    patch: Partial<ExerciseSetInput>,
  ) => {
    setActiveExercises((current) =>
      current.map((exercise, eIdx) => {
        if (eIdx !== exerciseIndex) {
          return exercise
        }

        return {
          ...exercise,
          sets: exercise.sets.map((setInput, sIdx) =>
            sIdx === setIndex ? { ...setInput, ...patch } : setInput,
          ),
        }
      }),
    )
  }

  const addSet = (exerciseIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) =>
        idx === exerciseIndex ? { ...exercise, sets: [...exercise.sets, createSet()] } : exercise,
      ),
    )
  }

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) {
          return exercise
        }

        const next = exercise.sets.filter((_, sIdx) => sIdx !== setIndex)
        return { ...exercise, sets: next.length > 0 ? next : [createSet()] }
      }),
    )
  }

  const addExerciseToActive = (option: ExerciseOption) => {
    setActiveExercises((current) => {
      if (current.some((exercise) => exercise.exerciseId === option.id)) {
        return current
      }

      return [
        ...current,
        {
          exerciseId: option.id,
          exerciseName: option.name,
          isBodyweight: option.isBodyweight,
          allowsExtraLoad: option.allowsExtraLoad,
          suggestedReps: '10',
          restDurationSec: 0,
          restRemainingSec: 0,
          restRunning: false,
          sets: [createSet()],
        },
      ]
    })

    setExerciseSearch('')
    setExerciseOptions([])
  }

  const handleSummaryImage = (file: File | null) => {
    setSummaryImageFile(file)

    if (summaryImagePreview) {
      URL.revokeObjectURL(summaryImagePreview)
      setSummaryImagePreview(null)
    }

    if (file) {
      setSummaryImagePreview(URL.createObjectURL(file))
    }
  }

  const applyManualTimerEdit = () => {
    const minutes = parsePositiveInt(manualTimerMinutes, 0)
    if (minutes <= 0) {
      return
    }

    setElapsedSec(minutes * 60)
    setManualTimerMinutes('')
  }

  const saveTraining = async () => {
    if (saving) {
      return
    }

    const durationMin = parsePositiveInt(summaryDurationMin, Math.max(1, Math.round(elapsedSec / 60)))
    const durationSec = Math.max(60, durationMin * 60)

    const performedSets = activeExercises.flatMap((exercise) =>
      exercise.sets.reduce<
        Array<{
          exerciseId: string
          setNumber: number
          reps: number
          weightKg?: number
          notes?: string
        }>
      >((acc, setInput, index) => {
        const setNumber = index + 1
        const lastSet = lastPerformanceByExercise[exercise.exerciseId]?.[setNumber]

        const repsRaw = setInput.reps.trim()
        const weightRaw = setInput.weightKg.trim().replace(',', '.')
        const rirRaw = setInput.rir.trim()

        const hasAnyInput = repsRaw.length > 0 || weightRaw.length > 0 || rirRaw.length > 0
        if (!hasAnyInput) {
          return acc
        }

        const repsFallback =
          lastSet?.reps ??
          (exercise.suggestedReps.trim().length > 0 ? Number(exercise.suggestedReps) : NaN)
        const reps = repsRaw.length > 0 ? Number(repsRaw) : repsFallback

        if (!Number.isFinite(reps) || reps <= 0) {
          return acc
        }

        const weightKg = weightRaw.length > 0 ? Number(weightRaw) : NaN
        const rir = rirRaw.length > 0 ? Number(rirRaw) : NaN

        acc.push({
          exerciseId: exercise.exerciseId,
          setNumber,
          reps,
          weightKg: Number.isFinite(weightKg) && weightKg > 0 ? weightKg : undefined,
          notes: Number.isFinite(rir) && rir >= 0 ? `RIR: ${Math.floor(rir)}` : undefined,
        })

        return acc
      }, []),
    )

    try {
      setSaving(true)
      setError(null)

      const started = await startWorkoutSession(authorizedFetch, {
        workoutPlanId: originMode === 'ROUTINE' ? activePlanId : undefined,
      })

      const notesSegments = [summaryNotes.trim()].filter(Boolean)
      if (summaryImageFile) {
        notesSegments.push(`[Imagem anexada localmente: ${summaryImageFile.name}]`)
      }

      await completeWorkoutSession(authorizedFetch, started.id, {
        durationSec,
        notes: notesSegments.join('\n\n') || undefined,
        exercises: performedSets.length > 0 ? performedSets : undefined,
      })

      window.alert('Treino salvo com sucesso no historico.')
      resetWorkflow()

      await reloadPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar treino')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRoutine = async (plan: WorkoutPlan) => {
    const confirmed = window.confirm(`Deseja excluir a rotina "${plan.name}"?`)
    if (!confirmed) {
      return
    }

    try {
      setError(null)
      await deleteWorkoutPlan(authorizedFetch, plan.id)
      await reloadPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir rotina')
    }
  }

  const handleShareRoutine = async (plan: WorkoutPlan) => {
    const lines = [
      `Rotina: ${plan.name}`,
      plan.description ? `Descricao: ${plan.description}` : 'Descricao: Sem descricao',
      'Exercicios:',
      ...plan.exercises.map((item, index) => {
        const exerciseName = item.customName ?? item.exercise.name
        const sets = item.sets ?? 0
        const repsMin = item.repsMin ?? 0
        const repsMax = item.repsMax ?? repsMin
        return `${index + 1}. ${exerciseName} - ${sets}x ${repsMin}-${repsMax}`
      }),
    ]

    const shareText = lines.join('\n')

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText)
        window.alert('Resumo da rotina copiado para a area de transferencia.')
      } else {
        window.alert(shareText)
      }
    } catch {
      window.alert(shareText)
    }
  }

  const handleDuplicateRoutine = async (plan: WorkoutPlan) => {
    try {
      setError(null)

      const created = await createWorkoutPlan(authorizedFetch, {
        name: `${plan.name} (copia)`,
        description: plan.description ?? undefined,
        source: 'CUSTOM',
      })

      for (let index = 0; index < plan.exercises.length; index += 1) {
        const item = plan.exercises[index]

        await addExerciseToPlan(authorizedFetch, created.id, {
          exerciseId: item.exercise.id,
          insertAt: index + 1,
          sets: item.sets ?? undefined,
          repsMin: item.repsMin ?? undefined,
          repsMax: item.repsMax ?? undefined,
          durationSec: item.durationSec ?? undefined,
          restSec: item.restSec ?? undefined,
          notes: item.notes ?? undefined,
        })
      }

      await reloadPlans(created.id)
      window.alert('Rotina duplicada com sucesso.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao duplicar rotina')
    }
  }

  if (screen === 'SUMMARY') {
    return (
      <section className="space-y-4">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <h1 className="text-2xl font-black text-[var(--text)]">Resumo do treino</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Revise e ajuste os dados antes de salvar.</p>
        </motion.header>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-4">
          <label className="block text-sm font-semibold text-[var(--text)]">
            Nome do treino
            <input
              value={summaryName}
              onChange={(event) => setSummaryName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-[var(--text)]">
              Duracao total (minutos)
              <input
                value={summaryDurationMin}
                onChange={(event) => setSummaryDurationMin(event.target.value.replace(/[^\d]/g, ''))}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <div className="rounded-xl border border-[var(--line)] p-3 text-sm text-[var(--muted)]">
              <p>Inicio: {formatDateTime(startedAt)}</p>
              <p className="mt-1">Termino: {formatDateTime(endedAt)}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Volume total</p>
              <p className="mt-1 text-2xl font-black text-[var(--text)]">{totals.totalVolumeKg} kg</p>
            </div>
            <div className="rounded-xl border border-[var(--line)] p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Series realizadas</p>
              <p className="mt-1 text-2xl font-black text-[var(--text)]">{totals.totalSeries}</p>
            </div>
          </div>

          <label className="block text-sm font-semibold text-[var(--text)]">
            Upload de imagem
            <input
              type="file"
              accept="image/*"
              onChange={(event) => handleSummaryImage(event.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
          </label>

          {summaryImagePreview ? (
            <img
              src={summaryImagePreview}
              alt="Preview do treino"
              className="max-h-52 w-full rounded-xl object-cover border border-[var(--line)]"
            />
          ) : null}

          <label className="block text-sm font-semibold text-[var(--text)]">
            Anotacoes do treino
            <textarea
              value={summaryNotes}
              onChange={(event) => setSummaryNotes(event.target.value)}
              rows={4}
              placeholder="Como foi o treino hoje?"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveTraining()}
              disabled={saving}
              className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? 'Salvando...' : 'Salvar Treino'}
            </button>
            <button
              type="button"
              onClick={resetWorkflow}
              className="rounded-xl border border-red-500/60 px-5 py-2 text-sm font-bold text-red-300"
            >
              Descartar Treinamento
            </button>
          </div>
        </article>
      </section>
    )
  }

  if (screen === 'ACTIVE') {
    return (
      <section className="space-y-4">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-[var(--text)]">Treino ativo: {activePlanName}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Cronometro geral e descanso por exercicio.</p>
            </div>
            <p className="text-3xl font-black text-[var(--text)]">{formatClock(elapsedSec)}</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsWorkoutRunning((prev) => !prev)}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              {isWorkoutRunning ? 'Pausar cronometro' : 'Retomar cronometro'}
            </button>

            <input
              value={manualTimerMinutes}
              onChange={(event) => setManualTimerMinutes(event.target.value.replace(/[^\d]/g, ''))}
              placeholder="min"
              className="w-20 rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={applyManualTimerEdit}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Editar tempo
            </button>
            <button
              type="button"
              onClick={finalizeTraining}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"
            >
              Finalizar Treino
            </button>
          </div>
        </motion.header>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="text-lg font-extrabold text-[var(--text)]">Adicionar exercicio</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={exerciseSearch}
              onChange={(event) => setExerciseSearch(event.target.value)}
              placeholder="Buscar exercicio"
              className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                openExerciseExplorer({
                  initialQuery: exerciseSearch.trim() || undefined,
                  context: 'ACTIVE_WORKOUT',
                })
              }}
              className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Explorar Exercicios
            </button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {exerciseOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => addExerciseToActive(option)}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-left text-sm text-[var(--text)]"
              >
                {option.name}
              </button>
            ))}
          </div>
        </article>

        <article className="space-y-3">
          {activeExercises.length === 0 ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
              Nenhum exercicio adicionado ainda.
            </p>
          ) : null}

          {activeExercises.map((exercise, exerciseIndex) => {
            const showLoadInput = !exercise.isBodyweight || exercise.allowsExtraLoad

            return (
              <div key={`${exercise.exerciseId}-${exerciseIndex}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-[var(--text)]">{exercise.exerciseName}</h3>
                <div className="flex items-center gap-2">
                  {editingRestExerciseIndex === exerciseIndex ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={restDraftSec}
                        onChange={(event) => setRestDraftSec(event.target.value)}
                        className="w-32 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-xs text-[var(--text)]"
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
                        onClick={() => void applyRestEdit(exerciseIndex)}
                        className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
                      >
                        Salvar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startRestEdit(exerciseIndex)}
                      className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)]"
                    >
                      Descanso {formatClock(exercise.restDurationSec)}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleRestTimer(exerciseIndex)}
                    disabled={exercise.restDurationSec <= 0}
                    className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
                  >
                    {exercise.restRunning ? 'Pausar descanso' : 'Iniciar descanso'}
                  </button>
                </div>
              </div>

              <p className="mt-1 text-sm text-[var(--muted)]">
                Descanso atual: {formatClock(exercise.restRemainingSec)} (toque em "Descanso" para editar)
              </p>

              <div className="mt-3 space-y-2">
                {exercise.sets.map((setInput, setIndex) => (
                  (() => {
                    const lastSet = lastPerformanceByExercise[exercise.exerciseId]?.[setIndex + 1]
                    const weightPlaceholder =
                      lastSet?.weightKg != null
                        ? `${lastSet.weightKg} kg`
                        : 'kg'
                    const repsPlaceholder =
                      lastSet?.reps != null
                        ? String(lastSet.reps)
                        : exercise.suggestedReps || 'reps'
                    const rirPlaceholder =
                      lastSet?.rir != null
                        ? String(lastSet.rir)
                        : 'rir'

                    return (
                  <div
                    key={`${exercise.exerciseId}-${setIndex}`}
                    className={`grid gap-2 rounded-xl border border-[var(--line)] p-3 ${
                      showLoadInput
                        ? 'sm:grid-cols-[50px_1fr_1fr_1fr_auto]'
                        : 'sm:grid-cols-[50px_1fr_1fr_auto]'
                    }`}
                  >
                    <p className="self-center text-xs font-bold text-[var(--muted)]">Serie {setIndex + 1}</p>
                    {showLoadInput ? (
                      <label className="text-[11px] uppercase text-[var(--muted)]">
                        Peso (kg)
                        <input
                          value={setInput.weightKg}
                          placeholder={weightPlaceholder}
                          onChange={(event) =>
                            patchSet(exerciseIndex, setIndex, {
                              weightKg: event.target.value.replace(/[^\d.]/g, ''),
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                        />
                      </label>
                    ) : null}
                    <label className="text-[11px] uppercase text-[var(--muted)]">
                      Repeticoes
                      <input
                        value={setInput.reps}
                        placeholder={repsPlaceholder}
                        onChange={(event) =>
                          patchSet(exerciseIndex, setIndex, {
                            reps: event.target.value.replace(/[^\d]/g, ''),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-[11px] uppercase text-[var(--muted)]">
                      RIR
                      <input
                        value={setInput.rir}
                        placeholder={rirPlaceholder}
                        onChange={(event) =>
                          patchSet(exerciseIndex, setIndex, {
                            rir: event.target.value.replace(/[^\d]/g, ''),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeSet(exerciseIndex, setIndex)}
                      className="self-end rounded-lg border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-300"
                    >
                      Remover
                    </button>
                  </div>
                    )
                  })()
                ))}

                <button
                  type="button"
                  onClick={() => addSet(exerciseIndex)}
                  className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                >
                  Adicionar serie
                </button>
              </div>
              </div>
            )
          })}
        </article>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <h1 className="text-2xl font-black text-[var(--text)]">Treinos</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Inicie rapido, escolha uma rotina ou monte seu treino na hora.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={beginEmptyTraining}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"
          >
            Iniciar Treinamento Vazio
          </button>
          <button
            type="button"
            onClick={() => {
              setRoutineManagerMode('CREATE')
              setShowRoutineManager(true)
              requestAnimationFrame(() => {
                const section = document.getElementById('treinar-rotinas-section')
                section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              })
            }}
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-center text-sm font-semibold text-[var(--text)]"
          >
            Nova Rotina
          </button>
          <button
            type="button"
            onClick={() => {
              openExerciseExplorer({
                context: showRoutineManager ? 'ROUTINE_EDIT' : undefined,
              })
            }}
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-center text-sm font-semibold text-[var(--text)]"
          >
            Explorar Exercicios
          </button>
        </div>
      </motion.header>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-[var(--text)]">Minhas Rotinas</h2>
          <span className="text-sm text-[var(--muted)]">{plans.length}</span>
        </div>

        {loadingPlans ? <p className="text-sm text-[var(--muted)]">Carregando rotinas...</p> : null}

        {!loadingPlans && plans.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Voce ainda nao possui rotinas salvas.</p>
        ) : null}

        <div className="space-y-3">
          {plans.map((plan) => (
            <div key={plan.id} className="relative rounded-xl border border-[var(--line)] p-3">
              <div data-routine-menu className="absolute right-3 top-3">
                <button
                  type="button"
                  aria-label={`Mais opcoes da rotina ${plan.name}`}
                  aria-expanded={openRoutineMenuId === plan.id}
                  onClick={() => {
                    setOpenRoutineMenuId((current) => (current === plan.id ? null : plan.id))
                  }}
                  className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-bold text-[var(--muted)]"
                >
                  ...
                </button>

                {openRoutineMenuId === plan.id ? (
                  <div className="absolute right-0 top-8 z-20 min-w-48 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenRoutineMenuId(null)
                        void handleDeleteRoutine(plan)
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-400 hover:bg-[var(--surface-hover)]"
                    >
                      Deletar rotina
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenRoutineMenuId(null)
                        void handleShareRoutine(plan)
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                    >
                      Compartilhar rotina
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenRoutineMenuId(null)
                        void handleDuplicateRoutine(plan)
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                    >
                      Duplicar rotina
                    </button>
                  </div>
                ) : null}
              </div>

              <h3 className="text-lg font-bold text-[var(--text)]">{plan.name}</h3>
              <p className="mt-1 text-sm text-[var(--muted)] line-clamp-2">
                {plan.description || 'Rotina personalizada para seus objetivos.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => beginRoutineTraining(plan)}
                  className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"
                >
                  Iniciar Rotina
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePlanId(plan.id)
                    setRoutineManagerMode('EDIT')
                    setShowRoutineManager(true)
                    requestAnimationFrame(() => {
                      const section = document.getElementById('treinar-rotinas-section')
                      section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    })
                  }}
                  className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
                >
                  Editar Rotina
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>

      {showRoutineManager ? (
        <section id="treinar-rotinas-section" className="space-y-2">
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-extrabold text-[var(--text)]">
                  {routineManagerMode === 'EDIT' ? 'Editando rotina selecionada' : 'Criar e gerenciar rotinas'}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {routineManagerMode === 'EDIT'
                    ? 'Apenas a rotina escolhida esta visivel para edicao.'
                    : 'Esta area aparece somente quando voce abre "Nova Rotina".'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRoutineManager(false)
                  setRoutineManagerMode('CREATE')
                }}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
              >
                Fechar
              </button>
            </div>
          </article>
          <WorkoutsPage
            selectedPlanId={activePlanId}
            onlySelectedPlan={routineManagerMode === 'EDIT'}
            showCreateSection={routineManagerMode !== 'EDIT'}
            onPlanSaved={() => {
              setShowRoutineManager(false)
              setRoutineManagerMode('CREATE')
            }}
          />
        </section>
      ) : null}
    </section>
  )
}
