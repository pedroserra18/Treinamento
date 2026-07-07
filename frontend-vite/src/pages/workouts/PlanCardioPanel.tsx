import { useState } from 'react'
import type { CardioType, WorkoutPlan } from '../../types/workout'
import { CARDIO_LABELS, CARDIO_TYPES } from './workouts-utils'

// Painel de cardio da rotina (dentro do card de plano na WorkoutsPage). Estado
// de formulário totalmente local; recebe o plano e os callbacks add/remove.
export function PlanCardioPanel({
  plan,
  onAdd,
  onRemove,
}: {
  plan: WorkoutPlan
  onAdd: (input: { type: CardioType; durationSec: number; distanceMeters?: number }) => Promise<void>
  onRemove: (cardioId: string) => Promise<void>
}) {
  const [type, setType] = useState<CardioType>('WALK')
  const [minutes, setMinutes] = useState('')
  const [km, setKm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const handleAdd = async () => {
    const min = parseInt(minutes, 10)
    if (!Number.isFinite(min) || min <= 0) return
    setSubmitting(true)
    setLocalError(null)
    try {
      const dist = parseFloat(km.replace(',', '.'))
      await onAdd({
        type,
        durationSec: min * 60,
        distanceMeters: Number.isFinite(dist) && dist > 0 ? Math.round(dist * 1000) : undefined,
      })
      setMinutes('')
      setKm('')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao adicionar cardio')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (cardioId: string) => {
    setRemovingId(cardioId)
    setLocalError(null)
    try {
      await onRemove(cardioId)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao remover cardio')
    } finally {
      setRemovingId(null)
    }
  }

  const cardio = plan.cardio ?? []

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] p-3">
      <p className="text-sm font-semibold text-[var(--text)]">Cardio da rotina</p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">
        Caminhada, corrida, bike, escada… serão pré-carregados ao iniciar.
      </p>

      {cardio.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {cardio.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm"
            >
              <span className="font-semibold text-[var(--text)]">{CARDIO_LABELS[c.type]}</span>
              <span className="text-[var(--muted)]">· {Math.round(c.durationSec / 60)} min</span>
              {c.distanceMeters ? (
                <span className="text-[var(--muted)]">
                  · {(c.distanceMeters / 1000).toFixed(2).replace(/\.?0+$/, '')} km
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void handleRemove(c.id)
                }}
                disabled={removingId === c.id}
                className="ml-auto rounded-md border border-red-500/40 px-2 py-0.5 text-[11px] font-semibold text-red-400 disabled:opacity-40"
              >
                {removingId === c.id ? 'Removendo…' : 'Remover'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">Sem cardio nesta rotina ainda.</p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <select
          value={type}
          onChange={(event) => setType(event.target.value as CardioType)}
          className="rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
        >
          {CARDIO_TYPES.map((t) => (
            <option key={t} value={t}>{CARDIO_LABELS[t]}</option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          placeholder="min"
          className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm sm:w-20"
        />
        <input
          type="number"
          inputMode="decimal"
          value={km}
          onChange={(event) => setKm(event.target.value)}
          placeholder="km (opc.)"
          className="w-full rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-sm sm:w-24"
        />
        <button
          type="button"
          onClick={() => {
            void handleAdd()
          }}
          disabled={submitting || !minutes.trim()}
          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {submitting ? 'Adicionando…' : 'Adicionar cardio'}
        </button>
      </div>

      {localError ? <p className="mt-2 text-xs text-red-400">{localError}</p> : null}
    </div>
  )
}
