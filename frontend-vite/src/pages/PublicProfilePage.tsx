import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  getPublicProfile, getUserPosts, followUser, unfollowUser, compareUsers, compareExercise,
  getPublicFollowers, getPublicFollowing, getMutualFollowers,
  type PublicProfile, type FeedPost, type CompareResult, type WorkoutExerciseSummary,
  type SimpleUser, type ExerciseCompareResult,
} from '../services/socialService'
import { searchExercisesForPlan } from '../services/workoutService'

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

function AnimatedBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2 w-full rounded-full bg-[var(--line)] overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
    </div>
  )
}

function RadialStat({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const pct = max > 0 ? value / max : 0
  const dash = pct * circ
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <motion.circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - dash }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{ transformOrigin: '36px 36px', transform: 'rotate(-90deg)' }}
        />
        <text x="36" y="40" textAnchor="middle" fontSize="14" fontWeight="bold" fill="var(--text)">{value}</text>
      </svg>
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted)] text-center leading-tight">{label}</p>
    </div>
  )
}

function ComparePanel({ result, userId, authorizedFetch }: {
  result: CompareResult
  userId: string
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
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

  const stats7d = result.me.stats.workouts7d + result.them.stats.workouts7d
  const stats30d = result.me.stats.workouts30d + result.them.stats.workouts30d
  const statsVol = result.me.stats.volumeKg7d + result.them.stats.volumeKg7d

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface-hover)] border-b border-[var(--line)] rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
            {result.me.avatarUrl ? <img src={result.me.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-[var(--muted)]">{(result.me.name ?? '?')[0]?.toUpperCase()}</span>}
          </div>
          <span className="text-xs font-bold text-[var(--text)] truncate max-w-[80px]">{result.me.name ?? 'Eu'}</span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--muted)]">vs</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--text)] truncate max-w-[80px] text-right">{result.them.name ?? 'Eles'}</span>
          <div className="h-7 w-7 rounded-full border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
            {result.them.avatarUrl ? <img src={result.them.avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-[var(--muted)]">{(result.them.name ?? '?')[0]?.toUpperCase()}</span>}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Radial circles */}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-2">
            <RadialStat value={result.me.stats.workouts7d} max={Math.max(stats7d, 1)} label={'Treinos\n7d'} color={meColor} />
            <RadialStat value={result.me.stats.workouts30d} max={Math.max(stats30d, 1)} label={'Treinos\n30d'} color={meColor} />
          </div>
          <div className="flex flex-col items-center justify-center gap-1 text-center">
            <p className="text-[9px] uppercase tracking-widest text-[var(--muted)]">Volume 7d</p>
            <p className="text-xs font-black text-[var(--text)]">{result.me.stats.volumeKg7d.toFixed(0)}</p>
            <AnimatedBar value={result.me.stats.volumeKg7d} max={Math.max(statsVol, 1)} color={meColor} />
            <AnimatedBar value={result.them.stats.volumeKg7d} max={Math.max(statsVol, 1)} color={themColor} />
            <p className="text-xs font-black text-[var(--text)]">{result.them.stats.volumeKg7d.toFixed(0)}</p>
            <p className="text-[9px] text-[var(--muted)]">kg</p>
          </div>
          <div className="space-y-2">
            <RadialStat value={result.them.stats.workouts7d} max={Math.max(stats7d, 1)} label={'Treinos\n7d'} color={themColor} />
            <RadialStat value={result.them.stats.workouts30d} max={Math.max(stats30d, 1)} label={'Treinos\n30d'} color={themColor} />
          </div>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 text-[11px] text-[var(--muted)]">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: meColor }} />{result.me.name ?? 'Eu'}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: themColor }} />{result.them.name ?? 'Eles'}</span>
        </div>

        {/* Top exercises */}
        {result.them.stats.topExercises.length > 0 && (
          <div className="rounded-xl border border-[var(--line)] p-3 space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-[var(--muted)] font-semibold">Top exercícios deles (30d)</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {result.them.stats.topExercises.map((e) => (
                <span key={e.name} className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                  {e.name} · {e.count}×
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Exercise comparison */}
        <div className="rounded-xl border border-[var(--line)] p-3 space-y-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--muted)] font-semibold">Comparar exercício específico</p>
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
              <p className="text-sm font-bold text-[var(--text)]">{exCompare.exerciseName} — últimos 30d</p>
              {[
                { label: 'Carga máx (kg)', me: exCompare.me.stats.maxWeightKg, them: exCompare.them.stats.maxWeightKg },
                { label: 'Volume total (kg)', me: exCompare.me.stats.totalVolumeKg, them: exCompare.them.stats.totalVolumeKg },
                { label: 'Total de sets', me: exCompare.me.stats.totalSets, them: exCompare.them.stats.totalSets },
                { label: 'Total de reps', me: exCompare.me.stats.totalReps, them: exCompare.them.stats.totalReps },
              ].map((row) => {
                const total = row.me + row.them || 1
                return (
                  <div key={row.label} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-bold" style={{ color: meColor }}>{row.me}</span>
                      <span className="text-[var(--muted)] text-center">{row.label}</span>
                      <span className="font-bold" style={{ color: themColor }}>{row.them}</span>
                    </div>
                    <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
                      <AnimatedBar value={row.me} max={total} color={meColor} />
                      <AnimatedBar value={row.them} max={total} color={themColor} />
                    </div>
                  </div>
                )
              })}
              {(exCompare.me.stats.bestSet || exCompare.them.stats.bestSet) && (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="rounded-xl border border-[var(--line)] p-2 text-center">
                    <p className="text-[9px] uppercase tracking-wide text-[var(--muted)]">Melhor set ({result.me.name ?? 'eu'})</p>
                    <p className="text-sm font-black text-[var(--text)] mt-0.5">
                      {exCompare.me.stats.bestSet ? `${exCompare.me.stats.bestSet.reps}× ${exCompare.me.stats.bestSet.weightKg}kg` : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--line)] p-2 text-center">
                    <p className="text-[9px] uppercase tracking-wide text-[var(--muted)]">Melhor set ({result.them.name ?? 'eles'})</p>
                    <p className="text-sm font-black text-[var(--text)] mt-0.5">
                      {exCompare.them.stats.bestSet ? `${exCompare.them.stats.bestSet.reps}× ${exCompare.them.stats.bestSet.weightKg}kg` : '—'}
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
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
          <h3 className="text-base font-extrabold text-[var(--text)]">{title}</h3>
          <button type="button" onClick={onClose} className="text-[var(--muted)] text-lg px-1">✕</button>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-[var(--line)]">
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
    </div>
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

function ProfilePostCard({ post }: { post: FeedPost }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
      {post.photoUrl && <img src={post.photoUrl} alt="Foto do treino" className="w-full object-cover max-h-72" />}
      <div className="p-4 space-y-3">
        {post.caption && <p className="text-sm text-[var(--text)]">{post.caption}</p>}
        <p className="text-xs text-[var(--muted)]">{timeAgo(post.createdAt)}</p>
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
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] overflow-hidden">
            {profile.avatarUrl
              ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center text-xl font-black text-[var(--muted)]">{(profile.name ?? '?')[0]?.toUpperCase()}</span>
            }
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
        <ComparePanel result={compare} userId={userId} authorizedFetch={authorizedFetch} />
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
        {posts.map((post) => (
          <ProfilePostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  )
}
