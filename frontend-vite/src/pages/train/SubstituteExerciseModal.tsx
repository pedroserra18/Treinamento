import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'
import { Search, Activity, Dumbbell } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useScrollLock } from '../../hooks/useScrollLock'
import { getRecentExerciseIds } from '../../lib/exercise/recent-exercises'
import type { ExerciseOption } from '../../types/workout'
import { matchesExerciseSearch } from '../../lib/exercise/exercise-search'
import { getExerciseCatalogCached, peekExerciseCatalog } from '../../lib/cache/exercise-catalog-cache'

// Forma mínima que o source precisa expor — só o id (pra excluir o
// próprio do catálogo) e o nome (pra label de aria). Aceita tanto
// `ActiveExercise` (TrainPage) quanto `PlanExercise.exercise`
// (WorkoutsPage) via duck typing.
export type SubstituteSource = {
  id: string
  name: string
}

// Modal cheio de substituição (estilo Hevy). Carrega o catálogo na
// abertura, organiza em duas seções (Sugeridos = mesmo grupo muscular
// que o source, ranqueado por frequência de uso; Recentes = IDs que
// o usuário usou no passado, lidos do localStorage) e ainda permite
// pesquisa livre + filtro por equipamento e músculo. Quando o user
// escolhe, dispara onPick com o ExerciseOption completo pra o parent
// fazer a substituição mantendo as séries.
export function SubstituteExerciseModal({
  open, source, onPick, onCreateRequest, onClose,
}: {
  open: boolean
  source: SubstituteSource
  onPick: (option: ExerciseOption) => void
  // Disparado quando o usuário toca em "Criar" — o parent abre o
  // CreateExerciseModal, e o exercício criado lá vira o substituto.
  onCreateRequest: () => void
  onClose: () => void
}) {
  const { authorizedFetch } = useAuth()
  useScrollLock(open)
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState<string>('ALL')
  const [equipmentFilter, setEquipmentFilter] = useState<string>('ALL')
  // Initialização SÍNCRONA: pega o cache se estiver quente (TrainPage
  // pré-aqueceu via prefetch). Modal abre instantâneo sem flash de
  // skeleton.
  const [catalog, setCatalog] = useState<ExerciseOption[]>(() => peekExerciseCatalog() ?? [])
  const [loading, setLoading] = useState(() => peekExerciseCatalog() == null)
  const [error, setError] = useState<string | null>(null)

  // Usa cache compartilhado — mesmo backend hit serve AddExerciseModal +
  // SubstituteExerciseModal + syncExerciseMetadata. Coalesce in-flight
  // evita 3 requests simultâneos.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    getExerciseCatalogCached(authorizedFetch)
      .then((data) => { if (!cancelled) setCatalog(data) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, authorizedFetch])

  // Listas únicas de músculos e equipamentos pra popular os filtros.
  // Derivadas do catálogo real, ignora vazios.
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

  // Aplica os 3 filtros (busca + músculo + equipamento) sequencialmente.
  // Exclui o próprio source — substituir por ele mesmo é no-op.
  // Busca usa vocabulário PT-BR — 'biceps', 'peito', 'perna', 'barra'
  // acham por grupo muscular ou equipamento, não só pelo nome.
  const filtered = useMemo(() => {
    let list = catalog.filter((ex) => ex.id !== source.id)
    const q = search.trim()
    if (q) list = list.filter((ex) => matchesExerciseSearch(ex, q))
    if (muscleFilter !== 'ALL') list = list.filter((ex) => ex.primaryMuscleGroup === muscleFilter)
    if (equipmentFilter !== 'ALL') list = list.filter((ex) => ex.equipment === equipmentFilter)
    return list
  }, [catalog, search, muscleFilter, equipmentFilter, source.id])

  // SUGERIDOS = mesmo grupo muscular primário do source, depois
  // ordenado por "quão recente o usuário usou" (proxy de frequência).
  // O índice no recentIds funciona como ranking inverso (0 = mais
  // recente). IDs não recentes vão pro final mantendo a ordem alfabética.
  const recentIds = useMemo(() => (open ? getRecentExerciseIds() : []), [open])
  const recentRank = useMemo(() => {
    const map = new Map<string, number>()
    recentIds.forEach((id, idx) => map.set(id, idx))
    return map
  }, [recentIds])
  // Source nem sempre carrega muscle group próprio (ActiveExercise não
  // tem, PlanExercise tem) — pega do catálogo pra padronizar.
  const sourceMuscleGroup = useMemo(() => {
    const sourceInCatalog = catalog.find((ex) => ex.id === source.id)
    return sourceInCatalog?.primaryMuscleGroup ?? null
  }, [catalog, source.id])

  const suggested = useMemo(() => {
    if (!sourceMuscleGroup) return []
    const candidates = filtered.filter((ex) => ex.primaryMuscleGroup === sourceMuscleGroup)
    return [...candidates]
      .sort((a, b) => {
        const ra = recentRank.get(a.id) ?? Infinity
        const rb = recentRank.get(b.id) ?? Infinity
        if (ra !== rb) return ra - rb
        return a.name.localeCompare(b.name, 'pt-BR')
      })
      .slice(0, 5)
  }, [filtered, sourceMuscleGroup, recentRank])

  // RECENTES = ordem do localStorage, intersectada com o filtro atual.
  // Deduplica contra Sugeridos pra não exibir o mesmo exercício duas
  // vezes — se já apareceu em "sugeridos", remove daqui. Sem isso, o
  // usuário que treina sempre o mesmo grupo via os mesmos exercícios
  // listados em duplicata.
  const suggestedIdSet = useMemo(() => new Set(suggested.map((ex) => ex.id)), [suggested])
  const recent = useMemo(() => {
    return recentIds
      .map((id) => filtered.find((ex) => ex.id === id))
      .filter((ex): ex is ExerciseOption => Boolean(ex))
      .filter((ex) => !suggestedIdSet.has(ex.id))
      .slice(0, 10)
  }, [recentIds, filtered, suggestedIdSet])

  // Quando o usuário digita ALGO na busca, queremos foco — só os
  // "Resultados da busca" devem aparecer, sem Sugeridos / Recentes
  // empoluindo a tela com duplicatas. Filtros chip (músculo /
  // equipamento) NÃO disparam modo busca — eles só estreitam as
  // duas seções normais.
  const searchActive = Boolean(search.trim())
  const hasOnlyChipFilter = !searchActive && (muscleFilter !== 'ALL' || equipmentFilter !== 'ALL')

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  // Sub-componente local pra evitar repetir a row de exercício 3x.
  const renderRow = (option: ExerciseOption) => (
    <button
      key={option.id}
      type="button"
      onClick={() => { onPick(option); onClose() }}
      className="flex w-full items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
    >
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
      {/* Ícone de "estatísticas" como na imagem — só decoração por enquanto.
          Futuro: clicar abre o histórico do exercício. */}
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)]" aria-hidden>
        <Activity size={13} />
      </span>
    </button>
  )

  return createPortal(
    <motion.div
      key="sub-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[80] flex bg-[var(--surface)] sm:items-center sm:justify-center sm:bg-black/55 sm:backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Substituir exercício"
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        className="flex h-full w-full flex-col bg-[var(--surface)] sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl sm:border sm:border-[var(--line)] sm:shadow-2xl"
      >
        {/* Header com Cancelar / Título / Criar — mesma estrutura do
            screenshot do Hevy. "Criar" hoje só fecha + dispara o atalho
            existente de adicionar exercício; refino fica pra depois. */}
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-4 py-3 pt-safe-plus-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]"
          >
            Cancelar
          </button>
          <h2 className="text-[14px] font-bold text-[var(--text)]">Substituir exercício</h2>
          <button
            type="button"
            onClick={onCreateRequest}
            className="text-[14px] font-semibold text-[var(--brand)] hover:text-[var(--brand-strong)]"
          >
            Criar
          </button>
        </header>

        {/* Busca + filtros — barra sticky pra ficar acessível durante o
            scroll da lista (importante em mobile). */}
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

        {/* Conteúdo rolável */}
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
              {/* Modo busca: substitui Sugeridos+Recentes por uma única
                  seção "Resultados da busca" pra não duplicar item. */}
              {searchActive ? (
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
                  {/* Sugeridos — só aparece se tiver pelo menos um candidato.
                      Quando o source não tem muscle group (exercício custom
                      sem catálogo), suggested fica vazio e pulamos o header. */}
                  {suggested.length > 0 && (
                    <section>
                      <h3 className="bg-[var(--surface-hover)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
                        Exercícios sugeridos
                      </h3>
                      {suggested.map(renderRow)}
                    </section>
                  )}

                  {/* Recentes — SEMPRE renderiza o header pra deixar
                      claro que existe a seção. Quando vazio, mostra um
                      placeholder pra o usuário entender que ainda não
                      acumulou histórico (em vez de só sumir e parecer
                      bug). */}
                  <section>
                    <h3 className="bg-[var(--surface-hover)] px-4 py-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
                      Exercícios Recentes
                    </h3>
                    {recent.length > 0 ? (
                      recent.map(renderRow)
                    ) : (
                      <p className="px-4 py-6 text-center text-[12px] text-[var(--muted)]">
                        {hasOnlyChipFilter
                          ? 'Nenhum recente bate com os filtros.'
                          : 'Os exercícios que você usa vão aparecer aqui.'}
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  )
}
