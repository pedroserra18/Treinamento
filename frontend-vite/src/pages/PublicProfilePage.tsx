import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useScrollLock } from '../hooks/useScrollLock'
import {
  getPublicProfile, getUserPosts, followUser, unfollowUser, compareUsers, compareExercise,
  getPublicFollowers, getPublicFollowing, getMutualFollowers, deletePost,
  type PublicProfile, type FeedPost, type CompareResult, type WorkoutExerciseSummary,
  type SimpleUser, type ExerciseCompareResult,
} from '../services/socialService'
import { searchExercisesForPlan } from '../services/workoutService'
import { WorkoutPostImage } from '../components/common/WorkoutPostImage'
import { ImageViewer } from '../components/common/ImageViewer'

function formatDuration(sec: number | null): string {
  if (!sec) return '-'
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}min`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d atrás`
  return new Date(dateStr).toLocaleDateString('pt-BR')
}

function formatNumberFull(n: number): string {
  return Math.round(n).toLocaleString('pt-BR')
}

function PlayerBar({
  name,
  value,
  unit,
  color,
  pct,
  isWinner,
  delay,
}: {
  name: string
  value: number
  unit?: string
  color: string
  pct: number
  isWinner: boolean
  delay: number
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate text-xs font-bold text-[var(--text)]">{name}</span>
          {isWinner ? (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
              style={{ backgroundColor: `${color}25`, color }}
            >
              Vencendo
            </span>
          ) : null}
        </div>
        <span className="shrink-0 text-base font-black tabular-nums" style={{ color }}>
          {formatNumberFull(value)}
          {unit ? <span className="ml-1 text-[10px] font-bold opacity-80">{unit}</span> : null}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--line)]">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: 'easeOut', delay }}
        />
      </div>
    </div>
  )
}

function StatBattle({
  label,
  meName,
  themName,
  meValue,
  themValue,
  meColor,
  themColor,
  unit,
  delay = 0,
}: {
  label: string
  meName: string
  themName: string
  meValue: number
  themValue: number
  meColor: string
  themColor: string
  unit?: string
  delay?: number
}) {
  const max = Math.max(meValue, themValue, 1)
  const mePct = (meValue / max) * 100
  const themPct = (themValue / max) * 100
  const meWins = meValue > themValue
  const themWins = themValue > meValue
  const tied = !meWins && !themWins && (meValue > 0 || themValue > 0)
  const empty = meValue === 0 && themValue === 0
  const diff = Math.abs(meValue - themValue)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay }}
      className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3"
    >
      <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.15em] text-[var(--muted)]">
        {label}
      </p>

      <div className="space-y-3">
        <PlayerBar
          name={meName}
          value={meValue}
          unit={unit}
          color={meColor}
          pct={mePct}
          isWinner={meWins}
          delay={delay + 0.1}
        />
        <PlayerBar
          name={themName}
          value={themValue}
          unit={unit}
          color={themColor}
          pct={themPct}
          isWinner={themWins}
          delay={delay + 0.15}
        />
      </div>

      {!empty ? (
        <p className="mt-3 border-t border-[var(--line)] pt-2 text-[11px] font-semibold text-[var(--muted)]">
          {tied ? (
            <span>Empate em {formatNumberFull(meValue)}{unit ? ` ${unit}` : ''}.</span>
          ) : (
            <span>
              <span className="font-black" style={{ color: meWins ? meColor : themColor }}>
                {meWins ? meName : themName}
              </span>{' '}
              está à frente por{' '}
              <span className="font-black text-[var(--text)]">
                {formatNumberFull(diff)}
                {unit ? ` ${unit}` : ''}
              </span>
              .
            </span>
          )}
        </p>
      ) : null}
    </motion.div>
  )
}

function ComparePanel({ result, userId, authorizedFetch, onAvatarClick }: {
  result: CompareResult
  userId: string
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onAvatarClick: (src: string, alt: string) => void
}) {
  const [exQuery, setExQuery] = useState('')
  const [exResults, setExResults] = useState<Array<{ id: string; name: string }>>([])
  const [exCompare, setExCompare] = useState<ExerciseCompareResult | null>(null)
  const [loadingEx, setLoadingEx] = useState(false)
  const exTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const searchEx = (q: string) => {
    setExQuery(q)
    if (exTimer.current) clearTimeout(exTimer.current)
    if (!q.trim()) { setExResults([]); return }
    exTimer.current = setTimeout(async () => {
      try {
        const data = await searchExercisesForPlan(authorizedFetch, { q: q.trim(), limit: 6 })
        setExResults(data.map((e) => ({ id: e.id, name: e.name })))
      } catch { /* silent */ }
    }, 350)
  }

  const pickExercise = async (id: string, name: string) => {
    setExQuery(name)
    setExResults([])
    setLoadingEx(true)
    try {
      const data = await compareExercise(authorizedFetch, userId, id)
      setExCompare(data)
    } catch { /* silent */ } finally {
      setLoadingEx(false)
    }
  }

  const meColor = '#ef4444'
  const themColor = '#6b7280'

  const meName = result.me.name ?? 'Você'
  const themName = result.them.name ?? 'Rival'
  const meFirst = meName.split(' ')[0]
  const themFirst = themName.split(' ')[0]

  const Avatar = ({ url, name, color }: { url: string | null; name: string; color: string }) => (
    <button
      type="button"
      onClick={() => url && onAvatarClick(url, name)}
      disabled={!url}
      className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full transition-opacity hover:opacity-90 disabled:cursor-default"
      style={{ boxShadow: `0 0 0 2px ${color}, 0 0 0 4px var(--surface)` }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-[var(--surface-hover)] text-sm font-black text-[var(--text)]">
          {name[0]?.toUpperCase()}
        </span>
      )}
    </button>
  )

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      {/* Header — VS */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface-hover)] px-4 py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar url={result.me.avatarUrl ?? null} name={meName} color={meColor} />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: meColor }}>Você</p>
            <p className="truncate text-sm font-black text-[var(--text)]">{meFirst}</p>
          </div>
        </div>

        <span className="shrink-0 text-xs font-black uppercase tracking-[0.3em] text-[var(--muted)]">vs</span>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          <div className="min-w-0 text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: themColor }}>Rival</p>
            <p className="truncate text-sm font-black text-[var(--text)]">{themFirst}</p>
          </div>
          <Avatar url={result.them.avatarUrl ?? null} name={themName} color={themColor} />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <StatBattle
          label="Treinos nos últimos 7 dias"
          meName={meFirst}
          themName={themFirst}
          meValue={result.me.stats.workouts7d}
          themValue={result.them.stats.workouts7d}
          meColor={meColor}
          themColor={themColor}
          delay={0}
        />
        <StatBattle
          label="Treinos nos últimos 30 dias"
          meName={meFirst}
          themName={themFirst}
          meValue={result.me.stats.workouts30d}
          themValue={result.them.stats.workouts30d}
          meColor={meColor}
          themColor={themColor}
          delay={0.05}
        />
        <StatBattle
          label="Volume dos últimos 7 dias"
          meName={meFirst}
          themName={themFirst}
          meValue={result.me.stats.volumeKg7d}
          themValue={result.them.stats.volumeKg7d}
          meColor={meColor}
          themColor={themColor}
          unit="kg"
          delay={0.1}
        />

        {/* Top exercises */}
        {result.them.stats.topExercises.length > 0 && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: themColor }} />
              <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-[var(--muted)]">
                Top exercícios — {themFirst} (30d)
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {result.them.stats.topExercises.map((e) => (
                <span
                  key={e.name}
                  className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text)]"
                >
                  {e.name}
                  <span className="ml-1 text-[10px] font-black tabular-nums" style={{ color: themColor }}>
                    {e.count}×
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Exercise comparison */}
        <div className="rounded-xl border border-[var(--line)] p-3 space-y-3">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.25em] text-[var(--muted)]">
            Comparar exercício específico
          </p>
          <input
            type="search"
            value={exQuery}
            onChange={(e) => searchEx(e.target.value)}
            placeholder="Pesquisar exercício..."
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--brand)]"
          />

          {exResults.length > 0 && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] divide-y divide-[var(--line)] overflow-hidden">
              {exResults.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => void pickExercise(ex.id, ex.name)}
                  className="flex w-full px-3 py-2.5 text-sm text-left text-[var(--text)] hover:bg-[var(--surface)]"
                >
                  {ex.name}
                </button>
              ))}
            </div>
          )}

          {loadingEx && <p className="text-xs text-[var(--muted)]">Carregando...</p>}

          {exCompare && !loadingEx && (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-black text-[var(--text)]">{exCompare.exerciseName}</p>
                <p className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-[var(--muted)]">últimos 30d</p>
              </div>
              <StatBattle
                label="Carga máxima"
                meName={meFirst}
                themName={themFirst}
                meValue={exCompare.me.stats.maxWeightKg}
                themValue={exCompare.them.stats.maxWeightKg}
                meColor={meColor}
                themColor={themColor}
                unit="kg"
                delay={0}
              />
              <StatBattle
                label="Maior volume em 1 série"
                meName={meFirst}
                themName={themFirst}
                meValue={
                  exCompare.me.stats.bestSet
                    ? exCompare.me.stats.bestSet.reps * exCompare.me.stats.bestSet.weightKg
                    : 0
                }
                themValue={
                  exCompare.them.stats.bestSet
                    ? exCompare.them.stats.bestSet.reps * exCompare.them.stats.bestSet.weightKg
                    : 0
                }
                meColor={meColor}
                themColor={themColor}
                unit="kg"
                delay={0.05}
              />
              <StatBattle
                label="Total de séries"
                meName={meFirst}
                themName={themFirst}
                meValue={exCompare.me.stats.totalSets}
                themValue={exCompare.them.stats.totalSets}
                meColor={meColor}
                themColor={themColor}
                delay={0.1}
              />
              <StatBattle
                label="Total de repetições"
                meName={meFirst}
                themName={themFirst}
                meValue={exCompare.me.stats.totalReps}
                themValue={exCompare.them.stats.totalReps}
                meColor={meColor}
                themColor={themColor}
                delay={0.15}
              />
              {(exCompare.me.stats.bestSet || exCompare.them.stats.bestSet) && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div
                    className="rounded-xl border p-2.5 text-center"
                    style={{ borderColor: `${meColor}40`, backgroundColor: `${meColor}08` }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: meColor }}>
                      Melhor set · {meFirst}
                    </p>
                    <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
                      {exCompare.me.stats.bestSet
                        ? `${exCompare.me.stats.bestSet.reps}× ${exCompare.me.stats.bestSet.weightKg}kg`
                        : '—'}
                    </p>
                  </div>
                  <div
                    className="rounded-xl border p-2.5 text-center"
                    style={{ borderColor: `${themColor}50`, backgroundColor: `${themColor}10` }}
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: themColor }}>
                      Melhor set · {themFirst}
                    </p>
                    <p className="mt-1 text-sm font-black tabular-nums text-[var(--text)]">
                      {exCompare.them.stats.bestSet
                        ? `${exCompare.them.stats.bestSet.reps}× ${exCompare.them.stats.bestSet.weightKg}kg`
                        : '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type ListPanel = 'followers' | 'following' | 'mutual' | null

function UserListModal({ title, users, loading, onClose, onNavigate }: {
  title: string
  users: SimpleUser[]
  loading: boolean
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.2 }}
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        style={{ maxHeight: 'min(80vh, 560px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
          <h3 className="text-base font-extrabold text-[var(--text)]">{title}</h3>
          <button type="button" onClick={onClose} className="text-[var(--muted)] text-lg px-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-[var(--line)] overscroll-contain">
          {loading && <p className="px-4 py-6 text-sm text-center text-[var(--muted)]">Carregando...</p>}
          {!loading && users.length === 0 && <p className="px-4 py-6 text-sm text-center text-[var(--muted)]">Nenhum usuário aqui ainda.</p>}
          {!loading && users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onClose(); onNavigate(u.id) }}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors"
            >
              <div className="h-9 w-9 shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] overflow-hidden">
                {u.avatarUrl
                  ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--muted)]">{(u.name ?? '?')[0]?.toUpperCase()}</span>
                }
              </div>
              <span className="text-sm font-semibold text-[var(--text)] truncate">{u.name ?? 'Usuário'}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

function ExerciseStatsRow({ ex }: { ex: WorkoutExerciseSummary }) {
  const totalReps = ex.sets.reduce((s, set) => s + (set.reps ?? 0), 0)
  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold text-[var(--text)]">{ex.name}</p>
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]">{ex.primaryMuscleGroup}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--muted)]">{ex.sets.length} set(s)</span>
        {totalReps > 0 && <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--muted)]">Reps: {totalReps}</span>}
        {ex.totalVolumeKg > 0 && <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[var(--muted)]">Volume: {ex.totalVolumeKg} kg</span>}
      </div>
      <div className="space-y-1 border-t border-[var(--line)] pt-2">
        {ex.sets.map((set) => (
          <div key={set.setNumber} className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--muted)]">
            <span className="font-semibold text-[var(--text)]">Set {set.setNumber}</span>
            {set.reps != null && <span>Reps: {set.reps}</span>}
            {set.weightKg != null && <span>Carga: {set.weightKg} kg</span>}
            {set.durationSec != null && <span>Duração: {set.durationSec}s</span>}
            {set.distanceMeters != null && <span>Dist: {set.distanceMeters} m</span>}
            {set.perceivedExertion != null && <span>RPE: {set.perceivedExertion}</span>}
          </div>
        ))}
      </div>
    </article>
  )
}

function ProfilePostCard({ post, canDelete, isAdminAction, onDelete }: {
  post: FeedPost
  canDelete: boolean
  isAdminAction: boolean
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      {post.photoUrl && <WorkoutPostImage src={post.photoUrl} />}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">{timeAgo(post.createdAt)}</p>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(post.id)}
              className={`shrink-0 rounded-lg border px-2 py-1 text-xs ${
                isAdminAction
                  ? 'border-amber-500/50 text-amber-400'
                  : 'border-red-500/40 text-red-400'
              }`}
              title={isAdminAction ? 'Remover como administrador' : 'Deletar'}
            >
              {isAdminAction ? 'Remover (admin)' : 'Deletar'}
            </button>
          )}
        </div>
        {post.caption && <p className="text-sm text-[var(--text)]">{post.caption}</p>}
        {post.workoutSummary && (
          <div className="rounded-xl border border-[var(--line)] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Duração</p>
                  <p className="text-sm font-bold text-[var(--text)]">{formatDuration(post.workoutSummary.durationSec)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Volume</p>
                  <p className="text-sm font-bold text-[var(--text)]">{post.workoutSummary.totalVolumeKg} kg</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Exercícios</p>
                  <p className="text-sm font-bold text-[var(--text)]">{post.workoutSummary.exercises.length}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)] shrink-0"
              >
                {expanded ? 'Ocultar' : 'Ver stats'}
              </button>
            </div>
            {!expanded && (
              <div className="flex flex-wrap gap-1">
                {post.workoutSummary.exercises.slice(0, 5).map((ex) => (
                  <span key={ex.name} className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    {ex.name} · {ex.sets.length}x
                  </span>
                ))}
                {post.workoutSummary.exercises.length > 5 && (
                  <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                    +{post.workoutSummary.exercises.length - 5}
                  </span>
                )}
              </div>
            )}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden space-y-2"
                >
                  {post.workoutSummary.exercises.map((ex) => (
                    <ExerciseStatsRow key={ex.name} ex={ex} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
          <span>♥</span><span>{post.likesCount}</span>
        </div>
      </div>
    </article>
  )
}

export function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const { authorizedFetch, user: me } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [compare, setCompare] = useState<CompareResult | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [showCompare, setShowCompare] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [openPanel, setOpenPanel] = useState<ListPanel>(null)
  const [panelUsers, setPanelUsers] = useState<SimpleUser[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const [mutuals, setMutuals] = useState<SimpleUser[]>([])
  const [mutualsLoaded, setMutualsLoaded] = useState(false)
  const [viewer, setViewer] = useState<{ src: string; alt: string } | null>(null)

  const isSelf = me?.id === userId

  const load = useCallback(async () => {
    if (!userId) return
    try {
      setLoadingProfile(true)
      const [prof, userPosts] = await Promise.all([
        getPublicProfile(authorizedFetch, userId),
        getUserPosts(authorizedFetch, userId),
      ])
      setProfile(prof)
      setPosts(userPosts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar perfil')
    } finally {
      setLoadingProfile(false)
    }
  }, [authorizedFetch, userId])

  useEffect(() => { void load() }, [load])

  const handleFollow = async () => {
    if (!profile || !userId) return
    try {
      if (profile.isFollowing) {
        await unfollowUser(authorizedFetch, userId)
        setProfile((p) => p ? { ...p, isFollowing: false, followersCount: p.followersCount != null ? p.followersCount - 1 : null } : p)
      } else {
        await followUser(authorizedFetch, userId)
        setProfile((p) => p ? { ...p, isFollowing: true, followersCount: p.followersCount != null ? p.followersCount + 1 : null } : p)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    }
  }

  const openList = async (panel: 'followers' | 'following' | 'mutual') => {
    if (!userId) return
    setOpenPanel(panel)
    setPanelLoading(true)
    setPanelUsers([])
    try {
      const data = panel === 'followers'
        ? await getPublicFollowers(authorizedFetch, userId)
        : panel === 'following'
          ? await getPublicFollowing(authorizedFetch, userId)
          : await getMutualFollowers(authorizedFetch, userId)
      setPanelUsers(data)
      if (panel === 'mutual') { setMutuals(data); setMutualsLoaded(true) }
    } catch { /* silent — server returns 403 if private */ } finally {
      setPanelLoading(false)
    }
  }

  const loadMutuals = useCallback(async () => {
    if (!userId || isSelf || mutualsLoaded) return
    try {
      const data = await getMutualFollowers(authorizedFetch, userId)
      setMutuals(data)
      setMutualsLoaded(true)
    } catch { /* silent */ }
  }, [authorizedFetch, userId, isSelf, mutualsLoaded])

  useEffect(() => { void loadMutuals() }, [loadMutuals])

  const handleCompare = async () => {
    if (!userId) return
    try {
      const result = await compareUsers(authorizedFetch, userId)
      setCompare(result)
      setShowCompare(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao comparar')
    }
  }

  const handleDeletePost = async (postId: string) => {
    const post = posts.find((p) => p.id === postId)
    const isOwn = post?.user.id === me?.id
    const message = !isOwn && me?.role === 'ADMIN'
      ? 'Remover este post como administrador?'
      : 'Deletar este post?'
    if (!window.confirm(message)) return
    try {
      await deletePost(authorizedFetch, postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      setProfile((prev) => prev && prev.postsCount != null ? { ...prev, postsCount: Math.max(0, prev.postsCount - 1) } : prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover post')
    }
  }

  if (loadingProfile) {
    return <p className="text-sm text-[var(--muted)] p-4">Carregando...</p>
  }

  if (!profile) {
    return <p className="text-sm text-red-400 p-4">{error ?? 'Perfil não encontrado'}</p>
  }

  return (
    <section className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl animate-[tech-spin_22s_linear_infinite]"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />
        <div className="relative flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0">
            <div
              aria-hidden
              className="absolute -inset-[3px] rounded-full animate-[tech-spin_10s_linear_infinite]"
              style={{ background: 'var(--tech-gradient-conic)' }}
            />
            {profile.avatarUrl ? (
              <button
                type="button"
                onClick={() => setViewer({ src: profile.avatarUrl!, alt: profile.name ?? 'Avatar' })}
                className="relative h-full w-full overflow-hidden rounded-full bg-[var(--surface-hover)] hover:opacity-90 transition-opacity"
                aria-label="Abrir foto em tamanho cheio"
              >
                <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ) : (
              <div className="relative h-full w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
                <span className="flex h-full w-full items-center justify-center text-xl font-black text-[var(--muted)]">{(profile.name ?? '?')[0]?.toUpperCase()}</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-[var(--text)]">{profile.name ?? 'Usuário'}</h1>
            <p className="text-xs text-[var(--muted)]">Membro desde {new Date(profile.memberSince).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
            <div className="mt-2 flex gap-4 text-sm flex-wrap">
              {profile.followersCount != null ? (
                <>
                  {profile.showFollowLists ? (
                    <button type="button" onClick={() => void openList('followers')} className="text-left hover:opacity-70">
                      <strong>{profile.followersCount}</strong> <span className="text-[var(--muted)]">seguidores</span>
                    </button>
                  ) : (
                    <span><strong>{profile.followersCount}</strong> <span className="text-[var(--muted)]">seguidores</span></span>
                  )}
                  {profile.showFollowLists ? (
                    <button type="button" onClick={() => void openList('following')} className="text-left hover:opacity-70">
                      <strong>{profile.followingCount}</strong> <span className="text-[var(--muted)]">seguindo</span>
                    </button>
                  ) : (
                    <span><strong>{profile.followingCount}</strong> <span className="text-[var(--muted)]">seguindo</span></span>
                  )}
                  <span><strong>{profile.postsCount}</strong> <span className="text-[var(--muted)]">posts</span></span>
                </>
              ) : (
                <span className="text-[var(--muted)] text-xs">Conta privada</span>
              )}
            </div>
            {!isSelf && mutualsLoaded && mutuals.length > 0 && (
              <button
                type="button"
                onClick={() => void openList('mutual')}
                className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)] hover:opacity-70"
              >
                <span className="flex -space-x-1.5">
                  {mutuals.slice(0, 3).map((u) => (
                    <div key={u.id} className="h-5 w-5 rounded-full border border-[var(--surface)] bg-[var(--surface-hover)] overflow-hidden shrink-0">
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                        : <span className="flex h-full w-full items-center justify-center text-[8px] font-bold text-[var(--muted)]">{(u.name ?? '?')[0]?.toUpperCase()}</span>
                      }
                    </div>
                  ))}
                </span>
                <span>
                  {mutuals.length === 1
                    ? `${mutuals[0].name ?? 'Alguém'} te segue`
                    : `${mutuals[0].name ?? 'Alguém'} e +${mutuals.length - 1} em comum`}
                </span>
              </button>
            )}
          </div>
        </div>

        {!isSelf && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleFollow}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                profile.isFollowing
                  ? 'border border-[var(--line)] text-[var(--text)]'
                  : 'bg-[var(--brand)] text-white'
              }`}
            >
              {profile.isFollowing ? 'Seguindo' : 'Seguir'}
            </button>
            <button
              type="button"
              onClick={handleCompare}
              className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Comparar
            </button>
          </div>
        )}

        {isSelf && (
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="mt-3 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
          >
            Editar perfil
          </button>
        )}
      </motion.div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {showCompare && compare && userId && (
        <ComparePanel
          result={compare}
          userId={userId}
          authorizedFetch={authorizedFetch}
          onAvatarClick={(src, alt) => setViewer({ src, alt })}
        />
      )}

      <AnimatePresence>
        {openPanel && (
          <UserListModal
            title={openPanel === 'followers' ? 'Seguidores' : openPanel === 'following' ? 'Seguindo' : 'Em comum'}
            users={panelUsers}
            loading={panelLoading}
            onClose={() => setOpenPanel(null)}
            onNavigate={(id) => navigate(`/u/${id}`)}
          />
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {posts.length === 0 && (
          <p className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
            Nenhum post público ainda.
          </p>
        )}
        {posts.map((post) => {
          const isOwn = post.user.id === me?.id
          const isAdmin = me?.role === 'ADMIN'
          return (
            <ProfilePostCard
              key={post.id}
              post={post}
              canDelete={isOwn || isAdmin}
              isAdminAction={!isOwn && isAdmin}
              onDelete={handleDeletePost}
            />
          )
        })}
      </div>

      <AnimatePresence>
        {viewer && (
          <ImageViewer
            src={viewer.src}
            alt={viewer.alt}
            shape="circle"
            onClose={() => setViewer(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
