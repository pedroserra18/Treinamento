import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AdminRoute } from './components/auth/AdminRoute'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AppShell } from './components/layout/AppShell'
import { AuthProvider } from './context/AuthContext'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { GoogleCallbackPage } from './pages/GoogleCallbackPage'
import { HistoryPage } from './pages/HistoryPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { TrainPage } from './pages/TrainPage'
import { WorkoutRecommendationsPage } from './pages/WorkoutRecommendationsPage'
import { WorkoutsPage } from './pages/WorkoutsPage'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
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
                  <WorkoutsPage />
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
              path="/admin/users"
              element={
                <AdminRoute>
                  <AdminUsersPage />
                </AdminRoute>
              }
            />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
