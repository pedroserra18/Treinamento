import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'

import { useAuth } from '../hooks/useAuth'
import {
  addExerciseToPlan,
  completeWorkoutSession,
  createManualHistory,
  createWorkoutPlan,
  deletePlanExercise,
  deleteWorkoutPlan,
  getRecommendationTemplates,
  listWorkoutHistory,
  listWorkoutPlans,
  reorderPlanExercises,
  searchExercisesForPlan,
  startWorkoutSession,
  updateHistoryDuration,
  updatePlanExercise,
} from '../services/workoutService'
import type { ExerciseOption, WorkoutPlan, WorkoutSessionHistory } from '../types/workout'

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

function formatDuration(totalSeconds: number | null): string {
  if (!totalSeconds || totalSeconds <= 0) {
    return '00:00'
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${hh}:${mm}:${ss}`
  }

  return `${mm}:${ss}`
}

function formatClock(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return '00:00'
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${hh}:${mm}:${ss}`
  }

  return `${mm}:${ss}`
}

export function WorkoutsPage() {
  const { authorizedFetch, user } = useAuth()
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [history, setHistory] = useState<WorkoutSessionHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [daysPerWeek, setDaysPerWeek] = useState<number>(user?.availableDaysPerWeek ?? 4)
  const [sex, setSex] = useState<'MALE' | 'FEMALE' | 'OTHER'>(user?.sex ?? 'OTHER')
  const [templates, setTemplates] = useState<Array<{ key: string; title: string; structure: string[] }>>([])
  const [templateWarning, setTemplateWarning] = useState<string | null>(null)

  const [newPlanName, setNewPlanName] = useState('')
  const [newPlanDescription, setNewPlanDescription] = useState('')

  const [addQueryByPlan, setAddQueryByPlan] = useState<Record<string, string>>({})
  const [addMuscleByPlan, setAddMuscleByPlan] = useState<Record<string, string>>({})
  const [optionsByPlan, setOptionsByPlan] = useState<Record<string, ExerciseOption[]>>({})

  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null)
  const [replaceQuery, setReplaceQuery] = useState('')
  const [replaceMuscle, setReplaceMuscle] = useState('')
  const [replaceOptions, setReplaceOptions] = useState<ExerciseOption[]>([])

  const [activePlanId, setActivePlanId] = useState<string>('')
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [manualFinishMinutes, setManualFinishMinutes] = useState('')

  const [manualTitle, setManualTitle] = useState('Treino retroativo')
  const [manualDurationMin, setManualDurationMin] = useState('45')
  const [manualPerformedAt, setManualPerformedAt] = useState('')

  const [editMinutesBySession, setEditMinutesBySession] = useState<Record<string, string>>({})

  const planCount = plans.length

  const loadAll = async () => {
    setLoading(true)
    setError(null)

    try {
      const [planData, historyData, templatesData] = await Promise.all([
        listWorkoutPlans(authorizedFetch),
        listWorkoutHistory(authorizedFetch),
        getRecommendationTemplates(authorizedFetch, {
          daysPerWeek,
          sex,
        }),
      ])

      setPlans(planData)
      setHistory(historyData.items)
      setTemplates(templatesData.templates)
      setTemplateWarning(templatesData.warning)
      if (planData.length > 0 && !activePlanId) {
        setActivePlanId(planData[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar gestao de treinos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isTimerRunning) {
        setElapsedSec((current) => current + 1)
      }
    }, 1000)

    return () => window.clearInterval(id)
  }, [isTimerRunning])

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

  const refreshTemplates = async () => {
    try {
      const data = await getRecommendationTemplates(authorizedFetch, {
        daysPerWeek,
        sex,
      })

      setTemplates(data.templates)
      setTemplateWarning(data.warning)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar recomendacoes')
    }
  }

  const createFromTemplate = async (template: { key: string; title: string }) => {
    try {
      await createWorkoutPlan(authorizedFetch, {
        name: `Treino ${template.title}`,
        description: `Estrutura recomendada: ${template.title}`,
        source: 'RECOMMENDATION',
        templateKey: template.key,
        daysPerWeek,
      })
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar treino recomendado')
    }
  }

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

  const addToPlan = async (planId: string, exerciseId: string) => {
    try {
      await addExerciseToPlan(authorizedFetch, planId, { exerciseId })
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar exercicio ao treino')
    }
  }

  const moveExercise = async (plan: WorkoutPlan, planExerciseId: string, direction: -1 | 1) => {
    const currentIndex = plan.exercises.findIndex((item) => item.id === planExerciseId)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= plan.exercises.length) {
      return
    }

    const ids = plan.exercises.map((item) => item.id)
    const temp = ids[currentIndex]
    ids[currentIndex] = ids[nextIndex]
    ids[nextIndex] = temp

    try {
      await reorderPlanExercises(authorizedFetch, plan.id, ids)
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

  const startTimer = async () => {
    try {
      const session = await startWorkoutSession(authorizedFetch, {
        workoutPlanId: activePlanId || undefined,
      })
      setActiveSessionId(session.id)
      setElapsedSec(0)
      setIsTimerRunning(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar treino')
    }
  }

  const pauseTimer = () => {
    setIsTimerRunning((current) => !current)
  }

  const finishTimer = async () => {
    if (!activeSessionId) {
      setError('Nenhum treino ativo para finalizar')
      return
    }

    const manualSeconds = Number(manualFinishMinutes) > 0 ? Math.floor(Number(manualFinishMinutes) * 60) : 0
    const durationSec = Math.max(manualSeconds || elapsedSec, 60)

    try {
      await completeWorkoutSession(authorizedFetch, activeSessionId, {
        durationSec,
      })
      setActiveSessionId(null)
      setIsTimerRunning(false)
      setElapsedSec(0)
      setManualFinishMinutes('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao terminar treino')
    }
  }

  const registerManualHistory = async () => {
    const durationMin = Number(manualDurationMin)
    if (!Number.isFinite(durationMin) || durationMin < 1) {
      setError('Informe duracao manual valida em minutos')
      return
    }

    try {
      await createManualHistory(authorizedFetch, {
        workoutPlanId: activePlanId || undefined,
        title: manualTitle.trim() || undefined,
        durationSec: Math.floor(durationMin * 60),
        performedAt: manualPerformedAt ? new Date(manualPerformedAt).toISOString() : undefined,
      })
      setManualTitle('Treino retroativo')
      setManualDurationMin('45')
      setManualPerformedAt('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar treino retroativo')
    }
  }

  const saveEditedDuration = async (sessionId: string) => {
    const minutes = Number(editMinutesBySession[sessionId])
    if (!Number.isFinite(minutes) || minutes < 1) {
      setError('Informe minutos validos para editar duracao')
      return
    }

    try {
      await updateHistoryDuration(authorizedFetch, sessionId, Math.floor(minutes * 60))
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao editar duracao do treino')
    }
  }

  const timerStatusLabel = useMemo(() => {
    if (!activeSessionId) {
      return 'Nenhum treino em execucao'
    }

    return isTimerRunning ? 'Treino em andamento' : 'Treino pausado'
  }, [activeSessionId, isTimerRunning])

  return (
    <section className="space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
      >
        <h1 className="text-3xl font-black text-[var(--text)] sm:text-4xl">Gestao de Treinos</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Crie, remova e personalize seus treinos com controle total da ordem e substituicao de exercicios.
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">Treinos atuais: {planCount}</p>
      </motion.header>

      {loading ? <p className="text-sm text-[var(--muted)]">Carregando dados...</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="text-lg font-extrabold text-[var(--text)]">Recomendacoes por frequencia e genero</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="text-sm text-[var(--text)]">
              Dias por semana
              <select
                className="ml-2 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1"
                value={daysPerWeek}
                onChange={(event) => setDaysPerWeek(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-[var(--text)]">
              Genero
              <select
                className="ml-2 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1"
                value={sex}
                onChange={(event) => setSex(event.target.value as 'MALE' | 'FEMALE' | 'OTHER')}
              >
                <option value="MALE">Homem</option>
                <option value="FEMALE">Mulher</option>
                <option value="OTHER">Outro</option>
              </select>
            </label>
            <button
              type="button"
              className="rounded-lg bg-[var(--brand)] px-3 py-1 text-sm font-semibold text-white"
              onClick={() => {
                void refreshTemplates()
              }}
            >
              Atualizar recomendacoes
            </button>
          </div>

          {templateWarning ? (
            <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2 text-sm text-amber-300">
              {templateWarning}
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            {templates.map((template) => (
              <div key={template.key} className="rounded-xl border border-[var(--line)] p-3">
                <p className="text-sm font-bold text-[var(--text)]">{template.title}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{template.structure.join(' • ')}</p>
                <button
                  type="button"
                  className="mt-2 rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                  onClick={() => {
                    void createFromTemplate(template)
                  }}
                >
                  Gerar treino a partir desta estrutura
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="text-lg font-extrabold text-[var(--text)]">Criar treino do zero</h2>
          <div className="mt-3 space-y-2">
            <input
              value={newPlanName}
              onChange={(event) => setNewPlanName(event.target.value)}
              placeholder="Nome do treino"
              className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            <textarea
              value={newPlanDescription}
              onChange={(event) => setNewPlanDescription(event.target.value)}
              placeholder="Descricao opcional"
              className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
              rows={3}
            />
            <button
              type="button"
              className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
              onClick={() => {
                void createCustom()
              }}
            >
              Criar treino
            </button>
          </div>
        </article>
      </div>

      <div className="space-y-4">
        {plans.map((plan) => (
          <article key={plan.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xl font-black text-[var(--text)]">{plan.name}</h3>
                <p className="text-sm text-[var(--muted)]">{plan.description ?? 'Sem descricao'}</p>
              </div>
              <div className="flex gap-2">
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
                <button
                  type="button"
                  className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                  onClick={() => setActivePlanId(plan.id)}
                >
                  {activePlanId === plan.id ? 'Selecionado para timer' : 'Selecionar para timer'}
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-[var(--line)] p-3">
              <p className="text-sm font-semibold text-[var(--text)]">Adicionar exercicio (autocomplete dinamico)</p>
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
                  <option value="">Todos musculos</option>
                  {muscleOptions.map((muscle) => (
                    <option key={muscle} value={muscle}>
                      {muscle}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
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
                      void addToPlan(plan.id, option.id)
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
              {plan.exercises.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Nenhum exercicio adicionado ainda.</p>
              ) : null}
              {plan.exercises.map((item, index) => (
                <div key={item.id} className="rounded-xl border border-[var(--line)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--text)]">
                      {index + 1}. {item.exercise.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
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
                          className="rounded-md bg-[var(--brand)] px-3 py-1 text-sm font-semibold text-white"
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
              ))}
            </div>
          </article>
        ))}
      </div>

      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <h2 className="text-lg font-extrabold text-[var(--text)]">Timer de treino</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{timerStatusLabel}</p>
        <p className="mt-2 text-3xl font-black text-[var(--text)]">{formatClock(elapsedSec)}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
            onClick={() => {
              void startTimer()
            }}
            disabled={Boolean(activeSessionId)}
          >
            Iniciar treino
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            onClick={pauseTimer}
            disabled={!activeSessionId}
          >
            {isTimerRunning ? 'Pausar treino' : 'Retomar treino'}
          </button>
          <button
            type="button"
            className="rounded-lg border border-emerald-500/60 px-3 py-2 text-sm font-semibold text-emerald-300"
            onClick={() => {
              void finishTimer()
            }}
            disabled={!activeSessionId}
          >
            Terminar treino
          </button>
        </div>

        <div className="mt-3 max-w-sm">
          <label className="text-xs font-semibold text-[var(--muted)]">
            Ajuste manual de duracao ao terminar (minutos)
            <input
              value={manualFinishMinutes}
              onChange={(event) => setManualFinishMinutes(event.target.value.replace(/[^\d]/g, ''))}
              placeholder="Ex.: 52"
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
            />
          </label>
        </div>
      </article>

      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <h2 className="text-lg font-extrabold text-[var(--text)]">Registro retroativo</h2>
        <p className="text-sm text-[var(--muted)]">Cadastre um treino finalizado sem usar o timer em tempo real.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={manualTitle}
            onChange={(event) => setManualTitle(event.target.value)}
            placeholder="Titulo"
            className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
          <input
            value={manualDurationMin}
            onChange={(event) => setManualDurationMin(event.target.value.replace(/[^\d]/g, ''))}
            placeholder="Duracao (min)"
            className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={manualPerformedAt}
            onChange={(event) => setManualPerformedAt(event.target.value)}
            className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="button"
            className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white"
            onClick={() => {
              void registerManualHistory()
            }}
          >
            Registrar
          </button>
        </div>
      </article>

      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <h2 className="text-lg font-extrabold text-[var(--text)]">Historico de treinos</h2>
        <div className="mt-3 space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Sem treinos no historico.</p>
          ) : null}
          {history.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-[var(--line)] p-3">
              <p className="text-sm font-semibold text-[var(--text)]">
                {entry.workoutPlan?.name ?? 'Treino sem plano'} • {formatDuration(entry.durationSec)}
              </p>
              <p className="text-xs text-[var(--muted)]">
                Finalizado em {entry.endedAt ? new Date(entry.endedAt).toLocaleString('pt-BR') : '-'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={editMinutesBySession[entry.id] ?? ''}
                  onChange={(event) =>
                    setEditMinutesBySession((current) => ({
                      ...current,
                      [entry.id]: event.target.value.replace(/[^\d]/g, ''),
                    }))
                  }
                  placeholder="Editar min"
                  className="rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
                  onClick={() => {
                    void saveEditedDuration(entry.id)
                  }}
                >
                  Salvar duracao
                </button>
              </div>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
