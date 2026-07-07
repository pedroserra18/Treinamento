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
    // slice de resumo (Fase 2) preenchido, pra provar que RESET limpa
    summaryName: 'Peito e Tríceps',
    summaryDurationMin: '52',
    summaryImagePreview: 'blob:preview',
    savedSessionId: 'sess-1',
    postCaption: 'que treino',
    posting: true,
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

  it('GO_TO_SUMMARY encerra o cronômetro, entra no resumo e preenche nome+duração', () => {
    const next = reduce(dirtyState(), {
      type: 'GO_TO_SUMMARY', endedAt: END, summaryName: 'Treino de hoje', summaryDurationMin: '48',
    })
    expect(next.screen).toBe('SUMMARY')
    expect(next.isWorkoutRunning).toBe(false)
    expect(next.endedAt).toBe(END)
    expect(next.summaryName).toBe('Treino de hoje')
    expect(next.summaryDurationMin).toBe('48')
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
    // Fase 2: o slice de resumo também zera
    expect(next.summaryName).toBe('')
    expect(next.summaryDurationMin).toBe('')
    expect(next.summaryImagePreview).toBeNull()
    expect(next.savedSessionId).toBeNull()
    expect(next.postCaption).toBe('')
    expect(next.posting).toBe(false)
    expect(next.postDone).toBe(false)
  })

  it('setters do resumo (Fase 2) atualizam só o campo alvo + bail-out', () => {
    expect(reduce(initial, { type: 'SET_SUMMARY_NAME', value: 'Treino A' }).summaryName).toBe('Treino A')
    expect(reduce(initial, { type: 'SET_SUMMARY_DURATION', value: '60' }).summaryDurationMin).toBe('60')
    expect(reduce(initial, { type: 'SET_SUMMARY_IMAGE_PREVIEW', url: 'blob:x' }).summaryImagePreview).toBe('blob:x')
    expect(reduce(initial, { type: 'SET_SAVED_SESSION_ID', id: 's1' }).savedSessionId).toBe('s1')
    expect(reduce(initial, { type: 'SET_POST_CAPTION', value: 'oi' }).postCaption).toBe('oi')
    expect(reduce(initial, { type: 'SET_POSTING', value: true }).posting).toBe(true)
    expect(reduce(initial, { type: 'SET_POST_DONE', value: true }).postDone).toBe(true)
    const s: WorkoutSessionState = { ...initial, postCaption: 'x' }
    expect(reduce(s, { type: 'SET_POST_CAPTION', value: 'x' })).toBe(s) // bail-out
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
    expect(reduce(initial, { type: 'SET_STARTED_AT', startedAt: START }).startedAt).toBe(START)
    expect(reduce(initial, { type: 'SET_ENDED_AT', endedAt: END }).endedAt).toBe(END)
  })

  it('updaters (running/cardio) recebem o valor anterior — base dos setters de compat', () => {
    expect(reduce({ ...initial, isWorkoutRunning: true }, {
      type: 'UPDATE_RUNNING', update: (prev) => !prev,
    }).isWorkoutRunning).toBe(false)

    const withCardio: WorkoutSessionState = { ...initial, cardioEntries: [{ type: 'RUN', durationSec: 60 }] }
    const next = reduce(withCardio, {
      type: 'UPDATE_CARDIO',
      update: (prev) => [...prev, { type: 'BIKE', durationSec: 120 }],
    })
    expect(next.cardioEntries).toHaveLength(2)
  })

  it('bail-out: setar valor igual retorna o MESMO state (não re-renderiza, igual ao useState)', () => {
    const state: WorkoutSessionState = { ...initial, elapsedSec: 5, screen: 'ACTIVE' }
    // valor idêntico -> mesma referência de state (useReducer faz bail-out)
    expect(reduce(state, { type: 'SET_ELAPSED', elapsedSec: 5 })).toBe(state)
    expect(reduce(state, { type: 'SET_SCREEN', screen: 'ACTIVE' })).toBe(state)
    // valor diferente -> novo state
    expect(reduce(state, { type: 'SET_ELAPSED', elapsedSec: 6 })).not.toBe(state)
  })

  it('bail-out: updater que devolve a MESMA referência preserva o state (caso do tick de descanso)', () => {
    const exercises = [makeActiveExercise()]
    const state: WorkoutSessionState = { ...initial, activeExercises: exercises }
    // updater "sem mudança" devolve o array atual -> bail-out
    const same = reduce(state, { type: 'UPDATE_ACTIVE_EXERCISES', update: (prev) => prev })
    expect(same).toBe(state)
    // updater com mudança -> novo state
    const changed = reduce(state, { type: 'UPDATE_ACTIVE_EXERCISES', update: (prev) => [...prev] })
    expect(changed).not.toBe(state)
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
