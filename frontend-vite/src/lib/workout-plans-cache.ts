import type { WorkoutPlan } from '../types/workout'
import { listWorkoutPlans } from '../services/workoutService'

// Cache compartilhado das rotinas (workout plans) do usuário.
//
// Por quê: a TrainPage refetcheava a lista de rotinas TODA vez que o
// componente montava (entrar na page, voltar de outra rota, etc). Como
// rotinas mudam pouco (criar/deletar não é constante), isso era custo
// puro — especialmente no cold start do Render que faz a primeira
// request demorar 30-60s.
//
// Estratégia stale-while-revalidate (padrão usado em Twitter, Strava,
// Linear):
//   1. Memória em módulo (sobrevive entre re-renders e nav)
//   2. Persistência em localStorage (sobrevive entre sessões — reload
//      mostra a lista imediato)
//   3. Quando a UI lê, retorna o que tem cache (instantâneo) E dispara
//      refetch em background pra atualizar pra próxima leitura.
//
// TTL menor que catálogo de exercícios (1 min vs 5 min) porque rotinas
// mudam mais — user cria/edita/deleta com mais frequência que admin
// adiciona exercício global.

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const STORAGE_KEY = 'acad:workout-plans-cache:v1'
const TTL_MS = 60 * 1000

type CachedPlans = {
  plans: WorkoutPlan[]
  loadedAt: number
}

let memCache: CachedPlans | null = null
let pending: Promise<WorkoutPlan[]> | null = null

function readFromStorage(): CachedPlans | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedPlans | null
    if (!parsed || !Array.isArray(parsed.plans) || typeof parsed.loadedAt !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writeToStorage(data: CachedPlans): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Quota cheia / modo privado — degrada pra cache só em memória.
  }
}

// Leitura síncrona — pra inicializar useState com algo já renderizável,
// sem flash de skeleton. Não dispara fetch.
export function peekWorkoutPlans(): WorkoutPlan[] | null {
  if (memCache) return memCache.plans
  const persisted = readFromStorage()
  if (!persisted) return null
  memCache = persisted
  return persisted.plans
}

// Stale-while-revalidate: retorna cache se TTL não estourou; senão busca
// e cacheia. Múltiplas chamadas concorrentes coalesce numa única request.
export async function getWorkoutPlansCached(authorizedFetch: AuthorizedFetch): Promise<WorkoutPlan[]> {
  const now = Date.now()
  if (memCache && now - memCache.loadedAt < TTL_MS) {
    return memCache.plans
  }
  if (pending) return pending
  pending = listWorkoutPlans(authorizedFetch)
    .then((plans) => {
      const cached = { plans, loadedAt: Date.now() }
      memCache = cached
      writeToStorage(cached)
      pending = null
      return plans
    })
    .catch((err) => {
      pending = null
      throw err
    })
  return pending
}

// Atualiza o cache localmente sem hit no backend. Usado por optimistic
// updates (delete de rotina, criação, edição) pra a próxima leitura
// ver o estado consistente sem refetch.
export function setWorkoutPlansCache(plans: WorkoutPlan[]): void {
  const cached = { plans, loadedAt: Date.now() }
  memCache = cached
  writeToStorage(cached)
}

// Invalida tudo — usado em logout e em fluxos onde sabemos que a próxima
// leitura PRECISA ser fresca (ex.: criar nova rotina e voltar pra dash).
export function invalidateWorkoutPlansCache(): void {
  memCache = null
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
