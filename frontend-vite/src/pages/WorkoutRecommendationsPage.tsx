import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { useCallback, useEffect, useState } from 'react'
import { createWorkoutPlan, getRecommendationTemplates } from '../services/workoutService'

type RecommendationTemplateView = { key: string; title: string; structure: string[] }

const DEFAULT_LOW_FREQUENCY_TEMPLATES: RecommendationTemplateView[] = [
  { key: 'PPL', title: 'Push Pull Legs', structure: ['Push', 'Pull', 'Legs'] },
  { key: 'FB', title: 'Full Body', structure: ['Full Body A', 'Full Body B', 'Full Body C'] },
]

function ensureLowFrequencyTemplates(input: RecommendationTemplateView[]): RecommendationTemplateView[] {
  const map = new Map(input.map((item) => [item.key, item]))
  DEFAULT_LOW_FREQUENCY_TEMPLATES.forEach((item) => {
    if (!map.has(item.key)) {
      map.set(item.key, item)
    }
  })

  const orderedKeys = ['PPL', 'FB', ...Array.from(map.keys()).filter((key) => key !== 'PPL' && key !== 'FB')]
  return orderedKeys.map((key) => map.get(key)).filter((item): item is RecommendationTemplateView => Boolean(item))
}

export function WorkoutRecommendationsPage() {
  const { authorizedFetch, user } = useAuth()
  const [daysPerWeek, setDaysPerWeek] = useState<number>(user?.availableDaysPerWeek ?? 4)
  const [sex, setSex] = useState<'MALE' | 'FEMALE' | 'OTHER'>(user?.sex ?? 'OTHER')
  const [templates, setTemplates] = useState<RecommendationTemplateView[]>([])
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await getRecommendationTemplates(authorizedFetch, { daysPerWeek, sex })
      setTemplates(daysPerWeek <= 3 ? ensureLowFrequencyTemplates(data.templates) : data.templates)
      setWarning(data.warning)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar recomendacoes')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch, daysPerWeek, sex])

  useEffect(() => {
    if (typeof user?.availableDaysPerWeek === 'number') {
      setDaysPerWeek(user.availableDaysPerWeek)
    }

    if (user?.sex) {
      setSex(user.sex)
    }
  }, [user?.availableDaysPerWeek, user?.sex])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const createFromTemplate = async (template: { key: string; title: string }) => {
    try {
      await createWorkoutPlan(authorizedFetch, {
        name: `Treino ${template.title}`,
        description: `Estrutura recomendada: ${template.title}`,
        source: 'RECOMMENDATION',
        templateKey: template.key,
        daysPerWeek,
      })
      window.alert('Treino salvo com sucesso.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar treino por recomendacao')
    }
  }

  return (
    <section className="space-y-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
      >
        <h1 className="text-2xl font-black text-[var(--text)]">Recomendacoes de treino</h1>
        <p className="text-sm text-[var(--muted)]">Escolha uma estrutura e salve como novo treino.</p>
      </motion.header>

      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap gap-2">
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
            className="rounded-lg bg-[var(--brand)] px-3 py-1 text-sm font-bold text-black"
            onClick={() => {
              void loadTemplates()
            }}
          >
            Atualizar
          </button>
        </div>

        {loading ? <p className="mt-2 text-sm text-[var(--muted)]">Carregando...</p> : null}
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        {warning ? <p className="mt-2 text-sm text-amber-300">{warning}</p> : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {templates.map((template) => (
            <div key={template.key} className="rounded-xl border border-[var(--line)] p-3">
              <p className="font-bold text-[var(--text)]">{template.title}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{template.structure.join(' • ')}</p>
              <button
                type="button"
                className="mt-2 rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                onClick={() => {
                  void createFromTemplate(template)
                }}
              >
                Salvar treino recomendado
              </button>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
