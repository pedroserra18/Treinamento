import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  generateAIWorkout,
  listAIHistory,
  parseCustomSplitAI,
  saveAIGenerationHistory,
  saveAIWorkout,
  swapExerciseAI,
  type AIHistoryGeneration,
  type WorkoutSection,
} from '../services/aiService'
import { getProfileDefaults, updateBirthDate, updateGender, type ProfileDefaults } from '../services/authService'
import { ChevronLeft, CheckCircle2 } from 'lucide-react'
import { AIWelcomeScreen } from './ai/AIWelcomeScreen'
import { AILoadingScreen } from './ai/AILoadingScreen'
import { AIReviewScreen } from './ai/AIReviewScreen'
import { AIResultScreen } from './ai/AIResultScreen'
import { useShowPlanLimit } from '../components/plan/use-plan-limit'
import { catchPlanLimitError } from '../lib/plan-features'
import {
  ageBucketFromBirthDate, applyProfileDefaults, buildAIGenerationLabel, buildPrompt,
  clearStaleAnswers, getEffectiveSplit,
  getVisibleSteps, getWorkoutLabels, newAIGenerationId,
  nextVisibleStep, prevVisibleStep, resolveMuscleGroup,
  DEFAULT_ANSWERS, GOAL_RECOMMENDED_RANGE, LOADING_MESSAGES, MUSCLES_LIST, REP_HINTS,
  type AppScreen, type QuizAnswers, type SaveResult,
} from './ai/ai-workout-utils'
import {
  OptionCard, ProgressBar,
} from './ai/ai-components'

// ─── Helpers e componentes de apresentação vivem em ai/ (utils, review-metrics, components) ─

// ─── Main component ───────────────────────────────────────────────────────────

export function AIWorkoutPage() {
  const { authorizedFetch } = useAuth()
  const showPlanLimit = useShowPlanLimit()
  const navigate = useNavigate()

  const [appScreen, setAppScreen] = useState<AppScreen>('WELCOME')
  const ANSWERS_STORAGE_KEY = 'ai-workout-answers-v3'

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [isEditMode, setIsEditMode] = useState(false)
  const [answers, setAnswers] = useState<QuizAnswers>(() => {
    try {
      const raw = localStorage.getItem(ANSWERS_STORAGE_KEY)
      if (!raw) return DEFAULT_ANSWERS
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_ANSWERS, ...parsed }
      }
    } catch {/* ignore */}
    return DEFAULT_ANSWERS
  })

  useEffect(() => {
    try { localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(answers)) } catch {/* ignore */}
  }, [answers])

  const hasSavedAnswers = useMemo(() => {
    return Boolean(answers.daysPerWeek || answers.experience || answers.goal || answers.location)
  }, [answers.daysPerWeek, answers.experience, answers.goal, answers.location])
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const [sections, setSections] = useState<WorkoutSection[]>([])
  const [generatingStep, setGeneratingStep] = useState<{ current: number; total: number; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [saveResults, setSaveResults] = useState<Record<number, SaveResult>>({})
  // Identidade da geração corrente — set em handleGenerate, reset quando
  // o user volta pro WELCOME. Compartilhado entre todos os saves dessa
  // geração pra agrupar em "Treinos gerados".
  const [currentGeneration, setCurrentGeneration] = useState<{ id: string; label: string } | null>(null)
  // Histórico das últimas 3 gerações — usado pelo botão "Ver treinos gerados"
  // no WELCOME + pela sheet. Carregado on-mount do WELCOME (não fica re-
  // pollando) e refrescado quando uma nova generation é salva.
  const [recentGenerations, setRecentGenerations] = useState<AIHistoryGeneration[]>([])
  const [recentGenerationsLoading, setRecentGenerationsLoading] = useState(false)
  const [recentGenerationsError, setRecentGenerationsError] = useState<string | null>(null)
  const [recentSheetOpen, setRecentSheetOpen] = useState(false)
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)
  const [extraHistory, setExtraHistory] = useState<string[]>([])
  // Rótulos resolvidos do plano gerado (especialmente p/ divisão "Outro"
  // interpretada por IA). Guardados para o regenerar usar os MESMOS dias.
  const [resolvedLabels, setResolvedLabels] = useState<string[]>([])
  // Dias da semana citados pelo usuário (divisão "Outro"). Vazio = auto-espaça.
  const [resolvedWeekdays, setResolvedWeekdays] = useState<string[]>([])
  // Which day tab is open in the RESULT screen, and which exercise within it.
  // Reset both whenever a new plan is generated (handled in handleGenerate).
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [expandedExerciseKey, setExpandedExerciseKey] = useState<string | null>(null)

  const resultRef = useRef<HTMLDivElement>(null)

  const EXTRA_HISTORY_KEY = 'ai-workout-extra-history'

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXTRA_HISTORY_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setExtraHistory(parsed.filter(x => typeof x === 'string').slice(0, 5))
      }
    } catch {/* ignore */}
  }, [])

  const pushExtraHistory = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setExtraHistory(prev => {
      const next = [trimmed, ...prev.filter(x => x !== trimmed)].slice(0, 5)
      try { localStorage.setItem(EXTRA_HISTORY_KEY, JSON.stringify(next)) } catch {/* ignore */}
      return next
    })
  }, [])

  useEffect(() => {
    if (appScreen !== 'LOADING') return
    const interval = setInterval(() => {
      setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [appScreen])

  // Carrega o histórico de gerações da IA sempre que voltamos ao WELCOME
  // (incluindo na montagem inicial). Cobre o caso do user salvar uma
  // geração e voltar — a lista reflete imediato sem refresh manual.
  // Não fica em loop porque appScreen só muda em interações de fato.
  const fetchRecentGenerations = useCallback(async () => {
    setRecentGenerationsLoading(true)
    setRecentGenerationsError(null)
    try {
      const result = await listAIHistory(authorizedFetch, 3)
      setRecentGenerations(result)
    } catch (err) {
      setRecentGenerationsError(err instanceof Error ? err.message : 'Falha ao carregar histórico')
    } finally {
      setRecentGenerationsLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => {
    if (appScreen !== 'WELCOME') return
    void fetchRecentGenerations()
  }, [appScreen, fetchRecentGenerations])

  // Guarda os dados do perfil pra reaplicar ao recomeçar o quiz do zero (a
  // requisição só roda uma vez na montagem; o reset não pode re-buscar de forma
  // síncrona).
  const profileDefaultsRef = useRef<ProfileDefaults | null>(null)

  // Pré-preenche o quiz com os dados do perfil (peso atual do progresso,
  // altura, gênero, data de nascimento). Só preenche campos VAZIOS — não
  // sobrescreve o que o usuário já respondeu/salvou.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const defaults = await getProfileDefaults(authorizedFetch)
        if (cancelled) return
        profileDefaultsRef.current = defaults
        setAnswers(prev => applyProfileDefaults(prev, defaults))
      } catch {
        // Sem perfil/dados — segue com o quiz normal.
      }
    })()
    return () => { cancelled = true }
  }, [authorizedFetch])

  // Recomeça o quiz do zero, mas reaplica os dados do perfil (ex: data de
  // nascimento já salva) pra não reperguntar o que já sabemos.
  const resetQuiz = useCallback(() => {
    try { localStorage.removeItem(ANSWERS_STORAGE_KEY) } catch {/* ignore */}
    setStep(0)
    setAnswers(applyProfileDefaults({ ...DEFAULT_ANSWERS }, profileDefaultsRef.current))
    setIsEditMode(false)
    setAppScreen('QUIZ')
    // Reset da geração — próximo generate cria um id novo. Sem isso,
    // saves do plano antigo se misturariam com o novo.
    setCurrentGeneration(null)
  }, [])

  const advanceStep = useCallback(() => {
    setDirection(1)
    if (isEditMode) { setAppScreen('REVIEW'); return }
    const next = nextVisibleStep(step, answers)
    if (next != null) {
      setStep(next)
    } else {
      setAppScreen('REVIEW')
    }
  }, [step, isEditMode, answers])

  const goBack = useCallback(() => {
    setDirection(-1)
    if (isEditMode) { setAppScreen('REVIEW'); return }
    const prev = prevVisibleStep(step, answers)
    if (prev != null) {
      setStep(prev)
    } else {
      setAppScreen('WELCOME')
    }
  }, [step, isEditMode, answers])

  const selectAndAdvance = useCallback((key: keyof QuizAnswers, value: string) => {
    // Espelha a transformação aplicada dentro de setAnswers para calcular visibilidade do próximo passo.
    const nextAnswers = clearStaleAnswers({ ...answers, [key]: value }, key, value)

    setAnswers(prev => clearStaleAnswers({ ...prev, [key]: value }, key, value))
    setDirection(1)

    if (isEditMode) {
      setTimeout(() => setAppScreen('REVIEW'), 160)
      return
    }

    setTimeout(() => {
      const next = nextVisibleStep(step, nextAnswers)
      if (next != null) {
        setStep(next)
      } else {
        setAppScreen('REVIEW')
      }
    }, 160)
  }, [isEditMode, step, answers])

  // Seleciona o gênero, persiste no perfil (pra não reperguntar), atualiza o
  // ref dos defaults (caso recomece o quiz na mesma sessão) e avança.
  const selectGender = useCallback((value: 'Masculino' | 'Feminino') => {
    profileDefaultsRef.current = {
      ...(profileDefaultsRef.current ?? { weightKg: null, heightCm: null, gender: null, birthDate: null, age: null, experienceLevel: null, primaryGoal: null }),
      gender: value,
    }
    void updateGender(authorizedFetch, value).catch(() => {})
    selectAndAdvance('gender', value)
  }, [authorizedFetch, selectAndAdvance])

  const toggleTechnique = (t: string) => {
    setAnswers(prev => {
      if (t === 'Nenhuma') return { ...prev, techniques: ['Nenhuma'] }
      const without = prev.techniques.filter(x => x !== 'Nenhuma')
      return {
        ...prev,
        techniques: without.includes(t) ? without.filter(x => x !== t) : [...without, t],
      }
    })
  }

  const toggleMuscle = (m: string) => {
    setAnswers(prev => {
      if (prev.musclesFocus.includes(m)) return { ...prev, musclesFocus: prev.musclesFocus.filter(x => x !== m) }
      if (prev.musclesFocus.length >= 3) return prev
      return { ...prev, musclesFocus: [...prev.musclesFocus, m] }
    })
  }

  const handleGenerate = useCallback(async () => {
    const days = parseInt(answers.daysPerWeek, 10) || 4
    const split = getEffectiveSplit(days, answers.muscleFrequency, answers.musclesFocus, answers.splitPreference)
    let labels = getWorkoutLabels(split, days, answers.customSplit)

    setAppScreen('LOADING')
    setLoadingMsgIdx(0)
    setError(null)
    setSections([])
    setSaveResults({})
    setGeneratingStep(null)
    // Nova geração — fresh ID + label compartilhado entre o auto-save do
    // histórico (logo abaixo após gerar todas as seções) E os saves manuais
    // de planos individuais (handleSaveOne). Mantém consistência: a row
    // do histórico e os WorkoutPlan que o user salvar manualmente referem
    // a MESMA generation.
    const generationId = newAIGenerationId()
    const generationLabel = buildAIGenerationLabel(split, days, answers.customSplit)
    setCurrentGeneration({ id: generationId, label: generationLabel })
    // New plan → start on first day with no exercises expanded.
    setActiveDayIndex(0)
    setExpandedExerciseKey(null)
    if (answers.extraInfo) pushExtraHistory(answers.extraInfo)

    try {
      // Divisão "Outro": se o parser local achou só 1 dia mas o texto é uma
      // frase longa (linguagem natural), pede à IA pra interpretar a descrição.
      let weekdays: string[] = []
      if (split === 'Outro' && labels.length <= 1 && answers.customSplit.trim().length > 20) {
        try {
          const parsed = await parseCustomSplitAI(authorizedFetch, answers.customSplit, days)
          labels = parsed.map((d) => d.label)
          weekdays = parsed.map((d) => d.weekday)
        } catch {
          // Mantém o fallback do parser local se a IA falhar.
        }
      }
      setResolvedLabels(labels)
      setResolvedWeekdays(weekdays)

      const accumulated: WorkoutSection[] = []
      const usedExercises: string[] = []

      // Mapeamento local → enum aceita pelo schema da API.
      const equipmentMap: Record<string, string> = {
        'Academia completa': 'Academia (completa)',
        'Em casa com equipamentos': 'Casa com equipamentos',
        'Em casa sem equipamentos': 'Sem equipamento',
      }
      // techniques no quiz inclui "Nenhuma" como sentinela — removida antes de enviar.
      const realTechniques = answers.techniques.filter(t => t !== 'Nenhuma')

      for (let i = 0; i < labels.length; i++) {
        const label = labels[i]
        setGeneratingStep({ current: i + 1, total: labels.length, label })

        const heightNum = answers.heightCm ? parseInt(answers.heightCm, 10) : NaN
        const weightNum = answers.weightKg ? parseFloat(answers.weightKg) : NaN

        const result = await generateAIWorkout(authorizedFetch, {
          prompt: buildPrompt(answers, label, i, labels.length, split),
          dayLabel: label,
          isFirstDay: i === 0,
          weekDays: answers.daysPerWeek || undefined,
          split: split || undefined,
          muscleFrequency: answers.muscleFrequency || undefined,
          level: answers.experience || undefined,
          age: answers.age || undefined,
          gender: answers.gender || undefined,
          heightCm: Number.isFinite(heightNum) && heightNum >= 100 && heightNum <= 250 ? heightNum : undefined,
          weightKg: Number.isFinite(weightNum) && weightNum >= 30 && weightNum <= 300 ? weightNum : undefined,
          phase: answers.phase || undefined,
          goal: answers.goal || undefined,
          equipment: equipmentMap[answers.location] || undefined,
          equipmentPreference: answers.equipment || undefined,
          durationMin: answers.duration || undefined,
          exerciseCount: answers.exerciseCount || undefined,
          repRange: answers.repRange || undefined,
          restTime: answers.restTime || undefined,
          rirTarget: answers.rirTarget || undefined,
          techniques: realTechniques.length > 0 ? realTechniques : undefined,
          musclesFocus: answers.musclesFocus.length > 0 ? answers.musclesFocus : undefined,
          injuries: [
            answers.hasInjury && answers.injuryDescription ? `Lesão: ${answers.injuryDescription}` : '',
            answers.avoidExercises ? `Evitar: ${answers.avoidExercises}` : '',
          ].filter(Boolean).join('. ') || undefined,
          usedExercises: usedExercises.length > 0 ? usedExercises.slice(-80) : undefined,
          extraInfo: [
            answers.wantsCardio ? 'Incluir 10-15 min de cardio leve por dia (caminhada/esteira/bike), como aquecimento ou finalizador — descreva no campo "observations" do dia.' : '',
            answers.extraInfo,
          ].filter(Boolean).join(' ').trim() || undefined,
        })

        const section = result.sections[0]
        if (section) {
          accumulated.push({
            displayText: section.displayText,
            workoutData: section.workoutData
              ? { ...section.workoutData, planName: section.workoutData.planName || label }
              : null,
          })
          if (section.workoutData) {
            for (const ex of section.workoutData.exercises) {
              if (ex.name && !usedExercises.includes(ex.name)) usedExercises.push(ex.name)
            }
          }
          setSections([...accumulated])
        }

        if (i === 0) {
          setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
        }
      }

      // Auto-save no histórico — funciona MESMO se o user não clicar Salvar
      // depois. Pega só sections com workoutData válido; se IA falhou em
      // algum dia, esse dia simplesmente fica de fora. Falha aqui não
      // bloqueia a UI — user continua vendo o resultado normalmente.
      try {
        const daysPayload = accumulated
          .map((sec, idx) => ({
            dayIndex: idx,
            dayLabel: labels[idx] ?? sec.workoutData?.planName ?? `Dia ${idx + 1}`,
            workoutData: sec.workoutData,
          }))
          .filter((d): d is { dayIndex: number; dayLabel: string; workoutData: NonNullable<typeof d.workoutData> } => d.workoutData !== null)
          .map((d) => ({
            dayIndex: d.dayIndex,
            dayLabel: d.dayLabel,
            planName: d.workoutData.planName,
            exercises: d.workoutData.exercises,
          }))
        if (daysPayload.length > 0) {
          await saveAIGenerationHistory(authorizedFetch, {
            generationId,
            generationLabel,
            days: daysPayload,
          }).catch(() => { /* silencioso — histórico é melhoria, não crítico */ })
        }
      } catch { /* idem */ }

      setAppScreen('RESULT')
    } catch (err) {
      // PLAN_LIMIT_REACHED é intercept aqui — abre o PlanLimitDialog em
      // vez do mensagem vermelha genérica, e volta pra WELCOME pra o user
      // ver o histórico (que pode incluir gerações antigas pra clonar).
      if (catchPlanLimitError(err, showPlanLimit)) {
        setAppScreen('WELCOME')
        return
      }
      setError(err instanceof Error ? err.message : 'Erro ao gerar treino. Tente novamente.')
      setAppScreen('REVIEW')
    } finally {
      setGeneratingStep(null)
    }
  }, [authorizedFetch, answers, pushExtraHistory, showPlanLimit])

  const handleSaveOne = useCallback(async (index: number) => {
    const wd = sections[index]?.workoutData
    if (!wd) return
    setSavingIndex(index)
    setError(null)
    try {
      const result = await saveAIWorkout(authorizedFetch, {
        planName: wd.planName,
        exercises: wd.exercises,
        // Agrupamento — quando todos os N saves dessa geração usam o
        // mesmo aiGenerationId, o backend consegue listar como "1
        // geração de N dias" no endpoint /workouts/plans/ai/recent.
        aiGenerationId: currentGeneration?.id,
        aiGenerationLabel: currentGeneration?.label,
      })
      setSaveResults(prev => ({
        ...prev,
        [index]: {
          planId: result.planId,
          planName: result.planName,
          foundCount: result.savedExercises.filter(e => e.found).length,
          totalCount: result.savedExercises.length,
        },
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar treino.')
    } finally {
      setSavingIndex(null)
    }
  }, [authorizedFetch, sections, currentGeneration])

  const handleRegenerateDay = useCallback(async (index: number) => {
    const days = parseInt(answers.daysPerWeek, 10) || 4
    const split = getEffectiveSplit(days, answers.muscleFrequency, answers.musclesFocus, answers.splitPreference)
    // Usa os labels resolvidos na geração (inclui interpretação IA do "Outro");
    // só recalcula se não houver (ex: regenerar sem ter gerado antes).
    const labels = resolvedLabels.length > 0 ? resolvedLabels : getWorkoutLabels(split, days, answers.customSplit)
    const label = labels[index]
    if (!label) return

    const equipmentMap: Record<string, string> = {
      'Academia completa': 'Academia (completa)',
      'Em casa com equipamentos': 'Casa com equipamentos',
      'Em casa sem equipamentos': 'Sem equipamento',
    }
    const realTechniques = answers.techniques.filter(t => t !== 'Nenhuma')

    // Used exercises = todos os exercícios das outras seções (variação entre dias)
    const used: string[] = []
    sections.forEach((s, i) => {
      if (i === index || !s.workoutData) return
      for (const ex of s.workoutData.exercises) if (ex.name) used.push(ex.name)
    })

    setRegeneratingIndex(index)
    setError(null)
    try {
      const heightNum = answers.heightCm ? parseInt(answers.heightCm, 10) : NaN
      const weightNum = answers.weightKg ? parseFloat(answers.weightKg) : NaN
      const result = await generateAIWorkout(authorizedFetch, {
        prompt: buildPrompt(answers, label, index, labels.length, split),
        dayLabel: label,
        weekDays: answers.daysPerWeek || undefined,
        split: split || undefined,
        muscleFrequency: answers.muscleFrequency || undefined,
        level: answers.experience || undefined,
        age: answers.age || undefined,
        gender: answers.gender || undefined,
        heightCm: Number.isFinite(heightNum) && heightNum >= 100 && heightNum <= 250 ? heightNum : undefined,
        weightKg: Number.isFinite(weightNum) && weightNum >= 30 && weightNum <= 300 ? weightNum : undefined,
        phase: answers.phase || undefined,
        goal: answers.goal || undefined,
        equipment: equipmentMap[answers.location] || undefined,
        equipmentPreference: answers.equipment || undefined,
        durationMin: answers.duration || undefined,
        exerciseCount: answers.exerciseCount || undefined,
        repRange: answers.repRange || undefined,
        restTime: answers.restTime || undefined,
        rirTarget: answers.rirTarget || undefined,
        techniques: realTechniques.length > 0 ? realTechniques : undefined,
        musclesFocus: answers.musclesFocus.length > 0 ? answers.musclesFocus : undefined,
        injuries: [
          answers.hasInjury && answers.injuryDescription ? `Lesão: ${answers.injuryDescription}` : '',
          answers.avoidExercises ? `Evitar: ${answers.avoidExercises}` : '',
        ].filter(Boolean).join('. ') || undefined,
        usedExercises: used.length > 0 ? used.slice(-80) : undefined,
        extraInfo: answers.extraInfo || undefined,
      })
      const newSection = result.sections[0]
      if (newSection) {
        setSections(prev => prev.map((s, i) => i === index
          ? { displayText: newSection.displayText, workoutData: newSection.workoutData ? { ...newSection.workoutData, planName: newSection.workoutData.planName || label } : null }
          : s))
        setSaveResults(prev => {
          const copy = { ...prev }
          delete copy[index]
          return copy
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao regenerar dia.')
    } finally {
      setRegeneratingIndex(null)
    }
  }, [authorizedFetch, answers, sections, resolvedLabels])

  const moveExercise = useCallback((sectionIndex: number, exIndex: number, dir: -1 | 1) => {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIndex || !s.workoutData) return s
      const exs = [...s.workoutData.exercises]
      const target = exIndex + dir
      if (target < 0 || target >= exs.length) return s
      ;[exs[exIndex], exs[target]] = [exs[target], exs[exIndex]]
      return { ...s, workoutData: { ...s.workoutData, exercises: exs } }
    }))
    setSaveResults(prev => {
      const copy = { ...prev }
      delete copy[sectionIndex]
      return copy
    })
  }, [])

  const removeExercise = useCallback((sectionIndex: number, exIndex: number) => {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIndex || !s.workoutData) return s
      const exs = s.workoutData.exercises.filter((_, idx) => idx !== exIndex)
      return { ...s, workoutData: { ...s.workoutData, exercises: exs } }
    }))
    setSaveResults(prev => {
      const copy = { ...prev }
      delete copy[sectionIndex]
      return copy
    })
  }, [])

  // Troca um exercício por outro do mesmo grupo (instantâneo, sem IA). Mantém
  // séries/reps/descanso; muda só o nome/grupo. Evita repetir os do dia.
  const [swappingKey, setSwappingKey] = useState<string | null>(null)
  const swapExercise = useCallback(async (sectionIndex: number, exIndex: number) => {
    const section = sections[sectionIndex]
    const ex = section?.workoutData?.exercises[exIndex]
    if (!ex) return
    const muscle = resolveMuscleGroup(ex)?.label
    if (!muscle) return
    const equipmentMap: Record<string, string> = {
      'Academia completa': 'Academia (completa)',
      'Em casa com equipamentos': 'Casa com equipamentos',
      'Em casa sem equipamentos': 'Sem equipamento',
    }
    const dayNames = section.workoutData?.exercises.map(e => e.name) ?? []
    setSwappingKey(`${sectionIndex}-${exIndex}`)
    setError(null)
    try {
      const replacement = await swapExerciseAI(authorizedFetch, {
        muscleGroup: muscle,
        equipment: equipmentMap[answers.location] || undefined,
        exclude: dayNames,
      })
      setSections(prev => prev.map((s, i) => {
        if (i !== sectionIndex || !s.workoutData) return s
        const exs = s.workoutData.exercises.map((e, idx) =>
          idx === exIndex
            ? { ...e, name: replacement.name, muscleGroup: replacement.muscleGroup, secondaryMuscleGroup: replacement.secondaryMuscleGroup ?? undefined }
            : e,
        )
        return { ...s, workoutData: { ...s.workoutData, exercises: exs } }
      }))
      setSaveResults(prev => {
        const copy = { ...prev }
        delete copy[sectionIndex]
        return copy
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao trocar exercício')
    } finally {
      setSwappingKey(null)
    }
  }, [authorizedFetch, sections, answers.location])


  // ─── WELCOME ──────────────────────────────────────────────────────────────

  if (appScreen === 'WELCOME') {
    return (
      <AIWelcomeScreen
        hasSavedAnswers={hasSavedAnswers}
        onContinue={() => { setStep(0); setIsEditMode(false); setAppScreen('REVIEW') }}
        onReset={resetQuiz}
        recentGenerations={recentGenerations}
        recentSheetOpen={recentSheetOpen}
        recentGenerationsLoading={recentGenerationsLoading}
        recentGenerationsError={recentGenerationsError}
        onOpenRecent={() => setRecentSheetOpen(true)}
        onCloseRecent={() => setRecentSheetOpen(false)}
      />
    )
  }

  // ─── LOADING ──────────────────────────────────────────────────────────────

  if (appScreen === 'LOADING') {
    return (
      <AILoadingScreen generatingStep={generatingStep} loadingMsgIdx={loadingMsgIdx} />
    )
  }

  // ─── QUIZ ─────────────────────────────────────────────────────────────────

  if (appScreen === 'QUIZ') {
    const recommendedRange = GOAL_RECOMMENDED_RANGE[answers.goal] ?? null

    const visibleSteps = getVisibleSteps(answers)
    const totalVisible = visibleSteps.length
    const visibleIdx = visibleSteps.indexOf(step)
    const isLastVisibleStep = visibleIdx === totalVisible - 1

    // Steps that need explicit Next button (multi-select or text input)
    const needsNextButton = [2, 12, 13, 14, 15].includes(step)
      || (step === 18 && answers.hasExtraInfo === true)
      || (step === 19 && answers.splitPreference === 'Outro')

    const stepContent = (() => {
      switch (step) {
        case 0:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Quantos dias por semana você vai treinar?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Escolha sua frequência semanal</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {[['2', '2x por semana', 'Ideal para começar'], ['3', '3x por semana', 'Bom equilíbrio'], ['4', '4x por semana', 'Frequência eficiente'], ['5', '5x por semana', 'Volume alto'], ['6', '6x por semana', 'Atletas avançados']].map(([val, label, hint]) => (
                  <OptionCard key={val} label={label} hint={hint} selected={answers.daysPerWeek === val} onClick={() => selectAndAdvance('daysPerWeek', val)} />
                ))}
              </div>
            </>
          )

        case 1:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual é o seu nível de experiência?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Isso ajuda a calibrar volume e intensidade</p>
              <div className="mt-5 space-y-2">
                {[['Iniciante', 'Menos de 1 ano treinando'], ['Intermediário', '1 a 3 anos treinando'], ['Avançado', 'Mais de 3 anos treinando']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.experience === val} onClick={() => selectAndAdvance('experience', val)} />
                ))}
              </div>
            </>
          )

        case 2:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual a sua data de nascimento?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Calculamos a idade automaticamente — você não precisa responder de novo nas próximas vezes</p>
              <div className="mt-5">
                <input
                  type="date"
                  value={answers.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  min="1920-01-01"
                  onChange={(e) => {
                    const bd = e.target.value
                    setAnswers(prev => ({ ...prev, birthDate: bd, age: bd ? ageBucketFromBirthDate(bd) : '' }))
                    if (bd) {
                      // Persiste no perfil pra não perguntar de novo, e atualiza
                      // o ref pra que "começar do zero" na mesma sessão não
                      // reperguntar (o ref foi populado na montagem, antes disto).
                      profileDefaultsRef.current = { ...(profileDefaultsRef.current ?? { weightKg: null, heightCm: null, gender: null, birthDate: null, age: null, experienceLevel: null, primaryGoal: null }), birthDate: bd }
                      void updateBirthDate(authorizedFetch, bd).catch(() => {})
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-3 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--brand)]"
                />
                {answers.birthDate && (
                  <p className="mt-2 text-[12px] text-[var(--muted)]">
                    Faixa etária: <span className="font-semibold text-[var(--brand)]">{ageBucketFromBirthDate(answers.birthDate)}</span>
                  </p>
                )}
              </div>
            </>
          )

        case 3:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual o seu gênero?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Define a ênfase muscular padrão quando não há foco específico</p>
              <div className="mt-5 space-y-2">
                {[['Masculino', 'Ênfase padrão em superiores (peito/costas/ombros)'], ['Feminino', 'Ênfase padrão em inferiores (glúteo/posterior/quad)']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.gender === val} onClick={() => selectGender(val as 'Masculino' | 'Feminino')} />
                ))}
              </div>
            </>
          )

        case 4:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual fase você está atualmente?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Define a estratégia de volume e intensidade</p>
              <div className="mt-5 space-y-2">
                {[['Ganho de massa', 'Foco em aumentar volume muscular com superávit calórico'], ['Cutting (definição)', 'Manter músculo enquanto perde gordura'], ['Recomposição', 'Ganhar músculo e perder gordura simultaneamente'], ['Manutenção', 'Manter o físico atual com boa qualidade de vida']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.phase === val} onClick={() => selectAndAdvance('phase', val)} />
                ))}
              </div>
            </>
          )

        case 5:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual o foco principal do treino?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">O objetivo que guia a seleção de exercícios e métodos</p>
              <div className="mt-5 space-y-2">
                {[['Hipertrofia', 'Maximizar crescimento muscular'], ['Força', 'Aumentar cargas e força máxima'], ['Emagrecimento', 'Queima de gordura com treinos mais intensos'], ['Resistência', 'Melhorar capacidade cardiovascular e muscular'], ['Recuperação de lesão', 'Treino adaptado para reabilitação']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.goal === val} onClick={() => selectAndAdvance('goal', val)} />
                ))}
              </div>
            </>
          )

        case 6:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Onde você treina?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Define os exercícios e equipamentos disponíveis</p>
              <div className="mt-5 space-y-2">
                {[['Academia completa', 'Acesso a todos os aparelhos e pesos livres'], ['Em casa com equipamentos', 'Halteres, barras, elásticos ou banco'], ['Em casa sem equipamentos', 'Apenas peso corporal']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.location === val} onClick={() => selectAndAdvance('location', val)} />
                ))}
              </div>
            </>
          )

        case 7:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Preferência de equipamentos?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Mesmo em academia, você pode ter uma preferência</p>
              <div className="mt-5 space-y-2">
                {[['Pesos livres', 'Halteres e barras — mais ativação muscular'], ['Máquinas', 'Maior segurança e isolamento'], ['Misto', 'Combinação de pesos livres e máquinas']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.equipment === val} onClick={() => selectAndAdvance('equipment', val)} />
                ))}
              </div>
            </>
          )

        case 8:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Duração desejada da sessão?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">O tempo que você tem disponível por treino</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {[['30', '30 minutos'], ['45', '45 minutos'], ['60', '1 hora'], ['90', '1h30'], ['120', '2 horas']].map(([val, label]) => (
                  <OptionCard key={val} label={label} selected={answers.duration === val} onClick={() => selectAndAdvance('duration', val)} />
                ))}
              </div>
            </>
          )

        case 9:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Frequência por grupo muscular?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Quantas vezes por semana cada músculo será treinado</p>
              <div className="mt-5 space-y-2">
                {[['1x por semana', 'Cada músculo aparece uma vez (ex: Bro Split)'], ['2x por semana', 'Cada músculo aparece duas vezes (ex: Upper/Lower)'], ['IA decide', 'A IA escolhe o melhor split para seu perfil']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.muscleFrequency === val} onClick={() => selectAndAdvance('muscleFrequency', val)} />
                ))}
              </div>
            </>
          )

        case 10:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Faixa de repetições preferida?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Será usada como referência principal nos exercícios</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {(['4–6', '5–9', '6–8', '8–10', '10–12', '12–15'] as const).map(val => (
                  <OptionCard
                    key={val}
                    label={val + ' reps'}
                    hint={REP_HINTS[val]}
                    recommended={val === recommendedRange}
                    selected={answers.repRange === val}
                    onClick={() => selectAndAdvance('repRange', val)}
                  />
                ))}
              </div>
              {recommendedRange && (
                <p className="mt-3 text-[11px] text-[var(--muted)]">
                  ★ Faixa recomendada para <span className="font-semibold text-[var(--brand)]">{answers.goal}</span>: {recommendedRange} reps
                </p>
              )}
            </>
          )

        case 11:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Tempo de descanso entre séries?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Influencia diretamente a intensidade e o volume da sessão</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {([
                  ['30s', '30 segundos', 'Resistência e condicionamento'],
                  ['45s', '45 segundos', 'Alta intensidade metabólica'],
                  ['1min', '1 minuto', 'Hipertrofia com densidade'],
                  ['1min30s', '1 min 30 seg', 'Hipertrofia clássica'],
                  ['2min', '2 minutos', 'Hipertrofia e força'],
                  ['2min30s', '2 min 30 seg', 'Força com volume'],
                  ['3min', '3 minutos', 'Força máxima e compostos pesados'],
                  ['IA decide', 'IA decide', 'Adaptado ao tipo de exercício'],
                ] as const).map(([val, label, hint]) => (
                  <OptionCard key={val} label={label} hint={hint} selected={answers.restTime === val} onClick={() => selectAndAdvance('restTime', val)} />
                ))}
              </div>
            </>
          )

        case 12:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Técnicas avançadas?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Selecione uma ou mais (pode escolher várias)</p>
              <div className="mt-5 space-y-2">
                {['Nenhuma', 'Drop Set', 'Cluster Set', 'Rest-Pause', 'Bi-Set'].map(t => {
                  const selected = answers.techniques.includes(t)
                  return (
                    <button
                      type="button"
                      key={t}
                      onClick={() => toggleTechnique(t)}
                      className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                        selected
                          ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))]'
                          : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand)]/50'
                      }`}
                    >
                      <span className={`text-sm font-bold ${selected ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>{t}</span>
                      {selected && <CheckCircle2 size={16} className="shrink-0 text-[var(--brand)]" />}
                    </button>
                  )
                })}
              </div>
            </>
          )

        case 13:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Tem foco muscular específico?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Selecione até 3 músculos que quer priorizar</p>
              <div className="mt-4 flex gap-2">
                {[true, false].map(val => (
                  <button
                    type="button"
                    key={String(val)}
                    onClick={() => setAnswers(prev => ({ ...prev, hasFocus: val, musclesFocus: val ? prev.musclesFocus : [] }))}
                    className={`flex-1 rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                      answers.hasFocus === val
                        ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]'
                        : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/50'
                    }`}
                  >
                    {val ? 'Sim' : 'Não'}
                  </button>
                ))}
              </div>
              {answers.hasFocus === true && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
                    Selecione até 3 músculos ({answers.musclesFocus.length}/3)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {MUSCLES_LIST.map(m => {
                      const selected = answers.musclesFocus.includes(m)
                      const disabled = !selected && answers.musclesFocus.length >= 3
                      return (
                        <button
                          type="button"
                          key={m}
                          onClick={() => !disabled && toggleMuscle(m)}
                          disabled={disabled}
                          className={`flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all ${
                            selected
                              ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]'
                              : disabled
                                ? 'border-[var(--line)] text-[var(--muted)] opacity-40'
                                : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/50'
                          }`}
                        >
                          {m}
                          {selected && <CheckCircle2 size={14} className="shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </>
          )

        case 14:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Lesões ou exercícios para evitar?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Opcional — pode pular se não tiver nenhuma restrição</p>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-[var(--text)]">Tenho uma lesão</p>
                    <button
                      type="button"
                      onClick={() => setAnswers(prev => ({ ...prev, hasInjury: !prev.hasInjury, injuryDescription: prev.hasInjury ? '' : prev.injuryDescription }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${answers.hasInjury ? 'bg-[var(--brand)]' : 'bg-[var(--line)]'}`}
                    >
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${answers.hasInjury ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {answers.hasInjury && (
                    <motion.textarea
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      value={answers.injuryDescription}
                      onChange={e => setAnswers(prev => ({ ...prev, injuryDescription: e.target.value }))}
                      placeholder="Descreva sua lesão... Ex: dor no joelho direito, hérnia lombar L4-L5"
                      rows={3}
                      className="mt-3 w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
                    />
                  )}
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-[var(--text)]">Quero evitar exercícios</p>
                    <button
                      type="button"
                      onClick={() => setAnswers(prev => ({ ...prev, avoidExercises: prev.avoidExercises ? '' : ' ' }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${answers.avoidExercises.trim() !== '' ? 'bg-[var(--brand)]' : 'bg-[var(--line)]'}`}
                    >
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${answers.avoidExercises.trim() !== '' ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {answers.avoidExercises.trim() !== '' || answers.avoidExercises === ' ' ? (
                    <motion.textarea
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      value={answers.avoidExercises.trimStart()}
                      onChange={e => setAnswers(prev => ({ ...prev, avoidExercises: e.target.value }))}
                      placeholder="Ex: agachamento livre, supino reto, levantamento terra"
                      rows={3}
                      className="mt-3 w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
                    />
                  ) : null}
                </div>
              </div>
            </>
          )

        case 15:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Altura e peso? (opcional)</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Ajuda a calibrar carga inicial e cuidados articulares</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--muted)]">Altura (cm)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={100}
                    max={250}
                    value={answers.heightCm}
                    onChange={e => setAnswers(prev => ({ ...prev, heightCm: e.target.value.replace(/[^\d]/g, '') }))}
                    placeholder="Ex: 175"
                    className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--muted)]">Peso (kg)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={30}
                    max={300}
                    step="0.1"
                    value={answers.weightKg}
                    onChange={e => setAnswers(prev => ({ ...prev, weightKg: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') }))}
                    placeholder="Ex: 75"
                    className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)]"
                  />
                </label>
              </div>
            </>
          )

        case 16:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Quantos exercícios por treino?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Influencia o tamanho da sessão (cobertura obrigatória é mantida)</p>
              <div className="mt-5 space-y-2">
                {[
                  ['Curto', '4-5 exercícios — sessões rápidas e densas'],
                  ['Médio', '6-7 exercícios — equilíbrio padrão'],
                  ['Longo', '8-10 exercícios — volume alto'],
                  ['IA decide', 'A IA escolhe pelo perfil e duração'],
                ].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.exerciseCount === val} onClick={() => selectAndAdvance('exerciseCount', val)} />
                ))}
              </div>
            </>
          )

        case 17:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Proximidade da falha (RIR)?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Quantas repetições deixar na reserva</p>
              <div className="mt-5 space-y-2">
                {[
                  ['Falha', 'Treino até a falha em isolados; RIR 1 em compostos'],
                  ['RIR 1-2', 'Deixo 1-2 reps na reserva (padrão hipertrofia)'],
                  ['RIR 3+', 'Deixo 3+ reps na reserva (foco em técnica/recuperação)'],
                  ['IA decide', 'A IA escolhe pelo nível e exercício'],
                ].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.rirTarget === val} onClick={() => selectAndAdvance('rirTarget', val)} />
                ))}
              </div>
            </>
          )

        case 18:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Quer adicionar algo para a IA?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Exercício específico, observação ou qualquer detalhe extra</p>
              <div className="mt-4 flex gap-2">
                {[true, false].map(val => (
                  <button
                    type="button"
                    key={String(val)}
                    onClick={() => {
                      if (!val) {
                        setAnswers(prev => ({ ...prev, hasExtraInfo: false, extraInfo: '' }))
                        setDirection(1)
                        setAppScreen('REVIEW')
                      } else {
                        setAnswers(prev => ({ ...prev, hasExtraInfo: true }))
                      }
                    }}
                    className={`flex-1 rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                      answers.hasExtraInfo === val
                        ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]'
                        : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/50'
                    }`}
                  >
                    {val ? 'Sim' : 'Não'}
                  </button>
                ))}
              </div>
              {answers.hasExtraInfo === true && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Escreve o que queres incluir ou evitar</p>
                  <textarea
                    value={answers.extraInfo}
                    onChange={e => setAnswers(prev => ({ ...prev, extraInfo: e.target.value }))}
                    placeholder="Ex: quero incluir agachamento búlgaro, prefiro supino inclinado em vez do reto, adicionar exercício para antebraço..."
                    rows={4}
                    className="w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
                  />
                  {extraHistory.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Pedidos recentes</p>
                      <div className="flex flex-wrap gap-1.5">
                        {extraHistory.map((h, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setAnswers(prev => ({ ...prev, extraInfo: h }))}
                            className="max-w-[260px] truncate rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1 text-[11px] font-semibold text-[var(--text)] hover:border-[var(--brand)]/50"
                            title={h}
                          >
                            {h.length > 40 ? h.slice(0, 40) + '…' : h}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </>
          )

        case 19:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual divisão de treino você prefere?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Escolha a estrutura, escreva a sua, ou deixe a IA decidir</p>
              <div className="mt-5 space-y-2">
                {[
                  ['IA decide', 'A IA escolhe a melhor divisão pelo seu perfil (dias, foco, frequência)'],
                  ['Full Body', 'Todos os grupos em cada treino — ótimo para força e frequência alta'],
                  ['Upper/Lower', 'Alterna superior e inferior'],
                  ['Push/Pull/Legs', 'Empurrar / Puxar / Pernas'],
                  ['Torso/Limbs', 'Tronco (peito/costas/ombros) / Membros (braços + pernas)'],
                  ['Especializado inferior', 'Mais dias de perna com focos diferentes (quad / glúteo / posterior)'],
                  ['Bro Split', 'Um grupo muscular dedicado por dia'],
                ].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.splitPreference === val} onClick={() => selectAndAdvance('splitPreference', val)} />
                ))}
                {/* "Outro" não auto-avança — abre textarea pra escrever a divisão. */}
                <OptionCard
                  label="Outro (escrever a minha)"
                  hint="Descreva sua própria divisão — a IA vai entender e gerar"
                  selected={answers.splitPreference === 'Outro'}
                  onClick={() => setAnswers(prev => ({ ...prev, splitPreference: 'Outro' }))}
                />
              </div>
              {answers.splitPreference === 'Outro' && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
                    Escreve a divisão — UM DIA POR LINHA (ou separados por "/")
                  </p>
                  <textarea
                    value={answers.customSplit}
                    onChange={e => setAnswers(prev => ({ ...prev, customSplit: e.target.value }))}
                    placeholder={'Ex:\nPeito e tríceps\nCostas e bíceps\nPernas (foco glúteo)\nOmbros e abdômen'}
                    rows={5}
                    className="w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)]"
                  />
                  <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                    Cada linha vira um treino. A IA cobre os músculos que você escrever em cada dia.
                  </p>
                </motion.div>
              )}
            </>
          )

        default:
          return null
      }
    })()

    return (
      <section className="space-y-4">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          {isEditMode ? (
            <p className="mb-6 text-xs font-bold uppercase tracking-wider text-[var(--brand)]">
              Editando resposta
            </p>
          ) : (
            <ProgressBar step={Math.max(visibleIdx, 0) + 1} total={totalVisible} />
          )}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={{
                enter: (d: number) => ({ x: d * 50, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d * -50, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >
              {stepContent}
            </motion.div>
          </AnimatePresence>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              <ChevronLeft size={15} />
              {isEditMode ? 'Resumo' : step === 0 ? 'Início' : 'Voltar'}
            </button>
            {isEditMode ? (
              needsNextButton && (
                <button
                  type="button"
                  onClick={() => setAppScreen('REVIEW')}
                  disabled={step === 13 && answers.hasFocus === null}
                  className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  Salvar
                </button>
              )
            ) : (
              <>
                {needsNextButton && (
                  <button
                    type="button"
                    onClick={advanceStep}
                    disabled={step === 13 && answers.hasFocus === null}
                    className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {isLastVisibleStep ? 'Ver resumo' : 'Próximo'}
                  </button>
                )}
                {(step === 14 || step === 15) && (
                  <button
                    type="button"
                    onClick={advanceStep}
                    className="text-xs text-[var(--muted)] underline underline-offset-2"
                  >
                    Pular
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    )
  }

  // ─── REVIEW ───────────────────────────────────────────────────────────────

  if (appScreen === 'REVIEW') {
    return (
      <AIReviewScreen
        answers={answers}
        error={error}
        onEditField={(chipStep) => { setIsEditMode(true); setStep(chipStep); setDirection(0); setAppScreen('QUIZ') }}
        onToggleCardio={() => setAnswers((a) => ({ ...a, wantsCardio: !a.wantsCardio }))}
        onGenerate={() => void handleGenerate()}
      />
    )
  }

  // ─── RESULT ───────────────────────────────────────────────────────────────

  return (
    <AIResultScreen
      sections={sections}
      answers={answers}
      resolvedWeekdays={resolvedWeekdays}
      activeDayIndex={activeDayIndex}
      error={error}
      regeneratingIndex={regeneratingIndex}
      saveResults={saveResults}
      expandedExerciseKey={expandedExerciseKey}
      savingIndex={savingIndex}
      swappingKey={swappingKey}
      resultRef={resultRef}
      resetQuiz={resetQuiz}
      handleGenerate={handleGenerate}
      setActiveDayIndex={setActiveDayIndex}
      setExpandedExerciseKey={setExpandedExerciseKey}
      moveExercise={moveExercise}
      swapExercise={swapExercise}
      removeExercise={removeExercise}
      handleSaveOne={handleSaveOne}
      handleRegenerateDay={handleRegenerateDay}
      navigate={navigate}
    />
  )
}
