import { useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

// Wrapper de série com 2 affordances pra deletar:
//   • Mobile: swipe horizontal pra esquerda revela um botão "Deletar"
//     vermelho atrás da row (estilo iOS / Hevy do print do usuário).
//     Tap em qualquer lugar do conteúdo enquanto revelado fecha o swipe.
//   • Desktop: botão pequeno (X) visível no canto direito permanente.
//     Hover pinta vermelho. Sem swipe necessário.
//
// O drag é horizontal-only com restrição de range (-REVEAL_PX a 0) e
// snap automático: solta com offset > metade do REVEAL → snapa pro
// revelado; senão volta a 0.
export function SwipeableSetRow({
  onDelete, children,
}: {
  onDelete: () => void
  children: React.ReactNode
}) {
  const REVEAL_PX = 88
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Botão "Deletar" atrás da row — visível só quando swipe revela.
          Em desktop fica escondido pra dar lugar ao botão X. */}
      <button
        type="button"
        onClick={() => { onDelete(); setRevealed(false) }}
        aria-label="Deletar série"
        style={{ width: `${REVEAL_PX}px`, touchAction: 'manipulation' }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 text-[13px] font-bold text-white transition-colors hover:bg-red-600 sm:hidden"
      >
        Deletar
      </button>

      <motion.div
        drag="x"
        dragConstraints={{ left: -REVEAL_PX, right: 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        animate={{ x: revealed ? -REVEAL_PX : 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        onDragEnd={(_, info) => {
          // Snap binário: passou da metade → revelado; senão volta.
          // Usa velocity também pra reagir bem a "flick" rápido.
          const shouldReveal =
            info.offset.x < -REVEAL_PX / 2 || info.velocity.x < -300
          setRevealed(shouldReveal)
        }}
        onClick={() => {
          // Tap em qualquer parte do conteúdo enquanto revelado fecha o
          // swipe sem deletar — UX iOS clássica.
          if (revealed) setRevealed(false)
        }}
        // pointer-events-auto garante que o motion.div fique acima do
        // botão Deletar visualmente, mesmo quando x=0 (cobrindo ele).
        className="relative bg-[var(--surface)]"
      >
        {children}

        {/* Botão X em desktop — sempre visível, posicionado discreto
            no canto direito. Hover pinta vermelho. Hidden no mobile
            pra liberar o gesto de swipe. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          aria-label="Deletar série"
          title="Deletar série"
          className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 sm:inline-flex"
        >
          <X size={13} />
        </button>
      </motion.div>
    </div>
  )
}
