import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock'

// Diálogo simples de informação com 1 botão (OK). Usado pra avisos
// de borda que merecem chamar atenção sem assustar — ex.: "esse
// exercício já está no treino". Sem ação destrutiva, sem branching:
// é um "entendi, obrigado". Pra confirmações destrutivas use um
// componente próprio com 2 botões e destaque vermelho.
export function InfoDialog({
  open, title, message, onClose, okLabel = 'Entendi',
}: {
  open: boolean
  title: string
  message: string
  onClose: () => void
  okLabel?: string
}) {
  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      // Enter/Escape ambos fecham — o usuário já leu, não tem ação
      // a confirmar, então o atalho de "ok" é qualquer tecla óbvia.
      if (e.key === 'Escape' || e.key === 'Enter') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="info-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-dialog-title"
      >
        <motion.div
          key="info-dialog"
          initial={{ y: 20, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        >
          <div className="p-5">
            <h2 id="info-dialog-title" className="text-[15px] font-bold text-[var(--text)]">
              {title}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">
              {message}
            </p>
          </div>
          <div className="border-t border-[var(--line)] p-3">
            <button
              type="button"
              autoFocus
              onClick={onClose}
              style={{ touchAction: 'manipulation' }}
              className="w-full rounded-xl bg-[var(--brand)] py-2.5 text-[14px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
            >
              {okLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
