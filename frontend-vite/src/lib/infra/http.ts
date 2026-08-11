// Camada fina sobre `fetch` que garante uma coisa só: nenhuma request do
// app pode ficar pendurada pra sempre.
//
// Motivação (bug do "Validando sessao..." travado por ~3 min num PWA no
// iPhone): quando o app volta do background o socket TCP anterior costuma
// estar morto. Um `fetch` sem AbortController fica pendurado até o timeout
// do sistema operacional — 2 a 3 minutos — e a Promise simplesmente não
// resolve. Se alguma tela estiver bloqueada nesse await, ela congela junto.
//
// Somando o cold start do Render free (o serviço dorme após 15 min ocioso
// e leva 30-60s pra acordar), a primeira request depois de um tempo parado
// é sempre a mais lenta do app. Timeout explícito + retry controlado é o
// que transforma isso em "lento porém previsível" em vez de "travado".

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

// Chamadas disparadas por uma ação do usuário: precisa responder ou falhar
// rápido o suficiente pra UI mostrar um erro acionável.
export const DEFAULT_TIMEOUT_MS = 20_000

// Revalidação silenciosa em background: ninguém está olhando, então vale a
// pena esperar o cold start inteiro em vez de desistir e ficar sem dado.
export const BACKGROUND_TIMEOUT_MS = 60_000

// Erro de transporte (offline, DNS, timeout, conexão morta). Separado dos
// erros de API porque a decisão de negócio é oposta: um 401 do servidor
// significa "a sessão morreu, desloga"; um NetworkError significa "não deu
// pra perguntar", e nesse caso a sessão local tem que ser preservada.
export class NetworkError extends Error {
  readonly timedOut: boolean

  constructor(message: string, opts: { timedOut: boolean; cause?: unknown }) {
    super(message)
    this.name = 'NetworkError'
    this.timedOut = opts.timedOut
    this.cause = opts.cause
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError
}

// `fetch` + timeout. Não usamos AbortSignal.timeout/AbortSignal.any direto
// porque precisamos combinar com o signal que o caller possa ter passado
// (React Query, cleanup de useEffect) e o suporte de AbortSignal.any ainda
// é recente demais pro range de Safari/iOS que roda o PWA.
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const callerSignal = init?.signal

  if (callerSignal?.aborted) {
    controller.abort(callerSignal.reason)
  }

  const forwardAbort = () => controller.abort(callerSignal?.reason)
  callerSignal?.addEventListener('abort', forwardAbort, { once: true })

  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (timedOut) {
      throw new NetworkError(`Tempo esgotado após ${Math.round(timeoutMs / 1000)}s`, {
        timedOut: true,
        cause: error,
      })
    }
    // Abort vindo do caller: propaga como está, quem cancelou sabe lidar.
    if (callerSignal?.aborted) {
      throw error
    }
    throw new NetworkError('Falha de conexão', { timedOut: false, cause: error })
  } finally {
    clearTimeout(timeoutId)
    callerSignal?.removeEventListener('abort', forwardAbort)
  }
}

// Acorda o backend sem bloquear nada. O /ping é texto plano e não exige
// auth, então serve pra iniciar o cold start do Render em paralelo com o
// primeiro paint — quando o usuário terminar de digitar o login, o serviço
// já está de pé. Silencioso por definição: falhar aqui não muda nada.
export function warmApi(): void {
  void fetchWithTimeout(
    `${API_BASE_URL}/ping`,
    { method: 'GET', cache: 'no-store' },
    BACKGROUND_TIMEOUT_MS,
  ).catch(() => {
    /* keep-alive é best-effort */
  })
}
