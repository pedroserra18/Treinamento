import { describe, it, expect } from 'vitest'
import type { WorkoutSessionHistory } from '../../types/workout'
import {
  startOfWeek,
  formatHM,
  buildStatsSeries,
  currentWeekTotals,
  RANGE_WEEKS,
} from './profile-utils'

// ─── Fixtures ─────────────────────────────────────────────────────────────

function mkEntry(reps: number | null, weightKg: number | null): WorkoutSessionHistory['history'][number] {
  return {
    id: `e-${Math.random()}`,
    executionOrder: 0,
    setNumber: 1,
    reps,
    weightKg,
    durationSec: null,
    distanceMeters: null,
    perceivedExertion: null,
    notes: null,
    completedAt: '2026-01-01T00:00:00.000Z',
    exercise: { id: 'x', name: 'Ex', primaryMuscleGroup: 'CHEST' },
  }
}

function mkSession(o: {
  endedAt: string | null
  durationSec: number | null
  history?: Array<{ reps: number | null; weightKg: number | null }>
}): WorkoutSessionHistory {
  return {
    id: `s-${Math.random()}`,
    status: 'COMPLETED',
    workoutPlanId: null,
    workoutPlan: null,
    scheduledAt: '2026-01-01T00:00:00.000Z',
    startedAt: null,
    endedAt: o.endedAt,
    durationSec: o.durationSec,
    caloriesBurned: null,
    notes: null,
    historyEntriesCount: o.history?.length ?? 0,
    history: (o.history ?? []).map((h) => mkEntry(h.reps, h.weightKg)),
  }
}

// ─── formatHM ─────────────────────────────────────────────────────────────

describe('formatHM', () => {
  it('mostra "0 min" para zero ou negativo', () => {
    expect(formatHM(0)).toBe('0 min')
    expect(formatHM(-120)).toBe('0 min')
  })

  it('mostra só minutos abaixo de 1h', () => {
    expect(formatHM(90)).toBe('1 min')
    expect(formatHM(1800)).toBe('30 min')
  })

  it('mostra horas + minutos a partir de 1h', () => {
    expect(formatHM(3600)).toBe('1 h 0 min')
    expect(formatHM(3661)).toBe('1 h 1 min')
    expect(formatHM(7380)).toBe('2 h 3 min')
  })
})

// ─── startOfWeek ──────────────────────────────────────────────────────────

describe('startOfWeek', () => {
  it('retorna sempre a segunda-feira à meia-noite', () => {
    // 2026-01-07 é uma quarta-feira.
    const monday = startOfWeek(new Date(2026, 0, 7, 15, 30))
    expect(monday.getDay()).toBe(1) // segunda
    expect(monday.getHours()).toBe(0)
    expect(monday.getMinutes()).toBe(0)
    expect(monday.getDate()).toBe(5) // 2026-01-05
  })

  it('para uma segunda-feira, retorna o próprio dia', () => {
    const monday = startOfWeek(new Date(2026, 0, 5, 9, 0))
    expect(monday.getDate()).toBe(5)
    expect(monday.getDay()).toBe(1)
  })

  it('para um domingo, volta pra segunda anterior', () => {
    // 2026-01-11 é domingo.
    const monday = startOfWeek(new Date(2026, 0, 11, 23, 0))
    expect(monday.getDate()).toBe(5)
    expect(monday.getDay()).toBe(1)
  })
})

// ─── buildStatsSeries ─────────────────────────────────────────────────────

describe('buildStatsSeries', () => {
  it('retorna uma entrada por semana pedida', () => {
    expect(buildStatsSeries([], RANGE_WEEKS['12w'])).toHaveLength(12)
    expect(buildStatsSeries([], RANGE_WEEKS['6m'])).toHaveLength(26)
    expect(buildStatsSeries([], RANGE_WEEKS['1y'])).toHaveLength(52)
  })

  it('soma duração, reps e volume no bucket da semana atual', () => {
    const now = new Date().toISOString()
    const series = buildStatsSeries(
      [mkSession({ endedAt: now, durationSec: 1800, history: [{ reps: 10, weightKg: 50 }, { reps: 5, weightKg: 0 }] })],
      12,
    )
    const current = series[series.length - 1] // i=0 = semana atual
    expect(current.durationSec).toBe(1800)
    expect(current.reps).toBe(15)
    expect(current.volumeKg).toBe(500) // 10*50; a entrada com weightKg 0 é ignorada
  })

  it('ignora sessões sem endedAt', () => {
    const series = buildStatsSeries(
      [mkSession({ endedAt: null, durationSec: 999, history: [{ reps: 9, weightKg: 9 }] })],
      12,
    )
    expect(series.every((p) => p.durationSec === 0 && p.reps === 0 && p.volumeKg === 0)).toBe(true)
  })
})

// ─── currentWeekTotals ────────────────────────────────────────────────────

describe('currentWeekTotals', () => {
  it('soma apenas as sessões da semana atual', () => {
    const now = new Date().toISOString()
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const totals = currentWeekTotals([
      mkSession({ endedAt: now, durationSec: 600, history: [{ reps: 8, weightKg: 20 }] }),
      mkSession({ endedAt: tenDaysAgo, durationSec: 9999, history: [{ reps: 99, weightKg: 99 }] }),
    ])
    expect(totals.durationSec).toBe(600)
    expect(totals.reps).toBe(8)
    expect(totals.volumeKg).toBe(160) // 8*20; a sessão de 10 dias atrás fica de fora
  })
})
