// Helpers puros, tipos e dados extraídos da HomePage. Sem estado nem React —
// agregam o histórico de treino (heatmap 30 dias, séries semanais, resumo do
// último treino), desenham o path das sparklines e formatam datas. Ficam aqui
// pra reduzir a página e poderem ser testados isoladamente.

import type { WorkoutSessionHistory } from '../../types/workout'

// ─── Data helpers ──────────────────────────────────────────────────────────

export function calcVolumeKg(session: WorkoutSessionHistory): number {
  return session.history.reduce((acc, e) => acc + (e.weightKg ?? 0) * (e.reps ?? 0), 0)
}

// Snap a date to the start of its ISO week (Mon = 0). We use this to bucket
// sessions into 8-week sparkline series and the "best week of month" check.
export function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

export function isoWeekNumber(d: Date): number {
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
export type HeatCell = { day: string; iso: string; intensity: 0 | 1 | 2 | 3 | 4; sessions: number; minutes: number }

export function buildHeatmap(items: WorkoutSessionHistory[]): HeatCell[] {
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
export type WeeklyAgg = { weekStart: number; sessions: number; volumeKg: number }

export function buildWeeklySeries(items: WorkoutSessionHistory[]): WeeklyAgg[] {
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
export function summarizeLastWorkout(s: WorkoutSessionHistory | null) {
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
export function trainingsToBeatBestWeek(weekly: WeeklyAgg[]): number {
  if (weekly.length < 2) return 0
  const current = weekly[weekly.length - 1].sessions
  const previous = weekly.slice(-5, -1).map((w) => w.sessions)
  const best = previous.length > 0 ? Math.max(...previous) : 0
  return Math.max(0, best - current + 1)
}

// Compact line+area path for the sparkline SVG (70×28 viewbox). Pads the
// y-axis so the line never touches the edges and looks like the mock's
// hand-drawn shape even when one of the values is 0.
export function lineSparkPath(values: number[], w = 70, h = 28): { line: string; area: string } {
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

export function relativeBigDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Formatação ────────────────────────────────────────────────────────────

// Volume semanal compacto: >=1000 vira "1.5k" (sem decimal a partir de 10k);
// senão o número arredondado. Usado no card de Volume e na barra compacta.
export function formatVolume(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(kg >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`
  }
  return `${Math.round(kg)}`
}
