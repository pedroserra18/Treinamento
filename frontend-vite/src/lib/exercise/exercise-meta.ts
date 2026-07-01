export const MUSCLE_OPTIONS = [
  'CHEST',
  'BACK',
  'SHOULDERS',
  'ARMS',
  'BICEPS',
  'TRICEPS',
  'CORE',
  'LEGS',
  'QUADS',
  'HAMSTRINGS',
  'ADDUCTORS',
  'GLUTES',
  'CALVES',
  'ABDOMEN',
  'FOREARM',
  'FULL_BODY',
] as const

const BODYWEIGHT_HINTS = [
  /flex[aã]o/i,
  /barra\s*f(i|í)xa/i,
  /pull\s*up/i,
  /chin\s*up/i,
  /mergulho/i,
  /\bdip\b/i,
  /prancha/i,
  /plank/i,
  /burpee/i,
  /abdominal\s+infra/i,
  /abdominal\s+supra/i,
  /eleva[cç][aã]o\s+de\s+pernas/i,
  /leg\s*raise/i,
  /sit\s*up/i,
]

const NON_BODYWEIGHT_HINTS = [
  /na\s+maquina/i,
  /no\s+cabo/i,
  /na\s+polia/i,
  /com\s+barra/i,
  /com\s+halter/i,
  /smith/i,
  /leg\s*press/i,
]

export function isLikelyBodyweight(name: string): boolean {
  if (NON_BODYWEIGHT_HINTS.some((pattern) => pattern.test(name))) {
    return false
  }

  return BODYWEIGHT_HINTS.some((pattern) => pattern.test(name))
}

export function isBodyweightEquipment(equipment?: string | null): boolean {
  if (!equipment) {
    return false
  }

  const normalized = equipment.trim().toLowerCase()
  return (
    /^body[\s_-]*weight$/i.test(normalized) ||
    /^peso(\s+do|\s+de)?\s+corpo$/i.test(normalized)
  )
}

export function resolveBodyweightFlag(
  flag: boolean | undefined,
  name: string,
  equipment?: string | null,
): boolean {
  if (isBodyweightEquipment(equipment)) {
    return true
  }

  if (typeof flag === 'boolean') {
    return flag
  }

  return isLikelyBodyweight(name)
}
