import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { X, ArrowRight, Bot, Calendar, ChevronDown, ChevronUp, Eye, Dumbbell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useAuth } from '../../hooks/useAuth'
import { cloneAIHistoryPlan, type AIHistoryExercisePreview, type AIHistoryGeneration } from '../../services/aiService'
import { InfoDialog } from '../../components/common/InfoDialog'

// Sheet bottom que lista as últimas N gerações de IA do AIGeneratedPlan
// (histórico INDEPENDENTE de /workouts). Cada dia tem botão "Usar este
// treino" que clona o snapshot pra um WorkoutPlan novo e navega pro /train.
//
// Loading per-item via planUseLoadingId — desabilita os outros botões
// enquanto um está em uso pra evitar double-tap em conexões lentas.
export function RecentAIGenerationsSheet({
  open, generations, loading, error, onClose,
}: {
  open: boolean
  generations: AIHistoryGeneration[]
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  useScrollLock(open)
  const navigate = useNavigate()
  const { authorizedFetch } = useAuth()

  const [planUseLoadingId, setPlanUseLoadingId] = useState<string | null>(null)
  const [useError, setUseError] = useState<string | null>(null)
  // Set de IDs expandidos (preview aberto) — multi-select pra user poder
  // comparar 2 dias da mesma geração antes de escolher um.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  // Alerta "X exercícios não foram encontrados no catálogo" — mostra antes
  // de navegar pra /train pra o user saber o que esperar.
  const [notFoundDialog, setNotFoundDialog] = useState<{ planId: string; planName: string; missing: string[] } | null>(null)

  const toggleExpanded = (planId: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(planId)) next.delete(planId)
      else next.add(planId)
      return next
    })
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const handleUsePlan = async (historyPlanId: string): Promise<void> => {
    setPlanUseLoadingId(historyPlanId)
    setUseError(null)
    try {
      const result = await cloneAIHistoryPlan(authorizedFetch, historyPlanId)
      if (result.notFoundExercises.length > 0) {
        // Avisa o user antes de navegar — alguns exercícios podem ter
        // sido removidos do catálogo entre a geração e o uso.
        setNotFoundDialog({
          planId: result.planId,
          planName: result.planName,
          missing: result.notFoundExercises,
        })
      } else {
        onClose()
        navigate(`/train?planId=${result.planId}`)
      }
    } catch (err) {
      setUseError(err instanceof Error ? err.message : 'Erro ao usar treino')
    } finally {
      setPlanUseLoadingId(null)
    }
  }

  return createPortal(
    <>
    <AnimatePresence>
      <motion.div
        key="recent-ai-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="Treinos gerados pela IA"
      >
        <motion.div
          key="recent-ai-sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
          style={{ maxHeight: 'min(85vh, 720px)' }}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--line)] sm:hidden" />

          {/* Header */}
          <div className="shrink-0 border-b border-[var(--line)] px-4 py-3 sm:px-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot size={16} className="text-[var(--brand)]" />
                <h3 className="text-[14px] font-bold text-[var(--text)]">Treinos gerados pela IA</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)]"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Toque em "Ver" pra conferir os exercícios antes de usar.
            </p>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loading && (
              <p className="px-4 py-10 text-center text-[12px] text-[var(--muted)]">Carregando…</p>
            )}

            {error && (
              <div className="m-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-center">
                <p className="text-[12px] text-rose-500">{error}</p>
              </div>
            )}

            {useError && (
              <div className="m-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-center">
                <p className="text-[12px] text-rose-500">{useError}</p>
              </div>
            )}

            {!loading && !error && generations.length === 0 && (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                <Bot size={36} className="text-[var(--muted)]" />
                <p className="mt-3 text-[13px] font-medium text-[var(--text)]">
                  Nenhum treino gerado ainda
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  Gere seu primeiro treino com IA pra ele aparecer aqui depois.
                </p>
              </div>
            )}

            {!loading && !error && generations.length > 0 && (
              <ul className="divide-y divide-[var(--line)]">
                {generations.map((gen) => (
                  <li key={gen.generationId} className="p-4 sm:p-5">
                    <header className="mb-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold text-[var(--text)]">
                          {gen.generationLabel}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                          <Calendar size={11} />
                          {formatTimeAgo(gen.generatedAt)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                        {gen.plans.length} {gen.plans.length === 1 ? 'dia' : 'dias'}
                      </span>
                    </header>

                    <ul className="space-y-1.5">
                      {gen.plans.map((p) => {
                        const isLoading = planUseLoadingId === p.id
                        const isDisabled = planUseLoadingId !== null
                        const isExpanded = expandedIds.has(p.id)
                        return (
                          <li key={p.id}>
                            <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-hover)]">
                              {/* Linha principal: nome do dia + Ver + Usar */}
                              <div className="flex items-center gap-2 px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13px] font-semibold text-[var(--text)]">{p.dayLabel}</p>
                                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                                    {p.exerciseCount} {p.exerciseCount === 1 ? 'exercício' : 'exercícios'}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(p.id)}
                                  aria-expanded={isExpanded}
                                  aria-label={isExpanded ? 'Esconder exercícios' : 'Ver exercícios'}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                                >
                                  <Eye size={12} />
                                  Ver
                                  {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleUsePlan(p.id)}
                                  disabled={isDisabled}
                                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-2 text-[12px] font-bold text-white shadow-[0_4px_10px_-4px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isLoading ? 'Criando…' : (
                                    <>
                                      Usar
                                      <ArrowRight size={12} />
                                    </>
                                  )}
                                </button>
                              </div>

                              {/* Preview expandida — lista de exercícios. Anima
                                  com height auto via AnimatePresence pra ficar
                                  fluido em mobile. Borda superior separa do
                                  header da row. */}
                              <AnimatePresence initial={false}>
                                {isExpanded && (
                                  <motion.div
                                    key="preview"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.18, ease: 'easeOut' }}
                                    className="overflow-hidden border-t border-[var(--line)]"
                                  >
                                    <ExerciseListPreview exercises={p.exercises} />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer fechar */}
          <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] p-3 pb-safe">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-[var(--line)] py-3 text-[13px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              Fechar
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>

    <InfoDialog
      open={notFoundDialog !== null}
      title="Alguns exercícios não foram encontrados"
      message={
        notFoundDialog
          ? `O treino "${notFoundDialog.planName}" foi criado, mas ${notFoundDialog.missing.length} ${notFoundDialog.missing.length === 1 ? 'exercício não foi adicionado' : 'exercícios não foram adicionados'} porque não estão mais no catálogo:\n\n${notFoundDialog.missing.slice(0, 5).map((n) => `• ${n}`).join('\n')}${notFoundDialog.missing.length > 5 ? `\n• ... +${notFoundDialog.missing.length - 5} outros` : ''}\n\nVocê pode adicioná-los manualmente no treino.`
          : ''
      }
      onClose={() => {
        const target = notFoundDialog
        setNotFoundDialog(null)
        if (target) {
          onClose()
          navigate(`/train?planId=${target.planId}`)
        }
      }}
    />
    </>,
    document.body,
  )
}

// Renderiza a lista de exercícios extraída do snapshot. Mostra nome,
// "sets × reps" (range repsMin-repsMax) e descanso. Notas e grupo muscular
// renderizados como linhas auxiliares quando presentes.
function ExerciseListPreview({ exercises }: { exercises: AIHistoryExercisePreview[] }) {
  if (exercises.length === 0) {
    return (
      <p className="px-3 py-3 text-center text-[11px] text-[var(--muted)]">
        Sem detalhes salvos pra esse treino.
      </p>
    )
  }
  return (
    <ol className="space-y-2 px-3 py-3">
      {exercises.map((ex, i) => (
        <li key={`${i}-${ex.name}`} className="flex items-start gap-2">
          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--brand)]/10 font-mono text-[10px] font-bold text-[var(--brand-strong)]">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-[var(--text)]">{ex.name}</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">{formatSetSpec(ex)}</p>
            {ex.muscleGroup && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                <Dumbbell size={9} />
                {ex.muscleGroup}
              </span>
            )}
            {ex.notes && (
              <p className="mt-1 text-[10px] italic leading-snug text-[var(--muted)]">{ex.notes}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

// Constrói "3 × 8-10 reps · 90s descanso" pulando partes faltantes.
function formatSetSpec(ex: AIHistoryExercisePreview): string {
  const parts: string[] = []
  if (ex.sets != null) {
    const reps = ex.repsMin != null && ex.repsMax != null
      ? ex.repsMin === ex.repsMax ? `${ex.repsMin}` : `${ex.repsMin}-${ex.repsMax}`
      : ex.repsMin != null ? `${ex.repsMin}+` : ex.repsMax != null ? `até ${ex.repsMax}` : null
    parts.push(reps ? `${ex.sets} × ${reps} reps` : `${ex.sets} séries`)
  } else if (ex.repsMin != null || ex.repsMax != null) {
    const reps = ex.repsMin != null && ex.repsMax != null
      ? `${ex.repsMin}-${ex.repsMax}`
      : ex.repsMin ?? ex.repsMax
    parts.push(`${reps} reps`)
  }
  if (ex.restSec != null && ex.restSec > 0) {
    if (ex.restSec < 60) parts.push(`${ex.restSec}s descanso`)
    else {
      const m = Math.floor(ex.restSec / 60)
      const s = ex.restSec % 60
      parts.push(s === 0 ? `${m}min descanso` : `${m}min${s}s descanso`)
    }
  }
  return parts.length > 0 ? parts.join(' · ') : 'Sem detalhes'
}

// Formata "há X tempo" em PT-BR, escolhendo unidade certa (min/h/dia/semana/mês).
function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffMs = Math.max(0, now - then)
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min atrás`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hora' : 'horas'} atrás`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? 'dia' : 'dias'} atrás`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} ${weeks === 1 ? 'semana' : 'semanas'} atrás`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'} atrás`
  const years = Math.floor(days / 365)
  return `${years} ${years === 1 ? 'ano' : 'anos'} atrás`
}

