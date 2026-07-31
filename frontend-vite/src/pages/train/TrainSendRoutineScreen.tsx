import { lazy, Suspense, type ComponentProps } from 'react'

// CreateRoutineScreen lazy-loaded — mesmo chunk usado pela TrainPage (o
// import() dinamico aponta pro mesmo modulo, carregado uma vez e cacheado).
const CreateRoutineScreen = lazy(() =>
  import('./CreateRoutineScreen').then((m) => ({ default: m.CreateRoutineScreen })),
)

type CreateRoutineSubmit = ComponentProps<typeof CreateRoutineScreen>['onSubmit']

// Tela SEND_ROUTINE da TrainPage: cria uma rotina e gera link de envio.
// Wrapper fino do CreateRoutineScreen (a logica de criar+enviar fica na
// TrainPage, passada por onSubmit). Extraida verbatim.
export function TrainSendRoutineScreen({ onCancel, onSubmit }: {
  onCancel: () => void
  onSubmit: CreateRoutineSubmit
}) {
  return (
    <Suspense fallback={null}>
      <CreateRoutineScreen
        title="Criar e enviar"
        submitLabel="Criar e enviar"
        onCancel={onCancel}
        onSubmit={onSubmit}
      />
    </Suspense>
  )
}
