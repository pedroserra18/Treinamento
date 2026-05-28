import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Trophy, Plus, Users, Clock, Sparkles } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  createCompetition,
  declineInvite,
  acceptInvite,
  listMyCompetitions,
  listMyInvites,
} from '../services/competitionService'
import type {
  Competition,
  CompetitionInvitePreview,
  CompetitionType,
} from '../types/competition'
import { Skeleton } from '../components/common/Skeleton'

const TYPE_LABEL: Record<CompetitionType, string> = {
  TRAINING: 'Treino',
  CARDIO: 'Cardio',
  BOTH: 'Treino + Cardio',
}

const TYPE_DESCRIPTION: Record<CompetitionType, string> = {
  TRAINING: 'Conta um treino por dia. Ganha quem treinar mais dias.',
  CARDIO: 'Conta um cardio por dia. Ganha quem fizer mais dias.',
  BOTH: 'Pode contar até 2 por dia (1 treino + 1 cardio).',
}

function formatRelativeFromNow(iso: string): string {
  const d = new Date(iso)
  const diff = d.getTime() - Date.now()
  const days = Math.ceil(diff / 86_400_000)
  if (days <= 0) return 'expira hoje'
  if (days === 1) return 'expira amanhã'
  return `expira em ${days}d`
}

export function CompetitionsPage() {
  const { authorizedFetch } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [invites, setInvites] = useState<CompetitionInvitePreview[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ items: comps }, { items: invs }] = await Promise.all([
        listMyCompetitions(authorizedFetch),
        listMyInvites(authorizedFetch),
      ])
      setCompetitions(comps)
      setInvites(invs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const activeCompetition = useMemo(
    () => competitions.find((c) => c.status === 'LOBBY' || c.status === 'ACTIVE') ?? null,
    [competitions],
  )
  const pastCompetitions = useMemo(
    () => competitions.filter((c) => c.status === 'COMPLETED' || c.status === 'CANCELLED'),
    [competitions],
  )

  const handleAcceptInvite = async (token: string) => {
    try {
      await acceptInvite(authorizedFetch, token)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aceitar convite')
    }
  }

  const handleDeclineInvite = async (token: string) => {
    try {
      await declineInvite(authorizedFetch, token)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao recusar convite')
    }
  }

  return (
    <section className="space-y-4">
      {/* Mobile-only back to profile — desktop has the nav chip. */}
      <Link
        to="/profile"
        className="inline-flex items-center gap-1.5 px-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)] lg:hidden"
      >
        <ArrowLeft size={11} />
        Voltar ao perfil
      </Link>

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
      >
        <div className="inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-strong)]">
          <Trophy size={12} />
          Desafios
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text)] sm:text-[32px]">
          Compita com seus <span className="font-serif-accent text-[var(--brand-strong)]">amigos</span>
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[var(--muted)]">
          Crie uma sala, convide até 9 amigos e veja quem treina mais. Cada dia conta uma vez (foto obrigatória de prova).
        </p>
      </motion.header>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">{error}</p>
      )}

      {loading && (
        <div className="space-y-3" aria-label="Carregando desafios">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      )}

      {/* Pending invites */}
      {!loading && invites.length > 0 && (
        <section className="rounded-2xl border border-[var(--brand)]/40 bg-[var(--brand)]/5 p-4 sm:p-5">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-[var(--brand-strong)]">
            Convites pendentes ({invites.length})
          </h2>
          {activeCompetition && (
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">
              Você já está em "{activeCompetition.name ?? 'um desafio'}". Saia dele primeiro para aceitar outro convite.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3"
              >
                {inv.invitedBy.avatarUrl ? (
                  <img
                    src={inv.invitedBy.avatarUrl}
                    alt={inv.invitedBy.name ?? inv.invitedBy.handle}
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--surface-hover)] text-sm font-bold text-[var(--text)]">
                    {(inv.invitedBy.name ?? inv.invitedBy.handle).slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text)]">
                    {inv.invitedBy.name ?? `@${inv.invitedBy.handle}`} te convidou
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--muted)]">
                    {inv.competition.name ?? 'Desafio'} · {TYPE_LABEL[inv.competition.type]} ·{' '}
                    {inv.competition.durationDays}d · {formatRelativeFromNow(inv.expiresAt)}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleAcceptInvite(inv.token)}
                    disabled={!!activeCompetition}
                    title={activeCompetition ? 'Saia do desafio atual primeiro' : undefined}
                    className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Aceitar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeclineInvite(inv.token)}
                    className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  >
                    Recusar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Active competition */}
      {!loading && activeCompetition && (
        <>
          <CompetitionCard competition={activeCompetition} onOpen={() => navigate(`/desafios/${activeCompetition.id}`)} />
          <p className="px-2 text-center text-[11px] text-[var(--muted)]">
            Você só pode participar de 1 desafio por vez. Saia ou espere o fim para entrar em outro.
          </p>
        </>
      )}

      {/* Create button */}
      {!loading && !activeCompetition && (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-center">
          <Sparkles size={28} className="mx-auto mb-2 text-[var(--brand)]" />
          <p className="text-sm font-bold text-[var(--text)]">Nenhuma competição ativa</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Crie uma sala e convide seus amigos para começar a competir.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)]"
          >
            <Plus size={14} />
            Criar desafio
          </button>
        </section>
      )}

      {/* Past competitions */}
      {!loading && pastCompetitions.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
            Histórico
          </h2>
          <div className="space-y-2">
            {pastCompetitions.map((c) => (
              <CompetitionCard key={c.id} competition={c} onOpen={() => navigate(`/desafios/${c.id}`)} compact />
            ))}
          </div>
        </section>
      )}

      {showCreate && (
        <CreateCompetitionModal
          onClose={() => setShowCreate(false)}
          onCreated={async (comp) => {
            setShowCreate(false)
            setCompetitions((curr) => [comp, ...curr])
            navigate(`/desafios/${comp.id}`)
          }}
        />
      )}
    </section>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function CompetitionCard({
  competition, onOpen, compact,
}: {
  competition: Competition
  onOpen: () => void
  compact?: boolean
}) {
  const isActive = competition.status === 'ACTIVE' || competition.status === 'LOBBY'
  const statusLabel = {
    LOBBY: 'No lobby',
    ACTIVE: 'Em andamento',
    COMPLETED: 'Encerrado',
    CANCELLED: 'Cancelado',
  }[competition.status]

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group block w-full overflow-hidden rounded-2xl border bg-[var(--surface)] p-4 text-left transition-colors sm:p-5 ${
        isActive
          ? 'border-[var(--brand)]/40 hover:border-[var(--brand)]/70'
          : 'border-[var(--line)] hover:border-[var(--brand)]/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                competition.status === 'ACTIVE'
                  ? 'animate-pulse bg-emerald-500'
                  : competition.status === 'LOBBY'
                    ? 'bg-amber-400'
                    : 'bg-[var(--muted)]'
              }`}
            />
            <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">
              {statusLabel}
            </span>
          </div>
          <h3 className="mt-1 text-base font-extrabold text-[var(--text)] sm:text-lg">
            {competition.name ?? 'Desafio'}
          </h3>
          {!compact && (
            <p className="mt-1 text-xs text-[var(--muted)]">{TYPE_DESCRIPTION[competition.type]}</p>
          )}
        </div>
        <span className="rounded-full bg-[var(--brand)]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--brand-strong)]">
          {TYPE_LABEL[competition.type]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-[var(--muted)]">
        <span className="inline-flex items-center gap-1">
          <Users size={11} /> {competition.members.length}/10
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} /> {competition.durationDays}d
        </span>
        {competition.endsAt && (
          <span className="inline-flex items-center gap-1">
            até {new Date(competition.endsAt).toLocaleDateString('pt-BR')}
          </span>
        )}
      </div>
    </button>
  )
}

function CreateCompetitionModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (comp: Competition) => void | Promise<void>
}) {
  const { authorizedFetch } = useAuth()
  const [name, setName] = useState('')
  const [type, setType] = useState<CompetitionType>('BOTH')
  const [durationDays, setDurationDays] = useState<30 | 60 | 90>(30)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Lock body scroll while the modal is open — same pattern as the rest
  // of the app's modals.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const handleSubmit = async () => {
    setSaving(true)
    setErr(null)
    try {
      const comp = await createCompetition(authorizedFetch, {
        name: name.trim() || undefined,
        type,
        durationDays,
      })
      await onCreated(comp)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha ao criar')
    } finally {
      setSaving(false)
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
        className="w-full max-w-md rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] p-5 sm:rounded-2xl sm:border-b"
      >
        <h3 className="text-base font-extrabold text-[var(--text)]">Novo desafio</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">Você é admin da sala e pode convidar até 9 amigos.</p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Nome (opcional)
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Desafio de Verão"
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
          </label>

          <div className="block">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Categoria
            </span>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {(['TRAINING', 'CARDIO', 'BOTH'] as CompetitionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-lg border px-2 py-2 text-[12px] font-bold transition-colors ${
                    type === t
                      ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                      : 'border-[var(--line)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted)]">{TYPE_DESCRIPTION[type]}</p>
          </div>

          <div className="block">
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Duração
            </span>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              {([30, 60, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDurationDays(d)}
                  className={`rounded-lg border px-2 py-2 text-[12px] font-bold transition-colors ${
                    durationDays === d
                      ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                      : 'border-[var(--line)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {d} dias
                </button>
              ))}
            </div>
          </div>
        </div>

        {err && <p className="mt-3 text-xs text-red-500">{err}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
          >
            {saving ? 'Criando…' : 'Criar desafio'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
