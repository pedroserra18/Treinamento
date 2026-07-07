import { describe, expect, it } from 'vitest'
import {
  createSeriesDraft,
  estimate1rm,
  parsePerformanceFromNotes,
  buildNotesWithPerformance,
  isDuplicateExerciseError,
  type PerformanceDraft,
} from './workouts-utils'

describe('estimate1rm', () => {
  it('usa a fórmula de Epley (peso * (1 + 0.0333 * reps))', () => {
    expect(estimate1rm(100, 10)).toBeCloseTo(133.3, 1)
    expect(estimate1rm(60, 1)).toBeCloseTo(62, 0)
  })
  it('retorna 0 para peso ou reps não positivos', () => {
    expect(estimate1rm(0, 10)).toBe(0)
    expect(estimate1rm(100, 0)).toBe(0)
    expect(estimate1rm(-5, 5)).toBe(0)
  })
})

describe('isDuplicateExerciseError', () => {
  it('detecta variações de mensagem de duplicidade (case-insensitive)', () => {
    expect(isDuplicateExerciseError('Duplicate entry')).toBe(true)
    expect(isDuplicateExerciseError('Exercicio ja existe')).toBe(true)
    expect(isDuplicateExerciseError('Already exists')).toBe(true)
    expect(isDuplicateExerciseError('erro de rede')).toBe(false)
  })
})

describe('createSeriesDraft', () => {
  it('preenche defaults e um dropSet vazio', () => {
    const s = createSeriesDraft()
    expect(s.setType).toBe('normal')
    expect(s.reps).toBe('')
    expect(s.dropSets).toEqual([{ weightKg: '', reps: '' }])
  })
  it('respeita valores iniciais', () => {
    const s = createSeriesDraft({ reps: '8', loadKg: '50', setType: 'drop' })
    expect(s.reps).toBe('8')
    expect(s.loadKg).toBe('50')
    expect(s.setType).toBe('drop')
  })
})

describe('buildNotesWithPerformance <-> parsePerformanceFromNotes (round-trip)', () => {
  it('serializa séries normais e reidrata reps/carga', () => {
    const draft: PerformanceDraft = {
      repsMode: 'fixed',
      fixedReps: '',
      rangeMin: '',
      rangeMax: '',
      series: [
        createSeriesDraft({ reps: '10', loadKg: '50', rpe: '8' }),
        createSeriesDraft({ reps: '8', loadKg: '55' }),
      ],
    }
    const notes = buildNotesWithPerformance('nota do usuário', draft)
    // preserva a nota do usuário (marcador anexado, não substitui)
    expect(notes).toContain('nota do usuário')

    const parsed = parsePerformanceFromNotes(notes)
    expect(parsed.series).toHaveLength(2)
    expect(parsed.series![0].reps).toBe('10')
    expect(parsed.series![0].loadKg).toBe('50')
    expect(parsed.series![1].reps).toBe('8')
  })

  it('descarta séries sem reps válidas', () => {
    const draft: PerformanceDraft = {
      repsMode: 'fixed',
      fixedReps: '',
      rangeMin: '',
      rangeMax: '',
      series: [createSeriesDraft({ reps: '0' }), createSeriesDraft({ reps: '12' })],
    }
    const parsed = parsePerformanceFromNotes(buildNotesWithPerformance(null, draft))
    expect(parsed.series).toHaveLength(1)
    expect(parsed.series![0].reps).toBe('12')
  })
})

describe('parsePerformanceFromNotes', () => {
  it('retorna objeto vazio quando não há marcador de performance', () => {
    expect(parsePerformanceFromNotes(null)).toEqual({})
    expect(parsePerformanceFromNotes('só uma nota comum')).toEqual({})
  })
})
