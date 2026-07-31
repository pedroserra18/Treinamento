import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { WorkoutRecommendationsPage } from '../WorkoutRecommendationsPage'

// Tela RECOMMENDATIONS da TrainPage: header + botao voltar + a pagina de
// recomendacoes de treino. Extraida verbatim (estado fica na TrainPage; a
// navegacao volta via callback onBack).
export function TrainRecommendationsScreen({ onBack }: { onBack: () => void }) {
  return (
    <section className="space-y-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">Recomendações</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Escolha uma estrutura e salve como novo treino.</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <ArrowLeft size={16} />
          </button>
        </div>
      </motion.header>
      <WorkoutRecommendationsPage />
    </section>
  )
}
