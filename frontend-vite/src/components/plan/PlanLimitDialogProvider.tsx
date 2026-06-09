import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { PlanLimitDialog } from './PlanLimitDialog'
import { PlanLimitContext, type ShowLimitDialog } from './plan-limit-context'

// Provider que wrappa o app e expõe o dialog via useShowPlanLimit().
// Padrão pra interceptar erro do backend:
//
//   const showLimit = useShowPlanLimit()
//   try { await createPlan(...) }
//   catch (err) {
//     if (catchPlanLimitError(err, showLimit)) return
//   }
export function PlanLimitDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ feature: string; current: number; limit: number } | null>(null)

  const showLimitDialog = useCallback<ShowLimitDialog>((feature, current, limit) => {
    setState({ feature, current, limit })
  }, [])

  const ctx = useMemo(() => showLimitDialog, [showLimitDialog])

  return (
    <PlanLimitContext.Provider value={ctx}>
      {children}
      <PlanLimitDialog
        open={state !== null}
        feature={state?.feature}
        current={state?.current ?? 0}
        limit={state?.limit ?? 0}
        onClose={() => setState(null)}
      />
    </PlanLimitContext.Provider>
  )
}
