import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { getFeed, toggleLike, deletePost, searchUsers, followUser, unfollowUser, getFollowing, type FeedPost, type UserSearchResult, type WorkoutExerciseSummary } from '../services/socialService'
import { SkeletonCard } from '../components/common/Skeleton'
import { WorkoutPostImage } from '../components/common/WorkoutPostImage'
import { Rss, Users, Heart } from 'lucide-react'

const PAGE_SIZE = 5

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

function PostCard({ post, userId, isAdmin, isFriend, onLike, onDelete, onProfileClick }: {
  post: FeedPost
  userId: string | undefined
  isAdmin: boolean
  isFriend: boolean
  onLike: (id: string) => void
  onDelete: (id: string) => void
  onProfileClick: (id: string) => void
}) {
  const isOwn = post.user.id === userId
  const canDelete = isOwn || isAdmin
  const [expanded, setExpanded] = useState(false)
  const hasValidPhoto = Boolean(post.photoUrl) && !post.photoUrl!.startsWith('blob:')
  const hasPhoto = hasValidPhoto

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div className={`flex flex-col ${hasPhoto ? 'md:flex-row' : ''}`}>
        {hasPhoto && (
          <div className="relative shrink-0 md:w-[32%] md:max-w-[300px]">
            <WorkoutPostImage src={post.photoUrl!} />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
          <header className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onProfileClick(post.user.id)}
              className="flex items-center gap-2 text-left"
            >
              <div className="relative">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-hover)]">
                  {post.user.avatarUrl
                    ? <img src={post.user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--muted)]">{(post.user.name ?? '?')[0]?.toUpperCase()}</span>
                  }
                </div>
                {isFriend && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[var(--surface)]">
                    <Users size={7} className="text-white" />
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-[var(--text)]">{post.user.name ?? 'Usuário'}</p>
                  {isFriend && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-500">
                      Amigo
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)]">{timeAgo(post.createdAt)}</p>
              </div>
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={() => onDelete(post.id)}
                className={`rounded-lg border px-2 py-1 text-xs ${
                  !isOwn && isAdmin
                    ? 'border-amber-500/50 text-amber-400'
                    : 'border-red-500/40 text-red-400'
                }`}
                title={!isOwn && isAdmin ? 'Remover como administrador' : 'Deletar'}
              >
                {!isOwn && isAdmin ? 'Remover (admin)' : 'Deletar'}
              </button>
            )}
          </header>

          {post.caption && <p className="text-sm leading-relaxed text-[var(--text)]">{post.caption}</p>}

          {post.workoutSummary && (
            <div className="grid grid-cols-3 divide-x divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-hover)]/40">
              <div className="px-3 py-2.5 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Duração</p>
                <p className="mt-0.5 text-sm font-extrabold text-[var(--text)]">{formatDuration(post.workoutSummary.durationSec)}</p>
              </div>
              <div className="px-3 py-2.5 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Volume</p>
                <p className="mt-0.5 text-sm font-extrabold text-[var(--text)]">{post.workoutSummary.totalVolumeKg} kg</p>
              </div>
              <div className="px-3 py-2.5 text-center">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">Exercícios</p>
                <p className="mt-0.5 text-sm font-extrabold text-[var(--text)]">{post.workoutSummary.exercises.length}</p>
              </div>
            </div>
          )}

          {post.workoutSummary && (
            <div className="space-y-2">
              {!expanded && (
                <div className="flex flex-wrap gap-1.5">
                  {post.workoutSummary.exercises.slice(0, 4).map((ex) => (
                    <span key={ex.name} className="rounded-full border border-[var(--line)] bg-[var(--surface-hover)]/50 px-2.5 py-1 text-[11px] text-[var(--muted)]">
                      {ex.name} · {ex.sets.length}x
                    </span>
                  ))}
                  {post.workoutSummary.exercises.length > 4 && (
                    <span className="rounded-full border border-[var(--line)] bg-[var(--surface-hover)]/50 px-2.5 py-1 text-[11px] text-[var(--muted)]">
                      +{post.workoutSummary.exercises.length - 4}
                    </span>
                  )}
                </div>
              )}

              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2 overflow-hidden"
                  >
                    {post.workoutSummary.exercises.map((ex) => (
                      <ExerciseStatsRow key={ex.name} ex={ex} />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="w-full rounded-lg border border-[var(--line)] py-1.5 text-[11px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
              >
                {expanded ? 'Ocultar detalhes' : 'Ver stats completos'}
              </button>
            </div>
          )}

          <div className="mt-auto flex items-center gap-3 pt-1">
            <motion.button
              type="button"
              onClick={() => onLike(post.id)}
              whileTap={{ scale: 0.85 }}
              whileHover={{ scale: 1.05 }}
              className={`group relative flex items-center gap-2 text-sm font-bold transition-colors ${
                post.likedByMe ? 'text-[var(--brand)]' : 'text-[var(--muted)] hover:text-[var(--brand)]'
              }`}
              aria-label={post.likedByMe ? 'Descurtir' : 'Curtir'}
            >
              <span className="relative inline-flex h-8 w-8 items-center justify-center">
                <AnimatePresence>
                  {post.likedByMe && (
                    <motion.span
                      key="burst"
                      initial={{ scale: 0, opacity: 0.7 }}
                      animate={{ scale: 1.8, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.55, ease: 'easeOut' }}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full bg-[var(--brand)]/35 blur-md"
                    />
                  )}
                </AnimatePresence>
                <motion.span
                  key={post.likedByMe ? 'liked' : 'unliked'}
                  initial={post.likedByMe ? { scale: 0.6 } : false}
                  animate={post.likedByMe ? { scale: [0.6, 1.4, 1] } : { scale: 1 }}
                  transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
                  className="relative inline-flex"
                >
                  <Heart
                    size={26}
                    strokeWidth={2.2}
                    className={`transition-transform duration-200 ${
                      post.likedByMe
                        ? 'fill-[var(--brand)] drop-shadow-[0_0_6px_rgba(255,77,77,0.45)]'
                        : 'fill-transparent group-hover:fill-[var(--brand)]/15'
                    }`}
                  />
                </motion.span>
              </span>
              <motion.span
                key={post.likesCount}
                initial={{ y: -2, opacity: 0.4 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.25 }}
                className="tabular-nums"
              >
                {post.likesCount}
              </motion.span>
            </motion.button>
          </div>
        </div>
      </div>
    </article>
  )
}

type FeedFilter = 'amigos' | 'todos' | 'curtidos'

const FILTER_LABELS: Record<FeedFilter, string> = {
  amigos: 'Amigos',
  todos: 'Todos',
  curtidos: 'Curtidos',
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
  const [filter, setFilter] = useState<FeedFilter>('amigos')
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [data, following] = await Promise.all([
        getFeed(authorizedFetch),
        getFollowing(authorizedFetch).catch(() => [] as UserSearchResult[]),
      ])
      setPosts(data)
      setFollowingIds(new Set(following.map((u) => u.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar feed')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => { void load() }, [load])

  // Resetar paginação ao trocar filtro
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [filter])

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
    const post = posts.find((p) => p.id === postId)
    const isOwn = post?.user.id === user?.id
    const message = !isOwn && user?.role === 'ADMIN'
      ? 'Remover este post como administrador?'
      : 'Deletar este post?'
    if (!window.confirm(message)) return
    try {
      await deletePost(authorizedFetch, postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar post')
    }
  }

  const sortedPosts = useMemo(() => {
    const filtered = posts.filter((p) => {
      if (filter === 'curtidos') return p.likedByMe
      if (filter === 'amigos') return p.user.id === user?.id || followingIds.has(p.user.id)
      return true
    })
    return [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [posts, filter, followingIds, user?.id])

  const visiblePosts = sortedPosts.slice(0, visibleCount)
  const hasMore = visibleCount < sortedPosts.length

  return (
    <section className="space-y-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <h1 className="text-2xl font-black text-[var(--text)]">Feed</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Treinos da comunidade e dos seus amigos.</p>
        <div className="mt-3 flex gap-2">
          {(['amigos', 'todos', 'curtidos'] as FeedFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                filter === f ? 'bg-[var(--brand)] text-white' : 'border border-[var(--line)] text-[var(--muted)]'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
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
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && sortedPosts.length === 0 && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-10 text-center">
          <Rss size={36} className="mx-auto mb-3 text-[var(--muted)]" strokeWidth={1.5} />
          <p className="text-base font-bold text-[var(--text)]">
            {filter === 'curtidos'
              ? 'Nenhum post curtido ainda'
              : filter === 'amigos'
                ? 'Nenhum post de amigos ainda'
                : 'Nenhum post ainda'}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {filter === 'amigos'
              ? 'Siga outros usuários ou troque para "Todos" para ver posts da comunidade.'
              : 'Siga outros usuários ou finalize um treino para publicar!'}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {visiblePosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            userId={user?.id}
            isAdmin={user?.role === 'ADMIN'}
            isFriend={followingIds.has(post.user.id)}
            onLike={handleLike}
            onDelete={handleDelete}
            onProfileClick={(id) => navigate(`/u/${id}`)}
          />
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] py-3 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          Carregar mais ({sortedPosts.length - visibleCount} restantes)
        </button>
      )}

      {!hasMore && sortedPosts.length > PAGE_SIZE && (
        <p className="py-2 text-center text-xs text-[var(--muted)]">Todos os posts foram carregados.</p>
      )}
    </section>
  )
}
