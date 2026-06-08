import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Dumbbell, Check } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useScrollLock } from '../../hooks/useScrollLock'
import { getRecentExerciseIds } from '../../lib/recent-exercises'
import { searchExercisesForPlan } from '../../services/workoutService'
import type { ExerciseOption } from '../../types/workout'

// Modal full-screen pra adicionar UM OU MAIS exercícios de uma vez
// (estilo Hevy). Tap em uma row marca/desmarca; botão sticky no rodapé
// "Adicionar N exercícios" só aparece quando há seleção. Multi-seleção
// elimina o re-render N vezes do parent (que era a maior causa do delay
// percebido no celular) e respeita o gesto natural do usuário que quer
// montar o treino antes de sair do picker.
//
// Compartilhado entre TrainPage (treino ativo) e WorkoutsPage (editar
// rotina, nova rotina) pra UX uniforme em todo fluxo de adição.
export function AddExerciseModal({
  open, onPickBatch, onCreateRequest, onClose, title = 'Adicionar Exercício',
}: {
  open: boolean
  // Recebe TODOS os exercícios marcados de uma vez. O caller decide
  // como aplicar (sync no estado local pro treino ativo, ou async serial
  // pra rotina em edição — onde cada add é uma chamada de API).
  onPickBatch: (options: ExerciseOption[]) => void
  onCreateRequest: () => void
  onClose: () => void
  title?: string
}) {
  const { authorizedFetch } = useAuth()
  useScrollLock(open)
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<string>('ALL')
  const [equipmentFilter, setEquipmentFilter] = useState<string>('ALL')
  const [catalog, setCatalog] = useState<ExerciseOption[]>([])
  // Inicia em loading porque o parent só monta esse componente quando
  // vai abrir. Evita chamar setLoading(true) dentro do effect (lint
  // react-hooks/set-state-in-effect proíbe).
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Conjunto dos exercícios marcados. Set pra checagem O(1) e dedupe
  // natural; o array final pra onPickBatch preserva a ordem do catálogo
  // filtrado pra o resultado ser previsível.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    searchExercisesForPlan(authorizedFetch, { limit: 300 })
      .then((data) => { if (!cancelled) setCatalog(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, authorizedFetch])

  // Listas únicas pra popular os filtros — derivadas do catálogo
  // real, ignora vazios.
  const muscleOptions = useMemo(() => {
    const set = new Set<string>()
    for (const ex of catalog) if (ex.primaryMuscleGroup) set.add(ex.primaryMuscleGroup)
    return Array.from(set).sort()
  }, [catalog])
  const equipmentOptions = useMemo(() => {
    const set = new Set<string>()
    for (const ex of catalog) if (ex.equipment) set.add(ex.equipment)
    return Array.from(set).sort()
  }, [catalog])

  // Filtros aplicados sequencialmente.
  const filtered = useMemo(() => {
    let list = catalog
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((ex) => ex.name.toLowerCase().includes(q))
    if (muscleFilter !== 'ALL') list = list.filter((ex) => ex.primaryMuscleGroup === muscleFilter)
    if (equipmentFilter !== 'ALL') list = list.filter((ex) => ex.equipment === equipmentFilter)
    return list
  }, [catalog, search, muscleFilter, equipmentFilter])

  // 3 seções em cascata pra não duplicar item entre elas. Cada seção
  // exclui os IDs das anteriores via Set — assim "Recentes" tem
  // prioridade, "Personalizados" pega o resto que é do usuário, e
  // "Todos" pega o que sobrou. Recentes > Personalizados porque
  // "usei recentemente" é sinal mais forte que "eu criei".
  const recentIds = useMemo(() => (open ? getRecentExerciseIds() : []), [open])
  const recent = useMemo(() => {
    return recentIds
      .map((id) => filtered.find((ex) => ex.id === id))
      .filter((ex): ex is ExerciseOption => Boolean(ex))
  }, [recentIds, filtered])

  const recentIdSet = useMemo(() => new Set(recent.map((ex) => ex.id)), [recent])

  const personalized = useMemo(() => {
    return filtered.filter((ex) => ex.scope === 'PRIVATE' && !recentIdSet.has(ex.id))
  }, [filtered, recentIdSet])

  const personalizedIdSet = useMemo(() => new Set(personalized.map((ex) => ex.id)), [personalized])

  const allOthers = useMemo(() => {
    return filtered.filter((ex) => !recentIdSet.has(ex.id) && !personalizedIdSet.has(ex.id))
  }, [filtered, recentIdSet, personalizedIdSet])

  // Quando o usuário digita na busca, troca pra "Resultados da busca"
  // (uma seção só — sem agrupar Recentes/Personalizados/Todos pra não
  // duplicar e pra deixar o ranking por match mais óbvio). Filtros chip
  // (músculo / equipamento) só estreitam as seções normais.
  const searchActive = Boolean(search.trim())
  const hasOnlyChipFilter = !searchActive && (muscleFilter !== 'ALL' || equipmentFilter !== 'ALL')

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  // Renderiza uma row do picker. `touch-action: manipulation` desliga o
  // 300ms tap delay do iOS Safari (zoom-on-double-tap heuristic) e dá
  // resposta instantânea pro tap. Quando marcada, mostra a barra brand
  // do lado esquerdo + check à direita pra deixar o estado óbvio.
  const renderRow = (option: ExerciseOption) => {
    const selected = selectedIds.has(option.id)
    return (
      <button
        key={option.id}
        type="button"
        onClick={() => toggleSelected(option.id)}
        style={{ touchAction: 'manipulation' }}
        className={`relative flex w-full items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left transition-colors ${
          selected ? 'bg-[var(--brand)]/8' : 'hover:bg-[var(--surface-hover)]'
        }`}
      >
        {selected && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--brand)]"
          />
        )}
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
          {option.thumbnailUrl ? (
            <img src={option.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Dumbbell size={20} className="text-[var(--muted)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--text)]">{option.name}</p>
          {option.primaryMuscleGroup && (
            <p className="truncate text-[12px] text-[var(--muted)]">{option.primaryMuscleGroup}</p>
          )}
        </div>
        <span
          aria-label={selected ? 'Selecionado' : 'Selecionar'}
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors ${
            selected
              ? 'border-2 border-[var(--brand)] bg-[var(--brand)] text-white'
              : 'border border-[var(--line)] text-[var(--muted)]'
          }`}
        >
          {selected ? <Check size={14} strokeWidth={3} /> : null}
        </span>
      </button>
    )
  }

  // Confirma todas as marcações: resolve os Sets em uma lista ordenada
  // pela ordem do catálogo filtrado (estável e previsível) e dispara
  // o batch handler. Limpa seleção antes de fechar pra próxima abertura
  // começar fresca.
  const confirmBatch = () => {
    if (selectedIds.size === 0) return
    const picked: ExerciseOption[] = []
    for (const ex of filtered) {
      if (selectedIds.has(ex.id)) picked.push(ex)
    }
    onPickBatch(picked)
    setSelectedIds(new Set())
    onClose()
  }

  return createPortal(
    <motion.div
      key="add-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[80] flex bg-[var(--surface)] sm:items-center sm:justify-center sm:bg-black/55 sm:backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="relative flex h-full w-full flex-col bg-[var(--surface)] sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl sm:border sm:border-[var(--line)] sm:shadow-2xl"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-4 py-3 pt-safe-plus-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]"
          >
            Cancelar
          </button>
          <h2 className="text-[14px] font-bold text-[var(--text)]">{title}</h2>
          <button
            type="button"
            onClick={onCreateRequest}
            className="text-[14px] font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]"
          >
            Criar
          </button>
        </header>

        <div className="shrink-0 space-y-2 border-b border-[var(--line)] p-3">
          <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2">
            <Search size={14} className="text-[var(--muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Procurar exercício"
              className="flex-1 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
            />
          </label>
          <div className="flex gap-2">
            <select
              value={equipmentFilter}
              onChange={(e) => setEquipmentFilter(e.target.value)}
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-[13px] text-[var(--text)]"
            >
              <option value="ALL">Todo o Equipamento</option>
              {equipmentOptions.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
            </select>
            <select
              value={muscleFilter}
              onChange={(e) => setMuscleFilter(e.target.value)}
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-2 text-[13px] text-[var(--text)]"
            >
              <option value="ALL">Todos os Músculos</option>
              {muscleOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <p className="px-4 py-8 text-center text-[12px] text-[var(--muted)]">Carregando…</p>
          )}
          {error && (
            <p className="m-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-center text-[12px] text-rose-500">
              {error}
            </p>
          )}
          {!loading && !error && (
            <>
              {searchActive ? (
                /* Modo busca: uma seção só. Sem agrupar — o que importa
                   é o match com o termo, não a origem do exercício. */
                <section>
                  <h3 className="bg-[var(--surface-hover)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Resultados da busca ({filtered.length})
                  </h3>
                  {filtered.map(renderRow)}
                  {filtered.length === 0 && (
                    <p className="px-4 py-8 text-center text-[12px] text-[var(--muted)]">
                      Nenhum exercício bate com "{search.trim()}".
                    </p>
                  )}
                </section>
              ) : (
                <>
                  {/* Seção 1 — Recentes. Só aparece se há itens (não
                      polui com placeholder vazio). */}
                  {recent.length > 0 && (
                    <section>
                      <h3 className="bg-[var(--surface-hover)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
                        Exercícios Recentes
                      </h3>
                      {recent.map(renderRow)}
                    </section>
                  )}

                  {/* Seção 2 — Personalizados (scope=PRIVATE), excluindo
                      o que já apareceu em Recentes. Mesmo critério: só
                      aparece se tem item. */}
                  {personalized.length > 0 && (
                    <section>
                      <h3 className="bg-[var(--surface-hover)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
                        Exercícios Personalizados
                      </h3>
                      {personalized.map(renderRow)}
                    </section>
                  )}

                  {/* Seção 3 — Todos os outros. Catálogo global +
                      qualquer coisa não capturada acima. Sempre aparece
                      (com placeholder específico se vazio por filtro). */}
                  <section>
                    <h3 className="bg-[var(--surface-hover)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      Todos os Exercícios{allOthers.length > 0 ? ` (${allOthers.length})` : ''}
                    </h3>
                    {allOthers.length > 0 ? (
                      allOthers.map(renderRow)
                    ) : (
                      <p className="px-4 py-6 text-center text-[12px] text-[var(--muted)]">
                        {hasOnlyChipFilter
                          ? 'Nenhum exercício bate com os filtros aplicados.'
                          : recent.length === 0 && personalized.length === 0
                            ? 'Nenhum exercício disponível.'
                            : 'Sem outros exercícios além dos listados acima.'}
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          {/* Espaço pra a lista não ficar coberta pelo footer sticky
              quando há seleção (footer entra com altura ~64px). */}
          {selectedIds.size > 0 && <div aria-hidden className="h-20" />}
        </div>

        {/* Footer sticky de confirmação — só aparece quando há seleção.
            Estilo de CTA primário pra deixar óbvio o próximo passo.
            "1 exercício" sem 's' final pra o singular ficar gramatical. */}
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="absolute inset-x-0 bottom-0 border-t border-[var(--line)] bg-[var(--surface)] p-3 pb-safe"
          >
            <button
              type="button"
              onClick={confirmBatch}
              style={{ touchAction: 'manipulation' }}
              className="w-full rounded-xl bg-[var(--brand)] py-3 text-[14px] font-bold text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)]"
            >
              Adicionar {selectedIds.size} {selectedIds.size === 1 ? 'exercício' : 'exercícios'}
            </button>
          </motion.div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  )
}
