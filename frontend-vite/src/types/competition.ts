export type CompetitionType = 'TRAINING' | 'CARDIO' | 'BOTH'
export type CompetitionStatus = 'LOBBY' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type CompetitionRole = 'ADMIN' | 'MEMBER'
export type CompetitionInviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED'

export type CompetitionUserSummary = {
  id: string
  name: string | null
  handle: string
  avatarUrl: string | null
}

export type CompetitionMember = {
  id: string
  userId: string
  role: CompetitionRole
  joinedAt: string
  user: CompetitionUserSummary
}

export type Competition = {
  id: string
  ownerUserId: string
  name: string | null
  type: CompetitionType
  durationDays: number
  status: CompetitionStatus
  startedAt: string | null
  endsAt: string | null
  winnerUserId: string | null
  inviteToken: string
  createdAt: string
  owner: CompetitionUserSummary
  members: CompetitionMember[]
  _count: { entries: number }
}

export type CompetitionInvite = {
  id: string
  competitionId: string
  invitedByUserId: string
  invitedUserId: string | null
  token: string
  status: CompetitionInviteStatus
  expiresAt: string
  createdAt: string
}

export type CompetitionInvitePreview = {
  id: string
  token: string
  status: CompetitionInviteStatus
  expiresAt: string
  competition: {
    id: string
    name: string | null
    type: CompetitionType
    durationDays: number
    status: CompetitionStatus
    _count: { members: number }
  }
  invitedBy: CompetitionUserSummary
  invitedUserId: string | null
}

export type CompetitionInviteWithContext = CompetitionInvitePreview & {
  competitionId: string
}
