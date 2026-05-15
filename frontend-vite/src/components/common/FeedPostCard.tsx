import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  listComments, createComment, deleteComment,
  type FeedPost, type PostPrivacy,
  type WorkoutExerciseSummary, type WorkoutSet, type PostComment,
} from '../../services/socialService'
import { WorkoutPostImage } from './WorkoutPostImage'
import {
  Users, Heart, Globe2, Lock,
  Trash2, MoreHorizontal, MessageCircle, Share2,
  ArrowRight, ChevronUp, Send, X, Check, BarChart3,
} from 'lucide-react'

// ─── Formatters ────────────────────────────────────────────────────────────

function formatDuration(sec: number | null): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

// Volume in "tonnes" when ≥ 1000kg matches the design's "3.2 t" look,
// kg under that, em dash for cardio/bodyweight sessions where it's 0/null.
function formatVolume(kg: number | null | undefined): string {
  if (kg == null || kg <= 0) return '—'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} t`
  return `${Math.round(kg)} kg`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 7) return d === 1 ? 'ontem' : `${d}d atrás`
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

function formatHHMM(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Stable avatar colour from the user id. Picking from a curated palette keeps
// contrast against white text predictable; the hash ensures the same user
// always lands on the same hue.
const AVATAR_COLORS = [
  '#E13A1A', '#5B7CFF', '#1F8A5B', '#A855F7', '#F59E0B',
  '#06B6D4', '#EC4899', '#14B8A6', '#FF6B35', '#7A5AE0',
]
function avatarColorFromId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function avatarInitials(name: string | null, handle: string): string {
  const source = name?.trim() || handle
  return source.split(/\s+/).map(w => w[0] ?? '').slice(0, 2).join('').toUpperCase() || '?'
}

// `Você` = own post; `Amigo` = following the author; null = stranger (chip hidden).
function getRelLabel(isOwn: boolean, isFriend: boolean): string | null {
  if (isOwn) return 'Você'
  if (isFriend) return 'Amigo'
  return null
}

// Stable label for the workout type ("Push · Peito & Tríceps").
function getSplitLabel(post: FeedPost): string {
  if (post.caption?.trim()) {
    const firstLine = post.caption.split('\n')[0]?.trim()
    if (firstLine && firstLine.length <= 60) return firstLine
  }
  const groups = post.workoutSummary?.exercises
    .map(e => e.primaryMuscleGroup)
    .filter(Boolean)
  if (!groups || groups.length === 0) return 'Treino'
  const unique = Array.from(new Set(groups)).slice(0, 3)
  return unique.join(' · ')
}

// ─── Muscle pill palette (shared with WorkoutSessionCard etc.) ────────────

const MUSCLE_PILL: Record<string, { bg: string; fg: string }> = {
  ABDOMEN:  { bg: '#fff1cc', fg: '#8a5a00' },
  ABDOMINAL:{ bg: '#fff1cc', fg: '#8a5a00' },
  CORE:     { bg: '#d6f3df', fg: '#1b6b3a' },
  BACK:     { bg: '#dbe7ff', fg: '#1c3d8f' },
  COSTAS:   { bg: '#dbe7ff', fg: '#1c3d8f' },
  CHEST:    { bg: '#ffe1d6', fg: '#8a3a18' },
  PEITO:    { bg: '#ffe1d6', fg: '#8a3a18' },
  LEGS:     { bg: '#e8dcff', fg: '#3a1c8f' },
  PERNAS:   { bg: '#e8dcff', fg: '#3a1c8f' },
  GLUTES:   { bg: '#fde2f0', fg: '#7a1c52' },
  SHOULDERS:{ bg: '#fff3d6', fg: '#7a5a00' },
  OMBROS:   { bg: '#fff3d6', fg: '#7a5a00' },
  BICEPS:   { bg: '#d6f3f0', fg: '#1b5a6b' },
  TRICEPS:  { bg: '#d6e8f3', fg: '#1b4a6b' },
  ARMS:     { bg: '#d6f3f0', fg: '#1b5a6b' },
  BRACOS:   { bg: '#d6f3f0', fg: '#1b5a6b' },
}

function musclePillStyle(group: string): { bg: string; fg: string } {
  const key = group.toUpperCase().replace(/[^A-Z]/g, '')
  return MUSCLE_PILL[key] ?? { bg: 'var(--surface-hover)', fg: 'var(--muted)' }
}

type SetKind = 'duration' | 'distance' | 'reps'

function detectSetKind(set: WorkoutSet): SetKind {
  if (set.durationSec != null && set.durationSec > 0) return 'duration'
  if (set.distanceMeters != null && set.distanceMeters > 0) return 'distance'
  return 'reps'
}

function setMagnitude(set: WorkoutSet, kind: SetKind): number {
  if (kind === 'duration') return set.durationSec ?? 0
  if (kind === 'distance') return set.distanceMeters ?? 0
  const reps = set.reps ?? 0
  const w = set.weightKg ?? 0
  return w > 0 ? w * reps : reps
}

function formatMMSS(sec: number): string {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

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

function PrivacyMenu({
  current, ownerIsPrivate, saving, onChange,
}: {
  current: PostPrivacy
  ownerIsPrivate: boolean
  saving: boolean
  onChange: (next: PostPrivacy) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const allowed = ownerIsPrivate ? PRIVACY_OPTIONS.filter((o) => o.value !== 'PUBLIC') : PRIVACY_OPTIONS
  const currentOption = PRIVACY_OPTIONS.find((o) => o.value === current) ?? PRIVACY_OPTIONS[0]
  const Icon = currentOption.icon

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
        title="Alterar privacidade"
      >
        <Icon size={12} />
        {currentOption.label}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-lg">
          {allowed.map((opt) => {
            const OptIcon = opt.icon
            const active = opt.value === current
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setOpen(false); if (!active) onChange(opt.value) }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                  active ? 'bg-[var(--surface-hover)] text-[var(--brand)]' : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <OptIcon size={13} />
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
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
  const { authorizedFetch } = useAuth()
  const [items, setItems] = useState<PostComment[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listComments(authorizedFetch, postId)
      .then((data) => { if (!cancelled) setItems(data) })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar comentários')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [authorizedFetch, postId])

  const handleSubmit = async () => {
    const text = draft.trim()
    if (!text || posting) return
    setPosting(true)
    setError(null)
    try {
      const created = await createComment(authorizedFetch, postId, text)
      setItems((prev) => (prev ? [...prev, created] : [created]))
      setDraft('')
      onCountChange(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar comentário')
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (commentId: string) => {
    if (!window.confirm('Apagar comentário?')) return
    try {
      await deleteComment(authorizedFetch, postId, commentId)
      setItems((prev) => prev?.filter((c) => c.id !== commentId) ?? null)
      onCountChange(-1)
    } catch (err) {
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

          <div className="flex flex-wrap items-center gap-1.5">
            {relLabel && (
              <ChipBtn
                icon={Users}
                label={relLabel}
                tone={isOwn ? 'brand' : 'default'}
              />
            )}
            {isOwn ? (
              <>
                <PrivacyMenu
                  current={post.privacy}
                  ownerIsPrivate={ownerIsPrivate}
                  saving={savingPrivacy}
                  onChange={(next) => void handlePrivacy(next)}
                />
                {canDelete && (
                  <ChipBtn
                    icon={Trash2}
                    label="Deletar"
                    tone="warn"
                    onClick={() => onDelete(post.id)}
                    title="Deletar post"
                  />
                )}
              </>
            ) : (
              canDelete && (
                <ChipBtn
                  icon={Trash2}
                  label="Remover"
                  tone="warn"
                  onClick={() => onDelete(post.id)}
                  title="Remover como administrador"
                />
              )
            )}
            <ChipBtn icon={MoreHorizontal} title="Mais opções" />
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
    </article>
  )
}
