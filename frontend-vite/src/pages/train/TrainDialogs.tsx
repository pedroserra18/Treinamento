import { createPortal } from 'react-dom'
import { ClipboardList } from 'lucide-react'
import { formatMinutesLabel } from './train-format'

// Diálogos do fluxo de treino (autocontidos, recebem tudo por props) —
// extraídos do TrainPage pra reduzir o arquivo, sem mudar comportamento.

export function DurationWarningDialog({
  warning, onAdjust, onKeep,
}: {
  warning: { minutesActual: number; minutesParsed: number; isShort: boolean }
  onAdjust: () => void
  onKeep: () => void
}) {
  const duracaoLabel = formatMinutesLabel(warning.minutesParsed)
  const direcao = warning.isShort ? 'menos' : 'mais'
  return createPortal(
    // Backdrop NÃO dismissa o dialog — usuário precisa escolher uma das
    // 2 opções explicitamente. Evita o bug de toque acidental fora do
    // card disparar "Manter atual" sem o user perceber.
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-base font-bold text-[var(--text)]">
          Duração de treino incomum
        </h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-[var(--muted)]">
          O seu treino durou <strong className="text-[var(--text)]">{duracaoLabel}</strong>,
          o que parece {direcao} do que o habitual. Quer ajustá-lo?
        </p>
        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onAdjust}
            className="w-full rounded-2xl bg-[var(--brand)] py-3 text-[14px] font-bold text-white hover:bg-[var(--brand-strong)]"
          >
            Ajustar a duração do treino
          </button>
          <button
            type="button"
            onClick={onKeep}
            className="w-full rounded-2xl border border-[var(--line)] py-3 text-[13px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            Manter a duração atual
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function PlanUpdateDialog({
  state, onApply, onKeep,
}: {
  state: { planName: string; addedCount: number; removedCount: number; reordered: boolean; applying: boolean }
  onApply: () => void
  onKeep: () => void
}) {
  // Mensagem natural em PT-BR. Mostra só o que faz sentido — se não
  // adicionou nada, omite a parte de "adicionou X". Mesma ideia pra
  // removidos. Reorder vira frase própria.
  const parts: string[] = []
  if (state.addedCount > 0) {
    parts.push(state.addedCount === 1 ? 'adicionou 1 exercício' : `adicionou ${state.addedCount} exercícios`)
  }
  if (state.removedCount > 0) {
    parts.push(state.removedCount === 1 ? 'removeu 1 exercício' : `removeu ${state.removedCount} exercícios`)
  }
  if (state.reordered && parts.length === 0) {
    parts.push('mudou a ordem dos exercícios')
  } else if (state.reordered) {
    parts.push('e mudou a ordem')
  }
  const summary = parts.length === 0
    ? 'A rotina foi alterada nesta sessão.'
    : `Você ${parts.join(' e ')}.`

  return createPortal(
    // Backdrop NÃO dismissa — decisão sobre atualizar rotina é definitiva,
    // user precisa escolher uma das 2 opções explicitamente.
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ícone clipboard discreto pra dar contexto visual rápido. */}
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
          <ClipboardList size={18} />
        </div>
        <h2 className="text-center text-base font-bold text-[var(--text)]">
          Atualizar "{state.planName}"
        </h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-[var(--muted)]">
          {summary}
        </p>
        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={onApply}
            disabled={state.applying}
            className="w-full rounded-2xl bg-[var(--brand)] py-3 text-[14px] font-bold text-white hover:bg-[var(--brand-strong)] disabled:opacity-60"
          >
            {state.applying ? 'Atualizando…' : 'Atualizar rotina'}
          </button>
          <button
            type="button"
            onClick={onKeep}
            disabled={state.applying}
            className="w-full rounded-2xl border border-[var(--line)] py-3 text-[13px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-60"
          >
            Manter rotina original
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
