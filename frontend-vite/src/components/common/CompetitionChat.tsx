import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Send, Trash2 } from 'lucide-react'
import { Skeleton } from './Skeleton'
import { useAuth } from '../../hooks/useAuth'
import {
  useChatMessages,
  useDeleteChatMessage,
  usePostChatMessage,
} from '../../hooks/useCompetition'
import { avatarThumbUrl } from '../../lib/image/imageTransform'

// Compact chat panel for a competition. When Supabase Realtime is wired
// (useCompetitionRealtime in the parent page), the chat query is
// invalidated on every new message and the panel updates in <1s without
// any polling. When Realtime is not configured, the parent passes
// `polling: true` and the query falls back to a 6s refetchInterval.
//
// The input shows inline rejection feedback when the backend blocks
// profanity (specific error code) or rate-limits the user.
export function CompetitionChat({
  competitionId, isAdmin, pollingFallback,
}: {
  competitionId: string
  isAdmin: boolean
  // When true, the chat refetches every 6s. The parent flips this off
  // once Realtime is connected — push updates make the interval moot.
  pollingFallback?: boolean
}) {
  const { user } = useAuth()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const query = useChatMessages(competitionId, { polling: pollingFallback ?? false })
  const postMut = usePostChatMessage(competitionId)
  const deleteMut = useDeleteChatMessage(competitionId)

  const messages = query.data?.items ?? []
  const loading = query.isLoading
  const sending = postMut.isPending

  // Always scroll to the latest message after a render that changed the
  // list length. Behaves well even on slow connections because we anchor
  // to the bottom only when the new message is appended at the end.
  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages.length, scrollToBottom])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    setError(null)
    setBlockedMessage(null)
    try {
      await postMut.mutateAsync(content)
      setDraft('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao enviar'
      // Specific feedback when the backend blocks. Inline message under
      // the input reads naturally — no toast needed.
      if (/impr[oó]prio|bloqueada/i.test(msg)) {
        setBlockedMessage('Mensagem bloqueada por conter conteúdo impróprio')
      } else if (/calma|alguns segundos/i.test(msg)) {
        setBlockedMessage('Espere alguns segundos antes de mandar outra mensagem')
      } else {
        setError(msg)
      }
    }
  }

  const handleDelete = async (messageId: string) => {
    if (!window.confirm('Apagar essa mensagem?')) return
    setError(null)
    try {
      await deleteMut.mutateAsync(messageId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao apagar')
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
        <MessageSquare size={14} className="text-[var(--brand)]" />
        Conversa
      </h2>

      <div
        ref={listRef}
        className="mt-3 max-h-[400px] min-h-[120px] space-y-2 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-2"
      >
        {loading && messages.length === 0 && (
          <div className="space-y-2 px-1 py-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`flex gap-2 ${i === 1 ? 'flex-row-reverse' : ''}`}>
                <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                <Skeleton className={`h-10 rounded-2xl ${i === 1 ? 'w-32' : 'w-44'}`} />
              </div>
            ))}
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-[var(--muted)]">
            Sem mensagens ainda. Seja o primeiro a dizer algo.
          </p>
        )}
        {messages.map((m) => {
          const isMine = m.userId === user?.id
          const canDelete = isMine || isAdmin
          const displayName = m.user.name ?? `@${m.user.handle}`
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}
            >
              {m.user.avatarUrl ? (
                <img
                  src={avatarThumbUrl(m.user.avatarUrl, 64)}
                  alt={displayName}
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-[10px] font-bold text-[var(--text)]">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className={`group max-w-[80%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                <div
                  className={`rounded-2xl px-3 py-1.5 text-sm leading-snug ${
                    isMine
                      ? 'rounded-br-sm bg-[var(--brand)] text-white'
                      : 'rounded-bl-sm bg-[var(--surface)] text-[var(--text)]'
                  }`}
                >
                  {!isMine && (
                    <p className="mb-0.5 font-mono text-[10px] font-bold text-[var(--brand-strong)]">
                      {displayName}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
                <p className="mt-0.5 px-1 font-mono text-[9.5px] text-[var(--muted)]">
                  {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(m.id)}
                      className="ml-2 inline-flex items-center gap-0.5 text-rose-500 opacity-0 transition-opacity hover:underline group-hover:opacity-100"
                      aria-label="Apagar mensagem"
                    >
                      <Trash2 size={9} />
                      apagar
                    </button>
                  )}
                </p>
              </div>
            </motion.div>
          )
        })}
      </div>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
      {blockedMessage && (
        <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">
          {blockedMessage}
        </p>
      )}

      <form onSubmit={handleSend} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma mensagem…"
          maxLength={500}
          disabled={sending}
          className="flex-1 rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[var(--muted)] focus:border-[var(--brand)]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
          aria-label="Enviar"
        >
          <Send size={14} />
          <span className="hidden sm:inline">Enviar</span>
        </button>
      </form>
    </section>
  )
}
