import { type Dispatch, type SetStateAction } from 'react'
import { MoreVertical } from 'lucide-react'
import { SortableExerciseCard } from './SortableExerciseCard'
import { SwipeableSetRow } from './SwipeableSetRow'
import { SetTypeBadge, SetTypePickerSheet } from './SetTypeControls'
import { SET_TYPE_GLYPH, type SetType, type DropEntry } from '../../components/common/setTypeOptions'
import { computeSetPlaceholders, resolveLastSetPerformance, type LastSetPerformance } from './set-display'
import { isEffectiveBodyweightExercise, sanitizeDecimalInput } from './helpers'
import { supersetColorFor } from './superset'
import { formatClock } from '../../lib/workout/workout-timing'
import type { ActiveExercise, ExerciseSetInput } from './types'

type OpenTypePicker = { exerciseIndex: number; setIndex: number } | null

type ActiveExerciseCardProps = {
  exercise: ActiveExercise
  exerciseIndex: number
  showRir: boolean
  showRpe: boolean
  openTypePicker: OpenTypePicker
  setOpenTypePicker: Dispatch<SetStateAction<OpenTypePicker>>
  lastPerformanceByExercise: Record<string, Record<number, LastSetPerformance>>
  setActiveExercises: Dispatch<SetStateAction<ActiveExercise[]>>
  setContextMenuExerciseIndex: Dispatch<SetStateAction<number | null>>
  startRestEdit: (exerciseIndex: number) => void
  patchSet: (exerciseIndex: number, setIndex: number, patch: Partial<ExerciseSetInput>) => void
  completeSet: (exerciseIndex: number, setIndex: number) => void
  removeSet: (exerciseIndex: number, setIndex: number) => void
  addSet: (exerciseIndex: number) => void
  addSetCopyingPrevious: (exerciseIndex: number) => void
  addDropEntry: (exerciseIndex: number, setIndex: number) => void
  removeDropEntry: (exerciseIndex: number, setIndex: number, dropIndex: number) => void
  patchDropEntry: (exerciseIndex: number, setIndex: number, dropIndex: number, patch: Partial<DropEntry>) => void
}

// Card de UM exercicio na tela ACTIVE de treino: header (thumb/video/descanso/
// menu), notas, e o mapa de series (normal/warmup/failure compacto + drop/cluster
// detalhado). Estado do treino vive no componente pai; o card recebe o exercicio,
// seu indice e os handlers de serie como props. Extraido verbatim da TrainPage.
export function ActiveExerciseCard({
  exercise,
  exerciseIndex,
  showRir,
  showRpe,
  openTypePicker,
  setOpenTypePicker,
  lastPerformanceByExercise,
  setActiveExercises,
  setContextMenuExerciseIndex,
  startRestEdit,
  patchSet,
  completeSet,
  removeSet,
  addSet,
  addSetCopyingPrevious,
  addDropEntry,
  removeDropEntry,
  patchDropEntry,
}: ActiveExerciseCardProps) {
  const showLoadInput = !isEffectiveBodyweightExercise(exercise)
  const supersetColor = supersetColorFor(exercise.supersetGroup)

  return (
    <SortableExerciseCard
      id={exercise.exerciseId}
      supersetColor={supersetColor}
    >
    {supersetColor && exercise.supersetGroup && (
      <span
        className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-md text-[10px] font-extrabold text-white"
        style={{ backgroundColor: supersetColor }}
        title={`Supersérie ${exercise.supersetGroup}`}
        aria-label={`Supersérie ${exercise.supersetGroup}`}
      >
        {exercise.supersetGroup}
      </span>
    )}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="h-20 w-20 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] sm:h-24 sm:w-24">
          {exercise.thumbnailUrl ? (
            <img
              src={exercise.thumbnailUrl}
              alt={`Imagem do exercício ${exercise.exerciseName}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Sem foto
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-base font-extrabold text-[var(--text)]">{exercise.exerciseName}</h3>
          <button
            type="button"
            disabled={!exercise.videoUrl}
            onClick={() => {
              if (exercise.videoUrl) {
                window.open(exercise.videoUrl, '_blank', 'noopener,noreferrer')
              }
            }}
            className="mt-1 rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exercise.videoUrl ? 'Ver vídeo do exercício' : 'Vídeo em breve'}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => startRestEdit(exerciseIndex)}
          className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          Descanso {formatClock(exercise.restDurationSec)}
        </button>
        {/* Kebab (3 pontinhos verticais) — abre o sheet de
            ações do exercício. Posicionado à direita do
            botão de descanso pra manter o ponto de toque
            no canto superior direito do card, como o Hevy. */}
        <button
          type="button"
          onClick={() => setContextMenuExerciseIndex(exerciseIndex)}
          className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          aria-label={`Mais ações para ${exercise.exerciseName}`}
        >
          <MoreVertical size={14} />
        </button>
      </div>
    </div>

    <label className="mt-3 block">
      <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
        Notas do exercício (opcional)
      </span>
      <textarea
        value={exercise.userNote}
        onChange={(event) => {
          const value = event.target.value
          setActiveExercises((current) =>
            current.map((ex, idx) => (idx === exerciseIndex ? { ...ex, userNote: value } : ex)),
          )
        }}
        rows={2}
        maxLength={250}
        placeholder="Ex: senti dor no ombro, focar na cadencia..."
        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
      />
    </label>

    <div className="mt-3 space-y-2">
      {/* Column header — flex layout so the Anterior cell fills the
          mobile row but caps at ~140px on desktop, with an invisible
          spacer eating the leftover space so inputs stay clustered
          on the right instead of drifting next to Anterior. */}
      {exercise.sets.length > 0 && (() => {
        const isTimeOrDist = exercise.trackingType === 'TIME' || exercise.trackingType === 'DISTANCE'
        return (
          <div className="flex items-center gap-1 px-1 pb-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)] sm:gap-1.5">
            <span className="w-8 shrink-0">Série</span>
            <span className="min-w-0 flex-1 truncate sm:flex-none sm:basis-[140px]">Anterior</span>
            <span aria-hidden className="hidden flex-1 sm:block" />
            {showLoadInput && <span className="w-[52px] shrink-0 text-center sm:w-[64px]">kg</span>}
            <span className="w-[52px] shrink-0 text-center sm:w-[64px]">reps</span>
            {!isTimeOrDist && <span className="w-[44px] shrink-0 text-center sm:w-[48px]">rir</span>}
            <span className="w-[44px] shrink-0 text-center sm:w-[48px]">rpe</span>
            <span className="w-7 shrink-0 text-center">✓</span>
          </div>
        )
      })()}

      {exercise.sets.map((setInput, setIndex) => (
        (() => {
          const lastSet = resolveLastSetPerformance(lastPerformanceByExercise[exercise.exerciseId], setIndex + 1)
          const isTime = exercise.trackingType === 'TIME'
          const isDistance = exercise.trackingType === 'DISTANCE'
          const { weightPlaceholder, repsLabel, repsPlaceholder, rirPlaceholder, rpePlaceholder, previousLabel } =
            computeSetPlaceholders(lastSet, exercise.trackingType, exercise.suggestedReps)
          const isComplex = setInput.setType === 'drop' || setInput.setType === 'cluster'
          const allowedTypes: SetType[] | undefined = isTime || isDistance ? ['normal', 'warmup', 'failure'] : undefined

          return (
        <SwipeableSetRow
          key={`${exercise.exerciseId}-${setIndex}`}
          onDelete={() => removeSet(exerciseIndex, setIndex)}
        >
        <div
          className={`rounded-xl border transition-colors ${
            setInput.checked
              ? 'border-green-500/50 bg-green-500/5'
              : 'border-[var(--line)]'
          } ${isComplex ? 'space-y-2 p-3' : 'px-2 py-1.5 pr-7 sm:pr-9'}`}
        >
          {!isComplex ? (
            /* COMPACT ROW (normal/warmup/failure):
               [Badge] [Anterior] [spacer] [KG] [Reps] [RIR] [RPE] [✓]
               Flex layout — Anterior fills the row on mobile but
               caps at 140px on desktop. The hidden spacer (flex-1
               on sm+) eats the leftover width so the input cluster
               stays glued to the right edge instead of leaving an
               awkward gap next to Anterior. */
            (() => {
              const isTimeOrDist = isTime || isDistance
              return (
                <div className="flex items-center gap-1 sm:gap-1.5">
                  <SetTypeBadge
                    index={setIndex}
                    setType={setInput.setType}
                    checked={setInput.checked}
                    onClick={() => setOpenTypePicker({ exerciseIndex, setIndex })}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[var(--muted)] sm:flex-none sm:basis-[140px]">
                    {previousLabel}
                  </span>
                  <span aria-hidden className="hidden flex-1 sm:block" />
                  {showLoadInput && (
                    <input
                      value={setInput.weightKg}
                      placeholder={weightPlaceholder}
                      inputMode="decimal"
                      aria-label="Peso em kg"
                      onChange={(event) =>
                        patchSet(exerciseIndex, setIndex, {
                          weightKg: sanitizeDecimalInput(event.target.value),
                        })
                      }
                      className="w-[52px] shrink-0 rounded-md border border-[var(--line)] bg-transparent px-1 py-1 text-center text-[12.5px] font-semibold tabular-nums sm:w-[64px]"
                    />
                  )}
                  <input
                    value={setInput.reps}
                    placeholder={repsPlaceholder}
                    inputMode={isDistance ? 'decimal' : 'numeric'}
                    aria-label={repsLabel}
                    onChange={(event) =>
                      patchSet(exerciseIndex, setIndex, {
                        reps: event.target.value.replace(isDistance ? /[^\d.]/g : /[^\d]/g, ''),
                      })
                    }
                    className="w-[52px] shrink-0 rounded-md border border-[var(--line)] bg-transparent px-1 py-1 text-center text-[12.5px] font-semibold tabular-nums sm:w-[64px]"
                  />
                  {!isTimeOrDist && showRir && (
                    <input
                      value={setInput.rir}
                      placeholder={rirPlaceholder}
                      inputMode="numeric"
                      aria-label="RIR"
                      onChange={(event) =>
                        patchSet(exerciseIndex, setIndex, {
                          rir: event.target.value.replace(/[^\d]/g, ''),
                        })
                      }
                      className="w-[44px] shrink-0 rounded-md border border-[var(--line)] bg-transparent px-0.5 py-1 text-center text-[12px] font-semibold tabular-nums sm:w-[48px]"
                    />
                  )}
                  {showRpe && (
                    <input
                      value={setInput.rpe}
                      placeholder={rpePlaceholder}
                      inputMode="numeric"
                      maxLength={2}
                      aria-label="RPE"
                      onChange={(event) =>
                        patchSet(exerciseIndex, setIndex, {
                          rpe: event.target.value.replace(/[^\d]/g, '').slice(0, 2),
                        })
                      }
                      className="w-[44px] shrink-0 rounded-md border border-[var(--line)] bg-transparent px-0.5 py-1 text-center text-[12px] font-semibold tabular-nums sm:w-[48px]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => completeSet(exerciseIndex, setIndex)}
                    title={setInput.checked ? 'Clique para desmarcar' : 'Concluir série'}
                    aria-label={setInput.checked ? 'Desmarcar série' : 'Concluir série'}
                    className={`h-7 w-7 shrink-0 rounded-md border-2 flex items-center justify-center text-[12.5px] font-bold transition-colors ${
                      setInput.checked
                        ? 'border-green-500 bg-green-500 text-white'
                        : 'border-[var(--line)] bg-transparent text-[var(--muted)] hover:border-green-500/60 hover:text-green-400'
                    }`}
                  >
                    ✓
                  </button>
                </div>
              )
            })()
          ) : (
            /* COMPLEX ROW (drop/cluster) — slim header with badge,
               label, check button — then the detailed inputs below
               (kept as-is from the previous design). */
            <div className="flex flex-wrap items-center gap-2">
              <SetTypeBadge
                index={setIndex}
                setType={setInput.setType}
                checked={setInput.checked}
                onClick={() => setOpenTypePicker({ exerciseIndex, setIndex })}
              />
              <span className="text-xs font-bold text-[var(--muted)]">
                Série {setIndex + 1} · {SET_TYPE_GLYPH[setInput.setType].label}
              </span>
              <button
                type="button"
                onClick={() => completeSet(exerciseIndex, setIndex)}
                aria-label={setInput.checked ? 'Desmarcar série' : 'Concluir série'}
                className={`ml-auto h-7 w-7 shrink-0 rounded-md border-2 flex items-center justify-center text-[13px] font-bold transition-colors ${
                  setInput.checked
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-[var(--line)] bg-transparent text-[var(--muted)] hover:border-green-500/60 hover:text-green-400'
                }`}
              >
                ✓
              </button>
            </div>
          )}

          {/* Picker bottom sheet for THIS specific set — only mounted
              when this is the open one to avoid a portal per set. */}
          {openTypePicker?.exerciseIndex === exerciseIndex && openTypePicker?.setIndex === setIndex && (
            <SetTypePickerSheet
              open
              current={setInput.setType}
              allowedTypes={allowedTypes}
              onSelect={(val) => patchSet(exerciseIndex, setIndex, { setType: val })}
              onRemove={() => removeSet(exerciseIndex, setIndex)}
              onClose={() => setOpenTypePicker(null)}
            />
          )}

          {setInput.setType === 'drop' ? (
            /* Drop set inputs */
            <div className="space-y-2 pl-1">
              {setInput.dropSets.map((drop, dropIdx) => (
                <div
                  key={dropIdx}
                  className={`grid gap-2 ${showLoadInput ? 'grid-cols-[auto_1fr_1fr_auto]' : 'grid-cols-[auto_1fr_auto]'}`}
                >
                  <span className="self-center whitespace-nowrap text-[11px] font-semibold text-[var(--muted)]">
                    Drop {dropIdx + 1}
                  </span>
                  {showLoadInput ? (
                    <label className="text-[11px] uppercase text-[var(--muted)]">
                      Peso (kg)
                      <input
                        value={drop.weightKg}
                        placeholder={dropIdx === 0 ? weightPlaceholder : 'kg'}
                        inputMode="decimal"
                        onChange={(e) =>
                          patchDropEntry(exerciseIndex, setIndex, dropIdx, {
                            weightKg: sanitizeDecimalInput(e.target.value),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                      />
                    </label>
                  ) : null}
                  <label className="text-[11px] uppercase text-[var(--muted)]">
                    Reps
                    <input
                      value={drop.reps}
                      placeholder={dropIdx === 0 ? repsPlaceholder : 'reps'}
                      onChange={(e) =>
                        patchDropEntry(exerciseIndex, setIndex, dropIdx, {
                          reps: e.target.value.replace(/[^\d]/g, ''),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeDropEntry(exerciseIndex, setIndex, dropIdx)}
                    disabled={setInput.dropSets.length <= 1}
                    className="self-end rounded-lg border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-300 disabled:opacity-40"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addDropEntry(exerciseIndex, setIndex)}
                className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
              >
                + Adicionar Drop
              </button>
            </div>
          ) : setInput.setType === 'cluster' ? (
            /* Cluster set inputs — peso, reps/cluster, n.º clusters, RIR, RPE */
            <div className={`grid gap-2 ${showLoadInput ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
              {showLoadInput ? (
                <label className="text-[11px] uppercase text-[var(--muted)]">
                  Peso (kg)
                  <input
                    value={setInput.weightKg}
                    placeholder={weightPlaceholder}
                    inputMode="decimal"
                    onChange={(event) =>
                      patchSet(exerciseIndex, setIndex, {
                        weightKg: sanitizeDecimalInput(event.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                  />
                </label>
              ) : null}
              <label className="text-[11px] uppercase text-[var(--muted)]">
                Reps/Cluster
                <input
                  value={setInput.clusterReps}
                  placeholder="3"
                  onChange={(event) =>
                    patchSet(exerciseIndex, setIndex, {
                      clusterReps: event.target.value.replace(/[^\d]/g, ''),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                />
              </label>
              <label className="text-[11px] uppercase text-[var(--muted)]">
                Nº Clusters
                <input
                  value={setInput.clusterCount}
                  placeholder="4"
                  onChange={(event) =>
                    patchSet(exerciseIndex, setIndex, {
                      clusterCount: event.target.value.replace(/[^\d]/g, ''),
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                />
              </label>
              {showRir && (
                <label className="text-[11px] uppercase text-[var(--muted)]">
                  RIR
                  <input
                    value={setInput.rir}
                    placeholder={rirPlaceholder}
                    onChange={(event) =>
                      patchSet(exerciseIndex, setIndex, {
                        rir: event.target.value.replace(/[^\d]/g, ''),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                  />
                </label>
              )}
              {showRpe && (
                <label className="text-[11px] uppercase text-[var(--muted)]">
                  RPE
                  <input
                    value={setInput.rpe}
                    placeholder={rpePlaceholder}
                    inputMode="numeric"
                    maxLength={2}
                    onChange={(event) =>
                      patchSet(exerciseIndex, setIndex, {
                        rpe: event.target.value.replace(/[^\d]/g, '').slice(0, 2),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                  />
                </label>
              )}
            </div>
          ) : null /* normal/warmup/failure is rendered by the compact
                    row above; RIR/RPE moved to the per-exercise expander. */}

        </div>
        </SwipeableSetRow>
          )
        })()
      ))}

      <div className="mt-1 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => addSet(exerciseIndex)}
          className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          + Adicionar série
        </button>
        {/* Atalho pra repetir os valores do último set —
            útil em volume work onde várias séries são iguais.
            Só aparece se a série anterior tem ALGUM dado
            preenchido (não vale a pena clonar tudo vazio). */}
        {(() => {
          const lastSet = exercise.sets[exercise.sets.length - 1]
          const hasData = lastSet && (
            lastSet.reps.trim() !== '' ||
            lastSet.weightKg.trim() !== '' ||
            lastSet.rir.trim() !== '' ||
            lastSet.rpe.trim() !== ''
          )
          if (!hasData) return null
          return (
            <button
              type="button"
              onClick={() => addSetCopyingPrevious(exerciseIndex)}
              className="inline-flex items-center rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              title="Adiciona série com os mesmos valores da anterior"
            >
              ↳ Repetir anterior
            </button>
          )
        })()}
      </div>
    </div>
    </SortableExerciseCard>
  )
}
