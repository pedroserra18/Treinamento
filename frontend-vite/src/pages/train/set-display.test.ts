import { describe, expect, it } from 'vitest'
import { computeSetPlaceholders, type LastSetPerformance } from './set-display'

const last = (partial: Partial<LastSetPerformance>): LastSetPerformance => ({
  reps: null,
  weightKg: null,
  rir: null,
  rpe: null,
  durationSec: null,
  distanceMeters: null,
  ...partial,
})

describe('computeSetPlaceholders — sem dado anterior', () => {
  it('usa em-dash e defaults de REPS', () => {
    const p = computeSetPlaceholders(undefined, 'REPS', '8')
    expect(p.previousLabel).toBe('—')
    expect(p.weightPlaceholder).toBe('kg')
    expect(p.repsPlaceholder).toBe('8') // suggestedReps
    expect(p.repsLabel).toBe('Repeticoes')
    expect(p.rirPlaceholder).toBe('rir')
    expect(p.rpePlaceholder).toBe('rpe')
  })

  it('default de TIME é 30s', () => {
    const p = computeSetPlaceholders(undefined, 'TIME', '8')
    expect(p.repsLabel).toBe('Tempo (s)')
    expect(p.repsPlaceholder).toBe('30')
  })

  it('default de DISTANCE é 20m', () => {
    const p = computeSetPlaceholders(undefined, 'DISTANCE', '8')
    expect(p.repsLabel).toBe('Distância (m)')
    expect(p.repsPlaceholder).toBe('20')
  })
})

describe('computeSetPlaceholders — previousLabel (REPS)', () => {
  it('peso × reps quando há ambos', () => {
    const p = computeSetPlaceholders(last({ reps: 10, weightKg: 50 }), 'REPS', '8')
    expect(p.previousLabel).toBe('50kg × 10')
    expect(p.weightPlaceholder).toBe('50 kg')
    expect(p.repsPlaceholder).toBe('10')
  })

  it('só reps quando peso é 0/null', () => {
    expect(computeSetPlaceholders(last({ reps: 12, weightKg: 0 }), 'REPS', '8').previousLabel).toBe('12 reps')
    expect(computeSetPlaceholders(last({ reps: 12 }), 'REPS', '8').previousLabel).toBe('12 reps')
  })

  it('em-dash quando não há reps nem peso úteis', () => {
    expect(computeSetPlaceholders(last({}), 'REPS', '8').previousLabel).toBe('—')
  })
})

describe('computeSetPlaceholders — previousLabel (TIME/DISTANCE)', () => {
  it('TIME mostra segundos', () => {
    const p = computeSetPlaceholders(last({ durationSec: 45 }), 'TIME', '8')
    expect(p.previousLabel).toBe('45s')
    expect(p.repsPlaceholder).toBe('45')
  })

  it('DISTANCE mostra metros', () => {
    const p = computeSetPlaceholders(last({ distanceMeters: 100 }), 'DISTANCE', '8')
    expect(p.previousLabel).toBe('100m')
    expect(p.repsPlaceholder).toBe('100')
  })
})

describe('computeSetPlaceholders — RIR/RPE', () => {
  it('usa os valores anteriores quando presentes', () => {
    const p = computeSetPlaceholders(last({ rir: 2, rpe: 8 }), 'REPS', '8')
    expect(p.rirPlaceholder).toBe('2')
    expect(p.rpePlaceholder).toBe('8')
  })
})
