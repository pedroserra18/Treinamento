import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LifeBuoy, Plus, ChevronRight, Dot } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { SupportAttachmentInput } from '../components/common/SupportAttachmentInput'
import {
  STATUS_COLORS,
  STATUS_LABELS,
  TOPIC_LABELS,
  createTicket,
  listMyTickets,
  type SupportTicketSummary,
  type TicketTopic,
} from '../services/supportService'

const TOPIC_OPTIONS: { value: TicketTopic; label: string; hint: string }[] = [
  { value: 'ACCOUNT', label: 'Conta', hint: 'Dados pessoais, exclusão, perfil privado.' },
  { value: 'POST_REMOVED', label: 'Post removido', hint: 'Discordo da remoção de um post meu.' },
  { value: 'LOGIN', label: 'Login / acesso', hint: 'Senha, MFA, login social.' },
  { value: 'BUG', label: 'Bug ou erro', hint: 'Algo travou ou mostrou erro.' },
  { value: 'OTHER', label: 'Outro', hint: 'Sua dúvida não se encaixa nas opções.' },
]

const FAQ: Record<TicketTopic, { q: string; a: string }[]> = {
  ACCOUNT: [
    { q: 'Como excluo minha conta?', a: 'Vá em Perfil → Excluir conta. A ação é definitiva e remove todos os seus dados.' },
    { q: 'Como deixo meu perfil privado?', a: 'Em Perfil → Privacidade, ative "Perfil privado". Apenas seus seguidores verão posts.' },
  ],
  POST_REMOVED: [
    { q: 'Por que meu post foi removido?', a: 'Posts que violam diretrizes (conteúdo impróprio, spam) são removidos. Você recebe uma notificação com o motivo.' },
    { q: 'Posso recuperar um post removido?', a: 'Não, mas você pode contestar a decisão abrindo um ticket aqui.' },
  ],
  LOGIN: [
    { q: 'Esqueci minha senha', a: 'Use a página "Esqueci minha senha" no login. Você receberá um e-mail com link de redefinição.' },
    { q: 'Não recebo o e-mail de verificação', a: 'Confira a pasta de spam. Se o e-mail não chegar em 5 min, abra um ticket.' },
  ],
  BUG: [
    { q: 'Antes de abrir um ticket', a: 'Recarregue a página, limpe o cache do navegador e tente novamente. Anexar um screenshot acelera muito a investigação.' },
  ],
  OTHER: [],
}

const MAX_BODY = 2000
const MAX_SUBJECT = 120

export function SupportPage() {
  const { authorizedFetch } = useAuth()
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [topic, setTopic] = useState<TicketTopic | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const data = await listMyTickets(authorizedFetch)
      setTickets(data.items)
      setListError(null)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Erro ao carregar tickets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!topic) {
      setFormError('Escolha um tópico antes de enviar.')
      return
    }
    if (subject.trim().length < 3) {
      setFormError('O assunto precisa de pelo menos 3 caracteres.')
      return
    }
    if (body.trim().length < 5) {
      setFormError('A mensagem precisa de pelo menos 5 caracteres.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const result = await createTicket(authorizedFetch, {
        topic,
        subject: subject.trim(),
        body: body.trim(),
        attachments: attachments.length > 0 ? attachments : undefined,
      })
      navigate(`/support/${result.ticket.id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao abrir ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-5">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl animate-[tech-spin_22s_linear_infinite]"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Ajuda e suporte</p>
        <h1 className="relative mt-2 flex items-center gap-2 text-3xl font-black text-[var(--text)] sm:text-4xl">
          <LifeBuoy size={28} className="text-[var(--brand)]" />
          Como podemos ajudar?
        </h1>
        <p className="relative mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Respondemos em até <span className="font-semibold text-[var(--text)]">48 horas</span>. Antes de abrir um ticket, dê uma olhada nas perguntas frequentes do tópico escolhido — pode resolver na hora.
        </p>
      </motion.header>

      {/* Existing tickets */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Meus tickets</h2>
        {loading ? (
          <ul className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-hover)]" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-[var(--surface-hover)]" />
                <div className="mt-2 h-2.5 w-1/3 animate-pulse rounded bg-[var(--surface-hover)]" />
              </li>
            ))}
          </ul>
        ) : listError ? (
          <p className="text-sm text-red-400">{listError}</p>
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-6 text-center">
            <p className="text-sm text-[var(--muted)]">Você ainda não abriu tickets.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => {
              const awaitingUser = t.status === 'AWAITING_USER'
              return (
                <li key={t.id}>
                  <Link
                    to={`/support/${t.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[var(--muted)]">{t.code}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[t.status]}`}>
                          {STATUS_LABELS[t.status]}
                        </span>
                        <span className="text-[10px] text-[var(--muted)]">{TOPIC_LABELS[t.topic]}</span>
                        {awaitingUser ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--brand)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--brand)]">
                            <Dot size={14} className="-mx-1" /> Suporte respondeu
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-sm font-bold text-[var(--text)]">{t.subject}</p>
                      {t.lastMessagePreview ? (
                        <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                          <span className="font-semibold">
                            {t.lastMessageRole === 'ADMIN' ? 'Suporte: ' : t.lastMessageRole === 'USER' ? 'Você: ' : ''}
                          </span>
                          {t.lastMessagePreview}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        Atualizado em {new Date(t.lastActivityAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* New ticket form */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Plus size={18} className="text-[var(--brand)]" />
          <h2 className="text-lg font-bold text-[var(--text)]">Abrir novo ticket</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              1. Sobre o que é seu pedido?
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TOPIC_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTopic(opt.value)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    topic === opt.value
                      ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)]'
                      : 'border-[var(--line)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <p className="text-sm font-bold text-[var(--text)]">{opt.label}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--muted)]">{opt.hint}</p>
                </button>
              ))}
            </div>
          </div>

          {topic && FAQ[topic].length > 0 ? (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Talvez isso resolva
              </p>
              <ul className="space-y-2">
                {FAQ[topic].map((entry, idx) => (
                  <li key={idx}>
                    <p className="text-xs font-bold text-[var(--text)]">{entry.q}</p>
                    <p className="text-xs text-[var(--muted)]">{entry.a}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {topic ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  2. Assunto <span className="font-normal normal-case">(mín. 3 caracteres)</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={MAX_SUBJECT}
                  placeholder="Resuma seu pedido em uma frase"
                  className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
                />
                <p className="mt-1 text-right text-[10px] text-[var(--muted)]">{subject.length}/{MAX_SUBJECT}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  3. Mensagem <span className="font-normal normal-case">(mín. 5 caracteres)</span>
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={MAX_BODY}
                  rows={6}
                  placeholder="Descreva com detalhes o que aconteceu, quando e o que esperava."
                  className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
                />
                <p className="mt-1 text-right text-[10px] text-[var(--muted)]">{body.length}/{MAX_BODY}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  4. Imagens <span className="font-normal normal-case">(opcional — até 3)</span>
                </label>
                <SupportAttachmentInput attachments={attachments} onChange={setAttachments} disabled={submitting} />
              </div>

              {formError ? <p className="text-xs text-red-400">{formError}</p> : null}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
              >
                {submitting ? 'Enviando...' : 'Abrir ticket'}
              </button>
            </>
          ) : null}
        </form>
      </div>
    </section>
  )
}
