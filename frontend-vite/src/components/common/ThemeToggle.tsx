type ThemeToggleProps = {
  isDark: boolean
  onToggle: () => void
}

export function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:border-[var(--brand)]"
      aria-label="Alternar tema"
      type="button"
    >
      {isDark ? 'Tema claro' : 'Tema escuro'}
    </button>
  )
}
