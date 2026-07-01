export const REST_OPTIONS_SEC = [
  ...Array.from({ length: 6 }, (_, index) => (index + 1) * 10),
  ...Array.from({ length: 8 }, (_, index) => 90 + index * 30),
]

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const hours = String(Math.floor(safe / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, '0')
  const seconds = String(safe % 60).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

export function formatRestOptionLabel(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds === 0 ? `${minutes}min` : `${minutes}min ${seconds}s`
}
