import type {
  BodyMeasurementHistoryResponse,
  ExerciseProgressResponse,
  ProgressSummaryResponse,
} from '../types/progress'
import {
  getExerciseProgress,
  getProgressSummary,
  listBodyMeasurements,
} from '../services/progressService'
import { createApiCache } from './api-cache'

// Caches da ProgressPage. 3 endpoints rodados em paralelo no mount:
//   • getExerciseProgress: lista de exercícios pinned + sparklines
//   • listBodyMeasurements: histórico de peso/medidas (30 últimas)
//   • getProgressSummary: heatmap + aggregates do ano atual
//
// Cada um vira cache separado porque:
//   1. Invalidam em momentos diferentes (pin exercise, salvar measurement,
//      salvar treino)
//   2. Tamanhos diferentes — pinned é pequeno (atualiza rápido),
//      summary é grande (atualiza mais devagar)
//   3. Permite invalidar fino sem refetch desnecessário de tudo
//
// TTL 2 min — mesma janela do workout-history. Dados de progresso
// também só mudam quando o user faz ação no app (fixar exercício,
// registrar medida, salvar treino). Cache invalida automático nessas
// ações (TODO: hook up no PinExerciseButton, etc).

export const exerciseProgressCache = createApiCache<ExerciseProgressResponse>({
  ttlMs: 2 * 60 * 1000,
  storageKey: 'acad:exercise-progress-cache:v1',
  fetcher: getExerciseProgress,
})

export const bodyMeasurementsCache = createApiCache<BodyMeasurementHistoryResponse>({
  ttlMs: 2 * 60 * 1000,
  storageKey: 'acad:body-measurements-cache:v1',
  fetcher: listBodyMeasurements,
})

// Summary do ano atual fica em cache. Pra anos passados (heatmap year
// picker) NÃO usamos cache — vai direto no service. Anos antigos mudam
// raramente E o user só clica neles de propósito, então a latência
// natural é OK.
export const currentYearProgressSummaryCache = createApiCache<ProgressSummaryResponse>({
  ttlMs: 2 * 60 * 1000,
  storageKey: 'acad:progress-summary-current-year:v1',
  fetcher: (authorizedFetch) => getProgressSummary(authorizedFetch),
})
