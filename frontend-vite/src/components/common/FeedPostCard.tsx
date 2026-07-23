import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import {
  type FeedPost, type PostPrivacy,
  type WorkoutExerciseSummary, type WorkoutSet,
} from '../../services/socialService'
import { WorkoutPostImage } from './WorkoutPostImage'
import {
  Users, Heart, MessageCircle, Share2,
  ArrowRight, ChevronUp, Check, BarChart3, Activity,
} from 'lucide-react'
import {
  CARDIO_PT,
  formatCardioChip,
  formatDuration,
  formatVolume,
  timeAgo,
  formatHHMM,
  getRelLabel,
  getSplitLabel,
  musclePillStyle,
  detectSetKind,
  setMagnitude,
  formatMMSS,
  type SetKind,
} from './feed-post-utils'
import { PostMenu, ReportDialog } from './feed-post-menus'
import { Avatar } from './Avatar'
import { CommentsPanel } from './CommentsPanel'

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
