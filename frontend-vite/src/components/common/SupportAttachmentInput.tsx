import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { optimizeImageFileToDataUrl } from '../../lib/image-processing'

const MAX_ATTACHMENTS = 3

// Seletor de imagens para tickets de suporte: lê o arquivo, otimiza/comprime
// para um data URL base64 (mesmo padrão do avatar) e devolve a lista. O backend
// já aceita data:image base64 (até 5MB cada, máx 3).
export function SupportAttachmentInput({
  attachments,
  onChange,
  disabled,
}: {
  attachments: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    const room = MAX_ATTACHMENTS - attachments.length
    if (room <= 0) {
      setError(`Máximo de ${MAX_ATTACHMENTS} imagens.`)
      return
    }
    setProcessing(true)
    try {
      const picked = Array.from(files).slice(0, room)
      const optimized = await Promise.all(
        picked.map((f) => optimizeImageFileToDataUrl(f, { maxEdge: 1400, maxOutputBytes: 1_800_000 })),
      )
      onChange([...attachments, ...optimized])
    } catch {
      setError('Não foi possível processar a imagem.')
    } finally {
      setProcessing(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = (idx: number) => onChange(attachments.filter((_, i) => i !== idx))
  const full = attachments.length >= MAX_ATTACHMENTS

  return (
    <div className="space-y-2">
      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.map((src, idx) => (
            <div key={idx} className="relative h-16 w-16 overflow-hidden rounded-lg border border-[var(--line)]">
              <img src={src} alt={`Anexo ${idx + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={disabled}
                className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="Remover anexo"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || processing || full}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition-colors hover:border-[var(--brand)]/40 hover:text-[var(--text)] disabled:opacity-40"
      >
        <ImagePlus size={14} />
        {processing ? 'Processando…' : full ? 'Limite de imagens' : 'Anexar imagem'}
      </button>
      {error ? <p className="text-[11px] text-red-500">{error}</p> : null}
    </div>
  )
}
