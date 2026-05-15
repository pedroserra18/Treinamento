import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import {
  compareExercise,
  type CompareResult,
  type ExerciseCompareResult,
} from '../../services/socialService'
import { searchExercisesForPlan } from '../../services/workoutService'
import {
  BarChart2, Calendar, Crown, Dumbbell, Search, TrendingUp,
} from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatNumberFull(n: number): string {
  return Math.round(n).toLocaleString('pt-BR')
}

function pctDiff(me: number, them: number): number | null {
  if (them <= 0) return me > 0 ? 100 : null
  return Math.round(((me - them) / them) * 100)
}

// ─── Avatar with rotating dashed ring ─────────────────────────────────────

type AvatarTone = 'brand' | 'rival'

function VsAvatar({
  initial,
  url,
  tone,
  isWinner,
  onClick,
}: {
  initial: string
  url: string | null
  tone: AvatarTone
  isWinner: boolean
  onClick?: () => void
}) {
  const gradient = tone === 'brand'
    ? 'linear-gradient(135deg, #ff7a5a, var(--brand))'
    : 'linear-gradient(135deg, #4d505a, #2a2c33)'

  const ringColor = tone === 'brand' ? 'rgba(255,90,60,0.4)' : 'rgba(40,40,50,0.35)'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!url && !onClick}
      className="relative h-[62px] w-[62px] shrink-0 disabled:cursor-default"
      aria-label="Avatar"
    >
      {/* Dashed rotating ring — uses tech-spin keyframe already in index.css */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-full border border-dashed"
        style={{
          borderColor: ringColor,
          animation: `tech-spin 18s linear ${tone === 'rival' ? 'reverse' : 'normal'} infinite`,
        }}
      />
      <span
        className="grid h-full w-full place-items-center overflow-hidden rounded-full text-white"
        style={{
          background: gradient,
          border: '3px solid var(--surface)',
          boxShadow: tone === 'brand'
            ? '0 6px 14px -6px rgba(255,90,60,0.5)'
            : '0 6px 14px -6px rgba(40,40,50,0.5)',
        }}
      >
        {url
          ? <img src={url} alt="" className="h-full w-full object-cover" />
          : <span className="font-serif-accent text-[30px] leading-none">{initial}</span>}
      </span>
      {isWinner && (
        <span
          className="absolute -right-1 -top-2 grid h-[22px] w-[22px] place-items-center rounded-full text-[#5a4209]"
          style={{
            background: '#f4c443',
            border: '2px solid var(--surface)',
            boxShadow: '0 4px 8px -2px rgba(0,0,0,0.2)',
          }}
          title="Líder"
        >
          <Crown size={11} fill="currentColor" />
        </span>
      )}
    </button>
  )
}

// ─── VS hero ──────────────────────────────────────────────────────────────

function VsHero({
  meName,
  meAvatar,
  meHandle,
  themName,
  themAvatar,
  themHandle,
  meIsWinner,
  themIsWinner,
  onAvatarClick,
}: {
  meName: string
  meAvatar: string | null
  meHandle: string | null
  themName: string
  themAvatar: string | null
  themHandle: string | null
  meIsWinner: boolean
  themIsWinner: boolean
  onAvatarClick: (url: string, alt: string) => void
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
      {/* Faux blueprint grid mask — same vibe as the Home hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(color-mix(in srgb, var(--brand) 4%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--brand) 4%, transparent) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          WebkitMaskImage: 'radial-gradient(620px 250px at 50% 50%, #000 0%, transparent 70%)',
          maskImage: 'radial-gradient(620px 250px at 50% 50%, #000 0%, transparent 70%)',
        }}
      />

      <div className="relative grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        {/* You (left, brand-colored) */}
        <div className="flex items-center gap-4">
          <VsAvatar
            initial={(meName[0] ?? '?').toUpperCase()}
            url={meAvatar}
            tone="brand"
            isWinner={meIsWinner}
            onClick={() => meAvatar && onAvatarClick(meAvatar, meName)}
          />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
              Você
            </p>
            <p className="mt-0.5 truncate text-[18px] font-semibold tracking-tight text-[var(--text)] sm:text-[20px]">
              {meName}
            </p>
            {meHandle && (
              <p className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--muted)]">
                @{meHandle}
              </p>
            )}
          </div>
        </div>

        {/* VS core — animated stroke ring + serif italic "vs" */}
        <div className="relative mx-auto grid h-[88px] w-[88px] place-items-center justify-self-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <linearGradient id="vsRingGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#ff7a5a" />
                <stop offset="1" stopColor="#2a2c33" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--line)" strokeWidth="2" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="url(#vsRingGrad)"
              strokeWidth="2.5"
              strokeDasharray="40 20"
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="-90 50 50"
                to="270 50 50"
                dur="24s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
          <span
            className="font-serif-accent text-[34px] leading-none text-[var(--text)]"
            style={{ paddingBottom: 4 }}
          >
            vs
          </span>
        </div>

        {/* Rival (right, neutral) — flips to row-reverse so the avatar is on the outside */}
        <div className="flex items-center gap-4 sm:flex-row-reverse sm:text-right">
          <VsAvatar
            initial={(themName[0] ?? '?').toUpperCase()}
            url={themAvatar}
            tone="rival"
            isWinner={themIsWinner}
            onClick={() => themAvatar && onAvatarClick(themAvatar, themName)}
          />
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Rival
            </p>
            <p className="mt-0.5 truncate text-[18px] font-semibold tracking-tight text-[var(--text)] sm:text-[20px]">
              {themName}
            </p>
            {themHandle && (
              <p className="mt-0.5 truncate font-mono text-[10.5px] text-[var(--muted)]">
                @{themHandle}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Metric card (one row per player + footer with gap and trend) ─────────

type MetricTone = 'lead-me' | 'lead-them' | 'tie' | 'empty'

function MetricCard({
  icon, label, unit,
  meName, themName,
  meValue, themValue,
  delay = 0,
}: {
  icon: React.ReactNode
  label: string
  unit?: string
  meName: string
  themName: string
  meValue: number
  themValue: number
  delay?: number
}) {
  const max = Math.max(meValue, themValue, 1)
  const mePct = (meValue / max) * 100
  const themPct = (themValue / max) * 100

  const tone: MetricTone = meValue === 0 && themValue === 0
    ? 'empty'
    : meValue === themValue
      ? 'tie'
      : meValue > themValue
        ? 'lead-me'
        : 'lead-them'

  const diff = Math.abs(meValue - themValue)
  const winnerName = tone === 'lead-me' ? meName : themName
  const winnerLeads = tone === 'lead-me' || tone === 'lead-them'

  // Real percentage difference for the footer chip — clamped, not faked.
  const rawPct = pctDiff(meValue, themValue)
  const trendLabel = rawPct == null
    ? '—'
    : rawPct > 0
      ? `+${rawPct}% vs ${themName}`
      : rawPct < 0
        ? `${rawPct}% vs ${themName}`
        : `igualado`

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay }}
      className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"
    >
      <header className="mb-3.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          <span className="text-[var(--muted)]">{icon}</span>
          {label}
        </h3>
        {winnerLeads && (
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-[3px] font-mono text-[10px] font-semibold uppercase tracking-[0.06em]"
            style={{
              borderColor: tone === 'lead-me' ? 'color-mix(in srgb, var(--brand) 30%, transparent)' : 'rgba(40,40,50,0.25)',
              background: tone === 'lead-me' ? 'var(--brand)/10' : 'rgba(40,40,50,0.08)',
              color: tone === 'lead-me' ? 'var(--brand-strong)' : '#2a2c33',
            }}
          >
            ▲ {winnerName.toUpperCase()} VENCENDO
          </span>
        )}
      </header>

      <div className="space-y-2.5">
        <BarRow name={meName} pct={mePct} value={meValue} unit={unit} tone="brand" />
        <BarRow name={themName} pct={themPct} value={themValue} unit={unit} tone="rival" />
      </div>

      <footer className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-[var(--line)] pt-3 font-mono text-[11px] text-[var(--muted)]">
        {tone === 'empty' ? (
          <span>Sem dados nesse intervalo.</span>
        ) : tone === 'tie' ? (
          <span>Empate em <b className="font-semibold text-[var(--text)]">{formatNumberFull(meValue)}{unit ? ` ${unit}` : ''}</b>.</span>
        ) : (
          <span>
            <b className="font-semibold text-[var(--text)]">{winnerName}</b> está à frente por{' '}
            <span className="font-semibold text-[var(--brand-strong)]">
              {formatNumberFull(diff)}{unit ? ` ${unit}` : ''}
            </span>
          </span>
        )}
        {tone !== 'empty' && tone !== 'tie' && (
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp size={11} className="text-[var(--brand-strong)]" />
            <b className="font-semibold text-[var(--brand-strong)]">{trendLabel}</b>
          </span>
        )}
      </footer>
    </motion.article>
  )
}

function BarRow({
  name, pct, value, unit, tone,
}: {
  name: string
  pct: number
  value: number
  unit?: string
  tone: AvatarTone
}) {
  const dotBg = tone === 'brand' ? 'var(--brand)' : '#2a2c33'
  const fillBg = tone === 'brand'
    ? 'linear-gradient(90deg, #ff7a5a, var(--brand))'
    : 'linear-gradient(90deg, #4d505a, #2a2c33)'

  return (
    <div
      className="grid items-center gap-3"
      style={{ gridTemplateColumns: 'minmax(60px, 80px) 1fr 60px' }}
    >
      <div className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight text-[var(--text)]">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dotBg }} />
        <span className="truncate">{name}</span>
      </div>
      <div
        className="relative h-2.5 overflow-hidden rounded-full border border-[var(--line)]"
        style={{ background: 'var(--surface-hover)' }}
      >
        {/* 10% tick marks for visual scale, just like the mock */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(90deg, color-mix(in srgb, var(--text) 6%, transparent) 1px, transparent 1px)',
            backgroundSize: '10% 100%',
          }}
        />
        <motion.div
          className="h-full rounded-full"
          style={{ background: fillBg }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
        />
      </div>
      <div className="text-right font-mono text-[13px] font-semibold tabular-nums text-[var(--text)]">
        {formatNumberFull(value)}
        {unit && <span className="ml-0.5 text-[10px] font-medium text-[var(--muted)]">{unit}</span>}
      </div>
    </div>
  )
}

// ─── Top exercises (rival, 30D — the only window the backend returns) ─────

function TopExercises({
  themName,
  exercises,
}: {
  themName: string
  exercises: Array<{ name: string; count: number }>
}) {
  if (exercises.length === 0) return null
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: 0.18 }}
      className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          <span className="h-2 w-2 rounded-full bg-[#2a2c33]" />
          Top exercícios — {themName}
        </h3>
        <span className="rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-[3px] font-mono text-[10px] font-semibold tracking-[0.06em] text-[var(--muted)]">
          30D
        </span>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {exercises.map((e) => (
          <span
            key={e.name}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--text)] transition-all hover:-translate-y-px hover:bg-[var(--surface)] hover:shadow-[0_8px_16px_-10px_rgba(40,15,5,0.2)]"
          >
            {e.name}
            <span className="rounded-full bg-[var(--brand)] px-2 py-[1px] font-mono text-[10.5px] font-semibold text-white">
              {e.count}
            </span>
          </span>
        ))}
      </div>
    </motion.section>
  )
}

// ─── Specific exercise comparison (search + result detail) ────────────────

function ExerciseSearch({
  userId,
  authorizedFetch,
  meName,
  themName,
}: {
  userId: string
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  meName: string
  themName: string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([])
  const [picked, setPicked] = useState<ExerciseCompareResult | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd/Ctrl + K focuses the search field — the kbd hint advertises it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const search = (q: string) => {
    setQuery(q)
    if (timer.current) clearTimeout(timer.current)
    if (!q.trim()) {
      setResults([])
      return
    }
    timer.current = setTimeout(async () => {
      try {
        const data = await searchExercisesForPlan(authorizedFetch, { q: q.trim(), limit: 6 })
        setResults(data.map((e) => ({ id: e.id, name: e.name })))
      } catch { /* silent */ }
    }, 350)
  }

  const pick = async (id: string, name: string) => {
    setQuery(name)
    setResults([])
    setLoading(true)
    try {
      const data = await compareExercise(authorizedFetch, userId, id)
      setPicked(data)
    } catch {
      setPicked(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut', delay: 0.22 }}
      className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"
    >
      <h3 className="mb-3 flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        <Search size={12} />
        Comparar exercício específico
      </h3>

      <label
        className="relative flex items-center rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5 transition-colors focus-within:border-[var(--brand)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_18%,transparent)]"
      >
        <Search size={14} className="mr-2 text-[var(--muted)]" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Pesquisar exercício…"
          className="flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
        />
        <kbd className="hidden rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 py-[2px] font-mono text-[10px] text-[var(--muted)] sm:inline">
          ⌘ K
        </kbd>
      </label>

      {results.length > 0 && (
        <div className="mt-2 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface-hover)]">
          {results.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => void pick(ex.id, ex.name)}
              className="flex w-full px-3 py-2.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface)]"
            >
              {ex.name}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="mt-3 font-mono text-[11px] text-[var(--muted)]">Carregando…</p>}

      {picked && !loading && (
        <ExerciseCompareDetail data={picked} meName={meName} themName={themName} />
      )}
    </motion.section>
  )
}

function ExerciseCompareDetail({
  data, meName, themName,
}: {
  data: ExerciseCompareResult
  meName: string
  themName: string
}) {
  const meBestVol = data.me.stats.bestSet ? data.me.stats.bestSet.reps * data.me.stats.bestSet.weightKg : 0
  const themBestVol = data.them.stats.bestSet ? data.them.stats.bestSet.reps * data.them.stats.bestSet.weightKg : 0

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[14px] font-semibold tracking-tight text-[var(--text)]">
          {data.exerciseName}
        </p>
        <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
          últimos 30D
        </span>
      </div>

      <MetricCard
        icon={<Dumbbell size={11} />}
        label="Carga máxima"
        unit="kg"
        meName={meName}
        themName={themName}
        meValue={data.me.stats.maxWeightKg}
        themValue={data.them.stats.maxWeightKg}
      />
      <MetricCard
        icon={<TrendingUp size={11} />}
        label="Maior volume em 1 série"
        unit="kg"
        meName={meName}
        themName={themName}
        meValue={meBestVol}
        themValue={themBestVol}
        delay={0.04}
      />
      <MetricCard
        icon={<BarChart2 size={11} />}
        label="Total de séries"
        meName={meName}
        themName={themName}
        meValue={data.me.stats.totalSets}
        themValue={data.them.stats.totalSets}
        delay={0.08}
      />
      <MetricCard
        icon={<BarChart2 size={11} />}
        label="Total de repetições"
        meName={meName}
        themName={themName}
        meValue={data.me.stats.totalReps}
        themValue={data.them.stats.totalReps}
        delay={0.12}
      />

      {(data.me.stats.bestSet || data.them.stats.bestSet) && (
        <div className="grid grid-cols-2 gap-2">
          <BestSetCard tone="brand" name={meName} bestSet={data.me.stats.bestSet} />
          <BestSetCard tone="rival" name={themName} bestSet={data.them.stats.bestSet} />
        </div>
      )}
    </div>
  )
}

function BestSetCard({
  tone, name, bestSet,
}: {
  tone: AvatarTone
  name: string
  bestSet: { reps: number; weightKg: number } | null
}) {
  const ringColor = tone === 'brand' ? 'color-mix(in srgb, var(--brand) 25%, transparent)' : 'rgba(40,40,50,0.18)'
  const labelColor = tone === 'brand' ? 'var(--brand-strong)' : '#2a2c33'
  return (
    <div
      className="rounded-xl border bg-[var(--surface)] p-3 text-center"
      style={{ borderColor: ringColor }}
    >
      <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em]" style={{ color: labelColor }}>
        Melhor set · {name}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums tracking-tight text-[var(--text)]">
        {bestSet ? `${bestSet.reps}× ${bestSet.weightKg}kg` : '—'}
      </p>
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────

export function UserComparePanel({
  result, userId, authorizedFetch, onAvatarClick, themHandle,
}: {
  result: CompareResult
  userId: string
  authorizedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onAvatarClick: (src: string, alt: string) => void
  themHandle?: string | null
}) {
  const meName = result.me.name?.split(' ')[0] ?? 'Você'
  const themName = result.them.name?.split(' ')[0] ?? 'Rival'

  // The crown goes to whoever leads on 7-day workouts. Tie or both-zero =
  // no crown — we don't fake a winner.
  const meIsWinner = result.me.stats.workouts7d > result.them.stats.workouts7d
  const themIsWinner = result.them.stats.workouts7d > result.me.stats.workouts7d

  return (
    <div className="space-y-3">
      <VsHero
        meName={meName}
        meAvatar={result.me.avatarUrl}
        meHandle={null}
        themName={themName}
        themAvatar={result.them.avatarUrl}
        themHandle={themHandle ?? null}
        meIsWinner={meIsWinner}
        themIsWinner={themIsWinner}
        onAvatarClick={onAvatarClick}
      />

      <MetricCard
        icon={<Calendar size={11} />}
        label="Treinos · últimos 7 dias"
        meName={meName}
        themName={themName}
        meValue={result.me.stats.workouts7d}
        themValue={result.them.stats.workouts7d}
        delay={0.06}
      />
      <MetricCard
        icon={<Calendar size={11} />}
        label="Treinos · últimos 30 dias"
        meName={meName}
        themName={themName}
        meValue={result.me.stats.workouts30d}
        themValue={result.them.stats.workouts30d}
        delay={0.1}
      />
      <MetricCard
        icon={<Dumbbell size={11} />}
        label="Volume · últimos 7 dias"
        unit="kg"
        meName={meName}
        themName={themName}
        meValue={result.me.stats.volumeKg7d}
        themValue={result.them.stats.volumeKg7d}
        delay={0.14}
      />

      <TopExercises themName={themName} exercises={result.them.stats.topExercises} />

      <ExerciseSearch
        userId={userId}
        authorizedFetch={authorizedFetch}
        meName={meName}
        themName={themName}
      />
    </div>
  )
}
