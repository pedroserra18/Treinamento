import { useEffect, useState } from 'react'

import { motion } from 'framer-motion'

import { useAuth } from '../hooks/useAuth'
import {
  completeWorkoutSession,
  listWorkoutPlans,
  searchExercisesForPlan,
  startWorkoutSession,
  updatePlanExercise,
} from '../services/workoutService'
import type { ExerciseOption, WorkoutPlan } from '../types/workout'

const PERF_MARKER = '__PERF__:'
const LOCAL_SESSION_KEY = 'acad-workout-active-session-v1'

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

type SeriesState = {
  reps: string
  loadKg: string
  rir: string
}

type SessionExerciseState = {
  exerciseId: string
  exerciseName: string
  planExerciseId?: string
  plannedReps: string
  isBodyweight: boolean
  allowsExtraLoad: boolean
  useExtraLoad: boolean
  series: SeriesState[]
}

type ActiveWorkoutState = {
  mode: 'SAVED' | 'LIVE'
  activePlanId: string
  activeSessionId: string | null
  isTimerRunning: boolean
  elapsedSnapshotSec: number
  startedAtEpochMs: number | null
  exercises: SessionExerciseState[]
  updateTemplateOnFinish: boolean
}

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

function createSeries(initial?: Partial<SeriesState>): SeriesState {
  return {
    reps: initial?.reps ?? '',
    loadKg: initial?.loadKg ?? '',
    rir: initial?.rir ?? '',
  }
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  return `${hh}:${mm}:${ss}`
}

function parseSeriesFromNotes(notes: string | null, fallbackSets: number | null, fallbackReps: number | null): SeriesState[] {
  if (!notes || !notes.includes(PERF_MARKER)) {
    const totalSets = Math.max(1, fallbackSets ?? 1)
    const reps = String(fallbackReps ?? 8)
    return Array.from({ length: totalSets }, () => createSeries({ reps }))
  }

  const markerIndex = notes.indexOf(PERF_MARKER)
  const raw = notes.slice(markerIndex + PERF_MARKER.length).trim()

  try {
    const parsed = JSON.parse(raw) as {
      series?: Array<{ reps?: number; loadKg?: number; rir?: number }>
      sets?: number
      reps?: number
    }

    if (Array.isArray(parsed.series) && parsed.series.length > 0) {
      return parsed.series.map((series) =>
        createSeries({
          reps: series.reps != null ? String(series.reps) : '',
          loadKg: series.loadKg != null ? String(series.loadKg) : '',
          rir: series.rir != null ? String(series.rir) : '',
        }),
      )
    }

    const totalSets = Math.max(1, Number(parsed.sets ?? fallbackSets ?? 1))
    const reps = String(parsed.reps ?? fallbackReps ?? 8)
    return Array.from({ length: totalSets }, () => createSeries({ reps }))
  } catch {
    const totalSets = Math.max(1, fallbackSets ?? 1)
    const reps = String(fallbackReps ?? 8)
    return Array.from({ length: totalSets }, () => createSeries({ reps }))
  }
}

function buildTemplateNotes(existing: string | null, series: SeriesState[]): string {
  const base = (existing ?? '').split(PERF_MARKER)[0].trim()
  const payload = {
    sets: series.length,
    reps: Number(series[0]?.reps ?? 0) || undefined,
    series: series
      .filter((entry) => Number(entry.reps) > 0)
      .map((entry) => ({
        reps: Number(entry.reps),
        loadKg: Number(entry.loadKg) > 0 ? Number(entry.loadKg) : undefined,
        rir: Number(entry.rir) >= 0 ? Number(entry.rir) : undefined,
      })),
  }

  return `${base}${base ? ' ' : ''}${PERF_MARKER}${JSON.stringify(payload)}`.trim()
}

function createDefaultState(): ActiveWorkoutState {
  return {
    mode: 'SAVED',
    activePlanId: '',
    activeSessionId: null,
    isTimerRunning: false,
    elapsedSnapshotSec: 0,
    startedAtEpochMs: null,
    exercises: [],
    updateTemplateOnFinish: false,
  }
}

export function TrainPage() {
  const { authorizedFetch } = useAuth()

  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [state, setState] = useState<ActiveWorkoutState>(() => {
    try {
      const cached = localStorage.getItem(LOCAL_SESSION_KEY)
      if (!cached) {
        return createDefaultState()
      }

      const parsed = JSON.parse(cached) as ActiveWorkoutState
      return {
        ...createDefaultState(),
        ...parsed,
      }
    } catch {
      return createDefaultState()
    }
  })

  const [elapsedSec, setElapsedSec] = useState(0)
  const [manualFinishMinutes, setManualFinishMinutes] = useState('')

  const [quickSearch, setQuickSearch] = useState('')
  const [quickOptions, setQuickOptions] = useState<ExerciseOption[]>([])

  const [loadingPlans, setLoadingPlans] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void listWorkoutPlans(authorizedFetch)
      .then((items) => {
        setPlans(items)
        setState((current) => {
          if (current.activePlanId || !items[0]) {
            return current
          }

          return {
            ...current,
            activePlanId: items[0].id,
          }
        })
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar treinos salvos')
      })
      .finally(() => {
        setLoadingPlans(false)
      })
  }, [authorizedFetch])

  useEffect(() => {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    const computeElapsed = () => {
      if (!state.activeSessionId) {
        setElapsedSec(0)
        return
      }

      if (!state.isTimerRunning || !state.startedAtEpochMs) {
        setElapsedSec(state.elapsedSnapshotSec)
        return
      }

      const runningSec = Math.max(0, Math.floor((Date.now() - state.startedAtEpochMs) / 1000))
      setElapsedSec(state.elapsedSnapshotSec + runningSec)
    }

    computeElapsed()
    const id = window.setInterval(computeElapsed, 1000)

    return () => window.clearInterval(id)
  }, [state.activeSessionId, state.elapsedSnapshotSec, state.isTimerRunning, state.startedAtEpochMs])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const query = quickSearch.trim()
      if (!query) {
        setQuickOptions([])
        return
      }

      void searchExercisesForPlan(authorizedFetch, { q: query, limit: 10 })
        .then((options) => {
          setQuickOptions(options)
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Erro ao buscar exercicios')
        })
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [authorizedFetch, quickSearch])

  const loadExercisesForPlan = (plan: WorkoutPlan): SessionExerciseState[] => {
    return plan.exercises.map((entry) => {
      const plannedReps =
        entry.repsMin && entry.repsMax ? `${entry.repsMin}-${entry.repsMax}` : String(entry.repsMax ?? entry.repsMin ?? 8)

      return {
        exerciseId: entry.exercise.id,
        exerciseName: entry.customName ?? entry.exercise.name,
        planExerciseId: entry.id,
        plannedReps,
        isBodyweight: resolveBodyweightFlag(entry.exercise.isBodyweight, entry.customName ?? entry.exercise.name),
        allowsExtraLoad: resolveAllowsExtraLoad(
          entry.exercise.allowsExtraLoad,
          resolveBodyweightFlag(entry.exercise.isBodyweight, entry.customName ?? entry.exercise.name),
        ),
        useExtraLoad: resolveBodyweightFlag(entry.exercise.isBodyweight, entry.customName ?? entry.exercise.name)
          ? parseSeriesFromNotes(entry.notes, entry.sets, entry.repsMax ?? entry.repsMin).some((series) => Number(series.loadKg) > 0)
          : true,
        series: parseSeriesFromNotes(entry.notes, entry.sets, entry.repsMax ?? entry.repsMin),
      }
    })
  }

  const startSession = async () => {
    if (state.activeSessionId) {
      return
    }

    if (state.mode === 'SAVED' && !state.activePlanId) {
      setError('Selecione um treino salvo para iniciar.')
      return
    }

    if (state.mode === 'LIVE' && state.exercises.length === 0) {
      setError('Adicione pelo menos um exercicio para treinar no modo ao vivo.')
      return
    }

    try {
      const session = await startWorkoutSession(authorizedFetch, {
        workoutPlanId: state.mode === 'SAVED' ? state.activePlanId : undefined,
      })

      setState((current) => {
        const selectedPlan = plans.find((plan) => plan.id === current.activePlanId)
        const exercises =
          current.mode === 'SAVED' && selectedPlan ? loadExercisesForPlan(selectedPlan) : current.exercises

        return {
          ...current,
          activeSessionId: session.id,
          isTimerRunning: true,
          elapsedSnapshotSec: 0,
          startedAtEpochMs: Date.now(),
          exercises,
        }
      })
      setManualFinishMinutes('')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar sessao de treino')
    }
  }

  const togglePause = () => {
    setState((current) => {
      if (!current.activeSessionId) {
        return current
      }

      if (current.isTimerRunning && current.startedAtEpochMs) {
        const runningSec = Math.max(0, Math.floor((Date.now() - current.startedAtEpochMs) / 1000))
        return {
          ...current,
          isTimerRunning: false,
          elapsedSnapshotSec: current.elapsedSnapshotSec + runningSec,
          startedAtEpochMs: null,
        }
      }

      return {
        ...current,
        isTimerRunning: true,
        startedAtEpochMs: Date.now(),
      }
    })
  }

  const patchSeries = (exerciseIndex: number, seriesIndex: number, patch: Partial<SeriesState>) => {
    setState((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, idx) => {
        if (idx !== exerciseIndex) {
          return exercise
        }

        return {
          ...exercise,
          series: exercise.series.map((series, sIdx) => (sIdx === seriesIndex ? { ...series, ...patch } : series)),
        }
      }),
    }))
  }

  const addSeries = (exerciseIndex: number) => {
    setState((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, idx) =>
        idx === exerciseIndex ? { ...exercise, series: [...exercise.series, createSeries()] } : exercise,
      ),
    }))
  }

  const removeSeries = (exerciseIndex: number, seriesIndex: number) => {
    setState((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, idx) => {
        if (idx !== exerciseIndex) {
          return exercise
        }

        const next = exercise.series.filter((_, sIdx) => sIdx !== seriesIndex)
        return {
          ...exercise,
          series: next.length > 0 ? next : [createSeries()],
        }
      }),
    }))
  }

  const addLiveExercise = (option: ExerciseOption) => {
    setState((current) => {
      const already = current.exercises.some((entry) => entry.exerciseId === option.id)
      if (already) {
        window.alert('Este exercicio ja esta na sessao atual.')
        return current
      }

      return {
        ...current,
        exercises: [
          ...current.exercises,
          {
            exerciseId: option.id,
            exerciseName: option.name,
            plannedReps: '-',
            isBodyweight: resolveBodyweightFlag(option.isBodyweight, option.name),
            allowsExtraLoad: resolveAllowsExtraLoad(
              option.allowsExtraLoad,
              resolveBodyweightFlag(option.isBodyweight, option.name),
            ),
            useExtraLoad: !resolveBodyweightFlag(option.isBodyweight, option.name),
            series: [createSeries({ reps: '10' })],
          },
        ],
      }
    })
  }

  const removeExercise = (exerciseIndex: number) => {
    setState((current) => ({
      ...current,
      exercises: current.exercises.filter((_, idx) => idx !== exerciseIndex),
    }))
  }

  const finishSession = async () => {
    if (!state.activeSessionId) {
      setError('Nenhuma sessao ativa para finalizar.')
      return
    }

    const manualSeconds = Number(manualFinishMinutes) > 0 ? Math.floor(Number(manualFinishMinutes) * 60) : 0

    const runningSec =
      state.isTimerRunning && state.startedAtEpochMs
        ? Math.max(0, Math.floor((Date.now() - state.startedAtEpochMs) / 1000))
        : 0

    const durationSec = Math.max(manualSeconds || state.elapsedSnapshotSec + runningSec, 60)

    const payloadSets = state.exercises.flatMap((exercise) =>
      exercise.series
        .filter((series) => Number(series.reps) > 0)
        .map((series, index) => {
          const reps = Math.max(1, Number(series.reps))
          const rir = Number(series.rir)
          const perceivedExertion = Number.isFinite(rir) ? Math.max(1, Math.min(10, 10 - rir)) : undefined

          return {
            exerciseId: exercise.exerciseId,
            setNumber: index + 1,
            reps,
            weightKg:
              !exercise.isBodyweight || exercise.useExtraLoad
                ? Number(series.loadKg) > 0
                  ? Number(series.loadKg)
                  : undefined
                : undefined,
            perceivedExertion,
            notes: Number.isFinite(rir) ? `RIR: ${rir}` : undefined,
          }
        }),
    )

    if (payloadSets.length === 0) {
      setError('Registre ao menos uma serie com repeticoes validas antes de finalizar.')
      return
    }

    try {
      await completeWorkoutSession(authorizedFetch, state.activeSessionId, {
        durationSec,
        exercises: payloadSets,
      })

      if (state.updateTemplateOnFinish && state.mode === 'SAVED' && state.activePlanId) {
        const selectedPlan = plans.find((plan) => plan.id === state.activePlanId)
        if (selectedPlan) {
          await Promise.all(
            state.exercises
              .filter((exercise) => exercise.planExerciseId)
              .map(async (exercise) => {
                const validSeries = exercise.series.filter((entry) => Number(entry.reps) > 0)
                if (!exercise.planExerciseId || validSeries.length === 0) {
                  return
                }

                const repsList = validSeries.map((entry) => Math.max(1, Number(entry.reps)))
                const currentPlanExercise = selectedPlan.exercises.find((entry) => entry.id === exercise.planExerciseId)

                await updatePlanExercise(authorizedFetch, state.activePlanId, exercise.planExerciseId, {
                  sets: validSeries.length,
                  repsMin: Math.min(...repsList),
                  repsMax: Math.max(...repsList),
                  notes: buildTemplateNotes(
                    currentPlanExercise?.notes ?? null,
                    exercise.isBodyweight && !exercise.useExtraLoad
                      ? validSeries.map((entry) => ({ ...entry, loadKg: '' }))
                      : validSeries,
                  ),
                })
              }),
          )
        }
      }

      setState((current) => ({
        ...current,
        activeSessionId: null,
        isTimerRunning: false,
        elapsedSnapshotSec: 0,
        startedAtEpochMs: null,
        exercises: current.mode === 'LIVE' ? [] : current.exercises,
        updateTemplateOnFinish: false,
      }))
      localStorage.removeItem(LOCAL_SESSION_KEY)
      setManualFinishMinutes('')
      setError(null)
      window.alert('Treino finalizado e registrado no historico de atividade.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar sessao de treino')
    }
  }

  return (
    <section className="space-y-4">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[linear-gradient(135deg,rgba(18,18,20,0.96),rgba(30,30,34,0.88))] p-5 shadow-[0_0_35px_rgba(255,69,0,0.12)]"
      >
        <h1 className="text-2xl font-black uppercase tracking-[0.06em] text-[var(--text)]">Execucao de treino</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Selecione um treino salvo ou monte na hora, acompanhe o cronometro e finalize com log completo de performance.
        </p>
      </motion.header>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 p-4 shadow-[0_15px_45px_rgba(0,0,0,0.32)]">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-lg px-3 py-1 text-xs font-bold ${
              state.mode === 'SAVED' ? 'bg-[var(--brand)] text-black' : 'border border-[var(--line)] text-[var(--text)]'
            }`}
            onClick={() => {
              if (!state.activeSessionId) {
                setState((current) => ({ ...current, mode: 'SAVED' }))
              }
            }}
          >
            Treino salvo
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1 text-xs font-bold ${
              state.mode === 'LIVE' ? 'bg-[var(--brand)] text-black' : 'border border-[var(--line)] text-[var(--text)]'
            }`}
            onClick={() => {
              if (!state.activeSessionId) {
                setState((current) => ({ ...current, mode: 'LIVE' }))
              }
            }}
          >
            Montar na hora
          </button>
        </div>

        {state.mode === 'SAVED' ? (
          <div className="mt-3">
            <label className="text-sm text-[var(--text)]">
              Treino ativo
              <select
                value={state.activePlanId}
                disabled={state.activeSessionId !== null || loadingPlans}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    activePlanId: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <input
              value={quickSearch}
              onChange={(event) => setQuickSearch(event.target.value)}
              placeholder="Buscar exercicio para incluir na sessao"
              className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {quickOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="rounded-lg border border-[var(--line)] px-3 py-2 text-left text-sm text-[var(--text)] transition hover:border-[var(--brand)]"
                  onClick={() => addLiveExercise(option)}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-bold text-black transition hover:brightness-110"
            onClick={() => {
              void startSession()
            }}
            disabled={state.activeSessionId !== null}
          >
            Iniciar sessao
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            onClick={togglePause}
            disabled={state.activeSessionId === null}
          >
            {state.isTimerRunning ? 'Pausar' : 'Retomar'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-emerald-500/60 px-3 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10"
            onClick={() => {
              void finishSession()
            }}
            disabled={state.activeSessionId === null}
          >
            Terminar treino
          </button>
        </div>
      </article>

      <article className="sticky top-3 z-10 rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">Cronometro</p>
          <p className="text-3xl font-black text-[var(--text)]">{formatClock(elapsedSec)}</p>
        </div>
        <div className="mt-2 max-w-xs">
          <label className="text-xs font-semibold text-[var(--muted)]">
            Ajuste manual ao finalizar (minutos)
            <input
              value={manualFinishMinutes}
              onChange={(event) => setManualFinishMinutes(event.target.value.replace(/[^\d]/g, ''))}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
            />
          </label>
        </div>
      </article>

      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 p-4 shadow-[0_15px_45px_rgba(0,0,0,0.32)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-[var(--text)]">Modo de treino</h2>
          {state.mode === 'SAVED' && state.activeSessionId ? (
            <label className="text-xs font-semibold text-[var(--muted)]">
              <input
                type="checkbox"
                checked={state.updateTemplateOnFinish}
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    updateTemplateOnFinish: event.target.checked,
                  }))
                }
                className="mr-2"
              />
              Atualizar template com dados executados ao finalizar
            </label>
          ) : null}
        </div>

        <div className="mt-3 space-y-3">
          {state.exercises.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nenhum exercicio na sessao ativa.</p>
          ) : null}

          {state.exercises.map((exercise, exerciseIndex) => (
            <div key={`${exercise.exerciseId}-${exerciseIndex}`} className="rounded-xl border border-[var(--line)] bg-black/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-[var(--text)]">{exercise.exerciseName}</p>
                  <p className="text-xs text-[var(--muted)]">Planejado: {exercise.plannedReps}</p>
                  {exercise.isBodyweight ? (
                    <label className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--muted)]">
                      <input
                        type="checkbox"
                        checked={exercise.useExtraLoad}
                        disabled={!exercise.allowsExtraLoad}
                        onChange={(event) =>
                          setState((current) => ({
                            ...current,
                            exercises: current.exercises.map((entry, idx) =>
                              idx === exerciseIndex
                                ? {
                                    ...entry,
                                    useExtraLoad: event.target.checked,
                                    series: event.target.checked
                                      ? entry.series
                                      : entry.series.map((series) => ({ ...series, loadKg: '' })),
                                  }
                                : entry,
                            ),
                          }))
                        }
                      />
                      Adicionar peso extra
                    </label>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300"
                  onClick={() => removeExercise(exerciseIndex)}
                >
                  Remover exercicio
                </button>
              </div>

              <div className="mt-2 space-y-2">
                {exercise.series.map((series, seriesIndex) => (
                  <div key={`${exercise.exerciseId}-series-${seriesIndex}`} className="grid gap-2 rounded-lg border border-[var(--line)] p-2 md:grid-cols-[48px_1fr_1fr_1fr_1fr_auto]">
                    <p className="self-center text-xs font-bold text-[var(--muted)]">#{seriesIndex + 1}</p>
                    <label className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                      Reps executadas
                      <input
                        value={series.reps}
                        onChange={(event) => patchSeries(exerciseIndex, seriesIndex, { reps: event.target.value.replace(/[^\d]/g, '') })}
                        className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                      />
                    </label>
                    <label className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                      {!exercise.isBodyweight || exercise.useExtraLoad ? 'Carga (kg)' : 'Carga'}
                      {!exercise.isBodyweight || exercise.useExtraLoad ? (
                        <input
                          value={series.loadKg}
                          onChange={(event) => patchSeries(exerciseIndex, seriesIndex, { loadKg: event.target.value.replace(/[^\d.]/g, '') })}
                          className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                        />
                      ) : (
                        <div className="mt-1 w-full rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)]">
                          Peso corporal
                        </div>
                      )}
                    </label>
                    <label className="text-[10px] font-semibold uppercase text-[var(--muted)]">
                      RIR
                      <input
                        value={series.rir}
                        onChange={(event) => patchSeries(exerciseIndex, seriesIndex, { rir: event.target.value.replace(/[^\d]/g, '') })}
                        className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                      />
                    </label>
                    {!exercise.isBodyweight || exercise.useExtraLoad ? (
                      <div className="self-end rounded-md border border-[var(--line)] px-2 py-1 text-xs font-bold text-[var(--brand)]">
                        1RM {(() => {
                          const reps = Number(series.reps)
                          const load = Number(series.loadKg)
                          if (reps <= 0 || load <= 0) {
                            return '0.0'
                          }
                          return (load * (1 + 0.0333 * reps)).toFixed(1)
                        })()}{' '}
                        kg
                      </div>
                    ) : (
                      <div className="self-end rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">
                        1RM n/a
                      </div>
                    )}
                    <button
                      type="button"
                      className="self-end rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300"
                      onClick={() => removeSeries(exerciseIndex, seriesIndex)}
                    >
                      Remover serie
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2">
                <button
                  type="button"
                  className="rounded-md border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)] transition hover:border-[var(--brand)]"
                  onClick={() => addSeries(exerciseIndex)}
                >
                  Adicionar serie
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
