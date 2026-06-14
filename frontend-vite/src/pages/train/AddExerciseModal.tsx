import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Dumbbell, Check, Trash2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useScrollLock } from '../../hooks/useScrollLock'
import { getRecentExerciseIds } from '../../lib/recent-exercises'
import {
  deletePrivateExercise,
} from '../../services/workoutService'
import type { ExerciseOption } from '../../types/workout'
import { matchesExerciseSearch } from '../../lib/exercise-search'
import {
  getExerciseCatalogCached,
  invalidateExerciseCatalog,
  peekExerciseCatalog,
} from '../../lib/exercise-catalog-cache'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'

// Linha da seção Personalizados — espelha o markup de uma row normal,
// mas adiciona affordances pra deletar o exercício personalizado:
//   • Mobile: swipe pra esquerda revela um botão "Excluir" vermelho.
//     Tap em qualquer parte do conteúdo enquanto revelado fecha sem
//     deletar — UX iOS clássica.
//   • Desktop: ícone Trash2 visível no canto direito, ao lado do círculo
//     de seleção. Hover fica vermelho.
// O delete real só dispara depois do ConfirmDialog destructive — o parent
// recebe o id via onRequestDelete pra centralizar o dialog (1 instância,
// não 1 por linha).
function PersonalizedExerciseRow({
  option, selected, alreadyIn, onToggleSelect, onRequestDelete,
}: {
  option: ExerciseOption
  selected: boolean
  alreadyIn: boolean
  onToggleSelect: () => void
  onRequestDelete: () => void
}) {
  const REVEAL_PX = 88
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="relative overflow-hidden border-b border-[var(--line)]">
      <button
        type="button"
        onClick={() => { onRequestDelete(); setRevealed(false) }}
        aria-label={`Excluir ${option.name}`}
        style={{ width: `${REVEAL_PX}px`, touchAction: 'manipulation' }}
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 text-[13px] font-bold text-white transition-colors hover:bg-red-600 sm:hidden"
      >
        Excluir
      </button>

      <motion.div
        drag="x"
        dragConstraints={{ left: -REVEAL_PX, right: 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        animate={{ x: revealed ? -REVEAL_PX : 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        onDragEnd={(_, info) => {
          const shouldReveal = info.offset.x < -REVEAL_PX / 2 || info.velocity.x < -300
          setRevealed(shouldReveal)
        }}
        onClick={() => {
          if (revealed) {
            setRevealed(false)
            return
          }
          if (alreadyIn) return
          onToggleSelect()
        }}
        style={{ touchAction: 'pan-y' }}
        className={`relative flex w-full items-center gap-3 bg-[var(--surface)] px-4 py-3 text-left transition-colors ${
          alreadyIn
            ? 'cursor-default opacity-60'
            : selected
              ? 'bg-[var(--brand)]/8'
              : 'hover:bg-[var(--surface-hover)]'
        }`}
      >
        {selected && !alreadyIn && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-[var(--brand)]" />
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

        {/* Trash2 só em desktop — em mobile o swipe cobre essa função. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRequestDelete() }}
          aria-label={`Excluir ${option.name}`}
          title="Excluir exercício"
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-red-500/10 hover:text-red-500 sm:inline-flex"
        >
          <Trash2 size={15} />
        </button>

        {alreadyIn ? (
          <span
            aria-label="Já no treino"
            className="shrink-0 rounded-full border border-[var(--brand)]/40 bg-[var(--brand)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--brand-strong)]"
          >
            No treino
          </span>
        ) : (
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
        )}
      </motion.div>
    </div>
  )
}

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
  currentExerciseIds = [],
}: {
  open: boolean
  // Recebe TODOS os exercícios marcados de uma vez. O caller decide
  // como aplicar (sync no estado local pro treino ativo, ou async serial
  // pra rotina em edição — onde cada add é uma chamada de API).
  onPickBatch: (options: ExerciseOption[]) => void
  onCreateRequest: () => void
  onClose: () => void
  title?: string
  // IDs dos exercícios que JÁ estão no treino/rotina sendo editado. Esses
  // aparecem com badge "Já no treino" em vez do círculo de seleção e não
  // podem ser marcados — evita o usuário tocar e levar um InfoDialog
  // dizendo "já adicionado" depois.
  currentExerciseIds?: string[]
}) {
  const { authorizedFetch } = useAuth()
  useScrollLock(open)
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<string>('ALL')
  const [equipmentFilter, setEquipmentFilter] = useState<string>('ALL')
  // Inicialização SÍNCRONA: se a TrainPage já fez prefetch, o cache
  // tá quente e o modal abre com a lista renderizada — sem skeleton,
  // sem flash. Quando cold, cai no useEffect abaixo.
  const [catalog, setCatalog] = useState<ExerciseOption[]>(() => peekExerciseCatalog() ?? [])
  // Loading só quando o cache está vazio. Modal abre instantâneo se
  // catálogo já tava pre-aquecido.
  const [loading, setLoading] = useState(() => peekExerciseCatalog() == null)
  const [error, setError] = useState<string | null>(null)
  // Conjunto dos exercícios marcados. Set pra checagem O(1) e dedupe
  // natural; o array final pra onPickBatch preserva a ordem do catálogo
  // filtrado pra o resultado ser previsível.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  // Estado pro fluxo de delete dos personalizados: pendingDelete guarda
  // o exercício alvo enquanto o ConfirmDialog está aberto; deletingId
  // bloqueia cliques durante o request HTTP.
  const [pendingDelete, setPendingDelete] = useState<ExerciseOption | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Set derivado dos IDs já no treino — usado pelos renderRow pra mostrar
  // o badge "Já no treino" e bloquear seleção. Mantido como prop array
  // (estável-friendly) e convertido aqui pra checagem O(1) no render.
  const presentExerciseIds = useMemo(() => new Set(currentExerciseIds), [currentExerciseIds])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Carrega o catálogo via cache compartilhado. Quando o cache tá quente
  // (TrainPage já prefetcheou), resolve em < 1ms sem rede — o user vê o
  // modal pronto na hora. Cold start: hit no backend uma única vez por
  // sessão e reusa pelas próximas 5 minutos.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    getExerciseCatalogCached(authorizedFetch)
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

  // Filtros aplicados sequencialmente. Busca usa vocabulário PT-BR
  // (`matchesExerciseSearch`): digitar 'biceps' acha exercícios com
  // primaryMuscleGroup BICEPS + os que têm 'bíceps' no nome (sem
  // precisar do acento). 'peito' acha CHEST, 'perna' acha LEGS/QUADS/
  // HAMSTRINGS/CALVES, 'barra' acha exercícios com 'barra' no equipment.
  const filtered = useMemo(() => {
    let list = catalog
    const q = search.trim()
    if (q) list = list.filter((ex) => matchesExerciseSearch(ex, q))
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
  // Se o exercício já está no treino/rotina sendo editado, vira read-only
  // com badge "Já no treino" e tap desabilitado — evita o usuário tocar
  // e ser respondido com um InfoDialog redundante de "duplicata".
  const renderRow = (option: ExerciseOption) => {
    const alreadyIn = presentExerciseIds.has(option.id)
    const selected = selectedIds.has(option.id)
    return (
      <button
        key={option.id}
        type="button"
        onClick={() => { if (!alreadyIn) toggleSelected(option.id) }}
        disabled={alreadyIn}
        aria-disabled={alreadyIn}
        style={{ touchAction: 'manipulation' }}
        className={`relative flex w-full items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left transition-colors ${
          alreadyIn
            ? 'cursor-default opacity-60'
            : selected
              ? 'bg-[var(--brand)]/8'
              : 'hover:bg-[var(--surface-hover)]'
        }`}
      >
        {selected && !alreadyIn && (
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
        {alreadyIn ? (
          <span
            aria-label="Já no treino"
            className="shrink-0 rounded-full border border-[var(--brand)]/40 bg-[var(--brand)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--brand-strong)]"
          >
            No treino
          </span>
        ) : (
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
        )}
      </button>
    )
  }

  // Confirma o delete do exercício personalizado. Atualiza otimisticamente
  // o catálogo local (remoção da lista) + tira da seleção se estava marcado.
  // Se o backend retornar erro (403/404/500), reverte a UI mostrando a
  // mensagem em deleteError — o fetch original era visual, então recolocar
  // o item no estado seria caro/raro; preferimos sinalizar e deixar o user
  // tentar de novo.
  const confirmDelete = async () => {
    if (!pendingDelete) return
    const target = pendingDelete
    setDeletingId(target.id)
    setDeleteError(null)
    try {
      await deletePrivateExercise(authorizedFetch, target.id)
      // Invalida o cache compartilhado pra o exercício deletado também
      // sumir nos outros modais (Substituir, syncMetadata, etc).
      invalidateExerciseCatalog()
      setCatalog((current) => current.filter((ex) => ex.id !== target.id))
      setSelectedIds((current) => {
        if (!current.has(target.id)) return current
        const next = new Set(current)
        next.delete(target.id)
        return next
      })
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Falha ao excluir exercício')
    } finally {
      setDeletingId(null)
    }
  }

  // Confirma todas as marcações: resolve os Sets em uma lista ordenada
  // pela ordem do catálogo filtrado (estável e previsível) e dispara
  // o batch handler. Limpa seleção antes de fechar pra próxima abertura
  // começar fresca.
  const confirmBatch = () => {
    if (selectedIds.size === 0) return
    const picked: ExerciseOption[] = []
    for (const ex of filtered) {
      // Defesa em profundidade: o render já bloqueia tap em alreadyIn,
      // mas se algum item escapou (race com hidratação do treino, etc.)
      // garantimos que o batch nunca repassa duplicata pro caller.
      if (selectedIds.has(ex.id) && !presentExerciseIds.has(ex.id)) picked.push(ex)
    }
    if (picked.length === 0) {
      setSelectedIds(new Set())
      onClose()
      return
    }
    onPickBatch(picked)
    setSelectedIds(new Set())
    onClose()
  }

  return createPortal(
    <>
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
                      aparece se tem item. Cada row tem affordance pra
                      deletar (swipe no mobile, ícone Trash no desktop). */}
                  {personalized.length > 0 && (
                    <section>
                      <h3 className="bg-[var(--surface-hover)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
                        Exercícios Personalizados
                      </h3>
                      {personalized.map((option) => (
                        <PersonalizedExerciseRow
                          key={option.id}
                          option={option}
                          selected={selectedIds.has(option.id)}
                          alreadyIn={presentExerciseIds.has(option.id)}
                          onToggleSelect={() => toggleSelected(option.id)}
                          onRequestDelete={() => {
                            setDeleteError(null)
                            setPendingDelete(option)
                          }}
                        />
                      ))}
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
    </motion.div>

    {/* Confirm dialog do delete de personalizado — z-index do componente
        já é maior que o do modal (z-[90] vs z-[80]). deleteError aparece
        dentro da própria mensagem caso o request falhe; após sucesso, o
        próprio dialog é fechado via setPendingDelete(null). */}
    <ConfirmDialog
      open={pendingDelete !== null}
      title="Excluir exercício?"
      message={
        deleteError
          ? `Não foi possível excluir "${pendingDelete?.name ?? ''}": ${deleteError}`
          : `"${pendingDelete?.name ?? ''}" será removido dos seus exercícios personalizados. Treinos e rotinas antigos que usam esse exercício continuam preservados.`
      }
      destructive
      confirmLabel={deletingId !== null ? 'Excluindo…' : 'Excluir'}
      onConfirm={() => { void confirmDelete() }}
      onCancel={() => {
        if (deletingId !== null) return
        setPendingDelete(null)
        setDeleteError(null)
      }}
    />
    </>,
    document.body,
  )
}
