import { motion } from 'framer-motion'
import { useExercises } from '../hooks/useExercises'
import { ExerciseCard } from '../components/exercises/ExerciseCard'

export function ExplorePage() {
  const { data, loading, error } = useExercises()

  return (
    <section className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
      >
        <h2 className="text-xl font-extrabold text-[var(--text)]">Explorar treinos</h2>
        <p className="text-sm text-[var(--muted)]">Listagem com placeholder de imagem.</p>
      </motion.div>

      {loading ? <p className="text-sm text-[var(--muted)]">Carregando exercicios...</p> : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      {!loading && !error ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((exercise) => (
            <ExerciseCard key={exercise.id} exercise={exercise} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
