// Factory genérica pra cache stale-while-revalidate de qualquer
// resposta API. Substitui a duplicação que tava começando entre
// exercise-catalog-cache, workout-plans-cache e os caches novos
// (workout-history, progress-data, etc).
//
// Padrão "Twitter / Strava / Linear":
//   - peek(): leitura SÍNCRONA pra inicializar useState — renderiza
//     instantâneo, sem flash de skeleton
//   - get(): retorna cache se TTL não estourou; senão fetch + cacheia.
//     Coalesce in-flight: 3 telas pedindo ao mesmo tempo = 1 request.
//   - prefetch(): fire-and-forget pra pré-aquecer.
//   - set(): atualiza cache local sem hit no backend (pra optimistic
//     updates).
//   - invalidate(): força próxima get a refetch.
//
// localStorage opcional — quando passado um storageKey, o cache
// sobrevive entre sessões (reload do browser mostra a página instantâneo).
// Quando null, só fica em memória (ideal pra dados sensíveis ou que
// não devem persistir).
//
// O TTL é responsabilidade do caller — escolher considerando quanto
// tempo o dado pode ficar "errado" sem o user reclamar. Histórico de
// treino pode ter TTL alto (5min); usuário pendente de invite pode ter
// TTL baixo (10s).

type AuthorizedFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export type ApiCache<T> = {
  peek: () => T | null
  get: (authorizedFetch: AuthorizedFetch) => Promise<T>
  prefetch: (authorizedFetch: AuthorizedFetch) => void
  set: (data: T) => void
  invalidate: () => void
}

type CachedEntry<T> = {
  data: T
  loadedAt: number
}

// Toda instância se registra aqui pra que o logout consiga zerar tudo de
// uma vez. Sem isso, o próximo usuário a logar NESTE dispositivo veria o
// histórico/feed/progresso do anterior no primeiro paint — as telas
// renderizam do cache antes de qualquer request voltar.
const registry = new Set<{ invalidate: () => void }>()

export function clearAllApiCaches(): void {
  for (const cache of registry) {
    cache.invalidate()
  }
}

export function createApiCache<T>(opts: {
  ttlMs: number
  storageKey: string | null
  fetcher: (authorizedFetch: AuthorizedFetch) => Promise<T>
  // Validador opcional pra rejeitar payloads corrompidos no localStorage
  // (ex.: schema mudou e o JSON antigo virou ruído). Quando retorna
  // false, o cache em disco é descartado.
  validate?: (data: unknown) => data is T
}): ApiCache<T> {
  let mem: CachedEntry<T> | null = null
  let pending: Promise<T> | null = null

  function readFromStorage(): CachedEntry<T> | null {
    if (!opts.storageKey) return null
    try {
      const raw = window.localStorage.getItem(opts.storageKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as CachedEntry<T> | null
      if (!parsed || typeof parsed.loadedAt !== 'number') return null
      if (opts.validate && !opts.validate(parsed.data)) return null
      return parsed
    } catch {
      return null
    }
  }

  function writeToStorage(entry: CachedEntry<T>): void {
    if (!opts.storageKey) return
    try {
      window.localStorage.setItem(opts.storageKey, JSON.stringify(entry))
    } catch {
      // Quota cheia / modo privado — degrada pro cache só em memória.
    }
  }

  function clearStorage(): void {
    if (!opts.storageKey) return
    try {
      window.localStorage.removeItem(opts.storageKey)
    } catch {
      /* ignore */
    }
  }

  const cache: ApiCache<T> = {
    peek(): T | null {
      if (mem) return mem.data
      const fromStorage = readFromStorage()
      if (!fromStorage) return null
      mem = fromStorage
      return fromStorage.data
    },

    async get(authorizedFetch: AuthorizedFetch): Promise<T> {
      const now = Date.now()
      if (mem && now - mem.loadedAt < opts.ttlMs) {
        return mem.data
      }
      if (pending) return pending
      pending = opts
        .fetcher(authorizedFetch)
        .then((data) => {
          const entry = { data, loadedAt: Date.now() }
          mem = entry
          writeToStorage(entry)
          pending = null
          return data
        })
        .catch((err) => {
          pending = null
          throw err
        })
      return pending
    },

    prefetch(authorizedFetch: AuthorizedFetch): void {
      void this.get(authorizedFetch).catch(() => { /* silencioso */ })
    },

    set(data: T): void {
      const entry = { data, loadedAt: Date.now() }
      mem = entry
      writeToStorage(entry)
    },

    invalidate(): void {
      mem = null
      pending = null
      clearStorage()
    },
  }

  registry.add(cache)
  return cache
}
