import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

import type { Exercise } from '../../types/exercise'

type ExerciseCardProps = {
  exercise: Exercise
}

export function ExerciseCard({ exercise }: ExerciseCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]"
    >
      <img
        src={exercise.thumbnailUrl || '/placeholder-exercise.svg'}
        alt={`Thumbnail de ${exercise.name}`}
        className="h-40 w-full object-cover"
      />
      <div className="space-y-2 p-4">
        <h3 className="line-clamp-1 text-base font-semibold text-[var(--text)]">{exercise.name}</h3>
        <p className="text-sm text-[var(--muted)]">Grupo: {exercise.primaryMuscleGroup}</p>
        <p className="text-sm text-[var(--muted)]">Dificuldade: {exercise.difficulty}</p>
        <Link
          to={`/exercises/${exercise.id}`}
          className="inline-block rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--brand-strong)]"
        >
          Ver detalhe
        </Link>
      </div>
    </motion.article>
  )
}
