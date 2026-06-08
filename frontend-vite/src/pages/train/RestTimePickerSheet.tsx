import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { useScrollLock } from '../../hooks/useScrollLock'
import { formatRestOptionLabel, REST_OPTIONS_SEC } from '../../lib/workout-timing'

// Bottom sheet pra escolher tempo de descanso, padronizado pra tanto
// o TrainPage (durante treino ativo) quanto o WorkoutsPage (editar
// rotina). Mostra "Sem descanso" + as opções padrão e confirma via
// "Feito" — clicar fora descarta o draft.
export function RestTimePickerSheet({
  open, currentSec, onConfirm, onClose,
}: {
  open: boolean
  currentSec: number
  onConfirm: (sec: number) => void
  onClose: () => void
}) {
  useScrollLock(open)
  // Mantém um draft local pra o "Feito" só aplicar quando o usuário
  // confirma — clicar fora descarta. O parent passa `key={...}` quando
  // monta o sheet, então useState(currentSec) sempre inicializa fresco
  // pra o exercício correto sem precisar de useEffect sincronizando.
  const [draft, setDraft] = useState<number>(currentSec)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  // "Sem descanso" sempre disponível como primeira opção; resto vem
  // de REST_OPTIONS_SEC (10s, 20s, ..., 60s, 90s, 120s, ..., 300s).
  const options = [0, ...REST_OPTIONS_SEC]

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="rest-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="Selecionar tempo de descanso"
      >
        <motion.div
          key="rest-sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
          style={{ maxHeight: 'min(70vh, 560px)' }}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--line)] sm:hidden" />
          <div className="shrink-0 px-4 pt-3 text-center">
            <h3 className="text-[14px] font-bold text-[var(--text)]">Tempo de Descanso</h3>
          </div>

          {/* Lista rolável de opções — o conjunto cabe sem scroll em
              telas médias mas trava o overflow pra não esticar a sheet
              em telas baixas. */}
          <ul className="flex-1 overflow-y-auto border-t border-[var(--line)]">
            {options.map((sec) => {
              const isCurrent = sec === draft
              return (
                <li key={sec}>
                  <button
                    type="button"
                    onClick={() => setDraft(sec)}
                    className={`flex w-full items-center justify-center gap-2 border-b border-[var(--line)] px-4 py-3 text-center text-[15px] transition-colors ${
                      isCurrent
                        ? 'bg-[var(--brand)]/12 font-bold text-[var(--brand-strong)]'
                        : 'font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {sec === 0 ? 'Sem descanso' : formatRestOptionLabel(sec)}
                    {isCurrent && <Check size={14} className="text-[var(--brand)]" />}
                  </button>
                </li>
              )
            })}
          </ul>

          {/* "Feito" sticky no rodapé — mesma cor do brand, segue o
              padrão dos botões primários do app. */}
          <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] p-3 pb-safe">
            <button
              type="button"
              onClick={() => { onConfirm(draft); onClose() }}
              className="w-full rounded-xl bg-[var(--brand)] py-3 text-[14px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
            >
              Feito
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
