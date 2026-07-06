import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageViewer } from '../components/common/ImageViewer'
import { Skeleton } from '../components/common/Skeleton'
import { useScrollLock } from '../hooks/useScrollLock'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceDot,
} from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { optimizeImageFileToDataUrl } from '../lib/image/image-processing'
import { searchExercisesForPlan } from '../services/workoutService'
import {
  addPinnedExercise,
  createBodyMeasurement,
  deleteBodyMeasurement,
  getProgressSummary,
  removePinnedExercise,
  reorderPinnedExercises,
} from '../services/progressService'
import {
  bodyMeasurementsCache,
  currentYearProgressSummaryCache,
  exerciseProgressCache,
} from '../lib/cache/progress-cache'
import type {
  BodyMeasurement,
  CreateBodyMeasurementInput,
  ExerciseProgressItem,
  ExerciseProgressSession,
  ProgressSummaryDay,
  ProgressSummaryResponse,
} from '../types/progress'
import type { ExerciseOption } from '../types/workout'
import {
  Activity, ArrowLeft, ChevronDown, Download, Dumbbell, GripVertical, Image as ImageIcon, Pin, Plus, Search, Share2,
  Trash2, TrendingUp, X as XIcon,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  formatDateTime, formatShortDate, daysAgoFrom, nowMs, toNumberOrUndefined,
  muscleTone, TONE_STYLE, computeVolume7D, computeCardio7D, volumeByWeek,
  cardioMinutesByWeek, prsByMonth, pctDelta, buildHeatmap, MUSCLE_LABEL_PT,
  type HeatmapCell,
} from './progress/progress-utils'

// ─── Formatters e helpers puros vivem em progress/progress-utils.ts ─────────

function MuscleVolumeCard({ rows }: { rows: Array<{ group: string; volumeKg: number }> }) {
  const total = rows.reduce((s, r) => s + r.volumeKg, 0)

  if (total === 0) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <h3 className="text-[14px] font-semibold text-[var(--text)]">Distribuição por grupo (30D)</h3>
        <p className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
          Sem volume registrado nos últimos 30 dias.
        </p>
      </motion.section>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h3 className="text-[14px] font-semibold text-[var(--text)]">Distribuição por grupo</h3>
        <span className="text-[11px] font-medium text-[var(--muted)]">
          Últimos 30 dias · {total.toLocaleString('pt-BR')} kg
        </span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => {
          const pct = total === 0 ? 0 : Math.round((row.volumeKg / total) * 100)
          const tone = TONE_STYLE[muscleTone(row.group)]
          const label = MUSCLE_LABEL_PT[row.group] ?? row.group
          return (
            <div key={row.group} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: tone.dot }} />
                  <b className="truncate font-semibold text-[var(--text)]">{label}</b>
                </span>
                <span className="shrink-0 tabular-nums text-[var(--muted)]">
                  {row.volumeKg.toLocaleString('pt-BR')} kg
                  <span className="ml-2 inline-block w-9 text-right font-semibold text-[var(--text)]">{pct}%</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: tone.dot }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </motion.section>
  )
}

// ─── Recent PRs feed ──────────────────────────────────────────────────────

type RecentPr = {
  exerciseId: string
  exerciseName: string
  primaryMuscleGroup: string
  loadKg: number
  reps: number | null
  date: Date
  // How many PRs this exercise has in total. Used to decide whether the row
  // is worth expanding (1 PR = nothing extra to show, so no chevron).
  historyCount: number
}

// One row per exercise: its best (latest) PR, dated when it was set. Deduping
// here is what keeps the expand keyed by exerciseId unambiguous — otherwise the
// same exercise appears in several rows and clicking one expands them all.
function listRecentPrs(progress: ExerciseProgressItem[], limit: number): RecentPr[] {
  const prs: RecentPr[] = []
  for (const item of progress) {
    const sorted = [...item.sessions].sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    )
    let best: RecentPr | null = null
    let runningMax = -Infinity
    let historyCount = 0
    for (const s of sorted) {
      const load = s.maxLoadKg ?? 0
      if (load > runningMax && load > 0) {
        historyCount += 1
        best = {
          exerciseId: item.exercise.id,
          exerciseName: item.exercise.name,
          primaryMuscleGroup: item.exercise.primaryMuscleGroup,
          loadKg: load,
          reps: s.maxReps,
          date: new Date(s.completedAt),
          historyCount: 0, // filled in below once the total is known
        }
        runningMax = load
      }
    }
    if (best) prs.push({ ...best, historyCount })
  }
  return prs.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit)
}

// Builds the full sequence of PRs (load + delta) for one exercise so we
// can expand a single row in the recent-PRs feed into its full history.
type PrTimelineEntry = { date: Date; loadKg: number; reps: number | null; deltaKg: number | null }
function listAllPrsForExercise(item: ExerciseProgressItem): PrTimelineEntry[] {
  const sorted = [...item.sessions].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  )
  const entries: PrTimelineEntry[] = []
  let prev = 0
  for (const s of sorted) {
    const load = s.maxLoadKg ?? 0
    if (load > prev && load > 0) {
      entries.push({
        date: new Date(s.completedAt),
        loadKg: load,
        reps: s.maxReps,
        deltaKg: prev > 0 ? Number((load - prev).toFixed(1)) : null,
      })
      prev = load
    }
  }
  return entries.reverse() // newest first
}

function RecentPrsCard({ progress }: { progress: ExerciseProgressItem[] }) {
  const prs = useMemo(() => listRecentPrs(progress, 8), [progress])
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null)
  const expandedProgress = useMemo(
    () => (expandedExerciseId ? progress.find((p) => p.exercise.id === expandedExerciseId) ?? null : null),
    [expandedExerciseId, progress],
  )
  const expandedTimeline = useMemo(
    () => (expandedProgress ? listAllPrsForExercise(expandedProgress) : []),
    [expandedProgress],
  )

  // Cada exercício mostra seu PR atual como card dourado "Novo recorde".
  // Abrir a seta revela até os 4 PRs que o usuário bateu ANTES desse, naquele
  // mesmo exercício (a progressão anterior), do mais recente pro mais antigo.
  const renderPr = (pr: RecentPr, idx: number) => {
    const daysAgo = daysAgoFrom(pr.date)
    // PRs anteriores = a timeline completa menos o recorde atual (entrada 0).
    const previousPrs =
      expandedExerciseId === pr.exerciseId ? expandedTimeline.slice(1, 5) : []
    // Só vale mostrar a seta quando há PRs anteriores pra revelar.
    const canExpand = pr.historyCount > 1
    const isExpanded = canExpand && expandedExerciseId === pr.exerciseId
    return (
      <li key={`${pr.exerciseId}-${pr.date.toISOString()}-${idx}`}>
        <button
          type="button"
          onClick={canExpand ? () => setExpandedExerciseId(isExpanded ? null : pr.exerciseId) : undefined}
          aria-expanded={canExpand ? isExpanded : undefined}
          className={`flex w-full items-center gap-3 rounded-[12px] border border-amber-300/50 bg-amber-50 px-3 py-2.5 text-left transition-colors dark:border-amber-500/25 dark:bg-amber-500/10 ${canExpand ? 'hover:bg-amber-100/70 dark:hover:bg-amber-500/15' : 'cursor-default'} ${isExpanded ? 'ring-2 ring-amber-300/60 dark:ring-amber-500/30' : ''}`}
        >
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-400 text-[14px] font-bold text-amber-900"
            aria-hidden
          >
            ★
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-[var(--text)]">{pr.exerciseName}</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              <span className="font-semibold text-amber-600 dark:text-amber-400">Novo recorde · </span>
              {MUSCLE_LABEL_PT[pr.primaryMuscleGroup] ?? pr.primaryMuscleGroup}
              <span className="mx-1.5 opacity-50">·</span>
              há {daysAgo}d
            </p>
          </div>
          <span className="shrink-0 text-right tabular-nums">
            <b className="text-[14px] font-semibold text-[var(--text)]">{pr.loadKg}</b>
            <span className="ml-1 text-[10px] text-[var(--muted)]">kg</span>
            {pr.reps != null && <span className="ml-2 text-[10.5px] text-[var(--muted)]">× {pr.reps}</span>}
          </span>
          {canExpand && (
            <ChevronDown
              size={14}
              className={`shrink-0 text-[var(--muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          )}
        </button>
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="timeline"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <p className="mb-1 mt-2 pl-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                PRs anteriores
              </p>
              <ol className="mb-1 space-y-1 border-l-2 border-amber-300/40 pl-3 dark:border-amber-500/25">
                {previousPrs.map((entry, i) => (
                  <li
                    key={`${entry.date.toISOString()}-${i}`}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-[var(--muted)]"
                  >
                    <b className="text-[var(--text)]">
                      {entry.loadKg}
                      <span className="ml-0.5 text-[9.5px] text-[var(--muted)]">kg</span>
                    </b>
                    {entry.reps != null && <span className="text-[10px]">× {entry.reps}</span>}
                    <span className="opacity-50">·</span>
                    <span>{entry.date.toLocaleDateString('pt-BR')}</span>
                    {entry.deltaKg != null && entry.deltaKg > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">▲ +{entry.deltaKg}kg</span>
                    )}
                    {entry.deltaKg == null && (
                      <span className="text-[9.5px] uppercase tracking-wider opacity-70">primeiro PR</span>
                    )}
                  </li>
                ))}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </li>
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.12 }}
      className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
    >
      <div className="mb-3 flex items-end justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-[var(--text)]">Últimos PRs</h3>
        <span className="text-[11px] font-medium text-[var(--muted)]">
          {prs.length} {prs.length === 1 ? 'recorde' : 'recordes'}
        </span>
      </div>
      {prs.length === 0 ? (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
          Sem PRs ainda. Bata uma carga maior que qualquer sessão anterior e ela aparece aqui.
        </p>
      ) : (
        <ul className="space-y-2">
          {prs.map((pr, idx) => renderPr(pr, idx))}
        </ul>
      )}
    </motion.section>
  )
}

// ─── Body metric chart (peso, IMC, BF%) ───────────────────────────────────

type BodyRange = '1M' | '3M' | '6M' | '1A' | 'TUDO'
const BODY_RANGE_DAYS: Record<Exclude<BodyRange, 'TUDO'>, number> = { '1M': 30, '3M': 90, '6M': 180, '1A': 365 }

function BodyMetricChart({
  measurements,
  field,
  label,
  unit,
  gradientId,
  delay,
}: {
  measurements: BodyMeasurement[]
  field: 'weight' | 'bmi' | 'bodyFatPercentage'
  label: string
  unit: string
  gradientId: string
  delay: number
}) {
  const [range, setRange] = useState<BodyRange>('TUDO')

  // Sort oldest-first, drop entries without this metric (it's optional in
  // every measurement except `weight`).
  const all = useMemo(
    () =>
      measurements
        .filter((m) => m[field] != null)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [measurements, field],
  )

  const filtered = useMemo(() => {
    if (range === 'TUDO') return all
    const cutoff = nowMs() - BODY_RANGE_DAYS[range] * 86_400_000
    return all.filter((m) => new Date(m.date).getTime() >= cutoff)
  }, [all, range])

  const data = filtered.map((m) => ({ date: formatShortDate(new Date(m.date)), value: m[field] as number }))
  const first = filtered[0]
  const last = filtered[filtered.length - 1]
  const delta = first && last && first.id !== last.id
    ? Number(((last[field] as number) - (first[field] as number)).toFixed(1))
    : null

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-[var(--text)]">{label}</h3>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            {all.length} {all.length === 1 ? 'REGISTRO' : 'REGISTROS'}
          </span>
          <div className="inline-flex rounded-md border border-[var(--line)] bg-[var(--surface-hover)] p-[2px]">
            {(['1M', '3M', '6M', '1A', 'TUDO'] as BodyRange[]).map((r) => {
              const active = r === range
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`rounded px-2 py-[3px] font-mono text-[10px] font-semibold tracking-wide transition-colors ${
                    active ? 'bg-[var(--brand)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {r}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {all.length < 2 ? (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
          Registre pelo menos 2 medições com {label.toLowerCase()} para ver a evolução.
        </p>
      ) : data.length < 2 ? (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
          Sem dados nesse período. Tente um intervalo mais longo.
        </p>
      ) : (
        <div className="h-[160px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={data} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                axisLine={false}
                tickLine={false}
                width={36}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ background: '#0e0f12', border: '0', borderRadius: 8, fontSize: 11, color: '#fff', padding: '7px 9px' }}
                itemStyle={{ color: 'var(--brand)' }}
                labelStyle={{ color: '#a4a6ad', fontSize: 10, marginBottom: 2 }}
                formatter={(v) => [`${v ?? '—'}${unit ? ` ${unit}` : ''}`, label] as [string, string]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--brand)"
                strokeWidth={2}
                dot={{ r: 3, fill: '#fff', stroke: 'var(--brand)', strokeWidth: 1.6 }}
                activeDot={{ r: 5, fill: 'var(--brand)', stroke: '#fff', strokeWidth: 2 }}
                animationDuration={900}
                fill={`url(#${gradientId})`}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {last && (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <MeasTile label="Atual" value={String(last[field])} unit={unit} />
          {delta != null && (
            <MeasTile
              label={`Variação · ${range}`}
              value={`${delta > 0 ? '+' : ''}${delta}`}
              unit={unit}
              // For weight/BF, going down is usually positive feedback for the
              // user; IMC the same. So we tint accordingly across all 3 metrics.
              tone={delta < 0 ? 'down' : delta > 0 ? 'up' : undefined}
            />
          )}
        </div>
      )}
    </motion.section>
  )
}

const HEATMAP_LEVELS = ['var(--surface-hover)', 'rgba(255,90,60,0.20)', 'rgba(255,90,60,0.42)', 'rgba(255,90,60,0.65)', 'rgba(255,90,60,0.88)']

function cellLevel(volumeKg: number, max: number): number {
  if (volumeKg <= 0) return 0
  if (max <= 0) return 0
  const ratio = volumeKg / max
  if (ratio < 0.25) return 1
  if (ratio < 0.5) return 2
  if (ratio < 0.8) return 3
  return 4
}

function YearActivityHeatmap({
  days, year, availableYears, onYearChange, loading,
}: {
  days: ProgressSummaryDay[]
  year: number
  availableYears: number[]
  onYearChange: (year: number) => void
  loading?: boolean
}) {
  const { columns, months } = useMemo(() => buildHeatmap(days, year), [days, year])
  const todayIso = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.toISOString().slice(0, 10)
  }, [])
  const maxVolume = useMemo(
    () => columns.reduce((m, col) => col.reduce((mm, c) => Math.max(mm, c.volumeKg), m), 0),
    [columns],
  )
  const [hovered, setHovered] = useState<HeatmapCell | null>(null)

  const totalSessions = useMemo(
    () => columns.reduce((s, col) => s + col.reduce((ss, c) => ss + c.sessionCount, 0), 0),
    [columns],
  )

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.06 }}
      className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-[var(--text)]">
            Atividade · {year}
            {loading && <span className="ml-2 font-mono text-[10px] text-[var(--muted)]">carregando…</span>}
          </h3>
          <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--muted)]">
            {totalSessions} {totalSessions === 1 ? 'sessão' : 'sessões'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Year pills — small enough to fit alongside the legend on lg. */}
          <div className="inline-flex rounded-md border border-[var(--line)] bg-[var(--surface-hover)] p-[2px]">
            {availableYears.map((y) => {
              const active = y === year
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => onYearChange(y)}
                  className={`rounded px-2 py-[3px] font-mono text-[10.5px] font-semibold tracking-wide transition-colors ${
                    active ? 'bg-[var(--brand)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {y}
                </button>
              )
            })}
          </div>
          <div className="hidden items-center gap-1.5 font-mono text-[10px] text-[var(--muted)] sm:flex">
            <span>Menos</span>
            {HEATMAP_LEVELS.map((bg, i) => (
              <span
                key={i}
                className="block h-2.5 w-2.5 rounded-[2px] border border-[var(--line)]"
                style={{ background: bg }}
              />
            ))}
            <span>Mais</span>
          </div>
        </div>
      </div>

      {/* Horizontal scroll on small screens so the full year stays legible.
          Fades at both edges hint at scrollability (more discoverable on
          mobile, less visual clutter than a scrollbar). */}
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-[var(--surface)] to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-[var(--surface)] to-transparent"
        />
      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="inline-flex gap-[3px] px-1" onMouseLeave={() => setHovered(null)}>
          {/* Days-of-week column (S T Q S labels every other row) */}
          <div className="mr-1 hidden flex-col justify-between py-[14px] sm:flex">
            {['', 'Seg', '', 'Qua', '', 'Sex', ''].map((label, i) => (
              <span key={i} className="block h-2.5 font-mono text-[9px] leading-[10px] text-[var(--muted)]">
                {label}
              </span>
            ))}
          </div>

          <div className="relative">
            {/* Month labels row */}
            <div className="relative h-3.5">
              {months.map((m) => (
                <span
                  key={`${m.label}-${m.columnIndex}`}
                  className="absolute top-0 font-mono text-[9.5px] uppercase tracking-wider text-[var(--muted)]"
                  style={{ left: m.columnIndex * (10 + 3) }}
                >
                  {m.label}
                </span>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {columns.map((week, colIdx) => (
                <div key={colIdx} className="flex flex-col gap-[3px]">
                  {week.map((cell) => {
                    const isFuture = cell.isoKey > todayIso
                    const lvl = cellLevel(cell.volumeKg, maxVolume)
                    return (
                      <button
                        key={cell.isoKey}
                        type="button"
                        disabled={isFuture}
                        onMouseEnter={() => setHovered(cell)}
                        onFocus={() => setHovered(cell)}
                        className="block h-2.5 w-2.5 rounded-[2px] border transition-transform hover:scale-125 disabled:cursor-default disabled:opacity-40"
                        style={{
                          background: isFuture ? 'transparent' : HEATMAP_LEVELS[lvl],
                          borderColor: isFuture ? 'transparent' : 'var(--line)',
                        }}
                        aria-label={`${cell.date.toLocaleDateString('pt-BR')} · ${cell.sessionCount} sessão`}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Hover tooltip footer — keeps the layout stable instead of using a
          floating tooltip that fights the horizontal scroll container. */}
      <div className="mt-2 min-h-[18px] font-mono text-[11px] text-[var(--muted)]">
        {hovered ? (
          hovered.sessionCount > 0 ? (
            <span>
              <b className="text-[var(--text)]">
                {hovered.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </b>
              {' · '}
              {hovered.sessionCount} {hovered.sessionCount === 1 ? 'sessão' : 'sessões'}
              {' · '}
              {hovered.exerciseCount} exercícios
              {' · '}
              vol {hovered.volumeKg.toLocaleString('pt-BR')}kg
            </span>
          ) : (
            <span>
              {hovered.date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} · sem treino
            </span>
          )
        ) : (
          <span>Passe o mouse sobre um quadrado para ver o dia.</span>
        )}
      </div>
    </motion.section>
  )
}

// New PR within the current month per pinned exercise. A "PR" here is a
// session whose maxLoadKg strictly exceeds the max of every earlier session
// for that same exercise.
function computePRsThisMonth(progress: ExerciseProgressItem[]): number {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  let count = 0
  for (const item of progress) {
    const sorted = [...item.sessions].sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    )
    let runningMax = -Infinity
    for (const s of sorted) {
      const load = s.maxLoadKg ?? 0
      if (load > runningMax) {
        const d = new Date(s.completedAt)
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) count += 1
        runningMax = load
      }
    }
  }
  return count
}

function computeStreak(days: ProgressSummaryDay[]): number {
  const set = new Set(days.filter((d) => d.sessionCount > 0).map((d) => d.date))
  let count = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!set.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1)
  while (set.has(cursor.toISOString().slice(0, 10))) {
    count++
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

function lastSessionDate(progress: ExerciseProgressItem[], days: ProgressSummaryDay[]): Date | null {
  let latest = 0
  for (const item of progress) {
    for (const s of item.sessions) {
      const t = new Date(s.completedAt).getTime()
      if (t > latest) latest = t
    }
  }
  for (const d of days) {
    if (d.sessionCount === 0) continue
    const t = new Date(d.date).getTime()
    if (t > latest) latest = t
  }
  return latest > 0 ? new Date(latest) : null
}

// ─── ExerciseCard subcomponent ────────────────────────────────────────────

type RangeFilter = '1M' | '3M' | '1A'
const RANGE_DAYS: Record<RangeFilter, number> = { '1M': 30, '3M': 90, '1A': 365 }

function filterSessionsByRange(sessions: ExerciseProgressSession[], range: RangeFilter): ExerciseProgressSession[] {
  const cutoff = Date.now() - RANGE_DAYS[range] * 86_400_000
  return sessions.filter((s) => new Date(s.completedAt).getTime() >= cutoff)
}

// Custom tooltip for the load chart — surfaces reps + volume context alongside
// the highlighted weight, and badges the PR session in gold.
type LoadPoint = {
  date: string
  load: number
  reps: number | null
  volume: number 
  isPr: boolean
  completedAt: string
}

// Minimal shape recharts feeds into a custom `content` Tooltip. We type it
// locally instead of importing `TooltipProps` from recharts because that
// generic's payload shape changed between major versions of the lib.
type LoadTooltipProps = {
  active?: boolean
  payload?: Array<{ payload?: LoadPoint }>
  metric?: 'load' | 'volume'
}

function LoadTooltip({ active, payload, metric = 'load' }: LoadTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0]?.payload
  if (!p) return null
  const big = metric === 'load' ? p.load : p.volume
  return (
    <div
      className="rounded-lg border-0 bg-[#0e0f12] px-3 py-2 font-mono text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.5)]"
      style={{ fontSize: 11 }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-[15px] font-semibold tracking-tight text-[var(--brand)]">
          {big.toLocaleString('pt-BR')}
        </span>
        <span className="text-[10px] text-[#a4a6ad]">kg</span>
        {metric === 'load' && p.isPr && (
          <span
            className="ml-1 rounded-full px-1.5 py-[1px] text-[9px] font-semibold tracking-wider"
            style={{ background: '#f4c443', color: '#5a4209' }}
          >
            ★ PR
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] tracking-wide text-[#a4a6ad]">
        <span>{p.date}</span>
        {metric === 'load' ? (
          <>
            {p.reps != null && (
              <>
                <span className="opacity-40">·</span>
                <span>{p.reps} reps</span>
              </>
            )}
            {p.volume > 0 && (
              <>
                <span className="opacity-40">·</span>
                <span>{p.volume.toLocaleString('pt-BR')}kg vol</span>
              </>
            )}
          </>
        ) : (
          <>
            <span className="opacity-40">·</span>
            <span>carga {p.load}kg</span>
            {p.reps != null && (
              <>
                <span className="opacity-40">·</span>
                <span>{p.reps} reps</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ExerciseCard({
  item, open, onToggle, onRemove, dragHandleProps, isDragging, isDropTarget, onMove,
}: {
  item: ExerciseProgressItem
  open: boolean
  onToggle: () => void
  onRemove: () => void
  dragHandleProps?: {
    draggable: boolean
    onDragStart: (e: React.DragEvent) => void
    onDragEnd: () => void
  }
  isDragging?: boolean
  isDropTarget?: boolean
  onMove?: (direction: 'up' | 'down') => void
}) {
  const tone = muscleTone(item.exercise.primaryMuscleGroup)
  const style = TONE_STYLE[tone]
  const [range, setRange] = useState<RangeFilter>('3M')
  const [metric, setMetric] = useState<'load' | 'volume'>('load')

  const sortedAsc = useMemo(
    () => [...item.sessions].sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()),
    [item.sessions],
  )

  // Compute the all-time PR + identify which session id holds it (for the
  // gold dot on the chart). Ties resolve to the earliest session.
  const prInfo = useMemo(() => {
    let prLoad = 0
    let prSessionId: string | null = null
    let prDate = ''
    for (const s of sortedAsc) {
      const load = s.maxLoadKg ?? 0
      if (load > prLoad) {
        prLoad = load
        prSessionId = s.workoutSessionId
        prDate = s.completedAt
      }
    }
    return { prLoad, prSessionId, prDate }
  }, [sortedAsc])

  const ranged = useMemo(() => filterSessionsByRange(sortedAsc, range), [sortedAsc, range])

  // Chart data — one point per DAY, anchored on the heaviest set lifted that
  // day. Without this, days with multiple training sessions (e.g. 29/04 with
  // a 40kg warm-up plus a 42kg PR) would plot 3-4 separate dots at the same
  // date, hiding the PR and showing the X-axis with duplicate "29/04" labels.
  //
  // Volume in the tooltip is the SUM across all sessions of that day so the
  // user sees the daily total, not just the volume of the PR session alone.
  // Bodyweight sessions (maxLoadKg == null) are excluded — they'd plot as 0
  // and tank the y-axis. They still appear in the "Histórico recente" list.
  const chartData = useMemo(() => {
    const filtered = ranged.filter((s) => s.maxLoadKg != null && s.maxLoadKg > 0)
    if (filtered.length === 0) return []

    type DayBucket = {
      heaviest: ExerciseProgressSession
      volumeSum: number
    }
    const byDay = new Map<string, DayBucket>()
    for (const s of filtered) {
      const dayKey = s.completedAt.slice(0, 10) // YYYY-MM-DD
      const cur = byDay.get(dayKey)
      const load = s.maxLoadKg as number
      const heaviestLoad = (cur?.heaviest.maxLoadKg as number | undefined) ?? -Infinity
      if (!cur) {
        byDay.set(dayKey, { heaviest: s, volumeSum: s.totalVolumeKg })
      } else if (load > heaviestLoad) {
        byDay.set(dayKey, { heaviest: s, volumeSum: cur.volumeSum + s.totalVolumeKg })
      } else {
        cur.volumeSum += s.totalVolumeKg
      }
    }

    return Array.from(byDay.values())
      .sort(
        (a, b) =>
          new Date(a.heaviest.completedAt).getTime() - new Date(b.heaviest.completedAt).getTime(),
      )
      .map(({ heaviest, volumeSum }) => ({
        date: formatShortDate(new Date(heaviest.completedAt)),
        load: heaviest.maxLoadKg as number,
        reps: heaviest.maxReps,
        volume: Math.round(volumeSum),
        isPr: heaviest.workoutSessionId === prInfo.prSessionId,
        completedAt: heaviest.completedAt,
      }))
    // React Compiler infers the whole `prInfo` object as the dep, not just
    // `.prSessionId`, so we match that to keep manual memoization preserved.
  }, [ranged, prInfo])

  // Domain hint for the YAxis. We want the actual data to occupy ~60-70% of
  // the vertical area; with a flat 2kg padding (the old version) a session
  // history of 40-42kg would only fill 33% of the chart and the 2kg jump
  // looked invisible. So padding now scales with the data range:
  //
  //   range = 0    → small band around the value (line stays centered)
  //   range ≤ 5    → tight 0.5kg padding so 2-3kg jumps read clearly
  //   range ≤ 30   → 1kg padding
  //   range > 30   → ~10% of the spread (max with a floor of 2)
  const yDomain = useMemo<[number | string, number | string]>(() => {
    if (chartData.length === 0) return [0, 'auto']
    const values = chartData.map((d) => (metric === 'load' ? d.load : d.volume))
    const min = Math.min(...values)
    const max = Math.max(...values)
    const dataRange = max - min

    let padding: number
    if (dataRange === 0) {
      padding = Math.max(2, Math.round(min * 0.05))
    } else if (dataRange <= 5) {
      padding = 0.5
    } else if (dataRange <= 30) {
      padding = 1
    } else {
      padding = Math.max(2, Math.round(dataRange * 0.1))
    }

    return [Math.max(0, min - padding), max + padding]
  }, [chartData, metric])

  // Mini sparkline path (62×22) — collapsed-card trend indicator.
  const sparkPath = useMemo(() => {
    if (sortedAsc.length === 0) return { d: '', delta: 0 }
    const tail = sortedAsc.slice(-8)
    const vals = tail.map((s) => s.maxLoadKg ?? 0)
    const max = Math.max(...vals, 1)
    const min = Math.min(...vals, 0)
    const range = Math.max(1, max - min)
    const W = 62, H = 22
    const step = W / Math.max(1, vals.length - 1)
    const d = vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(H - 2 - ((v - min) / range) * (H - 4)).toFixed(1)}`)
      .join(' ')
    const first = vals[0]
    const last = vals[vals.length - 1]
    const delta = first > 0 ? Math.round(((last - first) / first) * 100) : 0
    return { d, delta }
  }, [sortedAsc])

  const sparkColor = sparkPath.delta > 1 ? 'var(--brand)' : sparkPath.delta < -1 ? '#b94a3c' : 'var(--muted)'
  const deltaClass = sparkPath.delta > 1 ? 'text-[var(--brand-strong)]' : sparkPath.delta < -1 ? 'text-red-500' : 'text-[var(--muted)]'
  const deltaLabel = sparkPath.delta === 0 ? '±0%' : `${sparkPath.delta > 0 ? '+' : ''}${sparkPath.delta}%`

  // Streak detection: consecutive sessions where load did not regress.
  let streakSessions = 0
  for (let i = sortedAsc.length - 1; i > 0; i--) {
    if ((sortedAsc[i].maxLoadKg ?? 0) >= (sortedAsc[i - 1].maxLoadKg ?? 0)) streakSessions++
    else break
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`overflow-hidden rounded-2xl border bg-[var(--surface)] transition-all ${
        isDragging
          ? 'border-[var(--brand)] opacity-50'
          : isDropTarget
            ? 'border-[var(--brand)] shadow-[0_0_0_2px_var(--brand)] translate-y-[-2px]'
            : open
              ? 'border-[var(--brand)]/30 shadow-[0_18px_32px_-22px_rgba(40,15,5,0.30)]'
              : 'border-[var(--line)] hover:border-[var(--brand)]/30 hover:shadow-[0_14px_26px_-22px_rgba(40,15,5,0.25)]'
      }`}
    >
      <header
        className="grid cursor-pointer items-center gap-3 px-4 py-3.5 sm:grid-cols-[1fr_auto]"
        onClick={onToggle}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {dragHandleProps && (
            <span
              {...dragHandleProps}
              tabIndex={0}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                // Keyboard reorder: Shift+ArrowUp/Down moves the card up/down,
                // covering the mouse-only gap in native HTML5 DnD.
                if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                  e.preventDefault()
                  onMove?.(e.key === 'ArrowUp' ? 'up' : 'down')
                }
              }}
              className="grid h-7 w-5 shrink-0 cursor-grab place-items-center rounded text-[var(--muted)] outline-none transition-opacity hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 active:cursor-grabbing sm:opacity-40 sm:hover:opacity-100"
              title="Arrastar para reordenar (Shift+↑/↓ no teclado)"
              aria-label="Arrastar para reordenar. Use Shift mais setas para mover."
            >
              <GripVertical size={14} />
            </span>
          )}
          <span
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[10px] border"
            style={{ background: style.bg, borderColor: style.border, color: style.fg }}
            aria-hidden
          >
            <Dumbbell size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold tracking-tight text-[var(--text)]">
              {item.exercise.name}
            </p>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[5px] w-[5px] rounded-full" style={{ background: style.dot }} />
                {item.exercise.primaryMuscleGroup}
              </span>
              <span className="opacity-60">·</span>
              <span>{item.exercise.difficulty}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Mini sparkline + delta — hidden on small screens to save room */}
          {sortedAsc.length > 1 && (
            <div className="mr-1 hidden items-center gap-1.5 sm:flex" title="Tendência de carga">
              <svg viewBox="0 0 62 22" preserveAspectRatio="none" className="h-[22px] w-[62px]">
                <path
                  d={sparkPath.d}
                  fill="none"
                  stroke={sparkColor}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className={`font-mono text-[10.5px] font-semibold ${deltaClass}`}>{deltaLabel}</span>
            </div>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            aria-label={open ? 'Ocultar progresso' : 'Ver progresso'}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors sm:px-3 ${
              open
                ? 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                : 'border-[var(--brand)] bg-[var(--brand)] text-white hover:bg-[var(--brand-strong)]'
            }`}
          >
            {open ? <Plus size={12} className="rotate-45" /> : <TrendingUp size={12} />}
            <span className="hidden sm:inline">{open ? 'Ocultar progresso' : 'Ver progresso'}</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            aria-label="Remover dos fixados"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-transparent px-2.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] sm:px-3"
            title="Remover dos fixados"
          >
            <Trash2 size={12} />
            <span className="hidden sm:inline">Remover</span>
          </button>
          <span
            className={`grid h-[18px] w-[18px] place-items-center text-[var(--muted)] transition-transform ${
              open ? 'rotate-180 text-[var(--text)]' : ''
            }`}
          >
            <ChevronDown size={14} />
          </span>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-dashed border-[var(--line)] px-4 pb-4 pt-3.5 sm:px-5">
              {/* PR strip */}
              <div className="mb-3.5 flex flex-wrap items-center gap-2">
                {prInfo.prLoad > 0 && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold"
                    style={{
                      background: 'linear-gradient(180deg, #fff6d6, #ffe28a)',
                      borderColor: '#f1c84a',
                      color: '#6a4a00',
                      boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.04), 0 4px 10px -6px rgba(241,200,74,0.5)',
                    }}
                  >
                    <span
                      className="grid h-4 w-4 place-items-center rounded-full text-[10px]"
                      style={{ background: '#f4c443', color: '#5a4209' }}
                    >★</span>
                    PR {prInfo.prLoad} kg
                  </span>
                )}
                {streakSessions >= 2 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--brand-strong)]">
                    ▲ {streakSessions} sessões seguidas
                  </span>
                )}
                {prInfo.prDate && (
                  <span className="font-mono text-[11px] text-[var(--muted)]">
                    carga máxima · {formatShortDate(new Date(prInfo.prDate))}
                  </span>
                )}
              </div>

              {/* Chart — uses AreaChart so the gradient under the line actually
                  renders. Bodyweight sessions (no maxLoadKg) are dropped from
                  the series so they don't tank the y-axis. */}
              {ranged.length === 0 ? (
                <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
                  Sem sessões nesse período. Mude o filtro ou registre um treino com este exercício.
                </p>
              ) : chartData.length === 0 ? (
                <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
                  Sem peso registrado nesse período. Este exercício é executado com peso corporal — confira histórico abaixo.
                </p>
              ) : (
                <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5 pb-2.5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {metric === 'load' ? 'Carga máxima (kg)' : 'Volume total (kg)'} · {chartData.length} {chartData.length === 1 ? 'dia' : 'dias'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {/* Metric toggle (carga × volume) — same visual lang as the range filter */}
                      <div className="inline-flex rounded-md border border-[var(--line)] bg-[var(--surface)] p-[2px]">
                        {(['load', 'volume'] as const).map((m) => {
                          const active = m === metric
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setMetric(m)}
                              className={`rounded px-2 py-[3px] font-mono text-[10px] font-semibold tracking-wide transition-colors ${
                                active
                                  ? 'bg-[var(--brand)] text-white'
                                  : 'text-[var(--muted)] hover:text-[var(--text)]'
                              }`}
                            >
                              {m === 'load' ? 'Carga' : 'Volume'}
                            </button>
                          )
                        })}
                      </div>
                      <div className="inline-flex rounded-md border border-[var(--line)] bg-[var(--surface)] p-[2px]">
                        {(['1M', '3M', '1A'] as RangeFilter[]).map((r) => {
                          const active = r === range
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setRange(r)}
                              className={`rounded px-2 py-[3px] font-mono text-[10px] font-semibold tracking-wide transition-colors ${
                                active
                                  ? 'bg-[var(--brand)] text-white'
                                  : 'text-[var(--muted)] hover:text-[var(--text)]'
                              }`}
                            >
                              {r}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="h-[200px] w-full min-w-0">
                    {/* minHeight={0} silences the recharts dev warning when
                        the AnimatePresence parent briefly has 0 height during
                        the open/close animation — chart still renders fine. */}
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <AreaChart data={chartData} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`load-${item.exercise.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 3" stroke="var(--line)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: 'var(--muted)' }}
                          axisLine={false}
                          tickLine={false}
                          interval={Math.max(0, Math.floor(chartData.length / 6))}
                          padding={{ left: 8, right: 8 }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: 'var(--muted)' }}
                          axisLine={false}
                          tickLine={false}
                          width={40}
                          domain={yDomain}
                          tickFormatter={(v) => `${v}kg`}
                          allowDecimals={false}
                        />
                        <Tooltip
                          cursor={{ stroke: 'var(--brand)', strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.6 }}
                          content={<LoadTooltip metric={metric} />}
                        />
                        <Area
                          type="monotone"
                          dataKey={metric}
                          stroke="var(--brand)"
                          strokeWidth={2.2}
                          fill={`url(#load-${item.exercise.id})`}
                          dot={{ r: 3, fill: '#fff', stroke: 'var(--brand)', strokeWidth: 1.8 }}
                          activeDot={{ r: 5, fill: 'var(--brand)', stroke: '#fff', strokeWidth: 2 }}
                          animationDuration={900}
                          isAnimationActive
                        />
                        {/* Gold dot on the all-time PR session — only meaningful on the load
                            metric (volume PR is a different beast, not tracked yet). */}
                        {metric === 'load' && prInfo.prSessionId && chartData.some((d) => d.isPr) && (
                          <ReferenceDot
                            x={chartData.find((d) => d.isPr)!.date}
                            y={chartData.find((d) => d.isPr)!.load}
                            r={5}
                            fill="#f4c443"
                            stroke="#b07700"
                            strokeWidth={2}
                            ifOverflow="extendDomain"
                          />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* History */}
              {sortedAsc.length > 0 && (
                <>
                  <div className="mb-2 mt-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      Histórico recente
                      <b className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-1.5 py-[1px] text-[10px] font-semibold text-[var(--text)]">
                        {sortedAsc.length}
                      </b>
                    </span>
                    <span className="font-mono text-[10.5px] text-[var(--muted)]">
                      carga · reps · volume
                    </span>
                  </div>
                  <div className="grid gap-1.5">
                    {[...sortedAsc].reverse().slice(0, 6).map((s) => {
                      const isPr = s.workoutSessionId === prInfo.prSessionId
                      const date = new Date(s.completedAt)
                      const daysAgo = daysAgoFrom(date)
                      return (
                        <div
                          key={s.workoutSessionId}
                          className={`grid items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 transition-all hover:translate-x-0.5 hover:bg-[var(--surface)] sm:grid-cols-[minmax(160px,1.2fr)_1fr_1fr_1fr_auto] ${
                            isPr
                              ? 'border-[#f1c84a] bg-gradient-to-r from-[#fffaea] to-[var(--surface-hover)]'
                              : 'border-[var(--line)] bg-[var(--surface-hover)]'
                          }`}
                        >
                          <span className="flex flex-wrap items-baseline gap-1.5 font-mono text-[11px] text-[var(--ink-2,var(--text))]">
                            <b className="font-semibold">{date.toLocaleDateString('pt-BR')}, {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b>
                            <span className="text-[10px] text-[var(--muted)]">há {daysAgo}d</span>
                          </span>
                          <span className="font-mono text-[11px] text-[var(--muted)]">
                            Carga máx <b className="font-semibold text-[var(--text)] text-[12.5px]">{s.maxLoadKg ?? '—'}</b>
                            {s.maxLoadKg != null && <span className="ml-1 text-[10px] text-[var(--muted)]">kg</span>}
                          </span>
                          <span className="font-mono text-[11px] text-[var(--muted)]">
                            Max reps <b className="font-semibold text-[var(--text)] text-[12.5px]">{s.maxReps ?? '—'}</b>
                          </span>
                          <span className="font-mono text-[11px] text-[var(--muted)]">
                            Volume <b className="font-semibold text-[var(--text)] text-[12.5px]">{Math.round(s.totalVolumeKg)}</b>
                            <span className="ml-1 text-[10px] text-[var(--muted)]">kg</span>
                          </span>
                          {isPr && (
                            <span
                              className="justify-self-end rounded-full border px-2 py-[2px] font-mono text-[9.5px] font-semibold tracking-wider"
                              style={{ background: '#ffe28a', borderColor: '#f1c84a', color: '#6a4a00' }}
                            >
                              ★ PR
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

// ─── Tab switcher with animated glider ────────────────────────────────────

function TabSwitcher({
  value, onChange,
}: {
  value: 'exercise' | 'body'
  onChange: (v: 'exercise' | 'body') => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [glide, setGlide] = useState<{ left: number; width: number } | null>(null)

  const updateGlide = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const active = el.querySelector<HTMLButtonElement>(`button[data-tab="${value}"]`)
    if (!active) return
    const r = active.getBoundingClientRect()
    const pr = el.getBoundingClientRect()
    setGlide({ left: r.left - pr.left, width: r.width })
  }, [value])

  useEffect(() => {
    updateGlide()
    const ro = new ResizeObserver(updateGlide)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [updateGlide])

  return (
    <div
      ref={containerRef}
      className="relative inline-flex rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-[5px] shadow-[0_2px_12px_-6px_rgba(40,15,5,0.08)]"
    >
      {glide && (
        <motion.span
          aria-hidden
          className="absolute z-0 rounded-[10px] bg-[var(--brand)] shadow-[0_6px_16px_-8px_rgba(255,90,60,0.55)]"
          initial={false}
          animate={{ left: glide.left, width: glide.width }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          style={{ top: 5, bottom: 5 }}
        />
      )}
      <button
        type="button"
        data-tab="exercise"
        onClick={() => onChange('exercise')}
        className={`relative z-10 inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold transition-colors ${
          value === 'exercise' ? 'text-white' : 'text-[var(--ink-2,var(--text))] hover:text-[var(--text)]'
        }`}
      >
        <TrendingUp size={14} />
        Progresso de Exercícios
      </button>
      <button
        type="button"
        data-tab="body"
        onClick={() => onChange('body')}
        className={`relative z-10 inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-[13px] font-semibold transition-colors ${
          value === 'body' ? 'text-white' : 'text-[var(--ink-2,var(--text))] hover:text-[var(--text)]'
        }`}
      >
        <Activity size={14} />
        Progresso Corporal
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function ProgressPage() {
  const { authorizedFetch } = useAuth()

  // Tab lives in the URL (`?tab=body`) so sharing a deep link lands on the
  // right panel and a hard refresh preserves where the user was.
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('tab')
  const tab: 'exercise' | 'body' = urlTab === 'body' ? 'body' : 'exercise'
  const setTab = useCallback(
    (next: 'exercise' | 'body') => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (next === 'exercise') params.delete('tab')
          else params.set('tab', next)
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  // Stale-while-revalidate via caches em módulo: useState inicializa
  // síncrono com peek() — se o user já carregou Progress nessa sessão
  // (ou em sessão anterior via localStorage), página renderiza COM
  // dados imediatos, sem flash de skeleton. loadAll() em background
  // revalida com dados frescos.
  const cachedExerciseProgress = exerciseProgressCache.peek()
  const cachedBodyMeasurements = bodyMeasurementsCache.peek()
  const cachedYearSummary = currentYearProgressSummaryCache.peek()
  const hasAnyCache = Boolean(cachedExerciseProgress || cachedBodyMeasurements || cachedYearSummary)

  const [loading, setLoading] = useState<boolean>(!hasAnyCache)
  const [error, setError] = useState<string | null>(null)

  const [exerciseProgress, setExerciseProgress] = useState<ExerciseProgressItem[]>(
    () => cachedExerciseProgress?.items ?? [],
  )
  const [maxPinned, setMaxPinned] = useState(() => cachedExerciseProgress?.maxPinned ?? 5)
  const [openedPinnedExerciseId, setOpenedPinnedExerciseId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ExerciseOption[]>([])
  const [searching, setSearching] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)

  // Optional fetch — only used to feed the hero stats. Failures are tolerated.
  const [summary, setSummary] = useState<ProgressSummaryResponse | null>(cachedYearSummary)
  // Year shown in the activity heatmap. Defaults to current year and can
  // be swapped via the selector — triggers a small refetch of `/summary`.
  const [heatmapYear, setHeatmapYear] = useState<number>(() => new Date().getFullYear())
  const [refetchingSummary, setRefetchingSummary] = useState(false)

  const [measurements, setMeasurements] = useState<BodyMeasurement[]>(
    () => cachedBodyMeasurements?.items ?? [],
  )
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; date: string } | null>(null)
  const [selectedMeasurement, setSelectedMeasurement] = useState<BodyMeasurement | null>(null)
  const [measurementPhotoFile, setMeasurementPhotoFile] = useState<File | null>(null)
  const [measurementPhotoPreview, setMeasurementPhotoPreview] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showMoreMeasures, setShowMoreMeasures] = useState(false)
  const [savingMeasurement, setSavingMeasurement] = useState(false)
  const [deletingMeasurementId, setDeletingMeasurementId] = useState<string | null>(null)
  const [galleryMode, setGalleryMode] = useState<'closed' | 'grid' | 'compare'>('closed')
  const [draggingExerciseId, setDraggingExerciseId] = useState<string | null>(null)
  const [dropTargetExerciseId, setDropTargetExerciseId] = useState<string | null>(null)

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    weight: '', chest: '', shoulders: '', arms: '', forearms: '',
    waist: '', hips: '', thighs: '', calves: '', neck: '',
    bmi: '', bodyFatPercentage: '',
  })

  const searchInputRef = useRef<HTMLInputElement>(null)

  const pinnedExerciseIds = useMemo(() => new Set(exerciseProgress.map((item) => item.exercise.id)), [exerciseProgress])

  const loadAll = useCallback(async () => {
    try {
      // Só mostra skeleton quando NÃO temos NADA em cache. Refetch em
      // background quando temos algo — UI continua interativa, atualiza
      // silencioso quando os dados frescos chegam.
      if (!exerciseProgressCache.peek() && !bodyMeasurementsCache.peek() && !currentYearProgressSummaryCache.peek()) {
        setLoading(true)
      }
      setError(null)

      // Caches em paralelo. Cada cache faz coalesce in-flight, então
      // múltiplas montagens simultâneas viram 1 request por endpoint.
      const [progressData, bodyData, summaryData] = await Promise.all([
        exerciseProgressCache.get(authorizedFetch),
        bodyMeasurementsCache.get(authorizedFetch),
        currentYearProgressSummaryCache.get(authorizedFetch).catch(
          () => ({ year: new Date().getFullYear(), days: [], muscleVolume30D: [] }) as ProgressSummaryResponse,
        ),
      ])

      setExerciseProgress(progressData.items)
      setMaxPinned(progressData.maxPinned)
      setMeasurements(bodyData.items)
      setSummary(summaryData)

      setOpenedPinnedExerciseId((current) =>
        current && progressData.items.some((item) => item.exercise.id === current) ? current : null,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar módulo de progresso')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => { void loadAll() }, [loadAll])

  // Year selector triggers a focused refetch of just the summary, not the
  // whole page payload. Skips the first run (current year matches loadAll's
  // default) so we don't double-fetch on mount.
  const firstYearRunRef = useRef(true)
  useEffect(() => {
    if (firstYearRunRef.current) {
      firstYearRunRef.current = false
      return
    }
    let cancelled = false
    setRefetchingSummary(true)
    getProgressSummary(authorizedFetch, heatmapYear)
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar ano')
      })
      .finally(() => {
        if (!cancelled) setRefetchingSummary(false)
      })
    return () => { cancelled = true }
  }, [heatmapYear, authorizedFetch])

  // Debounced exercise search.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const q = searchQuery.trim()
      if (q.length < 2) { setSearchResults([]); return }
      setSearching(true)
      void searchExercisesForPlan(authorizedFetch, { q, limit: 30 })
        .then((r) => setSearchResults(r))
        .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao buscar exercícios'))
        .finally(() => setSearching(false))
    }, 240)
    return () => window.clearTimeout(id)
  }, [searchQuery, authorizedFetch])

  // ⌘K / Ctrl+K → focus search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    return () => {
      if (measurementPhotoPreview) URL.revokeObjectURL(measurementPhotoPreview)
    }
  }, [measurementPhotoPreview])

  // All time-series math reads from the pre-aggregated `summary.days`.
  const summaryDays = useMemo(() => summary?.days ?? [], [summary])
  const muscleVolume30D = useMemo(() => summary?.muscleVolume30D ?? [], [summary])

  const volume7d = useMemo(() => Math.round(computeVolume7D(summaryDays)), [summaryDays])
  const prsThisMonth = useMemo(() => computePRsThisMonth(exerciseProgress), [exerciseProgress])
  const streak = useMemo(() => computeStreak(summaryDays), [summaryDays])
  const cardio7d = useMemo(() => computeCardio7D(summaryDays), [summaryDays])
  const lastSession = useMemo(() => lastSessionDate(exerciseProgress, summaryDays), [exerciseProgress, summaryDays])

  // Weekly buckets + deltas for the hero. 8 weeks covers ~2 months which is
  // a good sparkline length without making the deltas misleading.
  const volumeWeeks = useMemo(() => volumeByWeek(summaryDays, 8), [summaryDays])
  const cardioWeeks = useMemo(() => cardioMinutesByWeek(summaryDays, 8), [summaryDays])
  const prsMonths = useMemo(() => prsByMonth(exerciseProgress, 6), [exerciseProgress])
  const volumeDelta = pctDelta(volumeWeeks[7] ?? 0, volumeWeeks[6] ?? 0)
  const cardioDelta = pctDelta(cardioWeeks[7] ?? 0, cardioWeeks[6] ?? 0)
  const prsDelta = pctDelta(prsMonths[5] ?? 0, prsMonths[4] ?? 0)

  // Body panel derived data — measurements sorted oldest-first for chart,
  // newest-first for the deltas/photo timeline.
  const measurementsOldFirst = useMemo(
    () => [...measurements].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [measurements],
  )
  const measurementsNewFirst = useMemo(
    () => [...measurements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [measurements],
  )
  const latestMeasurement = measurementsNewFirst[0] ?? null
  const firstMeasurement = measurementsOldFirst[0] ?? null

  // For each common measure: delta vs 30 days ago (fallback to first record).
  function measureDelta(key: keyof BodyMeasurement): { current: number | null; delta: number | null } {
    if (!latestMeasurement) return { current: null, delta: null }
    const current = latestMeasurement[key] as number | null
    if (current == null) return { current: null, delta: null }
    const cutoff = Date.now() - 30 * 86_400_000
    const reference = measurementsOldFirst.find(
      (m) => new Date(m.date).getTime() <= cutoff && (m[key] as number | null) != null,
    ) ?? firstMeasurement
    const ref = reference?.[key] as number | null
    if (ref == null || reference?.id === latestMeasurement.id) return { current, delta: null }
    return { current, delta: Number((current - ref).toFixed(1)) }
  }

  const handlePinExercise = async (exerciseId: string) => {
    if (exerciseProgress.length >= maxPinned) {
      // Inline error (instead of window.alert which breaks the page flow)
      // — the existing top-of-page error banner picks this up.
      setError(`Você pode fixar no máximo ${maxPinned} exercícios. Remova um antes de adicionar outro.`)
      return
    }
    try {
      await addPinnedExercise(authorizedFetch, exerciseId)
      setSearchQuery('')
      setSearchResults([])
      exerciseProgressCache.invalidate()
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao fixar exercício')
    }
  }

  const handleExportCsv = () => {
    // Two tables in one CSV: training summary (daily) + body measurements.
    // A single file keeps the export self-contained — easy to drop into a
    // sheet without juggling multiple downloads.
    const escape = (v: unknown): string => {
      if (v == null) return ''
      const s = String(v)
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines: string[] = []
    lines.push('# Treinos por dia')
    lines.push('data,volume_kg,sessoes,exercicios,cardio_min')
    for (const d of summaryDays) {
      lines.push(
        [d.date, d.volumeKg, d.sessionCount, d.exerciseCount, Math.round(d.cardioSec / 60)]
          .map(escape)
          .join(','),
      )
    }
    lines.push('')
    lines.push('# Medidas corporais')
    lines.push('data,peso_kg,peito_cm,ombros_cm,bracos_cm,antebracos_cm,cintura_cm,quadril_cm,coxas_cm,panturrilhas_cm,pescoco_cm,imc,bf_pct')
    for (const m of measurementsOldFirst) {
      lines.push(
        [
          m.date.slice(0, 10),
          m.weight,
          m.chest,
          m.shoulders,
          m.arms,
          m.forearms,
          m.waist,
          m.hips,
          m.thighs,
          m.calves,
          m.neck,
          m.bmi,
          m.bodyFatPercentage,
        ]
          .map(escape)
          .join(','),
      )
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `serraathlo-progresso-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleReorderPinned = async (orderedIds: string[]) => {
    // Optimistic reorder so the drop feels instant — server confirms in the
    // background and reloadAll re-syncs if it diverges.
    setExerciseProgress((current) => {
      const byId = new Map(current.map((i) => [i.exercise.id, i]))
      return orderedIds.map((id) => byId.get(id)).filter((x): x is ExerciseProgressItem => !!x)
    })
    try {
      await reorderPinnedExercises(authorizedFetch, orderedIds)
      exerciseProgressCache.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao reordenar exercícios')
      exerciseProgressCache.invalidate()
      await loadAll()
    }
  }

  const handleUnpinExercise = async (exerciseId: string) => {
    try {
      await removePinnedExercise(authorizedFetch, exerciseId)
      exerciseProgressCache.invalidate()
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover exercício fixado')
    }
  }

  const handleMeasurementPhotoFile = (file: File | null) => {
    setMeasurementPhotoFile(file)
    if (measurementPhotoPreview) {
      URL.revokeObjectURL(measurementPhotoPreview)
      setMeasurementPhotoPreview(null)
    }
    if (file) setMeasurementPhotoPreview(URL.createObjectURL(file))
  }

  const handleSaveMeasurement = async () => {
    const weightNumber = toNumberOrUndefined(form.weight)
    if (!measurementPhotoFile || weightNumber == null) return
    try {
      setSavingMeasurement(true)
      const photoDataUrl = await optimizeImageFileToDataUrl(measurementPhotoFile, {
        maxEdge: 1200, quality: 0.84, maxOutputBytes: 1_400_000,
      })
      const payload: CreateBodyMeasurementInput = {
        date: new Date(`${form.date}T00:00:00`).toISOString(),
        photoUrl: photoDataUrl,
        weight: weightNumber,
        chest: toNumberOrUndefined(form.chest),
        shoulders: toNumberOrUndefined(form.shoulders),
        arms: toNumberOrUndefined(form.arms),
        forearms: toNumberOrUndefined(form.forearms),
        waist: toNumberOrUndefined(form.waist),
        hips: toNumberOrUndefined(form.hips),
        thighs: toNumberOrUndefined(form.thighs),
        calves: toNumberOrUndefined(form.calves),
        neck: toNumberOrUndefined(form.neck),
        bmi: toNumberOrUndefined(form.bmi),
        bodyFatPercentage: toNumberOrUndefined(form.bodyFatPercentage),
      }
      await createBodyMeasurement(authorizedFetch, payload)
      bodyMeasurementsCache.invalidate()
      await loadAll()
      setForm((c) => ({
        ...c, weight: '', chest: '', shoulders: '', arms: '', forearms: '',
        waist: '', hips: '', thighs: '', calves: '', neck: '', bmi: '', bodyFatPercentage: '',
      }))
      setMeasurementPhotoFile(null)
      if (measurementPhotoPreview) URL.revokeObjectURL(measurementPhotoPreview)
      setMeasurementPhotoPreview(null)
      setShowMoreMeasures(false)
      setShowAddForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar medida corporal')
    } finally {
      setSavingMeasurement(false)
    }
  }

  const handleDeleteMeasurement = async (measurementId: string) => {
    if (!window.confirm('Deseja excluir este registro corporal?')) return
    try {
      setDeletingMeasurementId(measurementId)
      await deleteBodyMeasurement(authorizedFetch, measurementId)
      bodyMeasurementsCache.invalidate()
      setSelectedMeasurement((current) => (current?.id === measurementId ? null : current))
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir registro corporal')
    } finally {
      setDeletingMeasurementId(null)
    }
  }

  return (
    <section className="space-y-4">
      {/* Voltar ao perfil — só mobile/tablet (no desktop Progresso é item de nav) */}
      <Link
        to="/profile"
        className="inline-flex items-center gap-1.5 px-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)] lg:hidden"
      >
        <ArrowLeft size={11} />
        Voltar ao perfil
      </Link>

      {/* ───── HEADER ───── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0 sm:flex-1">
            <p className="inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              <span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--brand)]" />
              Progresso
              {lastSession && (
                <span className="font-sans text-[11px] font-normal normal-case tracking-normal text-[var(--muted)]">
                  · Última sessão {formatShortDate(lastSession)}
                </span>
              )}
            </p>
            <h1 className="mt-1.5 text-[28px] font-semibold tracking-tight text-[var(--text)] sm:text-[32px]">
              Seu <span className="font-serif-accent text-[var(--brand-strong)]">acompanhamento</span>
            </h1>
            {summaryDays.length === 0 && measurements.length === 0 && exerciseProgress.length === 0 && (
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[var(--muted)]">
                Fixe exercícios principais, acompanhe carga, repetições e volume — e registre sua evolução corporal com fotos e medidas.
              </p>
            )}
            {(summaryDays.length > 0 || measurements.length > 0) && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface)]"
              >
                <Download size={12} />
                Exportar CSV
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5 sm:text-right">
            <HeroStat
              label="Volume 7D"
              value={volume7d.toLocaleString('pt-BR')}
              numericValue={volume7d}
              unit="kg"
              tone="brand"
              delta={volumeDelta}
              deltaLabel="vs 7 dias anteriores"
              sparkline={volumeWeeks}
            />
            <HeroStat
              label="Cardio 7D"
              value={String(cardio7d)}
              numericValue={cardio7d}
              unit="min"
              tone="default"
              delta={cardioDelta}
              deltaLabel="vs 7 dias anteriores"
              sparkline={cardioWeeks}
            />
            <HeroStat
              label="PRs no mês"
              value={String(prsThisMonth)}
              numericValue={prsThisMonth}
              tone="default"
              delta={prsDelta}
              deltaLabel="vs mês anterior"
              sparkline={prsMonths}
            />
            <HeroStat label="Sequência" value={String(streak)} numericValue={streak} unit="dias" tone="default" />
          </div>
        </div>
      </motion.section>

      {/* ───── YEAR ACTIVITY HEATMAP ───── */}
      {!loading && (
        <YearActivityHeatmap
          days={summaryDays}
          year={heatmapYear}
          // 3 years is enough context for someone training for a while; the
          // selector stays a single line on mobile and pings the endpoint
          // (which already 60s-caches) when the user switches.
          availableYears={(() => {
            const current = new Date().getFullYear()
            return [current - 2, current - 1, current]
          })()}
          onYearChange={setHeatmapYear}
          loading={refetchingSummary}
        />
      )}

      {/* ───── TABS ───── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <TabSwitcher value={tab} onChange={setTab} />
      </motion.div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">{error}</p>
      )}
      {loading && (
        <div className="space-y-3" aria-label="Carregando progresso">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-[140px] w-full" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-[60px] w-full" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───── EXERCISE PANEL ───── */}
      {tab === 'exercise' && (
        <div className="space-y-3">
          {/* Pinned card */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
            className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
          >
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[var(--text)]">
                <Pin size={14} className="text-[var(--brand)]" />
                Exercícios fixados
              </h2>
              <div className="flex items-center gap-2.5 font-mono text-[11px] text-[var(--muted)]">
                <div className="flex gap-[3px]">
                  {Array.from({ length: maxPinned }, (_, i) => (
                    <span
                      key={i}
                      className="block h-[6px] w-[14px] rounded-[2px] transition-colors"
                      style={{ background: i < exerciseProgress.length ? 'var(--brand)' : 'var(--line)' }}
                    />
                  ))}
                </div>
                <span>
                  <b className="font-semibold text-[var(--text)]">{exerciseProgress.length}</b>/{maxPinned} fixados
                </span>
              </div>
            </div>

            <label
              className="relative flex items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] px-3.5 py-2.5 transition-all focus-within:border-[var(--brand)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_18%,transparent)]"
            >
              <Search size={14} className="mr-2 text-[var(--muted)]" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Buscar exercício para fixar…"
                className="flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
              />
              <kbd className="hidden rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-[2px] font-mono text-[10px] text-[var(--muted)] sm:inline">
                ⌘ K
              </kbd>
            </label>

            {/* Suggestions dropdown */}
            {searchFocused && searchQuery.trim().length >= 2 && (
              <div className="mt-2 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface)]">
                {searching && <p className="px-3.5 py-3 text-[12px] text-[var(--muted)]">Buscando…</p>}
                {!searching && searchResults.length === 0 && (
                  <p className="px-3.5 py-3 text-[12px] text-[var(--muted)]">Nenhum exercício encontrado.</p>
                )}
                {searchResults.slice(0, 8).map((option) => {
                  const isPinned = pinnedExerciseIds.has(option.id)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => !isPinned && void handlePinExercise(option.id)}
                      disabled={isPinned}
                      className="flex w-full items-center justify-between gap-3 border-b border-[var(--line-2,var(--line))] px-3.5 py-2.5 text-left text-[13px] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-[var(--text)]">{option.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                        {option.primaryMuscleGroup} · {option.difficulty}
                        {isPinned && <span className="ml-2 text-[var(--brand)]">· FIXADO</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </motion.section>

          {/* Exercise cards */}
          {exerciseProgress.length === 0 && !loading && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
              <div className="text-center">
                <Pin size={28} className="mx-auto mb-3 text-[var(--muted)]" />
                <p className="text-sm font-bold text-[var(--text)]">Nenhum exercício fixado ainda</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Escolha um caminho rápido pra começar a acompanhar sua evolução.
                </p>
              </div>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => searchInputRef.current?.focus()}
                  className="group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5 text-left transition-colors hover:border-[var(--brand)]/60 hover:bg-[var(--brand)]/5"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                    <Pin size={13} />
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text)]">Fixar exercício</span>
                  <span className="text-[11.5px] text-[var(--muted)]">Acompanha carga, reps e PRs do exercício escolhido.</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setTab('body'); setShowAddForm(true) }}
                  className="group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5 text-left transition-colors hover:border-[var(--brand)]/60 hover:bg-[var(--brand)]/5"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                    <ImageIcon size={13} />
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text)]">Registrar foto</span>
                  <span className="text-[11.5px] text-[var(--muted)]">Tire fotos periódicas pra ver a evolução visual.</span>
                </button>
                <Link
                  to="/train"
                  className="group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5 text-left transition-colors hover:border-[var(--brand)]/60 hover:bg-[var(--brand)]/5"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                    <Dumbbell size={13} />
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text)]">Ir treinar</span>
                  <span className="text-[11.5px] text-[var(--muted)]">Cada sessão concluída vira dado aqui automaticamente.</span>
                </Link>
              </div>
            </div>
          )}

          {/* Side-by-side analytics — only meaningful with at least one
              pinned exercise (PRs feed) or any training history (volume). */}
          {(exerciseProgress.length > 0 || summaryDays.length > 0) && (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              <MuscleVolumeCard rows={muscleVolume30D} />
              <RecentPrsCard progress={exerciseProgress} />
            </div>
          )}

          {exerciseProgress.map((item) => (
            <div
              key={item.exercise.id}
              onDragOver={(e) => {
                if (draggingExerciseId && draggingExerciseId !== item.exercise.id) {
                  e.preventDefault()
                  setDropTargetExerciseId(item.exercise.id)
                }
              }}
              onDragLeave={(e) => {
                // Only clear if we're really leaving the card (not entering a child).
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropTargetExerciseId((current) => (current === item.exercise.id ? null : current))
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (!draggingExerciseId || draggingExerciseId === item.exercise.id) return
                const fromIdx = exerciseProgress.findIndex((p) => p.exercise.id === draggingExerciseId)
                const toIdx = exerciseProgress.findIndex((p) => p.exercise.id === item.exercise.id)
                if (fromIdx < 0 || toIdx < 0) return
                const reordered = [...exerciseProgress]
                const [moved] = reordered.splice(fromIdx, 1)
                reordered.splice(toIdx, 0, moved)
                setDropTargetExerciseId(null)
                void handleReorderPinned(reordered.map((p) => p.exercise.id))
              }}
            >
            <ExerciseCard
              item={item}
              open={openedPinnedExerciseId === item.exercise.id}
              isDragging={draggingExerciseId === item.exercise.id}
              isDropTarget={dropTargetExerciseId === item.exercise.id}
              onMove={(direction) => {
                const idx = exerciseProgress.findIndex((p) => p.exercise.id === item.exercise.id)
                const targetIdx = direction === 'up' ? idx - 1 : idx + 1
                if (idx < 0 || targetIdx < 0 || targetIdx >= exerciseProgress.length) return
                const reordered = [...exerciseProgress]
                ;[reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]]
                void handleReorderPinned(reordered.map((p) => p.exercise.id))
              }}
              dragHandleProps={{
                draggable: true,
                onDragStart: (e: React.DragEvent) => {
                  setDraggingExerciseId(item.exercise.id)
                  e.dataTransfer.effectAllowed = 'move'
                  // Firefox requires data to be set or it cancels the drag.
                  try { e.dataTransfer.setData('text/plain', item.exercise.id) } catch { /* noop */ }
                },
                onDragEnd: () => {
                  setDraggingExerciseId(null)
                  setDropTargetExerciseId(null)
                },
              }}
              onToggle={() =>
                setOpenedPinnedExerciseId((current) => (current === item.exercise.id ? null : item.exercise.id))
              }
              onRemove={() => void handleUnpinExercise(item.exercise.id)}
            />
            </div>
          ))}
        </div>
      )}

      {/* ───── BODY PANEL ───── */}
      {tab === 'body' && (
        <div className="space-y-3">
          {measurements.length === 0 && !loading ? (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-10"
            >
              <div className="mx-auto max-w-md text-center">
                <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                  <ImageIcon size={22} />
                </span>
                <h3 className="text-base font-bold text-[var(--text)]">Comece sua linha do tempo corporal</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                  Tire uma foto periódica e registre peso/medidas. Em 4–8 semanas você consegue ver a evolução visualmente e comparar fotos lado a lado.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-[13px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
                >
                  <Plus size={13} />
                  Registrar primeira foto
                </button>
              </div>
            </motion.section>
          ) : null}

          {measurements.length > 0 && (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1.1fr_0.9fr]">
            <BodyMetricChart
              measurements={measurementsOldFirst}
              field="weight"
              label="Peso corporal"
              unit="kg"
              gradientId="bodyWeightGrad"
              delay={0.08}
            />

            {/* Measurements list */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-[var(--text)]">Medidas</h3>
                <span className="text-[11px] font-medium text-[var(--muted)]">
                  vs. 30 dias
                </span>
              </div>

              {!latestMeasurement && (
                <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
                  Nenhuma medida registrada ainda.
                </p>
              )}

              {latestMeasurement && (
                <div className="grid gap-2">
                  {([
                    ['chest', 'Peito'],
                    ['waist', 'Cintura'],
                    ['arms', 'Braços'],
                    ['thighs', 'Coxas'],
                  ] as Array<[keyof BodyMeasurement, string]>).map(([k, label]) => {
                    const { current, delta } = measureDelta(k)
                    if (current == null) return null
                    return <MeasRow key={k} label={label} value={current} unit="cm" delta={delta} />
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="mt-1 inline-flex items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--line)] bg-transparent px-3 py-2.5 font-mono text-[11px] font-semibold tracking-wider text-[var(--muted)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 hover:text-[var(--brand-strong)]"
                  >
                    <Plus size={12} />
                    {showAddForm ? 'Fechar' : 'Adicionar registro'}
                  </button>
                </div>
              )}
            </motion.section>
          </div>
          )}

          {/* IMC + BF % charts — only render if the user has at least one
              record with the metric (the chart itself shows a hint otherwise). */}
          {(measurementsOldFirst.some((m) => m.bmi != null) ||
            measurementsOldFirst.some((m) => m.bodyFatPercentage != null)) && (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {measurementsOldFirst.some((m) => m.bmi != null) && (
                <BodyMetricChart
                  measurements={measurementsOldFirst}
                  field="bmi"
                  label="IMC"
                  unit=""
                  gradientId="bodyBmiGrad"
                  delay={0.12}
                />
              )}
              {measurementsOldFirst.some((m) => m.bodyFatPercentage != null) && (
                <BodyMetricChart
                  measurements={measurementsOldFirst}
                  field="bodyFatPercentage"
                  label="Body Fat"
                  unit="%"
                  gradientId="bodyBfGrad"
                  delay={0.14}
                />
              )}
            </div>
          )}

          {/* Add measurement form (collapsible) */}
          <AnimatePresence initial={false}>
            {showAddForm && (
              <motion.section
                key="add-form"
                initial={{ opacity: 0, y: 8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 6, height: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5">
                  <h3 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Novo registro corporal</h3>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <FormField label="Data">
                      <input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm"
                      />
                    </FormField>
                    <UnitInput
                      label="Peso *"
                      value={form.weight}
                      unit="kg"
                      onChange={(next) => setForm((c) => ({ ...c, weight: next }))}
                    />
                    <FormField label="Foto *">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleMeasurementPhotoFile(e.target.files?.[0] ?? null)}
                        className="w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm"
                      />
                    </FormField>
                  </div>

                  {measurementPhotoPreview && (
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto({ url: measurementPhotoPreview, date: `${form.date}T00:00:00.000Z` })}
                      className="mx-auto mt-3 block w-full max-w-[18rem] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                    >
                      <img
                        src={measurementPhotoPreview}
                        alt="Preview"
                        className="w-full rounded-lg border border-[var(--line)] object-cover"
                        style={{ aspectRatio: '4 / 5', maxHeight: '20rem' }}
                      />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowMoreMeasures((v) => !v)}
                    className="mt-3 inline-flex h-8 items-center rounded-lg border border-[var(--line)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    {showMoreMeasures ? 'Ocultar medidas opcionais' : 'Adicionar mais medidas'}
                  </button>

                  {showMoreMeasures && (
                    <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                      {([
                        ['chest', 'Peitoral', 'cm'], ['shoulders', 'Ombros', 'cm'], ['arms', 'Braços', 'cm'],
                        ['forearms', 'Antebraços', 'cm'], ['waist', 'Cintura', 'cm'], ['hips', 'Quadril', 'cm'],
                        ['thighs', 'Coxas', 'cm'], ['calves', 'Panturrilhas', 'cm'], ['neck', 'Pescoço', 'cm'],
                        ['bmi', 'IMC', ''], ['bodyFatPercentage', 'BF', '%'],
                      ] as Array<[keyof typeof form, string, string]>).map(([field, label, unit]) => (
                        <UnitInput
                          key={field}
                          label={label}
                          value={form[field]}
                          unit={unit}
                          onChange={(next) => setForm((c) => ({ ...c, [field]: next }))}
                        />
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={savingMeasurement || !measurementPhotoFile || !form.weight.trim()}
                    onClick={() => void handleSaveMeasurement()}
                    className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-[13px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingMeasurement ? 'Salvando…' : 'Salvar registro'}
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Photo timeline */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.14 }}
            className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[14px] font-semibold text-[var(--text)]">Linha do tempo de fotos</h3>
              <div className="flex items-center gap-2">
                {measurements.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => setGalleryMode('compare')}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface)]"
                  >
                    Comparar
                  </button>
                )}
                {measurements.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setGalleryMode('grid')}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface)]"
                  >
                    Ver todas
                  </button>
                )}
                <span className="text-[11px] font-medium text-[var(--muted)]">
                  {measurements.length} {measurements.length === 1 ? 'registro' : 'registros'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {measurementsNewFirst.slice(0, 3).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedPhoto({ url: m.photoUrl, date: m.date })}
                  className="group relative aspect-[3/4] overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] transition-transform hover:-translate-y-0.5"
                >
                  <img
                    src={m.photoUrl}
                    alt={`Foto corporal em ${formatDateTime(m.date)}`}
                    className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  <span
                    className="absolute left-1.5 top-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 py-[2px] font-mono text-[9.5px] font-semibold text-[var(--text)]"
                  >
                    {new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '')}
                  </span>
                </button>
              ))}
              {measurements.length < 3 && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="grid aspect-[3/4] place-items-center rounded-[10px] border border-dashed border-[var(--line)] bg-[var(--surface-hover)] font-mono text-[10.5px] text-[var(--muted)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 hover:text-[var(--brand-strong)]"
                >
                  <span className="flex flex-col items-center gap-1.5">
                    <ImageIcon size={18} />
                    Adicionar foto
                  </span>
                </button>
              )}
            </div>
          </motion.section>

          {/* Full history list (kept simpler — clickable cards for delete/details) */}
          {measurements.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.18 }}
              className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
            >
              <h3 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Histórico corporal</h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {measurementsNewFirst.map((m) => (
                  <article key={m.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto({ url: m.photoUrl, date: m.date })}
                      className="block w-full"
                    >
                      <img
                        src={m.photoUrl}
                        alt={`Foto corporal em ${formatDateTime(m.date)}`}
                        className="w-full rounded-lg object-cover transition-transform hover:scale-[1.01]"
                        style={{ aspectRatio: '4 / 5', maxHeight: '20rem' }}
                      />
                    </button>
                    <p className="mt-2 font-mono text-[11px] font-semibold text-[var(--text)]">{formatDateTime(m.date)}</p>
                    <div className="mt-1 grid gap-x-3 gap-y-0.5 font-mono text-[11px] text-[var(--muted)] sm:grid-cols-2">
                      <p>Peso: <b className="text-[var(--text)]">{m.weight}</b> kg</p>
                      <p>IMC: <b className="text-[var(--text)]">{m.bmi ?? '—'}</b></p>
                      <p>BF: <b className="text-[var(--text)]">{m.bodyFatPercentage != null ? `${m.bodyFatPercentage}%` : '—'}</b></p>
                      <p>Cintura: <b className="text-[var(--text)]">{m.waist ?? '—'}</b></p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMeasurement(m)}
                        className="inline-flex h-8 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                      >
                        Ver detalhes
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteMeasurement(m.id)}
                        disabled={deletingMeasurementId === m.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/40 bg-transparent px-3 text-[12px] font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <Trash2 size={11} />
                        {deletingMeasurementId === m.id ? 'Excluindo…' : 'Excluir'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </motion.section>
          )}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {selectedPhoto && (
          <ImageViewer
            src={selectedPhoto.url}
            alt={`Foto corporal em ${formatDateTime(selectedPhoto.date)}`}
            shape="portrait"
            caption={formatDateTime(selectedPhoto.date)}
            onClose={() => setSelectedPhoto(null)}
          />
        )}
      </AnimatePresence>

      {selectedMeasurement && (
        <MeasurementDetailsModal
          measurement={selectedMeasurement}
          onClose={() => setSelectedMeasurement(null)}
          onOpenPhoto={() => setSelectedPhoto({ url: selectedMeasurement.photoUrl, date: selectedMeasurement.date })}
        />
      )}

      {galleryMode !== 'closed' && (
        <PhotoGalleryModal
          measurements={measurementsNewFirst}
          initialMode={galleryMode}
          onClose={() => setGalleryMode('closed')}
          onOpenPhoto={(m) => setSelectedPhoto({ url: m.photoUrl, date: m.date })}
        />
      )}
    </section>
  )
}

// ─── Small subcomponents (declared after the page to keep the layout) ─────

// Animates `value` from 0 → target over ~600ms. The hero numbers feel
// dead when they pop in immediately on mount; the easing makes the page
// feel responsive without leaning on a third-party animation lib.
function useCountUp(target: number, durationMs = 600): number {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let cancelled = false
    const from = 0
    const start = performance.now()
    const tick = (now: number) => {
      if (cancelled) return
      const elapsed = now - start
      const t = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(from + (target - from) * eased)
      if (t < 1) requestAnimationFrame(tick)
      else setDisplay(target)
    }
    requestAnimationFrame(tick)
    return () => { cancelled = true }
  }, [target, durationMs])

  return display
}

function HeroSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const W = 72, H = 22
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const step = W / Math.max(1, values.length - 1)
  const points = values
    .map((v, i) => ({
      x: i * step,
      y: H - 2 - ((v - min) / range) * (H - 4),
    }))
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area = `${d} L ${W} ${H} L 0 ${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[22px] w-[72px]" aria-hidden>
      <path d={area} fill={color} fillOpacity={0.18} stroke="none" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HeroStat({
  label, value, unit, tone, delta, deltaLabel, sparkline, numericValue,
}: {
  label: string
  value: string
  unit?: string
  tone: 'brand' | 'default'
  delta?: number | null
  deltaLabel?: string
  sparkline?: number[]
  // Optional numeric value for the count-up animation; falls back to the
  // formatted string when not provided (zero animation, no risk).
  numericValue?: number
}) {
  // Count-up only fires when we have a numeric target. Display value swaps
  // to the formatted string once the animation finishes (or right away if
  // numericValue isn't given).
  const animated = useCountUp(numericValue ?? 0)
  const isAnimating = numericValue != null && animated < numericValue
  const displayValue = numericValue != null
    ? Math.round(animated).toLocaleString('pt-BR')
    : value
  const sparkColor = tone === 'brand' ? 'var(--brand)' : 'var(--muted)'
  const deltaIsUp = delta != null && delta > 0
  const deltaIsDown = delta != null && delta < 0
  const deltaClass =
    delta == null
      ? 'text-[var(--muted)]'
      : deltaIsUp
        ? 'text-emerald-600 dark:text-emerald-400'
        : deltaIsDown
          ? 'text-red-500'
          : 'text-[var(--muted)]'
  const deltaText =
    delta == null ? '—' : delta === 0 ? '±0%' : `${deltaIsUp ? '▲ +' : '▼ '}${Math.abs(delta)}%`

  return (
    <div className="sm:text-right">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-[22px] font-semibold leading-none tracking-tight tabular-nums ${
          tone === 'brand' ? 'text-[var(--brand-strong)]' : 'text-[var(--text)]'
        }`}
      >
        {isAnimating ? displayValue : value}
        {unit && <span className="ml-1 font-mono text-[11px] font-medium text-[var(--muted)]">{unit}</span>}
      </p>
      {(sparkline || delta != null) && (
        <div className="mt-1.5 flex items-center justify-start gap-1.5 sm:justify-end">
          {sparkline && <HeroSparkline values={sparkline} color={sparkColor} />}
          {(delta != null || deltaLabel) && (
            <span className={`font-mono text-[10px] font-semibold ${deltaClass}`} title={deltaLabel}>
              {deltaText}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function MeasTile({
  label, value, unit, tone,
}: {
  label: string
  value: string
  unit?: string
  tone?: 'up' | 'down'
}) {
  const deltaClass = tone === 'down' ? 'text-emerald-600' : tone === 'up' ? 'text-red-500' : 'text-[var(--text)]'
  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className={`mt-0.5 font-mono text-[15px] font-semibold ${deltaClass}`}>
        {value}
        {unit && <span className="ml-1 text-[10px] font-medium text-[var(--muted)]">{unit}</span>}
      </p>
    </div>
  )
}

function MeasRow({
  label, value, unit, delta,
}: {
  label: string
  value: number
  unit: string
  delta: number | null
}) {
  const positive = delta != null && delta > 0
  const negative = delta != null && delta < 0
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
      <span className="text-[13px] font-medium text-[var(--text)]">{label}</span>
      <span className="font-mono text-[13px] font-semibold text-[var(--text)]">
        {value}
        <span className="ml-1 text-[10px] font-medium text-[var(--muted)]">{unit}</span>
      </span>
      <span
        className={`font-mono text-[10.5px] font-semibold ${
          delta == null
            ? 'text-[var(--muted)]'
            : positive
              ? 'text-emerald-600'
              : negative
                ? 'text-red-500'
                : 'text-[var(--muted)]'
        }`}
      >
        {delta == null ? '—' : `${positive ? '▲ +' : negative ? '▼ ' : ''}${delta}`}
      </span>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  )
}

// Decimal input with the unit (`kg`, `cm`, `%`) glued to its right edge —
// reads cleaner than the unit-as-suffix-in-label that the form was using.
function UnitInput({
  label, value, unit, onChange,
}: {
  label: string
  value: string
  unit: string
  onChange: (next: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      <div className="relative">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 pr-8 text-sm"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center font-mono text-[10.5px] text-[var(--muted)]">
          {unit}
        </span>
      </div>
    </label>
  )
}

function MeasurementDetailsModal({
  measurement, onClose, onOpenPhoto,
}: {
  measurement: BodyMeasurement
  onClose: () => void
  onOpenPhoto: () => void
}) {
  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        style={{ maxHeight: 'min(90vh, 720px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto overscroll-contain p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-extrabold text-[var(--text)]">Detalhes completos do registro</h3>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <XIcon size={13} />
              Fechar
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenPhoto}
            className="mx-auto mt-3 block w-full max-w-[17rem] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] sm:max-w-[20rem]"
          >
            <img
              src={measurement.photoUrl}
              alt={`Foto corporal em ${formatDateTime(measurement.date)}`}
              className="w-full rounded-lg object-cover"
              style={{ aspectRatio: '4 / 5', maxHeight: '22rem' }}
            />
          </button>

          <div className="mt-4 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
            <p><b className="text-[var(--text)]">Data:</b> {formatDateTime(measurement.date)}</p>
            <p><b className="text-[var(--text)]">Peso:</b> {measurement.weight} kg</p>
            <p><b className="text-[var(--text)]">Peitoral:</b> {measurement.chest != null ? `${measurement.chest} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Ombros:</b> {measurement.shoulders != null ? `${measurement.shoulders} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Braços:</b> {measurement.arms != null ? `${measurement.arms} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Antebraços:</b> {measurement.forearms != null ? `${measurement.forearms} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Cintura:</b> {measurement.waist != null ? `${measurement.waist} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Quadril:</b> {measurement.hips != null ? `${measurement.hips} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Coxas:</b> {measurement.thighs != null ? `${measurement.thighs} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Panturrilhas:</b> {measurement.calves != null ? `${measurement.calves} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Pescoço:</b> {measurement.neck != null ? `${measurement.neck} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">IMC:</b> {measurement.bmi ?? '—'}</p>
            <p><b className="text-[var(--text)]">BF:</b> {measurement.bodyFatPercentage != null ? `${measurement.bodyFatPercentage}%` : '—'}</p>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

// ─── Photo gallery + compare modal ────────────────────────────────────────

function PhotoGalleryModal({
  measurements, initialMode, onClose, onOpenPhoto,
}: {
  measurements: BodyMeasurement[]
  initialMode: 'grid' | 'compare'
  onClose: () => void
  onOpenPhoto: (m: BodyMeasurement) => void
}) {
  useScrollLock(true)
  const [mode, setMode] = useState<'grid' | 'compare'>(initialMode)
  // For compare mode: default A = oldest, B = newest, so the diff reads
  // top-down as the natural "before → after".
  const [aId, setAId] = useState<string>(measurements[measurements.length - 1]?.id ?? '')
  const [bId, setBId] = useState<string>(measurements[0]?.id ?? '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const a = useMemo(() => measurements.find((m) => m.id === aId) ?? null, [measurements, aId])
  const b = useMemo(() => measurements.find((m) => m.id === bId) ?? null, [measurements, bId])

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        style={{ maxHeight: 'min(92vh, 800px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3 sm:px-5">
          <div className="inline-flex rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] p-[3px]">
            {(['grid', 'compare'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  mode === m ? 'bg-[var(--brand)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {m === 'grid' ? 'Todas as fotos' : 'Comparar'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            <XIcon size={13} />
            Fechar
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto overscroll-contain p-4 sm:p-5">
          {mode === 'grid' ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {measurements.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpenPhoto(m)}
                  className="group relative aspect-[3/4] overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] transition-transform hover:-translate-y-0.5"
                >
                  <img
                    src={m.photoUrl}
                    alt={`Foto corporal em ${new Date(m.date).toLocaleDateString('pt-BR')}`}
                    className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 py-[2px] font-mono text-[9.5px] font-semibold text-[var(--text)]">
                    {new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '')}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <PhotoCompareView a={a} b={b} measurements={measurements} onPickA={setAId} onPickB={setBId} />
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

function PhotoCompareView({
  a, b, measurements, onPickA, onPickB,
}: {
  a: BodyMeasurement | null
  b: BodyMeasurement | null
  measurements: BodyMeasurement[]
  onPickA: (id: string) => void
  onPickB: (id: string) => void
}) {
  const shareRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const handleShare = async () => {
    if (!shareRef.current || !a || !b) return
    setSharing(true)
    setShareError(null)
    try {
      // Lazy-load html2canvas — it's ~150KB and the page already pays for it
      // elsewhere, but importing here keeps the initial bundle smaller for
      // users who never share.
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(shareRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 0.95),
      )
      if (!blob) throw new Error('Falha ao gerar imagem')

      // Prefer the native Web Share API on mobile, fall back to a plain
      // download elsewhere. Both feel native to the platform.
      const file = new File([blob], `comparacao-${a.date.slice(0, 10)}-vs-${b.date.slice(0, 10)}.png`, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> }
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: 'Comparação de evolução' })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao compartilhar'
      // User cancelling the Web Share dialog throws AbortError — ignore.
      if (!/abort/i.test(msg)) setShareError(msg)
    } finally {
      setSharing(false)
    }
  }

  // Compute deltas for every metric present in both A and B.
  const rows = useMemo(() => {
    if (!a || !b) return []
    const fields: Array<{ key: keyof BodyMeasurement; label: string; unit: string }> = [
      { key: 'weight', label: 'Peso', unit: 'kg' },
      { key: 'bmi', label: 'IMC', unit: '' },
      { key: 'bodyFatPercentage', label: 'Body Fat', unit: '%' },
      { key: 'chest', label: 'Peitoral', unit: 'cm' },
      { key: 'shoulders', label: 'Ombros', unit: 'cm' },
      { key: 'arms', label: 'Braços', unit: 'cm' },
      { key: 'forearms', label: 'Antebraços', unit: 'cm' },
      { key: 'waist', label: 'Cintura', unit: 'cm' },
      { key: 'hips', label: 'Quadril', unit: 'cm' },
      { key: 'thighs', label: 'Coxas', unit: 'cm' },
      { key: 'calves', label: 'Panturrilhas', unit: 'cm' },
      { key: 'neck', label: 'Pescoço', unit: 'cm' },
    ]
    return fields
      .map(({ key, label, unit }) => {
        const av = a[key] as number | null
        const bv = b[key] as number | null
        if (av == null || bv == null) return null
        const delta = Number((bv - av).toFixed(1))
        return { key, label, unit, av, bv, delta }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [a, b])

  return (
    <div className="space-y-4">
      {/* Date pickers */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FormField label="Antes (A)">
          <select
            value={a?.id ?? ''}
            onChange={(e) => onPickA(e.target.value)}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1.5 text-sm"
          >
            {measurements.map((m) => (
              <option key={m.id} value={m.id}>
                {new Date(m.date).toLocaleDateString('pt-BR')}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Depois (B)">
          <select
            value={b?.id ?? ''}
            onChange={(e) => onPickB(e.target.value)}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1.5 text-sm"
          >
            {measurements.map((m) => (
              <option key={m.id} value={m.id}>
                {new Date(m.date).toLocaleDateString('pt-BR')}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      {a && b && (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={sharing}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12px] font-medium text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
            >
              <Share2 size={12} />
              {sharing ? 'Gerando…' : 'Compartilhar'}
            </button>
          </div>
          {shareError && <p className="text-[11px] text-red-500">{shareError}</p>}

          {/* Photos stack on phones so the images stay legible; side-by-side
              from sm+ where the screen has room for both. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[a, b].map((m, idx) => (
              <div key={m.id} className="space-y-1.5">
                <div className="flex items-center justify-between font-mono text-[10.5px] text-[var(--muted)]">
                  <b className="font-semibold text-[var(--text)]">{idx === 0 ? 'A' : 'B'}</b>
                  <span>{new Date(m.date).toLocaleDateString('pt-BR')}</span>
                </div>
                <img
                  src={m.photoUrl}
                  alt={`Foto ${idx === 0 ? 'A' : 'B'}`}
                  className="mx-auto w-full max-w-sm rounded-lg border border-[var(--line)] object-cover sm:max-w-none"
                  style={{ aspectRatio: '3 / 4' }}
                />
              </div>
            ))}
          </div>

          {/* Metric deltas */}
          {rows.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Variação A → B
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {rows.map(({ key, label, unit, av, bv, delta }) => {
                  // Coloured the same way as MeasRow: downward usually positive.
                  const positive = delta > 0
                  const negative = delta < 0
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2"
                    >
                      <span className="text-[13px] font-medium text-[var(--text)]">{label}</span>
                      <span className="font-mono text-[11.5px] text-[var(--muted)]">
                        {av}
                        {unit && <span className="ml-0.5 text-[10px]">{unit}</span>}
                        <span className="opacity-50"> → </span>
                        <b className="font-semibold text-[var(--text)]">{bv}</b>
                        {unit && <span className="ml-0.5 text-[10px]">{unit}</span>}
                      </span>
                      <span
                        className={`font-mono text-[10.5px] font-semibold ${
                          delta === 0
                            ? 'text-[var(--muted)]'
                            : positive
                              ? 'text-red-500'
                              : negative
                                ? 'text-emerald-600'
                                : 'text-[var(--muted)]'
                        }`}
                      >
                        {delta === 0 ? '±0' : `${positive ? '+' : ''}${delta}`}
                        {unit && <span className="ml-0.5 opacity-70">{unit}</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Off-screen 9:16 share template captured by html2canvas. Kept in
              the DOM (not display:none) so its computed styles + image
              rendering are stable across browsers. */}
          <div
            ref={shareRef}
            aria-hidden
            className="pointer-events-none fixed -left-[9999px] top-0"
            style={{ width: 1080, height: 1920, background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif', padding: '64px 56px', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 56 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: '#ff5a3c', letterSpacing: '0.18em' }}>SERRAATHLO</span>
              <span style={{ fontSize: 22, color: '#a4a6ad', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Comparação</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 56 }}>
              {[a, b].map((m, idx) => (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontSize: 36, fontWeight: 800 }}>{idx === 0 ? 'ANTES' : 'DEPOIS'}</span>
                    <span style={{ fontSize: 22, color: '#a4a6ad' }}>{new Date(m.date).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <img
                    src={m.photoUrl}
                    alt=""
                    crossOrigin="anonymous"
                    style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 18, border: '2px solid #ff5a3c33' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <span style={{ fontSize: 24, color: '#a4a6ad', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Variação</span>
              {rows.slice(0, 8).map(({ key, label, unit, av, bv, delta }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 18, fontSize: 26 }}>
                  <span style={{ flex: 1, color: '#fff', fontWeight: 600 }}>{label}</span>
                  <span style={{ color: '#a4a6ad' }}>{av}{unit} → <b style={{ color: '#fff' }}>{bv}{unit}</b></span>
                  <span style={{
                    width: 130,
                    textAlign: 'right',
                    fontWeight: 700,
                    color: delta === 0 ? '#a4a6ad' : delta > 0 ? '#ff5a3c' : '#34d399',
                  }}>
                    {delta === 0 ? '±0' : `${delta > 0 ? '+' : ''}${delta}`}{unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
