import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronDown } from 'lucide-react'
import type { BodyMeasurement, ExerciseProgressItem, ProgressSummaryDay } from '../../types/progress'
import {
  MUSCLE_LABEL_PT, TONE_STYLE, muscleTone, formatShortDate, buildHeatmap, daysAgoFrom, nowMs,
  type HeatmapCell,
} from './progress-utils'
import { MeasTile } from './measurements'

export function MuscleVolumeCard({ rows }: { rows: Array<{ group: string; volumeKg: number }> }) {
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

export function RecentPrsCard({ progress }: { progress: ExerciseProgressItem[] }) {
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

export function BodyMetricChart({
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

export function YearActivityHeatmap({
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
