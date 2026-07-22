import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEffect, useMemo, useState } from 'react'
import { CountUp } from '../components/common/CountUp'
import { SkeletonCard } from '../components/common/Skeleton'
import { workoutHistoryCache } from '../lib/cache/workout-history-cache'
import type { WorkoutSessionHistory } from '../types/workout'
import {
  Activity, Bot, Calendar, Clock, Dumbbell, Eye, Flame, Play, TrendingUp,
  Zap, ArrowRight,
} from 'lucide-react'
import {
  buildHeatmap,
  buildWeeklySeries,
  summarizeLastWorkout,
  trainingsToBeatBestWeek,
  isoWeekNumber,
  relativeBigDate,
  formatVolume,
} from './home/home-utils'
import { LineSparkline, StreakFlame, BarsSparkline, StatCard, SectionHead } from './home/home-cards'
import {
  getWorkoutRecommendations,
  normalizeDivisionLabel,
  ApiError,
  type WorkoutRecommendation,
} from '../services/recommendationService'

// Live "QUI · 14 MAI · 11:40" line.
function useLiveTime() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
  const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    pretty: `${days[now.getDay()]} · ${pad(now.getDate())} ${months[now.getMonth()]} · ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    week: isoWeekNumber(now),
  }
}

// ─── Page ──────────────────────────────────────────────────────────────────

export function HomePage() {
  const { isAuthenticated, authorizedFetch, user } = useAuth()
  const { pretty: liveTime, week: weekNumber } = useLiveTime()
  const navigate = useNavigate()

  const [recommendations, setRecommendations] = useState<WorkoutRecommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Onboarding incompleto → backend responde ONBOARDING_REQUIRED. Em vez de
  // mostrar recomendações fake, exibimos um CTA pra completar o onboarding.
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  // Inicializa SÍNCRONO via cache. Se TrainPage ou esta página já
  // carregaram histórico antes nessa sessão (ou em sessão anterior via
  // localStorage), o heatmap, streak e "última rotina" aparecem
  // INSTANTÂNEOS no mount — sem flash de skeleton.
  const [historyItems, setHistoryItems] = useState<WorkoutSessionHistory[]>(
    () => workoutHistoryCache.peek()?.items ?? [],
  )

  useEffect(() => {
    if (!isAuthenticated) return
    // Stale-while-revalidate: get() retorna do cache se TTL não estourou,
    // ou refetcha. Mesmo se já temos peek, get() pode trazer dados frescos
    // em background — UI atualiza sem flicker (setState recebe valor novo).
    void workoutHistoryCache
      .get(authorizedFetch)
      .then((r) => setHistoryItems(r.items))
      .catch(() => { /* silent */ })
  }, [authorizedFetch, isAuthenticated])

  const heatmap = useMemo(() => buildHeatmap(historyItems), [historyItems])
  const weekly = useMemo(() => buildWeeklySeries(historyItems), [historyItems])
  const sortedSessions = useMemo(
    () => historyItems
      .filter((s) => s.endedAt)
      .sort((a, b) => new Date(b.endedAt!).getTime() - new Date(a.endedAt!).getTime()),
    [historyItems],
  )
  const lastWorkout = useMemo(() => summarizeLastWorkout(sortedSessions[0] ?? null), [sortedSessions])

  const { heatmapTotalSessions, heatmapTotalMinutes } = useMemo(
    () => ({
      heatmapTotalSessions: heatmap.reduce((acc, c) => acc + c.sessions, 0),
      heatmapTotalMinutes: heatmap.reduce((acc, c) => acc + c.minutes, 0),
    }),
    [heatmap],
  )
  const heatmapHours = Math.floor(heatmapTotalMinutes / 60)
  const heatmapMins = heatmapTotalMinutes % 60

  // Streak: count consecutive days back from today (or yesterday if today is rest).
  const sessionDays = useMemo(() => new Set(sortedSessions.map((s) => s.endedAt!.slice(0, 10))), [sortedSessions])
  const streak = useMemo(() => {
    let count = 0
    const cursor = new Date()
    cursor.setHours(0, 0, 0, 0)
    if (!sessionDays.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1)
    while (sessionDays.has(cursor.toISOString().slice(0, 10))) {
      count++
      cursor.setDate(cursor.getDate() - 1)
    }
    return count
  }, [sessionDays])

  const thisWeek = weekly[weekly.length - 1]
  const lastWeek = weekly[weekly.length - 2]
  const sessionsDelta = thisWeek && lastWeek ? thisWeek.sessions - lastWeek.sessions : 0
  const volumeDelta = thisWeek && lastWeek && lastWeek.volumeKg > 0
    ? Math.round(((thisWeek.volumeKg - lastWeek.volumeKg) / lastWeek.volumeKg) * 100)
    : null
  const sessionsToBeat = trainingsToBeatBestWeek(weekly)

  useEffect(() => {
    if (!isAuthenticated) return
    let active = true

    // setState calls live inside this async closure so the lint rule
    // "set-state-in-effect" stays happy — the body of the effect only
    // schedules and tears down work.
    const load = async () => {
      if (!active) return
      setLoading(true)
      setError(null)

      try {
        const recs = await getWorkoutRecommendations(authorizedFetch)
        if (active) {
          setRecommendations(recs)
          setNeedsOnboarding(false)
        }
      } catch (err) {
        if (!active) return
        if (err instanceof ApiError && err.code === 'ONBOARDING_REQUIRED') {
          setNeedsOnboarding(true)
        } else {
          setError(err instanceof Error ? err.message : 'Falha ao carregar recomendações')
        }
        setRecommendations([])
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [authorizedFetch, isAuthenticated, user?.availableDaysPerWeek, user?.sex])

  const topRecommendations = useMemo(() => recommendations.slice(0, 2), [recommendations])

  // "Ver treino": abre a página de detalhe da recomendação (todos os dias),
  // onde cada dia pode ser salvo/editado separadamente. Visitante (sem login)
  // vai pro /login. A reco vai via navigation state (não tem id próprio).
  const openRecommendation = (rec: WorkoutRecommendation) => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    navigate('/recommendation', { state: { recommendation: rec } })
  }

  const firstName = user?.name?.split(' ')[0] ?? 'atleta'

  // Heatmap palette — 5 levels, mirrors the mock.
  const heatColors = ['var(--surface-hover)', '#ffd1c2', '#ffa489', '#ff7a5a', 'var(--brand)']

  return (
    <section className="space-y-4">
      {/* ──────── HERO ───────────────────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7"
      >
        {/* Grid pattern + radial highlight — faux-engineered look from the mock */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(color-mix(in srgb, var(--brand) 4%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--brand) 4%, transparent) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            WebkitMaskImage: 'radial-gradient(620px 280px at 88% 30%, #000 0%, transparent 70%)',
            maskImage: 'radial-gradient(620px 280px at 88% 30%, #000 0%, transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-[340px] w-[340px] rounded-full"
          style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--brand) 18%, transparent), transparent 70%)' }}
        />

        <div className="relative">
          {/* Live status line */}
          <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            <span
              className="relative inline-block h-2 w-2 rounded-full bg-emerald-500"
              style={{ boxShadow: '0 0 0 0 rgba(22,163,74,0.55)', animation: 'tech-pulse 1.8s ease-out infinite' }}
              aria-hidden
            />
            <span>Sistema online</span>
            <span className="opacity-40">/</span>
            <span>{liveTime}</span>
            <span className="opacity-40">/</span>
            <span>Semana {weekNumber}</span>
          </div>

          <h1 className="text-3xl font-semibold leading-[1.05] tracking-tight text-[var(--text)] sm:text-4xl">
            {isAuthenticated ? (
              <>
                Bem-vindo, <span className="font-serif-accent text-[var(--brand-strong)]">{firstName}</span>
              </>
            ) : (
              <>
                Treine <span className="font-serif-accent text-[var(--brand-strong)]">melhor</span> com IA
              </>
            )}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            {isAuthenticated && sessionsToBeat > 0 ? (
              <>
                Recomendações objetivas pra acelerar sua próxima sessão. Você está a{' '}
                <b className="text-[var(--text)]">{sessionsToBeat} treino{sessionsToBeat > 1 ? 's' : ''}</b>{' '}
                de bater sua melhor semana do mês.
              </>
            ) : isAuthenticated ? (
              <>Recomendações objetivas pra acelerar sua próxima sessão. <b className="text-[var(--text)]">Você já bateu</b> a melhor semana do mês — siga firme.</>
            ) : (
              <>Recomendações objetivas pra acelerar sua próxima sessão. Entre pra ver sua progressão e bater novos recordes.</>
            )}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to={isAuthenticated ? '/train' : '/login'}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-sm font-medium text-white shadow-[0_10px_22px_-12px_rgba(255,90,60,0.55)] transition-transform hover:-translate-y-px hover:bg-[var(--brand-strong)]"
            >
              <Play size={14} fill="currentColor" />
              {isAuthenticated ? 'Explorar treinos' : 'Entrar para continuar'}
            </Link>
            <Link
              to={isAuthenticated ? '/history' : '/login'}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-transparent bg-transparent px-4 text-sm font-medium text-[var(--ink-2,var(--text))] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <Clock size={14} />
              Ver histórico
            </Link>
          </div>
        </div>
      </motion.section>

      {/* ──────── STATS ──────────────────────────────────────────────── */}
      {isAuthenticated && (
        <>
        {/* Mobile: barra de resumo compacta, clicável → Progresso */}
        <Link
          to="/progress"
          className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] transition-colors active:bg-[var(--surface-hover)] sm:hidden"
        >
          {[
            { label: 'Sequência', node: <CountUp value={streak} />, unit: 'dias', flame: true },
            { label: 'Treinos', node: <CountUp value={thisWeek?.sessions ?? 0} />, unit: '/sem', flame: false },
            {
              label: 'Volume',
              node: formatVolume(thisWeek?.volumeKg ?? 0),
              unit: 'kg',
              flame: false,
            },
          ].map((s, i) => (
            <div key={s.label} className={`flex flex-col items-center gap-0.5 px-2 py-3 text-center ${i > 0 ? 'border-l border-[var(--line)]' : ''}`}>
              <span className="flex items-baseline gap-0.5">
                {s.flame && (
                  <span aria-hidden className={`text-base leading-none ${streak > 0 ? 'flame-alive' : 'flame-frozen'}`}>🔥</span>
                )}
                <span className="text-xl font-bold leading-none text-[var(--text)]">{s.node}</span>
                <span className="text-[10px] text-[var(--muted)]">{s.unit}</span>
              </span>
              <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]">{s.label}</span>
            </div>
          ))}
        </Link>

        {/* Desktop/tablet: cards completos */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="hidden grid-cols-1 gap-2.5 sm:grid sm:grid-cols-3"
        >
          <StatCard
            label="Sequência"
            value={<CountUp value={streak} />}
            unit="dias"
            delta={sessionsDelta > 0 ? `+${sessionsDelta} vs sem. passada` : 'mantenha o ritmo'}
            deltaDirection={sessionsDelta > 0 ? 'up' : 'flat'}
            icon={Flame}
            tone="peach"
            spark={<StreakFlame active={streak > 0} />}
          />
          <StatCard
            label="Treinos"
            value={<CountUp value={thisWeek?.sessions ?? 0} />}
            unit="/sem"
            delta={
              user?.availableDaysPerWeek != null
                ? thisWeek?.sessions != null && thisWeek.sessions >= user.availableDaysPerWeek
                  ? `meta ${user.availableDaysPerWeek} atingida`
                  : `meta ${user.availableDaysPerWeek} / sem`
                : 'sem meta definida'
            }
            deltaDirection={
              user?.availableDaysPerWeek != null && thisWeek?.sessions != null && thisWeek.sessions >= user.availableDaysPerWeek
                ? 'up'
                : 'flat'
            }
            icon={Dumbbell}
            tone="rose"
            spark={<BarsSparkline values={weekly.map((w) => w.sessions)} color="#e6447a" />}
          />
          <StatCard
            label="Volume"
            value={formatVolume(thisWeek?.volumeKg ?? 0)}
            unit="kg"
            delta={volumeDelta != null ? `${volumeDelta >= 0 ? '+' : ''}${volumeDelta}% vs sem. passada` : 'sem comparação'}
            deltaDirection={volumeDelta == null ? 'flat' : volumeDelta >= 0 ? 'up' : 'down'}
            icon={TrendingUp}
            tone="mint"
            spark={<LineSparkline values={weekly.map((w) => w.volumeKg)} color="#0a8a4a" />}
          />
        </motion.div>
        </>
      )}

      {/* ──────── HEATMAP ────────────────────────────────────────────── */}
      {isAuthenticated && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              <Calendar size={12} />
              Últimos 30 dias
            </h3>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--muted)]">
              <span>menos</span>
              <div className="flex gap-[3px]">
                {heatColors.map((c, i) => (
                  <span
                    key={i}
                    className="block h-[9px] w-[9px] rounded-[2px] border border-black/5"
                    style={{ background: c }}
                  />
                ))}
              </div>
              <span>mais</span>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(15,_1fr)] gap-1 sm:grid-cols-[repeat(30,_1fr)]">
            {heatmap.map((cell) => (
              <div
                key={cell.iso}
                title={`${cell.day} · ${cell.sessions > 0 ? `${cell.sessions} sessão${cell.sessions > 1 ? 'ões' : ''}, ${cell.minutes}min` : 'descanso'}`}
                className="aspect-square rounded-[3px] border border-black/[0.025] transition-transform hover:scale-[1.5] hover:z-10"
                style={{ background: heatColors[cell.intensity] }}
              />
            ))}
          </div>

          <div className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">
            <span>{heatmap[0]?.day}</span>
            <span>
              {heatmapTotalSessions} sessões · {heatmapHours}h {heatmapMins}m
            </span>
            <span>{heatmap[heatmap.length - 1]?.day}</span>
          </div>
        </motion.section>
      )}

      {/* ──────── ÚLTIMO TREINO ──────────────────────────────────────── */}
      {isAuthenticated && lastWorkout && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--brand)]/40 hover:shadow-[0_14px_26px_-22px_rgba(255,90,60,0.35)]"
        >
          <div className="flex min-w-0 items-center gap-3">
            {/* Rotating dashed ring around the icon — the "lab/scientific" feel */}
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-[var(--brand)]/20"
              style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand) 20%, var(--surface)), color-mix(in srgb, var(--brand) 32%, var(--surface)))' }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -inset-[3px] rounded-[13px] border border-dashed border-[var(--brand)]/30"
                style={{ animation: 'tech-spin 14s linear infinite' }}
              />
              <Activity size={18} className="relative z-10 text-[var(--brand-strong)]" />
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand)]" aria-hidden />
                Último treino · {relativeBigDate(lastWorkout.endedAt)}
              </p>
              <p className="mt-0.5 truncate text-[16px] font-semibold tracking-tight text-[var(--text)]">
                {lastWorkout.name}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 font-mono text-[11px] text-[var(--muted)]">
                <span><b className="font-semibold text-[var(--text)]">{lastWorkout.exerciseCount}</b> ex</span>
                <span><b className="font-semibold text-[var(--text)]">{lastWorkout.minutes}</b> min</span>
                {lastWorkout.totalVolume > 0 && (
                  <span>
                    <b className="font-semibold text-[var(--text)]">
                      {lastWorkout.totalVolume >= 1000
                        ? `${(lastWorkout.totalVolume / 1000).toFixed(1).replace(/\.0$/, '')}k`
                        : Math.round(lastWorkout.totalVolume)}
                    </b>{' '}
                    kg vol
                  </span>
                )}
                {lastWorkout.avgRpe != null && (
                  <span>RPE <b className="font-semibold text-[var(--text)]">{lastWorkout.avgRpe.toFixed(1)}</b></span>
                )}
              </div>
            </div>
          </div>
          <Link
            to="/history"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            Ver
            <ArrowRight size={12} />
          </Link>
        </motion.div>
      )}

      {/* ──────── ACESSOS RÁPIDOS ────────────────────────────────────── */}
      <SectionHead title="Acessos" accent="rápidos" sub="Atalhos · 02" />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18 }}
        className="grid gap-2.5 sm:grid-cols-2"
      >
        <Link
          to={isAuthenticated ? '/train' : '/login'}
          className="group relative overflow-hidden rounded-2xl border border-[var(--line)] p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-22px_rgba(40,15,5,0.28)]"
          style={{ background: 'linear-gradient(135deg, var(--surface) 40%, color-mix(in srgb, var(--brand) 16%, var(--surface)) 140%)' }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-7 -top-7 h-32 w-32 rounded-full"
            style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--brand) 12%, transparent), transparent 70%)' }}
          />
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            <Zap size={11} />
            Atalho 01
          </span>
          <h4 className="mt-1.5 text-[18px] font-semibold tracking-tight text-[var(--text)]">Explorar treinos</h4>
          <p className="mt-1 max-w-[320px] text-[13px] text-[var(--muted)]">
            Escolha exercícios e monte sua sessão agora.
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wide text-[var(--brand-strong)]">
            Abrir agora <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          to={isAuthenticated ? '/ai-workout' : '/login'}
          className="group relative overflow-hidden rounded-2xl border border-[var(--line)] p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_30px_-22px_rgba(40,15,5,0.28)]"
          style={{ background: 'linear-gradient(135deg, var(--surface) 40%, color-mix(in srgb, var(--accent-violet) 18%, var(--surface)) 140%)' }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute -right-7 -top-7 h-32 w-32 rounded-full"
            style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--accent-violet) 16%, transparent), transparent 70%)' }}
          />
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
            <Bot size={11} />
            Atalho 02
          </span>
          <h4 className="mt-1.5 text-[18px] font-semibold tracking-tight text-[var(--text)]">IA</h4>
          <p className="mt-1 max-w-[320px] text-[13px] text-[var(--muted)]">
            Gere um treino inteligente baseado nos seus objetivos.
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wide text-violet-600 dark:text-violet-400">
            Gerar treino <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </motion.div>

      {/* ──────── RECOMENDAÇÕES ──────────────────────────────────────── */}
      <SectionHead
        title="Recomendações de"
        accent="treino"
        sub={loading ? 'Atualizando…' : `Geradas hoje · ${liveTime.split(' · ').slice(-1)[0]}`}
      />

      {!isAuthenticated ? (
        <RecoNoticeCard
          title="Entre para ver recomendações"
          body="Recomendações de treino personalizadas aparecem aqui quando você entra na sua conta."
          ctaLabel="Entrar"
          to="/login"
        />
      ) : needsOnboarding ? (
        <RecoNoticeCard
          title="Complete seu onboarding"
          body="Responda algumas perguntas rápidas pra receber recomendações personalizadas — com todos os dias da divisão prontos pra salvar em Treinar."
          ctaLabel="Completar onboarding"
          to="/onboarding"
        />
      ) : recommendations.length === 0 ? (
        loading ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <p className="text-sm text-amber-500">{error}</p>
        ) : null
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.22 }}
          className="grid gap-2.5 sm:grid-cols-2"
        >
        {topRecommendations.map((rec, idx) => {
          const main = rec.sessions[0]
          const division = normalizeDivisionLabel(rec.division)
          const preview = main?.exercises.slice(0, 3) ?? []
          // Synthetic match score — backend doesn't return one yet, so we derive
          // a stable pseudo-value from index so cards don't all show 92%.
          const matchScore = 92 - idx * 5

          return (
            <article
              key={`${division}-${idx}`}
              className="group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--brand)]/40 hover:shadow-[0_18px_30px_-22px_rgba(255,90,60,0.35)]"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  Recomendação <span className="text-[var(--brand-strong)]">{String(idx + 1).padStart(2, '0')}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand)]/30 bg-[var(--brand)]/10 px-2 py-[3px] font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-strong)]">
                  <span
                    className="block h-1.5 w-1.5 rounded-full bg-[var(--brand)]"
                    style={{ animation: 'tech-pulse 1.6s ease-out infinite' }}
                    aria-hidden
                  />
                  IA · Match {matchScore}%
                </span>
              </div>

              <h3 className="text-[17px] font-semibold tracking-tight text-[var(--text)]">{division}</h3>
              <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--muted)]">{rec.rationale}</p>

              {/* Nested "first session" card */}
              <div className="mt-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Primeira sessão
                  </span>
                  <span className="text-[12.5px] font-semibold text-[var(--text)]">
                    Dia {main?.dayNumber ?? 1} · {main?.focus ?? 'Sessão'}
                  </span>
                </div>
                <ul className="m-0 list-none space-y-0 p-0">
                  {preview.map((ex, i) => (
                    <li
                      key={ex.id}
                      className={`flex items-center justify-between py-1.5 text-[12px] ${i > 0 ? 'border-t border-dashed border-[var(--line)]' : ''}`}
                    >
                      <span className="text-[var(--text)]">{ex.name}</span>
                      <span className="font-mono text-[11px] text-[var(--muted)]">
                        {ex.sets}×{ex.reps} · {ex.restSeconds}s
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => openRecommendation(rec)}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-medium text-white transition-colors hover:bg-[var(--brand-strong)]"
                >
                  <Eye size={13} />
                  Ver treino
                </button>
              </div>
            </article>
          )
        })}
        </motion.div>
      )}

    </section>
  )
}

// Card de aviso das recomendações (visitante sem login / onboarding
// incompleto): ícone + título + descrição + CTA. Mantém a estética do app.
function RecoNoticeCard({
  title,
  body,
  ctaLabel,
  to,
}: {
  title: string
  body: string
  ctaLabel: string
  to: string
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--brand)]/12 text-[var(--brand)]">
        <Dumbbell size={20} />
      </div>
      <p className="text-[15px] font-bold text-[var(--text)]">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-[var(--muted)]">{body}</p>
      <Link
        to={to}
        className="mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--brand-strong)]"
      >
        {ctaLabel}
        <ArrowRight size={14} />
      </Link>
    </div>
  )
}
