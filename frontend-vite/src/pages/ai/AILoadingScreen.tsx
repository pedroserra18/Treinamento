import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { LOADING_MESSAGES } from './ai-workout-utils'

// Tela LOADING do gerador de treino IA: anel animado + progresso "Dia X de Y"
// (quando há mais de um dia sendo gerado) + mensagens rotativas. Só apresentação
// — os valores vêm por props (estado fica na AIWorkoutPage).
export function AILoadingScreen({
  generatingStep,
  loadingMsgIdx,
}: {
  generatingStep: { current: number; total: number; label: string } | null
  loadingMsgIdx: number
}) {
  return (
    <section className="flex min-h-[70vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-10 text-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 blur-2xl"
          style={{ background: 'radial-gradient(circle at 50% 30%, var(--accent-cyan), transparent 60%)' }}
        />
        <div className="relative mx-auto mb-6 h-20 w-20">
          <div
            aria-hidden
            className="absolute -inset-3 rounded-full opacity-50 blur-md animate-[tech-pulse_2.4s_ease-in-out_infinite]"
            style={{ background: 'var(--tech-gradient-conic)' }}
          />
          <div
            aria-hidden
            className="absolute inset-0 rounded-full animate-[tech-spin_3s_linear_infinite]"
            style={{ background: 'var(--tech-gradient-conic)' }}
          />
          <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-[var(--surface)]">
            <Sparkles size={24} className="text-[var(--brand)] animate-pulse" />
          </div>
        </div>
        {generatingStep && generatingStep.total > 1 && (
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--brand)]">
            Dia {generatingStep.current} de {generatingStep.total} — {generatingStep.label}
          </p>
        )}
        <AnimatePresence mode="wait">
          <motion.p
            key={loadingMsgIdx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="text-base font-semibold text-[var(--text)]"
          >
            {LOADING_MESSAGES[loadingMsgIdx]}
          </motion.p>
        </AnimatePresence>
        <p className="mt-2 text-xs text-[var(--muted)]">Isso pode levar alguns segundos...</p>
      </motion.div>
    </section>
  )
}
