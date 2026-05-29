import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Dumbbell, Flame } from 'lucide-react'
import type {
  Competition,
  CompetitionFeedItem,
  CompetitionStandings,
} from '../../types/competition'
import { formatDurationCompact, nowMs, ordinalBr } from './helpers'

export function PersonalStatusCard({
  competition, standings, feed, currentUserId, onTrain,
}: {
  competition: Competition
  standings: CompetitionStandings | null
  feed: CompetitionFeedItem[]
  currentUserId: string
  onTrain: () => void
}) {
  // What the user has logged TODAY. Date comparison happens at UTC midnight
  // boundary, same as the backend's `day` column.
  const todayKey = new Date().toISOString().slice(0, 10)
  const todayEntries = feed.filter(
    (e) => e.user.id === currentUserId && new Date(e.day).toISOString().slice(0, 10) === todayKey,
  )
  const postedTraining = todayEntries.some((e) => e.kind === 'TRAINING')
  const postedCardio = todayEntries.some((e) => e.kind === 'CARDIO')

  const needsTraining = (competition.type === 'TRAINING' || competition.type === 'BOTH') && !postedTraining
  const needsCardio = (competition.type === 'CARDIO' || competition.type === 'BOTH') && !postedCardio
  const todayDone = !needsTraining && !needsCardio

  const myIndex = standings?.rows.findIndex((r) => r.userId === currentUserId) ?? -1
  const myRow = myIndex >= 0 ? standings?.rows[myIndex] ?? null : null
  const rank = myIndex >= 0 ? myIndex + 1 : null
  const total = standings?.rows.length ?? 0
  const leader = standings?.rows[0]
  const gapToLeader = leader && myRow && leader.userId !== myRow.userId ? leader.daysActive - myRow.daysActive : 0

  const daysLeft = competition.endsAt
    ? Math.max(0, Math.ceil((new Date(competition.endsAt).getTime() - nowMs()) / 86_400_000))
    : null
  const isCompleted = competition.status === 'COMPLETED'

  const accent = isCompleted
    ? { border: 'border-amber-500/50', bg: 'from-amber-500/10 to-[var(--surface)]', tint: 'text-amber-600 dark:text-amber-400' }
    : todayDone
      ? { border: 'border-emerald-500/50', bg: 'from-emerald-500/10 to-[var(--surface)]', tint: 'text-emerald-600 dark:text-emerald-400' }
      : { border: 'border-rose-500/40', bg: 'from-rose-500/5 to-[var(--surface)]', tint: 'text-rose-600 dark:text-rose-400' }

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl border ${accent.border} bg-gradient-to-br ${accent.bg} p-4 sm:p-5`}
    >
      {isCompleted ? (
        <div>
          <p className={`font-mono text-[11px] font-bold uppercase tracking-[0.18em] ${accent.tint}`}>
            Resultado final
          </p>
          <p className="mt-1 text-base font-extrabold text-[var(--text)] sm:text-lg">
            {rank === 1
              ? '🏆 Você venceu o desafio!'
              : rank
                ? `Você terminou em ${ordinalBr(rank)} lugar de ${total}.`
                : 'O desafio terminou.'}
          </p>
          {myRow && (
            <p className="mt-0.5 font-mono text-xs text-[var(--muted)]">
              {myRow.daysActive} {myRow.daysActive === 1 ? 'dia' : 'dias'} ·{' '}
              <b className="text-[var(--brand-strong)]">{myRow.points} pts</b> ·{' '}
              {formatDurationCompact(myRow.totalDurationSec)}
              {myRow.volumeKg > 0 && <> · {myRow.volumeKg.toLocaleString('pt-BR')} kg</>}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={`flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] ${accent.tint}`}>
              {todayDone ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {todayDone ? 'Você fechou o dia de hoje' : 'Falta postar hoje'}
            </p>
            <p className="mt-1 text-base font-extrabold text-[var(--text)] sm:text-lg">
              {rank ? `Você está em ${ordinalBr(rank)} lugar` : 'Você ainda não pontuou'}
              {total > 0 && <span className="ml-1 text-[var(--muted)]">de {total}</span>}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-[var(--muted)]">
              {myRow && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Flame size={10} />
                    {myRow.daysActive} {myRow.daysActive === 1 ? 'dia' : 'dias'}
                  </span>
                  <span className="opacity-50">·</span>
                  <span className="font-bold text-[var(--brand-strong)]">
                    {myRow.points} pts
                  </span>
                  {myRow.streak > 0 && (
                    <>
                      <span className="opacity-50">·</span>
                      <span className="inline-flex items-center gap-0.5 font-bold text-orange-600 dark:text-orange-400">
                        <span aria-hidden className="flame-alive text-[12px] leading-none">🔥{'\u{FE0F}'}</span>
                        {myRow.streak} {myRow.streak === 1 ? 'seguido' : 'seguidos'}
                      </span>
                    </>
                  )}
                  <span className="opacity-50">·</span>
                </>
              )}
              {daysLeft != null && (
                <>
                  <span>{daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'}</span>
                  <span className="opacity-50">·</span>
                </>
              )}
              {gapToLeader > 0
                ? <span>{gapToLeader} {gapToLeader === 1 ? 'dia atrás' : 'dias atrás'} do líder</span>
                : myRow && rank === 1
                  ? <span>Liderando o desafio</span>
                  : null}
            </p>
            {!todayDone && (
              <p className="mt-2 text-[11.5px] text-[var(--muted)]">
                {needsTraining && needsCardio
                  ? 'Falta postar treino e cardio hoje.'
                  : needsTraining
                    ? 'Falta postar um treino hoje.'
                    : 'Falta postar um cardio hoje.'}
              </p>
            )}
          </div>
          {!todayDone && (
            <button
              type="button"
              onClick={onTrain}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
            >
              <Dumbbell size={13} />
              Treinar agora
            </button>
          )}
        </div>
      )}
    </motion.section>
  )
}
