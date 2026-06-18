import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Flag, RefreshCw, ExternalLink, Trash2, Check } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  adminListReports,
  adminResolveReport,
  type PostReportItem,
  type PostReportReason,
} from '../services/supportService'

const REASON_LABELS: Record<PostReportReason, string> = {
  SPAM: 'Spam ou enganoso',
  HARASSMENT: 'Assédio ou bullying',
  INAPPROPRIATE: 'Conteúdo impróprio',
  VIOLENCE: 'Violência',
  MISINFORMATION: 'Informação falsa',
  OTHER: 'Outro',
}

function relativeAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return 'há menos de 1h'
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

export function AdminReportsPage() {
  const { authorizedFetch } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState<PostReportItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await adminListReports(authorizedFetch)
      setItems(data.items)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar denúncias')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const resolve = async (report: PostReportItem, action: 'DISMISS' | 'REMOVE_POST') => {
    if (busyId) return
    const confirmMsg = action === 'REMOVE_POST'
      ? 'Remover este post? O autor será notificado e as denúncias serão encerradas.'
      : 'Dispensar as denúncias deste post? (o post continua no ar)'
    if (!window.confirm(confirmMsg)) return
    setBusyId(report.id)
    try {
      await adminResolveReport(authorizedFetch, report.id, action)
      // Some todas as denúncias do mesmo post (resolver age por post).
      setItems((prev) => prev.filter((r) => r.post.id !== report.post.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao resolver denúncia')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/admin/support')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
      >
        <ArrowLeft size={16} />
        Voltar ao suporte
      </button>

      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand)]">Admin · Suporte</p>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-black text-[var(--text)]">
          <Flag size={22} />
          Denúncias
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pendentes: <span className="font-bold text-[var(--text)]">{items.length}</span>
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </motion.header>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-10 text-center">
          <Check size={36} className="mx-auto mb-3 text-emerald-400" strokeWidth={1.5} />
          <p className="text-base font-bold text-[var(--text)]">Nenhuma denúncia pendente</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Tudo limpo por aqui.</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((r) => (
          <div key={r.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400">
                  <Flag size={12} />
                  {REASON_LABELS[r.reason]}
                </span>
                <p className="mt-2 text-sm text-[var(--text)]">
                  Post de <span className="font-bold">{r.post.user.name ?? `@${r.post.user.handle}`}</span>
                </p>
                {r.post.caption ? (
                  <p className="mt-0.5 line-clamp-2 text-sm text-[var(--muted)]">"{r.post.caption}"</p>
                ) : (
                  <p className="mt-0.5 text-sm italic text-[var(--muted)]">(sem legenda)</p>
                )}
                {r.details ? (
                  <p className="mt-2 rounded-lg bg-[var(--surface-hover)] px-3 py-2 text-xs text-[var(--text)]">
                    <span className="font-semibold">Detalhe:</span> {r.details}
                  </p>
                ) : null}
                <p className="mt-2 text-[11px] text-[var(--muted)]">
                  Denunciado por {r.reporter.name ?? `@${r.reporter.handle}`} · {relativeAge(r.createdAt)}
                </p>
              </div>
              {r.post.photoUrl && !r.post.photoUrl.startsWith('blob:') ? (
                <img src={r.post.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to={`/post/${r.post.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3.5 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                <ExternalLink size={13} />
                Ver post
              </Link>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void resolve(r, 'DISMISS')}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3.5 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                <Check size={13} />
                Dispensar
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void resolve(r, 'REMOVE_POST')}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-xs font-bold text-red-400 hover:bg-red-500/15 disabled:opacity-50"
              >
                <Trash2 size={13} />
                Remover post
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default AdminReportsPage
