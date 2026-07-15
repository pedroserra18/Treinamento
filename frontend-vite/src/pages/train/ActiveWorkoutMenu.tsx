import { type Dispatch, type SetStateAction } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { setIntensityMode, type IntensityMode } from '../../lib/intensity-preference'
import { NotificationsRow } from './NotificationsRow'

type ActiveWorkoutMenuProps = {
  advancedTimerOpen: boolean
  setAdvancedTimerOpen: Dispatch<SetStateAction<boolean>>
  isWorkoutRunning: boolean
  setIsWorkoutRunning: Dispatch<SetStateAction<boolean>>
  manualTimerMinutes: string
  setManualTimerMinutes: (value: string) => void
  applyManualTimerEdit: () => void
  intensityMode: IntensityMode
  setIntensityModeState: Dispatch<SetStateAction<IntensityMode>>
}

// Menu "mais" do cronometro na tela ACTIVE (popover ancorado ao botao): pausar/
// retomar o cronometro, ajustar o tempo manualmente, escolher como rastrear
// intensidade (RIR/RPE/Ambos, persistido em localStorage) e o toggle de
// notificacao de descanso. Estado vive no pai; recebe valores + setters.
export function ActiveWorkoutMenu({
  advancedTimerOpen,
  setAdvancedTimerOpen,
  isWorkoutRunning,
  setIsWorkoutRunning,
  manualTimerMinutes,
  setManualTimerMinutes,
  applyManualTimerEdit,
  intensityMode,
  setIntensityModeState,
}: ActiveWorkoutMenuProps) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Mais opções do cronômetro"
        onClick={() => setAdvancedTimerOpen((v) => !v)}
        className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--line)] text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
      >
        <MoreHorizontal size={16} />
      </button>
      {advancedTimerOpen && (
        <>
          {/* Backdrop pra fechar clicando fora — sem portal pra
              manter o popover ancorado relativamente ao botão. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setAdvancedTimerOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-2xl">
            <button
              type="button"
              onClick={() => { setIsWorkoutRunning((prev) => !prev); setAdvancedTimerOpen(false) }}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              {isWorkoutRunning ? 'Pausar cronômetro' : 'Retomar cronômetro'}
            </button>
            <div className="mt-1 rounded-lg border border-[var(--line)] p-2">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted)]">
                Ajustar tempo (min)
              </label>
              <div className="mt-1 flex gap-1.5">
                <input
                  value={manualTimerMinutes}
                  onChange={(event) => setManualTimerMinutes(event.target.value.replace(/[^\d]/g, ''))}
                  placeholder="min"
                  className="w-full rounded-md border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => { applyManualTimerEdit(); setAdvancedTimerOpen(false) }}
                  className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[var(--brand-strong)]"
                >
                  OK
                </button>
              </div>
            </div>
            {/* Toggle de intensidade — sou persistido em localStorage,
                afeta quais campos (RIR/RPE) aparecem em cada set. */}
            <div className="mt-1 rounded-lg border border-[var(--line)] p-2">
              <label className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted)]">
                Eu rastreio intensidade por
              </label>
              <div className="mt-1.5 flex gap-1">
                {(['RIR', 'RPE', 'BOTH'] as IntensityMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setIntensityModeState(m)
                      setIntensityMode(m)
                    }}
                    className={`flex-1 rounded-md px-2 py-1 text-[11px] font-bold transition-colors ${
                      intensityMode === m
                        ? 'bg-[var(--brand)] text-white'
                        : 'border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {m === 'BOTH' ? 'Ambos' : m}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggle de notificação de descanso. Quando 'default'
                (não pediu ainda), mostra botão "Ativar" — o click é
                gesto explícito do usuário (requirement iOS). Quando
                'granted', mostra status verde. Quando 'denied', dá
                instrução pra reativar nas config do browser. */}
            <NotificationsRow
              onClose={() => setAdvancedTimerOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  )
}
