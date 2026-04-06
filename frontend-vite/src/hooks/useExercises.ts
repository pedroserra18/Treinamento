import { useEffect, useState } from 'react'

import { getExercises } from '../services/exerciseService'
import type { Exercise } from '../types/exercise'

export function useExercises() {
  const [data, setData] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const exercises = await getExercises()
        if (!cancelled) {
          setData(exercises)
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
  }, [])

  return { data, loading, error }
}
