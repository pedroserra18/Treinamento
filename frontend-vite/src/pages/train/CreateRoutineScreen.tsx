import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  MoreVertical, Timer, Plus, Dumbbell, X,
} from 'lucide-react'
import type { ExerciseOption } from '../../types/workout'
import { pushRecentExerciseId } from '../../lib/exercise/recent-exercises'
import { formatClock } from '../../lib/workout/workout-timing'
import { AddExerciseModal } from './AddExerciseModal'
import { ExerciseContextMenuSheet } from './ExerciseContextMenuSheet'
import { ReorderExercisesSheet, type ReorderItem } from './ReorderExercisesSheet'
import { SubstituteExerciseModal } from './SubstituteExerciseModal'
import { RestTimePickerSheet } from './RestTimePickerSheet'
import { CreateExerciseModal } from './CreateExerciseModal'
import { InfoDialog } from '../../components/common/InfoDialog'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'
import { SetTypeBadge, SetTypePickerSheet } from '../../components/common/SetTypePickerSheet'
import type { SetType } from '../../components/common/setTypeOptions'
import { serializePerfNotes, type PerfSeries } from '../../lib/workout/perf-notes'

// Tela "Criar Rotina" no estilo Hevy: header [Cancelar / Título / Salvar]
// + input de título da rotina + lista de exercícios + botão Adicionar.
//
// Diferente do fluxo antigo (criar plano vazio → editar), aqui o usuário
// monta tudo localmente e clica Salvar — o backend recebe o pacote
// completo (createPlan + N addExerciseToPlan) numa única confirmação.
// Isso elimina o passo intermediário "Criar e salvar treino" do flow
// anterior, copiando o UX do Hevy.

// Uma série individual da rotina: range de reps + tipo. Peso/RPE/RIR são
// preenchidos no treino ativo, não na criação da rotina.
type DraftSet = {
  repsMin: string
  repsMax: string
  type: SetType
}

// Estado local de um exercício sendo configurado na rotina nova. Cada série é
// editável de forma independente (range de reps + tipo).
type DraftExercise = {
  // ID local pra dnd-kit + key — diferente do exerciseId pra suportar
  // duplicatas no futuro (hoje a UI filtra, mas o id local é seguro).
  localId: string
  exerciseId: string
  exerciseName: string
  thumbnailUrl: string | null
  notes: string
  restSec: number // 0 = sem descanso (mostra "Desativado")
  sets: DraftSet[]
}

function makeDraftSet(repsMin = '8', repsMax = '12', type: SetType = 'normal'): DraftSet {
  return { repsMin, repsMax, type }
}

// Serializa a nota do usuário + a config por-série no formato __PERF__ (lido
// pela WorkoutsPage; o backend só guarda como texto em notes). Inclui reps
// (= repsMax, p/ compat com o parser da WorkoutsPage) + repsMin/repsMax/setType
// por série. Só grava o marcador quando há algo além do padrão (tipo não-normal
// ou ranges diferentes entre as séries) — assim, sem customização, notes fica
// igual ao de antes.
function buildNotesWithSets(ex: DraftExercise): string | undefined {
  const userNote = ex.notes.trim().slice(0, 150)
  const first = ex.sets[0]
  const allNormal = ex.sets.every((s) => s.type === 'normal')
  const uniformReps = ex.sets.every(
    (s) => s.repsMin === (first?.repsMin ?? '') && s.repsMax === (first?.repsMax ?? ''),
  )
  if (allNormal && uniformReps) return userNote || undefined
  const series: PerfSeries[] = ex.sets.map((s) => {
    const min = Number(s.repsMin)
    const max = Number(s.repsMax)
    const entry: PerfSeries = {}
    if (Number.isFinite(max) && max > 0) {
      entry.reps = Math.floor(max)
      entry.repsMax = Math.floor(max)
    }
    if (Number.isFinite(min) && min > 0) entry.repsMin = Math.floor(min)
    if (s.type !== 'normal') entry.setType = s.type
    return entry
  })
  return serializePerfNotes(userNote, { sets: series.length, series })
}

function makeLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// Formato de pré-preenchimento (modo "Editar rotina"). O parent já resolve o
// nome do exercício, thumb e as séries (incl. parsing do __PERF__).
export type RoutineInitial = {
  name: string
  exercises: Array<{
    exerciseId: string
    exerciseName: string
    thumbnailUrl: string | null
    notes: string
    restSec: number
    sets: Array<{ repsMin: string; repsMax: string; type: SetType }>
  }>
}

function makeDraftExercise(option: ExerciseOption): DraftExercise {
  return {
    localId: makeLocalId(),
    exerciseId: option.id,
    exerciseName: option.name,
    thumbnailUrl: option.thumbnailUrl,
    notes: '',
    restSec: 0,
    sets: [makeDraftSet(), makeDraftSet(), makeDraftSet()],
  }
}

export function CreateRoutineScreen({
  onCancel, onSubmit, title = 'Criar Rotina', submitLabel = 'Salvar', initial,
}: {
  onCancel: () => void
  // Pré-preenchimento opcional pro modo "Editar rotina". Quando presente, a
  // tela abre com o nome + exercícios já carregados; o builder é idêntico.
  initial?: RoutineInitial
  // Cabeçalho/CTA customizáveis pra reaproveitar a tela em outros fluxos
  // (ex.: "Criar e enviar rotina"), mantendo o builder idêntico. Default =
  // o fluxo "Nova rotina".
  title?: string
  submitLabel?: string
  // Optimistic UI: a tela valida os inputs e devolve os dados PRONTOS pro
  // parent gravar. O parent insere uma rotina otimista, navega imediato
  // pra DASHBOARD e dispara o backend em background. Sem `Promise<>` aqui
  // — o save é fire-and-forget do ponto de vista desta tela.
  onSubmit: (data: {
    name: string
    exercises: Array<{
      exerciseId: string
      sets: number
      repsMin?: number
      repsMax?: number
      restSec?: number
      notes?: string
    }>
  }) => void
}) {

  // Rascunho da rotina sendo construída. Tudo client-side até clicar
  // Salvar — se o usuário cancela, nada vai pro backend.
  const [name, setName] = useState(initial?.name ?? '')
  const [exercises, setExercises] = useState<DraftExercise[]>(() =>
    (initial?.exercises ?? []).map((e) => ({
      localId: makeLocalId(),
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      thumbnailUrl: e.thumbnailUrl,
      notes: e.notes,
      restSec: e.restSec,
      sets: e.sets.length > 0 ? e.sets.map((s) => makeDraftSet(s.repsMin, s.repsMax, s.type)) : [makeDraftSet()],
    })),
  )
  const [saving, setSaving] = useState(false)
  const isEdit = Boolean(initial)

  // Modais reutilizando os mesmos componentes do treino ativo + edit
  // de rotina, mantendo UX consistente entre as 3 superfícies.
  const [addOpen, setAddOpen] = useState(false)
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false)
  const [ctxIndex, setCtxIndex] = useState<number | null>(null)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [substituteIndex, setSubstituteIndex] = useState<number | null>(null)
  const [restPickerIndex, setRestPickerIndex] = useState<number | null>(null)
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string } | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; onConfirm: () => void; destructive?: boolean; confirmLabel?: string } | null>(null)
  // Qual série está com o picker de tipo aberto (exercício + índice da série).
  const [pickerTarget, setPickerTarget] = useState<{ exIndex: number; setIndex: number } | null>(null)

  // Mutações imutáveis sobre o array de exercícios — cada handler
  // retorna um novo array pro setState pra preservar render correto.
  const patchExercise = (index: number, patch: Partial<DraftExercise>) => {
    setExercises((current) => current.map((ex, i) => (i === index ? { ...ex, ...patch } : ex)))
  }
  const removeExercise = (index: number) => {
    setExercises((current) => current.filter((_, i) => i !== index))
  }

  // Mutações por-série dentro de um exercício.
  const patchSet = (exIndex: number, setIndex: number, patch: Partial<DraftSet>) => {
    setExercises((current) =>
      current.map((ex, i) =>
        i === exIndex
          ? { ...ex, sets: ex.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)) }
          : ex,
      ),
    )
  }
  const addSet = (exIndex: number) => {
    setExercises((current) =>
      current.map((ex, i) => {
        if (i !== exIndex || ex.sets.length >= 20) return ex
        const last = ex.sets[ex.sets.length - 1]
        return { ...ex, sets: [...ex.sets, makeDraftSet(last?.repsMin ?? '8', last?.repsMax ?? '12', 'normal')] }
      }),
    )
  }
  const removeSet = (exIndex: number, setIndex: number) => {
    setExercises((current) =>
      current.map((ex, i) =>
        i === exIndex && ex.sets.length > 1 ? { ...ex, sets: ex.sets.filter((_, j) => j !== setIndex) } : ex,
      ),
    )
  }

  // Adiciona em batch o que o AddExerciseModal devolve. Filtra os
  // que já estão na rotina pra não duplicar; agrega aviso se algum
  // foi pulado.
  const handleAddBatch = (options: ExerciseOption[]) => {
    const presentIds = new Set(exercises.map((ex) => ex.exerciseId))
    const fresh: DraftExercise[] = []
    const skipped: string[] = []
    for (const opt of options) {
      if (presentIds.has(opt.id)) {
        skipped.push(opt.name)
      } else {
        fresh.push(makeDraftExercise(opt))
        pushRecentExerciseId(opt.id)
      }
    }
    if (fresh.length > 0) {
      setExercises((current) => [...current, ...fresh])
    }
    if (skipped.length > 0) {
      setInfoDialog({
        title: skipped.length === 1 ? 'Exercício já na rotina' : 'Exercícios já na rotina',
        message:
          skipped.length === 1
            ? `${skipped[0]} já foi adicionado e foi ignorado.`
            : `${skipped.length} exercícios já estavam na rotina e foram ignorados:\n\n${skipped.map((s) => `• ${s}`).join('\n')}`,
      })
    }
  }

  // Substitui um exercício preservando notas/descanso/sets — só troca
  // a identidade. Bloqueia se o novo já estiver em outra posição.
  const handleSubstitute = (atIndex: number, option: ExerciseOption) => {
    const presentIds = new Set(exercises.map((ex) => ex.exerciseId))
    if (presentIds.has(option.id) && exercises[atIndex].exerciseId !== option.id) {
      setInfoDialog({
        title: 'Exercício já na rotina',
        message: `${option.name} já está em outra posição. Escolha outro pra substituir.`,
      })
      return
    }
    pushRecentExerciseId(option.id)
    patchExercise(atIndex, {
      exerciseId: option.id,
      exerciseName: option.name,
      thumbnailUrl: option.thumbnailUrl,
    })
  }

  // Optimistic UI: valida os inputs e devolve os dados pro parent.
  // O parent insere a rotina otimista na DASHBOARD, navega imediato e
  // dispara o save em background. Daqui em diante esta tela é descartada
  // — não esperamos o backend, não mostramos "Salvando…". User sente 0ms.
  const handleSave = () => {
    if (saving) return
    const trimmedName = name.trim()
    if (trimmedName.length < 2) {
      setInfoDialog({
        title: 'Nome da rotina obrigatório',
        message: 'Dê um nome com pelo menos 2 caracteres pra sua rotina antes de salvar.',
      })
      return
    }
    if (exercises.length === 0) {
      setInfoDialog({
        title: 'Rotina sem exercícios',
        message: 'Adicione pelo menos 1 exercício antes de salvar a rotina.',
      })
      return
    }
    setSaving(true)
    onSubmit({
      name: trimmedName,
      exercises: exercises.map((ex) => {
        // Colunas do plano (sets/repsMin/repsMax) são representativas: contagem
        // de séries + menor/maior faixa entre elas. O detalhe por-série (reps +
        // tipo de cada uma) vai no notes via __PERF__.
        const mins = ex.sets.map((s) => Number(s.repsMin)).filter((n) => Number.isFinite(n) && n > 0)
        const maxs = ex.sets.map((s) => Number(s.repsMax)).filter((n) => Number.isFinite(n) && n > 0)
        return {
          exerciseId: ex.exerciseId,
          sets: Math.max(1, ex.sets.length),
          repsMin: mins.length ? Math.floor(Math.min(...mins)) : undefined,
          repsMax: maxs.length ? Math.floor(Math.max(...maxs)) : undefined,
          restSec: ex.restSec > 0 ? ex.restSec : undefined,
          notes: buildNotesWithSets(ex),
        }
      }),
    })
  }

  const handleCancelClick = () => {
    if (name.trim().length === 0 && exercises.length === 0) {
      onCancel()
      return
    }
    setConfirmDialog({
      title: isEdit ? 'Descartar alterações?' : 'Descartar rotina?',
      message: isEdit
        ? 'As mudanças feitas nesta rotina não serão salvas.'
        : 'Você vai perder o que preencheu até agora. Esta ação não pode ser desfeita.',
      confirmLabel: 'Descartar',
      destructive: true,
      onConfirm: onCancel,
    })
  }

  return (
    <section className="space-y-3">
      {/* Header estilo Hevy: 3 zonas — Cancelar / título / Salvar.
          Salvar fica em destaque (brand) como CTA primário. */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-safe-plus-2 z-30 flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)]/95 px-3 py-2.5 backdrop-blur-md"
      >
        <button
          type="button"
          onClick={handleCancelClick}
          className="text-[14px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          Cancelar
        </button>
        <h1 className="truncate text-[15px] font-bold text-[var(--text)]">{title}</h1>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{ touchAction: 'manipulation' }}
          className="rounded-xl bg-[var(--brand)] px-4 py-1.5 text-[13px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:opacity-60"
        >
          {saving ? 'Salvando…' : submitLabel}
        </button>
      </motion.header>

      {/* Título da rotina — input grande sem label (placeholder fala
          tudo). Auto-foco pra pular logo pra digitação. */}
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <input
          autoFocus={!isEdit}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Título da rotina"
          maxLength={80}
          className="w-full bg-transparent text-[20px] font-bold text-[var(--text)] placeholder:font-semibold placeholder:text-[var(--muted)] focus:outline-none"
        />
      </article>

      {/* Lista de exercícios. Cada card mostra nome + thumb + notas +
          descanso + tabela de séries (sets count, faixa de reps). */}
      <div className="space-y-3">
        {exercises.map((ex, index) => {
          const restLabel = ex.restSec > 0 ? formatClock(ex.restSec) : 'Desativado'
          return (
            <article
              key={ex.localId}
              className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
            >
              {/* Cabeçalho do exercício: thumb + nome + kebab */}
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                  {ex.thumbnailUrl ? (
                    <img src={ex.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Dumbbell size={18} className="text-[var(--muted)]" />
                  )}
                </div>
                <h3 className="flex-1 truncate pt-2 text-[15px] font-bold text-[var(--brand)]">
                  {ex.exerciseName}
                </h3>
                <button
                  type="button"
                  aria-label={`Ações de ${ex.exerciseName}`}
                  onClick={() => setCtxIndex(index)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                >
                  <MoreVertical size={16} />
                </button>
              </div>

              {/* Notas opcionais do exercício */}
              <input
                value={ex.notes}
                onChange={(e) => patchExercise(index, { notes: e.target.value })}
                placeholder="Adicionar notas de rotina aqui"
                className="mt-2 w-full bg-transparent text-[13px] text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none"
              />

              {/* Botão de descanso — abre wheel picker. Texto fica
                  laranja "Desativado" quando 0, igual ao mock do Hevy. */}
              <button
                type="button"
                onClick={() => setRestPickerIndex(index)}
                className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-[var(--brand)] transition-opacity hover:opacity-80"
              >
                <Timer size={14} />
                Descanso: {restLabel}
              </button>

              {/* Tabela de séries — uma linha por série. Toque no badge pra
                  escolher o tipo (mesmo picker do treino ativo). Cada série tem
                  seu próprio range de reps. Pesos não vão no plano (preenche no
                  treino ativo). */}
              <div className="mt-3 grid grid-cols-[44px_1fr_1fr_32px] gap-2 border-t border-[var(--line)] pt-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                <span>Série</span>
                <span>Reps mín</span>
                <span>Reps máx</span>
                <span />
              </div>
              <div className="mt-1.5 grid gap-1.5">
                {ex.sets.map((s, si) => (
                  <div key={si} className="grid grid-cols-[44px_1fr_1fr_32px] items-center gap-2">
                    <SetTypeBadge
                      index={si}
                      setType={s.type}
                      onClick={() => setPickerTarget({ exIndex: index, setIndex: si })}
                    />
                    <input
                      value={s.repsMin}
                      inputMode="numeric"
                      onChange={(e) => patchSet(index, si, { repsMin: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
                      placeholder="–"
                      aria-label={`Série ${si + 1} reps mínimas`}
                      className="w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-center text-[14px] font-bold tabular-nums text-[var(--text)]"
                    />
                    <input
                      value={s.repsMax}
                      inputMode="numeric"
                      onChange={(e) => patchSet(index, si, { repsMax: e.target.value.replace(/[^\d]/g, '').slice(0, 3) })}
                      placeholder="–"
                      aria-label={`Série ${si + 1} reps máximas`}
                      className="w-full rounded-lg border border-[var(--line)] bg-transparent px-2 py-1.5 text-center text-[14px] font-bold tabular-nums text-[var(--text)]"
                    />
                    <button
                      type="button"
                      aria-label={`Remover série ${si + 1}`}
                      onClick={() => removeSet(index, si)}
                      disabled={ex.sets.length <= 1}
                      className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-rose-500 disabled:opacity-30"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addSet(index)}
                  className="mt-0.5 inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--line)] py-2 text-[12px] font-bold text-[var(--muted)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  <Plus size={13} />
                  Adicionar série
                </button>
              </div>
            </article>
          )
        })}

        {/* Botão de adicionar — sempre presente, no estilo brand. */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          style={{ touchAction: 'manipulation' }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] py-3 text-[14px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
        >
          <Plus size={16} />
          Adicionar exercício
        </button>
      </div>

      {/* Modais / sheets — montados condicionalmente. */}
      {addOpen && (
        <AddExerciseModal
          open
          currentExerciseIds={exercises.map((e) => e.exerciseId)}
          onPickBatch={(opts) => handleAddBatch(opts)}
          onCreateRequest={() => {
            setAddOpen(false)
            setCreateExerciseOpen(true)
          }}
          onClose={() => setAddOpen(false)}
        />
      )}

      {createExerciseOpen && (
        <CreateExerciseModal
          open
          onCreated={(newExercise) => {
            pushRecentExerciseId(newExercise.id)
            handleAddBatch([newExercise])
          }}
          onClose={() => setCreateExerciseOpen(false)}
        />
      )}

      {ctxIndex != null && exercises[ctxIndex] && (
        <ExerciseContextMenuSheet
          open
          exerciseName={exercises[ctxIndex].exerciseName}
          onReorder={() => {
            setReorderOpen(true)
            setCtxIndex(null)
          }}
          onSubstitute={() => {
            setSubstituteIndex(ctxIndex)
            setCtxIndex(null)
          }}
          onRemove={() => {
            removeExercise(ctxIndex)
            setCtxIndex(null)
          }}
          onClose={() => setCtxIndex(null)}
        />
      )}

      {reorderOpen && (
        <ReorderExercisesSheet
          open
          items={exercises.map((ex): ReorderItem => ({
            id: ex.localId,
            name: ex.exerciseName,
            thumbnailUrl: ex.thumbnailUrl,
          }))}
          onReorder={(next) => {
            const byId = new Map(exercises.map((ex) => [ex.localId, ex]))
            const reordered = next
              .map((item) => byId.get(item.id))
              .filter((ex): ex is DraftExercise => Boolean(ex))
            setExercises(reordered)
          }}
          onClose={() => setReorderOpen(false)}
        />
      )}

      {substituteIndex != null && exercises[substituteIndex] && (
        <SubstituteExerciseModal
          key={`sub-${substituteIndex}`}
          open
          source={{
            id: exercises[substituteIndex].exerciseId,
            name: exercises[substituteIndex].exerciseName,
          }}
          onPick={(option) => handleSubstitute(substituteIndex, option)}
          onCreateRequest={() => {
            setSubstituteIndex(null)
            // futuro: criar exercício e substituir; por enquanto só
            // fechamos o substitute — usuário pode usar "Adicionar"
            // pra criar e então substituir.
          }}
          onClose={() => setSubstituteIndex(null)}
        />
      )}

      {restPickerIndex != null && exercises[restPickerIndex] && (
        <RestTimePickerSheet
          key={`rest-${restPickerIndex}`}
          open
          currentSec={exercises[restPickerIndex].restSec}
          onConfirm={(sec) => patchExercise(restPickerIndex, { restSec: sec })}
          onClose={() => setRestPickerIndex(null)}
        />
      )}

      {pickerTarget && exercises[pickerTarget.exIndex]?.sets[pickerTarget.setIndex] && (
        <SetTypePickerSheet
          open
          current={exercises[pickerTarget.exIndex].sets[pickerTarget.setIndex].type}
          onSelect={(type) => patchSet(pickerTarget.exIndex, pickerTarget.setIndex, { type })}
          onRemove={() => removeSet(pickerTarget.exIndex, pickerTarget.setIndex)}
          onClose={() => setPickerTarget(null)}
        />
      )}

      {infoDialog && (
        <InfoDialog
          open
          title={infoDialog.title}
          message={infoDialog.message}
          onClose={() => setInfoDialog(null)}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          open
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.destructive}
          onConfirm={() => {
            const fn = confirmDialog.onConfirm
            setConfirmDialog(null)
            fn()
          }}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </section>
  )
}

