import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useScrollLock } from '../../hooks/useScrollLock'

type Shape = 'circle' | 'square' | 'portrait'

type Props = {
  src: string
  alt?: string | null
  shape?: Shape
  caption?: string | null
  onClose: () => void
}

export function ImageViewer({ src, alt, shape = 'circle', caption, onClose }: Props) {
  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const radiusClass = shape === 'circle' ? 'rounded-full' : 'rounded-2xl'
  const fitClass = shape === 'portrait' ? 'object-contain' : 'object-cover'
  const isPortrait = shape === 'portrait'
  const containerStyle = isPortrait
    ? { width: 'min(82vw, 440px)', height: 'min(82vh, 640px)' }
    : { width: 'min(82vw, 82vh, 520px)', height: 'min(82vw, 82vh, 520px)' }

  const innerEntrance = isPortrait
    ? { initial: { scale: 0.96, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.98, opacity: 0 } }
    : { initial: { scale: 0.6, opacity: 0, rotate: -2 }, animate: { scale: 1, opacity: 1, rotate: 0 }, exit: { scale: 0.7, opacity: 0 } }

  const innerTransition = isPortrait
    ? { duration: 0.28, ease: 'easeOut' as const }
    : { type: 'spring' as const, stiffness: 260, damping: 22 }

  return createPortal(
    <motion.div
      role="dialog"
      aria-label={alt ?? 'Imagem'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4"
    >
      <motion.div
        initial={innerEntrance.initial}
        animate={innerEntrance.animate}
        exit={innerEntrance.exit}
        transition={innerTransition}
        className="relative"
        style={containerStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {isPortrait ? (
          <div
            aria-hidden
            className={`absolute -inset-6 ${radiusClass} opacity-20 blur-2xl`}
            style={{ background: 'var(--tech-gradient-conic)' }}
          />
        ) : (
          <>
            <div
              aria-hidden
              className={`absolute -inset-[6px] ${radiusClass} opacity-90 animate-[tech-spin_8s_linear_infinite]`}
              style={{ background: 'var(--tech-gradient-conic)' }}
            />
            <div
              aria-hidden
              className={`absolute -inset-2 ${radiusClass} opacity-40 blur-2xl animate-[tech-spin_14s_linear_infinite_reverse]`}
              style={{ background: 'var(--tech-gradient-conic)' }}
            />
          </>
        )}
        <div className={`relative h-full w-full overflow-hidden ${radiusClass} bg-[var(--surface)] ${isPortrait ? 'ring-1 ring-white/15' : 'ring-1 ring-white/10'}`}>
          <motion.img
            src={src}
            alt={alt ?? ''}
            initial={{ scale: isPortrait ? 1.02 : 1.08, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.05, duration: isPortrait ? 0.4 : 0.35, ease: 'easeOut' }}
            className={`h-full w-full ${fitClass}`}
          />
          {!isPortrait && (
            <motion.div
              aria-hidden
              initial={{ y: '-100%' }}
              animate={{ y: '120%' }}
              transition={{ duration: 1.1, ease: 'easeInOut', delay: 0.15 }}
              className="pointer-events-none absolute inset-x-0 h-1/3"
              style={{ background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.18), transparent)' }}
            />
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-1 right-1 h-10 w-10 rounded-full border border-white/20 bg-black/60 backdrop-blur text-white text-base font-bold shadow-lg hover:scale-105 active:scale-95 transition-transform"
        >
          ✕
        </button>
      </motion.div>
      {caption ? (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.25 }}
          className="mt-3 text-center text-xs font-semibold text-white/85"
          onClick={(e) => e.stopPropagation()}
        >
          {caption}
        </motion.p>
      ) : null}
    </motion.div>,
    document.body,
  )
}
