import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, RefreshCw, Search, Inbox } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  STATUS_COLORS,
  STATUS_LABELS,
  TOPIC_LABELS,
  adminAutoClose,
  adminListTickets,
  type SupportTicketSummary,
  type TicketStatus,
} from '../services/supportService'

const STATUS_FILTERS: (TicketStatus | 'ALL')[] = ['ALL', 'OPEN', 'IN_PROGRESS', 'AWAITING_USER', 'RESOLVED', 'CLOSED']

const STATUS_FILTER_LABELS: Record<TicketStatus | 'ALL', string> = {
  ALL: 'Todos',
  OPEN: 'Abertos',
  IN_PROGRESS: 'Em análise',
  AWAITING_USER: 'Aguardando usuário',
  RESOLVED: 'Resolvidos',
  CLOSED: 'Fechados',
}

export function AdminSupportPage() {
  const { authorizedFetch } = useAuth()
  const [items, setItems] = useState<SupportTicketSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [autoClosing, setAutoClosing] = useState(false)
  const [autoCloseInfo, setAutoCloseInfo] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await adminListTickets(authorizedFetch, {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: search.trim() || undefined,
        page: 1,
        pageSize: 50,
      })
      setItems(data.items)
      setTotal(data.total)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar tickets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [statusFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAutoClose = async () => {
    setAutoClosing(true)
    setAutoCloseInfo(null)
    try {
      const result = await adminAutoClose(authorizedFetch)
      setAutoCloseInfo(`${result.closed} ticket(s) fechado(s) por inatividade.`)
      await refresh()
    } catch (err) {
      setAutoCloseInfo(err instanceof Error ? err.message : 'Erro ao fechar tickets')
    } finally {
      setAutoClosing(false)
    }
  }

  const groupedByStatus = useMemo(() => {
    const groups: Record<string, number> = {}
    for (const t of items) groups[t.status] = (groups[t.status] ?? 0) + 1
    return groups
  }, [items])

  return (
    <section className="space-y-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl animate-[tech-spin_22s_linear_infinite]"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Admin · Suporte</p>
        <h1 className="relative mt-2 flex items-center gap-2 text-2xl font-black text-[var(--text)]">
          <Inbox size={22} />
          Fila de tickets
        </h1>
        <p className="relative mt-1 text-sm text-[var(--muted)]">
          Total: <span className="font-bold text-[var(--text)]">{total}</span>
          {Object.keys(groupedByStatus).length > 0 ? (
            <span className="ml-2 text-xs">
              ({Object.entries(groupedByStatus).map(([k, v]) => `${STATUS_LABELS[k as TicketStatus]}: ${v}`).join(', ')})
            </span>
          ) : null}
        </p>
        <div className="relative mt-3 flex flex-wrap gap-2">
          <Link
            to="/admin/support/templates"
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            Respostas prontas
          </Link>
          <button
            type="button"
            onClick={handleAutoClose}
            disabled={autoClosing}
            className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            {autoClosing ? 'Processando...' : 'Auto-fechar inativos'}
          </button>
          {autoCloseInfo ? <span className="self-center text-[11px] text-[var(--muted)]">{autoCloseInfo}</span> : null}
        </div>
      </motion.header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {STATUS_FILTER_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void refresh()
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por #ID, e-mail, nome ou assunto"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <RefreshCw size={14} /> Atualizar
        </button>
      </form>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Carregando...</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-8 text-center">
          <p className="text-sm text-[var(--muted)]">Nenhum ticket nesse filtro.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id}>
              <Link
                to={`/admin/support/${t.id}`}
                className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--surface-hover)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[var(--muted)]">{t.code}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[t.status]}`}>
                      {STATUS_LABELS[t.status]}
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">{TOPIC_LABELS[t.topic]}</span>
                    <span className="text-[10px] text-[var(--muted)]">· {t.user.name ?? t.user.email}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-bold text-[var(--text)]">{t.subject}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    Atualizado em {new Date(t.lastActivityAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
