import { type ComponentProps, type Dispatch, type SetStateAction, type RefObject } from 'react'
import { motion } from 'framer-motion'
import { Dumbbell, Image as ImageIcon, Pin, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ExerciseOption } from '../../types/workout'
import { ExerciseCard } from './exercise-card'
import { MuscleVolumeCard, RecentPrsCard } from './charts'

type PinnedProgress = ComponentProps<typeof ExerciseCard>['item']

// Aba "Exercícios" da ProgressPage: card de fixados (busca + sugestões +
// contador), estado vazio com atalhos, analytics (volume por músculo + PRs
// recentes) e a lista de exercícios fixados com reordenação por drag-and-drop.
// Extraída verbatim; estado e handlers ficam na ProgressPage (props).
export function ProgressExerciseTab({
  loading, summaryDays, maxPinned, exerciseProgress, pinnedExerciseIds, muscleVolume30D,
  searchInputRef, searchQuery, setSearchQuery, searchFocused, setSearchFocused, searching, searchResults,
  openedPinnedExerciseId, setOpenedPinnedExerciseId,
  draggingExerciseId, setDraggingExerciseId, dropTargetExerciseId, setDropTargetExerciseId,
  handlePinExercise, handleUnpinExercise, handleReorderPinned, setTab, setShowAddForm,
}: {
  loading: boolean
  summaryDays: unknown[]
  maxPinned: number
  exerciseProgress: PinnedProgress[]
  pinnedExerciseIds: Set<string>
  muscleVolume30D: ComponentProps<typeof MuscleVolumeCard>['rows']
  searchInputRef: RefObject<HTMLInputElement | null>
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  searchFocused: boolean
  setSearchFocused: Dispatch<SetStateAction<boolean>>
  searching: boolean
  searchResults: ExerciseOption[]
  openedPinnedExerciseId: string | null
  setOpenedPinnedExerciseId: Dispatch<SetStateAction<string | null>>
  draggingExerciseId: string | null
  setDraggingExerciseId: Dispatch<SetStateAction<string | null>>
  dropTargetExerciseId: string | null
  setDropTargetExerciseId: Dispatch<SetStateAction<string | null>>
  handlePinExercise: (exerciseId: string) => Promise<void>
  handleUnpinExercise: (exerciseId: string) => Promise<void>
  handleReorderPinned: (orderedIds: string[]) => Promise<void>
  setTab: (tab: 'exercise' | 'body') => void
  setShowAddForm: Dispatch<SetStateAction<boolean>>
}) {
  return (
    <div className="space-y-3">
      {/* Pinned card */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[var(--text)]">
            <Pin size={14} className="text-[var(--brand)]" />
            Exercícios fixados
          </h2>
          <div className="flex items-center gap-2.5 font-mono text-[11px] text-[var(--muted)]">
            <div className="flex gap-[3px]">
              {Array.from({ length: maxPinned }, (_, i) => (
                <span
                  key={i}
                  className="block h-[6px] w-[14px] rounded-[2px] transition-colors"
                  style={{ background: i < exerciseProgress.length ? 'var(--brand)' : 'var(--line)' }}
                />
              ))}
            </div>
            <span>
              <b className="font-semibold text-[var(--text)]">{exerciseProgress.length}</b>/{maxPinned} fixados
            </span>
          </div>
        </div>

        <label
          className="relative flex items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] px-3.5 py-2.5 transition-all focus-within:border-[var(--brand)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_18%,transparent)]"
        >
          <Search size={14} className="mr-2 text-[var(--muted)]" />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            placeholder="Buscar exercício para fixar…"
            className="flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          />
          <kbd className="hidden rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-[2px] font-mono text-[10px] text-[var(--muted)] sm:inline">
            ⌘ K
          </kbd>
        </label>

        {/* Suggestions dropdown */}
        {searchFocused && searchQuery.trim().length >= 2 && (
          <div className="mt-2 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface)]">
            {searching && <p className="px-3.5 py-3 text-[12px] text-[var(--muted)]">Buscando…</p>}
            {!searching && searchResults.length === 0 && (
              <p className="px-3.5 py-3 text-[12px] text-[var(--muted)]">Nenhum exercício encontrado.</p>
            )}
            {searchResults.slice(0, 8).map((option) => {
              const isPinned = pinnedExerciseIds.has(option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => !isPinned && void handlePinExercise(option.id)}
                  disabled={isPinned}
                  className="flex w-full items-center justify-between gap-3 border-b border-[var(--line-2,var(--line))] px-3.5 py-2.5 text-left text-[13px] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-[var(--text)]">{option.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    {option.primaryMuscleGroup} · {option.difficulty}
                    {isPinned && <span className="ml-2 text-[var(--brand)]">· FIXADO</span>}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </motion.section>

      {/* Exercise cards */}
      {exerciseProgress.length === 0 && !loading && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
          <div className="text-center">
            <Pin size={28} className="mx-auto mb-3 text-[var(--muted)]" />
            <p className="text-sm font-bold text-[var(--text)]">Nenhum exercício fixado ainda</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Escolha um caminho rápido pra começar a acompanhar sua evolução.
            </p>
          </div>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => searchInputRef.current?.focus()}
              className="group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5 text-left transition-colors hover:border-[var(--brand)]/60 hover:bg-[var(--brand)]/5"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                <Pin size={13} />
              </span>
              <span className="text-[13px] font-semibold text-[var(--text)]">Fixar exercício</span>
              <span className="text-[11.5px] text-[var(--muted)]">Acompanha carga, reps e PRs do exercício escolhido.</span>
            </button>
            <button
              type="button"
              onClick={() => { setTab('body'); setShowAddForm(true) }}
              className="group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5 text-left transition-colors hover:border-[var(--brand)]/60 hover:bg-[var(--brand)]/5"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                <ImageIcon size={13} />
              </span>
              <span className="text-[13px] font-semibold text-[var(--text)]">Registrar foto</span>
              <span className="text-[11.5px] text-[var(--muted)]">Tire fotos periódicas pra ver a evolução visual.</span>
            </button>
            <Link
              to="/train"
              className="group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5 text-left transition-colors hover:border-[var(--brand)]/60 hover:bg-[var(--brand)]/5"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                <Dumbbell size={13} />
              </span>
              <span className="text-[13px] font-semibold text-[var(--text)]">Ir treinar</span>
              <span className="text-[11.5px] text-[var(--muted)]">Cada sessão concluída vira dado aqui automaticamente.</span>
            </Link>
          </div>
        </div>
      )}

      {/* Side-by-side analytics — only meaningful with at least one
          pinned exercise (PRs feed) or any training history (volume). */}
      {(exerciseProgress.length > 0 || summaryDays.length > 0) && (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          <MuscleVolumeCard rows={muscleVolume30D} />
          <RecentPrsCard progress={exerciseProgress} />
        </div>
      )}

      {exerciseProgress.map((item) => (
        <div
          key={item.exercise.id}
          onDragOver={(e) => {
            if (draggingExerciseId && draggingExerciseId !== item.exercise.id) {
              e.preventDefault()
              setDropTargetExerciseId(item.exercise.id)
            }
          }}
          onDragLeave={(e) => {
            // Only clear if we're really leaving the card (not entering a child).
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDropTargetExerciseId((current) => (current === item.exercise.id ? null : current))
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (!draggingExerciseId || draggingExerciseId === item.exercise.id) return
            const fromIdx = exerciseProgress.findIndex((p) => p.exercise.id === draggingExerciseId)
            const toIdx = exerciseProgress.findIndex((p) => p.exercise.id === item.exercise.id)
            if (fromIdx < 0 || toIdx < 0) return
            const reordered = [...exerciseProgress]
            const [moved] = reordered.splice(fromIdx, 1)
            reordered.splice(toIdx, 0, moved)
            setDropTargetExerciseId(null)
            void handleReorderPinned(reordered.map((p) => p.exercise.id))
          }}
        >
        <ExerciseCard
          item={item}
          open={openedPinnedExerciseId === item.exercise.id}
          isDragging={draggingExerciseId === item.exercise.id}
          isDropTarget={dropTargetExerciseId === item.exercise.id}
          onMove={(direction) => {
            const idx = exerciseProgress.findIndex((p) => p.exercise.id === item.exercise.id)
            const targetIdx = direction === 'up' ? idx - 1 : idx + 1
            if (idx < 0 || targetIdx < 0 || targetIdx >= exerciseProgress.length) return
            const reordered = [...exerciseProgress]
            ;[reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]]
            void handleReorderPinned(reordered.map((p) => p.exercise.id))
          }}
          dragHandleProps={{
            draggable: true,
            onDragStart: (e: React.DragEvent) => {
              setDraggingExerciseId(item.exercise.id)
              e.dataTransfer.effectAllowed = 'move'
              // Firefox requires data to be set or it cancels the drag.
              try { e.dataTransfer.setData('text/plain', item.exercise.id) } catch { /* noop */ }
            },
            onDragEnd: () => {
              setDraggingExerciseId(null)
              setDropTargetExerciseId(null)
            },
          }}
          onToggle={() =>
            setOpenedPinnedExerciseId((current) => (current === item.exercise.id ? null : item.exercise.id))
          }
          onRemove={() => void handleUnpinExercise(item.exercise.id)}
        />
        </div>
      ))}
    </div>
  )
}
