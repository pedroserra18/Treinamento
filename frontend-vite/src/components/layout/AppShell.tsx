import { Link, NavLink } from 'react-router-dom'

import { ThemeToggle } from '../common/ThemeToggle'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'

type AppShellProps = {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { theme, toggleTheme } = useTheme()
  const { isAuthenticated, logout, user } = useAuth()

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <header className="mb-5 flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm">
        <Link to="/" className="text-sm font-bold tracking-wide text-[var(--text)] sm:text-base">
          Fit Frontend
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

      <nav className="fixed bottom-3 left-1/2 z-10 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 items-center justify-around rounded-full border border-[var(--line)] bg-[var(--surface)] p-2 shadow-lg backdrop-blur sm:static sm:mt-8 sm:w-auto sm:max-w-none sm:translate-x-0 sm:rounded-2xl">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-[var(--brand)] text-white'
                : 'text-[var(--muted)] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`
          }
        >
          Home
        </NavLink>
        <NavLink
          to="/workouts"
          className={({ isActive }) =>
            `rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive
                ? 'bg-[var(--brand)] text-white'
                : 'text-[var(--muted)] hover:bg-slate-100 dark:hover:bg-slate-800'
            }`
          }
        >
          Treinos
        </NavLink>
        {isAuthenticated ? (
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `rounded-full px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--muted)] hover:bg-slate-100 dark:hover:bg-slate-800'
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
                    : 'text-[var(--muted)] hover:bg-slate-100 dark:hover:bg-slate-800'
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
                  : 'text-[var(--muted)] hover:bg-slate-100 dark:hover:bg-slate-800'
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
                  : 'text-[var(--muted)] hover:bg-slate-100 dark:hover:bg-slate-800'
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
