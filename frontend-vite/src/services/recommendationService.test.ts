import { describe, it, expect } from 'vitest'
import {
  normalizeDivisionLabel,
  parseReps,
  recommendationToPlanInput,
  type WorkoutRecommendation,
} from './recommendationService'

describe('normalizeDivisionLabel', () => {
  it('renomeia "Torso Legs" para "Torso Limbs"', () => {
    expect(normalizeDivisionLabel('Torso Legs')).toBe('Torso Limbs')
  })

  it('mantém as demais divisões inalteradas', () => {
    expect(normalizeDivisionLabel('Push Pull Legs')).toBe('Push Pull Legs')
    expect(normalizeDivisionLabel('Bro Split')).toBe('Bro Split')
  })
})

describe('parseReps', () => {
  it('faixa "8-10" vira {repsMin, repsMax}', () => {
    expect(parseReps('8-10')).toEqual({ repsMin: 8, repsMax: 10 })
  })

  it('aceita travessão longo "12–15"', () => {
    expect(parseReps('12–15')).toEqual({ repsMin: 12, repsMax: 15 })
  })

  it('valor único "12" vira min = max', () => {
    expect(parseReps('12')).toEqual({ repsMin: 12, repsMax: 12 })
  })

  it('sem número reconhecível vira objeto vazio', () => {
    expect(parseReps('AMRAP')).toEqual({})
  })
})

describe('recommendationToPlanInput', () => {
  const rec: WorkoutRecommendation = {
    division: 'Push Pull Legs',
    daysPerWeek: 3,
    rationale: 'x',
    sessions: [
      {
        dayNumber: 1,
        focus: 'Push',
        exercises: [
          { id: 'ex-1', name: 'Supino', sets: 4, reps: '8-10', restSeconds: 90 },
          { id: 'ex-2', name: 'Desenvolvimento', sets: 3, reps: '12', restSeconds: 60 },
        ],
      },
      {
        dayNumber: 2,
        focus: 'Pull',
        exercises: [{ id: 'ex-3', name: 'Remada', sets: 4, reps: '8-10', restSeconds: 90 }],
      },
    ],
  }

  it('usa a 1ª sessão por padrão e mapeia os exercícios', () => {
    const input = recommendationToPlanInput(rec)
    expect(input.name).toBe('Push')
    expect(input.source).toBe('RECOMMENDATION')
    expect(input.exercises).toEqual([
      { exerciseId: 'ex-1', sets: 4, repsMin: 8, repsMax: 10, restSec: 90 },
      { exerciseId: 'ex-2', sets: 3, repsMin: 12, repsMax: 12, restSec: 60 },
    ])
  })

  it('aceita o índice de sessão para salvar outro dia', () => {
    const input = recommendationToPlanInput(rec, 1)
    expect(input.name).toBe('Pull')
    expect(input.exercises).toEqual([
      { exerciseId: 'ex-3', sets: 4, repsMin: 8, repsMax: 10, restSec: 90 },
    ])
  })
})
