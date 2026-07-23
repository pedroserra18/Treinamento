import type { WorkoutPlan } from '../../types/workout'

// Cabeçalho de um plano na WorkoutsPage: nome com edição inline +
// "Salvar treino completo" + "Excluir treino". Todo o estado e as ações
// ficam na página (passados por props) — este componente é só apresentação.
export function PlanHeader({
  plan, editingName, nameDraft, hideInlineSaveButton,
  onStartEdit, onNameDraftChange, onSaveName, onCancelEdit, onSaveFullPlan, onDelete,
}: {
  plan: WorkoutPlan
  editingName: boolean
  nameDraft: string
  hideInlineSaveButton: boolean
  onStartEdit: () => void
  onNameDraftChange: (value: string) => void
  onSaveName: () => void
  onCancelEdit: () => void
  onSaveFullPlan: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        {editingName ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={nameDraft}
              onChange={(event) => onNameDraftChange(event.target.value)}
              className="rounded-md border border-[var(--line)] bg-transparent px-2 py-1 text-sm font-semibold"
            />
            <button
              type="button"
              className="rounded-md border border-[var(--brand)] px-2 py-1 text-xs font-semibold text-[var(--brand)]"
              onClick={onSaveName}
            >
              Salvar
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)]"
              onClick={onCancelEdit}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="text-left text-lg font-black text-[var(--text)] transition hover:opacity-80"
            onClick={onStartEdit}
          >
            {plan.name}
          </button>
        )}
        <p className="text-sm text-[var(--muted)]">{plan.description ?? 'Sem descricao'}</p>
      </div>
      <div className="flex gap-2">
        {!hideInlineSaveButton && (
          <button
            type="button"
            className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"
            onClick={onSaveFullPlan}
          >
            Salvar treino completo
          </button>
        )}
        <button
          type="button"
          className="rounded-lg border border-red-500/60 px-3 py-1 text-xs font-semibold text-red-400"
          onClick={onDelete}
        >
          Excluir treino
        </button>
      </div>
    </div>
  )
}
