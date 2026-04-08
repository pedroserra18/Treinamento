import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useEffect, useState } from 'react'
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

  const muscleOptions = [
    'CHEST',
    'BACK',
    'SHOULDERS',
    'ARMS',
    'BICEPS',
    'TRICEPS',
    'CORE',
    'LEGS',
    'GLUTES',
    'CALVES',
    'ABDOMEN',
    'FOREARM',
    'FULL_BODY',
  ]

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
      if (!query && !explorerMuscle) {
        setExplorerResults([])
        setExplorerError(null)
        return
      }

      setExplorerLoading(true)
      setExplorerError(null)

      void searchExercisesForPlan(authorizedFetch, {
        q: query || undefined,
        primaryMuscleGroup: explorerMuscle || undefined,
        limit: 12,
      })
        .then((results) => {
          setExplorerResults(results)
        })
        .catch((error) => {
          setExplorerError(error instanceof Error ? error.message : 'Erro ao buscar exercicios')
        })
        .finally(() => {
          setExplorerLoading(false)
        })
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [authorizedFetch, explorerMuscle, explorerQuery, isExplorerOpen])

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
                  onClick={() => setIsExplorerOpen(false)}
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
                <p className="text-sm text-[var(--muted)]">Digite um termo ou escolha um musculo para explorar.</p>
              ) : null}

              {explorerResults.map((exercise) => (
                <article key={exercise.id} className="rounded-xl border border-[var(--line)] p-3">
                  <p className="text-sm font-bold text-[var(--text)]">{exercise.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {exercise.primaryMuscleGroup} • {exercise.difficulty}
                  </p>
                  <button
                    type="button"
                    disabled={!explorerContext}
                    onClick={() => {
                      selectExerciseFromExplorer(exercise)
                    }}
                    className="mt-2 rounded-lg border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {explorerContext === 'ACTIVE_WORKOUT'
                      ? 'Adicionar ao treino ativo'
                      : explorerContext === 'ROUTINE_EDIT'
                        ? 'Adicionar na rotina em edicao'
                        : 'Abra um treino ou rotina para adicionar'}
                  </button>
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
