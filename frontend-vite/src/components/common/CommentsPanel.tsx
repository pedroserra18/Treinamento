import { useEffect, useState } from 'react'
import { Send, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { listComments, createComment, deleteComment, type PostComment } from '../../services/socialService'
import { peekComments, setCommentsCache } from '../../lib/cache/comments-cache'
import { timeAgo } from './feed-post-utils'
import { Avatar } from './Avatar'

// Painel de comentários inline (stale-while-revalidate + envio/remoção
// otimistas). Extraído do FeedPostCard.
export function CommentsPanel({
  postId, viewerId, isAdmin, isPostOwner,
  initialCount, onCountChange,
}: {
  postId: string
  viewerId: string | undefined
  isAdmin: boolean
  isPostOwner: boolean
  initialCount: number
  onCountChange: (delta: number) => void
}) {
  const { authorizedFetch, user } = useAuth()
  // Inicializa do cache em memória — reabrir os comentários é instantâneo (sem
  // spinner). Revalidamos em background logo abaixo.
  const [items, setItems] = useState<PostComment[] | null>(() => peekComments(postId))
  const [loading, setLoading] = useState(() => peekComments(postId) == null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  // Stale-while-revalidate: mostra o cache na hora e busca a versão fresca em
  // background. Só mostra erro quando não há nada em cache pra exibir.
  useEffect(() => {
    let cancelled = false
    listComments(authorizedFetch, postId)
      .then((data) => {
        if (cancelled) return
        setItems(data)
        setCommentsCache(postId, data)
      })
      .catch((err: unknown) => {
        if (!cancelled && peekComments(postId) == null) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar comentários')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authorizedFetch, postId])

  const handleSubmit = async () => {
    const text = draft.trim()
    if (!text || posting || !user) return
    setPosting(true)
    setError(null)
    // OPTIMISTIC: mostra o comentário na hora com id temporário; reconcilia com
    // a resposta do servidor (ou faz rollback + devolve o texto em caso de erro).
    const tempId = `temp-${Date.now()}`
    const optimistic: PostComment = {
      id: tempId,
      content: text,
      createdAt: new Date().toISOString(),
      user: { id: user.id, name: user.name ?? null, avatarUrl: user.avatarUrl ?? null, handle: user.handle ?? '' },
    }
    setItems((prev) => {
      const next = [...(prev ?? []), optimistic]
      setCommentsCache(postId, next)
      return next
    })
    setDraft('')
    onCountChange(1)
    try {
      const created = await createComment(authorizedFetch, postId, text)
      setItems((prev) => {
        const next = (prev ?? []).map((c) => (c.id === tempId ? created : c))
        setCommentsCache(postId, next)
        return next
      })
    } catch (err) {
      setItems((prev) => {
        const next = (prev ?? []).filter((c) => c.id !== tempId)
        setCommentsCache(postId, next)
        return next
      })
      onCountChange(-1)
      setDraft(text)
      setError(err instanceof Error ? err.message : 'Erro ao enviar comentário')
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Apagar comentário?')) return
    // OPTIMISTIC: remove na hora; rollback se o backend falhar.
    const snapshot = items
    setItems((prev) => {
      const next = prev?.filter((c) => c.id !== commentId) ?? null
      if (next) setCommentsCache(postId, next)
      return next
    })
    onCountChange(-1)
    try {
      await deleteComment(authorizedFetch, postId, commentId)
    } catch (err) {
      setItems(snapshot)
      if (snapshot) setCommentsCache(postId, snapshot)
      onCountChange(1)
      setError(err instanceof Error ? err.message : 'Erro ao apagar comentário')
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)]/40 p-3">
      {loading && (
        <p className="text-xs text-[var(--muted)]">A carregar comentários…</p>
      )}

      {!loading && items && items.length === 0 && (
        <p className="text-xs text-[var(--muted)]">
          {initialCount > 0 ? 'Nenhum comentário visível.' : 'Seja o primeiro a comentar!'}
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((c) => {
            const canDelete = viewerId && (c.user.id === viewerId || isPostOwner || isAdmin)
            return (
              <li key={c.id} className="flex items-start gap-2.5">
                <Avatar
                  userId={c.user.id}
                  name={c.user.name}
                  handle={c.user.handle}
                  avatarUrl={c.user.avatarUrl}
                  size={28}
                />
                <div className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs font-bold text-[var(--text)]">
                      {c.user.name ?? c.user.handle}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--muted)]">@{c.user.handle}</span>
                    <span className="font-mono text-[10px] text-[var(--muted)]">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-[var(--text)]">{c.content}</p>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(c.id)}
                    className="mt-1 rounded-md border border-transparent p-1 text-[var(--muted)] transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                    title="Apagar comentário"
                  >
                    <X size={11} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {viewerId && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
          <input
            type="text"
            value={draft}
            placeholder="Escreve um comentário…"
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSubmit() } }}
            className="flex-1 bg-transparent text-xs text-[var(--text)] placeholder:text-[var(--muted)] outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!draft.trim() || posting}
            className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)] text-white transition-opacity disabled:opacity-40"
            title="Enviar"
          >
            <Send size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
