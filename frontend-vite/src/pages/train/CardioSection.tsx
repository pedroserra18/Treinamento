import { useState } from 'react'
import { Activity, X } from 'lucide-react'
import type { CardioType, CardioEntryInput } from '../../types/workout'
import { CARDIO_LABELS, CARDIO_TYPES } from './cardio'

// Seção de cardio do treino ativo: lista os cardios adicionados e um mini-form
// (tipo + minutos + distância opcional em km) para acrescentar mais.
export function CardioSection({ entries, onAdd, onRemove }: {
  entries: CardioEntryInput[]
  onAdd: (entry: CardioEntryInput) => void
  onRemove: (index: number) => void
}) {
  const [type, setType] = useState<CardioType>('WALK')
  const [minutes, setMinutes] = useState('')
  const [km, setKm] = useState('')
  const [note, setNote] = useState('')

  const add = () => {
    const min = parseInt(minutes, 10)
    if (!Number.isFinite(min) || min <= 0) return
    const dist = parseFloat(km.replace(',', '.'))
    const trimmedNote = note.trim()
    onAdd({
      type,
      durationSec: min * 60,
      distanceMeters: Number.isFinite(dist) && dist > 0 ? Math.round(dist * 1000) : undefined,
      notes: trimmedNote ? trimmedNote.slice(0, 250) : undefined,
    })
    setMinutes('')
    setKm('')
    setNote('')
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text)]">
        <Activity size={15} className="text-[var(--brand)]" /> Cardio
      </h2>
      <p className="mt-0.5 text-[12px] text-[var(--muted)]">Caminhada, corrida, bike, escada… registre o que fez.</p>

      {entries.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {entries.map((c, i) => (
            <li key={i} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--text)]">{CARDIO_LABELS[c.type]}</span>
                <span className="text-[var(--muted)]">· {Math.round(c.durationSec / 60)} min</span>
                {c.distanceMeters ? <span className="text-[var(--muted)]">· {(c.distanceMeters / 1000).toFixed(2).replace(/\.?0+$/, '')} km</span> : null}
                <button type="button" onClick={() => onRemove(i)} className="ml-auto grid h-6 w-6 place-items-center rounded-md text-[var(--muted)] hover:bg-rose-500/10 hover:text-rose-500" aria-label="Remover cardio">
                  <X size={13} />
                </button>
              </div>
              {c.notes ? <p className="mt-1 text-[12px] italic text-[var(--muted)]">"{c.notes}"</p> : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CardioType)}
          className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)]"
        >
          {CARDIO_TYPES.map((t) => <option key={t} value={t}>{CARDIO_LABELS[t]}</option>)}
        </select>
        <input
          type="number"
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          placeholder="min"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] sm:w-20"
        />
        <input
          type="number"
          inputMode="decimal"
          value={km}
          onChange={(e) => setKm(e.target.value)}
          placeholder="km (opc.)"
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] sm:w-24"
        />
        <button
          type="button"
          onClick={add}
          disabled={!minutes.trim()}
          className="col-span-2 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-40 sm:col-span-1"
        >
          Adicionar
        </button>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={250}
        placeholder="Nota (opcional): como foi, ritmo, percurso..."
        className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]"
      />
    </div>
  )
}
