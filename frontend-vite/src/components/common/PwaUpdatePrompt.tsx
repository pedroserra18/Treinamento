import { useEffect, useState } from 'react'
import { pwa } from '../../lib/pwa'
import { motion, AnimatePresence } from 'framer-motion'

// Toast discreto que aparece quando o Service Worker baixa uma versão
// nova do app. Toca em "Atualizar" → applyUpdate() → SW pula waiting →
// página recarrega com a versão nova. Toca em "Depois" → some até o
// próximo deploy.
export function PwaUpdatePrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    return pwa.on('updateAvailable', () => setShow(true))
  }, [])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="pwa-update"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          className="fixed inset-x-3 top-safe-plus-3 z-[95] mx-auto max-w-md rounded-2xl border border-[var(--brand)]/40 bg-[var(--surface)] p-3 shadow-2xl backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[var(--text)]">Nova versão disponível</p>
              <p className="text-[11px] text-[var(--muted)]">Atualize agora pra ver as últimas melhorias.</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => setShow(false)}
                className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--text)]"
              >
                Depois
              </button>
              <button
                type="button"
                onClick={() => pwa.applyUpdate()}
                style={{ touchAction: 'manipulation' }}
                className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-[12px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
              >
                Atualizar
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
