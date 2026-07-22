import { describe, it, expect } from 'vitest'
import { normalizeDivisionLabel } from './recommendationService'

describe('normalizeDivisionLabel', () => {
  it('renomeia "Torso Legs" para "Torso Limbs"', () => {
    expect(normalizeDivisionLabel('Torso Legs')).toBe('Torso Limbs')
  })

  it('mantém as demais divisões inalteradas', () => {
    expect(normalizeDivisionLabel('Push Pull Legs')).toBe('Push Pull Legs')
    expect(normalizeDivisionLabel('Bro Split')).toBe('Bro Split')
  })
})
