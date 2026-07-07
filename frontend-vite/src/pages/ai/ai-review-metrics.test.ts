import { describe, it, expect } from 'vitest'
import {
  getChipTone,
  dayOfWeekLabels,
  friendlyBlockName,
  rpeFromRir,
  focoFromDayLabel,
} from './ai-review-metrics'

describe('getChipTone', () => {
  it('classifica IA / vazio / definido pelo usuário', () => {
    expect(getChipTone('IA decide')).toBe('ai')
    expect(getChipTone('auto')).toBe('ai')
    expect(getChipTone('—')).toBe('muted')
    expect(getChipTone('Sem foco')).toBe('muted')
    expect(getChipTone('Hipertrofia')).toBe('brand')
  })
})

describe('dayOfWeekLabels', () => {
  it('distribui dias de descanso entre treinos', () => {
    expect(dayOfWeekLabels(0)).toEqual([])
    expect(dayOfWeekLabels(3)).toEqual(['SEG', 'QUA', 'SEX'])
    expect(dayOfWeekLabels(7)).toEqual(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'])
  })
})

describe('friendlyBlockName', () => {
  it('traduz o prefixo em inglês para PT', () => {
    expect(friendlyBlockName('Push A')).toBe('Empurrar A')
    expect(friendlyBlockName('Lower B')).toBe('Inferior B')
    expect(friendlyBlockName('Peito')).toBe('Peito')
  })
})

describe('rpeFromRir', () => {
  it('mapeia RIR alvo para RPE numérico', () => {
    expect(rpeFromRir('Falha')).toBe('10')
    expect(rpeFromRir('RIR 1-2')).toBe('9')
    expect(rpeFromRir('desconhecido')).toBe('—')
  })
})

describe('focoFromDayLabel', () => {
  it('deriva foco superior/inferior/total/misto', () => {
    expect(focoFromDayLabel('Upper A')).toBe('superior')
    expect(focoFromDayLabel('Lower B')).toBe('inferior')
    expect(focoFromDayLabel('Full Body')).toBe('total')
    expect(focoFromDayLabel('Circuito X')).toBe('misto')
  })
})
