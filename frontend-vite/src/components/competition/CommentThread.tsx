import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, Trash2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import {
  deleteEntryComment,
  listEntryComments,
  postEntryComment,
} from '../../services/competitionService'
import type { CompetitionEntryComment } from '../../types/competition'

// Thread of comments below a proof. Loads on mount, posts inline, and
// lets authors / admins delete. Parent supplies `onChange` so it can
// keep the commentsCount on the grid tile in sync without a full feed
// refetch.
export function CommentThread({
  competitionId, entryId, currentUserId, canModerate, onChange,
}: {
  competitionId: string
  entryId: string
  currentUserId: string | undefined
  canModerate: boolean
  onChange: (delta: number) => void
}) {
  const { authorizedFetch } = useAuth()
  const [comments, setComments] = useState<CompetitionEntryComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // Bumped when entryId changes so an in-flight load for a previous modal
  // can't overwrite the comments of the current one.
  const reqIdRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const myReq = ++reqIdRef.current
    setLoading(true)
    setError(null)
    setComments([])
    listEntryComments(authorizedFetch, competitionId, entryId)
      .then((res) => {
        if (cancelled || reqIdRef.current !== myReq) return
        setComments(res.items)
      })
      .catch((err) => {
        if (cancelled || reqIdRef.current !== myReq) return
        setError(err instanceof Error ? err.message : 'Falha ao carregar comentários')
      })
      .finally(() => {
        if (cancelled || reqIdRef.current !== myReq) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authorizedFetch, competitionId, entryId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    setError(null)
    try {
      const created = await postEntryComment(authorizedFetch, competitionId, entryId, content)
      setComments((prev) => [...prev, created])
      setDraft('')
      onChange(+1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao comentar')
    } finally {
      setSending(false)
    }
  }

  const remove = async (commentId: string) => {
    if (!window.confirm('Apagar esse comentário?')) return
    const previous = comments
    setComments((prev) => prev.filter((c) => c.id !== commentId))
    onChange(-1)
    try {
      await deleteEntryComment(authorizedFetch, competitionId, entryId, commentId)
    } catch (err) {
      setComments(previous)
      onChange(+1)
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
                <img src={c.user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
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
          disabled={!draft.trim() || sending}
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
