import { useState } from 'react'
import { MessageCircle, Send, Trash2 } from 'lucide-react'
import {
  useDeleteEntryComment,
  useEntryComments,
  usePostEntryComment,
} from '../../hooks/useCompetition'
import { avatarThumbUrl } from '../../lib/imageTransform'

// Thread of comments below a proof. Loads on mount via TanStack Query.
// Authors / admins can delete; mutations patch the feed cache so the
// grid tile count stays in sync without an extra refetch.
export function CommentThread({
  competitionId, entryId, currentUserId, canModerate,
}: {
  competitionId: string
  entryId: string
  currentUserId: string | undefined
  canModerate: boolean
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const query = useEntryComments(competitionId, entryId)
  const postMut = usePostEntryComment(competitionId, entryId)
  const deleteMut = useDeleteEntryComment(competitionId, entryId)

  const comments = query.data?.items ?? []
  const loading = query.isLoading

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const content = draft.trim()
    if (!content || postMut.isPending) return
    setError(null)
    try {
      await postMut.mutateAsync(content)
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao comentar')
    }
  }

  const remove = async (commentId: string) => {
    if (!window.confirm('Apagar esse comentário?')) return
    setError(null)
    try {
      await deleteMut.mutateAsync(commentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao apagar comentário')
    }
  }

  return (
    <div className="mt-3 w-full text-left">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/70">
        <MessageCircle size={12} />
        Comentários{comments.length > 0 ? ` · ${comments.length}` : ''}
      </p>
      <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
        {loading && <p className="text-[11px] text-white/60">Carregando…</p>}
        {!loading && comments.length === 0 && (
          <p className="text-[11px] text-white/60">Seja o primeiro a comentar.</p>
        )}
        {comments.map((c) => {
          const name = c.user.name ?? `@${c.user.handle}`
          const mine = c.userId === currentUserId
          const canDelete = mine || canModerate
          const time = new Date(c.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          return (
            <div key={c.id} className="flex gap-2 rounded-lg bg-white/5 p-2">
              {c.user.avatarUrl ? (
                <img src={avatarThumbUrl(c.user.avatarUrl, 64)} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <div className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-[10px] font-bold text-white">
                  {name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[11px] font-semibold text-white">{name}</p>
                  <span className="font-mono text-[9.5px] text-white/50">{time}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] text-white/90">{c.content}</p>
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  className="self-start text-white/40 hover:text-rose-400"
                  aria-label="Apagar comentário"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <form onSubmit={submit} className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva um comentário…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white placeholder:text-white/40 focus:border-[var(--brand)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || postMut.isPending}
          className="grid h-7 w-7 place-items-center rounded-full bg-[var(--brand)] text-white disabled:opacity-40"
          aria-label="Enviar comentário"
        >
          <Send size={12} />
        </button>
      </form>
      {error && <p className="mt-1 text-[10.5px] text-rose-400">{error}</p>}
    </div>
  )
}
