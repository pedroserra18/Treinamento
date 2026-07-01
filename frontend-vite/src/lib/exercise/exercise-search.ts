// Vocabulário PT-BR pra busca de exercícios — versão frontend.
// Espelha o backend em api/src/modules/exercise/exercise-search-vocabulary.ts
//
// Por que duplicado: o frontend carrega o catálogo inteiro de exercícios
// (300 max) uma vez e filtra LOCALMENTE no AddExerciseModal e na
// ProgressPage. Search instantânea (sem latência de rede) é melhor UX
// que round-trip pro backend a cada tecla. O preço é manter o
// vocabulário em sync entre os dois arquivos — pequeno, raramente muda.
//
// Quando adicionar sinônimo novo: atualize OS DOIS arquivos. O backend
// continua sendo a fonte oficial pra consumidores externos da API.

type MuscleGroup =
  | 'FULL_BODY' | 'CHEST' | 'BACK' | 'SHOULDERS' | 'ARMS'
  | 'BICEPS' | 'TRICEPS' | 'CORE' | 'ABDOMEN' | 'FOREARM'
  | 'GLUTES' | 'LEGS' | 'QUADS' | 'HAMSTRINGS' | 'ADDUCTORS' | 'CALVES'

const SYNONYMS: Record<string, MuscleGroup[]> = {
  // Peito
  peito: ['CHEST'], peitoral: ['CHEST'], peitorais: ['CHEST'], peit: ['CHEST'], chest: ['CHEST'],

  // Costas
  costas: ['BACK'], back: ['BACK'], dorsal: ['BACK'], dorsais: ['BACK'],
  trapezio: ['BACK'], lombar: ['BACK'], lombares: ['BACK'],

  // Ombros
  ombro: ['SHOULDERS'], ombros: ['SHOULDERS'], shoulder: ['SHOULDERS'], shoulders: ['SHOULDERS'],
  deltoide: ['SHOULDERS'], deltoides: ['SHOULDERS'], delt: ['SHOULDERS'], delts: ['SHOULDERS'],

  // Braço genérico
  braco: ['ARMS', 'BICEPS', 'TRICEPS'], bracos: ['ARMS', 'BICEPS', 'TRICEPS'],
  arm: ['ARMS', 'BICEPS', 'TRICEPS'], arms: ['ARMS', 'BICEPS', 'TRICEPS'],

  // Bíceps
  biceps: ['BICEPS', 'ARMS'], bicep: ['BICEPS', 'ARMS'], bi: ['BICEPS', 'ARMS'],

  // Tríceps
  triceps: ['TRICEPS', 'ARMS'], tricep: ['TRICEPS', 'ARMS'], tri: ['TRICEPS', 'ARMS'],

  // Antebraço
  antebraco: ['FOREARM'], antebracos: ['FOREARM'], forearm: ['FOREARM'], forearms: ['FOREARM'],

  // Core / abdômen
  core: ['CORE', 'ABDOMEN'], abdomen: ['ABDOMEN', 'CORE'], abdominal: ['ABDOMEN', 'CORE'],
  abdominais: ['ABDOMEN', 'CORE'], barriga: ['ABDOMEN', 'CORE'], abs: ['ABDOMEN', 'CORE'],
  ab: ['ABDOMEN', 'CORE'],

  // Glúteos
  gluteo: ['GLUTES'], gluteos: ['GLUTES'], bumbum: ['GLUTES'], bunda: ['GLUTES'],
  glutes: ['GLUTES'], glute: ['GLUTES'],

  // Perna genérico
  perna: ['LEGS', 'QUADS', 'HAMSTRINGS', 'CALVES'], pernas: ['LEGS', 'QUADS', 'HAMSTRINGS', 'CALVES'],
  leg: ['LEGS', 'QUADS', 'HAMSTRINGS', 'CALVES'], legs: ['LEGS', 'QUADS', 'HAMSTRINGS', 'CALVES'],

  // Quadríceps
  quadriceps: ['QUADS'], quadricep: ['QUADS'], quad: ['QUADS'], quads: ['QUADS'],

  // Posterior de coxa
  posterior: ['HAMSTRINGS'], isquio: ['HAMSTRINGS'], isquios: ['HAMSTRINGS'],
  isquiotibial: ['HAMSTRINGS'], isquiotibiais: ['HAMSTRINGS'],
  hamstring: ['HAMSTRINGS'], hamstrings: ['HAMSTRINGS'],

  // Adutores
  adutor: ['ADDUCTORS'], adutores: ['ADDUCTORS'], adductor: ['ADDUCTORS'], adductors: ['ADDUCTORS'],

  // Panturrilha
  panturrilha: ['CALVES'], panturrilhas: ['CALVES'], calf: ['CALVES'], calves: ['CALVES'],

  // Corpo inteiro
  fullbody: ['FULL_BODY'], full_body: ['FULL_BODY'],
}

// Normaliza string pra forma comparável: lowercase + sem acentos + trim.
// Mesma regra do backend. Não remove espaços internos.
export function normalizeSearchTerm(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

// Resolve apelidos PT-BR: tenta o termo todo (cobre "full body"), depois
// cada palavra individual (cobre "biceps barra"). Retorna texto
// normalizado + grupos musculares que casaram.
export function resolveExerciseSearchTerm(input: string): {
  normalizedText: string
  muscleGroups: MuscleGroup[]
} {
  const normalized = normalizeSearchTerm(input)
  if (!normalized) {
    return { normalizedText: '', muscleGroups: [] }
  }

  const matched = new Set<MuscleGroup>()

  const fullMatch = SYNONYMS[normalized]
  if (fullMatch) {
    for (const g of fullMatch) matched.add(g)
  }

  const words = normalized.split(/\s+/).filter((w) => w.length >= 2)
  for (const word of words) {
    const wordMatch = SYNONYMS[word]
    if (wordMatch) {
      for (const g of wordMatch) matched.add(g)
    }
  }

  return { normalizedText: normalized, muscleGroups: Array.from(matched) }
}

// Predicate central pra filtro client-side. Retorna true se o exercício
// casa com o termo de busca por:
//   • nome (lowercase + sem acento)
//   • equipment (idem)
//   • primaryMuscleGroup (quando o termo é apelido reconhecido)
//
// Snapshot do exercise reduzido aos campos que importam — assim qualquer
// type que tenha esses campos serve (ExerciseOption do AddModal,
// AvailableExercise da Progress, etc).
export function matchesExerciseSearch(
  exercise: {
    name: string
    equipment?: string | null
    primaryMuscleGroup?: string | null
  },
  rawQuery: string,
): boolean {
  const { normalizedText, muscleGroups } = resolveExerciseSearchTerm(rawQuery)
  if (!normalizedText) return true

  const name = normalizeSearchTerm(exercise.name)
  if (name.includes(normalizedText)) return true

  if (exercise.equipment) {
    const equipment = normalizeSearchTerm(exercise.equipment)
    if (equipment.includes(normalizedText)) return true
  }

  if (muscleGroups.length > 0 && exercise.primaryMuscleGroup) {
    if (muscleGroups.includes(exercise.primaryMuscleGroup as MuscleGroup)) return true
  }

  return false
}
