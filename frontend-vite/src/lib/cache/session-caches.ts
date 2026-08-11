// Ponto único de limpeza dos dados que pertencem ao usuário logado.
//
// Chamado no logout e quando o servidor invalida a sessão. Importa porque
// as telas renderizam do cache ANTES de qualquer request voltar (é o que
// dá a sensação de app instantâneo): se o cache sobreviver a uma troca de
// conta no mesmo aparelho, o próximo usuário vê o histórico, o feed e o
// progresso do anterior no primeiro paint.
//
// Preferências que não são do usuário (tema, snooze do banner de install)
// ficam de fora de propósito — são do dispositivo, não da conta.

import { clearAllApiCaches } from './api-cache'
import { clearCommentsCache } from './comments-cache'
import { invalidateExerciseCatalog } from './exercise-catalog-cache'
import { invalidateWorkoutPlansCache } from './workout-plans-cache'
import { clearActiveWorkout } from '../workout/active-workout-storage'

export function clearUserScopedCaches(): void {
  clearAllApiCaches()
  clearCommentsCache()
  invalidateExerciseCatalog()
  invalidateWorkoutPlansCache()
  // O treino em andamento é o mais sensível da lista: sem isso, quem
  // logasse depois herdaria a sessão de treino aberta de outra pessoa.
  clearActiveWorkout()

  // O service worker também guarda respostas de API (NetworkFirst, TTL de
  // 30s) indexadas só pela URL. Precisa cair junto pelo mesmo motivo.
  if ('caches' in window) {
    void caches.delete('api-cache').catch(() => {
      /* best-effort: falhar aqui não pode travar o logout */
    })
  }
}
