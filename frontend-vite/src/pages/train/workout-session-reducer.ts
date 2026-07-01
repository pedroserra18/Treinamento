// Reducer PURO da sessão de treino. Consolida o estado que hoje vive em ~18
// useState e que begin*/resetWorkflow/transitionToSummary mutam EM BLOCO.
// Sendo puro, as transições ficam testáveis sem montar a tela (o TrainPage é
// pesado demais pra montar em teste). Side-effects (refs, revoke de imagem,
// notificações, snapshot da rotina) continuam no componente — aqui só entra
// estado.
//
// Cobre: (Fase 1) ciclo de vida do treino + (Fase 2) estado do RESUMO/pós-treino
// que resetWorkflow zera junto. Fora de propósito: UI efêmera (modais/pickers),
// lista da dashboard, histórico/streak, e os estados espalhados de PR/share/
// competição/postPrivacy (não formam grupo coeso).
import type { ActiveExercise, TrainOriginMode, TrainScreen } from './types'
import type { CardioEntryInput } from '../../types/workout'

export type WorkoutSessionState = {
  // ── Ciclo de vida (Fase 1) ──
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
  // ── Resumo / pós-treino (Fase 2) ──
  summaryName: string
  summaryDurationMin: string
  summaryImageFile: File | null
  summaryImagePreview: string | null
  savedSessionId: string | null
  postCaption: string
  posting: boolean
  postDone: boolean
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
  summaryName: '',
  summaryDurationMin: '',
  summaryImageFile: null,
  summaryImagePreview: null,
  savedSessionId: null,
  postCaption: '',
  posting: false,
  postDone: false,
}

// Valores de reset do slice de RESUMO (usados por RESET). postPrivacy NÃO entra
// aqui — tem inicializador de localStorage e reseta via defaultPrivacy (runtime),
// então continua useState no componente.
const RESET_SUMMARY = {
  summaryName: '',
  summaryDurationMin: '',
  summaryImageFile: null,
  summaryImagePreview: null,
  savedSessionId: null,
  postCaption: '',
  posting: false,
  postDone: false,
} as const

// `startedAt`/`endedAt` vêm como payload (em vez de `new Date()` interno) pra
// manter o reducer puro e determinístico nos testes.
export type WorkoutSessionAction =
  | { type: 'START_EMPTY'; startedAt: Date }
  | { type: 'START_ROUTINE'; planName: string; exercises: ActiveExercise[]; cardio: CardioEntryInput[]; startedAt: Date }
  | { type: 'GO_TO_SUMMARY'; endedAt: Date; summaryName: string; summaryDurationMin: string }
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
  // ── Slice de resumo (Fase 2) ──
  | { type: 'SET_SUMMARY_NAME'; value: string }
  | { type: 'SET_SUMMARY_DURATION'; value: string }
  | { type: 'SET_SUMMARY_IMAGE_FILE'; file: File | null }
  | { type: 'SET_SUMMARY_IMAGE_PREVIEW'; url: string | null }
  | { type: 'SET_SAVED_SESSION_ID'; id: string | null }
  | { type: 'SET_POST_CAPTION'; value: string }
  | { type: 'SET_POSTING'; value: boolean }
  | { type: 'SET_POST_DONE'; value: boolean }

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
      // Espelha transitionToSummary: encerra o cronômetro e entra no resumo,
      // já preenchendo nome + duração. Os demais campos do resumo (imagem,
      // caption, posting…) NÃO são tocados aqui (igual ao original).
      return {
        ...state,
        screen: 'SUMMARY',
        isWorkoutRunning: false,
        endedAt: action.endedAt,
        summaryName: action.summaryName,
        summaryDurationMin: action.summaryDurationMin,
      }
    case 'RESET':
      // Espelha resetWorkflow (ciclo de vida + slice de resumo). Revoke da
      // imagem, refs, postPrivacy e cancelamento de notificações são
      // side-effects/estados que ficam no componente.
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
        ...RESET_SUMMARY,
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
    // ── Slice de resumo (Fase 2) ──
    case 'SET_SUMMARY_NAME':
      return state.summaryName === action.value ? state : { ...state, summaryName: action.value }
    case 'SET_SUMMARY_DURATION':
      return state.summaryDurationMin === action.value ? state : { ...state, summaryDurationMin: action.value }
    case 'SET_SUMMARY_IMAGE_FILE':
      return state.summaryImageFile === action.file ? state : { ...state, summaryImageFile: action.file }
    case 'SET_SUMMARY_IMAGE_PREVIEW':
      return state.summaryImagePreview === action.url ? state : { ...state, summaryImagePreview: action.url }
    case 'SET_SAVED_SESSION_ID':
      return state.savedSessionId === action.id ? state : { ...state, savedSessionId: action.id }
    case 'SET_POST_CAPTION':
      return state.postCaption === action.value ? state : { ...state, postCaption: action.value }
    case 'SET_POSTING':
      return state.posting === action.value ? state : { ...state, posting: action.value }
    case 'SET_POST_DONE':
      return state.postDone === action.value ? state : { ...state, postDone: action.value }
  }
}
