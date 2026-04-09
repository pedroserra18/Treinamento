import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { useCallback, useEffect, useState } from 'react'
import { WorkoutsPage } from './WorkoutsPage'
import { createWorkoutPlan, getRecommendationTemplates } from '../services/workoutService'

type RecommendationTemplateView = { key: string; title: string; structure: string[] }
type RecommendationDayItem = {
  dayNumber: number
  displayName: string
  dayTitle: string
  defaultPlanName: string
}

function adjustTemplatesByDays(
  input: RecommendationTemplateView[],
  daysPerWeek: number,
): RecommendationTemplateView[] {
  const map = new Map(input.map((item) => [item.key, item]))

  if (daysPerWeek <= 1) {
    return [
      {
        key: 'FB',
        title: 'Full Body',
        structure: ['FB'],
      },
    ]
  }

  if (daysPerWeek === 2) {
    return [
      {
        key: 'FB',
        title: 'Full Body',
        structure: ['FB 1', 'FB 2'],
      },
    ]
  }

  if (daysPerWeek === 3) {
    const ppl = map.get('PPL') ?? { key: 'PPL', title: 'Push Pull Legs', structure: ['Push', 'Pull', 'Legs'] }
    const fb = map.get('FB') ?? { key: 'FB', title: 'Full Body', structure: ['FB 1', 'FB 2', 'FB 3'] }
    return [ppl, fb]
  }

  return input
}

function normalizeDayBaseName(raw: string): string {
  const compact = raw.replace(/\s+/g, ' ').trim()
  if (/^full\s*body/i.test(compact)) {
    return 'Full Body'
  }

  return compact
}

function buildTemplateDayItems(template: RecommendationTemplateView): RecommendationDayItem[] {
  const baseNames = template.structure.map((entry) => normalizeDayBaseName(entry))
  const totalByBase: Record<string, number> = {}
  const currentByBase: Record<string, number> = {}

  baseNames.forEach((base) => {
    totalByBase[base] = (totalByBase[base] ?? 0) + 1
  })

  return baseNames.map((base, index) => {
    currentByBase[base] = (currentByBase[base] ?? 0) + 1
    const sequence = currentByBase[base]
    const hasRepeatedBase = (totalByBase[base] ?? 0) > 1
    const displayName = hasRepeatedBase ? `${base} ${sequence}` : base
    const dayNumber = index + 1
    const dayTitle = `Dia ${dayNumber} - ${displayName}`

    return {
      dayNumber,
      displayName,
      dayTitle,
      defaultPlanName: dayTitle,
    }
  })
}

export function WorkoutRecommendationsPage() {
  const { authorizedFetch, user } = useAuth()
  const [daysPerWeek, setDaysPerWeek] = useState<number>(user?.availableDaysPerWeek ?? 4)
  const [sex, setSex] = useState<'MALE' | 'FEMALE' | 'OTHER'>(user?.sex ?? 'OTHER')
  const [templates, setTemplates] = useState<RecommendationTemplateView[]>([])
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [editorPlanId, setEditorPlanId] = useState<string | null>(null)
  const [editorPlanTitle, setEditorPlanTitle] = useState<string>('')

  const getDayActionKey = (templateKey: string, dayNumber: number) => `${templateKey}:${dayNumber}`

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await getRecommendationTemplates(authorizedFetch, { daysPerWeek, sex })
      setTemplates(adjustTemplatesByDays(data.templates, daysPerWeek))
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

  const createAndEditTemplateDay = async (
    template: RecommendationTemplateView,
    dayItem: RecommendationDayItem,
  ) => {
    const actionKey = getDayActionKey(template.key, dayItem.dayNumber)
    const planName = dayItem.defaultPlanName

    try {
      setError(null)
      setSavingKey(actionKey)
      const created = await createWorkoutPlan(authorizedFetch, {
        name: planName,
        description: `Estrutura recomendada: ${template.title} • Dia ${dayItem.dayNumber} (${dayItem.displayName})`,
        source: 'RECOMMENDATION',
        templateKey: `${template.key}-D${dayItem.dayNumber}`,
        daysPerWeek,
      })

      setEditorPlanId(created.id)
      setEditorPlanTitle(planName)
      requestAnimationFrame(() => {
        const target = document.getElementById('recommendation-routine-editor')
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar treino por recomendacao')
    } finally {
      setSavingKey(null)
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

              <div className="mt-3 grid gap-2">
                {buildTemplateDayItems(template).map((dayItem) => {
                  const actionKey = getDayActionKey(template.key, dayItem.dayNumber)
                  const isSaving = savingKey === actionKey

                  return (
                    <div
                      key={actionKey}
                      className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 dark:bg-transparent"
                    >
                      <p className="text-xs font-semibold text-slate-700 dark:text-[var(--text)]">{dayItem.dayTitle}</p>
                      <p className="mt-2 text-xs text-[var(--muted)]">Nome inicial: {dayItem.defaultPlanName}</p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isSaving}
                          className="rounded-md border border-[var(--line)] bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-500 disabled:opacity-60"
                          onClick={() => {
                            void createAndEditTemplateDay(template, dayItem)
                          }}
                        >
                          {isSaving ? 'Preparando editor...' : 'Editar e salvar treino'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </article>

      {editorPlanId ? (
        <section id="recommendation-routine-editor" className="space-y-2">
          <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-extrabold text-[var(--text)]">Editor do treino recomendado</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Edite exercicios, series e descanso de {editorPlanTitle} e finalize em "Salvar treino completo".
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditorPlanId(null)
                  setEditorPlanTitle('')
                }}
                className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
              >
                Fechar editor
              </button>
            </div>
          </article>

          <WorkoutsPage selectedPlanId={editorPlanId} onlySelectedPlan showCreateSection={false} />
        </section>
      ) : null}
    </section>
  )
}
