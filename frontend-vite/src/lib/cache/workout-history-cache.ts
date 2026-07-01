import type { WorkoutHistoryResponse } from '../../types/workout'
import { listWorkoutHistory } from '../../services/workoutService'
import { createApiCache } from './api-cache'

// Cache compartilhado do histórico de treinos.
//
// Por quê: TrainPage E HomePage carregam o mesmo `listWorkoutHistory` no
// mount pra calcular streak, "última rotina" e heatmap. Sem cache, navegar
// entre as duas faz 2 requests redundantes a cada visita.
//
// TTL de 2 min: histórico só muda quando o user salva um treino (mais raro
// que mudar rotina). O cache também é invalidado explicitamente no save
// pra refletir o novo treino sem esperar TTL.
//
// O cache armazena SEMPRE a primeira página com 50 itens — formato que
// tanto HomePage quanto TrainPage consomem. Páginas seguintes (paginação
// no /profile/historico) NÃO usam esse cache, vão direto no service.

const HISTORY_PAGE = 1
const HISTORY_LIMIT = 50

export const workoutHistoryCache = createApiCache<WorkoutHistoryResponse>({
  ttlMs: 2 * 60 * 1000,
  storageKey: 'acad:workout-history-cache:v1',
  fetcher: (authorizedFetch) => listWorkoutHistory(authorizedFetch, HISTORY_PAGE, HISTORY_LIMIT),
})
