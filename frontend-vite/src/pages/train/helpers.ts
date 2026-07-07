// Helpers puros (e quase-puros) extraídos do TrainPage. Não têm estado nem
// dependem de React — só transformam dados de entrada em saída. Ficam aqui
// pra reduzir o tamanho do TrainPage e pra poderem ser testados isoladamente.
import { resolveBodyweightFlag } from '../../lib/exercise/exercise-meta'
import { parsePerfPayload, stripPerfMarker } from '../../lib/workout/perf-notes'
import type { SetType } from '../../components/common/setTypeOptions'
import type { WorkoutPlan } from '../../types/workout'
import type { ActiveExercise, ExerciseSetInput, TrackingType } from './types'
import type { RoutineInitial } from './CreateRoutineScreen'

export function createSet(reps = '', weightKg = '', rir = '', rpe = ''): ExerciseSetInput {
  return { reps, weightKg, rir, rpe, setType: 'normal', dropSets: [{ weightKg: '', reps: '' }], clusterReps: '', clusterCount: '', checked: false }
}

// Parser de duração flexível pra o input de "Duração" no SUMMARY.
// Aceita variações comuns que o usuário pode escrever sem pensar:
//   "65"         → 65 min
//   "1h05"       → 65 min
//   "1h"         → 60 min
//   "1:05"       → 65 min
//   "90min"      → 90 min
//   "1.5h"       → 90 min  (raro mas inofensivo)
// Retorna fallback (geralmente o derivado do cronômetro) se nada
// parsear como duração positiva.
export function parseDurationMin(raw: string, fallback: number): number {
  const t = raw.trim().toLowerCase().replace(',', '.')
  if (!t) return fallback
  // formato HH:MM ou H:MM
  const colonMatch = t.match(/^(\d+):(\d+)$/)
  if (colonMatch) {
    return Math.max(0, parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10))
  }
  // formato 1h05 ou 1h
  const hMatch = t.match(/^(\d+(?:\.\d+)?)h(\d{0,2})?$/)
  if (hMatch) {
    const h = parseFloat(hMatch[1])
    const m = hMatch[2] ? parseInt(hMatch[2], 10) : 0
    return Math.round(h * 60 + m)
  }
  // formato 90min ou 90 m
  const minMatch = t.match(/^(\d+(?:\.\d+)?)\s*m(in)?$/)
  if (minMatch) return Math.round(parseFloat(minMatch[1]))
  // formato inteiro/decimal puro = minutos
  const numMatch = t.match(/^(\d+(?:\.\d+)?)$/)
  if (numMatch) return Math.round(parseFloat(numMatch[1]))
  return fallback
}

export function toFiniteNumber(value: unknown): number | null {
  if (value == null) {
    return null
  }

  // String inputs do nosso form usam vírgula como separador decimal
  // (locale BR). Normaliza pra ponto antes de passar pro Number,
  // que só entende ponto. Outros tipos (number) passam intactos.
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

// Normaliza input decimal pro padrão BR: aceita vírgula e ponto como
// separador (usuários BR digitam vírgula no teclado virtual; quem cola
// valor de outro lugar pode trazer ponto), garante UM único separador
// e limita a `maxDecimals` casas após ele. Mantém como string pra o
// input controlado conseguir guardar estados intermediários ("50,"
// digitado mas ainda incompleto).
export function sanitizeDecimalInput(raw: string, maxDecimals = 3): string {
  // Remove tudo que não é dígito ou separador
  let cleaned = raw.replace(/[^\d.,]/g, '')
  // Normaliza vírgula pra ponto pra trabalhar com um separador só
  cleaned = cleaned.replace(/,/g, '.')
  // Mantém apenas o PRIMEIRO ponto — pontos subsequentes viram nada
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
    // Trunca a parte decimal pra no máximo maxDecimals dígitos
    const [intPart, decPart = ''] = cleaned.split('.')
    cleaned = decPart.length > 0 ? `${intPart}.${decPart.slice(0, maxDecimals)}` : `${intPart}.`
  }
  // O usuário viu "vírgula", então devolve assim pro display ficar
  // consistente com o teclado dele.
  return cleaned.replace('.', ',')
}

export function mapPlanToActiveExercises(plan: WorkoutPlan): ActiveExercise[] {
  return plan.exercises.map((entry) => {
    const exerciseName = entry.customName ?? entry.exercise.name
    const trackingType = (entry.exercise.trackingType ?? 'REPS') as TrackingType
    const repsText =
      trackingType === 'TIME'
        ? String(entry.durationSec ?? 30)
        : trackingType === 'DISTANCE'
          ? '20'
          : entry.repsMin && entry.repsMax
            ? `${entry.repsMin}`
            : String(entry.repsMax ?? entry.repsMin ?? 8)

    return {
      planExerciseId: entry.id,
      exerciseId: entry.exercise.id,
      exerciseName,
      equipment: entry.exercise.equipment,
      thumbnailUrl: entry.exercise.thumbnailUrl,
      videoUrl: entry.exercise.videoUrl,
      isBodyweight: resolveBodyweightFlag(
        entry.exercise.isBodyweight,
        exerciseName,
        entry.exercise.equipment,
      ),
      allowsExtraLoad: entry.exercise.allowsExtraLoad,
      trackingType,
      suggestedReps: repsText,
      restDurationSec: entry.restSec ?? 0,
      restRemainingSec: entry.restSec ?? 0,
      restRunning: false,
      restEndsAtMs: null,
      sets: Array.from({ length: Math.max(1, entry.sets ?? 3) }, () => createSet()),
      userNote: '',
    }
  })
}

export function calculateTotals(exercises: ActiveExercise[]): { totalSeries: number; totalVolumeKg: number } {
  let totalSeries = 0
  let totalVolumeKg = 0

  exercises.forEach((exercise) => {
    exercise.sets.forEach((setInput) => {
      // CRITÉRIO ÚNICO: série só conta se foi marcada como concluída
      // (checked = true). Antes contava também sets com reps preenchido
      // mas isso causava o "fantasma da série marcada-e-desmarcada" —
      // o completeSet auto-preenche reps quando marca, e não limpa
      // quando desmarca, então a série continuava no totalSeries mesmo
      // após o usuário tirar o ✓. "Séries realizadas" = séries com ✓.
      if (!setInput.checked) return

      if (setInput.setType === 'drop') {
        totalSeries += 1
        setInput.dropSets.forEach((drop) => {
          const r = Number(drop.reps)
          const w = toFiniteNumber(drop.weightKg) ?? 0
          if (Number.isFinite(r) && r > 0 && w > 0) {
            totalVolumeKg += w * r
          }
        })
        return
      }

      if (setInput.setType === 'cluster') {
        totalSeries += 1
        const cr = Number(setInput.clusterReps)
        const cc = Number(setInput.clusterCount)
        const weight = toFiniteNumber(setInput.weightKg) ?? 0
        if (weight > 0 && Number.isFinite(cr) && cr > 0 && Number.isFinite(cc) && cc > 0) {
          totalVolumeKg += weight * cr * cc
        }
        return
      }

      const reps = Number(setInput.reps)
      const effectiveReps = Number.isFinite(reps) && reps > 0 ? reps : Number(exercise.suggestedReps)

      totalSeries += 1
      const weight = toFiniteNumber(setInput.weightKg) ?? 0
      if (weight > 0 && Number.isFinite(effectiveReps) && effectiveReps > 0) {
        totalVolumeKg += weight * effectiveReps
      }
    })
  })

  return {
    totalSeries,
    totalVolumeKg: Number(totalVolumeKg.toFixed(2)),
  }
}

// Chave de dia no fuso LOCAL (não UTC). Evita que sessões perto da meia-noite
// sejam classificadas no dia errado (ex.: Brasil UTC-3, treino às 22h vira o
// dia seguinte em UTC).
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function relativeDaysFromNow(iso: string): string {
  const then = new Date(iso)
  const now = new Date()
  // Diferença em DIAS DE CALENDÁRIO (local), não janelas de 24h — assim
  // "ontem 23h" não vira "hoje" só porque passaram menos de 24h.
  const startThen = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = Math.round((startNow.getTime() - startThen.getTime()) / (1000 * 60 * 60 * 24))
  if (d <= 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 7) return `há ${d} dias`
  if (d < 14) return 'há 1 semana'
  if (d < 30) return `há ${Math.floor(d / 7)} semanas`
  if (d < 60) return 'há 1 mês'
  if (d < 365) return `há ${Math.floor(d / 30)} meses`
  if (d < 730) return 'há 1 ano'
  return `há ${Math.floor(d / 365)} anos`
}

export function parsePositiveInt(value: string, fallback = 0): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return fallback
  }

  return Math.floor(n)
}

export function isEffectiveBodyweightExercise(exercise: Pick<ActiveExercise, 'isBodyweight' | 'exerciseName' | 'equipment'>): boolean {
  return resolveBodyweightFlag(exercise.isBodyweight, exercise.exerciseName, exercise.equipment)
}

// Plans seeded from the recommendation flow get a "[Template: ...]" marker
// injected into their description by workout.service.ts. We use it as the
// signal for the "IA" chip — nothing to fabricate here.
export function isAiSourcedPlan(plan: WorkoutPlan): boolean {
  return Boolean(plan.description && /\[Template:/i.test(plan.description))
}

// Rough duration estimate for a plan: each set is treated as ~35s of actual
// work plus the configured rest. Conservative enough to read sensibly on the
// card without requiring extra history fetches.
export function estimatePlanMinutes(plan: WorkoutPlan): number {
  const totalSec = plan.exercises.reduce((acc, e) => {
    const sets = e.sets ?? 3
    const rest = e.restSec ?? 60
    return acc + sets * (35 + rest)
  }, 0)
  return Math.max(5, Math.round(totalSec / 60))
}

// Converte um plano salvo pro formato do builder (CreateRoutineScreen),
// reidratando as séries do marcador __PERF__ quando presente. Usado pela
// tela "Editar Rotina" pra abrir já preenchida.
export function planToRoutineInitial(plan: WorkoutPlan): RoutineInitial {
  return {
    name: plan.name,
    exercises: plan.exercises.map((ex) => {
      const userNote = stripPerfMarker(ex.notes)
      const payload = parsePerfPayload(ex.notes)
      let sets: RoutineInitial['exercises'][number]['sets'] = []
      if (payload?.series && payload.series.length > 0) {
        sets = payload.series.map((s) => ({
          repsMin: s.repsMin != null ? String(s.repsMin) : s.reps != null ? String(s.reps) : '',
          repsMax: s.repsMax != null ? String(s.repsMax) : s.reps != null ? String(s.reps) : '',
          type: s.setType ?? 'normal',
        }))
      }
      if (sets.length === 0) {
        const count = Math.max(1, ex.sets ?? 3)
        const min = ex.repsMin != null ? String(ex.repsMin) : ''
        const max = ex.repsMax != null ? String(ex.repsMax) : ''
        sets = Array.from({ length: count }, () => ({ repsMin: min, repsMax: max, type: 'normal' as SetType }))
      }
      return {
        exerciseId: ex.exercise.id,
        exerciseName: ex.customName ?? ex.exercise.name,
        thumbnailUrl: ex.exercise.thumbnailUrl,
        notes: userNote,
        restSec: ex.restSec ?? 0,
        sets,
      }
    }),
  }
}
