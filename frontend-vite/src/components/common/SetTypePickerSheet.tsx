import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useScrollLock } from '../../hooks/useScrollLock'
import { SET_TYPE_GLYPH, type SetType } from './setTypeOptions'

// Badge tappável da série: mostra a letra do tipo (W/P/F/D/C) ou o número da
// série quando normal. Tocar abre o SetTypePickerSheet. Mesmo visual usado no
// treino ativo e no builder de rotinas (fonte única: SET_TYPE_GLYPH).
export function SetTypeBadge({
  index, setType, onClick, checked,
}: {
  index: number
  setType: SetType
  onClick: () => void
  checked?: boolean
}) {
  const meta = SET_TYPE_GLYPH[setType]
  const display = meta.letter ?? String(index + 1)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Série ${index + 1} — ${meta.label}. Toque para mudar o tipo.`}
      className={`grid h-8 w-8 place-items-center rounded-md text-[13px] font-extrabold transition-colors ${
        checked ? 'opacity-90' : ''
      }`}
      style={{
        color: setType === 'normal' ? 'var(--text)' : meta.color,
        background: setType === 'normal' ? 'var(--surface-hover)' : meta.bg,
        border: '1px solid var(--line)',
      }}
    >
      {display}
    </button>
  )
}

// Bottom sheet to pick the set type (or remove the set). Mobile-first
// but works on desktop too — a centered modal feels right at any width.
export function SetTypePickerSheet({
  open, current, allowedTypes, onSelect, onRemove, onClose,
}: {
  open: boolean
  current: SetType
  allowedTypes?: SetType[]
  onSelect: (type: SetType) => void
  onRemove: () => void
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

  const visibleTypes = (allowedTypes ?? (Object.keys(SET_TYPE_GLYPH) as SetType[])).filter((t) =>
    SET_TYPE_GLYPH[t] !== undefined,
  )

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          key="sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] pb-safe shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-[var(--line)] sm:hidden" />
          <h3 className="px-4 pb-2 pt-3 text-center text-[13px] font-bold text-[var(--text)] sm:text-[14px]">
            Selecionar Tipo de Série
          </h3>
          <ul className="border-t border-[var(--line)]">
            {visibleTypes.map((type) => {
              const meta = SET_TYPE_GLYPH[type]
              const display = meta.letter ?? '1'
              const isCurrent = type === current
              return (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => { onSelect(type); onClose() }}
                    className={`flex w-full items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)] ${
                      isCurrent ? 'bg-[var(--surface-hover)]' : ''
                    }`}
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] font-extrabold"
                      style={{
                        color: type === 'normal' ? 'var(--text)' : meta.color,
                        background: type === 'normal' ? 'var(--surface-hover)' : meta.bg,
                      }}
                    >
                      {display}
                    </span>
                    <span className="flex-1 text-[14px] font-medium text-[var(--text)]">{meta.label}</span>
                    {isCurrent && <span className="text-[var(--brand)]">●</span>}
                  </button>
                </li>
              )
            })}
            <li>
              <button
                type="button"
                onClick={() => { onRemove(); onClose() }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-rose-500/10"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[15px] font-extrabold text-rose-500">
                  ×
                </span>
                <span className="flex-1 text-[14px] font-medium text-rose-500">Remover Série</span>
              </button>
            </li>
          </ul>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
