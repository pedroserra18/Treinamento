// Helpers puros, tipos e constantes extraídos da ProfilePage. Sem estado nem
// React — formatam datas e agregam o histórico de treino em séries semanais.
// Ficam aqui pra reduzir a página e poderem ser testados isoladamente.

import type { WorkoutSessionHistory } from '../../types/workout'

// ─── Date helpers ─────────────────────────────────────────────────────────

export function startOfWeek(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  return x
}

export function formatHM(totalSec: number): string {
  if (totalSec <= 0) return '0 min'
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

export const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
export const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

// ─── Stats aggregation (Duration / Reps / Volume over N weeks) ────────────

export type StatMode = 'duration' | 'reps' | 'volume'
export type RangeKey = '12w' | '6m' | '1y'

export const RANGE_WEEKS: Record<RangeKey, number> = { '12w': 12, '6m': 26, '1y': 52 }

export type WeekPoint = { weekStart: number; label: string; durationSec: number; reps: number; volumeKg: number }

export function buildStatsSeries(items: WorkoutSessionHistory[], weeks: number): WeekPoint[] {
  const buckets = new Map<number, WeekPoint>()
  for (const s of items) {
    if (!s.endedAt) continue
    const ws = startOfWeek(new Date(s.endedAt)).getTime()
    const reps = s.history.reduce((acc, e) => acc + (e.reps ?? 0), 0)
    const volume = s.history.reduce(
      (acc, e) => acc + ((e.weightKg ?? 0) > 0 && (e.reps ?? 0) > 0 ? e.weightKg! * e.reps! : 0),
      0,
    )
    const cur = buckets.get(ws)
    if (cur) {
      cur.durationSec += s.durationSec ?? 0
      cur.reps += reps
      cur.volumeKg += volume
    } else {
      buckets.set(ws, {
        weekStart: ws,
        label: formatShortDate(new Date(ws)),
        durationSec: s.durationSec ?? 0,
        reps,
        volumeKg: volume,
      })
    }
  }

  const today = new Date()
  const series: WeekPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i * 7)
    const ws = startOfWeek(d).getTime()
    series.push(
      buckets.get(ws) ?? {
        weekStart: ws,
        label: formatShortDate(new Date(ws)),
        durationSec: 0,
        reps: 0,
        volumeKg: 0,
      },
    )
  }
  return series
}

export function currentWeekTotals(items: WorkoutSessionHistory[]): { durationSec: number; reps: number; volumeKg: number } {
  const ws = startOfWeek(new Date()).getTime()
  let durationSec = 0
  let reps = 0
  let volumeKg = 0
  for (const s of items) {
    if (!s.endedAt) continue
    if (startOfWeek(new Date(s.endedAt)).getTime() !== ws) continue
    durationSec += s.durationSec ?? 0
    reps += s.history.reduce((acc, e) => acc + (e.reps ?? 0), 0)
    volumeKg += s.history.reduce(
      (acc, e) => acc + ((e.weightKg ?? 0) > 0 && (e.reps ?? 0) > 0 ? e.weightKg! * e.reps! : 0),
      0,
    )
  }
  return { durationSec, reps, volumeKg }
}
