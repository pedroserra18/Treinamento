import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { formatClock } from '../../lib/workout/workout-timing'
import type { ActiveExercise } from './types'

// Barra fixa de descanso no rodapé do treino ativo. Renderizada via portal pra
// escapar do contexto de transform do framer-motion da rota. Mostra o timer do
// exercício em descanso (com barra de progresso + ajustes ±15s + pular) ou um
// flash de "Descanso concluído" logo após terminar.
export function RestTimerBar({
  activeExercises,
  restFinishedName,
  onAdjust,
  onToggle,
}: {
  activeExercises: ActiveExercise[]
  restFinishedName: string | null
  onAdjust: (exerciseIndex: number, deltaSec: number) => void
  onToggle: (exerciseIndex: number) => void
}) {
  const runningExercise = activeExercises.find((e) => e.restRunning)

  if (runningExercise) {
    const isLow = runningExercise.restRemainingSec <= 10
    const runningIndex = activeExercises.indexOf(runningExercise)
    return createPortal(
      <motion.div
        key="rest-running"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)_+_4.25rem)] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 overflow-hidden rounded-2xl border shadow-2xl px-4 py-3 bg-[var(--surface)] lg:bottom-3 ${
          isLow ? 'border-red-500/40 animate-pulse' : 'border-green-500/40'
        }`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-1 transition-[width] duration-1000 ease-linear"
          style={{
            width: `${runningExercise.restDurationSec > 0
              ? Math.max(0, Math.min(100, (runningExercise.restRemainingSec / runningExercise.restDurationSec) * 100))
              : 0}%`,
            background: isLow
              ? 'linear-gradient(90deg, #ef4444, #f97316)'
              : 'var(--tech-gradient)',
          }}
        />
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Descansando
            </p>
            <p className="truncate text-sm font-semibold text-[var(--text)]">
              {runningExercise.exerciseName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onAdjust(runningIndex, -15)}
            className="shrink-0 rounded-xl border border-[var(--line)] px-2.5 py-2 text-xs font-bold text-[var(--muted)] sm:px-3"
          >
            −15s
          </button>
          <p className={`shrink-0 text-3xl font-black tabular-nums sm:text-4xl ${
            isLow ? 'text-red-400' : 'text-green-400'
          }`}>
            {formatClock(runningExercise.restRemainingSec)}
          </p>
          <button
            type="button"
            onClick={() => onAdjust(runningIndex, 15)}
            className="shrink-0 rounded-xl border border-[var(--line)] px-2.5 py-2 text-xs font-bold text-[var(--muted)] sm:px-3"
          >
            +15s
          </button>
          <button
            type="button"
            onClick={() => onToggle(runningIndex)}
            className="shrink-0 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)] sm:px-4"
          >
            Pular
          </button>
        </div>
      </motion.div>,
      document.body,
    )
  }

  if (restFinishedName) {
    return createPortal(
      <motion.div
        key="rest-finished"
        initial={{ y: 100, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 20 }}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)_+_4.25rem)] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 overflow-hidden rounded-2xl border border-green-500/40 bg-[var(--surface)] shadow-2xl px-4 py-3 pointer-events-none lg:bottom-3"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{ background: 'radial-gradient(circle at 50% 50%, rgba(16,185,129,0.45), transparent 70%)' }}
        />
        <div className="relative flex items-center justify-center gap-3">
          <motion.span
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 15, delay: 0.05 }}
            className="text-2xl text-green-400"
          >
            ✓
          </motion.span>
          <p className="text-base font-bold text-[var(--text)]">Descanso concluído</p>
          <span className="text-sm text-[var(--muted)]">— {restFinishedName}</span>
        </div>
      </motion.div>,
      document.body,
    )
  }

  return null
}
