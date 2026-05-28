import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, AlertCircle, ArrowLeft, CheckCircle2, Copy, Crown, Dumbbell, Flame, Image as ImageIcon, Link2, LogOut, MoreVertical, Play, Trophy, UserMinus, UserPlus, Users, X as XIcon } from 'lucide-react'
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

      {/* Feed — "Provas" tab on mobile */}
      {(comp.status === 'ACTIVE' || comp.status === 'COMPLETED') && (
        <div className={mobileTab !== 'provas' ? 'hidden lg:block' : ''}>
          <CompetitionFeed items={feed} onZoom={(item) => setPhotoZoom(item)} />
        </div>
      )}

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
            <FeedGridTile key={item.id} item={item} onZoom={() => onZoom(item)} />
          ))}
        </div>
      )}
    </section>
  )
}

function FeedGridTile({
  item, onZoom,
}: {
  item: CompetitionFeedItem
  onZoom: () => void
}) {
  const displayName = item.user.name ?? `@${item.user.handle}`
  const dayShort = new Date(item.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return (
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
