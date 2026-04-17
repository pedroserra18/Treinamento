import { motion } from 'framer-motion'
import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { generateAIWorkout, saveAIWorkout, type AIWorkoutData } from '../services/aiService'

// ─── Filter options aligned with the system prompt logic ─────────────────────

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

// Frequência semanal → a IA usa para escolher a divisão automaticamente
const WEEK_DAYS_OPTIONS = [
  { value: '', label: 'Não especificada' },
  { value: '2', label: '2 dias/semana' },
  { value: '3', label: '3 dias/semana' },
  { value: '4', label: '4 dias/semana' },
  { value: '5', label: '5 dias/semana' },
  { value: '6', label: '6 dias/semana' },
]

// Divisão de treino — automático ou especificado pelo utilizador
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

// ─── Component ───────────────────────────────────────────────────────────────

export function AIWorkoutPage() {
  const { authorizedFetch } = useAuth()
  const navigate = useNavigate()

  // Basic filters
  const [prompt, setPrompt] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('')
  const [goal, setGoal] = useState('')
  const [durationMin, setDurationMin] = useState('')

  // New filters matching system prompt logic
  const [weekDays, setWeekDays] = useState('')
  const [split, setSplit] = useState('')
  const [equipment, setEquipment] = useState('')
  const [advancedTechniques, setAdvancedTechniques] = useState(false)
  const [injuries, setInjuries] = useState('')

  // State
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayText, setDisplayText] = useState<string | null>(null)
  const [workoutData, setWorkoutData] = useState<AIWorkoutData | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{
    planId: string
    planName: string
    foundCount: number
    totalCount: number
  } | null>(null)

  const resultRef = useRef<HTMLDivElement>(null)

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Descreve o treino que pretendes gerar.')
      return
    }

    setLoading(true)
    setError(null)
    setDisplayText(null)
    setWorkoutData(null)
    setSaveResult(null)

    try {
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

      setDisplayText(result.displayText)
      setWorkoutData(result.workoutData)

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar treino. Tenta novamente.')
    } finally {
      setLoading(false)
    }
  }, [
    authorizedFetch, prompt, muscleGroup, goal, durationMin,
    weekDays, split, equipment, advancedTechniques, injuries,
  ])

  const handleSave = useCallback(async () => {
    if (!workoutData) {
      setError('Sem dados estruturados para guardar. Tenta gerar novamente.')
      return
    }

    setSaving(true)
    setError(null)
    setSaveResult(null)

    try {
      const result = await saveAIWorkout(authorizedFetch, {
        planName: workoutData.planName,
        exercises: workoutData.exercises,
      })

      setSaveResult({
        planId: result.planId,
        planName: result.planName,
        foundCount: result.savedExercises.filter((e) => e.found).length,
        totalCount: result.savedExercises.length,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar treino.')
    } finally {
      setSaving(false)
    }
  }, [authorizedFetch, workoutData])

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
          Descreve o que pretendes e a IA gera um treino personalizado baseado em evidências científicas.
        </p>
      </motion.header>

      {/* Error */}
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
        {/* Prompt */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">
            Descreve o treino
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: quero um treino de costas, tenho 4 dias por semana, foco em hipertrofia..."
            rows={3}
            maxLength={600}
            className="w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40"
          />
          <p className="mt-1 text-right text-xs text-[var(--muted)]">{prompt.length}/600</p>
        </div>

        {/* Row 1: Frequência + Divisão + Equipamento */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Estrutura do treino
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                Frequência semanal
              </label>
              <select value={weekDays} onChange={(e) => setWeekDays(e.target.value)} className={SELECT_CLASS}>
                {WEEK_DAYS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                Divisão de treino
              </label>
              <select value={split} onChange={(e) => setSplit(e.target.value)} className={SELECT_CLASS}>
                {SPLIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                Equipamento disponível
              </label>
              <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className={SELECT_CLASS}>
                {EQUIPMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Row 2: Foco Muscular + Nível + Objetivo + Duração */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Personalização
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                Foco muscular
              </label>
              <select value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)} className={SELECT_CLASS}>
                {MUSCLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                Objetivo
              </label>
              <select value={goal} onChange={(e) => setGoal(e.target.value)} className={SELECT_CLASS}>
                {GOAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
                Duração
              </label>
              <select value={durationMin} onChange={(e) => setDurationMin(e.target.value)} className={SELECT_CLASS}>
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Row 3: Técnicas avançadas + Lesões */}
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
            <label className="block text-[11px] font-medium text-[var(--muted)] mb-1">
              Lesões / restrições
            </label>
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

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading || !prompt.trim()}
            className="rounded-xl bg-[var(--brand)] px-6 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'A gerar...' : 'Gerar Treino'}
          </button>
          {displayText ? (
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

      {/* Loading */}
      {loading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
          <p className="text-sm text-[var(--muted)]">A IA está a criar o teu treino personalizado...</p>
        </motion.div>
      ) : null}

      {/* Result */}
      {displayText && !loading ? (
        <motion.article
          ref={resultRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-[var(--text)]">
              {workoutData?.planName ?? 'Treino Gerado'}
            </h2>
            {workoutData ? (
              <span className="rounded-full border border-[var(--brand)]/40 bg-[var(--brand)]/10 px-3 py-1 text-xs font-semibold text-[var(--brand)]">
                {workoutData.exercises.length} exercício{workoutData.exercises.length !== 1 ? 's' : ''}
              </span>
            ) : null}
          </div>

          {/* AI text */}
          <div className="rounded-xl border border-[var(--line)] p-4">
            <AITextRenderer text={displayText} />
          </div>

          {/* Save */}
          <div className="flex flex-wrap items-center gap-3">
            {workoutData && !saveResult ? (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? 'A guardar...' : 'Guardar Treino'}
              </button>
            ) : null}
            {!workoutData && !saveResult ? (
              <p className="text-xs text-[var(--muted)]">
                A IA não gerou dados estruturados. Clica em "Gerar Novamente" para tentar de novo.
              </p>
            ) : null}
          </div>

          {/* Save result */}
          {saveResult ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-green-500/40 bg-green-500/10 p-4 space-y-2"
            >
              <p className="text-sm font-bold text-green-400">
                "{saveResult.planName}" guardado com sucesso!
              </p>
              <p className="text-xs text-[var(--muted)]">
                {saveResult.foundCount} de {saveResult.totalCount} exercício
                {saveResult.totalCount !== 1 ? 's' : ''} adicionado
                {saveResult.foundCount !== 1 ? 's' : ''} à rotina.
                {saveResult.foundCount < saveResult.totalCount
                  ? ' Alguns exercícios não foram encontrados na base de dados — podes adicioná-los manualmente.'
                  : ''}
              </p>
              <button
                type="button"
                onClick={() => navigate('/train')}
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
              >
                Ver nas Rotinas
              </button>
            </motion.div>
          ) : null}
        </motion.article>
      ) : null}
    </section>
  )
}

// ─── Light markdown renderer ─────────────────────────────────────────────────

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
        if (trimmed.startsWith('### ') || trimmed.startsWith('**') && trimmed.endsWith('**')) {
          const content = trimmed.startsWith('### ')
            ? trimmed.slice(4)
            : trimmed.slice(2, -2)
          return (
            <h4 key={idx} className="mt-3 font-bold text-[var(--text)]">
              {content}
            </h4>
          )
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <p key={idx} className="pl-4 text-[var(--muted)]">
              <span className="mr-2 text-[var(--brand)]">•</span>
              {trimmed.slice(2)}
            </p>
          )
        }
        if (trimmed === '') {
          return <div key={idx} className="h-2" />
        }
        return (
          <p key={idx} className="leading-relaxed text-[var(--text)]">
            {trimmed}
          </p>
        )
      })}
    </div>
  )
}
