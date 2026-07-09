import { Image as ImageIcon, Pencil, Camera, X } from 'lucide-react'

type SummaryPhotoPickerProps = {
  summaryImagePreview: string | null
  onSelectImage: (file: File | null) => void
}

// Foto do treino — círculo destacado no estilo do feed. Vazio mostra um ícone
// de galeria; com foto vira a imagem do usuário (preview de como vai ficar salva
// no feed e no histórico). Estado vive no pai; recebe o preview + o callback.
export function SummaryPhotoPicker({ summaryImagePreview, onSelectImage }: SummaryPhotoPickerProps) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--surface-hover)]/40 p-4">
      <label className="group relative cursor-pointer" style={{ touchAction: 'manipulation' }}>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => onSelectImage(event.target.files?.[0] ?? null)}
          className="hidden"
        />
        <span className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2 border-[var(--line)] bg-[var(--surface)] transition-colors group-hover:border-[var(--brand)]/60">
          {summaryImagePreview ? (
            <img src={summaryImagePreview} alt="Foto do treino" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={30} className="text-[var(--muted)]" />
          )}
        </span>
        {/* Selo de ação no canto (estilo "editar foto"): câmera quando vazio,
            lápis quando já há foto. */}
        <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--surface)] bg-[var(--brand)] text-white shadow-[0_4px_10px_-4px_rgba(255,90,60,0.6)]">
          {summaryImagePreview ? <Pencil size={13} /> : <Camera size={14} />}
        </span>
      </label>
      <div className="text-center">
        <p className="text-[13px] font-bold text-[var(--text)]">
          {summaryImagePreview ? 'Trocar foto' : 'Adicionar foto'}
        </p>
        <p className="text-[11px] text-[var(--muted)]">Aparece no feed e no histórico (opcional)</p>
      </div>
      {summaryImagePreview && (
        <button
          type="button"
          onClick={() => onSelectImage(null)}
          style={{ touchAction: 'manipulation' }}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600"
        >
          <X size={13} />
          Remover foto
        </button>
      )}
    </div>
  )
}
