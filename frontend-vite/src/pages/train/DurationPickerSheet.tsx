import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { useScrollLock } from '../../hooks/useScrollLock'

// Bottom sheet de duração estilo iOS wheel picker: lista vertical
// com snap, item central destacado, escolha qualquer valor entre 0
// e 5 horas em incrementos de 1 minuto. Substitui o input livre de
// duração no resumo do treino — UX consistente com os outros pickers
// do app (descanso, tipo de set).
export function DurationPickerSheet({
  open, currentMin, onConfirm, onClose, maxMinutes = 300,
}: {
  open: boolean
  currentMin: number
  onConfirm: (min: number) => void
  onClose: () => void
  maxMinutes?: number
}) {
  useScrollLock(open)
  const [draftMin, setDraftMin] = useState<number>(currentMin)
  const listRef = useRef<HTMLDivElement | null>(null)
  // Altura de cada item — bate com `py-3` (24px padding + ~24px text = ~52px)
  // Mantém constante pra cálculo de scroll/snap.
  const ITEM_HEIGHT = 52

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Scrolla pro item atual quando abre (com pequeno delay pro layout
  // estabilizar antes do scrollTo). Usa scrollTo direto pra evitar
  // animação chamativa quando o picker já abre no valor certo.
  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollTop = currentMin * ITEM_HEIGHT
      }
    }, 60)
    return () => window.clearTimeout(id)
  }, [open, currentMin])

  if (!open) return null

  const totalItems = maxMinutes + 1
  const items = Array.from({ length: totalItems }, (_, i) => i)

  function formatMinutes(min: number): string {
    if (min === 0) return '0min'
    if (min < 60) return `${min}min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return `${h}h ${m}min`
  }

  // Detecta qual item está centrado conforme o scroll — só pra refletir
  // visualmente. O draft só é "commitado" no Feito.
  const handleScroll = () => {
    if (!listRef.current) return
    const center = listRef.current.scrollTop
    const idx = Math.round(center / ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(maxMinutes, idx))
    if (clamped !== draftMin) setDraftMin(clamped)
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="dur-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="Selecionar duração"
      >
        <motion.div
          key="dur-sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--line)] sm:hidden" />
          <div className="shrink-0 px-4 pt-3 text-center">
            <h3 className="text-[14px] font-bold text-[var(--text)]">Duração</h3>
          </div>

          {/* Wheel picker — lista scrollável com snap. O destaque do
              item central é renderizado ATRÁS dos itens (z-index 0) pra
              não tampar o texto; os botões ficam no z-index 1 e exibem
              normalmente sobre o highlight. overscroll-x-none impede
              o body de scrollar horizontal quando o gesto chega no
              extremo do scroll vertical (causa do "tela mexendo"). */}
          <div className="relative shrink-0">
            {/* Highlight do item central — z-index 0, abaixo dos botões.
                Posicionado exatamente em cima do item snap-centralizado. */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-3 right-3 z-0 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)]"
              style={{
                top: `calc(50% - ${ITEM_HEIGHT / 2}px)`,
                height: `${ITEM_HEIGHT}px`,
              }}
            />

            <div
              ref={listRef}
              onScroll={handleScroll}
              className="relative z-10 h-[260px] overflow-y-auto overflow-x-hidden"
              style={{ scrollSnapType: 'y mandatory', overscrollBehavior: 'contain' }}
            >
              {/* Padding de cima + baixo de ~104px (= 2 itens) pra o primeiro
                  e o último elemento conseguirem centralizar */}
              <div style={{ height: '104px' }} aria-hidden />
              {items.map((min) => {
                const isCurrent = min === draftMin
                return (
                  <button
                    key={min}
                    type="button"
                    onClick={() => {
                      setDraftMin(min)
                      if (listRef.current) {
                        listRef.current.scrollTo({ top: min * ITEM_HEIGHT, behavior: 'smooth' })
                      }
                    }}
                    style={{ scrollSnapAlign: 'center', height: `${ITEM_HEIGHT}px`, touchAction: 'manipulation' }}
                    className={`relative flex w-full items-center justify-center text-center text-[18px] font-semibold tabular-nums transition-colors ${
                      isCurrent
                        ? 'text-[var(--text)]'
                        : 'text-[var(--muted)] opacity-60'
                    }`}
                  >
                    {formatMinutes(min)}
                  </button>
                )
              })}
              <div style={{ height: '104px' }} aria-hidden />
            </div>
          </div>

          <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] p-3">
            <button
              type="button"
              onClick={() => { onConfirm(draftMin); onClose() }}
              style={{ touchAction: 'manipulation' }}
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
