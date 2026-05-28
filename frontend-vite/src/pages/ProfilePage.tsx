import { motion, AnimatePresence } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { useScrollLock } from '../hooks/useScrollLock'
import { listWorkoutHistory } from '../services/workoutService'
import { getFollowers, getFollowing, type UserSearchResult } from '../services/socialService'
import { ImageViewer } from '../components/common/ImageViewer'
import { WorkoutSessionCard } from '../components/common/WorkoutSessionCard'
import type { WorkoutSessionHistory } from '../types/workout'
import { CountUp } from '../components/common/CountUp'
import { SkeletonCard } from '../components/common/Skeleton'
import { createPortal } from 'react-dom'
import {
  ChevronLeft, ChevronRight, Pencil, Dumbbell, X as XIcon,
  TrendingUp, Trophy, Settings as SettingsIcon, LogOut, Users, LifeBuoy, FileText,
} from 'lucide-react'

const PAGE_SIZE = 12 // workouts fetched per scroll batch

// ─── Followers/Following modal (kept lean) ────────────────────────────────

function UserListModal({
  title, users, onClose, onNavigate,
}: {
  title: string
  users: UserSearchResult[]
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.2 }}
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        style={{ maxHeight: 'min(80vh, 560px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h3 className="text-base font-bold text-[var(--text)]">{title}</h3>
          <button type="button" onClick={onClose} className="text-[var(--muted)]"><XIcon size={16} /></button>
        </div>
        <div className="flex-1 divide-y divide-[var(--line)] overflow-y-auto overflow-x-hidden overscroll-contain">
          {users.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">Nenhum usuário aqui ainda.</p>
          )}
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onClose(); onNavigate(u.id) }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-hover)]">
                {u.avatarUrl
                  ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--muted)]">{(u.name ?? '?')[0]?.toUpperCase()}</span>}
              </div>
              <span className="truncate text-sm font-semibold text-[var(--text)]">{u.name ?? 'Usuário'}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

// ─── Date helpers ─────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  return x
}

function formatHM(totalSec: number): string {
  if (totalSec <= 0) return '0 min'
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
const DOW = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

// ─── Stats aggregation (Duration / Reps / Volume over N weeks) ────────────

type StatMode = 'duration' | 'reps' | 'volume'
type RangeKey = '12w' | '6m' | '1y'

const RANGE_WEEKS: Record<RangeKey, number> = { '12w': 12, '6m': 26, '1y': 52 }

type WeekPoint = { weekStart: number; label: string; durationSec: number; reps: number; volumeKg: number }

function buildStatsSeries(items: WorkoutSessionHistory[], weeks: number): WeekPoint[] {
  const buckets = new Map<number, WeekPoint>()
  for (const s of items) {
    if (!s.endedAt) continue
    const ws = startOfWeek(new Date(s.endedAt)).getTime()
    const reps = s.history.reduce((acc, e) => acc + (e.reps ?? 0), 0)
    const volume = s.history.reduce(
      (acc, e) => acc + ((e.weightKg ?? 0) > 0 && (e.reps ?? 0) > 0 ? e.weightKg! * e.reps! : 0),
      0,
    )
    const cur = buckets.get(ws)
    if (cur) {
      cur.durationSec += s.durationSec ?? 0
      cur.reps += reps
      cur.volumeKg += volume
    } else {
      buckets.set(ws, {
        weekStart: ws,
        label: formatShortDate(new Date(ws)),
        durationSec: s.durationSec ?? 0,
        reps,
        volumeKg: volume,
      })
    }
  }

  const today = new Date()
  const series: WeekPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i * 7)
    const ws = startOfWeek(d).getTime()
    series.push(
      buckets.get(ws) ?? {
        weekStart: ws,
        label: formatShortDate(new Date(ws)),
        durationSec: 0,
        reps: 0,
        volumeKg: 0,
      },
    )
  }
  return series
}

function currentWeekTotals(items: WorkoutSessionHistory[]): { durationSec: number; reps: number; volumeKg: number } {
  const ws = startOfWeek(new Date()).getTime()
  let durationSec = 0
  let reps = 0
  let volumeKg = 0
  for (const s of items) {
    if (!s.endedAt) continue
    if (startOfWeek(new Date(s.endedAt)).getTime() !== ws) continue
    durationSec += s.durationSec ?? 0
    reps += s.history.reduce((acc, e) => acc + (e.reps ?? 0), 0)
    volumeKg += s.history.reduce(
      (acc, e) => acc + ((e.weightKg ?? 0) > 0 && (e.reps ?? 0) > 0 ? e.weightKg! * e.reps! : 0),
      0,
    )
  }
  return { durationSec, reps, volumeKg }
}

// ─── Calendar ─────────────────────────────────────────────────────────────

function CalendarPanel({ sessionDays }: { sessionDays: Set<string> }) {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()

  const cells: Array<{ day: number; iso: string; inMonth: boolean; isToday: boolean }> = []
  for (let i = 0; i < firstDow; i++) {
    const day = daysInPrev - firstDow + i + 1
    const d = new Date(year, month - 1, day)
    cells.push({ day, iso: d.toISOString().slice(0, 10), inMonth: false, isToday: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day)
    cells.push({
      day,
      iso: d.toISOString().slice(0, 10),
      inMonth: true,
      isToday: d.getTime() === today.getTime(),
    })
  }
  while (cells.length < 42) {
    const next = cells.length - firstDow - daysInMonth + 1
    const d = new Date(year, month + 1, next)
    cells.push({ day: next, iso: d.toISOString().slice(0, 10), inMonth: false, isToday: false })
  }

  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--text)]">Calendário</h3>
      </div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-[13.5px] font-medium text-[var(--text)]">
          {MONTH_NAMES[month]} de {year}
        </span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          aria-label="Próximo mês"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {DOW.map((d, i) => <span key={i} className="py-1">{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5 text-center">
        {cells.map((c, i) => {
          const has = sessionDays.has(c.iso)
          // Clicking a session day jumps to that month's group via anchor.
          // For now we just scroll to the workouts section — a real "scroll to
          // group" hook can be wired later by id matching `month-YYYY-MM`.
          const handleClick = () => {
            if (!has) return
            const anchor = document.getElementById(`month-${c.iso.slice(0, 7)}`)
            if (anchor) {
              anchor.scrollIntoView({ behavior: 'smooth', block: 'start' })
              return
            }
            navigate('/profile')
          }
          return (
            <button
              key={i}
              type="button"
              onClick={handleClick}
              disabled={!has}
              className="flex h-9 items-center justify-center disabled:cursor-default"
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-[12px] transition-colors ${
                  has
                    ? 'bg-[var(--brand)] font-semibold text-white shadow-[0_4px_10px_-6px_rgba(255,90,60,0.6)] hover:bg-[var(--brand-strong)]'
                    : c.isToday
                      ? 'border border-[var(--brand)]/60 text-[var(--text)]'
                      : c.inMonth
                        ? 'text-[var(--text)]'
                        : 'text-[var(--muted)]/50'
                }`}
              >
                {c.day}
              </span>
            </button>
          )
        })}
      </div>
    </article>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user, authorizedFetch, logout } = useAuth()
  const navigate = useNavigate()

  // Infinite history — we accumulate items page by page and let the rest of
  // the page (stats, calendar, hero counts) reflect what's been loaded so far.
  const [items, setItems] = useState<WorkoutSessionHistory[]>([])
  const [page, setPage] = useState(0) // 0 = nothing fetched yet
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loadingPage, setLoadingPage] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [followers, setFollowers] = useState<UserSearchResult[]>([])
  const [following, setFollowing] = useState<UserSearchResult[]>([])
  const [socialLoaded, setSocialLoaded] = useState(false)
  const [openPanel, setOpenPanel] = useState<'followers' | 'following' | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [statMode, setStatMode] = useState<StatMode>('duration')
  const [range, setRange] = useState<RangeKey>('12w')
  // Period filter for the workouts list — semana / mês / 3 meses / tudo.
  type PeriodFilter = 'week' | 'month' | '3months' | 'all'
  const [period, setPeriod] = useState<PeriodFilter>('all')

  const sentinelRef = useRef<HTMLDivElement>(null)

  // Page fetcher. Pulled out so both the initial load and the observer can
  // call it without bouncing through React state in awkward ways.
  const fetchPage = async (pageNumber: number) => {
    setLoadingPage(true)
    setError(null)
    try {
      const result = await listWorkoutHistory(authorizedFetch, pageNumber, PAGE_SIZE)
      setItems((prev) => {
        // Dedupe by id in case the user reloads quickly while a page was in flight.
        const seen = new Set(prev.map((s) => s.id))
        const incoming = result.items.filter((s) => !seen.has(s.id))
        return [...prev, ...incoming]
      })
      setTotalCount(result.total)
      setPage(pageNumber)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar treinos')
    } finally {
      setLoadingPage(false)
      setInitialLoad(false)
    }
  }

  useEffect(() => {
    void fetchPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorizedFetch])

  useEffect(() => {
    let cancelled = false
    Promise.all([getFollowers(authorizedFetch), getFollowing(authorizedFetch)])
      .then(([f, g]) => {
        if (cancelled) return
        setFollowers(f)
        setFollowing(g)
        setSocialLoaded(true)
      })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [authorizedFetch])

  // The cutoff date for the active period filter. `null` means "Tudo".
  // Lifted out of filteredSessions so the observer effect can also use it
  // to decide whether to auto-fetch (see below).
  const periodCutoff = useMemo(() => {
    if (period === 'all') return null
    const c = new Date()
    if (period === 'week') c.setDate(c.getDate() - 7)
    else if (period === 'month') c.setMonth(c.getMonth() - 1)
    else c.setMonth(c.getMonth() - 3)
    return c
  }, [period])

  const completedSessions = useMemo(
    () => items.filter((s) => s.endedAt).sort((a, b) => new Date(b.endedAt!).getTime() - new Date(a.endedAt!).getTime()),
    [items],
  )

  // Oldest loaded session — used by the auto-fetch guard. Pulling this out
  // explicitly so the observer effect can depend on a primitive (timestamp)
  // instead of the full sessions array.
  const oldestLoadedAt = completedSessions.length > 0
    ? new Date(completedSessions[completedSessions.length - 1].endedAt!).getTime()
    : null

  // Have we already scrolled past the period's window in raw data? If yes,
  // every future page from the server is going to be filtered out, so
  // auto-fetching is wasted work. Pause the observer in that case and let
  // the manual "Carregar mais antigos" button take over.
  const exhaustedFilteredRange =
    periodCutoff != null && oldestLoadedAt != null && oldestLoadedAt < periodCutoff.getTime()

  // Infinite scroll: observe a sentinel element near the bottom of the list.
  // The observer is only attached when auto-fetch makes sense — otherwise the
  // sentinel stays as a manually-clickable "Carregar mais" button.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const hasMore = totalCount == null ? false : items.length < totalCount
    if (!hasMore || loadingPage) return
    if (exhaustedFilteredRange) return // paused — user has to opt-in manually

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void fetchPage(page + 1)
        }
      },
      { rootMargin: '300px 0px' }, // start fetching a bit before the user actually hits the bottom
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, totalCount, loadingPage, items.length, exhaustedFilteredRange])

  const series = useMemo(
    () => buildStatsSeries(items, RANGE_WEEKS[range]),
    [items, range],
  )

  const currentWeek = useMemo(() => currentWeekTotals(items), [items])

  const sessionDays = useMemo(() => {
    const set = new Set<string>()
    for (const s of completedSessions) set.add(s.endedAt!.slice(0, 10))
    return set
  }, [completedSessions])

  // Apply the period filter client-side to the already-loaded sessions.
  const filteredSessions = useMemo(() => {
    if (!periodCutoff) return completedSessions
    return completedSessions.filter((s) => s.endedAt && new Date(s.endedAt) >= periodCutoff)
  }, [completedSessions, periodCutoff])

  // Group filtered sessions by month (YYYY-MM) so the list can render month
  // headers. Map preserves insertion order; we feed reverse-chronologically.
  const monthGroups = useMemo(() => {
    const groups = new Map<string, WorkoutSessionHistory[]>()
    for (const s of filteredSessions) {
      const key = s.endedAt!.slice(0, 7) // YYYY-MM
      const list = groups.get(key) ?? []
      list.push(s)
      groups.set(key, list)
    }
    return groups
  }, [filteredSessions])

  const chartData = series.map((p) => ({
    label: p.label,
    value: statMode === 'duration'
      ? Math.round(p.durationSec / 3600 * 10) / 10
      : statMode === 'reps'
        ? p.reps
        : Math.round(p.volumeKg),
    raw: p,
  }))

  const headerValue = statMode === 'duration'
    ? formatHM(currentWeek.durationSec)
    : statMode === 'reps'
      ? `${currentWeek.reps.toLocaleString('pt-BR')} reps`
      : currentWeek.volumeKg >= 1000
        ? `${(currentWeek.volumeKg / 1000).toFixed(1).replace(/\.0$/, '')}k kg`
        : `${Math.round(currentWeek.volumeKg)} kg`

  const yAxisFormatter = statMode === 'duration'
    ? (v: number) => `${v} h`
    : statMode === 'reps'
      ? (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
      : (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`

  // For duration we want "3 h 14 min" precision in the tooltip — not the
  // rounded-to-1-decimal hours used by the bar height. Recharts passes the
  // full data entry as the 3rd arg, so we read `durationSec` from there.
  const tooltipFormatter = (
    v: number,
    _name: string,
    item: { payload?: { raw?: { durationSec: number } } },
  ): [string, string] => {
    if (statMode === 'duration') {
      const sec = item?.payload?.raw?.durationSec ?? Math.round(v * 3600)
      return [formatHM(sec), 'Duração']
    }
    if (statMode === 'reps') return [`${v.toLocaleString('pt-BR')} reps`, 'Reps']
    return [`${v.toLocaleString('pt-BR')} kg`, 'Volume']
  }

  const hasMore = totalCount == null ? true : completedSessions.length < totalCount

  return (
    <section className="space-y-4">
      {/* ────────── PROFILE CARD ────────── */}
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6"
      >
        <div className="flex flex-wrap items-start gap-4 sm:gap-5">
          <button
            type="button"
            onClick={() => user?.avatarUrl && setViewerOpen(true)}
            disabled={!user?.avatarUrl}
            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:cursor-default sm:h-24 sm:w-24"
            aria-label="Ver avatar em tamanho grande"
          >
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-[var(--muted)]">
                  {(user?.name?.[0] ?? user?.handle?.[0] ?? '?').toUpperCase()}
                </span>}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--text)] sm:text-[22px]">
                  @{user?.handle ?? '—'}
                </h1>
                {user?.name && (
                  <p className="mt-0.5 truncate text-[13.5px] text-[var(--muted)]">{user.name}</p>
                )}
              </div>
              <Link
                to="/settings?section=profile"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                <Pencil size={12} />
                Editar perfil
              </Link>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2">
              <Stat
                label="Treinos"
                value={initialLoad ? '—' : <CountUp value={totalCount ?? completedSessions.length} />}
              />
              <button
                type="button"
                onClick={() => setOpenPanel('followers')}
                disabled={!socialLoaded}
                className="text-left disabled:opacity-60"
              >
                <Stat
                  label="Seguidores"
                  value={socialLoaded ? <CountUp value={followers.length} /> : '—'}
                />
              </button>
              <button
                type="button"
                onClick={() => setOpenPanel('following')}
                disabled={!socialLoaded}
                className="text-left disabled:opacity-60"
              >
                <Stat
                  label="A seguir"
                  value={socialLoaded ? <CountUp value={following.length} /> : '—'}
                />
              </button>
            </div>
          </div>
        </div>
      </motion.article>

      {/* ────────── MENU (mobile/tablet — desktop usa a nav do topo) ────────── */}
      <nav className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] lg:hidden">
        <Link to="/progress" className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-[14px] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]">
          <TrendingUp size={16} className="text-[var(--muted)]" />
          <span className="flex-1">Progresso</span>
          <ChevronRight size={16} className="text-[var(--muted)]" />
        </Link>
        <Link to="/desafios" className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-[14px] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]">
          <Trophy size={16} className="text-[var(--muted)]" />
          <span className="flex-1">Desafios</span>
          <ChevronRight size={16} className="text-[var(--muted)]" />
        </Link>
        <Link to="/settings" className="flex items-center gap-3 px-4 py-3 text-[14px] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]">
          <SettingsIcon size={16} className="text-[var(--muted)]" />
          <span className="flex-1">Configurações</span>
          <ChevronRight size={16} className="text-[var(--muted)]" />
        </Link>

        {user?.role === 'ADMIN' ? (
          <>
            <p className="border-t border-[var(--line)] bg-[var(--surface-hover)] px-4 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Administração
            </p>
            <Link to="/admin/users" className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-[14px] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]">
              <Users size={16} className="text-[var(--muted)]" />
              <span className="flex-1">Usuários</span>
              <ChevronRight size={16} className="text-[var(--muted)]" />
            </Link>
            <Link to="/admin/support" className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-[14px] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]">
              <LifeBuoy size={16} className="text-[var(--muted)]" />
              <span className="flex-1">Suporte</span>
              <ChevronRight size={16} className="text-[var(--muted)]" />
            </Link>
            <Link to="/admin/support/templates" className="flex items-center gap-3 px-4 py-3 text-[14px] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]">
              <FileText size={16} className="text-[var(--muted)]" />
              <span className="flex-1">Respostas prontas</span>
              <ChevronRight size={16} className="text-[var(--muted)]" />
            </Link>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-3 border-t border-[var(--line)] px-4 py-3 text-left text-[14px] font-medium text-red-500 transition-colors hover:bg-red-500/8"
        >
          <LogOut size={16} />
          <span className="flex-1">Sair da conta</span>
        </button>
      </nav>

      {/* ────────── STATS + CALENDAR ────────── */}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <motion.article
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="min-w-0 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--text)]">Estatísticas</h2>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              className="h-8 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[12px] text-[var(--text)]"
            >
              <option value="12w">Últimas 12 semanas</option>
              <option value="6m">Últimos 6 meses</option>
              <option value="1y">Último ano</option>
            </select>
          </div>

          <div className="mb-3 flex gap-4 border-b border-[var(--line)]">
            {([
              { id: 'duration', label: 'Duration' },
              { id: 'reps',     label: 'Reps' },
              { id: 'volume',   label: 'Volume' },
            ] as const).map((t) => {
              const active = statMode === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setStatMode(t.id)}
                  className={`relative -mb-px pb-2 text-[13px] font-medium transition-colors ${
                    active
                      ? 'text-[var(--brand)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {t.label}
                  {active && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[var(--brand)]" />}
                </button>
              )
            })}
          </div>

          <div className="mb-4 flex items-baseline gap-2">
            <span className="text-[26px] font-semibold tracking-tight text-[var(--text)]">{headerValue}</span>
            <span className="text-[12.5px] text-[var(--muted)]">Esta semana</span>
          </div>

          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 6))}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={yAxisFormatter}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'var(--text)' }}
                  cursor={{ fill: 'var(--surface-hover)' }}
                  formatter={tooltipFormatter as never}
                />
                <Bar dataKey="value" fill="var(--brand)" radius={[6, 6, 0, 0]} animationDuration={500} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.article>

        <motion.div
          className="min-w-0"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <CalendarPanel sessionDays={sessionDays} />
        </motion.div>
      </div>

      {/* ────────── WORKOUTS LIST (infinite scroll, grouped by month) ────────── */}
      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Meus treinos
          </h2>
          {totalCount != null && (
            <span className="font-mono text-[11px] text-[var(--muted)]">
              {filteredSessions.length}
              {period !== 'all' ? ` no período (de ${totalCount})` : ` de ${totalCount}`}
            </span>
          )}
        </div>

        {/* Period filter — segmented chips, semana/mês/3m/tudo */}
        <div className="mb-3 flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1">
          {([
            { id: 'week', label: 'Semana' },
            { id: 'month', label: 'Mês' },
            { id: '3months', label: '3 meses' },
            { id: 'all', label: 'Tudo' },
          ] as Array<{ id: PeriodFilter; label: string }>).map((p) => {
            const active = period === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  active
                    ? 'bg-[var(--brand)] text-white shadow-[inset_0_-1px_0_var(--brand-strong)]'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {error && <p className="mb-2 text-sm text-red-500">{error}</p>}

        {initialLoad && (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!initialLoad && completedSessions.length === 0 && (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <Dumbbell size={32} className="mx-auto mb-3 text-[var(--muted)]" strokeWidth={1.5} />
            <p className="text-sm font-bold text-[var(--text)]">Nenhum treino ainda</p>
            <p className="mt-1 text-xs text-[var(--muted)]">Finalize seu primeiro treino para ver aqui.</p>
            <Link to="/train" className="mt-4 inline-block rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white">
              Ir para Treinar
            </Link>
          </div>
        )}

        {!initialLoad && completedSessions.length > 0 && filteredSessions.length === 0 && (
          <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-6 text-center text-sm text-[var(--muted)]">
            Nenhum treino no período selecionado.
          </p>
        )}

        <div className="space-y-5">
          {Array.from(monthGroups.entries()).map(([key, sessions]) => {
            const [yyyy, mm] = key.split('-')
            const label = `${MONTH_NAMES[Number(mm) - 1]} ${yyyy}`
            const recordCount = sessions.length
            return (
              <div key={key} id={`month-${key}`}>
                {/* Month header — sticky-ish so it stays visible during scroll */}
                <div className="sticky top-0 z-10 -mx-2 mb-2 flex items-baseline justify-between bg-[var(--bg)]/85 px-2 py-1.5 backdrop-blur-sm">
                  <h3 className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--text)]">
                    {label}
                  </h3>
                  <span className="font-mono text-[10px] text-[var(--muted)]">
                    {recordCount} {recordCount === 1 ? 'treino' : 'treinos'}
                  </span>
                </div>
                {/* Feed-style rich cards, one per session. The single column on
                    desktop keeps room for the expanded "Ver stats completos"
                    set-by-set view; mobile already stacks. */}
                <div className="flex flex-col gap-2.5">
                  {sessions.map((s) => (
                    <WorkoutSessionCard key={s.id} session={s} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Infinite-scroll sentinel — observer only attaches when auto-fetch
            is enabled (see exhaustedFilteredRange). When paused, this becomes
            an explicit opt-in button so we don't burn pages on filtered-out
            data. */}
        {hasMore && (
          <div ref={sentinelRef} className="mt-4 flex flex-col items-center gap-1 py-4">
            {loadingPage ? (
              <span className="font-mono text-[11px] text-[var(--muted)]">Carregando…</span>
            ) : exhaustedFilteredRange ? (
              <>
                <p className="font-mono text-[10.5px] text-[var(--muted)]">
                  Você viu todos os treinos do período selecionado.
                </p>
                <button
                  type="button"
                  onClick={() => void fetchPage(page + 1)}
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 font-mono text-[11px] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
                >
                  Carregar treinos mais antigos
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void fetchPage(page + 1)}
                className="font-mono text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
              >
                Carregar mais
              </button>
            )}
          </div>
        )}

        {!hasMore && completedSessions.length > 0 && (
          <p className="mt-4 text-center font-mono text-[11px] text-[var(--muted)]">
            Você chegou ao começo! 🎉
          </p>
        )}
      </div>

      {/* ────────── Modals ────────── */}
      <AnimatePresence>
        {openPanel && (
          <UserListModal
            title={openPanel === 'followers' ? 'Seguidores' : 'A seguir'}
            users={openPanel === 'followers' ? followers : following}
            onClose={() => setOpenPanel(null)}
            onNavigate={(id) => navigate(`/u/${id}`)}
          />
        )}
        {viewerOpen && user?.avatarUrl && (
          <ImageViewer src={user.avatarUrl} alt={user?.name ?? null} onClose={() => setViewerOpen(false)} />
        )}
      </AnimatePresence>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[18px] font-semibold tracking-tight text-[var(--text)]">{value}</p>
      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
    </div>
  )
}
