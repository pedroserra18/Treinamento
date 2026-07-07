import type { ProfileDefaults } from '../../services/authService'
import type { WorkoutSection } from '../../services/aiService'

export type QuizAnswers = {
  daysPerWeek: string
  experience: string
  age: string // faixa etária (derivada do birthDate quando disponível)
  birthDate: string // YYYY-MM-DD
  gender: string
  heightCm: string
  weightKg: string
  phase: string
  goal: string
  location: string
  equipment: string
  duration: string
  splitPreference: string
  customSplit: string
  muscleFrequency: string
  repRange: string
  restTime: string
  techniques: string[]
  hasFocus: boolean | null
  musclesFocus: string[]
  hasInjury: boolean
  injuryDescription: string
  avoidExercises: string
  exerciseCount: string
  rirTarget: string
  hasExtraInfo: boolean | null
  extraInfo: string
  // Pede pra IA incluir cardio leve (caminhada/esteira/bike) como aquecimento
  // ou finalizador nos dias. Aplicado via <pedido_extra> no backend.
  wantsCardio: boolean
}

export type AppScreen = 'WELCOME' | 'QUIZ' | 'REVIEW' | 'LOADING' | 'RESULT'

export type SaveResult = {
  planId: string
  planName: string
  foundCount: number
  totalCount: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Ordem explícita dos passos. A pergunta de divisão (19) foi inserida ANTES
// da frequência muscular (9) — assim o usuário escolhe a divisão primeiro, e
// a frequência só aparece se ele deixar "IA decide". Usar array explícito
// (em vez de range numérico) evita renumerar todos os steps existentes.
export const ALL_STEP_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 19, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

export const MUSCLES_LIST = [
  'Ombro', 'Peito', 'Costas', 'Bíceps', 'Tríceps',
  'Quadríceps', 'Posterior de Coxa', 'Glúteo', 'Panturrilha', 'Core',
]

export const LOADING_MESSAGES = [
  'Analisando suas respostas...',
  'Calculando volume ideal...',
  'Montando estrutura do treino...',
  'Selecionando os melhores exercícios...',
  'Finalizando seu plano personalizado...',
]

export const REP_HINTS: Record<string, string> = {
  '4–6': 'força máxima',
  '5–9': 'força e hipertrofia',
  '6–8': 'força e massa',
  '8–10': 'hipertrofia',
  '10–12': 'hipertrofia moderada',
  '12–15': 'resistência muscular',
}

export const GOAL_RECOMMENDED_RANGE: Record<string, string> = {
  'Força': '4–6',
  'Hipertrofia': '8–10',
  'Emagrecimento': '12–15',
  'Resistência': '12–15',
  'Recuperação de lesão': '10–12',
}

export const DEFAULT_ANSWERS: QuizAnswers = {
  daysPerWeek: '',
  experience: '',
  age: '',
  birthDate: '',
  gender: '',
  heightCm: '',
  weightKg: '',
  phase: '',
  goal: '',
  location: '',
  equipment: '',
  duration: '',
  splitPreference: '',
  customSplit: '',
  muscleFrequency: '',
  repRange: '',
  restTime: '',
  techniques: [],
  hasFocus: null,
  musclesFocus: [],
  hasInjury: false,
  injuryDescription: '',
  avoidExercises: '',
  exerciseCount: '',
  rirTarget: '',
  hasExtraInfo: null,
  extraInfo: '',
  wantsCardio: false,
}

// ─── Helper functions ─────────────────────────────────────────────────────────

// Conditional question visibility — questões irrelevantes para o contexto do utilizador são ocultadas.
// Cada regra documenta a justificação para que possa ser revista no futuro.
export function isStepVisible(stepId: number, a: QuizAnswers): boolean {
  const isBodyweight = a.location === 'Em casa sem equipamentos'
  const isHomeWithEquip = a.location === 'Em casa com equipamentos'
  const isBeginner = a.experience === 'Iniciante'
  const isInjuryRecovery = a.goal === 'Recuperação de lesão'

  // step 7 — preferência entre Pesos livres / Máquinas / Misto: a opção "Máquinas" só faz sentido em academia.
  // Em casa (com ou sem equipamento) tipicamente só há pesos livres, então a pergunta é redundante.
  if (stepId === 7 && (isBodyweight || isHomeWithEquip)) return false

  // step 10 — faixa de reps: bodyweight = AMRAP até falha técnica próxima (descrito no guia calistenia do prompt).
  // Para recuperação de lesão, reps são prescritas pela IA conforme o tipo de lesão; faixa fixa não se aplica.
  if (stepId === 10 && (isBodyweight || isInjuryRecovery)) return false

  // step 11 — descanso: para bodyweight a densidade é mais importante que a carga; o guia já prescreve 30-90s.
  if (stepId === 11 && isBodyweight) return false

  // step 12 — técnicas avançadas (Drop Set, Cluster Set, Rest-Pause, Bi-Set):
  //   • Drop/Cluster exigem cargas reguláveis → impossível sem equipamento.
  //   • Iniciantes não devem usar técnicas avançadas (volume e técnica básica primeiro).
  //   • Em recuperação de lesão, técnicas avançadas são contraindicadas.
  if (stepId === 12 && (isBodyweight || isBeginner || isInjuryRecovery)) return false

  // step 1 — experiência: salva no perfil (onboarding v2); pulamos se
  // já conhecido. Editável em Configurações → Perfil quando mudar.
  if (stepId === 1 && a.experience) return false

  // step 2 — idade: se já temos a data de nascimento (do perfil), a idade é
  // calculada automaticamente e a pergunta é pulada.
  if (stepId === 2 && a.birthDate) return false

  // step 3 — gênero: salvo no perfil; se já conhecido, não pergunta de novo.
  if (stepId === 3 && a.gender) return false

  // step 4 — altura: salva no perfil (onboarding v2); pulamos se já conhecida.
  // Altura muda muito raramente — fica em Configurações → Perfil.
  if (stepId === 4 && a.heightCm) return false

  // step 9 — frequência muscular: só pergunta quando a divisão (step 19) está
  // em "IA decide". Se o usuário escolheu uma divisão específica, a frequência
  // já está implícita nela e perguntar seria redundante/conflitante.
  if (stepId === 9 && a.splitPreference !== '' && a.splitPreference !== 'IA decide') return false

  // step 13 — foco muscular: em recuperação de lesão, o "foco" é dado pela lesão (descrita em step 14).
  if (stepId === 13 && isInjuryRecovery) return false

  // step 17 — RIR alvo: bodyweight implica falha técnica próxima (RIR 0-2) por natureza, descrito no guia.
  // Para iniciantes, o conceito é técnico demais e a recomendação padrão (RIR 2-3) já é aplicada implicitamente.
  if (stepId === 17 && (isBodyweight || isBeginner)) return false

  return true
}

export function getVisibleSteps(a: QuizAnswers): number[] {
  return ALL_STEP_IDS.filter(s => isStepVisible(s, a))
}

// Próximo/anterior step visível calculado pela ORDEM em ALL_STEP_IDS — robusto
// ao caso em que a própria resposta torna o step atual invisível (ex: ao
// preencher a data de nascimento o step 2 deixa de ser visível, então
// visible.indexOf(step) daria -1 e a navegação pularia direto pro fim).
export function nextVisibleStep(currentStep: number, a: QuizAnswers): number | null {
  const start = ALL_STEP_IDS.indexOf(currentStep)
  for (let i = start + 1; i < ALL_STEP_IDS.length; i++) {
    if (isStepVisible(ALL_STEP_IDS[i], a)) return ALL_STEP_IDS[i]
  }
  return null
}

export function prevVisibleStep(currentStep: number, a: QuizAnswers): number | null {
  const start = ALL_STEP_IDS.indexOf(currentStep)
  for (let i = start - 1; i >= 0; i--) {
    if (isStepVisible(ALL_STEP_IDS[i], a)) return ALL_STEP_IDS[i]
  }
  return null
}

// Quando uma resposta torna outras irrelevantes, limpamos os campos dependentes para não levar lixo ao prompt.
export function clearStaleAnswers(next: QuizAnswers, key: keyof QuizAnswers, value: string): QuizAnswers {
  if (key === 'location') {
    if (value === 'Em casa sem equipamentos') {
      return { ...next, equipment: '', repRange: '', restTime: '', techniques: [], rirTarget: '' }
    }
    if (value === 'Em casa com equipamentos') {
      return { ...next, equipment: '' }
    }
  }
  if (key === 'experience' && value === 'Iniciante') {
    return { ...next, techniques: [], rirTarget: '' }
  }
  if (key === 'goal' && value === 'Recuperação de lesão') {
    return { ...next, repRange: '', techniques: [], hasFocus: false, musclesFocus: [], hasInjury: true }
  }
  return next
}

// Backend devolve labels em UPPERCASE (PEITO, GLÚTEO…). Mapeamos para o
// labelling title-case usado pelo frontend (Peito, Glúteo…).
export const MUSCLE_BACKEND_TO_FRONTEND: Record<string, string> = {
  'PEITO': 'Peito',
  'COSTAS': 'Costas',
  'OMBROS': 'Ombros',
  'BÍCEPS': 'Bíceps',
  'TRÍCEPS': 'Tríceps',
  'QUADRÍCEPS': 'Quadríceps',
  'POSTERIOR DE COXA': 'Posterior de Coxa',
  'GLÚTEO': 'Glúteo',
  'PANTURRILHA': 'Panturrilha',
  'ABDÔMEN': 'Abdômen',
  'CORE': 'Abdômen',
  'ADUTORES': 'Adutores',
  'ANTEBRAÇO': 'Antebraço',
}

// Classes Tailwind por rótulo frontend — fonte única de cores p/ as duas
// vias (metadata do backend + regex fallback).
export const MUSCLE_COLOR_CLASSES: Record<string, string> = {
  'Peito': 'bg-red-500/15 text-red-400 border-red-500/30',
  'Costas': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Ombros': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  'Bíceps': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Tríceps': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  'Quadríceps': 'bg-green-500/15 text-green-400 border-green-500/30',
  'Posterior de Coxa': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'Glúteo': 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  'Panturrilha': 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  'Abdômen': 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  'Adutores': 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  'Abdutores': 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
  'Antebraço': 'bg-stone-500/15 text-stone-400 border-stone-500/30',
}

// Resolve o grupo muscular preferindo o metadata autoritativo do backend
// (ex.muscleGroup vindo da DB), com fallback para regex no nome quando o
// campo não está presente (ex: workouts antigos / exercício customizado).
// Isto corrige casos onde o nome semanticamente sugere outro grupo:
//   "Abdução de quadril" → DB: GLÚTEO (regex não cataria)
//   "Levantamento terra romeno para glúteo" → DB: GLÚTEO (regex diria POSTERIOR)
export function resolveMuscleGroup(ex: { name: string; muscleGroup?: string }): { label: string; color: string } | null {
  if (ex.muscleGroup) {
    const label = MUSCLE_BACKEND_TO_FRONTEND[ex.muscleGroup] ?? ex.muscleGroup
    const color = MUSCLE_COLOR_CLASSES[label] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/30'
    return { label, color }
  }
  return detectMuscleGroup(ex.name)
}

export function detectMuscleGroup(name: string): { label: string; color: string } | null {
  const n = name.toLowerCase()
  // Abdômen PRIMEIRO — evita que "elevação de pernas" (abdominal) seja capturado como pernas
  if (/abdom|crunch|prancha|plank|oblíquo|obliquo|infra|elevac[aã]o de perna|elevação de perna|vacuum/.test(n))
    return { label: 'Abdômen', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' }
  // Posterior de Coxa ANTES de pernas genéricas — stiff/flexora/rdl
  if (/stiff|mesa flexora|leg curl|cadeira flexora|flexora|posterior de coxa|rdl|romeno|good morning/.test(n))
    return { label: 'Posterior de Coxa', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' }
  // Glúteo ANTES de pernas genéricas
  if (/glúteo|gluteo|hip thrust|elevac[aã]o pélvica|elevação pélvica|kickback|quadrupedia|sumo/.test(n))
    return { label: 'Glúteo', color: 'bg-pink-500/15 text-pink-400 border-pink-500/30' }
  // Panturrilha ANTES de costas — evita que "uni-lateral" seja capturado pelo regex "lat"
  if (/panturrilha|\bcalf\b|gemeo|gêmeo|sóleo|soleo|burro/.test(n))
    return { label: 'Panturrilha', color: 'bg-teal-500/15 text-teal-400 border-teal-500/30' }
  // Ombros posterior (rear delt) ANTES de Peito — evita que "crucifixo inverso/reverso" vire Peito
  if (/crucifixo inverso|crucifixo reverso|reverse fly|rear delt|remada alta|pássaro|passaro/.test(n))
    return { label: 'Ombros', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' }
  if (/supino|crucifixo|voador|peitoral|chest|crossover|fly\b|flye/.test(n))
    return { label: 'Peito', color: 'bg-red-500/15 text-red-400 border-red-500/30' }
  // Costas — \blat\b e \brow\b com word boundary pra não matchar "uniLATeral", "lateRAL", "thROW"
  if (/remada|barra fixa|puxada|pulldown|\blat\b|trapézio|trapezio|\brow\b|cavalinho|serrote|pull over|pullover/.test(n))
    return { label: 'Costas', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' }
  if (/desenvolvimento|elevac[aã]o lateral|elevação lateral|elevac[aã]o frontal|elevação frontal|press ombro|shoulder|ombro|deltóide|deltoid|arnold|face pull|encolhimento/.test(n))
    return { label: 'Ombros', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' }
  if (/rosca|curl|bícep|bicep|hammer|martelo/.test(n))
    return { label: 'Bíceps', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }
  if (/trícep|tricep|extensão|extensao|pulley|dip|mergulho|fundinho|testa|skull/.test(n))
    return { label: 'Tríceps', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' }
  if (/adutor|adutora/.test(n))
    return { label: 'Adutores', color: 'bg-violet-500/15 text-violet-400 border-violet-500/30' }
  if (/abdut[oa]r/.test(n))
    return { label: 'Abdutores', color: 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30' }
  if (/agachamento|leg press|hack|cadeira extensora|afundo|lunges|squat|sissy/.test(n))
    return { label: 'Quadríceps', color: 'bg-green-500/15 text-green-400 border-green-500/30' }
  return null
}

// Calcula a faixa etária a partir da data de nascimento (YYYY-MM-DD).
// Os buckets batem com as opções do quiz para alimentar o prompt.
export function ageBucketFromBirthDate(birthDate: string): string {
  const bd = new Date(birthDate)
  if (Number.isNaN(bd.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - bd.getFullYear()
  const m = now.getMonth() - bd.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age -= 1
  if (age < 18) return 'Menos de 18'
  if (age <= 25) return '18–25'
  if (age <= 35) return '26–35'
  if (age <= 45) return '36–45'
  if (age <= 55) return '46–55'
  return '55+'
}

// Aplica os dados do perfil sobre um conjunto de respostas, preenchendo só os
// campos VAZIOS (não sobrescreve o que o usuário já respondeu). Usado tanto no
// pré-preenchimento inicial quanto ao recomeçar o quiz do zero, pra que a data
// de nascimento (e demais dados do perfil) volte em vez de ser perguntada de novo.
// Mapa do enum do perfil pros labels do quiz. PrimaryGoal só pré-preenche
// o quiz; o user pode trocar pra "Recuperação de lesão" ou outro que seja
// específico do plano que tá montando agora.
export const GOAL_ENUM_TO_QUIZ_LABEL: Record<string, string> = {
  STRENGTH: 'Força',
  HYPERTROPHY: 'Hipertrofia',
  WEIGHT_LOSS: 'Emagrecimento',
  ENDURANCE: 'Resistência',
  GENERAL_FITNESS: 'Hipertrofia', // saúde geral não tem opção dedicada no quiz; cai em hipertrofia leve
}

export const EXPERIENCE_ENUM_TO_QUIZ_LABEL: Record<string, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
}

export function applyProfileDefaults(base: QuizAnswers, d: ProfileDefaults | null): QuizAnswers {
  if (!d) return base
  const next = { ...base }
  if (!next.weightKg && d.weightKg != null) next.weightKg = String(d.weightKg)
  if (!next.heightCm && d.heightCm != null) next.heightCm = String(Math.round(d.heightCm))
  if (!next.gender && d.gender) next.gender = d.gender
  if (!next.birthDate && d.birthDate) {
    next.birthDate = d.birthDate
    next.age = ageBucketFromBirthDate(d.birthDate)
  }
  // Onboarding v2 — pré-preenche os novos campos. Step 1 (experience)
  // será pulado por isStepVisible; step 7 (goal) só vem pré-preenchido
  // e o user pode trocar.
  if (!next.experience && d.experienceLevel) {
    next.experience = EXPERIENCE_ENUM_TO_QUIZ_LABEL[d.experienceLevel] ?? ''
  }
  if (!next.goal && d.primaryGoal) {
    next.goal = GOAL_ENUM_TO_QUIZ_LABEL[d.primaryGoal] ?? ''
  }
  return next
}

// Foco "inferior" = quadríceps e/ou glúteo e/ou posterior de coxa. Quando o
// usuário prioriza esses grupos, especializamos o split em mais dias de perna
// com focos diferentes (quad / glúteo+posterior / pernas geral) em vez do PPL
// padrão que dá apenas 1 dia de pernas.
export function hasLowerBodyFocus(musclesFocus: string[]): boolean {
  return musclesFocus.some((m) => m === 'Quadríceps' || m === 'Glúteo' || m === 'Posterior de Coxa')
}

// Detecta uma DESCRIÇÃO de split conhecido em texto livre (ex: "torso limbs
// 2x na semana", "upper lower 2x", "push pull legs"). Lê a frequência (Nx) e
// expande nos rótulos A/B/C corretos. Retorna null se não reconhecer.
export function expandKnownSplitDescription(text: string): string[] | null {
  const t = text.toLowerCase()

  // Frequência: "2x", "3x", "duas/três vezes". Default 1, cap 3.
  let mult = 1
  const xMatch = t.match(/(\d)\s*x/)
  if (xMatch) mult = parseInt(xMatch[1], 10)
  else if (/\bduas\b|\b2 vezes\b/.test(t)) mult = 2
  else if (/\btr[eê]s\b|\b3 vezes\b/.test(t)) mult = 3
  mult = Math.min(Math.max(mult, 1), 3)

  const tag = (i: number) => (mult > 1 ? ` ${String.fromCharCode(65 + i)}` : '')
  const repeat = (parts: string[]): string[] => {
    const out: string[] = []
    for (let i = 0; i < mult; i++) parts.forEach((p) => out.push(`${p}${tag(i)}`))
    return out
  }

  // Torso/Limbs (tronco/membros)
  if (/torso/.test(t) && /(limb|membro)/.test(t)) return repeat(['Torso', 'Limbs'])
  // Upper/Lower (superior/inferior)
  if ((/upper/.test(t) || /superior/.test(t)) && (/lower/.test(t) || /inferior/.test(t)))
    return repeat(['Upper', 'Lower'])
  // Push/Pull/Legs
  if ((/push/.test(t) || /empurr/.test(t)) && (/pull/.test(t) || /puxa/.test(t)) && (/leg/.test(t) || /perna/.test(t)))
    return repeat(['Push', 'Pull', 'Legs'])

  return null
}

// Quebra o texto livre da divisão "Outro" em rótulos de dia. Suporta dois
// formatos: (1) descrição de split conhecido ("torso limbs 2x") → expande;
// (2) lista de dias um por linha / separados por "/" ou ";". Cap em 7 dias.
export function parseCustomSplit(text: string, fallbackDays: number): string[] {
  const trimmed = text.trim()
  if (!trimmed) {
    return Array.from({ length: Math.max(1, fallbackDays) }, (_, i) => `Treino ${i + 1}`)
  }

  const lines = trimmed
    .split(/[\n;/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 7)

  // Múltiplas linhas/separadores = lista explícita de dias.
  if (lines.length > 1) return lines

  // Linha única → tenta interpretar como descrição de split conhecido.
  const expanded = expandKnownSplitDescription(trimmed)
  if (expanded) return expanded

  // Linha única sem padrão conhecido = um dia literal.
  return lines
}

export function getEffectiveSplit(
  days: number,
  muscleFrequency: string,
  musclesFocus: string[] = [],
  splitPreference: string = '',
): string {
  // 1. Escolha EXPLÍCITA do usuário manda sobre qualquer inferência.
  if (splitPreference && splitPreference !== 'IA decide') {
    if (splitPreference === 'Especializado inferior') {
      if (days === 4) return 'PPL + Lower Specialization'
      if (days >= 5) return 'Lower Focus'
      return 'Push/Pull/Legs' // ≤3 dias não dá pra 3 dias de perna distintos
    }
    // 'Outro' = divisão livre escrita pelo usuário; labels vêm de parseCustomSplit.
    // 'Full Body' | 'Upper/Lower' | 'Push/Pull/Legs' | 'Bro Split' batem
    // diretamente com os nomes que getWorkoutLabels conhece.
    return splitPreference
  }

  // 2. Inferência automática (quando "IA decide" ou não respondido).
  const lowerFocus = hasLowerBodyFocus(musclesFocus)

  // Especialização inferior tem prioridade quando o usuário marcou foco em
  // pernas/glúteo, EXCETO se ele pediu explicitamente 2x por semana (aí mantém
  // split balanceado). Aplica-se a "1x por semana" e "IA decide".
  if (lowerFocus && muscleFrequency !== '2x por semana') {
    if (days === 4) return 'PPL + Lower Specialization' // 2 dias de perna + push + pull
    if (days >= 5) return 'Lower Focus'                 // 3 dias de perna + push + pull (+ombros se 6)
  }

  if (muscleFrequency === '1x por semana') {
    // Cada músculo treinado exatamente 1x por semana — split dedicado por grupo.
    // Upper/Lower com 4 dias seria A/B = músculo 2x → INVÁLIDO para esta frequência.
    if (days <= 2) return 'Upper/Lower'      // Upper + Lower (2 dias) = cada músculo 1x
    if (days === 3) return 'Push/Pull/Legs'  // PPL (3 dias) = cada músculo 1x
    return 'Bro Split'                       // 4+ dias = dia dedicado por grupo
  }
  if (muscleFrequency === '2x por semana') {
    if (days <= 2) return 'Full Body'
    if (days <= 4) return 'Upper/Lower'
    return 'Push/Pull/Legs'
  }
  if (days <= 3) return 'Full Body'
  if (days <= 4) return 'Upper/Lower'
  if (days === 5) return 'Push/Pull/Legs'
  return 'Bro Split'
}

// Label legível pra "Treinos gerados pela IA" — armazena junto com o
// aiGenerationId no save pra a UI mostrar "Full Body 3x · há 2 semanas"
// sem precisar reconstruir das respostas do quiz depois (que podem ter
// mudado se o user re-fez o quiz). Mapeia splits canônicos pra labels
// curtos; "Bro Split" e "Lower Focus" usam abreviações reconhecíveis.
export function buildAIGenerationLabel(split: string, days: number, customSplit: string = ''): string {
  // Custom split — usa o texto do user truncado pra evitar labels enormes.
  if (split === 'Outro') {
    const trimmed = customSplit.trim().slice(0, 60)
    return trimmed ? `${trimmed} ${days}x` : `Personalizado ${days}x`
  }
  const SPLIT_SHORT: Record<string, string> = {
    'Full Body': 'Full Body',
    'Upper/Lower': 'Upper Lower',
    'Push/Pull/Legs': 'PPL',
    'Bro Split': 'Bro Split',
    'PPL + Lower Specialization': 'PPL + Lower',
    'Lower Focus': 'Lower Focus',
  }
  const label = SPLIT_SHORT[split] ?? split
  return `${label} ${days}x`
}

// Gera ID único pra agrupar saves da mesma geração. Preferência por
// crypto.randomUUID quando disponível (todos browsers atuais); fallback
// pseudo-aleatório pra ambientes que não tem (test envs, browsers antigos).
export function newAIGenerationId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* ignora — vai pro fallback */ }
  // Fallback: timestamp + random pra unicidade prática (não criptográfica).
  return `gen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getWorkoutLabels(split: string, days: number, customSplit: string = ''): string[] {
  if (split === 'Outro') {
    return parseCustomSplit(customSplit, days)
  }
  if (split === 'Full Body') {
    if (days <= 1) return ['Full Body']
    return Array.from({ length: days }, (_, i) => `Full Body ${String.fromCharCode(65 + i)}`)
  }
  if (split === 'Upper/Lower') {
    if (days <= 2) return ['Upper', 'Lower']
    if (days === 3) return ['Upper', 'Lower A', 'Lower B']
    return ['Upper A', 'Upper B', 'Lower A', 'Lower B']
  }
  if (split === 'Push/Pull/Legs') {
    if (days <= 3) return ['Push', 'Pull', 'Legs']
    if (days === 4) return ['Push A', 'Pull A', 'Legs', 'Push B']
    if (days === 5) return ['Push A', 'Pull A', 'Legs', 'Push B', 'Pull B']
    return ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']
  }
  if (split === 'Torso/Limbs') {
    // Torso = peito/costas/ombros; Limbs = braços + pernas. Alterna A/B.
    if (days <= 2) return ['Torso', 'Limbs']
    if (days === 3) return ['Torso A', 'Limbs', 'Torso B']
    if (days === 4) return ['Torso A', 'Limbs A', 'Torso B', 'Limbs B']
    if (days === 5) return ['Torso A', 'Limbs A', 'Torso B', 'Limbs B', 'Torso C']
    return ['Torso A', 'Limbs A', 'Torso B', 'Limbs B', 'Torso C', 'Limbs C']
  }
  if (split === 'PPL + Lower Specialization') {
    // 4 dias com foco inferior — upper compactado em 2 dias eficientes, pernas
    // separadas em quad-isolado (cadeira ext., hack squat, leg press) e
    // glúteo/posterior (hip thrust, stiff, kickback). Cada músculo continua 1x/sem.
    return ['Push', 'Pull', 'Quadríceps', 'Glúteo + Posterior']
  }
  if (split === 'Lower Focus') {
    // 5-6 dias com foco inferior — 3 dias de perna com FOCOS DIFERENTES
    // (quad-dominante / glúteo+posterior / pernas geral) + push + pull.
    // Atende pedidos tipo "quero treinar inferior 3x na semana com focos diferentes".
    if (days >= 6) return ['Quadríceps', 'Push', 'Glúteo + Posterior', 'Pull', 'Pernas', 'Ombros']
    return ['Quadríceps', 'Push', 'Glúteo + Posterior', 'Pull', 'Pernas']
  }
  if (split === 'Bro Split') {
    return ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços'].slice(0, Math.min(days, 5))
  }
  return ['Treino']
}

// ─── Coverage / volume / duration helpers ────────────────────────────────────

// Mantém paridade com REQUIRED_GROUPS_BY_SPLIT_KEY do backend (ai.service.ts).
// getRequiredGroups usa startsWith, então "Glúteo + Posterior" casa "Glúteo".
export const REQUIRED_BY_SPLIT_KEY: Record<string, string[]> = {
  'Full Body': ['Peito', 'Costas', 'Ombros', 'Quadríceps', 'Bíceps', 'Tríceps', 'Panturrilha'],
  'Upper': ['Peito', 'Costas', 'Ombros', 'Bíceps', 'Tríceps'],
  'Lower': ['Quadríceps', 'Posterior de Coxa', 'Glúteo', 'Panturrilha'],
  'Push': ['Peito', 'Ombros', 'Tríceps'],
  'Pull': ['Costas', 'Bíceps'],
  'Legs': ['Quadríceps', 'Posterior de Coxa', 'Glúteo', 'Panturrilha'],
  // Bro Split + dias especializados de perna
  'Peito': ['Peito', 'Tríceps'],
  'Costas': ['Costas', 'Bíceps'],
  'Pernas': ['Quadríceps', 'Posterior de Coxa', 'Glúteo', 'Panturrilha'],
  'Ombros': ['Ombros'],
  'Braços': ['Bíceps', 'Tríceps'],
  'Quadríceps': ['Quadríceps'],
  'Glúteo': ['Glúteo', 'Posterior de Coxa'],
  'Torso': ['Peito', 'Costas', 'Ombros'],
  'Limbs': ['Bíceps', 'Tríceps', 'Quadríceps', 'Posterior de Coxa'],
}

export function getRequiredGroups(dayLabel: string): string[] {
  const key = Object.keys(REQUIRED_BY_SPLIT_KEY).find(k => dayLabel.startsWith(k))
  return key ? REQUIRED_BY_SPLIT_KEY[key] : []
}

// Em bodyweight, bíceps/tríceps quase só são treinados como secundário
// (remada supinada → bíceps; flexão/dip → tríceps). Sem essa concessão,
// o aviso "Faltam: Bíceps" seria falso positivo em todo Pull de calistenia.
export function getMissingGroups(
  exercises: { name: string; muscleGroup?: string; secondaryMuscleGroup?: string }[],
  dayLabel: string,
  isBodyweight: boolean = false,
): string[] {
  const required = getRequiredGroups(dayLabel)
  if (required.length === 0) return []
  const covered = new Set<string>()
  for (const ex of exercises) {
    const m = resolveMuscleGroup(ex)
    if (m) covered.add(m.label)
    // Em bodyweight, secundário também conta — única forma realista de
    // cobrir bíceps/tríceps sem cargas externas.
    if (isBodyweight && ex.secondaryMuscleGroup) {
      const secLabel = MUSCLE_BACKEND_TO_FRONTEND[ex.secondaryMuscleGroup] ?? ex.secondaryMuscleGroup
      covered.add(secLabel)
    }
  }
  return required.filter(g => !covered.has(g))
}

export type VolumeEntry = { label: string; sets: number; color: string; hex: string }

export const MUSCLE_HEX: Record<string, string> = {
  'Peito': '#ef4444',
  'Costas': '#3b82f6',
  'Ombros': '#a855f7',
  'Bíceps': '#f59e0b',
  'Tríceps': '#06b6d4',
  'Quadríceps': '#22c55e',
  'Posterior de Coxa': '#f97316',
  'Glúteo': '#ec4899',
  'Panturrilha': '#14b8a6',
  'Abdômen': '#64748b',
  'Adutores': '#8b5cf6',
  'Abdutores': '#d946ef',
}

export function getWeeklyVolume(sections: WorkoutSection[]): VolumeEntry[] {
  const map = new Map<string, { sets: number; color: string }>()
  for (const sec of sections) {
    if (!sec.workoutData) continue
    for (const ex of sec.workoutData.exercises) {
      const m = resolveMuscleGroup(ex)
      if (!m) continue
      const sets = ex.sets ?? 3
      const cur = map.get(m.label) ?? { sets: 0, color: m.color }
      cur.sets += sets
      map.set(m.label, cur)
    }
  }
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, sets: v.sets, color: v.color, hex: MUSCLE_HEX[label] ?? '#94a3b8' }))
    .sort((a, b) => b.sets - a.sets)
}

export function estimateDurationMin(exercises: { sets?: number; restSec?: number; repsMax?: number }[]): number {
  let totalSec = 0
  for (const ex of exercises) {
    const sets = ex.sets ?? 3
    const repsMax = ex.repsMax ?? 10
    const execSec = Math.max(20, Math.min(60, repsMax * 3))
    const restSec = ex.restSec ?? 90
    totalSec += sets * execSec + Math.max(0, sets - 1) * restSec
  }
  totalSec += 90 // transição entre exercícios (estimativa fixa pequena)
  return Math.round(totalSec / 60)
}

// Constrói o texto da <tarefa> — propositalmente CURTO e específico do dia.
// O perfil completo do usuário vai em campos estruturados separados (handleGenerate),
// que o backend transforma no <perfil_usuario> consolidado. Aqui só fica o que é
// específico DESTE dia + notas contextuais que não cabem em enum (calistenia,
// iniciante, recuperação de lesão).
export function buildPrompt(a: QuizAnswers, dayLabel: string, dayIdx: number, total: number, split: string): string {
  const isBodyweight = a.location === 'Em casa sem equipamentos'
  const isBeginner = a.experience === 'Iniciante'
  const isInjuryRecovery = a.goal === 'Recuperação de lesão'

  // Guia técnico de calistenia — não cabe em enum pois é prescrição livre.
  const bodyweightGuide = isBodyweight ? [
    '',
    'GUIA CALISTENIA (treino exclusivamente com peso corporal):',
    '- NÃO incluir exercícios que exijam halteres, barras, máquinas, elásticos, anilhas ou qualquer carga externa.',
    '- NÃO usar técnicas avançadas (drop set, cluster, rest-pause, bi-set) — não fazem sentido sem cargas reguláveis.',
    '- Estratégia de reps: AMRAP — prescrever séries até falha técnica próxima (RIR 0–2). Faixas típicas:',
    `  • Iniciante: 10–20 reps | Intermediário: 12–25 reps | Avançado: progressões mais difíceis com 6–15 reps (ex.: pistol squat, archer push-up, handstand push-up, muscle-up assistido).`,
    '- Use progressões adequadas ao nível (ex.: incline → standard → decline → diamond push-ups; bodyweight squat → split squat → bulgarian → pistol).',
    '- Para grupos sem progressão de carga (panturrilha, core), aumentar tempo sob tensão e densidade.',
    '- Descanso: 30–90s tipicamente é suficiente — densidade > carga.',
    '- Para variedade de costas/bíceps sem barra fixa, usar australian rows (door rows / table rows) e back extensions no chão.',
    '',
  ].join('\n') : ''

  const beginnerNote = isBeginner ? [
    '',
    'NOTA — INICIANTE (<1 ano de treino):',
    '- Foco em movimentos compostos básicos com forma perfeita; cargas conservadoras (RIR 2-4).',
    '- NÃO usar técnicas avançadas (drop set, cluster, rest-pause, bi-set).',
    '- 2-3 séries efetivas por exercício após aquecimentos; volume moderado.',
    '- Preferir exercícios estáveis (máquinas/guiados quando disponível) antes de pesos livres complexos (ex.: leg press antes de agachamento livre pesado).',
    '',
  ].join('\n') : ''

  const recoveryNote = isInjuryRecovery ? [
    '',
    'NOTA — RECUPERAÇÃO DE LESÃO:',
    '- Adapta TODOS os exercícios para evitar agravar a lesão descrita; exclui movimentos contraindicados.',
    '- Prefere exercícios isolados, com amplitude controlada e sem carga axial pesada.',
    '- Reps moderadas a altas (12–20) com cargas leves a moderadas, RIR 3+ — sem ir à falha.',
    '- NÃO usar técnicas avançadas; volume conservador, foco em qualidade do movimento.',
    '- Inclui mobilidade/ativação para a região afetada quando apropriado.',
    '',
  ].join('\n') : ''

  return [
    `Cria APENAS o treino "${dayLabel}" (dia ${dayIdx + 1} de ${total} do plano ${split}).`,
    `Não incluas os outros dias. OBRIGATÓRIO: inclui sempre o bloco JSON no final.`,
    bodyweightGuide,
    beginnerNote,
    recoveryNote,
  ].filter(l => l !== '').join('\n')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

