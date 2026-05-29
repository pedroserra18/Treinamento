import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { daysHoursMinutes, nowMs } from './helpers'

export function LobbyCountdown({
  startDeadline, isAdmin, starting, enoughMembers, onStart,
}: {
  startDeadline: string | null
  isAdmin: boolean
  starting: boolean
  enoughMembers: boolean
  onStart: () => void
}) {
  // Re-render once per minute so the countdown ticks without a tight loop.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const remaining = startDeadline ? new Date(startDeadline).getTime() - nowMs() : null

  return (
    <section className="rounded-2xl border border-amber-400/40 bg-amber-50 p-4 sm:p-5 dark:bg-amber-500/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">
            No lobby — esperando começar
          </p>
          <p className="mt-1 text-sm text-[var(--text)]">
            {remaining != null && remaining > 0 ? (
              <>
                Cancela automaticamente em <b className="font-bold">{daysHoursMinutes(remaining)}</b> se ninguém iniciar.
              </>
            ) : (
              <>O prazo de início expirou — o desafio será cancelado.</>
            )}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={onStart}
            disabled={starting || !enoughMembers || (remaining ?? 0) <= 0}
            title={!enoughMembers ? 'Precisa de ao menos 2 participantes' : undefined}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={13} fill="currentColor" />
            {starting ? 'Iniciando…' : 'Iniciar agora'}
          </button>
        )}
      </div>
    </section>
  )
}
