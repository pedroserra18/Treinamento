import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  generateAIWorkout,
  parseCustomSplitAI,
  saveAIWorkout,
  swapExerciseAI,
  type WorkoutSection,
} from '../services/aiService'
import { getProfileDefaults, updateBirthDate, updateGender, type ProfileDefaults } from '../services/authService'
import { Bot, ChevronLeft, Clock, Sparkles, CheckCircle2, Pencil, ChevronUp, ChevronDown, RefreshCw, AlertTriangle, X, ArrowRight } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type QuizAnswers = {
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
}

type AppScreen = 'WELCOME' | 'QUIZ' | 'REVIEW' | 'LOADING' | 'RESULT'

type SaveResult = {
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
const ALL_STEP_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 19, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

const MUSCLES_LIST = [
  'Ombro', 'Peito', 'Costas', 'Bíceps', 'Tríceps',
  'Quadríceps', 'Posterior de Coxa', 'Glúteo', 'Panturrilha', 'Core',
]

const LOADING_MESSAGES = [
  'Analisando suas respostas...',
  'Calculando volume ideal...',
  'Montando estrutura do treino...',
  'Selecionando os melhores exercícios...',
  'Finalizando seu plano personalizado...',
]

const REP_HINTS: Record<string, string> = {
  '4–6': 'força máxima',
  '5–9': 'força e hipertrofia',
  '6–8': 'força e massa',
  '8–10': 'hipertrofia',
  '10–12': 'hipertrofia moderada',
  '12–15': 'resistência muscular',
}

const GOAL_RECOMMENDED_RANGE: Record<string, string> = {
  'Força': '4–6',
  'Hipertrofia': '8–10',
  'Emagrecimento': '12–15',
  'Resistência': '12–15',
  'Recuperação de lesão': '10–12',
}

const DEFAULT_ANSWERS: QuizAnswers = {
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
}

// ─── Helper functions ─────────────────────────────────────────────────────────

// Conditional question visibility — questões irrelevantes para o contexto do utilizador são ocultadas.
// Cada regra documenta a justificação para que possa ser revista no futuro.
function isStepVisible(stepId: number, a: QuizAnswers): boolean {
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

  // step 2 — idade: se já temos a data de nascimento (do perfil), a idade é
  // calculada automaticamente e a pergunta é pulada.
  if (stepId === 2 && a.birthDate) return false

  // step 3 — gênero: salvo no perfil; se já conhecido, não pergunta de novo.
  if (stepId === 3 && a.gender) return false

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

function getVisibleSteps(a: QuizAnswers): number[] {
  return ALL_STEP_IDS.filter(s => isStepVisible(s, a))
}

// Próximo/anterior step visível calculado pela ORDEM em ALL_STEP_IDS — robusto
// ao caso em que a própria resposta torna o step atual invisível (ex: ao
// preencher a data de nascimento o step 2 deixa de ser visível, então
// visible.indexOf(step) daria -1 e a navegação pularia direto pro fim).
function nextVisibleStep(currentStep: number, a: QuizAnswers): number | null {
  const start = ALL_STEP_IDS.indexOf(currentStep)
  for (let i = start + 1; i < ALL_STEP_IDS.length; i++) {
    if (isStepVisible(ALL_STEP_IDS[i], a)) return ALL_STEP_IDS[i]
  }
  return null
}

function prevVisibleStep(currentStep: number, a: QuizAnswers): number | null {
  const start = ALL_STEP_IDS.indexOf(currentStep)
  for (let i = start - 1; i >= 0; i--) {
    if (isStepVisible(ALL_STEP_IDS[i], a)) return ALL_STEP_IDS[i]
  }
  return null
}

// Quando uma resposta torna outras irrelevantes, limpamos os campos dependentes para não levar lixo ao prompt.
function clearStaleAnswers(next: QuizAnswers, key: keyof QuizAnswers, value: string): QuizAnswers {
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
const MUSCLE_BACKEND_TO_FRONTEND: Record<string, string> = {
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
const MUSCLE_COLOR_CLASSES: Record<string, string> = {
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
function resolveMuscleGroup(ex: { name: string; muscleGroup?: string }): { label: string; color: string } | null {
  if (ex.muscleGroup) {
    const label = MUSCLE_BACKEND_TO_FRONTEND[ex.muscleGroup] ?? ex.muscleGroup
    const color = MUSCLE_COLOR_CLASSES[label] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/30'
    return { label, color }
  }
  return detectMuscleGroup(ex.name)
}

function detectMuscleGroup(name: string): { label: string; color: string } | null {
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
function ageBucketFromBirthDate(birthDate: string): string {
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
function applyProfileDefaults(base: QuizAnswers, d: ProfileDefaults | null): QuizAnswers {
  if (!d) return base
  const next = { ...base }
  if (!next.weightKg && d.weightKg != null) next.weightKg = String(d.weightKg)
  if (!next.heightCm && d.heightCm != null) next.heightCm = String(Math.round(d.heightCm))
  if (!next.gender && d.gender) next.gender = d.gender
  if (!next.birthDate && d.birthDate) {
    next.birthDate = d.birthDate
    next.age = ageBucketFromBirthDate(d.birthDate)
  }
  return next
}

// Foco "inferior" = quadríceps e/ou glúteo e/ou posterior de coxa. Quando o
// usuário prioriza esses grupos, especializamos o split em mais dias de perna
// com focos diferentes (quad / glúteo+posterior / pernas geral) em vez do PPL
// padrão que dá apenas 1 dia de pernas.
function hasLowerBodyFocus(musclesFocus: string[]): boolean {
  return musclesFocus.some((m) => m === 'Quadríceps' || m === 'Glúteo' || m === 'Posterior de Coxa')
}

// Detecta uma DESCRIÇÃO de split conhecido em texto livre (ex: "torso limbs
// 2x na semana", "upper lower 2x", "push pull legs"). Lê a frequência (Nx) e
// expande nos rótulos A/B/C corretos. Retorna null se não reconhecer.
function expandKnownSplitDescription(text: string): string[] | null {
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
function parseCustomSplit(text: string, fallbackDays: number): string[] {
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

function getEffectiveSplit(
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

function getWorkoutLabels(split: string, days: number, customSplit: string = ''): string[] {
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
const REQUIRED_BY_SPLIT_KEY: Record<string, string[]> = {
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

function getRequiredGroups(dayLabel: string): string[] {
  const key = Object.keys(REQUIRED_BY_SPLIT_KEY).find(k => dayLabel.startsWith(k))
  return key ? REQUIRED_BY_SPLIT_KEY[key] : []
}

// Em bodyweight, bíceps/tríceps quase só são treinados como secundário
// (remada supinada → bíceps; flexão/dip → tríceps). Sem essa concessão,
// o aviso "Faltam: Bíceps" seria falso positivo em todo Pull de calistenia.
function getMissingGroups(
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

type VolumeEntry = { label: string; sets: number; color: string; hex: string }

const MUSCLE_HEX: Record<string, string> = {
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

function getWeeklyVolume(sections: WorkoutSection[]): VolumeEntry[] {
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

function estimateDurationMin(exercises: { sets?: number; restSec?: number; repsMax?: number }[]): number {
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
function buildPrompt(a: QuizAnswers, dayLabel: string, dayIdx: number, total: number, split: string): string {
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

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--muted)]">Pergunta {step} de {total}</span>
        <span className="text-xs font-bold text-[var(--brand)]">{Math.round((step / total) * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
        <motion.div
          className="h-full rounded-full bg-[var(--brand)]"
          animate={{ width: `${(step / total) * 100}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>
    </div>
  )
}

function OptionCard({
  label, hint, selected, recommended, onClick,
}: {
  label: string; hint?: string; selected: boolean; recommended?: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full rounded-2xl border-2 px-4 py-3 text-left transition-all ${
        selected
          ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))]'
          : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand)]/50'
      }`}
    >
      {recommended && (
        <span className="absolute right-3 top-3 rounded-full bg-[var(--brand)]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--brand)]">
          Recomendado
        </span>
      )}
      <p className={`text-sm font-bold ${selected ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</p>}
    </button>
  )
}

// ─── Review screen metrics & helpers ─────────────────────────────────────────
// Pequenas funções puras que derivam métricas decorativas (volume, RPE, descanso)
// a partir das respostas do quiz para o card de Resumo.

const SIZE_TO_EX_COUNT: Record<string, number> = {
  'Curto': 4, 'Médio': 6, 'Longo': 9,
}
const RIR_TO_RPE: Record<string, number> = {
  'Falha': 10, 'RIR 1-2': 9, 'RIR 3+': 7,
}
const REST_TO_SEC: Record<string, number> = {
  '30s': 30, '45s': 45, '1min': 60, '1min30s': 90, '2min': 120, '2min30s': 150, '3min': 180,
}
const GOAL_REST_BASELINE: Record<string, number> = {
  'Força': 180, 'Hipertrofia': 90, 'Emagrecimento': 60, 'Resistência': 45, 'Recuperação de lesão': 75,
}

function computeVolumeEst(a: QuizAnswers): { value: number; delta: string; positive: boolean } {
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

function computeIntensity(a: QuizAnswers): { value: string; badge: string } {
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

function computeRest(a: QuizAnswers): { value: string; hint: string; delta: string | null } {
  const sec = REST_TO_SEC[a.restTime]
  if (!sec) return { value: 'IA', hint: 'auto', delta: null }
  const baseline = GOAL_REST_BASELINE[a.goal] ?? 90
  const diff = sec - baseline
  const delta = diff === 0 ? '±0s' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}s`
  return { value: `${sec}s`, hint: 'entre', delta }
}

function computeTempoEst(a: QuizAnswers): string {
  const days = parseInt(a.daysPerWeek, 10) || 3
  return (1.8 + days * 0.4).toFixed(1)
}

// Estima carga visual por bloco — combina dias/semana, experiência e variância
// estável por índice para que cada bloco apareça com %, sem ser totalmente arbitrário.
function computeBlockLoad(a: QuizAnswers, idx: number): number {
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
function friendlyBlockName(label: string): string {
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
function blockMusclesHint(label: string): string {
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
type ChipTone = 'brand' | 'ai' | 'muted'
function getChipTone(value: string): ChipTone {
  const v = value.trim()
  if (v === 'IA decide' || v === 'IA' || v === 'auto') return 'ai'
  if (!v || v === '—' || v === 'Nenhuma' || v === 'Não informado' || v === 'Não' || v === 'Sem foco') return 'muted'
  return 'brand'
}

// Estima duração total do treino (em min) só com base no quiz, antes de gerar.
// Usa exerciseCount como proxy: Curto≈40, Médio≈55, Longo≈75. Default 60.
function estimateQuizDurationMin(a: QuizAnswers): number {
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
function dayOfWeekLabels(numDays: number): string[] {
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
function rpeFromRir(rirTarget: string): string {
  if (rirTarget === 'Falha') return '10'
  if (rirTarget === 'RIR 1-2') return '9'
  if (rirTarget === 'RIR 3+') return '7'
  return '—'
}

// Translates a day's planName ("Upper A", "Lower B"…) into the human-readable
// focus label used in the day card header chip.
function focoFromDayLabel(label: string): string {
  const lower = label.toLowerCase()
  if (/^(upper|push|pull|peito|costas|ombros|braços|superior)/.test(lower)) return 'superior'
  if (/^(lower|legs|pernas|posterior|glúteo|inferior)/.test(lower)) return 'inferior'
  if (/full body/.test(lower)) return 'total'
  return 'misto'
}

// ─── REVIEW screen — small presentational components ────────────────────────

function MiniStat({ label, value, unit, delta }: { label: string; value: string; unit: string; delta: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
      <div className="min-w-0">
        <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {label}
        </p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-base font-extrabold leading-none tracking-tight text-[var(--text)] sm:text-lg">
            {value}
          </span>
          <span className="text-[11px] text-[var(--muted)]">{unit}</span>
        </p>
      </div>
      <span
        className="shrink-0 rounded-md border border-[var(--brand)]/30 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[var(--brand-strong)]"
        style={{ background: 'color-mix(in srgb, var(--brand) 9%, transparent)' }}
      >
        {delta}
      </span>
    </div>
  )
}

function LegendItem({ tone, label }: { tone: ChipTone; label: string }) {
  const dotClass =
    tone === 'brand' ? 'bg-[var(--brand)]'
    : tone === 'ai' ? 'bg-[var(--muted)]'
    : 'bg-[var(--line)]'
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-[var(--muted)]">
      <span className={`h-1.5 w-1.5 rounded-sm ${dotClass}`} />
      {label}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AIWorkoutPage() {
  const { authorizedFetch } = useAuth()
  const navigate = useNavigate()

  const [appScreen, setAppScreen] = useState<AppScreen>('WELCOME')
  const ANSWERS_STORAGE_KEY = 'ai-workout-answers-v3'

  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [isEditMode, setIsEditMode] = useState(false)
  const [answers, setAnswers] = useState<QuizAnswers>(() => {
    try {
      const raw = localStorage.getItem(ANSWERS_STORAGE_KEY)
      if (!raw) return DEFAULT_ANSWERS
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_ANSWERS, ...parsed }
      }
    } catch {/* ignore */}
    return DEFAULT_ANSWERS
  })

  useEffect(() => {
    try { localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(answers)) } catch {/* ignore */}
  }, [answers])

  const hasSavedAnswers = useMemo(() => {
    return Boolean(answers.daysPerWeek || answers.experience || answers.goal || answers.location)
  }, [answers.daysPerWeek, answers.experience, answers.goal, answers.location])
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const [sections, setSections] = useState<WorkoutSection[]>([])
  const [generatingStep, setGeneratingStep] = useState<{ current: number; total: number; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [saveResults, setSaveResults] = useState<Record<number, SaveResult>>({})
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)
  const [extraHistory, setExtraHistory] = useState<string[]>([])
  // Rótulos resolvidos do plano gerado (especialmente p/ divisão "Outro"
  // interpretada por IA). Guardados para o regenerar usar os MESMOS dias.
  const [resolvedLabels, setResolvedLabels] = useState<string[]>([])
  // Dias da semana citados pelo usuário (divisão "Outro"). Vazio = auto-espaça.
  const [resolvedWeekdays, setResolvedWeekdays] = useState<string[]>([])
  // Which day tab is open in the RESULT screen, and which exercise within it.
  // Reset both whenever a new plan is generated (handled in handleGenerate).
  const [activeDayIndex, setActiveDayIndex] = useState(0)
  const [expandedExerciseKey, setExpandedExerciseKey] = useState<string | null>(null)

  const resultRef = useRef<HTMLDivElement>(null)

  const EXTRA_HISTORY_KEY = 'ai-workout-extra-history'

  useEffect(() => {
    try {
      const raw = localStorage.getItem(EXTRA_HISTORY_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setExtraHistory(parsed.filter(x => typeof x === 'string').slice(0, 5))
      }
    } catch {/* ignore */}
  }, [])

  const pushExtraHistory = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setExtraHistory(prev => {
      const next = [trimmed, ...prev.filter(x => x !== trimmed)].slice(0, 5)
      try { localStorage.setItem(EXTRA_HISTORY_KEY, JSON.stringify(next)) } catch {/* ignore */}
      return next
    })
  }, [])

  useEffect(() => {
    if (appScreen !== 'LOADING') return
    const interval = setInterval(() => {
      setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [appScreen])

  // Guarda os dados do perfil pra reaplicar ao recomeçar o quiz do zero (a
  // requisição só roda uma vez na montagem; o reset não pode re-buscar de forma
  // síncrona).
  const profileDefaultsRef = useRef<ProfileDefaults | null>(null)

  // Pré-preenche o quiz com os dados do perfil (peso atual do progresso,
  // altura, gênero, data de nascimento). Só preenche campos VAZIOS — não
  // sobrescreve o que o usuário já respondeu/salvou.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const defaults = await getProfileDefaults(authorizedFetch)
        if (cancelled) return
        profileDefaultsRef.current = defaults
        setAnswers(prev => applyProfileDefaults(prev, defaults))
      } catch {
        // Sem perfil/dados — segue com o quiz normal.
      }
    })()
    return () => { cancelled = true }
  }, [authorizedFetch])

  // Recomeça o quiz do zero, mas reaplica os dados do perfil (ex: data de
  // nascimento já salva) pra não reperguntar o que já sabemos.
  const resetQuiz = useCallback(() => {
    try { localStorage.removeItem(ANSWERS_STORAGE_KEY) } catch {/* ignore */}
    setStep(0)
    setAnswers(applyProfileDefaults({ ...DEFAULT_ANSWERS }, profileDefaultsRef.current))
    setIsEditMode(false)
    setAppScreen('QUIZ')
  }, [])

  const advanceStep = useCallback(() => {
    setDirection(1)
    if (isEditMode) { setAppScreen('REVIEW'); return }
    const next = nextVisibleStep(step, answers)
    if (next != null) {
      setStep(next)
    } else {
      setAppScreen('REVIEW')
    }
  }, [step, isEditMode, answers])

  const goBack = useCallback(() => {
    setDirection(-1)
    if (isEditMode) { setAppScreen('REVIEW'); return }
    const prev = prevVisibleStep(step, answers)
    if (prev != null) {
      setStep(prev)
    } else {
      setAppScreen('WELCOME')
    }
  }, [step, isEditMode, answers])

  const selectAndAdvance = useCallback((key: keyof QuizAnswers, value: string) => {
    // Espelha a transformação aplicada dentro de setAnswers para calcular visibilidade do próximo passo.
    const nextAnswers = clearStaleAnswers({ ...answers, [key]: value }, key, value)

    setAnswers(prev => clearStaleAnswers({ ...prev, [key]: value }, key, value))
    setDirection(1)

    if (isEditMode) {
      setTimeout(() => setAppScreen('REVIEW'), 160)
      return
    }

    setTimeout(() => {
      const next = nextVisibleStep(step, nextAnswers)
      if (next != null) {
        setStep(next)
      } else {
        setAppScreen('REVIEW')
      }
    }, 160)
  }, [isEditMode, step, answers])

  // Seleciona o gênero, persiste no perfil (pra não reperguntar), atualiza o
  // ref dos defaults (caso recomece o quiz na mesma sessão) e avança.
  const selectGender = useCallback((value: 'Masculino' | 'Feminino') => {
    profileDefaultsRef.current = {
      ...(profileDefaultsRef.current ?? { weightKg: null, heightCm: null, gender: null, birthDate: null, age: null }),
      gender: value,
    }
    void updateGender(authorizedFetch, value).catch(() => {})
    selectAndAdvance('gender', value)
  }, [authorizedFetch, selectAndAdvance])

  const toggleTechnique = (t: string) => {
    setAnswers(prev => {
      if (t === 'Nenhuma') return { ...prev, techniques: ['Nenhuma'] }
      const without = prev.techniques.filter(x => x !== 'Nenhuma')
      return {
        ...prev,
        techniques: without.includes(t) ? without.filter(x => x !== t) : [...without, t],
      }
    })
  }

  const toggleMuscle = (m: string) => {
    setAnswers(prev => {
      if (prev.musclesFocus.includes(m)) return { ...prev, musclesFocus: prev.musclesFocus.filter(x => x !== m) }
      if (prev.musclesFocus.length >= 3) return prev
      return { ...prev, musclesFocus: [...prev.musclesFocus, m] }
    })
  }

  const handleGenerate = useCallback(async () => {
    const days = parseInt(answers.daysPerWeek, 10) || 4
    const split = getEffectiveSplit(days, answers.muscleFrequency, answers.musclesFocus, answers.splitPreference)
    let labels = getWorkoutLabels(split, days, answers.customSplit)

    setAppScreen('LOADING')
    setLoadingMsgIdx(0)
    setError(null)
    setSections([])
    setSaveResults({})
    setGeneratingStep(null)
    // New plan → start on first day with no exercises expanded.
    setActiveDayIndex(0)
    setExpandedExerciseKey(null)
    if (answers.extraInfo) pushExtraHistory(answers.extraInfo)

    try {
      // Divisão "Outro": se o parser local achou só 1 dia mas o texto é uma
      // frase longa (linguagem natural), pede à IA pra interpretar a descrição.
      let weekdays: string[] = []
      if (split === 'Outro' && labels.length <= 1 && answers.customSplit.trim().length > 20) {
        try {
          const parsed = await parseCustomSplitAI(authorizedFetch, answers.customSplit, days)
          labels = parsed.map((d) => d.label)
          weekdays = parsed.map((d) => d.weekday)
        } catch {
          // Mantém o fallback do parser local se a IA falhar.
        }
      }
      setResolvedLabels(labels)
      setResolvedWeekdays(weekdays)

      const accumulated: WorkoutSection[] = []
      const usedExercises: string[] = []

      // Mapeamento local → enum aceita pelo schema da API.
      const equipmentMap: Record<string, string> = {
        'Academia completa': 'Academia (completa)',
        'Em casa com equipamentos': 'Casa com equipamentos',
        'Em casa sem equipamentos': 'Sem equipamento',
      }
      // techniques no quiz inclui "Nenhuma" como sentinela — removida antes de enviar.
      const realTechniques = answers.techniques.filter(t => t !== 'Nenhuma')

      for (let i = 0; i < labels.length; i++) {
        const label = labels[i]
        setGeneratingStep({ current: i + 1, total: labels.length, label })

        const heightNum = answers.heightCm ? parseInt(answers.heightCm, 10) : NaN
        const weightNum = answers.weightKg ? parseFloat(answers.weightKg) : NaN

        const result = await generateAIWorkout(authorizedFetch, {
          prompt: buildPrompt(answers, label, i, labels.length, split),
          dayLabel: label,
          weekDays: answers.daysPerWeek || undefined,
          split: split || undefined,
          muscleFrequency: answers.muscleFrequency || undefined,
          level: answers.experience || undefined,
          age: answers.age || undefined,
          gender: answers.gender || undefined,
          heightCm: Number.isFinite(heightNum) && heightNum >= 100 && heightNum <= 250 ? heightNum : undefined,
          weightKg: Number.isFinite(weightNum) && weightNum >= 30 && weightNum <= 300 ? weightNum : undefined,
          phase: answers.phase || undefined,
          goal: answers.goal || undefined,
          equipment: equipmentMap[answers.location] || undefined,
          equipmentPreference: answers.equipment || undefined,
          durationMin: answers.duration || undefined,
          exerciseCount: answers.exerciseCount || undefined,
          repRange: answers.repRange || undefined,
          restTime: answers.restTime || undefined,
          rirTarget: answers.rirTarget || undefined,
          techniques: realTechniques.length > 0 ? realTechniques : undefined,
          musclesFocus: answers.musclesFocus.length > 0 ? answers.musclesFocus : undefined,
          injuries: [
            answers.hasInjury && answers.injuryDescription ? `Lesão: ${answers.injuryDescription}` : '',
            answers.avoidExercises ? `Evitar: ${answers.avoidExercises}` : '',
          ].filter(Boolean).join('. ') || undefined,
          usedExercises: usedExercises.length > 0 ? usedExercises.slice(-80) : undefined,
          extraInfo: answers.extraInfo || undefined,
        })

        const section = result.sections[0]
        if (section) {
          accumulated.push({
            displayText: section.displayText,
            workoutData: section.workoutData
              ? { ...section.workoutData, planName: section.workoutData.planName || label }
              : null,
          })
          if (section.workoutData) {
            for (const ex of section.workoutData.exercises) {
              if (ex.name && !usedExercises.includes(ex.name)) usedExercises.push(ex.name)
            }
          }
          setSections([...accumulated])
        }

        if (i === 0) {
          setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
        }
      }

      setAppScreen('RESULT')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar treino. Tente novamente.')
      setAppScreen('REVIEW')
    } finally {
      setGeneratingStep(null)
    }
  }, [authorizedFetch, answers, pushExtraHistory])

  const handleSaveOne = useCallback(async (index: number) => {
    const wd = sections[index]?.workoutData
    if (!wd) return
    setSavingIndex(index)
    setError(null)
    try {
      const result = await saveAIWorkout(authorizedFetch, { planName: wd.planName, exercises: wd.exercises })
      setSaveResults(prev => ({
        ...prev,
        [index]: {
          planId: result.planId,
          planName: result.planName,
          foundCount: result.savedExercises.filter(e => e.found).length,
          totalCount: result.savedExercises.length,
        },
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar treino.')
    } finally {
      setSavingIndex(null)
    }
  }, [authorizedFetch, sections])

  const handleRegenerateDay = useCallback(async (index: number) => {
    const days = parseInt(answers.daysPerWeek, 10) || 4
    const split = getEffectiveSplit(days, answers.muscleFrequency, answers.musclesFocus, answers.splitPreference)
    // Usa os labels resolvidos na geração (inclui interpretação IA do "Outro");
    // só recalcula se não houver (ex: regenerar sem ter gerado antes).
    const labels = resolvedLabels.length > 0 ? resolvedLabels : getWorkoutLabels(split, days, answers.customSplit)
    const label = labels[index]
    if (!label) return

    const equipmentMap: Record<string, string> = {
      'Academia completa': 'Academia (completa)',
      'Em casa com equipamentos': 'Casa com equipamentos',
      'Em casa sem equipamentos': 'Sem equipamento',
    }
    const realTechniques = answers.techniques.filter(t => t !== 'Nenhuma')

    // Used exercises = todos os exercícios das outras seções (variação entre dias)
    const used: string[] = []
    sections.forEach((s, i) => {
      if (i === index || !s.workoutData) return
      for (const ex of s.workoutData.exercises) if (ex.name) used.push(ex.name)
    })

    setRegeneratingIndex(index)
    setError(null)
    try {
      const heightNum = answers.heightCm ? parseInt(answers.heightCm, 10) : NaN
      const weightNum = answers.weightKg ? parseFloat(answers.weightKg) : NaN
      const result = await generateAIWorkout(authorizedFetch, {
        prompt: buildPrompt(answers, label, index, labels.length, split),
        dayLabel: label,
        weekDays: answers.daysPerWeek || undefined,
        split: split || undefined,
        muscleFrequency: answers.muscleFrequency || undefined,
        level: answers.experience || undefined,
        age: answers.age || undefined,
        gender: answers.gender || undefined,
        heightCm: Number.isFinite(heightNum) && heightNum >= 100 && heightNum <= 250 ? heightNum : undefined,
        weightKg: Number.isFinite(weightNum) && weightNum >= 30 && weightNum <= 300 ? weightNum : undefined,
        phase: answers.phase || undefined,
        goal: answers.goal || undefined,
        equipment: equipmentMap[answers.location] || undefined,
        equipmentPreference: answers.equipment || undefined,
        durationMin: answers.duration || undefined,
        exerciseCount: answers.exerciseCount || undefined,
        repRange: answers.repRange || undefined,
        restTime: answers.restTime || undefined,
        rirTarget: answers.rirTarget || undefined,
        techniques: realTechniques.length > 0 ? realTechniques : undefined,
        musclesFocus: answers.musclesFocus.length > 0 ? answers.musclesFocus : undefined,
        injuries: [
          answers.hasInjury && answers.injuryDescription ? `Lesão: ${answers.injuryDescription}` : '',
          answers.avoidExercises ? `Evitar: ${answers.avoidExercises}` : '',
        ].filter(Boolean).join('. ') || undefined,
        usedExercises: used.length > 0 ? used.slice(-80) : undefined,
        extraInfo: answers.extraInfo || undefined,
      })
      const newSection = result.sections[0]
      if (newSection) {
        setSections(prev => prev.map((s, i) => i === index
          ? { displayText: newSection.displayText, workoutData: newSection.workoutData ? { ...newSection.workoutData, planName: newSection.workoutData.planName || label } : null }
          : s))
        setSaveResults(prev => {
          const copy = { ...prev }
          delete copy[index]
          return copy
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao regenerar dia.')
    } finally {
      setRegeneratingIndex(null)
    }
  }, [authorizedFetch, answers, sections, resolvedLabels])

  const moveExercise = useCallback((sectionIndex: number, exIndex: number, dir: -1 | 1) => {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIndex || !s.workoutData) return s
      const exs = [...s.workoutData.exercises]
      const target = exIndex + dir
      if (target < 0 || target >= exs.length) return s
      ;[exs[exIndex], exs[target]] = [exs[target], exs[exIndex]]
      return { ...s, workoutData: { ...s.workoutData, exercises: exs } }
    }))
    setSaveResults(prev => {
      const copy = { ...prev }
      delete copy[sectionIndex]
      return copy
    })
  }, [])

  const removeExercise = useCallback((sectionIndex: number, exIndex: number) => {
    setSections(prev => prev.map((s, i) => {
      if (i !== sectionIndex || !s.workoutData) return s
      const exs = s.workoutData.exercises.filter((_, idx) => idx !== exIndex)
      return { ...s, workoutData: { ...s.workoutData, exercises: exs } }
    }))
    setSaveResults(prev => {
      const copy = { ...prev }
      delete copy[sectionIndex]
      return copy
    })
  }, [])

  // Troca um exercício por outro do mesmo grupo (instantâneo, sem IA). Mantém
  // séries/reps/descanso; muda só o nome/grupo. Evita repetir os do dia.
  const [swappingKey, setSwappingKey] = useState<string | null>(null)
  const swapExercise = useCallback(async (sectionIndex: number, exIndex: number) => {
    const section = sections[sectionIndex]
    const ex = section?.workoutData?.exercises[exIndex]
    if (!ex) return
    const muscle = resolveMuscleGroup(ex)?.label
    if (!muscle) return
    const equipmentMap: Record<string, string> = {
      'Academia completa': 'Academia (completa)',
      'Em casa com equipamentos': 'Casa com equipamentos',
      'Em casa sem equipamentos': 'Sem equipamento',
    }
    const dayNames = section.workoutData?.exercises.map(e => e.name) ?? []
    setSwappingKey(`${sectionIndex}-${exIndex}`)
    setError(null)
    try {
      const replacement = await swapExerciseAI(authorizedFetch, {
        muscleGroup: muscle,
        equipment: equipmentMap[answers.location] || undefined,
        exclude: dayNames,
      })
      setSections(prev => prev.map((s, i) => {
        if (i !== sectionIndex || !s.workoutData) return s
        const exs = s.workoutData.exercises.map((e, idx) =>
          idx === exIndex
            ? { ...e, name: replacement.name, muscleGroup: replacement.muscleGroup, secondaryMuscleGroup: replacement.secondaryMuscleGroup ?? undefined }
            : e,
        )
        return { ...s, workoutData: { ...s.workoutData, exercises: exs } }
      }))
      setSaveResults(prev => {
        const copy = { ...prev }
        delete copy[sectionIndex]
        return copy
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao trocar exercício')
    } finally {
      setSwappingKey(null)
    }
  }, [authorizedFetch, sections, answers.location])


  // ─── WELCOME ──────────────────────────────────────────────────────────────

  if (appScreen === 'WELCOME') {
    return (
      <section className="flex min-h-[70vh] items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl animate-[tech-spin_20s_linear_infinite]"
            style={{ background: 'var(--tech-gradient-conic)' }}
          />
          <div className="relative mx-auto mb-5 h-16 w-16">
            <div
              aria-hidden
              className="absolute -inset-[3px] rounded-2xl animate-[tech-spin_8s_linear_infinite]"
              style={{ background: 'var(--tech-gradient-conic)' }}
            />
            <div className="relative flex h-full w-full items-center justify-center rounded-2xl bg-[var(--surface)]">
              <Bot size={32} className="text-[var(--brand)]" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-[var(--text)]">
            Vamos montar seu treino personalizado
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Responda algumas perguntas rápidas e a IA cria um plano feito especialmente para você
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-4 py-2">
            <Clock size={13} className="text-[var(--muted)]" />
            <span className="text-xs font-semibold text-[var(--muted)]">Menos de 3 minutos</span>
          </div>
          {hasSavedAnswers ? (
            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => { setStep(0); setIsEditMode(false); setAppScreen('REVIEW') }}
                className="w-full rounded-2xl bg-[var(--brand)] py-3.5 text-sm font-bold text-white"
              >
                Continuar de onde parei
              </button>
              <button
                type="button"
                onClick={resetQuiz}
                className="w-full rounded-2xl border border-[var(--line)] py-3 text-xs font-semibold text-[var(--muted)]"
              >
                Começar do zero
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={resetQuiz}
              className="mt-6 w-full rounded-2xl bg-[var(--brand)] py-3.5 text-sm font-bold text-white"
            >
              Começar
            </button>
          )}
        </motion.div>
      </section>
    )
  }

  // ─── LOADING ──────────────────────────────────────────────────────────────

  if (appScreen === 'LOADING') {
    return (
      <section className="flex min-h-[70vh] items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-10 text-center"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-30 blur-2xl"
            style={{ background: 'radial-gradient(circle at 50% 30%, var(--accent-cyan), transparent 60%)' }}
          />
          <div className="relative mx-auto mb-6 h-20 w-20">
            <div
              aria-hidden
              className="absolute -inset-3 rounded-full opacity-50 blur-md animate-[tech-pulse_2.4s_ease-in-out_infinite]"
              style={{ background: 'var(--tech-gradient-conic)' }}
            />
            <div
              aria-hidden
              className="absolute inset-0 rounded-full animate-[tech-spin_3s_linear_infinite]"
              style={{ background: 'var(--tech-gradient-conic)' }}
            />
            <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-[var(--surface)]">
              <Sparkles size={24} className="text-[var(--brand)] animate-pulse" />
            </div>
          </div>
          {generatingStep && generatingStep.total > 1 && (
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--brand)]">
              Dia {generatingStep.current} de {generatingStep.total} — {generatingStep.label}
            </p>
          )}
          <AnimatePresence mode="wait">
            <motion.p
              key={loadingMsgIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="text-base font-semibold text-[var(--text)]"
            >
              {LOADING_MESSAGES[loadingMsgIdx]}
            </motion.p>
          </AnimatePresence>
          <p className="mt-2 text-xs text-[var(--muted)]">Isso pode levar alguns segundos...</p>
        </motion.div>
      </section>
    )
  }

  // ─── QUIZ ─────────────────────────────────────────────────────────────────

  if (appScreen === 'QUIZ') {
    const recommendedRange = GOAL_RECOMMENDED_RANGE[answers.goal] ?? null

    const visibleSteps = getVisibleSteps(answers)
    const totalVisible = visibleSteps.length
    const visibleIdx = visibleSteps.indexOf(step)
    const isLastVisibleStep = visibleIdx === totalVisible - 1

    // Steps that need explicit Next button (multi-select or text input)
    const needsNextButton = [2, 12, 13, 14, 15].includes(step)
      || (step === 18 && answers.hasExtraInfo === true)
      || (step === 19 && answers.splitPreference === 'Outro')

    const stepContent = (() => {
      switch (step) {
        case 0:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Quantos dias por semana você vai treinar?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Escolha sua frequência semanal</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {[['2', '2x por semana', 'Ideal para começar'], ['3', '3x por semana', 'Bom equilíbrio'], ['4', '4x por semana', 'Frequência eficiente'], ['5', '5x por semana', 'Volume alto'], ['6', '6x por semana', 'Atletas avançados']].map(([val, label, hint]) => (
                  <OptionCard key={val} label={label} hint={hint} selected={answers.daysPerWeek === val} onClick={() => selectAndAdvance('daysPerWeek', val)} />
                ))}
              </div>
            </>
          )

        case 1:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual é o seu nível de experiência?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Isso ajuda a calibrar volume e intensidade</p>
              <div className="mt-5 space-y-2">
                {[['Iniciante', 'Menos de 1 ano treinando'], ['Intermediário', '1 a 3 anos treinando'], ['Avançado', 'Mais de 3 anos treinando']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.experience === val} onClick={() => selectAndAdvance('experience', val)} />
                ))}
              </div>
            </>
          )

        case 2:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual a sua data de nascimento?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Calculamos a idade automaticamente — você não precisa responder de novo nas próximas vezes</p>
              <div className="mt-5">
                <input
                  type="date"
                  value={answers.birthDate}
                  max={new Date().toISOString().slice(0, 10)}
                  min="1920-01-01"
                  onChange={(e) => {
                    const bd = e.target.value
                    setAnswers(prev => ({ ...prev, birthDate: bd, age: bd ? ageBucketFromBirthDate(bd) : '' }))
                    if (bd) {
                      // Persiste no perfil pra não perguntar de novo, e atualiza
                      // o ref pra que "começar do zero" na mesma sessão não
                      // reperguntar (o ref foi populado na montagem, antes disto).
                      profileDefaultsRef.current = { ...(profileDefaultsRef.current ?? { weightKg: null, heightCm: null, gender: null, birthDate: null, age: null }), birthDate: bd }
                      void updateBirthDate(authorizedFetch, bd).catch(() => {})
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-3 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--brand)]"
                />
                {answers.birthDate && (
                  <p className="mt-2 text-[12px] text-[var(--muted)]">
                    Faixa etária: <span className="font-semibold text-[var(--brand)]">{ageBucketFromBirthDate(answers.birthDate)}</span>
                  </p>
                )}
              </div>
            </>
          )

        case 3:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual o seu gênero?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Define a ênfase muscular padrão quando não há foco específico</p>
              <div className="mt-5 space-y-2">
                {[['Masculino', 'Ênfase padrão em superiores (peito/costas/ombros)'], ['Feminino', 'Ênfase padrão em inferiores (glúteo/posterior/quad)']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.gender === val} onClick={() => selectGender(val as 'Masculino' | 'Feminino')} />
                ))}
              </div>
            </>
          )

        case 4:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual fase você está atualmente?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Define a estratégia de volume e intensidade</p>
              <div className="mt-5 space-y-2">
                {[['Ganho de massa', 'Foco em aumentar volume muscular com superávit calórico'], ['Cutting (definição)', 'Manter músculo enquanto perde gordura'], ['Recomposição', 'Ganhar músculo e perder gordura simultaneamente'], ['Manutenção', 'Manter o físico atual com boa qualidade de vida']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.phase === val} onClick={() => selectAndAdvance('phase', val)} />
                ))}
              </div>
            </>
          )

        case 5:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual o foco principal do treino?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">O objetivo que guia a seleção de exercícios e métodos</p>
              <div className="mt-5 space-y-2">
                {[['Hipertrofia', 'Maximizar crescimento muscular'], ['Força', 'Aumentar cargas e força máxima'], ['Emagrecimento', 'Queima de gordura com treinos mais intensos'], ['Resistência', 'Melhorar capacidade cardiovascular e muscular'], ['Recuperação de lesão', 'Treino adaptado para reabilitação']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.goal === val} onClick={() => selectAndAdvance('goal', val)} />
                ))}
              </div>
            </>
          )

        case 6:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Onde você treina?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Define os exercícios e equipamentos disponíveis</p>
              <div className="mt-5 space-y-2">
                {[['Academia completa', 'Acesso a todos os aparelhos e pesos livres'], ['Em casa com equipamentos', 'Halteres, barras, elásticos ou banco'], ['Em casa sem equipamentos', 'Apenas peso corporal']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.location === val} onClick={() => selectAndAdvance('location', val)} />
                ))}
              </div>
            </>
          )

        case 7:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Preferência de equipamentos?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Mesmo em academia, você pode ter uma preferência</p>
              <div className="mt-5 space-y-2">
                {[['Pesos livres', 'Halteres e barras — mais ativação muscular'], ['Máquinas', 'Maior segurança e isolamento'], ['Misto', 'Combinação de pesos livres e máquinas']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.equipment === val} onClick={() => selectAndAdvance('equipment', val)} />
                ))}
              </div>
            </>
          )

        case 8:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Duração desejada da sessão?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">O tempo que você tem disponível por treino</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {[['30', '30 minutos'], ['45', '45 minutos'], ['60', '1 hora'], ['90', '1h30'], ['120', '2 horas']].map(([val, label]) => (
                  <OptionCard key={val} label={label} selected={answers.duration === val} onClick={() => selectAndAdvance('duration', val)} />
                ))}
              </div>
            </>
          )

        case 9:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Frequência por grupo muscular?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Quantas vezes por semana cada músculo será treinado</p>
              <div className="mt-5 space-y-2">
                {[['1x por semana', 'Cada músculo aparece uma vez (ex: Bro Split)'], ['2x por semana', 'Cada músculo aparece duas vezes (ex: Upper/Lower)'], ['IA decide', 'A IA escolhe o melhor split para seu perfil']].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.muscleFrequency === val} onClick={() => selectAndAdvance('muscleFrequency', val)} />
                ))}
              </div>
            </>
          )

        case 10:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Faixa de repetições preferida?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Será usada como referência principal nos exercícios</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {(['4–6', '5–9', '6–8', '8–10', '10–12', '12–15'] as const).map(val => (
                  <OptionCard
                    key={val}
                    label={val + ' reps'}
                    hint={REP_HINTS[val]}
                    recommended={val === recommendedRange}
                    selected={answers.repRange === val}
                    onClick={() => selectAndAdvance('repRange', val)}
                  />
                ))}
              </div>
              {recommendedRange && (
                <p className="mt-3 text-[11px] text-[var(--muted)]">
                  ★ Faixa recomendada para <span className="font-semibold text-[var(--brand)]">{answers.goal}</span>: {recommendedRange} reps
                </p>
              )}
            </>
          )

        case 11:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Tempo de descanso entre séries?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Influencia diretamente a intensidade e o volume da sessão</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {([
                  ['30s', '30 segundos', 'Resistência e condicionamento'],
                  ['45s', '45 segundos', 'Alta intensidade metabólica'],
                  ['1min', '1 minuto', 'Hipertrofia com densidade'],
                  ['1min30s', '1 min 30 seg', 'Hipertrofia clássica'],
                  ['2min', '2 minutos', 'Hipertrofia e força'],
                  ['2min30s', '2 min 30 seg', 'Força com volume'],
                  ['3min', '3 minutos', 'Força máxima e compostos pesados'],
                  ['IA decide', 'IA decide', 'Adaptado ao tipo de exercício'],
                ] as const).map(([val, label, hint]) => (
                  <OptionCard key={val} label={label} hint={hint} selected={answers.restTime === val} onClick={() => selectAndAdvance('restTime', val)} />
                ))}
              </div>
            </>
          )

        case 12:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Técnicas avançadas?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Selecione uma ou mais (pode escolher várias)</p>
              <div className="mt-5 space-y-2">
                {['Nenhuma', 'Drop Set', 'Cluster Set', 'Rest-Pause', 'Bi-Set'].map(t => {
                  const selected = answers.techniques.includes(t)
                  return (
                    <button
                      type="button"
                      key={t}
                      onClick={() => toggleTechnique(t)}
                      className={`flex w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                        selected
                          ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))]'
                          : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand)]/50'
                      }`}
                    >
                      <span className={`text-sm font-bold ${selected ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>{t}</span>
                      {selected && <CheckCircle2 size={16} className="shrink-0 text-[var(--brand)]" />}
                    </button>
                  )
                })}
              </div>
            </>
          )

        case 13:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Tem foco muscular específico?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Selecione até 3 músculos que quer priorizar</p>
              <div className="mt-4 flex gap-2">
                {[true, false].map(val => (
                  <button
                    type="button"
                    key={String(val)}
                    onClick={() => setAnswers(prev => ({ ...prev, hasFocus: val, musclesFocus: val ? prev.musclesFocus : [] }))}
                    className={`flex-1 rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                      answers.hasFocus === val
                        ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]'
                        : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/50'
                    }`}
                  >
                    {val ? 'Sim' : 'Não'}
                  </button>
                ))}
              </div>
              {answers.hasFocus === true && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
                    Selecione até 3 músculos ({answers.musclesFocus.length}/3)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {MUSCLES_LIST.map(m => {
                      const selected = answers.musclesFocus.includes(m)
                      const disabled = !selected && answers.musclesFocus.length >= 3
                      return (
                        <button
                          type="button"
                          key={m}
                          onClick={() => !disabled && toggleMuscle(m)}
                          disabled={disabled}
                          className={`flex items-center justify-between rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all ${
                            selected
                              ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]'
                              : disabled
                                ? 'border-[var(--line)] text-[var(--muted)] opacity-40'
                                : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/50'
                          }`}
                        >
                          {m}
                          {selected && <CheckCircle2 size={14} className="shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </>
          )

        case 14:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Lesões ou exercícios para evitar?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Opcional — pode pular se não tiver nenhuma restrição</p>
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-[var(--text)]">Tenho uma lesão</p>
                    <button
                      type="button"
                      onClick={() => setAnswers(prev => ({ ...prev, hasInjury: !prev.hasInjury, injuryDescription: prev.hasInjury ? '' : prev.injuryDescription }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${answers.hasInjury ? 'bg-[var(--brand)]' : 'bg-[var(--line)]'}`}
                    >
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${answers.hasInjury ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {answers.hasInjury && (
                    <motion.textarea
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      value={answers.injuryDescription}
                      onChange={e => setAnswers(prev => ({ ...prev, injuryDescription: e.target.value }))}
                      placeholder="Descreva sua lesão... Ex: dor no joelho direito, hérnia lombar L4-L5"
                      rows={3}
                      className="mt-3 w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
                    />
                  )}
                </div>
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-[var(--text)]">Quero evitar exercícios</p>
                    <button
                      type="button"
                      onClick={() => setAnswers(prev => ({ ...prev, avoidExercises: prev.avoidExercises ? '' : ' ' }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${answers.avoidExercises.trim() !== '' ? 'bg-[var(--brand)]' : 'bg-[var(--line)]'}`}
                    >
                      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${answers.avoidExercises.trim() !== '' ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {answers.avoidExercises.trim() !== '' || answers.avoidExercises === ' ' ? (
                    <motion.textarea
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      value={answers.avoidExercises.trimStart()}
                      onChange={e => setAnswers(prev => ({ ...prev, avoidExercises: e.target.value }))}
                      placeholder="Ex: agachamento livre, supino reto, levantamento terra"
                      rows={3}
                      className="mt-3 w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
                    />
                  ) : null}
                </div>
              </div>
            </>
          )

        case 15:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Altura e peso? (opcional)</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Ajuda a calibrar carga inicial e cuidados articulares</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--muted)]">Altura (cm)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={100}
                    max={250}
                    value={answers.heightCm}
                    onChange={e => setAnswers(prev => ({ ...prev, heightCm: e.target.value.replace(/[^\d]/g, '') }))}
                    placeholder="Ex: 175"
                    className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--muted)]">Peso (kg)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={30}
                    max={300}
                    step="0.1"
                    value={answers.weightKg}
                    onChange={e => setAnswers(prev => ({ ...prev, weightKg: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') }))}
                    placeholder="Ex: 75"
                    className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)]"
                  />
                </label>
              </div>
            </>
          )

        case 16:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Quantos exercícios por treino?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Influencia o tamanho da sessão (cobertura obrigatória é mantida)</p>
              <div className="mt-5 space-y-2">
                {[
                  ['Curto', '4-5 exercícios — sessões rápidas e densas'],
                  ['Médio', '6-7 exercícios — equilíbrio padrão'],
                  ['Longo', '8-10 exercícios — volume alto'],
                  ['IA decide', 'A IA escolhe pelo perfil e duração'],
                ].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.exerciseCount === val} onClick={() => selectAndAdvance('exerciseCount', val)} />
                ))}
              </div>
            </>
          )

        case 17:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Proximidade da falha (RIR)?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Quantas repetições deixar na reserva</p>
              <div className="mt-5 space-y-2">
                {[
                  ['Falha', 'Treino até a falha em isolados; RIR 1 em compostos'],
                  ['RIR 1-2', 'Deixo 1-2 reps na reserva (padrão hipertrofia)'],
                  ['RIR 3+', 'Deixo 3+ reps na reserva (foco em técnica/recuperação)'],
                  ['IA decide', 'A IA escolhe pelo nível e exercício'],
                ].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.rirTarget === val} onClick={() => selectAndAdvance('rirTarget', val)} />
                ))}
              </div>
            </>
          )

        case 18:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Quer adicionar algo para a IA?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Exercício específico, observação ou qualquer detalhe extra</p>
              <div className="mt-4 flex gap-2">
                {[true, false].map(val => (
                  <button
                    type="button"
                    key={String(val)}
                    onClick={() => {
                      if (!val) {
                        setAnswers(prev => ({ ...prev, hasExtraInfo: false, extraInfo: '' }))
                        setDirection(1)
                        setAppScreen('REVIEW')
                      } else {
                        setAnswers(prev => ({ ...prev, hasExtraInfo: true }))
                      }
                    }}
                    className={`flex-1 rounded-2xl border-2 py-3 text-sm font-bold transition-all ${
                      answers.hasExtraInfo === val
                        ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))] text-[var(--brand)]'
                        : 'border-[var(--line)] text-[var(--text)] hover:border-[var(--brand)]/50'
                    }`}
                  >
                    {val ? 'Sim' : 'Não'}
                  </button>
                ))}
              </div>
              {answers.hasExtraInfo === true && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Escreve o que queres incluir ou evitar</p>
                  <textarea
                    value={answers.extraInfo}
                    onChange={e => setAnswers(prev => ({ ...prev, extraInfo: e.target.value }))}
                    placeholder="Ex: quero incluir agachamento búlgaro, prefiro supino inclinado em vez do reto, adicionar exercício para antebraço..."
                    rows={4}
                    className="w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
                  />
                  {extraHistory.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">Pedidos recentes</p>
                      <div className="flex flex-wrap gap-1.5">
                        {extraHistory.map((h, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setAnswers(prev => ({ ...prev, extraInfo: h }))}
                            className="max-w-[260px] truncate rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1 text-[11px] font-semibold text-[var(--text)] hover:border-[var(--brand)]/50"
                            title={h}
                          >
                            {h.length > 40 ? h.slice(0, 40) + '…' : h}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </>
          )

        case 19:
          return (
            <>
              <h2 className="text-xl font-black text-[var(--text)]">Qual divisão de treino você prefere?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Escolha a estrutura, escreva a sua, ou deixe a IA decidir</p>
              <div className="mt-5 space-y-2">
                {[
                  ['IA decide', 'A IA escolhe a melhor divisão pelo seu perfil (dias, foco, frequência)'],
                  ['Full Body', 'Todos os grupos em cada treino — ótimo para força e frequência alta'],
                  ['Upper/Lower', 'Alterna superior e inferior'],
                  ['Push/Pull/Legs', 'Empurrar / Puxar / Pernas'],
                  ['Torso/Limbs', 'Tronco (peito/costas/ombros) / Membros (braços + pernas)'],
                  ['Especializado inferior', 'Mais dias de perna com focos diferentes (quad / glúteo / posterior)'],
                  ['Bro Split', 'Um grupo muscular dedicado por dia'],
                ].map(([val, hint]) => (
                  <OptionCard key={val} label={val} hint={hint} selected={answers.splitPreference === val} onClick={() => selectAndAdvance('splitPreference', val)} />
                ))}
                {/* "Outro" não auto-avança — abre textarea pra escrever a divisão. */}
                <OptionCard
                  label="Outro (escrever a minha)"
                  hint="Descreva sua própria divisão — a IA vai entender e gerar"
                  selected={answers.splitPreference === 'Outro'}
                  onClick={() => setAnswers(prev => ({ ...prev, splitPreference: 'Outro' }))}
                />
              </div>
              {answers.splitPreference === 'Outro' && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
                    Escreve a divisão — UM DIA POR LINHA (ou separados por "/")
                  </p>
                  <textarea
                    value={answers.customSplit}
                    onChange={e => setAnswers(prev => ({ ...prev, customSplit: e.target.value }))}
                    placeholder={'Ex:\nPeito e tríceps\nCostas e bíceps\nPernas (foco glúteo)\nOmbros e abdômen'}
                    rows={5}
                    className="w-full resize-none rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)]"
                  />
                  <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                    Cada linha vira um treino. A IA cobre os músculos que você escrever em cada dia.
                  </p>
                </motion.div>
              )}
            </>
          )

        default:
          return null
      }
    })()

    return (
      <section className="space-y-4">
        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
          {isEditMode ? (
            <p className="mb-6 text-xs font-bold uppercase tracking-wider text-[var(--brand)]">
              Editando resposta
            </p>
          ) : (
            <ProgressBar step={Math.max(visibleIdx, 0) + 1} total={totalVisible} />
          )}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={{
                enter: (d: number) => ({ x: d * 50, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d * -50, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >
              {stepContent}
            </motion.div>
          </AnimatePresence>
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              <ChevronLeft size={15} />
              {isEditMode ? 'Resumo' : step === 0 ? 'Início' : 'Voltar'}
            </button>
            {isEditMode ? (
              needsNextButton && (
                <button
                  type="button"
                  onClick={() => setAppScreen('REVIEW')}
                  disabled={step === 13 && answers.hasFocus === null}
                  className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  Salvar
                </button>
              )
            ) : (
              <>
                {needsNextButton && (
                  <button
                    type="button"
                    onClick={advanceStep}
                    disabled={step === 13 && answers.hasFocus === null}
                    className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {isLastVisibleStep ? 'Ver resumo' : 'Próximo'}
                  </button>
                )}
                {(step === 14 || step === 15) && (
                  <button
                    type="button"
                    onClick={advanceStep}
                    className="text-xs text-[var(--muted)] underline underline-offset-2"
                  >
                    Pular
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    )
  }

  // ─── REVIEW ───────────────────────────────────────────────────────────────

  if (appScreen === 'REVIEW') {
    const days = parseInt(answers.daysPerWeek, 10) || 4
    const split = getEffectiveSplit(days, answers.muscleFrequency, answers.musclesFocus, answers.splitPreference)
    const labels = getWorkoutLabels(split, days, answers.customSplit)

    const restrictionsValue = [
      answers.hasInjury && answers.injuryDescription ? `Lesão: ${answers.injuryDescription}` : '',
      answers.avoidExercises.trim() ? `Evitar: ${answers.avoidExercises.trim()}` : '',
    ].filter(Boolean).join(' · ') || 'Nenhuma'

    const physicalValue = [
      answers.heightCm && `${answers.heightCm}cm`,
      answers.weightKg && `${answers.weightKg}kg`,
    ].filter(Boolean).join(' · ') || 'Não informado'

    const allChips: Array<{ label: string; value: string; step: number }> = [
      { label: 'Dias', value: answers.daysPerWeek ? `${answers.daysPerWeek}x/semana` : '—', step: 0 },
      { label: 'Nível', value: answers.experience || '—', step: 1 },
      { label: 'Idade', value: answers.age || '—', step: 2 },
      { label: 'Gênero', value: answers.gender || '—', step: 3 },
      { label: 'Fase', value: answers.phase || '—', step: 4 },
      { label: 'Objetivo', value: answers.goal || '—', step: 5 },
      { label: 'Local', value: answers.location || '—', step: 6 },
      { label: 'Equipamento', value: answers.equipment || '—', step: 7 },
      { label: 'Duração', value: answers.duration ? `${answers.duration} min` : '—', step: 8 },
      { label: 'Divisão', value: answers.splitPreference === 'Outro' ? (answers.customSplit.trim() ? `Outro: ${answers.customSplit.split(/[\n;/]+/).map(s => s.trim()).filter(Boolean).join(' / ')}` : 'Outro') : (answers.splitPreference || 'IA decide'), step: 19 },
      { label: 'Freq. muscular', value: answers.muscleFrequency || '—', step: 9 },
      { label: 'Reps', value: answers.repRange || '—', step: 10 },
      { label: 'Descanso', value: answers.restTime || 'IA decide', step: 11 },
      { label: 'Técnicas', value: answers.techniques.join(', ') || 'Nenhuma', step: 12 },
      { label: 'Foco', value: answers.musclesFocus.length > 0 ? answers.musclesFocus.join(', ') : answers.hasFocus === false ? 'Sem foco' : '—', step: 13 },
      { label: 'Restrições', value: restrictionsValue, step: 14 },
      { label: 'Físico', value: physicalValue, step: 15 },
      { label: 'Tamanho', value: answers.exerciseCount || 'IA decide', step: 16 },
      { label: 'RIR', value: answers.rirTarget || 'IA decide', step: 17 },
      { label: 'Extra', value: answers.extraInfo || (answers.hasExtraInfo === false ? 'Não' : '—'), step: 18 },
    ]
    const visibleStepIds = getVisibleSteps(answers)
    const chips = allChips.filter(c => visibleStepIds.includes(c.step))

    // Métricas decorativas computadas a partir das respostas — alimentam o sidebar.
    const volumeEst = computeVolumeEst(answers)
    const intensity = computeIntensity(answers)
    const restEst = computeRest(answers)
    const tempoEst = computeTempoEst(answers)
    const durationEst = estimateQuizDurationMin(answers)

    return (
      <section className="space-y-4">
        {/* ─── SummaryCard ───────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7 lg:p-8"
        >
          {/* Cantos decorativos (corner ticks) */}
          <span aria-hidden className="pointer-events-none absolute left-3 top-3 h-2.5 w-2.5 border-l border-t border-[var(--line)]" />
          <span aria-hidden className="pointer-events-none absolute right-3 top-3 h-2.5 w-2.5 border-r border-t border-[var(--line)]" />
          <span aria-hidden className="pointer-events-none absolute left-3 bottom-3 h-2.5 w-2.5 border-l border-b border-[var(--line)]" />
          <span aria-hidden className="pointer-events-none absolute right-3 bottom-3 h-2.5 w-2.5 border-r border-b border-[var(--line)]" />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_220px]">
            <div className="min-w-0">
              {/* STEP badge */}
              <div
                className="inline-flex items-center gap-2 rounded-full border border-[var(--brand)]/30 px-2.5 py-1.5"
                style={{ background: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]"
                  style={{ boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 28%, transparent)' }}
                />
                <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--brand-strong)]">
                  STEP 04 / 05 · QUASE LÁ
                </span>
              </div>

              {/* Título */}
              <h1 className="mt-4 text-3xl font-black leading-none tracking-tight text-[var(--text)] sm:text-4xl">
                Resumo das suas <span className="text-[var(--brand)]">respostas</span>
              </h1>

              {/* Descrição da divisão */}
              <p className="mt-2 text-sm text-[var(--muted)]">
                Divisão gerada · <span className="font-semibold text-[var(--text)]">{split}</span>
                <span className="ml-2 font-mono text-[11px] tracking-wide">
                  {labels.length} BLOCOS · ~{durationEst} MIN
                </span>
              </p>

              {/* Chips dos blocos (A / B / C) com barra de carga */}
              <div className="mt-5 flex flex-wrap gap-2.5">
                {labels.map((label, i) => {
                  const code = String.fromCharCode(65 + i)
                  const muscles = blockMusclesHint(label)
                  const load = computeBlockLoad(answers, i)
                  return (
                    <div
                      key={label}
                      className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5"
                    >
                      <div
                        className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--brand)]/30 font-mono text-xs font-bold text-[var(--brand-strong)]"
                        style={{ background: 'color-mix(in srgb, var(--brand) 10%, transparent)' }}
                      >
                        {code}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold leading-tight text-[var(--text)]">{friendlyBlockName(label)}</p>
                        {muscles && (
                          <p className="mt-0.5 font-mono text-[10px] tracking-wide text-[var(--muted)]">{muscles}</p>
                        )}
                      </div>
                      <div className="ml-1 w-9 shrink-0">
                        <div className="h-1 overflow-hidden rounded-full bg-[var(--line)]">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${load}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' }}
                            className="h-full rounded-full bg-[var(--brand)]"
                          />
                        </div>
                        <p className="mt-1 text-right font-mono text-[9px] text-[var(--muted)]">{load}%</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sidebar com mini-stats */}
            <div className="flex flex-col gap-2.5">
              <MiniStat
                label="VOLUME EST."
                value={String(volumeEst.value)}
                unit="séries"
                delta={volumeEst.delta}
              />
              <MiniStat
                label="INTENSIDADE"
                value={intensity.value}
                unit="média"
                delta={intensity.badge}
              />
              <MiniStat
                label="DESCANSO"
                value={restEst.value}
                unit={restEst.hint}
                delta={restEst.delta ?? '—'}
              />
            </div>
          </div>
        </motion.div>

        {/* ─── ParamGrid ─────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-[var(--line)] pb-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]">
                <Pencil size={11} />
              </span>
              <span className="text-sm font-medium text-[var(--text)]">
                Clica num item para editar só esse campo
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3.5">
              <LegendItem tone="brand" label="Definido por você" />
              <LegendItem tone="ai" label="IA decide" />
              <LegendItem tone="muted" label="Vazio" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
            {chips.map(({ label, value, step: chipStep }) => {
              const tone = getChipTone(value)
              const dotClass =
                tone === 'brand' ? 'bg-[var(--brand)]'
                : tone === 'ai' ? 'bg-[var(--muted)]'
                : 'bg-[var(--line)]'
              const valueClass = tone === 'muted' ? 'text-[var(--muted)]' : 'text-[var(--text)]'
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => { setIsEditMode(true); setStep(chipStep); setDirection(0); setAppScreen('QUIZ') }}
                  className="group relative flex flex-col gap-0.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5 text-left transition-colors hover:border-[var(--brand)]/50"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                    <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                      {label}
                    </span>
                  </div>
                  <p className={`pr-4 text-sm font-semibold leading-tight ${valueClass}`}>{value}</p>
                  <Pencil size={10} className="absolute right-2 top-2 text-[var(--brand)] opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </p>
        )}

        {/* ─── GenerateCTA ───────────────────────────────────────────── */}
        <button
          type="button"
          onClick={() => void handleGenerate()}
          className="group relative w-full overflow-hidden rounded-3xl p-5 text-left text-white sm:p-6"
          style={{
            background: 'linear-gradient(180deg, var(--brand) 0%, var(--brand-strong) 100%)',
            boxShadow: '0 14px 36px -14px color-mix(in srgb, var(--brand) 80%, transparent), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.2)',
          }}
        >
          {/* Shimmer no hover */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-[40%] transition-transform duration-1000 group-hover:translate-x-[40%]"
            style={{ background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)' }}
          />
          {/* Padrão decorativo de circuito (apenas desktop) */}
          <svg
            aria-hidden
            viewBox="0 0 120 60"
            className="pointer-events-none absolute right-56 top-1/2 hidden -translate-y-1/2 opacity-20 lg:block"
            width="120"
            height="60"
            fill="none"
          >
            <path d="M0 30 H30 L40 20 H70 L80 30 H120" stroke="#FFF6F2" strokeWidth="1" />
            <path d="M0 45 H50 L60 35 H120" stroke="#FFF6F2" strokeWidth="1" />
            <circle cx="30" cy="30" r="2" fill="#FFF6F2" />
            <circle cx="70" cy="20" r="2" fill="#FFF6F2" />
            <circle cx="60" cy="35" r="2" fill="#FFF6F2" />
          </svg>

          <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3.5">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/35 bg-white/20 backdrop-blur-sm">
                <Sparkles size={18} />
              </div>
              <div className="leading-tight">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-white/85">
                  PRONTO P/ GERAR
                </p>
                <p className="text-lg font-extrabold tracking-tight sm:text-xl">
                  Gerar meu treino com IA
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 self-stretch justify-end sm:self-auto">
              <div className="text-right leading-tight">
                <p className="font-mono text-[10px] tracking-[0.15em] text-white/75">TEMPO EST.</p>
                <p className="font-mono text-base font-semibold">~ {tempoEst}s</p>
              </div>
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/30 bg-white/15">
                <ArrowRight size={18} />
              </div>
            </div>
          </div>
        </button>
      </section>
    )
  }

  // ─── RESULT ───────────────────────────────────────────────────────────────

  // ─── RESULT — derived values for the hero & volume chart ────────────────
  const volume = getWeeklyVolume(sections)
  const TARGET_MIN = 5
  const TARGET_MAX = 20
  const scaleMax = volume.length > 0 ? Math.max(...volume.map(v => v.sets), TARGET_MAX + 5) : TARGET_MAX + 5
  const idealStartPct = (TARGET_MIN / scaleMax) * 100
  const idealEndPct = (TARGET_MAX / scaleMax) * 100
  const totalSets = volume.reduce((s, v) => s + v.sets, 0)
  const balanced = volume.filter(v => v.sets >= TARGET_MIN && v.sets <= TARGET_MAX).length
  // Se a divisão "Outro" trouxe os dias da semana citados pelo usuário, usa-os;
  // senão, auto-espaça (SEG/QUA/SEX...). Cada índice usa o weekday informado
  // ou cai no auto quando vazio.
  const autoDows = dayOfWeekLabels(sections.length)
  const dows = sections.map((_, i) => resolvedWeekdays[i] || autoDows[i] || '')
  const safeActiveIdx = Math.min(activeDayIndex, Math.max(0, sections.length - 1))
  const activeSection = sections[safeActiveIdx]
  const rpeAlvo = rpeFromRir(answers.rirTarget)

  return (
    <section className="space-y-4" ref={resultRef}>
      {/* ─── Hero card ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8"
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="min-w-0">
            {/* Kicker badge with pulse */}
            <div
              className="inline-flex items-center gap-2 rounded-full border border-[var(--brand)]/30 px-2.5 py-1.5"
              style={{ background: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}
            >
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--brand)]"
                style={{ boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 28%, transparent)' }}
              />
              <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-[var(--brand-strong)]">
                TREINO GERADO · IA v2.4
              </span>
            </div>

            {/* Big serif title with italic accent */}
            <h1 className="mt-4 font-serif text-4xl font-normal leading-[1.04] tracking-tight text-[var(--text)] sm:text-5xl">
              Seu plano{' '}
              <em className="italic text-[var(--brand-strong)]">personalizado</em>
            </h1>

            <p className="mt-3 max-w-xl text-sm text-[var(--muted)]">
              {sections.length} {sections.length === 1 ? 'dia' : 'dias'} de treino estruturado{sections.length !== 1 ? 's' : ''} pela IA com foco em {answers.goal?.toLowerCase() || 'performance'}
              {volume.length > 0 ? ', balanceando volume entre grupos musculares com base no seu histórico recente.' : '.'}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resetQuiz}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] px-4 py-2 text-xs font-bold text-[var(--surface)] transition-opacity hover:opacity-90"
              >
                <Sparkles size={13} /> Novo questionário
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                <RefreshCw size={13} /> Gerar novamente
              </button>
            </div>
          </div>

          {/* Stats sidebar (3 cards) */}
          <div className="grid grid-cols-3 gap-2 lg:w-[360px]">
            <HeroStat label="DIAS / SEM" value={String(sections.length)} unit="d" trend="↑ otimizado" trendTone="positive" />
            <HeroStat label="VOLUME" value={String(totalSets)} unit="séries" trend="→ na faixa" trendTone="neutral" />
            <HeroStat
              label="COBERTURA"
              value={String(balanced)}
              unit={`/${volume.length || 10}`}
              trend={balanced === volume.length && volume.length > 0 ? '✓ completo' : balanced > 0 ? `${balanced} ideais` : 'a definir'}
              trendTone="positive"
            />
          </div>
        </div>
      </motion.div>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* ─── Volume chart card ────────────────────────────────────── */}
      {sections.length > 1 && volume.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">Volume semanal por grupo muscular</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Faixa ideal: 5–20 séries / semana por grupo · objetivo: {answers.goal?.toLowerCase() || 'hipertrofia'}
              </p>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-4 py-2.5">
              <div className="text-right">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Séries totais</p>
                <p className="mt-0.5 font-mono text-xl font-bold leading-none text-[var(--text)]">{totalSets}</p>
              </div>
              <div className="h-7 w-px bg-[var(--line)]" />
              <div className="text-right">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Faixa ideal</p>
                <p className="mt-0.5 font-mono text-xl font-bold leading-none text-[var(--text)]">
                  {balanced}<span className="text-sm text-[var(--muted)]">/{volume.length}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-1.5">
            {volume.map((v, i) => {
              const widthPct = Math.min(100, (v.sets / scaleMax) * 100)
              const status = v.sets < TARGET_MIN
                ? { label: 'abaixo', color: 'text-amber-500' }
                : v.sets > TARGET_MAX
                  ? { label: 'excessivo', color: 'text-rose-500' }
                  : { label: 'ideal', color: 'text-emerald-500' }
              return (
                <div
                  key={v.label}
                  className="group grid grid-cols-[80px_1fr_70px] items-center gap-3 py-1 sm:grid-cols-[120px_1fr_90px] sm:gap-4"
                >
                  <span className="truncate text-xs font-medium text-[var(--text)] transition-transform group-hover:translate-x-0.5 sm:text-sm">
                    {v.label}
                  </span>
                  {/* Bar with ideal band + animated fill */}
                  <div className="relative h-4 rounded-full bg-[var(--surface-hover)] transition-transform group-hover:scale-y-125">
                    {/* Ideal band (5-20) */}
                    <div
                      aria-hidden
                      className="absolute inset-y-0 rounded-full bg-emerald-500/[0.10]"
                      style={{ left: `${idealStartPct}%`, width: `${idealEndPct - idealStartPct}%` }}
                    />
                    {/* Ideal markers */}
                    <span aria-hidden className="absolute -top-1 -bottom-1 w-px bg-emerald-500/30" style={{ left: `${idealStartPct}%` }} />
                    <span aria-hidden className="absolute -top-1 -bottom-1 w-px bg-emerald-500/30" style={{ left: `${idealEndPct}%` }} />
                    {/* Fill */}
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${widthPct}%` }}
                      transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1], delay: i * 0.04 }}
                      className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${v.hex} 0%, color-mix(in oklab, ${v.hex} 70%, white) 100%)`,
                        boxShadow: `inset 0 0 0 0.5px rgba(0,0,0,0.06)`,
                      }}
                    />
                  </div>
                  {/* Value pip + count + status */}
                  <div className="flex items-center justify-end gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full transition-shadow group-hover:shadow-[0_0_0_4px_currentColor/25]"
                      style={{ background: v.hex }}
                    />
                    <span className="font-mono text-xs font-semibold tabular-nums text-[var(--text)]">{v.sets}</span>
                    <span className={`hidden font-mono text-[9px] font-semibold uppercase tracking-[0.14em] sm:inline ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Meta strip */}
          <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 0 3px rgba(16,163,74,0.12)' }} />
              Recalculado agora
            </span>
            <span>v2.4 · {sections.length}d · {totalSets} séries</span>
          </div>
        </motion.div>
      )}

      {/* ─── Day tabs ──────────────────────────────────────────────── */}
      {sections.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {sections.map((s, i) => {
            const label = s.workoutData?.planName ?? `Treino ${i + 1}`
            const isActive = i === safeActiveIdx
            return (
              <button
                key={i}
                type="button"
                onClick={() => { setActiveDayIndex(i); setExpandedExerciseKey(null) }}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'border-[var(--text)] bg-[var(--text)] text-[var(--surface)]'
                    : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <span>{label}</span>
                {dows[i] && (
                  <span className={`font-mono text-[10px] ${isActive ? 'opacity-70' : 'text-[var(--muted)]'}`}>
                    {dows[i]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ─── Active day card ───────────────────────────────────────── */}
      {activeSection && (() => {
        const idx = safeActiveIdx
        const wd = activeSection.workoutData
        const dayLabel = wd?.planName ?? `Treino ${idx + 1}`
        const isBodyweight = answers.location === 'Em casa sem equipamentos'
        const missing = wd ? getMissingGroups(wd.exercises, dayLabel, isBodyweight) : []
        const durationMin = wd ? estimateDurationMin(wd.exercises) : null
        const targetMin = answers.duration ? parseInt(answers.duration, 10) : null
        const overTime = targetMin && durationMin ? durationMin > targetMin + 10 : false
        const isRegenerating = regeneratingIndex === idx
        const isSaved = Boolean(saveResults[idx])
        const foco = focoFromDayLabel(dayLabel)

        return (
          <motion.article
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
          >
            {/* Day header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--muted)]">
                  DIA {String(idx + 1).padStart(2, '0')}
                </span>
                <h3 className="text-lg font-bold tracking-tight text-[var(--text)]">{dayLabel}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {wd && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--brand)]/30 px-2.5 py-1 text-[11px] font-semibold text-[var(--brand-strong)]"
                    style={{ background: 'color-mix(in srgb, var(--brand) 10%, transparent)' }}
                  >
                    <span className="font-mono">{wd.exercises.length}</span> exercícios
                  </span>
                )}
                {durationMin !== null && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    overTime
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                      : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]'
                  }`}>
                    <Clock size={11} />
                    <span className="font-mono">~{durationMin} min</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                  Foco · <span className="font-mono">{foco}</span>
                </span>
              </div>
            </div>

            <div className="h-px bg-[var(--line)]" />

            {/* Coverage warning */}
            {missing.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-500">Cobertura incompleta</p>
                  <p className="mt-0.5 text-[11px] text-amber-500/80">Faltam: {missing.join(', ')} — considera regenerar este dia.</p>
                </div>
              </div>
            )}

            {/* Exercise list */}
            {wd ? (
              <ul className="space-y-2">
                {wd.exercises.map((ex, i) => {
                  const exKey = `${idx}-${i}`
                  const expanded = expandedExerciseKey === exKey
                  const muscle = resolveMuscleGroup(ex)
                  return (
                    <li
                      key={exKey}
                      className={`overflow-hidden rounded-xl border transition-all ${
                        expanded
                          ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_5%,var(--surface))]'
                          : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand)]/40 hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedExerciseKey(expanded ? null : exKey)}
                        className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-left sm:grid-cols-[40px_1fr_auto_auto] sm:px-4"
                      >
                        {/* Number badge */}
                        <span
                          className={`grid h-8 w-8 place-items-center rounded-lg border font-mono text-xs font-bold ${
                            expanded
                              ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                              : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)]'
                          }`}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>

                        {/* Name + muscle pill + specs */}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--text)]">{ex.name}</p>
                            {muscle && (
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${muscle.color}`}>
                                {muscle.label}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-[var(--muted)]">
                            <span className="inline-flex items-center gap-1"><span className="h-0.5 w-0.5 rounded-full bg-[var(--muted)]" /> {ex.sets} séries</span>
                            <span className="inline-flex items-center gap-1"><span className="h-0.5 w-0.5 rounded-full bg-[var(--muted)]" /> {ex.repsMin ?? '?'}–{ex.repsMax ?? '?'} reps</span>
                            {ex.restSec ? (
                              <span className="inline-flex items-center gap-1"><span className="h-0.5 w-0.5 rounded-full bg-[var(--muted)]" /> {ex.restSec}s descanso</span>
                            ) : null}
                          </div>
                        </div>

                        {/* Up/down controls — hidden after save, hidden on mobile */}
                        {!isSaved && (
                          <div className="hidden items-center gap-1 sm:flex">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); moveExercise(idx, i, -1) }}
                              disabled={i === 0}
                              className="grid h-6 w-6 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--brand)]/40 hover:text-[var(--text)] disabled:opacity-30"
                              title="Mover para cima"
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); moveExercise(idx, i, 1) }}
                              disabled={i === wd.exercises.length - 1}
                              className="grid h-6 w-6 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--brand)]/40 hover:text-[var(--text)] disabled:opacity-30"
                              title="Mover para baixo"
                            >
                              <ChevronDown size={12} />
                            </button>
                          </div>
                        )}

                        {/* Swap button — troca por outro do mesmo grupo */}
                        {!isSaved && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); void swapExercise(idx, i) }}
                            disabled={swappingKey === `${idx}-${i}`}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-transparent text-[var(--muted)] hover:border-[var(--brand)]/40 hover:bg-[var(--brand)]/10 hover:text-[var(--brand)] disabled:opacity-40"
                            title="Trocar por outro exercício do mesmo grupo"
                          >
                            <RefreshCw size={13} className={swappingKey === `${idx}-${i}` ? 'animate-spin' : ''} />
                          </button>
                        )}

                        {/* Remove button */}
                        {!isSaved && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeExercise(idx, i) }}
                            disabled={wd.exercises.length <= 1}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-transparent text-[var(--muted)] hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-30"
                            title="Remover exercício"
                          >
                            <X size={13} />
                          </button>
                        )}
                      </button>

                      {/* Expandable details */}
                      <AnimatePresence>
                        {expanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-dashed border-[var(--line)] px-3 pb-3 pt-3 sm:px-4">
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <DetailStat label="SÉRIES" value={String(ex.sets)} />
                                <DetailStat label="REPS" value={`${ex.repsMin ?? '?'}–${ex.repsMax ?? '?'}`} />
                                <DetailStat label="CARGA SUG." value="—" />
                                <DetailStat label="RPE ALVO" value={rpeAlvo} />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Dados estruturados indisponíveis. Clique em "Gerar novamente" no topo.
              </p>
            )}

            {/* AI markdown text */}
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)]/40 p-4">
              <AITextRenderer text={activeSection.displayText} />
            </div>

            {/* Save / Regenerate actions */}
            {!isSaved ? (
              wd && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveOne(idx)}
                    disabled={savingIndex !== null || isRegenerating}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <CheckCircle2 size={14} />
                    {savingIndex === idx ? 'Salvando...' : 'Salvar como Rotina'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRegenerateDay(idx)}
                    disabled={savingIndex !== null || regeneratingIndex !== null}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={isRegenerating ? 'animate-spin' : ''} />
                    {isRegenerating ? 'Regenerando...' : 'Regenerar este dia'}
                  </button>
                </div>
              )
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4"
              >
                <p className="text-sm font-bold text-emerald-500">
                  "{saveResults[idx].planName}" salvo com sucesso!
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {saveResults[idx].foundCount} de {saveResults[idx].totalCount} exercício{saveResults[idx].totalCount !== 1 ? 's' : ''} adicionado{saveResults[idx].foundCount !== 1 ? 's' : ''} à rotina.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/train')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  Ver em Treinos <ArrowRight size={13} />
                </button>
              </motion.div>
            )}

            {/* Hint strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
              <span>Toque num exercício para ver detalhes</span>
              <span>IA · {sections.length}d · {wd ? wd.exercises.length : 0} ex.</span>
            </div>
          </motion.article>
        )
      })()}
    </section>
  )
}

// ─── RESULT screen — small presentational components ────────────────────────

function HeroStat({ label, value, unit, trend, trendTone }: {
  label: string
  value: string
  unit?: string
  trend?: string
  trendTone?: 'positive' | 'neutral'
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)]/40 px-3 py-3">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-semibold leading-none tracking-tight text-[var(--text)] sm:text-3xl">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-[var(--muted)]">{unit}</span>}
      </p>
      {trend && (
        <p className={`mt-1.5 font-mono text-[10px] ${trendTone === 'positive' ? 'text-emerald-500' : 'text-[var(--muted)]'}`}>
          {trend}
        </p>
      )}
    </div>
  )
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--text)]">{value}</p>
    </div>
  )
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-bold text-[var(--text)]">{part}</strong> : part
  )
}

function AITextRenderer({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1 text-sm text-[var(--text)]">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('## ')) return <h3 key={idx} className="mt-4 text-base font-extrabold first:mt-0">{trimmed.slice(3)}</h3>
        if (trimmed.startsWith('### ')) return <h4 key={idx} className="mt-3 font-bold">{trimmed.slice(4)}</h4>
        if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) return <h4 key={idx} className="mt-3 font-bold">{trimmed.slice(2, -2)}</h4>
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) return <p key={idx} className="pl-4 text-[var(--muted)]"><span className="mr-2 text-[var(--brand)]">•</span>{renderInlineBold(trimmed.slice(2))}</p>
        if (trimmed === '') return <div key={idx} className="h-2" />
        return <p key={idx} className="leading-relaxed">{renderInlineBold(trimmed)}</p>
      })}
    </div>
  )
}
