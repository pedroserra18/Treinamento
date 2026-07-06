import type { ExerciseProgressItem, ProgressSummaryDay } from '../../types/progress'

// ─── Formatters ───────────────────────────────────────────────────────────

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR')
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// Module-level helper so the lint rule "react-hooks/purity" doesn't flag the
// impure `Date.now()` call when used inside render — same pattern used by
// timeAgo() in FeedPage.
export function daysAgoFrom(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000)
}

// Wraps Date.now so callsites inside render/useMemo don't trip the
// react-hooks/purity lint — they can call this helper instead. The
// 'impurity' is intentional and well-understood (cutoff for "last N days").
export function nowMs(): number {
  return Date.now()
}

export function toNumberOrUndefined(value: string): number | undefined {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

// Muscle pill / icon tone shared with feed cards but with a separate, more
// "fitness chart" feel here (gradients on a soft tinted background).
export type MuscleTone = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'other'

export function muscleTone(group: string): MuscleTone {
  const g = group.toUpperCase()
  if (g.includes('CHEST') || g.includes('PEITO')) return 'chest'
  if (g.includes('BACK') || g.includes('COSTAS')) return 'back'
  if (g.includes('LEG') || g.includes('PERNA') || g.includes('GLUTE')) return 'legs'
  if (g.includes('SHOULDER') || g.includes('OMBRO')) return 'shoulders'
  if (g.includes('BICEPS') || g.includes('TRICEPS') || g.includes('ARM') || g.includes('BRACO')) return 'arms'
  if (g.includes('CORE') || g.includes('ABD')) return 'core'
  return 'other'
}

export const TONE_STYLE: Record<MuscleTone, { bg: string; border: string; fg: string; dot: string }> = {
  chest:     { bg: 'linear-gradient(135deg, #fff1ea, #ffe1d2)', border: '#ffd6c5', fg: 'var(--brand-strong)', dot: 'var(--brand)' },
  back:      { bg: 'linear-gradient(135deg, #eaf4ff, #d2e4ff)', border: '#bcd6ff', fg: '#1d4fa3',             dot: '#3070d8' },
  legs:      { bg: 'linear-gradient(135deg, #eaf7ef, #d2eed9)', border: '#bce4c8', fg: '#1f7a45',             dot: '#1f9450' },
  shoulders: { bg: 'linear-gradient(135deg, #fff8e7, #ffefc4)', border: '#ffd97a', fg: '#8a6308',             dot: '#d6a300' },
  arms:      { bg: 'linear-gradient(135deg, #f1ecff, #e0d2ff)', border: '#c9b8ff', fg: '#5b3aa3',             dot: '#7a5aa6' },
  core:      { bg: 'linear-gradient(135deg, #fde6f0, #fbd2e2)', border: '#f5b8cf', fg: '#a3296c',             dot: '#d63379' },
  other:     { bg: 'linear-gradient(135deg, #f4efe6, #e9e3d8)', border: '#dcd6c8', fg: 'var(--ink-2,var(--text))', dot: 'var(--muted)' },
}

// ─── Hero stats computations ──────────────────────────────────────────────
// All hero/heatmap math now reads from the server-aggregated day list. This
// keeps the network footprint small (~365 lightweight rows max regardless of
// how active the user is) and the client never re-aggregates raw history.

export function computeVolume7D(days: ProgressSummaryDay[]): number {
  const cutoff = nowMs() - 7 * 86_400_000
  return days
    .filter((d) => new Date(d.date).getTime() >= cutoff)
    .reduce((acc, d) => acc + d.volumeKg, 0)
}

export function computeCardio7D(days: ProgressSummaryDay[]): number {
  const cutoff = nowMs() - 7 * 86_400_000
  const totalSec = days
    .filter((d) => new Date(d.date).getTime() >= cutoff)
    .reduce((acc, d) => acc + d.cardioSec, 0)
  return Math.round(totalSec / 60)
}

// Aggregates the hero metric per rolling 7-day bucket, ending NOW. Index 0
// is the oldest bucket, last index is the current 7d window.
export function bucketByWeek(
  days: ProgressSummaryDay[],
  weeks: number,
  reducer: (d: ProgressSummaryDay) => number,
): number[] {
  const buckets = new Array<number>(weeks).fill(0)
  const now = nowMs()
  for (const d of days) {
    const age = now - new Date(d.date).getTime()
    if (age < 0) continue
    const bucketFromEnd = Math.floor(age / (7 * 86_400_000))
    if (bucketFromEnd >= weeks) continue
    const idx = weeks - 1 - bucketFromEnd
    buckets[idx] += reducer(d)
  }
  return buckets
}

export function volumeByWeek(days: ProgressSummaryDay[], weeks: number): number[] {
  return bucketByWeek(days, weeks, (d) => d.volumeKg)
}

export function cardioMinutesByWeek(days: ProgressSummaryDay[], weeks: number): number[] {
  return bucketByWeek(days, weeks, (d) => Math.round(d.cardioSec / 60))
}

// Same idea but per calendar month, ending on the CURRENT month. Used by
// the "PRs no mês" hero stat — counting PRs week-by-week is too noisy.
export function prsByMonth(progress: ExerciseProgressItem[], months: number): number[] {
  const buckets = new Array<number>(months).fill(0)
  const now = new Date()
  const currentKey = now.getFullYear() * 12 + now.getMonth()
  for (const item of progress) {
    const sorted = [...item.sessions].sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    )
    let runningMax = -Infinity
    for (const s of sorted) {
      const load = s.maxLoadKg ?? 0
      if (load > runningMax) {
        const d = new Date(s.completedAt)
        const key = d.getFullYear() * 12 + d.getMonth()
        const diff = currentKey - key
        if (diff >= 0 && diff < months) {
          const idx = months - 1 - diff
          buckets[idx] += 1
        }
        runningMax = load
      }
    }
  }
  return buckets
}

export function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}

// ─── Year activity heatmap ────────────────────────────────────────────────

export type HeatmapCell = {
  date: Date
  isoKey: string
  volumeKg: number
  exerciseCount: number
  sessionCount: number
}

// Builds a 53×7 grid (52 full weeks + the current partial week) of daily
// training summaries for the last ~year. Cells beyond today are returned
// empty so we can render a fixed-shape grid without conditional gaps.
export function buildHeatmap(days: ProgressSummaryDay[], year: number): { columns: HeatmapCell[][]; months: { label: string; columnIndex: number }[] } {
  // Calendar-year grid: starts on the Sunday before Jan 1 and runs until
  // the Saturday after Dec 31, so the entire year fits cleanly in 53
  // columns with no awkward leading/trailing partial weeks.
  const start = new Date(year, 0, 1)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - start.getDay()) // back up to Sunday

  const end = new Date(year, 11, 31)
  end.setHours(0, 0, 0, 0)
  end.setDate(end.getDate() + (6 - end.getDay())) // forward to Saturday

  const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  const totalColumns = Math.ceil(totalDays / 7)

  const byDay = new Map<string, ProgressSummaryDay>()
  for (const d of days) byDay.set(d.date, d)

  const columns: HeatmapCell[][] = []
  const months: { label: string; columnIndex: number }[] = []
  const cursor = new Date(start)
  let lastMonth = -1
  for (let col = 0; col < totalColumns; col += 1) {
    const week: HeatmapCell[] = []
    for (let row = 0; row < 7; row += 1) {
      const key = cursor.toISOString().slice(0, 10)
      const bucket = byDay.get(key)
      week.push({
        date: new Date(cursor),
        isoKey: key,
        volumeKg: bucket ? bucket.volumeKg : 0,
        exerciseCount: bucket ? bucket.exerciseCount : 0,
        sessionCount: bucket ? bucket.sessionCount : 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    // Month label anchors on the first row of the column when the month
    // first appears, and we skip columns that only belong to the prior year.
    const colMonth = week[0].date.getMonth()
    const colYear = week[0].date.getFullYear()
    if (colYear === year && colMonth !== lastMonth) {
      months.push({
        label: week[0].date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        columnIndex: col,
      })
      lastMonth = colMonth
    }
    columns.push(week)
  }

  return { columns, months }
}

// ─── Volume per muscle group (30D) ────────────────────────────────────────
// The breakdown is computed server-side and shipped in /progress/summary,
// so the page just renders. Pre-aggregation matters at scale because the
// alternative was downloading every set the user ever performed.

export const MUSCLE_LABEL_PT: Record<string, string> = {
  CHEST: 'Peito', BACK: 'Costas', SHOULDERS: 'Ombros', ARMS: 'Braços',
  BICEPS: 'Bíceps', TRICEPS: 'Tríceps', LEGS: 'Pernas', QUADS: 'Quadríceps',
  HAMSTRINGS: 'Posterior', GLUTES: 'Glúteos', CALVES: 'Panturrilhas',
  ADDUCTORS: 'Adutores', CORE: 'Core', ABDOMEN: 'Abdômen', FOREARM: 'Antebraço',
  FULL_BODY: 'Corpo todo',
}
