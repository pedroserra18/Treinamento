// Reducer PURO do ciclo de vida do treino (Fase 1). Consolida o estado que
// hoje vive em ~10 useState e que begin*/resetWorkflow/transitionToSummary
// mutam EM BLOCO. Sendo puro, as transições ficam testáveis sem montar a tela
// (a tela do TrainPage é pesada demais pra montar em teste). Side-effects
// (refs, revoke de imagem, notificações, snapshot da rotina) continuam no
// componente — aqui só entra estado.
//
// Fora deste reducer de propósito: UI efêmera (modais/pickers), lista da
// dashboard (plans/filtros), histórico/streak e o estado do RESUMO (Fase 2).
import type { ActiveExercise, TrainOriginMode, TrainScreen } from './types'
import type { CardioEntryInput } from '../../types/workout'

export type WorkoutSessionState = {
  screen: TrainScreen
  originMode: TrainOriginMode
  activePlanName: string
  activeExercises: ActiveExercise[]
  cardioEntries: CardioEntryInput[]
  elapsedSec: number
  isWorkoutRunning: boolean
  manualTimerMinutes: string
  startedAt: Date | null
  endedAt: Date | null
}

export const initialWorkoutSessionState: WorkoutSessionState = {
  screen: 'DASHBOARD',
  originMode: 'EMPTY',
  activePlanName: 'Treinamento vazio',
  activeExercises: [],
  cardioEntries: [],
  elapsedSec: 0,
  isWorkoutRunning: false,
  manualTimerMinutes: '',
  startedAt: null,
  endedAt: null,
}

// `startedAt`/`endedAt` vêm como payload (em vez de `new Date()` interno) pra
// manter o reducer puro e determinístico nos testes.
export type WorkoutSessionAction =
  | { type: 'START_EMPTY'; startedAt: Date }
  | { type: 'START_ROUTINE'; planName: string; exercises: ActiveExercise[]; cardio: CardioEntryInput[]; startedAt: Date }
  | { type: 'GO_TO_SUMMARY'; endedAt: Date }
  | { type: 'RESET' }
  | { type: 'SET_SCREEN'; screen: TrainScreen }
  | { type: 'SET_ELAPSED'; elapsedSec: number }
  | { type: 'SET_RUNNING'; running: boolean }
  | { type: 'SET_MANUAL_TIMER'; value: string }
  | { type: 'SET_PLAN_NAME'; name: string }
  | { type: 'SET_ORIGIN_MODE'; mode: TrainOriginMode }
  | { type: 'SET_STARTED_AT'; startedAt: Date | null }
  | { type: 'SET_ENDED_AT'; endedAt: Date | null }
  | { type: 'UPDATE_RUNNING'; update: (prev: boolean) => boolean }
  | { type: 'UPDATE_ACTIVE_EXERCISES'; update: (prev: ActiveExercise[]) => ActiveExercise[] }
  | { type: 'SET_ACTIVE_EXERCISES'; exercises: ActiveExercise[] }
  | { type: 'UPDATE_CARDIO'; update: (prev: CardioEntryInput[]) => CardioEntryInput[] }
  | { type: 'SET_CARDIO'; entries: CardioEntryInput[] }

export function workoutSessionReducer(
  state: WorkoutSessionState,
  action: WorkoutSessionAction,
): WorkoutSessionState {
  switch (action.type) {
    case 'START_EMPTY':
      // Espelha beginEmptyTraining: treino vazio começa a rodar na hora.
      // manualTimerMinutes é preservado de propósito (lá ele não é tocado).
      return {
        ...state,
        originMode: 'EMPTY',
        activePlanName: 'Treinamento vazio',
        activeExercises: [],
        cardioEntries: [],
        elapsedSec: 0,
        isWorkoutRunning: true,
        startedAt: action.startedAt,
        endedAt: null,
        screen: 'ACTIVE',
      }
    case 'START_ROUTINE':
      // Espelha beginRoutineTraining (parte de estado). O snapshot da rotina,
      // o setActivePlanId e o reset dos refs ficam no componente.
      return {
        ...state,
        originMode: 'ROUTINE',
        activePlanName: action.planName,
        activeExercises: action.exercises,
        cardioEntries: action.cardio,
        elapsedSec: 0,
        isWorkoutRunning: true,
        startedAt: action.startedAt,
        endedAt: null,
        screen: 'ACTIVE',
      }
    case 'GO_TO_SUMMARY':
      // Parte de estado (Fase 1) de transitionToSummary: encerra o cronômetro
      // e entra no resumo. summaryName/summaryDurationMin são Fase 2.
      return {
        ...state,
        screen: 'SUMMARY',
        isWorkoutRunning: false,
        endedAt: action.endedAt,
      }
    case 'RESET':
      // Espelha a parte de Fase 1 de resetWorkflow. Revoke da imagem, refs e
      // cancelamento de notificações são side-effects que ficam no componente.
      return {
        ...state,
        screen: 'DASHBOARD',
        originMode: 'EMPTY',
        activePlanName: 'Treinamento vazio',
        activeExercises: [],
        cardioEntries: [],
        elapsedSec: 0,
        isWorkoutRunning: false,
        manualTimerMinutes: '',
        startedAt: null,
        endedAt: null,
      }
    // Setters de campo único. Fazem BAIL-OUT (retornam o mesmo `state`) quando
    // o valor não muda — assim o useReducer não re-renderiza, igual ao useState
    // (Object.is). Crítico p/ os updaters de alta frequência: o tick de descanso
    // devolve o MESMO array quando nada muda, contando com esse bail-out.
    case 'SET_SCREEN':
      return state.screen === action.screen ? state : { ...state, screen: action.screen }
    case 'SET_ELAPSED':
      return state.elapsedSec === action.elapsedSec ? state : { ...state, elapsedSec: action.elapsedSec }
    case 'SET_RUNNING':
      return state.isWorkoutRunning === action.running ? state : { ...state, isWorkoutRunning: action.running }
    case 'SET_MANUAL_TIMER':
      return state.manualTimerMinutes === action.value ? state : { ...state, manualTimerMinutes: action.value }
    case 'SET_PLAN_NAME':
      return state.activePlanName === action.name ? state : { ...state, activePlanName: action.name }
    case 'SET_ORIGIN_MODE':
      return state.originMode === action.mode ? state : { ...state, originMode: action.mode }
    case 'SET_STARTED_AT':
      return state.startedAt === action.startedAt ? state : { ...state, startedAt: action.startedAt }
    case 'SET_ENDED_AT':
      return state.endedAt === action.endedAt ? state : { ...state, endedAt: action.endedAt }
    case 'UPDATE_RUNNING': {
      const next = action.update(state.isWorkoutRunning)
      return next === state.isWorkoutRunning ? state : { ...state, isWorkoutRunning: next }
    }
    case 'UPDATE_ACTIVE_EXERCISES': {
      const next = action.update(state.activeExercises)
      return next === state.activeExercises ? state : { ...state, activeExercises: next }
    }
    case 'SET_ACTIVE_EXERCISES':
      return state.activeExercises === action.exercises ? state : { ...state, activeExercises: action.exercises }
    case 'UPDATE_CARDIO': {
      const next = action.update(state.cardioEntries)
      return next === state.cardioEntries ? state : { ...state, cardioEntries: next }
    }
    case 'SET_CARDIO':
      return state.cardioEntries === action.entries ? state : { ...state, cardioEntries: action.entries }
  }
}
