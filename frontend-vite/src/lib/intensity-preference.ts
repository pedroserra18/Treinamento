// Preferência do usuário pra como rastrear intensidade durante o
// treino: RIR (reps in reserve, modelo escola Bryce Lewis / Beardsley)
// ou RPE (rate of perceived exertion, 1-10). Ambos exibem os 2 campos
// como antes. Persistido em localStorage pra não precisar de endpoint
// novo nem mexer no schema do User — preferência é puramente client-side.
export type IntensityMode = 'RIR' | 'RPE' | 'BOTH'

const STORAGE_KEY = 'acad:intensity-mode'

export function getIntensityMode(): IntensityMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'RIR' || raw === 'RPE' || raw === 'BOTH') return raw
  } catch {
    // ignora — fallback abaixo
  }
  // Default Both: usuário novo vê ambos e percebe o que prefere.
  return 'BOTH'
}

export function setIntensityMode(mode: IntensityMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // quota cheia / private mode — preferência é nice-to-have, não bloqueia
  }
}
