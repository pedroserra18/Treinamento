import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { searchExercisesForPlan } from '../../services/workoutService'
import type { ExerciseOption } from '../../types/workout'
import { ThemeToggle } from '../common/ThemeToggle'
import { BrandLogo } from '../common/BrandLogo'
import { NotificationBell } from '../common/NotificationBell'
import { StatusBar } from '../common/StatusBar'
import {
  getExerciseExplorerEventName,
  selectExerciseFromExplorer,
  type ExerciseExplorerOpenPayload,
} from '../../lib/exercise-explorer'
import { MUSCLE_OPTIONS } from '../../lib/exercise-meta'
import {
  Home,
  Dumbbell,
  Rss,
  Bot,
  TrendingUp,
  Users,
  User,
  LogIn,
  LifeBuoy,
  Settings as SettingsIcon,
} from 'lucide-react'

type AppShellProps = {
  children: React.ReactNode
}

type NavItem = {
  to: string
  label: string
  icon: React.ReactNode
  authRequired?: boolean
  adminOnly?: boolean
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { isAuthenticated, logout, user, authorizedFetch } = useAuth()
  const [isExplorerOpen, setIsExplorerOpen] = useState(false)
  const [explorerQuery, setExplorerQuery] = useState('')
  const [explorerMuscle, setExplorerMuscle] = useState('')
  const [explorerContext, setExplorerContext] = useState<ExerciseExplorerOpenPayload['context'] | null>(null)
  const [explorerLoading, setExplorerLoading] = useState(false)
  const [explorerError, setExplorerError] = useState<string | null>(null)
  const [explorerResults, setExplorerResults] = useState<ExerciseOption[]>([])
  const explorerRequestIdRef = useRef(0)
  const explorerSearchCacheRef = useRef<Map<string, ExerciseOption[]>>(new Map())

  const fetchExplorerResults = useCallback(
    async (query: string, muscle: string, limit: number) => {
      const normalizedQuery = query.trim().toLowerCase()
      const cacheKey = `${normalizedQuery}::${muscle}::${limit}`
      const cached = explorerSearchCacheRef.current.get(cacheKey)
      if (cached) return cached
      const results = await searchExercisesForPlan(authorizedFetch, {
        q: query.trim() || undefined,
        primaryMuscleGroup: muscle || undefined,
        limit,
      })
      explorerSearchCacheRef.current.set(cacheKey, results)
      return results
    },
    [authorizedFetch],
  )

  const muscleOptions = MUSCLE_OPTIONS

  useEffect(() => {
    const eventName = getExerciseExplorerEventName()
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ExerciseExplorerOpenPayload>
      const payload = customEvent.detail
      if (payload?.initialQuery) setExplorerQuery(payload.initialQuery)
      if (payload?.initialMuscle) setExplorerMuscle(payload.initialMuscle)
      setExplorerContext(payload?.context ?? null)
      setIsExplorerOpen(true)
    }
    window.addEventListener(eventName, handler)
    return () => window.removeEventListener(eventName, handler)
  }, [])

  useEffect(() => {
    if (!isExplorerOpen) return
    const timeoutId = window.setTimeout(() => {
      const query = explorerQuery.trim()
      const requestId = ++explorerRequestIdRef.current
      setExplorerLoading(true)
      setExplorerError(null)
      void fetchExplorerResults(query, explorerMuscle, 200)
        .then((results) => {
          if (requestId !== explorerRequestIdRef.current) return
          setExplorerResults(results)
        })
        .catch((error) => {
          if (requestId !== explorerRequestIdRef.current) return
          setExplorerError(error instanceof Error ? error.message : 'Erro ao buscar exercicios')
        })
        .finally(() => {
          if (requestId !== explorerRequestIdRef.current) return
          setExplorerLoading(false)
        })
    }, 250)
    return () => window.clearTimeout(timeoutId)
  }, [explorerMuscle, explorerQuery, fetchExplorerResults, isExplorerOpen])

  // Histórico foi consolidado dentro do /profile (lista com infinite scroll).
  // Mantenho o redirect /history → /profile em App.tsx pra deep-links antigos
  // não quebrarem, mas o item de nav saiu do menu pra reduzir a poluição.
  const navItems: NavItem[] = [
    { to: '/', label: 'Home', icon: <Home size={15} /> },
    { to: '/train', label: 'Treinar', icon: <Dumbbell size={15} />, authRequired: true },
    { to: '/feed', label: 'Feed', icon: <Rss size={15} />, authRequired: true },
    { to: '/ai-workout', label: 'IA', icon: <Bot size={15} />, authRequired: true },
    { to: '/progress', label: 'Progr.', icon: <TrendingUp size={15} />, authRequired: true },
    { to: '/admin/users', label: 'Usuários', icon: <Users size={15} />, authRequired: true, adminOnly: true },
    { to: '/admin/support', label: 'Suporte', icon: <LifeBuoy size={15} />, authRequired: true, adminOnly: true },
  ]

  const profileItem: NavItem = isAuthenticated
    ? { to: '/profile', label: user?.name ? `Perfil (${user.name.split(' ')[0]})` : 'Perfil', icon: <User size={15} /> }
    : { to: '/login', label: 'Login', icon: <LogIn size={15} /> }

  // Settings only makes sense once the user is logged in; the page itself
  // requires auth via the ProtectedRoute, so we just hide the chip otherwise.
  const settingsItem: NavItem | null = isAuthenticated
    ? { to: '/settings', label: 'Configurações', icon: <SettingsIcon size={15} /> }
    : null

  const visibleItems = [
    ...navItems.filter((item) => {
      if (item.adminOnly) return isAuthenticated && user?.role === 'ADMIN'
      if (item.authRequired) return isAuthenticated
      return true
    }),
    profileItem,
    ...(settingsItem ? [settingsItem] : []),
  ]

  // Bottom nav (celular + tablet, < lg) — 5 destinos principais. As páginas
  // secundárias (Progresso, Configurações, Admin) ficam no hub do Perfil.
  const bottomNavItems = [
    visibleItems.find((i) => i.to === '/'),
    visibleItems.find((i) => i.to === '/feed'),
    visibleItems.find((i) => i.to === '/ai-workout'),
    visibleItems.find((i) => i.to === '/train'),
    profileItem,
  ].filter(Boolean) as NavItem[]

  const topNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
      isActive
        ? 'bg-[var(--brand)] text-white'
        : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]'
    }`

  const bottomNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition-all duration-200 ${
      isActive
        ? 'bg-[var(--brand)] text-white'
        : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]'
    }`

  return (
    <div className="mx-auto min-h-screen w-full max-w-5xl overflow-x-hidden px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-8 lg:pt-24">

      {/* Navbar pill no topo — apenas desktop (< lg usa a bottom nav) */}
      <nav className="fixed top-3 left-1/2 z-20 hidden w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 items-center justify-around rounded-full border border-[var(--line)] bg-[var(--surface)] p-2 shadow-lg backdrop-blur-md lg:flex">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={topNavLinkClass}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Header com logo + sair + tema — abaixo da navbar */}
      <header className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm">
        <Link to="/" className="min-w-0">
          <BrandLogo className="flex items-center gap-2" />
        </Link>
        <div className="flex items-center gap-2">
          {isAuthenticated ? <NotificationBell /> : null}
          {isAuthenticated ? (
            <button
              onClick={() => void logout()}
              className="hidden rounded-full border border-[var(--line)] px-3 py-2 text-xs font-medium text-[var(--text)] lg:inline-flex"
              type="button"
            >
              Sair
            </button>
          ) : null}
          <ThemeToggle isDark={theme === 'dark'} onToggle={toggleTheme} />
        </div>
      </header>

      <main className="min-w-0">{children}</main>

      {/* Status bar — globally visible on authenticated pages (shrinks on mobile). */}
      {isAuthenticated && <StatusBar />}

      {/* Bottom nav — celular e tablet (oculta no desktop) */}
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t border-[var(--line)] bg-[var(--surface)]/95 px-2 pb-safe pt-2 backdrop-blur-md lg:hidden">
        {bottomNavItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={bottomNavLinkClass}>
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Exercise Explorer overlay */}
      {isExplorerOpen ? (
        <section className="fixed left-1/2 top-[4.6rem] z-30 w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 p-4 shadow-2xl backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[var(--muted)]">
                Explorar exercícios
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/train')}
                  className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                >
                  Ir para Treinar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    explorerRequestIdRef.current += 1
                    setIsExplorerOpen(false)
                    setExplorerResults([])
                    setExplorerError(null)
                  }}
                  className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)]"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-[2fr_1fr]">
              <input
                value={explorerQuery}
                onChange={(event) => setExplorerQuery(event.target.value)}
                placeholder="Buscar exercício..."
                className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
              />
              <select
                value={explorerMuscle}
                onChange={(event) => setExplorerMuscle(event.target.value)}
                className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
              >
                <option value="">Todos os músculos</option>
                {muscleOptions.map((muscle) => (
                  <option key={muscle} value={muscle}>{muscle}</option>
                ))}
              </select>
            </div>

            <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
              {explorerLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3 rounded-xl border border-[var(--line)] p-3 animate-pulse">
                      <div className="h-16 w-16 shrink-0 rounded-lg bg-[var(--surface-hover)]" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-3 w-2/3 rounded bg-[var(--surface-hover)]" />
                        <div className="h-3 w-1/3 rounded bg-[var(--surface-hover)]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {explorerError ? <p className="text-sm text-red-400">{explorerError}</p> : null}
              {!explorerLoading && !explorerError && explorerResults.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--muted)]">Nenhum exercício encontrado.</p>
              ) : null}

              {explorerResults.map((exercise) => (
                <article key={exercise.id} className="rounded-xl border border-[var(--line)] p-3 transition-colors hover:border-[color-mix(in_srgb,var(--brand)_40%,var(--line))]">
                  <div className="flex items-start gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] sm:h-20 sm:w-20">
                      {exercise.thumbnailUrl ? (
                        <img
                          src={exercise.thumbnailUrl}
                          alt={`Imagem do exercício ${exercise.name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          Sem foto
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--text)]">{exercise.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {exercise.primaryMuscleGroup} · {exercise.difficulty}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!explorerContext}
                          onClick={() => selectExerciseFromExplorer(exercise)}
                          className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {explorerContext === 'ACTIVE_WORKOUT'
                            ? 'Adicionar ao treino ativo'
                            : explorerContext === 'ROUTINE_EDIT'
                              ? 'Adicionar na rotina'
                              : 'Abra um treino para adicionar'}
                        </button>
                        <button
                          type="button"
                          disabled={!exercise.videoUrl}
                          onClick={() => {
                            if (exercise.videoUrl) window.open(exercise.videoUrl, '_blank', 'noopener,noreferrer')
                          }}
                          className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {exercise.videoUrl ? 'Ver vídeo' : 'Vídeo em breve'}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
