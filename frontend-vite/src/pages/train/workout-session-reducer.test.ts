import { describe, it, expect } from 'vitest'
import {
  workoutSessionReducer as reduce,
  initialWorkoutSessionState as initial,
  type WorkoutSessionState,
} from './workout-session-reducer'
import { makeActiveExercise, makeSet } from '../../test/factories'
import type { CardioEntryInput } from '../../types/workout'

// Rede de segurança do refactor de useReducer: trava as transições do ciclo de
// vida do treino como lógica pura (start empty/routine, ir pro resumo, reset,
// updates de exercícios) — comportamento idêntico ao que hoje está espalhado
// em setStates no TrainPage.

const START = new Date('2026-06-29T10:00:00Z')
const END = new Date('2026-06-29T11:00:00Z')

// Estado "sujo" (treino em andamento) pra provar que as ações resetam direito.
function dirtyState(): WorkoutSessionState {
  return {
    ...initial,
    screen: 'ACTIVE',
    originMode: 'ROUTINE',
    activePlanName: 'Peito e Tríceps',
    activeExercises: [makeActiveExercise({ sets: [makeSet({ checked: true })] })],
    cardioEntries: [{ type: 'RUN', durationSec: 600 }],
    elapsedSec: 1234,
    isWorkoutRunning: true,
    manualTimerMinutes: '45',
    startedAt: new Date('2026-06-01T08:00:00Z'),
    endedAt: null,
  }
}

describe('workoutSessionReducer', () => {
  it('START_EMPTY zera a sessão, começa a rodar e vai pra ACTIVE', () => {
    const next = reduce(dirtyState(), { type: 'START_EMPTY', startedAt: START })
    expect(next.screen).toBe('ACTIVE')
    expect(next.originMode).toBe('EMPTY')
    expect(next.activePlanName).toBe('Treinamento vazio')
    expect(next.activeExercises).toEqual([])
    expect(next.cardioEntries).toEqual([])
    expect(next.elapsedSec).toBe(0)
    expect(next.isWorkoutRunning).toBe(true)
    expect(next.startedAt).toBe(START)
    expect(next.endedAt).toBeNull()
  })

  it('START_EMPTY preserva manualTimerMinutes (beginEmptyTraining não mexe nele)', () => {
    const next = reduce(dirtyState(), { type: 'START_EMPTY', startedAt: START })
    expect(next.manualTimerMinutes).toBe('45')
  })

  it('START_ROUTINE carrega exercícios/cardio/nome da rotina e vai pra ACTIVE', () => {
    const exercises = [makeActiveExercise({ exerciseId: 'a' }), makeActiveExercise({ exerciseId: 'b' })]
    const cardio: CardioEntryInput[] = [{ type: 'BIKE', durationSec: 1200 }]
    const next = reduce(initial, {
      type: 'START_ROUTINE',
      planName: 'Costas',
      exercises,
      cardio,
      startedAt: START,
    })
    expect(next.screen).toBe('ACTIVE')
    expect(next.originMode).toBe('ROUTINE')
    expect(next.activePlanName).toBe('Costas')
    expect(next.activeExercises).toBe(exercises)
    expect(next.cardioEntries).toBe(cardio)
    expect(next.elapsedSec).toBe(0)
    expect(next.isWorkoutRunning).toBe(true)
    expect(next.startedAt).toBe(START)
  })

  it('GO_TO_SUMMARY encerra o cronômetro e entra no resumo', () => {
    const next = reduce(dirtyState(), { type: 'GO_TO_SUMMARY', endedAt: END })
    expect(next.screen).toBe('SUMMARY')
    expect(next.isWorkoutRunning).toBe(false)
    expect(next.endedAt).toBe(END)
    // Não mexe nos exercícios — o resumo lê o que foi feito.
    expect(next.activeExercises).toHaveLength(1)
  })

  it('RESET volta pra DASHBOARD e limpa a sessão (inclui manualTimerMinutes)', () => {
    const next = reduce(dirtyState(), { type: 'RESET' })
    expect(next.screen).toBe('DASHBOARD')
    expect(next.originMode).toBe('EMPTY')
    expect(next.activePlanName).toBe('Treinamento vazio')
    expect(next.activeExercises).toEqual([])
    expect(next.cardioEntries).toEqual([])
    expect(next.elapsedSec).toBe(0)
    expect(next.isWorkoutRunning).toBe(false)
    expect(next.manualTimerMinutes).toBe('')
    expect(next.startedAt).toBeNull()
    expect(next.endedAt).toBeNull()
  })

  it('UPDATE_ACTIVE_EXERCISES aplica o updater (ex.: marcar a 1ª série)', () => {
    const state: WorkoutSessionState = {
      ...initial,
      activeExercises: [makeActiveExercise({ sets: [makeSet({ checked: false })] })],
    }
    const next = reduce(state, {
      type: 'UPDATE_ACTIVE_EXERCISES',
      update: (prev) =>
        prev.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s, checked: true })) })),
    })
    expect(next.activeExercises[0].sets[0].checked).toBe(true)
  })

  it('setters simples atualizam só o campo alvo', () => {
    expect(reduce(initial, { type: 'SET_ELAPSED', elapsedSec: 90 }).elapsedSec).toBe(90)
    expect(reduce(initial, { type: 'SET_RUNNING', running: true }).isWorkoutRunning).toBe(true)
    expect(reduce(initial, { type: 'SET_SCREEN', screen: 'EDIT' }).screen).toBe('EDIT')
    expect(reduce(initial, { type: 'SET_MANUAL_TIMER', value: '30' }).manualTimerMinutes).toBe('30')
    expect(reduce(initial, { type: 'SET_PLAN_NAME', name: 'X' }).activePlanName).toBe('X')
    expect(reduce(initial, { type: 'SET_ORIGIN_MODE', mode: 'ROUTINE' }).originMode).toBe('ROUTINE')
  })

  it('é puro: não muta o state de entrada', () => {
    const state = dirtyState()
    const snapshot = JSON.stringify(state)
    reduce(state, { type: 'RESET' })
    reduce(state, { type: 'START_EMPTY', startedAt: START })
    reduce(state, { type: 'UPDATE_ACTIVE_EXERCISES', update: (p) => p.slice(1) })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
