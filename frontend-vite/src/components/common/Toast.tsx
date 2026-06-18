import { AnimatePresence, motion } from 'framer-motion'

// Toast de 1 mensagem (pill no rodapé central) compartilhado entre telas.
// O estado/auto-dismiss vive no hook useToast (hooks/useToast).
export function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text)] shadow-lg"
        >
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
