// Cache de "exercícios recentes" persistido em localStorage. Alimenta
// a seção Recentes do SubstituteExerciseModal e é atualizado pelo
// TrainPage toda vez que o usuário adiciona um exercício no treino
// ativo. Sem persistência backend ainda — é puramente client-side.
const RECENT_EXERCISES_KEY = 'acad:recent-exercises'
const RECENT_EXERCISES_LIMIT = 20

export function getRecentExerciseIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_EXERCISES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_EXERCISES_LIMIT)
  } catch {
    return []
  }
}

export function pushRecentExerciseId(id: string): void {
  try {
    const current = getRecentExerciseIds().filter((v) => v !== id)
    const next = [id, ...current].slice(0, RECENT_EXERCISES_LIMIT)
    window.localStorage.setItem(RECENT_EXERCISES_KEY, JSON.stringify(next))
  } catch {
    // ignora — quota cheia ou storage indisponível não devem quebrar o app
  }
}
