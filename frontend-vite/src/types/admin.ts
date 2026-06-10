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
  plan: 'FREE' | 'PRO'
  planExpiresAt: string | null
  aiGenerationsTotal: number
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
    proRealCount: number
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
    plan: 'FREE' | 'PRO'
    planExpiresAt: string | null
    aiGenerationsTotal: number
  }
  stats: {
    workoutPlanCount: number
    workoutSessionCount: number
    completedSessionCount: number
    aiPlansGenerated: number
    followersCount: number
    followingCount: number
    proInvitesCreatedCount: number
    proInvitesUsedCount: number
  }
  recentEvents: AdminUserEvent[]
}
