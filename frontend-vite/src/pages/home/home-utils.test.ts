import { describe, it, expect } from 'vitest'
import type { WorkoutSessionHistory } from '../../types/workout'
import {
  calcVolumeKg,
  startOfWeek,
  isoWeekNumber,
  buildHeatmap,
  buildWeeklySeries,
  summarizeLastWorkout,
  trainingsToBeatBestWeek,
  lineSparkPath,
  relativeBigDate,
  normalizeDivisionLabel,
  type WeeklyAgg,
} from './home-utils'

// ─── Fixtures ─────────────────────────────────────────────────────────────

function mkEntry(reps: number | null, weightKg: number | null, rpe: number | null = null): WorkoutSessionHistory['history'][number] {
  return {
    id: `e-${Math.random()}`,
    executionOrder: 0,
    setNumber: 1,
    reps,
    weightKg,
    durationSec: null,
    distanceMeters: null,
    perceivedExertion: rpe,
    notes: null,
    completedAt: '2026-01-01T00:00:00.000Z',
    exercise: { id: 'ex-1', name: 'Ex', primaryMuscleGroup: 'CHEST' },
  }
}

function mkSession(o: {
  endedAt: string | null
  durationSec: number | null
  history?: Array<{ reps: number | null; weightKg: number | null; rpe?: number | null }>
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
    history: (o.history ?? []).map((h) => mkEntry(h.reps, h.weightKg, h.rpe ?? null)),
  }
}

// ─── calcVolumeKg ─────────────────────────────────────────────────────────

describe('calcVolumeKg', () => {
  it('soma peso × reps de cada série', () => {
    expect(calcVolumeKg(mkSession({ endedAt: null, durationSec: null, history: [{ reps: 10, weightKg: 50 }, { reps: 8, weightKg: 20 }] }))).toBe(660)
  })

  it('trata nulos como zero', () => {
    expect(calcVolumeKg(mkSession({ endedAt: null, durationSec: null, history: [{ reps: null, weightKg: 50 }, { reps: 5, weightKg: null }] }))).toBe(0)
  })
})

// ─── startOfWeek / isoWeekNumber ──────────────────────────────────────────

describe('startOfWeek', () => {
  it('cai sempre na segunda à meia-noite', () => {
    const monday = startOfWeek(new Date(2026, 0, 7, 15, 30)) // quarta
    expect(monday.getDay()).toBe(1)
    expect(monday.getHours()).toBe(0)
    expect(monday.getDate()).toBe(5)
  })
})

describe('isoWeekNumber', () => {
  it('4 de janeiro fica na semana 1 (ISO)', () => {
    expect(isoWeekNumber(new Date(2026, 0, 4))).toBe(1)
  })

  it('avança uma semana a cada 7 dias', () => {
    const base = new Date(2026, 5, 15)
    const next = new Date(2026, 5, 22)
    expect(isoWeekNumber(next)).toBe(isoWeekNumber(base) + 1)
  })
})

// ─── buildHeatmap ─────────────────────────────────────────────────────────

describe('buildHeatmap', () => {
  it('sempre tem 30 células', () => {
    expect(buildHeatmap([])).toHaveLength(30)
  })

  it('classifica a intensidade pela duração do dia', () => {
    const today = new Date().toISOString()
    const cells = buildHeatmap([mkSession({ endedAt: today, durationSec: 2700, history: [] })]) // 45 min
    const last = cells[cells.length - 1]
    expect(last.sessions).toBe(1)
    expect(last.intensity).toBe(4)
  })

  it('dias sem treino têm intensidade 0', () => {
    expect(buildHeatmap([]).every((c) => c.intensity === 0 && c.sessions === 0)).toBe(true)
  })
})

// ─── buildWeeklySeries ────────────────────────────────────────────────────

describe('buildWeeklySeries', () => {
  it('retorna 8 semanas', () => {
    expect(buildWeeklySeries([])).toHaveLength(8)
  })

  it('agrega sessões e volume na semana atual', () => {
    const now = new Date().toISOString()
    const series = buildWeeklySeries([mkSession({ endedAt: now, durationSec: 1800, history: [{ reps: 10, weightKg: 50 }] })])
    const current = series[series.length - 1]
    expect(current.sessions).toBe(1)
    expect(current.volumeKg).toBe(500)
  })
})

// ─── summarizeLastWorkout ─────────────────────────────────────────────────

describe('summarizeLastWorkout', () => {
  it('retorna null sem sessão', () => {
    expect(summarizeLastWorkout(null)).toBeNull()
  })

  it('resume nome, minutos, reps, exercícios e RPE médio', () => {
    const s = summarizeLastWorkout(
      mkSession({ endedAt: '2026-05-14T10:00:00.000Z', durationSec: 600, history: [{ reps: 10, weightKg: 40, rpe: 8 }, { reps: 6, weightKg: 40, rpe: 6 }] }),
    )
    expect(s).not.toBeNull()
    expect(s!.name).toBe('Treino livre')
    expect(s!.minutes).toBe(10)
    expect(s!.totalReps).toBe(16)
    expect(s!.exerciseCount).toBe(1)
    expect(s!.avgRpe).toBe(7)
  })
})

// ─── trainingsToBeatBestWeek ──────────────────────────────────────────────

describe('trainingsToBeatBestWeek', () => {
  const wk = (sessions: number): WeeklyAgg => ({ weekStart: 0, sessions, volumeKg: 0 })

  it('quantos treinos faltam pra bater a melhor das 4 semanas anteriores', () => {
    // prev4 = [2,3,1,4] (best 4), atual = 2 → 4-2+1 = 3
    const weekly = [0, 0, 0, 2, 3, 1, 4, 2].map(wk)
    expect(trainingsToBeatBestWeek(weekly)).toBe(3)
  })

  it('retorna 0 quando a semana atual já é a melhor', () => {
    const weekly = [0, 0, 0, 5, 1, 1, 1, 6].map(wk)
    expect(trainingsToBeatBestWeek(weekly)).toBe(0)
  })
})

// ─── lineSparkPath ────────────────────────────────────────────────────────

describe('lineSparkPath', () => {
  it('vazio quando não há valores', () => {
    expect(lineSparkPath([])).toEqual({ line: '', area: '' })
  })

  it('começa com M e fecha a área com Z', () => {
    const { line, area } = lineSparkPath([1, 2, 3])
    expect(line.startsWith('M')).toBe(true)
    expect(area.endsWith('Z')).toBe(true)
  })
})

// ─── relativeBigDate / normalizeDivisionLabel ─────────────────────────────

describe('relativeBigDate', () => {
  it('mostra travessão quando nulo', () => {
    expect(relativeBigDate(null)).toBe('—')
  })

  it('formata a data com o ano', () => {
    expect(relativeBigDate('2026-05-14T10:00:00.000Z')).toContain('2026')
  })
})

describe('normalizeDivisionLabel', () => {
  it('renomeia "Torso Legs" para "Torso Limbs"', () => {
    expect(normalizeDivisionLabel('Torso Legs')).toBe('Torso Limbs')
  })

  it('mantém as demais divisões', () => {
    expect(normalizeDivisionLabel('Push Pull Legs')).toBe('Push Pull Legs')
  })
})
