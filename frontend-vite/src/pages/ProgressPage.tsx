import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { useAuth } from '../hooks/useAuth'
import { optimizeImageFileToDataUrl } from '../lib/image-processing'
import { searchExercisesForPlan } from '../services/workoutService'
import {
  addPinnedExercise,
  createBodyMeasurement,
  deleteBodyMeasurement,
  getExerciseProgress,
  listBodyMeasurements,
  removePinnedExercise,
} from '../services/progressService'
import type {
  BodyMeasurement,
  CreateBodyMeasurementInput,
  ExerciseProgressItem,
} from '../types/progress'
import type { ExerciseOption } from '../types/workout'

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR')
}

function toNumberOrUndefined(value: string): number | undefined {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) {
    return undefined
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function ProgressPage() {
  const { authorizedFetch } = useAuth()

  const [tab, setTab] = useState<'exercise' | 'body'>('exercise')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [exerciseProgress, setExerciseProgress] = useState<ExerciseProgressItem[]>([])
  const [maxPinned, setMaxPinned] = useState(5)
  const [openedPinnedExerciseId, setOpenedPinnedExerciseId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ExerciseOption[]>([])
  const [searching, setSearching] = useState(false)

  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([])
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; date: string } | null>(null)
  const [selectedMeasurement, setSelectedMeasurement] = useState<BodyMeasurement | null>(null)
  const [measurementPhotoFile, setMeasurementPhotoFile] = useState<File | null>(null)
  const [measurementPhotoPreview, setMeasurementPhotoPreview] = useState<string | null>(null)
  const [showMoreMeasures, setShowMoreMeasures] = useState(false)
  const [savingMeasurement, setSavingMeasurement] = useState(false)
  const [deletingMeasurementId, setDeletingMeasurementId] = useState<string | null>(null)

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    weight: '',
    chest: '',
    shoulders: '',
    arms: '',
    forearms: '',
    waist: '',
    hips: '',
    thighs: '',
    calves: '',
    neck: '',
    bmi: '',
    bodyFatPercentage: '',
  })

  const pinnedExerciseIds = useMemo(() => new Set(exerciseProgress.map((item) => item.exercise.id)), [exerciseProgress])

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [progressData, bodyData] = await Promise.all([
        getExerciseProgress(authorizedFetch),
        listBodyMeasurements(authorizedFetch),
      ])

      setExerciseProgress(progressData.items)
      setMaxPinned(progressData.maxPinned)
      setMeasurements(bodyData.items)

      // Keep progress panel stable when reloading and clear invalid selection.
      setOpenedPinnedExerciseId((current) =>
        current && progressData.items.some((item) => item.exercise.id === current) ? current : null,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar modulo de progresso')
    } finally {
      setLoading(false)
    }
  }, [authorizedFetch])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const query = searchQuery.trim()
      if (query.length < 2) {
        setSearchResults([])
        return
      }

      setSearching(true)
      void searchExercisesForPlan(authorizedFetch, { q: query, limit: 50 })
        .then((results) => {
          setSearchResults(results)
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Erro ao buscar exercicios')
        })
        .finally(() => {
          setSearching(false)
        })
    }, 240)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchQuery, authorizedFetch])

  useEffect(() => {
    return () => {
      if (measurementPhotoPreview) {
        URL.revokeObjectURL(measurementPhotoPreview)
      }
    }
  }, [measurementPhotoPreview])

  const handlePinExercise = async (exerciseId: string) => {
    if (exerciseProgress.length >= maxPinned) {
      window.alert(`Voce pode fixar no maximo ${maxPinned} exercicios.`)
      return
    }

    try {
      await addPinnedExercise(authorizedFetch, exerciseId)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao fixar exercicio')
    }
  }

  const handleUnpinExercise = async (exerciseId: string) => {
    try {
      await removePinnedExercise(authorizedFetch, exerciseId)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover exercicio fixado')
    }
  }

  const handleMeasurementPhotoFile = (file: File | null) => {
    setMeasurementPhotoFile(file)

    if (measurementPhotoPreview) {
      URL.revokeObjectURL(measurementPhotoPreview)
      setMeasurementPhotoPreview(null)
    }

    if (file) {
      setMeasurementPhotoPreview(URL.createObjectURL(file))
    }
  }

  const handleSaveMeasurement = async () => {
    const weightNumber = toNumberOrUndefined(form.weight)
    if (!measurementPhotoFile || weightNumber == null) {
      return
    }

    try {
      setSavingMeasurement(true)
      const photoDataUrl = await optimizeImageFileToDataUrl(measurementPhotoFile, {
        maxEdge: 1200,
        quality: 0.84,
        maxOutputBytes: 1_400_000,
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
      await loadAll()
      setForm((current) => ({
        ...current,
        weight: '',
        chest: '',
        shoulders: '',
        arms: '',
        forearms: '',
        waist: '',
        hips: '',
        thighs: '',
        calves: '',
        neck: '',
        bmi: '',
        bodyFatPercentage: '',
      }))
      setMeasurementPhotoFile(null)
      if (measurementPhotoPreview) {
        URL.revokeObjectURL(measurementPhotoPreview)
      }
      setMeasurementPhotoPreview(null)
      setShowMoreMeasures(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar medida corporal')
    } finally {
      setSavingMeasurement(false)
    }
  }

  const handleDeleteMeasurement = async (measurementId: string) => {
    const confirmed = window.confirm('Deseja excluir este registro corporal?')
    if (!confirmed) {
      return
    }

    try {
      setDeletingMeasurementId(measurementId)
      await deleteBodyMeasurement(authorizedFetch, measurementId)
      setSelectedMeasurement((current) => (current?.id === measurementId ? null : current))
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir registro corporal')
    } finally {
      setDeletingMeasurementId(null)
    }
  }

  return (
    <section className="space-y-5">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        className="card-glow-orange relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-25 blur-3xl animate-[tech-spin_22s_linear_infinite]"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />
        <p className="relative text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Progresso</p>
        <h1 className="relative mt-1 text-2xl font-black text-[var(--text)]">Seu acompanhamento</h1>
        <p className="relative mt-2 text-sm text-[var(--muted)]">
          Fixe exercicios principais, acompanhe carga/repeticoes/volume e registre sua evolucao corporal com fotos e medidas.
        </p>
      </motion.header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('exercise')}
          className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
            tab === 'exercise'
              ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
              : 'border-[var(--line)] text-[var(--text)]'
          }`}
        >
          Progresso de Exercicios
        </button>
        <button
          type="button"
          onClick={() => setTab('body')}
          className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
            tab === 'body'
              ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
              : 'border-[var(--line)] text-[var(--text)]'
          }`}
        >
          Progresso Corporal
        </button>
      </div>

      {loading ? <p className="text-sm text-[var(--muted)]">Carregando progresso...</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {tab === 'exercise' ? (
        <div className="space-y-4">
          <article className="card-glow-mixed rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-[var(--text)]">Exercicios fixados</h2>
              <span className="rounded-full border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">
                {exerciseProgress.length}/{maxPinned}
              </span>
            </div>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar exercicio para fixar"
              className="mt-3 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
            />
            {searching ? <p className="mt-2 text-xs text-[var(--muted)]">Buscando...</p> : null}

            <div className="mt-2 max-h-56 space-y-2 overflow-auto pr-1">
              {searchResults.map((option) => (
                <div key={option.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">{option.name}</p>
                      <p className="text-xs text-[var(--muted)]">{option.primaryMuscleGroup} · {option.difficulty}</p>
                    </div>
                    <button
                      type="button"
                      disabled={pinnedExerciseIds.has(option.id)}
                      onClick={() => void handlePinExercise(option.id)}
                      className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)] disabled:opacity-50"
                    >
                      {pinnedExerciseIds.has(option.id) ? 'Fixado' : 'Fixar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <div className="space-y-3">
            {exerciseProgress.length === 0 ? (
              <p className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
                Nenhum exercicio fixado ainda.
              </p>
            ) : null}

            {exerciseProgress.map((item) => (
              <article key={item.exercise.id} className="card-glow-orange rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-extrabold text-[var(--text)]">{item.exercise.name}</h3>
                    <p className="text-xs text-[var(--muted)]">
                      {item.exercise.primaryMuscleGroup} · {item.exercise.difficulty}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenedPinnedExerciseId((current) =>
                          current === item.exercise.id ? null : item.exercise.id,
                        )
                      }
                      className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
                    >
                      {openedPinnedExerciseId === item.exercise.id ? 'Ocultar progresso' : 'Ver progresso'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleUnpinExercise(item.exercise.id)}
                      className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
                    >
                      Remover
                    </button>
                  </div>
                </div>

                {openedPinnedExerciseId === item.exercise.id ? (
                  <div className="mt-3 space-y-3">
                    {item.sessions.length === 0 ? (
                      <p className="text-xs text-[var(--muted)]">Ainda sem historico para este exercicio.</p>
                    ) : (
                      <>
                        {(() => {
                          const chartData = [...item.sessions]
                            .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
                            .map((s) => ({
                              date: new Date(s.completedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                              carga: s.maxLoadKg ?? 0,
                              volume: Math.round(s.totalVolumeKg),
                            }))
                          const pr = Math.max(...item.sessions.map((s) => s.maxLoadKg ?? 0))
                          return (
                            <>
                              {pr > 0 ? (
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                                    PR {pr} kg
                                  </span>
                                  <span className="text-[10px] text-[var(--muted)]">carga maxima registrada</span>
                                </div>
                              ) : null}
                              <ResponsiveContainer width="100%" height={130}>
                                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                                  <defs>
                                    <linearGradient id={`loadGrad-${item.exercise.id}`} x1="0" y1="0" x2="1" y2="0">
                                      <stop offset="0%" stopColor="var(--accent-blue)" />
                                      <stop offset="50%" stopColor="var(--accent-cyan)" />
                                      <stop offset="100%" stopColor="var(--accent-violet)" />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                                  <YAxis tick={{ fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                                  <Tooltip
                                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 11 }}
                                    formatter={(v) => [`${v} kg`, 'Carga']}
                                  />
                                  <Line type="monotone" dataKey="carga" stroke={`url(#loadGrad-${item.exercise.id})`} strokeWidth={2.5} dot={{ r: 3, fill: 'var(--accent-cyan)' }} animationDuration={900} />
                                </LineChart>
                              </ResponsiveContainer>
                            </>
                          )
                        })()}
                        {[...item.sessions].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()).map((session) => (
                          <div key={session.workoutSessionId} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
                            <p className="text-xs font-semibold text-[var(--text)]">{formatDateTime(session.completedAt)}</p>
                            <div className="mt-1 grid gap-1 text-xs text-[var(--muted)] sm:grid-cols-3">
                              <p>Carga maxima: {session.maxLoadKg != null ? `${session.maxLoadKg} kg` : '-'}</p>
                              <p>Max reps: {session.maxReps != null ? session.maxReps : '-'}</p>
                              <p>Volume total: {session.totalVolumeKg > 0 ? `${session.totalVolumeKg.toFixed(1)} kg` : '-'}</p>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <article className="card-glow-mixed rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <h2 className="text-lg font-extrabold text-[var(--text)]">Novo registro corporal</h2>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Data
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Peso (kg) *
                <input
                  value={form.weight}
                  onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)] sm:col-span-1">
                Foto *
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => handleMeasurementPhotoFile(event.target.files?.[0] ?? null)}
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                />
              </label>
            </div>

            {measurementPhotoPreview ? (
              <button
                type="button"
                onClick={() => setSelectedPhoto({ url: measurementPhotoPreview, date: `${form.date}T00:00:00.000Z` })}
                className="mx-auto mt-3 block w-full max-w-[17rem] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] sm:max-w-[20rem]"
                aria-label="Abrir preview da foto"
              >
                <img
                  src={measurementPhotoPreview}
                  alt="Preview da foto corporal"
                  className="w-full rounded-lg border border-[var(--line)] object-cover"
                  style={{ aspectRatio: '4 / 5', maxHeight: '22rem' }}
                />
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setShowMoreMeasures((value) => !value)}
              className="mt-3 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text)]"
            >
              {showMoreMeasures ? 'Ocultar medidas opcionais' : 'Adicionar mais medidas'}
            </button>

            {showMoreMeasures ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  ['chest', 'Peitoral'],
                  ['shoulders', 'Ombros'],
                  ['arms', 'Bracos'],
                  ['forearms', 'Antebracos'],
                  ['waist', 'Cintura'],
                  ['hips', 'Quadril'],
                  ['thighs', 'Coxas'],
                  ['calves', 'Panturrilhas'],
                  ['neck', 'Pescoco'],
                  ['bmi', 'IMC'],
                  ['bodyFatPercentage', 'BF %'],
                ].map(([field, label]) => (
                  <label key={field} className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    {label}
                    <input
                      value={form[field as keyof typeof form]}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, [field]: event.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1 text-sm"
                    />
                  </label>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              disabled={savingMeasurement || !measurementPhotoFile || !form.weight.trim()}
              onClick={() => void handleSaveMeasurement()}
              className="mt-4 rounded-xl border border-[var(--brand)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingMeasurement ? 'Salvando...' : 'Salvar registro'}
            </button>
          </article>

          {measurements.length >= 2 ? (
            <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Evolucao do peso (kg)</p>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart
                  data={[...measurements]
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((m) => ({
                      date: new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                      peso: m.weight,
                    }))}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="bodyWeightGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="var(--accent-emerald)" />
                      <stop offset="100%" stopColor="var(--accent-cyan)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v) => [`${v} kg`, 'Peso']}
                  />
                  <Line type="monotone" dataKey="peso" stroke="url(#bodyWeightGrad)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--accent-emerald)' }} animationDuration={900} />
                </LineChart>
              </ResponsiveContainer>
            </article>
          ) : null}

          <article className="card-glow-orange rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <h3 className="text-base font-extrabold text-[var(--text)]">Historico corporal</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {measurements.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Nenhum registro corporal ainda.</p>
              ) : (
                measurements.map((measurement) => (
                  <article key={measurement.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto({ url: measurement.photoUrl, date: measurement.date })}
                      className="mx-auto block w-full max-w-[18rem] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] sm:max-w-[20rem]"
                      aria-label="Abrir foto corporal"
                    >
                      <img
                        src={measurement.photoUrl}
                        alt={`Foto corporal em ${formatDateTime(measurement.date)}`}
                        className="w-full rounded-lg object-cover transition-transform duration-200 hover:scale-[1.01]"
                        style={{ aspectRatio: '4 / 5', maxHeight: '24rem' }}
                      />
                    </button>
                    <p className="mt-2 text-xs font-semibold text-[var(--text)]">{formatDateTime(measurement.date)}</p>
                    <div className="mt-1 grid gap-1 text-xs text-[var(--muted)] sm:grid-cols-2">
                      <p>Peso: {measurement.weight} kg</p>
                      <p>IMC: {measurement.bmi ?? '-'}</p>
                      <p>BF: {measurement.bodyFatPercentage != null ? `${measurement.bodyFatPercentage}%` : '-'}</p>
                      <p>Cintura: {measurement.waist != null ? `${measurement.waist} cm` : '-'}</p>
                      <p>Peitoral: {measurement.chest != null ? `${measurement.chest} cm` : '-'}</p>
                      <p>Quadril: {measurement.hips != null ? `${measurement.hips} cm` : '-'}</p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMeasurement(measurement)}
                        className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
                      >
                        Ver detalhes
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteMeasurement(measurement.id)}
                        disabled={deletingMeasurementId === measurement.id}
                        className="rounded-lg border border-red-400/70 px-2 py-1 text-xs font-semibold text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {deletingMeasurementId === measurement.id ? 'Excluindo...' : 'Excluir registro'}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </article>
        </div>
      )}

      {selectedPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedPhoto(null)}
            className="absolute right-4 top-4 rounded-full border border-white/25 bg-black/50 px-3 py-1 text-sm font-semibold text-white"
          >
            Fechar
          </button>

          <div
            className="max-h-[90vh] w-full max-w-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={selectedPhoto.url}
              alt={`Foto corporal ampliada em ${formatDateTime(selectedPhoto.date)}`}
              className="max-h-[82vh] w-full rounded-2xl object-contain"
            />
            <p className="mt-2 text-center text-xs font-semibold text-white/85">
              {formatDateTime(selectedPhoto.date)}
            </p>
          </div>
        </div>
      ) : null}

      {selectedMeasurement ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedMeasurement(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-[var(--text)]">Detalhes completos do registro</h3>
              <button
                type="button"
                onClick={() => setSelectedMeasurement(null)}
                className="rounded-lg border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--text)]"
              >
                Fechar
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSelectedPhoto({ url: selectedMeasurement.photoUrl, date: selectedMeasurement.date })}
              className="mx-auto mt-3 block w-full max-w-[17rem] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] sm:max-w-[20rem]"
              aria-label="Abrir foto do registro"
            >
              <img
                src={selectedMeasurement.photoUrl}
                alt={`Foto corporal em ${formatDateTime(selectedMeasurement.date)}`}
                className="w-full rounded-lg object-cover"
                style={{ aspectRatio: '4 / 5', maxHeight: '22rem' }}
              />
            </button>

            <div className="mt-4 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
              <p><span className="font-semibold text-[var(--text)]">Data:</span> {formatDateTime(selectedMeasurement.date)}</p>
              <p><span className="font-semibold text-[var(--text)]">Peso:</span> {selectedMeasurement.weight} kg</p>
              <p><span className="font-semibold text-[var(--text)]">Peitoral:</span> {selectedMeasurement.chest != null ? `${selectedMeasurement.chest} cm` : '-'}</p>
              <p><span className="font-semibold text-[var(--text)]">Ombros:</span> {selectedMeasurement.shoulders != null ? `${selectedMeasurement.shoulders} cm` : '-'}</p>
              <p><span className="font-semibold text-[var(--text)]">Bracos:</span> {selectedMeasurement.arms != null ? `${selectedMeasurement.arms} cm` : '-'}</p>
              <p><span className="font-semibold text-[var(--text)]">Antebracos:</span> {selectedMeasurement.forearms != null ? `${selectedMeasurement.forearms} cm` : '-'}</p>
              <p><span className="font-semibold text-[var(--text)]">Cintura:</span> {selectedMeasurement.waist != null ? `${selectedMeasurement.waist} cm` : '-'}</p>
              <p><span className="font-semibold text-[var(--text)]">Quadril:</span> {selectedMeasurement.hips != null ? `${selectedMeasurement.hips} cm` : '-'}</p>
              <p><span className="font-semibold text-[var(--text)]">Coxas:</span> {selectedMeasurement.thighs != null ? `${selectedMeasurement.thighs} cm` : '-'}</p>
              <p><span className="font-semibold text-[var(--text)]">Panturrilhas:</span> {selectedMeasurement.calves != null ? `${selectedMeasurement.calves} cm` : '-'}</p>
              <p><span className="font-semibold text-[var(--text)]">Pescoco:</span> {selectedMeasurement.neck != null ? `${selectedMeasurement.neck} cm` : '-'}</p>
              <p><span className="font-semibold text-[var(--text)]">IMC:</span> {selectedMeasurement.bmi ?? '-'}</p>
              <p><span className="font-semibold text-[var(--text)]">BF:</span> {selectedMeasurement.bodyFatPercentage != null ? `${selectedMeasurement.bodyFatPercentage}%` : '-'}</p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
