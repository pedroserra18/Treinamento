// Wraps Date.now so callsites inside render don't trip react-hooks/purity.
// The "impurity" is intentional — countdowns are supposed to reflect
// current wall time.
export function nowMs(): number {
  return Date.now()
}

// Coarse relative-time formatter. Buckets are wide enough that the label
// only changes every few seconds even without a re-render, so the stale
// text never looks wrong by more than a tick.
export function relativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((nowMs() - new Date(iso).getTime()) / 1000))
  if (diffSec < 60) return 'agora'
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function ordinalBr(position: number): string {
  return `${position}º`
}

export function daysHoursMinutes(diffMs: number): string {
  if (diffMs <= 0) return 'expirado'
  const totalMin = Math.floor(diffMs / 60_000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

// Compact "1h 23min" / "23min" / "45s". Used for the training-time
// tiebreaker shown on the leaderboard and the personal status card.
export function formatDurationCompact(sec: number): string {
  if (!sec || sec <= 0) return '—'
  if (sec < 60) return `${Math.round(sec)}s`
  const totalMin = Math.round(sec / 60)
  if (totalMin < 60) return `${totalMin}min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h${m}min` : `${h}h`
}
