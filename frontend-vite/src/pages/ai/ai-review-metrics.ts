import type { QuizAnswers } from './ai-workout-utils'

// ─── Review screen metrics & helpers ─────────────────────────────────────────
// Pequenas funções puras que derivam métricas decorativas (volume, RPE, descanso)
// a partir das respostas do quiz para o card de Resumo.

export const SIZE_TO_EX_COUNT: Record<string, number> = {
  'Curto': 4, 'Médio': 6, 'Longo': 9,
}
export const RIR_TO_RPE: Record<string, number> = {
  'Falha': 10, 'RIR 1-2': 9, 'RIR 3+': 7,
}
export const REST_TO_SEC: Record<string, number> = {
  '30s': 30, '45s': 45, '1min': 60, '1min30s': 90, '2min': 120, '2min30s': 150, '3min': 180,
}
export const GOAL_REST_BASELINE: Record<string, number> = {
  'Força': 180, 'Hipertrofia': 90, 'Emagrecimento': 60, 'Resistência': 45, 'Recuperação de lesão': 75,
}

export function computeVolumeEst(a: QuizAnswers): { value: number; delta: string; positive: boolean } {
  const exCount = SIZE_TO_EX_COUNT[a.exerciseCount] ?? 5
  const setsPerSession = Math.round(exCount * 2.8)
  const baseline = 12
  const deltaPct = Math.round(((setsPerSession - baseline) / baseline) * 100)
  return {
    value: setsPerSession,
    delta: `${deltaPct >= 0 ? '+' : ''}${deltaPct}%`,
    positive: deltaPct >= 0,
  }
}

export function computeIntensity(a: QuizAnswers): { value: string; badge: string } {
  const rpe = RIR_TO_RPE[a.rirTarget]
  if (rpe) {
    return { value: `RPE ${rpe}`, badge: rpe >= 9 ? 'alta' : rpe >= 7 ? 'média' : 'leve' }
  }
  if (a.goal === 'Força') return { value: 'RPE 9', badge: 'alta' }
  if (a.goal === 'Hipertrofia') return { value: 'RPE 8', badge: 'média' }
  if (a.goal === 'Emagrecimento' || a.goal === 'Resistência') return { value: 'RPE 7', badge: 'moderada' }
  if (a.goal === 'Recuperação de lesão') return { value: 'RPE 6', badge: 'leve' }
  return { value: 'RPE 8', badge: 'média' }
}

export function computeRest(a: QuizAnswers): { value: string; hint: string; delta: string | null } {
  const sec = REST_TO_SEC[a.restTime]
  if (!sec) return { value: 'IA', hint: 'auto', delta: null }
  const baseline = GOAL_REST_BASELINE[a.goal] ?? 90
  const diff = sec - baseline
  const delta = diff === 0 ? '±0s' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}s`
  return { value: `${sec}s`, hint: 'entre', delta }
}

export function computeTempoEst(a: QuizAnswers): string {
  const days = parseInt(a.daysPerWeek, 10) || 3
  return (1.8 + days * 0.4).toFixed(1)
}

// Estima carga visual por bloco — combina dias/semana, experiência e variância
// estável por índice para que cada bloco apareça com %, sem ser totalmente arbitrário.
export function computeBlockLoad(a: QuizAnswers, idx: number): number {
  let base = 72
  const days = parseInt(a.daysPerWeek, 10) || 3
  base += Math.min(days, 6) * 2
  if (a.experience === 'Avançado') base += 5
  else if (a.experience === 'Intermediário') base += 2
  if (a.exerciseCount === 'Longo') base += 4
  else if (a.exerciseCount === 'Curto') base -= 4
  const variance = ((idx * 7 + 11) % 13) - 6
  return Math.max(65, Math.min(95, base + variance))
}

// Mapeia o label do bloco ("Push", "Lower B", "Peito"…) para o nome amigável em PT
// que aparece como título do chip (Empurrar, Puxar, Inferior).
export function friendlyBlockName(label: string): string {
  const map: Array<[string, string]> = [
    ['Push', 'Empurrar'], ['Pull', 'Puxar'],
    ['Legs', 'Inferior'], ['Lower', 'Inferior'],
    ['Upper', 'Superior'], ['Full Body', 'Full Body'],
  ]
  for (const [en, pt] of map) {
    if (label.startsWith(en)) return label.replace(en, pt)
  }
  return label
}

// Descrição curta dos músculos cobertos por cada bloco (linha mono do chip).
export function blockMusclesHint(label: string): string {
  if (label.startsWith('Push')) return 'Peito · Ombro · Tríceps'
  if (label.startsWith('Pull')) return 'Costas · Bíceps · Core'
  if (label.startsWith('Legs') || label.startsWith('Lower')) return 'Pernas · Glúteo · Pant.'
  if (label.startsWith('Upper')) return 'Peito · Costas · Braços'
  if (label.startsWith('Full Body')) return 'Corpo inteiro'
  if (label.startsWith('Quadríceps')) return 'Quadríceps · Panturrilha'
  if (label.startsWith('Glúteo + Posterior')) return 'Glúteo · Posterior'
  if (label.startsWith('Peito')) return 'Peito · Tríceps'
  if (label.startsWith('Costas')) return 'Costas · Bíceps'
  if (label.startsWith('Pernas')) return 'Quad · Posterior · Glúteo'
  if (label.startsWith('Ombros')) return 'Ombros · Core'
  if (label.startsWith('Braços')) return 'Bíceps · Tríceps'
  return ''
}

// Classifica o estado de cada chip do resumo para colorir o dot e o texto:
// brand (definido pelo user), ai (IA decide), muted (vazio / sem dados).
export type ChipTone = 'brand' | 'ai' | 'muted'
export function getChipTone(value: string): ChipTone {
  const v = value.trim()
  if (v === 'IA decide' || v === 'IA' || v === 'auto') return 'ai'
  if (!v || v === '—' || v === 'Nenhuma' || v === 'Não informado' || v === 'Não' || v === 'Sem foco') return 'muted'
  return 'brand'
}

// Estima duração total do treino (em min) só com base no quiz, antes de gerar.
// Usa exerciseCount como proxy: Curto≈40, Médio≈55, Longo≈75. Default 60.
export function estimateQuizDurationMin(a: QuizAnswers): number {
  if (a.duration) {
    const parsed = parseInt(a.duration, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  if (a.exerciseCount === 'Curto') return 40
  if (a.exerciseCount === 'Longo') return 75
  return 60
}

// ─── RESULT screen helpers ───────────────────────────────────────────────────

// Maps each generated day to a day-of-week label, spaced sensibly so users
// have rest days between training days (e.g. 4 days → SEG/TER/QUI/SEX, not 4
// consecutive days). Pure cosmetic — users mentally adapt to their schedule.
const DOW = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM']
export function dayOfWeekLabels(numDays: number): string[] {
  if (numDays <= 0) return []
  if (numDays >= 7) return DOW.slice(0, numDays)
  const patterns: Record<number, number[]> = {
    1: [0],
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
  }
  const indices = patterns[numDays] ?? Array.from({ length: numDays }, (_, i) => i)
  return indices.map(i => DOW[i])
}

// Derives a numeric RPE alvo from the rirTarget the user picked at the quiz.
// Same value applied to every exercise — the AI doesn't break this down
// per-exercise (yet).
export function rpeFromRir(rirTarget: string): string {
  if (rirTarget === 'Falha') return '10'
  if (rirTarget === 'RIR 1-2') return '9'
  if (rirTarget === 'RIR 3+') return '7'
  return '—'
}

// Translates a day's planName ("Upper A", "Lower B"…) into the human-readable
// focus label used in the day card header chip.
export function focoFromDayLabel(label: string): string {
  const lower = label.toLowerCase()
  if (/^(upper|push|pull|peito|costas|ombros|braços|superior)/.test(lower)) return 'superior'
  if (/^(lower|legs|pernas|posterior|glúteo|inferior)/.test(lower)) return 'inferior'
  if (/full body/.test(lower)) return 'total'
  return 'misto'
}
