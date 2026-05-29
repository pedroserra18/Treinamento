import { useEffect, useState } from 'react'
import { daysHoursMinutes, nowMs } from './helpers'

export function ActiveCountdown({ endsAt }: { endsAt: string }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const remaining = new Date(endsAt).getTime() - nowMs()

  return (
    <section className="rounded-2xl border border-emerald-500/40 bg-emerald-50 p-3 dark:bg-emerald-500/5">
      <p className="text-center text-sm font-bold text-emerald-700 dark:text-emerald-300">
        Termina em <span className="font-mono tabular-nums">{daysHoursMinutes(remaining)}</span>
      </p>
    </section>
  )
}
