import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Camera, Check } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useScrollLock } from '../../hooks/useScrollLock'
import {
  ApiError,
  createCustomExercise,
  getMyExerciseStats,
  uploadExercisePhoto,
  type CreateExerciseInput,
  type MyExerciseStats,
} from '../../services/workoutService'
import { optimizeImageFileToDataUrl } from '../../lib/image-processing'
import type { ExerciseOption } from '../../types/workout'
import { ConfirmDialog } from '../../components/common/ConfirmDialog'

// Tabela canônica de músculos suportados pelo backend (enum MuscleGroup
// no Prisma). Labels em PT pro picker — backend recebe a chave em
// UPPERCASE. Sincronizada manualmente; quando o enum mudar, atualizar
// aqui também (o backend rejeitará valores fora dessa lista via zod).
const MUSCLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'CHEST', label: 'Peito' },
  { value: 'BACK', label: 'Costas' },
  { value: 'SHOULDERS', label: 'Ombros' },
  { value: 'BICEPS', label: 'Bíceps' },
  { value: 'TRICEPS', label: 'Tríceps' },
  { value: 'ARMS', label: 'Braços' },
  { value: 'FOREARM', label: 'Antebraço' },
  { value: 'CORE', label: 'Core' },
  { value: 'ABDOMEN', label: 'Abdômen' },
  { value: 'LEGS', label: 'Pernas' },
  { value: 'QUADS', label: 'Quadríceps' },
  { value: 'HAMSTRINGS', label: 'Posterior de Coxa' },
  { value: 'GLUTES', label: 'Glúteos' },
  { value: 'CALVES', label: 'Panturrilha' },
  { value: 'ADDUCTORS', label: 'Adutores' },
  { value: 'FULL_BODY', label: 'Corpo Inteiro' },
]

// Catálogo curto de equipamentos comuns. Backend aceita string livre
// mas a UI mostra essa lista — quando vier um exercício importado com
// equipamento exótico, ainda exibe corretamente porque a comparação
// é só pra UI do picker, não pra validar.
const EQUIPMENT_OPTIONS = [
  'Barra',
  'Halter',
  'Máquina',
  'Cabo',
  'Smith',
  'Peso Corporal',
  'Anilhas',
  'Kettlebell',
  'Banda Elástica',
  'TRX',
  'Bola Suíça',
  'Outro',
] as const

const TRACKING_OPTIONS: Array<{ value: 'REPS' | 'TIME' | 'DISTANCE' | 'REPS_AND_TIME'; label: string; hint: string }> = [
  { value: 'REPS', label: 'Repetições', hint: 'Padrão pra força — séries × reps × carga' },
  { value: 'TIME', label: 'Tempo', hint: 'Prancha, isometria — duração em segundos' },
  { value: 'DISTANCE', label: 'Distância', hint: 'Caminhada, corrida — em metros' },
  { value: 'REPS_AND_TIME', label: 'Reps + Tempo', hint: 'Híbrido — registra os dois' },
]

// Picker secundário renderizado por cima do modal principal. Usado pra
// equipamento, músculo primário, secundário e tracking type. Lista de
// opções genéricas com a opção atual destacada.
function OptionPickerSheet({
  open, title, options, currentValue, onPick, onClose,
}: {
  open: boolean
  title: string
  options: Array<{ value: string; label: string; hint?: string }>
  currentValue: string | null
  onPick: (value: string | null) => void
  onClose: () => void
}) {
  useScrollLock(open)
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] shadow-2xl sm:mb-0 sm:rounded-2xl sm:border-b"
          style={{ maxHeight: 'min(75vh, 600px)' }}
        >
          <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--line)] sm:hidden" />
          <h3 className="shrink-0 px-4 pb-2 pt-3 text-center text-[14px] font-bold text-[var(--text)]">{title}</h3>
          <ul className="flex-1 overflow-y-auto border-t border-[var(--line)]">
            {/* Opção "Nenhum" pra o secondary muscle (e qualquer outro
                campo opcional) — só mostra quando currentValue pode ser null
                (controlado via prop pelo parent). Decidido implícito: se
                o currentValue atual for null, "Nenhum" aparece como
                primeira opção. */}
            {currentValue === null && (
              <li>
                <button
                  type="button"
                  onClick={() => { onPick(null); onClose() }}
                  className="flex w-full items-center justify-between border-b border-[var(--line)] px-4 py-3 text-left text-[14px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  Nenhum
                  <Check size={14} className="text-[var(--brand)]" />
                </button>
              </li>
            )}
            {options.map((opt) => {
              const isSelected = opt.value === currentValue
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => { onPick(opt.value); onClose() }}
                    className={`flex w-full items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 text-left transition-colors ${
                      isSelected ? 'bg-[var(--brand)]/10' : 'hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-[14px] ${isSelected ? 'font-bold text-[var(--brand-strong)]' : 'font-medium text-[var(--text)]'}`}>
                        {opt.label}
                      </p>
                      {opt.hint && (
                        <p className="mt-0.5 text-[11px] text-[var(--muted)]">{opt.hint}</p>
                      )}
                    </div>
                    {isSelected && <Check size={14} className="shrink-0 text-[var(--brand)]" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

// Modal full-screen pra criar exercício custom, matching the user's
// reference screenshot do Hevy. Foto opcional, nome obrigatório,
// equipamento + músculo primário + tipo selecionados via picker.
// Salvar chama o backend e dispara onCreated com o ExerciseOption
// pronto pra ser usado como substituto na sessão atual.
export function CreateExerciseModal({
  open, onCreated, onClose,
}: {
  open: boolean
  onCreated: (exercise: ExerciseOption) => void
  onClose: () => void
}) {
  const { authorizedFetch } = useAuth()
  const navigate = useNavigate()
  useScrollLock(open)

  // Estado do formulário. Tudo string/null pra simplificar a validação.
  const [name, setName] = useState('')
  const [equipment, setEquipment] = useState<string | null>(null)
  const [primaryMuscle, setPrimaryMuscle] = useState<string | null>(null)
  const [secondaryMuscle, setSecondaryMuscle] = useState<string | null>(null)
  const [trackingType, setTrackingType] = useState<NonNullable<CreateExerciseInput['trackingType']>>('REPS')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
  const [openPicker, setOpenPicker] = useState<null | 'equipment' | 'primary' | 'secondary' | 'tracking'>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Stats do tier: pra renderizar o contador "X/5 criados" no header e
  // pra antecipar o aviso de limite caso o usuário já esteja no teto antes
  // mesmo de clicar em Salvar. Carregadas no open.
  const [stats, setStats] = useState<MyExerciseStats | null>(null)
  const [limitDialogOpen, setLimitDialogOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Carrega stats ao abrir. Erros aqui são silenciosos — se o backend
  // falhar, o contador não aparece e a validação real continua no POST.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const s = await getMyExerciseStats(authorizedFetch)
        if (!cancelled) setStats(s)
      } catch {
        if (!cancelled) setStats(null)
      }
    })()
    return () => { cancelled = true }
  }, [open, authorizedFetch])

  if (!open) return null

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      // Otimiza no client antes do upload — Storage cobra por bandwidth
      // e usuário num 3G agradece. 600px max edge é o suficiente pra
      // o thumbnail circular de 80px renderizar nítido em retina.
      const dataUrl = await optimizeImageFileToDataUrl(file, { maxEdge: 600, quality: 0.82, maxOutputBytes: 600_000 })
      setPhotoDataUrl(dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao processar foto')
    }
  }

  // Bloqueia o Salvar quando já está no teto — evita o usuário clicar,
  // esperar o upload da foto e só então descobrir que vai falhar.
  const atLimit = stats !== null && stats.limit !== null && stats.created >= stats.limit
  const counterLabel = stats !== null && stats.limit !== null ? `${stats.created}/${stats.limit}` : null
  const canSave = name.trim().length >= 2 && equipment && primaryMuscle && !saving && !atLimit

  const handleSave = async () => {
    if (!canSave || !equipment || !primaryMuscle) return
    setSaving(true)
    setError(null)
    try {
      // Upload da foto antes — se falhar, queremos abortar a criação
      // e não deixar o exercício com a foto faltando.
      let thumbnailUrl: string | null = null
      if (photoDataUrl) {
        const uploaded = await uploadExercisePhoto(authorizedFetch, photoDataUrl)
        thumbnailUrl = uploaded.photoUrl
      }

      const created = await createCustomExercise(authorizedFetch, {
        name: name.trim(),
        equipment,
        primaryMuscleGroup: primaryMuscle,
        secondaryMuscleGroup: secondaryMuscle,
        trackingType,
        thumbnailUrl,
      })
      onCreated(created)
      onClose()
    } catch (err) {
      // Limite do tier free: levanta um InfoDialog explicativo em vez
      // de empilhar a mensagem vermelha no rodapé — a CTA "Entendi"
      // fecha o aviso mas mantém o modal aberto pra o usuário rever
      // ou cancelar manualmente.
      if (err instanceof ApiError && err.code === 'EXERCISE_LIMIT_REACHED') {
        setLimitDialogOpen(true)
      } else {
        setError(err instanceof Error ? err.message : 'Falha ao salvar')
      }
    } finally {
      setSaving(false)
    }
  }

  // Labels resolvidos pra mostrar nas linhas do formulário (em vez do
  // valor cru tipo CHEST → mostra "Peito").
  const equipmentLabel = equipment ?? 'Selecionar'
  const primaryMuscleLabel = MUSCLE_OPTIONS.find((m) => m.value === primaryMuscle)?.label ?? 'Selecionar'
  const secondaryMuscleLabel = secondaryMuscle
    ? MUSCLE_OPTIONS.find((m) => m.value === secondaryMuscle)?.label ?? secondaryMuscle
    : 'Selecionar'
  const trackingLabel = TRACKING_OPTIONS.find((t) => t.value === trackingType)?.label ?? 'Selecionar'

  return createPortal(
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[85] flex bg-[var(--surface)] sm:items-center sm:justify-center sm:bg-black/55 sm:backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Criar exercício"
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="flex h-full w-full flex-col bg-[var(--surface)] sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl sm:border sm:border-[var(--line)] sm:shadow-2xl"
        >
          {/* Header: voltar / Título / Salvar */}
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3 pt-safe-plus-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Voltar"
              className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex min-w-0 flex-col items-center">
              <h2 className="text-[14px] font-bold text-[var(--text)]">Criar Exercício</h2>
              {counterLabel && (
                <span
                  className={`mt-0.5 text-[11px] font-semibold tabular-nums ${
                    atLimit ? 'text-rose-500' : 'text-[var(--muted)]'
                  }`}
                >
                  {counterLabel} criados
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (atLimit) {
                  setLimitDialogOpen(true)
                  return
                }
                void handleSave()
              }}
              disabled={!canSave && !atLimit}
              className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-[13px] font-bold text-white shadow-[0_4px_10px_-4px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </header>

          <div className="flex-1 overflow-y-auto">
            {/* Foto circular com botão de upload. Input file
                escondido — o label envolve a circle pra capturar o
                tap no thumb inteiro. */}
            <div className="flex flex-col items-center gap-2 py-6">
              <label className="grid h-24 w-24 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-[var(--line)] bg-[var(--surface-hover)] transition-colors hover:bg-[var(--surface)]">
                {photoDataUrl ? (
                  <img src={photoDataUrl} alt="Pré-visualização" className="h-full w-full object-cover" />
                ) : (
                  <Camera size={24} className="text-[var(--muted)]" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void handlePhotoChange(e)}
                />
              </label>
              <span className="text-[13px] font-medium text-[var(--brand)]">
                {photoDataUrl ? 'Trocar foto' : 'Adicionar foto'}
              </span>
            </div>

            {/* Nome */}
            <div className="border-t border-[var(--line)] px-4 py-3">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Nome do Exercício
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Supino Inclinado Custom"
                maxLength={120}
                className="mt-1 w-full bg-transparent text-[16px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
              />
            </div>

            {/* Equipamento */}
            <button
              type="button"
              onClick={() => setOpenPicker('equipment')}
              className="flex w-full items-center justify-between border-t border-[var(--line)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div>
                <p className="text-[14px] font-medium text-[var(--text)]">Equipamento</p>
                <p className={`mt-0.5 text-[13px] ${equipment ? 'text-[var(--text)]' : 'text-[var(--brand)]'}`}>
                  {equipmentLabel}
                </p>
              </div>
              <span className="text-[var(--muted)]" aria-hidden>›</span>
            </button>

            {/* Grupo Muscular Primário */}
            <button
              type="button"
              onClick={() => setOpenPicker('primary')}
              className="flex w-full items-center justify-between border-t border-[var(--line)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div>
                <p className="text-[14px] font-medium text-[var(--text)]">Grupo Muscular Primário</p>
                <p className={`mt-0.5 text-[13px] ${primaryMuscle ? 'text-[var(--text)]' : 'text-[var(--brand)]'}`}>
                  {primaryMuscleLabel}
                </p>
              </div>
              <span className="text-[var(--muted)]" aria-hidden>›</span>
            </button>

            {/* Outros Músculos */}
            <button
              type="button"
              onClick={() => setOpenPicker('secondary')}
              className="flex w-full items-center justify-between border-t border-[var(--line)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div>
                <p className="text-[14px] font-medium text-[var(--text)]">Outros Músculos</p>
                <p className={`mt-0.5 text-[13px] ${secondaryMuscle ? 'text-[var(--text)]' : 'text-[var(--brand)]'}`}>
                  {secondaryMuscleLabel}{' '}
                  <span className="text-[11px] text-[var(--muted)]">(opcional)</span>
                </p>
              </div>
              <span className="text-[var(--muted)]" aria-hidden>›</span>
            </button>

            {/* Tipo de Exercício */}
            <button
              type="button"
              onClick={() => setOpenPicker('tracking')}
              className="flex w-full items-center justify-between border-t border-b border-[var(--line)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div>
                <p className="text-[14px] font-medium text-[var(--text)]">Tipo de Exercício</p>
                <p className="mt-0.5 text-[13px] text-[var(--text)]">{trackingLabel}</p>
              </div>
              <span className="text-[var(--muted)]" aria-hidden>›</span>
            </button>

            {error && (
              <p className="m-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-center text-[12px] text-rose-500">
                {error}
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Pickers nested — renderizados aqui no Fragment pra ficarem por
          cima do modal principal via z-index maior. */}
      <OptionPickerSheet
        open={openPicker === 'equipment'}
        title="Equipamento"
        options={EQUIPMENT_OPTIONS.map((e) => ({ value: e, label: e }))}
        currentValue={equipment}
        onPick={(value) => setEquipment(value)}
        onClose={() => setOpenPicker(null)}
      />
      <OptionPickerSheet
        open={openPicker === 'primary'}
        title="Grupo Muscular Primário"
        options={MUSCLE_OPTIONS}
        currentValue={primaryMuscle}
        onPick={(value) => setPrimaryMuscle(value)}
        onClose={() => setOpenPicker(null)}
      />
      <OptionPickerSheet
        open={openPicker === 'secondary'}
        title="Outros Músculos"
        options={MUSCLE_OPTIONS.filter((m) => m.value !== primaryMuscle)}
        currentValue={secondaryMuscle}
        onPick={(value) => setSecondaryMuscle(value)}
        onClose={() => setOpenPicker(null)}
      />
      <OptionPickerSheet
        open={openPicker === 'tracking'}
        title="Tipo de Exercício"
        options={TRACKING_OPTIONS}
        currentValue={trackingType}
        onPick={(value) => value && setTrackingType(value as typeof trackingType)}
        onClose={() => setOpenPicker(null)}
      />

      {/* Limite do tier free atingido. Mensagem antecipa o plano Pro
          futuro (sem ETA) e oferece um caminho de ação claro: ir pra
          "Meus Exercícios" nas Configurações pra apagar algum. ConfirmDialog
          não-destructive (botão laranja brand) porque a CTA primária é
          construtiva, não perigosa. */}
      <ConfirmDialog
        open={limitDialogOpen}
        title="Limite de exercícios atingido"
        message={`Você já criou ${stats?.limit ?? 5} exercícios personalizados, o teto do plano gratuito. Em breve um plano Pro vai remover esse limite. Por enquanto, apague algum exercício antigo em "Meus Exercícios" pra liberar espaço.`}
        confirmLabel="Gerenciar exercícios"
        cancelLabel="Fechar"
        onConfirm={() => {
          setLimitDialogOpen(false)
          onClose()
          navigate('/settings?section=exercises')
        }}
        onCancel={() => setLimitDialogOpen(false)}
      />
    </>,
    document.body,
  )
}
