import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Props = {
  children: ReactNode
  // Optional custom fallback. If omitted, uses the default one.
  fallback?: (error: Error, reset: () => void) => ReactNode
  // Surfaced for telemetry hookup (Sentry, etc.). Caller decides what to do.
  onError?: (error: Error, info: ErrorInfo) => void
}

type State = { error: Error | null }

// Catches render-time crashes anywhere below it so one component blowing
// up doesn't take the whole app white-screen. Class component because React
// hooks don't expose componentDidCatch. Reset wipes the error state so the
// subtree can re-render after the user retries.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
    // Always log to console so dev sees it even without telemetry.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return <DefaultFallback error={error} onReset={this.reset} />
  }
}

function DefaultFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-rose-500/15 text-rose-500">
        <AlertTriangle size={22} />
      </div>
      <h2 className="text-lg font-extrabold text-[var(--text)]">Algo deu errado</h2>
      <p className="text-sm text-[var(--muted)]">
        Encontramos um problema ao carregar essa parte da página. Você pode
        tentar de novo — se persistir, recarregue a aba.
      </p>
      <details className="w-full rounded-lg bg-[var(--surface-hover)] p-2 text-left">
        <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
          Detalhe técnico
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] text-[var(--muted)]">
          {error.message}
        </pre>
      </details>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)]"
        >
          <RefreshCw size={13} />
          Tentar de novo
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          Recarregar página
        </button>
      </div>
    </section>
  )
}
