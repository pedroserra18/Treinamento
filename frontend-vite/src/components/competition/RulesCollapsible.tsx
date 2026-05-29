import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import type { CompetitionType } from '../../types/competition'

// Collapsible "Como funciona" — keeps the page short by default but
// surfaces the scoring rules when a user wants to understand the
// tiebreakers.
export function RulesCollapsible({ type }: { type: CompetitionType }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-[var(--text)]">
          <AlertCircle size={14} className="text-[var(--brand)]" />
          Como funciona
        </span>
        <span className={`text-[var(--muted)] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>
          ›
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-[var(--line)] p-4 text-[12px] text-[var(--muted)] sm:p-5">
          <p>
            <strong className="text-[var(--text)]">Provas:</strong>{' '}
            {type === 'BOTH'
              ? '1 treino + 1 cardio por dia (até 2 pontos/dia).'
              : type === 'TRAINING'
                ? '1 treino por dia (1 ponto/dia).'
                : '1 cardio por dia (1 ponto/dia).'}
          </p>
          <p>
            <strong className="text-[var(--text)]">Ranking:</strong> mais dias ativos vence. Em caso de empate: mais pontos &gt; mais tempo treinado &gt; mais peso movido.
          </p>
          <p>
            <strong className="text-[var(--text)]">Foto:</strong> obrigatória e fresca — a mesma imagem não pode reaparecer em outro dia (vale a mesma foto pra treino + cardio do mesmo treino).
          </p>
          <p>
            <strong className="text-[var(--text)]">Streak:</strong> dias consecutivos com pelo menos uma prova. Quebra se você pular um dia.
          </p>
        </div>
      )}
    </section>
  )
}
