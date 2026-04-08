export type ExerciseExplorerOpenPayload = {
  initialQuery?: string
  initialMuscle?: string
  context?: 'ACTIVE_WORKOUT' | 'ROUTINE_EDIT'
}

export type ExerciseExplorerSelection = {
  id: string
  name: string
  primaryMuscleGroup: string
  difficulty: string
  equipment: string
  isBodyweight: boolean
  allowsExtraLoad: boolean
}

const OPEN_EVENT_NAME = 'acad:open-exercise-explorer'
const SELECT_EVENT_NAME = 'acad:select-exercise-from-explorer'

export function openExerciseExplorer(payload?: ExerciseExplorerOpenPayload) {
  window.dispatchEvent(
    new CustomEvent<ExerciseExplorerOpenPayload>(OPEN_EVENT_NAME, {
      detail: payload,
    }),
  )
}

export function getExerciseExplorerEventName() {
  return OPEN_EVENT_NAME
}

export function selectExerciseFromExplorer(payload: ExerciseExplorerSelection) {
  window.dispatchEvent(
    new CustomEvent<ExerciseExplorerSelection>(SELECT_EVENT_NAME, {
      detail: payload,
    }),
  )
}

export function getExerciseExplorerSelectionEventName() {
  return SELECT_EVENT_NAME
}
