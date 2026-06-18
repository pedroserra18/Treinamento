import { type FormEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronRight, RefreshCw, Search, Inbox, AlertTriangle, Flag, FileText, Clock, Check } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  STATUS_COLORS,
  STATUS_LABELS,
  TOPIC_LABELS,
  adminAutoClose,
  adminListReports,
  adminListTickets,
  adminTicketCounts,
  adminUpdateStatus,
  type SupportTicketSummary,
  type TicketStatus,
} from '../services/supportService'

const SLA_MS = 48 * 60 * 60 * 1000

function relativeAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return 'há menos de 1h'
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

function userInitials(name: string | null, email: string): string {
  const src = name?.trim() || email
  return src.split(/\s+/).map((w) => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '?'
}

const STATUS_FILTERS: (TicketStatus | 'ALL')[] = ['ALL', 'OPEN', 'IN_PROGRESS', 'AWAITING_USER', 'RESOLVED', 'CLOSED']

const STATUS_FILTER_LABELS: Record<TicketStatus | 'ALL', string> = {
  ALL: 'Todos',
  OPEN: 'Abertos',
  IN_PROGRESS: 'Em análise',
  AWAITING_USER: 'Aguardando usuário',
  RESOLVED: 'Resolvidos',
  CLOSED: 'Fechados',
}

const PAGE_SIZE = 20

export function AdminSupportPage() {
  const { authorizedFetch } = useAuth()
  const [items, setItems] = useState<SupportTicketSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loadedPages, setLoadedPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [autoClosing, setAutoClosing] = useState(false)
  const [autoCloseInfo, setAutoCloseInfo] = useState<string | null>(null)
  const [reportsCount, setReportsCount] = useState<number | null>(null)
  const [counts, setCounts] = useState<Partial<Record<TicketStatus, number>>>({})
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null)

  // Estado atual acessível dentro de timers/callbacks sem stale closures.
  const stateRef = useRef({ statusFilter, search, loadedPages })
  stateRef.current = { statusFilter, search, loadedPages }

  // Busca as páginas 1..N em paralelo e funde (dedupe por id). Refazer tudo a
  // cada poll evita bugs de ordenação ao mesclar páginas que mudaram no meio.
  const fetchAll = useCallback(async (pages: number) => {
    const { statusFilter: sf, search: q } = stateRef.current
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        adminListTickets(authorizedFetch, {
          status: sf === 'ALL' ? undefined : sf,
          search: q.trim() || undefined,
          page: i + 1,
          pageSize: PAGE_SIZE,
        }),
      ),
    )
    const seen = new Set<string>()
    const merged: SupportTicketSummary[] = []
    for (const r of results) for (const t of r.items) if (!seen.has(t.id)) { seen.add(t.id); merged.push(t) }
    return { items: merged, total: results[results.length - 1]?.total ?? 0 }
  }, [authorizedFetch])

  const refreshCounts = useCallback(async () => {
    try { setCounts(await adminTicketCounts(authorizedFetch)) } catch { /* silencioso */ }
  }, [authorizedFetch])

  const refreshReportsCount = useCallback(async () => {
    try { const d = await adminListReports(authorizedFetch); setReportsCount(d.items.length) } catch { /* silencioso */ }
  }, [authorizedFetch])

  // Carrega `pages` páginas. silent = não mexe no spinner principal (poll).
  const load = useCallback(async (pages: number, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const data = await fetchAll(pages)
      setItems(data.items)
      setTotal(data.total)
      setLoadedPages(pages)
      setError(null)
    } catch (err) {
      if (!opts?.silent) setError(err instanceof Error ? err.message : 'Erro ao carregar tickets')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [fetchAll])

  // Filtro muda → recarrega da página 1 (sem debounce, é clique).
  useEffect(() => {
    void load(1)
    void refreshCounts()
  }, [statusFilter, load, refreshCounts])

  // Busca instantânea com debounce de 400ms (pula o 1º render p/ não duplicar).
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return }
    const id = setTimeout(() => { void load(1); void refreshCounts() }, 400)
    return () => clearTimeout(id)
  }, [search, load, refreshCounts])

  useEffect(() => {
    void refreshReportsCount()
  }, [refreshReportsCount])

  // Poll 20s + ao focar: refaz as páginas carregadas + contagens. Silencioso.
  useEffect(() => {
    const tick = () => {
      void load(stateRef.current.loadedPages, { silent: true })
      void refreshCounts()
      void refreshReportsCount()
    }
    const interval = setInterval(tick, 20_000)
    const onFocus = () => tick()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [load, refreshCounts, refreshReportsCount])

  const loadMore = async () => {
    setLoadingMore(true)
    try { await load(stateRef.current.loadedPages + 1, { silent: true }) } finally { setLoadingMore(false) }
  }

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    void load(1)
    void refreshCounts()
  }

  const handleAutoClose = async () => {
    setAutoClosing(true)
    setAutoCloseInfo(null)
    try {
      const result = await adminAutoClose(authorizedFetch)
      setAutoCloseInfo(`${result.closed} ticket(s) fechado(s) por inatividade.`)
      await load(stateRef.current.loadedPages, { silent: true })
      void refreshCounts()
    } catch (err) {
      setAutoCloseInfo(err instanceof Error ? err.message : 'Erro ao fechar tickets')
    } finally {
      setAutoClosing(false)
    }
  }

  // Ação rápida: resolver o ticket sem abrir (otimista + rollback no erro).
  const handleQuickResolve = async (e: MouseEvent, ticketId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (statusBusyId) return
    setStatusBusyId(ticketId)
    setItems((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: 'RESOLVED' } : t)))
    try {
      await adminUpdateStatus(authorizedFetch, ticketId, 'RESOLVED')
      void refreshCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao resolver ticket')
      void load(stateRef.current.loadedPages, { silent: true })
    } finally {
      setStatusBusyId(null)
    }
  }

  const allCount = useMemo(() => Object.values(counts).reduce((a, b) => a + (b ?? 0), 0), [counts])
  const hasMore = items.length < total

  // Ordena por urgência: SLA estourado primeiro, depois "aguardando resposta",
  // depois o resto — dentro de cada grupo, atividade mais recente no topo.
  const sortedItems = useMemo(() => {
    const rank = (t: SupportTicketSummary): number => {
      const needsReply = t.lastMessageRole === 'USER' && t.status !== 'RESOLVED' && t.status !== 'CLOSED'
      if (!needsReply) return 2
      return Date.now() - new Date(t.lastActivityAt).getTime() > SLA_MS ? 0 : 1
    }
    return [...items].sort(
      (a, b) => rank(a) - rank(b) || new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    )
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
          Total na fila: <span className="font-bold text-[var(--text)]">{allCount}</span>
        </p>
        {/* Ações (atalhos) — estilo de borda/ghost pra NÃO se confundir com os
            chips de filtro (que usam preenchimento sólido quando ativos).
            Denúncias ganha tom de alerta vermelho só quando há pendências. */}
        <div className="relative mt-4 flex flex-wrap items-center gap-2">
          <Link
            to="/admin/support/reports"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              reportsCount && reportsCount > 0
                ? 'border-red-500/40 bg-red-500/10 text-red-500 hover:bg-red-500/15'
                : 'border-[var(--line)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <Flag size={13} className={reportsCount && reportsCount > 0 ? 'text-red-500' : 'text-[var(--muted)]'} />
            Denúncias
            {reportsCount && reportsCount > 0 ? (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
                {reportsCount > 99 ? '99+' : reportsCount}
              </span>
            ) : null}
          </Link>
          <Link
            to="/admin/support/templates"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            <FileText size={13} className="text-[var(--muted)]" />
            Respostas prontas
          </Link>
          <button
            type="button"
            onClick={handleAutoClose}
            disabled={autoClosing}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            <Clock size={13} className="text-[var(--muted)]" />
            {autoClosing ? 'Processando...' : 'Auto-fechar inativos'}
          </button>
          {autoCloseInfo ? <span className="self-center text-[11px] text-[var(--muted)]">{autoCloseInfo}</span> : null}
        </div>
      </motion.header>

      {/* Filters — com contagem por status (badge) */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => {
          const active = statusFilter === s
          const count = s === 'ALL' ? allCount : (counts[s] ?? 0)
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                active
                  ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                  : 'border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              {STATUS_FILTER_LABELS[s]}
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                  active ? 'bg-white/25 text-white' : 'bg-[var(--surface-hover)] text-[var(--muted)]'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search — instantânea (debounce) + Enter/botão pra forçar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
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
        <>
          <ul className="space-y-2">
            {sortedItems.map((t) => {
              const needsReply = t.lastMessageRole === 'USER' && t.status !== 'RESOLVED' && t.status !== 'CLOSED'
              const slaBreached = needsReply && Date.now() - new Date(t.lastActivityAt).getTime() > SLA_MS
              const canResolve = t.status !== 'RESOLVED' && t.status !== 'CLOSED'
              return (
                <li key={t.id}>
                  <Link
                    to={`/admin/support/${t.id}`}
                    className={`flex items-center gap-3 rounded-2xl border bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--surface-hover)] ${
                      slaBreached ? 'border-red-400/60' : needsReply ? 'border-[var(--brand)]/40' : 'border-[var(--line)]'
                    }`}
                  >
                    {/* Avatar do usuário (#7) */}
                    {t.user.avatarUrl ? (
                      <img src={t.user.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-hover)] text-[11px] font-bold text-[var(--muted)]">
                        {userInitials(t.user.name, t.user.email)}
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[var(--muted)]">{t.code}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[t.status]}`}>
                          {STATUS_LABELS[t.status]}
                        </span>
                        <span className="text-[10px] text-[var(--muted)]">{TOPIC_LABELS[t.topic]}</span>
                        <span className="truncate text-[10px] text-[var(--muted)]">· {t.user.name ?? t.user.email}</span>
                        {slaBreached ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-500">
                            <AlertTriangle size={10} /> SLA 48h
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm font-bold text-[var(--text)]">{t.subject}</p>
                      {t.lastMessagePreview ? (
                        <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                          <span className="font-semibold">{t.lastMessageRole === 'ADMIN' ? 'Você: ' : 'Cliente: '}</span>
                          {t.lastMessagePreview}
                        </p>
                      ) : null}
                      {/* Tempo (#3): destaca a espera quando precisa de resposta */}
                      {needsReply ? (
                        <p className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-bold ${slaBreached ? 'text-red-500' : 'text-[var(--brand)]'}`}>
                          <Clock size={11} /> Esperando resposta {relativeAge(t.lastActivityAt)}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">Atualizado {relativeAge(t.lastActivityAt)}</p>
                      )}
                    </div>

                    {/* Ação rápida (#6): resolver sem abrir */}
                    {canResolve ? (
                      <button
                        type="button"
                        onClick={(e) => void handleQuickResolve(e, t.id)}
                        disabled={statusBusyId === t.id}
                        title="Marcar como resolvido"
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-500 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
                      >
                        <Check size={13} />
                        Resolver
                      </button>
                    ) : null}
                    <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
                  </Link>
                </li>
              )
            })}
          </ul>

          {/* Paginação (#4) */}
          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="mx-auto mt-3 block rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              {loadingMore ? 'Carregando...' : `Carregar mais (${items.length}/${total})`}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}
