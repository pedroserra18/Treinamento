import { useContext } from 'react'
import { PlanLimitContext } from './plan-limit-context'

// Hook separado do Provider pra atender a regra react-refresh/only-export-components
// (componentes e hooks/funções não podem morar no mesmo arquivo).
type ShowLimitDialog = (feature: string, current: number, limit: number) => void

export function useShowPlanLimit(): ShowLimitDialog {
  const ctx = useContext(PlanLimitContext)
  if (!ctx) {
    return () => undefined
  }
  return ctx
}
