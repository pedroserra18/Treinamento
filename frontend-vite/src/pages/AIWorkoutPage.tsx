import { motion } from 'framer-motion'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  generateAIWorkout,
  saveAIWorkout,
  type WorkoutSection,
} from '../services/aiService'

// ─── Filter options ───────────────────────────────────────────────────────────

const MUSCLE_OPTIONS = [
  { value: '', label: 'Sem foco específico' },
  { value: 'Peito', label: 'Peito' },
  { value: 'Costas', label: 'Costas' },
  { value: 'Quadríceps', label: 'Quadríceps' },
  { value: 'Posterior de Coxa', label: 'Posterior de Coxa' },
  { value: 'Glúteo', label: 'Glúteo' },
  { value: 'Ombros', label: 'Ombros' },
  { value: 'Braços', label: 'Braços' },
]

const GOAL_OPTIONS = [
  { value: '', label: 'Qualquer objetivo' },
  { value: 'Hipertrofia', label: 'Hipertrofia' },
  { value: 'Força', label: 'Força' },
  { value: 'Resistência', label: 'Resistência' },
  { value: 'Emagrecimento', label: 'Emagrecimento' },
]

const DURATION_OPTIONS = [
  { value: '', label: 'Sem limite' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '90', label: '90 min' },
  { value: '120', label: '120 min' },
]

const WEEK_DAYS_OPTIONS = [
  { value: '', label: 'Não especificada' },
  { value: '2', label: '2 dias/semana' },
  { value: '3', label: '3 dias/semana' },
  { value: '4', label: '4 dias/semana' },
  { value: '5', label: '5 dias/semana' },
  { value: '6', label: '6 dias/semana' },
]

const SPLIT_OPTIONS = [
  { value: '', label: 'Automática (pela frequência)' },
  { value: 'Full Body', label: 'Full Body' },
  { value: 'Upper/Lower', label: 'Upper / Lower' },
  { value: 'Push/Pull/Legs', label: 'Push / Pull / Legs' },
  { value: 'Torso/Limbs', label: 'Torso / Limbs' },
  { value: 'Bro Split', label: 'Bro Split' },
]

const EQUIPMENT_OPTIONS = [
  { value: '', label: 'Academia (completa)' },
  { value: 'Casa com equipamentos', label: 'Casa com equipamentos' },
  { value: 'Sem equipamento', label: 'Sem equipamento' },
]

const SELECT_CLASS =
  'w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40'

function detectMuscleGroup(name: string): { label: string; color: string } | null {
  const n = name.toLowerCase()
  if (/supino|crucifixo|voador|peitoral|chest/.test(n)) return { label: 'Peito', color: 'bg-red-500/15 text-red-400 border-red-500/30' }
  if (/remada|barra fixa|puxada|pulldown|costas|latíssimo|trapézio|row/.test(n)) return { label: 'Costas', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
  if (/desenvolvimento|elevação lateral|press ombro|shoulder|ombro|deltóide/.test(n)) return { label: 'Ombros', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' }
  if (/rosca|curl|bícep/.test(n)) return { label: 'Bíceps', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }
  if (/trícep|extensão|pulley|dip/.test(n)) return { label: 'Tríceps', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' }
  if (/agachamento|leg|cadeira|mesa|afundo|lunges|squat|stiff|perna/.test(n)) return { label: 'Pernas', color: 'bg-green-500/15 text-green-400 border-green-500/30' }
  if (/glúteo|hip thrust|elevação pélvica/.test(n)) return { label: 'Glúteo', color: 'bg-pink-500/15 text-pink-400 border-pink-500/30' }
  if (/prancha|abdom|crunch|plank/.test(n)) return { label: 'Core', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' }
  return null
}

// ─── Workout plan logic ───────────────────────────────────────────────────────

function getEffectiveSplit(split: string, days: number): string {
  if (split) return split
  if (days <= 3) return 'Full Body'
  if (days <= 4) return 'Upper/Lower'
  return 'Push/Pull/Legs'
}

function getWorkoutLabels(split: string, days: number): string[] {
  const s = getEffectiveSplit(split, days)

  if (s === 'Full Body') {
    if (days <= 1) return ['Full Body']
    return Array.from({ length: days }, (_, i) => `Full Body ${String.fromCharCode(65 + i)}`)
  }

  if (s === 'Upper/Lower') {
    if (days <= 2) return ['Upper', 'Lower']
    if (days === 3) return ['Upper', 'Lower A', 'Lower B']
    return ['Upper A', 'Upper B', 'Lower A', 'Lower B']
  }

  if (s === 'Push/Pull/Legs') {
    if (days <= 3) return ['Push', 'Pull', 'Legs']
    if (days === 4) return ['Push A', 'Pull A', 'Legs', 'Push B']
    if (days === 5) return ['Push A', 'Pull A', 'Legs', 'Push B', 'Pull B']
    return ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']
  }

  if (s === 'Torso/Limbs') {
    if (days <= 2) return ['Torso', 'Limbs']
    if (days === 3) return ['Torso A', 'Torso B', 'Limbs']
    return ['Torso A', 'Torso B', 'Limbs A', 'Limbs B']
  }

  if (s === 'Bro Split') {
    const labels = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços']
    return labels.slice(0, Math.min(days, labels.length))
  }

  return ['Treino']
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SaveResult = {
  planId: string
  planName: string
  foundCount: number
  totalCount: number
}

type GeneratingStep = {
  current: number
  total: number
  label: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AIWorkoutPage() {
  const { authorizedFetch } = useAuth()
  const navigate = useNavigate()

  const [prompt, setPrompt] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('')
  const [goal, setGoal] = useState('')
  const [durationMin, setDurationMin] = useState('')
  const [weekDays, setWeekDays] = useState('')
  const [split, setSplit] = useState('')
  const [equipment, setEquipment] = useState('')
  const [advancedTechniques, setAdvancedTechniques] = useState(false)
  const [injuries, setInjuries] = useState('')

  const [loading, setLoading] = useState(false)
  const [generatingStep, setGeneratingStep] = useState<GeneratingStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sections, setSections] = useState<WorkoutSection[]>([])
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [saveResults, setSaveResults] = useState<Record<number, SaveResult>>({})

  const resultRef = useRef<HTMLDivElement>(null)

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Descreve o treino que pretendes gerar.')
      return
    }

    const days = weekDays ? parseInt(weekDays, 10) : 0
    const labels = days >= 2 ? getWorkoutLabels(split, days) : null
    const effectiveSplit = days >= 2 ? getEffectiveSplit(split, days) : split

    setLoading(true)
    setError(null)
    setSections([])
    setSaveResults({})
    setGeneratingStep(null)

    try {
      if (labels && labels.length > 1) {
        const accumulated: WorkoutSection[] = []

        for (let i = 0; i < labels.length; i++) {
          const label = labels[i]
          setGeneratingStep({ current: i + 1, total: labels.length, label })

          const result = await generateAIWorkout(authorizedFetch, {
            prompt: `${prompt.trim()} — Gera APENAS o treino "${label}" (dia ${i + 1} de ${labels.length} do plano ${effectiveSplit}). Não incluas os outros dias. OBRIGATÓRIO: inclui sempre o bloco JSON no final.`,
            muscleGroup: muscleGroup || undefined,
            goal: goal || undefined,
            durationMin: durationMin || undefined,
            weekDays: weekDays || undefined,
            split: effectiveSplit || undefined,
            equipment: equipment || undefined,
            advancedTechniques: advancedTechniques || undefined,
            injuries: injuries.trim() || undefined,
          })

          const section = result.sections[0]
          if (section) {
            accumulated.push({
              displayText: section.displayText,
              workoutData: section.workoutData
                ? { ...section.workoutData, planName: section.workoutData.planName || label }
                : null,
            })
            setSections([...accumulated])
          }

          if (i === 0) {
            setTimeout(() => {
              resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }, 100)
          }
        }
      } else {
        setGeneratingStep({ current: 1, total: 1, label: '' })

        const result = await generateAIWorkout(authorizedFetch, {
          prompt: prompt.trim(),
          muscleGroup: muscleGroup || undefined,
          goal: goal || undefined,
          durationMin: durationMin || undefined,
          weekDays: weekDays || undefined,
          split: split || undefined,
          equipment: equipment || undefined,
          advancedTechniques: advancedTechniques || undefined,
          injuries: injuries.trim() || undefined,
        })

        setSections(result.sections)

        setTimeout(() => {
          resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar treino. Tenta novamente.')
    } finally {
      setLoading(false)
      setGeneratingStep(null)
    }
  }, [
    authorizedFetch, prompt, muscleGroup, goal, durationMin,
    weekDays, split, equipment, advancedTechniques, injuries,
  ])

  const handleSaveOne = useCallback(async (index: number) => {
    const wd = sections[index]?.workoutData
    if (!wd) return

    setSavingIndex(index)
    setError(null)

    try {
      const result = await saveAIWorkout(authorizedFetch, {
        planName: wd.planName,
        exercises: wd.exercises,
      })

      setSaveResults((prev) => ({
        ...prev,
        [index]: {
          planId: result.planId,
          planName: result.planName,
          foundCount: result.savedExercises.filter((e) => e.found).length,
          totalCount: result.savedExercises.length,
        },
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar treino.')
    } finally {
      setSavingIndex(null)
    }
  }, [authorizedFetch, sections])

  const hasResults = sections.length > 0

  return (
    <section className="space-y-4">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <h1 className="text-2xl font-black text-[var(--text)]">Treino por IA</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Descreve o que pretendes e a IA gera um treino personalizado com exercícios do teu banco de dados.
        </p>
      </motion.header>

      {error ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </motion.p>
      ) : null}

      {/* Form */}
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-5"
      >
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">
            Descreve o treino
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: quero treino para hipertrofia, academia completa..."
            rows={3}
            maxLength={600}
            className="w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40"
          />
          <p className="mt-1 text-right text-xs text-[var(--muted)]">{prompt.length}/600</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Estrutura do treino
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Frequência semanal</label>
              <select value={weekDays} onChange={(e) => setWeekDays(e.target.value)} className={SELECT_CLASS}>
                {WEEK_DAYS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Divisão de treino</label>
              <select value={split} onChange={(e) => setSplit(e.target.value)} className={SELECT_CLASS}>
                {SPLIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Equipamento disponível</label>
              <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className={SELECT_CLASS}>
                {EQUIPMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {weekDays && parseInt(weekDays, 10) >= 2 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {getWorkoutLabels(split, parseInt(weekDays, 10)).map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-[var(--brand)]/30 bg-[var(--brand)]/8 px-3 py-1 text-xs font-semibold text-[var(--brand)]"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Personalização
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Foco muscular</label>
              <select value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)} className={SELECT_CLASS}>
                {MUSCLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Objetivo</label>
              <select value={goal} onChange={(e) => setGoal(e.target.value)} className={SELECT_CLASS}>
                {GOAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Duração</label>
              <select value={durationMin} onChange={(e) => setDurationMin(e.target.value)} className={SELECT_CLASS}>
                {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-4 py-3">
            <input
              id="advanced-techniques"
              type="checkbox"
              checked={advancedTechniques}
              onChange={(e) => setAdvancedTechniques(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            <label htmlFor="advanced-techniques" className="cursor-pointer text-sm text-[var(--text)]">
              Incluir técnicas avançadas
              <span className="ml-1 text-xs text-[var(--muted)]">(Drop Set / Cluster Set)</span>
            </label>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">Lesões / restrições</label>
            <input
              type="text"
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
              placeholder="Ex: dor no ombro direito, hérnia lombar..."
              maxLength={200}
              className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading || !prompt.trim()}
            className="rounded-xl bg-[var(--brand)] px-6 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'A gerar...' : 'Gerar Treino'}
          </button>
          {hasResults && !loading ? (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={loading}
              className="rounded-xl border border-[var(--line)] px-5 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-60"
            >
              Gerar Novamente
            </button>
          ) : null}
        </div>
      </motion.article>

      {/* Results */}
      <div ref={resultRef} className="space-y-4">
        {sections.map((section, idx) => (
          <motion.article
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4"
          >
            {/* Card header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-[var(--text)]">
                {section.workoutData?.planName ?? `Treino ${idx + 1}`}
              </h2>
              <div className="flex items-center gap-2">
                {generatingStep && generatingStep.total > 1 ? (
                  <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                    {idx + 1}/{generatingStep.total}
                  </span>
                ) : null}
                {section.workoutData ? (
                  <span className="rounded-full border border-[var(--brand)]/40 bg-[var(--brand)]/10 px-3 py-1 text-xs font-semibold text-[var(--brand)]">
                    {section.workoutData.exercises.length} exercício{section.workoutData.exercises.length !== 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Exercise list from structured JSON — always consistent */}
            {section.workoutData ? (
              <div className="rounded-xl border border-[var(--line)] overflow-hidden">
                {section.workoutData.exercises.map((ex, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)] last:border-0 odd:bg-[var(--surface)] even:bg-[var(--bg)]"
                  >
                    <span className="w-6 shrink-0 text-center text-xs font-bold text-[var(--brand)]">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-semibold text-[var(--text)] truncate">{ex.name}</p>
                        {(() => { const m = detectMuscleGroup(ex.name); return m ? <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${m.color}`}>{m.label}</span> : null })()}
                      </div>
                      <p className="text-xs text-[var(--muted)]">
                        {ex.sets} séries · {ex.repsMin ?? '?'}–{ex.repsMax ?? '?'} reps
                        {ex.restSec ? ` · ${ex.restSec}s descanso` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* AI observations text */}
            <div className="rounded-xl border border-[var(--line)] p-4">
              <AITextRenderer text={section.displayText} />
            </div>

            {/* Save area */}
            {!saveResults[idx] ? (
              section.workoutData ? (
                <button
                  type="button"
                  onClick={() => void handleSaveOne(idx)}
                  disabled={savingIndex !== null}
                  className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {savingIndex === idx ? 'A guardar...' : 'Guardar Treino'}
                </button>
              ) : (
                <p className="text-xs text-[var(--muted)]">
                  Dados estruturados não disponíveis. Clica em "Gerar Novamente".
                </p>
              )
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 space-y-2"
              >
                <p className="text-sm font-bold text-green-400">
                  "{saveResults[idx].planName}" guardado com sucesso!
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {saveResults[idx].foundCount} de {saveResults[idx].totalCount} exercício
                  {saveResults[idx].totalCount !== 1 ? 's' : ''} adicionado
                  {saveResults[idx].foundCount !== 1 ? 's' : ''} à rotina.
                  {saveResults[idx].foundCount < saveResults[idx].totalCount
                    ? ' Alguns exercícios não foram encontrados na base de dados — podes adicioná-los manualmente.'
                    : ''}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/workouts')}
                  className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
                >
                  Ver nas Rotinas
                </button>
              </motion.div>
            )}
          </motion.article>
        ))}

        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
          >
            <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
            <p className="text-sm text-[var(--muted)]">
              {generatingStep && generatingStep.total > 1
                ? `A gerar treino ${generatingStep.current} de ${generatingStep.total} — ${generatingStep.label}...`
                : 'A IA está a criar o teu treino personalizado...'}
            </p>
          </motion.div>
        ) : null}
      </div>
    </section>
  )
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-bold text-[var(--text)]">{part}</strong>
      : part
  )
}

function AITextRenderer({ text }: { text: string }) {
  const lines = text.split('\n')

  return (
    <div className="space-y-1 text-sm text-[var(--text)]">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="mt-4 text-base font-extrabold text-[var(--text)] first:mt-0">
              {trimmed.slice(3)}
            </h3>
          )
        }
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="mt-3 font-bold text-[var(--text)]">
              {trimmed.slice(4)}
            </h4>
          )
        }
        if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) {
          return (
            <h4 key={idx} className="mt-3 font-bold text-[var(--text)]">
              {trimmed.slice(2, -2)}
            </h4>
          )
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <p key={idx} className="pl-4 text-[var(--muted)]">
              <span className="mr-2 text-[var(--brand)]">•</span>
              {renderInlineBold(trimmed.slice(2))}
            </p>
          )
        }
        if (trimmed === '') {
          return <div key={idx} className="h-2" />
        }
        return (
          <p key={idx} className="leading-relaxed text-[var(--text)]">
            {renderInlineBold(trimmed)}
          </p>
        )
      })}
    </div>
  )
}
