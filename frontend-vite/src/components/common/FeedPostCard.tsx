import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  listComments, createComment, deleteComment, reportPost,
  type FeedPost, type PostPrivacy, type ReportReason,
  type WorkoutExerciseSummary, type WorkoutSet, type PostComment,
} from '../../services/socialService'
import { WorkoutPostImage } from './WorkoutPostImage'
import { peekComments, setCommentsCache } from '../../lib/cache/comments-cache'
import {
  Users, Heart, Globe2, Lock,
  Trash2, MoreHorizontal, MessageCircle, Share2,
  ArrowRight, ChevronUp, Send, X, Check, BarChart3, Activity, Link2, Flag,
} from 'lucide-react'
import {
  CARDIO_PT,
  formatCardioChip,
  formatDuration,
  formatVolume,
  timeAgo,
  formatHHMM,
  avatarColorFromId,
  avatarInitials,
  getRelLabel,
  getSplitLabel,
  musclePillStyle,
  detectSetKind,
  setMagnitude,
  formatMMSS,
  type SetKind,
} from './feed-post-utils'

// ─── Set row + ExerciseDetailedCard (per-exercise full breakdown) ─────────

function SetRow({ set, kind, fillPct }: { set: WorkoutSet; kind: SetKind; fillPct: number }) {
  const rpe = set.perceivedExertion
  const rpeHigh = rpe != null && rpe >= 8

  const valueNode = (() => {
    if (kind === 'duration') {
      return <>{formatMMSS(set.durationSec ?? 0)}<small>s</small></>
    }
    if (kind === 'distance') {
      return <>{set.distanceMeters}<small>m</small></>
    }
    const reps = set.reps ?? 0
    const w = set.weightKg
    if (w != null && w > 0) {
      return <>{w}<small>kg × {reps}</small></>
    }
    return <>{reps}<small>reps</small></>
  })()

  const barBg = kind === 'duration'
    ? 'repeating-linear-gradient(90deg, var(--surface-hover) 0 6px, transparent 6px 8px)'
    : 'var(--surface-hover)'

  return (
    <div
      className="grid items-center gap-2.5 px-1 py-1.5 transition-colors hover:bg-[var(--surface-hover)]/60 rounded-lg"
      style={{ gridTemplateColumns: '36px 1fr 92px 50px' }}
    >
      <div className="flex items-center justify-center gap-1 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        S{set.setNumber}
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: barBg }}>
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.max(8, Math.min(100, fillPct))}%`,
            background: 'linear-gradient(90deg, color-mix(in srgb, var(--brand) 55%, white), var(--brand))',
            boxShadow: '0 0 6px -1px color-mix(in srgb, var(--brand) 50%, transparent)',
          }}
        />
      </div>
      <div className="text-right font-mono text-[13px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
        {valueNode}
      </div>
      <div
        className={`rounded-md border px-1 py-[2px] text-center font-mono text-[10.5px] font-medium ${
          rpe == null
            ? 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]'
            : rpeHigh
              ? 'border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]'
              : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]'
        }`}
      >
        {rpe ?? '—'}
      </div>
    </div>
  )
}

function ExerciseDetailedCard({ ex }: { ex: WorkoutExerciseSummary }) {
  const kind: SetKind = detectSetKind(ex.sets[0] ?? { setNumber: 1, reps: null, weightKg: null, durationSec: null, distanceMeters: null, perceivedExertion: null })

  const totalReps = ex.sets.reduce((s, set) => s + (set.reps ?? 0), 0)
  const totalDuration = ex.sets.reduce((s, set) => s + (set.durationSec ?? 0), 0)
  const totalDistance = ex.sets.reduce((s, set) => s + (set.distanceMeters ?? 0), 0)

  const summaryStat = kind === 'duration'
    ? `${totalDuration}s totais`
    : kind === 'distance'
      ? `${totalDistance}m totais`
      : `${totalReps} reps`

  const maxMagnitude = Math.max(1, ...ex.sets.map((s) => setMagnitude(s, kind)))

  const rpes = ex.sets.map((s) => s.perceivedExertion).filter((v): v is number => v != null)
  const avgRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null
  const rpeBars = avgRpe == null ? 0 : Math.max(0, Math.min(5, Math.round(avgRpe / 2)))

  const pill = musclePillStyle(ex.primaryMuscleGroup)

  const valueLabel = kind === 'duration' ? 'Tempo' : kind === 'distance' ? 'Distância' : 'Reps'
  const barLabel = kind === 'duration' ? 'Sustentação' : kind === 'distance' ? 'Trajeto' : 'Intensidade'

  return (
    <li className="group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] transition-colors hover:border-[var(--brand)]/40">
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: 'linear-gradient(180deg, var(--accent-emerald), #4ac876)', opacity: 0.55 }}
      />

      <div className="flex items-start gap-3 px-3.5 pt-3 pb-2.5 sm:px-4">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-emerald-500 text-white">
          <Check size={14} strokeWidth={3} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-bold leading-tight text-[var(--text)]">
              {ex.name}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-[var(--muted)]">
            <span
              className="rounded-full px-1.5 py-[2px] text-[9.5px] font-semibold uppercase tracking-wider"
              style={{ background: pill.bg, color: pill.fg }}
            >
              {ex.primaryMuscleGroup}
            </span>
            <span className="opacity-60">·</span>
            <span>{ex.sets.length} séries</span>
            <span className="opacity-60">·</span>
            <span>{summaryStat}</span>
            {ex.totalVolumeKg > 0 && (
              <>
                <span className="opacity-60">·</span>
                <span>vol {ex.totalVolumeKg}kg</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mx-3.5 border-t border-dashed border-[var(--line)] pt-2 pb-1 sm:mx-4">
        <div
          className="grid items-center gap-2.5 px-1 pb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
          style={{ gridTemplateColumns: '36px 1fr 92px 50px' }}
        >
          <span>Série</span>
          <span>{barLabel}</span>
          <span className="text-right">{valueLabel}</span>
          <span className="text-right">RPE</span>
        </div>
        {ex.sets.map((set) => {
          const fillPct = (setMagnitude(set, kind) / maxMagnitude) * 100
          return <SetRow key={set.setNumber} set={set} kind={kind} fillPct={fillPct} />
        })}
        {ex.userNote ? (
          <p className="mt-2 rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1.5 text-[11.5px] italic leading-snug text-[var(--muted)]">
            "{ex.userNote}"
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3.5 pb-3 pt-2 sm:px-4">
        <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-1 font-mono text-[10px] text-[var(--muted)]">
          RPE médio <b className="font-semibold text-[var(--text)]">{avgRpe != null ? avgRpe.toFixed(1) : '—'}</b>
          <span className="ml-0.5 inline-flex gap-[1.5px]">
            {Array.from({ length: 5 }, (_, i) => (
              <span
                key={i}
                className="block h-2 w-[3px] rounded-[1px]"
                style={{ background: i < rpeBars ? 'var(--brand)' : 'var(--line)' }}
              />
            ))}
          </span>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          className="inline-flex items-center gap-1 font-mono text-[10.5px] tracking-wide text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          title="Em breve"
        >
          <BarChart3 size={11} />
          comparar
        </button>
      </div>
    </li>
  )
}

// ─── Privacy menu ──────────────────────────────────────────────────────────

const PRIVACY_OPTIONS: { value: PostPrivacy; label: string; icon: typeof Globe2 }[] = [
  { value: 'PUBLIC', label: 'Público', icon: Globe2 },
  { value: 'FRIENDS', label: 'Amigos', icon: Users },
  { value: 'PRIVATE', label: 'Privado', icon: Lock },
]

// Menu "..." de opções do post (estilo Instagram/Strava). Agrupa as ações
// que antes ficavam soltas no header (privacidade, deletar) + "Copiar link".
// Renderizado via portal com posição `fixed` pra NUNCA ser cortado pelo
// `overflow-hidden` do card. Fecha em: clique-fora, Esc e scroll.
function PostMenu({
  postId, isOwner, canDelete, canReport, privacy, ownerIsPrivate, savingPrivacy, onPrivacyChange, onDelete, onReport,
}: {
  postId: string
  isOwner: boolean
  canDelete: boolean
  canReport: boolean
  privacy: PostPrivacy
  ownerIsPrivate: boolean
  savingPrivacy: boolean
  onPrivacyChange: (next: PostPrivacy) => void
  onDelete: () => void
  onReport: () => void
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }, [])

  // Posição é calculada no clique (abaixo), não aqui — evita setState dentro do
  // effect. Este effect só reposiciona no resize e fecha no scroll (menu fixed
  // não acompanha a rolagem do feed — fechar é o comportamento esperado).
  useLayoutEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', close, true)
    }
  }, [open, place])

  const toggle = () => {
    if (open) { setOpen(false); return }
    place()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const allowedPrivacy = ownerIsPrivate ? PRIVACY_OPTIONS.filter((o) => o.value !== 'PUBLIC') : PRIVACY_OPTIONS

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/post/${postId}`)
      setCopied(true)
      window.setTimeout(() => { setCopied(false); setOpen(false) }, 1100)
    } catch {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mais opções"
        className="inline-flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1.5 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-52 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => void copyLink()}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            {copied ? <Check size={15} className="text-[var(--brand)]" /> : <Link2 size={15} />}
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>

          {canReport && (
            <>
              <div className="border-t border-[var(--line)]" />
              <button
                role="menuitem"
                type="button"
                onClick={() => { setOpen(false); onReport() }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <Flag size={15} />
                Denunciar
              </button>
            </>
          )}

          {isOwner && (
            <>
              <div className="border-t border-[var(--line)]" />
              <p className="px-3.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                Privacidade
              </p>
              {allowedPrivacy.map((opt) => {
                const OptIcon = opt.icon
                const active = opt.value === privacy
                return (
                  <button
                    key={opt.value}
                    role="menuitemradio"
                    aria-checked={active}
                    type="button"
                    disabled={savingPrivacy}
                    onClick={() => { if (!active) onPrivacyChange(opt.value); setOpen(false) }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                      active ? 'text-[var(--brand)]' : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <OptIcon size={15} />
                    <span className="flex-1">{opt.label}</span>
                    {active && <Check size={15} />}
                  </button>
                )
              })}
            </>
          )}

          {canDelete && (
            <>
              <div className="border-t border-[var(--line)]" />
              <button
                role="menuitem"
                type="button"
                onClick={() => { setOpen(false); onDelete() }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
              >
                <Trash2 size={15} />
                {isOwner ? 'Deletar' : 'Remover'}
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Report dialog ─────────────────────────────────────────────────────────

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'SPAM', label: 'Spam ou enganoso' },
  { value: 'HARASSMENT', label: 'Assédio ou bullying' },
  { value: 'INAPPROPRIATE', label: 'Conteúdo impróprio' },
  { value: 'VIOLENCE', label: 'Violência' },
  { value: 'MISINFORMATION', label: 'Informação falsa' },
  { value: 'OTHER', label: 'Outro' },
]

// Diálogo de denúncia. Montado só quando aberto (o parent faz `{open && ...}`),
// então o estado nasce limpo a cada abertura — sem reset via effect.
function ReportDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { authorizedFetch } = useAuth()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<null | 'sent' | 'already'>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    if (!reason || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await reportPost(authorizedFetch, postId, reason, details)
      setDone(res.alreadyReported ? 'already' : 'sent')
      window.setTimeout(onClose, 1600)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar denúncia')
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl sm:rounded-2xl"
      >
        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--brand)]/15 text-[var(--brand)]">
              <Check size={24} />
            </div>
            <p className="text-base font-bold text-[var(--text)]">
              {done === 'already' ? 'Você já tinha denunciado' : 'Denúncia enviada'}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">Obrigado. Nossa equipe vai analisar.</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text)]">Denunciar post</h3>
              <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">
                <X size={18} />
              </button>
            </div>
            <p className="mb-3 text-sm text-[var(--muted)]">Por que você está denunciando?</p>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                    reason === r.value
                      ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--text)]'
                      : 'border-[var(--line)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {r.label}
                  {reason === r.value && <Check size={16} className="text-[var(--brand)]" />}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              placeholder="Detalhes (opcional)"
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--brand)] focus:outline-none"
            />
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!reason || submitting}
                onClick={() => void submit()}
                className="flex-1 rounded-full bg-red-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {submitting ? 'Enviando...' : 'Enviar denúncia'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ─── Avatar ────────────────────────────────────────────────────────────────

export function Avatar({ userId, name, handle, avatarUrl, size = 44, onClick }: {
  userId: string
  name: string | null
  handle: string
  avatarUrl: string | null | undefined
  size?: number
  onClick?: () => void
}) {
  const color = avatarColorFromId(userId)
  const initials = avatarInitials(name, handle)
  const inner = avatarUrl
    ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
    : <span className="text-sm font-bold text-white" style={{ fontSize: size * 0.32 }}>{initials}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="relative shrink-0 overflow-visible rounded-full disabled:cursor-default"
      style={{ width: size, height: size }}
      aria-label={`Perfil de ${name ?? handle}`}
    >
      <span
        className="grid h-full w-full place-items-center overflow-hidden rounded-full"
        style={{
          background: `linear-gradient(135deg, ${color} 0%, ${color}aa 100%)`,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 12px -6px ${color}80`,
        }}
      >
        {inner}
      </span>
      {/* Decorative online indicator — no real presence backend yet. */}
      <span
        className="absolute bottom-0 right-0 rounded-full ring-2 ring-[var(--surface)]"
        style={{ width: size * 0.27, height: size * 0.27, background: '#34C759' }}
      />
    </button>
  )
}

// ─── Reusable chip + stat + action button ─────────────────────────────────

function ChipBtn({
  icon: IconComp, label, tone = 'default', onClick, disabled, title,
}: {
  icon: typeof Users
  label?: string
  tone?: 'default' | 'warn' | 'brand'
  onClick?: () => void
  disabled?: boolean
  title?: string
}) {
  const toneClass = tone === 'warn'
    ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/15'
    : tone === 'brand'
      ? 'border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]'
      : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--text)]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${toneClass}`}
    >
      <IconComp size={13} />
      {label && <span>{label}</span>}
    </button>
  )
}

function FeedStat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
      <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-extrabold leading-none tracking-tight ${
          highlight ? 'text-[var(--brand)]' : 'text-[var(--text)]'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function ActionBtn({
  icon: IconComp, label, active, onClick, ariaLabel,
}: {
  icon: typeof Heart
  label?: string | number
  active?: boolean
  onClick?: () => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
        active
          ? 'border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]'
          : 'border-transparent text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
      }`}
    >
      <IconComp size={14} strokeWidth={active ? 2.2 : 1.8} className={active && IconComp === Heart ? 'fill-[var(--brand)]' : ''} />
      {label !== undefined && <span className="font-mono tabular-nums">{label}</span>}
    </button>
  )
}

// ─── Inline comments panel ─────────────────────────────────────────────────

function CommentsPanel({
  postId, viewerId, isAdmin, isPostOwner,
  initialCount, onCountChange,
}: {
  postId: string
  viewerId: string | undefined
  isAdmin: boolean
  isPostOwner: boolean
  initialCount: number
  onCountChange: (delta: number) => void
}) {
  const { authorizedFetch, user } = useAuth()
  // Inicializa do cache em memória — reabrir os comentários é instantâneo (sem
  // spinner). Revalidamos em background logo abaixo.
  const [items, setItems] = useState<PostComment[] | null>(() => peekComments(postId))
  const [loading, setLoading] = useState(() => peekComments(postId) == null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  // Stale-while-revalidate: mostra o cache na hora e busca a versão fresca em
  // background. Só mostra erro quando não há nada em cache pra exibir.
  useEffect(() => {
    let cancelled = false
    listComments(authorizedFetch, postId)
      .then((data) => {
        if (cancelled) return
        setItems(data)
        setCommentsCache(postId, data)
      })
      .catch((err: unknown) => {
        if (!cancelled && peekComments(postId) == null) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar comentários')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authorizedFetch, postId])

  const handleSubmit = async () => {
    const text = draft.trim()
    if (!text || posting || !user) return
    setPosting(true)
    setError(null)
    // OPTIMISTIC: mostra o comentário na hora com id temporário; reconcilia com
    // a resposta do servidor (ou faz rollback + devolve o texto em caso de erro).
    const tempId = `temp-${Date.now()}`
    const optimistic: PostComment = {
      id: tempId,
      content: text,
      createdAt: new Date().toISOString(),
      user: { id: user.id, name: user.name ?? null, avatarUrl: user.avatarUrl ?? null, handle: user.handle ?? '' },
    }
    setItems((prev) => {
      const next = [...(prev ?? []), optimistic]
      setCommentsCache(postId, next)
      return next
    })
    setDraft('')
    onCountChange(1)
    try {
      const created = await createComment(authorizedFetch, postId, text)
      setItems((prev) => {
        const next = (prev ?? []).map((c) => (c.id === tempId ? created : c))
        setCommentsCache(postId, next)
        return next
      })
    } catch (err) {
      setItems((prev) => {
        const next = (prev ?? []).filter((c) => c.id !== tempId)
        setCommentsCache(postId, next)
        return next
      })
      onCountChange(-1)
      setDraft(text)
      setError(err instanceof Error ? err.message : 'Erro ao enviar comentário')
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Apagar comentário?')) return
    // OPTIMISTIC: remove na hora; rollback se o backend falhar.
    const snapshot = items
    setItems((prev) => {
      const next = prev?.filter((c) => c.id !== commentId) ?? null
      if (next) setCommentsCache(postId, next)
      return next
    })
    onCountChange(-1)
    try {
      await deleteComment(authorizedFetch, postId, commentId)
    } catch (err) {
      setItems(snapshot)
      if (snapshot) setCommentsCache(postId, snapshot)
      onCountChange(1)
      setError(err instanceof Error ? err.message : 'Erro ao apagar comentário')
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)]/40 p-3">
      {loading && (
        <p className="text-xs text-[var(--muted)]">A carregar comentários…</p>
      )}

      {!loading && items && items.length === 0 && (
        <p className="text-xs text-[var(--muted)]">
          {initialCount > 0 ? 'Nenhum comentário visível.' : 'Seja o primeiro a comentar!'}
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((c) => {
            const canDelete = viewerId && (c.user.id === viewerId || isPostOwner || isAdmin)
            return (
              <li key={c.id} className="flex items-start gap-2.5">
                <Avatar
                  userId={c.user.id}
                  name={c.user.name}
                  handle={c.user.handle}
                  avatarUrl={c.user.avatarUrl}
                  size={28}
                />
                <div className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs font-bold text-[var(--text)]">
                      {c.user.name ?? c.user.handle}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--muted)]">@{c.user.handle}</span>
                    <span className="font-mono text-[10px] text-[var(--muted)]">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-[var(--text)]">{c.content}</p>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(c.id)}
                    className="mt-1 rounded-md border border-transparent p-1 text-[var(--muted)] transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                    title="Apagar comentário"
                  >
                    <X size={11} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {viewerId && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
          <input
            type="text"
            value={draft}
            placeholder="Escreve um comentário…"
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSubmit() } }}
            className="flex-1 bg-transparent text-xs text-[var(--text)] placeholder:text-[var(--muted)] outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!draft.trim() || posting}
            className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)] text-white transition-opacity disabled:opacity-40"
            title="Enviar"
          >
            <Send size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── PostCard (the public component everyone imports) ─────────────────────

export type FeedPostCardProps = {
  post: FeedPost
  /** Viewer's own user id, used to detect "my own post" + comment ownership. */
  userId: string | undefined
  isAdmin: boolean
  isFriend: boolean
  /** Whether the current viewer's own profile is private (limits PUBLIC option). */
  ownerIsPrivate: boolean
  /** Whether the rendering page already shows author info (e.g. /u/:id) — when
   *  true the avatar/name/handle row is hidden, since it would be redundant. */
  hideAuthor?: boolean
  onLike: (id: string) => void
  onDelete: (id: string) => void
  onPrivacyChange: (id: string, next: PostPrivacy) => Promise<void>
  onProfileClick: (id: string) => void
  onShare: (id: string) => void
}

export function FeedPostCard({
  post, userId, isAdmin, isFriend, ownerIsPrivate, hideAuthor = false,
  onLike, onDelete, onPrivacyChange, onProfileClick, onShare,
}: FeedPostCardProps) {
  const isOwn = post.user.id === userId
  const canDelete = isOwn || isAdmin
  const [expanded, setExpanded] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsCount, setCommentsCount] = useState(post.commentsCount)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const hasValidPhoto = Boolean(post.photoUrl) && !post.photoUrl!.startsWith('blob:')

  const handlePrivacy = async (next: PostPrivacy) => {
    setSavingPrivacy(true)
    try { await onPrivacyChange(post.id, next) } finally { setSavingPrivacy(false) }
  }

  const relLabel = getRelLabel(isOwn, isFriend)
  const splitLabel = getSplitLabel(post)
  const exerciseCount = post.workoutSummary?.exercises.length ?? 0

  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      {hasValidPhoto && (
        <div className="relative">
          <WorkoutPostImage src={post.photoUrl!} />
        </div>
      )}

      <div className="space-y-4 p-5 sm:p-6">
        {/* HEADER — avatar + name + meta. Hidden when the parent already
            shows the author (eg. on /u/:id we don't repeat the user's name
            on every post). The action chips row stays visible. */}
        <header className="flex flex-wrap items-center gap-3">
          {!hideAuthor && (
            <>
              <Avatar
                userId={post.user.id}
                name={post.user.name}
                handle={post.user.handle}
                avatarUrl={post.user.avatarUrl}
                onClick={() => onProfileClick(post.user.id)}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <button
                    type="button"
                    onClick={() => onProfileClick(post.user.id)}
                    className="truncate text-left text-sm font-bold text-[var(--text)] hover:text-[var(--brand)]"
                    style={{ maxWidth: 360 }}
                  >
                    {post.user.name ?? 'Usuário'}
                  </button>
                  <span className="font-mono text-[11px] text-[var(--muted)]">@{post.user.handle}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10.5px] tracking-wide text-[var(--muted)]">
                  <span>{timeAgo(post.createdAt)}</span>
                  <span className="opacity-50">·</span>
                  <span>{formatHHMM(post.createdAt)}</span>
                  <span className="opacity-50">·</span>
                  <span className="font-semibold text-[var(--text)]">{splitLabel}</span>
                </div>
              </div>
            </>
          )}

          {hideAuthor && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[var(--text)]">{splitLabel}</p>
              <p className="mt-0.5 font-mono text-[10.5px] tracking-wide text-[var(--muted)]">
                {timeAgo(post.createdAt)} · {formatHHMM(post.createdAt)}
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-1.5">
            {relLabel && (
              <ChipBtn
                icon={Users}
                label={relLabel}
                tone={isOwn ? 'brand' : 'default'}
              />
            )}
            {/* Tudo que era botão solto (privacidade, deletar) agora mora aqui
                dentro — header limpo, só "..." + a etiqueta de relação. */}
            <PostMenu
              postId={post.id}
              isOwner={isOwn}
              canDelete={canDelete}
              canReport={!isOwn}
              privacy={post.privacy}
              ownerIsPrivate={ownerIsPrivate}
              savingPrivacy={savingPrivacy}
              onPrivacyChange={(next) => void handlePrivacy(next)}
              onDelete={() => onDelete(post.id)}
              onReport={() => setReportOpen(true)}
            />
          </div>
        </header>

        {post.workoutSummary && (
          <div className="grid grid-cols-3 gap-2">
            <FeedStat label="DURAÇÃO" value={formatDuration(post.workoutSummary.durationSec)} />
            <FeedStat label="VOLUME" value={formatVolume(post.workoutSummary.totalVolumeKg)} highlight />
            <FeedStat label="EXERCÍCIOS" value={exerciseCount} />
          </div>
        )}

        {post.workoutSummary && exerciseCount > 0 && !expanded && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {post.workoutSummary.exercises.slice(0, 6).map((ex) => (
                <span
                  key={ex.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1 text-xs text-[var(--text)]"
                >
                  <span className="font-medium">{ex.name}</span>
                  <span className="font-mono text-[10.5px] font-bold text-[var(--muted)]">{ex.sets.length}x</span>
                </span>
              ))}
              {exerciseCount > 6 && (
                <span className="inline-flex items-center rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1 text-xs text-[var(--muted)]">
                  +{exerciseCount - 6}
                </span>
              )}
            </div>
            {post.workoutSummary.exercises.some((ex) => ex.userNote) && (
              <ul className="space-y-1 text-[11.5px] italic text-[var(--muted)]">
                {post.workoutSummary.exercises
                  .filter((ex) => ex.userNote)
                  .map((ex) => (
                    <li key={`enote-${ex.name}`}>
                      <span className="font-semibold not-italic text-[var(--text)]">{ex.name}:</span> "{ex.userNote}"
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        {post.workoutSummary?.cardio && post.workoutSummary.cardio.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {post.workoutSummary.cardio.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                >
                  <Activity size={11} />
                  <span className="font-medium">{CARDIO_PT[c.type] ?? 'Cardio'}</span>
                  <span className="font-mono text-[10.5px]">{formatCardioChip(c)}</span>
                </span>
              ))}
            </div>
            {post.workoutSummary.cardio.some((c) => c.notes) && (
              <ul className="space-y-1 text-[11.5px] italic text-[var(--muted)]">
                {post.workoutSummary.cardio
                  .filter((c) => c.notes)
                  .map((c, i) => (
                    <li key={`cnote-${i}`}>
                      <span className="font-semibold not-italic text-[var(--text)]">{CARDIO_PT[c.type] ?? 'Cardio'}:</span> "{c.notes}"
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        <AnimatePresence>
          {expanded && post.workoutSummary && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <ul className="flex list-none flex-col gap-2.5 p-0">
                {post.workoutSummary.exercises.map((ex) => (
                  <ExerciseDetailedCard key={ex.name} ex={ex} />
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-[var(--line)] pt-3">
          <ActionBtn
            icon={Heart}
            label={post.likesCount}
            active={post.likedByMe}
            onClick={() => onLike(post.id)}
            ariaLabel={post.likedByMe ? 'Descurtir' : 'Curtir'}
          />
          <ActionBtn
            icon={MessageCircle}
            label={commentsCount}
            active={commentsOpen}
            onClick={() => setCommentsOpen((v) => !v)}
            ariaLabel="Comentários"
          />
          <ActionBtn
            icon={Share2}
            onClick={() => onShare(post.id)}
            ariaLabel="Partilhar"
          />
          {post.workoutSummary && exerciseCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-auto inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:border-[var(--brand)]/40"
            >
              {expanded ? 'Ocultar detalhes' : 'Ver stats completos'}
              {expanded ? <ChevronUp size={13} /> : <ArrowRight size={13} />}
            </button>
          )}
        </div>

        <AnimatePresence>
          {commentsOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CommentsPanel
                postId={post.id}
                viewerId={userId}
                isAdmin={isAdmin}
                isPostOwner={isOwn}
                initialCount={commentsCount}
                onCountChange={(delta) => setCommentsCount((c) => Math.max(0, c + delta))}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {reportOpen && <ReportDialog postId={post.id} onClose={() => setReportOpen(false)} />}
    </article>
  )
}
