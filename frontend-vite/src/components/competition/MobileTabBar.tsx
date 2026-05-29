export type CompetitionTab = 'geral' | 'ranking' | 'provas' | 'chat'

export function MobileTabBar({
  value, onChange,
}: {
  value: CompetitionTab
  onChange: (next: CompetitionTab) => void
}) {
  const tabs: Array<{ key: CompetitionTab; label: string }> = [
    { key: 'geral', label: 'Geral' },
    { key: 'ranking', label: 'Ranking' },
    { key: 'provas', label: 'Provas' },
    { key: 'chat', label: 'Chat' },
  ]
  return (
    <nav
      role="tablist"
      aria-label="Seções do desafio"
      className="sticky top-2 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 p-1 backdrop-blur-md lg:hidden"
    >
      {tabs.map((t) => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              active
                ? 'bg-[var(--brand)] text-white shadow-[0_4px_10px_-4px_rgba(255,90,60,0.55)]'
                : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
