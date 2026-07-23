import { Users, Heart } from 'lucide-react'

// Primitivas de UI do FeedPostCard: chip com ícone, card de estatística e
// botão de ação (like/comentar/compartilhar). Presentacionais, sem estado.

export function ChipBtn({
  icon: IconComp, label, tone = 'default', onClick, disabled, title,
}: {
  icon: typeof Users
  label?: string
  tone?: 'default' | 'warn' | 'brand'
  onClick?: () => void
  disabled?: boolean
  title?: string
}) {
  const toneClass = tone === 'warn'
    ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/15'
    : tone === 'brand'
      ? 'border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]'
      : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--text)]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${toneClass}`}
    >
      <IconComp size={13} />
      {label && <span>{label}</span>}
    </button>
  )
}

export function FeedStat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5">
      <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-extrabold leading-none tracking-tight ${
          highlight ? 'text-[var(--brand)]' : 'text-[var(--text)]'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

export function ActionBtn({
  icon: IconComp, label, active, onClick, ariaLabel,
}: {
  icon: typeof Heart
  label?: string | number
  active?: boolean
  onClick?: () => void
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
        active
          ? 'border-[var(--brand)]/40 bg-[var(--brand)]/10 text-[var(--brand)]'
          : 'border-transparent text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
      }`}
    >
      <IconComp size={14} strokeWidth={active ? 2.2 : 1.8} className={active && IconComp === Heart ? 'fill-[var(--brand)]' : ''} />
      {label !== undefined && <span className="font-mono tabular-nums">{label}</span>}
    </button>
  )
}
