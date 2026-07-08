import { createPortal } from 'react-dom'
import { type Dispatch, type SetStateAction } from 'react'
import { MoreHorizontal, Play, Pencil } from 'lucide-react'
import { estimatePlanMinutes, isAiSourcedPlan, relativeDaysFromNow } from './helpers'
import { formatDurationCompact } from './train-format'
import type { LastUseInfo } from './summary-metrics'
import type { WorkoutPlan } from '../../types/workout'
import type { TrainScreen } from './types'

type RoutineMenuAnchor = { top: number; right: number } | null

type RoutineCardProps = {
  plan: WorkoutPlan
  lastUseByPlanId: Record<string, LastUseInfo>
  optimisticPlanIds: Set<string>
  updatingPlanIds: Set<string>
  openRoutineMenuId: string | null
  routineMenuAnchor: RoutineMenuAnchor
  setOpenRoutineMenuId: Dispatch<SetStateAction<string | null>>
  setRoutineMenuAnchor: Dispatch<SetStateAction<RoutineMenuAnchor>>
  setActivePlanId: Dispatch<SetStateAction<string>>
  setScreen: (screen: TrainScreen) => void
  beginRoutineTraining: (plan: WorkoutPlan) => void
  handleDeleteRoutine: (plan: WorkoutPlan) => void
  handleShareRoutine: (plan: WorkoutPlan) => void
  handleDuplicateRoutine: (plan: WorkoutPlan) => void
  handleExportPDF: (plan: WorkoutPlan) => void
}

// Card de UMA rotina na lista da DASHBOARD: nome + chip IA, menu de acoes
// (deletar/compartilhar/duplicar/PDF via portal), stats (ex/min), ultima
// execucao, e os botoes Iniciar/Editar (ou placeholder quando optimistic/
// updating). Estado vive no pai; recebe o plano + handlers como props.
// Extraido verbatim da TrainPage.
export function RoutineCard({
  plan,
  lastUseByPlanId,
  optimisticPlanIds,
  updatingPlanIds,
  openRoutineMenuId,
  routineMenuAnchor,
  setOpenRoutineMenuId,
  setRoutineMenuAnchor,
  setActivePlanId,
  setScreen,
  beginRoutineTraining,
  handleDeleteRoutine,
  handleShareRoutine,
  handleDuplicateRoutine,
  handleExportPDF,
}: RoutineCardProps) {
  const exerciseCount = plan.exercises.length
  const estMin = estimatePlanMinutes(plan)
  const isAi = isAiSourcedPlan(plan)
  const lastUse = lastUseByPlanId[plan.id]
  const isOptimistic = optimisticPlanIds.has(plan.id)
  const isUpdating = updatingPlanIds.has(plan.id)
  // Ambos os estados bloqueiam ações (Iniciar/Editar/menu) porque:
  // - Optimistic: id ainda é tempId, startWorkoutSession daria 404.
  // - Updating: rotina existe mas os metadados de exercícios estão
  //   sendo atualizados; começar agora pegaria valores antigos.
  const isBusy = isOptimistic || isUpdating
  return (
    <article
      className="group relative cursor-default overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--brand)]/40 hover:shadow-[0_14px_26px_-22px_rgba(255,90,60,0.35)]"
    >
      {/* Left edge accent — only paints on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: 'linear-gradient(180deg, var(--brand), #ff8c6b)' }}
      />

      {/* Title row: name + IA chip + overflow menu */}
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-2 pr-7 text-[15px] font-semibold tracking-tight text-[var(--text)]">
          {plan.name}
          {isAi && (
            <span className="rounded-full border border-[var(--line)] px-1.5 py-[1px] font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
              IA
            </span>
          )}
        </h3>

        <div data-routine-menu className="absolute right-2.5 top-2.5">
          {/* Menu de ações fica escondido enquanto a rotina está
              em vôo — deletar/compartilhar/duplicar precisam do id
              real do backend (optimistic) ou de estado consistente
              (updating). Reaparece quando o save confirmar (~1-2s). */}
          {isBusy ? null : (
          <button
            type="button"
            aria-label={`Mais opções da rotina ${plan.name}`}
            aria-expanded={openRoutineMenuId === plan.id}
            onClick={(event) => {
              if (openRoutineMenuId === plan.id) {
                setOpenRoutineMenuId(null)
                setRoutineMenuAnchor(null)
                return
              }
              const rect = event.currentTarget.getBoundingClientRect()
              setRoutineMenuAnchor({
                top: rect.bottom + 4,
                right: window.innerWidth - rect.right,
              })
              setOpenRoutineMenuId(plan.id)
            }}
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <MoreHorizontal size={14} />
          </button>
          )}

          {!isBusy && openRoutineMenuId === plan.id && routineMenuAnchor
            ? createPortal(
                <div
                  data-routine-menu
                  style={{
                    position: 'fixed',
                    top: routineMenuAnchor.top,
                    right: routineMenuAnchor.right,
                    zIndex: 9999,
                  }}
                  className="min-w-48 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1 shadow-2xl"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenRoutineMenuId(null)
                      setRoutineMenuAnchor(null)
                      void handleDeleteRoutine(plan)
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-400 hover:bg-[var(--surface-hover)]"
                  >
                    Deletar rotina
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenRoutineMenuId(null)
                      setRoutineMenuAnchor(null)
                      void handleShareRoutine(plan)
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    Compartilhar rotina
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenRoutineMenuId(null)
                      setRoutineMenuAnchor(null)
                      void handleDuplicateRoutine(plan)
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    Duplicar rotina
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenRoutineMenuId(null)
                      setRoutineMenuAnchor(null)
                      handleExportPDF(plan)
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    Salvar como PDF
                  </button>
                </div>,
                document.body,
              )
            : null}
        </div>
      </div>

      {/* Stats: exercícios + min estimados. Data de criação
          saiu — quase ninguém liga, e quando importa, é a
          última EXECUÇÃO que dá contexto ("não treino isso
          há um tempo"). */}
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--muted)]">
        <span>
          <b className="font-semibold text-[var(--text)]">{exerciseCount}</b> ex
        </span>
        <span>
          <b className="font-semibold text-[var(--text)]">{estMin}</b> min
        </span>
      </div>

      {/* Última execução — só aparece se a rotina já foi
          treinada pelo menos uma vez. Mostra "quando" + a
          duração real do treino, pra o usuário ter referência. */}
      <p className="mb-3 text-[11px] text-[var(--muted)]">
        {lastUse ? (
          <>
            Último treino <b className="font-semibold text-[var(--text)]">{relativeDaysFromNow(lastUse.endedAt)}</b>
            {lastUse.durationSec ? (
              <>
                {' · '}
                <b className="font-semibold text-[var(--text)]">{formatDurationCompact(lastUse.durationSec)}</b>
              </>
            ) : null}
          </>
        ) : (
          <span className="italic text-[var(--muted)]">Nunca treinada ainda</span>
        )}
      </p>

      {/* Actions: Iniciar (primary, flex-1) + Editar.
          Em rotinas otimistas (criadas na hora, backend salvando
          em background) ou em atualização (clicou Atualizar no
          EDIT, updates em vôo), substituímos pelos placeholders —
          se o user clicasse Iniciar agora, startWorkoutSession
          daria 404 (optimistic) ou pegaria metadados antigos
          (updating). ~1-2s até confirmar e voltar ao normal. */}
      {isBusy ? (
        <div className="flex h-9 items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface-hover)] px-3 text-[12px] font-semibold text-[var(--muted)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--brand)]" />
          {isOptimistic ? 'Salvando rotina…' : 'Atualizando rotina…'}
        </div>
      ) : (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => beginRoutineTraining(plan)}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-3 text-[12.5px] font-semibold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
          >
            <Play size={12} fill="currentColor" />
            Iniciar
          </button>
          <button
            type="button"
            onClick={() => {
              setActivePlanId(plan.id)
              setScreen('EDIT')
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12.5px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <Pencil size={12} />
            Editar
          </button>
        </div>
      )}
    </article>
  )
}
