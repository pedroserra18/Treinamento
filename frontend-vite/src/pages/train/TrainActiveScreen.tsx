import { lazy, Suspense, type ComponentProps, type Dispatch, type SetStateAction } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Plus } from 'lucide-react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { formatClock } from '../../lib/workout/workout-timing'
import { pushRecentExerciseId } from '../../lib/exercise/recent-exercises'
import { invalidateExerciseCatalog } from '../../lib/cache/exercise-catalog-cache'
import { InfoDialog } from '../../components/common/InfoDialog'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import type { ActiveExercise } from './types'
import type { ExerciseOption, CardioEntryInput } from '../../types/workout'
import { PrCelebrationBanner } from './PrCelebrationBanner'
import { RestTimerBar } from './RestTimerBar'
import { ActiveProgressStats } from './ActiveProgressStats'
import { ActiveWorkoutMenu } from './ActiveWorkoutMenu'
import { ActiveExerciseCard } from './ActiveExerciseCard'
import { RestTimePickerSheet } from './RestTimePickerSheet'
import { ExerciseContextMenuSheet } from './ExerciseContextMenuSheet'
import { type ReorderItem } from './ReorderExercisesSheet'
import { SupersetPickerSheet } from './SupersetPickerSheet'
import { CardioSection } from './CardioSection'
import { DurationWarningDialog } from './TrainDialogs'

// Modais lazy-loaded — só entram no bundle quando abertos (mesmo padrão da
// TrainPage; o import() dinâmico aponta pro mesmo módulo/chunk).
const ReorderExercisesSheet = lazy(() =>
  import('./ReorderExercisesSheet').then((m) => ({ default: m.ReorderExercisesSheet })),
)
const SubstituteExerciseModal = lazy(() =>
  import('./SubstituteExerciseModal').then((m) => ({ default: m.SubstituteExerciseModal })),
)
const AddExerciseModal = lazy(() =>
  import('./AddExerciseModal').then((m) => ({ default: m.AddExerciseModal })),
)
const CreateExerciseModal = lazy(() =>
  import('./CreateExerciseModal').then((m) => ({ default: m.CreateExerciseModal })),
)

type ConfirmDialogState = {
  title: string
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

// Tela ACTIVE da TrainPage: registro de treino ao vivo. Header (cronômetro +
// progresso + menu ⋯), lista de exercícios (DnD, séries, descanso), adicionar
// exercício, cardio, e todos os sheets/modais (reordenar/substituir/superset/
// criar exercício/duração/info/confirm). Extraida verbatim; TODO o estado,
// efeitos e timers ficam na TrainPage (passados por props) — só o render se move.
// Clusters grandes têm tipos derivados de ComponentProps dos subcomponentes.
type TrainActiveScreenProps =
  & Pick<ComponentProps<typeof ActiveExerciseCard>,
      | 'showRir' | 'showRpe' | 'openTypePicker' | 'setOpenTypePicker'
      | 'lastPerformanceByExercise' | 'setActiveExercises' | 'setContextMenuExerciseIndex'
      | 'startRestEdit' | 'patchSet' | 'completeSet' | 'removeSet' | 'addSet'
      | 'addSetCopyingPrevious' | 'addDropEntry' | 'removeDropEntry' | 'patchDropEntry'>
  & Pick<ComponentProps<typeof ActiveWorkoutMenu>,
      | 'advancedTimerOpen' | 'setAdvancedTimerOpen' | 'isWorkoutRunning' | 'setIsWorkoutRunning'
      | 'manualTimerMinutes' | 'setManualTimerMinutes' | 'applyManualTimerEdit'
      | 'intensityMode' | 'setIntensityModeState'>
  & {
      activeExercises: ActiveExercise[]
      activePlanName: string
      displayElapsedSec: number
      totals: ComponentProps<typeof ActiveProgressStats>['totals']
      error: string | null
      prCelebration: ComponentProps<typeof PrCelebrationBanner>['celebration']
      setPrCelebration: Dispatch<SetStateAction<ComponentProps<typeof PrCelebrationBanner>['celebration']>>
      restFinishedName: ComponentProps<typeof RestTimerBar>['restFinishedName']
      adjustRestTimer: (exerciseIndex: number, deltaSec: number) => void
      toggleRestTimer: (exerciseIndex: number) => void
      backToDashboardFromActive: () => void
      finalizeWithSafetyCheck: () => void
      dndSensors: ComponentProps<typeof DndContext>['sensors']
      handleExerciseDragEnd: (event: DragEndEvent) => void
      editingRestExerciseIndex: number | null
      setEditingRestExerciseIndex: Dispatch<SetStateAction<number | null>>
      applyRestEdit: (exerciseIndex: number, secOverride?: number) => void
      contextMenuExerciseIndex: number | null
      reorderSheetOpen: boolean
      setReorderSheetOpen: Dispatch<SetStateAction<boolean>>
      substituteSourceIndex: number | null
      setSubstituteSourceIndex: Dispatch<SetStateAction<number | null>>
      removeFromSuperset: (exerciseIndex: number) => void
      supersetPickerSourceIndex: number | null
      setSupersetPickerSourceIndex: Dispatch<SetStateAction<number | null>>
      handleRemoveExercise: (exerciseIndex: number) => void
      applySubstitution: (substituteIndex: number, payload: ExerciseOption) => void
      addExerciseToActiveWorkout: (payload: ExerciseOption) => void
      addExerciseOpen: boolean
      setAddExerciseOpen: Dispatch<SetStateAction<boolean>>
      createExerciseOpen: boolean
      setCreateExerciseOpen: Dispatch<SetStateAction<boolean>>
      createExerciseForSubstituteIndex: number | null
      setCreateExerciseForSubstituteIndex: Dispatch<SetStateAction<number | null>>
      createExerciseForAdd: boolean
      setCreateExerciseForAdd: Dispatch<SetStateAction<boolean>>
      pairAsSuperset: (sourceIndex: number, targetIndex: number) => void
      infoDialog: { title: string; message: string } | null
      setInfoDialog: Dispatch<SetStateAction<{ title: string; message: string } | null>>
      cardioEntries: CardioEntryInput[]
      setCardioEntries: Dispatch<SetStateAction<CardioEntryInput[]>>
      durationWarning: ComponentProps<typeof DurationWarningDialog>['warning'] | null
      handleDurationAdjust: () => void
      handleDurationKeepCurrent: () => void
      confirmDialog: ConfirmDialogState | null
      setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>
    }

export function TrainActiveScreen({
  showRir, showRpe, openTypePicker, setOpenTypePicker, lastPerformanceByExercise,
  setActiveExercises, setContextMenuExerciseIndex, startRestEdit, patchSet, completeSet,
  removeSet, addSet, addSetCopyingPrevious, addDropEntry, removeDropEntry, patchDropEntry,
  advancedTimerOpen, setAdvancedTimerOpen, isWorkoutRunning, setIsWorkoutRunning,
  manualTimerMinutes, setManualTimerMinutes, applyManualTimerEdit, intensityMode, setIntensityModeState,
  activeExercises, activePlanName, displayElapsedSec, totals, error,
  prCelebration, setPrCelebration, restFinishedName, adjustRestTimer, toggleRestTimer,
  backToDashboardFromActive, finalizeWithSafetyCheck, dndSensors, handleExerciseDragEnd,
  editingRestExerciseIndex, setEditingRestExerciseIndex, applyRestEdit,
  contextMenuExerciseIndex, reorderSheetOpen, setReorderSheetOpen,
  substituteSourceIndex, setSubstituteSourceIndex, removeFromSuperset,
  supersetPickerSourceIndex, setSupersetPickerSourceIndex, handleRemoveExercise,
  applySubstitution, addExerciseToActiveWorkout, addExerciseOpen, setAddExerciseOpen,
  createExerciseOpen, setCreateExerciseOpen, createExerciseForSubstituteIndex,
  setCreateExerciseForSubstituteIndex, createExerciseForAdd, setCreateExerciseForAdd,
  pairAsSuperset, infoDialog, setInfoDialog, cardioEntries, setCardioEntries,
  durationWarning, handleDurationAdjust, handleDurationKeepCurrent, confirmDialog, setConfirmDialog,
}: TrainActiveScreenProps) {
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
