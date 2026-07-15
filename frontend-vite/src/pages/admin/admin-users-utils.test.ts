import { describe, it, expect } from 'vitest'
import {
  initials,
  avatarGradient,
  onboardingProgress,
  onboardingMissing,
  csvCell,
  AVATAR_GRADIENTS,
} from './admin-users-utils'

describe('initials', () => {
  it('usa as duas primeiras palavras do nome', () => {
    expect(initials('Pedro Serra', 'x@y.com')).toBe('PS')
  })
  it('cai pro email quando nome é null', () => {
    expect(initials(null, 'joao@example.com')).toBe('JO')
  })
  it('nome de uma palavra usa as 2 primeiras letras', () => {
    expect(initials('Madonna', 'x@y.com')).toBe('MA')
  })
})

describe('avatarGradient', () => {
  it('é determinístico para o mesmo id', () => {
    expect(avatarGradient('user-123')).toBe(avatarGradient('user-123'))
  })
  it('retorna um dos gradientes da paleta', () => {
    expect(AVATAR_GRADIENTS).toContain(avatarGradient('qualquer-id'))
  })
})

describe('onboardingProgress', () => {
  const base = {
    birthDate: null,
    availableDaysPerWeek: null,
    heightCm: null,
    weightKg: null,
    experienceLevel: null,
    primaryGoal: null,
  }
  it('conta 0 de 6 quando tudo é nulo', () => {
    expect(onboardingProgress(base)).toEqual({ filled: 0, total: 6 })
  })
  it('conta os campos preenchidos', () => {
    expect(onboardingProgress({ ...base, birthDate: '2000-01-01', weightKg: 80 }))
      .toEqual({ filled: 2, total: 6 })
  })
})

describe('onboardingMissing', () => {
  it('lista os rótulos dos campos faltando', () => {
    const missing = onboardingMissing({
      birthDate: '2000-01-01',
      availableDaysPerWeek: 3,
      heightCm: null,
      weightKg: null,
      experienceLevel: 'ADVANCED',
      primaryGoal: 'STRENGTH',
    })
    expect(missing).toEqual(['Altura', 'Peso'])
  })
})

describe('csvCell', () => {
  it('não escapa valores simples', () => {
    expect(csvCell('joao')).toBe('joao')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(null)).toBe('')
  })
  it('escapa vírgula, aspas, quebra de linha e ponto-e-vírgula', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""')
  })
})
