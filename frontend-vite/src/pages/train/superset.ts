import type { ActiveExercise } from './types'

// Helpers de supersérie (cores + próxima letra de grupo) — extraídos do
// TrainPage pra serem compartilhados com os componentes da pasta train/
// (ex.: SupersetPickerSheet). Funções puras.

// Visual marker colors for superset groups — repeated cyclically when
// the workout has more than 5 supersets (rare).
export const SUPERSET_COLORS = [
  '#f97316', // orange-500
  '#22c55e', // green-500
  '#3b82f6', // blue-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
] as const

export function supersetColorFor(group: string | null | undefined): string | null {
  if (!group) return null
  const code = group.toUpperCase().charCodeAt(0)
  const offset = (code - 'A'.charCodeAt(0) + SUPERSET_COLORS.length) % SUPERSET_COLORS.length
  return SUPERSET_COLORS[offset]
}

// Returns the next free superset letter for a workout — A, B, C, ...
// or extends past Z if needed (unlikely).
export function nextSupersetGroupId(exercises: ActiveExercise[]): string {
  const used = new Set(exercises.map((e) => e.supersetGroup).filter((g): g is string => Boolean(g)))
  for (let i = 0; i < 26; i += 1) {
    const letter = String.fromCharCode('A'.charCodeAt(0) + i)
    if (!used.has(letter)) return letter
  }
  return `G${used.size + 1}`
}
