import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useScrollLock } from '../../hooks/useScrollLock'
import type { ActiveExercise } from './types'
import { supersetColorFor } from './superset'

// Picker pra pareamento de supersérie. Lista os OUTROS exercícios do
// treino (exclui o que abriu o sheet). Tap em um deles pareia os dois
// no mesmo grupo. Se o alvo já está numa supersérie, mostra o letrão
// colorido pra o usuário entender que vai entrar no grupo dele.
export function SupersetPickerSheet({
  open, sourceExerciseName, candidates, onPick, onClose,
}: {
  open: boolean
  sourceExerciseName: string
  candidates: Array<{ index: number; exercise: ActiveExercise }>
  onPick: (otherIndex: number) => void
  onClose: () => void
}) {
  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="superset-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="Selecionar exercício para a supersérie"
      >
        <motion.div
          key="superset-sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] pb-safe shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
          style={{ maxHeight: 'min(80vh, 640px)' }}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--line)] sm:hidden" />
          <h3 className="shrink-0 px-4 pb-1 pt-3 text-center text-[14px] font-bold text-[var(--text)]">
            Pareie com…
          </h3>
          <p className="shrink-0 truncate px-4 pb-2 text-center text-[11.5px] text-[var(--muted)]">
            {sourceExerciseName}
          </p>
          {candidates.length === 0 ? (
            <p className="border-t border-[var(--line)] px-4 py-8 text-center text-xs text-[var(--muted)]">
              Adicione pelo menos mais um exercício no treino pra criar uma supersérie.
            </p>
          ) : (
            <ul className="flex-1 overflow-y-auto border-t border-[var(--line)]">
              {candidates.map(({ index, exercise }) => {
                const color = supersetColorFor(exercise.supersetGroup)
                return (
                  <li key={`${exercise.exerciseId}-${index}`}>
                    <button
                      type="button"
                      onClick={() => { onPick(index); onClose() }}
                      className="flex w-full items-center gap-3 border-b border-[var(--line)] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                    >
                      {exercise.thumbnailUrl ? (
                        <img
                          src={exercise.thumbnailUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded-md bg-[var(--surface-hover)]" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
                        {exercise.exerciseName}
                      </span>
                      {color && exercise.supersetGroup && (
                        <span
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-extrabold text-white"
                          style={{ backgroundColor: color }}
                          title={`Já está na supersérie ${exercise.supersetGroup}`}
                        >
                          {exercise.supersetGroup}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
