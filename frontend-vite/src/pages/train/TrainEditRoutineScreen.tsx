import { lazy, Suspense, type ComponentProps } from 'react'
import type { WorkoutPlan } from '../../types/workout'
import { planToRoutineInitial } from './helpers'

// CreateRoutineScreen lazy-loaded — mesmo chunk usado pela TrainPage.
const CreateRoutineScreen = lazy(() =>
  import('./CreateRoutineScreen').then((m) => ({ default: m.CreateRoutineScreen })),
)

type CreateRoutineSubmit = ComponentProps<typeof CreateRoutineScreen>['onSubmit']

// Tela EDIT da TrainPage: edita uma rotina existente. Wrapper fino do
// CreateRoutineScreen pre-preenchido — a logica otimista de update fica na
// TrainPage, passada por onSubmit. Se a rotina nao existir (editingPlan null),
// mostra o fallback "Rotina nao encontrada". Extraida verbatim.
export function TrainEditRoutineScreen({ editingPlan, onCancel, onSubmit }: {
  editingPlan: WorkoutPlan | null
  onCancel: () => void
  onSubmit: CreateRoutineSubmit
}) {
  return (
    <Suspense fallback={null}>
      {editingPlan ? (
        <CreateRoutineScreen
          title="Editar Rotina"
          submitLabel="Atualizar"
          initial={planToRoutineInitial(editingPlan)}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      ) : (
        <section className="space-y-3">
          <p className="text-sm text-[var(--muted)]">Rotina não encontrada.</p>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Voltar
          </button>
        </section>
      )}
    </Suspense>
  )
}
