import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useScrollLock } from '../../hooks/useScrollLock'

// Forma mínima que cada item da lista precisa expor pro sheet
// renderizar e reordenar. Mantém o componente reutilizável tanto pelo
// TrainPage (ActiveExercise) quanto pelo WorkoutsPage (PlanExercise),
// só pedindo o que ele realmente desenha.
export type ReorderItem = {
  id: string
  name: string
  thumbnailUrl: string | null
}

// Linha sortable individual usada dentro do sheet de reordenação.
// Diferente do drag no card grande (que usa long-press), aqui o
// usuário já está em modo "Reordenar" explícito — drag é instantâneo
// sem delay. O handle ≡ na direita deixa visual a affordance.
function SortableReorderRow({
  id, index, item,
}: {
  id: string
  index: number
  item: ReorderItem
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    boxShadow: isDragging ? '0 8px 20px -6px rgba(0,0,0,0.4)' : undefined,
    background: isDragging ? 'var(--surface-hover)' : undefined,
    touchAction: 'manipulation',
  }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2"
      {...attributes}
      {...listeners}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[var(--surface-hover)] font-mono text-[10px] font-bold text-[var(--muted)]">
        {index + 1}
      </span>
      {item.thumbnailUrl ? (
        <img src={item.thumbnailUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded-md bg-[var(--surface-hover)]" />
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
        {item.name}
      </span>
      <GripVertical size={18} className="shrink-0 text-[var(--muted)]" aria-hidden />
    </li>
  )
}

// Bottom sheet pra reordenar os exercícios via drag-and-drop. Sem
// setas — o usuário segura qualquer linha e arrasta pra cima ou pra
// baixo, vendo o handle ≡ à direita pra deixar claro a affordance.
// Sem delay (activationConstraint: distance só) porque o usuário já
// está em modo reorder explícito; scroll dentro da lista mantém o
// natural porque o touch precisa se mover 5px+ pra ativar.
export function ReorderExercisesSheet({
  open, items, onReorder, onClose,
}: {
  open: boolean
  items: ReorderItem[]
  // Recebe o array inteiro reordenado em vez de (from, to) pra dar
  // controle total ao caller (pode skipar reordens triviais, etc.).
  onReorder: (next: ReorderItem[]) => void
  onClose: () => void
}) {
  useScrollLock(open)

  // Dentro do sheet usamos distance (5px) em vez de delay — o usuário
  // já entrou em modo reorder, então o gesto deve ser instantâneo.
  // Distance evita ativar drag em um tap leve sem perder responsividade.
  const sheetSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } }),
  )

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((it) => it.id === active.id)
    const newIndex = items.findIndex((it) => it.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="reorder-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="Reordenar exercícios"
      >
        <motion.div
          key="reorder-sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
          style={{ maxHeight: 'min(80vh, 640px)' }}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--line)] sm:hidden" />
          <h3 className="shrink-0 px-4 pb-2 pt-3 text-center text-[14px] font-bold text-[var(--text)]">
            Reordenar Exercícios
          </h3>
          <p className="shrink-0 px-4 pb-2 text-center text-[11px] text-[var(--muted)]">
            Segure e arraste pra reordenar.
          </p>
          <DndContext
            sensors={sheetSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map((it) => it.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="flex-1 overflow-y-auto border-t border-[var(--line)]">
                {items.map((it, idx) => (
                  <SortableReorderRow
                    key={it.id}
                    id={it.id}
                    index={idx}
                    item={it}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] p-3">
            <button
              type="button"
              onClick={onClose}
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
