import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import { Sparkles, Crown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useScrollLock } from '../../hooks/useScrollLock'
import { getFeatureCopy } from '../../lib/plan-features'

// Dialog único e personalizado pra todos os limites de plano. Aparece
// quando o backend devolve 402 PLAN_LIMIT_REACHED em qualquer feature.
// Visual: gradient laranja sutil, ícone de coroa + sparkles, 2 CTAs.
//
// O texto é DERIVADO da `feature` recebida via lib/plan-features — assim
// add features novas é mudar a tabela, não o componente.
export function PlanLimitDialog({
  open, feature, current, limit, onClose,
}: {
  open: boolean
  feature: string | undefined
  current: number
  limit: number
  onClose: () => void
}) {
  useScrollLock(open)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const copy = getFeatureCopy(feature, current, limit)

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="plan-limit-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 px-4 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-limit-title"
      >
        <motion.div
          key="plan-limit-dialog"
          initial={{ y: 30, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        >
          {/* Halo decorativo brand */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full opacity-25 blur-3xl"
            style={{ background: 'var(--tech-gradient-conic)' }}
          />

          <div className="relative p-6">
            {/* Ícone destacado */}
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-400/20 to-[var(--brand)]/20">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--brand)]/15">
                <Crown size={22} className="text-[var(--brand)]" />
              </div>
            </div>

            <h2
              id="plan-limit-title"
              className="text-center text-[16px] font-extrabold text-[var(--text)]"
            >
              {copy.title}
            </h2>
            <p className="mt-2 text-center text-[13px] leading-relaxed text-[var(--muted)]">
              {copy.body}
            </p>
          </div>

          <div className="relative border-t border-[var(--line)] p-3 pb-safe">
            <button
              type="button"
              autoFocus
              onClick={() => {
                onClose()
                navigate('/settings?section=plan')
              }}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--brand)] to-amber-500 py-3 text-[14px] font-bold text-white shadow-[0_8px_18px_-10px_rgba(255,90,60,0.65)] transition-transform hover:scale-[1.01]"
            >
              <Sparkles size={14} />
              Fazer upgrade pro PRO
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ touchAction: 'manipulation' }}
              className="mt-2 w-full rounded-xl border border-[var(--line)] py-2.5 text-[13px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              {copy.actionHint ?? 'Entendi'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
