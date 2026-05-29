import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import {
  acceptInvite,
  createCompetition,
  declineInvite,
  deleteCompetitionEntry,
  deleteEntryComment,
  demoteMember,
  getCompetition,
  getCompetitionFeed,
  getInvitePreview,
  getMyActiveCompetition,
  getStandings,
  inviteMember,
  kickMember,
  leaveCompetition,
  listEntryComments,
  listInvitableFriends,
  listMyCompetitions,
  listMyInvites,
  postEntryComment,
  promoteMember,
  startCompetition,
  toggleReaction,
} from '../services/competitionService'
import type {
  CompetitionEntryKind,
  CompetitionFeedItem,
  CompetitionReactionKind,
  CompetitionType,
} from '../types/competition'

// Centralised query keys for type-safe invalidations. Always go through
// these instead of inline arrays so a typo doesn't silently miss
// invalidations.
export const competitionKeys = {
  all: ['competition'] as const,
  list: () => [...competitionKeys.all, 'list'] as const,
  mine: () => [...competitionKeys.all, 'mine'] as const,
  myInvites: () => [...competitionKeys.all, 'invites'] as const,
  detail: (id: string) => [...competitionKeys.all, id] as const,
  standings: (id: string) => [...competitionKeys.detail(id), 'standings'] as const,
  feed: (id: string) => [...competitionKeys.detail(id), 'feed'] as const,
  invitableFriends: (id: string) => [...competitionKeys.detail(id), 'invitable-friends'] as const,
  entryComments: (id: string, entryId: string) => [...competitionKeys.detail(id), 'entry', entryId, 'comments'] as const,
  invitePreview: (token: string) => [...competitionKeys.all, 'invite-preview', token] as const,
}

// ─── Queries ───────────────────────────────────────────────────────────

export function useCompetition(competitionId: string | undefined) {
  const { authorizedFetch } = useAuth()
  return useQuery({
    queryKey: competitionKeys.detail(competitionId ?? ''),
    queryFn: () => getCompetition(authorizedFetch, competitionId!),
    enabled: Boolean(competitionId),
  })
}

export function useStandings(competitionId: string | undefined, options?: { polling?: boolean }) {
  const { authorizedFetch } = useAuth()
  return useQuery({
    queryKey: competitionKeys.standings(competitionId ?? ''),
    queryFn: () => getStandings(authorizedFetch, competitionId!),
    enabled: Boolean(competitionId),
    // Polling is enabled per page (active competitions only) so finished
    // rooms don't waste requests.
    refetchInterval: options?.polling ? 12_000 : false,
  })
}

// Infinite feed query — first page polls every 12s when the room is
// active so newly-posted proofs land without a manual refresh.
// Subsequent pages only load on user request (scroll-to-bottom).
export function useCompetitionFeed(competitionId: string | undefined, options?: { polling?: boolean }) {
  const { authorizedFetch } = useAuth()
  return useInfiniteQuery({
    queryKey: competitionKeys.feed(competitionId ?? ''),
    queryFn: ({ pageParam }) =>
      getCompetitionFeed(authorizedFetch, competitionId!, {
        before: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(competitionId),
    refetchInterval: options?.polling ? 12_000 : false,
  })
}

export function useMyActiveCompetition() {
  const { authorizedFetch } = useAuth()
  return useQuery({
    queryKey: competitionKeys.mine(),
    queryFn: () => getMyActiveCompetition(authorizedFetch),
  })
}

export function useMyCompetitions() {
  const { authorizedFetch } = useAuth()
  return useQuery({
    queryKey: competitionKeys.list(),
    queryFn: () => listMyCompetitions(authorizedFetch),
  })
}

export function useMyInvites() {
  const { authorizedFetch } = useAuth()
  return useQuery({
    queryKey: competitionKeys.myInvites(),
    queryFn: () => listMyInvites(authorizedFetch),
  })
}

export function useInvitePreview(token: string | undefined) {
  const { authorizedFetch } = useAuth()
  return useQuery({
    queryKey: competitionKeys.invitePreview(token ?? ''),
    queryFn: () => getInvitePreview(authorizedFetch, token!),
    enabled: Boolean(token),
  })
}

export function useInvitableFriends(competitionId: string | undefined) {
  const { authorizedFetch } = useAuth()
  return useQuery({
    queryKey: competitionKeys.invitableFriends(competitionId ?? ''),
    queryFn: () => listInvitableFriends(authorizedFetch, competitionId!),
    enabled: Boolean(competitionId),
  })
}

export function useEntryComments(competitionId: string | undefined, entryId: string | undefined) {
  const { authorizedFetch } = useAuth()
  return useQuery({
    queryKey: competitionKeys.entryComments(competitionId ?? '', entryId ?? ''),
    queryFn: () => listEntryComments(authorizedFetch, competitionId!, entryId!),
    enabled: Boolean(competitionId && entryId),
  })
}

// ─── Mutations ─────────────────────────────────────────────────────────

export function useCreateCompetition() {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name?: string; type: CompetitionType; durationDays: 30 | 60 | 90 }) =>
      createCompetition(authorizedFetch, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.list() })
      void qc.invalidateQueries({ queryKey: competitionKeys.mine() })
    },
  })
}

export function useStartCompetition(competitionId: string) {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => startCompetition(authorizedFetch, competitionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.detail(competitionId) })
    },
  })
}

export function useLeaveCompetition(competitionId: string) {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => leaveCompetition(authorizedFetch, competitionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.all })
    },
  })
}

export function useInviteMember(competitionId: string) {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { invitedUserId?: string }) =>
      inviteMember(authorizedFetch, competitionId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.invitableFriends(competitionId) })
    },
  })
}

export function useAcceptInvite() {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => acceptInvite(authorizedFetch, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.all })
    },
  })
}

export function useDeclineInvite() {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => declineInvite(authorizedFetch, token),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.myInvites() })
    },
  })
}

export function usePromoteMember(competitionId: string) {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => promoteMember(authorizedFetch, competitionId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.detail(competitionId) })
    },
  })
}

export function useDemoteMember(competitionId: string) {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => demoteMember(authorizedFetch, competitionId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.detail(competitionId) })
    },
  })
}

export function useKickMember(competitionId: string) {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => kickMember(authorizedFetch, competitionId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.detail(competitionId) })
    },
  })
}

export function useToggleReaction(competitionId: string) {
  const { authorizedFetch } = useAuth()
  return useMutation({
    mutationFn: ({ entryId, kind }: { entryId: string; kind: CompetitionReactionKind }) =>
      toggleReaction(authorizedFetch, competitionId, entryId, kind),
    // No invalidation here — the caller patches the feed cache directly
    // for an instant feel and the next poll reconciles any drift.
  })
}

export function useDeleteEntry(competitionId: string) {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) => deleteCompetitionEntry(authorizedFetch, competitionId, entryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.feed(competitionId) })
      void qc.invalidateQueries({ queryKey: competitionKeys.standings(competitionId) })
    },
  })
}

type FeedPage = { items: CompetitionFeedItem[]; nextCursor: string | null }
type FeedInfiniteData = { pages: FeedPage[]; pageParams: unknown[] }

// Bumps the commentsCount on the feed query for one entry. Used right
// after a comment add/delete so the grid tile chip updates without an
// extra refetch. Walks every loaded page since the entry could live
// on any of them.
function patchFeedCommentCount(
  qc: ReturnType<typeof useQueryClient>,
  competitionId: string,
  entryId: string,
  delta: number,
) {
  qc.setQueryData<FeedInfiniteData>(
    competitionKeys.feed(competitionId),
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((it) =>
                it.id === entryId
                  ? { ...it, commentsCount: Math.max(0, it.commentsCount + delta) }
                  : it,
              ),
            })),
          }
        : data,
  )
}

export function usePostEntryComment(competitionId: string, entryId: string) {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => postEntryComment(authorizedFetch, competitionId, entryId, content),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.entryComments(competitionId, entryId) })
      patchFeedCommentCount(qc, competitionId, entryId, +1)
    },
  })
}

export function useDeleteEntryComment(competitionId: string, entryId: string) {
  const { authorizedFetch } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => deleteEntryComment(authorizedFetch, competitionId, entryId, commentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: competitionKeys.entryComments(competitionId, entryId) })
      patchFeedCommentCount(qc, competitionId, entryId, -1)
    },
  })
}

// Unused for now (entry posting still happens from TrainPage) — kept for
// when we migrate that page too.
export type PostEntryInput = {
  kind: CompetitionEntryKind
  photoUrl: string
  photoPath?: string
  photoHash: string
  workoutSessionId?: string
}
