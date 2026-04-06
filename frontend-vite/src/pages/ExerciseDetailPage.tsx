import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { getExerciseById } from '../services/exerciseService'
import type { Exercise } from '../types/exercise'

export function ExerciseDetailPage() {
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!exerciseId) {
      setError('Exercicio invalido')
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const detail = await getExerciseById(exerciseId)
        if (!cancelled) {
          setExercise(detail)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro inesperado')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [exerciseId])

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Carregando detalhe...</p>
  }

  if (error || !exercise) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-500">{error ?? 'Exercicio nao encontrado'}</p>
        <Link className="text-sm font-semibold text-[var(--brand)]" to="/exercises">
          Voltar
        </Link>
      </div>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6"
    >
      <Link className="text-sm font-semibold text-[var(--brand)]" to="/exercises">
        Voltar para listagem
      </Link>

      <h1 className="text-2xl font-black text-[var(--text)] sm:text-3xl">{exercise.name}</h1>

      <img
        src={exercise.thumbnailUrl || '/placeholder-exercise.svg'}
        alt={`Thumbnail de ${exercise.name}`}
        className="h-52 w-full rounded-xl object-cover sm:h-72"
      />

      <div className="grid grid-cols-1 gap-3 text-sm text-[var(--muted)] sm:grid-cols-2">
        <p>
          <span className="font-semibold text-[var(--text)]">Grupo muscular:</span>{' '}
          {exercise.primaryMuscleGroup}
        </p>
        <p>
          <span className="font-semibold text-[var(--text)]">Equipamento:</span> {exercise.equipment}
        </p>
        <p>
          <span className="font-semibold text-[var(--text)]">Dificuldade:</span> {exercise.difficulty}
        </p>
      </div>

      {exercise.videoUrl ? (
        <div className="space-y-2">
          <h2 className="text-base font-bold text-[var(--text)]">Video</h2>
          <video controls className="w-full rounded-xl bg-black" src={exercise.videoUrl}>
            Seu navegador nao suporta video.
          </video>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)]">Este exercicio nao possui video cadastrado.</p>
      )}
    </motion.section>
  )
}
