import { describe, it, expect } from 'vitest'
import { toNumberOrUndefined, pctDelta } from './progress-utils'

describe('toNumberOrUndefined', () => {
  it('parseia números válidos (aceita vírgula decimal e espaços)', () => {
    expect(toNumberOrUndefined('5')).toBe(5)
    expect(toNumberOrUndefined('5,5')).toBe(5.5)
    expect(toNumberOrUndefined(' 12 ')).toBe(12)
  })

  it('retorna undefined para vazio ou não-numérico', () => {
    expect(toNumberOrUndefined('')).toBeUndefined()
    expect(toNumberOrUndefined('   ')).toBeUndefined()
    expect(toNumberOrUndefined('abc')).toBeUndefined()
  })
})

describe('pctDelta', () => {
  it('calcula a variação percentual arredondada', () => {
    expect(pctDelta(150, 100)).toBe(50)
    expect(pctDelta(50, 100)).toBe(-50)
    expect(pctDelta(110, 100)).toBe(10)
  })

  it('trata a divisão por zero (base 0)', () => {
    expect(pctDelta(0, 0)).toBe(0)
    expect(pctDelta(5, 0)).toBeNull()
  })
})
