import { Navigate } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth'

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { ready, isAuthenticated, user } = useAuth()

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Validando sessao...</p>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/profile" replace />
  }

  return <>{children}</>
}
