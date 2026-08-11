import { lazy, Suspense, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import { AppShell } from './components/layout/AppShell'
import { PlanLimitDialogProvider } from './components/plan/PlanLimitDialogProvider'
import { TermsAcceptanceGate } from './components/legal/TermsAcceptanceGate'
import { AdminRoute } from './components/auth/AdminRoute'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { Skeleton } from './components/common/Skeleton'
import { queryClient } from './lib/infra/queryClient'
import { captureRenderError } from './lib/infra/sentry'
import { PwaUpdatePrompt } from './components/common/PwaUpdatePrompt'
import { PwaInstallBanner } from './components/common/PwaInstallBanner'

// Eager: pages a user is likely to hit before navigating away. Keeping them
// in the main chunk avoids a flash of skeleton on the most common landings.
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { GoogleCallbackPage } from './pages/GoogleCallbackPage'
import { ProInvitePage } from './pages/subscription/ProInvitePage'
import { TermosPage } from './pages/legal/TermosPage'
import { PrivacidadePage } from './pages/legal/PrivacidadePage'

// Detects the "stale chunk" failure mode: a user had the app open when
// we deployed, the old chunk hashes no longer exist on the CDN, the SPA
// fallback rewrites the missing .js to index.html, and the browser
// refuses to execute HTML as a module. The error string varies a bit
// between Chromium and WebKit so we accept all the common phrasings.
function isStaleChunkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message || ''
  return (
    msg.includes("'text/html' is not a valid JavaScript MIME type") ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to load script') ||
    msg.includes('Importing a module script failed')
  )
}

// Lazy: everything else. Each route becomes its own chunk, shrinking the
// initial bundle. The helper unwraps named exports since React.lazy
// requires `default`, AND auto-recovers from stale chunk errors by
// reloading the page once (the fresh index.html has the new hashes).
const lazyNamed = <T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) => lazy(async () => {
  try {
    const mod = await loader()
    return { default: mod[name] as React.ComponentType<unknown> }
  } catch (err) {
    if (isStaleChunkError(err)) {
      // Guard against an infinite reload loop if the chunk really is
      // broken (and not just a deploy race) — one reload per tab,
      // tracked via sessionStorage which dies with the tab.
      const KEY = 'acad:chunk-stale-reload'
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1')
        window.location.reload()
        // Block the lazy() promise from settling while the reload
        // takes over the document — prevents React from rendering an
        // error UI during the brief navigation window.
        return new Promise<{ default: React.ComponentType<unknown> }>(() => {})
      }
    }
    throw err
  }
})

const TrainPage = lazyNamed(() => import('./pages/TrainPage'), 'TrainPage')
const ProgressPage = lazyNamed(() => import('./pages/ProgressPage'), 'ProgressPage')
const ProfilePage = lazyNamed(() => import('./pages/ProfilePage'), 'ProfilePage')
const SettingsPage = lazyNamed(() => import('./pages/SettingsPage'), 'SettingsPage')
const WorkoutDetailPage = lazyNamed(() => import('./pages/WorkoutDetailPage'), 'WorkoutDetailPage')
const OnboardingPage = lazyNamed(() => import('./pages/OnboardingPage'), 'OnboardingPage')
const WorkoutRecommendationsPage = lazyNamed(() => import('./pages/WorkoutRecommendationsPage'), 'WorkoutRecommendationsPage')
const AIWorkoutPage = lazyNamed(() => import('./pages/AIWorkoutPage'), 'AIWorkoutPage')
const FeedPage = lazyNamed(() => import('./pages/FeedPage'), 'FeedPage')
const PostPage = lazyNamed(() => import('./pages/PostPage'), 'PostPage')
const PublicProfilePage = lazyNamed(() => import('./pages/PublicProfilePage'), 'PublicProfilePage')
const SharedPlanPage = lazyNamed(() => import('./pages/SharedPlanPage'), 'SharedPlanPage')
const SupportPage = lazyNamed(() => import('./pages/SupportPage'), 'SupportPage')
const SupportTicketPage = lazyNamed(() => import('./pages/SupportTicketPage'), 'SupportTicketPage')
const AdminUsersPage = lazyNamed(() => import('./pages/AdminUsersPage'), 'AdminUsersPage')
const AdminProInvitesPage = lazyNamed(() => import('./pages/AdminProInvitesPage'), 'AdminProInvitesPage')
const AdminSupportPage = lazyNamed(() => import('./pages/AdminSupportPage'), 'AdminSupportPage')
const AdminSupportTicketPage = lazyNamed(() => import('./pages/AdminSupportTicketPage'), 'AdminSupportTicketPage')
const AdminSupportTemplatesPage = lazyNamed(() => import('./pages/AdminSupportTemplatesPage'), 'AdminSupportTemplatesPage')
const AdminReportsPage = lazyNamed(() => import('./pages/AdminReportsPage'), 'AdminReportsPage')
const ExerciseDetailPage = lazyNamed(() => import('./pages/ExerciseDetailPage'), 'ExerciseDetailPage')
const RecommendationDetailPage = lazyNamed(() => import('./pages/RecommendationDetailPage'), 'RecommendationDetailPage')
const CompetitionsPage = lazyNamed(() => import('./pages/CompetitionsPage'), 'CompetitionsPage')
const CompetitionDetailPage = lazyNamed(() => import('./pages/CompetitionDetailPage'), 'CompetitionDetailPage')
const CompetitionInvitePage = lazyNamed(() => import('./pages/CompetitionInvitePage'), 'CompetitionInvitePage')

// Pré-carrega os chunks das abas do menu inferior quando o navegador fica
// ocioso. São as rotas que o usuário logado alterna o tempo todo; sem isso
// a primeira visita a cada aba mostra o RouteFallback enquanto baixa o JS.
//
// Os imports são LITERALMENTE os mesmos usados no lazy() acima — o Vite
// resolve pro mesmo chunk, então o React.lazy depois acha o módulo já
// pronto em memória e monta na hora.
const PREFETCH_ROUTES = [
  () => import('./pages/TrainPage'),
  () => import('./pages/FeedPage'),
  () => import('./pages/ProfilePage'),
  () => import('./pages/AIWorkoutPage'),
  () => import('./pages/ProgressPage'),
]

function RoutePrefetcher() {
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isAuthenticated) return

    // Respeita "economia de dados" e redes ruins — baixar chunk especulativo
    // em 2G/economia é justamente o oposto de deixar o app mais rápido.
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string }
    }).connection
    if (connection?.saveData) return
    if (connection?.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) return

    let cancelled = false
    const prefetch = () => {
      if (cancelled) return
      for (const load of PREFETCH_ROUTES) {
        void load().catch(() => {
          // Chunk indisponível (deploy no meio do caminho): a navegação
          // real vai tentar de novo e o lazyNamed trata o caso.
        })
      }
    }

    const idle = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }).requestIdleCallback

    // Safari/iOS ainda não tem requestIdleCallback — cai num timer curto,
    // tempo suficiente pra rota atual terminar de montar primeiro.
    const handle = idle ? idle(prefetch, { timeout: 3_000 }) : window.setTimeout(prefetch, 1_500)

    return () => {
      cancelled = true
      if (!idle) window.clearTimeout(handle)
    }
  }, [isAuthenticated])

  return null
}

// Generic fallback while a chunk loads. Cheaper than rendering a per-page
// skeleton since the page is about to mount anyway.
function RouteFallback() {
  return (
    <section className="space-y-3" aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-32 w-full rounded-3xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </section>
  )
}

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
        {/* Per-route boundary keyed by pathname — when the user navigates
            away from a crashed page, the boundary resets automatically. */}
        <ErrorBoundary
          key={location.pathname}
          onError={(error, info) => captureRenderError(error, info.componentStack)}
        >
          <Suspense fallback={<RouteFallback />}>
            <Routes location={location}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
              {/* Página pública de convite PRO — aceita user logado ou não.
                  Internamente decide se mostra "Entrar" ou "Resgatar". */}
              <Route path="/pro-invite/:token" element={<ProInvitePage />} />
              {/* Documentos legais — públicos, indexáveis. */}
              <Route path="/termos" element={<TermosPage />} />
              <Route path="/privacidade" element={<PrivacidadePage />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <HomePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute>
                    <OnboardingPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/workouts"
                element={
                  <ProtectedRoute>
                    <Navigate to="/train" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/train"
                element={
                  <ProtectedRoute>
                    <TrainPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/workout-recommendations"
                element={
                  <ProtectedRoute>
                    <WorkoutRecommendationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/ai-workout"
                element={
                  <ProtectedRoute>
                    <AIWorkoutPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/recommendation"
                element={
                  <ProtectedRoute>
                    <RecommendationDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              {/* The previous /history list view is now embedded in /profile (with
                  infinite scroll). The route stays alive as a permanent redirect
                  for old bookmarks/share links so nothing 404s. */}
              <Route path="/history" element={<Navigate to="/profile" replace />} />
              <Route
                path="/workouts/:sessionId"
                element={
                  <ProtectedRoute>
                    <WorkoutDetailPage />
                  </ProtectedRoute>
                }
              />
              {/* Detalhe de exercício — destino dos links em HistoryExerciseCard
                  (clique no nome do exercício dentro do histórico/treino abre aqui). */}
              <Route
                path="/exercises/:exerciseId"
                element={
                  <ProtectedRoute>
                    <ExerciseDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/progress"
                element={
                  <ProtectedRoute>
                    <ProgressPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/feed"
                element={
                  <ProtectedRoute>
                    <FeedPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/post/:postId"
                element={
                  <ProtectedRoute>
                    <PostPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/desafios"
                element={
                  <ProtectedRoute>
                    <CompetitionsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/desafios/convite/:token"
                element={<CompetitionInvitePage />}
              />
              <Route
                path="/desafios/:competitionId"
                element={
                  <ProtectedRoute>
                    <CompetitionDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/u/:userId" element={<PublicProfilePage />} />
              <Route path="/shared/:token" element={<SharedPlanPage />} />
              <Route
                path="/admin/users"
                element={
                  <AdminRoute>
                    <AdminUsersPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/pro-invites"
                element={
                  <AdminRoute>
                    <AdminProInvitesPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/support"
                element={
                  <ProtectedRoute>
                    <SupportPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/support/:ticketId"
                element={
                  <ProtectedRoute>
                    <SupportTicketPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/support"
                element={
                  <AdminRoute>
                    <AdminSupportPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/support/templates"
                element={
                  <AdminRoute>
                    <AdminSupportTemplatesPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/support/reports"
                element={
                  <AdminRoute>
                    <AdminReportsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="/admin/support/:ticketId"
                element={
                  <AdminRoute>
                    <AdminSupportTicketPage />
                  </AdminRoute>
                }
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  )
}

function App() {
  return (
    <ErrorBoundary onError={(error, info) => captureRenderError(error, info.componentStack)}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            {/* PlanLimitDialogProvider — wrappa o app inteiro pra qualquer
                caller poder chamar useShowPlanLimit() e abrir o dialog
                contextual quando bater 402 PLAN_LIMIT_REACHED do backend. */}
            <PlanLimitDialogProvider>
              {/* TermsAcceptanceGate é só visual — checa o user logado e
                  renderiza um modal bloqueante quando user.acceptedTermsVersion
                  está defasado vs CURRENT_TERMS_VERSION. Rotas públicas
                  (/login, /register, /termos, /privacidade) passam livres. */}
              <TermsAcceptanceGate>
                <AppShell>
                  <AnimatedRoutes />
                </AppShell>
                {/* Componentes globais PWA — montados fora do AppShell pra
                    não dependerem de routing/auth. Cada um decide internamente
                    se renderiza ou não (snooze, standalone, etc.). */}
                <PwaUpdatePrompt />
                <PwaInstallBanner />
                <RoutePrefetcher />
              </TermsAcceptanceGate>
            </PlanLimitDialogProvider>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
