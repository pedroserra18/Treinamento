import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Skeleton } from '../common/Skeleton'

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { ready, isAuthenticated, user } = useAuth()

  // Mesmo racional do ProtectedRoute: a sessão sai do localStorage de
  // forma síncrona, então isso não deve renderizar na prática.
  if (!ready) {
    return (
      <section className="space-y-3" aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </section>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role !== 'ADMIN') {
    return <Navigate to="/profile" replace />
  }

  if (!user.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
