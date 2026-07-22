import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, Dumbbell, Pencil, Save } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useShowPlanLimit } from '../components/plan/use-plan-limit'
import { catchPlanLimitError } from '../lib/plan-features'
import type { SetType } from '../components/common/setTypeOptions'
import type { WorkoutPlan } from '../types/workout'
import {
  createWorkoutPlanWithExercises,
  updateWorkoutPlanWithExercises,
  listWorkoutPlans,
} from '../services/workoutService'
import {
  createPlanFromRecommendation,
  parseReps,
  recommendationPlanName,
  type WorkoutRecommendation,
} from '../services/recommendationService'
import { planToRoutineInitial } from './train/helpers'
import type { RoutineInitial } from './train/CreateRoutineScreen'

// Editor canônico (mesmo da tela Treinar). Lazy pra não pesar o chunk da
// página quando o usuário só está olhando os dias.
const CreateRoutineScreen = lazy(() =>
  import('./train/CreateRoutineScreen').then((m) => ({ default: m.CreateRoutineScreen })),
)

// Converte um dia da recomendação no formato de pré-preenchimento do
// CreateRoutineScreen (nome + exercícios + séries). Cada série herda o range
// de reps do dia (parseReps); peso/RPE ficam pro treino ativo.
function recommendationToRoutineInitial(rec: WorkoutRecommendation, sessionIndex: number): RoutineInitial {
  const session = rec.sessions[sessionIndex]
  return {
    name: recommendationPlanName(rec, sessionIndex),
    exercises: (session?.exercises ?? []).map((e) => {
      const { repsMin, repsMax } = parseReps(e.reps)
      return {
        exerciseId: e.id,
        exerciseName: e.name,
        thumbnailUrl: null,
        notes: '',
        restSec: e.restSeconds,
        sets: Array.from({ length: Math.max(1, e.sets) }, () => ({
          repsMin: repsMin != null ? String(repsMin) : '',
          repsMax: repsMax != null ? String(repsMax) : '',
          type: 'normal' as SetType,
        })),
      }
    }),
  }
}

// Detalhe de uma recomendação: mostra TODOS os dias da divisão como cards
// compactos (só o nome do dia + nº de exercícios). "Ver / Editar" abre o
// editor CANÔNICO (CreateRoutineScreen, igual ao "Editar Rotina" da Treinar)
// pré-preenchido — sem salvar nada até o usuário confirmar. "Salvar" faz o
// salvamento rápido direto. Ambos passam pelo limite FREE (anúncio PRO).
//
// Estado "salvo" = casado com os planos reais do usuário (listWorkoutPlans),
// por NOME (recommendationPlanName). Recarrega ao focar a janela — se o
// usuário apagar a rotina em Treinar, o dia volta a poder ser salvo.
//
// A recomendação chega via navigation state. Sem state, volta pra Home.
export function RecommendationDetailPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { authorizedFetch } = useAuth()
  const showPlanLimit = useShowPlanLimit()

  const rec = (location.state as { recommendation?: WorkoutRecommendation } | null)?.recommendation

  const [error, setError] = useState<string | null>(null)
  // Dias com salvamento em andamento — mostrados como "Salvo" na hora (UI
  // otimista); reconciliam com plansByName quando o backend responde.
  const [savingIndexes, setSavingIndexes] = useState<Set<number>>(new Set())
  // Editor aberto: sessão + plano existente (edição) ou null (criação).
  const [editing, setEditing] = useState<{ sessionIndex: number; plan: WorkoutPlan | null } | null>(null)
  // name (lowercase) -> plano já salvo. null = carregando.
  const [plansByName, setPlansByName] = useState<Map<string, WorkoutPlan> | null>(null)

  const loadPlans = useCallback(async () => {
    try {
      const plans = await listWorkoutPlans(authorizedFetch)
      const map = new Map<string, WorkoutPlan>()
      for (const p of plans) map.set(p.name.trim().toLowerCase(), p)
      setPlansByName(map)
    } catch {
      setPlansByName(new Map())
    }
  }, [authorizedFetch])

  useEffect(() => {
    void loadPlans()
    const onFocus = () => void loadPlans()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadPlans])

  if (!rec) {
    return <Navigate to="/" replace />
  }

  const savedPlanFor = (index: number): WorkoutPlan | undefined =>
    plansByName?.get(recommendationPlanName(rec, index).trim().toLowerCase())

  // Salvo = já existe no backend OU está sendo salvo agora (otimista).
  const isSaved = (index: number): boolean => savingIndexes.has(index) || savedPlanFor(index) != null

  const markSaving = (index: number) => setSavingIndexes((prev) => new Set(prev).add(index))
  const unmarkSaving = (index: number) =>
    setSavingIndexes((prev) => {
      const next = new Set(prev)
      next.delete(index)
      return next
    })

  // Salvamento rápido (sem abrir o editor). UI OTIMISTA: marca "Salvo" na
  // hora e grava em background; reconcilia via loadPlans. Limite FREE →
  // anúncio PRO; qualquer falha → reverte o "Salvo".
  const quickSave = (index: number) => {
    if (savingIndexes.has(index) || savedPlanFor(index)) return
    markSaving(index)
    setError(null)
    void (async () => {
      try {
        await createPlanFromRecommendation(authorizedFetch, rec, index)
        await loadPlans()
      } catch (err) {
        if (!catchPlanLimitError(err, showPlanLimit)) {
          setError(err instanceof Error ? err.message : 'Falha ao salvar a rotina')
        }
      } finally {
        unmarkSaving(index)
      }
    })()
  }

  // Grava o resultado do editor. Fecha otimista (padrão do app); no create
  // também marca o dia como "Salvo" na hora. Plano existente = update.
  const submitPlan = (
    data: { name: string; exercises: Array<{ exerciseId: string; sets: number; repsMin?: number; repsMax?: number; restSec?: number; notes?: string }> },
    plan: WorkoutPlan | null,
    sessionIndex: number,
  ) => {
    if (!plan) markSaving(sessionIndex)
    setError(null)
    void (async () => {
      try {
        if (plan) {
          await updateWorkoutPlanWithExercises(authorizedFetch, plan.id, { name: data.name, exercises: data.exercises })
        } else {
          await createWorkoutPlanWithExercises(authorizedFetch, { ...data, source: 'RECOMMENDATION' })
        }
        await loadPlans()
      } catch (err) {
        if (!catchPlanLimitError(err, showPlanLimit)) {
          setError(err instanceof Error ? err.message : 'Falha ao salvar a rotina')
        }
      } finally {
        if (!plan) unmarkSaving(sessionIndex)
      }
    })()
  }

  // Editor em tela cheia (mesmo estilo/comportamento do "Editar Rotina").
  if (editing) {
    const plan = editing.plan
    const sessionIndex = editing.sessionIndex
    return (
      <Suspense fallback={<p className="p-4 text-sm text-[var(--muted)]">Carregando editor…</p>}>
        <CreateRoutineScreen
          title={plan ? 'Editar Rotina' : 'Criar Rotina'}
          submitLabel={plan ? 'Atualizar' : 'Salvar'}
          initial={plan ? planToRoutineInitial(plan) : recommendationToRoutineInitial(rec, sessionIndex)}
          onCancel={() => setEditing(null)}
          onSubmit={(data) => {
            setEditing(null)
            submitPlan(data, plan, sessionIndex)
          }}
        />
      </Suspense>
    )
  }

  const loadingPlans = plansByName === null

  return (
    <section className="space-y-4">
      {/* ── HEADER ── */}
      <header className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          aria-label="Voltar para a Home"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-strong)]">
            Recomendação de treino
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-[var(--text)]">{rec.division}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{rec.rationale}</p>
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">
            {rec.sessions.length} {rec.sessions.length === 1 ? 'dia' : 'dias'} · abra em "Ver / Editar" pra ver e ajustar os exercícios.
          </p>
        </div>
      </header>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* ── DIAS (cards compactos) ── */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {rec.sessions.map((session, i) => {
          const savedPlan = savedPlanFor(i)
          const saved = isSaved(i)
          const saving = savingIndexes.has(i)

          return (
            <div key={`${session.dayNumber}-${i}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                  <Dumbbell size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Dia {session.dayNumber}
                  </p>
                  <h2 className="truncate text-[15px] font-bold text-[var(--text)]">
                    {recommendationPlanName(rec, i)}
                  </h2>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--surface-hover)] px-2.5 py-1 font-mono text-[10.5px] font-semibold text-[var(--muted)]">
                  {session.exercises.length} ex
                </span>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={loadingPlans || saving}
                  onClick={() => setEditing({ sessionIndex: i, plan: savedPlan ?? null })}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
                >
                  <Pencil size={13} />
                  Ver / Editar
                </button>
                {saved ? (
                  <span
                    title="Este dia já está salvo na tela Treinar"
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-[12.5px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                  >
                    <Check size={14} /> Salvo
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={loadingPlans}
                    onClick={() => quickSave(i)}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-50"
                  >
                    <Save size={13} />
                    Salvar
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
