export type SetType = 'normal' | 'warmup' | 'preparatory' | 'failure' | 'drop' | 'cluster'

export type DropEntry = {
  weightKg: string
  reps: string
}

export const SET_TYPE_OPTIONS: { value: SetType; label: string }[] = [
  { value: 'normal', label: 'Série Normal' },
  { value: 'warmup', label: 'Série de Aquecimento' },
  { value: 'preparatory', label: 'Série Preparatória' },
  { value: 'failure', label: 'Série Falhada' },
  { value: 'drop', label: 'Série Drop' },
  { value: 'cluster', label: 'Cluster Set' },
]

// Glifo/cores de cada tipo de série — fonte única usada no treino ativo e no
// builder de rotinas (badge tappável + picker). `letter: null` = série normal
// (mostra o número da série em vez de uma letra).
export const SET_TYPE_GLYPH: Record<
  SetType,
  { letter: string | null; label: string; color: string; bg: string }
> = {
  normal:      { letter: null, label: 'Série Normal',         color: 'var(--text)', bg: 'transparent' },
  warmup:      { letter: 'W',  label: 'Série de Aquecimento', color: '#b58400',     bg: '#fff6d6' },
  preparatory: { letter: 'P',  label: 'Série Preparatória',   color: '#2f8f6b',     bg: '#d7f5e8' },
  failure:     { letter: 'F',  label: 'Série Falhada',        color: '#b14242',     bg: '#ffe1d6' },
  drop:        { letter: 'D',  label: 'Série Drop',           color: '#2c63b8',     bg: '#dbe7ff' },
  cluster:     { letter: 'C',  label: 'Cluster Set',          color: '#5b3aa3',     bg: '#e8dcff' },
}
