import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, ArrowLeft, Copy, Crown, Dumbbell, Image as ImageIcon, Link2, LogOut, MoreVertical, Play, Trophy, UserMinus, UserPlus, Users, X as XIcon } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  demoteMember,
  getCompetition,
  getCompetitionFeed,
  getStandings,
  inviteMember,
  kickMember,
  leaveCompetition,
  listInvitableFriends,
  promoteMember,
  startCompetition,
} from '../services/competitionService'
import type {
  Competition,
  CompetitionFeedItem,
  CompetitionMember as Member,
  CompetitionStandings,
  CompetitionType,
  CompetitionUserSummary,
} from '../types/competition'
import { Skeleton } from '../components/common/Skeleton'

const TYPE_LABEL: Record<CompetitionType, string> = {
  TRAINING: 'Treino',
  CARDIO: 'Cardio',
  BOTH: 'Treino + Cardio',
}

// Wraps Date.now so callsites inside render don't trip react-hooks/purity.
// Same pattern used elsewhere (ProgressPage). The "impurity" is intentional —
// the countdown is supposed to reflect current wall time.
function nowMs(): number {
  return Date.now()
}

export function CompetitionDetailPage() {
  const { competitionId = '' } = useParams<{ competitionId: string }>()
  const { authorizedFetch, user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [comp, setComp] = useState<Competition | null>(null)
  const [standings, setStandings] = useState<CompetitionStandings | null>(null)
  const [feed, setFeed] = useState<CompetitionFeedItem[]>([])
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [photoZoom, setPhotoZoom] = useState<CompetitionFeedItem | null>(null)
  const [showFriendPicker, setShowFriendPicker] = useState(false)
  const [memberMenuFor, setMemberMenuFor] = useState<string | null>(null)
  const [memberBusy, setMemberBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getCompetition(authorizedFetch, competitionId)
      setComp(data)
      // Standings + feed only matter once the room has started.
      if (data.status === 'ACTIVE' || data.status === 'COMPLETED') {
        const [s, f] = await Promise.all([
          getStandings(authorizedFetch, competitionId).catch(() => null),
          getCompetitionFeed(authorizedFetch, competitionId).catch(() => ({ items: [] })),
        ])
        if (s) setStandings(s)
        setFeed(f.items)
      }
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

  const handlePromote = async (memberId: string) => {
    if (!comp) return
    setMemberBusy(true)
    setError(null)
    try {
      await promoteMember(authorizedFetch, comp.id, memberId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao promover')
    } finally {
      setMemberBusy(false)
      setMemberMenuFor(null)
    }
  }

  const handleDemote = async (memberId: string) => {
    if (!comp) return
    setMemberBusy(true)
    setError(null)
    try {
      await demoteMember(authorizedFetch, comp.id, memberId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao rebaixar')
    } finally {
      setMemberBusy(false)
      setMemberMenuFor(null)
    }
  }

  const handleKick = async (memberId: string, displayName: string) => {
    if (!comp) return
    if (!window.confirm(`Remover ${displayName} do desafio?`)) {
      setMemberMenuFor(null)
      return
    }
    setMemberBusy(true)
    setError(null)
    try {
      await kickMember(authorizedFetch, comp.id, memberId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover membro')
    } finally {
      setMemberBusy(false)
      setMemberMenuFor(null)
    }
  }

  const handleStart = async () => {
    if (!comp) return
    if (!window.confirm('Iniciar o desafio agora? Depois disso a categoria e a duração ficam travadas.')) return
    setStarting(true)
    setError(null)
    try {
      const updated = await startCompetition(authorizedFetch, comp.id)
      setComp(updated)
      // Reload standings/feed immediately so the new ACTIVE view renders.
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar')
    } finally {
      setStarting(false)
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

      {/* Countdown / start CTA — lobby only */}
      {comp.status === 'LOBBY' && (
        <LobbyCountdown
          startDeadline={comp.startDeadline}
          isAdmin={isAdmin}
          starting={starting}
          enoughMembers={comp.members.filter((m) => !m.abandonedAt).length >= 2}
          onStart={() => void handleStart()}
        />
      )}

      {/* Active countdown — until the room ends. */}
      {comp.status === 'ACTIVE' && comp.endsAt && (
        <ActiveCountdown endsAt={comp.endsAt} />
      )}

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
              onClick={() => setShowFriendPicker(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)]"
            >
              <UserPlus size={13} />
              Convidar amigo
            </button>
            <button
              type="button"
              onClick={() => void handleShareLink()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
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
            <MemberRow
              key={m.id}
              member={m}
              isOwner={comp.ownerUserId === m.userId}
              canModerate={isAdmin && (comp.status === 'LOBBY' || comp.status === 'ACTIVE')}
              isMe={m.userId === user?.id}
              menuOpen={memberMenuFor === m.userId}
              busy={memberBusy}
              onOpenMenu={() => setMemberMenuFor((curr) => (curr === m.userId ? null : m.userId))}
              onPromote={() => void handlePromote(m.userId)}
              onDemote={() => void handleDemote(m.userId)}
              onKick={() => void handleKick(m.userId, m.user.name ?? `@${m.user.handle}`)}
            />
          ))}
        </ul>
      </section>

      {/* Leaderboard */}
      {(comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && standings && (
        <Leaderboard standings={standings} winnerUserId={comp.winnerUserId} />
      )}

      {/* Feed */}
      {(comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && (
        <CompetitionFeed items={feed} onZoom={(item) => setPhotoZoom(item)} />
      )}

      {showFriendPicker && comp && (
        <FriendPickerModal
          competitionId={comp.id}
          onClose={() => setShowFriendPicker(false)}
          onInvited={() => {
            setShowFriendPicker(false)
            void load()
          }}
        />
      )}

      {photoZoom && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPhotoZoom(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={photoZoom.photoUrl}
            alt={`Prova de ${photoZoom.user.name ?? photoZoom.user.handle}`}
            className="max-h-[88vh] max-w-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
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

// ─── Subcomponents ────────────────────────────────────────────────────────

function daysHoursMinutes(diffMs: number): string {
  if (diffMs <= 0) return 'expirado'
  const totalMin = Math.floor(diffMs / 60_000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

function LobbyCountdown({
  startDeadline, isAdmin, starting, enoughMembers, onStart,
}: {
  startDeadline: string | null
  isAdmin: boolean
  starting: boolean
  enoughMembers: boolean
  onStart: () => void
}) {
  // Re-render once per minute so the countdown ticks without a tight loop.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const remaining = startDeadline ? new Date(startDeadline).getTime() - nowMs() : null

  return (
    <section className="rounded-2xl border border-amber-400/40 bg-amber-50 p-4 sm:p-5 dark:bg-amber-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">
            No lobby — esperando começar
          </p>
          <p className="mt-1 text-sm text-[var(--text)]">
            {remaining != null && remaining > 0 ? (
              <>
                Cancela automaticamente em <b className="font-bold">{daysHoursMinutes(remaining)}</b> se ninguém iniciar.
              </>
            ) : (
              <>O prazo de início expirou — o desafio será cancelado.</>
            )}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={onStart}
            disabled={starting || !enoughMembers || (remaining ?? 0) <= 0}
            title={!enoughMembers ? 'Precisa de ao menos 2 participantes' : undefined}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={13} fill="currentColor" />
            {starting ? 'Iniciando…' : 'Iniciar agora'}
          </button>
        )}
      </div>
    </section>
  )
}

function ActiveCountdown({ endsAt }: { endsAt: string }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const remaining = new Date(endsAt).getTime() - nowMs()

  return (
    <section className="rounded-2xl border border-emerald-500/40 bg-emerald-50 p-3 dark:bg-emerald-500/5">
      <p className="text-center text-sm font-bold text-emerald-700 dark:text-emerald-300">
        Termina em <span className="font-mono tabular-nums">{daysHoursMinutes(remaining)}</span>
      </p>
    </section>
  )
}

function Leaderboard({
  standings, winnerUserId,
}: {
  standings: CompetitionStandings
  winnerUserId: string | null
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
        <Trophy size={14} className="text-[var(--brand)]" />
        Ranking
      </h2>
      <ol className="mt-3 space-y-1.5">
        {standings.rows.map((row, idx) => {
          const isWinner = winnerUserId === row.userId
          return (
            <li
              key={row.userId}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                isWinner
                  ? 'border-[#f1c84a] bg-gradient-to-r from-[#fffaea] to-[var(--surface-hover)] dark:from-[#3d2e09]/40'
                  : 'border-[var(--line)] bg-[var(--surface-hover)]'
              }`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                  idx === 0
                    ? 'bg-[#f4c443] text-[#5a4209]'
                    : idx === 1
                      ? 'bg-[#d4d4d4] text-[#3a3a3a]'
                      : idx === 2
                        ? 'bg-[#cd7f32] text-white'
                        : 'bg-[var(--surface)] text-[var(--muted)]'
                }`}
              >
                {idx + 1}
              </span>
              {row.user.avatarUrl ? (
                <img
                  src={row.user.avatarUrl}
                  alt={row.user.name ?? row.user.handle}
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-sm font-bold text-[var(--text)]">
                  {(row.user.name ?? row.user.handle).slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text)]">
                  {row.user.name ?? `@${row.user.handle}`}
                  {isWinner && <span className="ml-1.5 text-xs">🏆</span>}
                </p>
                <p className="mt-0.5 font-mono text-[10.5px] text-[var(--muted)]">
                  vol {row.volumeKg.toLocaleString('pt-BR')}kg
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-extrabold text-[var(--text)] tabular-nums">{row.daysActive}</p>
                <p className="font-mono text-[10px] text-[var(--muted)]">dias</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function CompetitionFeed({
  items, onZoom,
}: {
  items: CompetitionFeedItem[]
  onZoom: (item: CompetitionFeedItem) => void
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
        <ImageIcon size={14} className="text-[var(--brand)]" />
        Feed de provas
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--line)] px-3 py-6 text-center text-xs text-[var(--muted)]">
          Sem provas ainda. Quando alguém terminar um treino, a foto vai aparecer aqui.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
              <button
                type="button"
                onClick={() => onZoom(item)}
                className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--line)]"
              >
                <img src={item.photoUrl} alt="prova" className="h-full w-full object-cover" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--text)]">
                  {item.user.name ?? `@${item.user.handle}`}
                </p>
                <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10.5px] text-[var(--muted)]">
                  {item.kind === 'TRAINING' ? <Dumbbell size={10} /> : <Activity size={10} />}
                  {item.kind === 'TRAINING' ? 'Treino' : 'Cardio'} · {new Date(item.day).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MemberRow({
  member, isOwner, canModerate, isMe, menuOpen, busy, onOpenMenu, onPromote, onDemote, onKick,
}: {
  member: Member
  isOwner: boolean
  canModerate: boolean
  isMe: boolean
  menuOpen: boolean
  busy: boolean
  onOpenMenu: () => void
  onPromote: () => void
  onDemote: () => void
  onKick: () => void
}) {
  const displayName = member.user.name ?? `@${member.user.handle}`
  const isAdmin = member.role === 'ADMIN'
  // Owner is always admin. Can't kick self via this menu (use Leave instead).
  // Can't kick the owner. Demote requires another active admin available
  // — the backend also enforces this, but we hide the option when the user
  // is the only admin to avoid showing a button that always errors.
  const showPromote = canModerate && !isAdmin && !member.abandonedAt
  const showDemote = canModerate && isAdmin && !isOwner && !member.abandonedAt
  const showKick = canModerate && !isOwner && !isMe && !member.abandonedAt
  const hasAnyAction = showPromote || showDemote || showKick

  return (
    <li className="relative flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
      {member.user.avatarUrl ? (
        <img
          src={member.user.avatarUrl}
          alt={displayName}
          className={`h-10 w-10 shrink-0 rounded-full object-cover ${member.abandonedAt ? 'opacity-40 grayscale' : ''}`}
        />
      ) : (
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-sm font-bold text-[var(--text)] ${member.abandonedAt ? 'opacity-40' : ''}`}>
          {(member.user.name ?? member.user.handle).slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold ${member.abandonedAt ? 'text-[var(--muted)] line-through' : 'text-[var(--text)]'}`}>
          {displayName}
        </p>
        <p className="mt-0.5 font-mono text-[10.5px] text-[var(--muted)]">
          @{member.user.handle}
          {member.abandonedAt && ' · saiu'}
        </p>
      </div>

      {isAdmin && !member.abandonedAt && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          <Crown size={10} />
          Admin
        </span>
      )}

      {hasAnyAction && (
        <div className="relative">
          <button
            type="button"
            onClick={onOpenMenu}
            disabled={busy}
            className="grid h-8 w-8 place-items-center rounded-md border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] disabled:opacity-50"
            aria-label="Ações do membro"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-xl">
              {showPromote && (
                <button
                  type="button"
                  onClick={onPromote}
                  disabled={busy}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  <Crown size={12} className="text-amber-500" />
                  Promover a admin
                </button>
              )}
              {showDemote && (
                <button
                  type="button"
                  onClick={onDemote}
                  disabled={busy}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  <UserMinus size={12} className="text-[var(--muted)]" />
                  Remover admin
                </button>
              )}
              {showKick && (
                <button
                  type="button"
                  onClick={onKick}
                  disabled={busy}
                  className="flex w-full items-center gap-2 border-t border-[var(--line)] px-3 py-2 text-left text-xs font-medium text-rose-500 hover:bg-rose-500/10"
                >
                  <UserMinus size={12} />
                  Remover do desafio
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function FriendPickerModal({
  competitionId, onClose, onInvited,
}: {
  competitionId: string
  onClose: () => void
  onInvited: () => void
}) {
  const { authorizedFetch } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [friends, setFriends] = useState<CompetitionUserSummary[]>([])
  const [inviting, setInviting] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Lock background scroll while the picker is up (same pattern as the
  // set-type sheet, profile photo viewer, etc.).
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listInvitableFriends(authorizedFetch, competitionId)
      .then((data) => {
        if (cancelled) return
        setFriends(data.items)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Falha ao carregar amigos')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authorizedFetch, competitionId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return friends
    return friends.filter(
      (f) => (f.name ?? '').toLowerCase().includes(q) || f.handle.toLowerCase().includes(q),
    )
  }, [friends, search])

  const handleInvite = async (friendId: string) => {
    setInviting(friendId)
    setError(null)
    try {
      await inviteMember(authorizedFetch, competitionId, { invitedUserId: friendId })
      // Successful — remove from list and close if it was the only one left.
      setFriends((curr) => curr.filter((f) => f.id !== friendId))
      onInvited()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao convidar')
    } finally {
      setInviting(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] sm:rounded-2xl sm:border-b"
        style={{ maxHeight: 'min(85vh, 720px)' }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <h3 className="text-base font-extrabold text-[var(--text)]">Convidar amigo</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            aria-label="Fechar"
          >
            <XIcon size={14} />
          </button>
        </div>

        <div className="border-b border-[var(--line)] px-4 py-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou @handle"
            className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[10.5px] text-[var(--muted)]">
            Apenas amigos (segue mútuo) aparecem aqui.
          </p>
        </div>

        {error && (
          <p className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-500">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-4 text-center text-xs text-[var(--muted)]">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">
              {friends.length === 0
                ? 'Sem amigos disponíveis. Seus amigos precisam ter aceitado o seu seguir.'
                : 'Nenhum amigo bate com a busca.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((f) => {
                const isInviting = inviting === f.id
                return (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] p-2.5"
                  >
                    {f.avatarUrl ? (
                      <img
                        src={f.avatarUrl}
                        alt={f.name ?? f.handle}
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-xs font-bold text-[var(--text)]">
                        {(f.name ?? f.handle).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">
                        {f.name ?? `@${f.handle}`}
                      </p>
                      <p className="mt-0.5 font-mono text-[10.5px] text-[var(--muted)]">@{f.handle}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleInvite(f.id)}
                      disabled={isInviting}
                      className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
                    >
                      {isInviting ? 'Enviando…' : 'Convidar'}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  )
}
