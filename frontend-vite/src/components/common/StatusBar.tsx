import { useEffect, useState } from 'react'
import { Wifi, Lock } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'

// Maps the User role onto a marketing plan label. ADMIN keeps its own colour
// in the chip; COACH passes as "PRO" until billing is wired up.
function planLabelFromRole(role?: 'USER' | 'COACH' | 'ADMIN'): string {
  if (role === 'ADMIN') return 'ADMIN'
  if (role === 'COACH') return 'PRO'
  return 'FREE'
}

function Tag({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[var(--muted)]">{label}</span>
      {highlight ? (
        <span
          className="rounded border border-[var(--brand)]/30 px-1.5 py-px font-semibold text-[var(--brand-strong)]"
          style={{ background: 'color-mix(in srgb, var(--brand) 10%, transparent)' }}
        >
          {value}
        </span>
      ) : (
        <span className="font-semibold text-[var(--text)]">{value}</span>
      )}
    </span>
  )
}

/**
 * Global status strip shown at the bottom of every authenticated page.
 *
 * Responsive layout:
 *   - mobile  : `USER · PLANO · hora` only (keeps the bar to a single line above the bottom nav)
 *   - tablet+ : adds `MODELO` and `LATÊNCIA` tags + `CONECTADO` / `E2E` indicators
 *
 * MODELO and LATÊNCIA are placeholders until we wire real model/version info
 * and a request-time ping; the rest is sourced from `useAuth()` and a
 * minute-resolution clock so we don't waste a render budget on seconds.
 */
export function StatusBar() {
  const { user } = useAuth()
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const userTag = (user?.handle || user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'guest').toLowerCase()
  const planTag = planLabelFromRole(user?.role)
  const currentTime = new Date(nowTick).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 font-mono text-[10.5px] tracking-wide text-[var(--muted)]"
      role="status"
      aria-label="Estado da sessão"
    >
      <Tag label="USER" value={userTag} />
      <Tag label="PLANO" value={planTag} highlight />
      {/* MODELO + LATÊNCIA only on tablet+ to keep mobile single-line. */}
      <span className="hidden sm:inline-flex">
        <Tag label="MODELO" value="SerraAI · 2.4" />
      </span>
      <span className="hidden sm:inline-flex">
        <Tag label="LATÊNCIA" value="42ms" />
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-x-3.5 gap-y-1">
        <span className="hidden items-center gap-1.5 sm:inline-flex">
          <Wifi size={11} /> CONECTADO
        </span>
        <span className="hidden items-center gap-1.5 sm:inline-flex">
          <Lock size={11} /> E2E
        </span>
        <span>{currentTime}</span>
      </div>
    </div>
  )
}
