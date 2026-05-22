import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEffect, useMemo, useState } from 'react'
import { CountUp } from '../components/common/CountUp'
import { listWorkoutHistory } from '../services/workoutService'
import type { WorkoutSessionHistory } from '../types/workout'
import {
  Activity, Bot, Calendar, Clock, Dumbbell, Flame, Play, TrendingUp,
  Zap, ArrowRight,
} from 'lucide-react'

// ─── Data helpers ──────────────────────────────────────────────────────────

function calcVolumeKg(session: WorkoutSessionHistory): number {
  return session.history.reduce((acc, e) => acc + (e.weightKg ?? 0) * (e.reps ?? 0), 0)
}

// Snap a date to the start of its ISO week (Mon = 0). We use this to bucket
// sessions into 8-week sparkline series and the "best week of month" check.
function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

function isoWeekNumber(d: Date): number {
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000
  return 1 + Math.round((diff - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
}

// Last-30-days bucket. The mock uses a 0-4 intensity scale: 0 = rest,
// 1 = light (<15min real work), 2 = mid (<30), 3 = solid (<45), 4 = hard (45+).
// Falls back to "session count of the day" when durations aren't tracked.
type HeatCell = { day: string; iso: string; intensity: 0 | 1 | 2 | 3 | 4; sessions: number; minutes: number }

function buildHeatmap(items: WorkoutSessionHistory[]): HeatCell[] {
  const sessionsByDay = new Map<string, WorkoutSessionHistory[]>()
  for (const s of items) {
    if (!s.endedAt) continue
    const key = s.endedAt.slice(0, 10)
    const list = sessionsByDay.get(key) ?? []
    list.push(s)
    sessionsByDay.set(key, list)
  }

  const today = new Date()
  const out: HeatCell[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const list = sessionsByDay.get(key) ?? []
    const minutes = Math.round(list.reduce((acc, s) => acc + (s.durationSec ?? 0), 0) / 60)
    const sessions = list.length
    const intensity: HeatCell['intensity'] =
      minutes >= 45 ? 4 : minutes >= 30 ? 3 : minutes >= 15 ? 2 : sessions > 0 ? 1 : 0
    out.push({
      day: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      iso: key,
      intensity,
      sessions,
      minutes,
    })
  }
  return out
}

// 8-week aggregates so we can render compact sparklines per stat card.
type WeeklyAgg = { weekStart: number; sessions: number; volumeKg: number }

function buildWeeklySeries(items: WorkoutSessionHistory[]): WeeklyAgg[] {
  const buckets = new Map<number, WeeklyAgg>()
  for (const s of items) {
    if (!s.endedAt) continue
    const ts = startOfWeek(new Date(s.endedAt)).getTime()
    const agg = buckets.get(ts) ?? { weekStart: ts, sessions: 0, volumeKg: 0 }
    agg.sessions += 1
    agg.volumeKg += calcVolumeKg(s)
    buckets.set(ts, agg)
  }

  const today = new Date()
  const out: WeeklyAgg[] = []
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i * 7)
    const ts = startOfWeek(d).getTime()
    out.push(buckets.get(ts) ?? { weekStart: ts, sessions: 0, volumeKg: 0 })
  }
  return out
}

// Average RPE / total volume / minutes / exercise count for the most recent
// completed session. Used in the "Último treino" hero row.
function summarizeLastWorkout(s: WorkoutSessionHistory | null) {
  if (!s) return null
  const totalReps = s.history.reduce((acc, e) => acc + (e.reps ?? 0), 0)
  const totalVolume = calcVolumeKg(s)
  const exerciseIds = new Set(s.history.map((e) => e.exercise.id))
  const rpes = s.history.map((e) => e.perceivedExertion).filter((v): v is number => v != null)
  const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null
  return {
    name: s.workoutPlan?.name ?? 'Treino livre',
    endedAt: s.endedAt,
    minutes: Math.round((s.durationSec ?? 0) / 60),
    exerciseCount: exerciseIds.size,
    totalReps,
    totalVolume,
    avgRpe,
  }
}

// "Você está a 1 treino de bater sua melhor semana do mês."
// Compares the current ISO week's session count against the best week in
// the last 4 (excluding the current one). 0 = already best, 1+ = need N more.
function trainingsToBeatBestWeek(weekly: WeeklyAgg[]): number {
  if (weekly.length < 2) return 0
  const current = weekly[weekly.length - 1].sessions
  const previous = weekly.slice(-5, -1).map((w) => w.sessions)
  const best = previous.length > 0 ? Math.max(...previous) : 0
  return Math.max(0, best - current + 1)
}

// Compact line+area path for the sparkline SVG (70×28 viewbox). Pads the
// y-axis so the line never touches the edges and looks like the mock's
// hand-drawn shape even when one of the values is 0.
function lineSparkPath(values: number[], w = 70, h = 28): { line: string; area: string } {
  if (values.length === 0) return { line: '', area: '' }
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const step = w / Math.max(1, values.length - 1)
  const points = values.map((v, i) => {
    const x = i * step
    const y = h - 4 - ((v - min) / range) * (h - 8)
    return [x, y] as const
  })
  const line = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ')
  const area = `${line} L ${w} ${h} L 0 ${h} Z`
  return { line, area }
}

function relativeBigDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Live "QUI · 14 MAI · 11:40" line.
function useLiveTime() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
  const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    pretty: `${days[now.getDay()]} · ${pad(now.getDate())} ${months[now.getMonth()]} · ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    week: isoWeekNumber(now),
  }
}

// ─── Recommendations API plumbing (kept from previous version) ─────────────

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

type WorkoutRecommendation = {
  division: string
  daysPerWeek: number
  rationale: string
  sessions: Array<{
    dayNumber: number
    focus: string
    exercises: Array<{
      id: string
      name: string
      sets: number
      reps: string
      restSeconds: number
    }>
  }>
}

function normalizeDivisionLabel(value: string): string {
  return value === 'Torso Legs' ? 'Torso Limbs' : value
}

const fallbackRecommendations: WorkoutRecommendation[] = [
  {
    division: 'Push Pull Legs',
    daysPerWeek: 5,
    rationale: 'Equilíbrio entre hipertrofia e recuperação para rotina consistente.',
    sessions: [
      {
        dayNumber: 1,
        focus: 'Push',
        exercises: [
          { id: 'p1', name: 'Supino reto', sets: 4, reps: '8-10', restSeconds: 90 },
          { id: 'p2', name: 'Desenvolvimento halteres', sets: 3, reps: '10-12', restSeconds: 75 },
          { id: 'p3', name: 'Tríceps corda', sets: 3, reps: '12-15', restSeconds: 60 },
        ],
      },
    ],
  },
  {
    division: 'Bro Split',
    daysPerWeek: 5,
    rationale: 'Maior foco por grupamento para ganho de volume por sessão.',
    sessions: [
      {
        dayNumber: 1,
        focus: 'Chest',
        exercises: [
          { id: 'b1', name: 'Supino inclinado', sets: 4, reps: '6-8', restSeconds: 120 },
          { id: 'b2', name: 'Crucifixo no cabo', sets: 3, reps: '10-12', restSeconds: 75 },
          { id: 'b3', name: 'Crossover polia alta', sets: 3, reps: '12-15', restSeconds: 60 },
        ],
      },
    ],
  },
]

// ─── Visual primitives ─────────────────────────────────────────────────────

// Sparkline (line + filled area) for the stat cards.
function LineSparkline({ values, color }: { values: number[]; color: string }) {
  const { line, area } = lineSparkPath(values)
  return (
    <svg
      viewBox="0 0 70 28"
      preserveAspectRatio="none"
      className="absolute bottom-2 right-2.5 h-7 w-[70px] opacity-90"
      aria-hidden
    >
      <path d={area} fill={color} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Streak flame rendered as the native 🔥 emoji so it matches the OS-level
// icon the user sees everywhere else. Two states:
//   - `active` (streak > 0): warm glow + flicker animation
//   - frozen (streak === 0): hue-rotated to icy cyan, no animation, slight
//     blue drop-shadow. Conveys "lost the streak" without changing the shape.
function StreakFlame({ active }: { active: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute bottom-1 right-2 select-none text-[34px] leading-none ${
        active ? 'flame-alive' : 'flame-frozen'
      }`}
      // emoji presentation variant: forces the colored glyph over the
      // black-and-white text fallback on platforms that ship both.
      aria-hidden
      title={active ? 'Sequência ativa' : 'Sequência interrompida'}
    >
      🔥{'️'}
    </span>
  )
}

// Tiny bar sparkline for the "Treinos / semana" card — same idea as the mock.
function BarsSparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  return (
    <svg
      viewBox="0 0 70 28"
      preserveAspectRatio="none"
      className="absolute bottom-2 right-2.5 h-7 w-[70px] opacity-90"
      aria-hidden
    >
      {values.map((v, i) => {
        const w = 6
        const gap = (70 - values.length * w) / Math.max(1, values.length - 1)
        const x = i * (w + gap)
        const h = Math.max(2, (v / max) * 22)
        return <rect key={i} x={x} y={28 - h} width={w} height={h} rx={1} fill={color} />
      })}
    </svg>
  )
}

type StatCardProps = {
  label: string
  value: string | number
  unit?: string
  delta?: string
  deltaDirection?: 'up' | 'down' | 'flat'
  icon: typeof Flame
  tone: 'peach' | 'rose' | 'mint'
  spark?: React.ReactNode
}

function StatCard({ label, value, unit, delta, deltaDirection = 'up', icon: IconEl, tone, spark }: StatCardProps) {
  // Per-tone gradient — uses color-mix against --surface so the cards keep
  // their warm/cool accent in both light and dark themes.
  const gradient = {
    peach: 'linear-gradient(135deg, var(--surface) 30%, color-mix(in srgb, var(--brand) 16%, var(--surface)) 130%)',
    rose:  'linear-gradient(135deg, var(--surface) 30%, color-mix(in srgb, #e6447a 14%, var(--surface)) 130%)',
    mint:  'linear-gradient(135deg, var(--surface) 30%, color-mix(in srgb, var(--accent-emerald) 16%, var(--surface)) 130%)',
  }[tone]

  const deltaColor = deltaDirection === 'down' ? 'text-rose-500' : deltaDirection === 'flat' ? 'text-[var(--muted)]' : 'text-emerald-600'
  const arrow = deltaDirection === 'down' ? '▼' : deltaDirection === 'flat' ? '·' : '▲'

  return (
    <div
      className="relative cursor-default overflow-hidden rounded-2xl border border-[var(--line)] p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_26px_-22px_rgba(40,15,5,0.35)]"
      style={{ background: gradient }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          {label}
        </span>
        <span className="grid h-5 w-5 place-items-center rounded-md border border-black/5 bg-white/70 text-[var(--ink-2,var(--text))]">
          <IconEl size={11} strokeWidth={2} />
        </span>
      </div>
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="text-[34px] font-semibold leading-none tracking-tight text-[var(--text)]">{value}</span>
        {unit && <span className="font-mono text-[12px] font-medium text-[var(--muted)]">{unit}</span>}
      </div>
      {delta && (
        <span className={`inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold ${deltaColor}`}>
          {arrow} {delta}
        </span>
      )}
      {spark}
    </div>
  )
}

// Small kicker pattern used in section headers ("Bem-vindo, Pedro" style).
function SectionHead({ title, accent, sub }: { title: string; accent: string; sub?: string }) {
  return (
    <div className="mb-3.5 mt-2 flex items-end justify-between gap-2">
      <h2 className="text-[22px] font-semibold tracking-tight text-[var(--text)]">
        {title} <span className="font-serif-accent text-[var(--brand-strong)]">{accent}</span>
      </h2>
      {sub && (
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
          {sub}
        </span>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function HomePage() {
  const { isAuthenticated, authorizedFetch, user } = useAuth()
  const { pretty: liveTime, week: weekNumber } = useLiveTime()

  const [recommendations, setRecommendations] = useState<WorkoutRecommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyItems, setHistoryItems] = useState<WorkoutSessionHistory[]>([])

  useEffect(() => {
    if (!isAuthenticated) return
    void listWorkoutHistory(authorizedFetch)
      .then((r) => setHistoryItems(r.items))
      .catch(() => { /* silent */ })
  }, [authorizedFetch, isAuthenticated])

  const heatmap = useMemo(() => buildHeatmap(historyItems), [historyItems])
  const weekly = useMemo(() => buildWeeklySeries(historyItems), [historyItems])
  const sortedSessions = useMemo(
    () => historyItems
      .filter((s) => s.endedAt)
      .sort((a, b) => new Date(b.endedAt!).getTime() - new Date(a.endedAt!).getTime()),
    [historyItems],
  )
  const lastWorkout = summarizeLastWorkout(sortedSessions[0] ?? null)

  const heatmapTotalSessions = heatmap.reduce((acc, c) => acc + c.sessions, 0)
  const heatmapTotalMinutes = heatmap.reduce((acc, c) => acc + c.minutes, 0)
  const heatmapHours = Math.floor(heatmapTotalMinutes / 60)
  const heatmapMins = heatmapTotalMinutes % 60

  // Streak: count consecutive days back from today (or yesterday if today is rest).
  const sessionDays = useMemo(() => new Set(sortedSessions.map((s) => s.endedAt!.slice(0, 10))), [sortedSessions])
  const streak = useMemo(() => {
    let count = 0
    const cursor = new Date()
    cursor.setHours(0, 0, 0, 0)
    if (!sessionDays.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1)
    while (sessionDays.has(cursor.toISOString().slice(0, 10))) {
      count++
      cursor.setDate(cursor.getDate() - 1)
    }
    return count
  }, [sessionDays])

  const thisWeek = weekly[weekly.length - 1]
  const lastWeek = weekly[weekly.length - 2]
  const sessionsDelta = thisWeek && lastWeek ? thisWeek.sessions - lastWeek.sessions : 0
  const volumeDelta = thisWeek && lastWeek && lastWeek.volumeKg > 0
    ? Math.round(((thisWeek.volumeKg - lastWeek.volumeKg) / lastWeek.volumeKg) * 100)
    : null
  const sessionsToBeat = trainingsToBeatBestWeek(weekly)

  useEffect(() => {
    if (!isAuthenticated) return
    let active = true

    // setState calls live inside this async closure so the lint rule
    // "set-state-in-effect" stays happy — the body of the effect only
    // schedules and tears down work.
    const load = async () => {
      if (!active) return
      setLoading(true)
      setError(null)

      try {
        const response = await authorizedFetch(`${API_URL}/recommendations/workout`)
        const payload = (await response.json().catch(() => null)) as
          | { data?: { recommendations?: WorkoutRecommendation[] }; error?: { message?: string; code?: string } }
          | null

        if (!response.ok || !payload?.data?.recommendations) {
          if (payload?.error?.code === 'ONBOARDING_REQUIRED') {
            if (active) {
              setError('Finalize seu onboarding para desbloquear recomendações personalizadas.')
              setRecommendations(fallbackRecommendations)
            }
            return
          }
          throw new Error(payload?.error?.message ?? 'Falha ao carregar recomendações')
        }

        if (active) {
          setRecommendations(
            payload.data.recommendations.slice(0, 2).map((item) => ({
              ...item,
              division: normalizeDivisionLabel(item.division),
            })),
          )
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar recomendações')
          setRecommendations(fallbackRecommendations)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [authorizedFetch, isAuthenticated, user?.availableDaysPerWeek, user?.sex])

  const topRecommendations = useMemo(
    () => (recommendations.length > 0 ? recommendations.slice(0, 2) : fallbackRecommendations),
    [recommendations],
  )

  const firstName = user?.name?.split(' ')[0] ?? 'atleta'

  // Heatmap palette — 5 levels, mirrors the mock.
  const heatColors = ['var(--surface-hover)', '#ffd1c2', '#ffa489', '#ff7a5a', 'var(--brand)']

  return (
    <section className="space-y-4">
      {/* ──────── HERO ───────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7"
      >
        {/* Grid pattern + radial highlight — faux-engineered look from the mock */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(color-mix(in srgb, var(--brand) 4%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--brand) 4%, transparent) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            WebkitMaskImage: 'radial-gradient(620px 280px at 88% 30%, #000 0%, transparent 70%)',
            maskImage: 'radial-gradient(620px 280px at 88% 30%, #000 0%, transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-[340px] w-[340px] rounded-full"
          style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--brand) 18%, transparent), transparent 70%)' }}
        />

        <div className="relative">
          {/* Live status line */}
          <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <span
              className="relative inline-block h-2 w-2 rounded-full bg-emerald-500"
              style={{ boxShadow: '0 0 0 0 rgba(22,163,74,0.55)', animation: 'tech-pulse 1.8s ease-out infinite' }}
              aria-hidden
            />
            <span>Sistema online</span>
            <span className="opacity-40">/</span>
            <span>{liveTime}</span>
            <span className="opacity-40">/</span>
            <span>Semana {weekNumber}</span>
          </div>

          <h1 className="text-3xl font-semibold leading-[1.05] tracking-tight text-[var(--text)] sm:text-4xl">
            {isAuthenticated ? (
              <>
                Bem-vindo, <span className="font-serif-accent text-[var(--brand-strong)]">{firstName}</span>
              </>
            ) : (
              <>
                Treine <span className="font-serif-accent text-[var(--brand-strong)]">melhor</span> com IA
              </>
            )}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            {isAuthenticated && sessionsToBeat > 0 ? (
              <>
                Recomendações objetivas pra acelerar sua próxima sessão. Você está a{' '}
                <b className="text-[var(--text)]">{sessionsToBeat} treino{sessionsToBeat > 1 ? 's' : ''}</b>{' '}
                de bater sua melhor semana do mês.
              </>
            ) : isAuthenticated ? (
              <>Recomendações objetivas pra acelerar sua próxima sessão. <b className="text-[var(--text)]">Você já bateu</b> a melhor semana do mês — siga firme.</>
            ) : (
              <>Recomendações objetivas pra acelerar sua próxima sessão. Entre pra ver sua progressão e bater novos recordes.</>
            )}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to={isAuthenticated ? '/train' : '/login'}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-sm font-medium text-white shadow-[0_10px_22px_-12px_rgba(255,90,60,0.55)] transition-transform hover:-translate-y-px hover:bg-[var(--brand-strong)]"
            >
              <Play size={14} fill="currentColor" />
              {isAuthenticated ? 'Explorar treinos' : 'Entrar para continuar'}
            </Link>
            <Link
              to={isAuthenticated ? '/history' : '/login'}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-transparent bg-transparent px-4 text-sm font-medium text-[var(--ink-2,var(--text))] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <Clock size={14} />
              Ver histórico
            </Link>
          </div>
        </div>
      </motion.section>

      {/* ──────── STATS ──────────────────────────────────────────────── */}
      {isAuthenticated && (
        <>
        {/* Mobile: barra de resumo compacta, clicável → Progresso */}
        <Link
          to="/progress"
          className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] transition-colors active:bg-[var(--surface-hover)] sm:hidden"
        >
          {[
            { label: 'Sequência', node: <CountUp value={streak} />, unit: 'dias' },
            { label: 'Treinos', node: <CountUp value={thisWeek?.sessions ?? 0} />, unit: '/sem' },
            {
              label: 'Volume',
              node: (thisWeek && thisWeek.volumeKg >= 1000
                ? `${(thisWeek.volumeKg / 1000).toFixed(thisWeek.volumeKg >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`
                : `${Math.round(thisWeek?.volumeKg ?? 0)}`),
              unit: 'kg',
            },
          ].map((s, i) => (
            <div key={s.label} className={`flex flex-col items-center gap-0.5 px-2 py-3 text-center ${i > 0 ? 'border-l border-[var(--line)]' : ''}`}>
              <span className="flex items-baseline gap-0.5">
                <span className="text-xl font-bold leading-none text-[var(--text)]">{s.node}</span>
                <span className="text-[10px] text-[var(--muted)]">{s.unit}</span>
              </span>
              <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">{s.label}</span>
            </div>
          ))}
        </Link>

        {/* Desktop/tablet: cards completos */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="hidden grid-cols-1 gap-2.5 sm:grid sm:grid-cols-3"
        >
          <StatCard
            label="Sequência"
            value={<CountUp value={streak} /> as unknown as string}
            unit="dias"
            delta={sessionsDelta > 0 ? `+${sessionsDelta} vs sem. passada` : 'mantenha o ritmo'}
            deltaDirection={sessionsDelta > 0 ? 'up' : 'flat'}
            icon={Flame}
            tone="peach"
            spark={<StreakFlame active={streak > 0} />}
          />
          <StatCard
            label="Treinos"
            value={<CountUp value={thisWeek?.sessions ?? 0} /> as unknown as string}
            unit="/sem"
            delta={
              user?.availableDaysPerWeek != null
                ? thisWeek?.sessions != null && thisWeek.sessions >= user.availableDaysPerWeek
                  ? `meta ${user.availableDaysPerWeek} atingida`
                  : `meta ${user.availableDaysPerWeek} / sem`
                : 'sem meta definida'
            }
            deltaDirection={
              user?.availableDaysPerWeek != null && thisWeek?.sessions != null && thisWeek.sessions >= user.availableDaysPerWeek
                ? 'up'
                : 'flat'
            }
            icon={Dumbbell}
            tone="rose"
            spark={<BarsSparkline values={weekly.map((w) => w.sessions)} color="#e6447a" />}
          />
          <StatCard
            label="Volume"
            value={
              thisWeek && thisWeek.volumeKg >= 1000
                ? `${(thisWeek.volumeKg / 1000).toFixed(thisWeek.volumeKg >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`
                : `${Math.round(thisWeek?.volumeKg ?? 0)}`
            }
            unit="kg"
            delta={volumeDelta != null ? `${volumeDelta >= 0 ? '+' : ''}${volumeDelta}% vs sem. passada` : 'sem comparação'}
            deltaDirection={volumeDelta == null ? 'flat' : volumeDelta >= 0 ? 'up' : 'down'}
            icon={TrendingUp}
            tone="mint"
            spark={<LineSparkline values={weekly.map((w) => w.volumeKg)} color="#0a8a4a" />}
          />
        </motion.div>
        </>
      )}

      {/* ──────── HEATMAP ────────────────────────────────────────────── */}
      {isAuthenticated && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              <Calendar size={12} />
              Últimos 30 dias
            </h3>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--muted)]">
              <span>menos</span>
              <div className="flex gap-[3px]">
                {heatColors.map((c, i) => (
                  <span
                    key={i}
                    className="block h-[9px] w-[9px] rounded-[2px] border border-black/5"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <span>mais</span>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(15,_1fr)] gap-1 sm:grid-cols-[repeat(30,_1fr)]">
            {heatmap.map((cell) => (
              <div
                key={cell.iso}
                title={`${cell.day} · ${cell.sessions > 0 ? `${cell.sessions} sessão${cell.sessions > 1 ? 'ões' : ''}, ${cell.minutes}min` : 'descanso'}`}
                className="aspect-square rounded-[3px] border border-black/[0.025] transition-transform hover:scale-[1.5] hover:z-10"
                style={{ background: heatColors[cell.intensity] }}
              />
            ))}
          </div>

          <div className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            <span>{heatmap[0]?.day}</span>
            <span>
              {heatmapTotalSessions} sessões · {heatmapHours}h {heatmapMins}m
            </span>
            <span>{heatmap[heatmap.length - 1]?.day}</span>
          </div>
        </motion.section>
      )}

      {/* ──────── ÚLTIMO TREINO ──────────────────────────────────────── */}
      {isAuthenticated && lastWorkout && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--brand)]/40 hover:shadow-[0_14px_26px_-22px_rgba(255,90,60,0.35)]"
        >
          <div className="flex min-w-0 items-center gap-3">
            {/* Rotating dashed ring around the icon — the "lab/scientific" feel */}
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-[var(--brand)]/20"
              style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand) 20%, var(--surface)), color-mix(in srgb, var(--brand) 32%, var(--surface)))' }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-[3px] rounded-[13px] border border-dashed border-[var(--brand)]/30"
                style={{ animation: 'tech-spin 14s linear infinite' }}
              />
              <Activity size={18} className="relative z-10 text-[var(--brand-strong)]" />
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand)]" aria-hidden />
                Último treino · {relativeBigDate(lastWorkout.endedAt)}
              </p>
              <p className="mt-0.5 truncate text-[16px] font-semibold tracking-tight text-[var(--text)]">
                {lastWorkout.name}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 font-mono text-[11px] text-[var(--muted)]">
                <span><b className="font-semibold text-[var(--text)]">{lastWorkout.exerciseCount}</b> ex</span>
                <span><b className="font-semibold text-[var(--text)]">{lastWorkout.minutes}</b> min</span>
                {lastWorkout.totalVolume > 0 && (
                  <span>
                    <b className="font-semibold text-[var(--text)]">
                      {lastWorkout.totalVolume >= 1000
                        ? `${(lastWorkout.totalVolume / 1000).toFixed(1).replace(/\.0$/, '')}k`
                        : Math.round(lastWorkout.totalVolume)}
                    </b>{' '}
                    kg vol
                  </span>
                )}
                {lastWorkout.avgRpe != null && (
                  <span>RPE <b className="font-semibold text-[var(--text)]">{lastWorkout.avgRpe.toFixed(1)}</b></span>
                )}
              </div>
            </div>
          </div>
          <Link
            to="/history"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            Ver
            <ArrowRight size={12} />
          </Link>
        </motion.div>
      )}

      {/* ──────── ACESSOS RÁPIDOS ────────────────────────────────────── */}
      <SectionHead title="Acessos" accent="rápidos" sub="Atalhos · 02" />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18 }}
        className="grid gap-2.5 sm:grid-cols-2"
      >
        <Link
          to={isAuthenticated ? '/train' : '/login'}
          className="group relative overflow-hidden rounded-2xl border border-[var(--line)] p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-22px_rgba(40,15,5,0.28)]"
          style={{ background: 'linear-gradient(135deg, var(--surface) 40%, color-mix(in srgb, var(--brand) 16%, var(--surface)) 140%)' }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-7 -top-7 h-32 w-32 rounded-full"
            style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--brand) 12%, transparent), transparent 70%)' }}
          />
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            <Zap size={11} />
            Atalho 01
          </span>
          <h4 className="mt-1.5 text-[18px] font-semibold tracking-tight text-[var(--text)]">Explorar treinos</h4>
          <p className="mt-1 max-w-[320px] text-[13px] text-[var(--muted)]">
            Escolha exercícios e monte sua sessão agora.
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wide text-[var(--brand-strong)]">
            Abrir agora <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          to={isAuthenticated ? '/ai-workout' : '/login'}
          className="group relative overflow-hidden rounded-2xl border border-[var(--line)] p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-22px_rgba(40,15,5,0.28)]"
          style={{ background: 'linear-gradient(135deg, var(--surface) 40%, color-mix(in srgb, var(--accent-violet) 18%, var(--surface)) 140%)' }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-7 -top-7 h-32 w-32 rounded-full"
            style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--accent-violet) 16%, transparent), transparent 70%)' }}
          />
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            <Bot size={11} />
            Atalho 02
          </span>
          <h4 className="mt-1.5 text-[18px] font-semibold tracking-tight text-[var(--text)]">IA</h4>
          <p className="mt-1 max-w-[320px] text-[13px] text-[var(--muted)]">
            Gere um treino inteligente baseado nos seus objetivos.
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wide text-violet-600 dark:text-violet-400">
            Gerar treino <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </motion.div>

      {/* ──────── RECOMENDAÇÕES ──────────────────────────────────────── */}
      <SectionHead
        title={`${topRecommendations.length} recomendações de`}
        accent="treino"
        sub={loading ? 'Atualizando…' : `Geradas hoje · ${liveTime.split(' · ').slice(-1)[0]}`}
      />
      {error && <p className="-mt-1 mb-2 text-xs text-amber-500">{error}</p>}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.22 }}
        className="grid gap-2.5 sm:grid-cols-2"
      >
        {topRecommendations.map((rec, idx) => {
          const main = rec.sessions[0]
          const division = normalizeDivisionLabel(rec.division)
          const preview = main?.exercises.slice(0, 3) ?? []
          // Synthetic match score — backend doesn't return one yet, so we derive
          // a stable pseudo-value from index so cards don't all show 92%.
          const matchScore = 92 - idx * 5

          return (
            <article
              key={`${division}-${idx}`}
              className="group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--brand)]/40 hover:shadow-[0_18px_30px_-22px_rgba(255,90,60,0.35)]"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  Recomendação <span className="text-[var(--brand-strong)]">{String(idx + 1).padStart(2, '0')}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-2 py-[3px] font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-strong)]">
                  <span
                    className="block h-1.5 w-1.5 rounded-full bg-[var(--brand)]"
                    style={{ animation: 'tech-pulse 1.6s ease-out infinite' }}
                    aria-hidden
                  />
                  IA · Match {matchScore}%
                </span>
              </div>

              <h3 className="text-[17px] font-semibold tracking-tight text-[var(--text)]">{division}</h3>
              <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--muted)]">{rec.rationale}</p>

              {/* Nested "first session" card */}
              <div className="mt-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Primeira sessão
                  </span>
                  <span className="text-[12.5px] font-semibold text-[var(--text)]">
                    Dia {main?.dayNumber ?? 1} · {main?.focus ?? 'Sessão'}
                  </span>
                </div>
                <ul className="m-0 list-none space-y-0 p-0">
                  {preview.map((ex, i) => (
                    <li
                      key={ex.id}
                      className={`flex items-center justify-between py-1.5 text-[12px] ${i > 0 ? 'border-t border-dashed border-[var(--line)]' : ''}`}
                    >
                      <span className="text-[var(--text)]">{ex.name}</span>
                      <span className="font-mono text-[11px] text-[var(--muted)]">
                        {ex.sets}×{ex.reps} · {ex.restSeconds}s
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 flex gap-1.5">
                <Link
                  to={isAuthenticated ? '/train' : '/login'}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--brand-strong)]"
                >
                  <Play size={12} fill="currentColor" />
                  Começar treino
                </Link>
                <Link
                  to={isAuthenticated ? '/history' : '/login'}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
                >
                  Ver histórico
                </Link>
              </div>
            </article>
          )
        })}
      </motion.div>

    </section>
  )
}
