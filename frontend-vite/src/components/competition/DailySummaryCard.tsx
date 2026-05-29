import { CheckCircle2 } from 'lucide-react'
import type {
  CompetitionFeedItem,
  CompetitionType,
} from '../../types/competition'

// "Pulse of the day" card on top of the feed. Computed from the feed list
// — for a 10-person room with at most 2 proofs/day, the feed page (cap 30)
// trivially contains every "today" entry, so we don't need a separate endpoint.
export function DailySummaryCard({
  feed, totalMembers, type,
}: {
  feed: CompetitionFeedItem[]
  totalMembers: number
  type: CompetitionType
}) {
  const todayKey = new Date().toISOString().slice(0, 10)
  const todays = feed.filter((e) => new Date(e.day).toISOString().slice(0, 10) === todayKey)
  const usersToday = new Set(todays.map((e) => e.user.id))
  const maxPerMember = type === 'BOTH' ? 2 : 1
  const maxTotal = totalMembers * maxPerMember
  const pct = maxTotal === 0 ? 0 : Math.round((todays.length / maxTotal) * 100)
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
          <CheckCircle2 size={14} className="text-[var(--brand)]" />
          Hoje
        </h2>
        <span className="font-mono text-[11px] text-[var(--muted)]">
          {todays.length}/{maxTotal} provas · {usersToday.size}/{totalMembers} membros
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
        <div
          className="h-full rounded-full bg-[var(--brand)] transition-all"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--muted)]">
        {pct >= 100
          ? 'Sala fechada hoje: todo mundo postou! 🔥'
          : `${pct}% das provas do dia já foram registradas.`}
      </p>
    </section>
  )
}
