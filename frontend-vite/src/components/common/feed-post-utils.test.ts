import { describe, it, expect } from 'vitest'
import type { WorkoutSet } from '../../services/socialService'
import {
  AVATAR_COLORS,
  MUSCLE_PILL,
  avatarColorFromId,
  avatarInitials,
  detectSetKind,
  formatCardioChip,
  formatDuration,
  formatMMSS,
  formatVolume,
  getRelLabel,
  musclePillStyle,
  setMagnitude,
  timeAgo,
} from './feed-post-utils'

function mkSet(o: Partial<WorkoutSet>): WorkoutSet {
  return { setNumber: 1, reps: null, weightKg: null, durationSec: null, distanceMeters: null, perceivedExertion: null, ...o }
}

describe('formatDuration', () => {
  it('travessão quando nulo/zero', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(0)).toBe('—')
  })
  it('minutos abaixo de 1h', () => {
    expect(formatDuration(45 * 60)).toBe('45 min')
  })
  it('horas + minutos a partir de 1h', () => {
    expect(formatDuration(60 * 60)).toBe('1h 0min')
    expect(formatDuration(90 * 60)).toBe('1h 30min')
  })
})

describe('formatVolume', () => {
  it('travessão sem volume', () => {
    expect(formatVolume(null)).toBe('—')
    expect(formatVolume(0)).toBe('—')
  })
  it('kg abaixo de 1000', () => {
    expect(formatVolume(500)).toBe('500 kg')
  })
  it('toneladas a partir de 1000', () => {
    expect(formatVolume(1000)).toBe('1.0 t')
    expect(formatVolume(3200)).toBe('3.2 t')
  })
})

describe('formatMMSS', () => {
  it('formata mm:ss com zero à esquerda', () => {
    expect(formatMMSS(0)).toBe('00:00')
    expect(formatMMSS(65)).toBe('01:05')
    expect(formatMMSS(605)).toBe('10:05')
  })
})

describe('formatCardioChip', () => {
  it('mostra minutos + km quando há distância', () => {
    expect(formatCardioChip({ type: 'RUN', durationSec: 1800, distanceMeters: 5000 })).toBe('30 min · 5 km')
  })
  it('só minutos sem distância', () => {
    expect(formatCardioChip({ type: 'WALK', durationSec: 1800, distanceMeters: null })).toBe('30 min')
  })
})

describe('avatarInitials', () => {
  it('duas iniciais do nome', () => {
    expect(avatarInitials('João Silva', 'jsilva')).toBe('JS')
  })
  it('usa o handle quando não há nome', () => {
    expect(avatarInitials(null, 'pedro')).toBe('P')
  })
  it('interrogação quando vazio', () => {
    expect(avatarInitials('', '')).toBe('?')
  })
})

describe('avatarColorFromId', () => {
  it('retorna uma cor da paleta e é estável', () => {
    const c = avatarColorFromId('abc-123')
    expect(AVATAR_COLORS).toContain(c)
    expect(avatarColorFromId('abc-123')).toBe(c)
  })
})

describe('musclePillStyle', () => {
  it('casa o grupo conhecido (case/acentos ignorados)', () => {
    expect(musclePillStyle('CHEST')).toEqual(MUSCLE_PILL.CHEST)
    expect(musclePillStyle('peito')).toEqual(MUSCLE_PILL.PEITO)
  })
  it('cai no fallback pra grupo desconhecido', () => {
    expect(musclePillStyle('zzz')).toEqual({ bg: 'var(--surface-hover)', fg: 'var(--muted)' })
  })
})

describe('getRelLabel', () => {
  it('próprio / amigo / estranho', () => {
    expect(getRelLabel(true, false)).toBe('Você')
    expect(getRelLabel(false, true)).toBe('Amigo')
    expect(getRelLabel(false, false)).toBeNull()
  })
})

describe('detectSetKind / setMagnitude', () => {
  it('detecta o tipo da série', () => {
    expect(detectSetKind(mkSet({ durationSec: 30 }))).toBe('duration')
    expect(detectSetKind(mkSet({ distanceMeters: 100 }))).toBe('distance')
    expect(detectSetKind(mkSet({ reps: 10 }))).toBe('reps')
  })
  it('magnitude por tipo', () => {
    expect(setMagnitude(mkSet({ durationSec: 30 }), 'duration')).toBe(30)
    expect(setMagnitude(mkSet({ distanceMeters: 100 }), 'distance')).toBe(100)
    expect(setMagnitude(mkSet({ reps: 10, weightKg: 40 }), 'reps')).toBe(400)
    expect(setMagnitude(mkSet({ reps: 12, weightKg: null }), 'reps')).toBe(12)
  })
})

describe('timeAgo', () => {
  it('"agora" para menos de 1 min', () => {
    expect(timeAgo(new Date().toISOString())).toBe('agora')
  })
  it('minutos atrás', () => {
    expect(timeAgo(new Date(Date.now() - 2 * 60000).toISOString())).toBe('2m atrás')
  })
})
