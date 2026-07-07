import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { ChipTone } from './ai-review-metrics'

// Componentes de apresentação pequenos e sem estado usados pela AIWorkoutPage
// (quiz, tela de Resumo e tela de Resultado). Movidos verbatim — render idêntico.

export function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--muted)]">Pergunta {step} de {total}</span>
        <span className="text-xs font-bold text-[var(--brand)]">{Math.round((step / total) * 100)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]">
        <motion.div
          className="h-full rounded-full bg-[var(--brand)]"
          animate={{ width: `${(step / total) * 100}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>
    </div>
  )
}

export function OptionCard({
  label, hint, selected, recommended, onClick,
}: {
  label: string; hint?: string; selected: boolean; recommended?: boolean; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full rounded-2xl border-2 px-4 py-3 text-left transition-all ${
        selected
          ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface))]'
          : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand)]/50'
      }`}
    >
      <p className={`flex items-center gap-1.5 text-sm font-bold ${selected ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>
        <span className="min-w-0 truncate">{label}</span>
        {recommended && (
          <span className="shrink-0 text-[12px] text-[var(--brand)]" title="Recomendado" aria-label="Recomendado">★</span>
        )}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--muted)]">{hint}</p>}
    </button>
  )
}

// ─── REVIEW screen — small presentational components ────────────────────────

export function MiniStat({ label, value, unit, delta }: { label: string; value: string; unit: string; delta: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
      <div className="min-w-0">
        <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
          {label}
        </p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-base font-extrabold leading-none tracking-tight text-[var(--text)] sm:text-lg">
            {value}
          </span>
          <span className="text-[11px] text-[var(--muted)]">{unit}</span>
        </p>
      </div>
      <span
        className="shrink-0 rounded-md border border-[var(--brand)]/30 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-[var(--brand-strong)]"
        style={{ background: 'color-mix(in srgb, var(--brand) 9%, transparent)' }}
      >
        {delta}
      </span>
    </div>
  )
}

export function LegendItem({ tone, label }: { tone: ChipTone; label: string }) {
  const dotClass =
    tone === 'brand' ? 'bg-[var(--brand)]'
    : tone === 'ai' ? 'bg-[var(--muted)]'
    : 'bg-[var(--line)]'
  return (
    <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-[var(--muted)]">
      <span className={`h-1.5 w-1.5 rounded-sm ${dotClass}`} />
      {label}
    </span>
  )
}

// ─── RESULT screen — small presentational components ────────────────────────

export function HeroStat({ label, value, unit, trend, trendTone }: {
  label: string
  value: string
  unit?: string
  trend?: string
  trendTone?: 'positive' | 'neutral'
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)]/40 px-3 py-3">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-1.5 font-mono text-2xl font-semibold leading-none tracking-tight text-[var(--text)] sm:text-3xl">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-[var(--muted)]">{unit}</span>}
      </p>
      {trend && (
        <p className={`mt-1.5 font-mono text-[10px] ${trendTone === 'positive' ? 'text-emerald-500' : 'text-[var(--muted)]'}`}>
          {trend}
        </p>
      )}
    </div>
  )
}

export function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--text)]">{value}</p>
    </div>
  )
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInlineBold(text: string): ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-bold text-[var(--text)]">{part}</strong> : part
  )
}

export function AITextRenderer({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1 text-sm text-[var(--text)]">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('## ')) return <h3 key={idx} className="mt-4 text-base font-extrabold first:mt-0">{trimmed.slice(3)}</h3>
        if (trimmed.startsWith('### ')) return <h4 key={idx} className="mt-3 font-bold">{trimmed.slice(4)}</h4>
        if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) return <h4 key={idx} className="mt-3 font-bold">{trimmed.slice(2, -2)}</h4>
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) return <p key={idx} className="pl-4 text-[var(--muted)]"><span className="mr-2 text-[var(--brand)]">•</span>{renderInlineBold(trimmed.slice(2))}</p>
        if (trimmed === '') return <div key={idx} className="h-2" />
        return <p key={idx} className="leading-relaxed">{renderInlineBold(trimmed)}</p>
      })}
    </div>
  )
}
