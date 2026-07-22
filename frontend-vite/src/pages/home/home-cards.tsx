import type { ReactNode } from 'react'
import { Flame } from 'lucide-react'
import { lineSparkPath } from './home-utils'

// Primitivas visuais (sem estado) da HomePage: sparklines, chama de sequência,
// card de estatística e cabeçalho de seção. Movidas verbatim.

// Sparkline (line + filled area) for the stat cards.
export function LineSparkline({ values, color }: { values: number[]; color: string }) {
  const { line, area } = lineSparkPath(values)
  return (
    <svg
      viewBox="0 0 70 28"
      preserveAspectRatio="none"
      className="absolute bottom-2 right-2.5 h-7 w-[70px] opacity-90"
      aria-hidden
    >
      <path d={area} fill={color} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Streak flame rendered as the native 🔥 emoji so it matches the OS-level
// icon the user sees everywhere else. Two states:
//   - `active` (streak > 0): warm glow + flicker animation
//   - frozen (streak === 0): hue-rotated to icy cyan, no animation, slight
//     blue drop-shadow. Conveys "lost the streak" without changing the shape.
export function StreakFlame({ active }: { active: boolean }) {
  return (
    <span
      className={`pointer-events-none absolute bottom-1 right-2 select-none text-[34px] leading-none ${
        active ? 'flame-alive' : 'flame-frozen'
      }`}
      // emoji presentation variant: forces the colored glyph over the
      // black-and-white text fallback on platforms that ship both.
      aria-hidden
      title={active ? 'Sequência ativa' : 'Sequência interrompida'}
    >
      🔥{'️'}
    </span>
  )
}

// Tiny bar sparkline for the "Treinos / semana" card — same idea as the mock.
export function BarsSparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  return (
    <svg
      viewBox="0 0 70 28"
      preserveAspectRatio="none"
      className="absolute bottom-2 right-2.5 h-7 w-[70px] opacity-90"
      aria-hidden
    >
      {values.map((v, i) => {
        const w = 6
        const gap = (70 - values.length * w) / Math.max(1, values.length - 1)
        const x = i * (w + gap)
        const h = Math.max(2, (v / max) * 22)
        return <rect key={i} x={x} y={28 - h} width={w} height={h} rx={1} fill={color} />
      })}
    </svg>
  )
}

type StatCardProps = {
  label: string
  value: string | number
  unit?: string
  delta?: string
  deltaDirection?: 'up' | 'down' | 'flat'
  icon: typeof Flame
  tone: 'peach' | 'rose' | 'mint'
  spark?: ReactNode
}

export function StatCard({ label, value, unit, delta, deltaDirection = 'up', icon: IconEl, tone, spark }: StatCardProps) {
  // Per-tone gradient — uses color-mix against --surface so the cards keep
  // their warm/cool accent in both light and dark themes.
  const gradient = {
    peach: 'linear-gradient(135deg, var(--surface) 30%, color-mix(in srgb, var(--brand) 16%, var(--surface)) 130%)',
    rose:  'linear-gradient(135deg, var(--surface) 30%, color-mix(in srgb, #e6447a 14%, var(--surface)) 130%)',
    mint:  'linear-gradient(135deg, var(--surface) 30%, color-mix(in srgb, var(--accent-emerald) 16%, var(--surface)) 130%)',
  }[tone]

  const deltaColor = deltaDirection === 'down' ? 'text-rose-500' : deltaDirection === 'flat' ? 'text-[var(--muted)]' : 'text-emerald-600'
  const arrow = deltaDirection === 'down' ? '▼' : deltaDirection === 'flat' ? '·' : '▲'

  return (
    <div
      className="relative cursor-default overflow-hidden rounded-2xl border border-[var(--line)] p-4 transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_26px_-22px_rgba(40,15,5,0.35)]"
      style={{ background: gradient }}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          {label}
        </span>
        <span className="grid h-5 w-5 place-items-center rounded-md border border-black/5 bg-white/70 text-[var(--ink-2,var(--text))]">
          <IconEl size={11} strokeWidth={2} />
        </span>
      </div>
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="text-[34px] font-semibold leading-none tracking-tight text-[var(--text)]">{value}</span>
        {unit && <span className="font-mono text-[12px] font-medium text-[var(--muted)]">{unit}</span>}
      </div>
      {delta && (
        <span className={`inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold ${deltaColor}`}>
          {arrow} {delta}
        </span>
      )}
      {spark}
    </div>
  )
}

// Small kicker pattern used in section headers ("Bem-vindo, Pedro" style).
export function SectionHead({ title, accent, sub }: { title: string; accent: string; sub?: string }) {
  return (
    <div className="mb-3.5 mt-2 flex items-end justify-between gap-2">
      <h2 className="text-[22px] font-semibold tracking-tight text-[var(--text)]">
        {title} <span className="font-serif-accent text-[var(--brand-strong)]">{accent}</span>
      </h2>
      {sub && (
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
          {sub}
        </span>
      )}
    </div>
  )
}
