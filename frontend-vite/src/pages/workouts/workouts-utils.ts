import { parsePerfPayload, stripPerfMarker, serializePerfNotes } from '../../lib/workout/perf-notes'
import type { CardioType } from '../../types/workout'
import type { SetType, DropEntry } from '../../components/common/setTypeOptions'

// Helpers puros e tipos de rascunho (draft) extraídos da WorkoutsPage. Não têm
// estado nem dependem de React — só transformam dados. Ficam aqui pra reduzir o
// tamanho da página e para poderem ser testados isoladamente.

export const CARDIO_LABELS: Record<CardioType, string> = {
  WALK: 'Caminhada', RUN: 'Corrida', BIKE: 'Bicicleta', STAIRS: 'Escada',
  ELLIPTICAL: 'Elíptico', ROW: 'Remo', JUMP_ROPE: 'Corda', SWIM: 'Natação', OTHER: 'Outro',
}
export const CARDIO_TYPES = Object.keys(CARDIO_LABELS) as CardioType[]

export type SeriesDraft = {
  reps: string
  loadKg: string
  rpe: string
  rir: string
  setType: SetType
  dropSets: DropEntry[]
  clusterReps: string
  clusterCount: string
}

export type PerformanceDraft = {
  series: SeriesDraft[]
  repsMode: 'fixed' | 'range'
  fixedReps: string
  rangeMin: string
  rangeMax: string
}

export function createSeriesDraft(initial?: Partial<SeriesDraft>): SeriesDraft {
  return {
    reps: initial?.reps ?? '',
    loadKg: initial?.loadKg ?? '',
    rpe: initial?.rpe ?? '',
    rir: initial?.rir ?? '',
    setType: initial?.setType ?? 'normal',
    dropSets: initial?.dropSets ?? [{ weightKg: '', reps: '' }],
    clusterReps: initial?.clusterReps ?? '',
    clusterCount: initial?.clusterCount ?? '',
  }
}

export function estimate1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) {
    return 0
  }

  return weightKg * (1 + 0.0333 * reps)
}

export function parsePerformanceFromNotes(notes: string | null): Partial<PerformanceDraft> {
  const parsed = parsePerfPayload(notes)
  if (!parsed) {
    return {}
  }

  if (Array.isArray(parsed.series) && parsed.series.length > 0) {
    return {
      series: parsed.series.map((entry) =>
        createSeriesDraft({
          reps: entry.reps != null ? String(entry.reps) : '',
          loadKg: entry.loadKg != null ? String(entry.loadKg) : '',
          rpe: entry.rpe != null ? String(entry.rpe) : '',
          rir: entry.rir != null ? String(entry.rir) : '',
          setType: entry.setType ?? 'normal',
          dropSets:
            Array.isArray(entry.dropSets) && entry.dropSets.length > 0
              ? entry.dropSets.map((d) => ({
                  weightKg: d.weightKg != null ? String(d.weightKg) : '',
                  reps: d.reps != null ? String(d.reps) : '',
                }))
              : [{ weightKg: '', reps: '' }],
          clusterReps: entry.clusterReps != null ? String(entry.clusterReps) : '',
          clusterCount: entry.clusterCount != null ? String(entry.clusterCount) : '',
        }),
      ),
    }
  }

  const sets = Math.max(1, Number(parsed.sets ?? 1))
  return {
    series: Array.from({ length: sets }, () =>
      createSeriesDraft({
        reps: parsed.reps != null ? String(parsed.reps) : '',
      }),
    ),
  }
}

export function buildNotesWithPerformance(existing: string | null, draft: PerformanceDraft): string {
  const base = stripPerfMarker(existing)
  const validSeries = draft.series
    .map((entry) => {
      const setType = entry.setType ?? 'normal'

      if (setType === 'drop') {
        const validDrops = entry.dropSets
          .map((d) => ({
            weightKg: d.weightKg ? Number(d.weightKg) : undefined,
            reps: Number(d.reps),
          }))
          .filter((d) => Number.isFinite(d.reps) && d.reps > 0)
        if (validDrops.length === 0) return null
        // Use first drop reps as the canonical reps for plan metadata
        return { reps: validDrops[0]!.reps, setType, dropSets: validDrops }
      }

      if (setType === 'cluster') {
        const cr = Number(entry.clusterReps)
        const cc = Number(entry.clusterCount)
        if (!Number.isFinite(cr) || cr <= 0 || !Number.isFinite(cc) || cc <= 0) return null
        return {
          reps: Math.round(cr * cc),
          loadKg: entry.loadKg ? Number(entry.loadKg) : undefined,
          rir: entry.rir ? Number(entry.rir) : undefined,
          setType,
          clusterReps: cr,
          clusterCount: cc,
        }
      }

      const reps = Number(entry.reps)
      if (!Number.isFinite(reps) || reps <= 0) return null
      return {
        reps,
        loadKg: entry.loadKg ? Number(entry.loadKg) : undefined,
        rpe: entry.rpe ? Number(entry.rpe) : undefined,
        rir: entry.rir ? Number(entry.rir) : undefined,
        setType: setType === 'normal' ? undefined : setType,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const payload = {
    sets: validSeries.length,
    reps: validSeries[0]?.reps,
    rpe: 'rpe' in (validSeries[0] ?? {}) ? (validSeries[0] as { rpe?: number }).rpe : undefined,
    rir: 'rir' in (validSeries[0] ?? {}) ? (validSeries[0] as { rir?: number }).rir : undefined,
    loadKg: 'loadKg' in (validSeries[0] ?? {}) ? (validSeries[0] as { loadKg?: number }).loadKg : undefined,
    series: validSeries,
  }

  return serializePerfNotes(base, payload)
}

export function isDuplicateExerciseError(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('duplicate') || normalized.includes('ja existe') || normalized.includes('already exists')
}
