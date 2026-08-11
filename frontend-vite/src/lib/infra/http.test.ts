import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkError, fetchWithTimeout, isNetworkError } from './http'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('fetchWithTimeout', () => {
  it('devolve a resposta quando a rede responde a tempo', async () => {
    const response = new Response('{}', { status: 200 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(fetchWithTimeout('/qualquer')).resolves.toBe(response)
  })

  it('aborta e lança NetworkError quando estoura o timeout', async () => {
    // Reproduz o bug do PWA: o socket morreu no background e o fetch
    // simplesmente nunca resolve. Sem timeout isso prende a UI por minutos.
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }),
    )

    vi.useFakeTimers()
    const pending = fetchWithTimeout('/pendura', undefined, 5_000)
    const assertion = expect(pending).rejects.toBeInstanceOf(NetworkError)
    await vi.advanceTimersByTimeAsync(5_000)
    await assertion
  })

  it('marca timedOut pra diferenciar timeout de falha de conexão', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await fetchWithTimeout('/offline').catch((err: unknown) => err)

    expect(isNetworkError(error)).toBe(true)
    expect((error as NetworkError).timedOut).toBe(false)
  })

  it('propaga o abort do caller sem mascarar como NetworkError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      }),
    )

    const controller = new AbortController()
    const pending = fetchWithTimeout('/cancelada', { signal: controller.signal })
    controller.abort()

    const error = await pending.catch((err: unknown) => err)
    expect(isNetworkError(error)).toBe(false)
    expect((error as DOMException).name).toBe('AbortError')
  })
})
