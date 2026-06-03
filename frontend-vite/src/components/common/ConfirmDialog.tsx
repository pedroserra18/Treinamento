import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock'

// Diálogo de confirmação com 2 botões (cancelar + confirmar). Aceita
// `destructive` quando a ação primária causa perda de dado — pinta o
// botão de confirmação em vermelho pra deixar visual o risco. Use isto
// pra: descartar treino, deletar rotina, excluir histórico, etc.
// Pra avisos simples sem branching, use InfoDialog.
export function ConfirmDialog({
  open, title, message, onConfirm, onCancel,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', destructive = false,
}: {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}) {
  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      // Escape cancela; Enter confirma. Cuidado: pra ações destrutivas
      // intencionalmente NÃO autoFocus o botão de confirmação (vide
      // markup abaixo) pra evitar confirmação acidental por Enter.
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="confirm-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onCancel}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <motion.div
          key="confirm-dialog"
          initial={{ y: 20, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        >
          <div className="p-5">
            <h2 id="confirm-dialog-title" className="text-[15px] font-bold text-[var(--text)]">
              {title}
            </h2>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-[var(--muted)]">
              {message}
            </p>
          </div>
          <div className="flex gap-2 border-t border-[var(--line)] p-3">
            <button
              type="button"
              autoFocus
              onClick={onCancel}
              style={{ touchAction: 'manipulation' }}
              className="flex-1 rounded-xl border border-[var(--line)] py-2.5 text-[14px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              style={{ touchAction: 'manipulation' }}
              className={`flex-1 rounded-xl py-2.5 text-[14px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(0,0,0,0.4)] transition-colors ${
                destructive
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-[var(--brand)] hover:bg-[var(--brand-strong)]'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
