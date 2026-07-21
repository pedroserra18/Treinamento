import { useState, useEffect, type ReactNode } from 'react'
import type { AdminSortBy } from '../../types/admin'
import { PILL_TONES, STATUS_META, type SortOrder, type PillTone } from './admin-users-utils'

// Componentes de apresentação pequenos e sem estado (kit de UI) da AdminUsersPage:
// pills/tones de status/plano/acesso, botão de ícone, contador animado, skeleton
// de linhas, cabeçalho ordenável e linha de detalhe. Movidos verbatim.

export function CountUp({ target }: { target: number }) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let frame = 0
    const duration = 900
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return <>{value}</>
}

export function Pill({ children, tone }: { children: ReactNode; tone: PillTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  )
}

export function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status || '—', tone: 'disabled' as PillTone, dot: 'bg-[var(--muted)]' }
  return (
    <Pill tone={meta.tone}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </Pill>
  )
}

export function IconButton({
  title,
  onClick,
  disabled,
  tone = 'default',
  children,
}: {
  title: string
  onClick?: () => void
  disabled?: boolean
  tone?: 'default' | 'warn' | 'danger' | 'ok'
  children: ReactNode
}) {
  const hover =
    tone === 'warn'
      ? 'hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-500/15 dark:hover:text-amber-300'
      : tone === 'danger'
        ? 'hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400'
        : tone === 'ok'
          ? 'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300'
          : 'hover:border-[var(--brand)]/40 hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-[30px] w-[30px] place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors disabled:pointer-events-none disabled:opacity-35 ${hover}`}
    >
      {children}
    </button>
  )
}

export function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="[&>td]:border-b [&>td]:border-[var(--line)] [&>td]:px-2 [&>td]:py-3.5">
          <td className="!pl-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--surface-hover)]" />
              <div className="space-y-1.5">
                <div className="h-3 w-28 animate-pulse rounded bg-[var(--surface-hover)]" />
                <div className="h-2.5 w-20 animate-pulse rounded bg-[var(--surface-hover)]" />
              </div>
            </div>
          </td>
          <td><div className="h-3 w-40 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td><div className="h-3 w-16 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td><div className="h-3 w-12 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td><div className="h-3 w-14 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td><div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td><div className="h-3 w-16 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
          <td className="!pr-4"><div className="ml-auto h-3 w-16 animate-pulse rounded bg-[var(--surface-hover)]" /></td>
        </tr>
      ))}
    </>
  )
}

// Cabeçalho de coluna ordenável.
export function SortHeader({
  label,
  field,
  activeField,
  order,
  onSort,
}: {
  label: string
  field: AdminSortBy
  activeField: AdminSortBy
  order: SortOrder
  onSort: (f: AdminSortBy) => void
}) {
  const active = activeField === field
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`inline-flex items-center gap-1 transition-colors hover:text-[var(--text)] ${active ? 'text-[var(--text)]' : ''}`}
    >
      {label}
      <span className={`text-[9px] ${active ? 'text-[var(--brand)]' : 'opacity-40'}`}>
        {active ? (order === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  )
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 last:border-b-0">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <span className="text-right text-[13px] text-[var(--text)]">{value}</span>
    </div>
  )
}
