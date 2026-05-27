import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useScrollLock } from '../hooks/useScrollLock'
import {
  Flame, Layers, Dumbbell, Plus, Play, Search, Pencil, Sparkles, MoreHorizontal,
  Activity, X,
} from 'lucide-react'
import { SkeletonCard } from '../components/common/Skeleton'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPost, sharePlan, type PostPrivacy } from '../services/socialService'
import { WorkoutsPage } from './WorkoutsPage'
import { WorkoutRecommendationsPage } from './WorkoutRecommendationsPage'
import { type SetType, type DropEntry } from '../components/common/setTypeOptions'
import {
  getExerciseExplorerSelectionEventName,
  openExerciseExplorer,
  type ExerciseExplorerSelection,
} from '../lib/exercise-explorer'
import { isBodyweightEquipment, resolveBodyweightFlag } from '../lib/exercise-meta'
import { formatClock, formatRestOptionLabel, REST_OPTIONS_SEC } from '../lib/workout-timing'
import { saveWorkoutSessionImage } from '../lib/workout-session-image'
import { optimizeImageFileToDataUrl } from '../lib/image-processing'
import type { WorkoutPlan, CardioType, CardioEntryInput } from '../types/workout'
import {
  addExerciseToPlan,
  completeWorkoutSession,
  createWorkoutPlan,
  deleteWorkoutPlan,
  getExercisePersonalRecords,
  getLatestExercisePerformance,
  getSessionHighlights,
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
}

function createSet(reps = '', weightKg = '', rir = '', rpe = ''): ExerciseSetInput {
  return { reps, weightKg, rir, rpe, setType: 'normal', dropSets: [{ weightKg: '', reps: '' }], clusterReps: '', clusterCount: '', checked: false }
}

function formatDateTime(value: Date | null): string {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

function parsePositiveInt(value: string, fallback = 0): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return fallback
  }

  return Math.floor(n)
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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
      if (setInput.setType === 'drop') {
        const hasAnyDrop = setInput.checked || setInput.dropSets.some((d) => Number(d.reps) > 0)
        if (!hasAnyDrop) return
        totalSeries += 1
        setInput.dropSets.forEach((drop) => {
          const r = Number(drop.reps)
          const w = Number(drop.weightKg)
          if (Number.isFinite(r) && r > 0 && Number.isFinite(w) && w > 0) {
            totalVolumeKg += w * r
          }
        })
        return
      }

      if (setInput.setType === 'cluster') {
        const cr = Number(setInput.clusterReps)
        const cc = Number(setInput.clusterCount)
        const isValid = (Number.isFinite(cr) && cr > 0 && Number.isFinite(cc) && cc > 0) || setInput.checked
        if (!isValid) return
        totalSeries += 1
        const weight = Number(setInput.weightKg)
        if (Number.isFinite(weight) && weight > 0 && Number.isFinite(cr) && cr > 0 && Number.isFinite(cc) && cc > 0) {
          totalVolumeKg += weight * cr * cc
        }
        return
      }

      const reps = Number(setInput.reps)
      const effectiveReps = Number.isFinite(reps) && reps > 0 ? reps : Number(exercise.suggestedReps)
      if (!setInput.checked && (!Number.isFinite(reps) || reps <= 0)) {
        return
      }

      totalSeries += 1
      const weight = Number(setInput.weightKg)
      if (Number.isFinite(weight) && weight > 0 && Number.isFinite(effectiveReps) && effectiveReps > 0) {
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
  if (d < 7) return `há ${d}d`
  if (d < 30) return `há ${Math.floor(d / 7)}sem`
  return `há ${Math.floor(d / 30)}m`
}

const CARDIO_LABELS: Record<CardioType, string> = {
  WALK: 'Caminhada', RUN: 'Corrida', BIKE: 'Bicicleta', STAIRS: 'Escada',
  ELLIPTICAL: 'Elíptico', ROW: 'Remo', JUMP_ROPE: 'Corda', SWIM: 'Natação', OTHER: 'Outro',
}
const CARDIO_TYPES = Object.keys(CARDIO_LABELS) as CardioType[]

// Floating "novo PR!" banner. Stays visible for ~3s, auto-dismisses,
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
          className="w-full max-w-md overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] pb-4 shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
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

  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [endedAt, setEndedAt] = useState<Date | null>(null)

  const [exerciseSearch, setExerciseSearch] = useState('')
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
  const [summaryNotes, setSummaryNotes] = useState('')
  const [summaryImageFile, setSummaryImageFile] = useState<File | null>(null)
  const [summaryImagePreview, setSummaryImagePreview] = useState<string | null>(null)
  const [postPrivacy, setPostPrivacy] = useState<PostPrivacy>(defaultPrivacy)
  const [postCaption, setPostCaption] = useState('')
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [postDone, setPostDone] = useState(false)
  // Editor de imagem de compartilhamento (estilo Strava).
  const [shareHighlights, setShareHighlights] = useState<SessionHighlights | null>(null)
  const [sharePhoto, setSharePhoto] = useState<string | null>(null)
  const [loadingShare, setLoadingShare] = useState(false)
  const interactionOrderByExerciseRef = useRef<Record<string, number>>({})
  const interactionOrderCounterRef = useRef(0)

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

    const id = window.setInterval(() => {
      setElapsedSec((current) => current + 1)
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

    const id = window.setInterval(() => {
      setActiveExercises((current) => {
        const next = current.map((exercise) => {
          if (!exercise.restRunning) return exercise
          if (exercise.restRemainingSec <= 1) {
            setRestFinishedName(exercise.exerciseName)
            return { ...exercise, restRemainingSec: 0, restRunning: false }
          }
          return { ...exercise, restRemainingSec: exercise.restRemainingSec - 1 }
        })
        return next
      })
    }, 1000)

    return () => window.clearInterval(id)
  }, [screen])

  useEffect(() => {
    if (!restFinishedName) return
    const id = window.setTimeout(() => setRestFinishedName(null), 3000)
    return () => window.clearTimeout(id)
  }, [restFinishedName])

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
        for (const item of data.items) {
          next[item.exerciseId] = item.maxLoadKg
        }
        setPrByExerciseId(next)
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

  useEffect(() => {
    const eventName = getExerciseExplorerSelectionEventName()

    const handler = (event: Event) => {
      if (screen !== 'ACTIVE') {
        return
      }

      const payload = (event as CustomEvent<ExerciseExplorerSelection>).detail
      if (!payload) {
        return
      }

      let added = false
      setActiveExercises((current) => {
        if (current.some((exercise) => exercise.exerciseId === payload.id)) {
          return current
        }

        added = true
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

      if (!added) {
        setError('Esse exercicio ja foi adicionado no treino ativo.')
      }
    }

    window.addEventListener(eventName, handler)

    return () => {
      window.removeEventListener(eventName, handler)
    }
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
    setExerciseSearch('')
    setSummaryName('')
    setSummaryDurationMin('')
    setSummaryNotes('')
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
  }

  const finalizeTraining = () => {
    const end = new Date()
    setEndedAt(end)
    setIsWorkoutRunning(false)

    setSummaryName(activePlanName)
    // Inclui o tempo de cardio no padrão da duração — sem isso, registrar
    // "30 min de corrida" em 1 min de cronômetro pré-encheria apenas 1 min.
    const cardioMin = Math.round(cardioEntries.reduce((s, c) => s + c.durationSec, 0) / 60)
    const clockMin = Math.round(elapsedSec / 60)
    setSummaryDurationMin(String(Math.max(1, clockMin, cardioMin)))
    setScreen('SUMMARY')
    // Workout is no longer "active" — drop the snapshot so the mini bar
    // disappears even before the user finishes the summary screen.
    clearActiveWorkout()
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
      // PR detection runs before the state update so it can compare the
      // weight the user is checking against the stored personal record.
      // Only fires when the user is going from unchecked → checked (so
      // unchecking doesn't fire) and the load strictly beats the prior PR.
      const target = activeExercises[exerciseIndex]
      const targetSet = target?.sets[setIndex]
      if (target && targetSet && !targetSet.checked && !isEffectiveBodyweightExercise(target)) {
        const weightRaw = targetSet.weightKg.trim().replace(',', '.')
        const weight = weightRaw ? Number(weightRaw) : NaN
        const previousPr = prByExerciseId[target.exerciseId] ?? null
        if (Number.isFinite(weight) && weight > 0 && (previousPr == null || weight > previousPr)) {
          setPrByExerciseId((current) => ({ ...current, [target.exerciseId]: weight }))
          setPrCelebration({
            id: Date.now(),
            exerciseName: target.exerciseName,
            loadKg: weight,
            previousKg: previousPr,
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
    },
    [lastPerformanceByExercise, activeExercises, prByExerciseId],
  )

  const startRestEdit = (exerciseIndex: number) => {
    const target = activeExercises[exerciseIndex]
    if (!target) {
      return
    }

    setEditingRestExerciseIndex(exerciseIndex)
    setRestDraftSec(String(target.restDurationSec))
  }

  const applyRestEdit = async (exerciseIndex: number) => {
    const parsed = Number(restDraftSec)
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
    const durationMin = parsePositiveInt(summaryDurationMin, Math.max(1, Math.round(elapsedSec / 60), cardioFallbackMin))
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

        const hasAnyInput =
          setInput.checked ||
          repsRaw.length > 0 ||
          weightRaw.length > 0 ||
          rirRaw.length > 0 ||
          rpeRaw.length > 0
        if (!hasAnyInput) {
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

      const notesSegments = [summaryNotes.trim()].filter(Boolean)
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
    return (
      <section className="space-y-4">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-[var(--text)]">Resumo do treino</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Revise e ajuste os dados antes de salvar.</p>
            </div>
            <button
              type="button"
              onClick={backToActiveTraining}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              ← Voltar
            </button>
          </div>
        </motion.header>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-4">
          <label className="block text-sm font-semibold text-[var(--text)]">
            Nome do treino
            <input
              value={summaryName}
              onChange={(event) => setSummaryName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-[var(--text)]">
              Duracao total (minutos)
              <input
                value={summaryDurationMin}
                onChange={(event) => setSummaryDurationMin(event.target.value.replace(/[^\d]/g, ''))}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <div className="rounded-xl border border-[var(--line)] p-3 text-sm text-[var(--muted)]">
              <p>Inicio: {formatDateTime(startedAt)}</p>
              <p className="mt-1">Termino: {formatDateTime(endedAt)}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative overflow-hidden rounded-2xl border border-[var(--brand)]/20 bg-gradient-to-br from-[color-mix(in_srgb,var(--brand)_12%,var(--surface))] to-[var(--surface)] p-4">
              <div className="flex items-center gap-2 text-[var(--brand)]">
                <Flame size={16} />
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Volume total</p>
              </div>
              <p className="mt-2 text-3xl font-black text-[var(--text)]">{totals.totalVolumeKg} <span className="text-lg font-semibold text-[var(--muted)]">kg</span></p>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-[var(--accent-blue)]/20 bg-gradient-to-br from-[color-mix(in_srgb,var(--accent-blue)_10%,var(--surface))] to-[var(--surface)] p-4">
              <div className="flex items-center gap-2 text-[var(--accent-blue)]">
                <Layers size={16} />
                <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Séries realizadas</p>
              </div>
              <p className="mt-2 text-3xl font-black text-[var(--text)]">{totals.totalSeries}</p>
            </div>
          </div>

          <label className="block text-sm font-semibold text-[var(--text)]">
            Upload de imagem
            <input
              type="file"
              accept="image/*"
              onChange={(event) => handleSummaryImage(event.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
          </label>

          {summaryImagePreview ? (
            <img
              src={summaryImagePreview}
              alt="Preview do treino"
              className="mx-auto w-full max-w-[20rem] rounded-xl border border-[var(--line)] object-cover sm:max-w-[24rem]"
              style={{ aspectRatio: '4 / 5', maxHeight: '20rem' }}
            />
          ) : null}

          <label className="block text-sm font-semibold text-[var(--text)]">
            Anotacoes do treino
            <textarea
              value={summaryNotes}
              onChange={(event) => setSummaryNotes(event.target.value)}
              rows={4}
              placeholder="Como foi o treino hoje?"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
          </label>

          {!savedSessionId ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveTraining()}
                disabled={saving}
                className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar Treino'}
              </button>
              <button
                type="button"
                onClick={resetWorkflow}
                className="rounded-xl border border-red-500/60 px-5 py-2 text-sm font-bold text-red-300"
              >
                Descartar Treinamento
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-green-400">Treino salvo com sucesso!</p>
              <button
                type="button"
                disabled={loadingShare || !savedSessionId}
                onClick={async () => {
                  if (!savedSessionId) return
                  try {
                    setLoadingShare(true)
                    setError(null)
                    // Converte a foto (se houver) para dataURL — blob: URL pode
                    // falhar no html2canvas.
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand)] bg-[var(--brand)]/10 px-4 py-2.5 text-sm font-bold text-[var(--brand)] disabled:opacity-60"
              >
                {loadingShare ? 'Preparando…' : 'Compartilhar imagem (Instagram, Stories…)'}
              </button>
              {!postDone ? (
                <>
                  <p className="text-sm font-semibold text-[var(--text)]">Deseja postar este treino?</p>
                  <div className="flex gap-2 flex-wrap">
                    {allowedPrivacies.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPostPrivacy(p)}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                          postPrivacy === p
                            ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]'
                            : 'border-[var(--line)] text-[var(--muted)]'
                        }`}
                      >
                        {p === 'PUBLIC' ? 'Público' : p === 'FRIENDS' ? 'Amigos' : 'Privado'}
                      </button>
                    ))}
                  </div>
                  {isProfilePrivate ? (
                    <p className="text-[11px] text-[var(--muted)]">
                      Sua conta está privada — posts públicos ficam disponíveis apenas como "Amigos" ou "Privado".
                    </p>
                  ) : null}
                  <textarea
                    value={postCaption}
                    onChange={(e) => setPostCaption(e.target.value)}
                    placeholder="Legenda do post (opcional)"
                    rows={2}
                    className="w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
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
                          setPostDone(true)
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Erro ao postar')
                        } finally {
                          setPosting(false)
                        }
                      }}
                      className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {posting ? 'Postando...' : 'Postar treino'}
                    </button>
                    <button
                      type="button"
                      onClick={resetWorkflow}
                      className="rounded-xl border border-[var(--line)] px-5 py-2 text-sm font-semibold text-[var(--text)]"
                    >
                      Pular
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-green-400">Post publicado!</p>
                  <button
                    type="button"
                    onClick={resetWorkflow}
                    className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white"
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
            <div>
              <h1 className="text-2xl font-black text-[var(--text)]">Recomendações</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Escolha uma estrutura e salve como novo treino.</p>
            </div>
            <button
              type="button"
              onClick={() => setScreen('DASHBOARD')}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              ← Voltar
            </button>
          </div>
        </motion.header>
        <WorkoutRecommendationsPage />
      </section>
    )
  }

  if (screen === 'NEW_ROUTINE') {
    return (
      <section className="space-y-4">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-[var(--text)]">Nova Rotina</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Monte uma nova rotina e salve para usar nos treinos.</p>
            </div>
            <button
              type="button"
              onClick={() => setScreen('DASHBOARD')}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              ← Voltar
            </button>
          </div>
        </motion.header>
        <WorkoutsPage
          selectedPlanId={activePlanId}
          onlySelectedPlan={false}
          showCreateSection
          createOnlyMode
          onPlanSaved={async () => {
            await reloadPlans(activePlanId)
            setScreen('DASHBOARD')
          }}
        />
      </section>
    )
  }

  if (screen === 'EDIT') {
    const editingPlan = plans.find((p) => p.id === activePlanId)
    return (
      <section className="space-y-4">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-[var(--text)]">Editando rotina</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">{editingPlan?.name ?? ''}</p>
            </div>
            <button
              type="button"
              onClick={() => setScreen('DASHBOARD')}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              {'<- Voltar'}
            </button>
          </div>
        </motion.header>
        <WorkoutsPage
          selectedPlanId={activePlanId}
          onlySelectedPlan
          showCreateSection={false}
          createOnlyMode={false}
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
                    <p className="text-base font-bold text-[var(--text)]">Descanso acabou!</p>
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
            <div>
              <h1 className="text-xl font-black text-[var(--text)] sm:text-2xl">Treino ativo: {activePlanName}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Cronometro geral e descanso por exercicio.</p>
            </div>
            <p className="text-3xl font-black text-[var(--text)] tabular-nums">{formatClock(elapsedSec)}</p>
          </div>

          {/* Compact Duração / Volume / Séries summary — mirrors Hevy's
              top header. Recomputed from totals on every render which is
              cheap since the helper already memoises. */}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-dashed border-[var(--line)] pt-3 text-center sm:text-left">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Duração</p>
              <p className="mt-0.5 text-[15px] font-extrabold text-[var(--brand-strong)] tabular-nums sm:text-base">
                {formatClock(elapsedSec)}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Volume</p>
              <p className="mt-0.5 text-[15px] font-extrabold text-[var(--text)] tabular-nums sm:text-base">
                {Math.round(totals.totalVolumeKg).toLocaleString('pt-BR')} <span className="text-[10px] font-mono text-[var(--muted)]">kg</span>
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Séries</p>
              <p className="mt-0.5 text-[15px] font-extrabold text-[var(--text)] tabular-nums sm:text-base">
                {totals.totalSeries}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={backToDashboardFromActive}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              {'<- Voltar'}
            </button>
            <button
              type="button"
              onClick={() => setIsWorkoutRunning((prev) => !prev)}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              {isWorkoutRunning ? 'Pausar cronometro' : 'Retomar cronometro'}
            </button>

            <input
              value={manualTimerMinutes}
              onChange={(event) => setManualTimerMinutes(event.target.value.replace(/[^\d]/g, ''))}
              placeholder="min"
              className="w-20 rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={applyManualTimerEdit}
              className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Editar tempo
            </button>
            <button
              type="button"
              onClick={finalizeTraining}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"
            >
              Finalizar Treino
            </button>
          </div>
        </motion.header>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <h2 className="text-lg font-extrabold text-[var(--text)]">Adicionar exercicio</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              value={exerciseSearch}
              onChange={(event) => setExerciseSearch(event.target.value)}
              placeholder="Buscar exercicio"
              className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                openExerciseExplorer({
                  initialQuery: exerciseSearch.trim() || undefined,
                  context: 'ACTIVE_WORKOUT',
                })
              }}
              className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Explorar Exercicios
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Clique em "Explorar Exercicios" para abrir a lista com foto e video.
          </p>
        </article>

        <article className="space-y-3">
          {activeExercises.length === 0 ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
              Nenhum exercicio adicionado ainda.
            </p>
          ) : null}

          {activeExercises.map((exercise, exerciseIndex) => {
            const showLoadInput = !isEffectiveBodyweightExercise(exercise)

            return (
              <div key={`${exercise.exerciseId}-${exerciseIndex}`} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="h-20 w-20 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] sm:h-24 sm:w-24">
                    {exercise.thumbnailUrl ? (
                      <img
                        src={exercise.thumbnailUrl}
                        alt={`Imagem do exercicio ${exercise.exerciseName}`}
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
                      {exercise.videoUrl ? 'Ver video do exercicio' : 'Video em breve'}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editingRestExerciseIndex === exerciseIndex ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={restDraftSec}
                        onChange={(event) => setRestDraftSec(event.target.value)}
                        className="w-32 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-xs text-[var(--text)]"
                      >
                        <option value="0">Sem descanso</option>
                        {REST_OPTIONS_SEC.map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {formatRestOptionLabel(seconds)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void applyRestEdit(exerciseIndex)}
                        className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
                      >
                        Salvar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startRestEdit(exerciseIndex)}
                      className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)]"
                    >
                      Descanso {formatClock(exercise.restDurationSec)}
                    </button>
                  )}
                </div>
              </div>

              <label className="mt-3 block">
                <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Notas do exercicio (opcional)
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
                {/* Column header — rendered once above the sets list, Hevy style.
                    Compact label row that anchors the per-set grid below. */}
                {exercise.sets.length > 0 && (
                  <div
                    className="grid items-center gap-1.5 px-1 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] sm:gap-2"
                    style={{
                      gridTemplateColumns: showLoadInput
                        ? '36px minmax(60px,1fr) 64px 64px 32px'
                        : '36px minmax(60px,1fr) 96px 32px',
                    }}
                  >
                    <span>Série</span>
                    <span>Anterior</span>
                    {showLoadInput && <span className="text-center">kg</span>}
                    <span className="text-center">reps</span>
                    <span className="text-center">✓</span>
                  </div>
                )}

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
                  <div
                    key={`${exercise.exerciseId}-${setIndex}`}
                    className={`rounded-xl border transition-colors ${
                      setInput.checked
                        ? 'border-green-500/50 bg-green-500/5'
                        : 'border-[var(--line)]'
                    } ${isComplex ? 'space-y-2 p-3' : 'px-2 py-1.5'}`}
                  >
                    {!isComplex ? (
                      /* COMPACT ROW (normal/warmup/failure) — Hevy-style:
                         [Badge] [Anterior]  [KG input]  [Reps input]  [✓] */
                      <div
                        className="grid items-center gap-1.5 sm:gap-2"
                        style={{
                          gridTemplateColumns: showLoadInput
                            ? '36px minmax(60px,1fr) 64px 64px 32px'
                            : '36px minmax(60px,1fr) 96px 32px',
                        }}
                      >
                        <SetTypeBadge
                          index={setIndex}
                          setType={setInput.setType}
                          checked={setInput.checked}
                          onClick={() => setOpenTypePicker({ exerciseIndex, setIndex })}
                        />
                        <span className="truncate font-mono text-[12px] text-[var(--muted)]">
                          {previousLabel}
                        </span>
                        {showLoadInput && (
                          <input
                            value={setInput.weightKg}
                            placeholder={weightPlaceholder}
                            inputMode="decimal"
                            aria-label="Peso em kg"
                            onChange={(event) =>
                              patchSet(exerciseIndex, setIndex, {
                                weightKg: event.target.value.replace(/[^\d.]/g, ''),
                              })
                            }
                            className="w-full rounded-md border border-[var(--line)] bg-transparent px-1.5 py-1 text-center text-[13px] font-semibold tabular-nums"
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
                          className="w-full rounded-md border border-[var(--line)] bg-transparent px-1.5 py-1 text-center text-[13px] font-semibold tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => completeSet(exerciseIndex, setIndex)}
                          title={setInput.checked ? 'Clique para desmarcar' : 'Concluir série'}
                          aria-label={setInput.checked ? 'Desmarcar série' : 'Concluir série'}
                          className={`h-7 w-7 shrink-0 justify-self-center rounded-md border-2 flex items-center justify-center text-[13px] font-bold transition-colors ${
                            setInput.checked
                              ? 'border-green-500 bg-green-500 text-white'
                              : 'border-[var(--line)] bg-transparent text-[var(--muted)] hover:border-green-500/60 hover:text-green-400'
                          }`}
                        >
                          ✓
                        </button>
                      </div>
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
                                  onChange={(e) =>
                                    patchDropEntry(exerciseIndex, setIndex, dropIdx, {
                                      weightKg: e.target.value.replace(/[^\d.]/g, ''),
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
                              onChange={(event) =>
                                patchSet(exerciseIndex, setIndex, {
                                  weightKg: event.target.value.replace(/[^\d.]/g, ''),
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
                      </div>
                    ) : null /* normal/warmup/failure is rendered by the compact
                              row above; RIR/RPE moved to the per-exercise expander. */}

                    {/* RIR + RPE sub-row — always visible for normal sets so
                        the user keeps the same input surface as before, just
                        on a compact second line under the main grid. */}
                    {!isComplex && (
                      <div className="mt-1.5 grid grid-cols-2 gap-1.5 px-1">
                        {!(isTime || isDistance) && (
                          <label className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
                            RIR
                            <input
                              value={setInput.rir}
                              placeholder={rirPlaceholder}
                              inputMode="numeric"
                              onChange={(event) =>
                                patchSet(exerciseIndex, setIndex, {
                                  rir: event.target.value.replace(/[^\d]/g, ''),
                                })
                              }
                              className="ml-auto w-14 rounded border border-[var(--line)] bg-transparent px-1.5 py-0.5 text-center text-[12px] font-semibold tabular-nums"
                            />
                          </label>
                        )}
                        <label className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
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
                            className="ml-auto w-14 rounded border border-[var(--line)] bg-transparent px-1.5 py-0.5 text-center text-[12px] font-semibold tabular-nums"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                    )
                  })()
                ))}

                <button
                  type="button"
                  onClick={() => addSet(exerciseIndex)}
                  className="mt-1 inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  + Adicionar série
                </button>
              </div>
              </div>
            )
          })}
        </article>

        <CardioSection
          entries={cardioEntries}
          onAdd={(entry) => setCardioEntries((current) => [...current, entry])}
          onRemove={(index) => setCardioEntries((current) => current.filter((_, i) => i !== index))}
        />
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
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
          Treinar <span className="font-serif-accent text-[var(--brand-strong)]">agora</span>
        </h1>
        <p className="mt-1.5 text-[13px] text-[var(--muted)] sm:text-sm">
          Inicie rápido, escolha uma rotina ou monte seu treino na hora.
        </p>
      </motion.header>

      {/* ───── QUICK ACTIONS ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]"
      >
        <button
          type="button"
          onClick={beginEmptyTraining}
          className="group relative flex min-h-[96px] flex-col items-start gap-2.5 overflow-hidden rounded-xl border border-[var(--brand-strong)] bg-gradient-to-br from-[#ff7a5a] to-[var(--brand)] p-4 text-left text-white shadow-[0_14px_26px_-16px_rgba(255,90,60,0.55)] transition-transform hover:translate-y-[-2px] sm:col-span-2 lg:col-span-1"
        >
          {/* Decorative radial highlight — same effect as the mock's ::after */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)' }}
          />
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/25 bg-white/15">
            <Play size={16} fill="currentColor" />
          </span>
          <strong className="text-[15px] font-semibold tracking-tight">Iniciar Vazio</strong>
        </button>

        <button
          type="button"
          onClick={() => setScreen('RECOMMENDATIONS')}
          className="group flex min-h-[96px] flex-col items-start gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition-all hover:-translate-y-px hover:border-[var(--brand)]/30 hover:bg-[var(--surface-hover)]"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] text-[var(--text)]">
            <Sparkles size={16} />
          </span>
          <strong className="text-[13.5px] font-semibold tracking-tight text-[var(--text)]">Recomendações</strong>
        </button>

        <button
          type="button"
          onClick={() => setScreen('NEW_ROUTINE')}
          className="group flex min-h-[96px] flex-col items-start gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition-all hover:-translate-y-px hover:border-[var(--brand)]/30 hover:bg-[var(--surface-hover)]"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] text-[var(--text)]">
            <Plus size={16} />
          </span>
          <strong className="text-[13.5px] font-semibold tracking-tight text-[var(--text)]">Nova Rotina</strong>
        </button>

        <button
          type="button"
          onClick={() => openExerciseExplorer({ context: undefined })}
          className="group flex min-h-[96px] flex-col items-start gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left transition-all hover:-translate-y-px hover:border-[var(--brand)]/30 hover:bg-[var(--surface-hover)]"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] text-[var(--text)]">
            <Search size={16} />
          </span>
          <strong className="text-[13.5px] font-semibold tracking-tight text-[var(--text)]">Explorar Exercícios</strong>
        </button>
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
          <div className="flex gap-1">
            {([
              { id: 'ALL', label: 'TODAS' },
              { id: 'AI', label: 'IA' },
              { id: 'CUSTOM', label: 'MINHAS' },
            ] as Array<{ id: RoutineFilter; label: string }>).map((f) => {
              const active = routineFilter === f.id
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setRoutineFilter(f.id)}
                  className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium tracking-wider transition-colors ${
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
        </div>

        {loadingPlans ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : null}

        {!loadingPlans && plans.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <Dumbbell size={32} className="mx-auto mb-3 text-[var(--muted)]" strokeWidth={1.5} />
            <p className="text-sm font-bold text-[var(--text)]">Nenhuma rotina criada ainda</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Crie sua primeira rotina para começar a treinar.</p>
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

                {/* Stats line — exercises count, est. minutes, created-relative date */}
                <div className="mb-3.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--muted)]">
                  <span>
                    <b className="font-semibold text-[var(--text)]">{exerciseCount}</b> ex
                  </span>
                  <span>
                    <b className="font-semibold text-[var(--text)]">{estMin}</b> min
                  </span>
                  <span>
                    criada <b className="font-semibold text-[var(--text)]">{relativeDaysFromNow(plan.createdAt)}</b>
                  </span>
                </div>

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
