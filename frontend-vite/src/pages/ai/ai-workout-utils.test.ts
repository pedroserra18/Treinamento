import { describe, it, expect } from 'vitest'
import { ageBucketFromBirthDate, estimateDurationMin } from './ai-workout-utils'

describe('ageBucketFromBirthDate', () => {
  it('classifica em faixas etárias', () => {
    expect(ageBucketFromBirthDate('2010-06-01')).toBe('Menos de 18')
    expect(ageBucketFromBirthDate('1970-06-01')).toBe('55+')
  })

  it('retorna string vazia para data inválida', () => {
    expect(ageBucketFromBirthDate('nao-e-data')).toBe('')
  })
})

describe('estimateDurationMin', () => {
  it('lista vazia = só o overhead fixo de transição (90s ≈ 2min)', () => {
    expect(estimateDurationMin([])).toBe(2)
  })

  it('cresce com mais exercícios', () => {
    const um = estimateDurationMin([{ sets: 3, repsMax: 10, restSec: 90 }])
    const dois = estimateDurationMin([
      { sets: 3, repsMax: 10, restSec: 90 },
      { sets: 3, repsMax: 10, restSec: 90 },
    ])
    expect(um).toBeGreaterThan(0)
    expect(dois).toBeGreaterThan(um)
  })
})
