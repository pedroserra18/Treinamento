export type SetType = 'normal' | 'warmup' | 'failure' | 'drop' | 'cluster'

export type DropEntry = {
  weightKg: string
  reps: string
}

export const SET_TYPE_OPTIONS: { value: SetType; label: string }[] = [
  { value: 'normal', label: 'Série Normal' },
  { value: 'warmup', label: 'Série de Aquecimento' },
  { value: 'failure', label: 'Série Falhada' },
  { value: 'drop', label: 'Série Drop' },
  { value: 'cluster', label: 'Cluster Set' },
]
