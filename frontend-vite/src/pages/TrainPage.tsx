import { motion } from 'framer-motion'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useShowPlanLimit } from '../components/plan/use-plan-limit'
import { catchPlanLimitError } from '../lib/plan-features'
import {
  Plus,
  ArrowLeft, Check,
} from 'lucide-react'
// IMPORTANTE: o import do React precisa vir ANTES dos `const X = lazy(...)`
// abaixo. Em produção (Rollup) os imports são hoisted e a ordem não importa,
// mas no dev (Vite/esbuild) usar `lazy` antes deste import dá TDZ ("Cannot
// access 'lazy' before initialization").
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
// Modais lazy-loaded — não entram no bundle inicial da TrainPage. Cada
// um vira um chunk separado que só baixa quando o user efetivamente
// abre o respectivo modal. Cortou ~2100 linhas de código + dependências
// (framer-motion, lucide-react) do bundle inicial. Como esses componentes
// renderizam condicionalmente, o import() dinâmico só dispara na primeira
// abertura — depois o chunk fica em cache de memória do browser.
const CreateExerciseModal = lazy(() =>
  import('./train/CreateExerciseModal').then((m) => ({ default: m.CreateExerciseModal })),
)
import { ExerciseContextMenuSheet } from './train/ExerciseContextMenuSheet'
import { type ReorderItem } from './train/ReorderExercisesSheet'
const ReorderExercisesSheet = lazy(() =>
  import('./train/ReorderExercisesSheet').then((m) => ({ default: m.ReorderExercisesSheet })),
)
const SubstituteExerciseModal = lazy(() =>
  import('./train/SubstituteExerciseModal').then((m) => ({ default: m.SubstituteExerciseModal })),
)
import { RestTimePickerSheet } from './train/RestTimePickerSheet'
const AddExerciseModal = lazy(() =>
  import('./train/AddExerciseModal').then((m) => ({ default: m.AddExerciseModal })),
)
import { DurationPickerSheet } from './train/DurationPickerSheet'
import { InfoDialog } from '../components/common/InfoDialog'
import { ConfirmDialog } from '../components/common/ConfirmDialog'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { cancelBackendNotification, scheduleBackendNotification } from '../services/pushService'
import { sharePlan, createAndSharePlan, type PostPrivacy } from '../services/socialService'
import { TrainRecommendationsScreen } from './train/TrainRecommendationsScreen'
import { TrainSendRoutineScreen } from './train/TrainSendRoutineScreen'
import { TrainNewRoutineScreen } from './train/TrainNewRoutineScreen'
import { TrainEditRoutineScreen } from './train/TrainEditRoutineScreen'
import { TrainDashboardScreen } from './train/TrainDashboardScreen'
import { type DropEntry } from '../components/common/setTypeOptions'
import {
  getExerciseExplorerSelectionEventName,
  type ExerciseExplorerSelection,
} from '../lib/exercise/exercise-explorer'
import { isBodyweightEquipment, resolveBodyweightFlag } from '../lib/exercise/exercise-meta'
import { pushRecentExerciseId } from '../lib/exercise/recent-exercises'
import { getExerciseCatalogCached, prefetchExerciseCatalog, invalidateExerciseCatalog } from '../lib/cache/exercise-catalog-cache'
import {
  getWorkoutPlansCached,
  peekWorkoutPlans,
  setWorkoutPlansCache,
  invalidateWorkoutPlansCache,
} from '../lib/cache/workout-plans-cache'
import { workoutHistoryCache } from '../lib/cache/workout-history-cache'
import { getIntensityMode, type IntensityMode } from '../lib/intensity-preference'
import { showLocalNotification } from '../lib/notifications'
import { formatClock } from '../lib/workout/workout-timing'
import { saveWorkoutSessionImage } from '../lib/workout/workout-session-image'
import { optimizeImageFileToDataUrl } from '../lib/image/image-processing'
import { vibrate } from '../lib/haptics'
import { useWakeLock } from '../hooks/useWakeLock'
import { useActiveWorkoutElapsed } from '../hooks/useActiveWorkoutElapsed'
import type { WorkoutPlan, CardioEntryInput, ExerciseOption } from '../types/workout'
import { formatSetPerformanceLabel } from './train/train-format'
import { DurationWarningDialog, PlanUpdateDialog } from './train/TrainDialogs'
import { ActiveExerciseCard } from './train/ActiveExerciseCard'
import { resolveLastSetPerformance } from './train/set-display'
import { SummaryShareActions } from './train/SummaryShareActions'
import { SummaryPhotoPicker } from './train/SummaryPhotoPicker'
import { ActiveWorkoutMenu } from './train/ActiveWorkoutMenu'
import type { TrainScreen, TrainOriginMode, TrackingType, ExerciseSetInput, ActiveExercise, LastUseInfo, RoutineFilter } from './train/types'
import { workoutSessionReducer, initialWorkoutSessionState } from './train/workout-session-reducer'
import { nextSupersetGroupId } from './train/superset'
import { SupersetPickerSheet } from './train/SupersetPickerSheet'
import { CardioSection } from './train/CardioSection'
import {
  addPlanExercisesBatch,
  deletePlanExercisesBatch,
  completeWorkoutSession,
  createWorkoutPlanWithExercises,
  updateWorkoutPlanWithExercises,
  deleteWorkoutPlan,
  getExercisePersonalRecords,
  getLatestExercisePerformance,
  startWorkoutSession,
  updatePlanExercise,
  type SessionHighlights,
} from '../services/workoutService'
import { WorkoutShareEditor } from '../components/common/WorkoutShareEditor'
import {
  ACTIVE_WORKOUT_DISCARD_EVENT,
  clearActiveWorkout,
  deriveElapsedSec,
  readActiveWorkout,
  writeActiveWorkout,
} from '../lib/workout/active-workout-storage'
import {
  getMyActiveCompetition,
  postCompetitionEntry,
  uploadCompetitionPhoto,
} from '../services/competitionService'
import type { Competition } from '../types/competition'
import { sha256OfDataUrl } from '../lib/image/photo-hash'
import {
  calculateTotals,
  createSet,
  isEffectiveBodyweightExercise,
  mapPlanToActiveExercises,
  parseDurationMin,
  parsePositiveInt,
  toFiniteNumber,
} from './train/helpers'
import { PrCelebrationBanner } from './train/PrCelebrationBanner'
import { SendToCompetitionCta } from './train/SendToCompetitionCta'
import { SummaryMetricsCards } from './train/SummaryMetricsCards'
import { RestTimerBar } from './train/RestTimerBar'
import { ActiveProgressStats } from './train/ActiveProgressStats'

export function TrainPage() {
  const { authorizedFetch, user } = useAuth()
  const showPlanLimit = useShowPlanLimit()
  const isProfilePrivate = user?.isPrivate ?? false
  const allowedPrivacies: PostPrivacy[] = isProfilePrivate ? ['FRIENDS', 'PRIVATE'] : ['PUBLIC', 'FRIENDS', 'PRIVATE']
  const defaultPrivacy: PostPrivacy = isProfilePrivate ? 'FRIENDS' : 'PUBLIC'

  // Estado do CICLO DE VIDA do treino num reducer puro (workout-session-
  // reducer). Os setters abaixo replicam a API do useState (valor OU updater
  // funcional, onde aplicável) e são estáveis (useCallback) como os do
  // useState — assim os usos existentes ficam idênticos e as dependências de
  // efeitos não mudam. Comportamento preservado; transições centralizadas.
  const [session, dispatchSession] = useReducer(workoutSessionReducer, initialWorkoutSessionState)
  const {
    screen,
    originMode,
    activePlanName,
    activeExercises,
    cardioEntries,
    elapsedSec,
    isWorkoutRunning,
    manualTimerMinutes,
    startedAt,
    endedAt,
    summaryName,
    summaryDurationMin,
    summaryImageFile,
    summaryImagePreview,
    savedSessionId,
    postCaption,
    posting,
    postDone,
  } = session
  const setScreen = useCallback((s: TrainScreen) => dispatchSession({ type: 'SET_SCREEN', screen: s }), [])
  const setOriginMode = useCallback((mode: TrainOriginMode) => dispatchSession({ type: 'SET_ORIGIN_MODE', mode }), [])
  const setActivePlanName = useCallback((name: string) => dispatchSession({ type: 'SET_PLAN_NAME', name }), [])
  const setElapsedSec = useCallback((sec: number) => dispatchSession({ type: 'SET_ELAPSED', elapsedSec: sec }), [])
  const setManualTimerMinutes = useCallback((value: string) => dispatchSession({ type: 'SET_MANUAL_TIMER', value }), [])
  const setStartedAt = useCallback((value: Date | null) => dispatchSession({ type: 'SET_STARTED_AT', startedAt: value }), [])
  const setEndedAt = useCallback((value: Date | null) => dispatchSession({ type: 'SET_ENDED_AT', endedAt: value }), [])
  const setActiveExercises = useCallback<Dispatch<SetStateAction<ActiveExercise[]>>>((arg) =>
    dispatchSession(typeof arg === 'function'
      ? { type: 'UPDATE_ACTIVE_EXERCISES', update: arg }
      : { type: 'SET_ACTIVE_EXERCISES', exercises: arg }), [])
  const setCardioEntries = useCallback<Dispatch<SetStateAction<CardioEntryInput[]>>>((arg) =>
    dispatchSession(typeof arg === 'function'
      ? { type: 'UPDATE_CARDIO', update: arg }
      : { type: 'SET_CARDIO', entries: arg }), [])
  const setIsWorkoutRunning = useCallback<Dispatch<SetStateAction<boolean>>>((arg) =>
    dispatchSession(typeof arg === 'function'
      ? { type: 'UPDATE_RUNNING', update: arg }
      : { type: 'SET_RUNNING', running: arg }), [])
  // Setters do slice de RESUMO (Fase 2) — value-only, estáveis (useCallback).
  const setSummaryName = useCallback((value: string) => dispatchSession({ type: 'SET_SUMMARY_NAME', value }), [])
  const setSummaryDurationMin = useCallback((value: string) => dispatchSession({ type: 'SET_SUMMARY_DURATION', value }), [])
  const setSummaryImageFile = useCallback((file: File | null) => dispatchSession({ type: 'SET_SUMMARY_IMAGE_FILE', file }), [])
  const setSummaryImagePreview = useCallback((url: string | null) => dispatchSession({ type: 'SET_SUMMARY_IMAGE_PREVIEW', url }), [])
  const setSavedSessionId = useCallback((id: string | null) => dispatchSession({ type: 'SET_SAVED_SESSION_ID', id }), [])
  const setPostCaption = useCallback((value: string) => dispatchSession({ type: 'SET_POST_CAPTION', value }), [])
  const setPosting = useCallback((value: boolean) => dispatchSession({ type: 'SET_POSTING', value }), [])
  const setPostDone = useCallback((value: boolean) => dispatchSession({ type: 'SET_POST_DONE', value }), [])
  // Inicializa SÍNCRONO via peek do cache — se o user já visitou a
  // TrainPage antes nessa sessão (ou em sessão anterior persistida em
  // localStorage), a lista de rotinas aparece IMEDIATA. Refetch em
  // background pelo useEffect abaixo mantém ela atualizada.
  const [plans, setPlans] = useState<WorkoutPlan[]>(() => peekWorkoutPlans() ?? [])
  const [loadingPlans, setLoadingPlans] = useState<boolean>(() => peekWorkoutPlans() == null)
  // Erro fica scoped por tela: ao trocar de screen, limpamos pra evitar
  // mensagem vazar entre dashboard / ativo / summary (e.g. "exercicio ja
  // adicionado" aparecer na dashboard depois de finalizar treino).
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [openRoutineMenuId, setOpenRoutineMenuId] = useState<string | null>(null)
  const [routineMenuAnchor, setRoutineMenuAnchor] = useState<{ top: number; right: number } | null>(null)
  const [shareLinkModal, setShareLinkModal] = useState<{ link: string; planName: string } | null>(null)

  const [activePlanId, setActivePlanId] = useState<string>('')  // IDs de rotinas otimistas (criadas na hora pela CreateRoutineScreen,
  // mostradas IMEDIATAMENTE na DASHBOARD enquanto o backend persiste em
  // background). Card com id desse Set renderiza "Salvando rotina..."
  // em vez dos botões Iniciar/Editar — evita o user iniciar treino com
  // id temporário que daria 404 no startWorkoutSession.
  const [optimisticPlanIds, setOptimisticPlanIds] = useState<Set<string>>(() => new Set())
  // IDs de rotinas com update em vôo (clicou "Atualizar" no EDIT mas as
  // updates ainda não confirmaram). Card mostra "Atualizando…" e bloqueia
  // Iniciar pra evitar começar treino com metadados antigos enquanto o
  // backend ainda processa o save da edição.
  const [updatingPlanIds, setUpdatingPlanIds] = useState<Set<string>>(() => new Set())
  const [routineFilter, setRoutineFilter] = useState<RoutineFilter>('ALL')
  // Snapshot da rotina ORIGINAL no momento que o treino começou
  // (beginRoutineTraining). Usado pra detectar diff ao salvar e perguntar
  // se o user quer atualizar a rotina pras próximas sessões.
  //
  // Guardamos exerciseId + planExerciseId pra cada item — o planExerciseId
  // é necessário pra chamar deletePlanExercise quando o user removeu um
  // exercício durante a sessão (esse id não vive em activeExercises após
  // remoção).
  type OriginalPlanItem = { exerciseId: string; planExerciseId: string }
  const originalPlanSnapshotRef = useRef<{ planId: string; items: OriginalPlanItem[] } | null>(null)

  // Dialogs do flow de salvar treino — aparecem como bottom sheets
  // condicionais antes do save real. Pattern estilo Hevy:
  //   1. Duração incomum (<10min ou >4h): "Quer ajustar?"
  //   2. Rotina mudou (added/removed/reordered): "Atualizar pra próximas?"
  // Se nenhum dos dois dispara, save acontece direto sem interrupção.
  const [durationWarning, setDurationWarning] = useState<
    | { minutesActual: number; minutesParsed: number; isShort: boolean }
    | null
  >(null)
  const [planUpdateDialog, setPlanUpdateDialog] = useState<
    | {
        planName: string
        addedCount: number
        removedCount: number
        reordered: boolean
        applying: boolean
      }
    | null
  >(null)
  // Popover do menu "⋯" do treino ativo (Pausar/Retomar + Editar tempo).
  // Esses controles são fluxo de borda — esconder evita competir com
  // o botão primário "Finalizar Treino".
  const [advancedTimerOpen, setAdvancedTimerOpen] = useState(false)
  const [lastPerformanceByExercise, setLastPerformanceByExercise] = useState<
    Record<
      string,
      Record<
        number,
        {
          reps: number | null
          weightKg: number | null
          rir: number | null
          rpe: number | null
          durationSec: number | null
          distanceMeters: number | null
        }
      >
    >
  >({})
  const [editingRestExerciseIndex, setEditingRestExerciseIndex] = useState<number | null>(null)
  const [restDraftSec, setRestDraftSec] = useState('0')
  // Kebab menu (3 pontinhos) — guarda o índice do exercício cujo
  // menu de contexto está aberto. Null = nenhum aberto.
  const [contextMenuExerciseIndex, setContextMenuExerciseIndex] = useState<number | null>(null)
  // Sheet de reordenação. Diferente do kebab menu, este é global — abre
  // listando TODOS os exercícios com setas ⬆⬇ pra reorganizar.
  // É um fallback acessível pra quem não pegar a gesture de drag.
  const [reorderSheetOpen, setReorderSheetOpen] = useState(false)
  // Sensors do dnd-kit pra drag-to-reorder dos cards de exercício.
  // - PointerSensor: desktop + alguns mobiles. Delay de 150ms evita
  //   confundir clique com drag.
  // - TouchSensor: mobile específico. Delay maior (250ms) é o padrão
  //   iOS pra "long-press to pick up", e tolerância de 8px permite
  //   scrollar a página sem ativar drag por acidente.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )
  // Quando o usuário pede pra substituir um exercício, marcamos o
  // índice aqui e abrimos o explorer global. O handler de seleção
  // (mais abaixo) checa esse ref pra decidir entre substituir vs
  // adicionar — usa ref em vez de state pra evitar problemas de
  // stale closure no listener de evento (que é criado uma vez).
  const pendingSubstitutionIndexRef = useRef<number | null>(null)
  // Quando o usuário pede pra adicionar à supersérie, marcamos o
  // índice do exercício de origem aqui e abrimos o picker de
  // exercícios atuais pra ele escolher com qual parear.
  const [supersetPickerSourceIndex, setSupersetPickerSourceIndex] = useState<number | null>(null)
  // Substitute modal (estilo Hevy) — quando aberto, mostra Sugeridos +
  // Recentes em vez do explorer global. Null = fechado.
  const [substituteSourceIndex, setSubstituteSourceIndex] = useState<number | null>(null)
  // AddExerciseModal (estilo Hevy) — busca live + Recentes pra inserir
  // novo exercício no treino ativo.
  const [addExerciseOpen, setAddExerciseOpen] = useState(false)
  // Preferência de intensidade (RIR / RPE / Ambos). Persiste em
  // localStorage. Default 'BOTH' até o usuário escolher.
  const [intensityMode, setIntensityModeState] = useState<IntensityMode>(() => getIntensityMode())
  const showRir = intensityMode === 'RIR' || intensityMode === 'BOTH'
  const showRpe = intensityMode === 'RPE' || intensityMode === 'BOTH'
  // Diálogo de aviso pra duplicatas (e outros casos similares). Trocou
  // o setError vermelho fixo na tela por um modal claramente acionável —
  // o erro ficava pendurado entre header e lista até trocar de tela.
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string } | null>(null)
  // Picker de duração no resumo (estilo iOS wheel). Substitui o input
  // livre por uma UX mais previsível.
  const [durationPickerOpen, setDurationPickerOpen] = useState(false)
  // Diálogo de confirmação genérico (descartar treino, finalizar com
  // sets em branco, etc.). O onConfirm é guardado pra disparar quando
  // o usuário aceita.
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel?: string
    destructive?: boolean
    onConfirm: () => void
  } | null>(null)
  // Quando aberto a partir do "Criar" do substitute modal, indica que
  // o exercício criado deve substituir o atual em vez de só virar
  // disponível no catálogo. Null = abriu standalone (substitui nada).
  const [createExerciseForSubstituteIndex, setCreateExerciseForSubstituteIndex] = useState<number | null>(null)
  // Quando true, ao terminar de criar exercício adicionamos no treino
  // ativo (em vez de substituir). Dispara pelo "Criar" no AddExerciseModal.
  const [createExerciseForAdd, setCreateExerciseForAdd] = useState(false)
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false)
  const [restFinishedName, setRestFinishedName] = useState<string | null>(null)
  // Per-exercise all-time max load, fetched once when the active screen
  // opens. We mutate this on every confirmed PR so the next set of the
  // same exercise doesn't double-celebrate.
  const [prByExerciseId, setPrByExerciseId] = useState<Record<string, number | null>>({})
  // Which set's type-picker bottom sheet is open right now. `null` when closed.
  const [openTypePicker, setOpenTypePicker] = useState<{ exerciseIndex: number; setIndex: number } | null>(null)
  const [prCelebration, setPrCelebration] = useState<{
    id: number
    exerciseName: string
    loadKg: number
    previousKg: number | null
  } | null>(null)

  // Snapshot dos PRs ANTES do treino — pra detectar quantos PRs novos
  // foram batidos comparando com prByExerciseId atual no SUMMARY.
  // Setado quando o usuário entra na tela ACTIVE (não quando finaliza).
  const [prSnapshotAtStart, setPrSnapshotAtStart] = useState<Record<string, number>>({})
  // Última privacy usada por este usuário — lê uma vez do localStorage
  // pra inicializar postPrivacy. Atualiza quando posta com sucesso.
  const [postPrivacy, setPostPrivacy] = useState<PostPrivacy>(() => {
    try {
      const raw = window.localStorage.getItem('acad:last-post-privacy')
      if (raw === 'PUBLIC' || raw === 'FRIENDS' || raw === 'PRIVATE') {
        return isProfilePrivate && raw === 'PUBLIC' ? 'FRIENDS' : raw
      }
    } catch {
      // ignora
    }
    return defaultPrivacy
  })
  // Active competition (if any) — used by the "Enviar para desafio" button
  // on the summary. Only fetched when the user lands on SUMMARY, so the
  // active-workout flow isn't affected.
  const [activeCompetition, setActiveCompetition] = useState<Competition | null>(null)
  const [competitionSendStatus, setCompetitionSendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [competitionSendError, setCompetitionSendError] = useState<string | null>(null)
  // Editor de imagem de compartilhamento (estilo Strava).
  const [shareHighlights, setShareHighlights] = useState<SessionHighlights | null>(null)
  const [sharePhoto, setSharePhoto] = useState<string | null>(null)
  const [loadingShare, setLoadingShare] = useState(false)
  const interactionOrderByExerciseRef = useRef<Record<string, number>>({})
  const interactionOrderCounterRef = useRef(0)

  // Push notifications — usado pra agendar "Descanso acabou" no backend
  // quando o user inicia um descanso, pra a notificação chegar mesmo
  // com o app em segundo plano (ex.: usuário scrollando Instagram).
  // Quando o estado.subscribed === false, o effect de scheduling abaixo
  // simplesmente não dispara (degradação graciosa — timer local segue
  // funcionando enquanto a aba está viva).
  const pushNotifications = usePushNotifications()
  // ┌────────────────────────────────────────────────────────────────────┐
  // │ Slot de schedules de descanso por exerciseId.                      │
  // │                                                                    │
  // │ Era um Record<string, string> simples — uma string por exercício.  │
  // │ Sob race (marcar série rápido demais), o ref ficava com id_A do    │
  // │ primeiro agendamento mas era sobrescrito por id_B do segundo,      │
  // │ depois revertido por id_A que voltava do backend atrasado. Result: │
  // │ id_B ficava órfão no backend e disparava notif sem ninguém saber. │
  // │                                                                    │
  // │ Agora cada slot guarda:                                            │
  // │   • ids: lista de TODOS os IDs ativos no backend pra esse exercício│
  // │   • seq: counter incrementado em cada cancel/schedule. Promises    │
  // │     pendentes comparam seu mySeq contra slot.seq — se outra        │
  // │     operação veio depois, o id que volta é cancelado em vez de     │
  // │     salvo (autoinvalida promises obsoletas).                       │
  // │                                                                    │
  // │ Mesma estratégia já aplicada ao idle reminder (linha ~1276).       │
  // └────────────────────────────────────────────────────────────────────┘
  const restScheduleSlotsRef = useRef<Record<string, { ids: string[]; seq: number }>>({})

  // Cancela TODOS os schedules pendentes de um exercício no backend e bumpa
  // o seq pra invalidar promises ainda em curso. Idempotente — chamar em
  // slot já vazio é no-op.
  const cancelRestSlot = useCallback((exerciseId: string) => {
    const slot = restScheduleSlotsRef.current[exerciseId]
    if (!slot) return
    slot.seq += 1
    const ids = slot.ids.slice()
    slot.ids = []
    for (const id of ids) {
      void cancelBackendNotification(authorizedFetch, id).catch(() => { /* silencioso */ })
    }
  }, [authorizedFetch])

  // Agenda um push de descanso pra um exercício. CANCELA TUDO antes
  // (cobre o caso de restart). O race guard com mySeq descarta IDs
  // que voltem do backend depois de uma nova chamada — esses são
  // automaticamente cancelados no backend em vez de serem salvos.
  const scheduleRestForExercise = useCallback((
    exerciseId: string,
    payload: { fireAt: string; title: string; body: string; url: string; tag: string },
  ) => {
    // Cancela tudo do slot antes (snapshot+empty+cancel; bumpa o seq).
    cancelRestSlot(exerciseId)
    // Garante que o slot existe — cancelRestSlot pode ter sido no-op se
    // não havia entrada anterior.
    if (!restScheduleSlotsRef.current[exerciseId]) {
      restScheduleSlotsRef.current[exerciseId] = { ids: [], seq: 0 }
    }
    const slot = restScheduleSlotsRef.current[exerciseId]
    const mySeq = slot.seq

    void scheduleBackendNotification(authorizedFetch, payload).then(({ id }) => {
      // Race guard: se outro cancel/schedule veio depois, esse id é zumbi
      // e tem que ser cancelado no backend pra não disparar fora de ordem.
      if (mySeq !== slot.seq) {
        void cancelBackendNotification(authorizedFetch, id).catch(() => { /* silencioso */ })
        return
      }
      slot.ids.push(id)
    }).catch(() => { /* falha não bloqueia o timer local */ })
  }, [authorizedFetch, cancelRestSlot])

  // Estado anterior pra detectar transições restRunning false→true e
  // true→false sem precisar comparar com estado React (que pode ter
  // mudado por motivos não relacionados ao timer).
  const prevRestStateRef = useRef<Record<string, { running: boolean; remaining: number }>>({})

  // Idle reminder — se o user fica X min sem MARCAR NENHUMA SÉRIE no treino
  // ativo, dispara um push lembrando que tem treino aberto.
  //
  // "Atividade que conta" é estritamente marcar/desmarcar uma série como
  // feita (checkbox verde). Adicionar/remover exercício NÃO conta — alguém
  // pode preparar o treino e deixar pausado, e a gente deveria lembrar.
  //
  // Implementação: cada marcação de série cancela o schedule pendente e
  // cria um novo pra agora+IDLE_REMINDER_MIN min. O fato de o lembrete
  // viver no backend garante que mesmo com o app fechado/celular travado,
  // o push chega.
  const IDLE_REMINDER_MIN = 30
  // Lista de IDs de schedules pendentes no backend. Era um único string|null;
  // virou array por causa da race: múltiplos rescheduleIdleReminder em
  // sequência rápida lia o ref vazio antes do anterior salvar seu ID, então
  // cada chamada agendava um schedule novo SEM cancelar os anteriores —
  // resultado: 30 min depois, 3 notifs disparavam juntas (bug do "spam de
  // Treino ainda rolando"). Manter lista permite cancelar todos os zumbis
  // numa só varredura.
  const idleReminderScheduleIdsRef = useRef<string[]>([])
  // Counter de "geração" — incrementa em cada chamada de reschedule. Promises
  // pendentes comparam seu mySeq contra o counter; se outra chamada veio
  // depois, o ID resultante é cancelado em vez de salvo. Garante que a
  // ÚLTIMA chamada vence sempre, mesmo em race extrema.
  const idleReminderSeqRef = useRef(0)

  // Histórico recente pra enriquecer os cards de rotina ("último treino:
  // há 3 dias · 1h05") e pra escolher qual rotina destacar no smart-CTA
  // da dashboard ("Iniciar [última rotina]"). Buscamos uma página de 50
  // sessões — cobre 99% dos usuários sem custo. Falha silenciosamente:
  // a página funciona sem essas info, só fica menos rica.
  const [lastUseByPlanId, setLastUseByPlanId] = useState<Record<string, LastUseInfo>>({})
  const [mostRecentSession, setMostRecentSession] = useState<LastUseInfo | null>(null)
  // Streak = dias consecutivos com pelo menos 1 treino. Conta a partir
  // de hoje pra trás; quebra na primeira data com gap > 1 dia. Aceita
  // que "hoje sem treino" ainda mantenha o streak (só não incrementa).
  const [streakDays, setStreakDays] = useState(0)

  const reloadHistorySummary = useCallback(async () => {
    try {
      // Cache compartilhado com HomePage — mesmo payload, mesmo TTL (2min).
      // Entrar em Train e depois Home (ou vice-versa) só faz 1 request.
      const { items } = await workoutHistoryCache.get(authorizedFetch)
      const byPlan: Record<string, LastUseInfo> = {}
      let mostRecent: LastUseInfo | null = null

      // Set de dias únicos com treino (YYYY-MM-DD). Permite calcular
      // streak mesmo com múltiplos treinos no mesmo dia (conta como 1).
      const dayKeys = new Set<string>()

      for (const session of items) {
        if (!session.endedAt) continue
        const dayKey = new Date(session.endedAt).toISOString().slice(0, 10)
        dayKeys.add(dayKey)

        if (!session.workoutPlanId || !session.workoutPlan) continue
        const info: LastUseInfo = {
          endedAt: session.endedAt,
          durationSec: session.durationSec,
          planId: session.workoutPlanId,
          planName: session.workoutPlan.name,
        }
        // listWorkoutHistory já vem ordenado desc por endedAt — primeira
        // ocorrência por plano é a mais recente daquela rotina.
        if (!byPlan[session.workoutPlanId]) byPlan[session.workoutPlanId] = info
        if (!mostRecent) mostRecent = info
      }
      setLastUseByPlanId(byPlan)
      setMostRecentSession(mostRecent)

      // Calcula streak: começa em "hoje" e vai pra trás contando dias
      // com treino. Se o último treino foi ontem, conta o streak a
      // partir dele (não zera só porque hoje você ainda não treinou).
      let streak = 0
      const cursor = new Date()
      cursor.setHours(0, 0, 0, 0)
      // Se hoje não tem treino, dá 1 dia de tolerância (começa em ontem).
      const todayKey = cursor.toISOString().slice(0, 10)
      if (!dayKeys.has(todayKey)) {
        cursor.setDate(cursor.getDate() - 1)
      }
      while (dayKeys.has(cursor.toISOString().slice(0, 10))) {
        streak += 1
        cursor.setDate(cursor.getDate() - 1)
      }
      setStreakDays(streak)
    } catch {
      // silencioso — info nice-to-have
    }
  }, [authorizedFetch])

  useEffect(() => {
    void reloadHistorySummary()
  }, [reloadHistorySummary])

  // Pre-aquece o catálogo de exercícios assim que a TrainPage monta.
  // Quando o user abrir o modal 'Adicionar exercício' ou 'Substituir',
  // a lista já tá em memória e o modal abre instantâneo — sem
  // skeleton, sem flash, sem latência de rede.
  useEffect(() => {
    prefetchExerciseCatalog(authorizedFetch)
  }, [authorizedFetch])

  // Reload via cache compartilhado. Hit no cache (TTL 1 min) resolve em
  // <1ms; miss faz request única com coalesce — múltiplas chamadas
  // simultâneas viram uma só. Também atualiza localStorage pra próxima
  // sessão renderizar instantâneo.
  const reloadPlans = useCallback(async (preferredPlanId?: string) => {
    const items = await getWorkoutPlansCached(authorizedFetch)
    setPlans(items)

    if (preferredPlanId && items.some((plan) => plan.id === preferredPlanId)) {
      setActivePlanId(preferredPlanId)
      return
    }

    if (items[0]) {
      setActivePlanId(items[0].id)
    }
  }, [authorizedFetch])

  useEffect(() => {
    // Stale-while-revalidate: se já temos cache, NÃO mostramos skeleton
    // (lista renderiza imediato). Refetch roda em background pra próxima
    // leitura ter dados frescos. Quando não tem cache (primeira vez na
    // sessão), aí sim o skeleton aparece pra dar feedback.
    const hasCache = peekWorkoutPlans() != null
    if (!hasCache) {
      setLoadingPlans(true)
    }
    void reloadPlans()
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar rotinas')
      })
      .finally(() => {
        setLoadingPlans(false)
      })
  }, [reloadPlans])

  // Mantém a tela acesa enquanto o usuário está na tela de treino ativo —
  // como Hevy/Strava (timer/descanso sempre visíveis sem precisar tocar).
  useWakeLock(screen === 'ACTIVE')

  // Relógio ÚNICO de duração (mesma fonte da mini barra) — garante que a tela
  // ativa e a mini barra mostram EXATAMENTE o mesmo tempo, sem diferença. O
  // `elapsedSec` (state) segue sendo a fonte que alimenta o snapshot e o
  // finalizar; este aqui é só pra EXIBIR de forma idêntica em todo lugar.
  const displayElapsedSec = useActiveWorkoutElapsed()

  // Espelha elapsedSec num ref pra o tick ancorar no valor atual sem precisar
  // de elapsedSec nas deps (o que reiniciaria o efeito a cada segundo).
  const elapsedSecRef = useRef(elapsedSec)
  useEffect(() => {
    elapsedSecRef.current = elapsedSec
  }, [elapsedSec])
  // Bump pra forçar re-âncora do cronômetro (ex.: edição manual de tempo).
  const [timerNonce, setTimerNonce] = useState(0)

  // Cronômetro de duração — modelo de ÂNCORA (igual à mini barra): cada tick
  // mostra `base + (now - at)` por wall-clock, ou seja, SEMPRE o tempo real.
  // Assim não pula/segura número quando o setInterval dispara irregular (main
  // thread ocupado) nem congela ao voltar de background — antes o modelo
  // acumulativo (`current + delta`) causava esses travamentos. Re-ancora ao
  // entrar em ACTIVE+running, ao retomar (pause→play) e na edição manual.
  // IMPORTANTE: roda enquanto o treino está rodando em QUALQUER tela (não só na
  // ACTIVE). Antes, ao sair da tela ativa o elapsedSec congelava, mas o app
  // continuava gravando o snapshot com lastSavedAt fresco → snapshot
  // inconsistente (tempo congelado + timestamp atual) → as duas durações (tela
  // ativa e mini barra) divergiam e ficavam atrás da realidade. Mantendo o tick
  // sempre ativo, elapsedSec nunca congela, o snapshot fica sempre consistente,
  // e os dois cronômetros derivam do MESMO relógio de parede → idênticos e
  // precisos. Modelo de âncora: cada tick mostra base + (now - at).
  useEffect(() => {
    if (!isWorkoutRunning) {
      return
    }
    // base = maior entre o elapsed atual e o valor AUTORITATIVO do snapshot
    // (mesma sessão) — nunca anda pra trás; a guarda por startedAt evita pegar
    // snapshot de uma sessão antiga ao iniciar um treino novo.
    let base = elapsedSecRef.current
    const snap = readActiveWorkout()
    if (
      snap?.isWorkoutRunning &&
      snap.startedAt &&
      startedAt &&
      new Date(snap.startedAt).getTime() === startedAt.getTime()
    ) {
      base = Math.max(base, deriveElapsedSec(snap))
    }
    const at = Date.now()
    const tick = () => {
      setElapsedSec(base + Math.floor((Date.now() - at) / 1000))
    }
    const id = window.setInterval(tick, 1000)
    // Ressincroniza na hora ao voltar pro foreground (sem esperar o tick).
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isWorkoutRunning, timerNonce, startedAt, setElapsedSec])

  // Hydrate the active workout on mount. If the user navigated away from
  // /train mid-session, the data is restored here and the clock is
  // forwarded by however long the tab was away. The screen is NOT
  // auto-set to ACTIVE — clicking the "Treinar" nav should always land
  // on the dashboard. The mini bar (or the resume location state below)
  // is what jumps back into the live workout view.
  const hasHydratedRef = useRef(false)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (hasHydratedRef.current) return
    hasHydratedRef.current = true
    const snapshot = readActiveWorkout()
    if (snapshot) {
      setOriginMode(snapshot.originMode as TrainOriginMode)
      setActivePlanId(snapshot.activePlanId)
      setActivePlanName(snapshot.activePlanName)
      // Reidrata cada exercise garantindo que restEndsAtMs vire fonte de
      // verdade. Pra exercises rodando ao salvar, recalcula restRemainingSec
      // a partir do wall-clock — assim mesmo se o app ficou fechado por X
      // tempo, o timer reflete o estado real e dispara o "concluído" se já
      // passou. Snapshots antigos sem restEndsAtMs (pré-fix) caem num fallback
      // conservador: continuam com o valor stored (sem zerar nada).
      const nowMs = Date.now()
      const exercises = ((snapshot.activeExercises as ActiveExercise[]) ?? []).map((ex) => {
        if (!ex.restRunning) {
          return { ...ex, restEndsAtMs: ex.restEndsAtMs ?? null }
        }
        if (ex.restEndsAtMs == null) {
          // Snapshot pré-refactor — não dá pra recalcular. Mantém como
          // estava; o tick principal vai congelar até o user interagir.
          return ex
        }
        const remainingSec = Math.max(0, Math.ceil((ex.restEndsAtMs - nowMs) / 1000))
        if (remainingSec <= 0) {
          // Descanso terminou em background. Marca como concluído pra UI
          // mostrar o overlay verde imediatamente ao abrir o app.
          setRestFinishedName(ex.exerciseName)
          return { ...ex, restRunning: false, restEndsAtMs: null, restRemainingSec: 0 }
        }
        return { ...ex, restRemainingSec: remainingSec }
      })
      setActiveExercises(exercises)
      setCardioEntries((snapshot.cardioEntries as CardioEntryInput[]) ?? [])
      setStartedAt(snapshot.startedAt ? new Date(snapshot.startedAt) : null)
      setEndedAt(snapshot.endedAt ? new Date(snapshot.endedAt) : null)
      setIsWorkoutRunning(snapshot.isWorkoutRunning)
      setElapsedSec(deriveElapsedSec(snapshot))
    }
    setHydrated(true)
    // Reidratação roda só uma vez no mount (guard hasHydratedRef); os setters
    // do reducer são estáveis. Deps vazias é intencional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Jump back into the live workout view when the user clicks the mini
  // bar (which navigates here with { state: { resume: true } }). Done as
  // a separate effect so it works for both "TrainPage already mounted"
  // and "TrainPage mounting now" cases. The state is cleared after read
  // so a browser back/forward doesn't re-fire it.
  const location = useLocation()
  useEffect(() => {
    const state = location.state as { resume?: boolean } | null
    if (state?.resume) {
      setScreen('ACTIVE')
      window.history.replaceState(null, '', location.pathname + location.search)
    }
  }, [location.pathname, location.search, location.state, setScreen])

  // Persist a snapshot of the active workout whenever there's data so
  // the mini bar (and a future mount of TrainPage) can resume it. The
  // snapshot tracks the current view (ACTIVE vs DASHBOARD) so the mini
  // bar knows when to hide itself on /train. Explicit transitions
  // (finalize, discard, resetWorkflow) call `clearActiveWorkout` so
  // the snapshot doesn't survive a fully completed/dropped session.
  useEffect(() => {
    if (!hydrated) return
    const hasData = activeExercises.length > 0 || elapsedSec > 0 || cardioEntries.length > 0
    if (!hasData) return
    if (screen !== 'ACTIVE' && screen !== 'DASHBOARD') return
    const currentExerciseName =
      activeExercises.find((e) => e.sets.some((s) => !s.checked))?.exerciseName ??
      activeExercises[activeExercises.length - 1]?.exerciseName ??
      null
    writeActiveWorkout({
      screen,
      originMode,
      activePlanId,
      activePlanName,
      activeExercises: activeExercises as unknown[],
      cardioEntries: cardioEntries.map((c) => ({
        type: c.type,
        durationSec: c.durationSec,
        distanceMeters: c.distanceMeters,
        notes: c.notes,
      })),
      startedAt: startedAt ? startedAt.toISOString() : null,
      endedAt: endedAt ? endedAt.toISOString() : null,
      elapsedSec,
      isWorkoutRunning,
      currentExerciseName,
    })
  }, [
    hydrated,
    screen,
    originMode,
    activePlanId,
    activePlanName,
    activeExercises,
    cardioEntries,
    startedAt,
    endedAt,
    elapsedSec,
    isWorkoutRunning,
  ])

  // The mini bar can request a discard from outside this page. If the
  // user confirmed there, reset the in-memory state so coming back to
  // /train shows a clean dashboard.
  useEffect(() => {
    const handler = () => {
      hasHydratedRef.current = true
      setScreen('DASHBOARD')
      setOriginMode('EMPTY')
      setActivePlanName('Treinamento vazio')
      setActiveExercises([])
      setCardioEntries([])
      setElapsedSec(0)
      setIsWorkoutRunning(false)
      setStartedAt(null)
      setEndedAt(null)
      interactionOrderByExerciseRef.current = {}
      interactionOrderCounterRef.current = 0
    }
    window.addEventListener(ACTIVE_WORKOUT_DISCARD_EVENT, handler)
    return () => window.removeEventListener(ACTIVE_WORKOUT_DISCARD_EVENT, handler)
    // Assina o evento uma vez no mount; os setters do reducer são estáveis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ┌────────────────────────────────────────────────────────────────────┐
  // │ Tick do timer de descanso — modelo WALL-CLOCK FIRST.               │
  // │                                                                    │
  // │ Verdade: `restEndsAtMs` (timestamp wall-clock quando o descanso    │
  // │ deve terminar). UI: `restRemainingSec` é DERIVADO disso a cada     │
  // │ tick — não decrementamos manualmente.                              │
  // │                                                                    │
  // │ Vantagem fundamental: o timer continua correto mesmo se o JS       │
  // │ ficou parado por X tempo (iOS background, navegar pra dashboard,  │
  // │ recarregar página, ...). Quando o tick volta, ele recalcula        │
  // │ remaining a partir do relógio real do device.                      │
  // │                                                                    │
  // │ Substituiu o modelo antigo de "decrementar restRemainingSec por    │
  // │ delta" — que sofria os bugs:                                       │
  // │   • Voltar pra dashboard parava o tick e congelava o timer         │
  // │   • Hidratação do snapshot não compensava o tempo offline          │
  // │   • Mudança manual de hora do device dava resultados estranhos     │
  // │   • screen != ACTIVE matava o tick mesmo com rest rodando          │
  // │                                                                    │
  // │ Agora o tick roda mesmo em DASHBOARD (pra UI da mini bar            │
  // │ refletir) — mas o resultado seria correto mesmo se não rodasse.    │
  // └────────────────────────────────────────────────────────────────────┘
  useEffect(() => {
    // Tick em qualquer screen que represente sessão viva. Mantém a UI
    // atualizada em ACTIVE (timer bar) e em DASHBOARD (mini bar).
    if (screen !== 'ACTIVE' && screen !== 'DASHBOARD') {
      return
    }

    const recompute = () => {
      const now = Date.now()
      setActiveExercises((current) => {
        let anyChanged = false
        const next = current.map((exercise) => {
          if (!exercise.restRunning) return exercise
          if (exercise.restEndsAtMs == null) {
            // Inconsistência (running=true mas sem endsAt): conservadora —
            // mantém running mas usa restRemainingSec atual como fallback.
            return exercise
          }
          const remainingSec = Math.max(0, Math.ceil((exercise.restEndsAtMs - now) / 1000))
          if (remainingSec <= 0) {
            // Só dispara setRestFinishedName uma vez por término.
            if (exercise.restRunning) {
              setRestFinishedName(exercise.exerciseName)
            }
            anyChanged = true
            return { ...exercise, restRemainingSec: 0, restRunning: false, restEndsAtMs: null }
          }
          if (remainingSec === exercise.restRemainingSec) return exercise
          anyChanged = true
          return { ...exercise, restRemainingSec: remainingSec }
        })
        return anyChanged ? next : current
      })
    }

    // Tick a cada 500ms — UI sente "responsiva" ao chegar nos últimos
    // segundos sem custo significativo (cada tick é O(N) sobre exercises).
    recompute()
    const id = window.setInterval(recompute, 500)
    return () => window.clearInterval(id)
  }, [screen, setActiveExercises])

  // Effect que reage a transições de restRunning por exercício e dispara
  // schedule/cancel no backend. Só executa o trabalho de fato se o user
  // optou-in (subscribed=true). Não é cleanup-heavy — só lê do ref de
  // estado anterior e faz chamadas HTTP fire-and-forget.
  //
  // Regras:
  //   • false → true: agenda push pra Date.now() + remaining*1000.
  //   • true → false COM remaining > 0: usuário parou manualmente, cancela.
  //   • true → false COM remaining <= 0: deixa rolar — push do backend
  //     vai chegar (ou já chegou) por conta própria.
  useEffect(() => {
    if (!pushNotifications.state.subscribed) {
      // Quando o user não está inscrito ou desativou, ainda manteremos
      // o ref de prev sincronizado pra evitar disparar schedule em
      // massa quando ele ativar (1 evento por exercício rodando).
      const updated: typeof prevRestStateRef.current = {}
      for (const ex of activeExercises) {
        updated[ex.exerciseId] = { running: ex.restRunning, remaining: ex.restRemainingSec }
      }
      prevRestStateRef.current = updated
      return
    }

    const updated: typeof prevRestStateRef.current = {}
    for (const ex of activeExercises) {
      const prev = prevRestStateRef.current[ex.exerciseId]
      const now = { running: ex.restRunning, remaining: ex.restRemainingSec }
      updated[ex.exerciseId] = now

      if (!prev) continue

      // Detecta restart de descanso (mesmo exercício, descanso ainda
      // rodando mas remaining "pulou pra cima" — sinal de que o user marcou
      // outra série antes do timer zerar). Tolerância de +2s pra cobrir
      // micro-jitter entre o tick do interval e o set state.
      const isRestart = prev.running && now.running && now.remaining > prev.remaining + 2

      // Início do descanso → agenda no backend com payload "rico":
      // título traz o nome do exercício, body traz qual a próxima série
      // e (quando disponível) o desempenho da que acabou de ser feita.
      // Notificação chega no lock screen do iOS com toda info pra o user
      // não precisar abrir o app pra lembrar onde parou.
      //
      // Cancel automático em restart é feito por scheduleRestForExercise
      // (bumpa seq, cancela lista, agenda com race guard) — não precisa
      // mais do bloco manual de cancel que existia aqui.
      if ((!prev.running && now.running && now.remaining > 0) || isRestart) {
        const fireAtMs = Date.now() + now.remaining * 1000
        const fireAt = new Date(fireAtMs).toISOString()
        const exerciseName = ex.exerciseName
        const exerciseId = ex.exerciseId

        // Encontra a série marcada como concluída mais recente (em ordem
        // de array). Heurística simples — o usuário tipicamente checa
        // séries em ordem, então a última marcada é a que acabou.
        let lastCheckedIdx = -1
        for (let i = 0; i < ex.sets.length; i += 1) {
          if (ex.sets[i].checked === true) lastCheckedIdx = i
        }
        const totalSets = ex.sets.length
        const lastSet = lastCheckedIdx >= 0 ? ex.sets[lastCheckedIdx] : null
        const performance = lastSet ? formatSetPerformanceLabel(lastSet, ex.isBodyweight) : null

        const nextSetNumber = lastCheckedIdx + 2 // 1-indexed
        const isLastSet = nextSetNumber > totalSets

        // Copy padronizada estilo Hevy: título neutro descrevendo o evento +
        // body com exercício na primeira linha e detalhe da próxima série na
        // segunda. \n é respeitado pelo iOS lock screen e Android moderno.
        // Mantemos × (U+00D7) — funciona em 100% dos devices modernos.
        const title = isLastSet ? 'Última série concluída' : 'Descanso concluído'
        let body: string
        if (isLastSet) {
          body = performance ? `${exerciseName}\n${performance}` : exerciseName
        } else {
          const nextLine = `Série ${nextSetNumber} de ${totalSets}`
          const detailLine = performance ? `${nextLine} · Última ${performance}` : nextLine
          body = `${exerciseName}\n${detailLine}`
        }

        scheduleRestForExercise(exerciseId, {
          fireAt,
          title,
          body,
          url: '/train',
          tag: `rest-${exerciseId}`,
        })
      }

      // Parada manual (true→false com tempo restante) → cancela tudo do
      // slot, inclusive promises ainda em curso (via seq bump).
      if (prev.running && !now.running && now.remaining > 0) {
        cancelRestSlot(ex.exerciseId)
      }

      // Conclusão natural (true→false ao zerar) — limpa o slot inteiro.
      // O push do backend já disparou OU vai disparar exatamente agora;
      // não precisa cancelar nada, só limpar o estado local pra próxima
      // rodada. Bumpamos o seq mesmo assim pra invalidar qualquer promise
      // de schedule lenta que ainda esteja em curso (caso raro mas real).
      if (prev.running && !now.running && now.remaining <= 0) {
        cancelRestSlot(ex.exerciseId)
      }
    }
    prevRestStateRef.current = updated
  }, [activeExercises, authorizedFetch, pushNotifications.state.subscribed, scheduleRestForExercise, cancelRestSlot])

  // Cancela o lembrete pendente (no-op se nada agendado) e cria um novo
  // pra agora+30min. Idempotente — chamar 10 vezes em sequência só deixa
  // o último ativo. Fire-and-forget: falhas HTTP não bloqueiam o app.
  // Sai cedo se o user não optou-in (subscribed=false) pra não ficar
  // batendo no backend inutilmente.
  const rescheduleIdleReminder = useCallback(() => {
    if (!pushNotifications.state.subscribed) return

    // Bump da geração ANTES de qualquer await — promises pendentes vão usar
    // isso pra saber se ainda são a chamada mais recente.
    const mySeq = ++idleReminderSeqRef.current

    // Snapshot da lista de pendentes, depois esvazia. Cancela tudo que
    // já estava agendado (inclusive zumbis de promises que ainda iam voltar
    // do backend mas vão ser invalidadas pelo mySeq abaixo).
    const pending = idleReminderScheduleIdsRef.current.slice()
    idleReminderScheduleIdsRef.current = []
    for (const id of pending) {
      void cancelBackendNotification(authorizedFetch, id).catch(() => { /* silencioso */ })
    }

    const fireAt = new Date(Date.now() + IDLE_REMINDER_MIN * 60 * 1000).toISOString()
    void scheduleBackendNotification(authorizedFetch, {
      fireAt,
      // Copy padronizada estilo Hevy: título descritivo do estado (não
      // gíria), body informa o motivo + call-to-action explícito.
      title: 'Treino pausado',
      body: `Sem novas séries há ${IDLE_REMINDER_MIN} min. Toque pra continuar ou finalizar.`,
      url: '/train',
      // Mesma tag pra todas as notificações de "idle" — no caso raro de
      // duas dispararem em sequência (race entre cancel/schedule), o
      // device coalesce visualmente em uma só.
      tag: 'idle-workout',
    }).then(({ id }) => {
      // Race guard: se outra chamada veio depois desta, o counter já
      // andou. Esse id é obsoleto — cancela no backend e descarta.
      if (mySeq !== idleReminderSeqRef.current) {
        void cancelBackendNotification(authorizedFetch, id).catch(() => { /* silencioso */ })
        return
      }
      idleReminderScheduleIdsRef.current.push(id)
    }).catch(() => { /* silencioso */ })
  }, [pushNotifications.state.subscribed, authorizedFetch])

  // Cancela TODAS as notificações de "Descanso acabou" pendentes no backend
  // pra qualquer exercício desta sessão. Chamada nos pontos terminais do
  // treino (descartar, finalizar, salvar) — sem isso, mesmo após o user
  // descartar o treino, as pushes agendadas continuam disparando no horário
  // marcado (bug reportado: "Descanso acabou — Supino" chegando depois de
  // ter descartado o treino).
  //
  // Itera os slots e usa cancelRestSlot pra garantir que o seq é bumpado
  // em cada um — sem isso, promises ainda em curso poderiam voltar do
  // backend depois e salvar IDs zumbis que ninguém cancelaria mais.
  const cancelAllPendingRestNotifications = useCallback(() => {
    for (const key of Object.keys(restScheduleSlotsRef.current)) {
      cancelRestSlot(key)
    }
  }, [cancelRestSlot])

  // Cancela TODOS os lembretes pendentes sem reagendar. Usado quando o
  // treino acaba (finalizar ou descartar). Invalida promises em curso
  // bumpando o seq pra que qualquer ID que ainda volte do backend seja
  // cancelado em vez de salvo (mesma proteção do reschedule).
  const cancelIdleReminder = useCallback(() => {
    idleReminderSeqRef.current += 1
    const pending = idleReminderScheduleIdsRef.current.slice()
    idleReminderScheduleIdsRef.current = []
    for (const id of pending) {
      void cancelBackendNotification(authorizedFetch, id).catch(() => { /* silencioso */ })
    }
  }, [authorizedFetch])

  useEffect(() => {
    if (!restFinishedName) return

    // Haptic ao zerar o descanso (foreground). Quando a aba está hidden, o
    // browser ignora navigator.vibrate — aí quem vibra é a notificação abaixo.
    vibrate([80, 40, 80])

    // Notif local foi pensada pra cobrir o caso "app aberto mas em outra
    // aba"; com o app em foreground/visible, ela vira ruído visual (banner
    // sobre conteúdo) e ainda DUPLICA a push que já chegou do backend no
    // lock screen.
    //
    // Bug reportado: ao voltar pro app depois do descanso ter zerado em
    // background, o catch-up setava restFinishedName, esse efeito disparava
    // localNotification, iOS exibia banner — segundo "Descanso concluído"
    // pro mesmo evento. Agora só dispara quando a aba está hidden (ou
    // visibility API não disponível).
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      void showLocalNotification('Descanso concluído', {
        body: restFinishedName,
        tag: 'rest-done',
        url: '/train',
        vibrate: [80, 40, 80],
      })
    }

    const id = window.setTimeout(() => setRestFinishedName(null), 3000)
    return () => window.clearTimeout(id)
  }, [restFinishedName])

  // Mobile background catch-up. iOS Safari (e Chrome em alguns casos)
  // pausa setInterval quando a aba sai pra background — trocar de
  // app, travar a tela, minimizar — então o cronômetro de duração e
  // o timer de descanso "congelam" no valor que tinham. Quando o
  // usuário volta, esse efeito calcula quanto tempo passou enquanto
  // hidden e compensa nos contadores.
  const isWorkoutRunningRef = useRef(isWorkoutRunning)
  useEffect(() => { isWorkoutRunningRef.current = isWorkoutRunning }, [isWorkoutRunning])
  useEffect(() => {
    let hiddenAt: number | null = null
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      // visibilityState === 'visible' (ou pageshow do bfcache)
      if (hiddenAt == null) return
      const missedSec = Math.floor((Date.now() - hiddenAt) / 1000)
      hiddenAt = null
      if (missedSec <= 0) return

      // NÃO compensar elapsedSec nem restRemainingSec aqui — ambos os
      // timers usam wall-clock como fonte de verdade agora:
      //   • elapsedSec: tick principal lê delta = (now - lastTickMs) / 1000
      //   • restRemainingSec: tick recalcula via (restEndsAtMs - now) / 1000
      // Compensar manualmente aqui causava o bug "1h31 virava 1h53" (dobra
      // o tempo de duração) e seria redundante pro descanso. O próximo
      // tick depois de voltar de background já corrige tudo sozinho.
      //
      // Mantemos o handler vivo só pra registrar `hiddenAt` (uso futuro:
      // estatística de quanto tempo o user passou em background, se
      // quisermos adicionar). Sem compensações.
      void missedSec
    }
    document.addEventListener('visibilitychange', handleVisibility)
    // pageshow cobre o caso de Safari restaurar a página do bfcache
    // (back/forward navigation) — não dispara visibilitychange nesse
    // path mas a aba ficou "hidden" do nosso ponto de vista.
    window.addEventListener('pageshow', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pageshow', handleVisibility)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (summaryImagePreview) {
        URL.revokeObjectURL(summaryImagePreview)
      }
    }
  }, [summaryImagePreview])

  const activeExerciseIdsKey = useMemo(
    () =>
      Array.from(new Set(activeExercises.map((exercise) => exercise.exerciseId)))
        .sort()
        .join(','),
    [activeExercises],
  )

  useEffect(() => {
    if (screen !== 'ACTIVE' || !activeExerciseIdsKey) {
      setLastPerformanceByExercise({})
      return
    }

    let cancelled = false

    const loadLastPerformance = async () => {
      try {
        const exerciseIds = activeExerciseIdsKey.split(',').filter(Boolean)
        const data = await getLatestExercisePerformance(authorizedFetch, exerciseIds)

        if (cancelled) {
          return
        }

        const mapped: Record<
          string,
          Record<
            number,
            {
              reps: number | null
              weightKg: number | null
              rir: number | null
              rpe: number | null
              durationSec: number | null
              distanceMeters: number | null
            }
          >
        > = {}
        const latestSetCountByExercise: Record<string, number> = {}

        data.items.forEach((item) => {
          mapped[item.exerciseId] = {}
          latestSetCountByExercise[item.exerciseId] = item.sets.reduce(
            (max, setEntry) => Math.max(max, setEntry.setNumber),
            0,
          )
          item.sets.forEach((setEntry) => {
            const reps = toFiniteNumber(setEntry.reps)
            const weightKg = toFiniteNumber(setEntry.weightKg)
            const rir = toFiniteNumber(setEntry.rir)
            const rpe = toFiniteNumber(setEntry.perceivedExertion)
            const durationSec = toFiniteNumber(setEntry.durationSec)
            const distanceMeters = toFiniteNumber(setEntry.distanceMeters)

            mapped[item.exerciseId][setEntry.setNumber] = {
              reps,
              weightKg,
              rir,
              rpe,
              durationSec,
              distanceMeters,
            }
          })
        })

        setLastPerformanceByExercise(mapped)
        setActiveExercises((current) =>
          current.map((exercise) => {
            const latestCount = latestSetCountByExercise[exercise.exerciseId] ?? 0
            if (latestCount <= exercise.sets.length) {
              return exercise
            }

            return {
              ...exercise,
              sets: [
                ...exercise.sets,
                ...Array.from({ length: latestCount - exercise.sets.length }, () => createSet()),
              ],
            }
          }),
        )
      } catch {
        if (!cancelled) {
          setLastPerformanceByExercise({})
        }
      }
    }

    void loadLastPerformance()

    return () => {
      cancelled = true
    }
  }, [activeExerciseIdsKey, authorizedFetch, screen, setActiveExercises])

  // All-time PR baseline for the active exercises. Fetched once when the
  // user enters the active screen so we can celebrate the first set that
  // beats their previous max. Bodyweight-style exercises return null which
  // is handled gracefully (we just won't fire any celebration on them).
  useEffect(() => {
    if (screen !== 'ACTIVE' || !activeExerciseIdsKey) {
      setPrByExerciseId({})
      return
    }

    let cancelled = false

    const loadPrs = async () => {
      try {
        const exerciseIds = activeExerciseIdsKey.split(',').filter(Boolean)
        const data = await getExercisePersonalRecords(authorizedFetch, exerciseIds)
        if (cancelled) return
        const next: Record<string, number | null> = {}
        const snapshot: Record<string, number> = {}
        for (const item of data.items) {
          next[item.exerciseId] = item.maxLoadKg
          if (item.maxLoadKg != null) snapshot[item.exerciseId] = item.maxLoadKg
        }
        setPrByExerciseId(next)
        // Snapshot do PR "antes" pra contar PRs novos no SUMMARY.
        setPrSnapshotAtStart(snapshot)
      } catch {
        // Soft fail — missing PR data just means no celebration, the
        // workout itself isn't impacted.
      }
    }

    void loadPrs()

    return () => {
      cancelled = true
    }
  }, [screen, activeExerciseIdsKey, authorizedFetch])

  useEffect(() => {
    if (screen !== 'ACTIVE' || !activeExerciseIdsKey) {
      return
    }

    let cancelled = false

    const syncExerciseMetadata = async () => {
      try {
        const catalog = await getExerciseCatalogCached(authorizedFetch)
        if (cancelled) {
          return
        }

        const catalogById = new Map(catalog.map((exercise) => [exercise.id, exercise]))

        setActiveExercises((current) =>
          current.map((exercise) => {
            const catalogExercise = catalogById.get(exercise.exerciseId)
            if (!catalogExercise) {
              return exercise
            }

            const equipment = catalogExercise.equipment || exercise.equipment
            const isBodyweight =
              isBodyweightEquipment(equipment) ||
              resolveBodyweightFlag(catalogExercise.isBodyweight, exercise.exerciseName, equipment)

            if (
              exercise.thumbnailUrl === (catalogExercise.thumbnailUrl ?? exercise.thumbnailUrl) &&
              exercise.videoUrl === (catalogExercise.videoUrl ?? exercise.videoUrl) &&
              exercise.equipment === equipment &&
              exercise.isBodyweight === isBodyweight &&
              exercise.allowsExtraLoad === catalogExercise.allowsExtraLoad
            ) {
              return exercise
            }

            return {
              ...exercise,
              thumbnailUrl: catalogExercise.thumbnailUrl ?? exercise.thumbnailUrl,
              videoUrl: catalogExercise.videoUrl ?? exercise.videoUrl,
              equipment,
              isBodyweight,
              allowsExtraLoad: catalogExercise.allowsExtraLoad,
            }
          }),
        )
      } catch {
        // Keep current values when metadata enrichment fails.
      }
    }

    void syncExerciseMetadata()

    return () => {
      cancelled = true
    }
  }, [activeExerciseIdsKey, authorizedFetch, screen, setActiveExercises])

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-routine-menu]')) {
        setOpenRoutineMenuId(null)
        setRoutineMenuAnchor(null)
      }
    }

    const handleDismiss = () => {
      setOpenRoutineMenuId(null)
      setRoutineMenuAnchor(null)
    }

    document.addEventListener('click', handleDocumentClick)
    window.addEventListener('resize', handleDismiss)
    window.addEventListener('scroll', handleDismiss, true)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
      window.removeEventListener('resize', handleDismiss)
      window.removeEventListener('scroll', handleDismiss, true)
    }
  }, [])

  // Retro-compat com o explorer global no AppShell — outros pontos do
  // app podem disparar openExerciseExplorer e selecionar daí. No treino
  // ativo, redireciona pra os mesmos helpers do AddExerciseModal/
  // SubstituteExerciseModal. O caminho principal hoje é via os modais
  // locais, mas mantenho esse listener pra não quebrar deep-links.
  useEffect(() => {
    const eventName = getExerciseExplorerSelectionEventName()

    const handler = (event: Event) => {
      if (screen !== 'ACTIVE') return
      const payload = (event as CustomEvent<ExerciseExplorerSelection>).detail
      if (!payload) return

      // trackingType é opcional no ExerciseExplorerSelection mas
      // requerido no ExerciseOption — default REPS pra normalizar.
      const option: ExerciseOption = { ...payload, trackingType: payload.trackingType ?? 'REPS' }

      const substituteIndex = pendingSubstitutionIndexRef.current
      if (substituteIndex != null) {
        pendingSubstitutionIndexRef.current = null
        applySubstitution(substituteIndex, option)
        return
      }
      addExerciseToActiveWorkout(option)
    }

    window.addEventListener(eventName, handler)
    return () => window.removeEventListener(eventName, handler)
    // addExerciseToActiveWorkout/applySubstitution fecham sobre setters
    // estáveis; manter só [screen] preserva o comportamento (não re-assina
    // o listener a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen])

  // Erros são scoped por tela — qualquer transição limpa o estado pra
  // não exibir uma mensagem que ficou pendurada de outro contexto.
  useEffect(() => {
    setError(null)
  }, [screen])

  const totals = useMemo(() => calculateTotals(activeExercises), [activeExercises])

  const resetWorkflow = () => {
    // Revoga a URL da imagem de resumo ANTES do reset (usa o valor atual).
    if (summaryImagePreview) {
      URL.revokeObjectURL(summaryImagePreview)
    }
    // Reset atômico: ciclo de treino + slice de resumo (Fase 2), num dispatch só.
    dispatchSession({ type: 'RESET' })
    // postPrivacy fica fora do reducer (init de localStorage + reset via
    // defaultPrivacy runtime) — reseta aqui.
    setPostPrivacy(defaultPrivacy)
    interactionOrderByExerciseRef.current = {}
    interactionOrderCounterRef.current = 0
    clearActiveWorkout()
    // Workout encerrou — não queremos um lembrete pendurado.
    cancelIdleReminder()
    // Nem pushes de "Descanso acabou" agendadas pra um exercício que não
    // existe mais. O backend coalesce por tag mas só dentro da mesma sessão
    // do device; sem cancel explícito, a push do treino descartado chega
    // do mesmo jeito no horário marcado.
    cancelAllPendingRestNotifications()
  }

  const beginEmptyTraining = () => {
    setError(null)
    interactionOrderByExerciseRef.current = {}
    interactionOrderCounterRef.current = 0
    // Treino vazio não tem rotina-base → sem snapshot pra comparar.
    originalPlanSnapshotRef.current = null
    // Uma ação atômica inicia a sessão vazia (origin/nome/limpa exercícios+
    // cardio/zera timer/começa a rodar/vai pra ACTIVE).
    dispatchSession({ type: 'START_EMPTY', startedAt: new Date() })
    // Inicia o relógio de inatividade — se o user abandonar agora sem
    // marcar nem adicionar nada, leva o lembrete em 30 min.
    rescheduleIdleReminder()
  }

  const beginRoutineTraining = (plan: WorkoutPlan) => {
    setError(null)
    interactionOrderByExerciseRef.current = {}
    interactionOrderCounterRef.current = 0
    // Snapshot da rotina pra detectar diff no save. Captura ANTES de
    // qualquer mutação na sessão (adicionar/remover/reordenar).
    originalPlanSnapshotRef.current = {
      planId: plan.id,
      items: plan.exercises.map((entry) => ({
        exerciseId: entry.exercise.id,
        planExerciseId: entry.id,
      })),
    }
    // activePlanId fica de fora do reducer (é seleção da dashboard, useState
    // próprio). O resto da sessão entra numa ação atômica.
    setActivePlanId(plan.id)
    dispatchSession({
      type: 'START_ROUTINE',
      planName: plan.name,
      exercises: mapPlanToActiveExercises(plan),
      cardio: (plan.cardio ?? []).map((c) => ({
        type: c.type,
        durationSec: c.durationSec,
        distanceMeters: c.distanceMeters ?? undefined,
        notes: c.notes ?? undefined,
      })),
      startedAt: new Date(),
    })
    rescheduleIdleReminder()
  }

  // Transição real pra tela de SUMMARY. Extraído pra ser chamado tanto
  // do happy path quanto dos handlers do DurationWarningDialog (que
  // pode aparecer antes da transição quando a duração tá fora do
  // razoável).
  const transitionToSummary = (durationMinOverride?: number) => {
    const end = new Date()
    // Tela de Resumo é estado terminal — usuário tá pra salvar ou
    // descartar, não tá mais "treinando". Cancela o lembrete pra não
    // soltar "treino ainda rolando" enquanto ele preenche o resumo.
    cancelIdleReminder()
    // Tambem cancela qualquer push de "Descanso acabou" pendente — o user
    // já saiu da tela de treino ativo, descanso não faz sentido mais.
    cancelAllPendingRestNotifications()

    // Inclui o tempo de cardio no padrão da duração — sem isso, registrar
    // "30 min de corrida" em 1 min de cronômetro pré-encheria apenas 1 min.
    const cardioMin = Math.round(cardioEntries.reduce((s, c) => s + c.durationSec, 0) / 60)
    const clockMin = Math.round(elapsedSec / 60)
    const computedMin = Math.max(1, clockMin, cardioMin)
    // Transição atômica: encerra o cronômetro (endedAt + para de rodar) e
    // entra no resumo já com nome (= plano) e duração preenchidos.
    dispatchSession({
      type: 'GO_TO_SUMMARY',
      endedAt: end,
      summaryName: activePlanName,
      summaryDurationMin: String(durationMinOverride ?? computedMin),
    })
    // NÃO limpamos clearActiveWorkout() aqui — se o usuário fechar o tab
    // entre Finalizar e Salvar, perderia o tracking inteiro. O snapshot
    // é limpo só depois do save bem-sucedido (ver saveTraining).
  }

  // Handler do botão "Finalizar Treino". CHECK 1 (duração incomum) roda
  // aqui antes da transição pra SUMMARY — fluxo natural: user finaliza,
  // app pergunta se a duração faz sentido, depois entra na tela de
  // resumo já com valor correto (ou abre o picker pra ele ajustar).
  const finalizeTraining = () => {
    const cardioFallbackMin = Math.round(cardioEntries.reduce((s, c) => s + c.durationSec, 0) / 60)
    const clockMin = Math.round(elapsedSec / 60)
    const computedMin = Math.max(1, clockMin, cardioFallbackMin)
    const UNUSUAL_SHORT_MIN = 10
    const UNUSUAL_LONG_MIN = 4 * 60

    if (computedMin < UNUSUAL_SHORT_MIN || computedMin > UNUSUAL_LONG_MIN) {
      setDurationWarning({
        minutesActual: clockMin,
        minutesParsed: computedMin,
        isShort: computedMin < UNUSUAL_SHORT_MIN,
      })
      return
    }
    transitionToSummary()
  }

  // "Voltar" no header do treino ativo agora apenas volta pra dashboard
  // sem perder o treino. O snapshot continua em localStorage e o card
  // "Treino em andamento" na dashboard (ou a mini barra em outras páginas)
  // serve de atalho de volta.
  const backToDashboardFromActive = () => {
    setScreen('DASHBOARD')
  }

  // Volta o user pra tela de treino ativo (em vez de manter no SUMMARY).
  // Bloqueado quando o treino já foi salvo — sessão concluída não deve
  // poder ser "reaberta" como se o user estivesse treinando ainda; isso
  // criava o bug de o user clicar Salvar, achar que salvou, voltar pra
  // tela ativa e marcar mais séries "fantasma" que não iam mais pro
  // banco.
  const backToActiveTraining = () => {
    if (savedSessionId) return
    setEndedAt(null)
    setIsWorkoutRunning(true)
    setScreen('ACTIVE')
  }

  // Wrapper que faz duas checagens antes de finalizar:
  //   1) BLOQUEIO HARD — não permite finalizar se o treino está vazio
  //      (nenhuma série de musculação executada/preenchida E nenhum
  //      cardio). Faz sentido: salvar registro de "treino" sem nada
  //      polui o histórico e não tem informação útil.
  //   2) SOFT WARNING — séries com valores preenchidos mas sem o ✓.
  //      Avisa e deixa o usuário escolher finalizar mesmo assim.
  const finalizeWithSafetyCheck = () => {
    // 1) Treino completamente vazio?
    const hasMuscleWork = activeExercises.some((ex) =>
      ex.sets.some((s) =>
        s.checked ||
        s.reps.trim() !== '' ||
        s.weightKg.trim() !== '' ||
        s.rir.trim() !== '' ||
        s.rpe.trim() !== ''
      )
    )
    const hasCardio = cardioEntries.length > 0
    if (!hasMuscleWork && !hasCardio) {
      setInfoDialog({
        title: 'Treino vazio',
        message:
          'Você precisa de pelo menos uma atividade pra finalizar — uma série de musculação (mesmo só com reps/peso preenchido) ou uma entrada de cardio.\n\nVolte e adicione algum exercício, ou descarte o treino se foi um engano.',
      })
      return
    }

    // 2) Séries pendentes (input sem ✓)?
    let unchecked = 0
    for (const exercise of activeExercises) {
      for (const set of exercise.sets) {
        if (set.checked) continue
        const hasInput =
          set.reps.trim() !== '' || set.weightKg.trim() !== '' ||
          set.rir.trim() !== '' || set.rpe.trim() !== ''
        if (hasInput) unchecked += 1
      }
    }
    if (unchecked > 0) {
      setConfirmDialog({
        title: 'Finalizar com séries pendentes?',
        message: `Você tem ${unchecked} série(s) com valores preenchidos mas sem o ✓ de concluída. Elas não vão ser contabilizadas no histórico nem no volume. Finalizar mesmo assim?`,
        confirmLabel: 'Finalizar',
        onConfirm: finalizeTraining,
      })
      return
    }
    finalizeTraining()
  }

  // Pausa/retoma o timer. Mantém o wall-clock como verdade — quando
  // pausa, restEndsAtMs vira null e restRemainingSec congela onde está.
  // Quando retoma, restEndsAtMs = now + restRemainingSec * 1000 (continua
  // de onde parou).
  const toggleRestTimer = (exerciseIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) return exercise
        if (exercise.restDurationSec <= 0) return exercise
        if (exercise.restRunning) {
          // Pausando — congela restRemainingSec (já atualizado pelo tick).
          return { ...exercise, restRunning: false, restEndsAtMs: null }
        }
        // Retomando — wall-clock end = agora + segundos restantes.
        const baseSec = exercise.restRemainingSec > 0 ? exercise.restRemainingSec : exercise.restDurationSec
        return {
          ...exercise,
          restRunning: true,
          restEndsAtMs: Date.now() + baseSec * 1000,
        }
      }),
    )
  }

  // Ajusta o timer em ±N segundos. Quando running, move o endsAt
  // diretamente — o tick reflete imediatamente. Quando paused, ajusta o
  // remaining congelado.
  const adjustRestTimer = (exerciseIndex: number, deltaSec: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) return exercise
        if (exercise.restRunning && exercise.restEndsAtMs != null) {
          const newEndsAt = exercise.restEndsAtMs + deltaSec * 1000
          // Floor de 1s pra evitar pular o term ao chamar -15s seguidos.
          const minEndsAt = Date.now() + 1000
          return {
            ...exercise,
            restEndsAtMs: Math.max(minEndsAt, newEndsAt),
          }
        }
        const next = Math.max(1, exercise.restRemainingSec + deltaSec)
        return { ...exercise, restRemainingSec: next }
      }),
    )
  }

  const completeSet = useCallback(
    (exerciseIndex: number, setIndex: number) => {
      // PR detection — só dispara quando:
      //   (a) o user está marcando (unchecked → checked, desmarcar não conta)
      //   (b) o peso É ESTRITAMENTE MAIOR que o all-time PR conhecido E maior
      //       que o melhor peso de qualquer outra série JÁ marcada nesta sessão
      //       no mesmo exercício.
      //
      // O check contra "melhor série da sessão" é o que evita o bug em que
      // 2 séries de 95kg disparavam celebration duas vezes — antes só
      // comparávamos com prByExerciseId, que podia estar stale entre cliques
      // rápidos. Comparar com as próprias sets marcadas é resiliente a
      // closure stale e a estado vazio inicial.
      const target = activeExercises[exerciseIndex]
      const targetSet = target?.sets[setIndex]
      // Haptic curto ao MARCAR a série (não ao desmarcar) — vale pra qualquer
      // tipo de exercício, inclusive peso corporal.
      if (targetSet && !targetSet.checked) vibrate(18)
      if (target && targetSet && !targetSet.checked && !isEffectiveBodyweightExercise(target)) {
        const weightRaw = targetSet.weightKg.trim().replace(',', '.')
        const weight = weightRaw ? Number(weightRaw) : NaN

        const previousPr = prByExerciseId[target.exerciseId] ?? null
        // Maior peso já marcado nas OUTRAS séries deste exercício na sessão.
        const bestInSession = target.sets.reduce((max, s, i) => {
          if (i === setIndex || !s.checked) return max
          const w = Number((s.weightKg ?? '').trim().replace(',', '.'))
          return Number.isFinite(w) && w > max ? w : max
        }, 0)
        const effectivePr = Math.max(previousPr ?? 0, bestInSession)

        if (Number.isFinite(weight) && weight > 0 && weight > effectivePr) {
          setPrByExerciseId((current) => ({ ...current, [target.exerciseId]: weight }))
          setPrCelebration({
            id: Date.now(),
            exerciseName: target.exerciseName,
            loadKg: weight,
            // previousKg null quando é o primeiro PR all-time; mostra o PR
            // anterior (que pode ser o all-time OU o melhor da sessão).
            previousKg: effectivePr > 0 ? effectivePr : null,
          })
        }
      }

      setActiveExercises((current) =>
        current.map((exercise, idx) => {
          if (idx !== exerciseIndex) return exercise

          const wasChecked = exercise.sets[setIndex]?.checked ?? false
          const lastSet = resolveLastSetPerformance(lastPerformanceByExercise[exercise.exerciseId], setIndex + 1)

          const trackingDefault =
            exercise.trackingType === 'TIME'
              ? '30'
              : exercise.trackingType === 'DISTANCE'
                ? '20'
                : exercise.suggestedReps
          const lastValue =
            exercise.trackingType === 'TIME'
              ? lastSet?.durationSec
              : exercise.trackingType === 'DISTANCE'
                ? lastSet?.distanceMeters
                : lastSet?.reps
          const newSets = exercise.sets.map((s, sIdx) => {
            if (sIdx !== setIndex) return s
            if (wasChecked) return { ...s, checked: false }
            const repsFill =
              s.reps.trim() !== ''
                ? s.reps
                : lastValue != null
                  ? String(lastValue)
                  : trackingDefault
            return {
              ...s,
              checked: true,
              weightKg: s.weightKg.trim() === '' && lastSet?.weightKg != null ? String(lastSet.weightKg) : s.weightKg,
              reps: repsFill,
              rir: s.rir.trim() === '' && lastSet?.rir != null ? String(lastSet.rir) : s.rir,
              rpe: s.rpe.trim() === '' && lastSet?.rpe != null ? String(lastSet.rpe) : s.rpe,
            }
          })

          const shouldStartRest = !wasChecked && exercise.restDurationSec > 0
          // Desmarcar uma série cancela o descanso em andamento — senão o
          // cronômetro continua rolando mesmo o usuário tendo desfeito a série.
          const shouldStopRest = wasChecked
          // Wall-clock fonte de verdade: timestamp em que deve zerar.
          // restRemainingSec é só pra UI (recalculado pelo tick).
          const nowMs = Date.now()
          const restEndsAtMs = shouldStartRest
            ? nowMs + exercise.restDurationSec * 1000
            : shouldStopRest
              ? null
              : exercise.restEndsAtMs

          return {
            ...exercise,
            sets: newSets,
            restRemainingSec: shouldStartRest
              ? exercise.restDurationSec
              : shouldStopRest
                ? 0
                : exercise.restRemainingSec,
            restRunning: shouldStartRest ? true : shouldStopRest ? false : exercise.restRunning,
            restEndsAtMs,
          }
        }).map((exercise, idx) => {
          // stop rest on all OTHER exercises when starting a new one
          if (idx !== exerciseIndex && current[exerciseIndex]?.sets[setIndex]?.checked === false) {
            return { ...exercise, restRunning: false, restEndsAtMs: null }
          }
          return exercise
        }),
      )

      // Atividade significativa — adia o lembrete de "treino parado" pra
      // mais 30 min. Vale tanto pra checar quanto pra desmarcar (qualquer
      // toque mostra que o user ainda tá engajado).
      rescheduleIdleReminder()
    },
    [lastPerformanceByExercise, activeExercises, prByExerciseId, rescheduleIdleReminder, setActiveExercises],
  )

  const startRestEdit = (exerciseIndex: number) => {
    const target = activeExercises[exerciseIndex]
    if (!target) {
      return
    }

    setEditingRestExerciseIndex(exerciseIndex)
    setRestDraftSec(String(target.restDurationSec))
  }

  // Aplica o tempo de descanso novo. O sheet já garante que o valor
  // vem de uma lista válida (REST_OPTIONS_SEC ∪ {0}), então não
  // precisa mais validar formato — a validação fica como guarda
  // defensiva contra chamadas programáticas com valores estranhos.
  const applyRestEdit = async (exerciseIndex: number, secOverride?: number) => {
    const parsed = secOverride ?? Number(restDraftSec)
    const isInt = Number.isInteger(parsed)
    const isZero = parsed === 0
    const inRange = parsed >= 10 && parsed <= 300

    if (!isInt || (!isZero && !inRange)) {
      setError('Descanso deve ser 0 ou um valor entre 10 e 300 segundos.')
      return
    }

    setError(null)

    const target = activeExercises[exerciseIndex]
    if (!target) {
      setEditingRestExerciseIndex(null)
      return
    }

    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) {
          return exercise
        }

        return {
          ...exercise,
          restDurationSec: parsed,
          restRemainingSec: parsed,
          restRunning: false,
          restEndsAtMs: null,
        }
      }),
    )
    setEditingRestExerciseIndex(null)

    if (originMode !== 'ROUTINE' || !activePlanId || !target.planExerciseId) {
      return
    }

    try {
      await updatePlanExercise(authorizedFetch, activePlanId, target.planExerciseId, {
        restSec: parsed === 0 ? null : parsed,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar descanso na rotina')
    }
  }

  // Remove um exercício do treino ativo. Quando o exercício veio de
  // uma rotina, mostra confirm forte porque a remoção é irreversível
  // pela UI (precisaria voltar à edição da rotina). Quando é um
  // exercício adicionado on-the-fly à sessão, basta sumir.
  const handleRemoveExercise = (exerciseIndex: number) => {
    const target = activeExercises[exerciseIndex]
    if (!target) return
    const confirmed = window.confirm(
      `Remover "${target.exerciseName}" do treino?\n\nIsso apaga as séries que você já registrou desse exercício nesta sessão.`,
    )
    if (!confirmed) return
    setActiveExercises((current) => current.filter((_, idx) => idx !== exerciseIndex))
    // Não reseta o idle reminder: só marcar série conta como atividade real
    // de treino. Remover exercício pode ser parte de "preparar a próxima
    // sessão" e não merece adiar o lembrete.
  }

  // Adiciona um exercício ao final do treino ativo. Pure — o updater
  // não tem side effect além do return; a checagem de duplicata é
  // feita só pra ser idempotente (StrictMode chama o updater 2x em dev
  // e poderia adicionar 2 cópias). Os callers que precisam avisar o
  // usuário sobre duplicatas fazem essa checagem ANTES de chamar (ex.:
  // onPickBatch do AddExerciseModal mostra um InfoDialog agregado pros
  // skipped). Aqui dentro o silêncio é proposital: o create-flow nunca
  // tem duplicata real (id é fresco) e o explorer legado faz dedup no
  // listener.
  const addExerciseToActiveWorkout = (payload: ExerciseOption) => {
    pushRecentExerciseId(payload.id)
    setActiveExercises((current) => {
      if (current.some((ex) => ex.exerciseId === payload.id)) return current
      return [
        ...current,
        {
          exerciseId: payload.id,
          exerciseName: payload.name,
          equipment: payload.equipment,
          thumbnailUrl: payload.thumbnailUrl,
          videoUrl: payload.videoUrl,
          isBodyweight: resolveBodyweightFlag(payload.isBodyweight, payload.name, payload.equipment),
          allowsExtraLoad: payload.allowsExtraLoad,
          trackingType: (payload.trackingType ?? 'REPS') as TrackingType,
          suggestedReps:
            payload.trackingType === 'TIME'
              ? '30'
              : payload.trackingType === 'DISTANCE'
                ? '20'
                : '10',
          restDurationSec: 0,
          restRemainingSec: 0,
          restRunning: false,
          restEndsAtMs: null,
          sets: [createSet()],
          userNote: '',
        },
      ]
    })
    // Não reseta o idle reminder: adicionar exercício ainda não é treinar.
    // Só marcar série conta como atividade que adia o lembrete.
  }

  // Aplica a substituição de um exercício pelo ExerciseOption picado.
  // Preserva séries, descanso, notas e supersérie. Usado tanto pelo
  // SubstituteExerciseModal novo quanto pelo fluxo legado via explorer.
  const applySubstitution = (substituteIndex: number, payload: ExerciseOption) => {
    pushRecentExerciseId(payload.id)
    let blocked = false
    setActiveExercises((current) => {
      const dup = current.findIndex((ex) => ex.exerciseId === payload.id)
      if (dup !== -1 && dup !== substituteIndex) {
        blocked = true
        return current
      }
      return current.map((exercise, idx) => {
        if (idx !== substituteIndex) return exercise
        return {
          ...exercise,
          exerciseId: payload.id,
          exerciseName: payload.name,
          equipment: payload.equipment,
          thumbnailUrl: payload.thumbnailUrl,
          videoUrl: payload.videoUrl,
          isBodyweight: resolveBodyweightFlag(payload.isBodyweight, payload.name, payload.equipment),
          allowsExtraLoad: payload.allowsExtraLoad,
          trackingType: (payload.trackingType ?? 'REPS') as TrackingType,
        }
      })
    })
    if (blocked) {
      setInfoDialog({
        title: 'Exercício já no treino',
        message: `${payload.name} já está em outra posição do treino. Escolha outro exercício para substituir.`,
      })
    }
  }

  // Handler do drag-and-drop. Recebe a nova posição via dnd-kit,
  // encontra os índices pelos exerciseIds e usa arrayMove pra
  // calcular o novo array. exerciseId é único por treino (garantido
  // pelo handler que adiciona exercícios), então funciona como id
  // estável pro dnd-kit mesmo após reorder.
  const handleExerciseDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setActiveExercises((current) => {
      const oldIndex = current.findIndex((ex) => ex.exerciseId === active.id)
      const newIndex = current.findIndex((ex) => ex.exerciseId === over.id)
      if (oldIndex === -1 || newIndex === -1) return current
      return arrayMove(current, oldIndex, newIndex)
    })
  }

  // Pareia dois exercícios numa supersérie. Se o alvo já tem grupo,
  // o source entra nesse grupo (cria supersérie de 3+). Caso contrário,
  // cria um grupo novo com a próxima letra livre (A, B, C...).
  const pairAsSuperset = (sourceIndex: number, targetIndex: number) => {
    if (sourceIndex === targetIndex) return
    setActiveExercises((current) => {
      const target = current[targetIndex]
      const source = current[sourceIndex]
      if (!target || !source) return current
      const groupId = target.supersetGroup ?? source.supersetGroup ?? nextSupersetGroupId(current)
      return current.map((exercise, idx) => {
        if (idx === sourceIndex || idx === targetIndex) {
          return { ...exercise, supersetGroup: groupId }
        }
        return exercise
      })
    })
  }

  // Tira o exercício do grupo. Se sobrar só 1 exercício no grupo
  // depois disso, o solitário também perde o grupo (supersérie de
  // 1 é sem sentido).
  const removeFromSuperset = (exerciseIndex: number) => {
    setActiveExercises((current) => {
      const target = current[exerciseIndex]
      if (!target || !target.supersetGroup) return current
      const groupId = target.supersetGroup
      const stillInGroup = current
        .map((ex, idx) => ({ ex, idx }))
        .filter(({ ex, idx }) => idx !== exerciseIndex && ex.supersetGroup === groupId)
      const orphanedIndex = stillInGroup.length === 1 ? stillInGroup[0].idx : null
      return current.map((exercise, idx) => {
        if (idx === exerciseIndex || idx === orphanedIndex) {
          return { ...exercise, supersetGroup: null }
        }
        return exercise
      })
    })
  }

  const patchSet = (
    exerciseIndex: number,
    setIndex: number,
    patch: Partial<ExerciseSetInput>,
  ) => {
    const targetExercise = activeExercises[exerciseIndex]
    if (targetExercise) {
      const currentOrder = interactionOrderByExerciseRef.current[targetExercise.exerciseId]
      if (currentOrder == null) {
        interactionOrderCounterRef.current += 1
        interactionOrderByExerciseRef.current[targetExercise.exerciseId] = interactionOrderCounterRef.current
      }
    }

    setActiveExercises((current) =>
      current.map((exercise, eIdx) => {
        if (eIdx !== exerciseIndex) {
          return exercise
        }

        return {
          ...exercise,
          sets: exercise.sets.map((setInput, sIdx) =>
            sIdx === setIndex ? { ...setInput, ...patch } : setInput,
          ),
        }
      }),
    )
  }

  const addSet = (exerciseIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) =>
        idx === exerciseIndex ? { ...exercise, sets: [...exercise.sets, createSet()] } : exercise,
      ),
    )
  }

  // Adiciona uma série já preenchida com os valores do último set
  // editado pelo usuário (reps + peso + RIR + RPE). Acelera tracking
  // de séries "iguais" — comum em volume work onde 4 séries são
  // idênticas e o usuário só altera se algo mudou.
  const addSetCopyingPrevious = (exerciseIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) return exercise
        const last = exercise.sets[exercise.sets.length - 1]
        if (!last) return { ...exercise, sets: [createSet()] }
        return {
          ...exercise,
          sets: [
            ...exercise.sets,
            createSet(last.reps, last.weightKg, last.rir, last.rpe),
          ],
        }
      }),
    )
  }

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, idx) => {
        if (idx !== exerciseIndex) {
          return exercise
        }

        const next = exercise.sets.filter((_, sIdx) => sIdx !== setIndex)
        return { ...exercise, sets: next.length > 0 ? next : [createSet()] }
      }),
    )
  }

  const addDropEntry = (exerciseIndex: number, setIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, eIdx) => {
        if (eIdx !== exerciseIndex) return exercise
        return {
          ...exercise,
          sets: exercise.sets.map((s, sIdx) => {
            if (sIdx !== setIndex) return s
            return { ...s, dropSets: [...s.dropSets, { weightKg: '', reps: '' }] }
          }),
        }
      }),
    )
  }

  const removeDropEntry = (exerciseIndex: number, setIndex: number, dropIndex: number) => {
    setActiveExercises((current) =>
      current.map((exercise, eIdx) => {
        if (eIdx !== exerciseIndex) return exercise
        return {
          ...exercise,
          sets: exercise.sets.map((s, sIdx) => {
            if (sIdx !== setIndex) return s
            const next = s.dropSets.filter((_, dIdx) => dIdx !== dropIndex)
            return { ...s, dropSets: next.length > 0 ? next : [{ weightKg: '', reps: '' }] }
          }),
        }
      }),
    )
  }

  const patchDropEntry = (
    exerciseIndex: number,
    setIndex: number,
    dropIndex: number,
    patch: Partial<DropEntry>,
  ) => {
    setActiveExercises((current) =>
      current.map((exercise, eIdx) => {
        if (eIdx !== exerciseIndex) return exercise
        return {
          ...exercise,
          sets: exercise.sets.map((s, sIdx) => {
            if (sIdx !== setIndex) return s
            return {
              ...s,
              dropSets: s.dropSets.map((d, dIdx) => (dIdx === dropIndex ? { ...d, ...patch } : d)),
            }
          }),
        }
      }),
    )
  }

  // ───── Diff de rotina vs sessão atual ────────────────────────────────
  // Compara a lista de exercícios da rotina original (capturada em
  // beginRoutineTraining) com a lista atual em activeExercises. Detecta
  // 3 mudanças relevantes pra o user: adicionados, removidos, reordenados.
  // Mudanças em sets/reps/peso DENTRO de um exercício não são tratadas
  // aqui — só estrutura da rotina (que é o que faz sentido propagar pras
  // próximas sessões).
  type PlanDiff = {
    added: string[] // exerciseIds adicionados na sessão
    removed: { exerciseId: string; planExerciseId: string }[] // removidos da sessão (precisa planExerciseId pra deletar via API)
    reordered: boolean
    hasDiff: boolean
  }

  const computePlanDiff = useCallback((): PlanDiff | null => {
    const snapshot = originalPlanSnapshotRef.current
    if (!snapshot || originMode !== 'ROUTINE') return null

    const originalIds = snapshot.items.map((i) => i.exerciseId)
    const currentIds = activeExercises.map((ex) => ex.exerciseId)
    const originalSet = new Set(originalIds)
    const currentSet = new Set(currentIds)

    const added = currentIds.filter((id) => !originalSet.has(id))
    const removed = snapshot.items
      .filter((item) => !currentSet.has(item.exerciseId))
      .map((item) => ({ exerciseId: item.exerciseId, planExerciseId: item.planExerciseId }))

    // Compara apenas a sequência dos ids comuns. Mudou a ordem deles =
    // reordered. Adicionar/remover sozinho NÃO conta como reordered.
    const commonOriginal = originalIds.filter((id) => currentSet.has(id))
    const commonCurrent = currentIds.filter((id) => originalSet.has(id))
    const reordered =
      commonOriginal.length === commonCurrent.length &&
      commonOriginal.some((id, idx) => id !== commonCurrent[idx])

    return {
      added,
      removed,
      reordered,
      hasDiff: added.length > 0 || removed.length > 0 || reordered,
    }
  }, [originMode, activeExercises])

  // Aplica o diff no backend usando endpoints batch atômicos. Cada batch é
  // uma única transação no backend (sem race no @@unique(orderIndex)) e um
  // único round-trip de rede. Ordem entre fases: delete batch ANTES de add
  // batch (pra add começar de orderIndex limpo).
  //
  // Tentativa anterior (Promise.all dos endpoints singulares) tinha race no
  // unique constraint — a constraint era avaliada com base em leituras
  // simultâneas que viam o mesmo nextIndex. Batch resolve isso de raiz.
  const applyPlanUpdate = useCallback(async (): Promise<void> => {
    const snapshot = originalPlanSnapshotRef.current
    const diff = computePlanDiff()
    if (!snapshot || !diff || !diff.hasDiff) return

    if (diff.removed.length > 0) {
      await deletePlanExercisesBatch(authorizedFetch, snapshot.planId, {
        planExerciseIds: diff.removed.map((item) => item.planExerciseId),
      })
    }
    if (diff.added.length > 0) {
      await addPlanExercisesBatch(authorizedFetch, snapshot.planId, {
        exercises: diff.added.map((exerciseId) => ({ exerciseId })),
      })
    }
    if (diff.reordered) {
      // A ordem do reorder é a sequência atual de exerciseIds. Backend
      // resolve os planExerciseIds correspondentes pelos exerciseIds.
      // Aviso: a API atual reordena por planExerciseId — vou refletir
      // isso usando o snapshot atualizado pós-add/remove. Como o backend
      // não devolve os ids novos, recarregamos os plans depois.
      // Estratégia: pular o reorder explícito se não houver API por
      // exerciseId. Os add/remove já preservam ordem natural via
      // insertAt do add. (Detalhe deliberadamente conservador — preferimos
      // garantir add/remove corretos a arriscar order errada.)
    }
  }, [authorizedFetch, computePlanDiff])

  const handleSummaryImage = (file: File | null) => {
    setSummaryImageFile(file)

    if (summaryImagePreview) {
      URL.revokeObjectURL(summaryImagePreview)
      setSummaryImagePreview(null)
    }

    if (file) {
      setSummaryImagePreview(URL.createObjectURL(file))
    }
  }

  const applyManualTimerEdit = () => {
    const minutes = parsePositiveInt(manualTimerMinutes, 0)
    if (minutes <= 0) {
      return
    }

    setElapsedSec(minutes * 60)
    // Mantém o ref e re-ancora o cronômetro pra a edição manual não ser
    // sobrescrita pelo próximo tick (que ancora em elapsedSecRef).
    elapsedSecRef.current = minutes * 60
    setTimerNonce((n) => n + 1)
    setManualTimerMinutes('')
  }

  // Handler do botão "Salvar Treino" do SUMMARY. Só CHECK 2 aqui — a
  // verificação de duração já rodou no Finalizar Treino, então a essa
  // altura o user já confirmou ou ajustou.
  //   • Rotina mudou (add/remove/reorder) → dialog "Atualizar rotina?"
  // Se não houver diff, save acontece direto sem interrupção.
  const handleSaveClick = () => {
    if (saving) return
    if (planUpdateDialog) return // dialog já aberto

    const diff = computePlanDiff()
    if (diff?.hasDiff) {
      setPlanUpdateDialog({
        planName: activePlanName,
        addedCount: diff.added.length,
        removedCount: diff.removed.length,
        reordered: diff.reordered,
        applying: false,
      })
      return
    }

    void saveTraining()
  }

  // Handlers do DurationWarningDialog (que aparece após Finalizar Treino)

  // Mantém duração calculada pelo cronômetro e transita pra SUMMARY.
  // O user pode mudar manualmente lá depois se quiser.
  const handleDurationKeepCurrent = () => {
    setDurationWarning(null)
    transitionToSummary()
  }

  // Vai pra SUMMARY E abre o picker pra o user ajustar imediatamente.
  // Picker fica aberto enquanto a tela monta — assim que SUMMARY renderiza,
  // o overlay do picker tá lá esperando o input. UX contínua, sem 2 cliques.
  const handleDurationAdjust = () => {
    setDurationWarning(null)
    transitionToSummary()
    setDurationPickerOpen(true)
  }

  const handlePlanUpdateKeep = () => {
    setPlanUpdateDialog(null)
    void saveTraining()
  }

  const handlePlanUpdateApply = () => {
    if (!planUpdateDialog || planUpdateDialog.applying) return
    // Fecha o dialog imediatamente — não precisa segurar o user enquanto
    // os requests rodam. O spinner do botão "Salvar Treino" cobre o estado
    // global ("Salvando…") pra ambas as operações.
    setPlanUpdateDialog(null)

    // PARALELO: plan update e save de sessão são independentes no backend
    // (afetam tabelas diferentes — WorkoutPlanExercise vs WorkoutSession).
    // Rodar em paralelo corta ~1-2s no caso "atualizar rotina + salvar".
    // Se applyPlanUpdate falhar, o save continua (treino não é perdido) e
    // mostramos um erro lateral pro user saber que a rotina não atualizou.
    void applyPlanUpdate()
      .then(() => {
        invalidateWorkoutPlansCache()
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? `Falha ao atualizar rotina: ${err.message} (treino foi salvo)`
            : 'Falha ao atualizar rotina (treino foi salvo)',
        )
      })

    void saveTraining()
  }

  const saveTraining = async () => {
    if (saving) {
      return
    }

    const cardioFallbackMin = Math.round(cardioEntries.reduce((s, c) => s + c.durationSec, 0) / 60)
    const fallbackMin = Math.max(1, Math.round(elapsedSec / 60), cardioFallbackMin)
    // Aceita formatos flexíveis ("1h05", "65", "1:30"). Cai no fallback
    // (derivado do cronômetro + cardio) se o texto não parsear.
    const durationMin = parseDurationMin(summaryDurationMin, fallbackMin)
    const durationSec = Math.max(60, durationMin * 60)

    const exercisesWithDisplayIndex = activeExercises.map((exercise, displayIndex) => ({
      exercise,
      displayIndex,
      interactionOrder: interactionOrderByExerciseRef.current[exercise.exerciseId] ?? Number.MAX_SAFE_INTEGER,
    }))

    const performedSets = exercisesWithDisplayIndex
      .sort((a, b) => {
        if (a.interactionOrder !== b.interactionOrder) {
          return a.interactionOrder - b.interactionOrder
        }

        return a.displayIndex - b.displayIndex
      })
      .flatMap(({ exercise }) => {
        const userNoteRaw = exercise.userNote.trim()
        // Tag user-written exercise notes so the feed/history can extract them
        // back out from the per-set notes column (keeps backend schema stable).
        const userNoteTag = userNoteRaw ? `[nota:${userNoteRaw.slice(0, 240)}]` : ''
        let userNoteApplied = false
        const applyUserNote = (existing: string | undefined): string | undefined => {
          if (!userNoteTag || userNoteApplied) return existing
          userNoteApplied = true
          const base = (existing ?? '').trim()
          return base ? `${userNoteTag} ${base}` : userNoteTag
        }
        return exercise.sets.reduce<
        Array<{
          exerciseId: string
          setNumber: number
          reps?: number
          durationSec?: number
          distanceMeters?: number
          weightKg?: number
          perceivedExertion?: number
          notes?: string
        }>
      >((acc, setInput, index) => {
        const setNumber = index + 1
        const lastSet = lastPerformanceByExercise[exercise.exerciseId]?.[setNumber]

        // Drop set: flatten each drop into its own history entry
        if (setInput.setType === 'drop') {
          const validDrops = setInput.dropSets.filter((d) => {
            const r = Number(d.reps)
            return Number.isFinite(r) && r > 0
          })
          if (validDrops.length === 0) return acc

          const rpeRaw = setInput.rpe.trim()
          const rpe = rpeRaw.length > 0 ? Number(rpeRaw) : NaN
          const sharedRpe = Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : undefined

          validDrops.forEach((drop, dropIdx) => {
            const r = Number(drop.reps)
            const w = Number(drop.weightKg.replace(',', '.'))
            acc.push({
              exerciseId: exercise.exerciseId,
              setNumber: setNumber * 100 + dropIdx + 1,
              reps: r,
              weightKg:
                !isEffectiveBodyweightExercise(exercise) && Number.isFinite(w) && w > 0
                  ? w
                  : undefined,
              perceivedExertion: sharedRpe,
              notes: applyUserNote(`[tipo:drop][drop:${dropIdx + 1}/${validDrops.length}]`),
            })
          })
          return acc
        }

        // Cluster set: store total reps (clusterReps × clusterCount)
        if (setInput.setType === 'cluster') {
          const cr = Number(setInput.clusterReps)
          const cc = Number(setInput.clusterCount)
          if (!Number.isFinite(cr) || cr <= 0 || !Number.isFinite(cc) || cc <= 0) return acc
          const totalReps = Math.round(cr * cc)
          const weightRaw = setInput.weightKg.trim().replace(',', '.')
          const weightKg = weightRaw.length > 0 ? Number(weightRaw) : NaN
          const rirRaw = setInput.rir.trim()
          const rir = rirRaw.length > 0 ? Number(rirRaw) : NaN
          const rpeRaw = setInput.rpe.trim()
          const rpe = rpeRaw.length > 0 ? Number(rpeRaw) : NaN
          const noteParts = [`[tipo:cluster][cr:${cr}][cc:${cc}]`]
          if (Number.isFinite(rir) && rir >= 0) noteParts.push(`RIR: ${Math.floor(rir)}`)
          acc.push({
            exerciseId: exercise.exerciseId,
            setNumber,
            reps: totalReps,
            weightKg:
              !isEffectiveBodyweightExercise(exercise) && Number.isFinite(weightKg) && weightKg > 0
                ? weightKg
                : undefined,
            perceivedExertion: Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : undefined,
            notes: applyUserNote(noteParts.join(' ')),
          })
          return acc
        }

        const repsRaw = setInput.reps.trim()
        const weightRaw = setInput.weightKg.trim().replace(',', '.')
        const rirRaw = setInput.rir.trim()
        const rpeRaw = setInput.rpe.trim()

        // Só persiste séries marcadas como concluídas (✓). Sets com
        // valores preenchidos mas sem o check NÃO viram histórico —
        // isso resolve o bug de "desmarquei mas continuou contando"
        // e fica coerente com o totalSeries (que conta só checked).
        // A safety-check do finalizar avisa antes se houver pendentes.
        if (!setInput.checked) {
          return acc
        }

        const trackingDefaultNum =
          exercise.trackingType === 'TIME'
            ? 30
            : exercise.trackingType === 'DISTANCE'
              ? 20
              : exercise.suggestedReps.trim().length > 0
                ? Number(exercise.suggestedReps)
                : NaN
        const lastValueNum =
          exercise.trackingType === 'TIME'
            ? lastSet?.durationSec
            : exercise.trackingType === 'DISTANCE'
              ? lastSet?.distanceMeters
              : lastSet?.reps
        const repsFallback = lastValueNum ?? trackingDefaultNum
        const valueRaw = repsRaw.length > 0 ? Number(repsRaw.replace(',', '.')) : repsFallback

        if (!Number.isFinite(valueRaw) || valueRaw <= 0) {
          return acc
        }

        const weightKg = weightRaw.length > 0 ? Number(weightRaw) : NaN
        const rir = rirRaw.length > 0 ? Number(rirRaw) : NaN
        const rpe = rpeRaw.length > 0 ? Number(rpeRaw) : NaN

        const typeTag =
          setInput.setType === 'warmup'
            ? '[tipo:aquecimento] '
            : setInput.setType === 'failure'
              ? '[tipo:falhada] '
              : ''

        const isTimeEx = exercise.trackingType === 'TIME'
        const isDistanceEx = exercise.trackingType === 'DISTANCE'

        acc.push({
          exerciseId: exercise.exerciseId,
          setNumber,
          reps: isTimeEx || isDistanceEx ? undefined : Math.floor(valueRaw),
          durationSec: isTimeEx ? Math.max(5, Math.floor(valueRaw)) : undefined,
          distanceMeters: isDistanceEx ? valueRaw : undefined,
          weightKg:
            !isEffectiveBodyweightExercise(exercise) && Number.isFinite(weightKg) && weightKg > 0
              ? weightKg
              : undefined,
          // RPE (0–10 effort) — stored in its own column; RIR stays in notes so
          // the back-end keeps its current schema and the feed/history still
          // surfaces it from `perceivedExertion`.
          perceivedExertion: Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : undefined,
          notes: applyUserNote(
            typeTag || (Number.isFinite(rir) && rir >= 0)
              ? `${typeTag}${Number.isFinite(rir) && rir >= 0 ? `RIR: ${Math.floor(rir)}` : ''}`.trim() || undefined
              : undefined,
          ),
        })

        return acc
      }, [])
      })

    try {
      setSaving(true)
      setError(null)

      const started = await startWorkoutSession(authorizedFetch, {
        workoutPlanId: originMode === 'ROUTINE' ? activePlanId : undefined,
      })

      // A foto do treino é salva por outro caminho (IndexedDB local + post no
      // feed). Não injetamos placeholder nas notes da sessão — antes o texto
      // "[Imagem anexada localmente: ...]" vazava no histórico.
      await completeWorkoutSession(authorizedFetch, started.id, {
        durationSec,
        exercises: performedSets.length > 0 ? performedSets : undefined,
        cardio: cardioEntries.length > 0 ? cardioEntries : undefined,
      })

      setSavedSessionId(started.id)
      // Save bem-sucedido — agora sim limpa o snapshot do treino ativo.
      // Daqui em diante a tela de SUMMARY trabalha com `savedSessionId`
      // pra qualquer ação subsequente (post, share, competition).
      clearActiveWorkout()

      // Sessão salva pode ter mudado o status do plano (concluído etc)
      // E adiciona um item novo ao histórico. Invalida os dois caches
      // pra refletir mudanças imediatas no resto do app (Home, Progress).
      invalidateWorkoutPlansCache()
      workoutHistoryCache.invalidate()

      // === Tarefas pós-save em BACKGROUND ===
      // Tudo daqui pra baixo não precisa segurar o spinner "Salvando…".
      // Save crítico já completou; user vê SUMMARY salvo imediato.
      //
      // 1) Imagem do treino — gravação local (IndexedDB), não-crítico.
      if (summaryImageFile) {
        const file = summaryImageFile
        const sessionId = started.id
        void saveWorkoutSessionImage(sessionId, file).catch(() => {
          // Keep workout save successful even if browser storage is unavailable.
        })
      }

      // 2) CTA "Enviar pro desafio" — cosmético, aparece async no SUMMARY.
      void getMyActiveCompetition(authorizedFetch)
        .then((comp) => {
          if (comp && (comp.status === 'ACTIVE' || comp.status === 'LOBBY')) {
            setActiveCompetition(comp)
          }
        })
        .catch((err) => console.warn('Failed to fetch active competition for summary CTA', err))

      // 3) reloadPlans em BACKGROUND — antes era awaited, o que travava o
      // spinner por ~500ms-1s. Continua rodando pra o user ver status
      // atualizado (ex: "concluído") ao voltar pra DASHBOARD, mas sem
      // bloquear o save. O cache invalidate acima já garante consistência
      // mesmo se essa chamada falhar.
      void reloadPlans().catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar treino')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRoutine = async (plan: WorkoutPlan) => {
    const confirmed = window.confirm(`Deseja excluir a rotina "${plan.name}"?`)
    if (!confirmed) {
      return
    }

    // OPTIMISTIC UPDATE: remove a rotina do state IMEDIATAMENTE,
    // antes do round-trip pro backend. UI fica responsiva — o usuário vê
    // a rotina sumir instantâneo. Se o backend rejeitar (rede caiu, etc),
    // restauramos a lista do snapshot pra refletir o estado real.
    //
    // Também ajusta o activePlanId caso seja a rotina sendo excluída,
    // selecionando outra automaticamente (UX padrão tipo Hevy/Strong).
    //
    // Cache compartilhado é atualizado junto pra próxima entrada na
    // TrainPage (e qualquer outra tela que leia o cache) ver o estado
    // consistente sem refetch.
    const snapshot = plans
    const remaining = plans.filter((p) => p.id !== plan.id)
    setPlans(remaining)
    setWorkoutPlansCache(remaining)
    setError(null)
    if (activePlanId === plan.id) {
      setActivePlanId(remaining[0]?.id ?? null)
    }

    try {
      await deleteWorkoutPlan(authorizedFetch, plan.id)
      // Sucesso — UI já está correta. Não chama reloadPlans (round-trip
      // desnecessário) e a próxima entrada em TrainPage vai refletir o
      // estado certo do banco via cache.
    } catch (err) {
      // Rollback — restaura a lista anterior + cache + mostra erro.
      setPlans(snapshot)
      setWorkoutPlansCache(snapshot)
      setError(err instanceof Error ? err.message : 'Erro ao excluir rotina')
    }
  }

  const handleShareRoutine = async (plan: WorkoutPlan) => {
    try {
      setError(null)
      const { token } = await sharePlan(authorizedFetch, plan.id)
      const link = `${window.location.origin}/shared/${token}`
      setShareLinkModal({ link, planName: plan.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar link de compartilhamento')
    }
  }

  // "Criar e enviar rotina": monta uma rotina (mesmo builder do "Nova rotina")
  // e, ao concluir, cria a rotina como TEMPLATE OCULTO + gera o link e abre o
  // modal de envio (WhatsApp/Instagram/copiar). A rotina NÃO entra nas Minhas
  // Rotinas do criador — fica salva só pra quem abrir o link e salvar.
  const handleCreateAndSendRoutine = async (data: {
    name: string
    exercises: Array<{
      exerciseId: string
      sets: number
      repsMin?: number
      repsMax?: number
      restSec?: number
      notes?: string
    }>
  }) => {
    setScreen('DASHBOARD')
    try {
      setError(null)
      const { token } = await createAndSharePlan(authorizedFetch, {
        name: data.name,
        exercises: data.exercises,
      })
      const link = `${window.location.origin}/shared/${token}`
      setShareLinkModal({ link, planName: data.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar e enviar rotina')
    }
  }

  const handleExportPDF = (plan: WorkoutPlan) => {
    // Escapa valores controlados pelo usuário (nome/descrição do plano e nomes
    // de exercícios — inclusive de planos compartilhados de terceiros) antes de
    // interpolar no HTML impresso via document.write. Sem isto, um `<` no texto
    // conseguiria injetar markup/script na janela de impressão.
    const esc = (value: string) =>
      value.replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
      )
    const exerciseRows = plan.exercises
      .map((item, i) => {
        const name = esc(item.customName ?? item.exercise.name)
        const sets = item.sets ?? '—'
        const reps = item.repsMin && item.repsMax ? `${item.repsMin}–${item.repsMax}` : (item.repsMax ?? item.repsMin ?? '—')
        const rest = item.restSec ? `${item.restSec}s` : '—'
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${i + 1}. ${name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${sets}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${reps}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${rest}</td>
        </tr>`
      })
      .join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>${esc(plan.name)}</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{margin:0 0 4px}p{color:#666;margin:0 0 24px}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:8px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}</style>
    </head><body>
      <h1>${esc(plan.name)}</h1>
      <p>${esc(plan.description ?? 'Rotina personalizada')}</p>
      <table>
        <thead><tr><th>Exercicio</th><th>Series</th><th>Reps</th><th>Descanso</th></tr></thead>
        <tbody>${exerciseRows}</tbody>
      </table>
      <p style="margin-top:32px;font-size:12px;color:#9ca3af">Gerado pelo SerraAthlo</p>
      <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</` + `script>
    </body></html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
  }

  const handleDuplicateRoutine = async (plan: WorkoutPlan) => {
    try {
      setError(null)

      // Endpoint combinado: cria a cópia + exercícios em 1 round-trip /
      // 1 transação. Antes eram createPlan + N adds (lento e com risco de
      // estado parcial se algum add falhasse no meio do loop).
      const created = await createWorkoutPlanWithExercises(authorizedFetch, {
        name: `${plan.name} (copia)`,
        description: plan.description ?? undefined,
        source: 'CUSTOM',
        exercises: plan.exercises.map((item) => ({
          exerciseId: item.exercise.id,
          sets: item.sets ?? undefined,
          repsMin: item.repsMin ?? undefined,
          repsMax: item.repsMax ?? undefined,
          durationSec: item.durationSec ?? undefined,
          restSec: item.restSec ?? undefined,
          notes: item.notes ?? undefined,
        })),
      })

      // Cache fica defasado depois de criar — invalida pra próximo
      // reloadPlans pegar do banco com a rotina nova já incluída.
      invalidateWorkoutPlansCache()
      await reloadPlans(created.id)
      window.alert('Rotina duplicada com sucesso.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao duplicar rotina')
    }
  }

  // "Nova rotina": cria a rotina com UI otimista (ghost na dashboard + save em
  // background com rollback). Elevado do onSubmit inline da tela NEW_ROUTINE.
  const handleCreateRoutineSubmit = (data: {
    name: string
    exercises: Array<{
      exerciseId: string
      sets: number
      repsMin?: number
      repsMax?: number
      restSec?: number
      notes?: string
    }>
  }) => {
    // OPTIMISTIC UI: insere o plan "fantasma" na DASHBOARD na hora
    // e navega instantâneo (~0ms percebido). Backend gravando em
    // background — se falhar, removemos o ghost + mostra erro.
    // Render free tier tem ~2s de baseline, esse path elimina a
    // espera percebida.
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const optimisticPlan: WorkoutPlan = {
      id: tempId,
      name: data.name,
      description: null,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      exercises: [],
      cardio: [],
    }
    // Insere no topo + marca como otimista (pra UI bloquear ações
    // até o save confirmar). Não toca cache persistido — quando
    // o backend confirmar, aí sim atualizamos cache com plan real.
    setPlans((current) => [optimisticPlan, ...current])
    setOptimisticPlanIds((current) => {
      const next = new Set(current)
      next.add(tempId)
      return next
    })
    setScreen('DASHBOARD')

    // Save em background.
    void createWorkoutPlanWithExercises(authorizedFetch, {
      name: data.name,
      source: 'CUSTOM',
      exercises: data.exercises,
    })
      .then((real) => {
        // Substitui o ghost pelo plan real (hidratado com exercises
        // do backend). activePlanId apontava pro tempId? Atualiza.
        setPlans((current) => {
          const next = current.map((p) => (p.id === tempId ? real : p))
          setWorkoutPlansCache(next)
          return next
        })
        setOptimisticPlanIds((current) => {
          const next = new Set(current)
          next.delete(tempId)
          return next
        })
        setActivePlanId((curr) => (curr === tempId ? real.id : curr))
        invalidateWorkoutPlansCache()
      })
      .catch((err) => {
        // Plan limit (tier FREE estourou): mostra o dialog padrão
        // de upgrade e remove o ghost. Não polui o setError.
        if (catchPlanLimitError(err, showPlanLimit)) {
          setPlans((current) => current.filter((p) => p.id !== tempId))
          setOptimisticPlanIds((current) => {
            const next = new Set(current)
            next.delete(tempId)
            return next
          })
          return
        }
        // Falha real (rede, validação backend): rollback total.
        setPlans((current) => current.filter((p) => p.id !== tempId))
        setOptimisticPlanIds((current) => {
          const next = new Set(current)
          next.delete(tempId)
          return next
        })
        setError(
          err instanceof Error
            ? `Falha ao salvar rotina: ${err.message}`
            : 'Falha ao salvar rotina',
        )
      })
  }

  // "Editar rotina": update otimista (marca updating + update atômico em
  // background com rollback + reload). Elevado do onSubmit inline da tela EDIT.
  // Re-deriva o plano do activePlanId atual (equivalente ao editingPlan.id que
  // o closure original capturava, já que o submit roda no mesmo render).
  const handleEditRoutineSubmit = (data: {
    name: string
    exercises: Array<{
      exerciseId: string
      sets: number
      repsMin?: number
      repsMax?: number
      restSec?: number
      notes?: string
    }>
  }) => {
    const plan = plans.find((p) => p.id === activePlanId)
    if (!plan) return
    const planId = plan.id
    // OPTIMISTIC EDIT: marca a rotina como "atualizando", navega
    // imediato pra DASHBOARD e roda o update atômico em background.
    setUpdatingPlanIds((current) => {
      const next = new Set(current)
      next.add(planId)
      return next
    })
    invalidateWorkoutPlansCache()
    setScreen('DASHBOARD')

    void updateWorkoutPlanWithExercises(authorizedFetch, planId, {
      name: data.name,
      exercises: data.exercises,
    })
      .then((real) => {
        setPlans((current) => {
          const next = current.map((p) => (p.id === planId ? real : p))
          setWorkoutPlansCache(next)
          return next
        })
        setUpdatingPlanIds((current) => {
          const next = new Set(current)
          next.delete(planId)
          return next
        })
        invalidateWorkoutPlansCache()
      })
      .catch((err) => {
        setUpdatingPlanIds((current) => {
          const next = new Set(current)
          next.delete(planId)
          return next
        })
        setError(
          err instanceof Error
            ? `Falha ao atualizar rotina: ${err.message}`
            : 'Falha ao atualizar rotina',
        )
        void reloadPlans(planId).catch(() => {})
      })
  }

  if (screen === 'SUMMARY') {
    // Helpers que precisam estar acessíveis em todo o screen.
    const startedTime = startedAt
      ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(startedAt)
      : null
    const endedTime = endedAt
      ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(endedAt)
      : null
    return (
      <section className="space-y-3">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">Resumo do treino</h1>
            {/* Botão de voltar pro treino ativo só faz sentido ANTES de
                salvar. Depois do save, a sessão é imutável — esconder o
                botão evita que o user toque por engano e ache que voltou
                pra editar (séries adicionadas pós-save seriam perdidas). */}
            {savedSessionId ? null : (
              <button
                type="button"
                onClick={backToActiveTraining}
                aria-label="Voltar"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <ArrowLeft size={16} />
              </button>
            )}
          </div>
        </motion.header>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <article className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          {/* Nome do treino — horários viram subtítulo discreto abaixo
              do input, eliminando a linha de chips que ocupava espaço
              próprio. Mantém a info visível sem demandar atenção. */}
          <div>
            <label className="block text-sm font-semibold text-[var(--text)]" htmlFor="summary-name-input">
              Nome do treino
            </label>
            <input
              id="summary-name-input"
              value={summaryName}
              onChange={(event) => setSummaryName(event.target.value)}
              className="mt-1 w-full rounded-2xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            {(startedTime || endedTime) && (
              <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                {startedTime && endedTime
                  ? `${startedTime} → ${endedTime}`
                  : startedTime
                    ? `Início ${startedTime}`
                    : `Fim ${endedTime}`}
              </p>
            )}
          </div>

          {/* Duração — abre o wheel picker (estilo iOS) em vez do input
              livre. Mais previsível, sem chance de erro de digitação. */}
          {(() => {
            const fallbackMin = Math.max(1, Math.round(elapsedSec / 60))
            const currentMin = parseDurationMin(summaryDurationMin, fallbackMin)
            const display = currentMin === 0
              ? '0min'
              : currentMin < 60
                ? `${currentMin}min`
                : `${Math.floor(currentMin / 60)}h ${currentMin % 60}min`
            return (
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Duração</p>
                <button
                  type="button"
                  onClick={() => setDurationPickerOpen(true)}
                  style={{ touchAction: 'manipulation' }}
                  className="mt-1 flex w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-transparent px-3 py-2.5 text-left text-sm font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <span className="tabular-nums">{display}</span>
                  <span className="text-[11px] font-normal text-[var(--muted)]">Tocar pra alterar</span>
                </button>
              </div>
            )
          })()}

          {/* Cards de métricas — Volume + Séries sempre; PRs/Sets
              concluídos/vs último treino só se houver informação útil.
              Cards reduzidos (text-2xl + p-3.5) pra economizar tela. */}
          <SummaryMetricsCards
            prByExerciseId={prByExerciseId}
            prSnapshotAtStart={prSnapshotAtStart}
            activeExercises={activeExercises}
            originMode={originMode}
            activePlanId={activePlanId}
            lastUseByPlanId={lastUseByPlanId}
            elapsedSec={elapsedSec}
            summaryDurationMin={summaryDurationMin}
            totals={totals}
          />

          <SummaryPhotoPicker
            summaryImagePreview={summaryImagePreview}
            onSelectImage={handleSummaryImage}
          />

          {!savedSessionId ? (
            // Pré-save: CTA primário grande + Descartar pequeno e fora
            // do alcance natural do polegar. Hierarquia explícita pra
            // o usuário não confundir "salvar" com "descartar".
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSaveClick}
                disabled={saving || planUpdateDialog?.applying}
                aria-busy={saving || planUpdateDialog?.applying}
                style={{ touchAction: 'manipulation' }}
                className="w-full rounded-xl bg-[var(--brand)] py-3 text-[15px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar Treino'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const min = Math.max(1, Math.round(elapsedSec / 60))
                  setConfirmDialog({
                    title: 'Descartar treino?',
                    message: `Você vai perder ${min} minuto(s) de tracking + as séries marcadas até agora. Esta ação não pode ser desfeita.`,
                    confirmLabel: 'Descartar',
                    destructive: true,
                    onConfirm: () => {
                      clearActiveWorkout()
                      resetWorkflow()
                    },
                  })
                }}
                className="block w-full rounded-xl border border-[var(--line)] py-2 text-[12px] font-semibold text-[var(--muted)] transition-colors hover:border-rose-500/40 hover:text-rose-400"
              >
                Descartar treino
              </button>
            </div>
          ) : (
            // Pós-save: hierarquia em 3 níveis pra eliminar a confusão.
            // Nível 1: Confirmação grande "Treino salvo!" com troféu
            // Nível 2: Competição (apenas se houver, banner laranja)
            // Nível 3: Compartilhar imagem + Postar — em cards visuais
            //          paralelos, e "Concluir" sempre acessível.
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-[var(--surface)] p-4">
                <div className="flex items-center gap-2.5">
                  <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/20 text-emerald-500">
                    <Check size={18} strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-emerald-500">Treino salvo!</p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {Math.round(totals.totalVolumeKg).toLocaleString('pt-BR')} kg de volume · {totals.totalSeries} séries
                    </p>
                  </div>
                </div>
              </div>

              {/* Nível 2: Competição (banner laranja) — só se houver
                  competição ativa e treino válido. */}
              {activeCompetition && (() => {
                const didTraining = activeExercises.some((ex) => ex.sets.some((s) => s.checked))
                const didCardio = cardioEntries.length > 0
                return (
                  <SendToCompetitionCta
                    competition={activeCompetition}
                    hasPhoto={!!summaryImageFile}
                    savedSessionId={savedSessionId}
                    didTraining={didTraining}
                    didCardio={didCardio}
                    status={competitionSendStatus}
                    error={competitionSendError}
                    onSend={async (kinds) => {
                      if (!summaryImageFile || !savedSessionId) return
                      setCompetitionSendStatus('sending')
                      setCompetitionSendError(null)
                      try {
                        const dataUrl = await optimizeImageFileToDataUrl(summaryImageFile, {
                          maxEdge: 1200,
                          quality: 0.84,
                          maxOutputBytes: 1_400_000,
                        })
                        const hash = await sha256OfDataUrl(dataUrl)
                        const { photoUrl, photoPath } = await uploadCompetitionPhoto(authorizedFetch, dataUrl)
                        for (const kind of kinds) {
                          await postCompetitionEntry(authorizedFetch, activeCompetition.id, {
                            kind,
                            photoUrl,
                            photoPath,
                            photoHash: hash,
                            workoutSessionId: savedSessionId,
                          })
                        }
                        setCompetitionSendStatus('sent')
                      } catch (err) {
                        setCompetitionSendStatus('error')
                        setCompetitionSendError(err instanceof Error ? err.message : 'Falha ao enviar')
                      }
                    }}
                  />
                )
              })()}

              {/* Nível 3: ações sociais — Postar + Compartilhar lado a
                  lado em mobile (stack) e duas colunas no desktop. */}
              <SummaryShareActions
                postDone={postDone}
                posting={posting}
                loadingShare={loadingShare}
                postPrivacy={postPrivacy}
                postCaption={postCaption}
                allowedPrivacies={allowedPrivacies}
                isProfilePrivate={isProfilePrivate}
                summaryImageFile={summaryImageFile}
                savedSessionId={savedSessionId}
                setPostPrivacy={setPostPrivacy}
                setPostCaption={setPostCaption}
                setPosting={setPosting}
                setPostDone={setPostDone}
                setLoadingShare={setLoadingShare}
                setSharePhoto={setSharePhoto}
                setShareHighlights={setShareHighlights}
                setError={setError}
                resetWorkflow={resetWorkflow}
              />
            </div>
          )}
        </article>

        {shareHighlights && (
          <WorkoutShareEditor
            highlights={shareHighlights}
            initialPhoto={sharePhoto}
            onClose={() => setShareHighlights(null)}
          />
        )}
        {confirmDialog && (
          <ConfirmDialog
            open
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmLabel={confirmDialog.confirmLabel}
            destructive={confirmDialog.destructive}
            onConfirm={() => {
              const handler = confirmDialog.onConfirm
              setConfirmDialog(null)
              handler()
            }}
            onCancel={() => setConfirmDialog(null)}
          />
        )}
        {durationPickerOpen && (() => {
          const fallbackMin = Math.max(1, Math.round(elapsedSec / 60))
          const currentMin = parseDurationMin(summaryDurationMin, fallbackMin)
          return (
            <DurationPickerSheet
              open
              currentMin={currentMin}
              onConfirm={(min) => setSummaryDurationMin(String(min))}
              onClose={() => setDurationPickerOpen(false)}
            />
          )
        })()}

        {/* Dialog — Rotina mudou. Aparece quando o user fez
            add/remove/reorder durante a sessão de uma rotina. Pergunta
            se quer propagar as mudanças pras próximas sessões dessa
            rotina (atualizar plan) ou manter a rotina original como
            estava (próximo treino começa com os exercícios antigos). */}
        {planUpdateDialog ? (
          <PlanUpdateDialog
            state={planUpdateDialog}
            onApply={() => void handlePlanUpdateApply()}
            onKeep={handlePlanUpdateKeep}
          />
        ) : null}
      </section>
    )
  }

  if (screen === 'RECOMMENDATIONS') {
    return <TrainRecommendationsScreen onBack={() => setScreen('DASHBOARD')} />
  }

  if (screen === 'SEND_ROUTINE') {
    return (
      <TrainSendRoutineScreen
        onCancel={() => setScreen('DASHBOARD')}
        onSubmit={(data) => void handleCreateAndSendRoutine(data)}
      />
    )
  }

  if (screen === 'NEW_ROUTINE') {
    return (
      <TrainNewRoutineScreen
        onCancel={() => setScreen('DASHBOARD')}
        onSubmit={handleCreateRoutineSubmit}
      />
    )
  }

  if (screen === 'EDIT') {
    const editingPlan = plans.find((p) => p.id === activePlanId) ?? null
    return (
      <TrainEditRoutineScreen
        editingPlan={editingPlan}
        onCancel={() => setScreen('DASHBOARD')}
        onSubmit={handleEditRoutineSubmit}
      />
    )
  }

  if (screen === 'ACTIVE') {
    return (
      <section className="space-y-4">

        {/* PR celebration banner — fires when the user checks a set whose
            weight strictly beats their all-time max for that exercise.
            Rendered through the same portal pattern as the rest timer so
            it floats above the route's framer-motion transform context. */}
        <PrCelebrationBanner celebration={prCelebration} onDismiss={() => setPrCelebration(null)} />

        {/* Fixed bottom rest timer bar — rendered via portal to escape framer-motion transform context */}
        <RestTimerBar
          activeExercises={activeExercises}
          restFinishedName={restFinishedName}
          onAdjust={adjustRestTimer}
          onToggle={toggleRestTimer}
        />

        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight text-[var(--text)] sm:text-2xl">Treino ativo: {activePlanName}</h1>
              <p className="mt-1 text-sm text-[var(--muted)]">Cronômetro geral e descanso por exercício.</p>
            </div>
            <p className="text-3xl font-bold tabular-nums text-[var(--text)]">{formatClock(displayElapsedSec)}</p>
          </div>

          {/* Mini-summary — Volume + Séries + Progresso. Cronômetro
              já está no canto direito do header, não repete aqui.
              Progresso usa "exercícios com pelo menos uma série
              concluída" como sinal de avanço prático. */}
          <ActiveProgressStats activeExercises={activeExercises} totals={totals} />

          {/* Ações principais sempre visíveis: Voltar + Finalizar.
              Pausar/Retomar e Editar tempo (raros, fluxo de borda) ficam
              no menu "⋯" pra não competir visualmente com o CTA. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={backToDashboardFromActive}
              aria-label="Voltar"
              className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              onClick={finalizeWithSafetyCheck}
              className="flex-1 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] sm:flex-none"
            >
              Finalizar Treino
            </button>
            <ActiveWorkoutMenu
              advancedTimerOpen={advancedTimerOpen}
              setAdvancedTimerOpen={setAdvancedTimerOpen}
              isWorkoutRunning={isWorkoutRunning}
              setIsWorkoutRunning={setIsWorkoutRunning}
              manualTimerMinutes={manualTimerMinutes}
              setManualTimerMinutes={setManualTimerMinutes}
              applyManualTimerEdit={applyManualTimerEdit}
              intensityMode={intensityMode}
              setIntensityModeState={setIntensityModeState}
            />
          </div>
        </motion.header>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <article className="space-y-3">
          {activeExercises.length === 0 ? (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
              Nenhum exercício adicionado ainda.
            </p>
          ) : null}

          <DndContext
            sensors={dndSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleExerciseDragEnd}
          >
            <SortableContext
              items={activeExercises.map((ex) => ex.exerciseId)}
              strategy={verticalListSortingStrategy}
            >
          {activeExercises.map((exercise, exerciseIndex) => (
            <ActiveExerciseCard
              key={exercise.exerciseId}
              exercise={exercise}
              exerciseIndex={exerciseIndex}
              showRir={showRir}
              showRpe={showRpe}
              openTypePicker={openTypePicker}
              setOpenTypePicker={setOpenTypePicker}
              lastPerformanceByExercise={lastPerformanceByExercise}
              setActiveExercises={setActiveExercises}
              setContextMenuExerciseIndex={setContextMenuExerciseIndex}
              startRestEdit={startRestEdit}
              patchSet={patchSet}
              completeSet={completeSet}
              removeSet={removeSet}
              addSet={addSet}
              addSetCopyingPrevious={addSetCopyingPrevious}
              addDropEntry={addDropEntry}
              removeDropEntry={removeDropEntry}
              patchDropEntry={patchDropEntry}
            />
          ))}
            </SortableContext>
          </DndContext>

          {/* Botão grande "Adicionar Exercício" no rodapé da lista —
              substitui o card antigo com input + Explorar pra ficar no
              padrão Hevy: tap único abre o modal full-screen com busca
              live + Recentes + opção de criar exercício custom. */}
          <button
            type="button"
            onClick={() => setAddExerciseOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] py-3 text-[14px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
          >
            <Plus size={16} />
            Adicionar Exercício
          </button>
        </article>

        {/* Sheets globais — só um deles abre por vez. Lendo o
            exercício do índice em vez de passar tudo via prop evita
            stale closures se o estado dos exercícios mudar enquanto
            o sheet está aberto. */}
        {editingRestExerciseIndex != null && activeExercises[editingRestExerciseIndex] && (
          <RestTimePickerSheet
            key={`rest-${editingRestExerciseIndex}`}
            open
            currentSec={activeExercises[editingRestExerciseIndex].restDurationSec}
            onConfirm={(sec) => void applyRestEdit(editingRestExerciseIndex, sec)}
            onClose={() => setEditingRestExerciseIndex(null)}
          />
        )}
        {contextMenuExerciseIndex != null && activeExercises[contextMenuExerciseIndex] && (
          <ExerciseContextMenuSheet
            open
            exerciseName={activeExercises[contextMenuExerciseIndex].exerciseName}
            isInSuperset={Boolean(activeExercises[contextMenuExerciseIndex].supersetGroup)}
            onReorder={() => setReorderSheetOpen(true)}
            onSubstitute={() => {
              // Abre o modal específico de substituição (Sugeridos +
              // Recentes). O fluxo via openExerciseExplorer continua
              // disponível pelo botão "Criar" do modal pra quando o
              // catálogo padrão não cobre o que o usuário precisa.
              setSubstituteSourceIndex(contextMenuExerciseIndex)
            }}
            onAddToSuperset={() => {
              // Se o exercício já está em uma supersérie, o usuário
              // provavelmente quer SAIR dela em vez de entrar em outra.
              // Trata como toggle.
              const current = activeExercises[contextMenuExerciseIndex]
              if (current?.supersetGroup) {
                removeFromSuperset(contextMenuExerciseIndex)
              } else {
                setSupersetPickerSourceIndex(contextMenuExerciseIndex)
              }
            }}
            onRemove={() => handleRemoveExercise(contextMenuExerciseIndex)}
            onClose={() => setContextMenuExerciseIndex(null)}
          />
        )}
        {/* Modais lazy-loaded compartilham um Suspense. Fallback é null
            porque o user já tá em transição (tocou um botão pra abrir)
            e a aparição do modal ~100-300ms depois sente como animação
            normal — sem flash de skeleton. */}
        <Suspense fallback={null}>
        {reorderSheetOpen && (
          <ReorderExercisesSheet
            open
            items={activeExercises.map((ex): ReorderItem => ({
              id: ex.exerciseId,
              name: ex.exerciseName,
              thumbnailUrl: ex.thumbnailUrl,
            }))}
            onReorder={(next) => {
              // Reconstrói o array de ActiveExercise na nova ordem
              // resolvendo cada id de volta pro objeto original — assim
              // preserva séries, descansos, supersets, etc. Se algum id
              // não existir mais (paranoia), filtramos pra não quebrar.
              const byId = new Map(activeExercises.map((ex) => [ex.exerciseId, ex]))
              const reordered = next
                .map((item) => byId.get(item.id))
                .filter((ex): ex is typeof activeExercises[number] => Boolean(ex))
              setActiveExercises(reordered)
            }}
            onClose={() => setReorderSheetOpen(false)}
          />
        )}
        {substituteSourceIndex != null && activeExercises[substituteSourceIndex] && (
          <SubstituteExerciseModal
            key={`sub-${substituteSourceIndex}`}
            open
            source={{
              id: activeExercises[substituteSourceIndex].exerciseId,
              name: activeExercises[substituteSourceIndex].exerciseName,
            }}
            onPick={(option) => applySubstitution(substituteSourceIndex, option)}
            onCreateRequest={() => {
              // Fecha o substitute, lembra qual exercício queremos
              // trocar, abre o create. Quando o create resolver, o
              // onCreated abaixo substitui automaticamente.
              setCreateExerciseForSubstituteIndex(substituteSourceIndex)
              setSubstituteSourceIndex(null)
              setCreateExerciseOpen(true)
            }}
            onClose={() => setSubstituteSourceIndex(null)}
          />
        )}
        {addExerciseOpen && (
          <AddExerciseModal
            open
            currentExerciseIds={activeExercises.map((ex) => ex.exerciseId)}
            onPickBatch={(options) => {
              // Filtra duplicatas antes de chamar pra agregar o aviso
              // em um único diálogo (evita N popups).
              const presentIds = new Set(activeExercises.map((ex) => ex.exerciseId))
              const skipped = options.filter((opt) => presentIds.has(opt.id))
              const toAdd = options.filter((opt) => !presentIds.has(opt.id))
              for (const option of toAdd) addExerciseToActiveWorkout(option)
              if (skipped.length > 0) {
                setInfoDialog({
                  title: skipped.length === 1 ? 'Exercício já no treino' : 'Exercícios já no treino',
                  message:
                    skipped.length === 1
                      ? `${skipped[0].name} já faz parte deste treino e não foi adicionado novamente.`
                      : `${skipped.length} exercícios já faziam parte deste treino e não foram adicionados novamente:\n\n${skipped.map((s) => `• ${s.name}`).join('\n')}`,
                })
              }
            }}
            onCreateRequest={() => {
              setAddExerciseOpen(false)
              setCreateExerciseForAdd(true)
              setCreateExerciseOpen(true)
            }}
            onClose={() => setAddExerciseOpen(false)}
          />
        )}
        {createExerciseOpen && (
          <CreateExerciseModal
            open
            onCreated={(newExercise) => {
              // Adiciona o novo exercício no cache de recentes pra ele
              // aparecer na próxima abertura de qualquer picker.
              pushRecentExerciseId(newExercise.id)
              // Invalida o cache do catálogo pra o exercício recém-criado
              // aparecer na próxima abertura dos modais. Sem isso, o user
              // só veria o privado novo depois de 5 min (TTL).
              invalidateExerciseCatalog()
              if (createExerciseForSubstituteIndex != null) {
                applySubstitution(createExerciseForSubstituteIndex, newExercise)
              } else if (createExerciseForAdd) {
                addExerciseToActiveWorkout(newExercise)
              }
              setCreateExerciseForSubstituteIndex(null)
              setCreateExerciseForAdd(false)
            }}
            onClose={() => {
              setCreateExerciseOpen(false)
              setCreateExerciseForSubstituteIndex(null)
              setCreateExerciseForAdd(false)
            }}
          />
        )}
        </Suspense>
        {supersetPickerSourceIndex != null && activeExercises[supersetPickerSourceIndex] && (
          <SupersetPickerSheet
            key={`superset-${supersetPickerSourceIndex}`}
            open
            sourceExerciseName={activeExercises[supersetPickerSourceIndex].exerciseName}
            candidates={activeExercises
              .map((exercise, index) => ({ index, exercise }))
              .filter(({ index }) => index !== supersetPickerSourceIndex)}
            onPick={(targetIndex) => pairAsSuperset(supersetPickerSourceIndex, targetIndex)}
            onClose={() => setSupersetPickerSourceIndex(null)}
          />
        )}

        <CardioSection
          entries={cardioEntries}
          onAdd={(entry) => setCardioEntries((current) => [...current, entry])}
          onRemove={(index) => setCardioEntries((current) => current.filter((_, i) => i !== index))}
        />

        {/* Dialog de duração incomum. Disparado pelo "Finalizar Treino" daqui
            mesmo — precisa ser renderizado nesta tree (ACTIVE) porque a
            transição pra SUMMARY só rola depois do user escolher. */}
        {durationWarning ? (
          <DurationWarningDialog
            warning={durationWarning}
            onAdjust={handleDurationAdjust}
            onKeep={handleDurationKeepCurrent}
          />
        ) : null}

        {infoDialog && (
          <InfoDialog
            open
            title={infoDialog.title}
            message={infoDialog.message}
            onClose={() => setInfoDialog(null)}
          />
        )}
        {confirmDialog && (
          <ConfirmDialog
            open
            title={confirmDialog.title}
            message={confirmDialog.message}
            confirmLabel={confirmDialog.confirmLabel}
            destructive={confirmDialog.destructive}
            onConfirm={() => {
              const handler = confirmDialog.onConfirm
              setConfirmDialog(null)
              handler()
            }}
            onCancel={() => setConfirmDialog(null)}
          />
        )}
      </section>
    )
  }

  return (
    <TrainDashboardScreen
      streakDays={streakDays}
      hydrated={hydrated}
      activeExercises={activeExercises}
      mostRecentSession={mostRecentSession}
      plans={plans}
      activePlanName={activePlanName}
      error={error}
      routineFilter={routineFilter}
      setRoutineFilter={setRoutineFilter}
      loadingPlans={loadingPlans}
      shareLinkModal={shareLinkModal}
      setShareLinkModal={setShareLinkModal}
      beginEmptyTraining={beginEmptyTraining}
      beginRoutineTraining={beginRoutineTraining}
      lastUseByPlanId={lastUseByPlanId}
      optimisticPlanIds={optimisticPlanIds}
      updatingPlanIds={updatingPlanIds}
      openRoutineMenuId={openRoutineMenuId}
      routineMenuAnchor={routineMenuAnchor}
      setOpenRoutineMenuId={setOpenRoutineMenuId}
      setRoutineMenuAnchor={setRoutineMenuAnchor}
      setActivePlanId={setActivePlanId}
      setScreen={setScreen}
      handleDeleteRoutine={handleDeleteRoutine}
      handleShareRoutine={handleShareRoutine}
      handleDuplicateRoutine={handleDuplicateRoutine}
      handleExportPDF={handleExportPDF}
    />
  )
}
