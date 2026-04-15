import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { searchExercisesForPlan } from '../../services/workoutService'
import type { ExerciseOption } from '../../types/workout'
import { ThemeToggle } from '../common/ThemeToggle'
import { BrandLogo } from '../common/BrandLogo'
import {
  getExerciseExplorerEventName,
  selectExerciseFromExplorer,
  type ExerciseExplorerOpenPayload,
} from '../../lib/exercise-explorer'
import { MUSCLE_OPTIONS } from '../../lib/exercise-meta'

type AppShellProps = {
  children: React.ReactNode
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
      const normalizedMuscle = muscle
      const cacheKey = `${normalizedQuery}::${normalizedMuscle}::${limit}`
      const cached = explorerSearchCacheRef.current.get(cacheKey)

      if (cached) {
        return cached
      }

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

      if (payload?.initialQuery) {
        setExplorerQuery(payload.initialQuery)
      }

      if (payload?.initialMuscle) {
        setExplorerMuscle(payload.initialMuscle)
      }

      setExplorerContext(payload?.context ?? null)

      setIsExplorerOpen(true)
    }

    window.addEventListener(eventName, handler)

    return () => {
      window.removeEventListener(eventName, handler)
    }
  }, [])

  useEffect(() => {
    if (!isExplorerOpen) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const query = explorerQuery.trim()
      const requestId = ++explorerRequestIdRef.current

      setExplorerLoading(true)
      setExplorerError(null)

      void fetchExplorerResults(query, explorerMuscle, 200)
        .then((results) => {
          if (requestId !== explorerRequestIdRef.current) {
            return
          }

          setExplorerResults(results)
        })
        .catch((error) => {
          if (requestId !== explorerRequestIdRef.current) {
            return
          }

          setExplorerError(error instanceof Error ? error.message : 'Erro ao buscar exercicios')
        })
        .finally(() => {
          if (requestId !== explorerRequestIdRef.current) {
            return
          }

          setExplorerLoading(false)
        })
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [explorerMuscle, explorerQuery, fetchExplorerResults, isExplorerOpen])

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-8 pt-24 sm:px-6 lg:px-8">
      <header className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm">
        <Link to="/" className="min-w-0">
          <BrandLogo className="flex items-center gap-2" />
        </Link>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <button
              onClick={() => void logout()}
              className="rounded-full border border-[var(--line)] px-3 py-2 text-xs font-medium text-[var(--text)]"
              type="button"
            >
              Sair
            </button>
          ) : null}
          <ThemeToggle isDark={theme === 'dark'} onToggle={toggleTheme} />
        </div>
      </header>

      <main>{children}</main>

      {isExplorerOpen ? (
        <section className="fixed left-1/2 top-[4.6rem] z-30 w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-2xl backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold uppercase tracking-[0.14em] text-[var(--text)]">
                Explorar exercicios
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
                  Parar exploracao
                </button>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-[2fr_1fr]">
              <input
                value={explorerQuery}
                onChange={(event) => setExplorerQuery(event.target.value)}
                placeholder="Buscar exercicio"
                className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
              />
              <select
                value={explorerMuscle}
                onChange={(event) => setExplorerMuscle(event.target.value)}
                className="rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
              >
                <option value="">Todos os musculos</option>
                {muscleOptions.map((muscle) => (
                  <option key={muscle} value={muscle}>
                    {muscle}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
              {explorerLoading ? <p className="text-sm text-[var(--muted)]">Buscando exercicios...</p> : null}
              {explorerError ? <p className="text-sm text-red-400">{explorerError}</p> : null}
              {!explorerLoading && !explorerError && explorerResults.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Nenhum exercicio encontrado para o filtro atual.</p>
              ) : null}

              {explorerResults.map((exercise) => (
                <article key={exercise.id} className="rounded-xl border border-[var(--line)] p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] sm:h-20 sm:w-20">
                      {exercise.thumbnailUrl ? (
                        <img
                          src={exercise.thumbnailUrl}
                          alt={`Imagem do exercicio ${exercise.name}`}
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
                        {exercise.primaryMuscleGroup} • {exercise.difficulty}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!explorerContext}
                          onClick={() => {
                            selectExerciseFromExplorer(exercise)
                          }}
                          className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {explorerContext === 'ACTIVE_WORKOUT'
                            ? 'Adicionar ao treino ativo'
                            : explorerContext === 'ROUTINE_EDIT'
                              ? 'Adicionar na rotina em edicao'
                              : 'Abra um treino ou rotina para adicionar'}
                        </button>
                        <button
                          type="button"
                          disabled={!exercise.videoUrl}
                          onClick={() => {
                            if (exercise.videoUrl) {
                              window.open(exercise.videoUrl, '_blank', 'noopener,noreferrer')
                            }
                          }}
                          className="rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {exercise.videoUrl ? 'Ver video' : 'Video em breve'}
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

      <nav className="fixed top-3 left-1/2 z-20 flex w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 items-center justify-around rounded-full border border-[var(--line)] bg-[var(--surface)] p-2 shadow-lg backdrop-blur">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-[var(--brand)] text-white'
                : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]'
            }`
          }
        >
          Home
        </NavLink>
        <NavLink
          to="/train"
          className={({ isActive }) =>
            `rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-[var(--brand)] text-white'
                : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]'
            }`
          }
        >
          Treinar
        </NavLink>
        <NavLink
          to="/workout-recommendations"
          className={({ isActive }) =>
            `rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-[var(--brand)] text-white'
                : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]'
            }`
          }
        >
          Recom.
        </NavLink>
        {isAuthenticated ? (
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]'
              }`
            }
          >
            Historico
          </NavLink>
        ) : null}
        {isAuthenticated ? (
          <NavLink
            to="/progress"
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]'
              }`
            }
          >
            Progr.
          </NavLink>
        ) : null}
        {isAuthenticated ? (
          user?.role === 'ADMIN' ? (
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-[var(--brand)] text-white'
                    : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]'
                }`
              }
            >
              Usuarios
            </NavLink>
          ) : null
        ) : null}
        {isAuthenticated ? (
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]'
              }`
            }
          >
            {user?.name ? `Perfil (${user.name.split(' ')[0]})` : 'Perfil'}
          </NavLink>
        ) : (
          <NavLink
            to="/login"
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]'
              }`
            }
          >
            Login
          </NavLink>
        )}
      </nav>
    </div>
  )
}
