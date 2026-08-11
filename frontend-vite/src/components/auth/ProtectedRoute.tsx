import { useAuth } from '../../hooks/useAuth'
import { Navigate, useLocation } from 'react-router-dom'
import { Skeleton } from '../common/Skeleton'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { ready, isAuthenticated, user } = useAuth()
  const location = useLocation()

  // `ready` é resolvido de forma síncrona a partir do localStorage, então
  // na prática este ramo não aparece. Fica como skeleton (e não como texto
  // solto) pra que qualquer regressão futura degrade num loading decente
  // em vez de numa tela em branco escrita "Validando sessao...".
  if (!ready) {
    return (
      <section className="space-y-3" aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </section>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!user?.onboardingCompleted && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
