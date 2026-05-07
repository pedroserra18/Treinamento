import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, CheckCircle2, Send, ShieldCheck } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
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

function MessageBubble({ message }: { message: SupportMessage }) {
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
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const refresh = async () => {
    if (!ticketId) return
    try {
      const result = await getMyTicket(authorizedFetch, ticketId)
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar ticket')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [ticketId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: 'smooth' })
  }, [data?.messages.length])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticketId || !reply.trim()) return
    setSending(true)
    try {
      await postUserReply(authorizedFetch, ticketId, { body: reply.trim() })
      setReply('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  const handleResolve = async () => {
    if (!ticketId) return
    if (!window.confirm('Marcar este ticket como resolvido?')) return
    setResolving(true)
    try {
      await userResolveTicket(authorizedFetch, ticketId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao resolver ticket')
    } finally {
      setResolving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Carregando ticket...</p>
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <Link to="/support" className="inline-flex items-center gap-1 text-sm text-[var(--brand)]">
          <ArrowLeft size={14} /> Voltar
        </Link>
        <p className="text-sm text-red-400">{error ?? 'Ticket não encontrado'}</p>
      </div>
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

      <div
        ref={scrollerRef}
        className="max-h-[60vh] space-y-3 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      {canReply ? (
        <form onSubmit={handleSend} className="space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={MAX_BODY}
            rows={3}
            placeholder="Sua resposta..."
            className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-[var(--muted)]">{reply.length}/{MAX_BODY}</span>
            <div className="flex gap-2">
              {canResolve ? (
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={resolving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  {resolving ? 'Marcando...' : 'Marcar como resolvido'}
                </button>
              ) : null}
              <button
                type="submit"
                disabled={sending || !reply.trim()}
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
    </section>
  )
}
