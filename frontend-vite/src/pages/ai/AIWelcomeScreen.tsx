import { motion } from 'framer-motion'
import { Bot, Clock, History } from 'lucide-react'
import { RecentAIGenerationsSheet } from './RecentAIGenerationsSheet'
import type { AIHistoryGeneration } from '../../services/aiService'

// Tela WELCOME do gerador de treino IA: hero + CTA (Começar / Continuar de onde
// parei) + atalho "Ver treinos gerados" e a sheet de gerações recentes. Só
// apresentação — estado e ações ficam na AIWorkoutPage (passados por props).
export function AIWelcomeScreen({
  hasSavedAnswers,
  onContinue,
  onReset,
  recentGenerations,
  recentSheetOpen,
  recentGenerationsLoading,
  recentGenerationsError,
  onOpenRecent,
  onCloseRecent,
}: {
  hasSavedAnswers: boolean
  onContinue: () => void
  onReset: () => void
  recentGenerations: AIHistoryGeneration[]
  recentSheetOpen: boolean
  recentGenerationsLoading: boolean
  recentGenerationsError: string | null
  onOpenRecent: () => void
  onCloseRecent: () => void
}) {
  return (
    <section className="flex min-h-[70vh] items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl animate-[tech-spin_20s_linear_infinite]"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />
        <div className="relative mx-auto mb-5 h-16 w-16">
          <div
            aria-hidden
            className="absolute -inset-[3px] rounded-2xl animate-[tech-spin_8s_linear_infinite]"
            style={{ background: 'var(--tech-gradient-conic)' }}
          />
          <div className="relative flex h-full w-full items-center justify-center rounded-2xl bg-[var(--surface)]">
            <Bot size={32} className="text-[var(--brand)]" />
          </div>
        </div>
        <h1 className="text-2xl font-black text-[var(--text)]">
          Vamos montar seu treino personalizado
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Responda algumas perguntas rápidas e a IA cria um plano feito especialmente para você
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-4 py-2">
          <Clock size={13} className="text-[var(--muted)]" />
          <span className="text-xs font-semibold text-[var(--muted)]">Menos de 3 minutos</span>
        </div>
        {hasSavedAnswers ? (
          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={onContinue}
              className="w-full rounded-2xl bg-[var(--brand)] py-3.5 text-sm font-bold text-white"
            >
              Continuar de onde parei
            </button>
            <button
              type="button"
              onClick={onReset}
              className="w-full rounded-2xl border border-[var(--line)] py-3 text-xs font-semibold text-[var(--muted)]"
            >
              Começar do zero
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onReset}
            className="mt-6 w-full rounded-2xl bg-[var(--brand)] py-3.5 text-sm font-bold text-white"
          >
            Começar
          </button>
        )}

        {/* "Ver treinos gerados" — só aparece quando há histórico. Estilo
            outline pra não competir visualmente com a ação primária acima. */}
        {recentGenerations.length > 0 && (
          <button
            type="button"
            onClick={onOpenRecent}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--line)] py-3 text-[13px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            <History size={14} />
            Ver treinos gerados ({recentGenerations.length})
          </button>
        )}
      </motion.div>

      <RecentAIGenerationsSheet
        open={recentSheetOpen}
        generations={recentGenerations}
        loading={recentGenerationsLoading}
        error={recentGenerationsError}
        onClose={onCloseRecent}
      />
    </section>
  )
}
