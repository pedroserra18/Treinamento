import type { CompetitionReactionKind } from '../../types/competition'

export const REACTION_KINDS: Array<{ key: CompetitionReactionKind; emoji: string; label: string }> = [
  { key: 'CLAP', emoji: '👏', label: 'Aplaudir' },
  { key: 'FIRE', emoji: '🔥', label: 'Brabo' },
  { key: 'STRONG', emoji: '💪', label: 'Forte' },
  { key: 'PRAY', emoji: '🙏', label: 'Respeito' },
]
