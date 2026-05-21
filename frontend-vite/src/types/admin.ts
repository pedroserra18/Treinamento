export type AdminUser = {
  id: string
  name: string | null
  handle: string | null
  avatarUrl: string | null
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
  summary: {
    realCount: number
    testCount: number
    totalCount: number
    newRealLast7Days: number
  }
  items: AdminUser[]
}

export type AdminSortBy = 'createdAt' | 'lastLoginAt' | 'name' | 'email' | 'status' | 'role'

export type AdminUserEvent = {
  id: string
  action: string
  severity: string
  occurredAt: string
  userId: string | null
}

export type AdminUserDetail = {
  user: {
    id: string
    name: string | null
    handle: string | null
    avatarUrl: string | null
    email: string
    role: 'USER' | 'COACH' | 'ADMIN'
    status: string
    sex: string
    birthDate: string | null
    availableDaysPerWeek: number | null
    onboardingCompletedAt: string | null
    emailVerifiedAt: string | null
    mfaEnabled: boolean
    lastLoginAt: string | null
    createdAt: string
    accountType: 'REAL' | 'TEST'
  }
  stats: {
    workoutPlanCount: number
    workoutSessionCount: number
    completedSessionCount: number
    aiPlansGenerated: number
    followersCount: number
    followingCount: number
  }
  recentEvents: AdminUserEvent[]
}
