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
]

export function isLikelyBodyweight(name: string): boolean {
  return BODYWEIGHT_HINTS.some((pattern) => pattern.test(name))
}

export function resolveBodyweightFlag(flag: boolean | undefined, name: string): boolean {
  if (typeof flag === 'boolean') {
    return flag
  }

  return isLikelyBodyweight(name)
}
