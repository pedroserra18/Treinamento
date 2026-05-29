import type {
  CompetitionReactionKind,
  CompetitionReactionSummary,
} from '../../types/competition'
import { REACTION_KINDS } from './reactionKinds'

// Aggregated reactions bar. `compact` removes the top margin so it can be
// stacked tightly under the grid tile photo button.
export function ReactionsBar({
  reactions, onReact, compact,
}: {
  reactions: CompetitionReactionSummary[]
  onReact: (kind: CompetitionReactionKind) => void
  compact?: boolean
}) {
  const byKind = new Map(reactions.map((r) => [r.kind, r]))
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? '' : 'mt-2'}`}>
      {REACTION_KINDS.map(({ key, emoji, label }) => {
        const summary = byKind.get(key)
        const count = summary?.count ?? 0
        const mine = summary?.mine ?? false
        return (
          <button
            key={key}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReact(key)
            }}
            aria-label={`${label} (${count})`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
              mine
                ? 'border-[var(--brand)] bg-[var(--brand)]/15 text-[var(--brand-strong)]'
                : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)] hover:bg-[var(--surface)]'
            }`}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 && <span className="font-mono tabular-nums">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
