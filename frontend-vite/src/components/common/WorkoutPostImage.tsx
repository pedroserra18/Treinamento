import { useState } from 'react'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function WorkoutPostImage({ src, alt = 'Foto do treino' }: { src: string; alt?: string }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)

  const isUnusable = !src || src.startsWith('blob:')
  if (errored || isUnusable) return null

  return (
    <>
      <div className="flex w-full items-center justify-center p-3 sm:p-4">
        <div className="group relative aspect-square w-full max-w-[240px]">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-2 rounded-full opacity-40 blur-xl transition-opacity duration-500 group-hover:opacity-90"
            style={{ background: 'radial-gradient(circle, #06b6d4 0%, #2f7cf6 40%, transparent 70%)' }}
          />
          <div
            aria-hidden
            className="absolute -inset-[3px] rounded-full animate-[spin_10s_linear_infinite] group-hover:animate-[spin_3s_linear_infinite]"
            style={{ background: 'conic-gradient(from 0deg, #2f7cf6, #06b6d4, #10b981, #a855f7, #2f7cf6)' }}
          />
          <div
            aria-hidden
            className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/20"
          />
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[var(--surface)] shadow-[inset_0_0_0_2px_var(--surface)] transition-transform duration-300 hover:scale-[1.03]"
            aria-label="Abrir foto em tamanho cheio"
          >
            {!loaded && (
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[var(--surface-hover)] via-[var(--line)] to-[var(--surface-hover)]" />
            )}
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
              className={`relative block h-full w-full rounded-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-transparent to-white/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false) }}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white backdrop-blur transition-colors hover:bg-white/20"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
            <motion.img
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              src={src}
              alt={alt}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
