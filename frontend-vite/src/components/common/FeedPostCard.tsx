import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { type FeedPost, type PostPrivacy } from '../../services/socialService'
import { WorkoutPostImage } from './WorkoutPostImage'
import {
  Users, Heart, MessageCircle, Share2,
  ArrowRight, ChevronUp, Activity,
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
} from './feed-post-utils'
import { PostMenu, ReportDialog } from './feed-post-menus'
import { Avatar } from './Avatar'
import { CommentsPanel } from './CommentsPanel'
import { ExerciseDetailedCard } from './ExerciseDetailedCard'
import { ChipBtn, FeedStat, ActionBtn } from './feed-post-ui'

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
