import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../../hooks/useAuth'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { ready, isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Validando sessao...</p>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!user?.onboardingCompleted && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
