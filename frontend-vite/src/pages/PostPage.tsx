import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { FeedPostCard } from '../components/common/FeedPostCard'
import { SkeletonCard } from '../components/common/Skeleton'
import { feedFirstPageCache } from '../lib/feed-cache'
import { shareLink } from '../lib/share'
import {
  getPost, toggleLike, deletePost, updatePostPrivacy,
  type FeedPost, type PostPrivacy,
} from '../services/socialService'

// Página de um único post — destino dos deep-links de notificação
// ("Curtiram seu post" / "comentou no seu post"). Reusa o FeedPostCard
// inteiro pra manter visual e comportamento idênticos ao feed.
export function PostPage() {
  const { postId } = useParams<{ postId: string }>()
  const { authorizedFetch, user } = useAuth()
  const navigate = useNavigate()
  const [post, setPost] = useState<FeedPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(id)
  }, [toast])

  const load = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    try {
      const data = await getPost(authorizedFetch, postId)
      setPost(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar este post.')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch, postId])

  useEffect(() => {
    void load()
  }, [load])

  const handleLike = async (id: string) => {
    setPost((prev) =>
      prev && prev.id === id
        ? { ...prev, likedByMe: !prev.likedByMe, likesCount: prev.likesCount + (prev.likedByMe ? -1 : 1) }
        : prev,
    )
    try {
      const { liked } = await toggleLike(authorizedFetch, id)
      setPost((prev) => (prev && prev.id === id ? { ...prev, likedByMe: liked } : prev))
      // Estado mudou aqui — o cache do feed fica defasado. Invalida pra
      // próxima visita ao /feed refletir o like correto.
      feedFirstPageCache.invalidate()
    } catch {
      void load()
    }
  }

  const handleDelete = async (id: string) => {
    const isOwn = post?.user.id === user?.id
    const message = !isOwn && user?.role === 'ADMIN'
      ? 'Remover este post como administrador?'
      : 'Deletar este post?'
    if (!window.confirm(message)) return
    try {
      await deletePost(authorizedFetch, id)
      feedFirstPageCache.invalidate()
      navigate('/feed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao deletar post')
    }
  }

  const handlePrivacyChange = async (id: string, next: PostPrivacy) => {
    try {
      const updated = await updatePostPrivacy(authorizedFetch, id, next)
      setPost((prev) => (prev && prev.id === id ? { ...prev, privacy: updated.privacy } : prev))
      feedFirstPageCache.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao mudar privacidade')
    }
  }

  const handleShare = async (id: string) => {
    const url = `${window.location.origin}/post/${id}`
    const result = await shareLink({ url, title: 'SerraAthlo', text: 'Confira este treino 💪' })
    if (result === 'copied') setToast('Link copiado!')
    else if (result === 'failed') setToast('Não foi possível compartilhar')
  }

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
      >
        <ArrowLeft size={16} />
        Voltar
      </button>

      {error && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
          <p className="text-base font-bold text-[var(--text)]">{error}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">O post pode ter sido removido ou ser privado.</p>
          <button
            type="button"
            onClick={() => navigate('/feed')}
            className="mt-4 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"
          >
            Ir para o feed
          </button>
        </div>
      )}

      {loading && !error && <SkeletonCard />}

      {!loading && !error && post && (
        <FeedPostCard
          post={post}
          userId={user?.id}
          isAdmin={user?.role === 'ADMIN'}
          isFriend={false}
          ownerIsPrivate={user?.isPrivate ?? false}
          onLike={handleLike}
          onDelete={handleDelete}
          onPrivacyChange={handlePrivacyChange}
          onProfileClick={(id) => navigate(id === user?.id ? '/profile' : `/u/${id}`)}
          onShare={handleShare}
        />
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[9999] flex justify-center px-4">
          <div className="rounded-full bg-[var(--text)] px-4 py-2 text-sm font-semibold text-[var(--surface)] shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </section>
  )
}

export default PostPage
