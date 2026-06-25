// Cálculo dos placeholders e do rótulo "Anterior" de cada linha de série no
// treino ativo, derivado da última performance registrada do exercício. Função
// pura — separada do componente pra poder ser testada sem montar React.
import type { TrackingType } from './types'

export type LastSetPerformance = {
  reps: number | null
  weightKg: number | null
  rir: number | null
  rpe: number | null
  durationSec: number | null
  distanceMeters: number | null
}

export type SetPlaceholders = {
  weightPlaceholder: string
  repsLabel: string
  repsPlaceholder: string
  rirPlaceholder: string
  rpePlaceholder: string
  // Rótulo da coluna "Anterior" — em-dash quando não há dado anterior.
  previousLabel: string
}

export function computeSetPlaceholders(
  lastSet: LastSetPerformance | undefined,
  trackingType: TrackingType,
  suggestedReps: string,
): SetPlaceholders {
  const isTime = trackingType === 'TIME'
  const isDistance = trackingType === 'DISTANCE'

  const weightPlaceholder = lastSet?.weightKg != null ? `${lastSet.weightKg} kg` : 'kg'
  const repsLabel = isTime ? 'Tempo (s)' : isDistance ? 'Distância (m)' : 'Repeticoes'
  const trackingDefault = isTime ? '30' : isDistance ? '20' : suggestedReps
  const lastValueForPlaceholder = isTime
    ? lastSet?.durationSec
    : isDistance
      ? lastSet?.distanceMeters
      : lastSet?.reps
  const repsPlaceholder =
    lastValueForPlaceholder != null ? String(lastValueForPlaceholder) : trackingDefault || 'reps'
  const rirPlaceholder = lastSet?.rir != null ? String(lastSet.rir) : 'rir'
  const rpePlaceholder = lastSet?.rpe != null ? String(lastSet.rpe) : 'rpe'

  const previousLabel = (() => {
    if (!lastSet) return '—'
    if (isTime && lastSet.durationSec != null) return `${lastSet.durationSec}s`
    if (isDistance && lastSet.distanceMeters != null) return `${lastSet.distanceMeters}m`
    const reps = lastSet.reps
    const weight = lastSet.weightKg
    if (weight != null && weight > 0 && reps != null) return `${weight}kg × ${reps}`
    if (reps != null) return `${reps} reps`
    return '—'
  })()

  return { weightPlaceholder, repsLabel, repsPlaceholder, rirPlaceholder, rpePlaceholder, previousLabel }
}
