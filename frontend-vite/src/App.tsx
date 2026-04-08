import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { TrainPage } from './pages/TrainPage'
import { HistoryPage } from './pages/HistoryPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { AuthProvider } from './context/AuthContext'
import { AppShell } from './components/layout/AppShell'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { AdminRoute } from './components/auth/AdminRoute'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { GoogleCallbackPage } from './pages/GoogleCallbackPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { WorkoutRecommendationsPage } from './pages/WorkoutRecommendationsPage'

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
