import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import {
  ACTIVE_WORKOUT_DISCARD_EVENT,
  clearActiveWorkout,
  deriveElapsedSec,
  readActiveWorkout,
  subscribeActiveWorkout,
  type ActiveWorkoutSnapshot,
} from '../../lib/active-workout-storage'

function formatClock(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// Fixed bar shown on every authenticated page when there is an active
// workout in localStorage and the user is not on /train. Clicking the
// bar routes back to the train page; the trash icon discards the
// session (asks confirmation first) and emits a request event so any
// mounted TrainPage can reset its in-memory state too.
export function MiniActiveWorkoutBar() {
  const [snapshot, setSnapshot] = useState<ActiveWorkoutSnapshot | null>(() => readActiveWorkout())
  const [elapsedSec, setElapsedSec] = useState<number>(() => {
    const initial = readActiveWorkout()
    return initial ? deriveElapsedSec(initial) : 0
  })
  const navigate = useNavigate()
  const location = useLocation()

  // Ref com o snapshot mais recente — o tick lê daqui em vez de depender de
  // [snapshot] no efeito. Sem isso, como o TrainPage grava o snapshot 1x/seg
  // durante o treino, o efeito recriava o interval/listeners a cada segundo
  // (app inteiro) → jank/"travando" ao navegar. Com o ref, o interval é único
  // e estável pela vida do componente.
  const snapshotRef = useRef<ActiveWorkoutSnapshot | null>(snapshot)
  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  useEffect(() => {
    return subscribeActiveWorkout(() => {
      const next = readActiveWorkout()
      setSnapshot(next)
      setElapsedSec(next ? deriveElapsedSec(next) : 0)
    })
  }, [])

  // Relógio por WALL-CLOCK — recomputa a cada tick a partir do âncora do
  // snapshot (elapsedSec + lastSavedAt), nunca somando +1/seg. Assim não há
  // drift quando o iOS pausa/estrangula o setInterval em segundo plano, e a
  // ressync no foreground/bfcache corrige na hora qualquer período suspenso.
  // Interval ÚNICO (deps []) — lê o snapshot via ref pra não recriar a cada
  // gravação do TrainPage.
  useEffect(() => {
    const tick = () => {
      const snap = snapshotRef.current
      setElapsedSec(snap ? deriveElapsedSec(snap) : 0)
    }
    const id = window.setInterval(tick, 1000)
    const onResume = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('pageshow', onResume)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('pageshow', onResume)
    }
  }, [])

  const isInsideActiveView =
    location.pathname === '/train' && snapshot?.screen === 'ACTIVE'
  const isOnAuthFlow =
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/register') ||
    location.pathname.startsWith('/forgot-password') ||
    location.pathname.startsWith('/auth/google')

  if (!snapshot || isInsideActiveView || isOnAuthFlow) {
    return null
  }

  const handleDiscard = (event: React.MouseEvent) => {
    event.stopPropagation()
    const confirmed = window.confirm(
      'Descartar o treino em andamento? Você perderá os dados não salvos.',
    )
    if (!confirmed) return
    clearActiveWorkout()
    window.dispatchEvent(new CustomEvent(ACTIVE_WORKOUT_DISCARD_EVENT))
  }

  const handleResume = () => {
    // Pass `resume` in location state so TrainPage knows the user wants
    // to jump straight into the active workout view rather than landing
    // on the dashboard (which is the default behaviour of the nav link).
    navigate('/train', { state: { resume: true } })
  }

  return createPortal(
    <div
      role="button"
      tabIndex={0}
      onClick={handleResume}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleResume()
        }
      }}
      className="fixed bottom-20 left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 cursor-pointer items-center gap-3 rounded-2xl border border-emerald-500/40 bg-[var(--surface)]/95 px-4 py-2.5 shadow-2xl backdrop-blur-md transition-colors hover:border-emerald-500/70 lg:bottom-3"
      aria-label="Voltar para o treino em andamento"
    >
      <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
        {snapshot.isWorkoutRunning && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        )}
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="hidden text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 sm:inline">
          Treino ativo
        </span>
        <span className="font-mono text-base font-black tabular-nums text-[var(--text)]">
          {formatClock(elapsedSec)}
        </span>
        <span className="opacity-50">·</span>
        <span className="truncate text-sm text-[var(--muted)]">
          {snapshot.currentExerciseName ?? snapshot.activePlanName ?? 'Treino livre'}
        </span>
      </div>

      <button
        type="button"
        onClick={handleDiscard}
        aria-label="Descartar treino"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--muted)] transition-colors hover:border-rose-500/60 hover:bg-rose-500/10 hover:text-rose-500"
      >
        <Trash2 size={14} />
      </button>
    </div>,
    document.body,
  )
}
