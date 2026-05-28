import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Copy, Crown, Link2, LogOut, Trophy, Users } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  getCompetition,
  inviteMember,
  leaveCompetition,
} from '../services/competitionService'
import type { Competition, CompetitionType } from '../types/competition'
import { Skeleton } from '../components/common/Skeleton'

const TYPE_LABEL: Record<CompetitionType, string> = {
  TRAINING: 'Treino',
  CARDIO: 'Cardio',
  BOTH: 'Treino + Cardio',
}

export function CompetitionDetailPage() {
  const { competitionId = '' } = useParams<{ competitionId: string }>()
  const { authorizedFetch, user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [comp, setComp] = useState<Competition | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getCompetition(authorizedFetch, competitionId)
      setComp(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar competição')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch, competitionId])

  useEffect(() => {
    if (competitionId) void load()
  }, [competitionId, load])

  const myMembership = useMemo(
    () => comp?.members.find((m) => m.userId === user?.id) ?? null,
    [comp, user?.id],
  )
  const isAdmin = myMembership?.role === 'ADMIN'
  const isOwner = comp?.ownerUserId === user?.id

  const inviteUrl = useMemo(() => {
    if (!comp) return ''
    return `${window.location.origin}/desafios/convite/${comp.inviteToken}`
  }, [comp])

  const handleCopyLink = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copie o link:', inviteUrl)
    }
  }

  const handleShareLink = async () => {
    if (!comp) return
    const text = `Te chamei pra um desafio no SerraAthlo: ${comp.name ?? 'Desafio'} (${TYPE_LABEL[comp.type]} · ${comp.durationDays}d). Aceita aqui: ${inviteUrl}`
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
    if (nav.share) {
      try {
        await nav.share({ title: 'Desafio SerraAthlo', text })
        return
      } catch {
        // user cancelled — fall back to copy
      }
    }
    await handleCopyLink()
  }

  const handleLeave = async () => {
    if (!comp) return
    const msg = isOwner && comp.status === 'LOBBY'
      ? 'Você é o criador. Sair agora vai cancelar o desafio. Continuar?'
      : 'Tem certeza que quer sair do desafio?'
    if (!window.confirm(msg)) return
    try {
      await leaveCompetition(authorizedFetch, comp.id)
      navigate('/desafios')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao sair')
    }
  }

  // Hook for link-only invite generation (extra link for sharing) — keeps
  // the existing inviteToken handy but lets the admin regenerate by
  // generating a brand new invite if they want a fresh URL.
  const handleNewLink = async () => {
    if (!comp) return
    try {
      const invite = await inviteMember(authorizedFetch, comp.id, {})
      const url = `${window.location.origin}/desafios/convite/${invite.token}`
      await navigator.clipboard.writeText(url).catch(() => {
        window.prompt('Copie o link:', url)
      })
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar link')
    }
  }

  if (loading) {
    return (
      <section className="space-y-3">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </section>
    )
  }

  if (error || !comp) {
    return (
      <section className="space-y-3">
        <Link
          to="/desafios"
          className="inline-flex items-center gap-1.5 px-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={11} />
          Voltar para desafios
        </Link>
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">
          {error ?? 'Competição não encontrada'}
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <Link
        to="/desafios"
        className="inline-flex items-center gap-1.5 px-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={11} />
        Voltar para desafios
      </Link>

      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-strong)]">
              <Trophy size={12} />
              {comp.status === 'LOBBY' && 'No lobby'}
              {comp.status === 'ACTIVE' && 'Em andamento'}
              {comp.status === 'COMPLETED' && 'Encerrado'}
              {comp.status === 'CANCELLED' && 'Cancelado'}
            </div>
            <h1 className="mt-1.5 text-2xl font-extrabold text-[var(--text)] sm:text-3xl">
              {comp.name ?? 'Desafio'}
            </h1>
            <p className="mt-1 font-mono text-[12px] text-[var(--muted)]">
              {TYPE_LABEL[comp.type]} · {comp.durationDays} dias · {comp.members.length}/10
            </p>
          </div>
        </div>
      </motion.header>

      {/* Invite + share */}
      {comp.status === 'LOBBY' && isAdmin && (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
            Convidar amigos
          </h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Compartilhe o link abaixo no WhatsApp ou copie pra mandar de outras formas. Só pessoas que você segue mutuamente podem entrar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleShareLink()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)]"
            >
              <Link2 size={13} />
              Compartilhar link
            </button>
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <Copy size={13} />
              {copied ? 'Copiado!' : 'Copiar link'}
            </button>
            <button
              type="button"
              onClick={() => void handleNewLink()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            >
              Novo link
            </button>
          </div>
          <p className="mt-2 break-all font-mono text-[10.5px] text-[var(--muted)]">{inviteUrl}</p>
        </section>
      )}

      {/* Members */}
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <h2 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
          <Users size={14} />
          Participantes ({comp.members.length}/10)
        </h2>
        <ul className="mt-3 space-y-2">
          {comp.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
              {m.user.avatarUrl ? (
                <img
                  src={m.user.avatarUrl}
                  alt={m.user.name ?? m.user.handle}
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-sm font-bold text-[var(--text)]">
                  {(m.user.name ?? m.user.handle).slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text)]">
                  {m.user.name ?? `@${m.user.handle}`}
                </p>
                <p className="mt-0.5 font-mono text-[10.5px] text-[var(--muted)]">@{m.user.handle}</p>
              </div>
              {m.role === 'ADMIN' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  <Crown size={10} />
                  Admin
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Soft note — leaderboard + posting in next PR */}
      {comp.status === 'ACTIVE' && (
        <section className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface)] p-4 text-center text-xs text-[var(--muted)]">
          Ranking e posts de prova chegam no próximo update. Por enquanto a sala está rodando — fique de olho.
        </section>
      )}

      {/* Leave */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => void handleLeave()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
        >
          <LogOut size={12} />
          {isOwner && comp.status === 'LOBBY' ? 'Cancelar desafio' : 'Sair do desafio'}
        </button>
      </div>
    </section>
  )
}
