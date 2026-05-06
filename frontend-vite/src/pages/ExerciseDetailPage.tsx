import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { Exercise } from '../types/exercise'
import { Link, useParams } from 'react-router-dom'
import { getExerciseById, updateExerciseSecondaryMuscleGroup } from '../services/exerciseService'
import { useAuth } from '../hooks/useAuth'

const MUSCLE_OPTIONS = [
  'CHEST',
  'BACK',
  'SHOULDERS',
  'ARMS',
  'BICEPS',
  'TRICEPS',
  'CORE',
  'LEGS',
  'QUADS',
  'HAMSTRINGS',
  'ADDUCTORS',
  'GLUTES',
  'CALVES',
  'ABDOMEN',
  'FOREARM',
  'FULL_BODY',
]

export function ExerciseDetailPage() {
  const { authorizedFetch, user } = useAuth()
  const { exerciseId } = useParams<{ exerciseId: string }>()
  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [secondaryDraft, setSecondaryDraft] = useState<string>('')
  const [savingSecondary, setSavingSecondary] = useState(false)
  const [secondarySuccess, setSecondarySuccess] = useState<string | null>(null)

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
          setSecondaryDraft(detail.secondaryMuscleGroup ?? '')
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
      className="relative space-y-4 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-20 blur-3xl animate-[tech-spin_22s_linear_infinite]"
        style={{ background: 'var(--tech-gradient-conic)' }}
      />
      <Link className="relative text-sm font-semibold text-[var(--brand)]" to="/exercises">
        Voltar para listagem
      </Link>

      <h1 className="relative text-2xl font-black text-[var(--text)] sm:text-3xl">{exercise.name}</h1>

      <div className="relative overflow-hidden rounded-xl">
        <img
          src={exercise.thumbnailUrl || '/placeholder-exercise.svg'}
          alt={`Thumbnail de ${exercise.name}`}
          className="h-56 w-full object-cover sm:h-72"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm text-[var(--muted)] sm:grid-cols-2">
        <p>
          <span className="font-semibold text-[var(--text)]">Grupo muscular:</span>{' '}
          {exercise.primaryMuscleGroup}
        </p>
        <p>
          <span className="font-semibold text-[var(--text)]">Musculo secundario:</span>{' '}
          {exercise.secondaryMuscleGroup ?? 'Sem musculo secundario'}
        </p>
        <p>
          <span className="font-semibold text-[var(--text)]">Equipamento:</span> {exercise.equipment}
        </p>
        <p>
          <span className="font-semibold text-[var(--text)]">Dificuldade:</span> {exercise.difficulty}
        </p>
      </div>

      {user?.role === 'ADMIN' ? (
        <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <p className="text-sm font-semibold text-[var(--text)]">Editar musculo secundario</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={secondaryDraft}
              onChange={(event) => {
                setSecondaryDraft(event.target.value)
                setSecondarySuccess(null)
              }}
              className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="">Sem musculo secundario</option>
              {MUSCLE_OPTIONS.map((muscle) => (
                <option key={muscle} value={muscle}>
                  {muscle}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={savingSecondary || secondaryDraft === (exercise.secondaryMuscleGroup ?? '')}
              onClick={() => {
                setSavingSecondary(true)
                setError(null)
                setSecondarySuccess(null)

                void updateExerciseSecondaryMuscleGroup(authorizedFetch, {
                  exerciseId: exercise.id,
                  secondaryMuscleGroup: secondaryDraft || null,
                })
                  .then((updated) => {
                    setExercise(updated)
                    setSecondaryDraft(updated.secondaryMuscleGroup ?? '')
                    setSecondarySuccess('Musculo secundario atualizado.')
                  })
                  .catch((err) => {
                    setError(err instanceof Error ? err.message : 'Falha ao atualizar musculo secundario')
                  })
                  .finally(() => {
                    setSavingSecondary(false)
                  })
              }}
              className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingSecondary ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          {secondarySuccess ? <p className="text-xs text-emerald-300">{secondarySuccess}</p> : null}
        </div>
      ) : null}

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
