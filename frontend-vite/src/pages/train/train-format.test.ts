import { describe, it, expect } from 'vitest'
import { formatDurationCompact, formatSetPerformanceLabel, formatMinutesLabel } from './train-format'

describe('formatDurationCompact', () => {
  it('segundos / minutos / horas', () => {
    expect(formatDurationCompact(45)).toBe('45s')
    expect(formatDurationCompact(90)).toBe('2min') // arredonda
    expect(formatDurationCompact(1800)).toBe('30min')
    expect(formatDurationCompact(3600)).toBe('1h')
    expect(formatDurationCompact(3900)).toBe('1h05') // padStart no minuto
  })
})

describe('formatSetPerformanceLabel', () => {
  it('peso × reps no formato BR (vírgula, sem .0)', () => {
    expect(formatSetPerformanceLabel({ weightKg: '100.0', reps: '8' }, false)).toBe('100 kg × 8 reps')
    expect(formatSetPerformanceLabel({ weightKg: '62.5', reps: '10' }, false)).toBe('62,5 kg × 10 reps')
  })
  it('bodyweight mostra só reps', () => {
    expect(formatSetPerformanceLabel({ weightKg: '', reps: '12' }, true)).toBe('12 reps')
  })
  it('só peso / só reps / nada', () => {
    expect(formatSetPerformanceLabel({ weightKg: '80', reps: '' }, false)).toBe('80 kg')
    expect(formatSetPerformanceLabel({ weightKg: '', reps: '5' }, false)).toBe('5 reps')
    expect(formatSetPerformanceLabel({ weightKg: '', reps: '' }, false)).toBeNull()
  })
})

describe('formatMinutesLabel', () => {
  it('min / horas / horas+min', () => {
    expect(formatMinutesLabel(0)).toBe('0min')
    expect(formatMinutesLabel(45)).toBe('45min')
    expect(formatMinutesLabel(60)).toBe('1h')
    expect(formatMinutesLabel(90)).toBe('1h 30min')
  })
})
