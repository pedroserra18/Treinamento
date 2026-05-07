type AuthorizedFetch = (input: string, init?: RequestInit) => Promise<Response>

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

export type PostPrivacy = 'PUBLIC' | 'FRIENDS' | 'PRIVATE'

export type WorkoutSet = {
  setNumber: number
  reps: number | null
  weightKg: number | null
  durationSec: number | null
  distanceMeters: number | null
  perceivedExertion: number | null
}

export type WorkoutExerciseSummary = {
  name: string
  primaryMuscleGroup: string
  sets: WorkoutSet[]
  totalVolumeKg: number
}

export type WorkoutSummary = {
  durationSec: number | null
  totalVolumeKg: number
  exercises: WorkoutExerciseSummary[]
}

export type FeedPost = {
  id: string
  caption: string | null
  photoUrl: string | null
  privacy: PostPrivacy
  likesCount: number
  createdAt: string
  likedByMe: boolean
  user: { id: string; name: string | null; avatarUrl: string | null }
  workoutSummary: WorkoutSummary | null
}

export type PublicProfile = {
  id: string
  name: string | null
  avatarUrl: string | null
  isPrivate: boolean
  showFollowLists: boolean
  memberSince: string
  followersCount: number | null
  followingCount: number | null
  postsCount: number | null
  isFollowing: boolean
}

export type SimpleUser = {
  id: string
  name: string | null
  avatarUrl: string | null
}

export type UserSearchResult = {
  id: string
  name: string | null
  avatarUrl: string | null
  isFollowing: boolean
}

export type SharedPlanData = {
  plan: {
    id: string
    name: string
    description: string | null
    exercises: Array<{
      orderIndex: number
      sets: number | null
      repsMin: number | null
      repsMax: number | null
      restSec: number | null
      notes: string | null
      exercise: { id: string; name: string; primaryMuscleGroup: string; equipment: string; thumbnailUrl: string | null }
    }>
  }
  creator: { id: string; name: string | null; avatarUrl: string | null }
  createdAt: string
}

export type CompareResult = {
  me: { name: string | null; avatarUrl: string | null; stats: UserStats }
  them: { name: string | null; avatarUrl: string | null; stats: UserStats }
}

type UserStats = {
  workouts7d: number
  workouts30d: number
  volumeKg7d: number
  topExercises: Array<{ name: string; count: number }>
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message ?? 'Erro na requisição')
  return json.data as T
}

export async function getFeed(authorizedFetch: AuthorizedFetch, page = 1): Promise<FeedPost[]> {
  const res = await authorizedFetch(`${API_URL}/social/feed?page=${page}&pageSize=20`)
  return handleResponse<FeedPost[]>(res)
}

export async function createPost(
  authorizedFetch: AuthorizedFetch,
  data: { workoutSessionId?: string; caption?: string; photoUrl?: string; privacy: PostPrivacy }
): Promise<FeedPost> {
  const res = await authorizedFetch(`${API_URL}/social/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<FeedPost>(res)
}

export async function deletePost(authorizedFetch: AuthorizedFetch, postId: string): Promise<void> {
  const res = await authorizedFetch(`${API_URL}/social/posts/${postId}`, { method: 'DELETE' })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    throw new Error(json?.error?.message ?? 'Erro ao remover post')
  }
}

export async function toggleLike(authorizedFetch: AuthorizedFetch, postId: string): Promise<{ liked: boolean }> {
  const res = await authorizedFetch(`${API_URL}/social/posts/${postId}/like`, { method: 'POST' })
  return handleResponse<{ liked: boolean }>(res)
}

export async function getUserPosts(authorizedFetch: AuthorizedFetch, userId: string, page = 1): Promise<FeedPost[]> {
  const res = await authorizedFetch(`${API_URL}/social/users/${userId}/posts?page=${page}&pageSize=20`)
  return handleResponse<FeedPost[]>(res)
}

export async function getPublicProfile(authorizedFetch: AuthorizedFetch, userId: string): Promise<PublicProfile> {
  const res = await authorizedFetch(`${API_URL}/social/users/${userId}/profile`)
  return handleResponse<PublicProfile>(res)
}

export async function followUser(authorizedFetch: AuthorizedFetch, userId: string): Promise<void> {
  await authorizedFetch(`${API_URL}/social/users/${userId}/follow`, { method: 'POST' })
}

export async function unfollowUser(authorizedFetch: AuthorizedFetch, userId: string): Promise<void> {
  await authorizedFetch(`${API_URL}/social/users/${userId}/follow`, { method: 'DELETE' })
}

export async function getFollowers(authorizedFetch: AuthorizedFetch): Promise<UserSearchResult[]> {
  const res = await authorizedFetch(`${API_URL}/social/followers`)
  return handleResponse<UserSearchResult[]>(res)
}

export async function getFollowing(authorizedFetch: AuthorizedFetch): Promise<UserSearchResult[]> {
  const res = await authorizedFetch(`${API_URL}/social/following`)
  return handleResponse<UserSearchResult[]>(res)
}

export async function searchUsers(authorizedFetch: AuthorizedFetch, q: string): Promise<UserSearchResult[]> {
  const res = await authorizedFetch(`${API_URL}/social/users/search?q=${encodeURIComponent(q)}`)
  return handleResponse<UserSearchResult[]>(res)
}

export async function sharePlan(authorizedFetch: AuthorizedFetch, planId: string): Promise<{ token: string }> {
  const res = await authorizedFetch(`${API_URL}/social/plans/${planId}/share`, { method: 'POST' })
  return handleResponse<{ token: string }>(res)
}

export async function getSharedPlan(authorizedFetch: AuthorizedFetch, token: string): Promise<SharedPlanData> {
  const res = await authorizedFetch(`${API_URL}/social/shared/${token}`)
  return handleResponse<SharedPlanData>(res)
}

export async function saveSharedPlan(authorizedFetch: AuthorizedFetch, token: string): Promise<{ planId: string; planName: string }> {
  const res = await authorizedFetch(`${API_URL}/social/shared/${token}/save`, { method: 'POST' })
  return handleResponse<{ planId: string; planName: string }>(res)
}

export async function compareUsers(authorizedFetch: AuthorizedFetch, userId: string): Promise<CompareResult> {
  const res = await authorizedFetch(`${API_URL}/social/users/${userId}/compare`)
  return handleResponse<CompareResult>(res)
}

export type ExerciseCompareStats = {
  maxWeightKg: number
  totalVolumeKg: number
  totalSets: number
  totalReps: number
  bestSet: { reps: number; weightKg: number } | null
}

export type ExerciseCompareResult = {
  exerciseName: string
  me: { name: string | null; avatarUrl: string | null; stats: ExerciseCompareStats }
  them: { name: string | null; avatarUrl: string | null; stats: ExerciseCompareStats }
}

export async function compareExercise(authorizedFetch: AuthorizedFetch, userId: string, exerciseId: string): Promise<ExerciseCompareResult> {
  const res = await authorizedFetch(`${API_URL}/social/users/${userId}/compare-exercise?exerciseId=${encodeURIComponent(exerciseId)}`)
  return handleResponse<ExerciseCompareResult>(res)
}

export async function updateAvatar(
  authorizedFetch: AuthorizedFetch,
  avatarUrl: string | null,
): Promise<{ avatarUrl: string | null }> {
  const res = await authorizedFetch(`${API_URL}/auth/profile/avatar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatarUrl }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message ?? 'Erro ao salvar avatar')
  const returned = json?.data?.user?.avatarUrl
  return { avatarUrl: typeof returned === 'string' ? returned : null }
}

export async function updatePrivacy(
  authorizedFetch: AuthorizedFetch,
  fields: { isPrivate?: boolean; showFollowLists?: boolean }
): Promise<{ isPrivate: boolean; showFollowLists: boolean }> {
  const res = await authorizedFetch(`${API_URL}/auth/profile/privacy`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(json?.error?.message ?? 'Erro ao salvar privacidade')
  }
  return json?.data as { isPrivate: boolean; showFollowLists: boolean }
}

export async function getPublicFollowers(authorizedFetch: AuthorizedFetch, userId: string): Promise<SimpleUser[]> {
  const res = await authorizedFetch(`${API_URL}/social/users/${userId}/followers`)
  return handleResponse<SimpleUser[]>(res)
}

export async function getPublicFollowing(authorizedFetch: AuthorizedFetch, userId: string): Promise<SimpleUser[]> {
  const res = await authorizedFetch(`${API_URL}/social/users/${userId}/following`)
  return handleResponse<SimpleUser[]>(res)
}

export async function getMutualFollowers(authorizedFetch: AuthorizedFetch, userId: string): Promise<SimpleUser[]> {
  const res = await authorizedFetch(`${API_URL}/social/users/${userId}/mutual`)
  return handleResponse<SimpleUser[]>(res)
}
