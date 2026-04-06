import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'

export function HomePage() {
  const { isAuthenticated } = useAuth()

  return (
    <section className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">
          React + TypeScript + Vite
        </p>
        <h1 className="mb-3 text-3xl font-black text-[var(--text)] sm:text-4xl">
          Frontend Mobile-First com Dark Mode
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
          Arquitetura preparada em camadas: components, pages, services e hooks. Framer Motion
          aplicado nas transicoes para uma experiencia mais fluida.
        </p>
        <Link
          to={isAuthenticated ? '/exercises' : '/login'}
          className="mt-5 inline-flex rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-strong)]"
        >
          {isAuthenticated ? 'Explorar exercicios' : 'Entrar para continuar'}
        </Link>
      </motion.div>
    </section>
  )
}
