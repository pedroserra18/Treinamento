import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { X, ArrowRight, Bot, Calendar } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useScrollLock } from '../../hooks/useScrollLock'
import type { RecentAIGeneration } from '../../services/aiService'

// Sheet bottom que lista as últimas N gerações de IA (1 row = 1 geração,
// expandível pra mostrar os dias dela). Mesmo padrão visual dos outros
// sheets do app (RestTimePickerSheet, ReorderExercisesSheet, etc.).
//
// Cada dia tem um botão "Abrir" que navega pro /train com o planId — o
// TrainPage decide se continua daquele plano ou só mostra como rotina.
export function RecentAIGenerationsSheet({
  open, generations, loading, error, onClose,
}: {
  open: boolean
  generations: RecentAIGeneration[]
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  useScrollLock(open)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
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
              As últimas {generations.length > 0 ? generations.length : 3} gerações que a IA criou pra você.
            </p>
          </div>

          {/* Body — lista de generations */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loading && (
              <p className="px-4 py-10 text-center text-[12px] text-[var(--muted)]">Carregando…</p>
            )}

            {error && (
              <div className="m-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-center">
                <p className="text-[12px] text-rose-500">{error}</p>
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
                  <li key={gen.aiGenerationId} className="p-4 sm:p-5">
                    <header className="mb-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold text-[var(--text)]">
                          {gen.aiGenerationLabel ?? 'Treino IA'}
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
                      {gen.plans.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => { onClose(); navigate(`/train?planId=${p.id}`) }}
                            className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface)]"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-[var(--text)]">{p.name}</p>
                              <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                                {p.exerciseCount} {p.exerciseCount === 1 ? 'exercício' : 'exercícios'}
                              </p>
                            </div>
                            <ArrowRight size={14} className="shrink-0 text-[var(--muted)]" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer fechar — disponível mesmo em estado vazio/erro */}
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
    </AnimatePresence>,
    document.body,
  )
}

// Formata "há X tempo" em PT-BR, escolhendo unidade certa (min/h/dia/semana/mês).
// Mantido inline porque é específico desse componente e o app não tem helper
// genérico equivalente.
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
