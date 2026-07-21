import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTH_NAMES, DOW } from './profile-utils'

export function CalendarPanel({ sessionDays }: { sessionDays: Set<string> }) {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev = new Date(year, month, 0).getDate()

  const cells: Array<{ day: number; iso: string; inMonth: boolean; isToday: boolean }> = []
  for (let i = 0; i < firstDow; i++) {
    const day = daysInPrev - firstDow + i + 1
    const d = new Date(year, month - 1, day)
    cells.push({ day, iso: d.toISOString().slice(0, 10), inMonth: false, isToday: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day)
    cells.push({
      day,
      iso: d.toISOString().slice(0, 10),
      inMonth: true,
      isToday: d.getTime() === today.getTime(),
    })
  }
  while (cells.length < 42) {
    const next = cells.length - firstDow - daysInMonth + 1
    const d = new Date(year, month + 1, next)
    cells.push({ day: next, iso: d.toISOString().slice(0, 10), inMonth: false, isToday: false })
  }

  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--text)]">Calendário</h3>
      </div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          aria-label="Mês anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-[13.5px] font-medium text-[var(--text)]">
          {MONTH_NAMES[month]} de {year}
        </span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          aria-label="Próximo mês"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {DOW.map((d, i) => <span key={i} className="py-1">{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5 text-center">
        {cells.map((c, i) => {
          const has = sessionDays.has(c.iso)
          // Clicking a session day jumps to that month's group via anchor.
          // For now we just scroll to the workouts section — a real "scroll to
          // group" hook can be wired later by id matching `month-YYYY-MM`.
          const handleClick = () => {
            if (!has) return
            const anchor = document.getElementById(`month-${c.iso.slice(0, 7)}`)
            if (anchor) {
              anchor.scrollIntoView({ behavior: 'smooth', block: 'start' })
              return
            }
            navigate('/profile')
          }
          return (
            <button
              key={i}
              type="button"
              onClick={handleClick}
              disabled={!has}
              className="flex h-9 items-center justify-center disabled:cursor-default"
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-[12px] transition-colors ${
                  has
                    ? 'bg-[var(--brand)] font-semibold text-white shadow-[0_4px_10px_-6px_rgba(255,90,60,0.6)] hover:bg-[var(--brand-strong)]'
                    : c.isToday
                      ? 'border border-[var(--brand)]/60 text-[var(--text)]'
                      : c.inMonth
                        ? 'text-[var(--text)]'
                        : 'text-[var(--muted)]/50'
                }`}
              >
                {c.day}
              </span>
            </button>
          )
        })}
      </div>
    </article>
  )
}
