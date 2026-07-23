import { SetTypeBadge } from '../../components/common/SetTypePickerSheet'
import { type DropEntry } from '../../components/common/setTypeOptions'
import { type PerformanceDraft, type SeriesDraft } from './workouts-utils'

// Editor de séries expandido de um exercício na WorkoutsPage: toggle de reps
// (fixas/margem) + lista de séries com variantes normal/drop/cluster + os
// botões "Adicionar serie"/"Salvar series". Verbatim da página; o estado e as
// ações ficam na WorkoutsPage (passados por props já ligados ao exercício/plano).
export function SeriesEditor({
  draft, showLoad,
  onPatchDraft, onOpenSeriesPicker, onRemoveSeries, onPatchSeries,
  onPatchDrop, onRemoveDrop, onAddDrop, onAddSeries, onSaveSeries,
}: {
  draft: PerformanceDraft
  showLoad: boolean
  onPatchDraft: (patch: Partial<Omit<PerformanceDraft, 'series'>>) => void
  onOpenSeriesPicker: (seriesIndex: number) => void
  onRemoveSeries: (seriesIndex: number) => void
  onPatchSeries: (seriesIndex: number, patch: Partial<SeriesDraft>) => void
  onPatchDrop: (seriesIndex: number, dropIndex: number, patch: Partial<DropEntry>) => void
  onRemoveDrop: (seriesIndex: number, dropIndex: number) => void
  onAddDrop: (seriesIndex: number) => void
  onAddSeries: () => void
  onSaveSeries: () => void
}) {
  return (
    <div className="mt-3 rounded-lg border border-[var(--line)] p-2">
      {/* Reps mode toggle */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border border-[var(--line)] overflow-hidden text-xs font-semibold">
          <button
            type="button"
            onClick={() => onPatchDraft({ repsMode: 'fixed' })}
            className={`px-3 py-1.5 transition-colors ${draft.repsMode === 'fixed' ? 'bg-[var(--brand)] text-white' : 'text-[var(--muted)]'}`}
          >
            Reps fixas
          </button>
          <button
            type="button"
            onClick={() => onPatchDraft({ repsMode: 'range' })}
            className={`px-3 py-1.5 transition-colors ${draft.repsMode === 'range' ? 'bg-[var(--brand)] text-white' : 'text-[var(--muted)]'}`}
          >
            Margem de reps
          </button>
        </div>
        {draft.repsMode === 'fixed' ? (
          <label className="text-[11px] uppercase text-[var(--muted)]">
            Reps
            <input
              value={draft.fixedReps}
              onChange={(e) => onPatchDraft({ fixedReps: e.target.value.replace(/[^\d]/g, '') })}
              className="mt-1 w-20 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
            />
          </label>
        ) : (
          <div className="flex gap-2">
            <label className="text-[11px] uppercase text-[var(--muted)]">
              Mín
              <input
                value={draft.rangeMin}
                onChange={(e) => onPatchDraft({ rangeMin: e.target.value.replace(/[^\d]/g, '') })}
                className="mt-1 w-16 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
              />
            </label>
            <label className="text-[11px] uppercase text-[var(--muted)]">
              Máx
              <input
                value={draft.rangeMax}
                onChange={(e) => onPatchDraft({ rangeMax: e.target.value.replace(/[^\d]/g, '') })}
                className="mt-1 w-16 rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
              />
            </label>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {draft.series.map((series, seriesIndex) => (
          <div
            key={`serie-${seriesIndex}`}
            className="space-y-2 rounded-xl border border-[var(--line)] p-3"
          >
            {/* Header: badge (toque abre o picker de tipo, igual
                ao treino ativo) + número da série + remover */}
            <div className="flex flex-wrap items-center gap-2">
              <SetTypeBadge
                index={seriesIndex}
                setType={series.setType}
                onClick={() => onOpenSeriesPicker(seriesIndex)}
              />
              <span className="shrink-0 text-xs font-bold text-[var(--muted)]">
                Série {seriesIndex + 1}
              </span>
              <button
                type="button"
                className="ml-auto rounded-lg border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-300"
                onClick={() => onRemoveSeries(seriesIndex)}
              >
                Remover
              </button>
            </div>

            {series.setType === 'drop' ? (
              /* Drop set inputs */
              <div className="space-y-2 pl-1">
                {series.dropSets.map((drop, dropIdx) => (
                  <div
                    key={dropIdx}
                    className={`grid gap-2 ${showLoad ? 'grid-cols-[auto_1fr_1fr_auto]' : 'grid-cols-[auto_1fr_auto]'}`}
                  >
                    <span className="self-center whitespace-nowrap text-[11px] font-semibold text-[var(--muted)]">
                      Drop {dropIdx + 1}
                    </span>
                    {showLoad ? (
                      <label className="text-[11px] uppercase text-[var(--muted)]">
                        Peso (kg)
                        <input
                          value={drop.weightKg}
                          onChange={(e) =>
                            onPatchDrop(seriesIndex, dropIdx, {
                              weightKg: e.target.value.replace(/[^\d.]/g, ''),
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
                        onChange={(e) =>
                          onPatchDrop(seriesIndex, dropIdx, {
                            reps: e.target.value.replace(/[^\d]/g, ''),
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => onRemoveDrop(seriesIndex, dropIdx)}
                      disabled={series.dropSets.length <= 1}
                      className="self-end rounded-lg border border-red-500/60 px-2 py-1 text-xs font-semibold text-red-300 disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onAddDrop(seriesIndex)}
                  className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                >
                  + Adicionar Drop
                </button>
              </div>
            ) : series.setType === 'cluster' ? (
              /* Cluster set inputs */
              <div className={`grid gap-2 ${showLoad ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
                {showLoad ? (
                  <label className="text-[11px] uppercase text-[var(--muted)]">
                    Peso (kg)
                    <input
                      value={series.loadKg}
                      onChange={(event) =>
                        onPatchSeries(seriesIndex, {
                          loadKg: event.target.value.replace(/[^\d.]/g, ''),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                    />
                  </label>
                ) : null}
                <label className="text-[11px] uppercase text-[var(--muted)]">
                  Reps/Cluster
                  <input
                    value={series.clusterReps}
                    placeholder="3"
                    onChange={(event) =>
                      onPatchSeries(seriesIndex, {
                        clusterReps: event.target.value.replace(/[^\d]/g, ''),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-[11px] uppercase text-[var(--muted)]">
                  Nº Clusters
                  <input
                    value={series.clusterCount}
                    placeholder="4"
                    onChange={(event) =>
                      onPatchSeries(seriesIndex, {
                        clusterCount: event.target.value.replace(/[^\d]/g, ''),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-[11px] uppercase text-[var(--muted)]">
                  RIR
                  <input
                    value={series.rir}
                    onChange={(event) =>
                      onPatchSeries(seriesIndex, { rir: event.target.value.replace(/[^\d]/g, '') })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-[11px] uppercase text-[var(--muted)]">
                  RPE
                  <input
                    value={series.rpe}
                    placeholder="1-10"
                    inputMode="numeric"
                    maxLength={2}
                    onChange={(event) =>
                      onPatchSeries(seriesIndex, {
                        rpe: event.target.value.replace(/[^\d]/g, '').slice(0, 2),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                  />
                </label>
              </div>
            ) : (
              /* Normal / Warmup / Failure inputs — peso, reps, RIR, RPE */
              <div className={`grid gap-2 ${showLoad ? (draft.repsMode === 'fixed' ? 'sm:grid-cols-3' : 'sm:grid-cols-4') : (draft.repsMode === 'fixed' ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}`}>
                {showLoad ? (
                  <label className="text-[11px] uppercase text-[var(--muted)]">
                    Peso (kg)
                    <input
                      value={series.loadKg}
                      onChange={(event) =>
                        onPatchSeries(seriesIndex, {
                          loadKg: event.target.value.replace(/[^\d.]/g, ''),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                    />
                  </label>
                ) : null}
                {draft.repsMode !== 'fixed' && (
                  <label className="text-[11px] uppercase text-[var(--muted)]">
                    Repeticoes
                    <input
                      value={series.reps}
                      onChange={(event) =>
                        onPatchSeries(seriesIndex, { reps: event.target.value.replace(/[^\d]/g, '') })
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                    />
                  </label>
                )}
                <label className="text-[11px] uppercase text-[var(--muted)]">
                  RIR
                  <input
                    value={series.rir}
                    onChange={(event) =>
                      onPatchSeries(seriesIndex, { rir: event.target.value.replace(/[^\d]/g, '') })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-[11px] uppercase text-[var(--muted)]">
                  RPE
                  <input
                    value={series.rpe}
                    placeholder="1-10"
                    inputMode="numeric"
                    maxLength={2}
                    onChange={(event) =>
                      onPatchSeries(seriesIndex, {
                        rpe: event.target.value.replace(/[^\d]/g, '').slice(0, 2),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                  />
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
          onClick={onAddSeries}
        >
          Adicionar serie
        </button>
        <button
          type="button"
          className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
          onClick={onSaveSeries}
        >
          Salvar series
        </button>
      </div>
    </div>
  )
}
