// Vocabulário PT-BR pra busca de exercícios. Mapeia gírias, plurais,
// abreviações e termos em inglês comum pros enum MuscleGroup do Prisma.
//
// Usado pelo listExercises pra "expandir" um termo digitado pelo usuário.
// Ex.: 'biceps' → BICEPS (+ ARMS opcional). 'perna' → LEGS, QUADS,
// HAMSTRINGS, CALVES (perna engloba tudo). 'peito' → CHEST.
//
// Norma: chaves SEMPRE sem acento e lowercase. O resolver normaliza o
// input do user com NFD + strip de diacríticos antes de consultar.
//
// Adicionar novo sinônimo: pensa em como o user real digita (errado, com
// ou sem acento, em inglês), não em como o termo aparece "no dicionário".

type MuscleGroup =
  | "FULL_BODY" | "CHEST" | "BACK" | "SHOULDERS" | "ARMS"
  | "BICEPS" | "TRICEPS" | "CORE" | "ABDOMEN" | "FOREARM"
  | "GLUTES" | "LEGS" | "QUADS" | "HAMSTRINGS" | "ADDUCTORS" | "CALVES";

const SYNONYMS: Record<string, MuscleGroup[]> = {
  // Peito
  peito: ["CHEST"],
  peitoral: ["CHEST"],
  peitorais: ["CHEST"],
  peit: ["CHEST"],
  chest: ["CHEST"],

  // Costas
  costas: ["BACK"],
  back: ["BACK"],
  dorsal: ["BACK"],
  dorsais: ["BACK"],
  trapezio: ["BACK"],
  lombar: ["BACK"],
  lombares: ["BACK"],

  // Ombros
  ombro: ["SHOULDERS"],
  ombros: ["SHOULDERS"],
  shoulder: ["SHOULDERS"],
  shoulders: ["SHOULDERS"],
  deltoide: ["SHOULDERS"],
  deltoides: ["SHOULDERS"],
  deltoidss: ["SHOULDERS"],
  delt: ["SHOULDERS"],
  delts: ["SHOULDERS"],

  // Braço (genérico)
  braco: ["ARMS", "BICEPS", "TRICEPS"],
  bracos: ["ARMS", "BICEPS", "TRICEPS"],
  arm: ["ARMS", "BICEPS", "TRICEPS"],
  arms: ["ARMS", "BICEPS", "TRICEPS"],

  // Bíceps
  biceps: ["BICEPS", "ARMS"],
  bicep: ["BICEPS", "ARMS"],
  bi: ["BICEPS", "ARMS"],

  // Tríceps
  triceps: ["TRICEPS", "ARMS"],
  tricep: ["TRICEPS", "ARMS"],
  tri: ["TRICEPS", "ARMS"],

  // Antebraço
  antebraco: ["FOREARM"],
  antebracos: ["FOREARM"],
  forearm: ["FOREARM"],
  forearms: ["FOREARM"],

  // Core / abdômen
  core: ["CORE", "ABDOMEN"],
  abdomen: ["ABDOMEN", "CORE"],
  abdominal: ["ABDOMEN", "CORE"],
  abdominais: ["ABDOMEN", "CORE"],
  barriga: ["ABDOMEN", "CORE"],
  abs: ["ABDOMEN", "CORE"],
  ab: ["ABDOMEN", "CORE"],

  // Glúteos
  gluteo: ["GLUTES"],
  gluteos: ["GLUTES"],
  bumbum: ["GLUTES"],
  bunda: ["GLUTES"],
  glutes: ["GLUTES"],
  glute: ["GLUTES"],

  // Perna (genérico)
  perna: ["LEGS", "QUADS", "HAMSTRINGS", "CALVES"],
  pernas: ["LEGS", "QUADS", "HAMSTRINGS", "CALVES"],
  leg: ["LEGS", "QUADS", "HAMSTRINGS", "CALVES"],
  legs: ["LEGS", "QUADS", "HAMSTRINGS", "CALVES"],

  // Quadríceps
  quadriceps: ["QUADS"],
  quadricep: ["QUADS"],
  quad: ["QUADS"],
  quads: ["QUADS"],

  // Posterior de coxa
  posterior: ["HAMSTRINGS"],
  isquio: ["HAMSTRINGS"],
  isquios: ["HAMSTRINGS"],
  isquiotibial: ["HAMSTRINGS"],
  isquiotibiais: ["HAMSTRINGS"],
  hamstring: ["HAMSTRINGS"],
  hamstrings: ["HAMSTRINGS"],

  // Adutores
  adutor: ["ADDUCTORS"],
  adutores: ["ADDUCTORS"],
  adductor: ["ADDUCTORS"],
  adductors: ["ADDUCTORS"],

  // Panturrilha
  panturrilha: ["CALVES"],
  panturrilhas: ["CALVES"],
  calf: ["CALVES"],
  calves: ["CALVES"],

  // Corpo inteiro
  fullbody: ["FULL_BODY"],
  full_body: ["FULL_BODY"]
};

// Normaliza pra forma comparável: lowercase, sem acentos, sem espaços
// nas pontas. Não remove espaços internos (quem digita 'full body' vai
// querer manter — a função de match cuida do split).
//
// IMPORTANTE: usa Unicode escape ̀-ͯ em vez de caracteres
// combining literais. Esse range é o bloco "Combining Diacritical Marks"
// — depois do NFD, vogais acentuadas se quebram em letra base + mark
// nesse range. Escape evita problema de encoding do arquivo fonte.
export function normalizeSearchTerm(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Recebe um termo livre digitado pelo user e retorna:
// - normalizedText: forma sem acento, lowercase (pra contains)
// - muscleGroups: lista de enums que casaram com sinônimos (pode estar
//   vazia quando o termo é específico do nome — ex.: 'supino inclinado')
//
// Estratégia de match: tenta o termo todo primeiro (pra cobrir 'full body'),
// depois cada palavra individualmente. Acumula matches sem duplicar.
export function resolveExerciseSearchTerm(input: string): {
  normalizedText: string;
  muscleGroups: MuscleGroup[];
} {
  const normalized = normalizeSearchTerm(input);
  if (!normalized) {
    return { normalizedText: "", muscleGroups: [] };
  }

  const matched = new Set<MuscleGroup>();

  // Match com o termo completo (cobre multi-palavra tipo 'full body').
  const fullMatch = SYNONYMS[normalized];
  if (fullMatch) {
    for (const g of fullMatch) matched.add(g);
  }

  // Match por palavra (cobre 'biceps barra', 'peito halter', etc).
  // Só palavras com 2+ chars pra reduzir falsos positivos.
  const words = normalized.split(/\s+/).filter((w) => w.length >= 2);
  for (const word of words) {
    const wordMatch = SYNONYMS[word];
    if (wordMatch) {
      for (const g of wordMatch) matched.add(g);
    }
  }

  return {
    normalizedText: normalized,
    muscleGroups: Array.from(matched)
  };
}
