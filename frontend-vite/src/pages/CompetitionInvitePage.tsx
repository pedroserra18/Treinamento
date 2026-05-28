import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Trophy, Users, Clock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { acceptInvite, declineInvite, getInvitePreview } from '../services/competitionService'
import type { CompetitionInvitePreview, CompetitionType } from '../types/competition'
import { Skeleton } from '../components/common/Skeleton'

const TYPE_DESCRIPTION: Record<CompetitionType, string> = {
  TRAINING: 'Vale 1 treino por dia. Ganha quem treinar mais dias.',
  CARDIO: 'Vale 1 cardio por dia. Ganha quem fizer mais dias.',
  BOTH: 'Vale até 2 atividades por dia (1 treino + 1 cardio).',
}

export function CompetitionInvitePage() {
  const { token = '' } = useParams<{ token: string }>()
  const { authorizedFetch, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<CompetitionInvitePreview | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getInvitePreview(authorizedFetch, token)
      setPreview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Convite não encontrado')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch, token])

  useEffect(() => {
    if (token) void load()
  }, [token, load])

  const handleAccept = async () => {
    if (!isAuthenticated) {
      // Bounce through login, come back here.
      navigate(`/login?next=${encodeURIComponent(`/desafios/convite/${token}`)}`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await acceptInvite(authorizedFetch, token)
      if (preview) navigate(`/desafios/${preview.competition.id}`)
      else navigate('/desafios')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aceitar')
      setBusy(false)
    }
  }

  const handleDecline = async () => {
    if (!isAuthenticated) {
      navigate('/desafios')
      return
    }
    setBusy(true)
    try {
      await declineInvite(authorizedFetch, token)
      navigate('/desafios')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao recusar')
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-md space-y-3 px-4 py-8">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </section>
    )
  }

  if (error || !preview) {
    return (
      <section className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
        <Trophy size={48} className="mx-auto text-[var(--muted)]" />
        <h1 className="text-xl font-bold text-[var(--text)]">Convite inválido</h1>
        <p className="text-sm text-[var(--muted)]">{error ?? 'Esse link expirou ou foi cancelado.'}</p>
        <Link
          to="/desafios"
          className="inline-flex items-center justify-center rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)]"
        >
          Ver meus desafios
        </Link>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-8">
      <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-3xl border border-[var(--brand)]/40 bg-gradient-to-br from-[var(--surface)] to-[var(--brand)]/5 p-6 text-center"
      >
        <Trophy size={32} className="mx-auto text-[var(--brand-strong)]" />
        <p className="mt-3 font-mono text-[10.5px] font-bold uppercase tracking-[0.22em] text-[var(--brand-strong)]">
          Convite de desafio
        </p>
        <h1 className="mt-2 text-2xl font-extrabold text-[var(--text)]">
          {preview.invitedBy.name ?? `@${preview.invitedBy.handle}`} te convidou
        </h1>
        <p className="mt-1 text-sm font-semibold text-[var(--text)]">
          {preview.competition.name ?? 'Desafio'}
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">{TYPE_DESCRIPTION[preview.competition.type]}</p>

        <div className="mt-4 flex flex-wrap justify-center gap-3 font-mono text-[11px] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <Users size={11} /> {preview.competition._count.members}/10 participantes
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock size={11} /> {preview.competition.durationDays} dias
          </span>
        </div>
      </motion.article>

      {preview.competition.status !== 'LOBBY' && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-center text-xs text-amber-600 dark:text-amber-400">
          {preview.competition.status === 'ACTIVE'
            ? 'Esse desafio já começou — você não pode mais entrar.'
            : 'Esse desafio não está mais aceitando participantes.'}
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">{error}</p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => void handleAccept()}
          disabled={busy || preview.competition.status !== 'LOBBY'}
          className="rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
        >
          {isAuthenticated ? (busy ? 'Aceitando…' : 'Aceitar desafio') : 'Entrar e aceitar'}
        </button>
        <button
          type="button"
          onClick={() => void handleDecline()}
          disabled={busy}
          className="rounded-xl border border-[var(--line)] px-5 py-2.5 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
        >
          Recusar
        </button>
      </div>
    </section>
  )
}
