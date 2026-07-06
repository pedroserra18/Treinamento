import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Share2, X as XIcon } from 'lucide-react'
import { useScrollLock } from '../../hooks/useScrollLock'
import type { BodyMeasurement } from '../../types/progress'
import { formatDateTime } from './progress-utils'

// Animates `value` from 0 → target over ~600ms. The hero numbers feel
// dead when they pop in immediately on mount; the easing makes the page
// feel responsive without leaning on a third-party animation lib.
function useCountUp(target: number, durationMs = 600): number {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    let cancelled = false
    const from = 0
    const start = performance.now()
    const tick = (now: number) => {
      if (cancelled) return
      const elapsed = now - start
      const t = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setDisplay(from + (target - from) * eased)
      if (t < 1) requestAnimationFrame(tick)
      else setDisplay(target)
    }
    requestAnimationFrame(tick)
    return () => { cancelled = true }
  }, [target, durationMs])

  return display
}

export function HeroSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const W = 72, H = 22
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(1, max - min)
  const step = W / Math.max(1, values.length - 1)
  const points = values
    .map((v, i) => ({
      x: i * step,
      y: H - 2 - ((v - min) / range) * (H - 4),
    }))
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area = `${d} L ${W} ${H} L 0 ${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[22px] w-[72px]" aria-hidden>
      <path d={area} fill={color} fillOpacity={0.18} stroke="none" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function HeroStat({
  label, value, unit, tone, delta, deltaLabel, sparkline, numericValue,
}: {
  label: string
  value: string
  unit?: string
  tone: 'brand' | 'default'
  delta?: number | null
  deltaLabel?: string
  sparkline?: number[]
  // Optional numeric value for the count-up animation; falls back to the
  // formatted string when not provided (zero animation, no risk).
  numericValue?: number
}) {
  // Count-up only fires when we have a numeric target. Display value swaps
  // to the formatted string once the animation finishes (or right away if
  // numericValue isn't given).
  const animated = useCountUp(numericValue ?? 0)
  const isAnimating = numericValue != null && animated < numericValue
  const displayValue = numericValue != null
    ? Math.round(animated).toLocaleString('pt-BR')
    : value
  const sparkColor = tone === 'brand' ? 'var(--brand)' : 'var(--muted)'
  const deltaIsUp = delta != null && delta > 0
  const deltaIsDown = delta != null && delta < 0
  const deltaClass =
    delta == null
      ? 'text-[var(--muted)]'
      : deltaIsUp
        ? 'text-emerald-600 dark:text-emerald-400'
        : deltaIsDown
          ? 'text-red-500'
          : 'text-[var(--muted)]'
  const deltaText =
    delta == null ? '—' : delta === 0 ? '±0%' : `${deltaIsUp ? '▲ +' : '▼ '}${Math.abs(delta)}%`

  return (
    <div className="sm:text-right">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-[22px] font-semibold leading-none tracking-tight tabular-nums ${
          tone === 'brand' ? 'text-[var(--brand-strong)]' : 'text-[var(--text)]'
        }`}
      >
        {isAnimating ? displayValue : value}
        {unit && <span className="ml-1 font-mono text-[11px] font-medium text-[var(--muted)]">{unit}</span>}
      </p>
      {(sparkline || delta != null) && (
        <div className="mt-1.5 flex items-center justify-start gap-1.5 sm:justify-end">
          {sparkline && <HeroSparkline values={sparkline} color={sparkColor} />}
          {(delta != null || deltaLabel) && (
            <span className={`font-mono text-[10px] font-semibold ${deltaClass}`} title={deltaLabel}>
              {deltaText}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export function MeasTile({
  label, value, unit, tone,
}: {
  label: string
  value: string
  unit?: string
  tone?: 'up' | 'down'
}) {
  const deltaClass = tone === 'down' ? 'text-emerald-600' : tone === 'up' ? 'text-red-500' : 'text-[var(--text)]'
  return (
    <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className={`mt-0.5 font-mono text-[15px] font-semibold ${deltaClass}`}>
        {value}
        {unit && <span className="ml-1 text-[10px] font-medium text-[var(--muted)]">{unit}</span>}
      </p>
    </div>
  )
}

export function MeasRow({
  label, value, unit, delta,
}: {
  label: string
  value: number
  unit: string
  delta: number | null
}) {
  const positive = delta != null && delta > 0
  const negative = delta != null && delta < 0
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
      <span className="text-[13px] font-medium text-[var(--text)]">{label}</span>
      <span className="font-mono text-[13px] font-semibold text-[var(--text)]">
        {value}
        <span className="ml-1 text-[10px] font-medium text-[var(--muted)]">{unit}</span>
      </span>
      <span
        className={`font-mono text-[10.5px] font-semibold ${
          delta == null
            ? 'text-[var(--muted)]'
            : positive
              ? 'text-emerald-600'
              : negative
                ? 'text-red-500'
                : 'text-[var(--muted)]'
        }`}
      >
        {delta == null ? '—' : `${positive ? '▲ +' : negative ? '▼ ' : ''}${delta}`}
      </span>
    </div>
  )
}

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  )
}

// Decimal input with the unit (`kg`, `cm`, `%`) glued to its right edge —
// reads cleaner than the unit-as-suffix-in-label that the form was using.
export function UnitInput({
  label, value, unit, onChange,
}: {
  label: string
  value: string
  unit: string
  onChange: (next: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </span>
      <div className="relative">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 pr-8 text-sm"
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center font-mono text-[10.5px] text-[var(--muted)]">
          {unit}
        </span>
      </div>
    </label>
  )
}

export function MeasurementDetailsModal({
  measurement, onClose, onOpenPhoto,
}: {
  measurement: BodyMeasurement
  onClose: () => void
  onOpenPhoto: () => void
}) {
  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        style={{ maxHeight: 'min(90vh, 720px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto overscroll-contain p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-extrabold text-[var(--text)]">Detalhes completos do registro</h3>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <XIcon size={13} />
              Fechar
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenPhoto}
            className="mx-auto mt-3 block w-full max-w-[17rem] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] sm:max-w-[20rem]"
          >
            <img
              src={measurement.photoUrl}
              alt={`Foto corporal em ${formatDateTime(measurement.date)}`}
              className="w-full rounded-lg object-cover"
              style={{ aspectRatio: '4 / 5', maxHeight: '22rem' }}
            />
          </button>

          <div className="mt-4 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
            <p><b className="text-[var(--text)]">Data:</b> {formatDateTime(measurement.date)}</p>
            <p><b className="text-[var(--text)]">Peso:</b> {measurement.weight} kg</p>
            <p><b className="text-[var(--text)]">Peitoral:</b> {measurement.chest != null ? `${measurement.chest} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Ombros:</b> {measurement.shoulders != null ? `${measurement.shoulders} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Braços:</b> {measurement.arms != null ? `${measurement.arms} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Antebraços:</b> {measurement.forearms != null ? `${measurement.forearms} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Cintura:</b> {measurement.waist != null ? `${measurement.waist} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Quadril:</b> {measurement.hips != null ? `${measurement.hips} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Coxas:</b> {measurement.thighs != null ? `${measurement.thighs} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Panturrilhas:</b> {measurement.calves != null ? `${measurement.calves} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">Pescoço:</b> {measurement.neck != null ? `${measurement.neck} cm` : '—'}</p>
            <p><b className="text-[var(--text)]">IMC:</b> {measurement.bmi ?? '—'}</p>
            <p><b className="text-[var(--text)]">BF:</b> {measurement.bodyFatPercentage != null ? `${measurement.bodyFatPercentage}%` : '—'}</p>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

// ─── Photo gallery + compare modal ────────────────────────────────────────

export function PhotoGalleryModal({
  measurements, initialMode, onClose, onOpenPhoto,
}: {
  measurements: BodyMeasurement[]
  initialMode: 'grid' | 'compare'
  onClose: () => void
  onOpenPhoto: (m: BodyMeasurement) => void
}) {
  useScrollLock(true)
  const [mode, setMode] = useState<'grid' | 'compare'>(initialMode)
  // For compare mode: default A = oldest, B = newest, so the diff reads
  // top-down as the natural "before → after".
  const [aId, setAId] = useState<string>(measurements[measurements.length - 1]?.id ?? '')
  const [bId, setBId] = useState<string>(measurements[0]?.id ?? '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const a = useMemo(() => measurements.find((m) => m.id === aId) ?? null, [measurements, aId])
  const b = useMemo(() => measurements.find((m) => m.id === bId) ?? null, [measurements, bId])

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        style={{ maxHeight: 'min(92vh, 800px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3 sm:px-5">
          <div className="inline-flex rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] p-[3px]">
            {(['grid', 'compare'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  mode === m ? 'bg-[var(--brand)] text-white' : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {m === 'grid' ? 'Todas as fotos' : 'Comparar'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            <XIcon size={13} />
            Fechar
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto overscroll-contain p-4 sm:p-5">
          {mode === 'grid' ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {measurements.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpenPhoto(m)}
                  className="group relative aspect-[3/4] overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] transition-transform hover:-translate-y-0.5"
                >
                  <img
                    src={m.photoUrl}
                    alt={`Foto corporal em ${new Date(m.date).toLocaleDateString('pt-BR')}`}
                    className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  <span className="absolute left-1.5 top-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 py-[2px] font-mono text-[9.5px] font-semibold text-[var(--text)]">
                    {new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '')}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <PhotoCompareView a={a} b={b} measurements={measurements} onPickA={setAId} onPickB={setBId} />
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

export function PhotoCompareView({
  a, b, measurements, onPickA, onPickB,
}: {
  a: BodyMeasurement | null
  b: BodyMeasurement | null
  measurements: BodyMeasurement[]
  onPickA: (id: string) => void
  onPickB: (id: string) => void
}) {
  const shareRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const handleShare = async () => {
    if (!shareRef.current || !a || !b) return
    setSharing(true)
    setShareError(null)
    try {
      // Lazy-load html2canvas — it's ~150KB and the page already pays for it
      // elsewhere, but importing here keeps the initial bundle smaller for
      // users who never share.
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(shareRef.current, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 0.95),
      )
      if (!blob) throw new Error('Falha ao gerar imagem')

      // Prefer the native Web Share API on mobile, fall back to a plain
      // download elsewhere. Both feel native to the platform.
      const file = new File([blob], `comparacao-${a.date.slice(0, 10)}-vs-${b.date.slice(0, 10)}.png`, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> }
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: 'Comparação de evolução' })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao compartilhar'
      // User cancelling the Web Share dialog throws AbortError — ignore.
      if (!/abort/i.test(msg)) setShareError(msg)
    } finally {
      setSharing(false)
    }
  }

  // Compute deltas for every metric present in both A and B.
  const rows = useMemo(() => {
    if (!a || !b) return []
    const fields: Array<{ key: keyof BodyMeasurement; label: string; unit: string }> = [
      { key: 'weight', label: 'Peso', unit: 'kg' },
      { key: 'bmi', label: 'IMC', unit: '' },
      { key: 'bodyFatPercentage', label: 'Body Fat', unit: '%' },
      { key: 'chest', label: 'Peitoral', unit: 'cm' },
      { key: 'shoulders', label: 'Ombros', unit: 'cm' },
      { key: 'arms', label: 'Braços', unit: 'cm' },
      { key: 'forearms', label: 'Antebraços', unit: 'cm' },
      { key: 'waist', label: 'Cintura', unit: 'cm' },
      { key: 'hips', label: 'Quadril', unit: 'cm' },
      { key: 'thighs', label: 'Coxas', unit: 'cm' },
      { key: 'calves', label: 'Panturrilhas', unit: 'cm' },
      { key: 'neck', label: 'Pescoço', unit: 'cm' },
    ]
    return fields
      .map(({ key, label, unit }) => {
        const av = a[key] as number | null
        const bv = b[key] as number | null
        if (av == null || bv == null) return null
        const delta = Number((bv - av).toFixed(1))
        return { key, label, unit, av, bv, delta }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [a, b])

  return (
    <div className="space-y-4">
      {/* Date pickers */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <FormField label="Antes (A)">
          <select
            value={a?.id ?? ''}
            onChange={(e) => onPickA(e.target.value)}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1.5 text-sm"
          >
            {measurements.map((m) => (
              <option key={m.id} value={m.id}>
                {new Date(m.date).toLocaleDateString('pt-BR')}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Depois (B)">
          <select
            value={b?.id ?? ''}
            onChange={(e) => onPickB(e.target.value)}
            className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1.5 text-sm"
          >
            {measurements.map((m) => (
              <option key={m.id} value={m.id}>
                {new Date(m.date).toLocaleDateString('pt-BR')}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      {a && b && (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={sharing}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12px] font-medium text-white hover:bg-[var(--brand-strong)] disabled:opacity-50"
            >
              <Share2 size={12} />
              {sharing ? 'Gerando…' : 'Compartilhar'}
            </button>
          </div>
          {shareError && <p className="text-[11px] text-red-500">{shareError}</p>}

          {/* Photos stack on phones so the images stay legible; side-by-side
              from sm+ where the screen has room for both. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[a, b].map((m, idx) => (
              <div key={m.id} className="space-y-1.5">
                <div className="flex items-center justify-between font-mono text-[10.5px] text-[var(--muted)]">
                  <b className="font-semibold text-[var(--text)]">{idx === 0 ? 'A' : 'B'}</b>
                  <span>{new Date(m.date).toLocaleDateString('pt-BR')}</span>
                </div>
                <img
                  src={m.photoUrl}
                  alt={`Foto ${idx === 0 ? 'A' : 'B'}`}
                  className="mx-auto w-full max-w-sm rounded-lg border border-[var(--line)] object-cover sm:max-w-none"
                  style={{ aspectRatio: '3 / 4' }}
                />
              </div>
            ))}
          </div>

          {/* Metric deltas */}
          {rows.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                Variação A → B
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {rows.map(({ key, label, unit, av, bv, delta }) => {
                  // Coloured the same way as MeasRow: downward usually positive.
                  const positive = delta > 0
                  const negative = delta < 0
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2"
                    >
                      <span className="text-[13px] font-medium text-[var(--text)]">{label}</span>
                      <span className="font-mono text-[11.5px] text-[var(--muted)]">
                        {av}
                        {unit && <span className="ml-0.5 text-[10px]">{unit}</span>}
                        <span className="opacity-50"> → </span>
                        <b className="font-semibold text-[var(--text)]">{bv}</b>
                        {unit && <span className="ml-0.5 text-[10px]">{unit}</span>}
                      </span>
                      <span
                        className={`font-mono text-[10.5px] font-semibold ${
                          delta === 0
                            ? 'text-[var(--muted)]'
                            : positive
                              ? 'text-red-500'
                              : negative
                                ? 'text-emerald-600'
                                : 'text-[var(--muted)]'
                        }`}
                      >
                        {delta === 0 ? '±0' : `${positive ? '+' : ''}${delta}`}
                        {unit && <span className="ml-0.5 opacity-70">{unit}</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Off-screen 9:16 share template captured by html2canvas. Kept in
              the DOM (not display:none) so its computed styles + image
              rendering are stable across browsers. */}
          <div
            ref={shareRef}
            aria-hidden
            className="pointer-events-none fixed -left-[9999px] top-0"
            style={{ width: 1080, height: 1920, background: '#0a0a0a', color: '#fff', fontFamily: 'sans-serif', padding: '64px 56px', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 56 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: '#ff5a3c', letterSpacing: '0.18em' }}>SERRAATHLO</span>
              <span style={{ fontSize: 22, color: '#a4a6ad', letterSpacing: '0.18em', textTransform: 'uppercase' }}>Comparação</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 56 }}>
              {[a, b].map((m, idx) => (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontSize: 36, fontWeight: 800 }}>{idx === 0 ? 'ANTES' : 'DEPOIS'}</span>
                    <span style={{ fontSize: 22, color: '#a4a6ad' }}>{new Date(m.date).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <img
                    src={m.photoUrl}
                    alt=""
                    crossOrigin="anonymous"
                    style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 18, border: '2px solid #ff5a3c33' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <span style={{ fontSize: 24, color: '#a4a6ad', letterSpacing: '0.16em', textTransform: 'uppercase' }}>Variação</span>
              {rows.slice(0, 8).map(({ key, label, unit, av, bv, delta }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 18, fontSize: 26 }}>
                  <span style={{ flex: 1, color: '#fff', fontWeight: 600 }}>{label}</span>
                  <span style={{ color: '#a4a6ad' }}>{av}{unit} → <b style={{ color: '#fff' }}>{bv}{unit}</b></span>
                  <span style={{
                    width: 130,
                    textAlign: 'right',
                    fontWeight: 700,
                    color: delta === 0 ? '#a4a6ad' : delta > 0 ? '#ff5a3c' : '#34d399',
                  }}>
                    {delta === 0 ? '±0' : `${delta > 0 ? '+' : ''}${delta}`}{unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
