import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
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
  competitionKeys,
  useCompetition,
  useCompetitionFeed,
  useDeleteEntry,
  useDemoteMember,
  useInviteMember,
  useKickMember,
  useLeaveCompetition,
  usePromoteMember,
  useStandings,
  useStartCompetition,
  useToggleReaction,
} from '../hooks/useCompetition'
import { useCompetitionRealtime } from '../hooks/useCompetitionRealtime'
import type {
  CompetitionFeedItem,
  CompetitionReactionKind,
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
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Server state — all data fetching goes through TanStack Query.
  const compQuery = useCompetition(competitionId)
  const comp = compQuery.data ?? null
  const isActive = comp?.status === 'ACTIVE'

  // Realtime subscription: when Supabase Realtime is configured, the
  // hook invalidates the relevant caches as soon as something changes
  // in Postgres. We dial polling back when realtime is enabled — there's
  // no point in 12s polling if we already get pushes — but we don't
  // disable polling entirely so that a temporary websocket drop still
  // recovers within ~60s.
  const { enabled: realtimeEnabled } = useCompetitionRealtime(
    isActive ? competitionId : undefined,
  )
  const shouldPoll = isActive && !realtimeEnabled

  // Standings + feed only matter once the room has started. Polling is
  // declarative — TanStack Query handles the interval, focus pause, etc.
  const standingsQuery = useStandings(
    isActive || comp?.status === 'COMPLETED' ? competitionId : undefined,
    { polling: shouldPoll },
  )
  const feedQuery = useCompetitionFeed(
    isActive || comp?.status === 'COMPLETED' ? competitionId : undefined,
    { polling: shouldPoll },
  )
  const standings = standingsQuery.data ?? null
  // Infinite feed: flatten all loaded pages into one list. The reference
  // is stabilized by useMemo so memos downstream (rankDeltas, liveZoom)
  // don't churn when the feed is unchanged.
  const feed = useMemo(
    () => feedQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [feedQuery.data],
  )
  const hasNextFeedPage = feedQuery.hasNextPage
  const isFetchingNextFeedPage = feedQuery.isFetchingNextPage

  // Mutations — created at hook level so they bind to the current
  // competitionId without us threading callbacks everywhere.
  const inviteMut = useInviteMember(competitionId)
  const startMut = useStartCompetition(competitionId)
  const leaveMut = useLeaveCompetition(competitionId)
  const promoteMut = usePromoteMember(competitionId)
  const demoteMut = useDemoteMember(competitionId)
  const kickMut = useKickMember(competitionId)
  const reactionMut = useToggleReaction(competitionId)
  const deleteEntryMut = useDeleteEntry(competitionId)

  // Local UI state.
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [photoZoom, setPhotoZoom] = useState<CompetitionFeedItem | null>(null)
  const [showFriendPicker, setShowFriendPicker] = useState(false)
  const [memberMenuFor, setMemberMenuFor] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<CompetitionTab>('geral')

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
    // Persist the new snapshot for next visit. Doing it in the same memo
    // avoids needing a useEffect.
    const snapshot: Record<string, number> = {}
    standings.rows.forEach((row, idx) => {
      snapshot[row.userId] = idx + 1
    })
    try {
      window.localStorage.setItem(`acad:comp-rank-snapshot:${competitionId}`, JSON.stringify(snapshot))
    } catch {
      // quota / private mode — non-blocking
    }
    return map
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
      await leaveMut.mutateAsync()
      navigate('/desafios')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao sair')
    }
  }

  const handlePromote = async (memberId: string) => {
    setError(null)
    try {
      await promoteMut.mutateAsync(memberId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao promover')
    } finally {
      setMemberMenuFor(null)
    }
  }

  const handleDemote = async (memberId: string) => {
    setError(null)
    try {
      await demoteMut.mutateAsync(memberId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao rebaixar')
    } finally {
      setMemberMenuFor(null)
    }
  }

  const handleKick = async (memberId: string, displayName: string) => {
    if (!window.confirm(`Remover ${displayName} do desafio?`)) {
      setMemberMenuFor(null)
      return
    }
    setError(null)
    try {
      await kickMut.mutateAsync(memberId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover membro')
    } finally {
      setMemberMenuFor(null)
    }
  }

  // Optimistic toggle: patch the feed cache directly so the UI feels
  // instant. The mutation hits the API; the next poll reconciles any drift.
  // The feed is an infinite query so we walk pages instead of a flat list.
  type FeedPage = { items: CompetitionFeedItem[]; nextCursor: string | null }
  type FeedCache = { pages: FeedPage[]; pageParams: unknown[] }

  const handleReact = async (entryId: string, kind: CompetitionReactionKind) => {
    qc.setQueryData<FeedCache>(competitionKeys.feed(competitionId), (data) => {
      if (!data) return data
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => {
            if (item.id !== entryId) return item
            const existing = item.reactions.find((r) => r.kind === kind)
            if (existing) {
              if (existing.mine) {
                const nextCount = existing.count - 1
                const filtered = nextCount > 0
                  ? item.reactions.map((r) => r.kind === kind ? { ...r, count: nextCount, mine: false } : r)
                  : item.reactions.filter((r) => r.kind !== kind)
                return { ...item, reactions: filtered }
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
        })),
      }
    })
    try {
      await reactionMut.mutateAsync({ entryId, kind })
    } catch (err) {
      void qc.invalidateQueries({ queryKey: competitionKeys.feed(competitionId) })
      setError(err instanceof Error ? err.message : 'Falha ao reagir')
    }
  }

  const handleDeleteEntry = async (entry: CompetitionFeedItem) => {
    const name = entry.user.name ?? `@${entry.user.handle}`
    if (!window.confirm(`Apagar a prova de ${name}? Essa ação não pode ser desfeita.`)) return
    // Optimistic remove from cache so the user sees instant feedback.
    qc.setQueryData<FeedCache>(competitionKeys.feed(competitionId), (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({ ...p, items: p.items.filter((it) => it.id !== entry.id) })),
          }
        : data,
    )
    setPhotoZoom(null)
    try {
      await deleteEntryMut.mutateAsync(entry.id)
      // Mutation already invalidates feed + standings on success.
    } catch (err) {
      // Roll back by refetching.
      void qc.invalidateQueries({ queryKey: competitionKeys.feed(competitionId) })
      setError(err instanceof Error ? err.message : 'Falha ao remover prova')
    }
  }

  const handleStart = async () => {
    if (!comp) return
    if (!window.confirm('Iniciar o desafio agora? Depois disso a categoria e a duração ficam travadas.')) return
    setError(null)
    try {
      await startMut.mutateAsync()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao iniciar')
    }
  }

  // Link-only invite generation (extra link for sharing).
  const handleNewLink = async () => {
    if (!comp) return
    try {
      const invite = await inviteMut.mutateAsync({})
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

  // Sync photoZoom with the latest feed data — if a poll updates reactions
  // or comment counts, the open modal should reflect that without us
  // copying everything around manually.
  const liveZoom = useMemo(() => {
    if (!photoZoom) return null
    return feed.find((it) => it.id === photoZoom.id) ?? photoZoom
  }, [feed, photoZoom])

  if (compQuery.isLoading) {
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

  if (compQuery.error || !comp) {
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
          {compQuery.error instanceof Error ? compQuery.error.message : 'Competição não encontrada'}
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

      {/* Inline error banner for mutation failures — query errors render
          above via the fallback state. */}
      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

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
          starting={startMut.isPending}
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
              busy={promoteMut.isPending || demoteMut.isPending || kickMut.isPending}
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
          {hasNextFeedPage && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void feedQuery.fetchNextPage()}
                disabled={isFetchingNextFeedPage}
                className="rounded-full border border-[var(--line)] px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-50"
              >
                {isFetchingNextFeedPage ? 'Carregando…' : 'Carregar provas mais antigas'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className={mobileTab !== 'geral' && (comp.status === 'ACTIVE' || comp.status === 'COMPLETED') ? 'hidden lg:block' : ''}>
        <RulesCollapsible type={comp.type} />
      </div>

      {(comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && myMembership && !myMembership.abandonedAt && (
        <div className={mobileTab !== 'chat' ? 'hidden lg:block' : ''}>
          <CompetitionChat
            competitionId={comp.id}
            isAdmin={isAdmin}
            pollingFallback={shouldPoll}
          />
        </div>
      )}

      {showFriendPicker && (
        <FriendPickerModal
          competitionId={comp.id}
          onClose={() => setShowFriendPicker(false)}
          onInvited={() => setShowFriendPicker(false)}
        />
      )}

      {liveZoom && (() => {
        const z = liveZoom
        const durationMin = z.workout?.durationSec ? Math.round(z.workout.durationSec / 60) : null
        const cardioMin = z.workout?.cardioSec ? Math.round(z.workout.cardioSec / 60) : null
        const displayName = z.user.name ?? `@${z.user.handle}`
        return (
          <div
            className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
            onClick={() => setPhotoZoom(null)}
            role="dialog"
            aria-modal="true"
          >
            <img
              src={z.photoUrl}
              alt={`Prova de ${displayName}`}
              className="max-h-[70vh] max-w-full rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div
              className="max-w-md rounded-2xl border border-white/15 bg-black/55 px-4 py-3 text-center text-white backdrop-blur-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <Link
                to={`/u/${z.user.id}`}
                className="text-sm font-bold hover:underline"
              >
                {displayName}
              </Link>
              <p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[10.5px] text-white/70">
                {z.kind === 'TRAINING' ? <Dumbbell size={10} /> : <Activity size={10} />}
                {z.kind === 'TRAINING' ? 'Treino' : 'Cardio'} · {new Date(z.day).toLocaleDateString('pt-BR')} · {relativeTime(z.createdAt)}
              </p>
              {z.workout && (
                <div className="mt-2 space-y-0.5 font-mono text-[11px] text-white/80">
                  {z.workout.planName && (
                    <p className="font-semibold text-white">{z.workout.planName}</p>
                  )}
                  <p>
                    {durationMin != null && <>⏱ {durationMin}min</>}
                    {z.workout.exerciseCount > 0 && (
                      <>{durationMin != null ? ' · ' : ''}💪 {z.workout.exerciseCount} exercícios</>
                    )}
                    {z.workout.totalVolumeKg > 0 && (
                      <> · {z.workout.totalVolumeKg.toLocaleString('pt-BR')} kg</>
                    )}
                    {cardioMin != null && cardioMin > 0 && (
                      <> · 🏃 {cardioMin}min</>
                    )}
                  </p>
                </div>
              )}
              <div className="mt-3 flex justify-center">
                <ReactionsBar
                  reactions={z.reactions}
                  onReact={(kind) => void handleReact(z.id, kind)}
                  compact
                />
              </div>
              <CommentThread
                competitionId={competitionId}
                entryId={z.id}
                currentUserId={user?.id}
                canModerate={isAdmin}
              />
              {isAdmin && comp.status === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={() => void handleDeleteEntry(z)}
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
