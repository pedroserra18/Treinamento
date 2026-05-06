import { motion } from 'framer-motion'
import { useExercises } from '../hooks/useExercises'
import { ExerciseCard } from '../components/exercises/ExerciseCard'
import { SkeletonCard } from '../components/common/Skeleton'

export function ExplorePage() {
  const { data, loading, error } = useExercises()

  return (
    <section className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-25 blur-3xl animate-[tech-spin_22s_linear_infinite]"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />
        <h2 className="relative text-xl font-extrabold text-[var(--text)]">Explorar treinos</h2>
        <p className="relative text-sm text-[var(--muted)]">Listagem com placeholder de imagem.</p>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      {!loading && !error ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((exercise, idx) => (
            <motion.div
              key={exercise.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.04 * idx, ease: 'easeOut' }}
            >
              <ExerciseCard exercise={exercise} />
            </motion.div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
