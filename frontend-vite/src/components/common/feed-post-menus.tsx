import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Globe2, Users, Lock, MoreHorizontal, Check, Link2, Flag, Trash2, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { reportPost, type PostPrivacy, type ReportReason } from '../../services/socialService'

// Menu "..." de opções do post + diálogo de denúncia, extraídos do
// FeedPostCard. Ambos self-contained (portais, sem dependência de outros
// subcomponentes do card).

// ─── Privacy menu ──────────────────────────────────────────────────────────

const PRIVACY_OPTIONS: { value: PostPrivacy; label: string; icon: typeof Globe2 }[] = [
  { value: 'PUBLIC', label: 'Público', icon: Globe2 },
  { value: 'FRIENDS', label: 'Amigos', icon: Users },
  { value: 'PRIVATE', label: 'Privado', icon: Lock },
]

// Menu "..." de opções do post (estilo Instagram/Strava). Agrupa as ações
// que antes ficavam soltas no header (privacidade, deletar) + "Copiar link".
// Renderizado via portal com posição `fixed` pra NUNCA ser cortado pelo
// `overflow-hidden` do card. Fecha em: clique-fora, Esc e scroll.
export function PostMenu({
  postId, isOwner, canDelete, canReport, privacy, ownerIsPrivate, savingPrivacy, onPrivacyChange, onDelete, onReport,
}: {
  postId: string
  isOwner: boolean
  canDelete: boolean
  canReport: boolean
  privacy: PostPrivacy
  ownerIsPrivate: boolean
  savingPrivacy: boolean
  onPrivacyChange: (next: PostPrivacy) => void
  onDelete: () => void
  onReport: () => void
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }, [])

  // Posição é calculada no clique (abaixo), não aqui — evita setState dentro do
  // effect. Este effect só reposiciona no resize e fecha no scroll (menu fixed
  // não acompanha a rolagem do feed — fechar é o comportamento esperado).
  useLayoutEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', close, true)
    }
  }, [open, place])

  const toggle = () => {
    if (open) { setOpen(false); return }
    place()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const allowedPrivacy = ownerIsPrivate ? PRIVACY_OPTIONS.filter((o) => o.value !== 'PUBLIC') : PRIVACY_OPTIONS

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/post/${postId}`)
      setCopied(true)
      window.setTimeout(() => { setCopied(false); setOpen(false) }, 1100)
    } catch {
      setOpen(false)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mais opções"
        className="inline-flex items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-hover)] px-2.5 py-1.5 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-52 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        >
          <button
            role="menuitem"
            type="button"
            onClick={() => void copyLink()}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            {copied ? <Check size={15} className="text-[var(--brand)]" /> : <Link2 size={15} />}
            {copied ? 'Copiado!' : 'Copiar link'}
          </button>

          {canReport && (
            <>
              <div className="border-t border-[var(--line)]" />
              <button
                role="menuitem"
                type="button"
                onClick={() => { setOpen(false); onReport() }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)]"
              >
                <Flag size={15} />
                Denunciar
              </button>
            </>
          )}

          {isOwner && (
            <>
              <div className="border-t border-[var(--line)]" />
              <p className="px-3.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                Privacidade
              </p>
              {allowedPrivacy.map((opt) => {
                const OptIcon = opt.icon
                const active = opt.value === privacy
                return (
                  <button
                    key={opt.value}
                    role="menuitemradio"
                    aria-checked={active}
                    type="button"
                    disabled={savingPrivacy}
                    onClick={() => { if (!active) onPrivacyChange(opt.value); setOpen(false) }}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors disabled:opacity-50 ${
                      active ? 'text-[var(--brand)]' : 'text-[var(--text)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <OptIcon size={15} />
                    <span className="flex-1">{opt.label}</span>
                    {active && <Check size={15} />}
                  </button>
                )
              })}
            </>
          )}

          {canDelete && (
            <>
              <div className="border-t border-[var(--line)]" />
              <button
                role="menuitem"
                type="button"
                onClick={() => { setOpen(false); onDelete() }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
              >
                <Trash2 size={15} />
                {isOwner ? 'Deletar' : 'Remover'}
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

// ─── Report dialog ─────────────────────────────────────────────────────────

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'SPAM', label: 'Spam ou enganoso' },
  { value: 'HARASSMENT', label: 'Assédio ou bullying' },
  { value: 'INAPPROPRIATE', label: 'Conteúdo impróprio' },
  { value: 'VIOLENCE', label: 'Violência' },
  { value: 'MISINFORMATION', label: 'Informação falsa' },
  { value: 'OTHER', label: 'Outro' },
]

// Diálogo de denúncia. Montado só quando aberto (o parent faz `{open && ...}`),
// então o estado nasce limpo a cada abertura — sem reset via effect.
export function ReportDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { authorizedFetch } = useAuth()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<null | 'sent' | 'already'>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async () => {
    if (!reason || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await reportPost(authorizedFetch, postId, reason, details)
      setDone(res.alreadyReported ? 'already' : 'sent')
      window.setTimeout(onClose, 1600)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar denúncia')
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl sm:rounded-2xl"
      >
        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--brand)]/15 text-[var(--brand)]">
              <Check size={24} />
            </div>
            <p className="text-base font-bold text-[var(--text)]">
              {done === 'already' ? 'Você já tinha denunciado' : 'Denúncia enviada'}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">Obrigado. Nossa equipe vai analisar.</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--text)]">Denunciar post</h3>
              <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]">
                <X size={18} />
              </button>
            </div>
            <p className="mb-3 text-sm text-[var(--muted)]">Por que você está denunciando?</p>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors ${
                    reason === r.value
                      ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--text)]'
                      : 'border-[var(--line)] text-[var(--text)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {r.label}
                  {reason === r.value && <Check size={16} className="text-[var(--brand)]" />}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              placeholder="Detalhes (opcional)"
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--surface-hover)] px-3.5 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--brand)] focus:outline-none"
            />
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-[var(--line)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!reason || submitting}
                onClick={() => void submit()}
                className="flex-1 rounded-full bg-red-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {submitting ? 'Enviando...' : 'Enviar denúncia'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
