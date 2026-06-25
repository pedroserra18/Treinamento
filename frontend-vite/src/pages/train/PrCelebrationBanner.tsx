import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

// Floating "novo PR!" banner. Stays visible for ~4s, auto-dismisses,
// and is rendered through a portal so it floats above the page's
// framer-motion transform context. The `key` on celebration.id forces
// a remount when another PR fires while one is still showing, so the
// animation replays instead of stacking.
export function PrCelebrationBanner({
  celebration, onDismiss,
}: {
  celebration: { id: number; exerciseName: string; loadKg: number; previousKg: number | null } | null
  onDismiss: () => void
}) {
  // Keep onDismiss in a ref so re-renders of the parent (the 1s workout
  // timer ticks every second) don't reset the auto-dismiss timeout. Only
  // celebration.id is a real signal to (re)start the timer.
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])
  const celebrationId = celebration?.id ?? null
  useEffect(() => {
    if (celebrationId == null) return
    const id = window.setTimeout(() => dismissRef.current(), 4000)
    return () => window.clearTimeout(id)
  }, [celebrationId])

  return createPortal(
    <AnimatePresence>
      {celebration && (
        <motion.div
          key={`pr-${celebration.id}`}
          initial={{ y: -80, opacity: 0, scale: 0.92 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -60, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="fixed left-1/2 top-4 z-[60] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-2xl border-2 border-[#f1c84a] shadow-[0_18px_40px_-10px_rgba(241,200,74,0.55)] sm:top-6"
          style={{ background: 'linear-gradient(135deg, #fff6d6 0%, #ffe28a 100%)' }}
          role="status"
          aria-live="polite"
        >
          {/* Sparkle background flair — purely decorative */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-40"
            style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
          />
          <div className="relative flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
            <motion.span
              initial={{ rotate: -25, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.05 }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f4c443] text-lg font-black text-[#5a4209] shadow-inner sm:h-11 sm:w-11 sm:text-xl"
              aria-hidden
            >
              ★
            </motion.span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#7a5a08] sm:text-[12px]">
                Novo PR!
              </p>
              <p className="mt-0.5 truncate text-sm font-bold text-[#3a2a00] sm:text-base">
                {celebration.exerciseName}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-[#6a4a00] sm:text-[12px]">
                <b className="text-[13px] font-extrabold text-[#3a2a00] sm:text-[14px]">{celebration.loadKg} kg</b>
                {celebration.previousKg != null && (
                  <span className="ml-2">
                    ▲ +{Number((celebration.loadKg - celebration.previousKg).toFixed(1))} kg vs {celebration.previousKg} kg
                  </span>
                )}
                {celebration.previousKg == null && (
                  <span className="ml-2">primeiro PR neste exercício</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Fechar"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#6a4a00] transition-colors hover:bg-[#f1c84a]/40"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
