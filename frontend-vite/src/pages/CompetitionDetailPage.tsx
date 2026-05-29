import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowLeft,
  Copy,
  Dumbbell,
  Link2,
  LogOut,
  Trash2,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  deleteCompetitionEntry,
  demoteMember,
  getCompetition,
  getCompetitionFeed,
  getStandings,
  inviteMember,
  kickMember,
  leaveCompetition,
  promoteMember,
  startCompetition,
  toggleReaction,
} from '../services/competitionService'
import type {
  Competition,
  CompetitionFeedItem,
  CompetitionReactionKind,
  CompetitionStandings,
  CompetitionType,
} from '../types/competition'
import { Skeleton } from '../components/common/Skeleton'
import { CompetitionChat } from '../components/common/CompetitionChat'
import { MobileTabBar, type CompetitionTab } from '../components/competition/MobileTabBar'
import { PersonalStatusCard } from '../components/competition/PersonalStatusCard'
import { LobbyCountdown } from '../components/competition/LobbyCountdown'
import { ActiveCountdown } from '../components/competition/ActiveCountdown'
import { Leaderboard } from '../components/competition/Leaderboard'
import { CompetitionFeed } from '../components/competition/CompetitionFeed'
import { DailySummaryCard } from '../components/competition/DailySummaryCard'
import { RulesCollapsible } from '../components/competition/RulesCollapsible'
import { CommentThread } from '../components/competition/CommentThread'
import { ReactionsBar } from '../components/competition/ReactionsBar'
import { MemberRow } from '../components/competition/MemberRow'
import { FriendPickerModal } from '../components/competition/FriendPickerModal'
import { relativeTime } from '../components/competition/helpers'

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
  const [standings, setStandings] = useState<CompetitionStandings | null>(null)
  const [feed, setFeed] = useState<CompetitionFeedItem[]>([])
  const [copied, setCopied] = useState(false)
  const [starting, setStarting] = useState(false)
  const [photoZoom, setPhotoZoom] = useState<CompetitionFeedItem | null>(null)
  const [showFriendPicker, setShowFriendPicker] = useState(false)
  const [memberMenuFor, setMemberMenuFor] = useState<string | null>(null)
  const [memberBusy, setMemberBusy] = useState(false)
  const [mobileTab, setMobileTab] = useState<CompetitionTab>('geral')

  // Re-fetches the volatile parts of the page (leaderboard + feed) without
  // touching the competition / members / countdown. Used both on initial
  // load and by the polling effect below so the page feels live.
  const refreshDynamic = useCallback(async (status: Competition['status']) => {
    if (status !== 'ACTIVE' && status !== 'COMPLETED') return
    const [s, f] = await Promise.all([
      getStandings(authorizedFetch, competitionId).catch(() => null),
      getCompetitionFeed(authorizedFetch, competitionId).catch(() => ({ items: [] })),
    ])
    if (s) setStandings(s)
    setFeed(f.items)
  }, [authorizedFetch, competitionId])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getCompetition(authorizedFetch, competitionId)
      setComp(data)
      await refreshDynamic(data.status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar competição')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch, competitionId, refreshDynamic])

  useEffect(() => {
    if (competitionId) void load()
  }, [competitionId, load])

  // Polls the leaderboard + feed every 12s so members see new proofs
  // arrive without a full page refresh. Stops when the competition is
  // completed or cancelled.
  useEffect(() => {
    if (!comp || comp.status !== 'ACTIVE') return
    const id = window.setInterval(() => {
      void refreshDynamic(comp.status)
    }, 12_000)
    return () => window.clearInterval(id)
  }, [comp, refreshDynamic])

  const myMembership = useMemo(
    () => comp?.members.find((m) => m.userId === user?.id) ?? null,
    [comp, user?.id],
  )

  // Rank deltas vs the snapshot we stored in localStorage on the previous
  // load. New users (no prior position) get null = "no arrow shown".
  const rankDeltas = useMemo(() => {
    const map = new Map<string, number>()
    if (!standings || !competitionId) return map
    let prev: Record<string, number> = {}
    try {
      const raw = window.localStorage.getItem(`acad:comp-rank-snapshot:${competitionId}`)
      if (raw) prev = JSON.parse(raw)
    } catch {
      // ignore corrupt snapshot
    }
    standings.rows.forEach((row, idx) => {
      const currentRank = idx + 1
      const prevRank = prev[row.userId]
      if (typeof prevRank === 'number') {
        map.set(row.userId, prevRank - currentRank)
      }
    })
    return map
  }, [standings, competitionId])

  // Persist the current standings as the snapshot for next load.
  useEffect(() => {
    if (!standings || !competitionId) return
    const snapshot: Record<string, number> = {}
    standings.rows.forEach((row, idx) => {
      snapshot[row.userId] = idx + 1
    })
    try {
      window.localStorage.setItem(`acad:comp-rank-snapshot:${competitionId}`, JSON.stringify(snapshot))
    } catch {
      // localStorage quota / private mode — non-blocking
    }
  }, [standings, competitionId])

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

  // Optimistically toggle the reaction so the UI feels instant.
  const handleReact = async (entryId: string, kind: CompetitionReactionKind) => {
    setFeed((curr) =>
      curr.map((item) => {
        if (item.id !== entryId) return item
        const existing = item.reactions.find((r) => r.kind === kind)
        if (existing) {
          if (existing.mine) {
            const nextCount = existing.count - 1
            const filteredReactions = nextCount > 0
              ? item.reactions.map((r) => (r.kind === kind ? { ...r, count: nextCount, mine: false } : r))
              : item.reactions.filter((r) => r.kind !== kind)
            return { ...item, reactions: filteredReactions }
          }
          return {
            ...item,
            reactions: item.reactions.map((r) =>
              r.kind === kind ? { ...r, count: r.count + 1, mine: true } : r,
            ),
          }
        }
        return { ...item, reactions: [...item.reactions, { kind, count: 1, mine: true }] }
      }),
    )
    try {
      await toggleReaction(authorizedFetch, competitionId, entryId, kind)
    } catch (err) {
      void refreshDynamic(comp?.status ?? 'ACTIVE')
      setError(err instanceof Error ? err.message : 'Falha ao reagir')
    }
  }

  // Admin-only proof removal from inside the zoom modal.
  const handleDeleteEntry = async (entry: CompetitionFeedItem) => {
    if (!comp) return
    const name = entry.user.name ?? `@${entry.user.handle}`
    if (!window.confirm(`Apagar a prova de ${name}? Essa ação não pode ser desfeita.`)) return
    setFeed((curr) => curr.filter((it) => it.id !== entry.id))
    setPhotoZoom(null)
    try {
      await deleteCompetitionEntry(authorizedFetch, comp.id, entry.id)
      void refreshDynamic(comp.status)
    } catch (err) {
      void load()
      setError(err instanceof Error ? err.message : 'Falha ao remover prova')
    }
  }

  // Keep the grid badge in sync with the comment thread without refetching.
  const adjustCommentsCount = useCallback((entryId: string, delta: number) => {
    setFeed((curr) =>
      curr.map((item) =>
        item.id === entryId
          ? { ...item, commentsCount: Math.max(0, item.commentsCount + delta) }
          : item,
      ),
    )
    setPhotoZoom((curr) =>
      curr && curr.id === entryId
        ? { ...curr, commentsCount: Math.max(0, curr.commentsCount + delta) }
        : curr,
    )
  }, [])

  const handleStart = async () => {
    if (!comp) return
    if (!window.confirm('Iniciar o desafio agora? Depois disso a categoria e a duração ficam travadas.')) return
    setStarting(true)
    setError(null)
    try {
      const updated = await startCompetition(authorizedFetch, comp.id)
      setComp(updated)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar')
    } finally {
      setStarting(false)
    }
  }

  // Link-only invite generation (extra link for sharing).
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
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
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

      {/* Mobile tab navigation — only shown once the competition has
          started, so the lobby flow stays as a single scrolling page. */}
      {(comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && (
        <MobileTabBar value={mobileTab} onChange={setMobileTab} />
      )}

      {(comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && user?.id && (
        <div className={mobileTab !== 'geral' ? 'hidden lg:block' : ''}>
          <PersonalStatusCard
            competition={comp}
            standings={standings}
            feed={feed}
            currentUserId={user.id}
            onTrain={() => navigate('/train')}
          />
        </div>
      )}

      {comp.status === 'LOBBY' && (
        <LobbyCountdown
          startDeadline={comp.startDeadline}
          isAdmin={isAdmin}
          starting={starting}
          enoughMembers={comp.members.filter((m) => !m.abandonedAt).length >= 2}
          onStart={() => void handleStart()}
        />
      )}

      {comp.status === 'ACTIVE' && comp.endsAt && (
        <div className={mobileTab !== 'geral' ? 'hidden lg:block' : ''}>
          <ActiveCountdown endsAt={comp.endsAt} />
        </div>
      )}

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

      <section
        className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5 ${
          (comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && mobileTab !== 'geral'
            ? 'hidden lg:block'
            : ''
        }`}
      >
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

      {(comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && standings && (
        <div className={mobileTab !== 'ranking' ? 'hidden lg:block' : ''}>
          <Leaderboard
            standings={standings}
            winnerUserId={comp.winnerUserId}
            rankDeltas={rankDeltas}
            currentUserId={user?.id}
            competitionName={comp.name}
            inviteUrl={inviteUrl}
          />
        </div>
      )}

      {(comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && (
        <div className={`space-y-3 ${mobileTab !== 'provas' ? 'hidden lg:block lg:space-y-3' : ''}`}>
          {comp.status === 'ACTIVE' && (
            <DailySummaryCard
              feed={feed}
              totalMembers={comp.members.filter((m) => !m.abandonedAt).length}
              type={comp.type}
            />
          )}
          <CompetitionFeed
            items={feed}
            onZoom={(item) => setPhotoZoom(item)}
            onReact={(entryId, kind) => void handleReact(entryId, kind)}
          />
        </div>
      )}

      <div className={mobileTab !== 'geral' && (comp.status === 'ACTIVE' || comp.status === 'COMPLETED') ? 'hidden lg:block' : ''}>
        <RulesCollapsible type={comp.type} />
      </div>

      {(comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && myMembership && !myMembership.abandonedAt && (
        <div className={mobileTab !== 'chat' ? 'hidden lg:block' : ''}>
          <CompetitionChat competitionId={comp.id} isAdmin={isAdmin} />
        </div>
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

      {photoZoom && (() => {
        const durationMin = photoZoom.workout?.durationSec ? Math.round(photoZoom.workout.durationSec / 60) : null
        const cardioMin = photoZoom.workout?.cardioSec ? Math.round(photoZoom.workout.cardioSec / 60) : null
        const displayName = photoZoom.user.name ?? `@${photoZoom.user.handle}`
        return (
          <div
            className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
            onClick={() => setPhotoZoom(null)}
            role="dialog"
            aria-modal="true"
          >
            <img
              src={photoZoom.photoUrl}
              alt={`Prova de ${displayName}`}
              className="max-h-[70vh] max-w-full rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div
              className="max-w-md rounded-2xl border border-white/15 bg-black/55 px-4 py-3 text-center text-white backdrop-blur-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <Link
                to={`/u/${photoZoom.user.id}`}
                className="text-sm font-bold hover:underline"
              >
                {displayName}
              </Link>
              <p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[10.5px] text-white/70">
                {photoZoom.kind === 'TRAINING' ? <Dumbbell size={10} /> : <Activity size={10} />}
                {photoZoom.kind === 'TRAINING' ? 'Treino' : 'Cardio'} · {new Date(photoZoom.day).toLocaleDateString('pt-BR')} · {relativeTime(photoZoom.createdAt)}
              </p>
              {photoZoom.workout && (
                <div className="mt-2 space-y-0.5 font-mono text-[11px] text-white/80">
                  {photoZoom.workout.planName && (
                    <p className="font-semibold text-white">{photoZoom.workout.planName}</p>
                  )}
                  <p>
                    {durationMin != null && <>⏱ {durationMin}min</>}
                    {photoZoom.workout.exerciseCount > 0 && (
                      <>{durationMin != null ? ' · ' : ''}💪 {photoZoom.workout.exerciseCount} exercícios</>
                    )}
                    {photoZoom.workout.totalVolumeKg > 0 && (
                      <> · {photoZoom.workout.totalVolumeKg.toLocaleString('pt-BR')} kg</>
                    )}
                    {cardioMin != null && cardioMin > 0 && (
                      <> · 🏃 {cardioMin}min</>
                    )}
                  </p>
                </div>
              )}
              <div className="mt-3 flex justify-center">
                <ReactionsBar
                  reactions={photoZoom.reactions}
                  onReact={(kind) => {
                    void handleReact(photoZoom.id, kind)
                    setPhotoZoom((curr) => {
                      if (!curr) return null
                      const existing = curr.reactions.find((r) => r.kind === kind)
                      if (existing) {
                        if (existing.mine) {
                          const nextCount = existing.count - 1
                          const filtered = nextCount > 0
                            ? curr.reactions.map((r) => (r.kind === kind ? { ...r, count: nextCount, mine: false } : r))
                            : curr.reactions.filter((r) => r.kind !== kind)
                          return { ...curr, reactions: filtered }
                        }
                        return {
                          ...curr,
                          reactions: curr.reactions.map((r) => r.kind === kind ? { ...r, count: r.count + 1, mine: true } : r),
                        }
                      }
                      return { ...curr, reactions: [...curr.reactions, { kind, count: 1, mine: true }] }
                    })
                  }}
                  compact
                />
              </div>
              <CommentThread
                competitionId={competitionId}
                entryId={photoZoom.id}
                currentUserId={user?.id}
                canModerate={isAdmin}
                onChange={(delta) => adjustCommentsCount(photoZoom.id, delta)}
              />
              {isAdmin && comp.status === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={() => void handleDeleteEntry(photoZoom)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 px-3 py-1 text-[11px] font-semibold text-rose-400 hover:bg-rose-500/15"
                >
                  <Trash2 size={11} />
                  Remover prova (admin)
                </button>
              )}
            </div>
          </div>
        )
      })()}

      <div
        className={`flex justify-end pt-2 ${
          (comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && mobileTab !== 'geral'
            ? 'hidden lg:flex'
            : ''
        }`}
      >
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
