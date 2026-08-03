import { type Dispatch, type SetStateAction } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Image as ImageIcon, Plus, Trash2 } from 'lucide-react'
import type { BodyMeasurement } from '../../types/progress'
import { formatDateTime } from './progress-utils'
import { BodyMetricChart } from './charts'
import { MeasRow, FormField, UnitInput } from './measurements'

// Formulário de novo registro corporal (todos os campos como string editável).
type MeasurementForm = {
  date: string
  weight: string; chest: string; shoulders: string; arms: string; forearms: string
  waist: string; hips: string; thighs: string; calves: string; neck: string
  bmi: string; bodyFatPercentage: string
}

// Aba "Corpo" da ProgressPage: gráficos (peso/IMC/BF), lista de medidas com
// delta vs 30 dias, formulário colapsável de novo registro (foto + medidas),
// linha do tempo de fotos e histórico corporal. Extraída verbatim; estado e
// handlers ficam na ProgressPage (props). Os modais (viewer/detalhes/galeria)
// continuam na página, no nível da section — a aba só seta o estado deles.
export function ProgressBodyTab({
  measurements, loading, measurementsOldFirst, measurementsNewFirst, latestMeasurement,
  showAddForm, setShowAddForm, showMoreMeasures, setShowMoreMeasures,
  form, setForm, measurementPhotoPreview, measurementPhotoFile, savingMeasurement, deletingMeasurementId,
  setSelectedPhoto, setSelectedMeasurement, setGalleryMode,
  measureDelta, handleMeasurementPhotoFile, handleSaveMeasurement, handleDeleteMeasurement,
}: {
  measurements: BodyMeasurement[]
  loading: boolean
  measurementsOldFirst: BodyMeasurement[]
  measurementsNewFirst: BodyMeasurement[]
  latestMeasurement: BodyMeasurement | null
  showAddForm: boolean
  setShowAddForm: Dispatch<SetStateAction<boolean>>
  showMoreMeasures: boolean
  setShowMoreMeasures: Dispatch<SetStateAction<boolean>>
  form: MeasurementForm
  setForm: Dispatch<SetStateAction<MeasurementForm>>
  measurementPhotoPreview: string | null
  measurementPhotoFile: File | null
  savingMeasurement: boolean
  deletingMeasurementId: string | null
  setSelectedPhoto: Dispatch<SetStateAction<{ url: string; date: string } | null>>
  setSelectedMeasurement: Dispatch<SetStateAction<BodyMeasurement | null>>
  setGalleryMode: Dispatch<SetStateAction<'closed' | 'grid' | 'compare'>>
  measureDelta: (key: keyof BodyMeasurement) => { current: number | null; delta: number | null }
  handleMeasurementPhotoFile: (file: File | null) => void
  handleSaveMeasurement: () => Promise<void>
  handleDeleteMeasurement: (measurementId: string) => Promise<void>
}) {
  return (
    <div className="space-y-3">
      {measurements.length === 0 && !loading ? (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-10"
        >
          <div className="mx-auto max-w-md text-center">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--brand)]/15 text-[var(--brand-strong)]">
              <ImageIcon size={22} />
            </span>
            <h3 className="text-base font-bold text-[var(--text)]">Comece sua linha do tempo corporal</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
              Tire uma foto periódica e registre peso/medidas. Em 4–8 semanas você consegue ver a evolução visualmente e comparar fotos lado a lado.
            </p>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-[13px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] hover:bg-[var(--brand-strong)]"
            >
              <Plus size={13} />
              Registrar primeira foto
            </button>
          </div>
        </motion.section>
      ) : null}

      {measurements.length > 0 && (
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1.1fr_0.9fr]">
        <BodyMetricChart
          measurements={measurementsOldFirst}
          field="weight"
          label="Peso corporal"
          unit="kg"
          gradientId="bodyWeightGrad"
          delay={0.08}
        />

        {/* Measurements list */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-[var(--text)]">Medidas</h3>
            <span className="text-[11px] font-medium text-[var(--muted)]">
              vs. 30 dias
            </span>
          </div>

          {!latestMeasurement && (
            <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3 py-6 text-center text-[12px] text-[var(--muted)]">
              Nenhuma medida registrada ainda.
            </p>
          )}

          {latestMeasurement && (
            <div className="grid gap-2">
              {([
                ['chest', 'Peito'],
                ['waist', 'Cintura'],
                ['arms', 'Braços'],
                ['thighs', 'Coxas'],
              ] as Array<[keyof BodyMeasurement, string]>).map(([k, label]) => {
                const { current, delta } = measureDelta(k)
                if (current == null) return null
                return <MeasRow key={k} label={label} value={current} unit="cm" delta={delta} />
              })}
              <button
                type="button"
                onClick={() => setShowAddForm((v) => !v)}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--line)] bg-transparent px-3 py-2.5 font-mono text-[11px] font-semibold tracking-wider text-[var(--muted)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 hover:text-[var(--brand-strong)]"
              >
                <Plus size={12} />
                {showAddForm ? 'Fechar' : 'Adicionar registro'}
              </button>
            </div>
          )}
        </motion.section>
      </div>
      )}

      {/* IMC + BF % charts — only render if the user has at least one
          record with the metric (the chart itself shows a hint otherwise). */}
      {(measurementsOldFirst.some((m) => m.bmi != null) ||
        measurementsOldFirst.some((m) => m.bodyFatPercentage != null)) && (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {measurementsOldFirst.some((m) => m.bmi != null) && (
            <BodyMetricChart
              measurements={measurementsOldFirst}
              field="bmi"
              label="IMC"
              unit=""
              gradientId="bodyBmiGrad"
              delay={0.12}
            />
          )}
          {measurementsOldFirst.some((m) => m.bodyFatPercentage != null) && (
            <BodyMetricChart
              measurements={measurementsOldFirst}
              field="bodyFatPercentage"
              label="Body Fat"
              unit="%"
              gradientId="bodyBfGrad"
              delay={0.14}
            />
          )}
        </div>
      )}

      {/* Add measurement form (collapsible) */}
      <AnimatePresence initial={false}>
        {showAddForm && (
          <motion.section
            key="add-form"
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 6, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5">
              <h3 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Novo registro corporal</h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <FormField label="Data">
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((c) => ({ ...c, date: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm"
                  />
                </FormField>
                <UnitInput
                  label="Peso *"
                  value={form.weight}
                  unit="kg"
                  onChange={(next) => setForm((c) => ({ ...c, weight: next }))}
                />
                <FormField label="Foto *">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleMeasurementPhotoFile(e.target.files?.[0] ?? null)}
                    className="w-full rounded-lg border border-[var(--line)] bg-transparent px-2.5 py-1.5 text-sm"
                  />
                </FormField>
              </div>

              {measurementPhotoPreview && (
                <button
                  type="button"
                  onClick={() => setSelectedPhoto({ url: measurementPhotoPreview, date: `${form.date}T00:00:00.000Z` })}
                  className="mx-auto mt-3 block w-full max-w-[18rem] rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                >
                  <img
                    src={measurementPhotoPreview}
                    alt="Preview"
                    className="w-full rounded-lg border border-[var(--line)] object-cover"
                    style={{ aspectRatio: '4 / 5', maxHeight: '20rem' }}
                  />
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowMoreMeasures((v) => !v)}
                className="mt-3 inline-flex h-8 items-center rounded-lg border border-[var(--line)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                {showMoreMeasures ? 'Ocultar medidas opcionais' : 'Adicionar mais medidas'}
              </button>

              {showMoreMeasures && (
                <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                  {([
                    ['chest', 'Peitoral', 'cm'], ['shoulders', 'Ombros', 'cm'], ['arms', 'Braços', 'cm'],
                    ['forearms', 'Antebraços', 'cm'], ['waist', 'Cintura', 'cm'], ['hips', 'Quadril', 'cm'],
                    ['thighs', 'Coxas', 'cm'], ['calves', 'Panturrilhas', 'cm'], ['neck', 'Pescoço', 'cm'],
                    ['bmi', 'IMC', ''], ['bodyFatPercentage', 'BF', '%'],
                  ] as Array<[keyof typeof form, string, string]>).map(([field, label, unit]) => (
                    <UnitInput
                      key={field}
                      label={label}
                      value={form[field]}
                      unit={unit}
                      onChange={(next) => setForm((c) => ({ ...c, [field]: next }))}
                    />
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={savingMeasurement || !measurementPhotoFile || !form.weight.trim()}
                onClick={() => void handleSaveMeasurement()}
                className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--brand)] bg-[var(--brand)] px-4 text-[13px] font-medium text-white shadow-[0_8px_16px_-10px_rgba(255,90,60,0.55)] transition-colors hover:bg-[var(--brand-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingMeasurement ? 'Salvando…' : 'Salvar registro'}
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Photo timeline */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.14 }}
        className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-[var(--text)]">Linha do tempo de fotos</h3>
          <div className="flex items-center gap-2">
            {measurements.length >= 2 && (
              <button
                type="button"
                onClick={() => setGalleryMode('compare')}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface)]"
              >
                Comparar
              </button>
            )}
            {measurements.length > 3 && (
              <button
                type="button"
                onClick={() => setGalleryMode('grid')}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface)]"
              >
                Ver todas
              </button>
            )}
            <span className="text-[11px] font-medium text-[var(--muted)]">
              {measurements.length} {measurements.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {measurementsNewFirst.slice(0, 3).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedPhoto({ url: m.photoUrl, date: m.date })}
              className="group relative aspect-[3/4] overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--surface-hover)] transition-transform hover:-translate-y-0.5"
            >
              <img
                src={m.photoUrl}
                alt={`Foto corporal em ${formatDateTime(m.date)}`}
                className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
              />
              <span
                className="absolute left-1.5 top-1.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 py-[2px] font-mono text-[9.5px] font-semibold text-[var(--text)]"
              >
                {new Date(m.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', '')}
              </span>
            </button>
          ))}
          {measurements.length < 3 && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="grid aspect-[3/4] place-items-center rounded-[10px] border border-dashed border-[var(--line)] bg-[var(--surface-hover)] font-mono text-[10.5px] text-[var(--muted)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 hover:text-[var(--brand-strong)]"
            >
              <span className="flex flex-col items-center gap-1.5">
                <ImageIcon size={18} />
                Adicionar foto
              </span>
            </button>
          )}
        </div>
      </motion.section>

      {/* Full history list (kept simpler — clickable cards for delete/details) */}
      {measurements.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18 }}
          className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <h3 className="mb-3 text-[14px] font-semibold text-[var(--text)]">Histórico corporal</h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {measurementsNewFirst.map((m) => (
              <article key={m.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] p-3">
                <button
                  type="button"
                  onClick={() => setSelectedPhoto({ url: m.photoUrl, date: m.date })}
                  className="block w-full"
                >
                  <img
                    src={m.photoUrl}
                    alt={`Foto corporal em ${formatDateTime(m.date)}`}
                    className="w-full rounded-lg object-cover transition-transform hover:scale-[1.01]"
                    style={{ aspectRatio: '4 / 5', maxHeight: '20rem' }}
                  />
                </button>
                <p className="mt-2 font-mono text-[11px] font-semibold text-[var(--text)]">{formatDateTime(m.date)}</p>
                <div className="mt-1 grid gap-x-3 gap-y-0.5 font-mono text-[11px] text-[var(--muted)] sm:grid-cols-2">
                  <p>Peso: <b className="text-[var(--text)]">{m.weight}</b> kg</p>
                  <p>IMC: <b className="text-[var(--text)]">{m.bmi ?? '—'}</b></p>
                  <p>BF: <b className="text-[var(--text)]">{m.bodyFatPercentage != null ? `${m.bodyFatPercentage}%` : '—'}</b></p>
                  <p>Cintura: <b className="text-[var(--text)]">{m.waist ?? '—'}</b></p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMeasurement(m)}
                    className="inline-flex h-8 items-center rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-[12px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    Ver detalhes
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteMeasurement(m.id)}
                    disabled={deletingMeasurementId === m.id}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/40 bg-transparent px-3 text-[12px] font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <Trash2 size={11} />
                    {deletingMeasurementId === m.id ? 'Excluindo…' : 'Excluir'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  )
}
