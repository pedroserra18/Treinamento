import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { ArrowUpDown, RefreshCcw, Trash2, Plus, X } from 'lucide-react'
import { useScrollLock } from '../../hooks/useScrollLock'

// Sheet acionado pelo kebab (3 pontinhos verticais) em cima do card
// de exercício. Centraliza as 4 ações canônicas (reordenar / substituir
// / supersérie / remover) pra TrainPage e WorkoutsPage compartilharem
// exatamente o mesmo visual e UX — sem repetir markup nem divergir
// estilo entre as duas telas.
//
// Supersérie é opcional: callers que não suportam (ex.: WorkoutsPage
// no editar rotina, porque o backend ainda não persiste superset em
// plan_exercises) só não passam o handler e o item somem do menu.
export function ExerciseContextMenuSheet({
  open, exerciseName, isInSuperset = false, onReorder, onSubstitute, onAddToSuperset, onRemove, onClose,
}: {
  open: boolean
  exerciseName: string
  isInSuperset?: boolean
  onReorder: () => void
  onSubstitute: () => void
  onAddToSuperset?: () => void
  onRemove: () => void
  onClose: () => void
}) {
  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const items: Array<{
    icon: typeof ArrowUpDown
    label: string
    onClick: () => void
    destructive?: boolean
  }> = [
    { icon: ArrowUpDown, label: 'Reordenar Exercícios', onClick: onReorder },
    { icon: RefreshCcw, label: 'Substituir Exercício', onClick: onSubstitute },
    ...(onAddToSuperset
      ? [{
          icon: (isInSuperset ? X : Plus) as typeof ArrowUpDown,
          label: isInSuperset ? 'Sair da Supersérie' : 'Adicionar A Supersérie',
          onClick: onAddToSuperset,
        }]
      : []),
    { icon: Trash2, label: 'Remover Exercício', onClick: onRemove, destructive: true },
  ]

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="ctx-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label={`Ações para ${exerciseName}`}
      >
        <motion.div
          key="ctx-sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] pb-safe shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-[var(--line)] sm:hidden" />
          <ul className="border-t border-[var(--line)]">
            {items.map((item, idx) => {
              const Icon = item.icon
              const isLast = idx === items.length - 1
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => { item.onClick(); onClose() }}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      !isLast ? 'border-b border-[var(--line)]' : ''
                    } ${
                      item.destructive
                        ? 'text-rose-500 hover:bg-rose-500/10'
                        : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className="text-[14px] font-medium">{item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
