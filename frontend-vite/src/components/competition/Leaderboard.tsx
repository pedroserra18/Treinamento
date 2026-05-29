import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Trophy } from 'lucide-react'
import type { CompetitionStandings } from '../../types/competition'
import { avatarThumbUrl } from '../../lib/imageTransform'
import { formatDurationCompact } from './helpers'

// Streak badge — reuses the home page's flame styles so the streak icon
// looks the same everywhere in the app. Hidden when streak is 0.
function CompetitionStreak({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/10 px-1.5 py-0.5 font-mono text-[10.5px] font-extrabold tabular-nums text-orange-600 dark:text-orange-400"
      title={`${count} ${count === 1 ? 'dia' : 'dias'} seguidos`}
    >
      <span aria-hidden className="flame-alive text-[13px] leading-none">🔥{'\u{FE0F}'}</span>
      {count}
    </span>
  )
}

// Rank-change diff: shows ↑N / ↓N / = based on the user's previous
// position. The snapshot is stored in localStorage scoped by competition
// id so each user sees their personal "since last visit" delta.
function RankDelta({ delta }: { delta: number | null }) {
  if (delta == null) return null
  if (delta === 0) {
    return (
      <span className="font-mono text-[10px] text-[var(--muted)]" title="Mesma posição">
        =
      </span>
    )
  }
  const up = delta > 0
  return (
    <span
      className={`font-mono text-[10px] font-bold ${up ? 'text-emerald-500' : 'text-rose-500'}`}
      title={up ? `Subiu ${delta} ${delta === 1 ? 'posição' : 'posições'}` : `Caiu ${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'posição' : 'posições'}`}
    >
      {up ? `↑${delta}` : `↓${Math.abs(delta)}`}
    </span>
  )
}

export function Leaderboard({
  standings, winnerUserId, rankDeltas, currentUserId, competitionName, inviteUrl,
}: {
  standings: CompetitionStandings
  winnerUserId: string | null
  rankDeltas: Map<string, number>
  currentUserId: string | undefined
  competitionName: string | null
  inviteUrl: string
}) {
  const [shareCopied, setShareCopied] = useState(false)
  // Find the calling user's row so we can build a shareable summary of
  // their current position. Hide the share button if they aren't ranked.
  const myIdx = currentUserId ? standings.rows.findIndex((r) => r.userId === currentUserId) : -1
  const handleShareRank = async () => {
    if (myIdx < 0) return
    const myRow = standings.rows[myIdx]
    const rankLabel = `${myIdx + 1}º lugar`
    const text =
      `Tô em ${rankLabel} no desafio "${competitionName ?? 'SerraAthlo'}" — ` +
      `${myRow.daysActive} dias, ${myRow.points} pontos${myRow.streak > 0 ? `, streak de ${myRow.streak}` : ''}. ` +
      `Vem treinar 👇 ${inviteUrl}`
    try {
      if (navigator.share) {
        await navigator.share({ text })
      } else {
        await navigator.clipboard.writeText(text)
      }
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 2000)
    } catch {
      // user cancelled — ignore
    }
  }
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
          <Trophy size={14} className="text-[var(--brand)]" />
          Ranking
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {myIdx >= 0 && (
            <button
              type="button"
              onClick={() => void handleShareRank()}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            >
              <Link2 size={10} />
              {shareCopied ? 'Copiado' : 'Compartilhar posição'}
            </button>
          )}
          <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
            desempate: dias › pontos › tempo › volume
          </p>
        </div>
      </div>
      <ol className="mt-3 space-y-1.5">
        {standings.rows.map((row, idx) => {
          const isWinner = winnerUserId === row.userId
          return (
            <li
              key={row.userId}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                isWinner
                  ? 'border-[#f1c84a] bg-gradient-to-r from-[#fffaea] to-[var(--surface-hover)] dark:from-[#3d2e09]/40'
                  : 'border-[var(--line)] bg-[var(--surface-hover)]'
              }`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                  idx === 0
                    ? 'bg-[#f4c443] text-[#5a4209]'
                    : idx === 1
                      ? 'bg-[#d4d4d4] text-[#3a3a3a]'
                      : idx === 2
                        ? 'bg-[#cd7f32] text-white'
                        : 'bg-[var(--surface)] text-[var(--muted)]'
                }`}
              >
                {idx + 1}
              </span>
              <Link
                to={`/u/${row.userId}`}
                className="flex shrink-0 items-center"
                aria-label={`Abrir perfil de ${row.user.name ?? row.user.handle}`}
              >
                {row.user.avatarUrl ? (
                  <img
                    src={avatarThumbUrl(row.user.avatarUrl, 80)}
                    alt={row.user.name ?? row.user.handle}
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface)] text-sm font-bold text-[var(--text)]">
                    {(row.user.name ?? row.user.handle).slice(0, 1).toUpperCase()}
                  </div>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/u/${row.userId}`}
                    className="min-w-0 truncate text-sm font-semibold text-[var(--text)] hover:underline"
                  >
                    {row.user.name ?? `@${row.user.handle}`}
                    {isWinner && <span className="ml-1.5 text-xs">🏆</span>}
                  </Link>
                  <RankDelta delta={rankDeltas.get(row.userId) ?? null} />
                  <CompetitionStreak count={row.streak} />
                </div>
                <p className="mt-0.5 font-mono text-[10.5px] text-[var(--muted)]">
                  ⏱ {formatDurationCompact(row.totalDurationSec)}
                  {row.volumeKg > 0 && (
                    <> · 🏋 {row.volumeKg.toLocaleString('pt-BR')} kg</>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="flex items-baseline justify-end gap-2">
                  <span className="font-mono text-lg font-extrabold tabular-nums text-[var(--text)]">
                    {row.daysActive}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--muted)]">dias</span>
                </div>
                <div className="mt-0.5 inline-flex items-baseline gap-1 rounded-full bg-[var(--brand)]/10 px-1.5 py-0.5">
                  <span className="font-mono text-[11px] font-extrabold tabular-nums text-[var(--brand-strong)]">
                    {row.points}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--brand-strong)]">
                    pts
                  </span>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
