import { motion } from 'framer-motion'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  getFeed, toggleLike, deletePost, updatePostPrivacy,
  searchUsers, followUser, unfollowUser,
  type FeedPost, type PostPrivacy, type UserSearchResult,
} from '../services/socialService'
import { feedFirstPageCache } from '../lib/cache/feed-cache'
import { shareLink } from '../lib/share'
import { followingCache } from '../lib/cache/social-cache'
import { SkeletonCard } from '../components/common/Skeleton'
import { Toast } from '../components/common/Toast'
import { useToast } from '../hooks/useToast'
import { FeedPostCard } from '../components/common/FeedPostCard'
import { Avatar } from '../components/common/Avatar'
import { Rss, Search } from 'lucide-react'

const PAGE_SIZE = 5
// Tamanho de página do servidor (bate com o pageSize do getFeed). Quando uma
// página volta com menos que isso, chegamos ao fim do feed.
const SERVER_PAGE_SIZE = 20


// ─── Feed filters config ───────────────────────────────────────────────────

type FeedFilter = 'amigos' | 'todos' | 'curtidos'
const FILTER_LABELS: Record<FeedFilter, string> = {
  amigos: 'Amigos',
  todos: 'Todos',
  curtidos: 'Curtidos',
}

// ─── Main page ─────────────────────────────────────────────────────────────

export function FeedPage() {
  const { authorizedFetch, user } = useAuth()
  const navigate = useNavigate()
  // Inicialização SÍNCRONA via peek: se o cache (TTL 30s) tem feed
  // recente, mostra na hora — sem flash de skeleton. Mesmo pattern do
  // followingCache pra o set de IDs que populam o botão Seguir.
  const cachedFeed = feedFirstPageCache.peek()
  const cachedFollowing = followingCache.peek()
  const [posts, setPosts] = useState<FeedPost[]>(() => cachedFeed ?? [])
  const [loading, setLoading] = useState(() => cachedFeed == null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [filter, setFilter] = useState<FeedFilter>('amigos')
  const [followingIds, setFollowingIds] = useState<Set<string>>(
    () => new Set((cachedFollowing ?? []).map((u) => u.id)),
  )
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  const { toast, showToast: setToast } = useToast()
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  // Paginação infinita: page já carregada do servidor + guards anti-corrida
  // (refs pra serem lidos dentro do IntersectionObserver sem stale closure).
  const pageRef = useRef(1)
  const loadingMoreRef = useRef(false)
  const reachedEndRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const onReachBottomRef = useRef<() => void>(() => {})

  // Cmd/Ctrl + K focuses the search input — design hints at the shortcut so
  // we actually wire it up rather than leave it cosmetic.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const load = useCallback(async () => {
    try {
      // Só mostra skeleton se NÃO tem cache. Stale-while-revalidate:
      // refetch silencioso quando temos peek; mostra skeleton só no cold.
      if (!feedFirstPageCache.peek()) setLoading(true)
      const [data, following] = await Promise.all([
        feedFirstPageCache.get(authorizedFetch),
        followingCache.get(authorizedFetch).catch(() => [] as UserSearchResult[]),
      ])
      setPosts(data)
      setFollowingIds(new Set(following.map((u) => u.id)))
      // Reancora a paginação na página 1. Se já veio incompleta, não há
      // página 2 — evita um request extra (caso comum: feed com < 20 posts).
      pageRef.current = 1
      const done = data.length < SERVER_PAGE_SIZE
      reachedEndRef.current = done
      setReachedEnd(done)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar feed')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [filter])

  // Busca a próxima página do servidor e anexa (dedupe por id). Guardas em ref
  // garantem 1 request por vez e param no fim do feed.
  const fetchNextPage = useCallback(async () => {
    if (loadingMoreRef.current || reachedEndRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const next = pageRef.current + 1
      const data = await getFeed(authorizedFetch, next)
      pageRef.current = next
      if (data.length < SERVER_PAGE_SIZE) {
        reachedEndRef.current = true
        setReachedEnd(true)
      }
      if (data.length > 0) {
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id))
          return [...prev, ...data.filter((p) => !seen.has(p.id))]
        })
        // Revela os recém-chegados pra eles aparecerem ao rolar.
        setVisibleCount((c) => c + data.length)
      }
    } catch {
      // Silencioso: tenta de novo no próximo gatilho de scroll.
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [authorizedFetch])



  // Coalesce de curtidas. A UI vira na hora (otimista) usando este ref como
  // FONTE DE VERDADE da rajada — imune ao timing de render —, mas só UMA
  // requisição roda por post de cada vez. Quando ela responde, se o estado
  // final ainda diferir do servidor, manda só mais uma pra acertar. Assim,
  // martelar o botão não dispara dezenas de requests concorrentes (que deixavam
  // lento/piscando) nem causa corrida. `baseCount` = curtidas de outras pessoas
  // (sem a sua), ancorado no início da rajada e limpo ao sincronizar.
  const likeStateRef = useRef<
    Map<string, { liked: boolean; baseCount: number; serverLiked: boolean; inFlight: boolean }>
  >(new Map())

  const patchLikeUI = (postId: string, liked: boolean, count: number) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likedByMe: liked, likesCount: count } : p)))
    const cached = feedFirstPageCache.peek()
    if (cached) {
      feedFirstPageCache.set(
        cached.map((p) => (p.id === postId ? { ...p, likedByMe: liked, likesCount: count } : p)),
      )
    }
  }

  const flushLike = (postId: string) => {
    const e = likeStateRef.current.get(postId)
    if (!e || e.inFlight) return
    if (e.liked === e.serverLiked) {
      // Já em sincronia com o servidor — limpa pro próximo toque reancorar a
      // partir do post atual (pega curtidas de outras pessoas que chegarem).
      likeStateRef.current.delete(postId)
      return
    }
    e.inFlight = true
    toggleLike(authorizedFetch, postId)
      .then((result) => {
        const cur = likeStateRef.current.get(postId)
        if (!cur) return
        cur.serverLiked = result.liked
        cur.inFlight = false
        flushLike(postId)
      })
      .catch(() => {
        const cur = likeStateRef.current.get(postId)
        if (!cur) return
        cur.inFlight = false
        // Falha de rede: alinha intenção e UI com a última verdade do servidor.
        cur.liked = cur.serverLiked
        patchLikeUI(postId, cur.serverLiked, cur.baseCount + (cur.serverLiked ? 1 : 0))
      })
  }

  const handleLike = (postId: string) => {
    let e = likeStateRef.current.get(postId)
    if (!e) {
      const p = posts.find((x) => x.id === postId)
      if (!p) return
      e = {
        liked: p.likedByMe,
        baseCount: Math.max(0, p.likesCount - (p.likedByMe ? 1 : 0)),
        serverLiked: p.likedByMe,
        inFlight: false,
      }
      likeStateRef.current.set(postId, e)
    }
    // Vira a intenção no ref (fonte de verdade) e atualiza a UI na hora.
    e.liked = !e.liked
    patchLikeUI(postId, e.liked, e.baseCount + (e.liked ? 1 : 0))
    flushLike(postId)
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
      // Mudou quem o user segue → o feed muda (passa a ver/parar de ver
      // posts dessa pessoa). Invalida ambos os caches; próxima visita
      // pega dados frescos.
      followingCache.invalidate()
      feedFirstPageCache.invalidate()
    } catch { /* silent */ }
  }

  const handlePrivacyChange = async (postId: string, next: PostPrivacy) => {
    try {
      const updated = await updatePostPrivacy(authorizedFetch, postId, next)
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, privacy: updated.privacy } : p)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar privacidade')
    }
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
      // Cache local fica defasado (sem o post deletado). Invalida pra
      // próxima visita refletir o estado real do banco.
      feedFirstPageCache.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar post')
    }
  }

  // Share copies a link to the post (origin/post/<id>) to clipboard. There's
  // no public post page yet; the URL still uniquely identifies the post so
  // people can paste it back into a future deep-link route.
  const handleShare = async (postId: string) => {
    const url = `${window.location.origin}/post/${postId}`
    const result = await shareLink({ url, title: 'SerraAthlo', text: 'Confira este treino 💪' })
    if (result === 'copied') setToast('Link copiado!')
    else if (result === 'failed') setToast('Não foi possível compartilhar')
    // 'shared' (bandeja nativa) → o próprio SO já deu o feedback, sem toast.
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

  // Ao chegar perto do fim: primeiro revela o que já está em memória; quando
  // tudo já apareceu, busca a próxima página do servidor. Reatribuído a cada
  // render pra enxergar o estado atual (o observer chama via ref).
  onReachBottomRef.current = () => {
    if (hasMore) {
      setVisibleCount((c) => c + PAGE_SIZE)
    } else if (!reachedEndRef.current && !loadingMoreRef.current) {
      void fetchNextPage()
    }
  }

  const showSentinel = !loading && sortedPosts.length > 0

  // Observa o sentinela no fim da lista. rootMargin grande = pré-carrega antes
  // de bater no fim (rolagem fluida, estilo Hevy/Strava). Reanexa quando o
  // sentinela passa a existir (showSentinel) — a lógica vive num ref pra
  // sempre enxergar o estado atual sem recriar o observer a cada render.
  useEffect(() => {
    if (!showSentinel) return
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) onReachBottomRef.current() },
      { rootMargin: '800px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [showSentinel])

  return (
    <section className="space-y-4">
      {/* ─── Header card ───────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
      >
        <div className="mb-4">
          <div className="inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
            <span className="h-1 w-1 rounded-full bg-[var(--brand)]" />
            COMUNIDADE
          </div>
          <h1 className="mt-1 text-3xl font-black leading-none tracking-tight text-[var(--text)] sm:text-4xl">
            Feed
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Treinos da comunidade e dos seus amigos.
          </p>
        </div>

        {/* Filters + search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-1">
            {(['amigos', 'todos', 'curtidos'] as FeedFilter[]).map((f) => {
              const active = filter === f
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[var(--brand)] text-white shadow-[inset_0_-1px_0_var(--brand-strong)]'
                      : 'text-[var(--muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {FILTER_LABELS[f]}
                </button>
              )
            })}
          </div>

          <div className="relative flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5 text-[var(--muted)]">
            <Search size={14} />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Pesquisar usuários, exercícios, divisões…"
              className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none"
            />
            <kbd className="hidden rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)] sm:inline">
              ⌘ K
            </kbd>

            {/* Search dropdown — only for user search at the moment */}
            {query.trim() && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-lg">
                {searching && <p className="px-4 py-3 text-sm text-[var(--muted)]">Pesquisando…</p>}
                {!searching && searchResults.length === 0 && (
                  <p className="px-4 py-3 text-sm text-[var(--muted)]">Nenhum usuário encontrado.</p>
                )}
                {searchResults.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-[var(--surface-hover)]">
                    <button
                      type="button"
                      onClick={() => { setQuery(''); setSearchResults([]); navigate(`/u/${u.id}`) }}
                      className="flex min-w-0 items-center gap-2 text-left"
                    >
                      <Avatar
                        userId={u.id}
                        name={u.name}
                        handle={u.name?.toLowerCase() ?? '?'}
                        avatarUrl={u.avatarUrl}
                        size={32}
                      />
                      <span className="truncate text-sm font-semibold text-[var(--text)]">{u.name ?? 'Usuário'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleFollowToggle(u)}
                      className={`shrink-0 rounded-lg border px-3 py-1 text-xs font-bold transition-colors ${
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
        </div>
      </motion.section>

      {error && <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>}

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
          <FeedPostCard
            key={post.id}
            post={post}
            userId={user?.id}
            isAdmin={user?.role === 'ADMIN'}
            isFriend={followingIds.has(post.user.id)}
            ownerIsPrivate={user?.isPrivate ?? false}
            onLike={handleLike}
            onDelete={handleDelete}
            onPrivacyChange={handlePrivacyChange}
            // Click no próprio avatar/nome leva pra /profile (sua tela
            // privada). Clicar em outros usuários continua indo pra /u/:id.
            onProfileClick={(id) => navigate(id === user?.id ? '/profile' : `/u/${id}`)}
            onShare={handleShare}
          />
        ))}
      </div>

      {/* Sentinela do scroll infinito — quando entra na viewport (com folga de
          800px), revela mais / busca a próxima página. Fica sempre montado
          após a 1ª carga pra o observer ter o que observar. */}
      {showSentinel && <div ref={sentinelRef} aria-hidden className="h-px w-full" />}

      {(loadingMore || (hasMore && !reachedEndRef.current)) && (
        <div className="flex justify-center py-4" aria-label="Carregando mais posts">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--brand)]" />
        </div>
      )}

      {reachedEnd && !hasMore && sortedPosts.length > PAGE_SIZE && (
        <p className="py-2 text-center text-xs text-[var(--muted)]">Todos os posts foram carregados.</p>
      )}

      {/* Toast for share & friends */}
      <Toast message={toast} />
    </section>
  )
}
