import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getFeed, toggleLike, deletePost, searchUsers, followUser, unfollowUser, type FeedPost, type UserSearchResult, type WorkoutExerciseSummary } from '../services/socialService'

function formatDuration(sec: number | null): string {
  if (!sec) return '-'
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d atrás`
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

function ExerciseStatsRow({ ex }: { ex: WorkoutExerciseSummary }) {
  const totalReps = ex.sets.reduce((s, set) => s + (set.reps ?? 0), 0)
  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold text-[var(--text)]">{ex.name}</p>
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
          {ex.primaryMuscleGroup}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--muted)]">{ex.sets.length} set(s)</span>
        {totalReps > 0 && <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--muted)]">Reps: {totalReps}</span>}
        {ex.totalVolumeKg > 0 && <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--muted)]">Volume: {ex.totalVolumeKg} kg</span>}
      </div>
      <div className="space-y-1 border-t border-[var(--line)] pt-2">
        {ex.sets.map((set) => (
          <div key={set.setNumber} className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted)]">
            <span className="font-semibold text-[var(--text)]">Set {set.setNumber}</span>
            {set.reps != null && <span>Reps: {set.reps}</span>}
            {set.weightKg != null && <span>Carga: {set.weightKg} kg</span>}
            {set.durationSec != null && <span>Duração: {set.durationSec}s</span>}
            {set.distanceMeters != null && <span>Dist: {set.distanceMeters} m</span>}
            {set.perceivedExertion != null && <span>RPE: {set.perceivedExertion}</span>}
          </div>
        ))}
      </div>
    </article>
  )
}

function PostCard({ post, userId, onLike, onDelete, onProfileClick }: {
  post: FeedPost
  userId: string | undefined
  onLike: (id: string) => void
  onDelete: (id: string) => void
  onProfileClick: (id: string) => void
}) {
  const isOwn = post.user.id === userId
  const [expanded, setExpanded] = useState(false)

  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      {post.photoUrl && (
        <img src={post.photoUrl} alt="Foto do treino" className="w-full object-cover max-h-72" />
      )}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onProfileClick(post.user.id)}
            className="flex items-center gap-2 text-left"
          >
            <div className="h-9 w-9 shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] overflow-hidden">
              {post.user.avatarUrl
                ? <img src={post.user.avatarUrl} alt="" className="h-full w-full object-cover" />
                : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--muted)]">{(post.user.name ?? '?')[0]?.toUpperCase()}</span>
              }
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--text)]">{post.user.name ?? 'Usuário'}</p>
              <p className="text-xs text-[var(--muted)]">{timeAgo(post.createdAt)}</p>
            </div>
          </button>
          {isOwn && (
            <button
              type="button"
              onClick={() => onDelete(post.id)}
              className="text-xs text-red-400 border border-red-500/40 rounded-lg px-2 py-1"
            >
              Deletar
            </button>
          )}
        </div>

        {post.caption && <p className="text-sm text-[var(--text)]">{post.caption}</p>}

        {post.workoutSummary && (
          <div className="rounded-xl border border-[var(--line)] p-3 space-y-2">
            {/* Summary row */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Duração</p>
                  <p className="text-sm font-bold text-[var(--text)]">{formatDuration(post.workoutSummary.durationSec)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Volume</p>
                  <p className="text-sm font-bold text-[var(--text)]">{post.workoutSummary.totalVolumeKg} kg</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Exercícios</p>
                  <p className="text-sm font-bold text-[var(--text)]">{post.workoutSummary.exercises.length}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] shrink-0"
              >
                {expanded ? 'Ocultar' : 'Ver stats'}
              </button>
            </div>

            {/* Collapsed chips */}
            {!expanded && (
              <div className="flex flex-wrap gap-1">
                {post.workoutSummary.exercises.slice(0, 5).map((ex) => (
                  <span key={ex.name} className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    {ex.name} · {ex.sets.length}x
                  </span>
                ))}
                {post.workoutSummary.exercises.length > 5 && (
                  <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    +{post.workoutSummary.exercises.length - 5}
                  </span>
                )}
              </div>
            )}

            {/* Expanded exercise detail */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden space-y-2"
                >
                  {post.workoutSummary.exercises.map((ex) => (
                    <ExerciseStatsRow key={ex.name} ex={ex} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => onLike(post.id)}
            className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${
              post.likedByMe ? 'text-[var(--brand)]' : 'text-[var(--muted)]'
            }`}
          >
            <span>{post.likedByMe ? '♥' : '♡'}</span>
            <span>{post.likesCount}</span>
          </button>
        </div>
      </div>
    </article>
  )
}

export function FeedPage() {
  const { authorizedFetch, user } = useAuth()
  const navigate = useNavigate()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getFeed(authorizedFetch)
      setPosts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar feed')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => { void load() }, [load])

  const handleLike = async (postId: string) => {
    try {
      const result = await toggleLike(authorizedFetch, postId)
      setPosts((prev) => prev.map((p) =>
        p.id === postId
          ? { ...p, likedByMe: result.liked, likesCount: p.likesCount + (result.liked ? 1 : -1) }
          : p
      ))
    } catch { /* silent */ }
  }

  const handleSearch = (q: string) => {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        setSearching(true)
        const results = await searchUsers(authorizedFetch, q.trim())
        setSearchResults(results)
      } catch { /* silent */ } finally {
        setSearching(false)
      }
    }, 400)
  }

  const handleFollowToggle = async (result: UserSearchResult) => {
    try {
      if (result.isFollowing) {
        await unfollowUser(authorizedFetch, result.id)
      } else {
        await followUser(authorizedFetch, result.id)
      }
      setSearchResults((prev) => prev.map((u) => u.id === result.id ? { ...u, isFollowing: !u.isFollowing } : u))
    } catch { /* silent */ }
  }

  const handleDelete = async (postId: string) => {
    if (!window.confirm('Deletar este post?')) return
    try {
      await deletePost(authorizedFetch, postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar post')
    }
  }

  return (
    <section className="space-y-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <h1 className="text-2xl font-black text-[var(--text)]">Feed</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Treinos da comunidade e dos seus amigos.</p>
      </motion.header>

      {/* Search */}
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Pesquisar usuários..."
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--brand)]"
        />
        {query.trim() && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-lg overflow-hidden">
            {searching && <p className="px-4 py-3 text-sm text-[var(--muted)]">Pesquisando...</p>}
            {!searching && searchResults.length === 0 && (
              <p className="px-4 py-3 text-sm text-[var(--muted)]">Nenhum usuário encontrado.</p>
            )}
            {searchResults.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-hover)]">
                <button
                  type="button"
                  onClick={() => { setQuery(''); setSearchResults([]); navigate(`/u/${u.id}`) }}
                  className="flex items-center gap-2 text-left min-w-0"
                >
                  <div className="h-8 w-8 shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] overflow-hidden">
                    {u.avatarUrl
                      ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                      : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--muted)]">{(u.name ?? '?')[0]?.toUpperCase()}</span>
                    }
                  </div>
                  <span className="text-sm font-semibold text-[var(--text)] truncate">{u.name ?? 'Usuário'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleFollowToggle(u)}
                  className={`shrink-0 rounded-xl px-3 py-1 text-xs font-bold border transition-colors ${
                    u.isFollowing
                      ? 'border-[var(--line)] text-[var(--muted)]'
                      : 'border-[var(--brand)] text-[var(--brand)]'
                  }`}
                >
                  {u.isFollowing ? 'Seguindo' : 'Seguir'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && (
        <p className="text-sm text-[var(--muted)]">Carregando...</p>
      )}

      {!loading && posts.length === 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
          <p className="text-[var(--muted)]">Nenhum post ainda.</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Siga outros usuários ou poste seu treino ao finalizar!</p>
        </div>
      )}

      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            userId={user?.id}
            onLike={handleLike}
            onDelete={handleDelete}
            onProfileClick={(id) => navigate(`/u/${id}`)}
          />
        ))}
      </div>
    </section>
  )
}
