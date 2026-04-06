export type AdminUser = {
  id: string
  name: string | null
  email: string
  accountType: 'REAL' | 'TEST'
  role: 'USER' | 'COACH' | 'ADMIN'
  status: string
  createdAt: string
  lastLoginAt: string | null
  onboardingCompletedAt: string | null
  availableDaysPerWeek: number | null
  mfaEnabled: boolean
}

export type AdminUsersResponse = {
  page: number
  pageSize: number
  total: number
  items: AdminUser[]
}
