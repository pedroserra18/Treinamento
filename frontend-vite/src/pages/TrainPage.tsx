import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useScrollLock } from '../hooks/useScrollLock'
import {
  Flame, Layers, Dumbbell, Plus, Play, Pencil, Sparkles, MoreHorizontal,
  MoreVertical, ArrowLeft, Check,
  Activity, X,
} from 'lucide-react'
import { SkeletonCard } from '../components/common/Skeleton'
import { CreateExerciseModal } from './train/CreateExerciseModal'
import { ExerciseContextMenuSheet } from './train/ExerciseContextMenuSheet'
import { ReorderExercisesSheet, type ReorderItem } from './train/ReorderExercisesSheet'
import { SubstituteExerciseModal } from './train/SubstituteExerciseModal'
import { RestTimePickerSheet } from './train/RestTimePickerSheet'
import { AddExerciseModal } from './train/AddExerciseModal'
import { DurationPickerSheet } from './train/DurationPickerSheet'
import { SwipeableSetRow } from './train/SwipeableSetRow'
import { CreateRoutineScreen } from './train/CreateRoutineScreen'
import { InfoDialog } from '../components/common/InfoDialog'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { cancelBackendNotification, scheduleBackendNotification } from '../services/pushService'
import { createPost, sharePlan, type PostPrivacy } from '../services/socialService'
import { WorkoutsPage } from './WorkoutsPage'
import { WorkoutRecommendationsPage } from './WorkoutRecommendationsPage'
import { type SetType, type DropEntry } from '../components/common/setTypeOptions'
import {
  getExerciseExplorerSelectionEventName,
  type ExerciseExplorerSelection,
} from '../lib/exercise-explorer'
import { isBodyweightEquipment, resolveBodyweightFlag } from '../lib/exercise-meta'
import { pushRecentExerciseId } from '../lib/recent-exercises'
import { getIntensityMode, setIntensityMode, type IntensityMode } from '../lib/intensity-preference'
import {
  getNotificationPermission,
  requestNotificationPermission,
  showLocalNotification,
  type NotificationPermissionState,
} from '../lib/notifications'
import { formatClock } from '../lib/workout-timing'
import { saveWorkoutSessionImage } from '../lib/workout-session-image'
import { optimizeImageFileToDataUrl } from '../lib/image-processing'
import type { WorkoutPlan, CardioType, CardioEntryInput, ExerciseOption } from '../types/workout'
import {
  addExerciseToPlan,
  completeWorkoutSession,
  createWorkoutPlan,
  deleteWorkoutPlan,
  getExercisePersonalRecords,
  getLatestExercisePerformance,
  getSessionHighlights,
  listWorkoutHistory,
  listWorkoutPlans,
  searchExercisesForPlan,
  startWorkoutSession,
  updatePlanExercise,
  type SessionHighlights,
} from '../services/workoutService'
import { WorkoutShareEditor } from '../components/common/WorkoutShareEditor'
import {
  ACTIVE_WORKOUT_DISCARD_EVENT,
  clearActiveWorkout,
  deriveElapsedSec,
  readActiveWorkout,
  writeActiveWorkout,
} from '../lib/active-workout-storage'
import {
  getMyActiveCompetition,
  postCompetitionEntry,
  uploadCompetitionPhoto,
} from '../services/competitionService'
import type { Competition, CompetitionEntryKind } from '../types/competition'
import { sha256OfDataUrl } from '../lib/photo-hash'

type TrainScreen = 'DASHBOARD' | 'ACTIVE' | 'SUMMARY' | 'EDIT' | 'RECOMMENDATIONS' | 'NEW_ROUTINE'
type TrainOriginMode = 'EMPTY' | 'ROUTINE'

type ExerciseSetInput = {
  reps: string
  weightKg: string
  rir: string
  rpe: string
  setType: SetType
  dropSets: DropEntry[]
  clusterReps: string
  clusterCount: string
  checked: boolean
}

type TrackingType = 'REPS' | 'TIME' | 'DISTANCE' | 'REPS_AND_TIME'

type ActiveExercise = {
  planExerciseId?: string
  exerciseId: string
  exerciseName: string
  equipment: string
  thumbnailUrl: string | null
  videoUrl: string | null
  isBodyweight: boolean
  allowsExtraLoad: boolean
  trackingType: TrackingType
  suggestedReps: string
  restDurationSec: number
  restRemainingSec: number
  restRunning: boolean
  sets: ExerciseSetInput[]
  userNote: string
  // Letra do grupo de supersérie (A, B, C, ...). Exercícios com o
  // mesmo valor são feitos em ciclo sem descanso entre eles. Null
  // significa exercício solto. Por enquanto, persiste só na sessão
  // — a rotina e o histórico de treino não armazenam supersets.
  supersetGroup?: string | null
}

// Visual marker colors for superset groups — repeated cyclically when
// the workout has more than 5 supersets (rare).
const SUPERSET_COLORS = [
  '#f97316', // orange-500
  '#22c55e', // green-500
  '#3b82f6', // blue-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
] as const

function supersetColorFor(group: string | null | undefined): string | null {
  if (!group) return null
  const code = group.toUpperCase().charCodeAt(0)
  const offset = (code - 'A'.charCodeAt(0) + SUPERSET_COLORS.length) % SUPERSET_COLORS.length
  return SUPERSET_COLORS[offset]
}

// Returns the next free superset letter for a workout — A, B, C, ...
// or extends past Z if needed (unlikely).
function nextSupersetGroupId(exercises: ActiveExercise[]): string {
  const used = new Set(exercises.map((e) => e.supersetGroup).filter((g): g is string => Boolean(g)))
  for (let i = 0; i < 26; i += 1) {
    const letter = String.fromCharCode('A'.charCodeAt(0) + i)
    if (!used.has(letter)) return letter
  }
  return `G${used.size + 1}`
}

function createSet(reps = '', weightKg = '', rir = '', rpe = ''): ExerciseSetInput {
  return { reps, weightKg, rir, rpe, setType: 'normal', dropSets: [{ weightKg: '', reps: '' }], clusterReps: '', clusterCount: '', checked: false }
}

function parsePositiveInt(value: string, fallback = 0): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return fallback
  }

  return Math.floor(n)
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
function parseDurationMin(raw: string, fallback: number): number {
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

function toFiniteNumber(value: unknown): number | null {
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
function sanitizeDecimalInput(raw: string, maxDecimals = 3): string {
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

function mapPlanToActiveExercises(plan: WorkoutPlan): ActiveExercise[] {
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
      sets: Array.from({ length: Math.max(1, entry.sets ?? 3) }, () => createSet()),
      userNote: '',
    }
  })
}

function calculateTotals(exercises: ActiveExercise[]): { totalSeries: number; totalVolumeKg: number } {
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

function isEffectiveBodyweightExercise(exercise: Pick<ActiveExercise, 'isBodyweight' | 'exerciseName' | 'equipment'>): boolean {
  return resolveBodyweightFlag(exercise.isBodyweight, exercise.exerciseName, exercise.equipment)
}

// Plans seeded from the recommendation flow get a "[Template: ...]" marker
// injected into their description by workout.service.ts. We use it as the
// signal for the "IA" chip — nothing to fabricate here.
function isAiSourcedPlan(plan: WorkoutPlan): boolean {
  return Boolean(plan.description && /\[Template:/i.test(plan.description))
}

// Rough duration estimate for a plan: each set is treated as ~35s of actual
// work plus the configured rest. Conservative enough to read sensibly on the
// card without requiring extra history fetches.
function estimatePlanMinutes(plan: WorkoutPlan): number {
  const totalSec = plan.exercises.reduce((acc, e) => {
    const sets = e.sets ?? 3
    const rest = e.restSec ?? 60
    return acc + sets * (35 + rest)
  }, 0)
  return Math.max(5, Math.round(totalSec / 60))
}

function relativeDaysFromNow(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.floor(ms / (1000 * 60 * 60 * 24))
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

// Formata uma duração em segundos pra rótulo curto e legível.
// Usado pra mostrar a duração do último treino na lista de rotinas.
function formatDurationCompact(sec: number): string {
  if (sec < 60) return `${sec}s`
  const totalMin = Math.round(sec / 60)
  if (totalMin < 60) return `${totalMin}min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

// Monta a string "124 kg × 4 reps" pra usar no body do push de descanso.
// Cuida dos casos especiais:
//   • bodyweight (sem barra/halter): só "4 reps", sem peso
//   • só peso preenchido: "124 kg"
//   • só reps preenchido: "4 reps"
//   • nada preenchido: null (caller omite a parte "última: ...")
// Normaliza ponto pra vírgula (formato BR) e remove decimais redundantes.
function formatSetPerformanceLabel(
  set: { weightKg: string; reps: string },
  isBodyweight: boolean,
): string | null {
  const reps = (set.reps ?? '').trim()
  const weight = (set.weightKg ?? '').trim()
  if (!reps && !weight) return null

  const repsLabel = reps ? `${reps} reps` : null
  if (isBodyweight) return repsLabel

  if (!weight) return repsLabel
  // Substitui o ponto decimal por vírgula (formato BR) e tira o ".0"
  // que aparece quando o user digitou 100,0 — fica só "100 kg".
  const trimmedWeight = weight.replace('.', ',').replace(/,0+$/, '')
  const weightLabel = `${trimmedWeight} kg`
  return repsLabel ? `${weightLabel} × ${repsLabel}` : weightLabel
}

const CARDIO_LABELS: Record<CardioType, string> = {
  WALK: 'Caminhada', RUN: 'Corrida', BIKE: 'Bicicleta', STAIRS: 'Escada',
  ELLIPTICAL: 'Elíptico', ROW: 'Remo', JUMP_ROPE: 'Corda', SWIM: 'Natação', OTHER: 'Outro',
}
const CARDIO_TYPES = Object.keys(CARDIO_LABELS) as CardioType[]

// Floating "novo PR!" banner. Stays visible for ~3s, auto-dismisses,
// Linha de "ativar notificações" dentro do popover do timer. Mostra
// estado atual + botão pra pedir permissão. O click no botão é o gesto
// explícito do usuário que o iOS Safari exige pra atender o request.
// Renderiza nada quando o browser não suporta Notification API.
function NotificationsRow({ onClose }: { onClose: () => void }) {
  const [perm, setPerm] = useState<NotificationPermissionState>(() => getNotificationPermission())
  if (perm === 'unsupported') return null

  return (
    <div className="mt-1 rounded-lg border border-[var(--line)] p-2">
      <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted)]">
        Notificação de descanso
      </label>
      <div className="mt-1.5">
        {perm === 'granted' ? (
          <p className="text-[12px] font-semibold text-emerald-500">
            ✓ Ativada — vai vibrar quando o descanso acabar
          </p>
        ) : perm === 'denied' ? (
          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            Bloqueada. Ative nas configurações do navegador (cadeado na URL → Notificações).
          </p>
        ) : (
          <button
            type="button"
            onClick={async () => {
              const next = await requestNotificationPermission()
              setPerm(next)
              if (next === 'granted') onClose()
            }}
            style={{ touchAction: 'manipulation' }}
            className="w-full rounded-md bg-[var(--brand)] py-1.5 text-[12px] font-bold text-white shadow-[0_4px_10px_-4px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
          >
            Ativar notificações
          </button>
        )}
      </div>
    </div>
  )
}

// and is rendered through a portal so it floats above the page's
// framer-motion transform context. The `key` on celebration.id forces
// a remount when another PR fires while one is still showing, so the
// animation replays instead of stacking.
function PrCelebrationBanner({
  celebration, onDismiss,
}: {
  celebration: { id: number; exerciseName: string; loadKg: number; previousKg: number | null } | null
  onDismiss: () => void
}) {
  // Keep onDismiss in a ref so re-renders of the parent (the 1s workout
  // timer ticks every second) don't reset the auto-dismiss timeout. Only
  // celebration.id is a real signal to (re)start the timer.
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])
  const celebrationId = celebration?.id ?? null
  useEffect(() => {
    if (celebrationId == null) return
    const id = window.setTimeout(() => dismissRef.current(), 4000)
    return () => window.clearTimeout(id)
  }, [celebrationId])

  return createPortal(
    <AnimatePresence>
      {celebration && (
        <motion.div
          key={`pr-${celebration.id}`}
          initial={{ y: -80, opacity: 0, scale: 0.92 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -60, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="fixed left-1/2 top-4 z-[60] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-2xl border-2 border-[#f1c84a] shadow-[0_18px_40px_-10px_rgba(241,200,74,0.55)] sm:top-6"
          style={{ background: 'linear-gradient(135deg, #fff6d6 0%, #ffe28a 100%)' }}
          role="status"
          aria-live="polite"
        >
          {/* Sparkle background flair — purely decorative */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-40"
            style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
          />
          <div className="relative flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
            <motion.span
              initial={{ rotate: -25, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.05 }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f4c443] text-lg font-black text-[#5a4209] shadow-inner sm:h-11 sm:w-11 sm:text-xl"
              aria-hidden
            >
              ★
            </motion.span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#7a5a08] sm:text-[12px]">
                Novo PR!
              </p>
              <p className="mt-0.5 truncate text-sm font-bold text-[#3a2a00] sm:text-base">
                {celebration.exerciseName}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-[#6a4a00] sm:text-[12px]">
                <b className="text-[13px] font-extrabold text-[#3a2a00] sm:text-[14px]">{celebration.loadKg} kg</b>
                {celebration.previousKg != null && (
                  <span className="ml-2">
                    ▲ +{Number((celebration.loadKg - celebration.previousKg).toFixed(1))} kg vs {celebration.previousKg} kg
                  </span>
                )}
                {celebration.previousKg == null && (
                  <span className="ml-2">primeiro PR neste exercício</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Fechar"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[#6a4a00] transition-colors hover:bg-[#f1c84a]/40"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// "Enviar para desafio" CTA shown on the workout summary when the user
// has an active competition. If the user is in a BOTH-type room, they
// pick which counter to log (training vs cardio). Photo is required —
// the button is disabled with a hint otherwise.
function SendToCompetitionCta({
  competition, hasPhoto, savedSessionId, didTraining, didCardio, status, error, onSend,
}: {
  competition: Competition
  hasPhoto: boolean
  savedSessionId: string | null
  didTraining: boolean
  didCardio: boolean
  status: 'idle' | 'sending' | 'sent' | 'error'
  error: string | null
  onSend: (kinds: CompetitionEntryKind[]) => void
}) {
  const isLobby = competition.status === 'LOBBY'
  // Which kinds the user is allowed to post — must have done that kind in
  // the workout AND the comp must accept it. Drives the buttons below.
  const canTraining =
    didTraining && (competition.type === 'TRAINING' || competition.type === 'BOTH')
  const canCardio =
    didCardio && (competition.type === 'CARDIO' || competition.type === 'BOTH')
  const canBoth = canTraining && canCardio && competition.type === 'BOTH'

  // Nothing matches → skip the whole card entirely. The user will still
  // see the regular "Treino salvo" line but no challenge prompt.
  if (!canTraining && !canCardio) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-[var(--surface-hover)] p-3">
        <p className="text-[11.5px] text-[var(--muted)]">
          <b className="font-semibold text-[var(--text)]">{competition.name ?? 'Seu desafio'}</b>{' '}
          — {competition.type === 'TRAINING'
            ? 'esse desafio é só de treino. Faça pelo menos uma série pra contar.'
            : competition.type === 'CARDIO'
              ? 'esse desafio é só de cardio. Adicione uma atividade de cardio pra contar.'
              : 'faça pelo menos uma série ou um cardio pra contar.'}
        </p>
      </div>
    )
  }

  const disabledBase = isLobby || !hasPhoto || !savedSessionId || status === 'sending' || status === 'sent'

  return (
    <div className="rounded-2xl border border-amber-400/50 bg-gradient-to-br from-amber-50 to-[var(--surface)] p-4 sm:p-5 dark:from-amber-500/5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-400 text-base font-extrabold text-amber-900">
          🏆
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {isLobby ? 'Desafio aguardando início' : 'Desafio em andamento'}
          </p>
          <p className="text-sm font-semibold text-[var(--text)]">{competition.name ?? 'Seu desafio'}</p>

          {isLobby && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              O admin precisa iniciar a sala antes que treinos comecem a contar.
              Vá em <b className="text-[var(--text)]">/desafios</b> e clique em "Iniciar agora".
            </p>
          )}
          {!isLobby && !hasPhoto && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Adicione uma foto na seção acima pra registrar a prova do dia.
            </p>
          )}
          {canBoth && hasPhoto && !isLobby && status === 'idle' && (
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Você fez treino e cardio na mesma sessão — pode contar os 2 dias com uma foto só (2 pontos).
            </p>
          )}
          {status === 'sent' && (
            <p className="mt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ Prova enviada! Cai no feed da sala.
            </p>
          )}
          {status === 'error' && error && (
            <p className="mt-1 text-[11px] text-red-500">{error}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* Primary button: the most-rewarding option for the state.
            - BOTH comp + did both: "Contar treino + cardio" (2 points)
            - else: single button for what was done */}
        {canBoth ? (
          <>
            <button
              type="button"
              disabled={disabledBase}
              onClick={() => onSend(['TRAINING', 'CARDIO'])}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'sending' ? 'Enviando…' : status === 'sent' ? 'Enviado' : 'Contar treino + cardio (2 pts)'}
            </button>
            <button
              type="button"
              disabled={disabledBase}
              onClick={() => onSend(['TRAINING'])}
              className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Só treino
            </button>
            <button
              type="button"
              disabled={disabledBase}
              onClick={() => onSend(['CARDIO'])}
              className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Só cardio
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={disabledBase}
            onClick={() => onSend([canTraining ? 'TRAINING' : 'CARDIO'])}
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'sending'
              ? 'Enviando…'
              : status === 'sent'
                ? 'Enviado'
                : canTraining
                  ? competition.type === 'BOTH' ? 'Contar como treino' : 'Enviar para o desafio'
                  : competition.type === 'BOTH' ? 'Contar como cardio' : 'Enviar para o desafio'}
          </button>
        )}
      </div>
    </div>
  )
}

// Visual identity of each set type for the compact series row — letter,
// colour, label. The series number itself takes the role of the picker
// button (Hevy-style) so tapping it surfaces the bottom sheet below.
const SET_TYPE_GLYPH: Record<SetType, { letter: string | null; label: string; color: string; bg: string }> = {
  normal:  { letter: null,  label: 'Série Normal',       color: 'var(--text)',  bg: 'transparent' },
  warmup:  { letter: 'W',   label: 'Série de Aquecimento', color: '#b58400', bg: '#fff6d6' },
  failure: { letter: 'F',   label: 'Série Falhada',     color: '#b14242', bg: '#ffe1d6' },
  drop:    { letter: 'D',   label: 'Série Drop',        color: '#2c63b8', bg: '#dbe7ff' },
  cluster: { letter: 'C',   label: 'Cluster Set',       color: '#5b3aa3', bg: '#e8dcff' },
}

function SetTypeBadge({
  index, setType, onClick, checked,
}: {
  index: number
  setType: SetType
  onClick: () => void
  checked: boolean
}) {
  const meta = SET_TYPE_GLYPH[setType]
  const display = meta.letter ?? String(index + 1)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Série ${index + 1} — ${meta.label}. Toque para mudar o tipo.`}
      className={`grid h-8 w-8 place-items-center rounded-md text-[13px] font-extrabold transition-colors ${
        checked ? 'opacity-90' : ''
      }`}
      style={{
        color: setType === 'normal' ? 'var(--text)' : meta.color,
        background: setType === 'normal' ? 'var(--surface-hover)' : meta.bg,
        border: '1px solid var(--line)',
      }}
    >
      {display}
    </button>
  )
}

// Bottom sheet to pick the set type (or remove the set). Mobile-first
// but works on desktop too — a centered modal feels right at any width.
function SetTypePickerSheet({
  open, current, allowedTypes, onSelect, onRemove, onClose,
}: {
  open: boolean
  current: SetType
  allowedTypes?: SetType[]
  onSelect: (type: SetType) => void
  onRemove: () => void
  onClose: () => void
}) {
  // Same scroll-lock pattern used by the profile photo viewer — locks both
  // <html> and <body> so the page underneath cannot scroll while the
  // picker is up, and restores the previous overflow on close.
  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const visibleTypes = (allowedTypes ?? (Object.keys(SET_TYPE_GLYPH) as SetType[])).filter((t) =>
    SET_TYPE_GLYPH[t] !== undefined,
  )

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          key="sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] pb-safe shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-[var(--line)] sm:hidden" />
          <h3 className="px-4 pb-2 pt-3 text-center text-[13px] font-bold text-[var(--text)] sm:text-[14px]">
            Selecionar Tipo de Série
          </h3>
          <ul className="border-t border-[var(--line)]">
            {visibleTypes.map((type) => {
              const meta = SET_TYPE_GLYPH[type]
              const display = meta.letter ?? '1'
              const isCurrent = type === current
              return (
                <li key={type}>
                  <button
                    type="button"
                    onClick={() => { onSelect(type); onClose() }}
                    className={`flex w-full items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)] ${
                      isCurrent ? 'bg-[var(--surface-hover)]' : ''
                    }`}
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[13px] font-extrabold"
                      style={{
                        color: type === 'normal' ? 'var(--text)' : meta.color,
                        background: type === 'normal' ? 'var(--surface-hover)' : meta.bg,
                      }}
                    >
                      {display}
                    </span>
                    <span className="flex-1 text-[14px] font-medium text-[var(--text)]">{meta.label}</span>
                    {isCurrent && <span className="text-[var(--brand)]">●</span>}
                  </button>
                </li>
              )
            })}
            <li>
              <button
                type="button"
                onClick={() => { onRemove(); onClose() }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-rose-500/10"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[15px] font-extrabold text-rose-500">
                  ×
                </span>
                <span className="flex-1 text-[14px] font-medium text-rose-500">Remover Série</span>
              </button>
            </li>
          </ul>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

// Wrapper de drag-to-reorder pra cada card de exercício no treino ativo.
// Long-press (250ms + 8px de tolerância) ativa o drag, então toques
// rápidos e scroll continuam funcionando normalmente. O drag NÃO é
// disparado por interação em <input>/<button>/<select> internos — o
// pointer já recebeu o gesto desses elementos primeiro e os listeners
// não burbulham pra cá.
function SortableExerciseCard({
  id, children, supersetColor,
}: {
  id: string
  children: React.ReactNode
  supersetColor: string | null
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Card flutuando: opacidade pra mostrar movimento + z-index pra
    // ficar sempre na frente dos outros enquanto arrasta.
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
    // Stripe da supersérie + sombra extra enquanto arrasta pra
    // simular um "card levantado" no estilo iOS.
    boxShadow: isDragging
      ? `${supersetColor ? `inset 4px 0 0 0 ${supersetColor}, ` : ''}0 12px 28px -8px rgba(0,0,0,0.45)`
      : (supersetColor ? `inset 4px 0 0 0 ${supersetColor}` : undefined),
    // Manipulation evita que o sistema entenda o long-press como
    // "selecionar texto" ou "copy menu" no iOS Safari.
    touchAction: 'manipulation',
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

// Picker pra pareamento de supersérie. Lista os OUTROS exercícios do
// treino (exclui o que abriu o sheet). Tap em um deles pareia os dois
// no mesmo grupo. Se o alvo já está numa supersérie, mostra o letrão
// colorido pra o usuário entender que vai entrar no grupo dele.
function SupersetPickerSheet({
  open, sourceExerciseName, candidates, onPick, onClose,
}: {
  open: boolean
  sourceExerciseName: string
  candidates: Array<{ index: number; exercise: ActiveExercise }>
  onPick: (otherIndex: number) => void
  onClose: () => void
}) {
  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="superset-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-label="Selecionar exercício para a supersérie"
      >
        <motion.div
          key="superset-sheet"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] pb-safe shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
          style={{ maxHeight: 'min(80vh, 640px)' }}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--line)] sm:hidden" />
          <h3 className="shrink-0 px-4 pb-1 pt-3 text-center text-[14px] font-bold text-[var(--text)]">
            Pareie com…
          </h3>
          <p className="shrink-0 truncate px-4 pb-2 text-center text-[11.5px] text-[var(--muted)]">
            {sourceExerciseName}
          </p>
          {candidates.length === 0 ? (
            <p className="border-t border-[var(--line)] px-4 py-8 text-center text-xs text-[var(--muted)]">
              Adicione pelo menos mais um exercício no treino pra criar uma supersérie.
            </p>
          ) : (
            <ul className="flex-1 overflow-y-auto border-t border-[var(--line)]">
              {candidates.map(({ index, exercise }) => {
                const color = supersetColorFor(exercise.supersetGroup)
                return (
                  <li key={`${exercise.exerciseId}-${index}`}>
                    <button
                      type="button"
                      onClick={() => { onPick(index); onClose() }}
                      className="flex w-full items-center gap-3 border-b border-[var(--line)] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
                    >
                      {exercise.thumbnailUrl ? (
                        <img
                          src={exercise.thumbnailUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded-md bg-[var(--surface-hover)]" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text)]">
                        {exercise.exerciseName}
                      </span>
                      {color && exercise.supersetGroup && (
                        <span
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-extrabold text-white"
                          style={{ backgroundColor: color }}
                          title={`Já está na supersérie ${exercise.supersetGroup}`}
                        >
                          {exercise.supersetGroup}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

// Seção de cardio do treino ativo: lista os cardios adicionados e um mini-form
// (tipo + minutos + distância opcional em km) para acrescentar mais.
function CardioSection({ entries, onAdd, onRemove }: {
  entries: CardioEntryInput[]
  onAdd: (entry: CardioEntryInput) => void
  onRemove: (index: number) => void
}) {
  const [type, setType] = useState<CardioType>('WALK')
  const [minutes, setMinutes] = useState('')
  const [km, setKm] = useState('')
  const [note, setNote] = useState('')

  const add = () => {
    const min = parseInt(minutes, 10)
    if (!Number.isFinite(min) || min <= 0) return
    const dist = parseFloat(km.replace(',', '.'))
    const trimmedNote = note.trim()
    onAdd({
      type,
      durationSec: min * 60,
      distanceMeters: Number.isFinite(dist) && dist > 0 ? Math.round(dist * 1000) : undefined,
      notes: trimmedNote ? trimmedNote.slice(0, 250) : undefined,
    })
    setMinutes('')
    setKm('')
    setNote('')
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text)]">
        <Activity size={15} className="text-[var(--brand)]" /> Cardio
      </h2>
      <p className="mt-0.5 text-[12px] text-[var(--muted)]">Caminhada, corrida, bike, escada… registre o que fez.</p>

      {entries.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {entries.map((c, i) => (
            <li key={i} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text)]">{CARDIO_LABELS[c.type]}</span>
                <span className="text-[var(--muted)]">· {Math.round(c.durationSec / 60)} min</span>
                {c.distanceMeters ? <span className="text-[var(--muted)]">· {(c.distanceMeters / 1000).toFixed(2).replace(/\.?0+$/, '')} km</span> : null}
                <button type="button" onClick={() => onRemove(i)} className="ml-auto grid h-6 w-6 place-items-center rounded-md text-[var(--muted)] hover:bg-rose-500/10 hover:text-rose-500" aria-label="Remover cardio">
                  <X size={13} />
                </button>
              </div>
              {c.notes ? <p className="mt-1 text-[12px] italic text-[var(--muted)]">"{c.notes}"</p> : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CardioType)}
          className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
        >
          {CARDIO_TYPES.map((t) => <option key={t} value={t}>{CARDIO_LABELS[t]}</option>)}
        </select>
        <input
          type="number"
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="min"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] sm:w-20"
        />
        <input
          type="number"
          inputMode="decimal"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          placeholder="km (opc.)"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] sm:w-24"
        />
        <button
          type="button"
          onClick={add}
          disabled={!minutes.trim()}
          className="col-span-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40 sm:col-span-1"
        >
          Adicionar
        </button>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={250}
        placeholder="Nota (opcional): como foi, ritmo, percurso..."
        className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
      />
    </div>
  )
}

export function TrainPage() {
  const { authorizedFetch, user } = useAuth()
  const isProfilePrivate = user?.isPrivate ?? false
  const allowedPrivacies: PostPrivacy[] = isProfilePrivate ? ['FRIENDS', 'PRIVATE'] : ['PUBLIC', 'FRIENDS', 'PRIVATE']
  const defaultPrivacy: PostPrivacy = isProfilePrivate ? 'FRIENDS' : 'PUBLIC'

  const [screen, setScreen] = useState<TrainScreen>('DASHBOARD')
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(true)
  // Erro fica scoped por tela: ao trocar de screen, limpamos pra evitar
  // mensagem vazar entre dashboard / ativo / summary (e.g. "exercicio ja
  // adicionado" aparecer na dashboard depois de finalizar treino).
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [openRoutineMenuId, setOpenRoutineMenuId] = useState<string | null>(null)
  const [routineMenuAnchor, setRoutineMenuAnchor] = useState<{ top: number; right: number } | null>(null)
  const [shareLinkModal, setShareLinkModal] = useState<{ link: string; planName: string } | null>(null)

  const [activePlanId, setActivePlanId] = useState<string>('')
  const [activePlanName, setActivePlanName] = useState<string>('Treinamento vazio')
  type RoutineFilter = 'ALL' | 'AI' | 'CUSTOM'
  const [routineFilter, setRoutineFilter] = useState<RoutineFilter>('ALL')
  const [originMode, setOriginMode] = useState<TrainOriginMode>('EMPTY')
  const [activeExercises, setActiveExercises] = useState<ActiveExercise[]>([])
  // Cardio registrado durante o treino (caminhada, corrida, bike, etc.).
  const [cardioEntries, setCardioEntries] = useState<CardioEntryInput[]>([])

  const [elapsedSec, setElapsedSec] = useState(0)
  const [isWorkoutRunning, setIsWorkoutRunning] = useState(false)
  const [manualTimerMinutes, setManualTimerMinutes] = useState('')
  // Popover do menu "⋯" do treino ativo (Pausar/Retomar + Editar tempo).
  // Esses controles são fluxo de borda — esconder evita competir com
  // o botão primário "Finalizar Treino".
  const [advancedTimerOpen, setAdvancedTimerOpen] = useState(false)

  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [endedAt, setEndedAt] = useState<Date | null>(null)

  const [lastPerformanceByExercise, setLastPerformanceByExercise] = useState<
    Record<
      string,
      Record<
        number,
        {
          reps: number | null
          weightKg: number | null
          rir: number | null
          rpe: number | null
          durationSec: number | null
          distanceMeters: number | null
        }
      >
    >
  >({})
  const [editingRestExerciseIndex, setEditingRestExerciseIndex] = useState<number | null>(null)
  const [restDraftSec, setRestDraftSec] = useState('0')
  // Kebab menu (3 pontinhos) — guarda o índice do exercício cujo
  // menu de contexto está aberto. Null = nenhum aberto.
  const [contextMenuExerciseIndex, setContextMenuExerciseIndex] = useState<number | null>(null)
  // Sheet de reordenação. Diferente do kebab menu, este é global — abre
  // listando TODOS os exercícios com setas ⬆⬇ pra reorganizar.
  // É um fallback acessível pra quem não pegar a gesture de drag.
  const [reorderSheetOpen, setReorderSheetOpen] = useState(false)
  // Sensors do dnd-kit pra drag-to-reorder dos cards de exercício.
  // - PointerSensor: desktop + alguns mobiles. Delay de 150ms evita
  //   confundir clique com drag.
  // - TouchSensor: mobile específico. Delay maior (250ms) é o padrão
  //   iOS pra "long-press to pick up", e tolerância de 8px permite
  //   scrollar a página sem ativar drag por acidente.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )
  // Quando o usuário pede pra substituir um exercício, marcamos o
  // índice aqui e abrimos o explorer global. O handler de seleção
  // (mais abaixo) checa esse ref pra decidir entre substituir vs
  // adicionar — usa ref em vez de state pra evitar problemas de
  // stale closure no listener de evento (que é criado uma vez).
  const pendingSubstitutionIndexRef = useRef<number | null>(null)
  // Quando o usuário pede pra adicionar à supersérie, marcamos o
  // índice do exercício de origem aqui e abrimos o picker de
  // exercícios atuais pra ele escolher com qual parear.
  const [supersetPickerSourceIndex, setSupersetPickerSourceIndex] = useState<number | null>(null)
  // Substitute modal (estilo Hevy) — quando aberto, mostra Sugeridos +
  // Recentes em vez do explorer global. Null = fechado.
  const [substituteSourceIndex, setSubstituteSourceIndex] = useState<number | null>(null)
  // AddExerciseModal (estilo Hevy) — busca live + Recentes pra inserir
  // novo exercício no treino ativo.
  const [addExerciseOpen, setAddExerciseOpen] = useState(false)
  // Preferência de intensidade (RIR / RPE / Ambos). Persiste em
  // localStorage. Default 'BOTH' até o usuário escolher.
  const [intensityMode, setIntensityModeState] = useState<IntensityMode>(() => getIntensityMode())
  const showRir = intensityMode === 'RIR' || intensityMode === 'BOTH'
  const showRpe = intensityMode === 'RPE' || intensityMode === 'BOTH'
  // Diálogo de aviso pra duplicatas (e outros casos similares). Trocou
  // o setError vermelho fixo na tela por um modal claramente acionável —
  // o erro ficava pendurado entre header e lista até trocar de tela.
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string } | null>(null)
  // Picker de duração no resumo (estilo iOS wheel). Substitui o input
  // livre por uma UX mais previsível.
  const [durationPickerOpen, setDurationPickerOpen] = useState(false)
  // Contador que dispara o save da rotina no modo EDIT via signal pra
  // WorkoutsPage. Incrementa quando o usuário toca "Atualizar" no header
  // sticky — WorkoutsPage observa via useEffect e chama saveFullPlan.
  const [editSaveSignal, setEditSaveSignal] = useState(0)
  // Diálogo de confirmação genérico (descartar treino, finalizar com
  // sets em branco, etc.). O onConfirm é guardado pra disparar quando
  // o usuário aceita.
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel?: string
    destructive?: boolean
    onConfirm: () => void
  } | null>(null)
  // Quando aberto a partir do "Criar" do substitute modal, indica que
  // o exercício criado deve substituir o atual em vez de só virar
  // disponível no catálogo. Null = abriu standalone (substitui nada).
  const [createExerciseForSubstituteIndex, setCreateExerciseForSubstituteIndex] = useState<number | null>(null)
  // Quando true, ao terminar de criar exercício adicionamos no treino
  // ativo (em vez de substituir). Dispara pelo "Criar" no AddExerciseModal.
  const [createExerciseForAdd, setCreateExerciseForAdd] = useState(false)
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false)
  const [restFinishedName, setRestFinishedName] = useState<string | null>(null)
  // Per-exercise all-time max load, fetched once when the active screen
  // opens. We mutate this on every confirmed PR so the next set of the
  // same exercise doesn't double-celebrate.
  const [prByExerciseId, setPrByExerciseId] = useState<Record<string, number | null>>({})
  // Which set's type-picker bottom sheet is open right now. `null` when closed.
  const [openTypePicker, setOpenTypePicker] = useState<{ exerciseIndex: number; setIndex: number } | null>(null)
  const [prCelebration, setPrCelebration] = useState<{
    id: number
    exerciseName: string
    loadKg: number
    previousKg: number | null
  } | null>(null)

  const [summaryName, setSummaryName] = useState('')
  const [summaryDurationMin, setSummaryDurationMin] = useState('')
  const [summaryImageFile, setSummaryImageFile] = useState<File | null>(null)
  const [summaryImagePreview, setSummaryImagePreview] = useState<string | null>(null)
  // Snapshot dos PRs ANTES do treino — pra detectar quantos PRs novos
  // foram batidos comparando com prByExerciseId atual no SUMMARY.
  // Setado quando o usuário entra na tela ACTIVE (não quando finaliza).
  const [prSnapshotAtStart, setPrSnapshotAtStart] = useState<Record<string, number>>({})
  // Última privacy usada por este usuário — lê uma vez do localStorage
  // pra inicializar postPrivacy. Atualiza quando posta com sucesso.
  const [postPrivacy, setPostPrivacy] = useState<PostPrivacy>(() => {
    try {
      const raw = window.localStorage.getItem('acad:last-post-privacy')
      if (raw === 'PUBLIC' || raw === 'FRIENDS' || raw === 'PRIVATE') {
        return isProfilePrivate && raw === 'PUBLIC' ? 'FRIENDS' : raw
      }
    } catch {
      // ignora
    }
    return defaultPrivacy
  })
  const [postCaption, setPostCaption] = useState('')
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null)
  // Active competition (if any) — used by the "Enviar para desafio" button
  // on the summary. Only fetched when the user lands on SUMMARY, so the
  // active-workout flow isn't affected.
  const [activeCompetition, setActiveCompetition] = useState<Competition | null>(null)
  const [competitionSendStatus, setCompetitionSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [competitionSendError, setCompetitionSendError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [postDone, setPostDone] = useState(false)
  // Editor de imagem de compartilhamento (estilo Strava).
  const [shareHighlights, setShareHighlights] = useState<SessionHighlights | null>(null)
  const [sharePhoto, setSharePhoto] = useState<string | null>(null)
  const [loadingShare, setLoadingShare] = useState(false)
  const interactionOrderByExerciseRef = useRef<Record<string, number>>({})
  const interactionOrderCounterRef = useRef(0)

  // Push notifications — usado pra agendar "Descanso acabou" no backend
  // quando o user inicia um descanso, pra a notificação chegar mesmo
  // com o app em segundo plano (ex.: usuário scrollando Instagram).
  // Quando o estado.subscribed === false, o effect de scheduling abaixo
  // simplesmente não dispara (degradação graciosa — timer local segue
  // funcionando enquanto a aba está viva).
  const pushNotifications = usePushNotifications()
  // ┌────────────────────────────────────────────────────────────────────┐
  // │ Slot de schedules de descanso por exerciseId.                      │
  // │                                                                    │
  // │ Era um Record<string, string> simples — uma string por exercício.  │
  // │ Sob race (marcar série rápido demais), o ref ficava com id_A do    │
  // │ primeiro agendamento mas era sobrescrito por id_B do segundo,      │
  // │ depois revertido por id_A que voltava do backend atrasado. Result: │
  // │ id_B ficava órfão no backend e disparava notif sem ninguém saber. │
  // │                                                                    │
  // │ Agora cada slot guarda:                                            │
  // │   • ids: lista de TODOS os IDs ativos no backend pra esse exercício│
  // │   • seq: counter incrementado em cada cancel/schedule. Promises    │
  // │     pendentes comparam seu mySeq contra slot.seq — se outra        │
  // │     operação veio depois, o id que volta é cancelado em vez de     │
  // │     salvo (autoinvalida promises obsoletas).                       │
  // │                                                                    │
  // │ Mesma estratégia já aplicada ao idle reminder (linha ~1276).       │
  // └────────────────────────────────────────────────────────────────────┘
  const restScheduleSlotsRef = useRef<Record<string, { ids: string[]; seq: number }>>({})

  // Cancela TODOS os schedules pendentes de um exercício no backend e bumpa
  // o seq pra invalidar promises ainda em curso. Idempotente — chamar em
  // slot já vazio é no-op.
  const cancelRestSlot = useCallback((exerciseId: string) => {
    const slot = restScheduleSlotsRef.current[exerciseId]
    if (!slot) return
    slot.seq += 1
    const ids = slot.ids.slice()
    slot.ids = []
    for (const id of ids) {
      void cancelBackendNotification(authorizedFetch, id).catch(() => { /* silencioso */ })
    }
  }, [authorizedFetch])

  // Agenda um push de descanso pra um exercício. CANCELA TUDO antes
  // (cobre o caso de restart). O race guard com mySeq descarta IDs
  // que voltem do backend depois de uma nova chamada — esses são
  // automaticamente cancelados no backend em vez de serem salvos.
  const scheduleRestForExercise = useCallback((
    exerciseId: string,
    payload: { fireAt: string; title: string; body: string; url: string; tag: string },
  ) => {
    // Cancela tudo do slot antes (snapshot+empty+cancel; bumpa o seq).
    cancelRestSlot(exerciseId)
    // Garante que o slot existe — cancelRestSlot pode ter sido no-op se
    // não havia entrada anterior.
    if (!restScheduleSlotsRef.current[exerciseId]) {
      restScheduleSlotsRef.current[exerciseId] = { ids: [], seq: 0 }
    }
    const slot = restScheduleSlotsRef.current[exerciseId]
    const mySeq = slot.seq

    void scheduleBackendNotification(authorizedFetch, payload).then(({ id }) => {
      // Race guard: se outro cancel/schedule veio depois, esse id é zumbi
      // e tem que ser cancelado no backend pra não disparar fora de ordem.
      if (mySeq !== slot.seq) {
        void cancelBackendNotification(authorizedFetch, id).catch(() => { /* silencioso */ })
        return
      }
      slot.ids.push(id)
    }).catch(() => { /* falha não bloqueia o timer local */ })
  }, [authorizedFetch, cancelRestSlot])

  // Estado anterior pra detectar transições restRunning false→true e
  // true→false sem precisar comparar com estado React (que pode ter
  // mudado por motivos não relacionados ao timer).
  const prevRestStateRef = useRef<Record<string, { running: boolean; remaining: number }>>({})

  // Idle reminder — se o user fica X min sem MARCAR NENHUMA SÉRIE no treino
  // ativo, dispara um push lembrando que tem treino aberto.
  //
  // "Atividade que conta" é estritamente marcar/desmarcar uma série como
  // feita (checkbox verde). Adicionar/remover exercício NÃO conta — alguém
  // pode preparar o treino e deixar pausado, e a gente deveria lembrar.
  //
  // Implementação: cada marcação de série cancela o schedule pendente e
  // cria um novo pra agora+IDLE_REMINDER_MIN min. O fato de o lembrete
  // viver no backend garante que mesmo com o app fechado/celular travado,
  // o push chega.
  const IDLE_REMINDER_MIN = 30
  // Lista de IDs de schedules pendentes no backend. Era um único string|null;
  // virou array por causa da race: múltiplos rescheduleIdleReminder em
  // sequência rápida lia o ref vazio antes do anterior salvar seu ID, então
  // cada chamada agendava um schedule novo SEM cancelar os anteriores —
  // resultado: 30 min depois, 3 notifs disparavam juntas (bug do "spam de
  // Treino ainda rolando"). Manter lista permite cancelar todos os zumbis
  // numa só varredura.
  const idleReminderScheduleIdsRef = useRef<string[]>([])
  // Counter de "geração" — incrementa em cada chamada de reschedule. Promises
  // pendentes comparam seu mySeq contra o counter; se outra chamada veio
  // depois, o ID resultante é cancelado em vez de salvo. Garante que a
  // ÚLTIMA chamada vence sempre, mesmo em race extrema.
  const idleReminderSeqRef = useRef(0)

  // Histórico recente pra enriquecer os cards de rotina ("último treino:
  // há 3 dias · 1h05") e pra escolher qual rotina destacar no smart-CTA
  // da dashboard ("Iniciar [última rotina]"). Buscamos uma página de 50
  // sessões — cobre 99% dos usuários sem custo. Falha silenciosamente:
  // a página funciona sem essas info, só fica menos rica.
  type LastUseInfo = { endedAt: string; durationSec: number | null; planId: string; planName: string }
  const [lastUseByPlanId, setLastUseByPlanId] = useState<Record<string, LastUseInfo>>({})
  const [mostRecentSession, setMostRecentSession] = useState<LastUseInfo | null>(null)
  // Streak = dias consecutivos com pelo menos 1 treino. Conta a partir
  // de hoje pra trás; quebra na primeira data com gap > 1 dia. Aceita
  // que "hoje sem treino" ainda mantenha o streak (só não incrementa).
  const [streakDays, setStreakDays] = useState(0)

  const reloadHistorySummary = useCallback(async () => {
    try {
      const { items } = await listWorkoutHistory(authorizedFetch, 1, 50)
      const byPlan: Record<string, LastUseInfo> = {}
      let mostRecent: LastUseInfo | null = null

      // Set de dias únicos com treino (YYYY-MM-DD). Permite calcular
      // streak mesmo com múltiplos treinos no mesmo dia (conta como 1).
      const dayKeys = new Set<string>()

      for (const session of items) {
        if (!session.endedAt) continue
        const dayKey = new Date(session.endedAt).toISOString().slice(0, 10)
        dayKeys.add(dayKey)

        if (!session.workoutPlanId || !session.workoutPlan) continue
        const info: LastUseInfo = {
          endedAt: session.endedAt,
          durationSec: session.durationSec,
          planId: session.workoutPlanId,
          planName: session.workoutPlan.name,
        }
        // listWorkoutHistory já vem ordenado desc por endedAt — primeira
        // ocorrência por plano é a mais recente daquela rotina.
        if (!byPlan[session.workoutPlanId]) byPlan[session.workoutPlanId] = info
        if (!mostRecent) mostRecent = info
      }
      setLastUseByPlanId(byPlan)
      setMostRecentSession(mostRecent)

      // Calcula streak: começa em "hoje" e vai pra trás contando dias
      // com treino. Se o último treino foi ontem, conta o streak a
      // partir dele (não zera só porque hoje você ainda não treinou).
      let streak = 0
      const cursor = new Date()
      cursor.setHours(0, 0, 0, 0)
      // Se hoje não tem treino, dá 1 dia de tolerância (começa em ontem).
      const todayKey = cursor.toISOString().slice(0, 10)
      if (!dayKeys.has(todayKey)) {
        cursor.setDate(cursor.getDate() - 1)
      }
      while (dayKeys.has(cursor.toISOString().slice(0, 10))) {
        streak += 1
        cursor.setDate(cursor.getDate() - 1)
      }
      setStreakDays(streak)
    } catch {
      // silencioso — info nice-to-have
    }
  }, [authorizedFetch])

  useEffect(() => {
    void reloadHistorySummary()
  }, [reloadHistorySummary])

  const reloadPlans = useCallback(async (preferredPlanId?: string) => {
    const items = await listWorkoutPlans(authorizedFetch)
    setPlans(items)

    if (preferredPlanId && items.some((plan) => plan.id === preferredPlanId)) {
      setActivePlanId(preferredPlanId)
      return
    }

    if (items[0]) {
      setActivePlanId(items[0].id)
    }
  }, [authorizedFetch])

  useEffect(() => {
    // setLoadingPlans(true) garante o skeleton em re-fetches (ex.: depois
    // de mudança de auth). Estado inicial já é true mas explicitar evita
    // flash de empty se reloadPlans for re-invocada após o primeiro load.
    setLoadingPlans(true)
    void reloadPlans()
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar rotinas')
      })
      .finally(() => {
        setLoadingPlans(false)
      })
  }, [reloadPlans])

  useEffect(() => {
    if (screen !== 'ACTIVE' || !isWorkoutRunning) {
      return
    }

    // Tick baseado em wall-clock — `delta` é quantos segundos REAIS
    // passaram desde o último tick, não o "1" presumido do setInterval.
    // Isso faz o cronômetro se autocorrigir quando iOS pausa o
    // setInterval em background: o próximo tick depois de voltar
    // pulará pra frente pelo tempo todo de ausência, sem depender de
    // eventos de visibilidade.
    let lastTickMs = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      const delta = Math.max(1, Math.floor((now - lastTickMs) / 1000))
      lastTickMs = now
      setElapsedSec((current) => current + delta)
    }, 1000)

    return () => window.clearInterval(id)
  }, [isWorkoutRunning, screen])

  // Hydrate the active workout on mount. If the user navigated away from
  // /train mid-session, the data is restored here and the clock is
  // forwarded by however long the tab was away. The screen is NOT
  // auto-set to ACTIVE — clicking the "Treinar" nav should always land
  // on the dashboard. The mini bar (or the resume location state below)
  // is what jumps back into the live workout view.
  const hasHydratedRef = useRef(false)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (hasHydratedRef.current) return
    hasHydratedRef.current = true
    const snapshot = readActiveWorkout()
    if (snapshot) {
      setOriginMode(snapshot.originMode as TrainOriginMode)
      setActivePlanId(snapshot.activePlanId)
      setActivePlanName(snapshot.activePlanName)
      setActiveExercises((snapshot.activeExercises as ActiveExercise[]) ?? [])
      setCardioEntries((snapshot.cardioEntries as CardioEntryInput[]) ?? [])
      setStartedAt(snapshot.startedAt ? new Date(snapshot.startedAt) : null)
      setEndedAt(snapshot.endedAt ? new Date(snapshot.endedAt) : null)
      setIsWorkoutRunning(snapshot.isWorkoutRunning)
      setElapsedSec(deriveElapsedSec(snapshot))
    }
    setHydrated(true)
  }, [])

  // Jump back into the live workout view when the user clicks the mini
  // bar (which navigates here with { state: { resume: true } }). Done as
  // a separate effect so it works for both "TrainPage already mounted"
  // and "TrainPage mounting now" cases. The state is cleared after read
  // so a browser back/forward doesn't re-fire it.
  const location = useLocation()
  useEffect(() => {
    const state = location.state as { resume?: boolean } | null
    if (state?.resume) {
      setScreen('ACTIVE')
      window.history.replaceState(null, '', location.pathname + location.search)
    }
  }, [location.pathname, location.search, location.state])

  // Persist a snapshot of the active workout whenever there's data so
  // the mini bar (and a future mount of TrainPage) can resume it. The
  // snapshot tracks the current view (ACTIVE vs DASHBOARD) so the mini
  // bar knows when to hide itself on /train. Explicit transitions
  // (finalize, discard, resetWorkflow) call `clearActiveWorkout` so
  // the snapshot doesn't survive a fully completed/dropped session.
  useEffect(() => {
    if (!hydrated) return
    const hasData = activeExercises.length > 0 || elapsedSec > 0 || cardioEntries.length > 0
    if (!hasData) return
    if (screen !== 'ACTIVE' && screen !== 'DASHBOARD') return
    const currentExerciseName =
      activeExercises.find((e) => e.sets.some((s) => !s.checked))?.exerciseName ??
      activeExercises[activeExercises.length - 1]?.exerciseName ??
      null
    writeActiveWorkout({
      screen,
      originMode,
      activePlanId,
      activePlanName,
      activeExercises: activeExercises as unknown[],
      cardioEntries: cardioEntries.map((c) => ({
        type: c.type,
        durationSec: c.durationSec,
        distanceMeters: c.distanceMeters,
        notes: c.notes,
      })),
      startedAt: startedAt ? startedAt.toISOString() : null,
      endedAt: endedAt ? endedAt.toISOString() : null,
      elapsedSec,
      isWorkoutRunning,
      currentExerciseName,
    })
  }, [
    hydrated,
    screen,
    originMode,
    activePlanId,
    activePlanName,
    activeExercises,
    cardioEntries,
    startedAt,
    endedAt,
    elapsedSec,
    isWorkoutRunning,
  ])

  // The mini bar can request a discard from outside this page. If the
  // user confirmed there, reset the in-memory state so coming back to
  // /train shows a clean dashboard.
  useEffect(() => {
    const handler = () => {
      hasHydratedRef.current = true
      setScreen('DASHBOARD')
      setOriginMode('EMPTY')
      setActivePlanName('Treinamento vazio')
      setActiveExercises([])
      setCardioEntries([])
      setElapsedSec(0)
      setIsWorkoutRunning(false)
      setStartedAt(null)
      setEndedAt(null)
      interactionOrderByExerciseRef.current = {}
      interactionOrderCounterRef.current = 0
    }
    window.addEventListener(ACTIVE_WORKOUT_DISCARD_EVENT, handler)
    return () => window.removeEventListener(ACTIVE_WORKOUT_DISCARD_EVENT, handler)
  }, [])

  useEffect(() => {
    if (screen !== 'ACTIVE') {
      return
    }

    // Mesmo padrão do cronômetro de treino: decrementa pelo TEMPO REAL
    // entre ticks (não por 1s presumido). Quando iOS Safari pausa o
    // setInterval em background, o próximo tick depois de voltar já
    // pula vários segundos de uma vez — o timer de descanso conclui
    // corretamente mesmo se o user ficou 10 min com a tela travada.
    let lastTickMs = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      const delta = Math.max(1, Math.floor((now - lastTickMs) / 1000))
      lastTickMs = now
      setActiveExercises((current) => {
        const next = current.map((exercise) => {
          if (!exercise.restRunning) return exercise
          const remaining = exercise.restRemainingSec - delta
          if (remaining <= 0) {
            setRestFinishedName(exercise.exerciseName)
            return { ...exercise, restRemainingSec: 0, restRunning: false }
          }
          return { ...exercise, restRemainingSec: remaining }
        })
        return next
      })
    }, 1000)

    return () => window.clearInterval(id)
  }, [screen])

  // Effect que reage a transições de restRunning por exercício e dispara
  // schedule/cancel no backend. Só executa o trabalho de fato se o user
  // optou-in (subscribed=true). Não é cleanup-heavy — só lê do ref de
  // estado anterior e faz chamadas HTTP fire-and-forget.
  //
  // Regras:
  //   • false → true: agenda push pra Date.now() + remaining*1000.
  //   • true → false COM remaining > 0: usuário parou manualmente, cancela.
  //   • true → false COM remaining <= 0: deixa rolar — push do backend
  //     vai chegar (ou já chegou) por conta própria.
  useEffect(() => {
    if (!pushNotifications.state.subscribed) {
      // Quando o user não está inscrito ou desativou, ainda manteremos
      // o ref de prev sincronizado pra evitar disparar schedule em
      // massa quando ele ativar (1 evento por exercício rodando).
      const updated: typeof prevRestStateRef.current = {}
      for (const ex of activeExercises) {
        updated[ex.exerciseId] = { running: ex.restRunning, remaining: ex.restRemainingSec }
      }
      prevRestStateRef.current = updated
      return
    }

    const updated: typeof prevRestStateRef.current = {}
    for (const ex of activeExercises) {
      const prev = prevRestStateRef.current[ex.exerciseId]
      const now = { running: ex.restRunning, remaining: ex.restRemainingSec }
      updated[ex.exerciseId] = now

      if (!prev) continue

      // Detecta restart de descanso (mesmo exercício, descanso ainda
      // rodando mas remaining "pulou pra cima" — sinal de que o user marcou
      // outra série antes do timer zerar). Tolerância de +2s pra cobrir
      // micro-jitter entre o tick do interval e o set state.
      const isRestart = prev.running && now.running && now.remaining > prev.remaining + 2

      // Início do descanso → agenda no backend com payload "rico":
      // título traz o nome do exercício, body traz qual a próxima série
      // e (quando disponível) o desempenho da que acabou de ser feita.
      // Notificação chega no lock screen do iOS com toda info pra o user
      // não precisar abrir o app pra lembrar onde parou.
      //
      // Cancel automático em restart é feito por scheduleRestForExercise
      // (bumpa seq, cancela lista, agenda com race guard) — não precisa
      // mais do bloco manual de cancel que existia aqui.
      if ((!prev.running && now.running && now.remaining > 0) || isRestart) {
        const fireAtMs = Date.now() + now.remaining * 1000
        const fireAt = new Date(fireAtMs).toISOString()
        const exerciseName = ex.exerciseName
        const exerciseId = ex.exerciseId

        // Encontra a série marcada como concluída mais recente (em ordem
        // de array). Heurística simples — o usuário tipicamente checa
        // séries em ordem, então a última marcada é a que acabou.
        let lastCheckedIdx = -1
        for (let i = 0; i < ex.sets.length; i += 1) {
          if (ex.sets[i].checked === true) lastCheckedIdx = i
        }
        const totalSets = ex.sets.length
        const lastSet = lastCheckedIdx >= 0 ? ex.sets[lastCheckedIdx] : null
        const performance = lastSet ? formatSetPerformanceLabel(lastSet, ex.isBodyweight) : null

        const nextSetNumber = lastCheckedIdx + 2 // 1-indexed
        const isLastSet = nextSetNumber > totalSets

        // Copy padronizada estilo Hevy: título neutro descrevendo o evento +
        // body com exercício na primeira linha e detalhe da próxima série na
        // segunda. \n é respeitado pelo iOS lock screen e Android moderno.
        // Mantemos × (U+00D7) — funciona em 100% dos devices modernos.
        const title = isLastSet ? 'Última série concluída' : 'Descanso concluído'
        let body: string
        if (isLastSet) {
          body = performance ? `${exerciseName}\n${performance}` : exerciseName
        } else {
          const nextLine = `Série ${nextSetNumber} de ${totalSets}`
          const detailLine = performance ? `${nextLine} · Última ${performance}` : nextLine
          body = `${exerciseName}\n${detailLine}`
        }

        scheduleRestForExercise(exerciseId, {
          fireAt,
          title,
          body,
          url: '/train',
          tag: `rest-${exerciseId}`,
        })
      }

      // Parada manual (true→false com tempo restante) → cancela tudo do
      // slot, inclusive promises ainda em curso (via seq bump).
      if (prev.running && !now.running && now.remaining > 0) {
        cancelRestSlot(ex.exerciseId)
      }

      // Conclusão natural (true→false ao zerar) — limpa o slot inteiro.
      // O push do backend já disparou OU vai disparar exatamente agora;
      // não precisa cancelar nada, só limpar o estado local pra próxima
      // rodada. Bumpamos o seq mesmo assim pra invalidar qualquer promise
      // de schedule lenta que ainda esteja em curso (caso raro mas real).
      if (prev.running && !now.running && now.remaining <= 0) {
        cancelRestSlot(ex.exerciseId)
      }
    }
    prevRestStateRef.current = updated
  }, [activeExercises, authorizedFetch, pushNotifications.state.subscribed, scheduleRestForExercise, cancelRestSlot])

  // Cancela o lembrete pendente (no-op se nada agendado) e cria um novo
  // pra agora+30min. Idempotente — chamar 10 vezes em sequência só deixa
  // o último ativo. Fire-and-forget: falhas HTTP não bloqueiam o app.
  // Sai cedo se o user não optou-in (subscribed=false) pra não ficar
  // batendo no backend inutilmente.
  const rescheduleIdleReminder = useCallback(() => {
    if (!pushNotifications.state.subscribed) return

    // Bump da geração ANTES de qualquer await — promises pendentes vão usar
    // isso pra saber se ainda são a chamada mais recente.
    const mySeq = ++idleReminderSeqRef.current

    // Snapshot da lista de pendentes, depois esvazia. Cancela tudo que
    // já estava agendado (inclusive zumbis de promises que ainda iam voltar
    // do backend mas vão ser invalidadas pelo mySeq abaixo).
    const pending = idleReminderScheduleIdsRef.current.slice()
    idleReminderScheduleIdsRef.current = []
    for (const id of pending) {
      void cancelBackendNotification(authorizedFetch, id).catch(() => { /* silencioso */ })
    }

    const fireAt = new Date(Date.now() + IDLE_REMINDER_MIN * 60 * 1000).toISOString()
    void scheduleBackendNotification(authorizedFetch, {
      fireAt,
      // Copy padronizada estilo Hevy: título descritivo do estado (não
      // gíria), body informa o motivo + call-to-action explícito.
      title: 'Treino pausado',
      body: `Sem novas séries há ${IDLE_REMINDER_MIN} min. Toque pra continuar ou finalizar.`,
      url: '/train',
      // Mesma tag pra todas as notificações de "idle" — no caso raro de
      // duas dispararem em sequência (race entre cancel/schedule), o
      // device coalesce visualmente em uma só.
      tag: 'idle-workout',
    }).then(({ id }) => {
      // Race guard: se outra chamada veio depois desta, o counter já
      // andou. Esse id é obsoleto — cancela no backend e descarta.
      if (mySeq !== idleReminderSeqRef.current) {
        void cancelBackendNotification(authorizedFetch, id).catch(() => { /* silencioso */ })
        return
      }
      idleReminderScheduleIdsRef.current.push(id)
    }).catch(() => { /* silencioso */ })
  }, [pushNotifications.state.subscribed, authorizedFetch])

  // Cancela TODAS as notificações de "Descanso acabou" pendentes no backend
  // pra qualquer exercício desta sessão. Chamada nos pontos terminais do
  // treino (descartar, finalizar, salvar) — sem isso, mesmo após o user
  // descartar o treino, as pushes agendadas continuam disparando no horário
  // marcado (bug reportado: "Descanso acabou — Supino" chegando depois de
  // ter descartado o treino).
  //
  // Itera os slots e usa cancelRestSlot pra garantir que o seq é bumpado
  // em cada um — sem isso, promises ainda em curso poderiam voltar do
  // backend depois e salvar IDs zumbis que ninguém cancelaria mais.
  const cancelAllPendingRestNotifications = useCallback(() => {
    for (const key of Object.keys(restScheduleSlotsRef.current)) {
      cancelRestSlot(key)
    }
  }, [cancelRestSlot])

  // Cancela TODOS os lembretes pendentes sem reagendar. Usado quando o
  // treino acaba (finalizar ou descartar). Invalida promises em curso
  // bumpando o seq pra que qualquer ID que ainda volte do backend seja
  // cancelado em vez de salvo (mesma proteção do reschedule).
  const cancelIdleReminder = useCallback(() => {
    idleReminderSeqRef.current += 1
    const pending = idleReminderScheduleIdsRef.current.slice()
    idleReminderScheduleIdsRef.current = []
    for (const id of pending) {
      void cancelBackendNotification(authorizedFetch, id).catch(() => { /* silencioso */ })
    }
  }, [authorizedFetch])

  useEffect(() => {
    if (!restFinishedName) return

    // Notif local foi pensada pra cobrir o caso "app aberto mas em outra
    // aba"; com o app em foreground/visible, ela vira ruído visual (banner
    // sobre conteúdo) e ainda DUPLICA a push que já chegou do backend no
    // lock screen.
    //
    // Bug reportado: ao voltar pro app depois do descanso ter zerado em
    // background, o catch-up setava restFinishedName, esse efeito disparava
    // localNotification, iOS exibia banner — segundo "Descanso concluído"
    // pro mesmo evento. Agora só dispara quando a aba está hidden (ou
    // visibility API não disponível).
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      void showLocalNotification('Descanso concluído', {
        body: restFinishedName,
        tag: 'rest-done',
        url: '/train',
        vibrate: [80, 40, 80],
      })
    }

    const id = window.setTimeout(() => setRestFinishedName(null), 3000)
    return () => window.clearTimeout(id)
  }, [restFinishedName])

  // Mobile background catch-up. iOS Safari (e Chrome em alguns casos)
  // pausa setInterval quando a aba sai pra background — trocar de
  // app, travar a tela, minimizar — então o cronômetro de duração e
  // o timer de descanso "congelam" no valor que tinham. Quando o
  // usuário volta, esse efeito calcula quanto tempo passou enquanto
  // hidden e compensa nos contadores.
  const isWorkoutRunningRef = useRef(isWorkoutRunning)
  useEffect(() => { isWorkoutRunningRef.current = isWorkoutRunning }, [isWorkoutRunning])
  useEffect(() => {
    let hiddenAt: number | null = null
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      // visibilityState === 'visible' (ou pageshow do bfcache)
      if (hiddenAt == null) return
      const missedSec = Math.floor((Date.now() - hiddenAt) / 1000)
      hiddenAt = null
      if (missedSec <= 0) return

      // IMPORTANTE: NÃO compensar elapsedSec aqui — o setInterval principal
      // do cronômetro de treino (linhas ~1380) já usa wall-clock delta, então
      // o próximo tick dele depois de voltar de background pula automático
      // pra frente sem ajuda. Adicionar missedSec aqui DOBRAVA o tempo de
      // duração (bug reportado: 1h31 real virava 1h53). Mantemos o catch-up
      // só pros timers de descanso (abaixo), porque esses NÃO têm tick
      // próprio com wall-clock.

      // Catch-up dos timers de descanso. Cada exercício com
      // restRunning recebe o desconto; se zerar, dispara o nome
      // do exercício pra o overlay "Descanso acabou".
      setActiveExercises((current) => {
        let anyChanged = false
        const next = current.map((exercise) => {
          if (!exercise.restRunning) return exercise
          anyChanged = true
          const remaining = exercise.restRemainingSec - missedSec
          if (remaining <= 0) {
            setRestFinishedName(exercise.exerciseName)
            return { ...exercise, restRemainingSec: 0, restRunning: false }
          }
          return { ...exercise, restRemainingSec: remaining }
        })
        return anyChanged ? next : current
      })
    }
    document.addEventListener('visibilitychange', handleVisibility)
    // pageshow cobre o caso de Safari restaurar a página do bfcache
    // (back/forward navigation) — não dispara visibilitychange nesse
    // path mas a aba ficou "hidden" do nosso ponto de vista.
    window.addEventListener('pageshow', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pageshow', handleVisibility)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (summaryImagePreview) {
        URL.revokeObjectURL(summaryImagePreview)
      }
    }
  }, [summaryImagePreview])

  const activeExerciseIdsKey = useMemo(
    () =>
      Array.from(new Set(activeExercises.map((exercise) => exercise.exerciseId)))
        .sort()
        .join(','),
    [activeExercises],
  )

  useEffect(() => {
    if (screen !== 'ACTIVE' || !activeExerciseIdsKey) {
      setLastPerformanceByExercise({})
      return
    }

    let cancelled = false

    const loadLastPerformance = async () => {
      try {
        const exerciseIds = activeExerciseIdsKey.split(',').filter(Boolean)
        const data = await getLatestExercisePerformance(authorizedFetch, exerciseIds)

        if (cancelled) {
          return
        }

        const mapped: Record<
          string,
          Record<
            number,
            {
              reps: number | null
              weightKg: number | null
              rir: number | null
              rpe: number | null
              durationSec: number | null
              distanceMeters: number | null
            }
          >
        > = {}
        const latestSetCountByExercise: Record<string, number> = {}

        data.items.forEach((item) => {
          mapped[item.exerciseId] = {}
          latestSetCountByExercise[item.exerciseId] = item.sets.reduce(
            (max, setEntry) => Math.max(max, setEntry.setNumber),
            0,
          )
          item.sets.forEach((setEntry) => {
            const reps = toFiniteNumber(setEntry.reps)
            const weightKg = toFiniteNumber(setEntry.weightKg)
            const rir = toFiniteNumber(setEntry.rir)
            const rpe = toFiniteNumber(setEntry.perceivedExertion)
            const durationSec = toFiniteNumber(setEntry.durationSec)
            const distanceMeters = toFiniteNumber(setEntry.distanceMeters)

            mapped[item.exerciseId][setEntry.setNumber] = {
              reps,
              weightKg,
              rir,
              rpe,
              durationSec,
              distanceMeters,
            }
          })
        })

        setLastPerformanceByExercise(mapped)
        setActiveExercises((current) =>
          current.map((exercise) => {
            const latestCount = latestSetCountByExercise[exercise.exerciseId] ?? 0
            if (latestCount <= exercise.sets.length) {
              return exercise
            }

            return {
              ...exercise,
              sets: [
                ...exercise.sets,
                ...Array.from({ length: latestCount - exercise.sets.length }, () => createSet()),
              ],
            }
          }),
        )
      } catch {
        if (!cancelled) {
          setLastPerformanceByExercise({})
        }
      }
    }

    void loadLastPerformance()

    return () => {
      cancelled = true
    }
  }, [activeExerciseIdsKey, authorizedFetch, screen])

  // All-time PR baseline for the active exercises. Fetched once when the
  // user enters the active screen so we can celebrate the first set that
  // beats their previous max. Bodyweight-style exercises return null which
  // is handled gracefully (we just won't fire any celebration on them).
  useEffect(() => {
    if (screen !== 'ACTIVE' || !activeExerciseIdsKey) {
      setPrByExerciseId({})
      return
    }

    let cancelled = false

    const loadPrs = async () => {
      try {
        const exerciseIds = activeExerciseIdsKey.split(',').filter(Boolean)
        const data = await getExercisePersonalRecords(authorizedFetch, exerciseIds)
        if (cancelled) return
        const next: Record<string, number | null> = {}
        const snapshot: Record<string, number> = {}
        for (const item of data.items) {
          next[item.exerciseId] = item.maxLoadKg
          if (item.maxLoadKg != null) snapshot[item.exerciseId] = item.maxLoadKg
        }
        setPrByExerciseId(next)
        // Snapshot do PR "antes" pra contar PRs novos no SUMMARY.
        setPrSnapshotAtStart(snapshot)
      } catch {
        // Soft fail — missing PR data just means no celebration, the
        // workout itself isn't impacted.
      }
    }

    void loadPrs()

    return () => {
      cancelled = true
    }
  }, [screen, activeExerciseIdsKey, authorizedFetch])

  useEffect(() => {
    if (screen !== 'ACTIVE' || !activeExerciseIdsKey) {
      return
    }

    let cancelled = false

    const syncExerciseMetadata = async () => {
      try {
        const catalog = await searchExercisesForPlan(authorizedFetch, { limit: 300 })
        if (cancelled) {
          return
        }

        const catalogById = new Map(catalog.map((exercise) => [exercise.id, exercise]))

        setActiveExercises((current) =>
          current.map((exercise) => {
            const catalogExercise = catalogById.get(exercise.exerciseId)
            if (!catalogExercise) {
              return exercise
            }

            const equipment = catalogExercise.equipment || exercise.equipment
            const isBodyweight =
              isBodyweightEquipment(equipment) ||
              resolveBodyweightFlag(catalogExercise.isBodyweight, exercise.exerciseName, equipment)

            if (
              exercise.thumbnailUrl === (catalogExercise.thumbnailUrl ?? exercise.thumbnailUrl) &&
              exercise.videoUrl === (catalogExercise.videoUrl ?? exercise.videoUrl) &&
              exercise.equipment === equipment &&
              exercise.isBodyweight === isBodyweight &&
              exercise.allowsExtraLoad === catalogExercise.allowsExtraLoad
            ) {
              return exercise
            }

            return {
              ...exercise,
              thumbnailUrl: catalogExercise.thumbnailUrl ?? exercise.thumbnailUrl,
              videoUrl: catalogExercise.videoUrl ?? exercise.videoUrl,
              equipment,
              isBodyweight,
              allowsExtraLoad: catalogExercise.allowsExtraLoad,
            }
          }),
        )
      } catch {
        // Keep current values when metadata enrichment fails.
      }
    }

    void syncExerciseMetadata()

    return () => {
      cancelled = true
    }
  }, [activeExerciseIdsKey, authorizedFetch, screen])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-routine-menu]')) {
        setOpenRoutineMenuId(null)
        setRoutineMenuAnchor(null)
      }
    }

    const handleDismiss = () => {
      setOpenRoutineMenuId(null)
      setRoutineMenuAnchor(null)
    }

    document.addEventListener('click', handleDocumentClick)
    window.addEventListener('resize', handleDismiss)
    window.addEventListener('scroll', handleDismiss, true)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
      window.removeEventListener('resize', handleDismiss)
      window.removeEventListener('scroll', handleDismiss, true)
    }
  }, [])

  // Retro-compat com o explorer global no AppShell — outros pontos do
  // app podem disparar openExerciseExplorer e selecionar daí. No treino
  // ativo, redireciona pra os mesmos helpers do AddExerciseModal/
  // SubstituteExerciseModal. O caminho principal hoje é via os modais
  // locais, mas mantenho esse listener pra não quebrar deep-links.
  useEffect(() => {
    const eventName = getExerciseExplorerSelectionEventName()

    const handler = (event: Event) => {
      if (screen !== 'ACTIVE') return
      const payload = (event as CustomEvent<ExerciseExplorerSelection>).detail
      if (!payload) return

      // trackingType é opcional no ExerciseExplorerSelection mas
      // requerido no ExerciseOption — default REPS pra normalizar.
      const option: ExerciseOption = { ...payload, trackingType: payload.trackingType ?? 'REPS' }

      const substituteIndex = pendingSubstitutionIndexRef.current
      if (substituteIndex != null) {
        pendingSubstitutionIndexRef.current = null
        applySubstitution(substituteIndex, option)
        return
      }
      addExerciseToActiveWorkout(option)
    }

    window.addEventListener(eventName, handler)
    return () => window.removeEventListener(eventName, handler)
  }, [screen])

  // Erros são scoped por tela — qualquer transição limpa o estado pra
  // não exibir uma mensagem que ficou pendurada de outro contexto.
  useEffect(() => {
    setError(null)
  }, [screen])

  const totals = useMemo(() => calculateTotals(activeExercises), [activeExercises])

  const resetWorkflow = () => {
    setScreen('DASHBOARD')
    setOriginMode('EMPTY')
    setActivePlanName('Treinamento vazio')
    setActiveExercises([])
    setCardioEntries([])
    setElapsedSec(0)
    setIsWorkoutRunning(false)
    setManualTimerMinutes('')
    setStartedAt(null)
    setEndedAt(null)
    setSummaryName('')
    setSummaryDurationMin('')
    setSummaryImageFile(null)
    if (summaryImagePreview) {
      URL.revokeObjectURL(summaryImagePreview)
    }
    setSummaryImagePreview(null)
    setSavedSessionId(null)
    setPostCaption('')
    setPostPrivacy(defaultPrivacy)
    setPosting(false)
    setPostDone(false)
    interactionOrderByExerciseRef.current = {}
    interactionOrderCounterRef.current = 0
    clearActiveWorkout()
    // Workout encerrou — não queremos um lembrete pendurado.
    cancelIdleReminder()
    // Nem pushes de "Descanso acabou" agendadas pra um exercício que não
    // existe mais. O backend coalesce por tag mas só dentro da mesma sessão
    // do device; sem cancel explícito, a push do treino descartado chega
    // do mesmo jeito no horário marcado.
    cancelAllPendingRestNotifications()
  }

  const beginEmptyTraining = () => {
    setError(null)
    interactionOrderByExerciseRef.current = {}
    interactionOrderCounterRef.current = 0
    setOriginMode('EMPTY')
    setActivePlanName('Treinamento vazio')
    setActiveExercises([])
    setCardioEntries([])
    setElapsedSec(0)
    setIsWorkoutRunning(true)
    setStartedAt(new Date())
    setEndedAt(null)
    setScreen('ACTIVE')
    // Inicia o relógio de inatividade — se o user abandonar agora sem
    // marcar nem adicionar nada, leva o lembrete em 30 min.
    rescheduleIdleReminder()
  }

  const beginRoutineTraining = (plan: WorkoutPlan) => {
    setError(null)
    interactionOrderByExerciseRef.current = {}
    interactionOrderCounterRef.current = 0
    setOriginMode('ROUTINE')
    setActivePlanId(plan.id)
    setActivePlanName(plan.name)
    setActiveExercises(mapPlanToActiveExercises(plan))
    setCardioEntries(
      (plan.cardio ?? []).map((c) => ({
        type: c.type,
        durationSec: c.durationSec,
        distanceMeters: c.distanceMeters ?? undefined,
        notes: c.notes ?? undefined,
      })),
    )
    setElapsedSec(0)
    setIsWorkoutRunning(true)
    setStartedAt(new Date())
    setEndedAt(null)
    setScreen('ACTIVE')
    rescheduleIdleReminder()
  }

  const finalizeTraining = () => {
    const end = new Date()
    setEndedAt(end)
    setIsWorkoutRunning(false)
    // Tela de Resumo é estado terminal — usuário tá pra salvar ou
    // descartar, não tá mais "treinando". Cancela o lembrete pra não
    // soltar "treino ainda rolando" enquanto ele preenche o resumo.
    cancelIdleReminder()
    // Tambem cancela qualquer push de "Descanso acabou" pendente — o user
    // já saiu da tela de treino ativo, descanso não faz sentido mais.
    cancelAllPendingRestNotifications()

    setSummaryName(activePlanName)
    // Inclui o tempo de cardio no padrão da duração — sem isso, registrar
    // "30 min de corrida" em 1 min de cronômetro pré-encheria apenas 1 min.
    const cardioMin = Math.round(cardioEntries.reduce((s, c) => s + c.durationSec, 0) / 60)
    const clockMin = Math.round(elapsedSec / 60)
    setSummaryDurationMin(String(Math.max(1, clockMin, cardioMin)))
    setScreen('SUMMARY')
    // NÃO limpamos clearActiveWorkout() aqui — se o usuário fechar o tab
    // entre Finalizar e Salvar, perderia o tracking inteiro. O snapshot
    // é limpo só depois do save bem-sucedido (ver saveTraining).
  }

  // "Voltar" no header do treino ativo agora apenas volta pra dashboard
  // sem perder o treino. O snapshot continua em localStorage e o card
  // "Treino em andamento" na dashboard (ou a mini barra em outras páginas)
  // serve de atalho de volta.
  const backToDashboardFromActive = () => {
    setScreen('DASHBOARD')
  }

  const backToActiveTraining = () => {
    setEndedAt(null)
    setIsWorkoutRunning(true)
    setScreen('ACTIVE')
  }

  // Wrapper que faz duas checagens antes de finalizar:
  //   1) BLOQUEIO HARD — não permite finalizar se o treino está vazio
  //      (nenhuma série de musculação executada/preenchida E nenhum
  //      cardio). Faz sentido: salvar registro de "treino" sem nada
  //      polui o histórico e não tem informação útil.
  //   2) SOFT WARNING — séries com valores preenchidos mas sem o ✓.
  //      Avisa e deixa o usuário escolher finalizar mesmo assim.
  const finalizeWithSafetyCheck = () => {
    // 1) Treino completamente vazio?
    const hasMuscleWork = activeExercises.some((ex) =>
      ex.sets.some((s) =>
        s.checked ||
        s.reps.trim() !== '' ||
        s.weightKg.trim() !== '' ||
        s.rir.trim() !== '' ||
        s.rpe.trim() !== ''
      )
    )
    const hasCardio = cardioEntries.length > 0
    if (!hasMuscleWork && !hasCardio) {
      setInfoDialog({
        title: 'Treino vazio',
        message:
          'Você precisa de pelo menos uma atividade pra finalizar — uma série de musculação (mesmo só com reps/peso preenchido) ou uma entrada de cardio.\n\nVolte e adicione algum exercício, ou descarte o treino se foi um engano.',
      })
      return
    }

    // 2) Séries pendentes (input sem ✓)?
    let unchecked = 0
    for (const exercise of activeExercises) {
      for (const set of exercise.sets) {
        if (set.checked) continue
        const hasInput =
          set.reps.trim() !== '' || set.weightKg.trim() !== '' ||
          set.rir.trim() !== '' || set.rpe.trim() !== ''
        if (hasInput) unchecked += 1
      }
    }
    if (unchecked > 0) {
      setConfirmDialog({
        title: 'Finalizar com séries pendentes?',
        message: `Você tem ${unchecked} série(s) com valores preenchidos mas sem o ✓ de concluída. Elas não vão ser contabilizadas no histórico nem no volume. Finalizar mesmo assim?`,
        confirmLabel: 'Finalizar',
        onConfirm: finalizeTraining,
      })
      return
    }
    finalizeTraining()
  }

  const toggleRestTimer = (exerciseIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) =>
        idx === exerciseIndex
          ? exercise.restDurationSec <= 0
            ? exercise
            : { ...exercise, restRunning: !exercise.restRunning }
          : exercise,
      ),
    )
  }

  const adjustRestTimer = (exerciseIndex: number, deltaSec: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) return exercise
        const next = Math.max(1, exercise.restRemainingSec + deltaSec)
        return { ...exercise, restRemainingSec: next }
      }),
    )
  }

  const completeSet = useCallback(
    (exerciseIndex: number, setIndex: number) => {
      // PR detection — só dispara quando:
      //   (a) o user está marcando (unchecked → checked, desmarcar não conta)
      //   (b) o peso É ESTRITAMENTE MAIOR que o all-time PR conhecido E maior
      //       que o melhor peso de qualquer outra série JÁ marcada nesta sessão
      //       no mesmo exercício.
      //
      // O check contra "melhor série da sessão" é o que evita o bug em que
      // 2 séries de 95kg disparavam celebration duas vezes — antes só
      // comparávamos com prByExerciseId, que podia estar stale entre cliques
      // rápidos. Comparar com as próprias sets marcadas é resiliente a
      // closure stale e a estado vazio inicial.
      const target = activeExercises[exerciseIndex]
      const targetSet = target?.sets[setIndex]
      if (target && targetSet && !targetSet.checked && !isEffectiveBodyweightExercise(target)) {
        const weightRaw = targetSet.weightKg.trim().replace(',', '.')
        const weight = weightRaw ? Number(weightRaw) : NaN

        const previousPr = prByExerciseId[target.exerciseId] ?? null
        // Maior peso já marcado nas OUTRAS séries deste exercício na sessão.
        const bestInSession = target.sets.reduce((max, s, i) => {
          if (i === setIndex || !s.checked) return max
          const w = Number((s.weightKg ?? '').trim().replace(',', '.'))
          return Number.isFinite(w) && w > max ? w : max
        }, 0)
        const effectivePr = Math.max(previousPr ?? 0, bestInSession)

        if (Number.isFinite(weight) && weight > 0 && weight > effectivePr) {
          setPrByExerciseId((current) => ({ ...current, [target.exerciseId]: weight }))
          setPrCelebration({
            id: Date.now(),
            exerciseName: target.exerciseName,
            loadKg: weight,
            // previousKg null quando é o primeiro PR all-time; mostra o PR
            // anterior (que pode ser o all-time OU o melhor da sessão).
            previousKg: effectivePr > 0 ? effectivePr : null,
          })
        }
      }

      setActiveExercises((current) =>
        current.map((exercise, idx) => {
          if (idx !== exerciseIndex) return exercise

          const wasChecked = exercise.sets[setIndex]?.checked ?? false
          const lastSet = lastPerformanceByExercise[exercise.exerciseId]?.[setIndex + 1]

          const trackingDefault =
            exercise.trackingType === 'TIME'
              ? '30'
              : exercise.trackingType === 'DISTANCE'
                ? '20'
                : exercise.suggestedReps
          const lastValue =
            exercise.trackingType === 'TIME'
              ? lastSet?.durationSec
              : exercise.trackingType === 'DISTANCE'
                ? lastSet?.distanceMeters
                : lastSet?.reps
          const newSets = exercise.sets.map((s, sIdx) => {
            if (sIdx !== setIndex) return s
            if (wasChecked) return { ...s, checked: false }
            const repsFill =
              s.reps.trim() !== ''
                ? s.reps
                : lastValue != null
                  ? String(lastValue)
                  : trackingDefault
            return {
              ...s,
              checked: true,
              weightKg: s.weightKg.trim() === '' && lastSet?.weightKg != null ? String(lastSet.weightKg) : s.weightKg,
              reps: repsFill,
              rir: s.rir.trim() === '' && lastSet?.rir != null ? String(lastSet.rir) : s.rir,
              rpe: s.rpe.trim() === '' && lastSet?.rpe != null ? String(lastSet.rpe) : s.rpe,
            }
          })

          const shouldStartRest = !wasChecked && exercise.restDurationSec > 0

          return {
            ...exercise,
            sets: newSets,
            restRemainingSec: shouldStartRest ? exercise.restDurationSec : exercise.restRemainingSec,
            restRunning: shouldStartRest ? true : exercise.restRunning,
          }
        }).map((exercise, idx) => {
          // stop rest on all OTHER exercises when starting a new one
          if (idx !== exerciseIndex && current[exerciseIndex]?.sets[setIndex]?.checked === false) {
            return { ...exercise, restRunning: false }
          }
          return exercise
        }),
      )

      // Atividade significativa — adia o lembrete de "treino parado" pra
      // mais 30 min. Vale tanto pra checar quanto pra desmarcar (qualquer
      // toque mostra que o user ainda tá engajado).
      rescheduleIdleReminder()
    },
    [lastPerformanceByExercise, activeExercises, prByExerciseId, rescheduleIdleReminder],
  )

  const startRestEdit = (exerciseIndex: number) => {
    const target = activeExercises[exerciseIndex]
    if (!target) {
      return
    }

    setEditingRestExerciseIndex(exerciseIndex)
    setRestDraftSec(String(target.restDurationSec))
  }

  // Aplica o tempo de descanso novo. O sheet já garante que o valor
  // vem de uma lista válida (REST_OPTIONS_SEC ∪ {0}), então não
  // precisa mais validar formato — a validação fica como guarda
  // defensiva contra chamadas programáticas com valores estranhos.
  const applyRestEdit = async (exerciseIndex: number, secOverride?: number) => {
    const parsed = secOverride ?? Number(restDraftSec)
    const isInt = Number.isInteger(parsed)
    const isZero = parsed === 0
    const inRange = parsed >= 10 && parsed <= 300

    if (!isInt || (!isZero && !inRange)) {
      setError('Descanso deve ser 0 ou um valor entre 10 e 300 segundos.')
      return
    }

    setError(null)

    const target = activeExercises[exerciseIndex]
    if (!target) {
      setEditingRestExerciseIndex(null)
      return
    }

    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) {
          return exercise
        }

        return {
          ...exercise,
          restDurationSec: parsed,
          restRemainingSec: parsed,
          restRunning: false,
        }
      }),
    )
    setEditingRestExerciseIndex(null)

    if (originMode !== 'ROUTINE' || !activePlanId || !target.planExerciseId) {
      return
    }

    try {
      await updatePlanExercise(authorizedFetch, activePlanId, target.planExerciseId, {
        restSec: parsed === 0 ? null : parsed,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar descanso na rotina')
    }
  }

  // Remove um exercício do treino ativo. Quando o exercício veio de
  // uma rotina, mostra confirm forte porque a remoção é irreversível
  // pela UI (precisaria voltar à edição da rotina). Quando é um
  // exercício adicionado on-the-fly à sessão, basta sumir.
  const handleRemoveExercise = (exerciseIndex: number) => {
    const target = activeExercises[exerciseIndex]
    if (!target) return
    const confirmed = window.confirm(
      `Remover "${target.exerciseName}" do treino?\n\nIsso apaga as séries que você já registrou desse exercício nesta sessão.`,
    )
    if (!confirmed) return
    setActiveExercises((current) => current.filter((_, idx) => idx !== exerciseIndex))
    // Não reseta o idle reminder: só marcar série conta como atividade real
    // de treino. Remover exercício pode ser parte de "preparar a próxima
    // sessão" e não merece adiar o lembrete.
  }

  // Adiciona um exercício ao final do treino ativo. Pure — o updater
  // não tem side effect além do return; a checagem de duplicata é
  // feita só pra ser idempotente (StrictMode chama o updater 2x em dev
  // e poderia adicionar 2 cópias). Os callers que precisam avisar o
  // usuário sobre duplicatas fazem essa checagem ANTES de chamar (ex.:
  // onPickBatch do AddExerciseModal mostra um InfoDialog agregado pros
  // skipped). Aqui dentro o silêncio é proposital: o create-flow nunca
  // tem duplicata real (id é fresco) e o explorer legado faz dedup no
  // listener.
  const addExerciseToActiveWorkout = (payload: ExerciseOption) => {
    pushRecentExerciseId(payload.id)
    setActiveExercises((current) => {
      if (current.some((ex) => ex.exerciseId === payload.id)) return current
      return [
        ...current,
        {
          exerciseId: payload.id,
          exerciseName: payload.name,
          equipment: payload.equipment,
          thumbnailUrl: payload.thumbnailUrl,
          videoUrl: payload.videoUrl,
          isBodyweight: resolveBodyweightFlag(payload.isBodyweight, payload.name, payload.equipment),
          allowsExtraLoad: payload.allowsExtraLoad,
          trackingType: (payload.trackingType ?? 'REPS') as TrackingType,
          suggestedReps:
            payload.trackingType === 'TIME'
              ? '30'
              : payload.trackingType === 'DISTANCE'
                ? '20'
                : '10',
          restDurationSec: 0,
          restRemainingSec: 0,
          restRunning: false,
          sets: [createSet()],
          userNote: '',
        },
      ]
    })
    // Não reseta o idle reminder: adicionar exercício ainda não é treinar.
    // Só marcar série conta como atividade que adia o lembrete.
  }

  // Aplica a substituição de um exercício pelo ExerciseOption picado.
  // Preserva séries, descanso, notas e supersérie. Usado tanto pelo
  // SubstituteExerciseModal novo quanto pelo fluxo legado via explorer.
  const applySubstitution = (substituteIndex: number, payload: ExerciseOption) => {
    pushRecentExerciseId(payload.id)
    let blocked = false
    setActiveExercises((current) => {
      const dup = current.findIndex((ex) => ex.exerciseId === payload.id)
      if (dup !== -1 && dup !== substituteIndex) {
        blocked = true
        return current
      }
      return current.map((exercise, idx) => {
        if (idx !== substituteIndex) return exercise
        return {
          ...exercise,
          exerciseId: payload.id,
          exerciseName: payload.name,
          equipment: payload.equipment,
          thumbnailUrl: payload.thumbnailUrl,
          videoUrl: payload.videoUrl,
          isBodyweight: resolveBodyweightFlag(payload.isBodyweight, payload.name, payload.equipment),
          allowsExtraLoad: payload.allowsExtraLoad,
          trackingType: (payload.trackingType ?? 'REPS') as TrackingType,
        }
      })
    })
    if (blocked) {
      setInfoDialog({
        title: 'Exercício já no treino',
        message: `${payload.name} já está em outra posição do treino. Escolha outro exercício para substituir.`,
      })
    }
  }

  // Handler do drag-and-drop. Recebe a nova posição via dnd-kit,
  // encontra os índices pelos exerciseIds e usa arrayMove pra
  // calcular o novo array. exerciseId é único por treino (garantido
  // pelo handler que adiciona exercícios), então funciona como id
  // estável pro dnd-kit mesmo após reorder.
  const handleExerciseDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setActiveExercises((current) => {
      const oldIndex = current.findIndex((ex) => ex.exerciseId === active.id)
      const newIndex = current.findIndex((ex) => ex.exerciseId === over.id)
      if (oldIndex === -1 || newIndex === -1) return current
      return arrayMove(current, oldIndex, newIndex)
    })
  }

  // Pareia dois exercícios numa supersérie. Se o alvo já tem grupo,
  // o source entra nesse grupo (cria supersérie de 3+). Caso contrário,
  // cria um grupo novo com a próxima letra livre (A, B, C...).
  const pairAsSuperset = (sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex) return
    setActiveExercises((current) => {
      const target = current[targetIndex]
      const source = current[sourceIndex]
      if (!target || !source) return current
      const groupId = target.supersetGroup ?? source.supersetGroup ?? nextSupersetGroupId(current)
      return current.map((exercise, idx) => {
        if (idx === sourceIndex || idx === targetIndex) {
          return { ...exercise, supersetGroup: groupId }
        }
        return exercise
      })
    })
  }

  // Tira o exercício do grupo. Se sobrar só 1 exercício no grupo
  // depois disso, o solitário também perde o grupo (supersérie de
  // 1 é sem sentido).
  const removeFromSuperset = (exerciseIndex: number) => {
    setActiveExercises((current) => {
      const target = current[exerciseIndex]
      if (!target || !target.supersetGroup) return current
      const groupId = target.supersetGroup
      const stillInGroup = current
        .map((ex, idx) => ({ ex, idx }))
        .filter(({ ex, idx }) => idx !== exerciseIndex && ex.supersetGroup === groupId)
      const orphanedIndex = stillInGroup.length === 1 ? stillInGroup[0].idx : null
      return current.map((exercise, idx) => {
        if (idx === exerciseIndex || idx === orphanedIndex) {
          return { ...exercise, supersetGroup: null }
        }
        return exercise
      })
    })
  }

  const patchSet = (
    exerciseIndex: number,
    setIndex: number,
    patch: Partial<ExerciseSetInput>,
  ) => {
    const targetExercise = activeExercises[exerciseIndex]
    if (targetExercise) {
      const currentOrder = interactionOrderByExerciseRef.current[targetExercise.exerciseId]
      if (currentOrder == null) {
        interactionOrderCounterRef.current += 1
        interactionOrderByExerciseRef.current[targetExercise.exerciseId] = interactionOrderCounterRef.current
      }
    }

    setActiveExercises((current) =>
      current.map((exercise, eIdx) => {
        if (eIdx !== exerciseIndex) {
          return exercise
        }

        return {
          ...exercise,
          sets: exercise.sets.map((setInput, sIdx) =>
            sIdx === setIndex ? { ...setInput, ...patch } : setInput,
          ),
        }
      }),
    )
  }

  const addSet = (exerciseIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) =>
        idx === exerciseIndex ? { ...exercise, sets: [...exercise.sets, createSet()] } : exercise,
      ),
    )
  }

  // Adiciona uma série já preenchida com os valores do último set
  // editado pelo usuário (reps + peso + RIR + RPE). Acelera tracking
  // de séries "iguais" — comum em volume work onde 4 séries são
  // idênticas e o usuário só altera se algo mudou.
  const addSetCopyingPrevious = (exerciseIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) return exercise
        const last = exercise.sets[exercise.sets.length - 1]
        if (!last) return { ...exercise, sets: [createSet()] }
        return {
          ...exercise,
          sets: [
            ...exercise.sets,
            createSet(last.reps, last.weightKg, last.rir, last.rpe),
          ],
        }
      }),
    )
  }

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) {
          return exercise
        }

        const next = exercise.sets.filter((_, sIdx) => sIdx !== setIndex)
        return { ...exercise, sets: next.length > 0 ? next : [createSet()] }
      }),
    )
  }

  const addDropEntry = (exerciseIndex: number, setIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, eIdx) => {
        if (eIdx !== exerciseIndex) return exercise
        return {
          ...exercise,
          sets: exercise.sets.map((s, sIdx) => {
            if (sIdx !== setIndex) return s
            return { ...s, dropSets: [...s.dropSets, { weightKg: '', reps: '' }] }
          }),
        }
      }),
    )
  }

  const removeDropEntry = (exerciseIndex: number, setIndex: number, dropIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, eIdx) => {
        if (eIdx !== exerciseIndex) return exercise
        return {
          ...exercise,
          sets: exercise.sets.map((s, sIdx) => {
            if (sIdx !== setIndex) return s
            const next = s.dropSets.filter((_, dIdx) => dIdx !== dropIndex)
            return { ...s, dropSets: next.length > 0 ? next : [{ weightKg: '', reps: '' }] }
          }),
        }
      }),
    )
  }

  const patchDropEntry = (
    exerciseIndex: number,
    setIndex: number,
    dropIndex: number,
    patch: Partial<DropEntry>,
  ) => {
    setActiveExercises((current) =>
      current.map((exercise, eIdx) => {
        if (eIdx !== exerciseIndex) return exercise
        return {
          ...exercise,
          sets: exercise.sets.map((s, sIdx) => {
            if (sIdx !== setIndex) return s
            return {
              ...s,
              dropSets: s.dropSets.map((d, dIdx) => (dIdx === dropIndex ? { ...d, ...patch } : d)),
            }
          }),
        }
      }),
    )
  }

  const handleSummaryImage = (file: File | null) => {
    setSummaryImageFile(file)

    if (summaryImagePreview) {
      URL.revokeObjectURL(summaryImagePreview)
      setSummaryImagePreview(null)
    }

    if (file) {
      setSummaryImagePreview(URL.createObjectURL(file))
    }
  }

  const applyManualTimerEdit = () => {
    const minutes = parsePositiveInt(manualTimerMinutes, 0)
    if (minutes <= 0) {
      return
    }

    setElapsedSec(minutes * 60)
    setManualTimerMinutes('')
  }

  const saveTraining = async () => {
    if (saving) {
      return
    }

    const cardioFallbackMin = Math.round(cardioEntries.reduce((s, c) => s + c.durationSec, 0) / 60)
    const fallbackMin = Math.max(1, Math.round(elapsedSec / 60), cardioFallbackMin)
    // Aceita formatos flexíveis ("1h05", "65", "1:30"). Cai no fallback
    // (derivado do cronômetro + cardio) se o texto não parsear.
    const durationMin = parseDurationMin(summaryDurationMin, fallbackMin)
    const durationSec = Math.max(60, durationMin * 60)

    const exercisesWithDisplayIndex = activeExercises.map((exercise, displayIndex) => ({
      exercise,
      displayIndex,
      interactionOrder: interactionOrderByExerciseRef.current[exercise.exerciseId] ?? Number.MAX_SAFE_INTEGER,
    }))

    const performedSets = exercisesWithDisplayIndex
      .sort((a, b) => {
        if (a.interactionOrder !== b.interactionOrder) {
          return a.interactionOrder - b.interactionOrder
        }

        return a.displayIndex - b.displayIndex
      })
      .flatMap(({ exercise }) => {
        const userNoteRaw = exercise.userNote.trim()
        // Tag user-written exercise notes so the feed/history can extract them
        // back out from the per-set notes column (keeps backend schema stable).
        const userNoteTag = userNoteRaw ? `[nota:${userNoteRaw.slice(0, 240)}]` : ''
        let userNoteApplied = false
        const applyUserNote = (existing: string | undefined): string | undefined => {
          if (!userNoteTag || userNoteApplied) return existing
          userNoteApplied = true
          const base = (existing ?? '').trim()
          return base ? `${userNoteTag} ${base}` : userNoteTag
        }
        return exercise.sets.reduce<
        Array<{
          exerciseId: string
          setNumber: number
          reps?: number
          durationSec?: number
          distanceMeters?: number
          weightKg?: number
          perceivedExertion?: number
          notes?: string
        }>
      >((acc, setInput, index) => {
        const setNumber = index + 1
        const lastSet = lastPerformanceByExercise[exercise.exerciseId]?.[setNumber]

        // Drop set: flatten each drop into its own history entry
        if (setInput.setType === 'drop') {
          const validDrops = setInput.dropSets.filter((d) => {
            const r = Number(d.reps)
            return Number.isFinite(r) && r > 0
          })
          if (validDrops.length === 0) return acc

          const rpeRaw = setInput.rpe.trim()
          const rpe = rpeRaw.length > 0 ? Number(rpeRaw) : NaN
          const sharedRpe = Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : undefined

          validDrops.forEach((drop, dropIdx) => {
            const r = Number(drop.reps)
            const w = Number(drop.weightKg.replace(',', '.'))
            acc.push({
              exerciseId: exercise.exerciseId,
              setNumber: setNumber * 100 + dropIdx + 1,
              reps: r,
              weightKg:
                !isEffectiveBodyweightExercise(exercise) && Number.isFinite(w) && w > 0
                  ? w
                  : undefined,
              perceivedExertion: sharedRpe,
              notes: applyUserNote(`[tipo:drop][drop:${dropIdx + 1}/${validDrops.length}]`),
            })
          })
          return acc
        }

        // Cluster set: store total reps (clusterReps × clusterCount)
        if (setInput.setType === 'cluster') {
          const cr = Number(setInput.clusterReps)
          const cc = Number(setInput.clusterCount)
          if (!Number.isFinite(cr) || cr <= 0 || !Number.isFinite(cc) || cc <= 0) return acc
          const totalReps = Math.round(cr * cc)
          const weightRaw = setInput.weightKg.trim().replace(',', '.')
          const weightKg = weightRaw.length > 0 ? Number(weightRaw) : NaN
          const rirRaw = setInput.rir.trim()
          const rir = rirRaw.length > 0 ? Number(rirRaw) : NaN
          const rpeRaw = setInput.rpe.trim()
          const rpe = rpeRaw.length > 0 ? Number(rpeRaw) : NaN
          const noteParts = [`[tipo:cluster][cr:${cr}][cc:${cc}]`]
          if (Number.isFinite(rir) && rir >= 0) noteParts.push(`RIR: ${Math.floor(rir)}`)
          acc.push({
            exerciseId: exercise.exerciseId,
            setNumber,
            reps: totalReps,
            weightKg:
              !isEffectiveBodyweightExercise(exercise) && Number.isFinite(weightKg) && weightKg > 0
                ? weightKg
                : undefined,
            perceivedExertion: Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : undefined,
            notes: applyUserNote(noteParts.join(' ')),
          })
          return acc
        }

        const repsRaw = setInput.reps.trim()
        const weightRaw = setInput.weightKg.trim().replace(',', '.')
        const rirRaw = setInput.rir.trim()
        const rpeRaw = setInput.rpe.trim()

        // Só persiste séries marcadas como concluídas (✓). Sets com
        // valores preenchidos mas sem o check NÃO viram histórico —
        // isso resolve o bug de "desmarquei mas continuou contando"
        // e fica coerente com o totalSeries (que conta só checked).
        // A safety-check do finalizar avisa antes se houver pendentes.
        if (!setInput.checked) {
          return acc
        }

        const trackingDefaultNum =
          exercise.trackingType === 'TIME'
            ? 30
            : exercise.trackingType === 'DISTANCE'
              ? 20
              : exercise.suggestedReps.trim().length > 0
                ? Number(exercise.suggestedReps)
                : NaN
        const lastValueNum =
          exercise.trackingType === 'TIME'
            ? lastSet?.durationSec
            : exercise.trackingType === 'DISTANCE'
              ? lastSet?.distanceMeters
              : lastSet?.reps
        const repsFallback = lastValueNum ?? trackingDefaultNum
        const valueRaw = repsRaw.length > 0 ? Number(repsRaw.replace(',', '.')) : repsFallback

        if (!Number.isFinite(valueRaw) || valueRaw <= 0) {
          return acc
        }

        const weightKg = weightRaw.length > 0 ? Number(weightRaw) : NaN
        const rir = rirRaw.length > 0 ? Number(rirRaw) : NaN
        const rpe = rpeRaw.length > 0 ? Number(rpeRaw) : NaN

        const typeTag =
          setInput.setType === 'warmup'
            ? '[tipo:aquecimento] '
            : setInput.setType === 'failure'
              ? '[tipo:falhada] '
              : ''

        const isTimeEx = exercise.trackingType === 'TIME'
        const isDistanceEx = exercise.trackingType === 'DISTANCE'

        acc.push({
          exerciseId: exercise.exerciseId,
          setNumber,
          reps: isTimeEx || isDistanceEx ? undefined : Math.floor(valueRaw),
          durationSec: isTimeEx ? Math.max(5, Math.floor(valueRaw)) : undefined,
          distanceMeters: isDistanceEx ? valueRaw : undefined,
          weightKg:
            !isEffectiveBodyweightExercise(exercise) && Number.isFinite(weightKg) && weightKg > 0
              ? weightKg
              : undefined,
          // RPE (0–10 effort) — stored in its own column; RIR stays in notes so
          // the back-end keeps its current schema and the feed/history still
          // surfaces it from `perceivedExertion`.
          perceivedExertion: Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : undefined,
          notes: applyUserNote(
            typeTag || (Number.isFinite(rir) && rir >= 0)
              ? `${typeTag}${Number.isFinite(rir) && rir >= 0 ? `RIR: ${Math.floor(rir)}` : ''}`.trim() || undefined
              : undefined,
          ),
        })

        return acc
      }, [])
      })

    try {
      setSaving(true)
      setError(null)

      const started = await startWorkoutSession(authorizedFetch, {
        workoutPlanId: originMode === 'ROUTINE' ? activePlanId : undefined,
      })

      const notesSegments: string[] = []
      if (summaryImageFile) {
        notesSegments.push(`[Imagem anexada localmente: ${summaryImageFile.name}]`)
      }

      await completeWorkoutSession(authorizedFetch, started.id, {
        durationSec,
        notes: notesSegments.join('\n\n') || undefined,
        exercises: performedSets.length > 0 ? performedSets : undefined,
        cardio: cardioEntries.length > 0 ? cardioEntries : undefined,
      })

      setSavedSessionId(started.id)
      // Save bem-sucedido — agora sim limpa o snapshot do treino ativo.
      // Daqui em diante a tela de SUMMARY trabalha com `savedSessionId`
      // pra qualquer ação subsequente (post, share, competition).
      clearActiveWorkout()

      // Fetch the active competition silently so the "Enviar para desafio"
      // button knows whether to render. We accept LOBBY too so we can show
      // a "waiting to start" hint instead of just hiding the card. Failure
      // is non-blocking but logged so we can debug if needed.
      try {
        const comp = await getMyActiveCompetition(authorizedFetch)
        if (comp && (comp.status === 'ACTIVE' || comp.status === 'LOBBY')) {
          setActiveCompetition(comp)
        }
      } catch (err) {
        console.warn('Failed to fetch active competition for summary CTA', err)
      }

      if (summaryImageFile) {
        try {
          await saveWorkoutSessionImage(started.id, summaryImageFile)
        } catch {
          // Keep workout save successful even if browser storage is unavailable.
        }
      }

      await reloadPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar treino')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRoutine = async (plan: WorkoutPlan) => {
    const confirmed = window.confirm(`Deseja excluir a rotina "${plan.name}"?`)
    if (!confirmed) {
      return
    }

    try {
      setError(null)
      await deleteWorkoutPlan(authorizedFetch, plan.id)
      await reloadPlans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir rotina')
    }
  }

  const handleShareRoutine = async (plan: WorkoutPlan) => {
    try {
      setError(null)
      const { token } = await sharePlan(authorizedFetch, plan.id)
      const link = `${window.location.origin}/shared/${token}`
      setShareLinkModal({ link, planName: plan.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar link de compartilhamento')
    }
  }

  const handleExportPDF = (plan: WorkoutPlan) => {
    const exerciseRows = plan.exercises
      .map((item, i) => {
        const name = item.customName ?? item.exercise.name
        const sets = item.sets ?? '—'
        const reps = item.repsMin && item.repsMax ? `${item.repsMin}–${item.repsMax}` : (item.repsMax ?? item.repsMin ?? '—')
        const rest = item.restSec ? `${item.restSec}s` : '—'
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${i + 1}. ${name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${sets}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${reps}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${rest}</td>
        </tr>`
      })
      .join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>${plan.name}</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{margin:0 0 4px}p{color:#666;margin:0 0 24px}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}</style>
    </head><body>
      <h1>${plan.name}</h1>
      <p>${plan.description ?? 'Rotina personalizada'}</p>
      <table>
        <thead><tr><th>Exercicio</th><th>Series</th><th>Reps</th><th>Descanso</th></tr></thead>
        <tbody>${exerciseRows}</tbody>
      </table>
      <p style="margin-top:32px;font-size:12px;color:#9ca3af">Gerado pelo SerraAthlo</p>
      <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</` + `script>
    </body></html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
  }

  const handleDuplicateRoutine = async (plan: WorkoutPlan) => {
    try {
      setError(null)

      const created = await createWorkoutPlan(authorizedFetch, {
        name: `${plan.name} (copia)`,
        description: plan.description ?? undefined,
        source: 'CUSTOM',
      })

      for (let index = 0; index < plan.exercises.length; index += 1) {
        const item = plan.exercises[index]

        await addExerciseToPlan(authorizedFetch, created.id, {
          exerciseId: item.exercise.id,
          insertAt: index + 1,
          sets: item.sets ?? undefined,
          repsMin: item.repsMin ?? undefined,
          repsMax: item.repsMax ?? undefined,
          durationSec: item.durationSec ?? undefined,
          restSec: item.restSec ?? undefined,
          notes: item.notes ?? undefined,
        })
      }

      await reloadPlans(created.id)
      window.alert('Rotina duplicada com sucesso.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao duplicar rotina')
    }
  }

  if (screen === 'SUMMARY') {
    // Helpers que precisam estar acessíveis em todo o screen.
    const startedTime = startedAt
      ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(startedAt)
      : null
    const endedTime = endedAt
      ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(endedAt)
      : null
    return (
      <section className="space-y-3">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">Resumo do treino</h1>
            <button
              type="button"
              onClick={backToActiveTraining}
              aria-label="Voltar"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <ArrowLeft size={16} />
            </button>
          </div>
        </motion.header>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <article className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          {/* Nome do treino — horários viram subtítulo discreto abaixo
              do input, eliminando a linha de chips que ocupava espaço
              próprio. Mantém a info visível sem demandar atenção. */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text)]" htmlFor="summary-name-input">
              Nome do treino
            </label>
            <input
              id="summary-name-input"
              value={summaryName}
              onChange={(event) => setSummaryName(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            {(startedTime || endedTime) && (
              <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                {startedTime && endedTime
                  ? `${startedTime} → ${endedTime}`
                  : startedTime
                    ? `Início ${startedTime}`
                    : `Fim ${endedTime}`}
              </p>
            )}
          </div>

          {/* Duração — abre o wheel picker (estilo iOS) em vez do input
              livre. Mais previsível, sem chance de erro de digitação. */}
          {(() => {
            const fallbackMin = Math.max(1, Math.round(elapsedSec / 60))
            const currentMin = parseDurationMin(summaryDurationMin, fallbackMin)
            const display = currentMin === 0
              ? '0min'
              : currentMin < 60
                ? `${currentMin}min`
                : `${Math.floor(currentMin / 60)}h ${currentMin % 60}min`
            return (
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Duração</p>
                <button
                  type="button"
                  onClick={() => setDurationPickerOpen(true)}
                  style={{ touchAction: 'manipulation' }}
                  className="mt-1 flex w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <span className="tabular-nums">{display}</span>
                  <span className="text-[11px] font-normal text-[var(--muted)]">Tocar pra alterar</span>
                </button>
              </div>
            )
          })()}

          {/* Cards de métricas — Volume + Séries sempre; PRs/Sets
              concluídos/vs último treino só se houver informação útil.
              Cards reduzidos (text-2xl + p-3.5) pra economizar tela. */}
          {(() => {
            const newPrs = Object.entries(prByExerciseId).reduce<{ name: string; load: number; previous: number | null }[]>((acc, [exId, currentPr]) => {
              if (currentPr == null) return acc
              const previous = prSnapshotAtStart[exId] ?? null
              if (previous == null || currentPr > previous) {
                const ex = activeExercises.find((e) => e.exerciseId === exId)
                if (ex) acc.push({ name: ex.exerciseName, load: currentPr, previous })
              }
              return acc
            }, [])

            const totalSetsAttempted = activeExercises.reduce((s, ex) => s + ex.sets.length, 0)
            const completedSetsCount = activeExercises.reduce((s, ex) => s + ex.sets.filter((set) => set.checked).length, 0)
            const completePct = totalSetsAttempted > 0 ? Math.round((completedSetsCount / totalSetsAttempted) * 100) : 0

            // "vs último treino" só faz sentido quando:
            //   • A rotina já tem ≥1 sessão anterior em outro dia (não
            //     o que acabamos de fazer) — evita comparar contra a
            //     versão de hoje mais cedo, que confunde.
            //   • A duração anterior é minimamente significativa (≥5 min)
            //     pra não comparar contra um treino abortado.
            const lastSession = originMode === 'ROUTINE' && activePlanId ? lastUseByPlanId[activePlanId] : null
            const lastDayKey = lastSession ? new Date(lastSession.endedAt).toISOString().slice(0, 10) : null
            const todayKey = new Date().toISOString().slice(0, 10)
            const isDifferentDay = lastDayKey != null && lastDayKey !== todayKey
            const lastDurationMin = lastSession?.durationSec ? Math.round(lastSession.durationSec / 60) : null
            const currentDurationMin = Math.max(1, Math.round(elapsedSec / 60))
            const canCompareDuration = isDifferentDay && lastDurationMin != null && lastDurationMin >= 5
            const durationDelta = canCompareDuration ? currentDurationMin - lastDurationMin! : null

            const hasSecondRow = newPrs.length > 0 || durationDelta != null || completePct < 100

            return (
              <>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="relative overflow-hidden rounded-2xl border border-[var(--brand)]/20 bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_12%,var(--surface))] to-[var(--surface)] p-3.5">
                    <div className="flex items-center gap-1.5 text-[var(--brand)]">
                      <Flame size={14} />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Volume</p>
                    </div>
                    <p className="mt-1.5 text-2xl font-black text-[var(--text)]">
                      {Math.round(totals.totalVolumeKg).toLocaleString('pt-BR')}{' '}
                      <span className="text-base font-semibold text-[var(--muted)]">kg</span>
                    </p>
                  </div>
                  <div className="relative overflow-hidden rounded-2xl border border-[var(--accent-blue)]/20 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent-blue)_10%,var(--surface))] to-[var(--surface)] p-3.5">
                    <div className="flex items-center gap-1.5 text-[var(--accent-blue)]">
                      <Layers size={14} />
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Séries</p>
                    </div>
                    <p className="mt-1.5 text-2xl font-black text-[var(--text)]">{totals.totalSeries}</p>
                  </div>
                </div>

                {hasSecondRow && (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {newPrs.length > 0 && (
                      <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-[var(--surface)] p-3.5">
                        <div className="flex items-center gap-1.5 text-amber-500">
                          <Sparkles size={14} />
                          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">PRs novos</p>
                        </div>
                        <p className="mt-1.5 text-2xl font-black text-[var(--text)]">{newPrs.length}</p>
                        <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--muted)]">
                          {newPrs.slice(0, 3).map((pr) => (
                            <li key={pr.name} className="truncate">
                              • {pr.name}: <b className="text-amber-600">{pr.load}kg</b>
                              {pr.previous != null ? <span className="text-[var(--muted)]"> (era {pr.previous}kg)</span> : null}
                            </li>
                          ))}
                          {newPrs.length > 3 && <li className="italic">+ {newPrs.length - 3} mais</li>}
                        </ul>
                      </div>
                    )}
                    {completePct < 100 && (
                      <div className="rounded-2xl border border-[var(--line)] p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Sets concluídos</p>
                        <p className="mt-1.5 text-2xl font-black text-[var(--text)]">
                          {completedSetsCount}<span className="text-base font-semibold text-[var(--muted)]">/{totalSetsAttempted}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">{completePct}% das séries marcadas</p>
                      </div>
                    )}
                    {durationDelta != null && (
                      <div className="rounded-2xl border border-[var(--line)] p-3.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">vs último treino</p>
                        <p className={`mt-1.5 text-2xl font-black tabular-nums ${
                          durationDelta < 0 ? 'text-emerald-500' : durationDelta > 0 ? 'text-[var(--text)]' : 'text-[var(--muted)]'
                        }`}>
                          {durationDelta > 0 ? '+' : ''}{durationDelta}<span className="text-base font-semibold text-[var(--muted)]"> min</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                          Anterior: {lastDurationMin}min · {relativeDaysFromNow(lastSession!.endedAt)}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          })()}

          {/* Foto — compacta quando vazia (botão pequeno), expande pra
              preview grande quando há imagem. Antes ocupava ~220px de
              altura mesmo sem foto (área tracejada gigante). */}
          <div>
            {summaryImagePreview ? (
              <label className="block cursor-pointer overflow-hidden rounded-2xl border border-[var(--line)]">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleSummaryImage(event.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <div className="relative">
                  <img
                    src={summaryImagePreview}
                    alt="Preview do treino"
                    className="mx-auto block w-full max-h-72 object-cover"
                    style={{ aspectRatio: '4 / 5' }}
                  />
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                    Trocar foto
                  </span>
                </div>
              </label>
            ) : (
              <label
                className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--line)] px-3 py-2.5 text-sm font-semibold text-[var(--muted)] transition-colors hover:border-[var(--brand)]/40 hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => handleSummaryImage(event.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <Plus size={14} />
                Adicionar foto <span className="text-[11px] font-normal text-[var(--muted)]">(opcional)</span>
              </label>
            )}
          </div>

          {!savedSessionId ? (
            // Pré-save: CTA primário grande + Descartar pequeno e fora
            // do alcance natural do polegar. Hierarquia explícita pra
            // o usuário não confundir "salvar" com "descartar".
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void saveTraining()}
                disabled={saving}
                style={{ touchAction: 'manipulation' }}
                className="w-full rounded-xl bg-[var(--brand)] py-3 text-[15px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar Treino'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const min = Math.max(1, Math.round(elapsedSec / 60))
                  setConfirmDialog({
                    title: 'Descartar treino?',
                    message: `Você vai perder ${min} minuto(s) de tracking + as séries marcadas até agora. Esta ação não pode ser desfeita.`,
                    confirmLabel: 'Descartar',
                    destructive: true,
                    onConfirm: () => {
                      clearActiveWorkout()
                      resetWorkflow()
                    },
                  })
                }}
                className="block w-full rounded-xl border border-[var(--line)] py-2 text-[12px] font-semibold text-[var(--muted)] transition-colors hover:border-rose-500/40 hover:text-rose-400"
              >
                Descartar treino
              </button>
            </div>
          ) : (
            // Pós-save: hierarquia em 3 níveis pra eliminar a confusão.
            // Nível 1: Confirmação grande "Treino salvo!" com troféu
            // Nível 2: Competição (apenas se houver, banner laranja)
            // Nível 3: Compartilhar imagem + Postar — em cards visuais
            //          paralelos, e "Concluir" sempre acessível.
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-[var(--surface)] p-4">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/20 text-emerald-500">
                    <Check size={18} strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-emerald-500">Treino salvo!</p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {Math.round(totals.totalVolumeKg).toLocaleString('pt-BR')} kg de volume · {totals.totalSeries} séries
                    </p>
                  </div>
                </div>
              </div>

              {/* Nível 2: Competição (banner laranja) — só se houver
                  competição ativa e treino válido. */}
              {activeCompetition && (() => {
                const didTraining = activeExercises.some((ex) => ex.sets.some((s) => s.checked))
                const didCardio = cardioEntries.length > 0
                return (
                  <SendToCompetitionCta
                    competition={activeCompetition}
                    hasPhoto={!!summaryImageFile}
                    savedSessionId={savedSessionId}
                    didTraining={didTraining}
                    didCardio={didCardio}
                    status={competitionSendStatus}
                    error={competitionSendError}
                    onSend={async (kinds) => {
                      if (!summaryImageFile || !savedSessionId) return
                      setCompetitionSendStatus('sending')
                      setCompetitionSendError(null)
                      try {
                        const dataUrl = await optimizeImageFileToDataUrl(summaryImageFile, {
                          maxEdge: 1200,
                          quality: 0.84,
                          maxOutputBytes: 1_400_000,
                        })
                        const hash = await sha256OfDataUrl(dataUrl)
                        const { photoUrl, photoPath } = await uploadCompetitionPhoto(authorizedFetch, dataUrl)
                        for (const kind of kinds) {
                          await postCompetitionEntry(authorizedFetch, activeCompetition.id, {
                            kind,
                            photoUrl,
                            photoPath,
                            photoHash: hash,
                            workoutSessionId: savedSessionId,
                          })
                        }
                        setCompetitionSendStatus('sent')
                      } catch (err) {
                        setCompetitionSendStatus('error')
                        setCompetitionSendError(err instanceof Error ? err.message : 'Falha ao enviar')
                      }
                    }}
                  />
                )
              })()}

              {/* Nível 3: ações sociais — Postar + Compartilhar lado a
                  lado em mobile (stack) e duas colunas no desktop. */}
              {!postDone ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[var(--line)] p-4">
                    <p className="text-sm font-semibold text-[var(--text)]">Postar este treino?</p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      Aparece no seu feed. Você pode controlar quem vê embaixo.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {allowedPrivacies.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPostPrivacy(p)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                            postPrivacy === p
                              ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]'
                              : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          {p === 'PUBLIC' ? 'Público' : p === 'FRIENDS' ? 'Amigos' : 'Privado'}
                        </button>
                      ))}
                    </div>
                    {isProfilePrivate ? (
                      <p className="mt-1.5 text-[10px] text-[var(--muted)]">
                        Sua conta está privada — posts públicos ficam disponíveis apenas como "Amigos" ou "Privado".
                      </p>
                    ) : null}
                    {/* Caption escondida atrás de "+" pra reduzir o
                        número de campos visíveis. Quem quer caption
                        clica; quem não quer, posta direto. */}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]">
                        + Adicionar legenda
                      </summary>
                      <textarea
                        value={postCaption}
                        onChange={(e) => setPostCaption(e.target.value)}
                        placeholder="O que você quer compartilhar?"
                        rows={2}
                        className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                      />
                    </details>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={posting}
                        onClick={async () => {
                          try {
                            setPosting(true)
                            let photoDataUrl: string | undefined
                            if (summaryImageFile) {
                              photoDataUrl = await optimizeImageFileToDataUrl(summaryImageFile, {
                                maxEdge: 1200,
                                quality: 0.82,
                                maxOutputBytes: 1_500_000,
                              })
                            }
                            await createPost(authorizedFetch, {
                              workoutSessionId: savedSessionId,
                              caption: postCaption.trim() || undefined,
                              photoUrl: photoDataUrl,
                              privacy: postPrivacy,
                            })
                            // Lembra a última privacy escolhida pra
                            // o próximo treino abrir já marcado nela.
                            try { window.localStorage.setItem('acad:last-post-privacy', postPrivacy) } catch { /* ignora */ }
                            setPostDone(true)
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Erro ao postar')
                          } finally {
                            setPosting(false)
                          }
                        }}
                        style={{ touchAction: 'manipulation' }}
                        className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] disabled:opacity-60"
                      >
                        {posting ? 'Postando…' : 'Postar treino'}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={loadingShare || !savedSessionId}
                    onClick={async () => {
                      if (!savedSessionId) return
                      try {
                        setLoadingShare(true)
                        setError(null)
                        if (summaryImageFile) {
                          try {
                            setSharePhoto(await optimizeImageFileToDataUrl(summaryImageFile, { maxEdge: 1600, quality: 0.88 }))
                          } catch { setSharePhoto(null) }
                        } else {
                          setSharePhoto(null)
                        }
                        const highlights = await getSessionHighlights(authorizedFetch, savedSessionId)
                        setShareHighlights(highlights)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Erro ao preparar imagem')
                      } finally {
                        setLoadingShare(false)
                      }
                    }}
                    style={{ touchAction: 'manipulation' }}
                    className="w-full rounded-xl border border-[var(--brand)]/40 bg-[var(--brand)]/5 py-2.5 text-sm font-bold text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10 disabled:opacity-60"
                  >
                    {loadingShare ? 'Preparando…' : 'Compartilhar imagem (Instagram, Stories…)'}
                  </button>

                  <button
                    type="button"
                    onClick={resetWorkflow}
                    className="block w-full rounded-xl py-2 text-[12px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
                  >
                    Pular e concluir
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
                  <p className="text-sm font-semibold text-emerald-500">Post publicado!</p>
                  <button
                    type="button"
                    onClick={resetWorkflow}
                    style={{ touchAction: 'manipulation' }}
                    className="mt-2 rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white"
                  >
                    Concluir
                  </button>
                </div>
              )}
            </div>
          )}
        </article>

        {shareHighlights && (
          <WorkoutShareEditor
            highlights={shareHighlights}
            initialPhoto={sharePhoto}
            onClose={() => setShareHighlights(null)}
          />
        )}
        {confirmDialog && (
          <ConfirmDialog
            open
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmLabel={confirmDialog.confirmLabel}
            destructive={confirmDialog.destructive}
            onConfirm={() => {
              const handler = confirmDialog.onConfirm
              setConfirmDialog(null)
              handler()
            }}
            onCancel={() => setConfirmDialog(null)}
          />
        )}
        {durationPickerOpen && (() => {
          const fallbackMin = Math.max(1, Math.round(elapsedSec / 60))
          const currentMin = parseDurationMin(summaryDurationMin, fallbackMin)
          return (
            <DurationPickerSheet
              open
              currentMin={currentMin}
              onConfirm={(min) => setSummaryDurationMin(String(min))}
              onClose={() => setDurationPickerOpen(false)}
            />
          )
        })()}
      </section>
    )
  }

  if (screen === 'RECOMMENDATIONS') {
    return (
      <section className="space-y-4">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">Recomendações</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Escolha uma estrutura e salve como novo treino.</p>
            </div>
            <button
              type="button"
              onClick={() => setScreen('DASHBOARD')}
              aria-label="Voltar"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <ArrowLeft size={16} />
            </button>
          </div>
        </motion.header>
        <WorkoutRecommendationsPage />
      </section>
    )
  }

  if (screen === 'NEW_ROUTINE') {
    return (
      <CreateRoutineScreen
        onCancel={() => setScreen('DASHBOARD')}
        onSaved={async (createdPlanId) => {
          await reloadPlans(createdPlanId)
          setScreen('DASHBOARD')
        }}
      />
    )
  }

  if (screen === 'EDIT') {
    return (
      <section className="space-y-3">
        {/* Header estilo Hevy — Cancelar / Editar Rotina / Atualizar.
            Atualizar dispara o save dentro do WorkoutsPage via signal. */}
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-safe-plus-2 z-30 flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 px-3 py-2.5 backdrop-blur-md"
        >
          <button
            type="button"
            onClick={() => setScreen('DASHBOARD')}
            className="text-[14px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          >
            Cancelar
          </button>
          <h1 className="truncate text-[15px] font-bold text-[var(--text)]">Editar Rotina</h1>
          <button
            type="button"
            onClick={() => setEditSaveSignal((v) => v + 1)}
            style={{ touchAction: 'manipulation' }}
            className="rounded-xl bg-[var(--brand)] px-4 py-1.5 text-[13px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
          >
            Atualizar
          </button>
        </motion.header>
        <WorkoutsPage
          selectedPlanId={activePlanId}
          onlySelectedPlan
          showCreateSection={false}
          createOnlyMode={false}
          hideInlineSaveButton
          saveSignal={editSaveSignal}
          onPlanSaved={async () => {
            await reloadPlans(activePlanId)
            setScreen('DASHBOARD')
          }}
        />
      </section>
    )
  }

  if (screen === 'ACTIVE') {
    const runningExercise = activeExercises.find((e) => e.restRunning)

    return (
      <section className="space-y-4">

        {/* PR celebration banner — fires when the user checks a set whose
            weight strictly beats their all-time max for that exercise.
            Rendered through the same portal pattern as the rest timer so
            it floats above the route's framer-motion transform context. */}
        <PrCelebrationBanner celebration={prCelebration} onDismiss={() => setPrCelebration(null)} />

        {/* Fixed bottom rest timer bar — rendered via portal to escape framer-motion transform context */}
        {runningExercise
          ? createPortal(
              (() => {
                const isLow = runningExercise.restRemainingSec <= 10
                const runningIndex = activeExercises.indexOf(runningExercise)
                return (
                  <motion.div
                    key="rest-running"
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className={`fixed bottom-20 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 overflow-hidden rounded-2xl border shadow-2xl px-4 py-3 bg-[var(--surface)] lg:bottom-3 ${
                      isLow ? 'border-red-500/40 animate-pulse' : 'border-green-500/40'
                    }`}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute left-0 top-0 h-1 transition-[width] duration-1000 ease-linear"
                      style={{
                        width: `${runningExercise.restDurationSec > 0
                          ? Math.max(0, Math.min(100, (runningExercise.restRemainingSec / runningExercise.restDurationSec) * 100))
                          : 0}%`,
                        background: isLow
                          ? 'linear-gradient(90deg, #ef4444, #f97316)'
                          : 'var(--tech-gradient)',
                      }}
                    />
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          Descansando
                        </p>
                        <p className="truncate text-sm font-semibold text-[var(--text)]">
                          {runningExercise.exerciseName}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => adjustRestTimer(runningIndex, -15)}
                        className="shrink-0 rounded-xl border border-[var(--line)] px-2.5 py-2 text-xs font-bold text-[var(--muted)] sm:px-3"
                      >
                        −15s
                      </button>
                      <p className={`shrink-0 text-3xl font-black tabular-nums sm:text-4xl ${
                        isLow ? 'text-red-400' : 'text-green-400'
                      }`}>
                        {formatClock(runningExercise.restRemainingSec)}
                      </p>
                      <button
                        type="button"
                        onClick={() => adjustRestTimer(runningIndex, 15)}
                        className="shrink-0 rounded-xl border border-[var(--line)] px-2.5 py-2 text-xs font-bold text-[var(--muted)] sm:px-3"
                      >
                        +15s
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleRestTimer(runningIndex)}
                        className="shrink-0 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)] sm:px-4"
                      >
                        Pular
                      </button>
                    </div>
                  </motion.div>
                )
              })(),
              document.body,
            )
          : restFinishedName
            ? createPortal(
                <motion.div
                  key="rest-finished"
                  initial={{ y: 100, opacity: 0, scale: 0.95 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                  className="fixed bottom-3 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 overflow-hidden rounded-2xl border border-green-500/40 bg-[var(--surface)] shadow-2xl px-4 py-3 pointer-events-none"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-30"
                    style={{ background: 'radial-gradient(circle at 50% 50%, rgba(16,185,129,0.45), transparent 70%)' }}
                  />
                  <div className="relative flex items-center justify-center gap-3">
                    <motion.span
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 15, delay: 0.05 }}
                      className="text-2xl text-green-400"
                    >
                      ✓
                    </motion.span>
                    <p className="text-base font-bold text-[var(--text)]">Descanso concluído</p>
                    <span className="text-sm text-[var(--muted)]">— {restFinishedName}</span>
                  </div>
                </motion.div>,
                document.body,
              )
            : null}

        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">Treino ativo: {activePlanName}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Cronômetro geral e descanso por exercício.</p>
            </div>
            <p className="text-3xl font-bold tabular-nums text-[var(--text)]">{formatClock(elapsedSec)}</p>
          </div>

          {/* Mini-summary — Volume + Séries + Progresso. Cronômetro
              já está no canto direito do header, não repete aqui.
              Progresso usa "exercícios com pelo menos uma série
              concluída" como sinal de avanço prático. */}
          {(() => {
            const totalExercises = activeExercises.length
            const completedExercises = activeExercises.filter(
              (ex) => ex.sets.some((s) => s.checked)
            ).length
            const progressPct = totalExercises > 0
              ? Math.round((completedExercises / totalExercises) * 100)
              : 0
            return (
              <div className="mt-4 border-t border-dashed border-[var(--line)] pt-3">
                <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Volume</p>
                    <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[var(--text)] sm:text-base">
                      {Math.round(totals.totalVolumeKg).toLocaleString('pt-BR')} <span className="font-mono text-[10px] text-[var(--muted)]">kg</span>
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Séries</p>
                    <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[var(--text)] sm:text-base">
                      {totals.totalSeries}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Progresso</p>
                    <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-[var(--text)] sm:text-base">
                      {completedExercises}<span className="font-mono text-[10px] text-[var(--muted)]">/{totalExercises}</span>
                    </p>
                  </div>
                </div>
                {totalExercises > 0 && (
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                    <div
                      className="h-full rounded-full bg-[var(--brand)] transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                      aria-label={`Progresso: ${progressPct}%`}
                    />
                  </div>
                )}
              </div>
            )
          })()}

          {/* Ações principais sempre visíveis: Voltar + Finalizar.
              Pausar/Retomar e Editar tempo (raros, fluxo de borda) ficam
              no menu "⋯" pra não competir visualmente com o CTA. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={backToDashboardFromActive}
              aria-label="Voltar"
              className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              onClick={finalizeWithSafetyCheck}
              className="flex-1 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] sm:flex-none"
            >
              Finalizar Treino
            </button>
            <div className="relative">
              <button
                type="button"
                aria-label="Mais opções do cronômetro"
                onClick={() => setAdvancedTimerOpen((v) => !v)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <MoreHorizontal size={16} />
              </button>
              {advancedTimerOpen && (
                <>
                  {/* Backdrop pra fechar clicando fora — sem portal pra
                      manter o popover ancorado relativamente ao botão. */}
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setAdvancedTimerOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-2xl">
                    <button
                      type="button"
                      onClick={() => { setIsWorkoutRunning((prev) => !prev); setAdvancedTimerOpen(false) }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
                    >
                      {isWorkoutRunning ? 'Pausar cronômetro' : 'Retomar cronômetro'}
                    </button>
                    <div className="mt-1 rounded-lg border border-[var(--line)] p-2">
                      <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted)]">
                        Ajustar tempo (min)
                      </label>
                      <div className="mt-1 flex gap-1.5">
                        <input
                          value={manualTimerMinutes}
                          onChange={(event) => setManualTimerMinutes(event.target.value.replace(/[^\d]/g, ''))}
                          placeholder="min"
                          className="w-full rounded-md border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => { applyManualTimerEdit(); setAdvancedTimerOpen(false) }}
                          className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[var(--brand-strong)]"
                        >
                          OK
                        </button>
                      </div>
                    </div>
                    {/* Toggle de intensidade — sou persistido em localStorage,
                        afeta quais campos (RIR/RPE) aparecem em cada set. */}
                    <div className="mt-1 rounded-lg border border-[var(--line)] p-2">
                      <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted)]">
                        Eu rastreio intensidade por
                      </label>
                      <div className="mt-1.5 flex gap-1">
                        {(['RIR', 'RPE', 'BOTH'] as IntensityMode[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              setIntensityModeState(m)
                              setIntensityMode(m)
                            }}
                            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                              intensityMode === m
                                ? 'bg-[var(--brand)] text-white'
                                : 'border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]'
                            }`}
                          >
                            {m === 'BOTH' ? 'Ambos' : m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Toggle de notificação de descanso. Quando 'default'
                        (não pediu ainda), mostra botão "Ativar" — o click é
                        gesto explícito do usuário (requirement iOS). Quando
                        'granted', mostra status verde. Quando 'denied', dá
                        instrução pra reativar nas config do browser. */}
                    <NotificationsRow
                      onClose={() => setAdvancedTimerOpen(false)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.header>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <article className="space-y-3">
          {activeExercises.length === 0 ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
              Nenhum exercício adicionado ainda.
            </p>
          ) : null}

          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleExerciseDragEnd}
          >
            <SortableContext
              items={activeExercises.map((ex) => ex.exerciseId)}
              strategy={verticalListSortingStrategy}
            >
          {activeExercises.map((exercise, exerciseIndex) => {
            const showLoadInput = !isEffectiveBodyweightExercise(exercise)
            const supersetColor = supersetColorFor(exercise.supersetGroup)

            return (
              <SortableExerciseCard
                key={exercise.exerciseId}
                id={exercise.exerciseId}
                supersetColor={supersetColor}
              >
              {supersetColor && exercise.supersetGroup && (
                <span
                  className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-md text-[10px] font-extrabold text-white"
                  style={{ backgroundColor: supersetColor }}
                  title={`Supersérie ${exercise.supersetGroup}`}
                  aria-label={`Supersérie ${exercise.supersetGroup}`}
                >
                  {exercise.supersetGroup}
                </span>
              )}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="h-20 w-20 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] sm:h-24 sm:w-24">
                    {exercise.thumbnailUrl ? (
                      <img
                        src={exercise.thumbnailUrl}
                        alt={`Imagem do exercício ${exercise.exerciseName}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Sem foto
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-extrabold text-[var(--text)]">{exercise.exerciseName}</h3>
                    <button
                      type="button"
                      disabled={!exercise.videoUrl}
                      onClick={() => {
                        if (exercise.videoUrl) {
                          window.open(exercise.videoUrl, '_blank', 'noopener,noreferrer')
                        }
                      }}
                      className="mt-1 rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {exercise.videoUrl ? 'Ver vídeo do exercício' : 'Vídeo em breve'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startRestEdit(exerciseIndex)}
                    className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    Descanso {formatClock(exercise.restDurationSec)}
                  </button>
                  {/* Kebab (3 pontinhos verticais) — abre o sheet de
                      ações do exercício. Posicionado à direita do
                      botão de descanso pra manter o ponto de toque
                      no canto superior direito do card, como o Hevy. */}
                  <button
                    type="button"
                    onClick={() => setContextMenuExerciseIndex(exerciseIndex)}
                    className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    aria-label={`Mais ações para ${exercise.exerciseName}`}
                  >
                    <MoreVertical size={14} />
                  </button>
                </div>
              </div>

              <label className="mt-3 block">
                <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Notas do exercício (opcional)
                </span>
                <textarea
                  value={exercise.userNote}
                  onChange={(event) => {
                    const value = event.target.value
                    setActiveExercises((current) =>
                      current.map((ex, idx) => (idx === exerciseIndex ? { ...ex, userNote: value } : ex)),
                    )
                  }}
                  rows={2}
                  maxLength={250}
                  placeholder="Ex: senti dor no ombro, focar na cadencia..."
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
                />
              </label>

              <div className="mt-3 space-y-2">
                {/* Column header — flex layout so the Anterior cell fills the
                    mobile row but caps at ~140px on desktop, with an invisible
                    spacer eating the leftover space so inputs stay clustered
                    on the right instead of drifting next to Anterior. */}
                {exercise.sets.length > 0 && (() => {
                  const isTimeOrDist = exercise.trackingType === 'TIME' || exercise.trackingType === 'DISTANCE'
                  return (
                    <div className="flex items-center gap-1 px-1 pb-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:gap-1.5">
                      <span className="w-8 shrink-0">Série</span>
                      <span className="min-w-0 flex-1 truncate sm:flex-none sm:basis-[140px]">Anterior</span>
                      <span aria-hidden className="hidden flex-1 sm:block" />
                      {showLoadInput && <span className="w-[52px] shrink-0 text-center sm:w-[64px]">kg</span>}
                      <span className="w-[52px] shrink-0 text-center sm:w-[64px]">reps</span>
                      {!isTimeOrDist && <span className="w-[44px] shrink-0 text-center sm:w-[48px]">rir</span>}
                      <span className="w-[44px] shrink-0 text-center sm:w-[48px]">rpe</span>
                      <span className="w-7 shrink-0 text-center">✓</span>
                    </div>
                  )
                })()}

                {exercise.sets.map((setInput, setIndex) => (
                  (() => {
                    const lastSet = lastPerformanceByExercise[exercise.exerciseId]?.[setIndex + 1]
                    const weightPlaceholder =
                      lastSet?.weightKg != null
                        ? `${lastSet.weightKg} kg`
                        : 'kg'
                    const isTime = exercise.trackingType === 'TIME'
                    const isDistance = exercise.trackingType === 'DISTANCE'
                    const repsLabel = isTime ? 'Tempo (s)' : isDistance ? 'Distância (m)' : 'Repeticoes'
                    const trackingDefault = isTime ? '30' : isDistance ? '20' : exercise.suggestedReps
                    const lastValueForPlaceholder = isTime
                      ? lastSet?.durationSec
                      : isDistance
                        ? lastSet?.distanceMeters
                        : lastSet?.reps
                    const repsPlaceholder =
                      lastValueForPlaceholder != null
                        ? String(lastValueForPlaceholder)
                        : trackingDefault || 'reps'
                    const rirPlaceholder =
                      lastSet?.rir != null
                        ? String(lastSet.rir)
                        : 'rir'
                    const rpePlaceholder =
                      lastSet?.rpe != null
                        ? String(lastSet.rpe)
                        : 'rpe'

                    // Previous-session label that goes in the Anterior column.
                    // Falls back to em-dash when there's no prior data.
                    const previousLabel = (() => {
                      if (!lastSet) return '—'
                      if (isTime && lastSet.durationSec != null) return `${lastSet.durationSec}s`
                      if (isDistance && lastSet.distanceMeters != null) return `${lastSet.distanceMeters}m`
                      const reps = lastSet.reps
                      const weight = lastSet.weightKg
                      if (weight != null && weight > 0 && reps != null) return `${weight}kg × ${reps}`
                      if (reps != null) return `${reps} reps`
                      return '—'
                    })()
                    const isComplex = setInput.setType === 'drop' || setInput.setType === 'cluster'
                    const allowedTypes: SetType[] | undefined = isTime || isDistance ? ['normal', 'warmup', 'failure'] : undefined

                    return (
                  <SwipeableSetRow
                    key={`${exercise.exerciseId}-${setIndex}`}
                    onDelete={() => removeSet(exerciseIndex, setIndex)}
                  >
                  <div
                    className={`rounded-xl border transition-colors ${
                      setInput.checked
                        ? 'border-green-500/50 bg-green-500/5'
                        : 'border-[var(--line)]'
                    } ${isComplex ? 'space-y-2 p-3' : 'px-2 py-1.5 pr-7 sm:pr-9'}`}
                  >
                    {!isComplex ? (
                      /* COMPACT ROW (normal/warmup/failure):
                         [Badge] [Anterior] [spacer] [KG] [Reps] [RIR] [RPE] [✓]
                         Flex layout — Anterior fills the row on mobile but
                         caps at 140px on desktop. The hidden spacer (flex-1
                         on sm+) eats the leftover width so the input cluster
                         stays glued to the right edge instead of leaving an
                         awkward gap next to Anterior. */
                      (() => {
                        const isTimeOrDist = isTime || isDistance
                        return (
                          <div className="flex items-center gap-1 sm:gap-1.5">
                            <SetTypeBadge
                              index={setIndex}
                              setType={setInput.setType}
                              checked={setInput.checked}
                              onClick={() => setOpenTypePicker({ exerciseIndex, setIndex })}
                            />
                            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--muted)] sm:flex-none sm:basis-[140px]">
                              {previousLabel}
                            </span>
                            <span aria-hidden className="hidden flex-1 sm:block" />
                            {showLoadInput && (
                              <input
                                value={setInput.weightKg}
                                placeholder={weightPlaceholder}
                                inputMode="decimal"
                                aria-label="Peso em kg"
                                onChange={(event) =>
                                  patchSet(exerciseIndex, setIndex, {
                                    weightKg: sanitizeDecimalInput(event.target.value),
                                  })
                                }
                                className="w-[52px] shrink-0 rounded-md border border-[var(--line)] bg-transparent px-1 py-1 text-center text-[12.5px] font-semibold tabular-nums sm:w-[64px]"
                              />
                            )}
                            <input
                              value={setInput.reps}
                              placeholder={repsPlaceholder}
                              inputMode={isDistance ? 'decimal' : 'numeric'}
                              aria-label={repsLabel}
                              onChange={(event) =>
                                patchSet(exerciseIndex, setIndex, {
                                  reps: event.target.value.replace(isDistance ? /[^\d.]/g : /[^\d]/g, ''),
                                })
                              }
                              className="w-[52px] shrink-0 rounded-md border border-[var(--line)] bg-transparent px-1 py-1 text-center text-[12.5px] font-semibold tabular-nums sm:w-[64px]"
                            />
                            {!isTimeOrDist && showRir && (
                              <input
                                value={setInput.rir}
                                placeholder={rirPlaceholder}
                                inputMode="numeric"
                                aria-label="RIR"
                                onChange={(event) =>
                                  patchSet(exerciseIndex, setIndex, {
                                    rir: event.target.value.replace(/[^\d]/g, ''),
                                  })
                                }
                                className="w-[44px] shrink-0 rounded-md border border-[var(--line)] bg-transparent px-0.5 py-1 text-center text-[12px] font-semibold tabular-nums sm:w-[48px]"
                              />
                            )}
                            {showRpe && (
                              <input
                                value={setInput.rpe}
                                placeholder={rpePlaceholder}
                                inputMode="numeric"
                                maxLength={2}
                                aria-label="RPE"
                                onChange={(event) =>
                                  patchSet(exerciseIndex, setIndex, {
                                    rpe: event.target.value.replace(/[^\d]/g, '').slice(0, 2),
                                  })
                                }
                                className="w-[44px] shrink-0 rounded-md border border-[var(--line)] bg-transparent px-0.5 py-1 text-center text-[12px] font-semibold tabular-nums sm:w-[48px]"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => completeSet(exerciseIndex, setIndex)}
                              title={setInput.checked ? 'Clique para desmarcar' : 'Concluir série'}
                              aria-label={setInput.checked ? 'Desmarcar série' : 'Concluir série'}
                              className={`h-7 w-7 shrink-0 rounded-md border-2 flex items-center justify-center text-[12.5px] font-bold transition-colors ${
                                setInput.checked
                                  ? 'border-green-500 bg-green-500 text-white'
                                  : 'border-[var(--line)] bg-transparent text-[var(--muted)] hover:border-green-500/60 hover:text-green-400'
                              }`}
                            >
                              ✓
                            </button>
                          </div>
                        )
                      })()
                    ) : (
                      /* COMPLEX ROW (drop/cluster) — slim header with badge,
                         label, check button — then the detailed inputs below
                         (kept as-is from the previous design). */
                      <div className="flex flex-wrap items-center gap-2">
                        <SetTypeBadge
                          index={setIndex}
                          setType={setInput.setType}
                          checked={setInput.checked}
                          onClick={() => setOpenTypePicker({ exerciseIndex, setIndex })}
                        />
                        <span className="text-xs font-bold text-[var(--muted)]">
                          Série {setIndex + 1} · {SET_TYPE_GLYPH[setInput.setType].label}
                        </span>
                        <button
                          type="button"
                          onClick={() => completeSet(exerciseIndex, setIndex)}
                          aria-label={setInput.checked ? 'Desmarcar série' : 'Concluir série'}
                          className={`ml-auto h-7 w-7 shrink-0 rounded-md border-2 flex items-center justify-center text-[13px] font-bold transition-colors ${
                            setInput.checked
                              ? 'border-green-500 bg-green-500 text-white'
                              : 'border-[var(--line)] bg-transparent text-[var(--muted)] hover:border-green-500/60 hover:text-green-400'
                          }`}
                        >
                          ✓
                        </button>
                      </div>
                    )}

                    {/* Picker bottom sheet for THIS specific set — only mounted
                        when this is the open one to avoid a portal per set. */}
                    {openTypePicker?.exerciseIndex === exerciseIndex && openTypePicker?.setIndex === setIndex && (
                      <SetTypePickerSheet
                        open
                        current={setInput.setType}
                        allowedTypes={allowedTypes}
                        onSelect={(val) => patchSet(exerciseIndex, setIndex, { setType: val })}
                        onRemove={() => removeSet(exerciseIndex, setIndex)}
                        onClose={() => setOpenTypePicker(null)}
                      />
                    )}

                    {setInput.setType === 'drop' ? (
                      /* Drop set inputs */
                      <div className="space-y-2 pl-1">
                        {setInput.dropSets.map((drop, dropIdx) => (
                          <div
                            key={dropIdx}
                            className={`grid gap-2 ${showLoadInput ? 'grid-cols-[auto_1fr_1fr_auto]' : 'grid-cols-[auto_1fr_auto]'}`}
                          >
                            <span className="self-center whitespace-nowrap text-[11px] font-semibold text-[var(--muted)]">
                              Drop {dropIdx + 1}
                            </span>
                            {showLoadInput ? (
                              <label className="text-[11px] uppercase text-[var(--muted)]">
                                Peso (kg)
                                <input
                                  value={drop.weightKg}
                                  placeholder={dropIdx === 0 ? weightPlaceholder : 'kg'}
                                  inputMode="decimal"
                                  onChange={(e) =>
                                    patchDropEntry(exerciseIndex, setIndex, dropIdx, {
                                      weightKg: sanitizeDecimalInput(e.target.value),
                                    })
                                  }
                                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                                />
                              </label>
                            ) : null}
                            <label className="text-[11px] uppercase text-[var(--muted)]">
                              Reps
                              <input
                                value={drop.reps}
                                placeholder={dropIdx === 0 ? repsPlaceholder : 'reps'}
                                onChange={(e) =>
                                  patchDropEntry(exerciseIndex, setIndex, dropIdx, {
                                    reps: e.target.value.replace(/[^\d]/g, ''),
                                  })
                                }
                                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => removeDropEntry(exerciseIndex, setIndex, dropIdx)}
                              disabled={setInput.dropSets.length <= 1}
                              className="self-end rounded-lg border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-300 disabled:opacity-40"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addDropEntry(exerciseIndex, setIndex)}
                          className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                        >
                          + Adicionar Drop
                        </button>
                      </div>
                    ) : setInput.setType === 'cluster' ? (
                      /* Cluster set inputs — peso, reps/cluster, n.º clusters, RIR, RPE */
                      <div className={`grid gap-2 ${showLoadInput ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
                        {showLoadInput ? (
                          <label className="text-[11px] uppercase text-[var(--muted)]">
                            Peso (kg)
                            <input
                              value={setInput.weightKg}
                              placeholder={weightPlaceholder}
                              inputMode="decimal"
                              onChange={(event) =>
                                patchSet(exerciseIndex, setIndex, {
                                  weightKg: sanitizeDecimalInput(event.target.value),
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                            />
                          </label>
                        ) : null}
                        <label className="text-[11px] uppercase text-[var(--muted)]">
                          Reps/Cluster
                          <input
                            value={setInput.clusterReps}
                            placeholder="3"
                            onChange={(event) =>
                              patchSet(exerciseIndex, setIndex, {
                                clusterReps: event.target.value.replace(/[^\d]/g, ''),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                          />
                        </label>
                        <label className="text-[11px] uppercase text-[var(--muted)]">
                          Nº Clusters
                          <input
                            value={setInput.clusterCount}
                            placeholder="4"
                            onChange={(event) =>
                              patchSet(exerciseIndex, setIndex, {
                                clusterCount: event.target.value.replace(/[^\d]/g, ''),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                          />
                        </label>
                        {showRir && (
                          <label className="text-[11px] uppercase text-[var(--muted)]">
                            RIR
                            <input
                              value={setInput.rir}
                              placeholder={rirPlaceholder}
                              onChange={(event) =>
                                patchSet(exerciseIndex, setIndex, {
                                  rir: event.target.value.replace(/[^\d]/g, ''),
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                            />
                          </label>
                        )}
                        {showRpe && (
                          <label className="text-[11px] uppercase text-[var(--muted)]">
                            RPE
                            <input
                              value={setInput.rpe}
                              placeholder={rpePlaceholder}
                              inputMode="numeric"
                              maxLength={2}
                              onChange={(event) =>
                                patchSet(exerciseIndex, setIndex, {
                                  rpe: event.target.value.replace(/[^\d]/g, '').slice(0, 2),
                                })
                              }
                              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                            />
                          </label>
                        )}
                      </div>
                    ) : null /* normal/warmup/failure is rendered by the compact
                              row above; RIR/RPE moved to the per-exercise expander. */}

                  </div>
                  </SwipeableSetRow>
                    )
                  })()
                ))}

                <div className="mt-1 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => addSet(exerciseIndex)}
                    className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    + Adicionar série
                  </button>
                  {/* Atalho pra repetir os valores do último set —
                      útil em volume work onde várias séries são iguais.
                      Só aparece se a série anterior tem ALGUM dado
                      preenchido (não vale a pena clonar tudo vazio). */}
                  {(() => {
                    const lastSet = exercise.sets[exercise.sets.length - 1]
                    const hasData = lastSet && (
                      lastSet.reps.trim() !== '' ||
                      lastSet.weightKg.trim() !== '' ||
                      lastSet.rir.trim() !== '' ||
                      lastSet.rpe.trim() !== ''
                    )
                    if (!hasData) return null
                    return (
                      <button
                        type="button"
                        onClick={() => addSetCopyingPrevious(exerciseIndex)}
                        className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                        title="Adiciona série com os mesmos valores da anterior"
                      >
                        ↳ Repetir anterior
                      </button>
                    )
                  })()}
                </div>
              </div>
              </SortableExerciseCard>
            )
          })}
            </SortableContext>
          </DndContext>

          {/* Botão grande "Adicionar Exercício" no rodapé da lista —
              substitui o card antigo com input + Explorar pra ficar no
              padrão Hevy: tap único abre o modal full-screen com busca
              live + Recentes + opção de criar exercício custom. */}
          <button
            type="button"
            onClick={() => setAddExerciseOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] py-3 text-[14px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
          >
            <Plus size={16} />
            Adicionar Exercício
          </button>
        </article>

        {/* Sheets globais — só um deles abre por vez. Lendo o
            exercício do índice em vez de passar tudo via prop evita
            stale closures se o estado dos exercícios mudar enquanto
            o sheet está aberto. */}
        {editingRestExerciseIndex != null && activeExercises[editingRestExerciseIndex] && (
          <RestTimePickerSheet
            key={`rest-${editingRestExerciseIndex}`}
            open
            currentSec={activeExercises[editingRestExerciseIndex].restDurationSec}
            onConfirm={(sec) => void applyRestEdit(editingRestExerciseIndex, sec)}
            onClose={() => setEditingRestExerciseIndex(null)}
          />
        )}
        {contextMenuExerciseIndex != null && activeExercises[contextMenuExerciseIndex] && (
          <ExerciseContextMenuSheet
            open
            exerciseName={activeExercises[contextMenuExerciseIndex].exerciseName}
            isInSuperset={Boolean(activeExercises[contextMenuExerciseIndex].supersetGroup)}
            onReorder={() => setReorderSheetOpen(true)}
            onSubstitute={() => {
              // Abre o modal específico de substituição (Sugeridos +
              // Recentes). O fluxo via openExerciseExplorer continua
              // disponível pelo botão "Criar" do modal pra quando o
              // catálogo padrão não cobre o que o usuário precisa.
              setSubstituteSourceIndex(contextMenuExerciseIndex)
            }}
            onAddToSuperset={() => {
              // Se o exercício já está em uma supersérie, o usuário
              // provavelmente quer SAIR dela em vez de entrar em outra.
              // Trata como toggle.
              const current = activeExercises[contextMenuExerciseIndex]
              if (current?.supersetGroup) {
                removeFromSuperset(contextMenuExerciseIndex)
              } else {
                setSupersetPickerSourceIndex(contextMenuExerciseIndex)
              }
            }}
            onRemove={() => handleRemoveExercise(contextMenuExerciseIndex)}
            onClose={() => setContextMenuExerciseIndex(null)}
          />
        )}
        {reorderSheetOpen && (
          <ReorderExercisesSheet
            open
            items={activeExercises.map((ex): ReorderItem => ({
              id: ex.exerciseId,
              name: ex.exerciseName,
              thumbnailUrl: ex.thumbnailUrl,
            }))}
            onReorder={(next) => {
              // Reconstrói o array de ActiveExercise na nova ordem
              // resolvendo cada id de volta pro objeto original — assim
              // preserva séries, descansos, supersets, etc. Se algum id
              // não existir mais (paranoia), filtramos pra não quebrar.
              const byId = new Map(activeExercises.map((ex) => [ex.exerciseId, ex]))
              const reordered = next
                .map((item) => byId.get(item.id))
                .filter((ex): ex is typeof activeExercises[number] => Boolean(ex))
              setActiveExercises(reordered)
            }}
            onClose={() => setReorderSheetOpen(false)}
          />
        )}
        {substituteSourceIndex != null && activeExercises[substituteSourceIndex] && (
          <SubstituteExerciseModal
            key={`sub-${substituteSourceIndex}`}
            open
            source={{
              id: activeExercises[substituteSourceIndex].exerciseId,
              name: activeExercises[substituteSourceIndex].exerciseName,
            }}
            onPick={(option) => applySubstitution(substituteSourceIndex, option)}
            onCreateRequest={() => {
              // Fecha o substitute, lembra qual exercício queremos
              // trocar, abre o create. Quando o create resolver, o
              // onCreated abaixo substitui automaticamente.
              setCreateExerciseForSubstituteIndex(substituteSourceIndex)
              setSubstituteSourceIndex(null)
              setCreateExerciseOpen(true)
            }}
            onClose={() => setSubstituteSourceIndex(null)}
          />
        )}
        {addExerciseOpen && (
          <AddExerciseModal
            open
            currentExerciseIds={activeExercises.map((ex) => ex.exerciseId)}
            onPickBatch={(options) => {
              // Filtra duplicatas antes de chamar pra agregar o aviso
              // em um único diálogo (evita N popups).
              const presentIds = new Set(activeExercises.map((ex) => ex.exerciseId))
              const skipped = options.filter((opt) => presentIds.has(opt.id))
              const toAdd = options.filter((opt) => !presentIds.has(opt.id))
              for (const option of toAdd) addExerciseToActiveWorkout(option)
              if (skipped.length > 0) {
                setInfoDialog({
                  title: skipped.length === 1 ? 'Exercício já no treino' : 'Exercícios já no treino',
                  message:
                    skipped.length === 1
                      ? `${skipped[0].name} já faz parte deste treino e não foi adicionado novamente.`
                      : `${skipped.length} exercícios já faziam parte deste treino e não foram adicionados novamente:\n\n${skipped.map((s) => `• ${s.name}`).join('\n')}`,
                })
              }
            }}
            onCreateRequest={() => {
              setAddExerciseOpen(false)
              setCreateExerciseForAdd(true)
              setCreateExerciseOpen(true)
            }}
            onClose={() => setAddExerciseOpen(false)}
          />
        )}
        {createExerciseOpen && (
          <CreateExerciseModal
            open
            onCreated={(newExercise) => {
              // Adiciona o novo exercício no cache de recentes pra ele
              // aparecer na próxima abertura de qualquer picker.
              pushRecentExerciseId(newExercise.id)
              if (createExerciseForSubstituteIndex != null) {
                applySubstitution(createExerciseForSubstituteIndex, newExercise)
              } else if (createExerciseForAdd) {
                addExerciseToActiveWorkout(newExercise)
              }
              setCreateExerciseForSubstituteIndex(null)
              setCreateExerciseForAdd(false)
            }}
            onClose={() => {
              setCreateExerciseOpen(false)
              setCreateExerciseForSubstituteIndex(null)
              setCreateExerciseForAdd(false)
            }}
          />
        )}
        {supersetPickerSourceIndex != null && activeExercises[supersetPickerSourceIndex] && (
          <SupersetPickerSheet
            key={`superset-${supersetPickerSourceIndex}`}
            open
            sourceExerciseName={activeExercises[supersetPickerSourceIndex].exerciseName}
            candidates={activeExercises
              .map((exercise, index) => ({ index, exercise }))
              .filter(({ index }) => index !== supersetPickerSourceIndex)}
            onPick={(targetIndex) => pairAsSuperset(supersetPickerSourceIndex, targetIndex)}
            onClose={() => setSupersetPickerSourceIndex(null)}
          />
        )}

        <CardioSection
          entries={cardioEntries}
          onAdd={(entry) => setCardioEntries((current) => [...current, entry])}
          onRemove={(index) => setCardioEntries((current) => current.filter((_, i) => i !== index))}
        />

        {infoDialog && (
          <InfoDialog
            open
            title={infoDialog.title}
            message={infoDialog.message}
            onClose={() => setInfoDialog(null)}
          />
        )}
        {confirmDialog && (
          <ConfirmDialog
            open
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmLabel={confirmDialog.confirmLabel}
            destructive={confirmDialog.destructive}
            onConfirm={() => {
              const handler = confirmDialog.onConfirm
              setConfirmDialog(null)
              handler()
            }}
            onCancel={() => setConfirmDialog(null)}
          />
        )}
      </section>
    )
  }

  const filteredPlans = plans.filter((plan) => {
    if (routineFilter === 'ALL') return true
    const isAi = isAiSourcedPlan(plan)
    return routineFilter === 'AI' ? isAi : !isAi
  })

  return (
    <section className="space-y-6">
      {/* ───── HEADER ─────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6"
      >
        <div className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-strong)] sm:text-[10.5px] sm:tracking-[0.22em]">
          <span className="relative inline-flex h-[7px] w-[7px]">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand)] opacity-60" />
            <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-[var(--brand)]" />
          </span>
          Treino · monte ou escolha
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            Treinar <span className="font-serif-accent text-[var(--brand-strong)]">agora</span>
          </h1>
          {/* Streak — só aparece com 2+ dias pra evitar "1 dia" que é
              ruidoso e não motiva (todo mundo está em 1 dia quando
              treinou hoje). Ícone de chama + número grande na laranja. */}
          {streakDays >= 2 && (
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-orange-500"
              title={`${streakDays} dias consecutivos com treino`}
            >
              <Flame size={14} fill="currentColor" />
              <span className="text-[13px] font-extrabold tabular-nums">{streakDays}</span>
              <span className="text-[11px] font-semibold">{streakDays === 1 ? 'dia' : 'dias'}</span>
            </div>
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-[var(--muted)] sm:text-sm">
          Inicie rápido, escolha uma rotina ou monte seu treino na hora.
        </p>
      </motion.header>

      {/* ───── SMART CTA ──────────────────────────────────────────────
          Card primário inteligente — decide entre Retomar, Iniciar
          última rotina, ou Iniciar Vazio. O caminho dominante deveria
          ser "continuar minha rotina" e não "começar do zero", então
          esse CTA respeita o histórico do usuário em vez de empurrar
          "Vazio" pra todo mundo. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        {(() => {
          const hasOngoingWorkout = hydrated && activeExercises.length > 0
          const lastPlan =
            !hasOngoingWorkout && mostRecentSession
              ? plans.find((p) => p.id === mostRecentSession.planId)
              : null
          const ctaPrimary = hasOngoingWorkout
            ? { label: 'Retomar Treino', sub: activePlanName, onClick: () => setScreen('ACTIVE') }
            : lastPlan
              ? { label: `Iniciar ${lastPlan.name}`, sub: `Último treino ${relativeDaysFromNow(mostRecentSession!.endedAt)}`, onClick: () => beginRoutineTraining(lastPlan) }
              : { label: 'Iniciar Treino Vazio', sub: 'Monte os exercícios na hora', onClick: beginEmptyTraining }
          return (
            <button
              type="button"
              onClick={ctaPrimary.onClick}
              className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-[var(--brand-strong)] bg-gradient-to-br from-[#ff7a5a] to-[var(--brand)] p-5 text-left text-white shadow-[0_14px_26px_-16px_rgba(255,90,60,0.55)] transition-transform hover:translate-y-[-2px]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)' }}
              />
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/25 bg-white/15">
                <Play size={20} fill="currentColor" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[16px] font-semibold tracking-tight sm:text-[18px]">
                  {ctaPrimary.label}
                </strong>
                <span className="block truncate text-[12px] text-white/80 sm:text-[13px]">
                  {ctaPrimary.sub}
                </span>
              </span>
            </button>
          )
        })()}

        {/* Ações secundárias — chips menores que não competem com o CTA.
            "Iniciar Vazio" só aparece como chip quando o CTA não é
            o vazio (pra continuar sendo acessível em 1 tap). */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {(hydrated && activeExercises.length > 0) || mostRecentSession ? (
            <button
              type="button"
              onClick={beginEmptyTraining}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <Play size={12} />
              Treino vazio
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setScreen('RECOMMENDATIONS')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <Sparkles size={12} />
            Recomendações
          </button>
          <button
            type="button"
            onClick={() => setScreen('NEW_ROUTINE')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <Plus size={12} />
            Nova rotina
          </button>
        </div>
      </motion.div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {/* ───── MINHAS ROTINAS ─────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-2 font-mono text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Minhas Rotinas
            <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--muted)]">
              {plans.length}
            </span>
          </h2>
          {/* Smart-hide: o filtro só vale a pena com 4+ rotinas. Abaixo
              disso polui e ninguém usa. Labels renomeadas: "Sugeridas"
              (IA) e "Personalizadas" (CUSTOM) são mais claras que
              siglas técnicas. */}
          {plans.length >= 4 ? (
            <div className="flex gap-1">
              {([
                { id: 'ALL', label: 'Todas' },
                { id: 'AI', label: 'Sugeridas' },
                { id: 'CUSTOM', label: 'Personalizadas' },
              ] as Array<{ id: RoutineFilter; label: string }>).map((f) => {
                const active = routineFilter === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRoutineFilter(f.id)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)]'
                        : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        {loadingPlans ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : null}

        {!loadingPlans && plans.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <Dumbbell size={36} className="mx-auto mb-3 text-[var(--brand)]" strokeWidth={1.5} />
            <p className="text-base font-bold text-[var(--text)]">Comece criando sua primeira rotina</p>
            <p className="mx-auto mt-1.5 max-w-xs text-[12px] text-[var(--muted)]">
              Uma rotina agrupa exercícios e séries pra você repetir sem montar tudo do zero toda vez.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setScreen('NEW_ROUTINE')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
              >
                <Plus size={14} />
                Criar minha primeira rotina
              </button>
              <button
                type="button"
                onClick={() => setScreen('RECOMMENDATIONS')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-[13px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <Sparkles size={14} />
                Ver sugestões
              </button>
            </div>
          </div>
        ) : null}

        {!loadingPlans && plans.length > 0 && filteredPlans.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-[var(--muted)]">
            Nenhuma rotina neste filtro.
          </p>
        ) : null}

        <div className="grid gap-2.5 sm:grid-cols-2">
          {filteredPlans.map((plan) => {
            const exerciseCount = plan.exercises.length
            const estMin = estimatePlanMinutes(plan)
            const isAi = isAiSourcedPlan(plan)
            const lastUse = lastUseByPlanId[plan.id]
            return (
              <article
                key={plan.id}
                className="group relative cursor-default overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--brand)]/40 hover:shadow-[0_14px_26px_-22px_rgba(255,90,60,0.35)]"
              >
                {/* Left edge accent — only paints on hover */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-0 w-[3px] opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: 'linear-gradient(180deg, var(--brand), #ff8c6b)' }}
                />

                {/* Title row: name + IA chip + overflow menu */}
                <div className="mb-2.5 flex items-start justify-between gap-2">
                  <h3 className="flex flex-wrap items-center gap-2 pr-7 text-[15px] font-semibold tracking-tight text-[var(--text)]">
                    {plan.name}
                    {isAi && (
                      <span className="rounded-full border border-[var(--line)] px-1.5 py-[1px] font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                        IA
                      </span>
                    )}
                  </h3>

                  <div data-routine-menu className="absolute right-2.5 top-2.5">
                    <button
                      type="button"
                      aria-label={`Mais opções da rotina ${plan.name}`}
                      aria-expanded={openRoutineMenuId === plan.id}
                      onClick={(event) => {
                        if (openRoutineMenuId === plan.id) {
                          setOpenRoutineMenuId(null)
                          setRoutineMenuAnchor(null)
                          return
                        }
                        const rect = event.currentTarget.getBoundingClientRect()
                        setRoutineMenuAnchor({
                          top: rect.bottom + 4,
                          right: window.innerWidth - rect.right,
                        })
                        setOpenRoutineMenuId(plan.id)
                      }}
                      className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                    >
                      <MoreHorizontal size={14} />
                    </button>

                    {openRoutineMenuId === plan.id && routineMenuAnchor
                      ? createPortal(
                          <div
                            data-routine-menu
                            style={{
                              position: 'fixed',
                              top: routineMenuAnchor.top,
                              right: routineMenuAnchor.right,
                              zIndex: 9999,
                            }}
                            className="min-w-48 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 shadow-2xl"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenRoutineMenuId(null)
                                setRoutineMenuAnchor(null)
                                void handleDeleteRoutine(plan)
                              }}
                              className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-400 hover:bg-[var(--surface-hover)]"
                            >
                              Deletar rotina
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenRoutineMenuId(null)
                                setRoutineMenuAnchor(null)
                                void handleShareRoutine(plan)
                              }}
                              className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                            >
                              Compartilhar rotina
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenRoutineMenuId(null)
                                setRoutineMenuAnchor(null)
                                void handleDuplicateRoutine(plan)
                              }}
                              className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                            >
                              Duplicar rotina
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenRoutineMenuId(null)
                                setRoutineMenuAnchor(null)
                                handleExportPDF(plan)
                              }}
                              className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                            >
                              Salvar como PDF
                            </button>
                          </div>,
                          document.body,
                        )
                      : null}
                  </div>
                </div>

                {/* Stats: exercícios + min estimados. Data de criação
                    saiu — quase ninguém liga, e quando importa, é a
                    última EXECUÇÃO que dá contexto ("não treino isso
                    há um tempo"). */}
                <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--muted)]">
                  <span>
                    <b className="font-semibold text-[var(--text)]">{exerciseCount}</b> ex
                  </span>
                  <span>
                    <b className="font-semibold text-[var(--text)]">{estMin}</b> min
                  </span>
                </div>

                {/* Última execução — só aparece se a rotina já foi
                    treinada pelo menos uma vez. Mostra "quando" + a
                    duração real do treino, pra o usuário ter referência. */}
                <p className="mb-3 text-[11px] text-[var(--muted)]">
                  {lastUse ? (
                    <>
                      Último treino <b className="font-semibold text-[var(--text)]">{relativeDaysFromNow(lastUse.endedAt)}</b>
                      {lastUse.durationSec ? (
                        <>
                          {' · '}
                          <b className="font-semibold text-[var(--text)]">{formatDurationCompact(lastUse.durationSec)}</b>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <span className="italic text-[var(--muted)]">Nunca treinada ainda</span>
                  )}
                </p>

                {/* Actions: Iniciar (primary, flex-1) + Editar */}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => beginRoutineTraining(plan)}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-semibold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
                  >
                    <Play size={12} fill="currentColor" />
                    Iniciar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePlanId(plan.id)
                      setScreen('EDIT')
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      {shareLinkModal ? createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShareLinkModal(null)}>
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-extrabold text-[var(--text)]">Compartilhar rotina</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{shareLinkModal.planName}</p>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2">
              <span className="flex-1 truncate text-xs text-[var(--text)]">{shareLinkModal.link}</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareLinkModal.link)
                    window.alert('Link copiado!')
                  } catch {
                    window.prompt('Copie o link:', shareLinkModal.link)
                  }
                }}
                className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white"
              >
                Copiar
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.share({ title: shareLinkModal.planName, url: shareLinkModal.link })
                  }}
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white"
                >
                  Compartilhar (WhatsApp, Instagram...)
                </button>
              )}
              <button
                type="button"
                onClick={() => setShareLinkModal(null)}
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

    </section>
  )
}
