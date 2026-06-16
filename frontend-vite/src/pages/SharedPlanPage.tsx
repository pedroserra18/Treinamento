import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { saveSharedPlan, type SharedPlanData } from '../services/socialService'
import { invalidateWorkoutPlansCache } from '../lib/workout-plans-cache'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

async function fetchSharedPlan(token: string): Promise<SharedPlanData> {
  const res = await fetch(`${API_URL}/social/shared/${token}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message ?? 'Rotina não encontrada')
  return json.data as SharedPlanData
}

export function SharedPlanPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user, authorizedFetch } = useAuth()

  const [plan, setPlan] = useState<SharedPlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!token) return
    fetchSharedPlan(token)
      .then(setPlan)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar rotina'))
      .finally(() => setLoading(false))
  }, [token])

  const handleSave = async () => {
    if (!token) return
    if (!user) {
      navigate(`/login?redirect=/shared/${token}`)
      return
    }
    try {
      setSaving(true)
      setError(null)
      await saveSharedPlan(authorizedFetch, token)
      // A rotina foi criada no backend, mas a lista em /train é cacheada por
      // 60s (stale-while-revalidate). Sem invalidar, "Ver meus treinos" mostra
      // a lista velha e a rotina nova "some". Invalida pra forçar refetch.
      invalidateWorkoutPlansCache()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar rotina')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <p className="text-[var(--muted)]">Carregando rotina...</p>
      </div>
    )
  }

  if (error || !plan) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center max-w-sm w-full">
          <p className="text-lg font-bold text-[var(--text)]">Rotina não encontrada</p>
          <p className="mt-2 text-sm text-[var(--muted)]">{error ?? 'Este link pode ter expirado ou ser inválido.'}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mt-4 rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white"
          >
            Ir para o início
          </button>
        </div>
      </div>
    )
  }

  const { plan: p, creator, createdAt } = plan

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-8">
      <div className="mx-auto max-w-xl space-y-4">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl animate-[tech-spin_22s_linear_infinite]"
            style={{ background: 'var(--tech-gradient-conic)' }}
          />
          <div className="relative flex items-center gap-3">
            {creator.avatarUrl ? (
              <img src={creator.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover border border-[var(--line)]" />
            ) : (
              <div className="h-10 w-10 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] flex items-center justify-center text-sm font-bold text-[var(--muted)]">
                {creator.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">{creator.name ?? 'Usuário'} compartilhou uma rotina</p>
              <p className="text-xs text-[var(--muted)]">{new Date(createdAt).toLocaleDateString('pt-BR')}</p>
            </div>
          </div>

          <h1 className="mt-4 text-2xl font-black text-[var(--text)]">{p.name}</h1>
          {p.description && <p className="mt-1 text-sm text-[var(--muted)]">{p.description}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            {saved ? (
              <div className="rounded-xl bg-green-600/20 border border-green-500/40 px-4 py-2 text-sm font-bold text-green-400">
                Rotina salva com sucesso!
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? 'Salvando...' : user ? 'Salvar esta rotina' : 'Entrar para salvar'}
              </button>
            )}
            {saved && (
              <button
                type="button"
                onClick={() => navigate('/train')}
                className="rounded-xl border border-[var(--line)] px-5 py-2 text-sm font-semibold text-[var(--text)]"
              >
                Ver meus treinos
              </button>
            )}
          </div>

          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </motion.header>

        <motion.article
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
        >
          <h2 className="mb-3 text-base font-extrabold text-[var(--text)]">
            Exercícios ({p.exercises.length})
          </h2>
          <div className="space-y-3">
            {p.exercises
              .slice()
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((item) => (
                <div key={item.exercise.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] p-3">
                  {item.exercise.thumbnailUrl ? (
                    <img
                      src={item.exercise.thumbnailUrl}
                      alt={item.exercise.name}
                      className="h-12 w-12 rounded-lg object-cover border border-[var(--line)] shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] shrink-0 flex items-center justify-center text-[10px] font-semibold text-[var(--muted)]">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--text)]">{item.exercise.name}</p>
                    <p className="text-xs text-[var(--muted)]">{item.exercise.primaryMuscleGroup}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {item.sets && (
                      <p className="text-sm font-black text-[var(--text)]">
                        {item.sets}x{' '}
                        {item.repsMin != null && item.repsMax != null
                          ? item.repsMin === item.repsMax
                            ? item.repsMin
                            : `${item.repsMin}–${item.repsMax}`
                          : (item.repsMax ?? item.repsMin ?? '?')}
                      </p>
                    )}
                    {item.restSec && (
                      <p className="text-xs text-[var(--muted)]">Descanso {item.restSec}s</p>
                    )}
                    {item.notes && !item.notes.startsWith('__PERF__:') && (
                      <p className="mt-0.5 text-[11px] text-[var(--muted)] italic line-clamp-1">{item.notes}</p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </motion.article>
      </div>
    </div>
  )
}
