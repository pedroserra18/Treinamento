import type { ExerciseOption } from '../types/workout'
import { searchExercisesForPlan } from '../services/workoutService'

// Cache em módulo do catálogo de exercícios.
//
// Por quê: o catálogo é estável (admins quase nunca adicionam/removem
// exercícios globais; user adiciona exercícios privados raramente). Mas
// o app refetcheava 300 exercícios em cada ABERTURA do modal "Adicionar
// exercício" + em cada montagem da TrainPage pra syncExerciseMetadata.
// Isso era 1-3s perceptíveis cada vez.
//
// Estratégia:
// - Cache em memória com TTL de 5 minutos (cobre uma sessão de treino
//   inteira sem refetch desnecessário; expira quando o app vira de
//   background pra mais de 5 min).
// - Coalesce in-flight: se 3 telas pedem ao mesmo tempo, faz UM request
//   e devolve a mesma promise. Evita stampede no cold start.
// - Invalidação explícita pra casos de mudança (criou/excluiu exercício
//   privado).
//
// O cache mora em variável de módulo, então sobrevive entre re-renders
// e navegações dentro do SPA. Some quando o user faz hard reload — o
// que é OK, raro e barato.

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const TTL_MS = 5 * 60 * 1000
const CATALOG_LIMIT = 300

let cache: { data: ExerciseOption[]; loadedAt: number } | null = null
let pending: Promise<ExerciseOption[]> | null = null

// Retorna o catálogo do cache se válido; senão busca no backend e cacheia.
// Coalesce múltiplas chamadas concorrentes no mesmo request HTTP.
export async function getExerciseCatalogCached(authorizedFetch: AuthorizedFetch): Promise<ExerciseOption[]> {
  const now = Date.now()
  if (cache && now - cache.loadedAt < TTL_MS) {
    return cache.data
  }
  if (pending) {
    return pending
  }
  pending = searchExercisesForPlan(authorizedFetch, { limit: CATALOG_LIMIT })
    .then((data) => {
      cache = { data, loadedAt: Date.now() }
      pending = null
      return data
    })
    .catch((err) => {
      pending = null
      throw err
    })
  return pending
}

// Dispara o request em background sem aguardar — usado pra pre-aquecer
// o cache quando a TrainPage monta, antes do user abrir o modal. Falha
// silenciosa: se errar, o próximo getExerciseCatalogCached cobre.
export function prefetchExerciseCatalog(authorizedFetch: AuthorizedFetch): void {
  void getExerciseCatalogCached(authorizedFetch).catch(() => { /* silencioso */ })
}

// Invalida o cache forçando refetch na próxima chamada. Usar quando o
// user cria ou deleta um exercício privado pra ele aparecer/sumir nos
// pickers da próxima abertura.
export function invalidateExerciseCatalog(): void {
  cache = null
}

// Retorna a versão atualmente cacheada SEM disparar fetch. Útil pra
// renderização síncrona inicial — se o cache tá quente, evita o flash
// de skeleton.
export function peekExerciseCatalog(): ExerciseOption[] | null {
  if (!cache) return null
  if (Date.now() - cache.loadedAt >= TTL_MS) return null
  return cache.data
}
