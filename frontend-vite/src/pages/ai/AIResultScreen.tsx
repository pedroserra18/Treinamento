import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, RefreshCw, Clock, AlertTriangle, ChevronUp, ChevronDown, X, CheckCircle2, ArrowRight } from 'lucide-react'
import { type Dispatch, type RefObject, type SetStateAction } from 'react'
import { type NavigateFunction } from 'react-router-dom'
import { type WorkoutSection } from '../../services/aiService'
import {
  estimateDurationMin, getMissingGroups, getWeeklyVolume, resolveMuscleGroup,
  type QuizAnswers, type SaveResult,
} from './ai-workout-utils'
import { dayOfWeekLabels, focoFromDayLabel, rpeFromRir } from './ai-review-metrics'
import { AITextRenderer, DetailStat, HeroStat } from './ai-components'

// Tela RESULT do gerador de treino IA: hero + grafico de volume semanal + abas
// de dias + card do dia ativo (lista de exercicios com mover/trocar/remover,
// salvar como rotina, regenerar). Verbatim; estado e acoes ficam na pagina.
export function AIResultScreen({
  sections, answers, resolvedWeekdays, activeDayIndex, error, regeneratingIndex,
  saveResults, expandedExerciseKey, savingIndex, swappingKey, resultRef,
  resetQuiz, handleGenerate, setActiveDayIndex, setExpandedExerciseKey,
  moveExercise, swapExercise, removeExercise, handleSaveOne, handleRegenerateDay, navigate,
}: {
  sections: WorkoutSection[]
  answers: QuizAnswers
  resolvedWeekdays: string[]
  activeDayIndex: number
  error: string | null
  regeneratingIndex: number | null
  saveResults: Record<number, SaveResult>
  expandedExerciseKey: string | null
  savingIndex: number | null
  swappingKey: string | null
  resultRef: RefObject<HTMLDivElement | null>
  resetQuiz: () => void
  handleGenerate: () => Promise<void>
  setActiveDayIndex: Dispatch<SetStateAction<number>>
  setExpandedExerciseKey: Dispatch<SetStateAction<string | null>>
  moveExercise: (sectionIndex: number, exIndex: number, dir: -1 | 1) => void
  swapExercise: (sectionIndex: number, exIndex: number) => Promise<void>
  removeExercise: (sectionIndex: number, exIndex: number) => void
  handleSaveOne: (index: number) => Promise<void>
  handleRegenerateDay: (index: number) => Promise<void>
  navigate: NavigateFunction
}) {
const volume = getWeeklyVolume(sections)
const TARGET_MIN = 5
const TARGET_MAX = 20
const scaleMax = volume.length > 0 ? Math.max(...volume.map(v => v.sets), TARGET_MAX + 5) : TARGET_MAX + 5
const idealStartPct = (TARGET_MIN / scaleMax) * 100
const idealEndPct = (TARGET_MAX / scaleMax) * 100
const totalSets = volume.reduce((s, v) => s + v.sets, 0)
const balanced = volume.filter(v => v.sets >= TARGET_MIN && v.sets <= TARGET_MAX).length
// Se a divisão "Outro" trouxe os dias da semana citados pelo usuário, usa-os;
// senão, auto-espaça (SEG/QUA/SEX...). Cada índice usa o weekday informado
// ou cai no auto quando vazio.
const autoDows = dayOfWeekLabels(sections.length)
const dows = sections.map((_, i) => resolvedWeekdays[i] || autoDows[i] || '')
const safeActiveIdx = Math.min(activeDayIndex, Math.max(0, sections.length - 1))
const activeSection = sections[safeActiveIdx]
const rpeAlvo = rpeFromRir(answers.rirTarget)

return (
  <section className="space-y-4" ref={resultRef}>
    {/* ─── Hero card ─────────────────────────────────────────────── */}
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          {/* Kicker badge with pulse */}
          <div
            className="inline-flex items-center gap-2 rounded-full border border-[var(--brand)]/30 px-2.5 py-1.5"
            style={{ background: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}
          >
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--brand)]"
              style={{ boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 28%, transparent)' }}
            />
            <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-[var(--brand-strong)]">
              TREINO GERADO · IA v2.4
            </span>
          </div>

          {/* Big serif title with italic accent */}
          <h1 className="mt-4 font-serif text-3xl font-normal leading-[1.04] tracking-tight text-[var(--text)] sm:text-5xl">
            Seu plano{' '}
            <em className="italic text-[var(--brand-strong)]">personalizado</em>
          </h1>

          <p className="mt-3 max-w-xl text-sm text-[var(--muted)]">
            {sections.length} {sections.length === 1 ? 'dia' : 'dias'} de treino estruturado{sections.length !== 1 ? 's' : ''} pela IA com foco em {answers.goal?.toLowerCase() || 'performance'}
            {volume.length > 0 ? ', balanceando volume entre grupos musculares com base no seu histórico recente.' : '.'}
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetQuiz}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--text)] px-4 py-2 text-xs font-bold text-[var(--surface)] transition-opacity hover:opacity-90"
            >
              <Sparkles size={13} /> Novo questionário
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <RefreshCw size={13} /> Gerar novamente
            </button>
          </div>
        </div>

        {/* Stats sidebar (3 cards) */}
        <div className="grid grid-cols-3 gap-2 lg:w-[360px]">
          <HeroStat label="DIAS / SEM" value={String(sections.length)} unit="d" trend="↑ otimizado" trendTone="positive" />
          <HeroStat label="VOLUME" value={String(totalSets)} unit="séries" trend="→ na faixa" trendTone="neutral" />
          <HeroStat
            label="COBERTURA"
            value={String(balanced)}
            unit={`/${volume.length || 10}`}
            trend={balanced === volume.length && volume.length > 0 ? '✓ completo' : balanced > 0 ? `${balanced} ideais` : 'a definir'}
            trendTone="positive"
          />
        </div>
      </div>
    </motion.div>

    {error && (
      <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        {error}
      </p>
    )}

    {/* ─── Volume chart card ────────────────────────────────────── */}
    {sections.length > 1 && volume.length > 0 && (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[var(--text)]">Volume semanal por grupo muscular</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              Faixa ideal: 5–20 séries / semana por grupo · objetivo: {answers.goal?.toLowerCase() || 'hipertrofia'}
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-4 py-2.5">
            <div className="text-right">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Séries totais</p>
              <p className="mt-0.5 font-mono text-xl font-bold leading-none text-[var(--text)]">{totalSets}</p>
            </div>
            <div className="h-7 w-px bg-[var(--line)]" />
            <div className="text-right">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Faixa ideal</p>
              <p className="mt-0.5 font-mono text-xl font-bold leading-none text-[var(--text)]">
                {balanced}<span className="text-sm text-[var(--muted)]">/{volume.length}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-1.5">
          {volume.map((v, i) => {
            const widthPct = Math.min(100, (v.sets / scaleMax) * 100)
            const status = v.sets < TARGET_MIN
              ? { label: 'abaixo', color: 'text-amber-500' }
              : v.sets > TARGET_MAX
                ? { label: 'excessivo', color: 'text-rose-500' }
                : { label: 'ideal', color: 'text-emerald-500' }
            return (
              <div
                key={v.label}
                className="group grid grid-cols-[80px_1fr_70px] items-center gap-3 py-1 sm:grid-cols-[120px_1fr_90px] sm:gap-4"
              >
                <span className="truncate text-xs font-medium text-[var(--text)] transition-transform group-hover:translate-x-0.5 sm:text-sm">
                  {v.label}
                </span>
                {/* Bar with ideal band + animated fill */}
                <div className="relative h-4 rounded-full bg-[var(--surface-hover)] transition-transform group-hover:scale-y-125">
                  {/* Ideal band (5-20) */}
                  <div
                    aria-hidden
                    className="absolute inset-y-0 rounded-full bg-emerald-500/[0.10]"
                    style={{ left: `${idealStartPct}%`, width: `${idealEndPct - idealStartPct}%` }}
                  />
                  {/* Ideal markers */}
                  <span aria-hidden className="absolute -top-1 -bottom-1 w-px bg-emerald-500/30" style={{ left: `${idealStartPct}%` }} />
                  <span aria-hidden className="absolute -top-1 -bottom-1 w-px bg-emerald-500/30" style={{ left: `${idealEndPct}%` }} />
                  {/* Fill */}
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPct}%` }}
                    transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1], delay: i * 0.04 }}
                    className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${v.hex} 0%, color-mix(in oklab, ${v.hex} 70%, white) 100%)`,
                      boxShadow: `inset 0 0 0 0.5px rgba(0,0,0,0.06)`,
                    }}
                  />
                </div>
                {/* Value pip + count + status */}
                <div className="flex items-center justify-end gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full transition-shadow group-hover:shadow-[0_0_0_4px_currentColor/25]"
                    style={{ background: v.hex }}
                  />
                  <span className="font-mono text-xs font-semibold tabular-nums text-[var(--text)]">{v.sets}</span>
                  <span className={`hidden font-mono text-[9px] font-semibold uppercase tracking-[0.14em] sm:inline ${status.color}`}>
                    {status.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Meta strip */}
        <div className="mt-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 0 3px rgba(16,163,74,0.12)' }} />
            Recalculado agora
          </span>
          <span>v2.4 · {sections.length}d · {totalSets} séries</span>
        </div>
      </motion.div>
    )}

    {/* ─── Day tabs ──────────────────────────────────────────────── */}
    {sections.length > 1 && (
      <div className="flex flex-wrap gap-1.5">
        {sections.map((s, i) => {
          const label = s.workoutData?.planName ?? `Treino ${i + 1}`
          const isActive = i === safeActiveIdx
          return (
            <button
              key={i}
              type="button"
              onClick={() => { setActiveDayIndex(i); setExpandedExerciseKey(null) }}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                isActive
                  ? 'border-[var(--text)] bg-[var(--text)] text-[var(--surface)]'
                  : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              <span>{label}</span>
              {dows[i] && (
                <span className={`font-mono text-[10px] ${isActive ? 'opacity-70' : 'text-[var(--muted)]'}`}>
                  {dows[i]}
                </span>
              )}
            </button>
          )
        })}
      </div>
    )}

    {/* ─── Active day card ───────────────────────────────────────── */}
    {activeSection && (() => {
      const idx = safeActiveIdx
      const wd = activeSection.workoutData
      const dayLabel = wd?.planName ?? `Treino ${idx + 1}`
      const isBodyweight = answers.location === 'Em casa sem equipamentos'
      const missing = wd ? getMissingGroups(wd.exercises, dayLabel, isBodyweight) : []
      const durationMin = wd ? estimateDurationMin(wd.exercises) : null
      const targetMin = answers.duration ? parseInt(answers.duration, 10) : null
      const overTime = targetMin && durationMin ? durationMin > targetMin + 10 : false
      const isRegenerating = regeneratingIndex === idx
      const isSaved = Boolean(saveResults[idx])
      const foco = focoFromDayLabel(dayLabel)

      return (
        <motion.article
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"
        >
          {/* Day header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="rounded-md border border-[var(--line)] bg-[var(--surface-hover)] px-2 py-1 font-mono text-[10px] font-semibold text-[var(--muted)]">
                DIA {String(idx + 1).padStart(2, '0')}
              </span>
              <h3 className="text-lg font-bold tracking-tight text-[var(--text)]">{dayLabel}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {wd && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--brand)]/30 px-2.5 py-1 text-[11px] font-semibold text-[var(--brand-strong)]"
                  style={{ background: 'color-mix(in srgb, var(--brand) 10%, transparent)' }}
                >
                  <span className="font-mono">{wd.exercises.length}</span> exercícios
                </span>
              )}
              {durationMin !== null && (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  overTime
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                    : 'border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]'
                }`}>
                  <Clock size={11} />
                  <span className="font-mono">~{durationMin} min</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                Foco · <span className="font-mono">{foco}</span>
              </span>
            </div>
          </div>

          <div className="h-px bg-[var(--line)]" />

          {/* Coverage warning */}
          {missing.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-500">Cobertura incompleta</p>
                <p className="mt-0.5 text-[11px] text-amber-500/80">Faltam: {missing.join(', ')} — considera regenerar este dia.</p>
              </div>
            </div>
          )}

          {/* Exercise list */}
          {wd ? (
            <ul className="space-y-2">
              {wd.exercises.map((ex, i) => {
                const exKey = `${idx}-${i}`
                const expanded = expandedExerciseKey === exKey
                const muscle = resolveMuscleGroup(ex)
                return (
                  <li
                    key={exKey}
                    className={`overflow-hidden rounded-xl border transition-all ${
                      expanded
                        ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_5%,var(--surface))]'
                        : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand)]/40 hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedExerciseKey(expanded ? null : exKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setExpandedExerciseKey(expanded ? null : exKey)
                        }
                      }}
                      className="grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand)] sm:grid-cols-[40px_1fr_auto_auto] sm:px-4"
                    >
                      {/* Number badge */}
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-lg border font-mono text-xs font-bold ${
                          expanded
                            ? 'border-[var(--brand)] bg-[var(--brand)] text-white'
                            : 'border-[var(--line)] bg-[var(--surface)] text-[var(--text)]'
                        }`}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>

                      {/* Name + muscle pill + specs */}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--text)]">{ex.name}</p>
                          {muscle && (
                            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${muscle.color}`}>
                              {muscle.label}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-[var(--muted)]">
                          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-0.5 rounded-full bg-[var(--muted)]" /> {ex.sets} séries</span>
                          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-0.5 rounded-full bg-[var(--muted)]" /> {ex.repsMin ?? '?'}–{ex.repsMax ?? '?'} reps</span>
                          {ex.restSec ? (
                            <span className="inline-flex items-center gap-1"><span className="h-0.5 w-0.5 rounded-full bg-[var(--muted)]" /> {ex.restSec}s descanso</span>
                          ) : null}
                        </div>
                      </div>

                      {/* Up/down controls — hidden after save, hidden on mobile */}
                      {!isSaved && (
                        <div className="hidden items-center gap-1 sm:flex">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); moveExercise(idx, i, -1) }}
                            disabled={i === 0}
                            className="grid h-6 w-6 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--brand)]/40 hover:text-[var(--text)] disabled:opacity-30"
                            title="Mover para cima"
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); moveExercise(idx, i, 1) }}
                            disabled={i === wd.exercises.length - 1}
                            className="grid h-6 w-6 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--brand)]/40 hover:text-[var(--text)] disabled:opacity-30"
                            title="Mover para baixo"
                          >
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      )}

                      {/* Swap button — troca por outro do mesmo grupo */}
                      {!isSaved && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void swapExercise(idx, i) }}
                          disabled={swappingKey === `${idx}-${i}`}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-transparent text-[var(--muted)] hover:border-[var(--brand)]/40 hover:bg-[var(--brand)]/10 hover:text-[var(--brand)] disabled:opacity-40"
                          title="Trocar por outro exercício do mesmo grupo"
                        >
                          <RefreshCw size={13} className={swappingKey === `${idx}-${i}` ? 'animate-spin' : ''} />
                        </button>
                      )}

                      {/* Remove button */}
                      {!isSaved && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeExercise(idx, i) }}
                          disabled={wd.exercises.length <= 1}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-transparent text-[var(--muted)] hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-30"
                          title="Remover exercício"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>

                    {/* Expandable details */}
                    <AnimatePresence>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-dashed border-[var(--line)] px-3 pb-3 pt-3 sm:px-4">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <DetailStat label="SÉRIES" value={String(ex.sets)} />
                              <DetailStat label="REPS" value={`${ex.repsMin ?? '?'}–${ex.repsMax ?? '?'}`} />
                              <DetailStat label="CARGA SUG." value="—" />
                              <DetailStat label="RPE ALVO" value={rpeAlvo} />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Dados estruturados indisponíveis. Clique em "Gerar novamente" no topo.
            </p>
          )}

          {/* AI markdown text */}
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)]/40 p-4">
            <AITextRenderer text={activeSection.displayText} />
          </div>

          {/* Save / Regenerate actions */}
          {!isSaved ? (
            wd && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveOne(idx)}
                  disabled={savingIndex !== null || isRegenerating}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  <CheckCircle2 size={14} />
                  {savingIndex === idx ? 'Salvando...' : 'Salvar como Rotina'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleRegenerateDay(idx)}
                  disabled={savingIndex !== null || regeneratingIndex !== null}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-60"
                >
                  <RefreshCw size={13} className={isRegenerating ? 'animate-spin' : ''} />
                  {isRegenerating ? 'Regenerando...' : 'Regenerar este dia'}
                </button>
              </div>
            )
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4"
            >
              <p className="text-sm font-bold text-emerald-500">
                "{saveResults[idx].planName}" salvo com sucesso!
              </p>
              <p className="text-xs text-[var(--muted)]">
                {saveResults[idx].foundCount} de {saveResults[idx].totalCount} exercício{saveResults[idx].totalCount !== 1 ? 's' : ''} adicionado{saveResults[idx].foundCount !== 1 ? 's' : ''} à rotina.
              </p>
              <button
                type="button"
                onClick={() => navigate('/train')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                Ver em Treinos <ArrowRight size={13} />
              </button>
            </motion.div>
          )}

          {/* Hint strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            <span>Toque num exercício para ver detalhes</span>
            <span>IA · {sections.length}d · {wd ? wd.exercises.length : 0} ex.</span>
          </div>
        </motion.article>
      )
    })()}
  </section>
)
}
