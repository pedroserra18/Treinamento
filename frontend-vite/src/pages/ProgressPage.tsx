import { motion, AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageViewer } from '../components/common/ImageViewer'
import { Skeleton } from '../components/common/Skeleton'
import { useAuth } from '../hooks/useAuth'
import { optimizeImageFileToDataUrl } from '../lib/image/image-processing'
import { searchExercisesForPlan } from '../services/workoutService'
import {
  addPinnedExercise,
  createBodyMeasurement,
  deleteBodyMeasurement,
  getProgressSummary,
  removePinnedExercise,
  reorderPinnedExercises,
} from '../services/progressService'
import {
  bodyMeasurementsCache,
  currentYearProgressSummaryCache,
  exerciseProgressCache,
} from '../lib/cache/progress-cache'
import type {
  BodyMeasurement,
  CreateBodyMeasurementInput,
  ExerciseProgressItem,
  ProgressSummaryDay,
  ProgressSummaryResponse,
} from '../types/progress'
import type { ExerciseOption } from '../types/workout'
import {
  ArrowLeft, Download, Dumbbell, Image as ImageIcon, Pin, Plus, Search,
  Trash2,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  formatDateTime, formatShortDate, toNumberOrUndefined,
  computeVolume7D, computeCardio7D, volumeByWeek,
  cardioMinutesByWeek, prsByMonth, pctDelta,
} from './progress/progress-utils'
import {
  MeasRow, FormField, UnitInput, HeroStat,
  MeasurementDetailsModal, PhotoGalleryModal,
} from './progress/measurements'
import {
  MuscleVolumeCard, RecentPrsCard, BodyMetricChart, YearActivityHeatmap,
} from './progress/charts'
import { ExerciseCard, TabSwitcher } from './progress/exercise-card'

// New PR within the current month per pinned exercise. A "PR" here is a
// session whose maxLoadKg strictly exceeds the max of every earlier session
// for that same exercise.
function computePRsThisMonth(progress: ExerciseProgressItem[]): number {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  let count = 0
  for (const item of progress) {
    const sorted = [...item.sessions].sort(
      (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
    )
    let runningMax = -Infinity
    for (const s of sorted) {
      const load = s.maxLoadKg ?? 0
      if (load > runningMax) {
        const d = new Date(s.completedAt)
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) count += 1
        runningMax = load
      }
    }
  }
  return count
}

function computeStreak(days: ProgressSummaryDay[]): number {
  const set = new Set(days.filter((d) => d.sessionCount > 0).map((d) => d.date))
  let count = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!set.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1)
  while (set.has(cursor.toISOString().slice(0, 10))) {
    count++
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

function lastSessionDate(progress: ExerciseProgressItem[], days: ProgressSummaryDay[]): Date | null {
  let latest = 0
  for (const item of progress) {
    for (const s of item.sessions) {
      const t = new Date(s.completedAt).getTime()
      if (t > latest) latest = t
    }
  }
  for (const d of days) {
    if (d.sessionCount === 0) continue
    const t = new Date(d.date).getTime()
    if (t > latest) latest = t
  }
  return latest > 0 ? new Date(latest) : null
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function ProgressPage() {
  const { authorizedFetch } = useAuth()

  // Tab lives in the URL (`?tab=body`) so sharing a deep link lands on the
  // right panel and a hard refresh preserves where the user was.
  const [searchParams, setSearchParams] = useSearchParams()
  const urlTab = searchParams.get('tab')
  const tab: 'exercise' | 'body' = urlTab === 'body' ? 'body' : 'exercise'
  const setTab = useCallback(
    (next: 'exercise' | 'body') => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (next === 'exercise') params.delete('tab')
          else params.set('tab', next)
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  // Stale-while-revalidate via caches em módulo: useState inicializa
  // síncrono com peek() — se o user já carregou Progress nessa sessão
  // (ou em sessão anterior via localStorage), página renderiza COM
  // dados imediatos, sem flash de skeleton. loadAll() em background
  // revalida com dados frescos.
  const cachedExerciseProgress = exerciseProgressCache.peek()
  const cachedBodyMeasurements = bodyMeasurementsCache.peek()
  const cachedYearSummary = currentYearProgressSummaryCache.peek()
  const hasAnyCache = Boolean(cachedExerciseProgress || cachedBodyMeasurements || cachedYearSummary)

  const [loading, setLoading] = useState<boolean>(!hasAnyCache)
  const [error, setError] = useState<string | null>(null)

  const [exerciseProgress, setExerciseProgress] = useState<ExerciseProgressItem[]>(
    () => cachedExerciseProgress?.items ?? [],
  )
  const [maxPinned, setMaxPinned] = useState(() => cachedExerciseProgress?.maxPinned ?? 5)
  const [openedPinnedExerciseId, setOpenedPinnedExerciseId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ExerciseOption[]>([])
  const [searching, setSearching] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)

  // Optional fetch — only used to feed the hero stats. Failures are tolerated.
  const [summary, setSummary] = useState<ProgressSummaryResponse | null>(cachedYearSummary)
  // Year shown in the activity heatmap. Defaults to current year and can
  // be swapped via the selector — triggers a small refetch of `/summary`.
  const [heatmapYear, setHeatmapYear] = useState<number>(() => new Date().getFullYear())
  const [refetchingSummary, setRefetchingSummary] = useState(false)

  const [measurements, setMeasurements] = useState<BodyMeasurement[]>(
    () => cachedBodyMeasurements?.items ?? [],
  )
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; date: string } | null>(null)
  const [selectedMeasurement, setSelectedMeasurement] = useState<BodyMeasurement | null>(null)
  const [measurementPhotoFile, setMeasurementPhotoFile] = useState<File | null>(null)
  const [measurementPhotoPreview, setMeasurementPhotoPreview] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showMoreMeasures, setShowMoreMeasures] = useState(false)
  const [savingMeasurement, setSavingMeasurement] = useState(false)
  const [deletingMeasurementId, setDeletingMeasurementId] = useState<string | null>(null)
  const [galleryMode, setGalleryMode] = useState<'closed' | 'grid' | 'compare'>('closed')
  const [draggingExerciseId, setDraggingExerciseId] = useState<string | null>(null)
  const [dropTargetExerciseId, setDropTargetExerciseId] = useState<string | null>(null)

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    weight: '', chest: '', shoulders: '', arms: '', forearms: '',
    waist: '', hips: '', thighs: '', calves: '', neck: '',
    bmi: '', bodyFatPercentage: '',
  })

  const searchInputRef = useRef<HTMLInputElement>(null)

  const pinnedExerciseIds = useMemo(() => new Set(exerciseProgress.map((item) => item.exercise.id)), [exerciseProgress])

  const loadAll = useCallback(async () => {
    try {
      // Só mostra skeleton quando NÃO temos NADA em cache. Refetch em
      // background quando temos algo — UI continua interativa, atualiza
      // silencioso quando os dados frescos chegam.
      if (!exerciseProgressCache.peek() && !bodyMeasurementsCache.peek() && !currentYearProgressSummaryCache.peek()) {
        setLoading(true)
      }
      setError(null)

      // Caches em paralelo. Cada cache faz coalesce in-flight, então
      // múltiplas montagens simultâneas viram 1 request por endpoint.
      const [progressData, bodyData, summaryData] = await Promise.all([
        exerciseProgressCache.get(authorizedFetch),
        bodyMeasurementsCache.get(authorizedFetch),
        currentYearProgressSummaryCache.get(authorizedFetch).catch(
          () => ({ year: new Date().getFullYear(), days: [], muscleVolume30D: [] }) as ProgressSummaryResponse,
        ),
      ])

      setExerciseProgress(progressData.items)
      setMaxPinned(progressData.maxPinned)
      setMeasurements(bodyData.items)
      setSummary(summaryData)

      setOpenedPinnedExerciseId((current) =>
        current && progressData.items.some((item) => item.exercise.id === current) ? current : null,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar módulo de progresso')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => { void loadAll() }, [loadAll])

  // Year selector triggers a focused refetch of just the summary, not the
  // whole page payload. Skips the first run (current year matches loadAll's
  // default) so we don't double-fetch on mount.
  const firstYearRunRef = useRef(true)
  useEffect(() => {
    if (firstYearRunRef.current) {
      firstYearRunRef.current = false
      return
    }
    let cancelled = false
    setRefetchingSummary(true)
    getProgressSummary(authorizedFetch, heatmapYear)
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar ano')
      })
      .finally(() => {
        if (!cancelled) setRefetchingSummary(false)
      })
    return () => { cancelled = true }
  }, [heatmapYear, authorizedFetch])

  // Debounced exercise search.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const q = searchQuery.trim()
      if (q.length < 2) { setSearchResults([]); return }
      setSearching(true)
      void searchExercisesForPlan(authorizedFetch, { q, limit: 30 })
        .then((r) => setSearchResults(r))
        .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao buscar exercícios'))
        .finally(() => setSearching(false))
    }, 240)
    return () => window.clearTimeout(id)
  }, [searchQuery, authorizedFetch])

  // ⌘K / Ctrl+K → focus search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    return () => {
      if (measurementPhotoPreview) URL.revokeObjectURL(measurementPhotoPreview)
    }
  }, [measurementPhotoPreview])

  // All time-series math reads from the pre-aggregated `summary.days`.
  const summaryDays = useMemo(() => summary?.days ?? [], [summary])
  const muscleVolume30D = useMemo(() => summary?.muscleVolume30D ?? [], [summary])

  const volume7d = useMemo(() => Math.round(computeVolume7D(summaryDays)), [summaryDays])
  const prsThisMonth = useMemo(() => computePRsThisMonth(exerciseProgress), [exerciseProgress])
  const streak = useMemo(() => computeStreak(summaryDays), [summaryDays])
  const cardio7d = useMemo(() => computeCardio7D(summaryDays), [summaryDays])
  const lastSession = useMemo(() => lastSessionDate(exerciseProgress, summaryDays), [exerciseProgress, summaryDays])

  // Weekly buckets + deltas for the hero. 8 weeks covers ~2 months which is
  // a good sparkline length without making the deltas misleading.
  const volumeWeeks = useMemo(() => volumeByWeek(summaryDays, 8), [summaryDays])
  const cardioWeeks = useMemo(() => cardioMinutesByWeek(summaryDays, 8), [summaryDays])
  const prsMonths = useMemo(() => prsByMonth(exerciseProgress, 6), [exerciseProgress])
  const volumeDelta = pctDelta(volumeWeeks[7] ?? 0, volumeWeeks[6] ?? 0)
  const cardioDelta = pctDelta(cardioWeeks[7] ?? 0, cardioWeeks[6] ?? 0)
  const prsDelta = pctDelta(prsMonths[5] ?? 0, prsMonths[4] ?? 0)

  // Body panel derived data — measurements sorted oldest-first for chart,
  // newest-first for the deltas/photo timeline.
  const measurementsOldFirst = useMemo(
    () => [...measurements].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [measurements],
  )
  const measurementsNewFirst = useMemo(
    () => [...measurements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [measurements],
  )
  const latestMeasurement = measurementsNewFirst[0] ?? null
  const firstMeasurement = measurementsOldFirst[0] ?? null

  // For each common measure: delta vs 30 days ago (fallback to first record).
  function measureDelta(key: keyof BodyMeasurement): { current: number | null; delta: number | null } {
    if (!latestMeasurement) return { current: null, delta: null }
    const current = latestMeasurement[key] as number | null
    if (current == null) return { current: null, delta: null }
    const cutoff = Date.now() - 30 * 86_400_000
    const reference = measurementsOldFirst.find(
      (m) => new Date(m.date).getTime() <= cutoff && (m[key] as number | null) != null,
    ) ?? firstMeasurement
    const ref = reference?.[key] as number | null
    if (ref == null || reference?.id === latestMeasurement.id) return { current, delta: null }
    return { current, delta: Number((current - ref).toFixed(1)) }
  }

  const handlePinExercise = async (exerciseId: string) => {
    if (exerciseProgress.length >= maxPinned) {
      // Inline error (instead of window.alert which breaks the page flow)
      // — the existing top-of-page error banner picks this up.
      setError(`Você pode fixar no máximo ${maxPinned} exercícios. Remova um antes de adicionar outro.`)
      return
    }
    try {
      await addPinnedExercise(authorizedFetch, exerciseId)
      setSearchQuery('')
      setSearchResults([])
      exerciseProgressCache.invalidate()
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao fixar exercício')
    }
  }

  const handleExportCsv = () => {
    // Two tables in one CSV: training summary (daily) + body measurements.
    // A single file keeps the export self-contained — easy to drop into a
    // sheet without juggling multiple downloads.
    const escape = (v: unknown): string => {
      if (v == null) return ''
      const s = String(v)
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines: string[] = []
    lines.push('# Treinos por dia')
    lines.push('data,volume_kg,sessoes,exercicios,cardio_min')
    for (const d of summaryDays) {
      lines.push(
        [d.date, d.volumeKg, d.sessionCount, d.exerciseCount, Math.round(d.cardioSec / 60)]
          .map(escape)
          .join(','),
      )
    }
    lines.push('')
    lines.push('# Medidas corporais')
    lines.push('data,peso_kg,peito_cm,ombros_cm,bracos_cm,antebracos_cm,cintura_cm,quadril_cm,coxas_cm,panturrilhas_cm,pescoco_cm,imc,bf_pct')
    for (const m of measurementsOldFirst) {
      lines.push(
        [
          m.date.slice(0, 10),
          m.weight,
          m.chest,
          m.shoulders,
          m.arms,
          m.forearms,
          m.waist,
          m.hips,
          m.thighs,
          m.calves,
          m.neck,
          m.bmi,
          m.bodyFatPercentage,
        ]
          .map(escape)
          .join(','),
      )
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `serraathlo-progresso-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleReorderPinned = async (orderedIds: string[]) => {
    // Optimistic reorder so the drop feels instant — server confirms in the
    // background and reloadAll re-syncs if it diverges.
    setExerciseProgress((current) => {
      const byId = new Map(current.map((i) => [i.exercise.id, i]))
      return orderedIds.map((id) => byId.get(id)).filter((x): x is ExerciseProgressItem => !!x)
    })
    try {
      await reorderPinnedExercises(authorizedFetch, orderedIds)
      exerciseProgressCache.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao reordenar exercícios')
      exerciseProgressCache.invalidate()
      await loadAll()
    }
  }

  const handleUnpinExercise = async (exerciseId: string) => {
    try {
      await removePinnedExercise(authorizedFetch, exerciseId)
      exerciseProgressCache.invalidate()
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover exercício fixado')
    }
  }

  const handleMeasurementPhotoFile = (file: File | null) => {
    setMeasurementPhotoFile(file)
    if (measurementPhotoPreview) {
      URL.revokeObjectURL(measurementPhotoPreview)
      setMeasurementPhotoPreview(null)
    }
    if (file) setMeasurementPhotoPreview(URL.createObjectURL(file))
  }

  const handleSaveMeasurement = async () => {
    const weightNumber = toNumberOrUndefined(form.weight)
    if (!measurementPhotoFile || weightNumber == null) return
    try {
      setSavingMeasurement(true)
      const photoDataUrl = await optimizeImageFileToDataUrl(measurementPhotoFile, {
        maxEdge: 1200, quality: 0.84, maxOutputBytes: 1_400_000,
      })
      const payload: CreateBodyMeasurementInput = {
        date: new Date(`${form.date}T00:00:00`).toISOString(),
        photoUrl: photoDataUrl,
        weight: weightNumber,
        chest: toNumberOrUndefined(form.chest),
        shoulders: toNumberOrUndefined(form.shoulders),
        arms: toNumberOrUndefined(form.arms),
        forearms: toNumberOrUndefined(form.forearms),
        waist: toNumberOrUndefined(form.waist),
        hips: toNumberOrUndefined(form.hips),
        thighs: toNumberOrUndefined(form.thighs),
        calves: toNumberOrUndefined(form.calves),
        neck: toNumberOrUndefined(form.neck),
        bmi: toNumberOrUndefined(form.bmi),
        bodyFatPercentage: toNumberOrUndefined(form.bodyFatPercentage),
      }
      await createBodyMeasurement(authorizedFetch, payload)
      bodyMeasurementsCache.invalidate()
      await loadAll()
      setForm((c) => ({
        ...c, weight: '', chest: '', shoulders: '', arms: '', forearms: '',
        waist: '', hips: '', thighs: '', calves: '', neck: '', bmi: '', bodyFatPercentage: '',
      }))
      setMeasurementPhotoFile(null)
      if (measurementPhotoPreview) URL.revokeObjectURL(measurementPhotoPreview)
      setMeasurementPhotoPreview(null)
      setShowMoreMeasures(false)
      setShowAddForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar medida corporal')
    } finally {
      setSavingMeasurement(false)
    }
  }

  const handleDeleteMeasurement = async (measurementId: string) => {
    if (!window.confirm('Deseja excluir este registro corporal?')) return
    try {
      setDeletingMeasurementId(measurementId)
      await deleteBodyMeasurement(authorizedFetch, measurementId)
      bodyMeasurementsCache.invalidate()
      setSelectedMeasurement((current) => (current?.id === measurementId ? null : current))
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir registro corporal')
    } finally {
      setDeletingMeasurementId(null)
    }
  }

  return (
    <section className="space-y-4">
      {/* Voltar ao perfil — só mobile/tablet (no desktop Progresso é item de nav) */}
      <Link
        to="/profile"
        className="inline-flex items-center gap-1.5 px-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] hover:text-[var(--text)] lg:hidden"
      >
        <ArrowLeft size={11} />
        Voltar ao perfil
      </Link>

      {/* ───── HEADER ───── */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0 sm:flex-1">
            <p className="inline-flex items-center gap-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              <span className="inline-block h-[6px] w-[6px] rounded-full bg-[var(--brand)]" />
              Progresso
              {lastSession && (
                <span className="font-sans text-[11px] font-normal normal-case tracking-normal text-[var(--muted)]">
                  · Última sessão {formatShortDate(lastSession)}
                </span>
              )}
            </p>
            <h1 className="mt-1.5 text-[28px] font-semibold tracking-tight text-[var(--text)] sm:text-[32px]">
              Seu <span className="font-serif-accent text-[var(--brand-strong)]">acompanhamento</span>
            </h1>
            {summaryDays.length === 0 && measurements.length === 0 && exerciseProgress.length === 0 && (
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[var(--muted)]">
                Fixe exercícios principais, acompanhe carga, repetições e volume — e registre sua evolução corporal com fotos e medidas.
              </p>
            )}
            {(summaryDays.length > 0 || measurements.length > 0) && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface)]"
              >
                <Download size={12} />
                Exportar CSV
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5 sm:text-right">
            <HeroStat
              label="Volume 7D"
              value={volume7d.toLocaleString('pt-BR')}
              numericValue={volume7d}
              unit="kg"
              tone="brand"
              delta={volumeDelta}
              deltaLabel="vs 7 dias anteriores"
              sparkline={volumeWeeks}
            />
            <HeroStat
              label="Cardio 7D"
              value={String(cardio7d)}
              numericValue={cardio7d}
              unit="min"
              tone="default"
              delta={cardioDelta}
              deltaLabel="vs 7 dias anteriores"
              sparkline={cardioWeeks}
            />
            <HeroStat
              label="PRs no mês"
              value={String(prsThisMonth)}
              numericValue={prsThisMonth}
              tone="default"
              delta={prsDelta}
              deltaLabel="vs mês anterior"
              sparkline={prsMonths}
            />
            <HeroStat label="Sequência" value={String(streak)} numericValue={streak} unit="dias" tone="default" />
          </div>
        </div>
      </motion.section>

      {/* ───── YEAR ACTIVITY HEATMAP ───── */}
      {!loading && (
        <YearActivityHeatmap
          days={summaryDays}
          year={heatmapYear}
          // 3 years is enough context for someone training for a while; the
          // selector stays a single line on mobile and pings the endpoint
          // (which already 60s-caches) when the user switches.
          availableYears={(() => {
            const current = new Date().getFullYear()
            return [current - 2, current - 1, current]
          })()}
          onYearChange={setHeatmapYear}
          loading={refetchingSummary}
        />
      )}

      {/* ───── TABS ───── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <TabSwitcher value={tab} onChange={setTab} />
      </motion.div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-500">{error}</p>
      )}
      {loading && (
        <div className="space-y-3" aria-label="Carregando progresso">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 space-y-3">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-[140px] w-full" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-2">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-[60px] w-full" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ───── EXERCISE PANEL ───── */}
      {tab === 'exercise' && (
        <div className="space-y-3">
          {/* Pinned card */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.08 }}
            className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
          >
            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[var(--text)]">
                <Pin size={14} className="text-[var(--brand)]" />
                Exercícios fixados
              </h2>
              <div className="flex items-center gap-2.5 font-mono text-[11px] text-[var(--muted)]">
                <div className="flex gap-[3px]">
                  {Array.from({ length: maxPinned }, (_, i) => (
                    <span
                      key={i}
                      className="block h-[6px] w-[14px] rounded-[2px] transition-colors"
                      style={{ background: i < exerciseProgress.length ? 'var(--brand)' : 'var(--line)' }}
                    />
                  ))}
                </div>
                <span>
                  <b className="font-semibold text-[var(--text)]">{exerciseProgress.length}</b>/{maxPinned} fixados
                </span>
              </div>
            </div>

            <label
              className="relative flex items-center rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] px-3.5 py-2.5 transition-all focus-within:border-[var(--brand)] focus-within:bg-[var(--surface)] focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_18%,transparent)]"
            >
              <Search size={14} className="mr-2 text-[var(--muted)]" />
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                placeholder="Buscar exercício para fixar…"
                className="flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
              />
              <kbd className="hidden rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-[2px] font-mono text-[10px] text-[var(--muted)] sm:inline">
                ⌘ K
              </kbd>
            </label>

            {/* Suggestions dropdown */}
            {searchFocused && searchQuery.trim().length >= 2 && (
              <div className="mt-2 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface)]">
                {searching && <p className="px-3.5 py-3 text-[12px] text-[var(--muted)]">Buscando…</p>}
                {!searching && searchResults.length === 0 && (
                  <p className="px-3.5 py-3 text-[12px] text-[var(--muted)]">Nenhum exercício encontrado.</p>
                )}
                {searchResults.slice(0, 8).map((option) => {
                  const isPinned = pinnedExerciseIds.has(option.id)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => !isPinned && void handlePinExercise(option.id)}
                      disabled={isPinned}
                      className="flex w-full items-center justify-between gap-3 border-b border-[var(--line-2,var(--line))] px-3.5 py-2.5 text-left text-[13px] transition-colors last:border-b-0 hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-[var(--text)]">{option.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                        {option.primaryMuscleGroup} · {option.difficulty}
                        {isPinned && <span className="ml-2 text-[var(--brand)]">· FIXADO</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </motion.section>

          {/* Exercise cards */}
          {exerciseProgress.length === 0 && !loading && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
              <div className="text-center">
                <Pin size={28} className="mx-auto mb-3 text-[var(--muted)]" />
                <p className="text-sm font-bold text-[var(--text)]">Nenhum exercício fixado ainda</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Escolha um caminho rápido pra começar a acompanhar sua evolução.
                </p>
              </div>
              <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => searchInputRef.current?.focus()}
                  className="group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5 text-left transition-colors hover:border-[var(--brand)]/60 hover:bg-[var(--brand)]/5"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                    <Pin size={13} />
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text)]">Fixar exercício</span>
                  <span className="text-[11.5px] text-[var(--muted)]">Acompanha carga, reps e PRs do exercício escolhido.</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setTab('body'); setShowAddForm(true) }}
                  className="group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5 text-left transition-colors hover:border-[var(--brand)]/60 hover:bg-[var(--brand)]/5"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                    <ImageIcon size={13} />
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text)]">Registrar foto</span>
                  <span className="text-[11.5px] text-[var(--muted)]">Tire fotos periódicas pra ver a evolução visual.</span>
                </button>
                <Link
                  to="/train"
                  className="group flex flex-col items-start gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3.5 text-left transition-colors hover:border-[var(--brand)]/60 hover:bg-[var(--brand)]/5"
                >
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                    <Dumbbell size={13} />
                  </span>
                  <span className="text-[13px] font-semibold text-[var(--text)]">Ir treinar</span>
                  <span className="text-[11.5px] text-[var(--muted)]">Cada sessão concluída vira dado aqui automaticamente.</span>
                </Link>
              </div>
            </div>
          )}

          {/* Side-by-side analytics — only meaningful with at least one
              pinned exercise (PRs feed) or any training history (volume). */}
          {(exerciseProgress.length > 0 || summaryDays.length > 0) && (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              <MuscleVolumeCard rows={muscleVolume30D} />
              <RecentPrsCard progress={exerciseProgress} />
            </div>
          )}

          {exerciseProgress.map((item) => (
            <div
              key={item.exercise.id}
              onDragOver={(e) => {
                if (draggingExerciseId && draggingExerciseId !== item.exercise.id) {
                  e.preventDefault()
                  setDropTargetExerciseId(item.exercise.id)
                }
              }}
              onDragLeave={(e) => {
                // Only clear if we're really leaving the card (not entering a child).
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDropTargetExerciseId((current) => (current === item.exercise.id ? null : current))
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (!draggingExerciseId || draggingExerciseId === item.exercise.id) return
                const fromIdx = exerciseProgress.findIndex((p) => p.exercise.id === draggingExerciseId)
                const toIdx = exerciseProgress.findIndex((p) => p.exercise.id === item.exercise.id)
                if (fromIdx < 0 || toIdx < 0) return
                const reordered = [...exerciseProgress]
                const [moved] = reordered.splice(fromIdx, 1)
                reordered.splice(toIdx, 0, moved)
                setDropTargetExerciseId(null)
                void handleReorderPinned(reordered.map((p) => p.exercise.id))
              }}
            >
            <ExerciseCard
              item={item}
              open={openedPinnedExerciseId === item.exercise.id}
              isDragging={draggingExerciseId === item.exercise.id}
              isDropTarget={dropTargetExerciseId === item.exercise.id}
              onMove={(direction) => {
                const idx = exerciseProgress.findIndex((p) => p.exercise.id === item.exercise.id)
                const targetIdx = direction === 'up' ? idx - 1 : idx + 1
                if (idx < 0 || targetIdx < 0 || targetIdx >= exerciseProgress.length) return
                const reordered = [...exerciseProgress]
                ;[reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]]
                void handleReorderPinned(reordered.map((p) => p.exercise.id))
              }}
              dragHandleProps={{
                draggable: true,
                onDragStart: (e: React.DragEvent) => {
                  setDraggingExerciseId(item.exercise.id)
                  e.dataTransfer.effectAllowed = 'move'
                  // Firefox requires data to be set or it cancels the drag.
                  try { e.dataTransfer.setData('text/plain', item.exercise.id) } catch { /* noop */ }
                },
                onDragEnd: () => {
                  setDraggingExerciseId(null)
                  setDropTargetExerciseId(null)
                },
              }}
              onToggle={() =>
                setOpenedPinnedExerciseId((current) => (current === item.exercise.id ? null : item.exercise.id))
              }
              onRemove={() => void handleUnpinExercise(item.exercise.id)}
            />
            </div>
          ))}
        </div>
      )}

      {/* ───── BODY PANEL ───── */}
      {tab === 'body' && (
        <div className="space-y-3">
          {measurements.length === 0 && !loading ? (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-10"
            >
              <div className="mx-auto max-w-md text-center">
                <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--brand)]/15 text-[var(--brand-strong)]">
                  <ImageIcon size={22} />
                </span>
                <h3 className="text-base font-bold text-[var(--text)]">Comece sua linha do tempo corporal</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                  Tire uma foto periódica e registre peso/medidas. Em 4–8 semanas você consegue ver a evolução visualmente e comparar fotos lado a lado.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-[13px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
                >
                  <Plus size={13} />
                  Registrar primeira foto
                </button>
              </div>
            </motion.section>
          ) : null}

          {measurements.length > 0 && (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1.1fr_0.9fr]">
            <BodyMetricChart
              measurements={measurementsOldFirst}
              field="weight"
              label="Peso corporal"
              unit="kg"
              gradientId="bodyWeightGrad"
              delay={0.08}
            />

            {/* Measurements list */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-[var(--text)]">Medidas</h3>
                <span className="text-[11px] font-medium text-[var(--muted)]">
                  vs. 30 dias
                </span>
              </div>

              {!latestMeasurement && (
                <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
                  Nenhuma medida registrada ainda.
                </p>
              )}

              {latestMeasurement && (
                <div className="grid gap-2">
                  {([
                    ['chest', 'Peito'],
                    ['waist', 'Cintura'],
                    ['arms', 'Braços'],
                    ['thighs', 'Coxas'],
                  ] as Array<[keyof BodyMeasurement, string]>).map(([k, label]) => {
                    const { current, delta } = measureDelta(k)
                    if (current == null) return null
                    return <MeasRow key={k} label={label} value={current} unit="cm" delta={delta} />
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAddForm((v) => !v)}
                    className="mt-1 inline-flex items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--line)] bg-transparent px-3 py-2.5 font-mono text-[11px] font-semibold tracking-wider text-[var(--muted)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 hover:text-[var(--brand-strong)]"
                  >
                    <Plus size={12} />
                    {showAddForm ? 'Fechar' : 'Adicionar registro'}
                  </button>
                </div>
              )}
            </motion.section>
          </div>
          )}

          {/* IMC + BF % charts — only render if the user has at least one
              record with the metric (the chart itself shows a hint otherwise). */}
          {(measurementsOldFirst.some((m) => m.bmi != null) ||
            measurementsOldFirst.some((m) => m.bodyFatPercentage != null)) && (
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {measurementsOldFirst.some((m) => m.bmi != null) && (
                <BodyMetricChart
                  measurements={measurementsOldFirst}
                  field="bmi"
                  label="IMC"
                  unit=""
                  gradientId="bodyBmiGrad"
                  delay={0.12}
                />
              )}
              {measurementsOldFirst.some((m) => m.bodyFatPercentage != null) && (
                <BodyMetricChart
                  measurements={measurementsOldFirst}
                  field="bodyFatPercentage"
                  label="Body Fat"
                  unit="%"
                  gradientId="bodyBfGrad"
                  delay={0.14}
                />
              )}
            </div>
          )}

          {/* Add measurement form (collapsible) */}
          <AnimatePresence initial={false}>
            {showAddForm && (
              <motion.section
                key="add-form"
                initial={{ opacity: 0, y: 8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 6, height: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5">
                  <h3 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Novo registro corporal</h3>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <FormField label="Data">
                      <input
                        type="date"
                        value={form.date}
                        onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm"
                      />
                    </FormField>
                    <UnitInput
                      label="Peso *"
                      value={form.weight}
                      unit="kg"
                      onChange={(next) => setForm((c) => ({ ...c, weight: next }))}
                    />
                    <FormField label="Foto *">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleMeasurementPhotoFile(e.target.files?.[0] ?? null)}
                        className="w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm"
                      />
                    </FormField>
                  </div>

                  {measurementPhotoPreview && (
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto({ url: measurementPhotoPreview, date: `${form.date}T00:00:00.000Z` })}
                      className="mx-auto mt-3 block w-full max-w-[18rem] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                    >
                      <img
                        src={measurementPhotoPreview}
                        alt="Preview"
                        className="w-full rounded-lg border border-[var(--line)] object-cover"
                        style={{ aspectRatio: '4 / 5', maxHeight: '20rem' }}
                      />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowMoreMeasures((v) => !v)}
                    className="mt-3 inline-flex h-8 items-center rounded-lg border border-[var(--line)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    {showMoreMeasures ? 'Ocultar medidas opcionais' : 'Adicionar mais medidas'}
                  </button>

                  {showMoreMeasures && (
                    <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                      {([
                        ['chest', 'Peitoral', 'cm'], ['shoulders', 'Ombros', 'cm'], ['arms', 'Braços', 'cm'],
                        ['forearms', 'Antebraços', 'cm'], ['waist', 'Cintura', 'cm'], ['hips', 'Quadril', 'cm'],
                        ['thighs', 'Coxas', 'cm'], ['calves', 'Panturrilhas', 'cm'], ['neck', 'Pescoço', 'cm'],
                        ['bmi', 'IMC', ''], ['bodyFatPercentage', 'BF', '%'],
                      ] as Array<[keyof typeof form, string, string]>).map(([field, label, unit]) => (
                        <UnitInput
                          key={field}
                          label={label}
                          value={form[field]}
                          unit={unit}
                          onChange={(next) => setForm((c) => ({ ...c, [field]: next }))}
                        />
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={savingMeasurement || !measurementPhotoFile || !form.weight.trim()}
                    onClick={() => void handleSaveMeasurement()}
                    className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-[13px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingMeasurement ? 'Salvando…' : 'Salvar registro'}
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Photo timeline */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.14 }}
            className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[14px] font-semibold text-[var(--text)]">Linha do tempo de fotos</h3>
              <div className="flex items-center gap-2">
                {measurements.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => setGalleryMode('compare')}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface)]"
                  >
                    Comparar
                  </button>
                )}
                {measurements.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setGalleryMode('grid')}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface)]"
                  >
                    Ver todas
                  </button>
                )}
                <span className="text-[11px] font-medium text-[var(--muted)]">
                  {measurements.length} {measurements.length === 1 ? 'registro' : 'registros'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {measurementsNewFirst.slice(0, 3).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedPhoto({ url: m.photoUrl, date: m.date })}
                  className="group relative aspect-[3/4] overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] transition-transform hover:-translate-y-0.5"
                >
                  <img
                    src={m.photoUrl}
                    alt={`Foto corporal em ${formatDateTime(m.date)}`}
                    className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  <span
                    className="absolute left-1.5 top-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 py-[2px] font-mono text-[9.5px] font-semibold text-[var(--text)]"
                  >
                    {new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '')}
                  </span>
                </button>
              ))}
              {measurements.length < 3 && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="grid aspect-[3/4] place-items-center rounded-[10px] border border-dashed border-[var(--line)] bg-[var(--surface-hover)] font-mono text-[10.5px] text-[var(--muted)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 hover:text-[var(--brand-strong)]"
                >
                  <span className="flex flex-col items-center gap-1.5">
                    <ImageIcon size={18} />
                    Adicionar foto
                  </span>
                </button>
              )}
            </div>
          </motion.section>

          {/* Full history list (kept simpler — clickable cards for delete/details) */}
          {measurements.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.18 }}
              className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
            >
              <h3 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Histórico corporal</h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {measurementsNewFirst.map((m) => (
                  <article key={m.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto({ url: m.photoUrl, date: m.date })}
                      className="block w-full"
                    >
                      <img
                        src={m.photoUrl}
                        alt={`Foto corporal em ${formatDateTime(m.date)}`}
                        className="w-full rounded-lg object-cover transition-transform hover:scale-[1.01]"
                        style={{ aspectRatio: '4 / 5', maxHeight: '20rem' }}
                      />
                    </button>
                    <p className="mt-2 font-mono text-[11px] font-semibold text-[var(--text)]">{formatDateTime(m.date)}</p>
                    <div className="mt-1 grid gap-x-3 gap-y-0.5 font-mono text-[11px] text-[var(--muted)] sm:grid-cols-2">
                      <p>Peso: <b className="text-[var(--text)]">{m.weight}</b> kg</p>
                      <p>IMC: <b className="text-[var(--text)]">{m.bmi ?? '—'}</b></p>
                      <p>BF: <b className="text-[var(--text)]">{m.bodyFatPercentage != null ? `${m.bodyFatPercentage}%` : '—'}</b></p>
                      <p>Cintura: <b className="text-[var(--text)]">{m.waist ?? '—'}</b></p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMeasurement(m)}
                        className="inline-flex h-8 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                      >
                        Ver detalhes
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteMeasurement(m.id)}
                        disabled={deletingMeasurementId === m.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/40 bg-transparent px-3 text-[12px] font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <Trash2 size={11} />
                        {deletingMeasurementId === m.id ? 'Excluindo…' : 'Excluir'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </motion.section>
          )}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {selectedPhoto && (
          <ImageViewer
            src={selectedPhoto.url}
            alt={`Foto corporal em ${formatDateTime(selectedPhoto.date)}`}
            shape="portrait"
            caption={formatDateTime(selectedPhoto.date)}
            onClose={() => setSelectedPhoto(null)}
          />
        )}
      </AnimatePresence>

      {selectedMeasurement && (
        <MeasurementDetailsModal
          measurement={selectedMeasurement}
          onClose={() => setSelectedMeasurement(null)}
          onOpenPhoto={() => setSelectedPhoto({ url: selectedMeasurement.photoUrl, date: selectedMeasurement.date })}
        />
      )}

      {galleryMode !== 'closed' && (
        <PhotoGalleryModal
          measurements={measurementsNewFirst}
          initialMode={galleryMode}
          onClose={() => setGalleryMode('closed')}
          onOpenPhoto={(m) => setSelectedPhoto({ url: m.photoUrl, date: m.date })}
        />
      )}
    </section>
  )
}

// ─── Small subcomponents (declared after the page to keep the layout) ─────

