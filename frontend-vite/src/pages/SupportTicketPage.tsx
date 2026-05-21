import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowDown, CheckCircle2, Send, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { SupportAttachmentInput } from '../components/common/SupportAttachmentInput'
import { ImageLightbox } from '../components/common/ImageLightbox'
import {
  STATUS_COLORS,
  STATUS_LABELS,
  TOPIC_LABELS,
  getMyTicket,
  postUserReply,
  userResolveTicket,
  type SupportMessage,
  type SupportTicketDetail,
} from '../services/supportService'

const MAX_BODY = 2000

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MessageBubble({ message, onImageClick }: { message: SupportMessage; onImageClick: (src: string) => void }) {
  const isAdmin = message.authorRole === 'ADMIN'
  const isSystem = message.authorRole === 'SYSTEM'
  const isUser = message.authorRole === 'USER'

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1 text-[10px] font-semibold text-[var(--muted)]">
          {message.body}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
        isUser
          ? 'bg-[var(--brand)] text-white'
          : 'border border-[var(--line)] bg-[var(--surface-hover)] text-[var(--text)]'
      }`}>
        {isAdmin ? (
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--brand)]">
            <ShieldCheck size={11} />
            <span>{(message.author as { displayName: string }).displayName}</span>
          </div>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
        {message.attachments.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((src, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onImageClick(src)}
                className="block h-24 w-24 overflow-hidden rounded-lg border border-black/10"
              >
                <img src={src} alt={`Anexo ${idx + 1}`} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
        <p className={`mt-1 text-[10px] ${isUser ? 'text-white/70' : 'text-[var(--muted)]'}`}>
          {formatDateTime(message.createdAt)}
        </p>
      </div>
    </div>
  )
}

export function SupportTicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const navigate = useNavigate()
  const { authorizedFetch } = useAuth()
  const [data, setData] = useState<SupportTicketDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [showNewMsg, setShowNewMsg] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const isNearBottom = () => {
    const el = scrollerRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  const scrollToBottom = () => {
    const el = scrollerRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setShowNewMsg(false)
  }

  // refresh silencioso (poll/foco) não mexe no estado de loading nem reabre erro.
  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!ticketId) return
      try {
        const result = await getMyTicket(authorizedFetch, ticketId)
        setData(result)
        setError(null)
      } catch (err) {
        if (!opts?.silent) setError(err instanceof Error ? err.message : 'Erro ao carregar ticket')
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [ticketId, authorizedFetch],
  )

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  // Só rola automaticamente se o usuário já estava no fim; senão mostra o
  // botão "nova mensagem" para não atrapalhar quem está lendo mais acima.
  useEffect(() => {
    if (isNearBottom()) scrollToBottom()
    else setShowNewMsg(true)
  }, [data?.messages.length])

  // Atualização ao vivo: poll a cada 15s + refetch ao focar a aba, enquanto o
  // ticket não estiver fechado. Silencioso para não piscar a tela.
  useEffect(() => {
    if (!data || data.ticket.status === 'CLOSED') return
    const interval = setInterval(() => void refresh({ silent: true }), 15_000)
    const onFocus = () => void refresh({ silent: true })
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [data, refresh])

  // Auto-dismiss do toast.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticketId || (!reply.trim() && attachments.length === 0)) return
    setSending(true)
    try {
      await postUserReply(authorizedFetch, ticketId, {
        body: reply.trim() || '(imagem)',
        attachments: attachments.length > 0 ? attachments : undefined,
      })
      setReply('')
      setAttachments([])
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  const handleResolve = async () => {
    if (!ticketId) return
    setResolving(true)
    try {
      await userResolveTicket(authorizedFetch, ticketId)
      setShowResolveModal(false)
      setToast('Ticket marcado como resolvido.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao resolver ticket')
    } finally {
      setResolving(false)
    }
  }

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--surface-hover)]" />
        <div className="h-24 w-full animate-pulse rounded-2xl bg-[var(--surface-hover)]" />
        <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-[var(--surface-hover)]" />
          <div className="ml-auto h-12 w-1/2 animate-pulse rounded-2xl bg-[var(--surface-hover)]" />
          <div className="h-12 w-3/5 animate-pulse rounded-2xl bg-[var(--surface-hover)]" />
        </div>
      </section>
    )
  }

  if (error || !data) {
    const isNotFound = !error || /não encontrado/i.test(error)
    return (
      <section className="space-y-3">
        <Link to="/support" className="inline-flex items-center gap-1 text-sm text-[var(--brand)]">
          <ArrowLeft size={14} /> Voltar para suporte
        </Link>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
          <p className="text-base font-bold text-[var(--text)]">
            {isNotFound ? 'Ticket indisponível' : 'Erro ao carregar'}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isNotFound
              ? 'Esse ticket não pertence à sua conta atual ou não existe mais. Se você trocou de conta, o ticket fica visível apenas para o usuário que o abriu.'
              : error}
          </p>
          <Link
            to="/support"
            className="mt-4 inline-block rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white"
          >
            Ir para central de suporte
          </Link>
        </div>
      </section>
    )
  }

  const { ticket, messages } = data
  const canReply = ticket.status !== 'CLOSED'
  const canResolve = ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED'

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/support')}
        className="inline-flex items-center gap-1 text-sm text-[var(--brand)]"
      >
        <ArrowLeft size={14} /> Voltar para suporte
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
          Aberto em {formatDateTime(ticket.createdAt)}
        </p>
      </motion.header>

      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={() => { if (isNearBottom()) setShowNewMsg(false) }}
          className="max-h-[60vh] space-y-3 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
        >
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} onImageClick={setLightboxSrc} />
          ))}
        </div>
        {showNewMsg ? (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white shadow-lg"
          >
            <ArrowDown size={13} /> Nova mensagem
          </button>
        ) : null}
      </div>

      {canReply ? (
        <form onSubmit={handleSend} className="space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.closest('form')?.requestSubmit()
              }
            }}
            maxLength={MAX_BODY}
            rows={3}
            placeholder="Sua resposta... (Enter envia, Shift+Enter quebra linha)"
            className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
          />
          <SupportAttachmentInput attachments={attachments} onChange={setAttachments} disabled={sending} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-[var(--muted)]">{reply.length}/{MAX_BODY}</span>
            <div className="flex gap-2">
              {canResolve ? (
                <button
                  type="button"
                  onClick={() => setShowResolveModal(true)}
                  disabled={resolving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  Marcar como resolvido
                </button>
              ) : null}
              <button
                type="submit"
                disabled={sending || (!reply.trim() && attachments.length === 0)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                <Send size={14} />
                {sending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-center text-xs text-[var(--muted)]">
          Este ticket está fechado.{' '}
          <Link to="/support" className="font-bold text-[var(--brand)]">
            Abrir um novo
          </Link>{' '}
          se ainda precisar de ajuda.
        </div>
      )}

      {/* Modal: confirmar resolução */}
      {showResolveModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => !resolving && setShowResolveModal(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-[var(--text)]">Marcar como resolvido</h2>
              <button type="button" onClick={() => !resolving && setShowResolveModal(false)} className="grid h-7 w-7 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-hover)]" aria-label="Fechar">
                <X size={16} />
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Confirma que seu problema foi resolvido? Você ainda poderá responder se precisar reabrir.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowResolveModal(false)} disabled={resolving} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={handleResolve} disabled={resolving} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60">
                {resolving ? 'Marcando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast */}
      {toast ? (
        <div className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 shadow-lg dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200">
          <CheckCircle2 size={15} />
          {toast}
        </div>
      ) : null}

      {lightboxSrc ? <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} /> : null}
    </section>
  )
}
