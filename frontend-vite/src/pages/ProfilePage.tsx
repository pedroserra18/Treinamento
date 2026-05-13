import { motion, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useScrollLock } from '../hooks/useScrollLock'
import { CountUp } from '../components/common/CountUp'
import { ImageViewer } from '../components/common/ImageViewer'
import { updateAvatar, updatePrivacy, getFollowers, getFollowing, type UserSearchResult } from '../services/socialService'
import { sanitiseHandleInput, validateHandle } from '../lib/handle'
import { Check, Pencil, X } from 'lucide-react'

type SocialPanel = 'followers' | 'following' | null

function UserListModal({ title, users, onClose, onNavigate }: {
  title: string
  users: UserSearchResult[]
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.2 }}
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        style={{ maxHeight: 'min(80vh, 560px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
          <h3 className="text-base font-extrabold text-[var(--text)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted)] text-lg leading-none px-1"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-[var(--line)] overscroll-contain">
          {users.length === 0 && (
            <p className="px-4 py-6 text-sm text-center text-[var(--muted)]">Nenhum usuário aqui ainda.</p>
          )}
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onClose(); onNavigate(u.id) }}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors"
            >
              <div className="h-9 w-9 shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-hover)] overflow-hidden">
                {u.avatarUrl
                  ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                  : <span className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--muted)]">{(u.name ?? '?')[0]?.toUpperCase()}</span>
                }
              </div>
              <span className="text-sm font-semibold text-[var(--text)] truncate">{u.name ?? 'Usuário'}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}

export function ProfilePage() {
  const { user, logout, authorizedFetch, refreshUser, applyUserPatch, updateHandle } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl ?? null)
  const [avatarDirty, setAvatarDirty] = useState(false)

  useEffect(() => {
    if (!avatarDirty) setAvatarPreview(user?.avatarUrl ?? null)
  }, [user?.avatarUrl, avatarDirty])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPrivate, setIsPrivate] = useState(user?.isPrivate ?? false)
  const [showFollowLists, setShowFollowLists] = useState(user?.showFollowLists ?? true)
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [privacyNotice, setPrivacyNotice] = useState<string | null>(null)

  const [followers, setFollowers] = useState<UserSearchResult[]>([])
  const [following, setFollowing] = useState<UserSearchResult[]>([])
  const [socialLoaded, setSocialLoaded] = useState(false)
  const [openPanel, setOpenPanel] = useState<SocialPanel>(null)
  const [viewerOpen, setViewerOpen] = useState(false)

  // Handle editor — collapsed by default; opens to a controlled input with
  // the same live-validation rules used at signup.
  const [handleEditing, setHandleEditing] = useState(false)
  const [handleDraft, setHandleDraft] = useState(user?.handle ?? '')
  const [handleSaving, setHandleSaving] = useState(false)
  const [handleError, setHandleError] = useState<string | null>(null)
  const [handleSuccess, setHandleSuccess] = useState(false)
  // Live format check (null = valid). Server may still reject for `409` —
  // that error is surfaced separately via `handleError`.
  const handleFormatError = validateHandle(handleDraft)
  const handleChanged = handleDraft.trim().toLowerCase() !== (user?.handle ?? '')

  const handleStartEditingHandle = () => {
    setHandleDraft(user?.handle ?? '')
    setHandleError(null)
    setHandleSuccess(false)
    setHandleEditing(true)
  }

  const handleCancelEditingHandle = () => {
    setHandleEditing(false)
    setHandleError(null)
    setHandleDraft(user?.handle ?? '')
  }

  const handleSaveHandle = async () => {
    const next = handleDraft.trim().toLowerCase()
    if (!next || handleFormatError || !handleChanged) return
    setHandleSaving(true)
    setHandleError(null)
    try {
      await updateHandle(next)
      setHandleEditing(false)
      setHandleSuccess(true)
      setTimeout(() => setHandleSuccess(false), 3000)
    } catch (err) {
      // Most common error: 409 HANDLE_ALREADY_IN_USE — show inline.
      setHandleError(err instanceof Error ? err.message : 'Erro ao salvar handle')
    } finally {
      setHandleSaving(false)
    }
  }

  const loadSocial = useCallback(async () => {
    try {
      const [f1, f2] = await Promise.all([getFollowers(authorizedFetch), getFollowing(authorizedFetch)])
      setFollowers(f1)
      setFollowing(f2)
      setSocialLoaded(true)
    } catch { /* silent */ }
  }, [authorizedFetch])

  useEffect(() => { void loadSocial() }, [loadSocial])

  const handleAvatarChange = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const original = e.target?.result as string
      const img = new Image()
      img.onload = () => {
        const target = 256
        const scale = Math.min(target / img.width, target / img.height, 1)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setAvatarPreview(original)
          setAvatarDirty(true)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        const compressed = canvas.toDataURL('image/jpeg', 0.85)
        setAvatarPreview(compressed)
        setAvatarDirty(true)
      }
      img.onerror = () => {
        setAvatarPreview(original)
        setAvatarDirty(true)
      }
      img.src = original
    }
    reader.readAsDataURL(file)
  }

  const handleSaveAvatar = async () => {
    if (!avatarPreview || avatarPreview === user?.avatarUrl) return
    try {
      setSaving(true)
      setError(null)
      const result = await updateAvatar(authorizedFetch, avatarPreview)
      const persistedUrl = result.avatarUrl ?? avatarPreview
      applyUserPatch({ avatarUrl: persistedUrl })
      setAvatarPreview(persistedUrl)
      setAvatarDirty(false)
      try { await refreshUser() } catch { /* server pode estar atrasado, patch local ja resolveu */ }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar avatar')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePrivacy = async () => {
    const next = !isPrivate
    setIsPrivate(next)
    setSavingPrivacy(true)
    setError(null)
    setPrivacyNotice(null)
    try {
      const updated = await updatePrivacy(authorizedFetch, { isPrivate: next })
      applyUserPatch({ isPrivate: updated.isPrivate, showFollowLists: updated.showFollowLists })
      if (updated.downgradedPosts > 0) {
        setPrivacyNotice(
          `${updated.downgradedPosts} post${updated.downgradedPosts > 1 ? 's' : ''} público${updated.downgradedPosts > 1 ? 's' : ''} ${updated.downgradedPosts > 1 ? 'foram alterados' : 'foi alterado'} para "Amigos". Você pode ajustar individualmente no Feed.`,
        )
        setTimeout(() => setPrivacyNotice(null), 8000)
      }
    } catch (err) {
      setIsPrivate(!next)
      setError(err instanceof Error ? err.message : 'Erro ao salvar privacidade')
    } finally {
      setSavingPrivacy(false)
    }
  }

  const handleToggleShowFollowLists = async () => {
    const next = !showFollowLists
    setShowFollowLists(next)
    setSavingPrivacy(true)
    setError(null)
    try {
      const updated = await updatePrivacy(authorizedFetch, { showFollowLists: next })
      applyUserPatch({ isPrivate: updated.isPrivate, showFollowLists: updated.showFollowLists })
    } catch (err) {
      setShowFollowLists(!next)
      setError(err instanceof Error ? err.message : 'Erro ao salvar privacidade')
    } finally {
      setSavingPrivacy(false)
    }
  }

  const handleRemoveAvatar = async () => {
    try {
      setSaving(true)
      await updateAvatar(authorizedFetch, null)
      applyUserPatch({ avatarUrl: null })
      setAvatarPreview(null)
      setAvatarDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover avatar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-25 blur-3xl animate-[tech-spin_22s_linear_infinite]"
          style={{ background: 'var(--tech-gradient-conic)' }}
        />
        <h1 className="relative text-2xl font-black text-[var(--text)]">Perfil</h1>
        <p className="relative mt-1 text-sm text-[var(--muted)]">Gerencie suas informações pessoais.</p>
      </motion.div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">Avatar atualizado com sucesso!</p>}

      {/* Social stats */}
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setOpenPanel('followers')}
            className="rounded-xl border border-[var(--line)] bg-gradient-to-br from-[var(--accent-blue)]/10 to-transparent px-4 py-3 text-left disabled:opacity-60"
            disabled={!socialLoaded}
          >
            <p className="text-2xl font-black text-[var(--text)]">
              {socialLoaded ? <CountUp value={followers.length} /> : '—'}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">seguidores</p>
          </button>
          <button
            type="button"
            onClick={() => setOpenPanel('following')}
            className="rounded-xl border border-[var(--line)] bg-gradient-to-br from-[var(--accent-emerald)]/10 to-transparent px-4 py-3 text-left disabled:opacity-60"
            disabled={!socialLoaded}
          >
            <p className="text-2xl font-black text-[var(--text)]">
              {socialLoaded ? <CountUp value={following.length} /> : '—'}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">seguindo</p>
          </button>
        </div>
      </article>

      {/* Avatar */}
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-4">
        <h2 className="text-base font-extrabold text-[var(--text)]">Foto de perfil</h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => avatarPreview && setViewerOpen(true)}
            disabled={!avatarPreview}
            aria-label="Ver foto em tamanho grande"
            className="relative h-20 w-20 shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:cursor-default"
          >
            <div
              aria-hidden
              className="absolute -inset-[3px] rounded-full animate-[tech-spin_10s_linear_infinite]"
              style={{ background: 'var(--tech-gradient-conic)' }}
            />
            <div className={`relative h-full w-full overflow-hidden rounded-full bg-[var(--surface-hover)] transition-transform ${avatarPreview ? 'group-hover:scale-[1.03] active:scale-95 hover:scale-[1.04] cursor-zoom-in' : ''}`}>
              {avatarPreview
                ? <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                : <span className="flex h-full w-full items-center justify-center text-2xl font-black text-[var(--muted)]">
                    {(user?.name ?? '?')[0]?.toUpperCase()}
                  </span>
              }
            </div>
          </button>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Escolher foto
            </button>
            {avatarPreview && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={saving}
                className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 disabled:opacity-50"
              >
                Remover foto
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
          />
        </div>
        {avatarPreview !== (user?.avatarUrl ?? null) && (
          <button
            type="button"
            onClick={handleSaveAvatar}
            disabled={saving}
            className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar foto'}
          </button>
        )}
      </article>

      {/* Dados */}
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3">
        <h2 className="text-base font-extrabold text-[var(--text)]">Dados da conta</h2>
        <div className="space-y-2 text-sm text-[var(--muted)]">
          <p><span className="font-semibold text-[var(--text)]">Nome:</span> {user?.name ?? '-'}</p>
          <p><span className="font-semibold text-[var(--text)]">Email:</span> {user?.email ?? '-'}</p>
          <p><span className="font-semibold text-[var(--text)]">Tipo:</span> {user?.role ?? '-'}</p>
        </div>
      </article>

      {/* Handle público */}
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-[var(--text)]">Handle público</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              É o seu identificador no feed e nos comentários. 3–30 caracteres.
            </p>
          </div>
          {!handleEditing && (
            <button
              type="button"
              onClick={handleStartEditingHandle}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <Pencil size={12} /> Editar
            </button>
          )}
        </div>

        {!handleEditing ? (
          <p className="font-mono text-base font-semibold text-[var(--text)]">
            @{user?.handle ?? '—'}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--muted)]">@</span>
              <input
                type="text"
                value={handleDraft}
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={30}
                placeholder="pedro_82"
                onChange={(e) => {
                  setHandleDraft(sanitiseHandleInput(e.target.value))
                  setHandleError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); void handleSaveHandle() }
                  if (e.key === 'Escape') { e.preventDefault(); handleCancelEditingHandle() }
                }}
                className={`w-full rounded-xl border bg-transparent pl-7 pr-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/60 ${
                  handleFormatError || handleError ? 'border-red-500/60' : 'border-[var(--line)]'
                }`}
              />
            </div>

            <p className={`text-[11px] ${handleFormatError || handleError ? 'text-red-400' : 'text-[var(--muted)]'}`}>
              {handleError
                ?? handleFormatError
                ?? '3–30 caracteres · letras minúsculas, números, ".", "_" ou "-".'}
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void handleSaveHandle()}
                disabled={handleSaving || !handleChanged || Boolean(handleFormatError) || !handleDraft.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                <Check size={13} />
                {handleSaving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={handleCancelEditingHandle}
                disabled={handleSaving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] disabled:opacity-50"
              >
                <X size={13} />
                Cancelar
              </button>
            </div>
          </div>
        )}

        {handleSuccess && (
          <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            Handle atualizado para <span className="font-mono font-bold">@{user?.handle}</span>.
          </p>
        )}
      </article>

      {/* Privacidade */}
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-4">
        <h2 className="text-base font-extrabold text-[var(--text)]">Privacidade</h2>

        {privacyNotice ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {privacyNotice}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Conta privada</p>
            <p className="text-xs text-[var(--muted)]">
              {isPrivate ? 'Apenas seguidores veem seus posts.' : 'Qualquer pessoa pode ver seus posts.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleTogglePrivacy()}
            disabled={savingPrivacy}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              isPrivate ? 'bg-[var(--brand)]' : 'bg-[var(--line)]'
            }`}
            aria-pressed={isPrivate}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${isPrivate ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Mostrar seguidores/seguindo</p>
            <p className="text-xs text-[var(--muted)]">
              {showFollowLists ? 'Outros usuários podem ver suas listas.' : 'Suas listas ficam ocultas para outros.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleShowFollowLists()}
            disabled={savingPrivacy}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
              showFollowLists ? 'bg-[var(--brand)]' : 'bg-[var(--line)]'
            }`}
            aria-pressed={showFollowLists}
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${showFollowLists ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </article>

      {/* Perfil público */}
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3">
        <h2 className="text-base font-extrabold text-[var(--text)]">Perfil público</h2>
        <p className="text-sm text-[var(--muted)]">Veja como o seu perfil aparece para outros usuários.</p>
        <button
          type="button"
          onClick={() => navigate(`/u/${user?.id}`)}
          className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
        >
          Ver meu perfil público
        </button>
      </article>

      {/* Suporte */}
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3">
        <h2 className="text-base font-extrabold text-[var(--text)]">Ajuda e suporte</h2>
        <p className="text-sm text-[var(--muted)]">
          Dúvida, bug ou contestar uma decisão? Abra um ticket — respondemos em até 48h.
        </p>
        <button
          type="button"
          onClick={() => navigate('/support')}
          className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          Abrir central de suporte
        </button>
      </article>

      {/* Logout */}
      <article className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
        <button
          onClick={() => void logout()}
          type="button"
          className="rounded-xl border border-red-500/60 px-4 py-2 text-sm font-semibold text-red-400"
        >
          Sair da conta
        </button>
      </article>

      {/* Modal */}
      <AnimatePresence>
        {openPanel && (
          <UserListModal
            title={openPanel === 'followers' ? 'Seguidores' : 'Seguindo'}
            users={openPanel === 'followers' ? followers : following}
            onClose={() => setOpenPanel(null)}
            onNavigate={(id) => navigate(`/u/${id}`)}
          />
        )}
        {viewerOpen && avatarPreview && (
          <ImageViewer
            src={avatarPreview}
            alt={user?.name ?? null}
            onClose={() => setViewerOpen(false)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
