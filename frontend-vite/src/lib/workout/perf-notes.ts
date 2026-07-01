import type { SetType } from '../../components/common/setTypeOptions'

// Fonte ÚNICA da convenção __PERF__: dados estruturados por-série encodados no
// campo `notes` do plano (o backend só guarda como texto). Antes essa lógica
// estava duplicada em CreateRoutineScreen, WorkoutsPage e TrainPage — qualquer
// divergência entre elas virava bug silencioso de rotina. Centralizado aqui.
export const PERF_MARKER = '__PERF__:'

// Uma série encodada. Superset — cada tela usa só o subconjunto que precisa
// (o builder de rotina usa reps/setType; o editor completo usa tudo).
export type PerfSeries = {
  reps?: number
  repsMin?: number
  repsMax?: number
  loadKg?: number
  rpe?: number
  rir?: number
  setType?: SetType
  dropSets?: Array<{ weightKg?: number; reps?: number }>
  clusterReps?: number
  clusterCount?: number
}

export type PerfPayload = {
  sets?: number
  reps?: number
  rpe?: number
  rir?: number
  loadKg?: number
  series?: PerfSeries[]
}

// Nota do usuário = texto antes do marcador, já trimado. Funciona mesmo quando
// não há marcador (devolve a nota inteira trimada).
export function stripPerfMarker(notes: string | null | undefined): string {
  return (notes ?? '').split(PERF_MARKER)[0].trim()
}

// Payload estruturado, ou null se não há marcador / JSON inválido (defensivo:
// nunca lança — nota corrompida só cai no fallback de quem chama).
export function parsePerfPayload(notes: string | null | undefined): PerfPayload | null {
  if (!notes || !notes.includes(PERF_MARKER)) return null
  const raw = notes.slice(notes.indexOf(PERF_MARKER) + PERF_MARKER.length).trim()
  try {
    return JSON.parse(raw) as PerfPayload
  } catch {
    return null
  }
}

// Monta o `notes` final: nota do usuário + marcador + JSON. Mesma string que as
// 3 telas geravam inline (espaço entre nota e marcador só quando há nota).
export function serializePerfNotes(userNote: string, payload: PerfPayload): string {
  const base = userNote.trim()
  return `${base}${base ? ' ' : ''}${PERF_MARKER}${JSON.stringify(payload)}`.trim()
}
