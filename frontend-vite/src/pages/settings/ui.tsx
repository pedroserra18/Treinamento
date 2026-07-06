// Primitivos de UI compartilhados entre os paineis da SettingsPage.

export function PanelTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] text-[var(--muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </label>
  )
}


export function ToggleRow({
  label, description, checked, onToggle, disabled,
}: {
  label: string
  description: string
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] p-3">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-[var(--text)]">{label}</p>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">{description}</p>
      </div>
      {/* iOS-style toggle. We use inline-flex + items-center so the knob is
          vertically centered without depending on `absolute top-[2px]`, which
          was rendering inconsistently inside the panel (knob sized 0 in some
          builds, making the toggle look like a solid bar). */}
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full border px-[2px] transition-colors disabled:opacity-50 ${
          checked
            ? 'border-[var(--brand)] bg-[var(--brand)]'
            : 'border-[var(--line)] bg-[var(--surface-hover)]'
        }`}
      >
        <span
          aria-hidden
          className={`block h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-out ${
            checked ? 'translate-x-[20px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

// ─── Theme ────────────────────────────────────────────────────────────────


export function AboutRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2 last:border-b-0">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</span>
      <span className="text-right text-[12.5px] text-[var(--text)]">{value}</span>
    </div>
  )
}

// ─── Admin tools ──────────────────────────────────────────────────────────
// Painel só visível pra ADMIN (filtro na sidebar/chips garante isso). Concentra
// links pras páginas administrativas que não cabem no navbar principal,
// especialmente útil no PWA mobile onde não há barra de URL.

