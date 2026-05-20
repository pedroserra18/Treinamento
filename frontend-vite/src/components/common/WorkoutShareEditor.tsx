import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import html2canvas from 'html2canvas'
import { X, Download, Share2, Image as ImageIcon, Type, Move, RefreshCw } from 'lucide-react'
import logoUrl from '../../assets/Logo_sem_Fundo.png'
import type { SessionHighlights } from '../../services/workoutService'
import { optimizeImageFileToDataUrl } from '../../lib/image-processing'

type BlockId = string // 'logo' | 'volume' | 'tempo' | 'series' | 'record-0'...

type Block = {
  id: BlockId
  label: string // texto exibido na imagem (ex: "Volume", "Novo Recorde")
  value: string
  enabled: boolean
  isLogo?: boolean
  isRecord?: boolean
  recordName?: string // nome do exercício (1 linha)
  recordWeight?: string // peso (1 linha) — record = nome + peso = 2 linhas
  toggleLabel?: string // texto curto no botão de toggle (ex: nome do exercício)
}

function truncateName(name: string, max = 22): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name
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
  return `${kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`
}

function buildInitialBlocks(h: SessionHighlights): Block[] {
  const blocks: Block[] = [
    { id: 'logo', label: '', value: '', enabled: true, isLogo: true },
    { id: 'volume', label: 'Volume', value: formatVolume(h.volumeKg), enabled: true },
    { id: 'tempo', label: 'Tempo', value: formatDuration(h.durationSec), enabled: true },
    { id: 'series', label: 'Séries', value: String(h.totalSeries), enabled: false },
  ]

  // Só mostra recordes se houver PR real (sem "Destaque" de fallback).
  // Cada recorde (até 3) é um bloco PRÓPRIO — toggle individual, exibido
  // lado a lado como "Novo Recorde" + valor abaixo.
  h.records.slice(0, 3).forEach((r, i) => {
    blocks.push({
      id: `record-${i}`,
      label: 'Novo Recorde 🎉',
      value: `${r.exerciseName} ${r.weightKg}kg`,
      enabled: true,
      isRecord: true,
      // Nome COMPLETO (sem corte) — o auto-ajuste de tamanho garante que cabe.
      recordName: r.exerciseName,
      recordWeight: `${r.weightKg}kg`,
      toggleLabel: truncateName(r.exerciseName, 14),
    })
  })

  return blocks
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
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Posição e tamanho do GRUPO inteiro de informações (move tudo junto, mantendo
  // a mesma diagramação entre treinos de usuários diferentes — igual ao Strava).
  const [groupX, setGroupX] = useState(50)
  const [groupY, setGroupY] = useState(48)
  const [groupScale, setGroupScale] = useState(1)
  // Escala máxima que ainda cabe na imagem (calculada dinamicamente).
  const [maxScale, setMaxScale] = useState(1.6)
  const autoFitRef = useRef(false)

  const previewRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  // Mantém o grupo SEMPRE dentro da foto: clampa o centro considerando a
  // largura/altura reais do grupo (já com a escala aplicada).
  const clampPosition = useCallback((x: number, y: number): { x: number; y: number } => {
    const el = previewRef.current
    const groupEl = groupRef.current
    if (!el || !groupEl) return { x, y }
    const rect = el.getBoundingClientRect()
    const g = groupEl.getBoundingClientRect()
    const halfW = (g.width / 2 / rect.width) * 100
    const halfH = (g.height / 2 / rect.height) * 100
    const cx = halfW >= 50 ? 50 : Math.min(100 - halfW, Math.max(halfW, x))
    const cy = halfH >= 50 ? 50 : Math.min(100 - halfH, Math.max(halfH, y))
    return { x: cx, y: cy }
  }, [])

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragState.current
    const el = previewRef.current
    if (!drag || !el) return
    const rect = el.getBoundingClientRect()
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100
    const { x, y } = clampPosition(drag.origX + dxPct, drag.origY + dyPct)
    setGroupX(x)
    setGroupY(y)
  }, [clampPosition])

  // Calcula a escala máxima que cabe na imagem + re-clampa posição. Faz
  // auto-fit do tamanho inicial (começa no tamanho que cabe tudo, sem corte).
  useLayoutEffect(() => {
    const el = previewRef.current
    const g = groupRef.current
    if (!el || !g) return

    const cw = el.clientWidth
    const ch = el.clientHeight
    const rect = g.getBoundingClientRect()
    // Tamanho "natural" (escala 1) é invariante: rect já tem a escala aplicada.
    const naturalW = rect.width / groupScale
    const naturalH = rect.height / groupScale
    if (naturalW > 0 && naturalH > 0) {
      const fit = Math.min((cw * 0.96) / naturalW, (ch * 0.96) / naturalH)
      const cappedMax = Math.max(0.4, Math.min(2.2, fit))
      setMaxScale(cappedMax)

      // Auto-fit uma vez ao abrir: começa no tamanho que cabe tudo.
      if (!autoFitRef.current) {
        autoFitRef.current = true
        setGroupScale(cappedMax)
      } else if (groupScale > cappedMax) {
        // Nunca deixa passar do limite da imagem.
        setGroupScale(cappedMax)
      }
    }

    const { x, y } = clampPosition(groupX, groupY)
    if (x !== groupX) setGroupX(x)
    if (y !== groupY) setGroupY(y)
  }, [groupScale, blocks, groupX, groupY, clampPosition])

  const onPointerUp = useCallback(() => {
    dragState.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerMove])

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      dragState.current = { startX: e.clientX, startY: e.clientY, origX: groupX, origY: groupY }
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [groupX, groupY, onPointerMove, onPointerUp],
  )

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [onPointerMove, onPointerUp])

  const toggleBlock = (id: BlockId) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)))

  const handlePhotoUpload = async (file: File | null) => {
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

  // Botão "Foto": volta o fundo para a foto do usuário. Se ainda não há foto
  // carregada, abre o seletor de arquivo.
  const handleFotoButton = () => {
    if (bgPhoto) {
      setBgType('photo')
    } else {
      fileInputRef.current?.click()
    }
  }

  const renderToBlob = useCallback(async (): Promise<Blob | null> => {
    const el = previewRef.current
    if (!el) return null
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

  const logoEnabled = blocks.find((b) => b.isLogo)?.enabled ?? true
  const statBlocks = blocks.filter((b) => !b.isLogo && b.enabled)

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
            {bgType === 'photo' && bgPhoto && (
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'rgba(0,0,0,0.28)' }} />
            )}

            {/* GRUPO único — logo em cima, stats lado a lado. Arrasta/escala junto. */}
            <div
              ref={groupRef}
              onPointerDown={startDrag}
              className="absolute flex cursor-move select-none touch-none flex-col items-center gap-3"
              style={{
                left: `${groupX}%`,
                top: `${groupY}%`,
                transform: `translate(-50%, -50%) scale(${groupScale})`,
                transformOrigin: 'center center',
                width: 'max-content',
                maxWidth: '97%',
                color: textColor === 'white' ? '#fff' : '#111',
                textShadow: textColor === 'white' ? '0 1px 6px rgba(0,0,0,0.5)' : '0 1px 4px rgba(255,255,255,0.4)',
              }}
            >
              {logoEnabled && (
                <img src={logoUrl} alt="SerraAthlo" draggable={false} style={{ width: 140, height: 'auto', objectFit: 'contain' }} />
              )}
              {/* flex-wrap = responsivo: blocos ficam lado a lado, mas quando
                  não cabem na largura da foto, sobem para outra linha (em vez de
                  espremer e quebrar o texto em muitas linhas). Largura FIXA por
                  coluna garante que cada record fique em no máx. 2 linhas. */}
              <div className="flex flex-row flex-wrap items-start justify-center gap-x-2 gap-y-3">
                {statBlocks.map((block) =>
                  block.isRecord ? (
                    <div key={block.id} className="text-center" style={{ width: 94 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.92, lineHeight: 1.1 }}>{block.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.12, marginTop: 2 }}>{block.recordName}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>{block.recordWeight}</div>
                    </div>
                  ) : (
                    <div key={block.id} className="text-center" style={{ width: 90 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.92, lineHeight: 1.1 }}>{block.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, marginTop: 2 }}>{block.value}</div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-white/50">
            <Move size={11} className="mr-1 inline" />
            Arraste o bloco de informações para posicionar. Tudo move junto.
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
                  {b.toggleLabel ?? b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tamanho do grupo inteiro */}
          <div>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-white/60">Tamanho das informações</p>
            <input
              type="range"
              min={0.35}
              max={maxScale}
              step={0.05}
              value={Math.min(groupScale, maxScale)}
              onChange={(e) => setGroupScale(Math.min(parseFloat(e.target.value), maxScale))}
              className="w-full accent-[var(--brand)]"
            />
          </div>

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
              {/* Foto: volta para a foto do usuário (ou abre seletor se não houver) */}
              <button
                type="button"
                onClick={handleFotoButton}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${bgType === 'photo' && bgPhoto ? 'bg-[var(--brand)] text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
              >
                <ImageIcon size={13} />
                Foto
              </button>
              {/* Trocar foto (só aparece quando já existe foto) */}
              {bgPhoto && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                >
                  <RefreshCw size={12} />
                  Trocar
                </button>
              )}
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handlePhotoUpload(e.target.files?.[0] ?? null)}
              />
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
