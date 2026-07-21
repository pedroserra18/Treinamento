import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAdminUsers } from '../hooks/useAdminUsers'
import {
  deactivateUserByAdmin,
  deleteUserByAdmin,
  getUserDetailForAdmin,
  listUsersForAdmin,
  reactivateUserByAdmin,
  updateUserPlanByAdmin,
  updateUserRoleByAdmin,
} from '../services/adminService'
import type { AdminSortBy, AdminUser, AdminUserDetail } from '../types/admin'
import {
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Crown,
  Download,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import {
  PAGE_SIZE,
  formatDate,
  formatTime,
  relativeTime,
  initials,
  avatarGradient,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  onboardingProgress,
  downloadCsv,
  roleTone,
  type StatusFilter,
  type RoleFilter,
  type OnbFilter,
  type PlanFilter,
  type SortOrder,
  type PendingAction,
} from './admin/admin-users-utils'
import {
  CountUp, Pill, StatusPill, IconButton, SkeletonRows, SortHeader,
} from './admin/admin-users-ui'
import { ConfirmModal } from './admin/ConfirmModal'
import { UserDrawer } from './admin/UserDrawer'

function pageWindow(current: number, totalPages: number): number[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1])
  return Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const { user: authUser, authorizedFetch } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // Estado inicial vem da URL (filtros persistentes / compartilháveis).
  const [accountScope, setAccountScope] = useState<'REAL' | 'TEST' | 'ALL'>(
    (['REAL', 'TEST', 'ALL'].includes(searchParams.get('scope') ?? '') ? searchParams.get('scope') : 'REAL') as 'REAL' | 'TEST' | 'ALL',
  )
  const [sortBy, setSortBy] = useState<AdminSortBy>((searchParams.get('sort') as AdminSortBy) || 'createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>((searchParams.get('dir') as SortOrder) || 'desc')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>((searchParams.get('role') as RoleFilter) || '')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>((searchParams.get('status') as StatusFilter) || '')
  const [onbFilter, setOnbFilter] = useState<OnbFilter>((searchParams.get('onb') as OnbFilter) || '')
  const [planFilter, setPlanFilter] = useState<PlanFilter>((searchParams.get('plan') as PlanFilter) || '')
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get('q') ?? '')
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get('page')) || 1))

  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [drawerDetail, setDrawerDetail] = useState<AdminUserDetail | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: 'ok' | 'err' }[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  const [exporting, setExporting] = useState(false)

  const pushToast = useCallback((msg: string, kind: 'ok' | 'err') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  // Debounce da busca.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(id)
  }, [query])

  // Volta para a página 1 quando filtros/busca/ordem mudam.
  useEffect(() => {
    setPage(1)
  }, [accountScope, sortBy, sortOrder, roleFilter, statusFilter, onbFilter, planFilter, debouncedQuery])

  // Persiste o estado na URL.
  useEffect(() => {
    const next = new URLSearchParams()
    if (accountScope !== 'REAL') next.set('scope', accountScope)
    if (sortBy !== 'createdAt') next.set('sort', sortBy)
    if (sortOrder !== 'desc') next.set('dir', sortOrder)
    if (roleFilter) next.set('role', roleFilter)
    if (statusFilter) next.set('status', statusFilter)
    if (onbFilter) next.set('onb', onbFilter)
    if (planFilter) next.set('plan', planFilter)
    if (debouncedQuery) next.set('q', debouncedQuery)
    if (page > 1) next.set('page', String(page))
    setSearchParams(next, { replace: true })
  }, [accountScope, sortBy, sortOrder, roleFilter, statusFilter, onbFilter, planFilter, debouncedQuery, page, setSearchParams])

  const listingOptions = useMemo(
    () => ({
      accountScope,
      includeTest: accountScope !== 'REAL',
      sortBy,
      sortOrder,
      search: debouncedQuery,
      role: roleFilter || undefined,
      status: statusFilter || undefined,
      onboarding: onbFilter || undefined,
      plan: planFilter || undefined,
    }),
    [accountScope, sortBy, sortOrder, debouncedQuery, roleFilter, statusFilter, onbFilter, planFilter],
  )

  const { data, loading, error, refresh } = useAdminUsers(page, PAGE_SIZE, listingOptions)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Trava a rolagem do fundo enquanto o modal ou o drawer está aberto (só a
  // sobreposição rola). Compensa a barra de rolagem pra não dar salto de layout.
  useEffect(() => {
    if (!pending && !drawerId) return
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth
    const prevOverflow = document.body.style.overflow
    const prevPaddingRight = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPaddingRight
    }
  }, [pending, drawerId])

  // Carrega o detalhe quando o drawer abre.
  useEffect(() => {
    if (!drawerId) {
      setDrawerDetail(null)
      return
    }
    let cancelled = false
    setDrawerLoading(true)
    void getUserDetailForAdmin(authorizedFetch, drawerId)
      .then((d) => { if (!cancelled) setDrawerDetail(d) })
      .catch((err) => {
        if (!cancelled) {
          pushToast(err instanceof Error ? err.message : 'Erro ao carregar detalhes', 'err')
          setDrawerId(null)
        }
      })
      .finally(() => { if (!cancelled) setDrawerLoading(false) })
    return () => { cancelled = true }
  }, [drawerId, authorizedFetch, pushToast])

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // Evita ficar preso numa página vazia (ex: após excluir o último item da
  // página). Ajuste durante o render — converge sem useEffect.
  if (!loading && data && page > totalPages) {
    setPage(totalPages)
  }
  const summary = data?.summary ?? { realCount: 0, testCount: 0, totalCount: 0, newRealLast7Days: 0, proRealCount: 0 }
  const scopeLabel = accountScope === 'REAL' ? 'somente reais' : accountScope === 'TEST' ? 'somente teste' : 'reais + teste'
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)
  const hasFilters = Boolean(roleFilter || statusFilter || onbFilter || planFilter || debouncedQuery)

  const onSort = (field: AdminSortBy) => {
    if (field === sortBy) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder(['name', 'email', 'status', 'role'].includes(field) ? 'asc' : 'desc')
    }
  }

  const clearFilters = () => {
    setRoleFilter('')
    setStatusFilter('')
    setOnbFilter('')
    setPlanFilter('')
    setQuery('')
  }

  // Exporta TODOS os usuários que casam com os filtros atuais (pagina até o
  // fim), não só a página visível. Monta o CSV no cliente e baixa.
  const handleExportCsv = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const all: AdminUser[] = []
      let p = 1
      for (;;) {
        const res = await listUsersForAdmin(authorizedFetch, p, 100, listingOptions)
        all.push(...res.items)
        if (res.items.length === 0 || all.length >= res.total || p >= 200) break
        p++
      }
      const headers = [
        'Nome', 'E-mail', 'Handle', 'Acesso', 'Assinatura', 'Status', 'Conta',
        'Onboarding', 'Altura (cm)', 'Peso (kg)', 'Experiência', 'Objetivo',
        'Dias/semana', 'Cadastro', 'Último login',
      ]
      const rows = all.map((u): (string | number | null)[] => {
        const onb = onboardingProgress(u)
        const fully = onb.filled === onb.total
        return [
          u.name ?? '',
          u.email,
          u.handle ? `@${u.handle}` : '',
          u.role,
          u.role === 'ADMIN' ? 'auto-PRO' : u.plan,
          u.status,
          u.accountType,
          fully ? 'Completo' : `Parcial ${onb.filled}/${onb.total}`,
          u.heightCm ?? '',
          u.weightKg ?? '',
          u.experienceLevel ? EXPERIENCE_LABELS[u.experienceLevel] ?? u.experienceLevel : '',
          u.primaryGoal ? GOAL_LABELS[u.primaryGoal] ?? u.primaryGoal : '',
          u.availableDaysPerWeek ?? '',
          u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : '',
          u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('pt-BR') : '',
        ]
      })
      downloadCsv(headers, rows, `usuarios-${new Date().toISOString().slice(0, 10)}.csv`)
      pushToast(`${all.length} usuário(s) exportado(s).`, 'ok')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Erro ao exportar', 'err')
    } finally {
      setExporting(false)
    }
  }

  const runAction = async () => {
    if (!pending) return
    setActionLoading(true)
    try {
      if (pending.kind === 'deactivate') {
        await deactivateUserByAdmin(authorizedFetch, pending.user.id)
        pushToast('Conta desativada.', 'ok')
      } else if (pending.kind === 'reactivate') {
        await reactivateUserByAdmin(authorizedFetch, pending.user.id)
        pushToast('Conta reativada.', 'ok')
      } else if (pending.kind === 'role') {
        await updateUserRoleByAdmin(authorizedFetch, pending.user.id, pending.newRole)
        pushToast(`Acesso alterado para ${pending.newRole}.`, 'ok')
        if (drawerId) {
          const fresh = await getUserDetailForAdmin(authorizedFetch, drawerId).catch(() => null)
          if (fresh) setDrawerDetail(fresh)
        }
      } else if (pending.kind === 'plan') {
        await updateUserPlanByAdmin(authorizedFetch, pending.user.id, pending.newPlan)
        pushToast(
          pending.newPlan === 'PRO'
            ? `${pending.user.name ?? 'Usuário'} agora é PRO.`
            : `${pending.user.name ?? 'Usuário'} voltou pro FREE.`,
          'ok',
        )
        if (drawerId) {
          const fresh = await getUserDetailForAdmin(authorizedFetch, drawerId).catch(() => null)
          if (fresh) setDrawerDetail(fresh)
        }
      } else {
        await deleteUserByAdmin(authorizedFetch, pending.user.id)
        pushToast('Conta excluída.', 'ok')
        if (pending.user.id === drawerId) setDrawerId(null)
      }
      setPending(null)
      await refresh()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Erro ao executar ação', 'err')
    } finally {
      setActionLoading(false)
    }
  }

  const segments: { key: 'REAL' | 'TEST' | 'ALL'; label: string; count: number }[] = [
    { key: 'REAL', label: 'Reais', count: summary.realCount },
    { key: 'TEST', label: 'Teste', count: summary.testCount },
    { key: 'ALL', label: 'Todas', count: summary.totalCount },
  ]

  return (
    <section className="space-y-3.5">
      {/* ── PAGE HEADER ─────────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(color-mix(in srgb, var(--brand) 8%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--brand) 8%, transparent) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(620px 240px at 12% 50%, #000 0%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(620px 240px at 12% 50%, #000 0%, transparent 70%)',
          }}
        />
        <span className="absolute right-5 top-5 z-[2] inline-flex items-center gap-1.5 rounded-full bg-[var(--text)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--surface)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)] ring-2 ring-[var(--brand)]/30" />
          Admin
        </span>
        <div className="relative z-[1] flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-strong)]">
              <span className="relative inline-flex h-[7px] w-[7px]">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand)] opacity-60" />
                <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-[var(--brand)]" />
              </span>
              Painel do admin · /admin/users
            </div>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-[var(--text)] sm:text-4xl">
              Usuários <span className="font-serif-accent italic font-normal text-[var(--brand-strong)]">cadastrados</span>
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--muted)]">
              Veja e gerencie todas as contas — usuários reais, contas de teste e ações administrativas em um só lugar.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div className="text-right">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Reais</div>
              <div className="mt-1 text-2xl font-semibold leading-none tracking-tight text-[var(--brand-strong)] sm:text-3xl"><CountUp target={summary.realCount} /></div>
              <div className="mt-1 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">{summary.newRealLast7Days > 0 ? `▲ ${summary.newRealLast7Days} esta semana` : 'sem novos · 7d'}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">PRO</div>
              <div className="mt-1 inline-flex items-center justify-end gap-1.5 text-2xl font-semibold leading-none tracking-tight text-amber-600 dark:text-amber-300 sm:text-3xl">
                <Crown size={18} className="text-amber-500" />
                <CountUp target={summary.proRealCount} />
              </div>
              <div className="mt-1 font-mono text-[10px] font-semibold text-[var(--muted)]">
                {summary.realCount > 0
                  ? `${Math.round((summary.proRealCount / summary.realCount) * 100)}% da base real`
                  : 'sem reais ainda'}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Teste</div>
              <div className="mt-1 text-2xl font-semibold leading-none tracking-tight text-[var(--text)] sm:text-3xl"><CountUp target={summary.testCount} /></div>
              <div className="mt-1 font-mono text-[10px] font-semibold text-[var(--muted)]">contas internas</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Base total</div>
              <div className="mt-1 text-2xl font-semibold leading-none tracking-tight text-[var(--text)] sm:text-3xl"><CountUp target={summary.totalCount} /></div>
              <div className="mt-1 font-mono text-[10px] font-semibold text-[var(--muted)]">reais + teste</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
      <div className="space-y-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5">
        <div className="grid grid-cols-1 items-center gap-2.5 md:grid-cols-[minmax(220px,1fr)_auto]">
          <label className="relative flex items-center rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5 focus-within:border-[var(--brand)] focus-within:bg-[var(--surface)]">
            <Search size={14} className="mr-2 text-[var(--muted)]" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, e-mail, handle ou ID…"
              className="flex-1 border-0 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
            />
            <kbd className="ml-2 hidden rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] sm:inline">⌘K</kbd>
          </label>

          <div className="inline-flex rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-1">
            {segments.map((seg) => (
              <button
                key={seg.key}
                type="button"
                onClick={() => setAccountScope(seg.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide transition-colors ${accountScope === seg.key ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
              >
                {seg.label}
                <span className={`rounded-full px-1.5 py-px font-mono text-[9.5px] ${accountScope === seg.key ? 'bg-[var(--brand)] text-white' : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text)]'}`}>{seg.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as RoleFilter)} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-xs font-semibold text-[var(--text)]" title="Acesso = o que a conta pode fazer (USER comum / ADMIN com painel)">
            <option value="">Acesso: todos</option>
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-xs font-semibold text-[var(--text)]">
            <option value="">Status: todos</option>
            <option value="ACTIVE">Ativo</option>
            <option value="PENDING">Pendente</option>
            <option value="SUSPENDED">Suspenso</option>
            <option value="DISABLED">Desativado</option>
          </select>
          <select value={onbFilter} onChange={(e) => setOnbFilter(e.target.value as OnbFilter)} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-xs font-semibold text-[var(--text)]">
            <option value="">Onboarding: todos</option>
            <option value="completed">Completo</option>
            <option value="pending">Pendente</option>
          </select>
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value as PlanFilter)} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-xs font-semibold text-[var(--text)]" title="Assinatura = limites de uso (FREE com limites / PRO ilimitado)">
            <option value="">Assinatura: todas</option>
            <option value="FREE">FREE</option>
            <option value="PRO">PRO</option>
          </select>
          {hasFilters ? (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]">
              <X size={12} /> Limpar
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            disabled={exporting || total === 0}
            title="Exporta todos os usuários que casam com os filtros atuais"
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
          >
            <Download size={13} />
            {exporting ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {/* ── TABLE CARD ──────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-hover)] px-4 py-3.5">
          <div className="inline-flex items-center gap-2.5 text-sm font-semibold text-[var(--text)]">
            Resultados
            <span className="rounded-full bg-[var(--text)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--surface)]">{total}</span>
            <span className="font-mono text-[11px] tracking-wide text-[var(--muted)]">· {scopeLabel}</span>
          </div>
          <div className="hidden items-center gap-3.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] sm:inline-flex">
            <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-full bg-emerald-500" />Ativo</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-full bg-amber-400" />Onboarding parcial</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={11} className="text-emerald-500" />2FA ativo</span>
          </div>
        </div>

        {error ? (
          <p className="px-4 py-8 text-center text-sm text-red-500">{error}</p>
        ) : (
          <div className="overflow-x-auto md:overflow-x-visible">
            <table className="w-full min-w-[560px] border-collapse text-left md:min-w-0">
              <thead>
                <tr className="bg-[var(--surface-hover)] [&>th]:border-b [&>th]:border-[var(--line)] [&>th]:px-2 [&>th]:py-3 [&>th]:font-mono [&>th]:text-[10px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[var(--muted)]">
                  <th className="!pl-4"><SortHeader label="Usuário" field="name" activeField={sortBy} order={sortOrder} onSort={onSort} /></th>
                  <th><SortHeader label="Email" field="email" activeField={sortBy} order={sortOrder} onSort={onSort} /></th>
                  <th title="Acesso = o que a conta pode fazer no sistema"><SortHeader label="Acesso" field="role" activeField={sortBy} order={sortOrder} onSort={onSort} /></th>
                  <th title="Assinatura = quanto a conta pode usar (limites)">Assinatura</th>
                  <th><SortHeader label="Status" field="status" activeField={sortBy} order={sortOrder} onSort={onSort} /></th>
                  <th>
                    <span className="inline-flex items-center gap-2">
                      <SortHeader label="Cadastro" field="createdAt" activeField={sortBy} order={sortOrder} onSort={onSort} />
                      <span className="opacity-30">/</span>
                      <SortHeader label="Login" field="lastLoginAt" activeField={sortBy} order={sortOrder} onSort={onSort} />
                    </span>
                  </th>
                  <th>Onboarding</th>
                  <th className="!pr-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows />
                ) : (
                  items.map((u) => {
                    const isSelf = u.id === authUser?.id
                    const isAdmin = u.role === 'ADMIN'
                    const isActive = u.status !== 'DISABLED'
                    // Completude real = campos preenchidos, não a flag antiga
                    // (contas velhas "completaram" o fluxo com menos campos).
                    const onb = onboardingProgress(u)
                    const onboarded = onb.filled === onb.total
                    const onbPct = onboarded ? 100 : Math.max(8, Math.round((onb.filled / onb.total) * 100))
                    return (
                      <tr
                        key={u.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Ver detalhes de ${u.name ?? u.email}`}
                        onClick={() => setDrawerId(u.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setDrawerId(u.id)
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:bg-[var(--surface-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand)] [&>td]:border-b [&>td]:border-[var(--line)] [&>td]:px-2 [&>td]:py-3 [&>td]:align-middle [&>td]:text-[13px] [&>td]:text-[var(--text)] [&:last-child>td]:border-b-0"
                      >
                        <td className="!pl-4">
                          <div className="flex items-center gap-3">
                            <div className="relative h-9 w-9 flex-shrink-0">
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                              ) : (
                                <div className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-semibold text-white" style={{ background: avatarGradient(u.id) }}>{initials(u.name, u.email)}</div>
                              )}
                              {isAdmin ? (
                                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-[var(--surface)] bg-[var(--text)] text-amber-400"><Crown size={8} /></span>
                              ) : null}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-[13.5px] font-semibold text-[var(--text)]">{u.name ?? 'Sem nome'}</span>
                                {u.mfaEnabled ? <ShieldCheck size={13} className="flex-shrink-0 text-emerald-500" /> : null}
                              </div>
                              <div className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--muted)]">{u.handle ? `@${u.handle}` : `ID ${u.id.slice(0, 10)}`}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="block max-w-[170px] truncate font-mono text-[11.5px] text-[var(--text)]" title={u.email}>{u.email}</span>
                        </td>
                        <td>
                          <div className="flex flex-col items-start gap-1">
                            <Pill tone={u.accountType === 'TEST' ? 'test' : 'real'}>{u.accountType === 'TEST' ? 'Teste' : 'Real'}</Pill>
                            <Pill tone={roleTone(u.role)}>{u.role}</Pill>
                          </div>
                        </td>
                        <td>
                          {u.role === 'ADMIN' ? (
                            <span
                              className="font-mono text-[10px] italic text-[var(--muted)]"
                              title="Admins ganham acesso PRO automaticamente em runtime, mesmo com plan='FREE' no banco"
                            >
                              auto-PRO
                            </span>
                          ) : u.plan === 'PRO' ? (
                            <Pill tone="pro">
                              <Crown size={9} /> PRO
                            </Pill>
                          ) : (
                            <Pill tone="free">FREE</Pill>
                          )}
                        </td>
                        <td><StatusPill status={u.status} /></td>
                        <td>
                          <div className="grid gap-1.5">
                            <div className="grid grid-cols-[16px_1fr] items-baseline gap-1.5">
                              <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Cd</span>
                              <span className="font-mono text-[11px] text-[var(--text)]">
                                {formatDate(u.createdAt)}
                                <span className="block text-[10px] text-[var(--muted)]">{[formatTime(u.createdAt), relativeTime(u.createdAt)].filter(Boolean).join(' · ')}</span>
                              </span>
                            </div>
                            <div className="grid grid-cols-[16px_1fr] items-baseline gap-1.5">
                              <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Lg</span>
                              {u.lastLoginAt ? (
                                <span className="font-mono text-[11px] text-[var(--text)]">
                                  {formatDate(u.lastLoginAt)}
                                  <span className="block text-[10px] text-[var(--muted)]">{relativeTime(u.lastLoginAt)}</span>
                                </span>
                              ) : (
                                <span className="font-mono text-[11px] text-[var(--muted)]">—</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-2 text-xs font-medium" title={onboarded ? 'Onboarding completo' : `${onb.filled} de ${onb.total} campos preenchidos`}>
                            <span className="inline-block h-[5px] w-9 overflow-hidden rounded-full bg-[var(--line)]">
                              <span className={`block h-full rounded-full ${onboarded ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${onbPct}%` }} />
                            </span>
                            <span className={onboarded ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{onboarded ? 'OK' : `${onb.filled}/${onb.total}`}</span>
                          </span>
                        </td>
                        <td className="!pr-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {isActive ? (
                              <IconButton title={isSelf ? 'Esta é a sua conta' : 'Desativar conta'} tone="warn" disabled={isSelf} onClick={() => setPending({ kind: 'deactivate', user: u })}>
                                <Ban size={14} />
                              </IconButton>
                            ) : (
                              <IconButton title="Reativar conta" tone="ok" onClick={() => setPending({ kind: 'reactivate', user: u })}>
                                <RotateCcw size={14} />
                              </IconButton>
                            )}
                            <IconButton title={isSelf ? 'Não pode excluir a própria conta' : 'Excluir conta'} tone="danger" disabled={isSelf} onClick={() => setPending({ kind: 'delete', user: u })}>
                              <Trash2 size={14} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}

                {!loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-hover)] text-[var(--muted)]"><Search size={20} /></div>
                      <p className="mt-3 text-sm font-semibold text-[var(--text)]">Nenhum usuário encontrado</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">{hasFilters ? 'Tente ajustar a busca ou os filtros.' : 'Não há contas neste filtro.'}</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {!error ? (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--surface-hover)] px-4 py-3.5 text-xs text-[var(--muted)] sm:flex-row">
            <span>
              Mostrando <b className="text-[var(--text)]">{rangeStart}–{rangeEnd}</b> de <b className="text-[var(--text)]">{total}</b> usuários
            </span>
            <div className="inline-flex items-center gap-1.5">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-40" aria-label="Anterior"><ChevronLeft size={12} /></button>
              {pageWindow(page, totalPages).map((p, idx, arr) => (
                <span key={p} className="inline-flex items-center gap-1.5">
                  {idx > 0 && p - arr[idx - 1] > 1 ? <span className="px-0.5 text-[var(--muted)]">…</span> : null}
                  <button onClick={() => setPage(p)} disabled={loading} className={`grid h-[30px] min-w-[30px] place-items-center rounded-lg border px-1.5 font-mono text-[11px] font-semibold transition-colors ${p === page ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]'}`}>{p}</button>
                </span>
              ))}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading} className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-40" aria-label="Próxima"><ChevronRight size={12} /></button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Drawer */}
      {drawerId ? (
        <UserDrawer
          detail={drawerDetail}
          loading={drawerLoading}
          isSelf={drawerDetail?.user.id === authUser?.id}
          onClose={() => setDrawerId(null)}
          onRoleChange={(role) => drawerDetail && setPending({ kind: 'role', user: drawerDetail.user, newRole: role })}
          onPlanChange={(newPlan) => drawerDetail && setPending({ kind: 'plan', user: drawerDetail.user, newPlan })}
          onAction={(kind) => drawerDetail && setPending({ kind, user: drawerDetail.user })}
        />
      ) : null}

      {/* Modal de confirmação */}
      {pending ? <ConfirmModal action={pending} loading={actionLoading} onConfirm={runAction} onCancel={() => setPending(null)} /> : null}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-lg ${
              t.kind === 'ok'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200'
                : 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-200'
            }`}
          >
            {t.kind === 'ok' ? <CheckCircle2 size={15} /> : <X size={15} />}
            {t.msg}
          </div>
        ))}
      </div>
    </section>
  )
}
