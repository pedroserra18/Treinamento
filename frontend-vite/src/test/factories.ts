// Fábricas de fixtures pros testes da tela de treino. Preenchem os campos
// obrigatórios de ActiveExercise/ExerciseSetInput com valores neutros; cada
// teste sobrescreve só o que importa pro caso. Mantém os testes legíveis (sem
// repetir objetos gigantes) e centraliza o "shape" num lugar só.
import type { ActiveExercise, ExerciseSetInput } from '../pages/train/types'

export function makeSet(overrides: Partial<ExerciseSetInput> = {}): ExerciseSetInput {
  return {
    reps: '',
    weightKg: '',
    rir: '',
    rpe: '',
    setType: 'normal',
    dropSets: [],
    clusterReps: '',
    clusterCount: '',
    checked: false,
    ...overrides,
  }
}

export function makeActiveExercise(overrides: Partial<ActiveExercise> = {}): ActiveExercise {
  return {
    exerciseId: 'ex-1',
    exerciseName: 'Supino reto',
    equipment: 'barbell',
    thumbnailUrl: null,
    videoUrl: null,
    isBodyweight: false,
    allowsExtraLoad: true,
    trackingType: 'REPS',
    suggestedReps: '8-12',
    restDurationSec: 90,
    restRemainingSec: 0,
    restRunning: false,
    restEndsAtMs: null,
    sets: [makeSet()],
    userNote: '',
    supersetGroup: null,
    ...overrides,
  }
}
