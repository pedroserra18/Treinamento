import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useScrollLock } from '../hooks/useScrollLock'
import {
  getPublicProfile, getUserPosts, followUser, unfollowUser, compareUsers,
  getPublicFollowers, getPublicFollowing, getMutualFollowers, deletePost,
  toggleLike, updatePostPrivacy,
  type PublicProfile, type FeedPost, type CompareResult, type PostPrivacy,
  type SimpleUser,
} from '../services/socialService'
import { ImageViewer } from '../components/common/ImageViewer'
import { UserComparePanel } from '../components/common/UserComparePanel'
import { FeedPostCard } from '../components/common/FeedPostCard'
import { shareLink } from '../lib/share'
import { ArrowLeft } from 'lucide-react'


type ListPanel = 'followers' | 'following' | 'mutual' | null

// Bate com o pageSize do getUserPosts no backend. Página incompleta = fim.
const POSTS_PAGE_SIZE = 20

// Full-screen "page push" wrapper used to make the compare panel feel like
// a separate route without actually changing the URL. Slides in from the
// right (iOS-native-ish), locks the body scroll, traps ESC to close, and
// renders a sticky header with a "Voltar" button.
function CompareOverlay({
  onClose, themName, children,
}: {
  onClose: () => void
  themName: string
  children: React.ReactNode
}) {
  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <motion.div
      key="compare-overlay"
      initial={{ x: '100%', opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0.5 }}
      transition={{ type: 'spring', stiffness: 320, damping: 36, mass: 0.8 }}
      // z-[9990] keeps us under the avatar ImageViewer (z-[9998]) but above
      // anything else on the underlying profile page.
      className="fixed inset-0 z-[9990] flex flex-col overflow-hidden bg-[var(--bg)]"
    >
      {/* Sticky header — small backdrop blur so the page underneath doesn't
          bleed into the title once the user starts scrolling. pt-safe-plus-3
          empurra o conteúdo pra baixo do status bar no PWA iOS standalone
          (status bar cobria o botão Voltar). */}
      <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--surface)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pb-3 pt-safe-plus-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            aria-label="Voltar ao perfil"
          >
            <ArrowLeft size={13} />
            Voltar
          </button>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">
              Comparação
            </p>
            <h2 className="truncate text-[15px] font-semibold tracking-tight text-[var(--text)]">
              Você vs {themName}
            </h2>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </motion.div>,
    document.body,
  )
}

function UserListModal({ title, users, loading, onClose, onNavigate }: {
  title: string
  users: SimpleUser[]
  loading: boolean
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.2 }}
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        style={{ maxHeight: 'min(80vh, 560px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
          <h3 className="text-base font-extrabold text-[var(--text)]">{title}</h3>
          <button type="button" onClick={onClose} className="text-[var(--muted)] text-lg px-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-[var(--line)] overscroll-contain">
          {loading && <p className="px-4 py-6 text-sm text-center text-[var(--muted)]">Carregando...</p>}
          {!loading && users.length === 0 && <p className="px-4 py-6 text-sm text-center text-[var(--muted)]">Nenhum usuário aqui ainda.</p>}
          {!loading && users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onClose(); onNavigate(u.id) }}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors"
            >
              <div className="h-9 w-9 shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] overflow-hidden">
                {u.avatarUrl
                  ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--muted)]">{(u.name ?? '?')[0]?.toUpperCase()}</span>
                }
              </div>
              <span className="text-sm font-semibold text-[var(--text)] truncate">{u.name ?? 'Usuário'}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}


export function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const { authorizedFetch, user: me } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [compare, setCompare] = useState<CompareResult | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [showCompare, setShowCompare] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [openPanel, setOpenPanel] = useState<ListPanel>(null)
  const [panelUsers, setPanelUsers] = useState<SimpleUser[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const [mutuals, setMutuals] = useState<SimpleUser[]>([])
  const [mutualsLoaded, setMutualsLoaded] = useState(false)
  const [viewer, setViewer] = useState<{ src: string; alt: string } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reachedEnd, setReachedEnd] = useState(false)
  // Scroll infinito dos posts: refs lidos dentro do observer sem stale closure.
  const pageRef = useRef(1)
  const loadingMoreRef = useRef(false)
  const reachedEndRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const onReachBottomRef = useRef<() => void>(() => {})

  const isSelf = me?.id === userId

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setLoadingProfile(true)
      const [prof, userPosts] = await Promise.all([
        getPublicProfile(authorizedFetch, userId),
        getUserPosts(authorizedFetch, userId),
      ])
      setProfile(prof)
      setPosts(userPosts)
      // Reancora a paginação. Se a 1ª página veio incompleta, não há mais.
      pageRef.current = 1
      const done = userPosts.length < POSTS_PAGE_SIZE
      reachedEndRef.current = done
      setReachedEnd(done)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar perfil')
    } finally {
      setLoadingProfile(false)
    }
  }, [authorizedFetch, userId])

  useEffect(() => { void load() }, [load])

  // Busca a próxima página de posts e anexa (dedupe). 1 request por vez.
  const fetchNextPage = useCallback(async () => {
    if (!userId || loadingMoreRef.current || reachedEndRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const next = pageRef.current + 1
      const data = await getUserPosts(authorizedFetch, userId, next)
      pageRef.current = next
      if (data.length < POSTS_PAGE_SIZE) {
        reachedEndRef.current = true
        setReachedEnd(true)
      }
      if (data.length > 0) {
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id))
          return [...prev, ...data.filter((p) => !seen.has(p.id))]
        })
      }
    } catch {
      // Silencioso: tenta de novo no próximo gatilho de scroll.
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [authorizedFetch, userId])

  onReachBottomRef.current = () => {
    if (!reachedEndRef.current && !loadingMoreRef.current) void fetchNextPage()
  }

  // Sentinela só faz sentido quando há posts e ainda pode ter mais. rootMargin
  // grande pré-carrega antes do fim (rolagem fluida). Reanexa via canPaginate.
  const canPaginate = posts.length > 0 && !reachedEnd
  useEffect(() => {
    if (!canPaginate) return
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) onReachBottomRef.current() },
      { rootMargin: '800px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [canPaginate])

  const handleFollow = async () => {
    if (!profile || !userId) return
    try {
      if (profile.isFollowing) {
        await unfollowUser(authorizedFetch, userId)
        setProfile((p) => p ? { ...p, isFollowing: false, followersCount: p.followersCount != null ? p.followersCount - 1 : null } : p)
      } else {
        await followUser(authorizedFetch, userId)
        setProfile((p) => p ? { ...p, isFollowing: true, followersCount: p.followersCount != null ? p.followersCount + 1 : null } : p)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    }
  }

  const openList = async (panel: 'followers' | 'following' | 'mutual') => {
    if (!userId) return
    setOpenPanel(panel)
    setPanelLoading(true)
    setPanelUsers([])
    try {
      const data = panel === 'followers'
        ? await getPublicFollowers(authorizedFetch, userId)
        : panel === 'following'
          ? await getPublicFollowing(authorizedFetch, userId)
          : await getMutualFollowers(authorizedFetch, userId)
      setPanelUsers(data)
      if (panel === 'mutual') { setMutuals(data); setMutualsLoaded(true) }
    } catch { /* silent — server returns 403 if private */ } finally {
      setPanelLoading(false)
    }
  }

  const loadMutuals = useCallback(async () => {
    if (!userId || isSelf || mutualsLoaded) return
    try {
      const data = await getMutualFollowers(authorizedFetch, userId)
      setMutuals(data)
      setMutualsLoaded(true)
    } catch { /* silent */ }
  }, [authorizedFetch, userId, isSelf, mutualsLoaded])

  useEffect(() => { void loadMutuals() }, [loadMutuals])

  const handleCompare = async () => {
    if (!userId) return
    try {
      const result = await compareUsers(authorizedFetch, userId)
      setCompare(result)
      setShowCompare(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao comparar')
    }
  }

  const handleDeletePost = async (postId: string) => {
    const post = posts.find((p) => p.id === postId)
    const isOwn = post?.user.id === me?.id
    const message = !isOwn && me?.role === 'ADMIN'
      ? 'Remover este post como administrador?'
      : 'Deletar este post?'
    if (!window.confirm(message)) return
    try {
      await deletePost(authorizedFetch, postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      setProfile((prev) => prev && prev.postsCount != null ? { ...prev, postsCount: Math.max(0, prev.postsCount - 1) } : prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover post')
    }
  }

  // FeedPostCard precisa desses 3 handlers — antes não eram expostos porque o
  // ProfilePostCard antigo só tinha delete. Os endpoints já existem.
  const handleLike = async (postId: string) => {
    try {
      const result = await toggleLike(authorizedFetch, postId)
      setPosts((prev) => prev.map((p) =>
        p.id === postId
          ? { ...p, likedByMe: result.liked, likesCount: p.likesCount + (result.liked ? 1 : -1) }
          : p
      ))
    } catch { /* silent — like falhar não vale interromper a tela */ }
  }

  const handlePrivacyChange = async (postId: string, next: PostPrivacy) => {
    try {
      const updated = await updatePostPrivacy(authorizedFetch, postId, next)
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, privacy: updated.privacy } : p)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar privacidade')
    }
  }

  const handleShare = async (postId: string) => {
    const url = `${window.location.origin}/post/${postId}`
    // Bandeja nativa quando der; senão copia o link (fallback silencioso).
    await shareLink({ url, title: 'SerraAthlo', text: 'Confira este treino 💪' })
  }

  if (loadingProfile) {
    return <p className="text-sm text-[var(--muted)] p-4">Carregando...</p>
  }

  if (!profile) {
    return <p className="text-sm text-red-400 p-4">{error ?? 'Perfil não encontrado'}</p>
  }

  return (
    <section className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl animate-[tech-spin_22s_linear_infinite]"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />
        <div className="relative flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0">
            <div
              aria-hidden
              className="absolute -inset-[3px] rounded-full animate-[tech-spin_10s_linear_infinite]"
              style={{ background: 'var(--tech-gradient-conic)' }}
            />
            {profile.avatarUrl ? (
              <button
                type="button"
                onClick={() => setViewer({ src: profile.avatarUrl!, alt: profile.name ?? 'Avatar' })}
                className="relative h-full w-full overflow-hidden rounded-full bg-[var(--surface-hover)] hover:opacity-90 transition-opacity"
                aria-label="Abrir foto em tamanho cheio"
              >
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ) : (
              <div className="relative h-full w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
                <span className="flex h-full w-full items-center justify-center text-xl font-black text-[var(--muted)]">{(profile.name ?? '?')[0]?.toUpperCase()}</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-[var(--text)]">{profile.name ?? 'Usuário'}</h1>
            <p className="text-xs text-[var(--muted)]">Membro desde {new Date(profile.memberSince).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
            <div className="mt-2 flex gap-4 text-sm flex-wrap">
              {profile.followersCount != null ? (
                <>
                  {profile.showFollowLists ? (
                    <button type="button" onClick={() => void openList('followers')} className="text-left hover:opacity-70">
                      <strong>{profile.followersCount}</strong> <span className="text-[var(--muted)]">seguidores</span>
                    </button>
                  ) : (
                    <span><strong>{profile.followersCount}</strong> <span className="text-[var(--muted)]">seguidores</span></span>
                  )}
                  {profile.showFollowLists ? (
                    <button type="button" onClick={() => void openList('following')} className="text-left hover:opacity-70">
                      <strong>{profile.followingCount}</strong> <span className="text-[var(--muted)]">seguindo</span>
                    </button>
                  ) : (
                    <span><strong>{profile.followingCount}</strong> <span className="text-[var(--muted)]">seguindo</span></span>
                  )}
                  <span><strong>{profile.postsCount}</strong> <span className="text-[var(--muted)]">posts</span></span>
                </>
              ) : (
                <span className="text-[var(--muted)] text-xs">Conta privada</span>
              )}
            </div>
            {!isSelf && mutualsLoaded && mutuals.length > 0 && (
              <button
                type="button"
                onClick={() => void openList('mutual')}
                className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)] hover:opacity-70"
              >
                <span className="flex -space-x-1.5">
                  {mutuals.slice(0, 3).map((u) => (
                    <div key={u.id} className="h-5 w-5 rounded-full border border-[var(--surface)] bg-[var(--surface-hover)] overflow-hidden shrink-0">
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                        : <span className="flex h-full w-full items-center justify-center text-[8px] font-bold text-[var(--muted)]">{(u.name ?? '?')[0]?.toUpperCase()}</span>
                      }
                    </div>
                  ))}
                </span>
                <span>
                  {mutuals.length === 1
                    ? `${mutuals[0].name ?? 'Alguém'} te segue`
                    : `${mutuals[0].name ?? 'Alguém'} e +${mutuals.length - 1} em comum`}
                </span>
              </button>
            )}
          </div>
        </div>

        {!isSelf && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleFollow}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                profile.isFollowing
                  ? 'border border-[var(--line)] text-[var(--text)]'
                  : 'bg-[var(--brand)] text-white'
              }`}
            >
              {profile.isFollowing ? 'Seguindo' : 'Seguir'}
            </button>
            <button
              type="button"
              onClick={handleCompare}
              className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Comparar
            </button>
          </div>
        )}

        {isSelf && (
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="mt-3 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
          >
            Editar perfil
          </button>
        )}
      </motion.div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Compare panel — opens like a pushed iOS page: full-screen overlay
          sliding in from the right, with its own header + back button. The
          URL stays the same; only the visual stacking changes. ESC fecha. */}
      <AnimatePresence>
        {showCompare && compare && userId && (
          <CompareOverlay
            onClose={() => setShowCompare(false)}
            themName={profile?.name ?? 'Rival'}
          >
            <UserComparePanel
              result={compare}
              userId={userId}
              authorizedFetch={authorizedFetch}
              onAvatarClick={(src, alt) => setViewer({ src, alt })}
              themHandle={null}
            />
          </CompareOverlay>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {openPanel && (
          <UserListModal
            title={openPanel === 'followers' ? 'Seguidores' : openPanel === 'following' ? 'Seguindo' : 'Em comum'}
            users={panelUsers}
            loading={panelLoading}
            onClose={() => setOpenPanel(null)}
            onNavigate={(id) => navigate(`/u/${id}`)}
          />
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {posts.length === 0 && (
          <p className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
            Nenhum post público ainda.
          </p>
        )}
        {posts.map((post) => (
          <FeedPostCard
            key={post.id}
            post={post}
            userId={me?.id}
            isAdmin={me?.role === 'ADMIN'}
            // Em /u/:id estamos sempre vendo posts dessa pessoa específica;
            // o "amigo" do post == "estou seguindo essa pessoa".
            isFriend={profile?.isFollowing ?? false}
            ownerIsPrivate={me?.isPrivate ?? false}
            // Cabeçalho do perfil já mostra avatar/nome — não repetir no card.
            hideAuthor
            onLike={handleLike}
            onDelete={handleDeletePost}
            onPrivacyChange={handlePrivacyChange}
            // Click no avatar do próprio post leva pra /profile;
            // outros usuários levam pra /u/:id (ainda que aqui só haja
            // posts da mesma pessoa, mantemos a lógica consistente).
            onProfileClick={(id) => navigate(id === me?.id ? '/profile' : `/u/${id}`)}
            onShare={handleShare}
          />
        ))}

        {/* Scroll infinito: sentinela carrega a próxima página antes do fim. */}
        {canPaginate && <div ref={sentinelRef} aria-hidden className="h-px w-full" />}
        {loadingMore && (
          <div className="flex justify-center py-4" aria-label="Carregando mais posts">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--brand)]" />
          </div>
        )}
        {reachedEnd && posts.length > POSTS_PAGE_SIZE && (
          <p className="py-2 text-center text-xs text-[var(--muted)]">Todos os posts foram carregados.</p>
        )}
      </div>

      <AnimatePresence>
        {viewer && (
          <ImageViewer
            src={viewer.src}
            alt={viewer.alt}
            shape="circle"
            onClose={() => setViewer(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
