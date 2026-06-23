// Formatadores puros da tela de treino — extraídos do TrainPage pra reduzir o
// arquivo e permitir testar de forma isolada. Sem estado, sem dependências.

export function formatDurationCompact(sec: number): string {
  if (sec < 60) return `${sec}s`
  const totalMin = Math.round(sec / 60)
  if (totalMin < 60) return `${totalMin}min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

// Monta a string "124 kg × 4 reps" pra usar no body do push de descanso.
// Cuida dos casos especiais:
//   • bodyweight (sem barra/halter): só "4 reps", sem peso
//   • só peso preenchido: "124 kg"
//   • só reps preenchido: "4 reps"
//   • nada preenchido: null (caller omite a parte "última: ...")
// Normaliza ponto pra vírgula (formato BR) e remove decimais redundantes.
export function formatSetPerformanceLabel(
  set: { weightKg: string; reps: string },
  isBodyweight: boolean,
): string | null {
  const reps = (set.reps ?? '').trim()
  const weight = (set.weightKg ?? '').trim()
  if (!reps && !weight) return null

  const repsLabel = reps ? `${reps} reps` : null
  if (isBodyweight) return repsLabel

  if (!weight) return repsLabel
  // Substitui o ponto decimal por vírgula (formato BR) e tira o ".0"
  // que aparece quando o user digitou 100,0 — fica só "100 kg".
  const trimmedWeight = weight.replace('.', ',').replace(/,0+$/, '')
  const weightLabel = `${trimmedWeight} kg`
  return repsLabel ? `${weightLabel} × ${repsLabel}` : weightLabel
}

export function formatMinutesLabel(minutes: number): string {
  if (minutes < 1) return '0min'
  if (minutes < 60) return `${minutes}min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}
