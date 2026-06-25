import { describe, expect, it } from 'vitest'
import { computeSummaryMetrics, type LastUseInfo } from './summary-metrics'
import type { ActiveExercise } from './types'

const exercise = (
  exerciseId: string,
  exerciseName: string,
  checked: boolean[],
): ActiveExercise =>
  ({
    exerciseId,
    exerciseName,
    sets: checked.map((c) => ({ checked: c })),
  } as ActiveExercise)

const baseInput = {
  prByExerciseId: {} as Record<string, number | null>,
  prSnapshotAtStart: {} as Record<string, number>,
  activeExercises: [] as ActiveExercise[],
  originMode: 'EMPTY' as const,
  activePlanId: '',
  lastUseByPlanId: {} as Record<string, LastUseInfo>,
  elapsedSec: 0,
  summaryDurationMin: '',
}

describe('computeSummaryMetrics — PRs novos', () => {
  it('conta PR quando não havia anterior', () => {
    const m = computeSummaryMetrics({
      ...baseInput,
      prByExerciseId: { e1: 100 },
      activeExercises: [exercise('e1', 'Supino', [true])],
    })
    expect(m.newPrs).toEqual([{ name: 'Supino', load: 100, previous: null }])
  })

  it('conta PR quando supera o snapshot inicial', () => {
    const m = computeSummaryMetrics({
      ...baseInput,
      prByExerciseId: { e1: 120 },
      prSnapshotAtStart: { e1: 100 },
      activeExercises: [exercise('e1', 'Supino', [true])],
    })
    expect(m.newPrs).toHaveLength(1)
    expect(m.newPrs[0]).toEqual({ name: 'Supino', load: 120, previous: 100 })
  })

  it('NÃO conta PR quando não superou o anterior', () => {
    const m = computeSummaryMetrics({
      ...baseInput,
      prByExerciseId: { e1: 100 },
      prSnapshotAtStart: { e1: 100 },
      activeExercises: [exercise('e1', 'Supino', [true])],
    })
    expect(m.newPrs).toHaveLength(0)
  })

  it('ignora PR null', () => {
    const m = computeSummaryMetrics({
      ...baseInput,
      prByExerciseId: { e1: null },
      activeExercises: [exercise('e1', 'Supino', [true])],
    })
    expect(m.newPrs).toHaveLength(0)
  })
})

describe('computeSummaryMetrics — séries concluídas', () => {
  it('calcula contagem e percentual', () => {
    const m = computeSummaryMetrics({
      ...baseInput,
      activeExercises: [
        exercise('e1', 'A', [true, true, false]),
        exercise('e2', 'B', [true]),
      ],
    })
    expect(m.completedSetsCount).toBe(3)
    expect(m.totalSetsAttempted).toBe(4)
    expect(m.completePct).toBe(75)
  })

  it('percentual 0 quando não há séries', () => {
    const m = computeSummaryMetrics(baseInput)
    expect(m.completePct).toBe(0)
  })
})

describe('computeSummaryMetrics — vs último treino', () => {
  const yesterdayIso = () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString()
  }

  it('compara duração quando há sessão anterior em outro dia (≥5min)', () => {
    const m = computeSummaryMetrics({
      ...baseInput,
      originMode: 'ROUTINE',
      activePlanId: 'p1',
      elapsedSec: 30 * 60, // 30min agora
      lastUseByPlanId: {
        p1: { endedAt: yesterdayIso(), durationSec: 45 * 60, planId: 'p1', planName: 'X' },
      },
    })
    expect(m.lastDurationMin).toBe(45)
    expect(m.durationDelta).toBe(-15) // 30 - 45
    expect(m.hasSecondRow).toBe(true)
  })

  it('NÃO compara quando a última sessão foi hoje', () => {
    const m = computeSummaryMetrics({
      ...baseInput,
      originMode: 'ROUTINE',
      activePlanId: 'p1',
      elapsedSec: 30 * 60,
      lastUseByPlanId: {
        p1: { endedAt: new Date().toISOString(), durationSec: 45 * 60, planId: 'p1', planName: 'X' },
      },
    })
    expect(m.durationDelta).toBeNull()
  })

  it('NÃO compara em treino vazio (originMode EMPTY)', () => {
    const m = computeSummaryMetrics({
      ...baseInput,
      originMode: 'EMPTY',
      elapsedSec: 30 * 60,
      lastUseByPlanId: {
        p1: { endedAt: yesterdayIso(), durationSec: 45 * 60, planId: 'p1', planName: 'X' },
      },
    })
    expect(m.durationDelta).toBeNull()
  })

  it('usa a duração editada manualmente (summaryDurationMin) e não o cronômetro', () => {
    const m = computeSummaryMetrics({
      ...baseInput,
      originMode: 'ROUTINE',
      activePlanId: 'p1',
      elapsedSec: 30 * 60, // cronômetro marcou 30min...
      summaryDurationMin: '50', // ...mas o usuário editou pra 50min
      lastUseByPlanId: {
        p1: { endedAt: yesterdayIso(), durationSec: 45 * 60, planId: 'p1', planName: 'X' },
      },
    })
    expect(m.durationDelta).toBe(5) // 50 - 45, não 30 - 45
  })
})
