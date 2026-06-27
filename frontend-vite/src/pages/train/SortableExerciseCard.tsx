import type { ReactNode, CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Wrapper de drag-to-reorder pra cada card de exercício no treino ativo.
// Long-press (250ms + 8px de tolerância) ativa o drag, então toques
// rápidos e scroll continuam funcionando normalmente. O drag NÃO é
// disparado por interação em <input>/<button>/<select> internos — o
// pointer já recebeu o gesto desses elementos primeiro e os listeners
// não burbulham pra cá.
export function SortableExerciseCard({
  id, children, supersetColor,
}: {
  id: string
  children: ReactNode
  supersetColor: string | null
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Card flutuando: opacidade pra mostrar movimento + z-index pra
    // ficar sempre na frente dos outros enquanto arrasta.
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    // Stripe da supersérie + sombra extra enquanto arrasta pra
    // simular um "card levantado" no estilo iOS.
    boxShadow: isDragging
      ? `${supersetColor ? `inset 4px 0 0 0 ${supersetColor}, ` : ''}0 12px 28px -8px rgba(0,0,0,0.45)`
      : (supersetColor ? `inset 4px 0 0 0 ${supersetColor}` : undefined),
    // Manipulation evita que o sistema entenda o long-press como
    // "selecionar texto" ou "copy menu" no iOS Safari.
    touchAction: 'manipulation',
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}
