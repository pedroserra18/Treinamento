import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, AlertCircle, ArrowLeft, CheckCircle2, Copy, Crown, Dumbbell, Flame, Image as ImageIcon, Link2, LogOut, MessageCircle, MoreVertical, Play, Send, Trash2, Trophy, UserMinus, UserPlus, Users, X as XIcon } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  deleteCompetitionEntry,
  deleteEntryComment,
  demoteMember,
  getCompetition,
  getCompetitionFeed,
  getStandings,
  inviteMember,
  kickMember,
  leaveCompetition,
  listEntryComments,
  listInvitableFriends,
  postEntryComment,
  promoteMember,
  startCompetition,
  toggleReaction,
} from '../services/competitionService'
import type {
  Competition,
  CompetitionEntryComment,
  CompetitionFeedItem,
  CompetitionMember as Member,
  CompetitionReactionKind,
  CompetitionReactionSummary,
  CompetitionStandings,
  CompetitionType,
  CompetitionUserSummary,
} from '../types/competition'
import { Skeleton } from '../components/common/Skeleton'
import { CompetitionChat } from '../components/common/CompetitionChat'

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
  // Mobile-only tab navigation. Desktop ignores this state and renders
  // every section at once. Default to "geral" so the user always lands
  // on the status card.
  type MobileTab = 'geral' | 'ranking' | 'provas' | 'chat'
  const [mobileTab, setMobileTab] = useState<MobileTab>('geral')

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
  // completed or cancelled — no more entries can be posted there.
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
  // load. Compare current rank to previous rank per user. New users (no
  // prior position) get null = "no arrow shown". On change we rewrite the
  // snapshot so the delta resets the next time the user opens the page.
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

  // Persist the current standings as the snapshot for next load. Done in
  // an effect after we computed the deltas so we don't overwrite the
  // baseline before showing the user the delta.
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

  // Optimistically toggle the reaction so the UI feels instant. The
  // backend returns whether it was added or removed, but our optimistic
  // patch already matches that — the polling refresh will reconcile if
  // there's any drift.
  const handleReact = async (entryId: string, kind: CompetitionReactionKind) => {
    setFeed((curr) =>
      curr.map((item) => {
        if (item.id !== entryId) return item
        const existing = item.reactions.find((r) => r.kind === kind)
        if (existing) {
          if (existing.mine) {
            // Toggle off: decrement and unmark
            const nextCount = existing.count - 1
            const filteredReactions = nextCount > 0
              ? item.reactions.map((r) => (r.kind === kind ? { ...r, count: nextCount, mine: false } : r))
              : item.reactions.filter((r) => r.kind !== kind)
            return { ...item, reactions: filteredReactions }
          }
          // Toggle on: increment and mark mine
          return {
            ...item,
            reactions: item.reactions.map((r) =>
              r.kind === kind ? { ...r, count: r.count + 1, mine: true } : r,
            ),
          }
        }
        // First reaction of this kind on this entry
        return { ...item, reactions: [...item.reactions, { kind, count: 1, mine: true }] }
      }),
    )
    try {
      await toggleReaction(authorizedFetch, competitionId, entryId, kind)
    } catch (err) {
      // Roll back optimistic update on failure by refetching
      void refreshDynamic(comp?.status ?? 'ACTIVE')
      setError(err instanceof Error ? err.message : 'Falha ao reagir')
    }
  }

  // Admin-only proof removal. Used from the photo zoom modal so the admin
  // can moderate without leaving the entry view. We optimistically remove
  // from feed and refresh standings (deleted entries change the score).
  const handleDeleteEntry = async (entry: CompetitionFeedItem) => {
    if (!comp) return
    const name = entry.user.name ?? `@${entry.user.handle}`
    if (!window.confirm(`Apagar a prova de ${name}? Essa ação não pode ser desfeita.`)) return
    setFeed((curr) => curr.filter((it) => it.id !== entry.id))
    setPhotoZoom(null)
    try {
      await deleteCompetitionEntry(authorizedFetch, comp.id, entry.id)
      // Standings change when an entry is removed — refetch the dynamic bits.
      void refreshDynamic(comp.status)
    } catch (err) {
      // Roll back the optimistic removal by reloading.
      void load()
      setError(err instanceof Error ? err.message : 'Falha ao remover prova')
    }
  }

  // Patch commentsCount on both the feed list and the open zoom modal when
  // the thread component reports an add/delete. Keeps the grid badge in
  // sync without re-fetching the whole feed for one comment.
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
        <MobileTabBar
          value={mobileTab}
          onChange={setMobileTab}
          hasFeed={feed.length > 0}
        />
      )}

      {/* Personal status — answers "where am I and what do I do today?"
          at a glance. Only meaningful once the competition has started. */}
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

      {/* Countdown / start CTA — lobby only. Always visible since lobby
          state has no tabs (everything fits in one short page). */}
      {comp.status === 'LOBBY' && (
        <LobbyCountdown
          startDeadline={comp.startDeadline}
          isAdmin={isAdmin}
          starting={starting}
          enoughMembers={comp.members.filter((m) => !m.abandonedAt).length >= 2}
          onStart={() => void handleStart()}
        />
      )}

      {/* Active countdown — until the room ends. Part of "Geral" on mobile. */}
      {comp.status === 'ACTIVE' && comp.endsAt && (
        <div className={mobileTab !== 'geral' ? 'hidden lg:block' : ''}>
          <ActiveCountdown endsAt={comp.endsAt} />
        </div>
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

      {/* Members — part of "Geral" tab on mobile */}
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

      {/* Leaderboard — "Ranking" tab on mobile */}
      {(comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && standings && (
        <div className={mobileTab !== 'ranking' ? 'hidden lg:block' : ''}>
          <Leaderboard standings={standings} winnerUserId={comp.winnerUserId} rankDeltas={rankDeltas} />
        </div>
      )}

      {/* Daily summary + Feed — "Provas" tab on mobile */}
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

      {/* Rules — always available, on "Geral" tab in mobile */}
      <div className={mobileTab !== 'geral' && (comp.status === 'ACTIVE' || comp.status === 'COMPLETED') ? 'hidden lg:block' : ''}>
        <RulesCollapsible type={comp.type} />
      </div>

      {/* Chat — "Chat" tab on mobile, always visible on desktop */}
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
              <p className="text-sm font-bold">{displayName}</p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[10.5px] text-white/70">
                {photoZoom.kind === 'TRAINING' ? <Dumbbell size={10} /> : <Activity size={10} />}
                {photoZoom.kind === 'TRAINING' ? 'Treino' : 'Cardio'} · {new Date(photoZoom.day).toLocaleDateString('pt-BR')}
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
              {/* Reactions inside the modal — same bar as the grid tile but
                  centered. Reading from photoZoom keeps the source of truth
                  on the feed state managed by the parent. */}
              <div className="mt-3 flex justify-center">
                <ReactionsBar
                  reactions={photoZoom.reactions}
                  onReact={(kind) => {
                    void handleReact(photoZoom.id, kind)
                    // Sync the zoom view's local copy so the click feels live.
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

      {/* Leave — part of "Geral" tab on mobile */}
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

// ─── Subcomponents ────────────────────────────────────────────────────────

function MobileTabBar({
  value, onChange, hasFeed,
}: {
  value: 'geral' | 'ranking' | 'provas' | 'chat'
  onChange: (next: 'geral' | 'ranking' | 'provas' | 'chat') => void
  hasFeed: boolean
}) {
  const tabs: Array<{ key: typeof value; label: string }> = [
    { key: 'geral', label: 'Geral' },
    { key: 'ranking', label: 'Ranking' },
    { key: 'provas', label: hasFeed ? 'Provas' : 'Provas' },
    { key: 'chat', label: 'Chat' },
  ]
  return (
    <nav
      role="tablist"
      aria-label="Seções do desafio"
      className="sticky top-2 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 p-1 backdrop-blur-md lg:hidden"
    >
      {tabs.map((t) => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              active
                ? 'bg-[var(--brand)] text-white shadow-[0_4px_10px_-4px_rgba(255,90,60,0.55)]'
                : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}

function ordinalBr(position: number): string {
  // Simple ordinal — 1º, 2º, 3º, etc. Portuguese masculine since "lugar" is masc.
  return `${position}º`
}

function PersonalStatusCard({
  competition, standings, feed, currentUserId, onTrain,
}: {
  competition: Competition
  standings: CompetitionStandings | null
  feed: CompetitionFeedItem[]
  currentUserId: string
  onTrain: () => void
}) {
  // What the user has logged TODAY. Date comparison happens at UTC midnight
  // boundary, same as the backend's `day` column.
  const todayKey = new Date().toISOString().slice(0, 10)
  const todayEntries = feed.filter(
    (e) => e.user.id === currentUserId && new Date(e.day).toISOString().slice(0, 10) === todayKey,
  )
  const postedTraining = todayEntries.some((e) => e.kind === 'TRAINING')
  const postedCardio = todayEntries.some((e) => e.kind === 'CARDIO')

  // What this competition's type considers "today complete".
  const needsTraining = (competition.type === 'TRAINING' || competition.type === 'BOTH') && !postedTraining
  const needsCardio = (competition.type === 'CARDIO' || competition.type === 'BOTH') && !postedCardio
  const todayDone = !needsTraining && !needsCardio

  const myIndex = standings?.rows.findIndex((r) => r.userId === currentUserId) ?? -1
  const myRow = myIndex >= 0 ? standings?.rows[myIndex] ?? null : null
  const rank = myIndex >= 0 ? myIndex + 1 : null
  const total = standings?.rows.length ?? 0
  const leader = standings?.rows[0]
  const gapToLeader = leader && myRow && leader.userId !== myRow.userId ? leader.daysActive - myRow.daysActive : 0

  // Days left in the competition window for "X dias restantes".
  const daysLeft = competition.endsAt
    ? Math.max(0, Math.ceil((new Date(competition.endsAt).getTime() - nowMs()) / 86_400_000))
    : null
  const isCompleted = competition.status === 'COMPLETED'

  // Headline + accent colour shift based on state. Today done → green,
  // pending → amber, completed → brand-coloured trophy.
  const accent = isCompleted
    ? { border: 'border-amber-500/50', bg: 'from-amber-500/10 to-[var(--surface)]', tint: 'text-amber-600 dark:text-amber-400' }
    : todayDone
      ? { border: 'border-emerald-500/50', bg: 'from-emerald-500/10 to-[var(--surface)]', tint: 'text-emerald-600 dark:text-emerald-400' }
      : { border: 'border-rose-500/40', bg: 'from-rose-500/5 to-[var(--surface)]', tint: 'text-rose-600 dark:text-rose-400' }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl border ${accent.border} bg-gradient-to-br ${accent.bg} p-4 sm:p-5`}
    >
      {isCompleted ? (
        <div>
          <p className={`font-mono text-[11px] font-bold uppercase tracking-[0.18em] ${accent.tint}`}>
            Resultado final
          </p>
          <p className="mt-1 text-base font-extrabold text-[var(--text)] sm:text-lg">
            {rank === 1
              ? '🏆 Você venceu o desafio!'
              : rank
                ? `Você terminou em ${ordinalBr(rank)} lugar de ${total}.`
                : 'O desafio terminou.'}
          </p>
          {myRow && (
            <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
              {myRow.daysActive} {myRow.daysActive === 1 ? 'dia' : 'dias'} ·{' '}
              <b className="text-[var(--brand-strong)]">{myRow.points} pts</b> ·{' '}
              {formatDurationCompact(myRow.totalDurationSec)}
              {myRow.volumeKg > 0 && <> · {myRow.volumeKg.toLocaleString('pt-BR')} kg</>}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={`flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] ${accent.tint}`}>
              {todayDone ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {todayDone ? 'Você fechou o dia de hoje' : 'Falta postar hoje'}
            </p>
            <p className="mt-1 text-base font-extrabold text-[var(--text)] sm:text-lg">
              {rank ? `Você está em ${ordinalBr(rank)} lugar` : 'Você ainda não pontuou'}
              {total > 0 && <span className="ml-1 text-[var(--muted)]">de {total}</span>}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-[var(--muted)]">
              {myRow && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Flame size={10} />
                    {myRow.daysActive} {myRow.daysActive === 1 ? 'dia' : 'dias'}
                  </span>
                  <span className="opacity-50">·</span>
                  <span className="font-bold text-[var(--brand-strong)]">
                    {myRow.points} pts
                  </span>
                  {myRow.streak > 0 && (
                    <>
                      <span className="opacity-50">·</span>
                      <span className="inline-flex items-center gap-0.5 font-bold text-orange-600 dark:text-orange-400">
                        <span aria-hidden className="flame-alive text-[12px] leading-none">🔥{'\u{FE0F}'}</span>
                        {myRow.streak} {myRow.streak === 1 ? 'seguido' : 'seguidos'}
                      </span>
                    </>
                  )}
                  <span className="opacity-50">·</span>
                </>
              )}
              {daysLeft != null && (
                <>
                  <span>{daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'}</span>
                  <span className="opacity-50">·</span>
                </>
              )}
              {gapToLeader > 0
                ? <span>{gapToLeader} {gapToLeader === 1 ? 'dia atrás' : 'dias atrás'} do líder</span>
                : myRow && rank === 1
                  ? <span>Liderando o desafio</span>
                  : null}
            </p>
            {!todayDone && (
              <p className="mt-2 text-[11.5px] text-[var(--muted)]">
                {needsTraining && needsCardio
                  ? 'Falta postar treino e cardio hoje.'
                  : needsTraining
                    ? 'Falta postar um treino hoje.'
                    : 'Falta postar um cardio hoje.'}
              </p>
            )}
          </div>
          {!todayDone && (
            <button
              type="button"
              onClick={onTrain}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
            >
              <Dumbbell size={13} />
              Treinar agora
            </button>
          )}
        </div>
      )}
    </motion.section>
  )
}

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

// Streak badge — reuses the home page's flame styles so the streak icon
// looks the same everywhere in the app. Active streak = animated warm
// flame; broken streak = icy cyan version. Hidden when streak is 0 AND
// the user already lost it (we don't show a broken streak for users who
// never had one in the first place — too noisy).
function CompetitionStreak({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/10 px-1.5 py-0.5 font-mono text-[10.5px] font-extrabold tabular-nums text-orange-600 dark:text-orange-400"
      title={`${count} ${count === 1 ? 'dia' : 'dias'} seguidos`}
    >
      <span aria-hidden className="flame-alive text-[13px] leading-none">🔥{'\u{FE0F}'}</span>
      {count}
    </span>
  )
}

// Formats seconds as compact "1h 23min" / "23min" / "45s". Used for the
// training-time tiebreaker shown on the leaderboard / status card.
function formatDurationCompact(sec: number): string {
  if (!sec || sec <= 0) return '—'
  if (sec < 60) return `${Math.round(sec)}s`
  const totalMin = Math.round(sec / 60)
  if (totalMin < 60) return `${totalMin}min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h${m}min` : `${h}h`
}

// Rank-change diff component: shows ↑N / ↓N / = based on the user's
// previous position. The snapshot is stored in localStorage scoped by
// competition id so each user sees their personal "since last visit"
// delta. Skips rendering entirely on first ever load (no snapshot yet).
function RankDelta({ delta }: { delta: number | null }) {
  if (delta == null) return null
  if (delta === 0) {
    return (
      <span className="font-mono text-[10px] text-[var(--muted)]" title="Mesma posição">
        =
      </span>
    )
  }
  const up = delta > 0
  return (
    <span
      className={`font-mono text-[10px] font-bold ${up ? 'text-emerald-500' : 'text-rose-500'}`}
      title={up ? `Subiu ${delta} ${delta === 1 ? 'posição' : 'posições'}` : `Caiu ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'posição' : 'posições'}`}
    >
      {up ? `↑${delta}` : `↓${Math.abs(delta)}`}
    </span>
  )
}

function Leaderboard({
  standings, winnerUserId, rankDeltas,
}: {
  standings: CompetitionStandings
  winnerUserId: string | null
  rankDeltas: Map<string, number>
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
          <Trophy size={14} className="text-[var(--brand)]" />
          Ranking
        </h2>
        <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
          desempate: dias › pontos › tempo › volume
        </p>
      </div>
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
                <div className="flex items-center gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">
                    {row.user.name ?? `@${row.user.handle}`}
                    {isWinner && <span className="ml-1.5 text-xs">🏆</span>}
                  </p>
                  <RankDelta delta={rankDeltas.get(row.userId) ?? null} />
                  <CompetitionStreak count={row.streak} />
                </div>
                <p className="mt-0.5 font-mono text-[10.5px] text-[var(--muted)]">
                  ⏱ {formatDurationCompact(row.totalDurationSec)}
                  {row.volumeKg > 0 && (
                    <> · 🏋 {row.volumeKg.toLocaleString('pt-BR')} kg</>
                  )}
                </p>
              </div>
              {/* Primary: days. Secondary: points pill below. Same column so
                  the eye scans rank → metric → name → tail in one sweep. */}
              <div className="shrink-0 text-right">
                <div className="flex items-baseline justify-end gap-2">
                  <span className="font-mono text-lg font-extrabold tabular-nums text-[var(--text)]">
                    {row.daysActive}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--muted)]">dias</span>
                </div>
                <div className="mt-0.5 inline-flex items-baseline gap-1 rounded-full bg-[var(--brand)]/10 px-1.5 py-0.5">
                  <span className="font-mono text-[11px] font-extrabold tabular-nums text-[var(--brand-strong)]">
                    {row.points}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--brand-strong)]">
                    pts
                  </span>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

const REACTION_KINDS: Array<{ key: CompetitionReactionKind; emoji: string; label: string }> = [
  { key: 'CLAP', emoji: '👏', label: 'Aplaudir' },
  { key: 'FIRE', emoji: '🔥', label: 'Brabo' },
  { key: 'STRONG', emoji: '💪', label: 'Forte' },
  { key: 'PRAY', emoji: '🙏', label: 'Respeito' },
]

// Aggregated reactions bar rendered under the proof in the zoom modal.
// Inline mini-bar on grid tiles uses a more compact variant.
function ReactionsBar({
  reactions, onReact, compact,
}: {
  reactions: CompetitionReactionSummary[]
  onReact: (kind: CompetitionReactionKind) => void
  compact?: boolean
}) {
  // Index existing reactions by kind for fast lookup so each button can
  // show its own count + mine state.
  const byKind = new Map(reactions.map((r) => [r.kind, r]))
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? '' : 'mt-2'}`}>
      {REACTION_KINDS.map(({ key, emoji, label }) => {
        const summary = byKind.get(key)
        const count = summary?.count ?? 0
        const mine = summary?.mine ?? false
        return (
          <button
            key={key}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReact(key)
            }}
            aria-label={`${label} (${count})`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
              mine
                ? 'border-[var(--brand)] bg-[var(--brand)]/15 text-[var(--brand-strong)]'
                : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)] hover:bg-[var(--surface)]'
            }`}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 && <span className="font-mono tabular-nums">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

// Tiny "pulse of the day" card on top of the feed. Computed from the
// feed list — for a 10-person room with at most 2 proofs/day, the feed
// page (cap 30) trivially contains every "today" entry, so we don't
// need a separate endpoint.
function DailySummaryCard({
  feed, totalMembers, type,
}: {
  feed: CompetitionFeedItem[]
  totalMembers: number
  type: CompetitionType
}) {
  const todayKey = new Date().toISOString().slice(0, 10)
  const todays = feed.filter((e) => new Date(e.day).toISOString().slice(0, 10) === todayKey)
  const usersToday = new Set(todays.map((e) => e.user.id))
  // Max possible proofs per day in this room (BOTH = 2 per member, otherwise 1)
  const maxPerMember = type === 'BOTH' ? 2 : 1
  const maxTotal = totalMembers * maxPerMember
  const pct = maxTotal === 0 ? 0 : Math.round((todays.length / maxTotal) * 100)
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
          <CheckCircle2 size={14} className="text-[var(--brand)]" />
          Hoje
        </h2>
        <span className="font-mono text-[11px] text-[var(--muted)]">
          {todays.length}/{maxTotal} provas · {usersToday.size}/{totalMembers} membros
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
        <div
          className="h-full rounded-full bg-[var(--brand)] transition-all"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--muted)]">
        {pct >= 100
          ? 'Sala fechada hoje: todo mundo postou! 🔥'
          : `${pct}% das provas do dia já foram registradas.`}
      </p>
    </section>
  )
}

// Collapsible "Como funciona" — keeps the page short by default but
// surfaces the scoring rules when a user wants to understand the
// tiebreakers (we saw confused questions like "porque ele tá em primeiro
// se temos os mesmos dias?" — this answers it once instead of every time).
function RulesCollapsible({ type }: { type: CompetitionType }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
          <AlertCircle size={14} className="text-[var(--brand)]" />
          Como funciona
        </span>
        <span className={`text-[var(--muted)] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-[var(--line)] p-4 text-[12px] text-[var(--muted)] sm:p-5">
          <p>
            <strong className="text-[var(--text)]">Provas:</strong>{' '}
            {type === 'BOTH'
              ? '1 treino + 1 cardio por dia (até 2 pontos/dia).'
              : type === 'TRAINING'
                ? '1 treino por dia (1 ponto/dia).'
                : '1 cardio por dia (1 ponto/dia).'}
          </p>
          <p>
            <strong className="text-[var(--text)]">Ranking:</strong> mais dias ativos vence. Em caso de empate: mais pontos &gt; mais tempo treinado &gt; mais peso movido.
          </p>
          <p>
            <strong className="text-[var(--text)]">Foto:</strong> obrigatória e fresca — a mesma imagem não pode reaparecer em outro dia (vale a mesma foto pra treino + cardio do mesmo treino).
          </p>
          <p>
            <strong className="text-[var(--text)]">Streak:</strong> dias consecutivos com pelo menos uma prova. Quebra se você pular um dia.
          </p>
        </div>
      )}
    </section>
  )
}

// Thread of comments below a proof. Loads on mount, posts inline, and lets
// authors / admins delete. Parent supplies `onChange` so it can keep the
// commentsCount on the grid tile in sync without a full feed refetch.
function CommentThread({
  competitionId, entryId, currentUserId, canModerate, onChange,
}: {
  competitionId: string
  entryId: string
  currentUserId: string | undefined
  canModerate: boolean
  onChange: (delta: number) => void
}) {
  const { authorizedFetch } = useAuth()
  const [comments, setComments] = useState<CompetitionEntryComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // We bump this when the entryId changes so an in-flight load for a
  // previous modal can't overwrite the comments of the current one.
  const reqIdRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const myReq = ++reqIdRef.current
    setLoading(true)
    setError(null)
    setComments([])
    listEntryComments(authorizedFetch, competitionId, entryId)
      .then((res) => {
        if (cancelled || reqIdRef.current !== myReq) return
        setComments(res.items)
      })
      .catch((err) => {
        if (cancelled || reqIdRef.current !== myReq) return
        setError(err instanceof Error ? err.message : 'Falha ao carregar comentários')
      })
      .finally(() => {
        if (cancelled || reqIdRef.current !== myReq) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authorizedFetch, competitionId, entryId])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    setError(null)
    try {
      const created = await postEntryComment(authorizedFetch, competitionId, entryId, content)
      setComments((prev) => [...prev, created])
      setDraft('')
      onChange(+1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao comentar')
    } finally {
      setSending(false)
    }
  }

  const remove = async (commentId: string) => {
    if (!window.confirm('Apagar esse comentário?')) return
    const previous = comments
    setComments((prev) => prev.filter((c) => c.id !== commentId))
    onChange(-1)
    try {
      await deleteEntryComment(authorizedFetch, competitionId, entryId, commentId)
    } catch (err) {
      setComments(previous)
      onChange(+1)
      setError(err instanceof Error ? err.message : 'Falha ao apagar comentário')
    }
  }

  return (
    <div className="mt-3 w-full text-left">
      <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/70">
        <MessageCircle size={12} />
        Comentários{comments.length > 0 ? ` · ${comments.length}` : ''}
      </p>
      <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto pr-1">
        {loading && <p className="text-[11px] text-white/60">Carregando…</p>}
        {!loading && comments.length === 0 && (
          <p className="text-[11px] text-white/60">Seja o primeiro a comentar.</p>
        )}
        {comments.map((c) => {
          const name = c.user.name ?? `@${c.user.handle}`
          const mine = c.userId === currentUserId
          const canDelete = mine || canModerate
          const time = new Date(c.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          return (
            <div key={c.id} className="flex gap-2 rounded-lg bg-white/5 p-2">
              {c.user.avatarUrl ? (
                <img src={c.user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
              ) : (
                <div className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-[10px] font-bold text-white">
                  {name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[11px] font-semibold text-white">{name}</p>
                  <span className="font-mono text-[9.5px] text-white/50">{time}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] text-white/90">{c.content}</p>
              </div>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  className="self-start text-white/40 hover:text-rose-400"
                  aria-label="Apagar comentário"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <form onSubmit={submit} className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva um comentário…"
          maxLength={500}
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white placeholder:text-white/40 focus:border-[var(--brand)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="grid h-7 w-7 place-items-center rounded-full bg-[var(--brand)] text-white disabled:opacity-40"
          aria-label="Enviar comentário"
        >
          <Send size={12} />
        </button>
      </form>
      {error && <p className="mt-1 text-[10.5px] text-rose-400">{error}</p>}
    </div>
  )
}

function CompetitionFeed({
  items, onZoom, onReact,
}: {
  items: CompetitionFeedItem[]
  onZoom: (item: CompetitionFeedItem) => void
  onReact: (entryId: string, kind: CompetitionReactionKind) => void
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <h2 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
        <ImageIcon size={14} className="text-[var(--brand)]" />
        Feed de provas
      </h2>
      {items.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-hover)] px-3 py-10 text-center">
          <ImageIcon size={32} className="mx-auto mb-2 text-[var(--muted)]" />
          <p className="text-sm font-semibold text-[var(--text)]">Sem provas ainda</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Quando alguém terminar um treino e mandar a foto, ela aparece aqui.
          </p>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2 lg:grid-cols-4">
          {items.map((item) => (
            <FeedGridTile
              key={item.id}
              item={item}
              onZoom={() => onZoom(item)}
              onReact={(kind) => onReact(item.id, kind)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function FeedGridTile({
  item, onZoom, onReact,
}: {
  item: CompetitionFeedItem
  onZoom: () => void
  onReact: (kind: CompetitionReactionKind) => void
}) {
  const displayName = item.user.name ?? `@${item.user.handle}`
  const dayShort = new Date(item.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const totalReactions = item.reactions.reduce((sum, r) => sum + r.count, 0)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onZoom}
        className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] transition-transform hover:-translate-y-0.5"
        aria-label={`Prova de ${displayName} em ${dayShort}`}
      >
        <img
          src={item.photoUrl}
          alt={`prova ${displayName}`}
          className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
        />
        {/* Top-left: kind badge */}
        <span
          className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[9.5px] font-bold text-white backdrop-blur-sm"
          aria-hidden
        >
          {item.kind === 'TRAINING' ? <Dumbbell size={9} /> : <Activity size={9} />}
          {item.kind === 'TRAINING' ? 'TR' : 'CA'}
        </span>
        {/* Top-right: aggregate reaction count + comment count when any */}
        {(totalReactions > 0 || item.commentsCount > 0) && (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-1">
            {totalReactions > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur-sm">
                {item.reactions.slice(0, 3).map((r) => REACTION_KINDS.find((k) => k.key === r.kind)?.emoji).join('')}
                <span className="ml-0.5 tabular-nums">{totalReactions}</span>
              </span>
            )}
            {item.commentsCount > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white backdrop-blur-sm">
                <MessageCircle size={9} />
                <span className="tabular-nums">{item.commentsCount}</span>
              </span>
            )}
          </span>
        )}
        {/* Bottom gradient overlay with user + date */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pt-6 pb-1.5"
        >
          <div className="flex items-center gap-1.5">
            {item.user.avatarUrl ? (
              <img src={item.user.avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover ring-1 ring-white/30" />
            ) : (
              <div className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[9px] font-bold text-white">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <p className="min-w-0 flex-1 truncate text-[10.5px] font-semibold text-white">
              {displayName}
            </p>
            <span className="font-mono text-[9px] text-white/80">{dayShort}</span>
          </div>
        </div>
      </button>
      {/* Reactions bar OUTSIDE the photo button so taps don't both open zoom + react */}
      <ReactionsBar reactions={item.reactions} onReact={onReact} compact />
    </div>
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
