import type { WorkoutSessionHistory } from '../../types/workout'

// One entry from a session's history list — one row per (exercise, setNumber).
export type HistoryEntry = WorkoutSessionHistory['history'][number]

// View-model for one card on the session detail screen: all sets of the same
// exercise within a single session, in execution order.
export type GroupedExerciseHistory = {
  exerciseId: string
  exerciseName: string
  primaryMuscleGroup: string
  entries: HistoryEntry[]
  firstIndex: number
}

// Build the grouped view-model from a session's flat history list. Shared
// between the workout detail page and any future view that renders the same
// per-exercise card layout.
export function groupExerciseHistory(session: WorkoutSessionHistory): GroupedExerciseHistory[] {
  const grouped = new Map<string, GroupedExerciseHistory>()

  const ordered = [...session.history].sort((a, b) => {
    if (a.executionOrder !== b.executionOrder) return a.executionOrder - b.executionOrder
    const byTime = new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
    if (byTime !== 0) return byTime
    if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber
    return a.id.localeCompare(b.id)
  })

  ordered.forEach((entry, index) => {
    const existing = grouped.get(entry.exercise.id)
    if (existing) {
      existing.entries.push(entry)
      return
    }
    grouped.set(entry.exercise.id, {
      exerciseId: entry.exercise.id,
      exerciseName: entry.exercise.name,
      primaryMuscleGroup: entry.exercise.primaryMuscleGroup,
      firstIndex: index,
      entries: [entry],
    })
  })

  return Array.from(grouped.values())
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((group) => ({
      ...group,
      entries: [...group.entries].sort((a, b) => {
        if (a.setNumber !== b.setNumber) return a.setNumber - b.setNumber
        return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
      }),
    }))
}

// RIR is still serialised inside `notes` ("RIR: N"). Used both in the
// detail card and anywhere we want to surface RIR alongside RPE.
export function rirFromNotes(notes: string | null | undefined): number | null {
  if (!notes) return null
  const match = notes.match(/RIR\s*:\s*(\d+)/i)
  if (!match) return null
  const n = Number(match[1])
  return Number.isFinite(n) ? n : null
}

// User-written exercise notes are tagged as `[nota:...]` on the first set's
// `notes` so the back-end schema stays put. Pull them back out for the UI.
export function userNoteFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const match = notes.match(/\[nota:([^\]]+)\]/)
  if (!match) return null
  const value = match[1].trim()
  return value.length > 0 ? value : null
}
