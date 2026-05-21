import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useAdminUsers } from '../hooks/useAdminUsers'
import {
  deactivateUserByAdmin,
  deleteUserByAdmin,
  reactivateUserByAdmin,
} from '../services/adminService'
import type { AdminUser } from '../types/admin'
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Crown,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'

const PAGE_SIZE = 20

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR')
}

function formatTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function relativeTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)
  if (diffDays <= 0) {
    const diffHours = Math.floor(diffMs / 3_600_000)
    if (diffHours <= 0) return 'agora há pouco'
    return `há ${diffHours}h`
  }
  if (diffDays === 1) return 'há 1 dia'
  return `há ${diffDays} dias`
}

function initials(name: string | null, email: string): string {
  const source = (name ?? email).trim()
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #ff7a5e, #c63a1f)',
  'linear-gradient(135deg, #6aa6ff, #1d4fa3)',
  'linear-gradient(135deg, #6fd2a3, #1f7a45)',
  'linear-gradient(135deg, #f3c66a, #8a6308)',
  'linear-gradient(135deg, #d4a3ff, #6e2db5)',
]

function avatarGradient(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]
}

function CountUp({ target }: { target: number }) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let frame = 0
    const duration = 900
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return <>{value}</>
}

// Janela de páginas para o paginador (compacta quando há muitas).
function pageWindow(current: number, totalPages: number): number[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages = new Set<number>([1, totalPages, current, current - 1, current + 1])
  return Array.from(pages)
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b)
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

type PillTone = 'real' | 'test' | 'active' | 'pending' | 'suspended' | 'disabled' | 'admin' | 'user'

function Pill({ children, tone }: { children: React.ReactNode; tone: PillTone }) {
  const tones: Record<PillTone, string> = {
    real: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    test: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    active: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    pending: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    suspended: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30',
    disabled: 'bg-[var(--surface-hover)] text-[var(--muted)] border-[var(--line)]',
    admin: 'bg-[var(--text)] text-[var(--surface)] border-[var(--text)]',
    user: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

// Mapeia o status da conta (AccountStatus) para rótulo + cor da pílula.
const STATUS_META: Record<string, { label: string; tone: PillTone; dot: string }> = {
  ACTIVE: { label: 'Ativo', tone: 'active', dot: 'bg-emerald-500' },
  PENDING: { label: 'Pendente', tone: 'pending', dot: 'bg-amber-500' },
  SUSPENDED: { label: 'Suspenso', tone: 'suspended', dot: 'bg-orange-500' },
  DISABLED: { label: 'Desativado', tone: 'disabled', dot: 'bg-[var(--muted)]' },
}

function IconButton({
  title,
  onClick,
  disabled,
  tone = 'default',
  children,
}: {
  title: string
  onClick?: () => void
  disabled?: boolean
  tone?: 'default' | 'warn' | 'danger' | 'ok'
  children: React.ReactNode
}) {
  const hover =
    tone === 'warn'
      ? 'hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/15 dark:hover:text-amber-300'
      : tone === 'danger'
        ? 'hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400'
        : tone === 'ok'
          ? 'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300'
          : 'hover:border-[var(--brand)]/40 hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-[30px] w-[30px] place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors disabled:pointer-events-none disabled:opacity-35 ${hover}`}
    >
      {children}
    </button>
  )
}

type PendingAction = {
  kind: 'deactivate' | 'delete' | 'reactivate'
  user: AdminUser
}

function ConfirmModal({
  action,
  loading,
  onConfirm,
  onCancel,
}: {
  action: PendingAction
  loading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const config = {
    deactivate: {
      title: 'Desativar conta',
      body: 'A conta será desativada e as sessões revogadas. O usuário não poderá entrar até ser reativado.',
      confirm: 'Desativar',
      btn: 'bg-amber-500 hover:bg-amber-600',
    },
    delete: {
      title: 'Excluir conta',
      body: 'Esta ação remove a conta da listagem ativa e revoga os acessos. Não pode ser desfeita pela interface.',
      confirm: 'Excluir',
      btn: 'bg-red-600 hover:bg-red-700',
    },
    reactivate: {
      title: 'Reativar conta',
      body: 'A conta voltará a ficar ativa e o usuário poderá entrar novamente.',
      confirm: 'Reativar',
      btn: 'bg-emerald-600 hover:bg-emerald-700',
    },
  }[action.kind]

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [loading, onCancel])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => !loading && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--text)]">{config.title}</h2>
          <button
            type="button"
            onClick={() => !loading && onCancel()}
            className="grid h-7 w-7 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)]"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{config.body}</p>
        <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
          <div className="text-sm font-semibold text-[var(--text)]">{action.user.name ?? 'Sem nome'}</div>
          <div className="font-mono text-[12px] text-[var(--muted)]">{action.user.email}</div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${config.btn}`}
          >
            {loading ? 'Processando…' : config.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="[&>td]:border-b [&>td]:border-[var(--line)] [&>td]:px-2.5 [&>td]:py-3.5">
          <td className="!pl-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--surface-hover)]" />
              <div className="space-y-1.5">
                <div className="h-3 w-28 animate-pulse rounded bg-[var(--surface-hover)]" />
                <div className="h-2.5 w-20 animate-pulse rounded bg-[var(--surface-hover)]" />
              </div>
            </div>
          </td>
          <td><div className="h-3 w-40 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td><div className="h-3 w-16 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td><div className="h-3 w-14 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td><div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td><div className="h-3 w-16 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td className="!pr-4"><div className="ml-auto h-3 w-16 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
        </tr>
      ))}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const { user: authUser, authorizedFetch } = useAuth()
  const [accountScope, setAccountScope] = useState<'REAL' | 'TEST' | 'ALL'>('REAL')
  const [registrationOrder, setRegistrationOrder] = useState<'desc' | 'asc'>('desc')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Debounce da busca (evita uma requisição por tecla).
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(id)
  }, [query])

  // Volta para a primeira página quando os filtros mudam.
  useEffect(() => {
    setPage(1)
  }, [accountScope, registrationOrder, debouncedQuery])

  const listingOptions = useMemo(
    () => ({
      accountScope,
      includeTest: accountScope !== 'REAL',
      registrationOrder,
      search: debouncedQuery,
    }),
    [accountScope, registrationOrder, debouncedQuery],
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

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const summary = data?.summary ?? { realCount: 0, testCount: 0, totalCount: 0, newRealLast7Days: 0 }
  const scopeLabel =
    accountScope === 'REAL' ? 'somente reais' : accountScope === 'TEST' ? 'somente teste' : 'reais + teste'
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(page * PAGE_SIZE, total)

  const runAction = async () => {
    if (!pending) return
    setActionLoading(true)
    try {
      if (pending.kind === 'deactivate') await deactivateUserByAdmin(authorizedFetch, pending.user.id)
      else if (pending.kind === 'reactivate') await reactivateUserByAdmin(authorizedFetch, pending.user.id)
      else await deleteUserByAdmin(authorizedFetch, pending.user.id)
      setPending(null)
      await refresh()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Erro ao executar ação')
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

          <div className="grid grid-cols-3 gap-6">
            <div className="text-right">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Reais</div>
              <div className="mt-1 text-2xl font-semibold leading-none tracking-tight text-[var(--brand-strong)] sm:text-3xl">
                <CountUp target={summary.realCount} />
              </div>
              <div className="mt-1 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                {summary.newRealLast7Days > 0 ? `▲ ${summary.newRealLast7Days} esta semana` : 'sem novos · 7d'}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Teste</div>
              <div className="mt-1 text-2xl font-semibold leading-none tracking-tight text-[var(--text)] sm:text-3xl">
                <CountUp target={summary.testCount} />
              </div>
              <div className="mt-1 font-mono text-[10px] font-semibold text-[var(--muted)]">contas internas</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Base total</div>
              <div className="mt-1 text-2xl font-semibold leading-none tracking-tight text-[var(--text)] sm:text-3xl">
                <CountUp target={summary.totalCount} />
              </div>
              <div className="mt-1 font-mono text-[10px] font-semibold text-[var(--muted)]">reais + teste</div>
            </div>
          </div>
        </div>
      </header>

      {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-center gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3.5 md:grid-cols-[minmax(220px,1fr)_auto_auto]">
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
          <kbd className="ml-2 hidden rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] sm:inline">
            ⌘K
          </kbd>
        </label>

        <div className="inline-flex rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-1">
          {segments.map((seg) => (
            <button
              key={seg.key}
              type="button"
              onClick={() => setAccountScope(seg.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-wide transition-colors ${
                accountScope === seg.key
                  ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {seg.label}
              <span
                className={`rounded-full px-1.5 py-px font-mono text-[9.5px] ${
                  accountScope === seg.key
                    ? 'bg-[var(--brand)] text-white'
                    : 'border border-[var(--line)] bg-[var(--surface)] text-[var(--text)]'
                }`}
              >
                {seg.count}
              </span>
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 hover:border-[var(--brand)]/40">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Ordem</span>
          <select
            value={registrationOrder}
            onChange={(e) => setRegistrationOrder(e.target.value as 'desc' | 'asc')}
            className="border-0 bg-transparent text-xs font-semibold text-[var(--text)] outline-none"
          >
            <option value="desc">Mais recentes</option>
            <option value="asc">Mais antigas</option>
          </select>
        </label>
      </div>

      {/* ── TABLE CARD ──────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-hover)] px-4 py-3.5">
          <div className="inline-flex items-center gap-2.5 text-sm font-semibold text-[var(--text)]">
            Resultados
            <span className="rounded-full bg-[var(--text)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--surface)]">
              {total}
            </span>
            <span className="font-mono text-[11px] tracking-wide text-[var(--muted)]">· {scopeLabel}</span>
          </div>
          <div className="hidden items-center gap-3.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] sm:inline-flex">
            <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-full bg-emerald-500" />Ativo</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-full bg-amber-400" />Onboarding parcial</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-[7px] w-[7px] rounded-full bg-[var(--muted)]" />Sem login</span>
          </div>
        </div>

        {error ? (
          <p className="px-4 py-8 text-center text-sm text-red-500">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="bg-[var(--surface-hover)] [&>th]:border-b [&>th]:border-[var(--line)] [&>th]:px-2.5 [&>th]:py-3 [&>th]:font-mono [&>th]:text-[10px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-[var(--muted)]">
                  <th className="!pl-4">Usuário</th>
                  <th>Email</th>
                  <th>Tipo / Role</th>
                  <th>Status</th>
                  <th>Cadastro / Último login</th>
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
                    const onboarded = Boolean(u.onboardingCompletedAt)
                    return (
                      <tr
                        key={u.id}
                        className="transition-colors hover:bg-[var(--surface-hover)] [&>td]:border-b [&>td]:border-[var(--line)] [&>td]:px-2.5 [&>td]:py-3 [&>td]:align-middle [&>td]:text-[13px] [&>td]:text-[var(--text)] [&:last-child>td]:border-b-0"
                      >
                        {/* Usuário */}
                        <td className="!pl-4">
                          <div className="flex items-center gap-3">
                            <div className="relative h-9 w-9 flex-shrink-0">
                              {u.avatarUrl ? (
                                <img
                                  src={u.avatarUrl}
                                  alt=""
                                  className="h-9 w-9 rounded-full object-cover"
                                />
                              ) : (
                                <div
                                  className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-semibold text-white"
                                  style={{ background: avatarGradient(u.id) }}
                                >
                                  {initials(u.name, u.email)}
                                </div>
                              )}
                              {isAdmin ? (
                                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border-2 border-[var(--surface)] bg-[var(--text)] text-amber-400">
                                  <Crown size={8} />
                                </span>
                              ) : null}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">
                                {u.name ?? 'Sem nome'}
                              </div>
                              <div className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--muted)]">
                                {u.handle ? `@${u.handle}` : `ID ${u.id.slice(0, 10)}`}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td>
                          <span className="block max-w-[220px] truncate font-mono text-[11.5px] text-[var(--text)]" title={u.email}>
                            {u.email}
                          </span>
                        </td>

                        {/* Tipo / Role */}
                        <td>
                          <div className="flex flex-col items-start gap-1">
                            <Pill tone={u.accountType === 'TEST' ? 'test' : 'real'}>
                              {u.accountType === 'TEST' ? 'Teste' : 'Real'}
                            </Pill>
                            <Pill tone={isAdmin ? 'admin' : 'user'}>{u.role}</Pill>
                          </div>
                        </td>

                        {/* Status */}
                        <td>
                          {(() => {
                            const meta = STATUS_META[u.status] ?? {
                              label: u.status || '—',
                              tone: 'disabled' as PillTone,
                              dot: 'bg-[var(--muted)]',
                            }
                            return (
                              <Pill tone={meta.tone}>
                                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                                {meta.label}
                              </Pill>
                            )
                          })()}
                        </td>

                        {/* Cadastro / Último login */}
                        <td>
                          <div className="grid gap-1.5">
                            <div className="grid grid-cols-[16px_1fr] items-baseline gap-1.5">
                              <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Cd</span>
                              <span className="font-mono text-[11px] text-[var(--text)]">
                                {formatDate(u.createdAt)}
                                <span className="block text-[10px] text-[var(--muted)]">
                                  {[formatTime(u.createdAt), relativeTime(u.createdAt)].filter(Boolean).join(' · ')}
                                </span>
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

                        {/* Onboarding */}
                        <td>
                          <span className="inline-flex items-center gap-2 text-xs font-medium">
                            <span className="inline-block h-[5px] w-9 overflow-hidden rounded-full bg-[var(--line)]">
                              <span
                                className={`block h-full rounded-full ${onboarded ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                style={{ width: onboarded ? '100%' : '40%' }}
                              />
                            </span>
                            <span className={onboarded ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                              {onboarded ? 'OK' : 'Parcial'}
                            </span>
                          </span>
                        </td>

                        {/* Ações */}
                        <td className="!pr-4">
                          <div className="flex items-center justify-end gap-1">
                            {isActive ? (
                              <IconButton
                                title={isSelf ? 'Esta é a sua conta' : 'Desativar conta'}
                                tone="warn"
                                disabled={isSelf}
                                onClick={() => setPending({ kind: 'deactivate', user: u })}
                              >
                                <Ban size={14} />
                              </IconButton>
                            ) : (
                              <IconButton
                                title="Reativar conta"
                                tone="ok"
                                onClick={() => setPending({ kind: 'reactivate', user: u })}
                              >
                                <RotateCcw size={14} />
                              </IconButton>
                            )}
                            <IconButton
                              title={isSelf ? 'Não pode excluir a própria conta' : 'Excluir conta'}
                              tone="danger"
                              disabled={isSelf}
                              onClick={() => setPending({ kind: 'delete', user: u })}
                            >
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
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-hover)] text-[var(--muted)]">
                        <Search size={20} />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-[var(--text)]">Nenhum usuário encontrado</p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {debouncedQuery ? 'Tente outro termo de busca.' : 'Não há contas neste filtro.'}
                      </p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!error ? (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--surface-hover)] px-4 py-3.5 text-xs text-[var(--muted)] sm:flex-row">
            <span>
              Mostrando <b className="text-[var(--text)]">{rangeStart}–{rangeEnd}</b> de{' '}
              <b className="text-[var(--text)]">{total}</b> usuários
            </span>
            <div className="inline-flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-40"
                aria-label="Anterior"
              >
                <ChevronLeft size={12} />
              </button>
              {pageWindow(page, totalPages).map((p, idx, arr) => (
                <span key={p} className="inline-flex items-center gap-1.5">
                  {idx > 0 && p - arr[idx - 1] > 1 ? <span className="px-0.5 text-[var(--muted)]">…</span> : null}
                  <button
                    onClick={() => setPage(p)}
                    disabled={loading}
                    className={`grid h-[30px] min-w-[30px] place-items-center rounded-lg border px-1.5 font-mono text-[11px] font-semibold transition-colors ${
                      p === page
                        ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                        : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] disabled:pointer-events-none disabled:opacity-40"
                aria-label="Próxima"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {pending ? (
        <ConfirmModal
          action={pending}
          loading={actionLoading}
          onConfirm={runAction}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </section>
  )
}
