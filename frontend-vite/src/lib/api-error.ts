// Re-exporta ApiError pra qualquer lib/service consumir sem importar do
// workoutService (que tem outras coisas). Deixa a importação de erro
// independente de qual service throw — útil pro PlanLimitDialogProvider
// que precisa testar `instanceof ApiError` em código generic.
//
// Quando o resto do código for limpo, ApiError vira nativo daqui e os
// services apenas importam.

export { ApiError } from '../services/workoutService'

// Helper genérico — parseia response JSON do backend (formato padrão
// { data?, error?: { message?, code?, details? } }) e lança ApiError
// quando response.ok === false. Mantém a forma uniforme dos throws sem
// duplicar boilerplate em cada service.
//
// IMPORTANTE: a partir daqui, todo service novo deve usar essa fn em
// vez de Error(message) — só assim o PlanLimitDialogProvider consegue
// detectar PLAN_LIMIT_REACHED universalmente.
import { ApiError } from '../services/workoutService'

export async function throwIfNotOk(
  response: Response,
  defaultMessage = 'Erro inesperado',
): Promise<void> {
  if (response.ok) return
  const json = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string; details?: unknown } }
    | null
  throw new ApiError(json?.error?.message ?? defaultMessage, {
    code: json?.error?.code,
    details: json?.error?.details,
    status: response.status,
  })
}
