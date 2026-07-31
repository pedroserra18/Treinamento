import { type ComponentProps, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Flame, Dumbbell, Plus, Play, Sparkles, Send } from 'lucide-react'
import { SkeletonCard } from '../../components/common/Skeleton'
import { RoutineCard } from './RoutineCard'
import { isAiSourcedPlan, relativeDaysFromNow } from './helpers'
import type { WorkoutPlan } from '../../types/workout'
import type { ActiveExercise, LastUseInfo, RoutineFilter } from './types'

// Tela DASHBOARD da TrainPage (default): header + streak, o "Smart CTA"
// (Retomar / Iniciar última rotina / Treino vazio) com chips secundários,
// e a lista "Minhas Rotinas" (filtro + cards) + o modal de link compartilhado.
// Extraida verbatim; estado/handlers passados por props (ficam na TrainPage).
// O cluster repassado ao RoutineCard tem os tipos derivados de ComponentProps.
type TrainDashboardScreenProps =
  & Pick<ComponentProps<typeof RoutineCard>,
      | 'lastUseByPlanId' | 'optimisticPlanIds' | 'updatingPlanIds'
      | 'openRoutineMenuId' | 'routineMenuAnchor' | 'setOpenRoutineMenuId'
      | 'setRoutineMenuAnchor' | 'setActivePlanId' | 'setScreen'
      | 'beginRoutineTraining' | 'handleDeleteRoutine' | 'handleShareRoutine'
      | 'handleDuplicateRoutine' | 'handleExportPDF'>
  & {
      streakDays: number
      hydrated: boolean
      activeExercises: ActiveExercise[]
      mostRecentSession: LastUseInfo | null
      plans: WorkoutPlan[]
      activePlanName: string
      error: string | null
      routineFilter: RoutineFilter
      setRoutineFilter: Dispatch<SetStateAction<RoutineFilter>>
      loadingPlans: boolean
      shareLinkModal: { link: string; planName: string } | null
      setShareLinkModal: Dispatch<SetStateAction<{ link: string; planName: string } | null>>
      beginEmptyTraining: () => void
    }

export function TrainDashboardScreen({
  lastUseByPlanId, optimisticPlanIds, updatingPlanIds, openRoutineMenuId, routineMenuAnchor,
  setOpenRoutineMenuId, setRoutineMenuAnchor, setActivePlanId, setScreen,
  beginRoutineTraining, handleDeleteRoutine, handleShareRoutine, handleDuplicateRoutine, handleExportPDF,
  streakDays, hydrated, activeExercises, mostRecentSession, plans, activePlanName, error,
  routineFilter, setRoutineFilter, loadingPlans, shareLinkModal, setShareLinkModal, beginEmptyTraining,
}: TrainDashboardScreenProps) {
  const filteredPlans = plans.filter((plan) => {
    if (routineFilter === 'ALL') return true
    const isAi = isAiSourcedPlan(plan)
    return routineFilter === 'AI' ? isAi : !isAi
  })

  return (
    <section className="space-y-6">
      {/* ───── HEADER ─────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6"
      >
        <div className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-strong)] sm:text-[10.5px] sm:tracking-[0.22em]">
          <span className="relative inline-flex h-[7px] w-[7px]">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--brand)] opacity-60" />
            <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-[var(--brand)]" />
          </span>
          Treino · monte ou escolha
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
            Treinar <span className="font-serif-accent text-[var(--brand-strong)]">agora</span>
          </h1>
          {/* Streak — só aparece com 2+ dias pra evitar "1 dia" que é
              ruidoso e não motiva (todo mundo está em 1 dia quando
              treinou hoje). Ícone de chama + número grande na laranja. */}
          {streakDays >= 2 && (
            <div
              className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-orange-500"
              title={`${streakDays} dias consecutivos com treino`}
            >
              <Flame size={14} fill="currentColor" />
              <span className="text-[13px] font-extrabold tabular-nums">{streakDays}</span>
              <span className="text-[11px] font-semibold">{streakDays === 1 ? 'dia' : 'dias'}</span>
            </div>
          )}
        </div>
        <p className="mt-1.5 text-[13px] text-[var(--muted)] sm:text-sm">
          Inicie rápido, escolha uma rotina ou monte seu treino na hora.
        </p>
      </motion.header>

      {/* ───── SMART CTA ──────────────────────────────────────────────
          Card primário inteligente — decide entre Retomar, Iniciar
          última rotina, ou Iniciar Vazio. O caminho dominante deveria
          ser "continuar minha rotina" e não "começar do zero", então
          esse CTA respeita o histórico do usuário em vez de empurrar
          "Vazio" pra todo mundo. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        {(() => {
          const hasOngoingWorkout = hydrated && activeExercises.length > 0
          const lastPlan =
            !hasOngoingWorkout && mostRecentSession
              ? plans.find((p) => p.id === mostRecentSession.planId)
              : null
          const ctaPrimary = hasOngoingWorkout
            ? { label: 'Retomar Treino', sub: activePlanName, onClick: () => setScreen('ACTIVE') }
            : lastPlan
              ? { label: `Iniciar ${lastPlan.name}`, sub: `Último treino ${relativeDaysFromNow(mostRecentSession!.endedAt)}`, onClick: () => beginRoutineTraining(lastPlan) }
              : { label: 'Iniciar Treino Vazio', sub: 'Monte os exercícios na hora', onClick: beginEmptyTraining }
          return (
            <button
              type="button"
              onClick={ctaPrimary.onClick}
              className="group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl border border-[var(--brand-strong)] bg-gradient-to-br from-[#ff7a5a] to-[var(--brand)] p-5 text-left text-white shadow-[0_14px_26px_-16px_rgba(255,90,60,0.55)] transition-transform hover:translate-y-[-2px]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)' }}
              />
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/25 bg-white/15">
                <Play size={20} fill="currentColor" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[16px] font-semibold tracking-tight sm:text-[18px]">
                  {ctaPrimary.label}
                </strong>
                <span className="block truncate text-[12px] text-white/80 sm:text-[13px]">
                  {ctaPrimary.sub}
                </span>
              </span>
            </button>
          )
        })()}

        {/* Ações secundárias — chips menores que não competem com o CTA.
            "Iniciar Vazio" só aparece como chip quando o CTA não é
            o vazio (pra continuar sendo acessível em 1 tap). */}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {(hydrated && activeExercises.length > 0) || mostRecentSession ? (
            <button
              type="button"
              onClick={beginEmptyTraining}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              <Play size={12} />
              Treino vazio
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setScreen('RECOMMENDATIONS')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <Sparkles size={12} />
            Recomendações
          </button>
          <button
            type="button"
            onClick={() => setScreen('NEW_ROUTINE')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <Plus size={12} />
            Nova rotina
          </button>
          <button
            type="button"
            onClick={() => setScreen('SEND_ROUTINE')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <Send size={12} />
            Criar e enviar
          </button>
        </div>
      </motion.div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {/* ───── MINHAS ROTINAS ─────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="flex items-center gap-2 font-mono text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
            Minhas Rotinas
            <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--muted)]">
              {plans.length}
            </span>
          </h2>
          {/* Smart-hide: o filtro só vale a pena com 4+ rotinas. Abaixo
              disso polui e ninguém usa. Labels renomeadas: "Sugeridas"
              (IA) e "Personalizadas" (CUSTOM) são mais claras que
              siglas técnicas. */}
          {plans.length >= 4 ? (
            <div className="flex gap-1">
              {([
                { id: 'ALL', label: 'Todas' },
                { id: 'AI', label: 'Sugeridas' },
                { id: 'CUSTOM', label: 'Personalizadas' },
              ] as Array<{ id: RoutineFilter; label: string }>).map((f) => {
                const active = routineFilter === f.id
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setRoutineFilter(f.id)}
                    className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      active
                        ? 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)]'
                        : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        {loadingPlans ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : null}

        {!loadingPlans && plans.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center">
            <Dumbbell size={36} className="mx-auto mb-3 text-[var(--brand)]" strokeWidth={1.5} />
            <p className="text-base font-bold text-[var(--text)]">Comece criando sua primeira rotina</p>
            <p className="mx-auto mt-1.5 max-w-xs text-[12px] text-[var(--muted)]">
              Uma rotina agrupa exercícios e séries pra você repetir sem montar tudo do zero toda vez.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setScreen('NEW_ROUTINE')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-[13px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
              >
                <Plus size={14} />
                Criar minha primeira rotina
              </button>
              <button
                type="button"
                onClick={() => setScreen('RECOMMENDATIONS')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-[13px] font-semibold text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <Sparkles size={14} />
                Ver sugestões
              </button>
            </div>
          </div>
        ) : null}

        {!loadingPlans && plans.length > 0 && filteredPlans.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-[var(--muted)]">
            Nenhuma rotina neste filtro.
          </p>
        ) : null}

        <div className="grid gap-2.5 sm:grid-cols-2">
          {filteredPlans.map((plan) => (
            <RoutineCard
              key={plan.id}
              plan={plan}
              lastUseByPlanId={lastUseByPlanId}
              optimisticPlanIds={optimisticPlanIds}
              updatingPlanIds={updatingPlanIds}
              openRoutineMenuId={openRoutineMenuId}
              routineMenuAnchor={routineMenuAnchor}
              setOpenRoutineMenuId={setOpenRoutineMenuId}
              setRoutineMenuAnchor={setRoutineMenuAnchor}
              setActivePlanId={setActivePlanId}
              setScreen={setScreen}
              beginRoutineTraining={beginRoutineTraining}
              handleDeleteRoutine={handleDeleteRoutine}
              handleShareRoutine={handleShareRoutine}
              handleDuplicateRoutine={handleDuplicateRoutine}
              handleExportPDF={handleExportPDF}
            />
          ))}
        </div>
      </div>

      {shareLinkModal ? createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShareLinkModal(null)}>
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-extrabold text-[var(--text)]">Compartilhar rotina</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{shareLinkModal.planName}</p>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2">
              <span className="flex-1 truncate text-xs text-[var(--text)]">{shareLinkModal.link}</span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareLinkModal.link)
                    window.alert('Link copiado!')
                  } catch {
                    window.prompt('Copie o link:', shareLinkModal.link)
                  }
                }}
                className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white"
              >
                Copiar
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {typeof navigator.share === 'function' && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.share({ title: shareLinkModal.planName, url: shareLinkModal.link })
                  }}
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white"
                >
                  Compartilhar (WhatsApp, Instagram...)
                </button>
              )}
              <button
                type="button"
                onClick={() => setShareLinkModal(null)}
                className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

    </section>
  )
}
