import { lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { AppShell } from './components/layout/AppShell'
import { AdminRoute } from './components/auth/AdminRoute'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { Skeleton } from './components/common/Skeleton'
import { queryClient } from './lib/queryClient'
import { captureRenderError } from './lib/sentry'

// Eager: pages a user is likely to hit before navigating away. Keeping them
// in the main chunk avoids a flash of skeleton on the most common landings.
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { GoogleCallbackPage } from './pages/GoogleCallbackPage'

// Lazy: everything else. Each route becomes its own chunk, shrinking the
// initial bundle. The helper unwraps named exports since React.lazy
// requires `default`.
const lazyNamed = <T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) => lazy(() => loader().then((mod) => ({ default: mod[name] as React.ComponentType<unknown> })))

const TrainPage = lazyNamed(() => import('./pages/TrainPage'), 'TrainPage')
const ProgressPage = lazyNamed(() => import('./pages/ProgressPage'), 'ProgressPage')
const ProfilePage = lazyNamed(() => import('./pages/ProfilePage'), 'ProfilePage')
const SettingsPage = lazyNamed(() => import('./pages/SettingsPage'), 'SettingsPage')
const WorkoutDetailPage = lazyNamed(() => import('./pages/WorkoutDetailPage'), 'WorkoutDetailPage')
const OnboardingPage = lazyNamed(() => import('./pages/OnboardingPage'), 'OnboardingPage')
const WorkoutRecommendationsPage = lazyNamed(() => import('./pages/WorkoutRecommendationsPage'), 'WorkoutRecommendationsPage')
const AIWorkoutPage = lazyNamed(() => import('./pages/AIWorkoutPage'), 'AIWorkoutPage')
const FeedPage = lazyNamed(() => import('./pages/FeedPage'), 'FeedPage')
const PublicProfilePage = lazyNamed(() => import('./pages/PublicProfilePage'), 'PublicProfilePage')
const SharedPlanPage = lazyNamed(() => import('./pages/SharedPlanPage'), 'SharedPlanPage')
const SupportPage = lazyNamed(() => import('./pages/SupportPage'), 'SupportPage')
const SupportTicketPage = lazyNamed(() => import('./pages/SupportTicketPage'), 'SupportTicketPage')
const AdminUsersPage = lazyNamed(() => import('./pages/AdminUsersPage'), 'AdminUsersPage')
const AdminSupportPage = lazyNamed(() => import('./pages/AdminSupportPage'), 'AdminSupportPage')
const AdminSupportTicketPage = lazyNamed(() => import('./pages/AdminSupportTicketPage'), 'AdminSupportTicketPage')
const AdminSupportTemplatesPage = lazyNamed(() => import('./pages/AdminSupportTemplatesPage'), 'AdminSupportTemplatesPage')
const ExerciseDetailPage = lazyNamed(() => import('./pages/ExerciseDetailPage'), 'ExerciseDetailPage')
const CompetitionsPage = lazyNamed(() => import('./pages/CompetitionsPage'), 'CompetitionsPage')
const CompetitionDetailPage = lazyNamed(() => import('./pages/CompetitionDetailPage'), 'CompetitionDetailPage')
const CompetitionInvitePage = lazyNamed(() => import('./pages/CompetitionInvitePage'), 'CompetitionInvitePage')

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
            <AppShell>
              <AnimatedRoutes />
            </AppShell>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
