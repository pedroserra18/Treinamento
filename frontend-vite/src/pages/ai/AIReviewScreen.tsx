import { motion } from 'framer-motion'
import { Pencil, Activity, Sparkles, ArrowRight } from 'lucide-react'
import {
  getEffectiveSplit, getWorkoutLabels, getVisibleSteps, type QuizAnswers,
} from './ai-workout-utils'
import {
  blockMusclesHint, computeBlockLoad, computeIntensity, computeRest, computeTempoEst,
  computeVolumeEst, estimateQuizDurationMin, friendlyBlockName, getChipTone,
} from './ai-review-metrics'
import { MiniStat, LegendItem } from './ai-components'

// Tela REVIEW do gerador de treino IA: resumo das respostas do quiz (SummaryCard
// + mini-stats), grid de parametros editaveis (cada chip volta ao passo do quiz),
// toggle de cardio e o CTA de gerar. Verbatim; estado e acoes ficam na pagina.
export function AIReviewScreen({
  answers, error, onEditField, onToggleCardio, onGenerate,
}: {
  answers: QuizAnswers
  error: string | null
  onEditField: (step: number) => void
  onToggleCardio: () => void
  onGenerate: () => void
}) {
  const days = parseInt(answers.daysPerWeek, 10) || 4
  const split = getEffectiveSplit(days, answers.muscleFrequency, answers.musclesFocus, answers.splitPreference)
  const labels = getWorkoutLabels(split, days, answers.customSplit)

  const restrictionsValue = [
    answers.hasInjury && answers.injuryDescription ? `Lesão: ${answers.injuryDescription}` : '',
    answers.avoidExercises.trim() ? `Evitar: ${answers.avoidExercises.trim()}` : '',
  ].filter(Boolean).join(' · ') || 'Nenhuma'

  const physicalValue = [
    answers.heightCm && `${answers.heightCm}cm`,
    answers.weightKg && `${answers.weightKg}kg`,
  ].filter(Boolean).join(' · ') || 'Não informado'

  const allChips: Array<{ label: string; value: string; step: number }> = [
    { label: 'Dias', value: answers.daysPerWeek ? `${answers.daysPerWeek}x/semana` : '—', step: 0 },
    { label: 'Nível', value: answers.experience || '—', step: 1 },
    { label: 'Idade', value: answers.age || '—', step: 2 },
    { label: 'Gênero', value: answers.gender || '—', step: 3 },
    { label: 'Fase', value: answers.phase || '—', step: 4 },
    { label: 'Objetivo', value: answers.goal || '—', step: 5 },
    { label: 'Local', value: answers.location || '—', step: 6 },
    { label: 'Equipamento', value: answers.equipment || '—', step: 7 },
    { label: 'Duração', value: answers.duration ? `${answers.duration} min` : '—', step: 8 },
    { label: 'Divisão', value: answers.splitPreference === 'Outro' ? (answers.customSplit.trim() ? `Outro: ${answers.customSplit.split(/[\n;/]+/).map(s => s.trim()).filter(Boolean).join(' / ')}` : 'Outro') : (answers.splitPreference || 'IA decide'), step: 19 },
    { label: 'Freq. muscular', value: answers.muscleFrequency || '—', step: 9 },
    { label: 'Reps', value: answers.repRange || '—', step: 10 },
    { label: 'Descanso', value: answers.restTime || 'IA decide', step: 11 },
    { label: 'Técnicas', value: answers.techniques.join(', ') || 'Nenhuma', step: 12 },
    { label: 'Foco', value: answers.musclesFocus.length > 0 ? answers.musclesFocus.join(', ') : answers.hasFocus === false ? 'Sem foco' : '—', step: 13 },
    { label: 'Restrições', value: restrictionsValue, step: 14 },
    { label: 'Físico', value: physicalValue, step: 15 },
    { label: 'Tamanho', value: answers.exerciseCount || 'IA decide', step: 16 },
    { label: 'RIR', value: answers.rirTarget || 'IA decide', step: 17 },
    { label: 'Extra', value: answers.extraInfo || (answers.hasExtraInfo === false ? 'Não' : '—'), step: 18 },
  ]
  const visibleStepIds = getVisibleSteps(answers)
  const chips = allChips.filter(c => visibleStepIds.includes(c.step))

  // Métricas decorativas computadas a partir das respostas — alimentam o sidebar.
  const volumeEst = computeVolumeEst(answers)
  const intensity = computeIntensity(answers)
  const restEst = computeRest(answers)
  const tempoEst = computeTempoEst(answers)
  const durationEst = estimateQuizDurationMin(answers)

  return (
    <section className="space-y-4">
      {/* ─── SummaryCard ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-7 lg:p-8"
      >
        {/* Cantos decorativos (corner ticks) */}
        <span aria-hidden className="pointer-events-none absolute left-3 top-3 h-2.5 w-2.5 border-l border-t border-[var(--line)]" />
        <span aria-hidden className="pointer-events-none absolute right-3 top-3 h-2.5 w-2.5 border-r border-t border-[var(--line)]" />
        <span aria-hidden className="pointer-events-none absolute left-3 bottom-3 h-2.5 w-2.5 border-l border-b border-[var(--line)]" />
        <span aria-hidden className="pointer-events-none absolute right-3 bottom-3 h-2.5 w-2.5 border-r border-b border-[var(--line)]" />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_220px]">
          <div className="min-w-0">
            {/* STEP badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full border border-[var(--brand)]/30 px-2.5 py-1.5"
              style={{ background: 'color-mix(in srgb, var(--brand) 8%, transparent)' }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]"
                style={{ boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand) 28%, transparent)' }}
              />
              <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--brand-strong)]">
                STEP 04 / 05 · QUASE LÁ
              </span>
            </div>

            {/* Título */}
            <h1 className="mt-4 text-3xl font-black leading-none tracking-tight text-[var(--text)] sm:text-4xl">
              Resumo das suas <span className="text-[var(--brand)]">respostas</span>
            </h1>

            {/* Descrição da divisão */}
            <p className="mt-2 text-sm text-[var(--muted)]">
              Divisão gerada · <span className="font-semibold text-[var(--text)]">{split}</span>
              <span className="ml-2 font-mono text-[11px] tracking-wide">
                {labels.length} BLOCOS · ~{durationEst} MIN
              </span>
            </p>

            {/* Chips dos blocos (A / B / C) com barra de carga */}
            <div className="mt-5 flex flex-wrap gap-2.5">
              {labels.map((label, i) => {
                const code = String.fromCharCode(65 + i)
                const muscles = blockMusclesHint(label)
                const load = computeBlockLoad(answers, i)
                return (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5"
                  >
                    <div
                      className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--brand)]/30 font-mono text-xs font-bold text-[var(--brand-strong)]"
                      style={{ background: 'color-mix(in srgb, var(--brand) 10%, transparent)' }}
                    >
                      {code}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-tight text-[var(--text)]">{friendlyBlockName(label)}</p>
                      {muscles && (
                        <p className="mt-0.5 font-mono text-[10px] tracking-wide text-[var(--muted)]">{muscles}</p>
                      )}
                    </div>
                    <div className="ml-1 w-9 shrink-0">
                      <div className="h-1 overflow-hidden rounded-full bg-[var(--line)]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${load}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full rounded-full bg-[var(--brand)]"
                        />
                      </div>
                      <p className="mt-1 text-right font-mono text-[9px] text-[var(--muted)]">{load}%</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Sidebar com mini-stats */}
          <div className="flex flex-col gap-2.5">
            <MiniStat
              label="VOLUME EST."
              value={String(volumeEst.value)}
              unit="séries"
              delta={volumeEst.delta}
            />
            <MiniStat
              label="INTENSIDADE"
              value={intensity.value}
              unit="média"
              delta={intensity.badge}
            />
            <MiniStat
              label="DESCANSO"
              value={restEst.value}
              unit={restEst.hint}
              delta={restEst.delta ?? '—'}
            />
          </div>
        </div>
      </motion.div>

      {/* ─── ParamGrid ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-[var(--line)] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-6 w-6 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)]">
              <Pencil size={11} />
            </span>
            <span className="text-sm font-medium text-[var(--text)]">
              Clica num item para editar só esse campo
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3.5">
            <LegendItem tone="brand" label="Definido por você" />
            <LegendItem tone="ai" label="IA decide" />
            <LegendItem tone="muted" label="Vazio" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          {chips.map(({ label, value, step: chipStep }) => {
            const tone = getChipTone(value)
            const dotClass =
              tone === 'brand' ? 'bg-[var(--brand)]'
              : tone === 'ai' ? 'bg-[var(--muted)]'
              : 'bg-[var(--line)]'
            const valueClass = tone === 'muted' ? 'text-[var(--muted)]' : 'text-[var(--text)]'
            return (
              <button
                key={label}
                type="button"
                onClick={() => onEditField(chipStep)}
                className="group relative flex flex-col gap-0.5 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2.5 text-left transition-colors hover:border-[var(--brand)]/50"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                  <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                    {label}
                  </span>
                </div>
                <p className={`pr-4 text-sm font-semibold leading-tight ${valueClass}`}>{value}</p>
                <Pencil size={10} className="absolute right-2 top-2 text-[var(--brand)] opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Cardio opcional — instrui a IA a incluir 10-15 min de cardio leve */}
      <button
        type="button"
        onClick={onToggleCardio}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
          answers.wantsCardio
            ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))]'
            : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand)]/50'
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${answers.wantsCardio ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-hover)] text-[var(--brand)]'}`}>
            <Activity size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[var(--text)]">Incluir cardio nos treinos</span>
            <span className="block text-[11.5px] text-[var(--muted)]">10–15 min de cardio leve (aquecimento ou finalizador), sugerido nos dias.</span>
          </span>
        </span>
        <span className={`grid h-6 w-10 shrink-0 items-center rounded-full transition-colors ${answers.wantsCardio ? 'bg-[var(--brand)]' : 'bg-[var(--line)]'}`}>
          <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${answers.wantsCardio ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
        </span>
      </button>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      {/* ─── GenerateCTA ───────────────────────────────────────────── */}
      <button
        type="button"
        onClick={onGenerate}
        className="group relative w-full overflow-hidden rounded-3xl p-5 text-left text-white sm:p-6"
        style={{
          background: 'linear-gradient(180deg, var(--brand) 0%, var(--brand-strong) 100%)',
          boxShadow: '0 14px 36px -14px color-mix(in srgb, var(--brand) 80%, transparent), inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.2)',
        }}
      >
        {/* Shimmer no hover */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-[40%] transition-transform duration-1000 group-hover:translate-x-[40%]"
          style={{ background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)' }}
        />
        {/* Padrão decorativo de circuito (apenas desktop) */}
        <svg
          aria-hidden
          viewBox="0 0 120 60"
          className="pointer-events-none absolute right-56 top-1/2 hidden -translate-y-1/2 opacity-20 lg:block"
          width="120"
          height="60"
          fill="none"
        >
          <path d="M0 30 H30 L40 20 H70 L80 30 H120" stroke="#FFF6F2" strokeWidth="1" />
          <path d="M0 45 H50 L60 35 H120" stroke="#FFF6F2" strokeWidth="1" />
          <circle cx="30" cy="30" r="2" fill="#FFF6F2" />
          <circle cx="70" cy="20" r="2" fill="#FFF6F2" />
          <circle cx="60" cy="35" r="2" fill="#FFF6F2" />
        </svg>

        <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/35 bg-white/20 backdrop-blur-sm">
              <Sparkles size={18} />
            </div>
            <div className="leading-tight">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-white/85">
                PRONTO P/ GERAR
              </p>
              <p className="text-lg font-extrabold tracking-tight sm:text-xl">
                Gerar meu treino com IA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 self-stretch justify-end sm:self-auto">
            <div className="text-right leading-tight">
              <p className="font-mono text-[10px] tracking-[0.15em] text-white/75">TEMPO EST.</p>
              <p className="font-mono text-base font-semibold">~ {tempoEst}s</p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/30 bg-white/15">
              <ArrowRight size={18} />
            </div>
          </div>
        </div>
      </button>
    </section>
  )
}
