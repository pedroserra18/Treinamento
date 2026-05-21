import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ChevronDown, ChevronUp, FileText, RotateCcw, Send, ShieldCheck, StickyNote, Trash2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  STATUS_COLORS,
  STATUS_LABELS,
  TOPIC_LABELS,
  adminGetTicket,
  adminListRemovedPosts,
  adminPostReply,
  adminRestorePost,
  adminUpdateStatus,
  listTemplates,
  type RemovedPost,
  type SupportMessage,
  type SupportTemplate,
  type SupportTicketDetail,
  type TicketStatus,
} from '../services/supportService'

const MAX_BODY = 2000

const NEXT_STATUS_OPTIONS: TicketStatus[] = ['IN_PROGRESS', 'AWAITING_USER', 'RESOLVED', 'CLOSED']

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MessageBubble({ message }: { message: SupportMessage }) {
  const isAdmin = message.authorRole === 'ADMIN'
  const isSystem = message.authorRole === 'SYSTEM'

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1 text-[10px] font-semibold text-[var(--muted)]">
          {message.body}
        </div>
      </div>
    )
  }

  if (message.isInternalNote) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-200">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
            <StickyNote size={11} /> Nota interna
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
          <p className="mt-1 text-[10px] opacity-70">{formatDateTime(message.createdAt)}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
        isAdmin
          ? 'bg-[var(--brand)] text-white'
          : 'border border-[var(--line)] bg-[var(--surface-hover)] text-[var(--text)]'
      }`}>
        {isAdmin ? (
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/80">
            <ShieldCheck size={11} /> Equipe SerraAthlo
          </div>
        ) : (
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
            {(message.author as { displayName: string }).displayName}
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
        {message.attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((src, idx) => (
              <a
                key={idx}
                href={src}
                target="_blank"
                rel="noreferrer"
                className="block h-24 w-24 overflow-hidden rounded-lg border border-black/10"
              >
                <img src={src} alt={`Anexo ${idx + 1}`} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        ) : null}
        <p className={`mt-1 text-[10px] ${isAdmin ? 'text-white/70' : 'text-[var(--muted)]'}`}>
          {formatDateTime(message.createdAt)}
        </p>
      </div>
    </div>
  )
}

const PRIVACY_LABELS: Record<RemovedPost['privacy'], string> = {
  PUBLIC: 'Público',
  FOLLOWERS: 'Seguidores',
  PRIVATE: 'Privado',
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}s`
  return s > 0 ? `${m}min ${s}s` : `${m}min`
}

function RemovedPostCard({
  post,
  restoring,
  onRestore,
}: {
  post: RemovedPost
  restoring: boolean
  onRestore: () => void
}) {
  const [photoOpen, setPhotoOpen] = useState(false)
  const session = post.workoutSession

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] text-[var(--muted)]">ID {post.id.slice(0, 10)}…</span>
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
          {PRIVACY_LABELS[post.privacy]}
        </span>
        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300">
          REMOVIDO
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        {post.photoUrl ? (
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            className="block flex-shrink-0 overflow-hidden rounded-lg border border-[var(--line)]"
          >
            <img
              src={post.photoUrl}
              alt="Foto do post removido"
              className="h-32 w-32 object-cover transition-transform hover:scale-105"
            />
          </button>
        ) : (
          <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface)] text-[10px] text-[var(--muted)]">
            sem foto
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Legenda</p>
            {post.caption ? (
              <p className="whitespace-pre-wrap break-words text-sm text-[var(--text)]">{post.caption}</p>
            ) : (
              <p className="text-xs italic text-[var(--muted)]">(sem legenda)</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-3">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--muted)]">Curtidas</span>
              <span className="font-bold text-[var(--text)]">{post.likesCount}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--muted)]">Postado em</span>
              <span className="text-[var(--text)]">{formatDateTime(post.createdAt)}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--muted)]">Removido em</span>
              <span className="text-rose-300">{formatDateTime(post.removedAt)}</span>
            </div>
          </div>

          {post.removedBy ? (
            <p className="text-[11px]">
              <span className="text-[var(--muted)]">Removido por: </span>
              <span className="font-semibold text-[var(--text)]">
                {post.removedBy.displayName ?? `Admin ${post.removedBy.id.slice(0, 8)}`}
              </span>
            </p>
          ) : null}

          {post.removalReason ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300">Motivo da remoção</p>
              <p className="mt-0.5 text-xs text-rose-200">{post.removalReason}</p>
            </div>
          ) : null}
        </div>
      </div>

      {session ? (
        <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Treino vinculado</p>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
            <div>
              <span className="block text-[10px] text-[var(--muted)]">Plano</span>
              <span className="text-[var(--text)]">{session.workoutPlan?.name ?? '—'}</span>
            </div>
            <div>
              <span className="block text-[10px] text-[var(--muted)]">Duração</span>
              <span className="text-[var(--text)]">{formatDuration(session.durationSec)}</span>
            </div>
            <div>
              <span className="block text-[10px] text-[var(--muted)]">Calorias</span>
              <span className="text-[var(--text)]">{session.caloriesBurned ?? '—'}</span>
            </div>
            <div>
              <span className="block text-[10px] text-[var(--muted)]">Exercícios</span>
              <span className="text-[var(--text)]">{session._count.history}</span>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <span className="block text-[10px] text-[var(--muted)]">Iniciado</span>
              <span className="text-[var(--text)]">
                {session.startedAt ? formatDateTime(session.startedAt) : '—'}
              </span>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <span className="block text-[10px] text-[var(--muted)]">Finalizado</span>
              <span className="text-[var(--text)]">
                {session.endedAt ? formatDateTime(session.endedAt) : '—'}
              </span>
            </div>
          </div>
          {session.notes ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-[11px] text-[var(--text)]">
              <span className="text-[var(--muted)]">Notas: </span>
              {session.notes}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onRestore}
          disabled={restoring}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          <RotateCcw size={12} />
          {restoring ? 'Restaurando...' : 'Restaurar post'}
        </button>
      </div>

      {photoOpen && post.photoUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPhotoOpen(false)}
        >
          <img
            src={post.photoUrl}
            alt="Foto ampliada"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      ) : null}
    </div>
  )
}

export function AdminSupportTicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const { authorizedFetch } = useAuth()

  const [data, setData] = useState<SupportTicketDetail | null>(null)
  const [templates, setTemplates] = useState<SupportTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [isInternalNote, setIsInternalNote] = useState(false)
  const [nextStatus, setNextStatus] = useState<TicketStatus | ''>('')
  const [sending, setSending] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [removedPosts, setRemovedPosts] = useState<RemovedPost[]>([])
  const [removedPostsOpen, setRemovedPostsOpen] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const refresh = async () => {
    if (!ticketId) return
    try {
      const result = await adminGetTicket(authorizedFetch, ticketId)
      setData(result)
      setError(null)
      const removed = await adminListRemovedPosts(authorizedFetch, result.ticket.user.id).catch(() => ({ items: [] }))
      setRemovedPosts(removed.items)
      if (result.ticket.topic === 'POST_REMOVED' && removed.items.length > 0) {
        setRemovedPostsOpen(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar ticket')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void refresh()
    void listTemplates(authorizedFetch)
      .then((d) => setTemplates(d.items))
      .catch(() => setTemplates([]))
  }, [ticketId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestorePost = async (postId: string) => {
    if (!window.confirm('Restaurar este post? Ele voltará a ficar visível para o usuário e seguidores.')) return
    setRestoringId(postId)
    try {
      await adminRestorePost(authorizedFetch, postId)
      setRemovedPosts((prev) => prev.filter((p) => p.id !== postId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao restaurar post')
    } finally {
      setRestoringId(null)
    }
  }

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
  }, [data?.messages.length])

  // Atualização ao vivo da fila do admin: poll a cada 15s + refetch ao focar a
  // aba, enquanto o ticket não estiver fechado. Silencioso (não mexe no loading
  // nem reabre o painel de posts removidos).
  const ticketStatus = data?.ticket.status
  useEffect(() => {
    if (!ticketId || !ticketStatus || ticketStatus === 'CLOSED') return
    let cancelled = false
    const tick = async () => {
      try {
        const result = await adminGetTicket(authorizedFetch, ticketId)
        if (!cancelled) setData(result)
      } catch {
        // silencioso — mantém o que já está na tela
      }
    }
    const interval = setInterval(() => void tick(), 15_000)
    const onFocus = () => void tick()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [ticketId, authorizedFetch, ticketStatus])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticketId || !reply.trim()) return
    setSending(true)
    try {
      await adminPostReply(authorizedFetch, ticketId, {
        body: reply.trim(),
        isInternalNote,
        nextStatus: nextStatus || undefined,
      })
      setReply('')
      setIsInternalNote(false)
      setNextStatus('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar')
    } finally {
      setSending(false)
    }
  }

  const handleStatus = async (status: TicketStatus) => {
    if (!ticketId) return
    setUpdatingStatus(true)
    try {
      await adminUpdateStatus(authorizedFetch, ticketId, status)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleApplyTemplate = (tpl: SupportTemplate) => {
    setReply((prev) => (prev.trim() ? `${prev.trim()}\n\n${tpl.body}` : tpl.body))
  }

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Carregando ticket...</p>
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <Link to="/admin/support" className="inline-flex items-center gap-1 text-sm text-[var(--brand)]">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <p className="text-sm text-red-400">{error ?? 'Ticket não encontrado'}</p>
      </div>
    )
  }

  const { ticket, messages } = data

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/admin/support')}
        className="inline-flex items-center gap-1 text-sm text-[var(--brand)]"
      >
        <ArrowLeft size={14} /> Voltar para fila
      </button>

      <motion.header
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-[var(--muted)]">{ticket.code}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[ticket.status]}`}>
            {STATUS_LABELS[ticket.status]}
          </span>
          <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
            {TOPIC_LABELS[ticket.topic]}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-black text-[var(--text)]">{ticket.subject}</h1>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Por {ticket.user.name ?? ticket.user.email} · Aberto em {formatDateTime(ticket.createdAt)}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Mudar status:</span>
          {NEXT_STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleStatus(s)}
              disabled={updatingStatus || ticket.status === s}
              className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-bold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </motion.header>

      <div
        ref={scrollerRef}
        className="max-h-[55vh] space-y-3 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      {/* Removed posts (admin review) */}
      {removedPosts.length > 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
          <button
            type="button"
            onClick={() => setRemovedPostsOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 p-3 text-left"
          >
            <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--text)]">
              <Trash2 size={13} className="text-rose-400" />
              Posts removidos do usuário
              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-300">
                {removedPosts.length}
              </span>
            </span>
            {removedPostsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {removedPostsOpen ? (
            <div className="space-y-3 border-t border-[var(--line)] p-3">
              {removedPosts.map((post) => (
                <RemovedPostCard
                  key={post.id}
                  post={post}
                  restoring={restoringId === post.id}
                  onRestore={() => handleRestorePost(post.id)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Templates */}
      {templates.length > 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            <FileText size={12} /> Respostas prontas
          </p>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleApplyTemplate(tpl)}
                className="rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-1 text-[10px] font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
              >
                {tpl.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Reply form */}
      <form onSubmit={handleSend} className="space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={MAX_BODY}
          rows={4}
          placeholder={isInternalNote ? 'Nota interna (apenas admins veem)...' : 'Resposta para o usuário...'}
          className={`w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none ${
            isInternalNote
              ? 'border-amber-500/40 bg-amber-500/5 text-amber-100'
              : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--text)]'
          }`}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-[var(--muted)]">
              <input
                type="checkbox"
                checked={isInternalNote}
                onChange={(e) => setIsInternalNote(e.target.checked)}
                className="accent-[var(--brand)]"
              />
              Nota interna
            </label>
            {!isInternalNote ? (
              <select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as TicketStatus | '')}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-1 text-[11px] text-[var(--text)] outline-none"
              >
                <option value="">(definir status...)</option>
                {NEXT_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            ) : null}
            <span className="text-[10px] text-[var(--muted)]">{reply.length}/{MAX_BODY}</span>
          </div>
          <button
            type="submit"
            disabled={sending || !reply.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            <Send size={14} />
            {sending ? 'Enviando...' : isInternalNote ? 'Salvar nota' : 'Enviar resposta'}
          </button>
        </div>
      </form>
    </section>
  )
}
