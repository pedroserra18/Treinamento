import { lazy, Suspense, type ComponentProps } from 'react'

// CreateRoutineScreen lazy-loaded — mesmo chunk usado pela TrainPage.
const CreateRoutineScreen = lazy(() =>
  import('./CreateRoutineScreen').then((m) => ({ default: m.CreateRoutineScreen })),
)

type CreateRoutineSubmit = ComponentProps<typeof CreateRoutineScreen>['onSubmit']

// Tela NEW_ROUTINE da TrainPage: cria uma nova rotina. Wrapper fino do
// CreateRoutineScreen — a logica otimista de criacao fica na TrainPage,
// passada por onSubmit. Extraida verbatim.
export function TrainNewRoutineScreen({ onCancel, onSubmit }: {
  onCancel: () => void
  onSubmit: CreateRoutineSubmit
}) {
  return (
    <Suspense fallback={null}>
      <CreateRoutineScreen onCancel={onCancel} onSubmit={onSubmit} />
    </Suspense>
  )
}
