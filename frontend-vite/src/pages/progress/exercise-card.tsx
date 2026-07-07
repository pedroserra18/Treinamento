import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceDot,
} from 'recharts'
import { Activity, ChevronDown, Dumbbell, GripVertical, Plus, Trash2, TrendingUp } from 'lucide-react'
import type { ExerciseProgressItem, ExerciseProgressSession } from '../../types/progress'
import { daysAgoFrom, formatShortDate, muscleTone, TONE_STYLE } from './progress-utils'

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

export function ExerciseCard({
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

export function TabSwitcher({
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
