import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { TrainPage } from './pages/TrainPage'
import { HistoryPage } from './pages/HistoryPage'
import { ProgressPage } from './pages/ProgressPage'
import { AnimatePresence, motion } from 'framer-motion'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { AuthProvider } from './context/AuthContext'
import { AppShell } from './components/layout/AppShell'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { AdminRoute } from './components/auth/AdminRoute'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { GoogleCallbackPage } from './pages/GoogleCallbackPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { WorkoutRecommendationsPage } from './pages/WorkoutRecommendationsPage'
import { AIWorkoutPage } from './pages/AIWorkoutPage'
import { FeedPage } from './pages/FeedPage'
import { PublicProfilePage } from './pages/PublicProfilePage'
import { SharedPlanPage } from './pages/SharedPlanPage'

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
            path="/history"
            element={
              <ProtectedRoute>
                <HistoryPage />
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
        </Routes>
      </motion.div>
    </AnimatePresence>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell>
          <AnimatedRoutes />
        </AppShell>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
