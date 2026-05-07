import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ImageViewer } from './ImageViewer'

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
        {open && <ImageViewer src={src} alt={alt} shape="circle" onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  )
}
