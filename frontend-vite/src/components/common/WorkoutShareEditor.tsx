import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'
import { X, Download, Share2, Image as ImageIcon, Type, Move } from 'lucide-react'
import logoUrl from '../../assets/Logo_sem_Fundo.png'
import type { SessionHighlights } from '../../services/workoutService'
import { optimizeImageFileToDataUrl } from '../../lib/image-processing'

type BlockId = 'logo' | 'volume' | 'tempo' | 'series' | 'record'

type Block = {
  id: BlockId
  label: string
  value: string
  enabled: boolean
  xPct: number // centro do bloco em % da largura
  yPct: number // centro do bloco em % da altura
  scale: number // multiplicador de tamanho
  isLogo?: boolean
}

const BG_GRADIENTS = [
  'linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
  'linear-gradient(160deg, #2b1055 0%, #7597de 100%)',
  'linear-gradient(160deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
  'linear-gradient(160deg, #ff5a3c 0%, #b91c1c 100%)',
]

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '—'
  const totalMin = Math.floor(sec / 60)
  const s = sec % 60
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60)
    return `${h}h ${totalMin % 60}min`
  }
  return s > 0 ? `${totalMin}min ${s}s` : `${totalMin}min`
}

function formatVolume(kg: number): string {
  // Milhar com ponto, decimal com vírgula (pt-BR).
  return `${kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`
}

function buildInitialBlocks(h: SessionHighlights): Block[] {
  const recordValue =
    h.records.length > 0
      ? `${h.records[0].exerciseName} ${h.records[0].weightKg}kg 🎉`
      : h.topSet
        ? `${h.topSet.exerciseName} ${h.topSet.weightKg}kg`
        : ''
  const recordLabel = h.records.length > 0 ? 'Novo Record' : 'Destaque'

  return [
    { id: 'logo', label: '', value: '', enabled: true, xPct: 50, yPct: 14, scale: 1, isLogo: true },
    { id: 'volume', label: 'Volume', value: formatVolume(h.volumeKg), enabled: true, xPct: 50, yPct: 36, scale: 1 },
    { id: 'tempo', label: 'Tempo', value: formatDuration(h.durationSec), enabled: true, xPct: 50, yPct: 54, scale: 1 },
    { id: 'series', label: 'Séries', value: String(h.totalSeries), enabled: false, xPct: 50, yPct: 70, scale: 1 },
    { id: 'record', label: recordLabel, value: recordValue, enabled: Boolean(recordValue), xPct: 50, yPct: 84, scale: 1 },
  ]
}

export function WorkoutShareEditor({
  highlights,
  initialPhoto = null,
  onClose,
}: {
  highlights: SessionHighlights
  initialPhoto?: string | null
  onClose: () => void
}) {
  const [blocks, setBlocks] = useState<Block[]>(() => buildInitialBlocks(highlights))
  const [textColor, setTextColor] = useState<'white' | 'black'>('white')
  const [bgType, setBgType] = useState<'photo' | 'gradient'>(initialPhoto ? 'photo' : 'gradient')
  const [bgPhoto, setBgPhoto] = useState<string | null>(initialPhoto)
  const [bgGradient, setBgGradient] = useState(BG_GRADIENTS[0])
  const [selectedId, setSelectedId] = useState<BlockId | null>(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ id: BlockId; startX: number; startY: number; origXPct: number; origYPct: number } | null>(null)

  // Drag por pointer events (mouse + touch).
  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragState.current
    const el = previewRef.current
    if (!drag || !el) return
    const rect = el.getBoundingClientRect()
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100
    const xPct = Math.min(98, Math.max(2, drag.origXPct + dxPct))
    const yPct = Math.min(98, Math.max(2, drag.origYPct + dyPct))
    setBlocks((prev) => prev.map((b) => (b.id === drag.id ? { ...b, xPct, yPct } : b)))
  }, [])

  const onPointerUp = useCallback(() => {
    dragState.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerMove])

  const startDrag = useCallback(
    (e: React.PointerEvent, block: Block) => {
      e.preventDefault()
      setSelectedId(block.id)
      dragState.current = {
        id: block.id,
        startX: e.clientX,
        startY: e.clientY,
        origXPct: block.xPct,
        origYPct: block.yPct,
      }
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [onPointerMove, onPointerUp],
  )

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  const toggleBlock = (id: BlockId) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)))

  const setBlockScale = (id: BlockId, scale: number) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, scale } : b)))

  const handlePhoto = async (file: File | null) => {
    if (!file) return
    setError(null)
    try {
      const dataUrl = await optimizeImageFileToDataUrl(file, { maxEdge: 1600, quality: 0.88 })
      setBgPhoto(dataUrl)
      setBgType('photo')
    } catch {
      setError('Não foi possível carregar a imagem')
    }
  }

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null

  const renderToBlob = useCallback(async (): Promise<Blob | null> => {
    const el = previewRef.current
    if (!el) return null
    // Escala para gerar ~1080px de largura na imagem final.
    const scale = Math.max(2, Math.round(1080 / el.offsetWidth))
    const canvas = await html2canvas(el, {
      backgroundColor: null,
      scale,
      useCORS: true,
      logging: false,
    })
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95))
  }, [])

  const handleDownload = async () => {
    setExporting(true)
    setError(null)
    try {
      const blob = await renderToBlob()
      if (!blob) throw new Error('Falha ao gerar imagem')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `serraathlo-treino-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Erro ao baixar a imagem')
    } finally {
      setExporting(false)
    }
  }

  const handleShare = async () => {
    setExporting(true)
    setError(null)
    try {
      const blob = await renderToBlob()
      if (!blob) throw new Error('Falha ao gerar imagem')
      const file = new File([blob], `serraathlo-treino-${Date.now()}.png`, { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Meu treino - SerraAthlo' })
      } else {
        // Fallback: baixa a imagem se o compartilhamento de arquivo não for suportado.
        await handleDownload()
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // usuário cancelou — silencioso
      } else {
        setError('Compartilhamento não suportado neste navegador — a imagem foi baixada')
      }
    } finally {
      setExporting(false)
    }
  }

  const previewBackground = useMemo(() => {
    if (bgType === 'photo' && bgPhoto) return undefined
    return bgGradient
  }, [bgType, bgPhoto, bgGradient])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-black/80 p-3 sm:p-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-white">Compartilhar treino</h3>
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20">
            <X size={18} />
          </button>
        </div>

        {/* PREVIEW 9:16 */}
        <div className="mx-auto w-full" style={{ maxWidth: 320 }}>
          <div
            ref={previewRef}
            className="relative w-full overflow-hidden rounded-2xl"
            style={{
              aspectRatio: '9 / 16',
              background: previewBackground,
              ...(bgType === 'photo' && bgPhoto
                ? { backgroundImage: `url(${bgPhoto})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : {}),
            }}
          >
            {/* leve overlay escuro pra texto destacar sobre foto */}
            {bgType === 'photo' && bgPhoto && (
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'rgba(0,0,0,0.28)' }} />
            )}

            {blocks.filter((b) => b.enabled).map((block) => (
              <div
                key={block.id}
                onPointerDown={(e) => startDrag(e, block)}
                className={`absolute cursor-move select-none touch-none ${selectedId === block.id ? 'ring-2 ring-[var(--brand)] ring-offset-1 ring-offset-transparent rounded-lg' : ''}`}
                style={{
                  left: `${block.xPct}%`,
                  top: `${block.yPct}%`,
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  color: textColor === 'white' ? '#fff' : '#111',
                  textShadow: textColor === 'white' ? '0 1px 6px rgba(0,0,0,0.5)' : '0 1px 4px rgba(255,255,255,0.4)',
                  maxWidth: '92%',
                }}
              >
                {block.isLogo ? (
                  <img
                    src={logoUrl}
                    alt="SerraAthlo"
                    draggable={false}
                    style={{ width: 90 * block.scale, height: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <>
                    <div style={{ fontSize: 13 * block.scale, fontWeight: 600, opacity: 0.92, lineHeight: 1.1 }}>
                      {block.label}
                    </div>
                    <div style={{ fontSize: 30 * block.scale, fontWeight: 800, lineHeight: 1.05 }}>{block.value}</div>
                  </>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-white/50">
            <Move size={11} className="mr-1 inline" />
            Arraste os textos para posicionar. Toque para selecionar e ajustar o tamanho.
          </p>
        </div>

        {/* CONTROLES */}
        <div className="mt-4 space-y-4 rounded-2xl bg-white/5 p-4">
          {/* Blocos toggle */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/60">Informações</p>
            <div className="flex flex-wrap gap-2">
              {blocks.filter((b) => !b.isLogo).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggleBlock(b.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${b.enabled ? 'bg-[var(--brand)] text-white' : 'bg-white/10 text-white/60'}`}
                >
                  {b.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => toggleBlock('logo')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${blocks.find((b) => b.id === 'logo')?.enabled ? 'bg-[var(--brand)] text-white' : 'bg-white/10 text-white/60'}`}
              >
                Logo
              </button>
            </div>
          </div>

          {/* Tamanho do bloco selecionado */}
          {selectedBlock && (
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/60">
                Tamanho · {selectedBlock.isLogo ? 'Logo' : selectedBlock.label}
              </p>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={selectedBlock.scale}
                onChange={(e) => setBlockScale(selectedBlock.id, parseFloat(e.target.value))}
                className="w-full accent-[var(--brand)]"
              />
            </div>
          )}

          {/* Cor do texto */}
          <div className="flex items-center gap-3">
            <Type size={15} className="text-white/60" />
            <button
              type="button"
              onClick={() => setTextColor('white')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${textColor === 'white' ? 'bg-[var(--brand)] text-white' : 'bg-white/10 text-white/60'}`}
            >
              Texto branco
            </button>
            <button
              type="button"
              onClick={() => setTextColor('black')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${textColor === 'black' ? 'bg-[var(--brand)] text-white' : 'bg-white/10 text-white/60'}`}
            >
              Texto preto
            </button>
          </div>

          {/* Fundo */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/60">Fundo</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20">
                <ImageIcon size={13} />
                Foto
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void handlePhoto(e.target.files?.[0] ?? null)} />
              </label>
              {BG_GRADIENTS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => { setBgGradient(g); setBgType('gradient') }}
                  className={`h-7 w-7 rounded-full border-2 ${bgType === 'gradient' && bgGradient === g ? 'border-[var(--brand)]' : 'border-white/20'}`}
                  style={{ background: g }}
                  aria-label="Fundo gradiente"
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={exporting}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              <Share2 size={16} />
              {exporting ? 'Gerando…' : 'Compartilhar'}
            </button>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={exporting}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Download size={16} />
              Baixar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
