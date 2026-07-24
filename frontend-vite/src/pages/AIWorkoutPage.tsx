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
import { getProfileDefaults, updateGender, type ProfileDefaults } from '../services/authService'
import { AIWelcomeScreen } from './ai/AIWelcomeScreen'
import { AILoadingScreen } from './ai/AILoadingScreen'
import { AIReviewScreen } from './ai/AIReviewScreen'
import { AIResultScreen } from './ai/AIResultScreen'
import { AIQuizScreen } from './ai/AIQuizScreen'
import { useShowPlanLimit } from '../components/plan/use-plan-limit'
import { catchPlanLimitError } from '../lib/plan-features'
import {
  applyProfileDefaults, buildAIGenerationLabel, buildPrompt,
  clearStaleAnswers, getEffectiveSplit,
  getWorkoutLabels, newAIGenerationId,
  nextVisibleStep, prevVisibleStep, resolveMuscleGroup,
  DEFAULT_ANSWERS, LOADING_MESSAGES,
  type AppScreen, type QuizAnswers, type SaveResult,
} from './ai/ai-workout-utils'

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
    return (
      <AIQuizScreen
        answers={answers}
        step={step}
        direction={direction}
        isEditMode={isEditMode}
        extraHistory={extraHistory}
        authorizedFetch={authorizedFetch}
        profileDefaultsRef={profileDefaultsRef}
        setAnswers={setAnswers}
        setAppScreen={setAppScreen}
        setDirection={setDirection}
        selectAndAdvance={selectAndAdvance}
        selectGender={selectGender}
        toggleTechnique={toggleTechnique}
        toggleMuscle={toggleMuscle}
        goBack={goBack}
        advanceStep={advanceStep}
      />
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
