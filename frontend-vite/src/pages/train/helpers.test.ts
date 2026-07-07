import { describe, expect, it } from 'vitest'
import {
  calculateTotals,
  createSet,
  estimatePlanMinutes,
  isAiSourcedPlan,
  localDayKey,
  parseDurationMin,
  parsePositiveInt,
  planToRoutineInitial,
  relativeDaysFromNow,
  sanitizeDecimalInput,
  toFiniteNumber,
} from './helpers'
import type { ActiveExercise, ExerciseSetInput } from './types'
import type { WorkoutPlan } from '../../types/workout'

describe('parseDurationMin', () => {
  it('aceita inteiro puro como minutos', () => {
    expect(parseDurationMin('65', 0)).toBe(65)
  })
  it('aceita formato HH:MM', () => {
    expect(parseDurationMin('1:05', 0)).toBe(65)
  })
  it('aceita formato 1h05 e 1h', () => {
    expect(parseDurationMin('1h05', 0)).toBe(65)
    expect(parseDurationMin('1h', 0)).toBe(60)
  })
  it('aceita 90min e 1.5h', () => {
    expect(parseDurationMin('90min', 0)).toBe(90)
    expect(parseDurationMin('1.5h', 0)).toBe(90)
  })
  it('aceita vírgula como separador decimal', () => {
    expect(parseDurationMin('1,5h', 0)).toBe(90)
  })
  it('retorna fallback pra entrada vazia ou inválida', () => {
    expect(parseDurationMin('', 42)).toBe(42)
    expect(parseDurationMin('abc', 42)).toBe(42)
  })
})

describe('sanitizeDecimalInput', () => {
  it('mantém vírgula como separador de display', () => {
    expect(sanitizeDecimalInput('50,5')).toBe('50,5')
  })
  it('normaliza ponto colado pra vírgula', () => {
    expect(sanitizeDecimalInput('50.5')).toBe('50,5')
  })
  it('mantém apenas o primeiro separador', () => {
    expect(sanitizeDecimalInput('50,5,3')).toBe('50,53')
  })
  it('remove caracteres não numéricos', () => {
    expect(sanitizeDecimalInput('5a0kg')).toBe('50')
  })
  it('limita as casas decimais (default 3)', () => {
    expect(sanitizeDecimalInput('1,23456')).toBe('1,234')
  })
  it('preserva separador final intermediário', () => {
    expect(sanitizeDecimalInput('50,')).toBe('50,')
  })
})

describe('toFiniteNumber', () => {
  it('converte string com vírgula', () => {
    expect(toFiniteNumber('50,5')).toBe(50.5)
  })
  it('passa number intacto', () => {
    expect(toFiniteNumber(12)).toBe(12)
  })
  it('retorna null pra null/undefined/inválido', () => {
    expect(toFiniteNumber(null)).toBeNull()
    expect(toFiniteNumber(undefined)).toBeNull()
    expect(toFiniteNumber('abc')).toBeNull()
  })
})

describe('localDayKey', () => {
  it('usa componentes locais ano-mês-dia', () => {
    const d = new Date(2026, 5, 15, 22, 30)
    expect(localDayKey(d)).toBe('2026-5-15')
  })
})

describe('relativeDaysFromNow', () => {
  const isoDaysAgo = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }
  it('hoje', () => {
    expect(relativeDaysFromNow(new Date().toISOString())).toBe('hoje')
  })
  it('ontem', () => {
    expect(relativeDaysFromNow(isoDaysAgo(1))).toBe('ontem')
  })
  it('há N dias (<7)', () => {
    expect(relativeDaysFromNow(isoDaysAgo(3))).toBe('há 3 dias')
  })
  it('há 1 semana', () => {
    expect(relativeDaysFromNow(isoDaysAgo(10))).toBe('há 1 semana')
  })
})

describe('createSet', () => {
  it('cria série normal não marcada por padrão', () => {
    const s = createSet()
    expect(s.setType).toBe('normal')
    expect(s.checked).toBe(false)
    expect(s.dropSets).toHaveLength(1)
  })
})

describe('calculateTotals', () => {
  const makeExercise = (sets: ExerciseSetInput[]): ActiveExercise =>
    ({ suggestedReps: '8', sets } as ActiveExercise)

  it('só conta séries marcadas (checked)', () => {
    const ex = makeExercise([
      { ...createSet('10', '50'), checked: true },
      { ...createSet('10', '50'), checked: false },
    ])
    const { totalSeries, totalVolumeKg } = calculateTotals([ex])
    expect(totalSeries).toBe(1)
    expect(totalVolumeKg).toBe(500)
  })

  it('usa suggestedReps quando reps vazio numa série marcada', () => {
    const ex = makeExercise([{ ...createSet('', '50'), checked: true }])
    const { totalSeries, totalVolumeKg } = calculateTotals([ex])
    expect(totalSeries).toBe(1)
    expect(totalVolumeKg).toBe(400) // 50 * 8 (suggested)
  })

  it('soma volume de drop sets', () => {
    const ex = makeExercise([
      {
        ...createSet('', ''),
        checked: true,
        setType: 'drop',
        dropSets: [
          { weightKg: '40', reps: '10' },
          { weightKg: '30', reps: '8' },
        ],
      },
    ])
    const { totalSeries, totalVolumeKg } = calculateTotals([ex])
    expect(totalSeries).toBe(1)
    expect(totalVolumeKg).toBe(640) // 40*10 + 30*8
  })

  it('soma volume de cluster (peso * reps * count)', () => {
    const ex = makeExercise([
      {
        ...createSet('', '60'),
        checked: true,
        setType: 'cluster',
        clusterReps: '3',
        clusterCount: '4',
      },
    ])
    const { totalSeries, totalVolumeKg } = calculateTotals([ex])
    expect(totalSeries).toBe(1)
    expect(totalVolumeKg).toBe(720) // 60 * 3 * 4
  })
})

describe('parsePositiveInt', () => {
  it('converte inteiro positivo (trunca)', () => {
    expect(parsePositiveInt('7')).toBe(7)
    expect(parsePositiveInt('7.9')).toBe(7)
  })
  it('retorna fallback para zero/negativo/inválido', () => {
    expect(parsePositiveInt('0', 3)).toBe(3)
    expect(parsePositiveInt('-2', 3)).toBe(3)
    expect(parsePositiveInt('abc', 3)).toBe(3)
    expect(parsePositiveInt('')).toBe(0)
  })
})

describe('isAiSourcedPlan', () => {
  it('detecta o marcador [Template: ...] na descrição', () => {
    expect(isAiSourcedPlan({ description: 'Foco em peito [Template: PPL]' } as WorkoutPlan)).toBe(true)
    expect(isAiSourcedPlan({ description: 'Rotina manual' } as WorkoutPlan)).toBe(false)
    expect(isAiSourcedPlan({ description: null } as unknown as WorkoutPlan)).toBe(false)
  })
})

describe('estimatePlanMinutes', () => {
  it('estima ~35s de trabalho + descanso por série, mínimo 5min', () => {
    // 2 exercícios: 3x(35+60)=285s e 4x(35+90)=500s => 785s => 13min
    const plan = { exercises: [{ sets: 3, restSec: 60 }, { sets: 4, restSec: 90 }] } as WorkoutPlan
    expect(estimatePlanMinutes(plan)).toBe(13)
  })
  it('usa defaults (3 séries, 60s) quando ausentes e respeita o piso de 5min', () => {
    expect(estimatePlanMinutes({ exercises: [] } as unknown as WorkoutPlan)).toBe(5)
  })
})

describe('planToRoutineInitial', () => {
  it('sem marcador __PERF__, gera N séries a partir de ex.sets com reps do plano', () => {
    const plan = {
      name: 'Peito A',
      exercises: [{
        exercise: { id: 'ex1', name: 'Supino', thumbnailUrl: null },
        customName: null,
        notes: 'aquecer bem',
        sets: 2,
        repsMin: 8,
        repsMax: 12,
        restSec: 90,
      }],
    } as unknown as WorkoutPlan

    const result = planToRoutineInitial(plan)
    expect(result.name).toBe('Peito A')
    expect(result.exercises).toHaveLength(1)
    const [ex] = result.exercises
    expect(ex.exerciseId).toBe('ex1')
    expect(ex.exerciseName).toBe('Supino')
    expect(ex.restSec).toBe(90)
    expect(ex.sets).toHaveLength(2)
    expect(ex.sets[0]).toEqual({ repsMin: '8', repsMax: '12', type: 'normal' })
  })
})
